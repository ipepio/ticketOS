-- P2-03: Reporting and CSV

CREATE TABLE IF NOT EXISTS report_definitions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    dimensions JSONB NOT NULL DEFAULT '[]',
    measures JSONB NOT NULL DEFAULT '[]',
    filters JSONB NOT NULL DEFAULT '[]',
    granularity TEXT NOT NULL DEFAULT 'daily' CHECK (granularity IN ('daily', 'weekly', 'monthly')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_report_definitions_workspace ON report_definitions (workspace_id);
