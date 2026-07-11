-- P0-04 additions: Redaction history and timeline content tracking

-- Add redacted_content column to timeline_entries to store original content before redaction
ALTER TABLE timeline_entries ADD COLUMN IF NOT EXISTS redacted_content TEXT;
ALTER TABLE timeline_entries ADD COLUMN IF NOT EXISTS redacted_at TIMESTAMPTZ;
ALTER TABLE timeline_entries ADD COLUMN IF NOT EXISTS redacted_by UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE timeline_entries ADD COLUMN IF NOT EXISTS redact_reason TEXT;

-- Add is_cancelled column to tickets for terminal cancellation state
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS cancelled_by UUID REFERENCES users(id) ON DELETE SET NULL;
