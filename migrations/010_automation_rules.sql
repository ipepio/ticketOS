-- P1-03: Automation Rules

-- Automation Rules
CREATE TABLE IF NOT EXISTS automation_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'disabled')),
    event TEXT NOT NULL,
    conditions JSONB NOT NULL DEFAULT '[]',
    actions JSONB NOT NULL DEFAULT '[]',
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_automation_rules_workspace ON automation_rules (workspace_id);
CREATE INDEX IF NOT EXISTS idx_automation_rules_event ON automation_rules (workspace_id, event) WHERE status = 'active';

-- Automation Execution Log
CREATE TABLE IF NOT EXISTS automation_executions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rule_id UUID NOT NULL REFERENCES automation_rules(id) ON DELETE CASCADE,
    ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    causal_chain_id UUID NOT NULL,
    depth INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL CHECK (status IN ('success', 'failure', 'skipped', 'loop-blocked')),
    result TEXT,
    error TEXT,
    executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_automation_executions_ticket ON automation_executions (ticket_id);
CREATE INDEX IF NOT EXISTS idx_automation_executions_rule ON automation_executions (rule_id);
CREATE INDEX IF NOT EXISTS idx_automation_executions_chain ON automation_executions (causal_chain_id);
