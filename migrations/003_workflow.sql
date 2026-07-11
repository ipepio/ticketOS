-- P0-03: Workflow, Queues, priorities, and Ticket Types

-- Statuses (Workspace-configured, canonical categories)
CREATE TABLE IF NOT EXISTS status_categories (
    name TEXT PRIMARY KEY CHECK (name IN ('new', 'open', 'pending', 'resolved', 'closed'))
);

INSERT INTO status_categories (name) VALUES ('new'), ('open'), ('pending'), ('resolved'), ('closed');

CREATE TABLE IF NOT EXISTS statuses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    category TEXT NOT NULL REFERENCES status_categories(name),
    is_default BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(workspace_id, name)
);

-- Transitions (permitted status changes)
CREATE TABLE IF NOT EXISTS transitions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    from_status_id UUID NOT NULL REFERENCES statuses(id) ON DELETE CASCADE,
    to_status_id UUID NOT NULL REFERENCES statuses(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(workspace_id, from_status_id, to_status_id)
);

-- Priorities (Workspace-configured, ordered)
CREATE TABLE IF NOT EXISTS priorities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name TEXT NOT NULL CHECK (name IN ('critical', 'high', 'normal', 'low')),
    sort_order INTEGER NOT NULL,
    is_default BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(workspace_id, name)
);

-- Ticket Types (Workspace-configured with canonical categories)
CREATE TABLE IF NOT EXISTS ticket_type_categories (
    name TEXT PRIMARY KEY CHECK (name IN ('incident', 'service-request'))
);

INSERT INTO ticket_type_categories (name) VALUES ('incident'), ('service-request');

CREATE TABLE IF NOT EXISTS ticket_types (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    category TEXT NOT NULL REFERENCES ticket_type_categories(name),
    is_default BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(workspace_id, name)
);

-- Tickets (basic structure, P0-04 adds Timeline, Messages, etc.)
CREATE TABLE IF NOT EXISTS tickets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    requester_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type_id UUID NOT NULL REFERENCES ticket_types(id) ON DELETE RESTRICT,
    priority_id UUID NOT NULL REFERENCES priorities(id) ON DELETE RESTRICT,
    status_id UUID NOT NULL REFERENCES statuses(id) ON DELETE RESTRICT,
    queue_id UUID NOT NULL REFERENCES queues(id) ON DELETE RESTRICT,
    assignee_id UUID REFERENCES users(id) ON DELETE SET NULL,
    visibility TEXT NOT NULL DEFAULT 'private' CHECK (visibility IN ('private', 'organization-visible')),
    organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Timeline entries (append-only, P0-04)
CREATE TABLE IF NOT EXISTS timeline_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK (kind IN ('message', 'internal-note', 'system-event')),
    author_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Followers (P0-04)
CREATE TABLE IF NOT EXISTS ticket_followers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(ticket_id, user_id)
);

-- Tags (P0-03)
CREATE TABLE IF NOT EXISTS ticket_tags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    UNIQUE(workspace_id, name)
);

CREATE TABLE IF NOT EXISTS ticket_tag_assignments (
    ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    tag_id UUID NOT NULL REFERENCES ticket_tags(id) ON DELETE CASCADE,
    PRIMARY KEY (ticket_id, tag_id)
);

-- RLS: Statuses
ALTER TABLE statuses ENABLE ROW LEVEL SECURITY;
CREATE POLICY statuses_select ON statuses FOR SELECT
    USING (workspace_id = current_setting('ticketos.workspace_id', true)::UUID);
CREATE POLICY statuses_insert ON statuses FOR INSERT
    WITH CHECK (workspace_id = current_setting('ticketos.workspace_id', true)::UUID);
CREATE POLICY statuses_update ON statuses FOR UPDATE
    USING (workspace_id = current_setting('ticketos.workspace_id', true)::UUID);
CREATE POLICY statuses_delete ON statuses FOR DELETE
    USING (workspace_id = current_setting('ticketos.workspace_id', true)::UUID);

-- RLS: Transitions
ALTER TABLE transitions ENABLE ROW LEVEL SECURITY;
CREATE POLICY transitions_select ON transitions FOR SELECT
    USING (workspace_id = current_setting('ticketos.workspace_id', true)::UUID);
CREATE POLICY transitions_insert ON transitions FOR INSERT
    WITH CHECK (workspace_id = current_setting('ticketos.workspace_id', true)::UUID);
