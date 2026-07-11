// Domain modules own their interfaces here.
// No framework-specific types may leak into domain interfaces.

import type {
  WorkspaceId,
  UserId,
  Capability,
  Role,
  MembershipId,
  AuditEventKind,
  QueueId,
} from '@ticketos/shared';

// ---------------------------------------------------------------------------
// Identity module seam
// ---------------------------------------------------------------------------

export interface AuthenticateResult {
  userId: UserId;
  workspaceId?: WorkspaceId;
}

export interface CreateMembershipInput {
  userId: UserId;
  workspaceId: WorkspaceId;
  role: Role;
}

export interface WorkspaceMembership {
  id: MembershipId;
  userId: UserId;
  workspaceId: WorkspaceId;
  role: Role;
  capabilities: Capability[];
}

export interface MagicLinkResult {
  /** The magic link token (caller sends via email) */
  token: string;
}

export interface AddQueueMemberInput {
  workspaceId: WorkspaceId;
  queueId: QueueId;
  userId: UserId;
}

export interface IdentityModule {
  /**
   * Authenticate via magic-link token or OIDC.
   * Returns user identity and optionally an active workspace context.
   */
  authenticate(token: string): Promise<AuthenticateResult | null>;

  /**
   * Request a magic link for an email address. Creates an unverified user
   * if none exists. Returns the generated token (caller sends via email).
   */
  requestMagicLink(
    email: string,
    workspaceId: WorkspaceId,
  ): Promise<MagicLinkResult>;

  /**
   * Verify a magic-link token. Returns authenticated user or null if
   * the token is expired, already used, or invalid.
   */
  verifyMagicLink(token: string): Promise<AuthenticateResult | null>;

  /**
   * Check if a user has a specific capability in a workspace.
   */
  hasCapability(
    userId: UserId,
    workspaceId: WorkspaceId,
    capability: Capability,
  ): Promise<boolean>;

  /**
   * Create a workspace membership for a user.
   * Caller must log an audit event after this succeeds.
   */
  createMembership(
    input: CreateMembershipInput,
  ): Promise<WorkspaceMembership>;

  /**
   * Get memberships for a user across all workspaces.
   */
  getUserMemberships(userId: UserId): Promise<WorkspaceMembership[]>;

  /**
   * Get all capabilities for a user in a workspace.
   */
  getCapabilities(userId: UserId, workspaceId: WorkspaceId): Promise<Capability[]>;

  /**
   * Link an OIDC account to a user.
   */
  linkOidcAccount(
    userId: UserId,
    issuer: string,
    subject: string,
    email?: string,
  ): Promise<void>;

  /**
   * Authenticate via OIDC provider and subject.
   * Creates or links user account as needed.
   */
  authenticateOidc(
    issuer: string,
    subject: string,
  ): Promise<AuthenticateResult | null>;
}

// ---------------------------------------------------------------------------
// Workspace module seam
// ---------------------------------------------------------------------------

export interface Workspace {
  id: WorkspaceId;
  name: string;
  createdAt: string;
}

export interface Organization {
  id: string;
  workspaceId: WorkspaceId;
  name: string;
}

export interface Queue {
  id: QueueId;
  workspaceId: WorkspaceId;
  name: string;
  accessMode: 'open' | 'restricted';
  createdAt: string;
}

export type QueueAccessMode = 'open' | 'restricted';

export interface CreateWorkspaceInput {
  name: string;
}

export interface CreateOrganizationInput {
  workspaceId: WorkspaceId;
  name: string;
}

export interface CreateQueueInput {
  workspaceId: WorkspaceId;
  name: string;
  accessMode?: 'open' | 'restricted';
}

export interface AddQueueMemberInput {
  workspaceId: WorkspaceId;
  queueId: QueueId;
  userId: UserId;
}

export interface WorkspaceModule {
  createWorkspace(input: CreateWorkspaceInput): Promise<Workspace>;
  getWorkspace(id: WorkspaceId): Promise<Workspace | null>;

  createOrganization(input: CreateOrganizationInput): Promise<Organization>;
  getOrganizations(workspaceId: WorkspaceId): Promise<Organization[]>;
  getOrganization(id: string): Promise<Organization | null>;

  createQueue(input: CreateQueueInput): Promise<Queue>;
  getQueue(id: QueueId): Promise<Queue | null>;
  getQueues(workspaceId: WorkspaceId): Promise<Queue[]>;

  addQueueMember(input: AddQueueMemberInput): Promise<void>;
  removeQueueMember(workspaceId: WorkspaceId, queueId: QueueId, userId: UserId): Promise<void>;
  getQueueMembers(queueId: QueueId): Promise<UserId[]>;

  /**
   * Check if a user is a member of a queue (for restricted queues).
   */
  isQueueMember(queueId: QueueId, userId: UserId): Promise<boolean>;
}

// ---------------------------------------------------------------------------
// Outbox / Job interface (domain-level, not framework-specific)
// ---------------------------------------------------------------------------

export interface OutboxEvent {
  id: string;
  aggregateId: string;
  eventType: string;
  data: unknown;
  createdAt: string;
  deliveredAt: string | null;
  retryCount: number;
}

