import type { Pool } from 'pg';
import type {
  NotificationsModule,
  NotificationPreference,
  InAppNotification,
  CreateNotificationInput,
  UpdatePreferenceInput,
  NotificationEvent,
  NotificationChannel,
  NotificationReadStatus,
} from '@ticketos/domain';
import type { UserId, WorkspaceId, Uuid } from '@ticketos/shared';

interface PrefRow {
  id: string;
  user_id: string;
  workspace_id: string;
  event: string;
  channel: string;
  enabled: boolean;
  created_at: string;
}

interface NotifRow {
  id: string;
  user_id: string;
  workspace_id: string;
  event: string;
  title: string;
  message: string;
  ticket_id: string | null;
  read_status: string;
  created_at: string;
  read_at: string | null;
}

function mapPref(r: PrefRow): NotificationPreference {
  return {
    id: r.id,
    userId: r.user_id,
    workspaceId: r.workspace_id,
    event: r.event as NotificationEvent,
    channel: r.channel as NotificationChannel,
    enabled: r.enabled,
    createdAt: r.created_at,
  };
}

function mapNotif(r: NotifRow): InAppNotification {
  return {
    id: r.id,
    userId: r.user_id,
    workspaceId: r.workspace_id,
    event: r.event as NotificationEvent,
    title: r.title,
    message: r.message,
    ticketId: r.ticket_id,
    readStatus: r.read_status as NotificationReadStatus,
    createdAt: r.created_at,
    readAt: r.read_at,
  };
}

export class PostgresNotifications implements NotificationsModule {
  constructor(private pool: Pool) {}

  // ---------------------------------------------------------------------------
  // Preferences
  // ---------------------------------------------------------------------------

  async setPreference(
    userId: UserId,
    workspaceId: WorkspaceId,
    input: UpdatePreferenceInput,
  ): Promise<NotificationPreference> {
    const { rows } = await this.pool.query<PrefRow>(
      `INSERT INTO notification_preferences (user_id, workspace_id, event, channel, enabled)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id, workspace_id, event, channel)
       DO UPDATE SET enabled = $5
       RETURNING *`,
      [userId, workspaceId, input.event, input.channel, input.enabled],
    );
    return mapPref(rows[0]!);
  }

  async getPreferences(userId: UserId, workspaceId: WorkspaceId): Promise<NotificationPreference[]> {
    const { rows } = await this.pool.query<PrefRow>(
      'SELECT * FROM notification_preferences WHERE user_id = $1 AND workspace_id = $2 ORDER BY event, channel',
      [userId, workspaceId],
    );
    return rows.map(mapPref);
  }

  async isChannelEnabled(
    userId: UserId,
    workspaceId: WorkspaceId,
    event: NotificationEvent,
    channel: NotificationChannel,
  ): Promise<boolean> {
    const { rows } = await this.pool.query<PrefRow>(
      'SELECT * FROM notification_preferences WHERE user_id = $1 AND workspace_id = $2 AND event = $3 AND channel = $4',
      [userId, workspaceId, event, channel],
    );
    // Default: enabled if no preference set
    if (rows.length === 0) return true;
    return rows[0]!.enabled;
  }

  // ---------------------------------------------------------------------------
  // In-app notifications
  // ---------------------------------------------------------------------------

  async createNotification(input: CreateNotificationInput): Promise<InAppNotification> {
    const { rows } = await this.pool.query<NotifRow>(
      `INSERT INTO in_app_notifications (user_id, workspace_id, event, title, message, ticket_id)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [
        input.userId,
        input.workspaceId,
        input.event,
        input.title,
        input.message,
        input.ticketId ?? null,
      ],
    );
    return mapNotif(rows[0]!);
  }

  async listNotifications(
    userId: UserId,
    workspaceId: WorkspaceId,
    options?: { readStatus?: NotificationReadStatus; limit?: number },
  ): Promise<InAppNotification[]> {
    let sql = 'SELECT * FROM in_app_notifications WHERE user_id = $1 AND workspace_id = $2';
    const values: unknown[] = [userId, workspaceId];
    let idx = 3;

    if (options?.readStatus) { sql += ` AND read_status = $${idx++}`; values.push(options.readStatus); }

    sql += ' ORDER BY created_at DESC';
    if (options?.limit) { sql += ` LIMIT $${idx++}`; values.push(options.limit); }

    const { rows } = await this.pool.query<NotifRow>(sql, values);
    return rows.map(mapNotif);
  }

  async markAsRead(notificationId: Uuid, userId: UserId): Promise<InAppNotification> {
    const { rows } = await this.pool.query<NotifRow>(
      `UPDATE in_app_notifications SET read_status = 'read', read_at = NOW()
       WHERE id = $1 AND user_id = $2 RETURNING *`,
      [notificationId, userId],
    );
    if (!rows[0]) throw new Error(`Notification not found: ${notificationId}`);
    return mapNotif(rows[0]);
  }

  async markAllAsRead(userId: UserId, workspaceId: WorkspaceId): Promise<number> {
    const { rowCount } = await this.pool.query(
      `UPDATE in_app_notifications SET read_status = 'read', read_at = NOW()
       WHERE user_id = $1 AND workspace_id = $2 AND read_status = 'unread'`,
      [userId, workspaceId],
    );
    return rowCount ?? 0;
  }

  async getUnreadCount(userId: UserId, workspaceId: WorkspaceId): Promise<number> {
    const { rows } = await this.pool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM in_app_notifications
       WHERE user_id = $1 AND workspace_id = $2 AND read_status = 'unread'`,
      [userId, workspaceId],
    );
    return parseInt(rows[0]!.count, 10);
  }

  async deleteNotification(notificationId: Uuid, userId: UserId): Promise<void> {
    await this.pool.query(
      'DELETE FROM in_app_notifications WHERE id = $1 AND user_id = $2',
      [notificationId, userId],
    );
  }
}
