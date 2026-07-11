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
  TicketStatus,
} from '@ticketos/domain';
import type { UserId } from '@ticketos/shared';

export class PostgresTicket implements TicketModule {
  constructor(private pool: Pool) {}

  async createTicket(input: CreateTicketInput): Promise<Ticket> {
    const { rows } = await this.pool.query(
      `INSERT INTO tickets (workspace_id, title, description, status, priority, ticket_type_id, created_by, assigned_to, visibility, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
       RETURNING id, workspace_id, title, description, status, priority, ticket_type_id, created_by, assigned_to, visibility, created_at, updated_at`,
      [
        input.workspaceId,
        input.title,
        input.description ?? null,
        'backlog',
        input.priority ?? 'normal',
        input.ticketTypeId ?? null,
        input.createdBy,
        input.assignedTo ?? null,
        input.visibility ?? 'public',
      ],
    );
    return this.mapTicket(rows[0]!);
  }

  async getTicket(id: string): Promise<Ticket | null> {
    const { rows } = await this.pool.query(
      `SELECT id, workspace_id, title, description, status, priority, ticket_type_id, created_by, assigned_to, visibility, created_at, updated_at
       FROM tickets WHERE id = $1`,
      [id],
    );
    return rows.length === 0 ? null : this.mapTicket(rows[0]!);
  }

  async updateTicket(input: UpdateTicketInput): Promise<Ticket> {
    const sets: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (input.title !== undefined) { sets.push(`title = $${idx++}`); values.push(input.title); }
    if (input.description !== undefined) { sets.push(`description = $${idx++}`); values.push(input.description); }
    if (input.status !== undefined) { sets.push(`status = $${idx++}`); values.push(input.status); }
    if (input.priority !== undefined) { sets.push(`priority = $${idx++}`); values.push(input.priority); }
    if (input.ticketTypeId !== undefined) { sets.push(`ticket_type_id = $${idx++}`); values.push(input.ticketTypeId); }
    if (input.assignedTo !== undefined) { sets.push(`assigned_to = $${idx++}`); values.push(input.assignedTo); }
    if (input.visibility !== undefined) { sets.push(`visibility = $${idx++}`); values.push(input.visibility); }

    sets.push(`updated_at = NOW()`);
    values.push(input.id);

    const { rows } = await this.pool.query(
      `UPDATE tickets SET ${sets.join(', ')} WHERE id = $${idx}
       RETURNING id, workspace_id, title, description, status, priority, ticket_type_id, created_by, assigned_to, visibility, created_at, updated_at`,
      values,
    );
    return this.mapTicket(rows[0]!);
  }

  async deleteTicket(id: string): Promise<void> {
    await this.pool.query('DELETE FROM tickets WHERE id = $1', [id]);
  }

  async listTickets(workspaceId: string, filters?: {
    status?: TicketStatus;
    priority?: TicketPriority;
    assignedTo?: string | null;
    createdBy?: string;
    tags?: string[];
  }): Promise<Ticket[]> {
    let sql = `SELECT id, workspace_id, title, description, status, priority, ticket_type_id, created_by, assigned_to, visibility, created_at, updated_at
               FROM tickets WHERE workspace_id = $1`;
    const values: unknown[] = [workspaceId];
    let idx = 2;

    if (filters?.status) { sql += ` AND status = $${idx++}`; values.push(filters.status); }
    if (filters?.priority) { sql += ` AND priority = $${idx++}`; values.push(filters.priority); }
    if (filters?.assignedTo !== undefined) { sql += ` AND assigned_to = $${idx++}`; values.push(filters.assignedTo); }
    if (filters?.createdBy) { sql += ` AND created_by = $${idx++}`; values.push(filters.createdBy); }

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
   * Cancellation is terminal — the status becomes 'cancelled'.
   */
  async cancelTicket(ticketId: string, userId: UserId): Promise<Ticket> {
    // Verify the ticket exists and the user is the creator
    const existing = await this.getTicket(ticketId);
    if (!existing) {
      throw new Error(`Ticket not found: ${ticketId}`);
    }
    if (existing.createdBy !== userId) {
      throw new Error('Only the ticket creator can cancel this ticket');
    }
    if (existing.status === 'cancelled') {
      throw new Error('Ticket is already cancelled');
    }

    // Set terminal cancelled status
    const { rows } = await this.pool.query(
      `UPDATE tickets
       SET status = 'cancelled', cancelled_at = NOW(), cancelled_by = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING id, workspace_id, title, description, status, priority, ticket_type_id,
                 created_by, assigned_to, visibility, created_at, updated_at`,
      [userId, ticketId],
    );
    return this.mapTicket(rows[0]!);
  }

  // ---------------------------------------------------------------------------
  // Mappers
  // ---------------------------------------------------------------------------

  private mapTicket(row: any): Ticket {
    return {
      id: row.id,
      workspaceId: row.workspace_id,
      title: row.title,
      description: row.description,
      status: row.status as TicketStatus,
      priority: row.priority as TicketPriority,
      ticketTypeId: row.ticket_type_id,
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