CREATE POLICY transitions_delete ON transitions FOR DELETE
    USING (workspace_id = current_setting('ticketos.workspace_id', true)::UUID);

-- RLS: Priorities
ALTER TABLE priorities ENABLE ROW LEVEL SECURITY;
CREATE POLICY priorities_select ON priorities FOR SELECT
    USING (workspace_id = current_setting('ticketos.workspace_id', true)::UUID);
CREATE POLICY priorities_insert ON priorities FOR INSERT
    WITH CHECK (workspace_id = current_setting('ticketos.workspace_id', true)::UUID);
CREATE POLICY priorities_update ON priorities FOR UPDATE
    USING (workspace_id = current_setting('ticketos.workspace_id', true)::UUID);
CREATE POLICY priorities_delete ON priorities FOR DELETE
    USING (workspace_id = current_setting('ticketos.workspace_id', true)::UUID);

-- RLS: Ticket Types
ALTER TABLE ticket_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY ticket_types_select ON ticket_types FOR SELECT
    USING (workspace_id = current_setting('ticketos.workspace_id', true)::UUID);
CREATE POLICY ticket_types_insert ON ticket_types FOR INSERT
    WITH CHECK (workspace_id = current_setting('ticketos.workspace_id', true)::UUID);
CREATE POLICY ticket_types_update ON ticket_types FOR UPDATE
    USING (workspace_id = current_setting('ticketos.workspace_id', true)::UUID);
CREATE POLICY ticket_types_delete ON ticket_types FOR DELETE
    USING (workspace_id = current_setting('ticketos.workspace_id', true)::UUID);

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

-- RLS: Timeline Entries
ALTER TABLE timeline_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY timeline_entries_select ON timeline_entries FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM tickets
            WHERE tickets.id = timeline_entries.ticket_id
              AND tickets.workspace_id = current_setting('ticketos.workspace_id', true)::UUID
        )
    );
CREATE POLICY timeline_entries_insert ON timeline_entries FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM tickets
            WHERE tickets.id = timeline_entries.ticket_id
              AND tickets.workspace_id = current_setting('ticketos.workspace_id', true)::UUID
        )
    );

-- RLS: Ticket Followers
ALTER TABLE ticket_followers ENABLE ROW LEVEL SECURITY;
CREATE POLICY ticket_followers_select ON ticket_followers FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM tickets
            WHERE tickets.id = ticket_followers.ticket_id
              AND tickets.workspace_id = current_setting('ticketos.workspace_id', true)::UUID
        )
    );
CREATE POLICY ticket_followers_insert ON ticket_followers FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM tickets
            WHERE tickets.id = ticket_followers.ticket_id
              AND tickets.workspace_id = current_setting('ticketos.workspace_id', true)::UUID
        )
    );
CREATE POLICY ticket_followers_delete ON ticket_followers FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM tickets
            WHERE tickets.id = ticket_followers.ticket_id
              AND tickets.workspace_id = current_setting('ticketos.workspace_id', true)::UUID
        )
    );

-- RLS: Tags
ALTER TABLE ticket_tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY ticket_tags_select ON ticket_tags FOR SELECT
    USING (workspace_id = current_setting('ticketos.workspace_id', true)::UUID);
CREATE POLICY ticket_tags_insert ON ticket_tags FOR INSERT
    WITH CHECK (workspace_id = current_setting('ticketos.workspace_id', true)::UUID);
CREATE POLICY ticket_tags_delete ON ticket_tags FOR DELETE
    USING (workspace_id = current_setting('ticketos.workspace_id', true)::UUID);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_statuses_workspace ON statuses (workspace_id);
CREATE INDEX IF NOT EXISTS idx_priorities_workspace ON priorities (workspace_id);
CREATE INDEX IF NOT EXISTS idx_ticket_types_workspace ON ticket_types (workspace_id);
CREATE INDEX IF NOT EXISTS idx_tickets_workspace ON tickets (workspace_id);
CREATE INDEX IF NOT EXISTS idx_tickets_requester ON tickets (requester_id);
CREATE INDEX IF NOT EXISTS idx_tickets_queue ON tickets (queue_id);
CREATE INDEX IF NOT EXISTS idx_tickets_assignee ON tickets (assignee_id);
CREATE INDEX IF NOT EXISTS idx_timeline_ticket ON timeline_entries (ticket_id, created_at);
CREATE INDEX IF NOT EXISTS idx_ticket_tags_workspace ON ticket_tags (workspace_id);
