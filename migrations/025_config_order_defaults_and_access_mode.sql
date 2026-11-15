-- ===========================================================================
-- Migration 025: Config sort_order, descriptions/colors, access mode, defaults
-- ===========================================================================
-- Step 1 (S4): Add sort_order to statuses; backfill deterministically
--               (created_at → id), set NOT NULL + DEFAULT 0.
-- Step 1 (S4): Add sort_order to ticket_types; backfill same way,
--               set NOT NULL + DEFAULT 0. Add description and color (nullable).
-- Step 1 (S4): Add description and color (nullable) to priorities.
--               (sort_order already exists from 003.)
-- Step 2 (S4): Drop the priority name enum CHECK so Workspace admins can name
--               priorities freely.
-- Step 3 (S7): Replace queues.access_mode CHECK — drop old, migrate 'open' to
--               'workspace-agents', add new CHECK, set default.
-- Step 4 (S5): Normalize existing defaults (keep lowest sort_order/lowest id,
--               clear inactive defaults), then create partial unique indexes
--               for at-most-one active default per workspace.
-- Step 5 (S6): Backfill tickets.priority_id from the legacy priority TEXT
--               column via priorities.name within the same workspace.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Step 1 (S4): Add columns, backfill sort_order, enforce NOT NULL + DEFAULT
-- ---------------------------------------------------------------------------

-- 1a. statuses: add sort_order
ALTER TABLE statuses ADD COLUMN IF NOT EXISTS sort_order INTEGER;

-- 1b. Backfill statuses sort_order deterministically
UPDATE statuses s
SET sort_order = sub.seq
FROM (
    SELECT id,
           ROW_NUMBER() OVER (ORDER BY created_at, id) AS seq
    FROM statuses
) sub
WHERE s.id = sub.id;

-- 1c. Enforce NOT NULL and set default for statuses.sort_order
ALTER TABLE statuses ALTER COLUMN sort_order SET NOT NULL;
ALTER TABLE statuses ALTER COLUMN sort_order SET DEFAULT 0;

-- 1d. ticket_types: add sort_order
ALTER TABLE ticket_types ADD COLUMN IF NOT EXISTS sort_order INTEGER;

-- 1e. Backfill ticket_types sort_order deterministically
UPDATE ticket_types t
SET sort_order = sub.seq
FROM (
    SELECT id,
           ROW_NUMBER() OVER (ORDER BY created_at, id) AS seq
    FROM ticket_types
) sub
WHERE t.id = sub.id;

-- 1f. Enforce NOT NULL and set default for ticket_types.sort_order
ALTER TABLE ticket_types ALTER COLUMN sort_order SET NOT NULL;
ALTER TABLE ticket_types ALTER COLUMN sort_order SET DEFAULT 0;

-- 1g. ticket_types: add description and color (nullable)
ALTER TABLE ticket_types ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE ticket_types ADD COLUMN IF NOT EXISTS color TEXT;

-- 1h. priorities: add description and color (nullable)
-- (sort_order already exists from 003 — no change needed)
ALTER TABLE priorities ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE priorities ADD COLUMN IF NOT EXISTS color TEXT;

-- ---------------------------------------------------------------------------
-- Step 2 (S4): Drop the priority name enum CHECK constraint
-- ---------------------------------------------------------------------------

ALTER TABLE priorities DROP CONSTRAINT IF EXISTS priorities_name_check;

-- ---------------------------------------------------------------------------
-- Step 3 (S7): Replace queues.access_mode CHECK
-- ---------------------------------------------------------------------------

-- 3a. Drop old check
ALTER TABLE queues DROP CONSTRAINT IF EXISTS queues_access_mode_check;

-- 3b. Migrate 'open' → 'workspace-agents'
UPDATE queues SET access_mode = 'workspace-agents'
WHERE access_mode = 'open';

-- 3c. Set new default value
ALTER TABLE queues ALTER COLUMN access_mode SET DEFAULT 'workspace-agents';

-- 3d. Add new named check constraint (order: workspace-agents, restricted)
ALTER TABLE queues ADD CONSTRAINT queues_access_mode_check
    CHECK (access_mode IN ('workspace-agents', 'restricted'));

-- ---------------------------------------------------------------------------
-- Step 4 (S5): Normalize existing defaults, then create partial unique indexes
-- ---------------------------------------------------------------------------

-- 4a. Normalize priorities: keep lowest sort_order (then lowest id) per
--     workspace, clear is_default on duplicates.
WITH ranked AS (
    SELECT id,
           ROW_NUMBER() OVER (PARTITION BY workspace_id
                              ORDER BY sort_order, id) AS rn
    FROM priorities
    WHERE is_default
)
UPDATE priorities p
SET is_default = false
FROM ranked r
WHERE p.id = r.id AND r.rn > 1;

-- 4b. Clear any default that is currently inactive (priorities).
UPDATE priorities
SET is_default = false
WHERE is_default AND NOT is_active;

-- 4c. Normalize ticket_types: keep lowest sort_order (then lowest id) per
--     workspace, clear is_default on duplicates.
WITH ranked AS (
    SELECT id,
           ROW_NUMBER() OVER (PARTITION BY workspace_id
                              ORDER BY sort_order, id) AS rn
    FROM ticket_types
    WHERE is_default
)
UPDATE ticket_types t
SET is_default = false
FROM ranked r
WHERE t.id = r.id AND r.rn > 1;

-- 4d. Clear any default that is currently inactive (ticket_types).
UPDATE ticket_types
SET is_default = false
WHERE is_default AND NOT is_active;

-- 4e. Create partial unique indexes: at-most-one active default per workspace.
CREATE UNIQUE INDEX IF NOT EXISTS idx_priorities_workspace_default
    ON priorities (workspace_id) WHERE is_default AND is_active;

CREATE UNIQUE INDEX IF NOT EXISTS idx_ticket_types_workspace_default
    ON ticket_types (workspace_id) WHERE is_default AND is_active;

-- ---------------------------------------------------------------------------
-- Step 5 (S6): Backfill tickets.priority_id from legacy priority TEXT
-- ---------------------------------------------------------------------------

UPDATE tickets t
SET priority_id = p.id
FROM priorities p
WHERE t.workspace_id = p.workspace_id
  AND t.priority_id IS NULL
  AND p.name = t.priority;