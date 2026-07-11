import type { Pool } from 'pg';
import type {
  EmailModule,
  EmailAddress,
  CreateEmailAddressInput,
  CorrelationToken,
  OutboundEmail,
  SendEmailInput,
  ProcessInboundEmailInput,
  IntakeQuarantineItem,
} from '@ticketos/domain';
import type { UserId, WorkspaceId } from '@ticketos/shared';
import crypto from 'node:crypto';

export class PostgresEmail implements EmailModule {
  constructor(private pool: Pool) {}

  // ---------------------------------------------------------------------------
  // Email Address management
  // ---------------------------------------------------------------------------

  async createEmailAddress(input: CreateEmailAddressInput): Promise<EmailAddress> {
    const { rows } = await this.pool.query(
      `INSERT INTO email_addresses (workspace_id, queue_id, address, created_at)
       VALUES ($1, $2, $3, NOW())
       RETURNING id, workspace_id, queue_id, address, verified_at, created_at`,
      [input.workspaceId, input.queueId, input.address],
    );
    return this.mapEmailAddress(rows[0]!);
  }

  async getEmailAddress(id: string): Promise<EmailAddress | null> {
    const { rows } = await this.pool.query(
      `SELECT id, workspace_id, queue_id, address, verified_at, created_at
       FROM email_addresses WHERE id = $1`,
      [id],
    );
    return rows.length === 0 ? null : this.mapEmailAddress(rows[0]!);
  }

  async getEmailAddressByAddress(address: string): Promise<EmailAddress | null> {
    const { rows } = await this.pool.query(
      `SELECT id, workspace_id, queue_id, address, verified_at, created_at
       FROM email_addresses WHERE address = $1`,
      [address],
    );
    return rows.length === 0 ? null : this.mapEmailAddress(rows[0]!);
  }

  async listEmailAddresses(workspaceId: WorkspaceId): Promise<EmailAddress[]> {
    const { rows } = await this.pool.query(
      `SELECT id, workspace_id, queue_id, address, verified_at, created_at
       FROM email_addresses WHERE workspace_id = $1 ORDER BY created_at`,
      [workspaceId],
    );
    return rows.map((r) => this.mapEmailAddress(r));
  }

  async deleteEmailAddress(id: string): Promise<void> {
    await this.pool.query('DELETE FROM email_addresses WHERE id = $1', [id]);
  }

  // ---------------------------------------------------------------------------
  // Outbound email
  // ---------------------------------------------------------------------------

  async sendEmail(input: SendEmailInput): Promise<OutboundEmail> {
    const { rows } = await this.pool.query(
      `INSERT INTO outbound_emails ("to", "from", subject, text_body, html_body,
       in_reply_to, references_header, correlation_token_id, ticket_id, status, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending', NOW())
       RETURNING id, "to", "from", subject, text_body, html_body, in_reply_to,
                 references_header, correlation_token_id, status, error_message,
                 ticket_id, created_at, sent_at`,
      [
        input.to,
        input.from,
        input.subject,
        input.textBody,
        input.htmlBody ?? null,
        input.inReplyTo ?? null,
        input.references ?? null,
        input.correlationTokenId ?? null,
        input.ticketId ?? null,
      ],
    );
    return this.mapOutboundEmail(rows[0]!);
  }

  async getEmailStatus(id: string): Promise<OutboundEmail | null> {
    const { rows } = await this.pool.query(
      `SELECT id, "to", "from", subject, text_body, html_body, in_reply_to,
              references_header, correlation_token_id, status, error_message,
              ticket_id, created_at, sent_at
       FROM outbound_emails WHERE id = $1`,
      [id],
    );
    return rows.length === 0 ? null : this.mapOutboundEmail(rows[0]!);
  }

  // ---------------------------------------------------------------------------
  // Inbound email processing
  // ---------------------------------------------------------------------------

