import type { Pool } from 'pg';
import type {
  TicketModule,
  Ticket,
  CreateTicketInput,
  UpdateTicketInput,
  TicketTag,
  TicketFollower,
  TimelineEntry,
  TimelineEntryKind,
  TicketVisibility,
  TicketPriority,
  StatusCategory,
} from '@ticketos/domain';
import type { UserId } from '@ticketos/shared';
import {
  ConfigurationNotFoundError,
  ConfigurationValidationError,
} from '@ticketos/domain';

/**
 * A Status resolved from the Workspace's own configuration.
 *
 * S1/S2: the Ticket status model has exactly one source of truth — the
 * Workspace-configured `statuses` rows — so every write and read here works
 * with a Status id plus the resolved name/category of that row.
 */
export interface ResolvedTicketStatus {
  id: string;
  name: string;
  category: StatusCategory;
}

/**
 * Ticket read model columns. Every status read goes through the Workspace
 * configuration (`status_id` JOIN `statuses`), never through the legacy
 * `tickets.status` TEXT column (S1, S5).
 */
function mapStatusRow(row: { id: string; name: string; category: string }): ResolvedTicketStatus {
  return { id: row.id, name: row.name, category: row.category as StatusCategory };
}

/**
 * Resolve the Status a new Ticket starts in: the Workspace's default Status,
 * else the first active one by sort_order. Shared with email intake so the two
 * creation paths cannot drift apart (S1).
 */
export async function resolveDefaultStatus(
  pool: Pool,
  workspaceId: string,
): Promise<ResolvedTicketStatus> {
  const { rows } = await pool.query(
    `SELECT id, name, category FROM statuses
     WHERE workspace_id = $1 AND is_active = true
     ORDER BY is_default DESC, sort_order, id
     LIMIT 1`,
    [workspaceId],
  );
  const row = rows[0];
  if (!row) {
    throw new ConfigurationNotFoundError(
      'No active Status is configured in this Workspace; configure a Status before creating a Ticket',
    );
  }
  return mapStatusRow(row);
}

/**
 * Resolve the Status a cancelled Ticket moves to: the Workspace's active
 * `closed` category Status, default first, then sort_order.
 */
export async function resolveClosedStatus(
  pool: Pool,
  workspaceId: string,
): Promise<ResolvedTicketStatus> {
  const { rows } = await pool.query(
    `SELECT id, name, category FROM statuses
     WHERE workspace_id = $1 AND is_active = true AND category = 'closed'
     ORDER BY is_default DESC, sort_order, id
     LIMIT 1`,
    [workspaceId],
  );
  const row = rows[0];
  if (!row) {
    throw new ConfigurationNotFoundError(
      'No active closed Status is configured in this Workspace; configure a closed Status before cancelling a Ticket',
    );
  }
  return mapStatusRow(row);
}

/**
 * Validate an explicitly requested Status: it must exist, be active, and
 * belong to the Ticket's Workspace.
 */
async function resolveRequestedStatus(
  pool: Pool,
  workspaceId: string,
  statusId: string,
): Promise<ResolvedTicketStatus> {
  const { rows } = await pool.query(
    `SELECT id, name, category FROM statuses
     WHERE id = $1 AND workspace_id = $2 AND is_active = true`,
    [statusId, workspaceId],
  );
  const row = rows[0];
  if (!row) {
    throw new ConfigurationNotFoundError(
      'Status not found or inactive in this Workspace',
    );
  }
  return mapStatusRow(row);
}

/**
 * Enforce the Workspace's permitted Status changes (S2, S3).
 *
 * The rule, and why it is the rule:
 *
 * - A Workspace with **no** `transitions` rows has not configured transitions at
 *   all. Failing closed there would make every Ticket of a freshly provisioned
 *   Workspace unchangeable, so an unconfigured Workspace allows any *active*
 *   Status of that Workspace (fail-open **only** in this exact case). This is
 *   the rule `PostgresWorkflow.validateTransition` documents ("If no
 *   transitions are configured, all transitions are allowed"); that legacy
 *   helper is unused and its body disagrees with its own comment, so the rule
 *   is restated here rather than delegated to it.
 * - A Workspace with **at least one** `transitions` row has opted into explicit
 *   transition modelling, so only the listed (from → to) pairs are allowed
 *   (fail-closed). Removing every row returns the Workspace to unconfigured.
 *
 * The target Status has already been resolved as existing, active and
 * Workspace-scoped before this check, so an inactive Status is never reachable
 * through a listed transition either (S3).
 */
