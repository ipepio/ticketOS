-- ===========================================================================
-- Migration 026: Ticket queue routing
-- ===========================================================================
-- 003_workflow.sql defined tickets.queue_id, but 004_ticket_and_timeline.sql
-- recreated the live tickets table without it, so no ticket could be routed to
-- a Queue. ADR 0010 requires exactly one active Queue per Ticket, and the Queue
-- administration screen reports an active Ticket count per Queue.
--
-- The column is added nullable and non-destructive: existing Tickets keep no
-- Queue until they are moved, and nothing is rewritten or dropped here.
-- ===========================================================================

ALTER TABLE tickets ADD COLUMN IF NOT EXISTS queue_id UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'tickets_queue_id_fkey'
      AND conrelid = 'tickets'::regclass
  ) THEN
    ALTER TABLE tickets
      ADD CONSTRAINT tickets_queue_id_fkey
      FOREIGN KEY (queue_id) REFERENCES queues(id) ON DELETE RESTRICT;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_tickets_workspace_queue
  ON tickets (workspace_id, queue_id);
