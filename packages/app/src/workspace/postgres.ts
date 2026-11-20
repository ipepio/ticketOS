import type { Pool } from 'pg';
import type {
  WorkspaceModule,
  Workspace,
  Organization,
  Queue,
  QueueMember,
  QueueDetail,
  QueueAccessMode,
} from '@ticketos/domain';
import type { WorkspaceId, QueueId, UserId, Role } from '@ticketos/shared';
// Role -> capability policy lives in the identity module (ADR 0006); derive it, never duplicate it.
import { CAPABILITY_MAP } from '../identity/postgres.js';

// ---------------------------------------------------------------------------
// Domain errors — stable machine-readable codes (S10)
// ---------------------------------------------------------------------------

export class ConfigurationConflictError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ConfigurationConflictError';
  }
}

export class ConfigurationNotFoundError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ConfigurationNotFoundError';
  }
}

// ---------------------------------------------------------------------------
// Workspace repository
// ---------------------------------------------------------------------------

export class PostgresWorkspace implements WorkspaceModule {
  constructor(private pool: Pool) {}

  async createWorkspace(
    input: { name: string },
  ): Promise<Workspace> {
    const { rows } = await this.pool.query(
      `INSERT INTO workspaces (name) VALUES ($1) RETURNING id, name, created_at`,
      [input.name],
    );

    const row = rows[0]!;
    return {
      id: row.id,
      name: row.name,
      createdAt: row.created_at,
    };
  }

  async getWorkspace(id: WorkspaceId): Promise<Workspace | null> {
    const { rows } = await this.pool.query(
      'SELECT id, name, created_at FROM workspaces WHERE id = $1',
      [id],
    );
    if (rows.length === 0) return null;

    const row = rows[0]!;
    return {
      id: row.id,
      name: row.name,
      createdAt: row.created_at,
    };
  }

  async createOrganization(
    input: { workspaceId: WorkspaceId; name: string },
  ): Promise<Organization> {
    const { rows } = await this.pool.query(
      `INSERT INTO organizations (workspace_id, name) VALUES ($1, $2)
       RETURNING id, workspace_id, name, created_at`,
      [input.workspaceId, input.name],
    );

    const row = rows[0]!;
    return {
      id: row.id,
      workspaceId: row.workspace_id,
      name: row.name,
    };
  }

  async getOrganizations(
    workspaceId: WorkspaceId,
  ): Promise<Organization[]> {
    const { rows } = await this.pool.query(
      'SELECT id, workspace_id, name FROM organizations WHERE workspace_id = $1',
      [workspaceId],
    );

    return rows.map((r) => ({
      id: r.id,
      workspaceId: r.workspace_id,
      name: r.name,
    }));
  }

  async getOrganization(id: string): Promise<Organization | null> {
    const { rows } = await this.pool.query(
      'SELECT id, workspace_id, name FROM organizations WHERE id = $1',
      [id],
    );
    if (rows.length === 0) return null;

    const row = rows[0]!;
    return {
      id: row.id,
      workspaceId: row.workspace_id,
      name: row.name,
    };
  }

  // ---------------------------------------------------------------------------
  // Queue — create (S2: workspace isolation, S4: audit, S7: access mode)
  // ---------------------------------------------------------------------------

