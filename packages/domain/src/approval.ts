// Approval module — Ordered approval policies for Catalog Items
// No framework-specific types may leak into domain interfaces.

import type { WorkspaceId, Uuid, Timestamp } from '@ticketos/shared';

// ---------------------------------------------------------------------------
// Approval Policy
// ---------------------------------------------------------------------------

export type ApprovalStepType = 'any-one' | 'all';

export interface ApprovalPolicy {
  id: Uuid;
  workspaceId: WorkspaceId;
  name: string;
  description: string | null;
  createdAt: Timestamp;
}

export interface ApprovalStep {
  id: Uuid;
  policyId: Uuid;
  stepOrder: number;
  stepType: ApprovalStepType;
  approverUserIds: Uuid[];
  createdAt: Timestamp;
}

// ---------------------------------------------------------------------------
// Approval Instance (per Ticket)
// ---------------------------------------------------------------------------

export type ApprovalInstanceStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';
export type ApprovalDecision = 'approved' | 'rejected';

export interface ApprovalInstance {
  id: Uuid;
  ticketId: Uuid;
  policyId: Uuid;
  status: ApprovalInstanceStatus;
  createdAt: Timestamp;
  completedAt: Timestamp | null;
}

export interface ApprovalDecisionRecord {
  id: Uuid;
  instanceId: Uuid;
  stepId: Uuid;
  approverUserId: Uuid;
  decision: ApprovalDecision;
  comment: string | null;
  decidedAt: Timestamp;
}

// ---------------------------------------------------------------------------
// Input types
// ---------------------------------------------------------------------------

export interface CreateApprovalPolicyInput {
  workspaceId: WorkspaceId;
  name: string;
  description?: string | null;
  steps: CreateApprovalStepInput[];
}

export interface CreateApprovalStepInput {
  stepOrder: number;
  stepType: ApprovalStepType;
  approverUserIds: Uuid[];
}

export interface DecideApprovalInput {
  instanceId: Uuid;
  stepId: Uuid;
  approverUserId: Uuid;
  decision: ApprovalDecision;
  comment?: string | null;
}

// ---------------------------------------------------------------------------
// Approval Module interface
// ---------------------------------------------------------------------------

export interface ApprovalModule {
  // Policies
  createPolicy(input: CreateApprovalPolicyInput): Promise<ApprovalPolicy>;
  getPolicy(id: Uuid): Promise<ApprovalPolicy | null>;
  listPolicies(workspaceId: WorkspaceId): Promise<ApprovalPolicy[]>;
  deletePolicy(id: Uuid): Promise<void>;

  // Policy Steps
  addStep(policyId: Uuid, input: CreateApprovalStepInput): Promise<ApprovalStep>;
  removeStep(stepId: Uuid): Promise<void>;
  getStepsForPolicy(policyId: Uuid): Promise<ApprovalStep[]>;

  // Approval Instances
  startApproval(ticketId: Uuid, policyId: Uuid): Promise<ApprovalInstance>;
  getInstanceForTicket(ticketId: Uuid): Promise<ApprovalInstance | null>;
  decideApproval(input: DecideApprovalInput): Promise<ApprovalDecisionRecord>;
  getDecisionsForInstance(instanceId: Uuid): Promise<ApprovalDecisionRecord[]>;

  // Status checks
  isApproved(instanceId: Uuid): Promise<boolean>;
  isRejected(instanceId: Uuid): Promise<boolean>;
  isPending(instanceId: Uuid): Promise<boolean>;
}
