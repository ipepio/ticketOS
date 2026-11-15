-- Add Ticket Priority ID column for configuration-based priority persistence.
-- Additive migration: nullable initially, enforced by module contract.
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS priority_id UUID REFERENCES priorities(id);
