-- P3-04: Hybrid platform (configurable roles and settings)

-- Configurable Roles
CREATE TABLE IF NOT EXISTS configurable_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    capabilities JSONB NOT NULL DEFAULT '[]',
    is_builtin BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(workspace_id, name)
);

CREATE INDEX IF NOT EXISTS idx_configurable_roles_workspace ON configurable_roles (workspace_id);

-- Workspace Settings
CREATE TABLE IF NOT EXISTS workspace_settings (
    workspace_id UUID PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
    default_ticket_type TEXT,
    default_priority TEXT,
    default_calendar_id UUID,
    email_domain TEXT,
    sso_enabled BOOLEAN NOT NULL DEFAULT false,
    mfa_required BOOLEAN NOT NULL DEFAULT false,
    retention_policy_id UUID,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
