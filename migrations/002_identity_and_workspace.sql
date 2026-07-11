-- P0-02: Identity, Workspaces, Organizations, and authorization

-- Users (global installation identity)
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL UNIQUE,
    verified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Workspaces
CREATE TABLE IF NOT EXISTS workspaces (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Organizations (within a workspace)
CREATE TABLE IF NOT EXISTS organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Workspace Memberships (user + role + workspace)
CREATE TABLE IF NOT EXISTS workspace_memberships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('installation-admin', 'workspace-admin', 'agent', 'requester')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, workspace_id)
);

-- Queue Members (for restricted queues)
CREATE TABLE IF NOT EXISTS queue_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    queue_id UUID NOT NULL,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(workspace_id, queue_id, user_id)
);

-- Queues
CREATE TABLE IF NOT EXISTS queues (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    access_mode TEXT NOT NULL DEFAULT 'open' CHECK (access_mode IN ('open', 'restricted')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Magic Link tokens (ephemeral, one-time)
CREATE TABLE IF NOT EXISTS magic_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL,
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- OIDC Providers (installation-level)
CREATE TABLE IF NOT EXISTS oidc_providers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    issuer TEXT NOT NULL UNIQUE,
    client_id TEXT NOT NULL,
    client_secret TEXT NOT NULL,
    scopes TEXT NOT NULL DEFAULT 'openid email profile',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- OIDC Provider → Workspace mapping
CREATE TABLE IF NOT EXISTS workspace_oidc_providers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    oidc_provider_id UUID NOT NULL REFERENCES oidc_providers(id) ON DELETE CASCADE,
    UNIQUE(workspace_id, oidc_provider_id)
);

-- OIDC Accounts (linked to users)
CREATE TABLE IF NOT EXISTS oidc_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider_issuer TEXT NOT NULL REFERENCES oidc_providers(issuer) ON DELETE CASCADE,
    provider_subject TEXT NOT NULL,
    email TEXT,
    UNIQUE(provider_issuer, provider_subject)
);

-- Sessions (secure cookie-backed)
CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    workspace_id UUID REFERENCES workspaces(id) ON DELETE SET NULL,
    data JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions (expires_at);

-- Magic link lookups
CREATE INDEX IF NOT EXISTS idx_magic_links_token ON magic_links (token_hash);
CREATE INDEX IF NOT EXISTS idx_magic_links_expires ON magic_links (expires_at)
    WHERE used_at IS NULL;

-- Queue access control
CREATE INDEX IF NOT EXISTS idx_queues_workspace ON queues (workspace_id);
CREATE INDEX IF NOT EXISTS idx_queue_members_user ON queue_members (user_id, workspace_id);
CREATE INDEX IF NOT EXISTS idx_queue_members_queue ON queue_members (queue_id);

-- Workspace membership lookups
CREATE INDEX IF NOT EXISTS idx_memberships_user ON workspace_memberships (user_id);
CREATE INDEX IF NOT EXISTS idx_memberships_workspace ON workspace_memberships (workspace_id);

-- RLS: Users (installation-wide, no workspace_id)
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
CREATE POLICY users_all ON users FOR ALL USING (true);

-- RLS: Workspaces
ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
CREATE POLICY workspaces_all ON workspaces FOR ALL USING (true);

-- RLS: Organizations (workspace-scoped)
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
CREATE POLICY organizations_select ON organizations FOR SELECT
    USING (workspace_id = current_setting('ticketos.workspace_id', true)::UUID);
CREATE POLICY organizations_insert ON organizations FOR INSERT
    WITH CHECK (workspace_id = current_setting('ticketos.workspace_id', true)::UUID);
CREATE POLICY organizations_update ON organizations FOR UPDATE
    USING (workspace_id = current_setting('ticketos.workspace_id', true)::UUID);
CREATE POLICY organizations_delete ON organizations FOR DELETE
    USING (workspace_id = current_setting('ticketos.workspace_id', true)::UUID);

-- RLS: Workspace Memberships
ALTER TABLE workspace_memberships ENABLE ROW LEVEL SECURITY;
CREATE POLICY memberships_select ON workspace_memberships FOR SELECT
    USING (workspace_id = current_setting('ticketos.workspace_id', true)::UUID);
