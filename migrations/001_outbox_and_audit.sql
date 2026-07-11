-- P0-01: Outbox events table
-- Transactional outbox: domain events are written here in the same
-- transaction as the state change, so the worker can reliably process them.

CREATE TABLE IF NOT EXISTS outbox_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    aggregate_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    data JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    delivered_at TIMESTAMPTZ,
    retry_count INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_outbox_events_not_delivered
    ON outbox_events (created_at)
    WHERE delivered_at IS NULL;

-- P0-01: Audit events table (Installation-wide append-only log)
-- P0-02+: workspace_id is populated when the audit event is workspace-scoped.

CREATE TABLE IF NOT EXISTS audit_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    kind TEXT NOT NULL,
    actor_user_id UUID,
    workspace_id UUID,
    details JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_events_workspace
    ON audit_events (workspace_id, created_at DESC)
    WHERE workspace_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_audit_events_created
    ON audit_events (created_at DESC);
