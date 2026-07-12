-- P1-02: Versioned Forms and configurable Ticket Types

-- Forms (Workspace-owned, reusable)
CREATE TABLE IF NOT EXISTS forms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    current_version_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(workspace_id, name)
);

CREATE INDEX IF NOT EXISTS idx_forms_workspace ON forms (workspace_id);

-- Form Versions (draft → published → archived)
CREATE TABLE IF NOT EXISTS form_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    form_id UUID NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
    version INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
    title TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    published_at TIMESTAMPTZ,
    UNIQUE(form_id, version)
);

CREATE INDEX IF NOT EXISTS idx_form_versions_form ON form_versions (form_id);

-- Add FK from forms.current_version_id to form_versions
ALTER TABLE forms ADD CONSTRAINT forms_current_version_fk
    FOREIGN KEY (current_version_id) REFERENCES form_versions(id) ON DELETE SET NULL;

-- Form Fields (per version)
CREATE TABLE IF NOT EXISTS form_fields (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    form_version_id UUID NOT NULL REFERENCES form_versions(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    label TEXT NOT NULL,
    field_type TEXT NOT NULL CHECK (field_type IN (
        'text', 'textarea', 'number', 'email', 'phone',
        'select', 'multi-select', 'date', 'datetime',
        'checkbox', 'url'
    )),
    required BOOLEAN NOT NULL DEFAULT false,
    options JSONB NOT NULL DEFAULT '[]',
    default_value TEXT,
    placeholder TEXT,
    help_text TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_form_fields_version ON form_fields (form_version_id);

-- Ticket Form Association (immutable per ticket)
CREATE TABLE IF NOT EXISTS ticket_form_associations (
    ticket_id UUID PRIMARY KEY REFERENCES tickets(id) ON DELETE CASCADE,
    form_version_id UUID NOT NULL REFERENCES form_versions(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Field Answers (typed responses per ticket)
CREATE TABLE IF NOT EXISTS field_answers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    field_id UUID NOT NULL REFERENCES form_fields(id) ON DELETE CASCADE,
    form_version_id UUID NOT NULL REFERENCES form_versions(id) ON DELETE CASCADE,
    value TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(ticket_id, field_id)
);

CREATE INDEX IF NOT EXISTS idx_field_answers_ticket ON field_answers (ticket_id);
CREATE INDEX IF NOT EXISTS idx_field_answers_field ON field_answers (field_id);