  async createQueue(
    workspaceId: WorkspaceId,
    actorId: UserId,
    input: { name?: string; accessMode?: QueueAccessMode },
  ): Promise<Queue> {
    const trimmedName = input.name?.trim();
    if (!trimmedName) {
      throw new ConfigurationConflictError(
        'queue-name-empty',
        'Queue name must not be empty',
      );
    }

    const accessMode = input.accessMode ?? 'workspace-agents';
    if (accessMode !== 'workspace-agents' && accessMode !== 'restricted') {
      throw new ConfigurationConflictError(
        'queue-access-mode-invalid',
        `Invalid queue access mode: ${String(accessMode)}`,
      );
    }

    // Workspace-unique name check (S2)
    const { rows: existing } = await this.pool.query(
      'SELECT id FROM queues WHERE workspace_id = $1 AND name = $2',
      [workspaceId, trimmedName],
    );
    if (existing.length > 0) {
      throw new ConfigurationConflictError(
        'queue-name-duplicate',
        `A queue named '${trimmedName}' already exists in this workspace`,
      );
    }

    // Check if sort_order column exists (S4)
    const { rows: colInfo } = await this.pool.query(
      `SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'queues' AND column_name = 'sort_order'
      )`,
    );
    const hasSortOrder = (colInfo[0] as { exists: boolean })?.exists;

    let sortValue: number | undefined;
    if (hasSortOrder) {
      const { rows: maxSort } = await this.pool.query(
        'SELECT COALESCE(MAX(sort_order), 0) + 1 AS next_order FROM queues WHERE workspace_id = $1',
        [workspaceId],
      );
      sortValue = Number((maxSort[0] as { next_order: number })?.next_order);
    }

    // Insert queue + audit event in the caller's transaction (if any)
    if (sortValue !== undefined) {
      const { rows } = await this.pool.query(
        `INSERT INTO queues (workspace_id, name, access_mode, sort_order)
         VALUES ($1, $2, $3, $4)
         RETURNING id, workspace_id, name, access_mode, created_at`,
        [workspaceId, trimmedName, accessMode, sortValue],
      );

      await this.pool.query(
        `INSERT INTO audit_events (id, kind, actor_user_id, workspace_id, details, created_at)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, NOW())`,
        ['queue-created', actorId, workspaceId, JSON.stringify({ queueId: rows[0]!.id, name: trimmedName, accessMode })],
      );

      const row = rows[0]!;
      return {
        id: row.id,
        workspaceId: row.workspace_id,
        name: row.name,
        accessMode: row.access_mode as QueueAccessMode,
        createdAt: row.created_at,
      };
    }

    const { rows } = await this.pool.query(
      `INSERT INTO queues (workspace_id, name, access_mode)
       VALUES ($1, $2, $3)
       RETURNING id, workspace_id, name, access_mode, created_at`,
      [workspaceId, trimmedName, accessMode],
    );

    await this.pool.query(
      `INSERT INTO audit_events (id, kind, actor_user_id, workspace_id, details, created_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, NOW())`,
      ['queue-created', actorId, workspaceId, JSON.stringify({ queueId: rows[0]!.id, name: trimmedName, accessMode })],
    );

    const row = rows[0]!;
    return {
      id: row.id,
      workspaceId: row.workspace_id,
      name: row.name,
      accessMode: row.access_mode as QueueAccessMode,
      createdAt: row.created_at,
    };
  }

  // ---------------------------------------------------------------------------
  // Queue — update (S2: workspace isolation, S4: audit with before/after)
  // ---------------------------------------------------------------------------

