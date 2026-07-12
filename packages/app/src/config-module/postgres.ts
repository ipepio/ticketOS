import type { Pool } from 'pg';
import type {
  ConfigModule,
  ConfigurableRole,
  WorkspaceSettings,
  CreateRoleInput,
  UpdateSettingsInput,
} from '@ticketos/domain';
import type { WorkspaceId, Uuid } from '@ticketos/shared';

interface RoleRow {
  id: string; workspace_id: string; name: string; capabilities: string;
  is_builtin: boolean; created_at: string; updated_at: string;
}
interface SettingsRow {
  workspace_id: string; default_ticket_type: string | null; default_priority: string | null;
  default_calendar_id: string | null; email_domain: string | null; sso_enabled: boolean;
  mfa_required: boolean; retention_policy_id: string | null; updated_at: string;
}

function mapRole(r: RoleRow): ConfigurableRole {
  const caps = typeof r.capabilities === 'string' ? JSON.parse(r.capabilities) : r.capabilities;
  return { id: r.id, workspaceId: r.workspace_id, name: r.name, capabilities: caps as string[],
    isBuiltin: r.is_builtin, createdAt: r.created_at, updatedAt: r.updated_at };
}
function mapSettings(r: SettingsRow): WorkspaceSettings {
  return { workspaceId: r.workspace_id, defaultTicketType: r.default_ticket_type,
    defaultPriority: r.default_priority, defaultCalendarId: r.default_calendar_id,
    emailDomain: r.email_domain, ssoEnabled: r.sso_enabled, mfaRequired: r.mfa_required,
    retentionPolicyId: r.retention_policy_id, updatedAt: r.updated_at };
}

export class PostgresConfig implements ConfigModule {
  constructor(private pool: Pool) {}

  async createRole(input: CreateRoleInput): Promise<ConfigurableRole> {
    const { rows } = await this.pool.query<RoleRow>(
      `INSERT INTO configurable_roles (workspace_id, name, capabilities) VALUES ($1, $2, $3) RETURNING *`,
      [input.workspaceId, input.name, JSON.stringify(input.capabilities)],
    );
    return mapRole(rows[0]!);
  }
  async updateRole(id: Uuid, input: Partial<CreateRoleInput>): Promise<ConfigurableRole> {
    const sets: string[] = []; const values: unknown[] = []; let idx = 1;
    if (input.name !== undefined) { sets.push(`name = $${idx++}`); values.push(input.name); }
    if (input.capabilities !== undefined) { sets.push(`capabilities = $${idx++}`); values.push(JSON.stringify(input.capabilities)); }
    sets.push('updated_at = NOW()'); values.push(id);
    const { rows } = await this.pool.query<RoleRow>(`UPDATE configurable_roles SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`, values);
    if (!rows[0]) throw new Error(`Role not found: ${id}`);
    return mapRole(rows[0]);
  }
  async deleteRole(id: Uuid): Promise<void> { await this.pool.query('DELETE FROM configurable_roles WHERE id = $1', [id]); }
  async getRole(id: Uuid): Promise<ConfigurableRole | null> {
    const { rows } = await this.pool.query<RoleRow>('SELECT * FROM configurable_roles WHERE id = $1', [id]);
    return rows[0] ? mapRole(rows[0]) : null;
  }
  async listRoles(workspaceId: WorkspaceId): Promise<ConfigurableRole[]> {
    const { rows } = await this.pool.query<RoleRow>('SELECT * FROM configurable_roles WHERE workspace_id = $1 ORDER BY name', [workspaceId]);
    return rows.map(mapRole);
  }

  async getSettings(workspaceId: WorkspaceId): Promise<WorkspaceSettings> {
    const { rows } = await this.pool.query<SettingsRow>('SELECT * FROM workspace_settings WHERE workspace_id = $1', [workspaceId]);
    if (rows[0]) return mapSettings(rows[0]);
    // Create default settings
    const { rows: created } = await this.pool.query<SettingsRow>(
      `INSERT INTO workspace_settings (workspace_id) VALUES ($1) ON CONFLICT (workspace_id) DO NOTHING RETURNING *`,
      [workspaceId],
    );
    return created[0] ? mapSettings(created[0]) : {
      workspaceId, defaultTicketType: null, defaultPriority: null, defaultCalendarId: null,
      emailDomain: null, ssoEnabled: false, mfaRequired: false, retentionPolicyId: null,
      updatedAt: new Date().toISOString(),
    };
  }
  async updateSettings(workspaceId: WorkspaceId, input: UpdateSettingsInput): Promise<WorkspaceSettings> {
    const sets: string[] = []; const values: unknown[] = []; let idx = 1;
    if (input.defaultTicketType !== undefined) { sets.push(`default_ticket_type = $${idx++}`); values.push(input.defaultTicketType); }
    if (input.defaultPriority !== undefined) { sets.push(`default_priority = $${idx++}`); values.push(input.defaultPriority); }
    if (input.defaultCalendarId !== undefined) { sets.push(`default_calendar_id = $${idx++}`); values.push(input.defaultCalendarId); }
    if (input.emailDomain !== undefined) { sets.push(`email_domain = $${idx++}`); values.push(input.emailDomain); }
    if (input.ssoEnabled !== undefined) { sets.push(`sso_enabled = $${idx++}`); values.push(input.ssoEnabled); }
    if (input.mfaRequired !== undefined) { sets.push(`mfa_required = $${idx++}`); values.push(input.mfaRequired); }
    if (input.retentionPolicyId !== undefined) { sets.push(`retention_policy_id = $${idx++}`); values.push(input.retentionPolicyId); }
    sets.push('updated_at = NOW()'); values.push(workspaceId);
    await this.pool.query(`INSERT INTO workspace_settings (workspace_id) VALUES ($1) ON CONFLICT (workspace_id) DO NOTHING`, [workspaceId]);
    const { rows } = await this.pool.query<SettingsRow>(`UPDATE workspace_settings SET ${sets.join(', ')} WHERE workspace_id = $${idx} RETURNING *`, values);
    return mapSettings(rows[0]!);
  }
}
