// ---------------------------------------------------------------------------
// Email domain interfaces (P0-07)
// ---------------------------------------------------------------------------

import type { UserId, WorkspaceId, QueueId } from '@ticketos/shared';

// ---------------------------------------------------------------------------
// Email Address — configured inbound address for a Workspace/Queue
// ---------------------------------------------------------------------------

export interface EmailAddress {
  id: string;
  workspaceId: WorkspaceId;
  queueId: QueueId;
  address: string;         // e.g. "support@example.com"
  verifiedAt: string | null;
  createdAt: string;
}

export interface CreateEmailAddressInput {
  workspaceId: WorkspaceId;
  queueId: QueueId;
  address: string;
}

// ---------------------------------------------------------------------------
// Correlation Token — signed, expiring token for email reply threading
// ---------------------------------------------------------------------------

export interface CorrelationToken {
  id: string;
  ticketId: string;
  tokenHash: string;
  expiresAt: string;
  usedAt: string | null;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Outbound Email — email to be sent via SMTP
// ---------------------------------------------------------------------------

export interface OutboundEmail {
  id: string;
  to: string;
  from: string;
  subject: string;
  textBody: string;
  htmlBody: string | null;
  inReplyTo: string | null;    // Message-ID for threading
  references: string | null;   // References header for threading
  correlationTokenId: string | null;
  status: 'pending' | 'sent' | 'failed';
  errorMessage: string | null;
  ticketId: string | null;
  createdAt: string;
  sentAt: string | null;
}

export interface SendEmailInput {
  to: string;
  from: string;
  subject: string;
  textBody: string;
  htmlBody?: string | null;
  inReplyTo?: string | null;
  references?: string | null;
  correlationTokenId?: string | null;
  ticketId?: string | null;
}

// ---------------------------------------------------------------------------
// Inbound Email — email received via IMAP
// ---------------------------------------------------------------------------

export interface InboundEmail {
  id: string;
  messageId: string;         // Original Message-ID header
  from: string;
  to: string;                // The configured Email Address
  subject: string;
  textBody: string;
  htmlBody: string | null;
  inReplyTo: string | null;  // For threading
  references: string | null;
  receivedAt: string;
  processedAt: string | null;
  status: 'pending' | 'processed' | 'quarantined' | 'failed';
  errorMessage: string | null;
}

export interface ProcessInboundEmailInput {
  messageId: string;
  from: string;
  to: string;
  subject: string;
  textBody: string;
  htmlBody?: string | null;
  inReplyTo?: string | null;
  references?: string | null;
}

// ---------------------------------------------------------------------------
// Intake Quarantine — restricted review for unsafe inbound email
// ---------------------------------------------------------------------------

export interface IntakeQuarantineItem {
  id: string;
  inboundEmailId: string;
  workspaceId: WorkspaceId;
  reason: string;            // Why it was quarantined
  from: string;
  subject: string;
  textBody: string;
  status: 'pending' | 'created_ticket' | 'linked_ticket' | 'dismissed';
  reviewedBy: UserId | null;
  reviewedAt: string | null;
  ticketId: string | null;   // Ticket created/linked from quarantine
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Email module seam
// ---------------------------------------------------------------------------

export interface EmailModule {
  // Email Address management
  createEmailAddress(input: CreateEmailAddressInput): Promise<EmailAddress>;
  getEmailAddress(id: string): Promise<EmailAddress | null>;
  getEmailAddressByAddress(address: string): Promise<EmailAddress | null>;
  listEmailAddresses(workspaceId: WorkspaceId): Promise<EmailAddress[]>;
  deleteEmailAddress(id: string): Promise<void>;

  // Outbound email
  sendEmail(input: SendEmailInput): Promise<OutboundEmail>;
  getEmailStatus(id: string): Promise<OutboundEmail | null>;

  // Inbound email processing
  processInboundEmail(input: ProcessInboundEmailInput): Promise<{
    ticketId: string | null;
    messageId: string | null;
    quarantined: boolean;
    reason: string | null;
  }>;

  // Correlation token
  createCorrelationToken(ticketId: string): Promise<CorrelationToken>;
  verifyCorrelationToken(tokenHash: string): Promise<{ ticketId: string; valid: boolean }>;

  // Intake Quarantine
  quarantineItem(item: Omit<IntakeQuarantineItem, 'id' | 'createdAt'>): Promise<IntakeQuarantineItem>;
  getQuarantineItem(id: string): Promise<IntakeQuarantineItem | null>;
  listQuarantineItems(workspaceId: WorkspaceId): Promise<IntakeQuarantineItem[]>;
  createTicketFromQuarantine(quarantineId: string, userId: UserId): Promise<{ ticketId: string }>;
  linkTicketToQuarantine(quarantineId: string, ticketId: string, userId: UserId): Promise<void>;
  dismissQuarantineItem(quarantineId: string, userId: UserId): Promise<void>;
}
