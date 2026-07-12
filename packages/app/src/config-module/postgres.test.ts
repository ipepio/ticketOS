import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Pool } from 'pg';
import { PostgresConfig } from './postgres.js';

const MIGRATIONS = [
  `CREATE TABLE IF NOT EXISTS workspaces (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`,
  `CREATE TABLE IF NOT EXISTS configurable_roles (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE, name TEXT NOT NULL, capabilities JSONB NOT NULL DEFAULT '[]', is_builtin BOOLEAN NOT NULL DEFAULT false, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(workspace_id, name))`,
  `CREATE TABLE IF NOT EXISTS workspace_settings (workspace_id UUID PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE, default_ticket_type TEXT, default_priority TEXT, default_calendar_id UUID, email_domain TEXT, sso_enabled BOOLEAN NOT NULL DEFAULT false, mfa_required BOOLEAN NOT NULL DEFAULT false, retention_policy_id UUID, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`,
];

function createTestPool(): Pool {
  return new Pool({ connectionString: process.env.DATABASE_URL ?? 'postgresql://ticketos:ticketos@localhost:5432/ticketos' });
}

describe('Config Module', () => {
  let pool: Pool; let config: PostgresConfig; let wsId: string;
  beforeEach(async () => {
    pool = createTestPool();
    for (const sql of MIGRATIONS) { await pool.query(sql).catch(() => {}); }
    await pool.query('DELETE FROM workspace_settings'); await pool.query('DELETE FROM configurable_roles');
    await pool.query('DELETE FROM workspaces');
    config = new PostgresConfig(pool);
    const { rows: ws } = await pool.query('INSERT INTO workspaces (id, name) VALUES ($1, $2) RETURNING id', [crypto.randomUUID(), 'Config Test']);
    wsId = ws[0]!.id;
  });
  afterEach(async () => { await pool.end(); });

  it('creates and updates a role', async () => {
    const role = await config.createRole({ workspaceId: wsId, name: 'custom-agent', capabilities: ['tickets:read'] });
    expect(role.name).toBe('custom-agent');
    const updated = await config.updateRole(role.id, { capabilities: ['tickets:read', 'tickets:assign'] });
    expect(updated.capabilities).toHaveLength(2);
  });

  it('gets and updates workspace settings', async () => {
    const settings = await config.getSettings(wsId);
    expect(settings.ssoEnabled).toBe(false);
    const updated = await config.updateSettings(wsId, { ssoEnabled: true, defaultPriority: 'high' });
    expect(updated.ssoEnabled).toBe(true);
    expect(updated.defaultPriority).toBe('high');
  });
});
