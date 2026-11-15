-- Add active-state columns to Ticket Type and Priority configuration.
ALTER TABLE ticket_types ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE priorities   ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;
