-- ===========================================================================
-- Migration 027: Ticket status_id (converge on Workspace-configured Statuses)
-- ===========================================================================
-- S1: The Ticket model must converge on configuration IDs instead of the
--     hard-coded status strings, without keeping two independent sources of
--     truth. S6: converge additively — add and backfill now, enforce later.
--
-- Step 1 (S6): Add the nullable tickets.status_id column referencing
--              statuses(id). The legacy TEXT status column and its CHECK
--              constraint are left untouched by this migration; it remains the
--              write path until the application converges (later tasks).
-- Step 2 (S6): Backfill status_id for every Ticket that does not have one, from
--              the Statuses of the Ticket's own Workspace. The legacy value
--              maps to a canonical Status Category (S5):
--                  backlog     -> new
--                  todo        -> open
--                  in_progress -> open
--                  done        -> resolved
--                  cancelled   -> closed
--              Within the mapped category the Workspace's default Status wins,
--              otherwise the first by sort_order (then id, so the choice is
--              deterministic). A Workspace without any Status row for the
--              category keeps status_id NULL: no Status rows are invented here,
--              Workspace configuration stays the source of truth.
-- Step 3 (S6): Index (workspace_id, status_id) for the Workspace-scoped reads
--              and transition checks that follow.
--
-- Every statement is re-runnable: the column add is guarded by IF NOT EXISTS,
-- the backfill only touches rows whose status_id IS NULL, and the index is
-- declared with IF NOT EXISTS.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Step 1 (S6): Add the additive, nullable configuration reference
-- ---------------------------------------------------------------------------

ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS status_id UUID REFERENCES statuses(id);

-- ---------------------------------------------------------------------------
-- Step 2 (S6): Backfill status_id from the legacy status TEXT column
-- ---------------------------------------------------------------------------

WITH status_category_map (legacy_status, category) AS (
  VALUES
    ('backlog',     'new'),
    ('todo',        'open'),
    ('in_progress', 'open'),
    ('done',        'resolved'),
    ('cancelled',   'closed')
)
UPDATE tickets t
SET status_id = (
  SELECT s.id
  FROM statuses s
  JOIN status_category_map m
    ON m.category = s.category
   AND m.legacy_status = t.status
  WHERE s.workspace_id = t.workspace_id
  ORDER BY s.is_default DESC, s.sort_order, s.id
  LIMIT 1
)
WHERE t.status_id IS NULL;

-- ---------------------------------------------------------------------------
-- Step 3 (S6): Index for Workspace-scoped status lookups
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_tickets_workspace_status_id
  ON tickets (workspace_id, status_id);
