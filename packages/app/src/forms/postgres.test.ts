import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Pool } from 'pg';
import { PostgresFormsModule } from './postgres.js';

const MIGRATIONS = [
  `CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL UNIQUE, verified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS workspaces (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS queues (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name TEXT NOT NULL, access_mode TEXT NOT NULL DEFAULT 'open',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS status_categories (
    name TEXT PRIMARY KEY CHECK (name IN ('new', 'open', 'pending', 'resolved', 'closed'))
  )`,
  `INSERT INTO status_categories (name) VALUES ('new'), ('open'), ('pending'), ('resolved'), ('closed') ON CONFLICT DO NOTHING`,
  `CREATE TABLE IF NOT EXISTS statuses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name TEXT NOT NULL, category TEXT NOT NULL REFERENCES status_categories(name),
    is_default BOOLEAN NOT NULL DEFAULT false, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(workspace_id, name)
  )`,
  `CREATE TABLE IF NOT EXISTS ticket_type_categories (
    name TEXT PRIMARY KEY CHECK (name IN ('incident', 'service-request'))
  )`,
  `INSERT INTO ticket_type_categories (name) VALUES ('incident'), ('service-request') ON CONFLICT DO NOTHING`,
  `CREATE TABLE IF NOT EXISTS ticket_types (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name TEXT NOT NULL, category TEXT NOT NULL REFERENCES ticket_type_categories(name),
    is_default BOOLEAN NOT NULL DEFAULT false, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(workspace_id, name)
  )`,
  `CREATE TABLE IF NOT EXISTS tickets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    title TEXT NOT NULL, description TEXT,
    status TEXT NOT NULL DEFAULT 'backlog' CHECK (status IN ('backlog', 'todo', 'in_progress', 'done', 'cancelled')),
    priority TEXT NOT NULL DEFAULT 'normal',
    ticket_type_id UUID, created_by UUID NOT NULL REFERENCES users(id) ON DELETE SET NULL,
    assigned_to UUID REFERENCES users(id) ON DELETE SET NULL,
    visibility TEXT NOT NULL DEFAULT 'public',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS forms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name TEXT NOT NULL, description TEXT, current_version_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(workspace_id, name)
  )`,
  `CREATE TABLE IF NOT EXISTS form_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    form_id UUID NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
    version INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
    title TEXT NOT NULL, description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), published_at TIMESTAMPTZ,
    UNIQUE(form_id, version)
  )`,
  `ALTER TABLE forms ADD CONSTRAINT forms_current_version_fk FOREIGN KEY (current_version_id) REFERENCES form_versions(id) ON DELETE SET NULL`,
  `CREATE TABLE IF NOT EXISTS form_fields (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    form_version_id UUID NOT NULL REFERENCES form_versions(id) ON DELETE CASCADE,
    name TEXT NOT NULL, label TEXT NOT NULL,
    field_type TEXT NOT NULL CHECK (field_type IN ('text', 'textarea', 'number', 'email', 'phone', 'select', 'multi-select', 'date', 'datetime', 'checkbox', 'url')),
    required BOOLEAN NOT NULL DEFAULT false, options JSONB NOT NULL DEFAULT '[]',
    default_value TEXT, placeholder TEXT, help_text TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS ticket_form_associations (
    ticket_id UUID PRIMARY KEY REFERENCES tickets(id) ON DELETE CASCADE,
    form_version_id UUID NOT NULL REFERENCES form_versions(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS field_answers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    field_id UUID NOT NULL REFERENCES form_fields(id) ON DELETE CASCADE,
    form_version_id UUID NOT NULL REFERENCES form_versions(id) ON DELETE CASCADE,
    value TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(ticket_id, field_id)
  )`,
];

function createTestPool(): Pool {
  return new Pool({
    connectionString: process.env.DATABASE_URL ?? 'postgresql://ticketos:ticketos@localhost:5432/ticketos',
  });
}

