-- P1-01: Business Calendars and SLA

-- Business Calendars
CREATE TABLE IF NOT EXISTS business_calendars (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    timezone TEXT NOT NULL DEFAULT 'UTC',
    is_default BOOLEAN NOT NULL DEFAULT false,
    working_hours JSONB NOT NULL DEFAULT '[]',
    exceptions JSONB NOT NULL DEFAULT '[]',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(workspace_id, name)
);

CREATE INDEX IF NOT EXISTS idx_business_calendars_workspace ON business_calendars (workspace_id);

-- SLA Policies
CREATE TABLE IF NOT EXISTS sla_policies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    queue_id UUID NOT NULL REFERENCES queues(id) ON DELETE CASCADE,
    priority TEXT NOT NULL,
    calendar_id UUID NOT NULL REFERENCES business_calendars(id) ON DELETE RESTRICT,
    first_response_minutes INTEGER,
    resolution_minutes INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(workspace_id, queue_id, priority)
);

CREATE INDEX IF NOT EXISTS idx_sla_policies_workspace ON sla_policies (workspace_id);
CREATE INDEX IF NOT EXISTS idx_sla_policies_queue ON sla_policies (queue_id);

-- SLA Targets (computed per Ticket)
CREATE TABLE IF NOT EXISTS sla_targets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    policy_id UUID NOT NULL REFERENCES sla_policies(id) ON DELETE CASCADE,
    target_kind TEXT NOT NULL CHECK (target_kind IN ('first-response', 'resolution')),
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deadline_at TIMESTAMPTZ NOT NULL,
    paused_at TIMESTAMPTZ,
    elapsed_minutes INTEGER NOT NULL DEFAULT 0,
    remaining_minutes INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'at-risk', 'breached', 'met')),
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sla_targets_ticket ON sla_targets (ticket_id);
CREATE INDEX IF NOT EXISTS idx_sla_targets_status ON sla_targets (status);
