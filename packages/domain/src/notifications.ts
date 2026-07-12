// Notifications module — In-app inbox and email notifications
// No framework-specific types may leak into domain interfaces.

import type { WorkspaceId, UserId, Uuid, Timestamp } from '@ticketos/shared';

// ---------------------------------------------------------------------------
// Notification events and preferences
// ---------------------------------------------------------------------------

export type NotificationEvent =
  | 'ticket-assigned'
  | 'ticket-status-changed'
  | 'ticket-commented'
  | 'ticket-mentioned'
  | 'ticket-created'
  | 'sla-at-risk'
  | 'sla-breach'
  | 'approval-requested'
  | 'approval-decided';

export type NotificationChannel = 'in-app' | 'email';

export interface NotificationPreference {
  id: Uuid;
  userId: UserId;
  workspaceId: WorkspaceId;
  event: NotificationEvent;
  channel: NotificationChannel;
  enabled: boolean;
  createdAt: Timestamp;
}

// ---------------------------------------------------------------------------
// In-app Notification
// ---------------------------------------------------------------------------

export type NotificationReadStatus = 'unread' | 'read';

export interface InAppNotification {
  id: Uuid;
  userId: UserId;
  workspaceId: WorkspaceId;
  event: NotificationEvent;
  title: string;
  message: string;
  ticketId: Uuid | null;
  readStatus: NotificationReadStatus;
  createdAt: Timestamp;
  readAt: Timestamp | null;
}

// ---------------------------------------------------------------------------
// Input types
// ---------------------------------------------------------------------------

export interface CreateNotificationInput {
  userId: UserId;
  workspaceId: WorkspaceId;
  event: NotificationEvent;
  title: string;
  message: string;
  ticketId?: Uuid | null;
}

export interface UpdatePreferenceInput {
  event: NotificationEvent;
  channel: NotificationChannel;
  enabled: boolean;
}

// ---------------------------------------------------------------------------
// Notifications Module interface
// ---------------------------------------------------------------------------

export interface NotificationsModule {
  // Preferences
  setPreference(userId: UserId, workspaceId: WorkspaceId, input: UpdatePreferenceInput): Promise<NotificationPreference>;
  getPreferences(userId: UserId, workspaceId: WorkspaceId): Promise<NotificationPreference[]>;
  isChannelEnabled(userId: UserId, workspaceId: WorkspaceId, event: NotificationEvent, channel: NotificationChannel): Promise<boolean>;

  // In-app notifications
  createNotification(input: CreateNotificationInput): Promise<InAppNotification>;
  listNotifications(userId: UserId, workspaceId: WorkspaceId, options?: { readStatus?: NotificationReadStatus; limit?: number }): Promise<InAppNotification[]>;
  markAsRead(notificationId: Uuid, userId: UserId): Promise<InAppNotification>;
  markAllAsRead(userId: UserId, workspaceId: WorkspaceId): Promise<number>;
  getUnreadCount(userId: UserId, workspaceId: WorkspaceId): Promise<number>;
  deleteNotification(notificationId: Uuid, userId: UserId): Promise<void>;
}
