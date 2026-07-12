-- P2-04: Retention, Legal Holds, and MFA

-- Retention Policies
CREATE TABLE IF NOT EXISTS retention_policies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    target TEXT NOT NULL CHECK (target IN ('tickets', 'timeline', 'attachments', 'articles')),
    retention_days INTEGER NOT NULL DEFAULT 365,
    archive_before_delete BOOLEAN NOT NULL DEFAULT true,
    anonymize_content BOOLEAN NOT NULL DEFAULT true,
    enabled BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_retention_policies_workspace ON retention_policies (workspace_id);

-- Legal Holds
CREATE TABLE IF NOT EXISTS legal_holds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    reason TEXT NOT NULL,
    applied_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'released')),
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    released_at TIMESTAMPTZ,
    released_by UUID REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_legal_holds_ticket ON legal_holds (ticket_id);
CREATE INDEX IF NOT EXISTS idx_legal_holds_status ON legal_holds (status) WHERE status = 'active';

-- Ticket archive/retention state
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS retention_policy_id UUID;
