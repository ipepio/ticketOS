import type { Pool } from 'pg';
import crypto from 'node:crypto';
import type {
  AuditModule,
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
// Workspace administration read models
// ---------------------------------------------------------------------------

/**
 * One Organization with its member count, as the Workspace Admin API lists it.
 *
 * These read models exist so the route layer never assembles SQL rows: the
 * admin endpoints are a plain read/write of Workspace data, and their shapes
 * are mirrored structurally in `routes/dependencies.ts` (a route must not
 * import a SQL adapter).
 */
export interface OrganizationSummary {
  id: string;
  name: string;
  memberCount: number;
  createdAt: string;
}

/** One Workspace Membership with the User and Organization context it joins. */
export interface WorkspaceMemberSummary {
  id: string;
  userId: string;
  email: string;
  name: string | null;
  role: Role;
  status: string;
  organizationId: string | null;
  organizationName: string | null;
  lastSeenAt: string | null;
  createdAt: string;
}

/** The input the first-run wizard supplies to `bootstrapInstallation`. */
export interface BootstrapInstallationInput {
  workspaceName: string;
  adminEmail: string;
  timezone?: string;
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

  // ---------------------------------------------------------------------------
  // Workspace administration (routes/admin.ts delegates here)
  // ---------------------------------------------------------------------------

  /** Organizations of one Workspace with their member count. */
  async listOrganizationSummaries(
    workspaceId: WorkspaceId,
  ): Promise<OrganizationSummary[]> {
    const { rows } = await this.pool.query(
      `SELECT o.id, o.name, o.created_at,
              count(wm.id)::int AS member_count
       FROM organizations o
       LEFT JOIN workspace_memberships wm ON wm.organization_id = o.id
       WHERE o.workspace_id = $1
       GROUP BY o.id
       ORDER BY o.name`,
      [workspaceId],
    );
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      memberCount: row.member_count,
      createdAt: row.created_at,
    }));
  }

  /** Create one Organization; it has no members yet. */
  async createOrganizationSummary(
    workspaceId: WorkspaceId,
    name: string,
  ): Promise<OrganizationSummary> {
    const { rows } = await this.pool.query(
      `INSERT INTO organizations (workspace_id, name)
       VALUES ($1, $2) RETURNING id, name, created_at`,
      [workspaceId, name],
    );
    return {
      id: rows[0]!.id,
      name: rows[0]!.name,
      memberCount: 0,
      createdAt: rows[0]!.created_at,
    };
  }

  /** Members of one Workspace with the User and Organization context they join. */
  async listWorkspaceMemberSummaries(
    workspaceId: WorkspaceId,
  ): Promise<WorkspaceMemberSummary[]> {
    const { rows } = await this.pool.query(
      `SELECT wm.id, u.id AS user_id, u.email, u.display_name, wm.role,
              wm.status, wm.organization_id, o.name AS organization_name,
              u.last_seen_at, wm.created_at
       FROM workspace_memberships wm
       JOIN users u ON u.id = wm.user_id
       LEFT JOIN organizations o ON o.id = wm.organization_id
       WHERE wm.workspace_id = $1
       ORDER BY u.email`,
      [workspaceId],
    );
    return rows.map((row) => ({
      id: row.id,
      userId: row.user_id,
      email: row.email,
      name: row.display_name,
      role: row.role as Role,
      status: row.status,
      organizationId: row.organization_id,
      organizationName: row.organization_name,
      lastSeenAt: row.last_seen_at,
      createdAt: row.created_at,
    }));
  }

  /**
   * Add (or reactivate) one Workspace Member.
   *
   * The User and the Membership are written in one transaction, so a failed
   * insert never leaves a User without a role in the Workspace that created it.
   */
  async addWorkspaceMember(
    workspaceId: WorkspaceId,
    input: { email: string; name: string | null; role: Role; organizationId: string | null },
  ): Promise<{ id: string }> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const { rows: users } = await client.query(
        `INSERT INTO users (email, display_name)
         VALUES ($1, $2)
         ON CONFLICT (email) DO UPDATE SET display_name = COALESCE(EXCLUDED.display_name, users.display_name)
         RETURNING id`,
        [input.email, input.name],
      );
      const { rows } = await client.query(
        `INSERT INTO workspace_memberships (user_id, workspace_id, role, organization_id, status)
         VALUES ($1, $2, $3, $4, 'active')
         ON CONFLICT (user_id, workspace_id) DO UPDATE
         SET role = EXCLUDED.role, organization_id = EXCLUDED.organization_id, status = 'active'
         RETURNING id`,
        [users[0]!.id, workspaceId, input.role, input.organizationId],
      );
      await client.query('COMMIT');
      return { id: rows[0]!.id };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Update one Workspace Membership.
   *
   * `hasOrganizationId` mirrors the request body's ownership of the field: the
   * SQL only touches `organization_id` when the caller supplied it, so an empty
   * Organization stays `NULL` instead of being overwritten.
   */
  async updateWorkspaceMember(
    workspaceId: WorkspaceId,
    membershipId: string,
    input: {
      role?: Role;
      hasOrganizationId: boolean;
      organizationId?: string | null;
      status?: 'active' | 'inactive';
    },
  ): Promise<{ id: string } | null> {
    const { rows } = await this.pool.query(
      `UPDATE workspace_memberships
       SET role = COALESCE($1, role),
           organization_id = CASE WHEN $2::boolean THEN $3::uuid ELSE organization_id END,
           status = COALESCE($4, status)
       WHERE id = $5 AND workspace_id = $6
       RETURNING id`,
      [
        input.role ?? null,
        input.hasOrganizationId,
        input.organizationId ?? null,
        input.status ?? null,
        membershipId,
        workspaceId,
      ],
    );
    if (!rows[0]) return null;
    return { id: rows[0].id };
  }

  // ---------------------------------------------------------------------------
  // Installation bootstrap (routes/setup.ts delegates here)
  // ---------------------------------------------------------------------------

  /** How many Workspaces exist. The installation is configured once `> 0`. */
  async countWorkspaces(): Promise<number> {
    const { rows } = await this.pool.query(
      'SELECT count(*)::int AS count FROM workspaces',
    );
    return rows[0]?.count ?? 0;
  }

  /**
   * Create the first Workspace, its installing admin and the seeded
   * configuration, and issue the admin's session — in one transaction.
   *
   * Every statement keeps the order and shape the first-run wizard relied on:
   * the Workspace, the verified User, the admin Membership, the Inbox Queue,
   * the default Statuses, Priorities, Ticket Types, business calendar, session
   * row and audit event. The audit event is appended through the audit module
   * exactly where the route used to append it.
   */
  async bootstrapInstallation(
    input: BootstrapInstallationInput,
    audit: AuditModule,
  ): Promise<{ workspaceId: string; sessionId: string }> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // 1. Create workspace
      const { rows: wsRows } = await client.query(
        'INSERT INTO workspaces (name) VALUES ($1) RETURNING id',
        [input.workspaceName],
      );
      const workspaceId = wsRows[0]!.id;

      // 2. Create user
      const { rows: userRows } = await client.query(
        'INSERT INTO users (email, verified_at) VALUES ($1, NOW()) RETURNING id',
        [input.adminEmail],
      );
      const userId = userRows[0]!.id;

      // 3. Create membership as workspace-admin (includes all capabilities)
      await client.query(
        `INSERT INTO workspace_memberships (user_id, workspace_id, role)
         VALUES ($1, $2, 'workspace-admin')`,
        [userId, workspaceId],
      );

      // 4. Create default Inbox queue
      await client.query(
        `INSERT INTO queues (workspace_id, name, access_mode)
         VALUES ($1, 'Inbox', 'workspace-agents')`,
        [workspaceId],
      );

      // 5. Provision defaults (statuses, priorities, ticket types)
      const defaultStatuses = [
        { name: 'New', category: 'new', sortOrder: 1 },
        { name: 'Open', category: 'open', sortOrder: 2 },
        { name: 'Pending', category: 'pending', sortOrder: 3 },
        { name: 'Resolved', category: 'resolved', sortOrder: 4 },
        { name: 'Closed', category: 'closed', sortOrder: 5 },
      ];
      for (const s of defaultStatuses) {
        await client.query(
          `INSERT INTO statuses (workspace_id, name, category, sort_order, is_default)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT DO NOTHING`,
          [workspaceId, s.name, s.category, s.sortOrder, s.name === 'New'],
        );
      }

      const defaultPriorities = [
        { name: 'critical', sortOrder: 1 },
        { name: 'high', sortOrder: 2 },
        { name: 'normal', sortOrder: 3 },
        { name: 'low', sortOrder: 4 },
      ];
      for (const p of defaultPriorities) {
        await client.query(
          `INSERT INTO priorities (workspace_id, name, sort_order, is_default)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT DO NOTHING`,
          [workspaceId, p.name, p.sortOrder, p.name === 'normal'],
        );
      }

      await client.query(
        `INSERT INTO ticket_types (workspace_id, name, category, sort_order, is_default)
         VALUES ($1, 'Incident', 'incident', 1, true),
                ($1, 'Service Request', 'service-request', 2, false)
         ON CONFLICT DO NOTHING`,
        [workspaceId],
      );

      // 6. Create default business calendar
      await client.query(
        `INSERT INTO business_calendars (workspace_id, name, timezone, is_default, working_hours)
         VALUES ($1, 'Default 9x5', $2, true, $3)
         ON CONFLICT DO NOTHING`,
        [
          workspaceId,
          input.timezone ?? 'UTC',
          JSON.stringify([
            { day: 'mon', startMinute: 480, endMinute: 1020 },
            { day: 'tue', startMinute: 480, endMinute: 1020 },
            { day: 'wed', startMinute: 480, endMinute: 1020 },
            { day: 'thu', startMinute: 480, endMinute: 1020 },
            { day: 'fri', startMinute: 480, endMinute: 1020 },
          ]),
        ],
      );

      // 7. Create session directly for immediate login
      const sessionId = crypto.randomUUID();
      await client.query(
        `INSERT INTO sessions (id, user_id, workspace_id, data, expires_at)
         VALUES ($1, $2, $3, '{}', NOW() + INTERVAL '30 days')`,
        [sessionId, userId, workspaceId],
      );

      // 8. Audit
      await audit.append({
        kind: 'workspace-created',
        actorUserId: userId,
        workspaceId,
        details: { name: input.workspaceName, email: input.adminEmail },
      });

      await client.query('COMMIT');

      return { workspaceId, sessionId };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
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