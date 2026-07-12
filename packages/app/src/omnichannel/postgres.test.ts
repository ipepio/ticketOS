import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Pool } from 'pg';
import { PostgresOmnichannel } from './postgres.js';

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
  `CREATE TABLE IF NOT EXISTS tickets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    title TEXT NOT NULL, description TEXT,
    status TEXT NOT NULL DEFAULT 'backlog' CHECK (status IN ('backlog', 'todo', 'in_progress', 'done', 'cancelled')),
    priority TEXT NOT NULL DEFAULT 'normal',
    created_by UUID NOT NULL REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS channels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('email', 'chat', 'whatsapp', 'sms', 'social')),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'disabled')),
    config JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS channel_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    channel_id UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    ticket_id UUID REFERENCES tickets(id) ON DELETE SET NULL,
    direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
    content TEXT NOT NULL, external_id TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'delivered', 'failed', 'read')),
    metadata JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
];

function createTestPool(): Pool {
  return new Pool({
    connectionString: process.env.DATABASE_URL ?? 'postgresql://ticketos:ticketos@localhost:5432/ticketos',
  });
}

describe('Omnichannel Module', () => {
  let pool: Pool;
  let oc: PostgresOmnichannel;
  let workspaceId: string;

  beforeEach(async () => {
    pool = createTestPool();
    for (const sql of MIGRATIONS) {
      await pool.query(sql).catch(() => {});
    }

    await pool.query('DELETE FROM channel_messages');
    await pool.query('DELETE FROM channels');
    await pool.query('DELETE FROM tickets');
    await pool.query('DELETE FROM users');
    await pool.query('DELETE FROM workspaces');

    oc = new PostgresOmnichannel(pool);

    const { rows: wsRows } = await pool.query(
      'INSERT INTO workspaces (id, name) VALUES ($1, $2) RETURNING id',
      [crypto.randomUUID(), 'Omnichannel Test WS'],
    );
    workspaceId = wsRows[0]!.id;
  });

  afterEach(async () => {
    await pool.end();
  });

  describe('Channels', () => {
    it('creates a chat channel', async () => {
      const channel = await oc.createChannel({
        workspaceId,
        name: 'Live Chat',
        type: 'chat',
      });
      expect(channel.id).toBeDefined();
      expect(channel.name).toBe('Live Chat');
      expect(channel.type).toBe('chat');
      expect(channel.status).toBe('active');
    });

    it('lists channels by type', async () => {
      await oc.createChannel({ workspaceId, name: 'Chat', type: 'chat' });
      await oc.createChannel({ workspaceId, name: 'WhatsApp', type: 'whatsapp' });

      const chatChannels = await oc.listChannels(workspaceId, { type: 'chat' });
      expect(chatChannels).toHaveLength(1);
      expect(chatChannels[0]!.type).toBe('chat');
    });

    it('updates a channel', async () => {
      const channel = await oc.createChannel({ workspaceId, name: 'Original', type: 'chat' });
      const updated = await oc.updateChannel(channel.id, { name: 'Updated' });
      expect(updated.name).toBe('Updated');
    });

    it('deletes a channel', async () => {
      const channel = await oc.createChannel({ workspaceId, name: 'Delete', type: 'chat' });
      await oc.deleteChannel(channel.id);
      const found = await oc.getChannel(channel.id);
      expect(found).toBeNull();
    });
  });

  describe('Messages', () => {
    it('receives an inbound message', async () => {
      const channel = await oc.createChannel({ workspaceId, name: 'Inbound', type: 'chat' });
      const msg = await oc.receiveMessage(channel.id, 'ext-123', 'Hello!');
      expect(msg.direction).toBe('inbound');
      expect(msg.content).toBe('Hello!');
      expect(msg.externalId).toBe('ext-123');
      expect(msg.status).toBe('delivered');
    });

    it('is idempotent on external_id', async () => {
      const channel = await oc.createChannel({ workspaceId, name: 'Idempotent', type: 'chat' });
      const msg1 = await oc.receiveMessage(channel.id, 'ext-456', 'First');
      const msg2 = await oc.receiveMessage(channel.id, 'ext-456', 'Second');
      expect(msg1.id).toBe(msg2.id);
      expect(msg2.content).toBe('First'); // original content preserved
    });

    it('sends an outbound message', async () => {
      const channel = await oc.createChannel({ workspaceId, name: 'Outbound', type: 'chat' });
      const msg = await oc.sendMessage({
        channelId: channel.id,
        content: 'Reply from agent',
      });
      expect(msg.direction).toBe('outbound');
      expect(msg.status).toBe('pending');
    });

    it('gets messages for a ticket', async () => {
      const channel = await oc.createChannel({ workspaceId, name: 'Ticket', type: 'chat' });

      // Create a user
      const { rows: userRows } = await pool.query(
        'INSERT INTO users (id, email) VALUES ($1, $2) RETURNING id',
        [crypto.randomUUID(), 'oc-user@test.com'],
      );

      // Create a ticket
      const { rows: ticketRows } = await pool.query(
        'INSERT INTO tickets (workspace_id, title, created_by) VALUES ($1, $2, $3) RETURNING id',
        [workspaceId, 'Chat Ticket', userRows[0]!.id],
      );
      const ticketId = ticketRows[0]!.id;

      await oc.sendMessage({
        channelId: channel.id,
        ticketId,
        content: 'Message 1',
      });
      await oc.sendMessage({
        channelId: channel.id,
        ticketId,
        content: 'Message 2',
      });

      const messages = await oc.getMessagesForTicket(ticketId);
      expect(messages).toHaveLength(2);
    });
  });
});