async function assertStatusTransitionAllowed(
  pool: Pool,
  workspaceId: string,
  fromStatusId: string,
  toStatusId: string,
): Promise<void> {
  // A no-op write (the requested Status is the current one) is not a
  // transition, and `transitions` never contains a self-transition.
  if (fromStatusId === toStatusId) return;

  const { rows } = await pool.query<{ configured: number; allowed: boolean }>(
    `SELECT (SELECT COUNT(*)::int FROM transitions WHERE workspace_id = $1) AS configured,
            EXISTS (
              SELECT 1 FROM transitions
               WHERE workspace_id = $1 AND from_status_id = $2 AND to_status_id = $3
            ) AS allowed`,
    [workspaceId, fromStatusId, toStatusId],
  );
  const row = rows[0];
  if (!row || row.configured === 0 || row.allowed) return;

  throw new ConfigurationValidationError(
    'Status transition not allowed in this Workspace: configure the transition from the current Status to the requested Status first',
    'transition-invalid',
  );
}

export class PostgresTicket implements TicketModule {
  constructor(private pool: Pool) {}

  async createTicket(input: CreateTicketInput): Promise<Ticket> {
    if (!input.ticketTypeId) {
      throw new Error('Ticket Type is required to create a Ticket');
    }
    if (!input.priorityId) {
      throw new Error('Ticket Priority is required to create a Ticket');
    }

    // Validate Ticket Type belongs to this Workspace and is active
    const { rows: typeRows } = await this.pool.query(
      `SELECT id FROM ticket_types
       WHERE id = $1 AND workspace_id = $2 AND is_active = true`,
      [input.ticketTypeId, input.workspaceId],
    );
    if (typeRows.length === 0) {
      throw new ConfigurationNotFoundError(
        'Ticket Type not found or inactive in this Workspace',
      );
    }

    // Validate Priority belongs to this Workspace and is active
    const { rows: prioRows } = await this.pool.query(
      `SELECT id FROM priorities
       WHERE id = $1 AND workspace_id = $2 AND is_active = true`,
      [input.priorityId, input.workspaceId],
    );
    if (prioRows.length === 0) {
      throw new ConfigurationNotFoundError(
        'Priority not found or inactive in this Workspace',
      );
    }
    // S1/S2: the Status is Workspace configuration, not a hard-coded enum
    // value. An explicit statusId is validated against the Workspace; without
    // one the Workspace default (else first by sort_order) is used. A
    // Workspace with no active Status cannot create Tickets.
    const status = input.statusId
      ? await resolveRequestedStatus(this.pool, input.workspaceId, input.statusId)
      : await resolveDefaultStatus(this.pool, input.workspaceId);

    // ADR 0010: exactly one active Queue per Ticket. Resolve the target Queue
    // explicitly so a Ticket never lands unrouted with queue_id NULL, which
    // makes it invisible to every Queue view.
    let queueId = input.queueId ?? null;
    if (queueId) {
      const { rows: qRows } = await this.pool.query(
        `SELECT id FROM queues WHERE id = $1 AND workspace_id = $2`,
        [queueId, input.workspaceId],
      );
      if (qRows.length === 0) {
        throw new ConfigurationNotFoundError('Queue not found in this Workspace');
      }
    } else {
      const { rows: qRows } = await this.pool.query<{ id: string }>(
        `SELECT id FROM queues WHERE workspace_id = $1 ORDER BY created_at LIMIT 1`,
        [input.workspaceId],
      );
      queueId = qRows[0]?.id ?? null;
    }

    // NOTE (S1): `tickets.status` is the pre-convergence TEXT column. It is
    // deliberately NOT written here: it is constrained by migration 004 to the
    // retired enum values, so writing the configured Status name would either
    // fail the CHECK or introduce a second source of truth. `status_id` is
    // authoritative and the legacy column is left at its DEFAULT until a later
    // additive migration removes it.
    const { rows } = await this.pool.query<{ id: string }>(
      `INSERT INTO tickets (workspace_id, title, description, status_id, priority, ticket_type_id, priority_id, queue_id, created_by, assigned_to, visibility, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW())
       RETURNING id`,
      [
        input.workspaceId,
        input.title,
        input.description ?? null,
        status.id,
        input.priority ?? 'normal',
        input.ticketTypeId,
        input.priorityId,
        queueId,
        input.createdBy,
        input.assignedTo ?? null,
        input.visibility ?? 'public',
      ],
    );

    const created = await this.getTicket(input.workspaceId, rows[0]!.id);
    if (!created) {
      throw new Error('Ticket was not readable after creation');
    }
    return created;
  }

