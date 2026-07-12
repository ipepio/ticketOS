// Config module — Workspace-configurable roles, extensions, and platform settings
// No framework-specific types may leak into domain interfaces.

import type { WorkspaceId, Uuid, Timestamp } from '@ticketos/shared';

// ---------------------------------------------------------------------------
// Configurable Role
// ---------------------------------------------------------------------------

export interface ConfigurableRole {
  id: Uuid;
  workspaceId: WorkspaceId;
  name: string;
  capabilities: string[];
  isBuiltin: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ---------------------------------------------------------------------------
// Workspace Settings
// ---------------------------------------------------------------------------

export interface WorkspaceSettings {
  workspaceId: WorkspaceId;
  defaultTicketType: string | null;
  defaultPriority: string | null;
  defaultCalendarId: Uuid | null;
  emailDomain: string | null;
  ssoEnabled: boolean;
  mfaRequired: boolean;
  retentionPolicyId: Uuid | null;
  updatedAt: Timestamp;
}

// ---------------------------------------------------------------------------
// Input types
// ---------------------------------------------------------------------------

export interface CreateRoleInput {
  workspaceId: WorkspaceId;
  name: string;
  capabilities: string[];
}

export interface UpdateSettingsInput {
  defaultTicketType?: string | null;
  defaultPriority?: string | null;
  defaultCalendarId?: Uuid | null;
  emailDomain?: string | null;
  ssoEnabled?: boolean;
  mfaRequired?: boolean;
  retentionPolicyId?: Uuid | null;
}

// ---------------------------------------------------------------------------
// Config Module interface
// ---------------------------------------------------------------------------

export interface ConfigModule {
  // Roles
  createRole(input: CreateRoleInput): Promise<ConfigurableRole>;
  updateRole(id: Uuid, input: Partial<CreateRoleInput>): Promise<ConfigurableRole>;
  deleteRole(id: Uuid): Promise<void>;
  getRole(id: Uuid): Promise<ConfigurableRole | null>;
  listRoles(workspaceId: WorkspaceId): Promise<ConfigurableRole[]>;

  // Settings
  getSettings(workspaceId: WorkspaceId): Promise<WorkspaceSettings>;
  updateSettings(workspaceId: WorkspaceId, input: UpdateSettingsInput): Promise<WorkspaceSettings>;
}
