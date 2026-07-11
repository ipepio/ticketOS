-- P0-04: Ticket and immutable Timeline

-- Tickets
CREATE TABLE IF NOT EXISTS tickets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'backlog' CHECK (status IN ('backlog', 'todo', 'in_progress', 'done', 'cancelled')),
    priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
    ticket_type_id UUID,
    created_by UUID NOT NULL REFERENCES users(id) ON DELETE SET NULL,
    assigned_to UUID REFERENCES users(id) ON DELETE SET NULL,
    visibility TEXT NOT NULL DEFAULT 'public' CHECK (visibility IN ('public', 'internal', 'private')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    cancelled_at TIMESTAMPTZ,
    cancelled_by UUID REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_tickets_workspace ON tickets (workspace_id);
CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets (workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_tickets_assigned ON tickets (workspace_id, assigned_to);
CREATE INDEX IF NOT EXISTS idx_tickets_created_by ON tickets (workspace_id, created_by);

-- Ticket Tags
CREATE TABLE IF NOT EXISTS ticket_tags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(ticket_id, name)
);

CREATE INDEX IF NOT EXISTS idx_ticket_tags_ticket ON ticket_tags (ticket_id);

-- Ticket Followers
CREATE TABLE IF NOT EXISTS ticket_followers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(ticket_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_ticket_followers_ticket ON ticket_followers (ticket_id);
CREATE INDEX IF NOT EXISTS idx_ticket_followers_user ON ticket_followers (user_id);

-- Timeline Entries (append-only, immutable)
CREATE TABLE IF NOT EXISTS timeline_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK (kind IN ('message', 'internal_note', 'system_event', 'status_change', 'priority_change', 'assignment_change')),
    content TEXT NOT NULL,
    author_id UUID REFERENCES users(id) ON DELETE SET NULL,
    visibility TEXT NOT NULL DEFAULT 'public' CHECK (visibility IN ('public', 'internal', 'private')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    redacted_content TEXT,
    redacted_at TIMESTAMPTZ,
    redacted_by UUID REFERENCES users(id) ON DELETE SET NULL,
    redact_reason TEXT
);

CREATE INDEX IF NOT EXISTS idx_timeline_ticket ON timeline_entries (ticket_id, created_at);
CREATE INDEX IF NOT EXISTS idx_timeline_kind ON timeline_entries (ticket_id, kind);

-- RLS: Tickets
ALTER TABLE tickets ENABLE ROW LEVEL SECURITY;
CREATE POLICY tickets_select ON tickets FOR SELECT
    USING (workspace_id = current_setting('ticketos.workspace_id', true)::UUID);
CREATE POLICY tickets_insert ON tickets FOR INSERT
    WITH CHECK (workspace_id = current_setting('ticketos.workspace_id', true)::UUID);
CREATE POLICY tickets_update ON tickets FOR UPDATE
    USING (workspace_id = current_setting('ticketos.workspace_id', true)::UUID);
CREATE POLICY tickets_delete ON tickets FOR DELETE
    USING (workspace_id = current_setting('ticketos.workspace_id', true)::UUID);

-- RLS: Ticket Tags
ALTER TABLE ticket_tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY ticket_tags_select ON ticket_tags FOR SELECT
    USING (EXISTS (SELECT 1 FROM tickets WHERE tickets.id = ticket_tags.ticket_id
                   AND tickets.workspace_id = current_setting('ticketos.workspace_id', true)::UUID));
CREATE POLICY ticket_tags_insert ON ticket_tags FOR INSERT
    WITH CHECK (EXISTS (SELECT 1 FROM tickets WHERE tickets.id = ticket_tags.ticket_id
                        AND tickets.workspace_id = current_setting('ticketos.workspace_id', true)::UUID));

-- RLS: Ticket Followers
ALTER TABLE ticket_followers ENABLE ROW LEVEL SECURITY;
CREATE POLICY ticket_followers_select ON ticket_followers FOR SELECT
    USING (EXISTS (SELECT 1 FROM tickets WHERE tickets.id = ticket_followers.ticket_id
                   AND tickets.workspace_id = current_setting('ticketos.workspace_id', true)::UUID));
CREATE POLICY ticket_followers_insert ON ticket_followers FOR INSERT
    WITH CHECK (EXISTS (SELECT 1 FROM tickets WHERE tickets.id = ticket_followers.ticket_id
                        AND tickets.workspace_id = current_setting('ticketos.workspace_id', true)::UUID));

-- RLS: Timeline Entries
ALTER TABLE timeline_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY timeline_entries_select ON timeline_entries FOR SELECT
    USING (EXISTS (SELECT 1 FROM tickets WHERE tickets.id = timeline_entries.ticket_id
                   AND tickets.workspace_id = current_setting('ticketos.workspace_id', true)::UUID));
CREATE POLICY timeline_entries_insert ON timeline_entries FOR INSERT
    WITH CHECK (EXISTS (SELECT 1 FROM tickets WHERE tickets.id = timeline_entries.ticket_id
                        AND tickets.workspace_id = current_setting('ticketos.workspace_id', true)::UUID));
