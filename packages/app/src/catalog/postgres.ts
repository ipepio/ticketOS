import type { Pool } from 'pg';
import type {
  CatalogModule,
  CatalogItem,
  CreateCatalogItemInput,
  UpdateCatalogItemInput,
  CatalogItemStatus,
} from '@ticketos/domain';
import type { WorkspaceId, Uuid } from '@ticketos/shared';

interface CatalogRow {
  id: string;
  workspace_id: string;
  name: string;
  description: string;
  status: string;
  ticket_type_id: string | null;
  form_id: string | null;
  queue_id: string | null;
  priority: string;
  sla_policy_id: string | null;
  icon: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
  published_at: string | null;
}

function mapItem(r: CatalogRow): CatalogItem {
  return {
    id: r.id,
    workspaceId: r.workspace_id,
    name: r.name,
    description: r.description,
    status: r.status as CatalogItemStatus,
    ticketTypeId: r.ticket_type_id,
    formId: r.form_id,
    queueId: r.queue_id,
    priority: r.priority,
    slaPolicyId: r.sla_policy_id,
    icon: r.icon,
    sortOrder: r.sort_order,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    publishedAt: r.published_at,
  };
}

export class PostgresCatalog implements CatalogModule {
  constructor(private pool: Pool) {}

  async createItem(input: CreateCatalogItemInput): Promise<CatalogItem> {
    const { rows } = await this.pool.query<CatalogRow>(
      `INSERT INTO catalog_items (workspace_id, name, description, ticket_type_id, form_id, queue_id, priority, sla_policy_id, icon, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
      [
        input.workspaceId,
        input.name,
        input.description,
        input.ticketTypeId ?? null,
        input.formId ?? null,
        input.queueId ?? null,
        input.priority ?? 'normal',
        input.slaPolicyId ?? null,
        input.icon ?? null,
        input.sortOrder ?? 0,
      ],
    );
    return mapItem(rows[0]!);
  }

  async updateItem(id: Uuid, input: UpdateCatalogItemInput): Promise<CatalogItem> {
    const sets: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (input.name !== undefined) { sets.push(`name = $${idx++}`); values.push(input.name); }
    if (input.description !== undefined) { sets.push(`description = $${idx++}`); values.push(input.description); }
    if (input.ticketTypeId !== undefined) { sets.push(`ticket_type_id = $${idx++}`); values.push(input.ticketTypeId); }
    if (input.formId !== undefined) { sets.push(`form_id = $${idx++}`); values.push(input.formId); }
    if (input.queueId !== undefined) { sets.push(`queue_id = $${idx++}`); values.push(input.queueId); }
    if (input.priority !== undefined) { sets.push(`priority = $${idx++}`); values.push(input.priority); }
    if (input.slaPolicyId !== undefined) { sets.push(`sla_policy_id = $${idx++}`); values.push(input.slaPolicyId); }
    if (input.icon !== undefined) { sets.push(`icon = $${idx++}`); values.push(input.icon); }
    if (input.sortOrder !== undefined) { sets.push(`sort_order = $${idx++}`); values.push(input.sortOrder); }
    if (input.status !== undefined) {
      sets.push(`status = $${idx++}`); values.push(input.status);
      if (input.status === 'published') { sets.push('published_at = NOW()'); }
    }
    sets.push('updated_at = NOW()');
    values.push(id);

    const { rows } = await this.pool.query<CatalogRow>(
      `UPDATE catalog_items SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
      values,
    );
    if (!rows[0]) throw new Error(`Catalog item not found: ${id}`);
    return mapItem(rows[0]);
  }

  async deleteItem(id: Uuid): Promise<void> {
    await this.pool.query('DELETE FROM catalog_items WHERE id = $1', [id]);
  }

  async getItem(id: Uuid): Promise<CatalogItem | null> {
    const { rows } = await this.pool.query<CatalogRow>(
      'SELECT * FROM catalog_items WHERE id = $1',
      [id],
    );
    return rows[0] ? mapItem(rows[0]) : null;
  }

  async listItems(workspaceId: WorkspaceId, options?: { status?: CatalogItemStatus }): Promise<CatalogItem[]> {
    let sql = 'SELECT * FROM catalog_items WHERE workspace_id = $1';
    const values: unknown[] = [workspaceId];
    let idx = 2;

    if (options?.status) { sql += ` AND status = $${idx++}`; values.push(options.status); }

    sql += ' ORDER BY sort_order, name';
    const { rows } = await this.pool.query<CatalogRow>(sql, values);
    return rows.map(mapItem);
  }

  async publishItem(id: Uuid): Promise<CatalogItem> {
    return this.updateItem(id, { status: 'published' });
  }

  async archiveItem(id: Uuid): Promise<CatalogItem> {
    return this.updateItem(id, { status: 'archived' });
  }
}