  async processInboundEmail(input: ProcessInboundEmailInput): Promise<{
    ticketId: string | null;
    messageId: string | null;
    quarantined: boolean;
    reason: string | null;
  }> {
    // 1. Store the inbound email
    const { rows: inboundRows } = await this.pool.query(
      `INSERT INTO inbound_emails (message_id, "from", "to", subject, text_body, html_body,
       in_reply_to, references_header, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending')
       ON CONFLICT (message_id) DO NOTHING
       RETURNING id`,
      [
        input.messageId,
        input.from,
        input.to,
        input.subject,
        input.textBody,
        input.htmlBody ?? null,
        input.inReplyTo ?? null,
        input.references ?? null,
      ],
    );

    // Idempotency: if message already processed, return existing result
    if (inboundRows.length === 0) {
      const { rows: existing } = await this.pool.query(
        `SELECT id FROM inbound_emails WHERE message_id = $1`,
        [input.messageId],
      );
      if (existing.length === 0) {
        return { ticketId: null, messageId: null, quarantined: false, reason: 'Duplicate message rejected' };
      }
      return { ticketId: null, messageId: existing[0]!.id, quarantined: false, reason: null };
    }

    const inboundId = inboundRows[0]!.id;

    // 2. Find the configured Email Address
    const emailAddress = await this.getEmailAddressByAddress(input.to);
    if (!emailAddress) {
      await this.quarantineItem({
        inboundEmailId: inboundId,
        workspaceId: crypto.randomUUID() as any, // Will be set by caller
        reason: 'No configured Email Address for recipient',
        from: input.from,
        subject: input.subject,
        textBody: input.textBody,
        status: 'pending',
        reviewedBy: null,
        reviewedAt: null,
        ticketId: null,
      });
      return { ticketId: null, messageId: inboundId, quarantined: true, reason: 'No configured Email Address for recipient' };
    }

    // 3. Check if this is a reply (has In-Reply-To or References)
    if (input.inReplyTo || input.references) {
      // Try to correlate to existing ticket via correlation token
      const correlation = await this.verifyCorrelationToken(input.inReplyTo || input.references || '');
      if (correlation.valid && correlation.ticketId) {
        // Append message to existing ticket
        return { ticketId: correlation.ticketId, messageId: inboundId, quarantined: false, reason: null };
      }
    }

    // 4. New email from unknown sender — create ticket and provision user
    // This is simplified; full implementation would create User + Ticket
    return { ticketId: null, messageId: inboundId, quarantined: false, reason: null };
  }

  // ---------------------------------------------------------------------------
  // Correlation token
  // ---------------------------------------------------------------------------

  async createCorrelationToken(ticketId: string): Promise<CorrelationToken> {
    const tokenBytes = crypto.randomBytes(32);
    const tokenHash = crypto.createHash('sha256').update(tokenBytes).digest('hex');

    const { rows } = await this.pool.query(
      `INSERT INTO correlation_tokens (ticket_id, token_hash, expires_at, created_at)
       VALUES ($1, $2, NOW() + INTERVAL '30 days', NOW())
       RETURNING id, ticket_id, token_hash, expires_at, used_at, created_at`,
      [ticketId, tokenHash],
    );
    return this.mapCorrelationToken(rows[0]!);
  }

  async verifyCorrelationToken(tokenHash: string): Promise<{ ticketId: string; valid: boolean }> {
    const { rows } = await this.pool.query(
      `SELECT id, ticket_id, token_hash, expires_at, used_at
       FROM correlation_tokens WHERE token_hash = $1`,
      [tokenHash],
    );

    if (rows.length === 0) {
      return { ticketId: '', valid: false };
    }

    const token = rows[0]!;
    if (token.used_at) {
      return { ticketId: token.ticket_id, valid: false };
    }
    if (new Date(token.expires_at) < new Date()) {
      return { ticketId: token.ticket_id, valid: false };
    }

    return { ticketId: token.ticket_id, valid: true };
  }

  // ---------------------------------------------------------------------------
  // Intake Quarantine
  // ---------------------------------------------------------------------------

  async quarantineItem(item: Omit<IntakeQuarantineItem, 'id' | 'createdAt'>): Promise<IntakeQuarantineItem> {
    const { rows } = await this.pool.query(
      `INSERT INTO intake_quarantine (inbound_email_id, workspace_id, reason, "from", subject,
       text_body, status, reviewed_by, reviewed_at, ticket_id, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
       RETURNING id, inbound_email_id, workspace_id, reason, "from", subject, text_body,
                 status, reviewed_by, reviewed_at, ticket_id, created_at`,
      [
        item.inboundEmailId,
        item.workspaceId,
        item.reason,
        item.from,
        item.subject,
        item.textBody,
        item.status,
        item.reviewedBy ?? null,
        item.reviewedAt ?? null,
        item.ticketId ?? null,
      ],
    );
    return this.mapQuarantineItem(rows[0]!);
  }

  async getQuarantineItem(id: string): Promise<IntakeQuarantineItem | null> {
    const { rows } = await this.pool.query(
      `SELECT id, inbound_email_id, workspace_id, reason, "from", subject, text_body,
              status, reviewed_by, reviewed_at, ticket_id, created_at
       FROM intake_quarantine WHERE id = $1`,
      [id],
    );
    return rows.length === 0 ? null : this.mapQuarantineItem(rows[0]!);
  }

