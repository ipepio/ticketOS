// Problem/Change module — ITIL Problem and Change Management
// No framework-specific types may leak into domain interfaces.

import type { WorkspaceId, UserId, Uuid, Timestamp } from '@ticketos/shared';

// ---------------------------------------------------------------------------
// Problem
// ---------------------------------------------------------------------------

export type ProblemStatus = 'identified' | 'investigating' | 'known-error' | 'resolved' | 'closed';

export interface Problem {
  id: Uuid;
  workspaceId: WorkspaceId;
  title: string;
  description: string | null;
  status: ProblemStatus;
  rootCause: string | null;
  workaround: string | null;
  assigneeId: UserId | null;
  createdBy: UserId;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ---------------------------------------------------------------------------
// Change
// ---------------------------------------------------------------------------

export type ChangeStatus = 'draft' | 'pending_approval' | 'approved' | 'rejected' | 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
export type ChangeRisk = 'low' | 'medium' | 'high' | 'critical';

export interface Change {
  id: Uuid;
  workspaceId: WorkspaceId;
  title: string;
  description: string | null;
  status: ChangeStatus;
  risk: ChangeRisk;
  reason: string | null;
  impactAnalysis: string | null;
  rollbackPlan: string | null;
  scheduledAt: Timestamp | null;
  completedAt: Timestamp | null;
  createdBy: UserId;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ---------------------------------------------------------------------------
// Asset (CMDB-lite)
// ---------------------------------------------------------------------------

export type AssetStatus = 'active' | 'inactive' | 'retired';

export interface Asset {
  id: Uuid;
  workspaceId: WorkspaceId;
  name: string;
  type: string;
  status: AssetStatus;
  metadata: Record<string, string>;
  createdBy: UserId;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ---------------------------------------------------------------------------
// Input types
// ---------------------------------------------------------------------------

export interface CreateProblemInput {
  workspaceId: WorkspaceId;
  title: string;
  description?: string | null;
  assigneeId?: UserId | null;
  createdBy: UserId;
}

export interface CreateChangeInput {
  workspaceId: WorkspaceId;
  title: string;
  description?: string | null;
  risk?: ChangeRisk;
  reason?: string | null;
  impactAnalysis?: string | null;
  rollbackPlan?: string | null;
  createdBy: UserId;
}

export interface CreateAssetInput {
  workspaceId: WorkspaceId;
  name: string;
  type: string;
  metadata?: Record<string, string>;
  createdBy: UserId;
}

// ---------------------------------------------------------------------------
// Problem/Change Module interface
// ---------------------------------------------------------------------------

export interface ProblemChangeModule {
  // Problems
  createProblem(input: CreateProblemInput): Promise<Problem>;
  updateProblem(id: Uuid, input: Partial<CreateProblemInput & { status: ProblemStatus; rootCause: string | null; workaround: string | null }>): Promise<Problem>;
  getProblem(id: Uuid): Promise<Problem | null>;
  listProblems(workspaceId: WorkspaceId): Promise<Problem[]>;

  // Changes
  createChange(input: CreateChangeInput): Promise<Change>;
  updateChange(id: Uuid, input: Partial<CreateChangeInput & { status: ChangeStatus; scheduledAt: Timestamp | null }>): Promise<Change>;
  getChange(id: Uuid): Promise<Change | null>;
  listChanges(workspaceId: WorkspaceId): Promise<Change[]>;

  // Assets
  createAsset(input: CreateAssetInput): Promise<Asset>;
  updateAsset(id: Uuid, input: Partial<CreateAssetInput & { status: AssetStatus }>): Promise<Asset>;
  getAsset(id: Uuid): Promise<Asset | null>;
  listAssets(workspaceId: WorkspaceId): Promise<Asset[]>;
}