  async getTicket(workspaceId: string, id: string): Promise<Ticket | null> {
    // The Status is resolved from configuration, so a Ticket always carries
    // the configured name and canonical category (S1, S5).
    const { rows } = await this.pool.query(
      `SELECT t.id, t.workspace_id, t.title, t.description,
              t.status_id, s.name AS status_name, s.category AS status_category,
              t.priority, t.ticket_type_id, t.priority_id, t.created_by,
              t.assigned_to, t.visibility, t.created_at, t.updated_at
         FROM tickets t
         JOIN statuses s ON s.id = t.status_id
        WHERE t.workspace_id = $1 AND t.id = $2`,
      [workspaceId, id],
    );
    return rows.length === 0 ? null : this.mapTicket(rows[0]!);
  }

  async updateTicket(input: UpdateTicketInput): Promise<Ticket> {
    const sets: string[] = [];
    const values: unknown[] = [];
    let idx = 1;
    // S2: recorded on the Timeline once the Status change is applied.
    let statusChange: { from: string; to: string } | null = null;

    if (input.title !== undefined) { sets.push(`title = $${idx++}`); values.push(input.title); }
    if (input.description !== undefined) { sets.push(`description = $${idx++}`); values.push(input.description); }
    // S2: a status change goes through the Workspace-configured Status id. The
    // Status must exist, be active, and belong to the Ticket's own Workspace,
    // and the change must be permitted by the Workspace's `transitions` rows.
    if (input.statusId !== undefined) {
      const { rows: currentRows } = await this.pool.query<{
        workspace_id: string;
        status_id: string;
        status_name: string;
      }>(
        `SELECT t.workspace_id, t.status_id, s.name AS status_name
           FROM tickets t
           JOIN statuses s ON s.id = t.status_id
          WHERE t.id = $1`,
        [input.id],
      );
      const current = currentRows[0];
      if (!current) {
        throw new Error(`Ticket not found: ${input.id}`);
      }
      const status = await resolveRequestedStatus(this.pool, current.workspace_id, input.statusId);
      await assertStatusTransitionAllowed(
        this.pool,
        current.workspace_id,
        current.status_id,
        status.id,
      );
      if (status.id !== current.status_id) {
        statusChange = { from: current.status_name, to: status.name };
      }
      sets.push(`status_id = $${idx++}`);
      values.push(status.id);
    }
    if (input.priority !== undefined) { sets.push(`priority = $${idx++}`); values.push(input.priority); }
    if (input.priorityId !== undefined) { sets.push(`priority_id = $${idx++}`); values.push(input.priorityId); }
    if (input.ticketTypeId !== undefined) { sets.push(`ticket_type_id = $${idx++}`); values.push(input.ticketTypeId); }
    if (input.assignedTo !== undefined) { sets.push(`assigned_to = $${idx++}`); values.push(input.assignedTo); }
    if (input.visibility !== undefined) { sets.push(`visibility = $${idx++}`); values.push(input.visibility); }

    sets.push(`updated_at = NOW()`);
    values.push(input.id);

    const { rows } = await this.pool.query<{ id: string }>(
      `UPDATE tickets SET ${sets.join(', ')} WHERE id = $${idx} RETURNING id`,
      values,
    );
    const updated = await this.getTicketById(rows[0]!.id);
    if (!updated) {
      throw new Error(`Ticket not found: ${input.id}`);
    }

    // S2: an applied Status change is an immutable Timeline entry, mirroring
    // the `system_event` entries other Ticket mutations append.
    if (statusChange) {
      await this.appendTimelineEntry({
        ticketId: updated.id,
        kind: 'status_change',
        content: `Status changed from ${statusChange.from} to ${statusChange.to}`,
        authorId: null,
        visibility: 'public',
      });
    }

    return updated;
  }

  async deleteTicket(workspaceId: string, id: string): Promise<void> {
    await this.pool.query(
      'DELETE FROM tickets WHERE workspace_id = $1 AND id = $2',
      [workspaceId, id],
    );
  }

