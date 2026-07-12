import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Pool } from 'pg';
import { PostgresNotifications } from './postgres.js';

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
  `CREATE TABLE IF NOT EXISTS notification_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    event TEXT NOT NULL, channel TEXT NOT NULL CHECK (channel IN ('in-app', 'email')),
    enabled BOOLEAN NOT NULL DEFAULT true, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, workspace_id, event, channel)
  )`,
  `CREATE TABLE IF NOT EXISTS in_app_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    event TEXT NOT NULL, title TEXT NOT NULL, message TEXT NOT NULL,
    ticket_id UUID REFERENCES tickets(id) ON DELETE SET NULL,
    read_status TEXT NOT NULL DEFAULT 'unread' CHECK (read_status IN ('unread', 'read')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), read_at TIMESTAMPTZ
  )`,
];

function createTestPool(): Pool {
  return new Pool({
    connectionString: process.env.DATABASE_URL ?? 'postgresql://ticketos:ticketos@localhost:5432/ticketos',
  });
}

describe('Notifications Module', () => {
  let pool: Pool;
  let notifs: PostgresNotifications;
  let workspaceId: string;
  let userId: string;

  beforeEach(async () => {
    pool = createTestPool();
    for (const sql of MIGRATIONS) {
      await pool.query(sql).catch(() => {});
    }

    await pool.query('DELETE FROM in_app_notifications');
    await pool.query('DELETE FROM notification_preferences');
    await pool.query('DELETE FROM tickets');
    await pool.query('DELETE FROM users');
    await pool.query('DELETE FROM workspaces');

    notifs = new PostgresNotifications(pool);

    const { rows: wsRows } = await pool.query(
      'INSERT INTO workspaces (id, name) VALUES ($1, $2) RETURNING id',
      [crypto.randomUUID(), 'Notif Test WS'],
    );
    workspaceId = wsRows[0]!.id;

    const { rows: userRows } = await pool.query(
      'INSERT INTO users (id, email) VALUES ($1, $2) RETURNING id',
      [crypto.randomUUID(), 'notif-test@test.com'],
    );
    userId = userRows[0]!.id;
  });

  afterEach(async () => {
    await pool.end();
  });

  describe('Preferences', () => {
    it('sets and retrieves notification preferences', async () => {
      const pref = await notifs.setPreference(userId, workspaceId, {
        event: 'ticket-assigned',
        channel: 'in-app',
        enabled: true,
      });
      expect(pref.enabled).toBe(true);

      const prefs = await notifs.getPreferences(userId, workspaceId);
      expect(prefs).toHaveLength(1);
      expect(prefs[0]!.event).toBe('ticket-assigned');
    });

    it('updates an existing preference', async () => {
      await notifs.setPreference(userId, workspaceId, {
        event: 'ticket-assigned',
        channel: 'email',
        enabled: true,
      });
      await notifs.setPreference(userId, workspaceId, {
        event: 'ticket-assigned',
        channel: 'email',
        enabled: false,
      });

      const prefs = await notifs.getPreferences(userId, workspaceId);
      expect(prefs).toHaveLength(1);
      expect(prefs[0]!.enabled).toBe(false);
    });

    it('defaults to enabled when no preference set', async () => {
      const enabled = await notifs.isChannelEnabled(userId, workspaceId, 'ticket-assigned', 'in-app');
      expect(enabled).toBe(true);
    });

    it('returns disabled when preference is disabled', async () => {
      await notifs.setPreference(userId, workspaceId, {
        event: 'ticket-assigned',
        channel: 'email',
        enabled: false,
      });
      const enabled = await notifs.isChannelEnabled(userId, workspaceId, 'ticket-assigned', 'email');
      expect(enabled).toBe(false);
    });
  });

  describe('In-app notifications', () => {
    it('creates a notification', async () => {
      const notif = await notifs.createNotification({
        userId,
        workspaceId,
        event: 'ticket-assigned',
        title: 'Ticket assigned',
        message: 'You have been assigned ticket #123',
      });
      expect(notif.id).toBeDefined();
      expect(notif.readStatus).toBe('unread');
    });

    it('lists notifications', async () => {
      await notifs.createNotification({
        userId,
        workspaceId,
        event: 'ticket-assigned',
        title: 'Notif 1',
        message: 'Message 1',
      });
      await notifs.createNotification({
        userId,
        workspaceId,
        event: 'ticket-commented',
        title: 'Notif 2',
        message: 'Message 2',
      });

      const list = await notifs.listNotifications(userId, workspaceId);
      expect(list).toHaveLength(2);
    });

    it('marks a notification as read', async () => {
      const notif = await notifs.createNotification({
        userId,
        workspaceId,
        event: 'ticket-assigned',
        title: 'Read me',
        message: 'Message',
      });

      const read = await notifs.markAsRead(notif.id, userId);
      expect(read.readStatus).toBe('read');
      expect(read.readAt).not.toBeNull();
    });

    it('marks all as read', async () => {
      await notifs.createNotification({
        userId,
        workspaceId,
        event: 'ticket-assigned',
        title: 'Notif 1',
        message: 'Message 1',
      });
      await notifs.createNotification({
        userId,
        workspaceId,
        event: 'ticket-commented',
        title: 'Notif 2',
        message: 'Message 2',
      });

      const count = await notifs.markAllAsRead(userId, workspaceId);
      expect(count).toBe(2);

      const unread = await notifs.getUnreadCount(userId, workspaceId);
      expect(unread).toBe(0);
    });

    it('gets unread count', async () => {
      await notifs.createNotification({
        userId,
        workspaceId,
        event: 'ticket-assigned',
        title: 'Unread',
        message: 'Message',
      });

      const count = await notifs.getUnreadCount(userId, workspaceId);
      expect(count).toBe(1);
    });

    it('deletes a notification', async () => {
      const notif = await notifs.createNotification({
        userId,
        workspaceId,
        event: 'ticket-assigned',
        title: 'Delete me',
        message: 'Message',
      });
      await notifs.deleteNotification(notif.id, userId);
      const list = await notifs.listNotifications(userId, workspaceId);
      expect(list).toHaveLength(0);
    });
  });
});