  async updateQueue(
    workspaceId: WorkspaceId,
    actorId: UserId,
    queueId: QueueId,
    input: { name?: string; accessMode?: QueueAccessMode },
  ): Promise<Queue> {
    // Validate queue exists and belongs to the workspace (S2)
    const { rows: queueRows } = await this.pool.query(
      'SELECT id, workspace_id, name, access_mode FROM queues WHERE id = $1',
      [queueId],
    );
    if (queueRows.length === 0) {
      throw new ConfigurationNotFoundError(
        'queue-not-found',
        `Queue '${queueId}' is not part of workspace '${workspaceId}'`,
      );
    }

    const existing = queueRows[0]!;
    if (existing.workspace_id !== workspaceId) {
      throw new ConfigurationNotFoundError(
        'queue-not-in-workspace',
        `Queue '${queueId}' is not part of workspace '${workspaceId}'`,
      );
    }

    const onlyName = input.name !== undefined && input.accessMode === undefined;
    const onlyAccess = input.name === undefined && input.accessMode !== undefined;
    const bothChanged = input.name !== undefined && input.accessMode !== undefined;

    // No changes — return existing
    if (!onlyName && !onlyAccess && !bothChanged) {
      return {
        id: existing.id,
        workspaceId: existing.workspace_id,
        name: existing.name,
        accessMode: existing.access_mode as QueueAccessMode,
        createdAt: new Date().toISOString(),
      };
    }

    // Validate name before committing the update
    if (onlyName || bothChanged) {
      const trimmedName = input.name!.trim();
      if (!trimmedName) {
        throw new ConfigurationConflictError(
          'queue-name-empty',
          'Queue name must not be empty',
        );
      }
    }

    // Validate access mode before committing the update
    if (onlyAccess || bothChanged) {
      const mode = input.accessMode!;
      if (mode !== 'workspace-agents' && mode !== 'restricted') {
        throw new ConfigurationConflictError(
          'queue-access-mode-invalid',
          `Invalid queue access mode: ${String(mode)}`,
        );
      }
    }

    let { rows }: { rows: QueueRow[] } = { rows: [] };

    if (bothChanged) {
      const trimmedName = input.name!.trim();
      ({ rows } = await this.pool.query(
        `UPDATE queues SET name = $1, access_mode = $2 WHERE id = $3
         RETURNING id, workspace_id, name, access_mode, created_at`,
        [trimmedName, input.accessMode!, queueId],
      ));
    } else if (onlyName) {
      const trimmedName = input.name!.trim();
      ({ rows } = await this.pool.query(
        `UPDATE queues SET name = $1 WHERE id = $2
         RETURNING id, workspace_id, name, access_mode, created_at`,
        [trimmedName, queueId],
      ));
    } else {
      // onlyAccess
      ({ rows } = await this.pool.query(
        `UPDATE queues SET access_mode = $1 WHERE id = $2
         RETURNING id, workspace_id, name, access_mode, created_at`,
        [input.accessMode!, queueId],
      ));
    }

    const updated = rows[0]!;

    // Audit with before/after for access-mode changes (S4)
    if (input.accessMode !== undefined) {
      await this.pool.query(
        `INSERT INTO audit_events (id, kind, actor_user_id, workspace_id, details, created_at)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, NOW())`,
        ['queue-updated', actorId, workspaceId, JSON.stringify({
          queueId,
          accessModeBefore: existing.access_mode,
          accessModeAfter: input.accessMode,
        })],
      );
    } else {
      await this.pool.query(
        `INSERT INTO audit_events (id, kind, actor_user_id, workspace_id, details, created_at)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, NOW())`,
        ['queue-updated', actorId, workspaceId, JSON.stringify({ queueId })],
      );
    }

    return {
      id: updated.id,
      workspaceId: updated.workspace_id,
      name: updated.name,
      accessMode: updated.access_mode as QueueAccessMode,
      createdAt: updated.created_at,
    };
  }

  // ---------------------------------------------------------------------------
  // Queue — read (S7: enriched list with bounded queries)
  // ---------------------------------------------------------------------------

  async getQueue(id: QueueId): Promise<Queue | null> {
    const { rows } = await this.pool.query(
      'SELECT id, workspace_id, name, access_mode, created_at FROM queues WHERE id = $1',
      [id],
    );
    if (rows.length === 0) return null;

    const row = rows[0]!;
    return {
      id: row.id,
      workspaceId: row.workspace_id,
      name: row.name,
      accessMode: row.access_mode as QueueAccessMode,
      createdAt: row.created_at,
    };
  }

  async getQueues(workspaceId: WorkspaceId): Promise<Queue[]> {
    const { rows } = await this.pool.query(
      'SELECT id, workspace_id, name, access_mode, created_at FROM queues WHERE workspace_id = $1',
      [workspaceId],
    );

    return rows.map((r) => ({
      id: r.id,
      workspaceId: r.workspace_id,
      name: r.name,
      accessMode: r.access_mode as QueueAccessMode,
      createdAt: r.created_at,
    }));
  }