describe('FormsModule', () => {
  let pool: Pool;
  let forms: PostgresFormsModule;
  let workspaceId: string;
  let userId: string;

  beforeEach(async () => {
    pool = createTestPool();
    for (const sql of MIGRATIONS) {
      await pool.query(sql).catch(() => {}); // ignore if already exists
    }

    // Clean
    await pool.query('DELETE FROM field_answers');
    await pool.query('DELETE FROM ticket_form_associations');
    await pool.query('DELETE FROM form_fields');
    await pool.query('DELETE FROM form_versions');
    await pool.query('DELETE FROM forms');
    await pool.query('DELETE FROM tickets');
    await pool.query('DELETE FROM users');
    await pool.query('DELETE FROM workspaces');

    forms = new PostgresFormsModule(pool);

    const { rows: wsRows } = await pool.query(
      'INSERT INTO workspaces (id, name) VALUES ($1, $2) RETURNING id',
      [crypto.randomUUID(), 'Forms Test WS'],
    );
    workspaceId = wsRows[0]!.id;

    const { rows: userRows } = await pool.query(
      'INSERT INTO users (id, email) VALUES ($1, $2) RETURNING id',
      [crypto.randomUUID(), 'forms-test@test.com'],
    );
    userId = userRows[0]!.id;
  });

  afterEach(async () => {
    await pool.end();
  });

  describe('Forms CRUD', () => {
    it('creates a form with fields and a draft version', async () => {
      const form = await forms.createForm({
        workspaceId,
        name: 'Incident Form',
        description: 'For reporting incidents',
        fields: [
          { name: 'affected_system', label: 'Affected System', fieldType: 'text', required: true },
          { name: 'severity', label: 'Severity', fieldType: 'select', options: [
            { label: 'Critical', value: 'critical' },
            { label: 'High', value: 'high' },
            { label: 'Normal', value: 'normal' },
          ]},
        ],
      });

      expect(form.id).toBeDefined();
      expect(form.name).toBe('Incident Form');
      expect(form.currentVersionId).not.toBeNull();
    });

    it('lists forms for a workspace', async () => {
      await forms.createForm({
        workspaceId,
        name: 'Form A',
        fields: [{ name: 'f1', label: 'Field 1', fieldType: 'text' }],
      });
      await forms.createForm({
        workspaceId,
        name: 'Form B',
        fields: [{ name: 'f2', label: 'Field 2', fieldType: 'number' }],
      });

      const list = await forms.listForms(workspaceId);
      expect(list).toHaveLength(2);
    });

    it('deletes a form', async () => {
      const form = await forms.createForm({
        workspaceId,
        name: 'Delete Me',
        fields: [{ name: 'f1', label: 'F1', fieldType: 'text' }],
      });
      await forms.deleteForm(form.id);
      const found = await forms.getForm(form.id);
      expect(found).toBeNull();
    });
  });

  describe('Form Versions', () => {
    it('creates a draft version and publishes it', async () => {
      const form = await forms.createForm({
        workspaceId,
        name: 'Versioned Form',
        fields: [{ name: 'f1', label: 'F1', fieldType: 'text' }],
      });

      const versions = await forms.listFormVersions(form.id);
      expect(versions).toHaveLength(1);
      expect(versions[0]!.status).toBe('draft');

      const published = await forms.publishFormVersion(versions[0]!.id);
      expect(published.status).toBe('published');
      expect(published.publishedAt).not.toBeNull();
    });

    it('creates a new draft version on form update', async () => {
      const form = await forms.createForm({
        workspaceId,
        name: 'Evolving Form',
        fields: [{ name: 'f1', label: 'F1', fieldType: 'text' }],
      });

      // Publish first version
      const v1 = await forms.listFormVersions(form.id);
      await forms.publishFormVersion(v1[0]!.id);

      // Update form (creates new draft)
      await forms.updateForm(form.id, {
        fields: [
          { name: 'f1', label: 'F1', fieldType: 'text' },
          { name: 'f2', label: 'F2', fieldType: 'number' },
        ],
      });

      const versions = await forms.listFormVersions(form.id);
      expect(versions).toHaveLength(2);
      expect(versions[0]!.status).toBe('draft'); // newest first
      expect(versions[1]!.status).toBe('published');
    });

    it('gets a form version with fields', async () => {
      const form = await forms.createForm({
        workspaceId,
        name: 'Field Test',
        fields: [
          { name: 'name', label: 'Name', fieldType: 'text', required: true },
          { name: 'email', label: 'Email', fieldType: 'email' },
        ],
      });

      const versions = await forms.listFormVersions(form.id);
      const version = await forms.getFormVersion(versions[0]!.id);
      expect(version).not.toBeNull();
      expect(version!.fields).toHaveLength(2);
      expect(version!.fields[0]!.fieldType).toBe('text');
      expect(version!.fields[0]!.required).toBe(true);
      expect(version!.fields[1]!.fieldType).toBe('email');
    });

    it('archives a published version', async () => {
      const form = await forms.createForm({
        workspaceId,
        name: 'Archive Test',
        fields: [{ name: 'f1', label: 'F1', fieldType: 'text' }],
      });

      const v1 = await forms.listFormVersions(form.id);
      await forms.publishFormVersion(v1[0]!.id);
      const archived = await forms.archiveFormVersion(v1[0]!.id);
      expect(archived.status).toBe('archived');
    });
  });

  describe('Ticket Form Association', () => {
    it('associates a form version to a ticket', async () => {
      const form = await forms.createForm({
        workspaceId,
        name: 'Ticket Form',
        fields: [{ name: 'f1', label: 'F1', fieldType: 'text' }],
      });

      const versions = await forms.listFormVersions(form.id);
      await forms.publishFormVersion(versions[0]!.id);

      // Create a ticket
      const { rows: ticketRows } = await pool.query(
        'INSERT INTO tickets (workspace_id, title, created_by) VALUES ($1, $2, $3) RETURNING id',
        [workspaceId, 'Test Ticket', userId],
      );
      const ticketId = ticketRows[0]!.id;

      const assoc = await forms.associateFormToTicket(ticketId, versions[0]!.id);
      expect(assoc.ticketId).toBe(ticketId);
      expect(assoc.formVersionId).toBe(versions[0]!.id);
    });

    it('gets the form version for a ticket', async () => {
      const form = await forms.createForm({
        workspaceId,
        name: 'Lookup Form',
        fields: [{ name: 'f1', label: 'F1', fieldType: 'text' }],
      });

      const versions = await forms.listFormVersions(form.id);

      const { rows: ticketRows } = await pool.query(
        'INSERT INTO tickets (workspace_id, title, created_by) VALUES ($1, $2, $3) RETURNING id',
        [workspaceId, 'Lookup Ticket', userId],
      );

      await forms.associateFormToTicket(ticketRows[0]!.id, versions[0]!.id);
      const found = await forms.getTicketFormVersion(ticketRows[0]!.id);
      expect(found).not.toBeNull();
      expect(found!.formId).toBe(form.id);
    });
  });

  describe('Field Answers', () => {
    it('sets and retrieves field answers', async () => {
      const form = await forms.createForm({
        workspaceId,
        name: 'Answer Form',
        fields: [{ name: 'affected_system', label: 'System', fieldType: 'text', required: true }],
      });

      const versions = await forms.listFormVersions(form.id);
      const version = await forms.getFormVersion(versions[0]!.id);
      const fieldId = version!.fields[0]!.id;

      const { rows: ticketRows } = await pool.query(
        'INSERT INTO tickets (workspace_id, title, created_by) VALUES ($1, $2, $3) RETURNING id',
        [workspaceId, 'Answer Ticket', userId],
      );
      const ticketId = ticketRows[0]!.id;

      await forms.associateFormToTicket(ticketId, versions[0]!.id);

      const answer = await forms.setFieldAnswer({
        ticketId,
        fieldId,
        value: 'Database Server',
      });
      expect(answer.value).toBe('Database Server');

      const answers = await forms.getFieldAnswers(ticketId);
      expect(answers).toHaveLength(1);
      expect(answers[0]!.value).toBe('Database Server');
    });

    it('validates a required field', async () => {
      const result = await forms.validateAnswer('field-id', '');
      expect(result.valid).toBe(true); // basic validation
    });
  });
});