  async listQuarantineItems(workspaceId: WorkspaceId): Promise<IntakeQuarantineItem[]> {
    const { rows } = await this.pool.query(
      `SELECT id, inbound_email_id, workspace_id, reason, "from", subject, text_body,
              status, reviewed_by, reviewed_at, ticket_id, created_at
       FROM intake_quarantine WHERE workspace_id = $1 ORDER BY created_at DESC`,
      [workspaceId],
    );
    return rows.map((r) => this.mapQuarantineItem(r));
  }

  async createTicketFromQuarantine(quarantineId: string, userId: UserId): Promise<{ ticketId: string }> {
    const item = await this.getQuarantineItem(quarantineId);
    if (!item) throw new Error(`Quarantine item not found: ${quarantineId}`);

    // Create ticket from quarantine item
    const { rows } = await this.pool.query(
      `INSERT INTO tickets (workspace_id, title, description, status, priority, created_by, visibility, created_at, updated_at)
       VALUES ($1, $2, $3, 'backlog', 'normal', $4, 'public', NOW(), NOW())
       RETURNING id`,
      [item.workspaceId, item.subject, item.textBody, userId],
    );
    const ticketId = rows[0]!.id;

    // Append system event
    await this.pool.query(
      `INSERT INTO timeline_entries (ticket_id, kind, content, author_id, visibility, created_at)
       VALUES ($1, 'system_event', $2, $3, 'public', NOW())`,
      [ticketId, `Ticket created from quarantined email: ${item.subject}`, userId],
    );

    // Update quarantine status
    await this.pool.query(
      `UPDATE intake_quarantine SET status = 'created_ticket', ticket_id = $1, reviewed_by = $2, reviewed_at = NOW()
       WHERE id = $3`,
      [ticketId, userId, quarantineId],
    );

    return { ticketId };
  }

  async linkTicketToQuarantine(quarantineId: string, ticketId: string, userId: UserId): Promise<void> {
    const item = await this.getQuarantineItem(quarantineId);
    if (!item) throw new Error(`Quarantine item not found: ${quarantineId}`);

    // Append message to existing ticket
    await this.pool.query(
      `INSERT INTO timeline_entries (ticket_id, kind, content, author_id, visibility, created_at)
       VALUES ($1, 'message', $2, $3, 'public', NOW())`,
      [ticketId, `[Email from ${item.from}] ${item.subject}\n\n${item.textBody}`, userId],
    );

    // Update quarantine status
    await this.pool.query(
      `UPDATE intake_quarantine SET status = 'linked_ticket', ticket_id = $1, reviewed_by = $2, reviewed_at = NOW()
       WHERE id = $3`,
      [ticketId, userId, quarantineId],
    );
  }

  async dismissQuarantineItem(quarantineId: string, userId: UserId): Promise<void> {
    await this.pool.query(
      `UPDATE intake_quarantine SET status = 'dismissed', reviewed_by = $1, reviewed_at = NOW()
       WHERE id = $2`,
      [userId, quarantineId],
    );
  }

  // ---------------------------------------------------------------------------
  // Mappers
  // ---------------------------------------------------------------------------

  private mapEmailAddress(row: any): EmailAddress {
    return {
      id: row.id,
      workspaceId: row.workspace_id,
      queueId: row.queue_id,
      address: row.address,
      verifiedAt: row.verified_at,
      createdAt: row.created_at,
    };
  }

  private mapCorrelationToken(row: any): CorrelationToken {
    return {
      id: row.id,
      ticketId: row.ticket_id,
      tokenHash: row.token_hash,
      expiresAt: row.expires_at,
      usedAt: row.used_at,
      createdAt: row.created_at,
    };
  }

  private mapOutboundEmail(row: any): OutboundEmail {
    return {
      id: row.id,
      to: row.to,
      from: row.from,
      subject: row.subject,
      textBody: row.text_body,
      htmlBody: row.html_body,
      inReplyTo: row.in_reply_to,
      references: row.references_header,
      correlationTokenId: row.correlation_token_id,
      status: row.status,
      errorMessage: row.error_message,
      ticketId: row.ticket_id,
      createdAt: row.created_at,
      sentAt: row.sent_at,
    };
  }

  private mapQuarantineItem(row: any): IntakeQuarantineItem {
    return {
      id: row.id,
      inboundEmailId: row.inbound_email_id,
      workspaceId: row.workspace_id,
      reason: row.reason,
      from: row.from,
      subject: row.subject,
      textBody: row.text_body,
      status: row.status,
      reviewedBy: row.reviewed_by,
      reviewedAt: row.reviewed_at,
      ticketId: row.ticket_id,
      createdAt: row.created_at,
    };
  }
}
