// Retention module — Workspace retention policies and legal holds
// No framework-specific types may leak into domain interfaces.

import type { WorkspaceId, UserId, Uuid, Timestamp } from '@ticketos/shared';

// ---------------------------------------------------------------------------
// Retention Policy
// ---------------------------------------------------------------------------

export type RetentionTarget = 'tickets' | 'timeline' | 'attachments' | 'articles';

export interface RetentionPolicy {
  id: Uuid;
  workspaceId: WorkspaceId;
  name: string;
  target: RetentionTarget;
  retentionDays: number; // days after last activity
  archiveBeforeDelete: boolean;
  anonymizeContent: boolean;
  enabled: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ---------------------------------------------------------------------------
// Legal Hold
// ---------------------------------------------------------------------------

export type LegalHoldStatus = 'active' | 'released';

export interface LegalHold {
  id: Uuid;
  ticketId: Uuid;
  workspaceId: WorkspaceId;
  reason: string;
  appliedBy: UserId;
  status: LegalHoldStatus;
  appliedAt: Timestamp;
  releasedAt: Timestamp | null;
  releasedBy: UserId | null;
}

// ---------------------------------------------------------------------------
// Input types
// ---------------------------------------------------------------------------

export interface CreateRetentionPolicyInput {
  workspaceId: WorkspaceId;
  name: string;
  target: RetentionTarget;
  retentionDays: number;
  archiveBeforeDelete?: boolean;
  anonymizeContent?: boolean;
}

export interface ApplyLegalHoldInput {
  ticketId: Uuid;
  workspaceId: WorkspaceId;
  reason: string;
  appliedBy: UserId;
}

// ---------------------------------------------------------------------------
// Retention Module interface
// ---------------------------------------------------------------------------

export interface RetentionModule {
  // Policies
  createPolicy(input: CreateRetentionPolicyInput): Promise<RetentionPolicy>;
  updatePolicy(id: Uuid, input: Partial<CreateRetentionPolicyInput>): Promise<RetentionPolicy>;
  deletePolicy(id: Uuid): Promise<void>;
  getPolicy(id: Uuid): Promise<RetentionPolicy | null>;
  listPolicies(workspaceId: WorkspaceId): Promise<RetentionPolicy[]>;

  // Legal Holds
  applyLegalHold(input: ApplyLegalHoldInput): Promise<LegalHold>;
  releaseLegalHold(holdId: Uuid, releasedBy: UserId): Promise<LegalHold>;
  getActiveHoldsForTicket(ticketId: Uuid): Promise<LegalHold[]>;
  isTicketOnHold(ticketId: Uuid): Promise<boolean>;

  // Retention execution
  getEligibleTickets(workspaceId: WorkspaceId, policyId: Uuid): Promise<Uuid[]>;
  archiveTicket(ticketId: Uuid): Promise<void>;
  deleteTicket(ticketId: Uuid): Promise<void>;
  anonymizeTicket(ticketId: Uuid): Promise<void>;
}