  async listTickets(workspaceId: string, filters?: {
    statusId?: string;
    priority?: TicketPriority;
    assignedTo?: string | null;
    createdBy?: string;
    tags?: string[];
  }): Promise<Ticket[]> {
    let sql = `SELECT t.id, t.workspace_id, t.title, t.description,
                      t.status_id, s.name AS status_name, s.category AS status_category,
                      t.priority, t.ticket_type_id, t.priority_id, t.created_by,
                      t.assigned_to, t.visibility, t.created_at, t.updated_at
                 FROM tickets t
                 JOIN statuses s ON s.id = t.status_id
                WHERE t.workspace_id = $1`;
    const values: unknown[] = [workspaceId];
    let idx = 2;

    if (filters?.statusId) { sql += ` AND t.status_id = $${idx++}`; values.push(filters.statusId); }
    if (filters?.priority) { sql += ` AND t.priority = $${idx++}`; values.push(filters.priority); }
    if (filters?.assignedTo !== undefined) { sql += ` AND t.assigned_to = $${idx++}`; values.push(filters.assignedTo); }
    if (filters?.createdBy) { sql += ` AND t.created_by = $${idx++}`; values.push(filters.createdBy); }

    const { rows } = await this.pool.query(sql, values);
    return rows.map((r) => this.mapTicket(r));
  }

  // ---------------------------------------------------------------------------
  // Tags
  // ---------------------------------------------------------------------------

  async addTag(ticketId: string, name: string): Promise<TicketTag> {
    const { rows } = await this.pool.query(
      `INSERT INTO ticket_tags (ticket_id, name) VALUES ($1, $2)
       RETURNING id, ticket_id, name, created_at`,
      [ticketId, name],
    );
    return { id: rows[0]!.id, ticketId: rows[0]!.ticket_id, name: rows[0]!.name };
  }

  async removeTag(ticketId: string, tagId: string): Promise<void> {
    await this.pool.query('DELETE FROM ticket_tags WHERE id = $1 AND ticket_id = $2', [tagId, ticketId]);
  }

  async getTags(ticketId: string): Promise<TicketTag[]> {
    const { rows } = await this.pool.query(
      `SELECT id, ticket_id, name FROM ticket_tags WHERE ticket_id = $1 ORDER BY created_at`,
      [ticketId],
    );
    return rows.map((r) => ({ id: r.id, ticketId: r.ticket_id, name: r.name }));
  }

  // ---------------------------------------------------------------------------
  // Followers
  // ---------------------------------------------------------------------------

  async addFollower(ticketId: string, userId: string): Promise<TicketFollower> {
    const { rows } = await this.pool.query(
      `INSERT INTO ticket_followers (ticket_id, user_id) VALUES ($1, $2)
       RETURNING id, ticket_id, user_id`,
      [ticketId, userId],
    );
    return { id: rows[0]!.id, ticketId: rows[0]!.ticket_id, userId: rows[0]!.user_id };
  }

  async removeFollower(ticketId: string, userId: string): Promise<void> {
    await this.pool.query('DELETE FROM ticket_followers WHERE ticket_id = $1 AND user_id = $2', [ticketId, userId]);
  }

  async getFollowers(ticketId: string): Promise<TicketFollower[]> {
    const { rows } = await this.pool.query(
      `SELECT id, ticket_id, user_id FROM ticket_followers WHERE ticket_id = $1 ORDER BY created_at`,
      [ticketId],
    );
    return rows.map((r) => ({ id: r.id, ticketId: r.ticket_id, userId: r.user_id }));
  }

  // ---------------------------------------------------------------------------
  // Timeline (append-only, immutable)
  // ---------------------------------------------------------------------------

  async appendTimelineEntry(entry: Omit<TimelineEntry, 'id' | 'createdAt'>): Promise<TimelineEntry> {
    const { rows } = await this.pool.query(
      `INSERT INTO timeline_entries (ticket_id, kind, content, author_id, visibility, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       RETURNING id, ticket_id, kind, content, author_id, visibility, created_at`,
      [entry.ticketId, entry.kind, entry.content, entry.authorId ?? null, entry.visibility ?? 'public'],
    );
    return this.mapTimelineEntry(rows[0]!);
  }

  async getTimeline(ticketId: string, options?: {
    kind?: TimelineEntryKind;
    visibility?: TicketVisibility;
    limit?: number;
  }): Promise<TimelineEntry[]> {
    let sql = `SELECT id, ticket_id, kind, content, author_id, visibility, created_at,
               redacted_content, redacted_at, redacted_by, redact_reason
               FROM timeline_entries WHERE ticket_id = $1 AND redacted_at IS NULL`;
    const values: unknown[] = [ticketId];
    let idx = 2;

    if (options?.kind) { sql += ` AND kind = $${idx++}`; values.push(options.kind); }
    if (options?.visibility) { sql += ` AND visibility = $${idx++}`; values.push(options.visibility); }

    sql += ` ORDER BY created_at ASC`;
    if (options?.limit) { sql += ` LIMIT $${idx++}`; values.push(options.limit); }

    const { rows } = await this.pool.query(sql, values);
    return rows.map((r) => this.mapTimelineEntry(r));
  }