export interface DomainEvent {
  aggregateId: string;
  eventType: string;
  data: Record<string, unknown>;
}

export interface OutboxModule {
  /**
   * Persist a domain event to the outbox within an existing transaction.
   * Must be called inside a transaction so it is atomic with state changes.
   */
  enqueue(event: DomainEvent): Promise<void>;

  /**
   * Fetch claims for the worker to process (P0-01: basic claim primitive).
   */
  fetchAvailable(limit?: number): Promise<OutboxEvent[]>;

  /**
   * Mark an event as delivered (worker acknowledges).
   */
  markDelivered(eventId: string): Promise<void>;

  /**
   * Mark an event as failed (retry logic handled by worker).
   */
  markFailed(eventId: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// Audit log seam
// ---------------------------------------------------------------------------

export interface AuditEvent {
  id: string;
  kind: AuditEventKind;
  actorUserId: UserId | null;
  workspaceId: WorkspaceId | null;
  details: Record<string, unknown>;
  createdAt: string;
}

export interface AuditModule {
  /**
   * Append an audit event. Must be called within a transaction when
   * audit evidence is required alongside a state change.
   */
  append(event: Omit<AuditEvent, 'id' | 'createdAt'>): Promise<void>;

  /**
   * Query audit events for a workspace (admin only).
   */
  query(workspaceId: WorkspaceId, limit?: number): Promise<AuditEvent[]>;
}

// ---------------------------------------------------------------------------
// Placeholder interfaces for future P0 modules
// (Workflow, Storage, Email)
// ---------------------------------------------------------------------------

// These are defined in their respective module test files and implementation.

// ---------------------------------------------------------------------------
// Ticket module seam (P0-04)
// ---------------------------------------------------------------------------

export type TicketStatus = 'backlog' | 'todo' | 'in_progress' | 'done' | 'cancelled';
export type TicketPriority = 'low' | 'normal' | 'high' | 'urgent';
export type TicketVisibility = 'public' | 'internal' | 'private';

export interface Ticket {
  id: string;
  workspaceId: WorkspaceId;
  title: string;
  description: string | null;
  status: TicketStatus;
  priority: TicketPriority;
  ticketTypeId: string | null;
  createdBy: UserId;
  assignedTo: UserId | null;
  visibility: TicketVisibility;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTicketInput {
  workspaceId: WorkspaceId;
  title: string;
  description?: string | null;
  priority?: TicketPriority;
  ticketTypeId?: string | null;
  createdBy: UserId;
  assignedTo?: UserId | null;
  visibility?: TicketVisibility;
}

export interface UpdateTicketInput {
  id: string;
  title?: string;
  description?: string | null;
  status?: TicketStatus;
  priority?: TicketPriority;
  ticketTypeId?: string | null;
  assignedTo?: UserId | null;
  visibility?: TicketVisibility;
}

export interface TicketTag {
  id: string;
  ticketId: string;
  name: string;
}

export interface TicketFollower {
  id: string;
  ticketId: string;
  userId: UserId;
}

export type TimelineEntryKind = 'message' | 'internal_note' | 'system_event' | 'status_change' | 'priority_change' | 'assignment_change';

export interface TimelineEntry {
  id: string;
  ticketId: string;
  kind: TimelineEntryKind;
  content: string;
  authorId: UserId | null;
  visibility: TicketVisibility;
  createdAt: string;
}

export interface TicketModule {
  createTicket(input: CreateTicketInput): Promise<Ticket>;
  getTicket(id: string): Promise<Ticket | null>;
  updateTicket(input: UpdateTicketInput): Promise<Ticket>;
  deleteTicket(id: string): Promise<void>;
  listTickets(workspaceId: WorkspaceId, filters?: {
    status?: TicketStatus;
    priority?: TicketPriority;
    assignedTo?: UserId | null;
    createdBy?: UserId;
    tags?: string[];
  }): Promise<Ticket[]>;

  addTag(ticketId: string, name: string): Promise<TicketTag>;
  removeTag(ticketId: string, tagId: string): Promise<void>;
  getTags(ticketId: string): Promise<TicketTag[]>;

  addFollower(ticketId: string, userId: UserId): Promise<TicketFollower>;
  removeFollower(ticketId: string, userId: UserId): Promise<void>;
  getFollowers(ticketId: string): Promise<TicketFollower[]>;

  appendTimelineEntry(entry: Omit<TimelineEntry, 'id' | 'createdAt'>): Promise<TimelineEntry>;
  getTimeline(ticketId: string, options?: {
    kind?: TimelineEntryKind;
    visibility?: TicketVisibility;
    limit?: number;
  }): Promise<TimelineEntry[]>;

  /**
   * Redact a Timeline entry: replaces content with a reason,
   * creates an auditable history record, and removes the
   * redacted content from normal reads.
   */
  redactTimelineEntry(entryId: string, reason: string, authorId: UserId): Promise<TimelineEntry>;

  /**
   * Cancel a ticket. Only the ticket creator (Requester) can cancel
   * their own eligible Service Request. Cancellation is terminal —
   * the ticket status becomes 'cancelled' and cannot be transitioned.
   */
  cancelTicket(ticketId: string, userId: UserId): Promise<Ticket>;
}
