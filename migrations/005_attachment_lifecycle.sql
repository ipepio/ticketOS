-- P0-06: Secure Attachment lifecycle

-- Attachments (metadata only, never contains file content or permanent URLs)
CREATE TABLE IF NOT EXISTS attachments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    filename TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    size BIGINT NOT NULL CHECK (size >= 0),
    storage_key TEXT,
    status TEXT NOT NULL DEFAULT 'requested' CHECK (status IN ('requested', 'quarantine', 'scanning', 'available', 'rejected', 'deleted')),
    scan_result TEXT,
    uploader_id UUID NOT NULL REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_attachments_ticket ON attachments (ticket_id);
CREATE INDEX IF NOT EXISTS idx_attachments_status ON attachments (status);
CREATE INDEX IF NOT EXISTS idx_attachments_uploader ON attachments (uploader_id);

-- RLS: Attachments
ALTER TABLE attachments ENABLE ROW LEVEL SECURITY;
CREATE POLICY attachments_select ON attachments FOR SELECT
    USING (EXISTS (SELECT 1 FROM tickets WHERE tickets.id = attachments.ticket_id
                   AND tickets.workspace_id = current_setting('ticketos.workspace_id', true)::UUID));
CREATE POLICY attachments_insert ON attachments FOR INSERT
    WITH CHECK (EXISTS (SELECT 1 FROM tickets WHERE tickets.id = attachments.ticket_id
                        AND tickets.workspace_id = current_setting('ticketos.workspace_id', true)::UUID));
CREATE POLICY attachments_update ON attachments FOR UPDATE
    USING (EXISTS (SELECT 1 FROM tickets WHERE tickets.id = attachments.ticket_id
                   AND tickets.workspace_id = current_setting('ticketos.workspace_id', true)::UUID));
CREATE POLICY attachments_delete ON attachments FOR DELETE
    USING (EXISTS (SELECT 1 FROM tickets WHERE tickets.id = attachments.ticket_id
                   AND tickets.workspace_id = current_setting('ticketos.workspace_id', true)::UUID));
