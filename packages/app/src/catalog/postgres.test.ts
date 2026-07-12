import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Pool } from 'pg';
import { PostgresCatalog } from './postgres.js';

const MIGRATIONS = [
  `CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL UNIQUE, verified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS workspaces (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS queues (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name TEXT NOT NULL, access_mode TEXT NOT NULL DEFAULT 'open',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS status_categories (
    name TEXT PRIMARY KEY CHECK (name IN ('new', 'open', 'pending', 'resolved', 'closed'))
  )`,
  `INSERT INTO status_categories (name) VALUES ('new'), ('open'), ('pending'), ('resolved'), ('closed') ON CONFLICT DO NOTHING`,
  `CREATE TABLE IF NOT EXISTS statuses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name TEXT NOT NULL, category TEXT NOT NULL REFERENCES status_categories(name),
    is_default BOOLEAN NOT NULL DEFAULT false, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(workspace_id, name)
  )`,
  `CREATE TABLE IF NOT EXISTS ticket_type_categories (
    name TEXT PRIMARY KEY CHECK (name IN ('incident', 'service-request'))
  )`,
  `INSERT INTO ticket_type_categories (name) VALUES ('incident'), ('service-request') ON CONFLICT DO NOTHING`,
  `CREATE TABLE IF NOT EXISTS ticket_types (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name TEXT NOT NULL, category TEXT NOT NULL REFERENCES ticket_type_categories(name),
    is_default BOOLEAN NOT NULL DEFAULT false, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(workspace_id, name)
  )`,
  `CREATE TABLE IF NOT EXISTS catalog_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
    ticket_type_id UUID REFERENCES ticket_types(id) ON DELETE SET NULL,
    form_id UUID, queue_id UUID REFERENCES queues(id) ON DELETE SET NULL,
    priority TEXT NOT NULL DEFAULT 'normal', sla_policy_id UUID,
    icon TEXT, sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    published_at TIMESTAMPTZ
  )`,
];

function createTestPool(): Pool {
  return new Pool({
    connectionString: process.env.DATABASE_URL ?? 'postgresql://ticketos:ticketos@localhost:5432/ticketos',
  });
}

describe('Catalog Module', () => {
  let pool: Pool;
  let catalog: PostgresCatalog;
  let workspaceId: string;

  beforeEach(async () => {
    pool = createTestPool();
    for (const sql of MIGRATIONS) {
      await pool.query(sql).catch(() => {});
    }

    await pool.query('DELETE FROM catalog_items');
    await pool.query('DELETE FROM users');
    await pool.query('DELETE FROM workspaces');

    catalog = new PostgresCatalog(pool);

    const { rows: wsRows } = await pool.query(
      'INSERT INTO workspaces (id, name) VALUES ($1, $2) RETURNING id',
      [crypto.randomUUID(), 'Catalog Test WS'],
    );
    workspaceId = wsRows[0]!.id;
  });

  afterEach(async () => {
    await pool.end();
  });

  describe('Catalog Items', () => {
    it('creates a catalog item', async () => {
      const item = await catalog.createItem({
        workspaceId,
        name: 'Request Laptop',
        description: 'Request a new laptop',
        priority: 'normal',
      });

      expect(item.id).toBeDefined();
      expect(item.name).toBe('Request Laptop');
      expect(item.status).toBe('draft');
    });

    it('publishes a catalog item', async () => {
      const item = await catalog.createItem({
        workspaceId,
        name: 'Publish Me',
        description: 'Item',
      });

      const published = await catalog.publishItem(item.id);
      expect(published.status).toBe('published');
      expect(published.publishedAt).not.toBeNull();
    });

    it('lists published items', async () => {
      await catalog.createItem({
        workspaceId,
        name: 'Draft Item',
        description: 'Draft',
      });
      const a2 = await catalog.createItem({
        workspaceId,
        name: 'Published Item',
        description: 'Published',
      });
      await catalog.publishItem(a2.id);

      const published = await catalog.listItems(workspaceId, { status: 'published' });
      expect(published).toHaveLength(1);
      expect(published[0]!.name).toBe('Published Item');
    });

    it('updates a catalog item', async () => {
      const item = await catalog.createItem({
        workspaceId,
        name: 'Original',
        description: 'Desc',
      });

      const updated = await catalog.updateItem(item.id, {
        name: 'Updated',
        priority: 'high',
      });
      expect(updated.name).toBe('Updated');
      expect(updated.priority).toBe('high');
    });

    it('archives a catalog item', async () => {
      const item = await catalog.createItem({
        workspaceId,
        name: 'Archive Me',
        description: 'Item',
      });
      await catalog.publishItem(item.id);
      const archived = await catalog.archiveItem(item.id);
      expect(archived.status).toBe('archived');
    });

    it('deletes a catalog item', async () => {
      const item = await catalog.createItem({
        workspaceId,
        name: 'Delete Me',
        description: 'Item',
      });
      await catalog.deleteItem(item.id);
      const found = await catalog.getItem(item.id);
      expect(found).toBeNull();
    });
  });
});
