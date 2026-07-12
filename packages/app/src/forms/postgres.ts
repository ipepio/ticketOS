import type { Pool } from 'pg';
import type {
  FormsModule,
  Form,
  FormVersion,
  FormField,
  FieldAnswer,
  TicketFormAssociation,
  CreateFormInput,
  UpdateFormInput,
  SetFieldAnswerInput,
  FieldType,
  FormVersionStatus,
  FieldOption,
} from '@ticketos/domain';
import type { WorkspaceId, Uuid } from '@ticketos/shared';

interface FormRow {
  id: string;
  workspace_id: string;
  name: string;
  description: string | null;
  current_version_id: string | null;
  created_at: string;
  updated_at: string;
}

interface VersionRow {
  id: string;
  form_id: string;
  version: number;
  status: string;
  title: string;
  description: string | null;
  created_at: string;
  published_at: string | null;
}

interface FieldRow {
  id: string;
  form_version_id: string;
  name: string;
  label: string;
  field_type: string;
  required: boolean;
  options: string; // JSON
  default_value: string | null;
  placeholder: string | null;
  help_text: string | null;
  sort_order: number;
  created_at: string;
}

interface AnswerRow {
  id: string;
  ticket_id: string;
  field_id: string;
  form_version_id: string;
  value: string;
  created_at: string;
  updated_at: string;
}

interface AssociationRow {
  ticket_id: string;
  form_version_id: string;
  created_at: string;
}