  async listQueues(workspaceId: WorkspaceId): Promise<QueueDetail[]> {
    // Active Ticket count: the Ticket is in a Status whose canonical category is
    // neither resolved nor closed (S5). Status resolution comes from Workspace
    // configuration, so there is no hard-coded status string here.
    const { rows } = await this.pool.query(
      `SELECT q.id, q.name, q.access_mode,
              COUNT(qm.id)::int AS member_count,
              COUNT(t.id) FILTER (
                WHERE s.category NOT IN ('resolved', 'closed')
              )::int AS ticket_count
       FROM queues q
       LEFT JOIN queue_members qm ON qm.queue_id = q.id
       LEFT JOIN tickets t ON t.queue_id = q.id
       LEFT JOIN statuses s ON s.id = t.status_id
       WHERE q.workspace_id = $1
       GROUP BY q.id
       ORDER BY q.created_at`,
      [workspaceId],
    );

    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      accessMode: r.access_mode as QueueAccessMode,
      memberCount: Number(r.member_count),
      activeTicketCount: Number(r.ticket_count),
    }));
  }

  // ---------------------------------------------------------------------------
  // Queue — member add (S2: workspace isolation, S8: eligibility + idempotency)
  // ---------------------------------------------------------------------------

  async addQueueMember(
    workspaceId: WorkspaceId,
    actorId: UserId,
    queueId: QueueId,
    userId: UserId,
  ): Promise<void> {
    // Validate queue belongs to workspace (S2)
    const { rows: queueRows } = await this.pool.query(
      'SELECT id FROM queues WHERE id = $1 AND workspace_id = $2',
      [queueId, workspaceId],
    );
    if (queueRows.length === 0) {
      throw new ConfigurationNotFoundError(
        'queue-not-in-workspace',
        `Queue '${queueId}' is not part of workspace '${workspaceId}'`,
      );
    }

    // Validate user has an active membership with Agent or Workspace Admin capability (S8)
    const { rows: membershipRows } = await this.pool.query(
      `SELECT 1 FROM workspace_memberships
       WHERE user_id = $1 AND workspace_id = $2
         AND role IN ('agent', 'workspace-admin')
         AND status = 'active'
       LIMIT 1`,
      [userId, workspaceId],
    );
    if (membershipRows.length === 0) {
      throw new ConfigurationNotFoundError(
        'user-not-eligible',
        `User '${userId}' does not have an active Agent or Workspace Admin membership in workspace '${workspaceId}'`,
      );
    }

    // Idempotent insert — only log audit if row was actually inserted
    const { rows: insertRows } = await this.pool.query(
      `INSERT INTO queue_members (workspace_id, queue_id, user_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (workspace_id, queue_id, user_id) DO NOTHING
       RETURNING 1`,
      [workspaceId, queueId, userId],
    );

    if (insertRows.length > 0) {
      await this.pool.query(
        `INSERT INTO audit_events (id, kind, actor_user_id, workspace_id, details, created_at)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, NOW())`,
        ['queue-member-added', actorId, workspaceId, JSON.stringify({
          queueId,
          userId,
        })],
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Queue — member remove (S8: idempotent)
  // ---------------------------------------------------------------------------

  async removeQueueMember(
    workspaceId: WorkspaceId,
    actorId: UserId,
    queueId: QueueId,
    userId: UserId,
  ): Promise<void> {
    // Validate queue belongs to workspace (S2)
    const { rows: queueRows } = await this.pool.query(
      'SELECT id FROM queues WHERE id = $1 AND workspace_id = $2',
      [queueId, workspaceId],
    );
    if (queueRows.length === 0) {
      throw new ConfigurationNotFoundError(
        'queue-not-in-workspace',
        `Queue '${queueId}' is not part of workspace '${workspaceId}'`,
      );
    }

    // Idempotent delete — only log audit if row was actually deleted
    const { rows: deleteRows } = await this.pool.query(
      `DELETE FROM queue_members
       WHERE workspace_id = $1 AND queue_id = $2 AND user_id = $3
       RETURNING 1`,
      [workspaceId, queueId, userId],
    );

    if (deleteRows.length > 0) {
      await this.pool.query(
        `INSERT INTO audit_events (id, kind, actor_user_id, workspace_id, details, created_at)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, NOW())`,
        ['queue-member-removed', actorId, workspaceId, JSON.stringify({
          queueId,
          userId,
        })],
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Queue members — read (S2: workspace-scoped)
  // ---------------------------------------------------------------------------

  async getQueueMembers(
    workspaceId: WorkspaceId,
    queueId: QueueId,
  ): Promise<QueueMember[]> {
    const { rows } = await this.pool.query(
      `SELECT qm.user_id, u.email, u.display_name, wm.role
       FROM queue_members qm
       JOIN users u ON u.id = qm.user_id
       JOIN workspace_memberships wm ON wm.user_id = qm.user_id AND wm.workspace_id = qm.workspace_id
       WHERE qm.workspace_id = $1 AND qm.queue_id = $2
       ORDER BY u.email`,
      [workspaceId, queueId],
    );

    return rows.map((r) => ({
      userId: r.user_id,
      displayName: (r.display_name as string | null) ?? null,
      email: r.email,
      role: r.role as Role,
      capabilities: CAPABILITY_MAP[r.role as Role] ?? [],
    }));
  }

  async isQueueMember(
    queueId: QueueId,
    userId: UserId,
  ): Promise<boolean> {
    const { rows } = await this.pool.query(
      'SELECT 1 FROM queue_members WHERE queue_id = $1 AND user_id = $2',
      [queueId, userId],
    );

    return rows.length > 0;
  }

  // ---------------------------------------------------------------------------
  // Queue access check (S8: access control policy)
  // ---------------------------------------------------------------------------

  async canAccessQueue(
    workspaceId: WorkspaceId,
    userId: UserId,
    queueId: QueueId,
  ): Promise<boolean> {
    // Fetch queue access mode (S2: workspace-scoped)
    const { rows: queueRows } = await this.pool.query(
      'SELECT access_mode FROM queues WHERE id = $1 AND workspace_id = $2',
      [queueId, workspaceId],
    );
    if (queueRows.length === 0) return false;

    const accessMode = queueRows[0]!.access_mode as QueueAccessMode;

    // Workspace-agents: any user with active agent membership can access
    if (accessMode === 'workspace-agents') {
      const { rows: memberRows } = await this.pool.query(
        `SELECT 1 FROM workspace_memberships
         WHERE user_id = $1 AND workspace_id = $2
           AND role = 'agent'
           AND status = 'active'
         LIMIT 1`,
        [userId, workspaceId],
      );
      return memberRows.length > 0;
    }

    // Restricted: explicit queue member OR workspace admin (S8)
    const isQueueMemberResult = await this.isQueueMember(queueId, userId);
    if (isQueueMemberResult) return true;

    // Workspace Admins always manage a restricted Queue regardless of membership (S8)
    const { rows: adminRows } = await this.pool.query(
      `SELECT 1 FROM workspace_memberships
       WHERE user_id = $1 AND workspace_id = $2
         AND role = 'workspace-admin'
       LIMIT 1`,
      [userId, workspaceId],
    );
    return adminRows.length > 0;
  }
}

// ---------------------------------------------------------------------------
// Internal row type
// ---------------------------------------------------------------------------

interface QueueRow {
  id: QueueId;
  workspace_id: WorkspaceId;
  name: string;
  access_mode: QueueAccessMode | string;
  created_at: string;
}