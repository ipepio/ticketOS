-- P0-07: Inbound/outbound email and Intake Quarantine

-- Email Addresses — configured inbound addresses for Workspace/Queue routing
CREATE TABLE IF NOT EXISTS email_addresses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    queue_id UUID NOT NULL REFERENCES queues(id) ON DELETE CASCADE,
    address TEXT NOT NULL,
    verified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(workspace_id, address)
);

CREATE INDEX IF NOT EXISTS idx_email_addresses_workspace ON email_addresses (workspace_id);
CREATE INDEX IF NOT EXISTS idx_email_addresses_address ON email_addresses (address);

-- Correlation Tokens — signed, expiring tokens for email reply threading
CREATE TABLE IF NOT EXISTS correlation_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_correlation_tokens_ticket ON correlation_tokens (ticket_id);
CREATE INDEX IF NOT EXISTS idx_correlation_tokens_hash ON correlation_tokens (token_hash);

-- Outbound Emails — email to be sent via SMTP
CREATE TABLE IF NOT EXISTS outbound_emails (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "to" TEXT NOT NULL,
    "from" TEXT NOT NULL,
    subject TEXT NOT NULL,
    text_body TEXT NOT NULL,
    html_body TEXT,
    in_reply_to TEXT,
    references_header TEXT,
    correlation_token_id UUID REFERENCES correlation_tokens(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
    error_message TEXT,
    ticket_id UUID REFERENCES tickets(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    sent_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_outbound_emails_status ON outbound_emails (status);
CREATE INDEX IF NOT EXISTS idx_outbound_emails_ticket ON outbound_emails (ticket_id);

-- Inbound Emails — email received via IMAP
CREATE TABLE IF NOT EXISTS inbound_emails (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id TEXT NOT NULL UNIQUE,
    "from" TEXT NOT NULL,
    "to" TEXT NOT NULL,
    subject TEXT NOT NULL,
    text_body TEXT NOT NULL,
    html_body TEXT,
    in_reply_to TEXT,
    references_header TEXT,
    received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processed_at TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processed', 'quarantined', 'failed')),
    error_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_inbound_emails_status ON inbound_emails (status);
CREATE INDEX IF NOT EXISTS idx_inbound_emails_message ON inbound_emails (message_id);

-- Intake Quarantine — restricted review for unsafe inbound email
CREATE TABLE IF NOT EXISTS intake_quarantine (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    inbound_email_id UUID NOT NULL REFERENCES inbound_emails(id) ON DELETE CASCADE,
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    reason TEXT NOT NULL,
    "from" TEXT NOT NULL,
    subject TEXT NOT NULL,
    text_body TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'created_ticket', 'linked_ticket', 'dismissed')),
    reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
    reviewed_at TIMESTAMPTZ,
    ticket_id UUID REFERENCES tickets(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_quarantine_workspace ON intake_quarantine (workspace_id);
CREATE INDEX IF NOT EXISTS idx_quarantine_status ON intake_quarantine (status);

-- RLS: Email Addresses
ALTER TABLE email_addresses ENABLE ROW LEVEL SECURITY;
CREATE POLICY email_addresses_select ON email_addresses FOR SELECT
    USING (workspace_id = current_setting('ticketos.workspace_id', true)::UUID);
CREATE POLICY email_addresses_insert ON email_addresses FOR INSERT
    WITH CHECK (workspace_id = current_setting('ticketos.workspace_id', true)::UUID);
CREATE POLICY email_addresses_delete ON email_addresses FOR DELETE
    USING (workspace_id = current_setting('ticketos.workspace_id', true)::UUID);

-- RLS: Correlation Tokens
ALTER TABLE correlation_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY correlation_tokens_select ON correlation_tokens FOR SELECT
    USING (EXISTS (SELECT 1 FROM tickets WHERE tickets.id = correlation_tokens.ticket_id
                   AND tickets.workspace_id = current_setting('ticketos.workspace_id', true)::UUID));
CREATE POLICY correlation_tokens_insert ON correlation_tokens FOR INSERT
    WITH CHECK (EXISTS (SELECT 1 FROM tickets WHERE tickets.id = correlation_tokens.ticket_id
                        AND tickets.workspace_id = current_setting('ticketos.workspace_id', true)::UUID));

-- RLS: Outbound Emails
ALTER TABLE outbound_emails ENABLE ROW LEVEL SECURITY;
CREATE POLICY outbound_emails_select ON outbound_emails FOR SELECT
    USING (EXISTS (SELECT 1 FROM tickets WHERE tickets.id = outbound_emails.ticket_id
                   AND tickets.workspace_id = current_setting('ticketos.workspace_id', true)::UUID));
CREATE POLICY outbound_emails_insert ON outbound_emails FOR INSERT
    WITH CHECK (true);  -- Outbound emails may not have a ticket yet

-- RLS: Inbound Emails (global, not workspace-scoped — processed before workspace context)
-- No RLS on inbound_emails — they are processed in global context

-- RLS: Intake Quarantine
ALTER TABLE intake_quarantine ENABLE ROW LEVEL SECURITY;
CREATE POLICY quarantine_select ON intake_quarantine FOR SELECT
    USING (workspace_id = current_setting('ticketos.workspace_id', true)::UUID);
CREATE POLICY quarantine_insert ON intake_quarantine FOR INSERT
    WITH CHECK (workspace_id = current_setting('ticketos.workspace_id', true)::UUID);
CREATE POLICY quarantine_update ON intake_quarantine FOR UPDATE
    USING (workspace_id = current_setting('ticketos.workspace_id', true)::UUID);