function mapForm(r: FormRow): Form {
  return {
    id: r.id,
    workspaceId: r.workspace_id,
    name: r.name,
    description: r.description,
    currentVersionId: r.current_version_id,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function mapVersion(r: VersionRow): FormVersion {
  return {
    id: r.id,
    formId: r.form_id,
    version: r.version,
    status: r.status as FormVersionStatus,
    title: r.title,
    description: r.description,
    fields: [], // populated separately
    createdAt: r.created_at,
    publishedAt: r.published_at,
  };
}

function mapField(r: FieldRow): FormField {
  const opts = typeof r.options === 'string' ? JSON.parse(r.options) : r.options;
  return {
    id: r.id,
    formVersionId: r.form_version_id,
    name: r.name,
    label: r.label,
    fieldType: r.field_type as FieldType,
    required: r.required,
    options: opts as FieldOption[],
    defaultValue: r.default_value,
    placeholder: r.placeholder,
    helpText: r.help_text,
    sortOrder: r.sort_order,
    createdAt: r.created_at,
  };
}

function mapAnswer(r: AnswerRow): FieldAnswer {
  return {
    id: r.id,
    ticketId: r.ticket_id,
    fieldId: r.field_id,
    formVersionId: r.form_version_id,
    value: r.value,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export class PostgresFormsModule implements FormsModule {
  constructor(private pool: Pool) {}

  // ---------------------------------------------------------------------------
  // Forms
  // ---------------------------------------------------------------------------

  async createForm(input: CreateFormInput): Promise<Form> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Create form
      const { rows: formRows } = await client.query<FormRow>(
        `INSERT INTO forms (workspace_id, name, description)
         VALUES ($1, $2, $3) RETURNING *`,
        [input.workspaceId, input.name, input.description ?? null],
      );
      const form = mapForm(formRows[0]!);

      // Create first version (draft)
      const { rows: versionRows } = await client.query<VersionRow>(
        `INSERT INTO form_versions (form_id, version, status, title, description)
         VALUES ($1, 1, 'draft', $2, $3) RETURNING *`,
        [form.id, input.name, input.description ?? null],
      );
      const version = mapVersion(versionRows[0]!);

      // Create fields
      for (let i = 0; i < input.fields.length; i++) {
        const f = input.fields[i]!;
        await client.query(
          `INSERT INTO form_fields (form_version_id, name, label, field_type, required, options, default_value, placeholder, help_text, sort_order)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [
            version.id,
            f.name,
            f.label,
            f.fieldType,
            f.required ?? false,
            JSON.stringify(f.options ?? []),
            f.defaultValue ?? null,
            f.placeholder ?? null,
            f.helpText ?? null,
            f.sortOrder ?? i,
          ],
        );
      }

      // Link current version
      await client.query(
        'UPDATE forms SET current_version_id = $1 WHERE id = $2',
        [version.id, form.id],
      );

      await client.query('COMMIT');

      return { ...form, currentVersionId: version.id };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async updateForm(id: Uuid, input: UpdateFormInput): Promise<Form> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Get current form
      const { rows: existing } = await client.query<FormRow>(
        'SELECT * FROM forms WHERE id = $1',
        [id],
      );
      if (!existing[0]) throw new Error(`Form not found: ${id}`);

      // Update form metadata
      if (input.name || input.description !== undefined) {
        const sets: string[] = [];
        const values: unknown[] = [];
        let idx = 1;
        if (input.name) { sets.push(`name = $${idx++}`); values.push(input.name); }
        if (input.description !== undefined) { sets.push(`description = $${idx++}`); values.push(input.description); }
        sets.push('updated_at = NOW()');
        values.push(id);
        await client.query(`UPDATE forms SET ${sets.join(', ')} WHERE id = $${idx}`, values);
      }

      // Create new draft version if fields changed
      if (input.fields) {
        const { rows: maxVersion } = await client.query<{ max: number }>(
          'SELECT COALESCE(MAX(version), 0) AS max FROM form_versions WHERE form_id = $1',
          [id],
        );
        const nextVersion = maxVersion[0]!.max + 1;

        const { rows: versionRows } = await client.query<VersionRow>(
          `INSERT INTO form_versions (form_id, version, status, title, description)
           VALUES ($1, $2, 'draft', $3, $4) RETURNING *`,
          [id, nextVersion, input.name ?? existing[0]!.name, input.description ?? existing[0]!.description],
        );
        const version = mapVersion(versionRows[0]!);

        for (let i = 0; i < input.fields.length; i++) {
          const f = input.fields[i]!;
          await client.query(
            `INSERT INTO form_fields (form_version_id, name, label, field_type, required, options, default_value, placeholder, help_text, sort_order)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
            [
              version.id, f.name, f.label, f.fieldType,
              f.required ?? false, JSON.stringify(f.options ?? []),
              f.defaultValue ?? null, f.placeholder ?? null,
              f.helpText ?? null, f.sortOrder ?? i,
            ],
          );
        }

        // Update current version
        await client.query(
          'UPDATE forms SET current_version_id = $1, updated_at = NOW() WHERE id = $2',
          [version.id, id],
        );
      }

      await client.query('COMMIT');

      const { rows: updated } = await client.query<FormRow>(
        'SELECT * FROM forms WHERE id = $1',
        [id],
      );
      return mapForm(updated[0]!);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async deleteForm(id: Uuid): Promise<void> {
    await this.pool.query('DELETE FROM forms WHERE id = $1', [id]);
  }

  async getForm(id: Uuid): Promise<Form | null> {
    const { rows } = await this.pool.query<FormRow>(
      'SELECT * FROM forms WHERE id = $1',
      [id],
    );
    return rows[0] ? mapForm(rows[0]) : null;
  }

  async listForms(workspaceId: WorkspaceId): Promise<Form[]> {
    const { rows } = await this.pool.query<FormRow>(
      'SELECT * FROM forms WHERE workspace_id = $1 ORDER BY name',
      [workspaceId],
    );
    return rows.map(mapForm);
  }

  // ---------------------------------------------------------------------------
  // Form Versions
  // ---------------------------------------------------------------------------

  async getFormVersion(id: Uuid): Promise<FormVersion | null> {
    const { rows } = await this.pool.query<VersionRow>(
      'SELECT * FROM form_versions WHERE id = $1',
      [id],
    );
    if (!rows[0]) return null;
    const version = mapVersion(rows[0]);
    version.fields = await this.getVersionFields(version.id);
    return version;
  }

  async getFormVersionByForm(formId: Uuid, version: number): Promise<FormVersion | null> {
    const { rows } = await this.pool.query<VersionRow>(
      'SELECT * FROM form_versions WHERE form_id = $1 AND version = $2',
      [formId, version],
    );
    if (!rows[0]) return null;
    const v = mapVersion(rows[0]);
    v.fields = await this.getVersionFields(v.id);
    return v;
  }

  async listFormVersions(formId: Uuid): Promise<FormVersion[]> {
    const { rows } = await this.pool.query<VersionRow>(
      'SELECT * FROM form_versions WHERE form_id = $1 ORDER BY version DESC',
      [formId],
    );
    return rows.map(mapVersion);
  }

  async publishFormVersion(versionId: Uuid): Promise<FormVersion> {
    const { rows } = await this.pool.query<VersionRow>(
      `UPDATE form_versions SET status = 'published', published_at = NOW()
       WHERE id = $1 AND status = 'draft' RETURNING *`,
      [versionId],
    );
    if (!rows[0]) throw new Error(`Form version not found or not draft: ${versionId}`);
    return mapVersion(rows[0]);
  }

  async archiveFormVersion(versionId: Uuid): Promise<FormVersion> {
    const { rows } = await this.pool.query<VersionRow>(
      `UPDATE form_versions SET status = 'archived'
       WHERE id = $1 AND status = 'published' RETURNING *`,
      [versionId],
    );
    if (!rows[0]) throw new Error(`Form version not found or not published: ${versionId}`);
    return mapVersion(rows[0]);
  }

  private async getVersionFields(versionId: Uuid): Promise<FormField[]> {
    const { rows } = await this.pool.query<FieldRow>(
      'SELECT * FROM form_fields WHERE form_version_id = $1 ORDER BY sort_order',
      [versionId],
    );
    return rows.map(mapField);
  }

  // ---------------------------------------------------------------------------
  // Ticket Form Association
  // ---------------------------------------------------------------------------

  async associateFormToTicket(ticketId: Uuid, formVersionId: Uuid): Promise<TicketFormAssociation> {
    const { rows } = await this.pool.query<AssociationRow>(
      `INSERT INTO ticket_form_associations (ticket_id, form_version_id)
       VALUES ($1, $2) RETURNING *`,
      [ticketId, formVersionId],
    );
    return {
      ticketId: rows[0]!.ticket_id,
      formVersionId: rows[0]!.form_version_id,
      createdAt: rows[0]!.created_at,
    };
  }

  async getTicketFormVersion(ticketId: Uuid): Promise<FormVersion | null> {
    const { rows } = await this.pool.query<AssociationRow & { id: string; form_id: string; version: number; status: string; title: string; description: string | null; created_at: string; published_at: string | null }>(
      `SELECT fv.*, tfa.ticket_id, tfa.form_version_id, tfa.created_at AS assoc_created_at
       FROM ticket_form_associations tfa
       JOIN form_versions fv ON fv.id = tfa.form_version_id
       WHERE tfa.ticket_id = $1`,
      [ticketId],
    );
    if (!rows[0]) return null;
    const version = mapVersion(rows[0]);
    version.fields = await this.getVersionFields(version.id);
    return version;
  }

  // ---------------------------------------------------------------------------
  // Field Answers
  // ---------------------------------------------------------------------------

  async setFieldAnswer(input: SetFieldAnswerInput): Promise<FieldAnswer> {
    const { rows } = await this.pool.query<AnswerRow>(
      `INSERT INTO field_answers (ticket_id, field_id, form_version_id, value)
       VALUES ($1, $2, (SELECT form_version_id FROM ticket_form_associations WHERE ticket_id = $1), $3)
       ON CONFLICT (ticket_id, field_id) DO UPDATE SET value = $3, updated_at = NOW()
       RETURNING *`,
      [input.ticketId, input.fieldId, input.value],
    );
    return mapAnswer(rows[0]!);
  }

  async getFieldAnswers(ticketId: Uuid): Promise<FieldAnswer[]> {
    const { rows } = await this.pool.query<AnswerRow>(
      'SELECT * FROM field_answers WHERE ticket_id = $1 ORDER BY created_at',
      [ticketId],
    );
    return rows.map(mapAnswer);
  }

  async validateAnswer(_fieldId: Uuid, value: string): Promise<{ valid: boolean; error?: string }> {
    // Basic validation — field type validation will be enhanced later
    if (value === null || value === undefined) {
      return { valid: false, error: 'Value is required' };
    }
    return { valid: true };
  }
}
