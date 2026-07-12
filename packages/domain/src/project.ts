// Project module — Project and issue tracking
// No framework-specific types may leak into domain interfaces.

import type { WorkspaceId, UserId, Uuid, Timestamp } from '@ticketos/shared';

// ---------------------------------------------------------------------------
// Project
// ---------------------------------------------------------------------------

export type ProjectStatus = 'active' | 'archived' | 'deleted';

export interface Project {
  id: Uuid;
  workspaceId: WorkspaceId;
  name: string;
  description: string | null;
  status: ProjectStatus;
  createdBy: UserId;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ---------------------------------------------------------------------------
// Issue
// ---------------------------------------------------------------------------

export type IssueStatus = 'backlog' | 'todo' | 'in_progress' | 'in_review' | 'done';
export type IssuePriority = 'critical' | 'high' | 'medium' | 'low';
export type IssueType = 'bug' | 'feature' | 'task' | 'epic';

export interface Issue {
  id: Uuid;
  projectId: Uuid;
  title: string;
  description: string | null;
  status: IssueStatus;
  priority: IssuePriority;
  type: IssueType;
  assigneeId: UserId | null;
  reporterId: UserId;
  parentIssueId: Uuid | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ---------------------------------------------------------------------------
// Input types
// ---------------------------------------------------------------------------

export interface CreateProjectInput {
  workspaceId: WorkspaceId;
  name: string;
  description?: string | null;
  createdBy: UserId;
}

export interface CreateIssueInput {
  projectId: Uuid;
  title: string;
  description?: string | null;
  priority?: IssuePriority;
  type?: IssueType;
  assigneeId?: UserId | null;
  reporterId: UserId;
  parentIssueId?: Uuid | null;
}

export interface UpdateIssueInput {
  title?: string;
  description?: string | null;
  status?: IssueStatus;
  priority?: IssuePriority;
  type?: IssueType;
  assigneeId?: UserId | null;
}

// ---------------------------------------------------------------------------
// Project Module interface
// ---------------------------------------------------------------------------

export interface ProjectModule {
  // Projects
  createProject(input: CreateProjectInput): Promise<Project>;
  updateProject(id: Uuid, input: Partial<CreateProjectInput>): Promise<Project>;
  deleteProject(id: Uuid): Promise<void>;
  getProject(id: Uuid): Promise<Project | null>;
  listProjects(workspaceId: WorkspaceId): Promise<Project[]>;

  // Issues
  createIssue(input: CreateIssueInput): Promise<Issue>;
  updateIssue(id: Uuid, input: UpdateIssueInput): Promise<Issue>;
  deleteIssue(id: Uuid): Promise<void>;
  getIssue(id: Uuid): Promise<Issue | null>;
  listIssues(projectId: Uuid, options?: { status?: IssueStatus; type?: IssueType }): Promise<Issue[]>;
}
