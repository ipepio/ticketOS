-- Workspace administration fields used by the portal.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS display_name TEXT,
  ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;

ALTER TABLE workspace_memberships
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'inactive'));

CREATE INDEX IF NOT EXISTS idx_memberships_organization
  ON workspace_memberships (workspace_id, organization_id);

ALTER TABLE statuses
  ADD COLUMN IF NOT EXISTS color TEXT NOT NULL DEFAULT '#64748b',
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;
