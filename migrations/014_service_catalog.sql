-- P2-01: Service Catalog

CREATE TABLE IF NOT EXISTS catalog_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
    ticket_type_id UUID REFERENCES ticket_types(id) ON DELETE SET NULL,
    form_id UUID, -- references forms(id) but FK added separately
    queue_id UUID REFERENCES queues(id) ON DELETE SET NULL,
    priority TEXT NOT NULL DEFAULT 'normal',
    sla_policy_id UUID, -- references sla_policies(id)
    icon TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    published_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_catalog_items_workspace ON catalog_items (workspace_id);
CREATE INDEX IF NOT EXISTS idx_catalog_items_status ON catalog_items (workspace_id, status) WHERE status = 'published';
