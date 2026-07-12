import type { Pool } from 'pg';
import type {
  RetentionModule,
  RetentionPolicy,
  LegalHold,
  CreateRetentionPolicyInput,
  ApplyLegalHoldInput,
  RetentionTarget,
  LegalHoldStatus,
} from '@ticketos/domain';
import type { WorkspaceId, UserId, Uuid } from '@ticketos/shared';

interface PolicyRow {
  id: string;
  workspace_id: string;
  name: string;
  target: string;
  retention_days: number;
  archive_before_delete: boolean;
  anonymize_content: boolean;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

interface HoldRow {
  id: string;
  ticket_id: string;
  workspace_id: string;
  reason: string;
  applied_by: string;
  status: string;
  applied_at: string;
  released_at: string | null;
  released_by: string | null;
}

function mapPolicy(r: PolicyRow): RetentionPolicy {
  return {
    id: r.id,
    workspaceId: r.workspace_id,
    name: r.name,
    target: r.target as RetentionTarget,
    retentionDays: r.retention_days,
    archiveBeforeDelete: r.archive_before_delete,
    anonymizeContent: r.anonymize_content,
    enabled: r.enabled,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function mapHold(r: HoldRow): LegalHold {
  return {
    id: r.id,
    ticketId: r.ticket_id,
    workspaceId: r.workspace_id,
    reason: r.reason,
    appliedBy: r.applied_by,
    status: r.status as LegalHoldStatus,
    appliedAt: r.applied_at,
    releasedAt: r.released_at,
    releasedBy: r.released_by,
  };
}

export class PostgresRetention implements RetentionModule {
  constructor(private pool: Pool) {}

  // ---------------------------------------------------------------------------
  // Policies
  // ---------------------------------------------------------------------------

  async createPolicy(input: CreateRetentionPolicyInput): Promise<RetentionPolicy> {
    const { rows } = await this.pool.query<PolicyRow>(
      `INSERT INTO retention_policies (workspace_id, name, target, retention_days, archive_before_delete, anonymize_content)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [
        input.workspaceId,
        input.name,
        input.target,
        input.retentionDays,
        input.archiveBeforeDelete ?? true,
        input.anonymizeContent ?? true,
      ],
    );
    return mapPolicy(rows[0]!);
  }

  async updatePolicy(id: Uuid, input: Partial<CreateRetentionPolicyInput>): Promise<RetentionPolicy> {
    const sets: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (input.name !== undefined) { sets.push(`name = $${idx++}`); values.push(input.name); }
    if (input.target !== undefined) { sets.push(`target = $${idx++}`); values.push(input.target); }
    if (input.retentionDays !== undefined) { sets.push(`retention_days = $${idx++}`); values.push(input.retentionDays); }
    if (input.archiveBeforeDelete !== undefined) { sets.push(`archive_before_delete = $${idx++}`); values.push(input.archiveBeforeDelete); }
    if (input.anonymizeContent !== undefined) { sets.push(`anonymize_content = $${idx++}`); values.push(input.anonymizeContent); }
    sets.push('updated_at = NOW()');
    values.push(id);

    const { rows } = await this.pool.query<PolicyRow>(
      `UPDATE retention_policies SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
      values,
    );
    if (!rows[0]) throw new Error(`Retention policy not found: ${id}`);
    return mapPolicy(rows[0]);
  }

  async deletePolicy(id: Uuid): Promise<void> {
    await this.pool.query('DELETE FROM retention_policies WHERE id = $1', [id]);
  }

  async getPolicy(id: Uuid): Promise<RetentionPolicy | null> {
    const { rows } = await this.pool.query<PolicyRow>(
      'SELECT * FROM retention_policies WHERE id = $1',
      [id],
    );
    return rows[0] ? mapPolicy(rows[0]) : null;
  }

  async listPolicies(workspaceId: WorkspaceId): Promise<RetentionPolicy[]> {
    const { rows } = await this.pool.query<PolicyRow>(
      'SELECT * FROM retention_policies WHERE workspace_id = $1 ORDER BY name',
      [workspaceId],
    );
    return rows.map(mapPolicy);
  }

  // ---------------------------------------------------------------------------
  // Legal Holds
  // ---------------------------------------------------------------------------

  async applyLegalHold(input: ApplyLegalHoldInput): Promise<LegalHold> {
    const { rows } = await this.pool.query<HoldRow>(
      `INSERT INTO legal_holds (ticket_id, workspace_id, reason, applied_by, status)
       VALUES ($1, $2, $3, $4, 'active') RETURNING *`,
      [input.ticketId, input.workspaceId, input.reason, input.appliedBy],
    );
    return mapHold(rows[0]!);
  }

  async releaseLegalHold(holdId: Uuid, releasedBy: UserId): Promise<LegalHold> {
    const { rows } = await this.pool.query<HoldRow>(
      `UPDATE legal_holds SET status = 'released', released_at = NOW(), released_by = $1
       WHERE id = $2 AND status = 'active' RETURNING *`,
      [releasedBy, holdId],
    );
    if (!rows[0]) throw new Error(`Legal hold not found or already released: ${holdId}`);
    return mapHold(rows[0]);
  }

  async getActiveHoldsForTicket(ticketId: Uuid): Promise<LegalHold[]> {
    const { rows } = await this.pool.query<HoldRow>(
      "SELECT * FROM legal_holds WHERE ticket_id = $1 AND status = 'active'",
      [ticketId],
    );
    return rows.map(mapHold);
  }

  async isTicketOnHold(ticketId: Uuid): Promise<boolean> {
    const holds = await this.getActiveHoldsForTicket(ticketId);
    return holds.length > 0;
  }

  // ---------------------------------------------------------------------------
  // Retention execution
  // ---------------------------------------------------------------------------

  async getEligibleTickets(_workspaceId: WorkspaceId, _policyId: Uuid): Promise<Uuid[]> {
    // TODO: implement eligibility check based on retention days and last activity
    return [];
  }

  async archiveTicket(ticketId: Uuid): Promise<void> {
    await this.pool.query(
      'UPDATE tickets SET archived_at = NOW(), updated_at = NOW() WHERE id = $1',
      [ticketId],
    );
  }

  async deleteTicket(ticketId: Uuid): Promise<void> {
    await this.pool.query('DELETE FROM tickets WHERE id = $1', [ticketId]);
  }

  async anonymizeTicket(ticketId: Uuid): Promise<void> {
    await this.pool.query(
      `UPDATE tickets SET title = 'Anonymized', description = NULL, updated_at = NOW()
       WHERE id = $1`,
      [ticketId],
    );
  }
}