  /**
   * Redact a Timeline entry: save original content, replace with reason,
   * mark as redacted. The entry remains in the DB for audit but is
   * filtered out from normal getTimeline reads.
   */
  async redactTimelineEntry(entryId: string, reason: string, authorId: UserId): Promise<TimelineEntry> {
    // First, fetch the current entry to save original content
    const { rows: current } = await this.pool.query(
      `SELECT id, ticket_id, kind, content, author_id, visibility, created_at
       FROM timeline_entries WHERE id = $1`,
      [entryId],
    );
    if (current.length === 0) {
      throw new Error(`Timeline entry not found: ${entryId}`);
    }
    const original = current[0]!;

    // Update the entry: save original content, replace with redaction reason
    const { rows } = await this.pool.query(
      `UPDATE timeline_entries
       SET content = $1,
           redacted_content = $2,
           redacted_at = NOW(),
           redacted_by = $3,
           redact_reason = $4
       WHERE id = $5
       RETURNING id, ticket_id, kind, content, author_id, visibility, created_at`,
      [`[REDACTED] ${reason}`, original.content, authorId, reason, entryId],
    );
    return this.mapTimelineEntry(rows[0]!);
  }

  /**
   * Cancel a ticket. Only the ticket creator can cancel their own ticket.
   * Cancellation is terminal: the Ticket moves to the Workspace's `closed`
   * category Status (S5) instead of a hard-coded status string.
   */
  async cancelTicket(workspaceId: string, ticketId: string, userId: UserId): Promise<Ticket> {
    // Verify the ticket exists and the user is the creator
    const existing = await this.getTicket(workspaceId, ticketId);
    if (!existing) {
      throw new Error(`Ticket not found: ${ticketId}`);
    }
    if (existing.createdBy !== userId) {
      throw new Error('Only the ticket creator can cancel this ticket');
    }
    if (existing.statusCategory === 'closed') {
      throw new Error('Ticket is already cancelled');
    }

    // Terminal Status comes from the Workspace configuration, not an enum.
    const closedStatus = await resolveClosedStatus(this.pool, workspaceId);

    const { rows } = await this.pool.query<{ id: string }>(
      `UPDATE tickets
       SET status_id = $1, cancelled_at = NOW(), cancelled_by = $2, updated_at = NOW()
       WHERE id = $3
       RETURNING id`,
      [closedStatus.id, userId, ticketId],
    );
    const cancelled = await this.getTicketById(rows[0]!.id);
    if (!cancelled) {
      throw new Error(`Ticket not found: ${ticketId}`);
    }
    return cancelled;
  }

  // ---------------------------------------------------------------------------
  // Mappers
  // ---------------------------------------------------------------------------

  private async getTicketById(id: string): Promise<Ticket | null> {
    const { rows } = await this.pool.query(
      `SELECT t.id, t.workspace_id, t.title, t.description,
              t.status_id, s.name AS status_name, s.category AS status_category,
              t.priority, t.ticket_type_id, t.priority_id, t.created_by,
              t.assigned_to, t.visibility, t.created_at, t.updated_at
         FROM tickets t
         JOIN statuses s ON s.id = t.status_id
        WHERE t.id = $1`,
      [id],
    );
    return rows.length === 0 ? null : this.mapTicket(rows[0]!);
  }

  private mapTicket(row: any): Ticket {
    return {
      id: row.id,
      workspaceId: row.workspace_id,
      title: row.title,
      description: row.description,
      statusId: row.status_id,
      statusName: row.status_name,
      statusCategory: row.status_category as StatusCategory,
      priority: row.priority as TicketPriority,
      ticketTypeId: row.ticket_type_id,
      priorityId: row.priority_id,
      createdBy: row.created_by,
      assignedTo: row.assigned_to,
      visibility: row.visibility as TicketVisibility,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private mapTimelineEntry(row: any): TimelineEntry {
    return {
      id: row.id,
      ticketId: row.ticket_id,
      kind: row.kind as TimelineEntryKind,
      content: row.content,
      authorId: row.author_id,
      visibility: row.visibility as TicketVisibility,
      createdAt: row.created_at,
    };
  }
}