CREATE POLICY memberships_insert ON workspace_memberships FOR INSERT
    WITH CHECK (workspace_id = current_setting('ticketos.workspace_id', true)::UUID);
CREATE POLICY memberships_update ON workspace_memberships FOR UPDATE
    USING (workspace_id = current_setting('ticketos.workspace_id', true)::UUID);
CREATE POLICY memberships_delete ON workspace_memberships FOR DELETE
    USING (workspace_id = current_setting('ticketos.workspace_id', true)::UUID);

-- RLS: Queues
ALTER TABLE queues ENABLE ROW LEVEL SECURITY;
CREATE POLICY queues_select ON queues FOR SELECT
    USING (workspace_id = current_setting('ticketos.workspace_id', true)::UUID);
CREATE POLICY queues_insert ON queues FOR INSERT
    WITH CHECK (workspace_id = current_setting('ticketos.workspace_id', true)::UUID);
CREATE POLICY queues_update ON queues FOR UPDATE
    USING (workspace_id = current_setting('ticketos.workspace_id', true)::UUID);
CREATE POLICY queues_delete ON queues FOR DELETE
    USING (workspace_id = current_setting('ticketos.workspace_id', true)::UUID);

-- RLS: Queue Members
ALTER TABLE queue_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY queue_members_select ON queue_members FOR SELECT
    USING (workspace_id = current_setting('ticketos.workspace_id', true)::UUID);
CREATE POLICY queue_members_insert ON queue_members FOR INSERT
    WITH CHECK (workspace_id = current_setting('ticketos.workspace_id', true)::UUID);
CREATE POLICY queue_members_delete ON queue_members FOR DELETE
    USING (workspace_id = current_setting('ticketos.workspace_id', true)::UUID);

-- RLS: Magic Links
ALTER TABLE magic_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY magic_links_select ON magic_links FOR SELECT
    USING (user_id = current_setting('ticketos.user_id', true)::UUID
           OR workspace_id = current_setting('ticketos.workspace_id', true)::UUID);
CREATE POLICY magic_links_insert ON magic_links FOR INSERT
    WITH CHECK (true);
CREATE POLICY magic_links_update ON magic_links FOR UPDATE
    USING (user_id = current_setting('ticketos.user_id', true)::UUID);

-- RLS: OIDC Accounts
ALTER TABLE oidc_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY oidc_accounts_select ON oidc_accounts FOR SELECT
    USING (user_id = current_setting('ticketos.user_id', true)::UUID);
CREATE POLICY oidc_accounts_insert ON oidc_accounts FOR INSERT
    WITH CHECK (user_id = current_setting('ticketos.user_id', true)::UUID);

-- RLS: Sessions
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY sessions_select ON sessions FOR SELECT
    USING (user_id = current_setting('ticketos.user_id', true)::UUID);
CREATE POLICY sessions_insert ON sessions FOR INSERT
    WITH CHECK (user_id = current_setting('ticketos.user_id', true)::UUID);
CREATE POLICY sessions_delete ON sessions FOR DELETE
    USING (user_id = current_setting('ticketos.user_id', true)::UUID);

-- RLS: OIDC Providers (installation admin only — bypassed via admin role)
ALTER TABLE oidc_providers ENABLE ROW LEVEL SECURITY;
CREATE POLICY oidc_providers_installation_admin ON oidc_providers
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM workspace_memberships
            WHERE user_id = current_setting('ticketos.user_id', true)::UUID
              AND role = 'installation-admin'
        )
    );

-- RLS: Workspace OIDC Providers
ALTER TABLE workspace_oidc_providers ENABLE ROW LEVEL SECURITY;
CREATE POLICY workspace_oidc_providers_select ON workspace_oidc_providers FOR SELECT
    USING (workspace_id = current_setting('ticketos.workspace_id', true)::UUID);
CREATE POLICY workspace_oidc_providers_insert ON workspace_oidc_providers FOR INSERT
    WITH CHECK (workspace_id = current_setting('ticketos.workspace_id', true)::UUID);
CREATE POLICY workspace_oidc_providers_delete ON workspace_oidc_providers FOR DELETE
    USING (workspace_id = current_setting('ticketos.workspace_id', true)::UUID);
