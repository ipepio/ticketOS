export type CorrelationId = string;

export type Timestamp = string; // ISO-8601

export type Uuid = string;

export type ResultOk<T> = {
  readonly ok: true;
  readonly value: T;
};

export type ResultErr<E = Error> = {
  readonly ok: false;
  readonly error: E;
};

export type Result<T, E = Error> = ResultOk<T> | ResultErr<E>;

export function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

export function err<T, E = Error>(error: E): Result<T, E> {
  return { ok: false, error };
}

// --- Configuration ---

export interface DatabaseConfig {
  url: string;
  poolMin?: number;
  poolMax?: number;
}

export interface StorageConfig {
  adapter: 'local' | 's3';
  localDir?: string;
  s3Bucket?: string;
  s3Region?: string;
  s3Endpoint?: string;
  s3AccessKeyId?: string;
  s3SecretAccessKey?: string;
  s3ForcePathStyle?: boolean;
}

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  password?: string;
}

export interface ImapConfig {
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  password?: string;
}

export interface OidcConfig {
  issuer: string;
  clientId: string;
  clientSecret: string;
  scopes?: string;
}

export interface ServerConfig {
  host: string;
  port: number;
  corsOrigin: string;
}

export interface AppConfig {
  database: DatabaseConfig;
  storage: StorageConfig;
  smtp: SmtpConfig;
  imap?: ImapConfig;
  oidc?: OidcConfig;
  sessionSecret: string;
  server: ServerConfig;
  correlationIdHeader: string;
  logLevel: string;
  replyTokenSecret: string;
}

// --- Domain types (shared across modules) ---

export type WorkspaceId = string;
export type UserId = string;
export type TicketId = string;
export type QueueId = string;
export type OrganizationId = string;
export type MembershipId = string;
export type AttachmentId = string;
export type TimelineEntryId = string;
export type AuditEventId = string;
export type OutboxEventId = string;
export type JobId = string;

export type Capability =
  | 'tickets:create'
  | 'tickets:read'
  | 'tickets:update'
  | 'tickets:delete'
  | 'tickets:cancel'
  | 'tickets:assign'
  | 'tickets:move'
  | 'tickets:comment'
  | 'tickets:internal-note'
  | 'tickets:redact'
  | 'tickets:attach'
  | 'queues:manage'
  | 'queues:access'
  | 'queues:restrict'
  | 'memberships:manage'
  | 'memberships:invite'
  | 'workspaces:manage'
  | 'workspaces:create'
  | 'organizations:manage'
  | 'config:manage'
  | 'audit:read'
  | 'catalog:manage'
  | 'approvals:manage'
  | 'approvals:decide'
  | 'reports:read'
  | 'retention:manage'
  | 'admin:installation'
  | 'admin:mfa-enforce';

export type Role = 'installation-admin' | 'workspace-admin' | 'agent' | 'requester';

export type StatusCategory = 'new' | 'open' | 'pending' | 'resolved' | 'closed';

export type TicketVisibility = 'private' | 'organization-visible';

export type TicketTypeCategory = 'incident' | 'service-request';

export type Priority = 'critical' | 'high' | 'normal' | 'low';

export type MessageKind = 'inbound' | 'outbound';

export type InternalNoteKind = 'internal-note';

export type SystemEventKind =
  | 'ticket-created'
  | 'status-changed'
  | 'queue-moved'
  | 'assignee-changed'
  | 'priority-changed'
  | 'type-changed'
  | 'tag-added'
  | 'tag-removed'
  | 'ticket-cancelled'
  | 'ticket-redacted'
  | 'follower-added'
  | 'follower-removed'
  | 'sla-breach'
  | 'sla-at-risk'
  | 'automation-triggered'
  | 'approval-created'
  | 'approval-decided'
  | 'retention-hold-applied'
  | 'retention-hold-released';

export type AuditEventKind =
  | 'workspace-created'
  | 'workspace-deleted'
  | 'membership-created'
  | 'membership-updated'
  | 'membership-deleted'
  | 'role-assigned'
  | 'role-removed'
  | 'queue-created'
  | 'queue-updated'
  | 'queue-deleted'
  | 'queue-member-added'
  | 'queue-member-removed'
  | 'organization-created'
  | 'organization-updated'
  | 'organization-deleted'
  | 'organization-member-added'
  | 'organization-member-removed'
  | 'config-updated'
  | 'login'
  | 'logout'
  | 'magic-link-issued'
  | 'magic-link-verified'
  | 'oidc-linked'
  | 'oidc-unlinked'
  | 'attachment-uploaded'
  | 'attachment-deleted'
  | 'attachment-scanned'
  | 'attachment-rejected'
  | 'ticket-created'
  | 'ticket-updated'
  | 'ticket-cancelled'
  | 'ticket-deleted'
  | 'timeline-appended'
  | 'timeline-redacted'
  | 'tag-added'
  | 'tag-removed'
  | 'follower-added'
  | 'follower-removed'
  | 'email-address-created'
  | 'email-address-deleted'
  | 'email-sent'
  | 'email-received'
  | 'quarantine-created'
  | 'quarantine-reviewed';
