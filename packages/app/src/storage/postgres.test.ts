import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { Pool } from 'pg';
import { PostgresAttachment } from './postgres.js';
import { FakeStorageAdapter } from './local.js';
import type { CreateAttachmentInput } from '@ticketos/domain';

const MIGRATIONS = [
  `CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL UNIQUE,
    verified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS workspaces (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS tickets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'backlog' CHECK (status IN ('backlog', 'todo', 'in_progress', 'done', 'cancelled')),
    priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
    ticket_type_id UUID,
    created_by UUID NOT NULL REFERENCES users(id) ON DELETE SET NULL,
    assigned_to UUID REFERENCES users(id) ON DELETE SET NULL,
    visibility TEXT NOT NULL DEFAULT 'public' CHECK (visibility IN ('public', 'internal', 'private')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_tickets_workspace ON tickets (workspace_id)`,
  `CREATE TABLE IF NOT EXISTS attachments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    filename TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    size BIGINT NOT NULL CHECK (size >= 0),
    storage_key TEXT,
    status TEXT NOT NULL DEFAULT 'requested' CHECK (status IN ('requested', 'quarantine', 'scanning', 'available', 'rejected', 'deleted')),
    scan_result TEXT,
    uploader_id UUID NOT NULL REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_attachments_ticket ON attachments (ticket_id)`,
  `CREATE INDEX IF NOT EXISTS idx_attachments_status ON attachments (status)`,
  `CREATE INDEX IF NOT EXISTS idx_attachments_uploader ON attachments (uploader_id)`,
];

let pool: Pool | null = null;

describe('Attachment lifecycle', () => {
  let attachment: PostgresAttachment;
  let storage: FakeStorageAdapter;
  let userId: string;
  let ticketId: string;

  beforeAll(async () => {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL ?? 'postgresql://ticketos:ticketos@localhost:5432/ticketos',
    });
    for (const sql of MIGRATIONS) {
      await pool.query(sql);
    }
  });

  beforeEach(async () => {
    await pool!.query('BEGIN');
    await pool!.query('DELETE FROM attachments');
    await pool!.query('DELETE FROM timeline_entries');
    await pool!.query('DELETE FROM ticket_followers');
    await pool!.query('DELETE FROM ticket_tags');
    await pool!.query('DELETE FROM tickets');
    await pool!.query('DELETE FROM workspace_memberships');
    await pool!.query('DELETE FROM queues');
    await pool!.query('DELETE FROM queue_members');
    await pool!.query('DELETE FROM organizations');
    await pool!.query('DELETE FROM magic_links');
    await pool!.query('DELETE FROM users');
    await pool!.query('DELETE FROM workspaces');

    const { rows: userRows } = await pool!.query(
      'INSERT INTO users (id, email) VALUES ($1, $2) RETURNING id',
      [crypto.randomUUID(), 'attachment-test@example.com'],
    );
    userId = userRows[0]!.id;

    const { rows: wsRows } = await pool!.query(
      'INSERT INTO workspaces (id, name) VALUES ($1, $2) RETURNING id',
      [crypto.randomUUID(), 'Attachment Test'],
    );

    const { rows: ticketRows } = await pool!.query(
      'INSERT INTO tickets (id, workspace_id, title, created_by) VALUES ($1, $2, $3, $4) RETURNING id',
      [crypto.randomUUID(), wsRows[0]!.id, 'Attachment test ticket', userId],
    );
    ticketId = ticketRows[0]!.id;

    attachment = new PostgresAttachment(pool!);
    storage = new FakeStorageAdapter();
  });

  afterEach(async () => {
    await pool!.query('ROLLBACK');
  });

  afterAll(async () => {
    await pool!.end();
  });

  describe('createAttachment', () => {
    it('creates an attachment in requested status', async () => {
      const input: CreateAttachmentInput = {
        ticketId,
        filename: 'test.pdf',
        mimeType: 'application/pdf',
        size: 1024,
        uploaderId: userId,
      };
      const a = await attachment.createAttachment(input);
      expect(a.filename).toBe('test.pdf');
      expect(a.status).toBe('requested');
      expect(a.mimeType).toBe('application/pdf');
      expect(a.size).toBe(1024);
    });
  });

  describe('getAttachment', () => {
    it('returns an attachment by id', async () => {
      const a = await attachment.createAttachment({
        ticketId,
        filename: 'get-me.pdf',
        mimeType: 'application/pdf',
        size: 512,
        uploaderId: userId,
      });
      const found = await attachment.getAttachment(a.id);
      expect(found).not.toBeNull();
      expect(found!.filename).toBe('get-me.pdf');
    });

    it('returns null for non-existent attachment', async () => {
      const found = await attachment.getAttachment(crypto.randomUUID());
      expect(found).toBeNull();
    });
  });

  describe('listAttachments', () => {
    it('lists all attachments for a ticket', async () => {
      await attachment.createAttachment({ ticketId, filename: 'a1.pdf', mimeType: 'application/pdf', size: 100, uploaderId: userId });
      await attachment.createAttachment({ ticketId, filename: 'a2.png', mimeType: 'image/png', size: 200, uploaderId: userId });
      const list = await attachment.listAttachments(ticketId);
      expect(list).toHaveLength(2);
    });
  });

  describe('markAvailable', () => {
    it('marks an attachment as available', async () => {
      const a = await attachment.createAttachment({ ticketId, filename: 'scan.pdf', mimeType: 'application/pdf', size: 300, uploaderId: userId });
      await attachment.markAvailable(a.id);
      const updated = await attachment.getAttachment(a.id);
      expect(updated!.status).toBe('available');
    });
  });

  describe('markRejected', () => {
    it('marks an attachment as rejected with reason', async () => {
      const a = await attachment.createAttachment({ ticketId, filename: 'malware.exe', mimeType: 'application/x-dosexec', size: 500, uploaderId: userId });
      await attachment.markRejected(a.id, 'Malware detected');
      const updated = await attachment.getAttachment(a.id);
      expect(updated!.status).toBe('rejected');
      expect(updated!.scanResult).toBe('Malware detected');
    });
  });

  describe('deleteAttachment', () => {
    it('marks an attachment as deleted', async () => {
      const a = await attachment.createAttachment({ ticketId, filename: 'del.pdf', mimeType: 'application/pdf', size: 100, uploaderId: userId });
      await attachment.deleteAttachment(a.id);
      const updated = await attachment.getAttachment(a.id);
      expect(updated!.status).toBe('deleted');
    });
  });

  describe('StorageAdapter', () => {
    it('stores and retrieves data with FakeStorageAdapter', async () => {
      const data = Buffer.from('test content');
      const key = await storage.store({ key: 'test-file.bin', data, mimeType: 'application/octet-stream' });
      expect(key).toBe('test-file.bin');

      const retrieved = await storage.retrieve('test-file.bin');
      expect(retrieved).toEqual(data);
    });

    it('deletes stored data', async () => {
      await storage.store({ key: 'del.bin', data: Buffer.from('delete me'), mimeType: 'text/plain' });
      await storage.delete('del.bin');
      const exists = await storage.exists('del.bin');
      expect(exists).toBe(false);
    });

    it('checks if data exists', async () => {
      await storage.store({ key: 'exists.bin', data: Buffer.from('exists'), mimeType: 'text/plain' });
      const exists = await storage.exists('exists.bin');
      expect(exists).toBe(true);
    });
  });
});
