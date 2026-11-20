-- ===========================================================================
-- Migration 028: Attachment visibility (Internal-Note isolation)
-- ===========================================================================
-- S1 (verbatim): "Requesters cannot access Attachments belonging only to
-- Internal Notes."
--
-- An Attachment is owned by a Ticket, and now also records who may read it:
--
--   'public'   — every reader of the owning Ticket (S1: "a permitted User")
--   'internal' — readers holding `tickets:internal-note` only, which is the same
--                capability that gates an Internal-Note Timeline entry
--
-- The design follows the existing `timeline_entries.visibility` column instead
-- of a link row to a specific Timeline entry: an Attachment may be uploaded
-- before, or independently of, any Timeline entry, and the Ticket already owns
-- both. The default keeps every pre-existing Attachment readable exactly as
-- before, so this migration is additive and needs no backfill.
--
-- The owning Ticket's Workspace remains the isolation boundary: the existing
-- row-level-security policies on `attachments` (keyed by `ticket_id`) are
-- unchanged. Visibility narrows access inside that boundary, it does not widen
-- it.

ALTER TABLE attachments
    ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'public'
        CHECK (visibility IN ('public', 'internal'));

COMMENT ON COLUMN attachments.visibility IS
    'public = every reader of the Ticket; internal = readers with tickets:internal-note only';
