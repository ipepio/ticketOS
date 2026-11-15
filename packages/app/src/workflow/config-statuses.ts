import type { Pool, PoolClient } from 'pg';
import type { StatusView, CreateStatusInput, UpdateStatusInput } from '@ticketos/domain';
import type { WorkspaceId, Uuid, AuditEventKind } from '@ticketos/shared';
import {
  ConfigurationConflictError,
  ConfigurationNotFoundError,
  ConfigurationValidationError,
} from '@ticketos/domain';
import { PostgresAudit } from '../db/audit.js';

interface StatusRow {
  id: string; workspace_id: string; name: string; category: string;
  description: string | null; color: string | null; sort_order: number;
  is_default: boolean; is_active: boolean;
}

function mapStatus(r: StatusRow): StatusView {
  return {
    id: r.id, workspaceId: r.workspace_id, name: r.name,
    category: r.category as StatusView['category'],
    description: r.description, color: r.color ?? '#64748b',
    sortOrder: r.sort_order, isDefault: r.is_default, isActive: r.is_active,
  };
}

async function txn<T>(pool: Pool, fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const r = await fn(c);
    await c.query('COMMIT');
    return r;
  } catch (e) {
    await c.query('ROLLBACK');
    throw e;
  } finally { c.release(); }
}

export class PostgresStatusConfiguration {
  constructor(private pool: Pool) {}

  // ── listStatuses (V1 / S4) ─────────────────────────────────────────────

  async listStatuses(workspaceId: WorkspaceId): Promise<StatusView[]> {
    const { rows } = await this.pool.query<StatusRow>(
      `SELECT id, workspace_id, name, category, description, color, `
      + `sort_order, is_default, is_active `
      + `FROM statuses WHERE workspace_id = $1 ORDER BY sort_order, name`,
      [workspaceId],
    );
    return rows.map(mapStatus);
  }

  // ── createStatus (V1 / S2, S3) ─────────────────────────────────────────

  async createStatus(
    workspaceId: WorkspaceId,
    actorId: string,
    input: CreateStatusInput,
  ): Promise<StatusView> {
    const name = input.name.trim();
    if (!name) {
      throw new ConfigurationValidationError('status-name-required', 'status-name-required');
    }
    return txn(this.pool, async (c) => {
      // Validate category
      if (!await c.query(`SELECT 1 FROM status_categories WHERE name = $1`, [input.category]).then(r => r.rowCount)) {
        throw new ConfigurationValidationError('status-category-invalid', 'status-category-invalid');
      }
      // Compute explicit appended position (V1 — never rely on DEFAULT 0)
      const maxR = await c.query(
        `SELECT COALESCE(MAX(sort_order), 0) AS mx FROM statuses WHERE workspace_id = $1`,
        [workspaceId]);
      // SAFETY: PostgreSQL coalesces MAX to 0 (a number) when empty; alias
      // guarantees the shape so the cast is sound.
      const sortOrder = ((maxR.rows[0]! as unknown as { mx: number }).mx as number) + 1;
      // Check duplicate (workspace_id, name)
      if (await c.query(
        `SELECT 1 FROM statuses WHERE workspace_id = $1 AND name = $2`,
        [workspaceId, name]).then(r => r.rowCount)) {
        throw new ConfigurationConflictError('status-name-duplicate', 'status-name-duplicate');
      }
      // Insert
      const ins = await c.query<StatusRow>(
        `INSERT INTO statuses `
        + `(workspace_id, name, category, description, color, sort_order, is_default, is_active) `
        + `VALUES ($1, $2, $3, $4, $5, $6, false, true) RETURNING *`,
        [workspaceId, name, input.category, input.description ?? null, input.color ?? '#64748b', sortOrder]);
      // Audit
      await new PostgresAudit(this.pool).appendViaClient(c, {
        kind: 'status-created' as AuditEventKind, actorUserId: actorId, workspaceId,
        details: { name, category: input.category, action: 'created' },
      });
      return mapStatus(ins.rows[0]!);
    });
  }

  // ── updateStatus (S3) ──────────────────────────────────────────────────

  async updateStatus(
    workspaceId: WorkspaceId,
    actorId: string,
    statusId: Uuid,
    input: UpdateStatusInput,
  ): Promise<StatusView> {
    return txn(this.pool, async (c) => {
      // Verify workspace ownership
      if (!await c.query(
        `SELECT 1 FROM statuses WHERE id = $1 AND workspace_id = $2`,
        [statusId, workspaceId]).then(r => r.rowCount)) {
        throw new ConfigurationNotFoundError('not-found');
      }
      // Validate name
      const name =
        input.name !== undefined && input.name !== null
          ? input.name.trim()
          : undefined;
      if (input.name !== undefined && input.name !== null && !name) {
        throw new ConfigurationValidationError('status-name-required', 'status-name-required');
      }
      // Validate category
      if (input.category !== undefined && !await c.query(
        `SELECT 1 FROM status_categories WHERE name = $1`, [input.category])
          .then(r => r.rowCount)) {
        throw new ConfigurationValidationError('status-category-invalid', 'status-category-invalid');
      }
      // Check duplicate if name changing
      if (name !== undefined && await c.query(
        `SELECT 1 FROM statuses WHERE workspace_id = $1 AND name = $2 AND id != $3`,
        [workspaceId, name, statusId]).then(r => r.rowCount)) {
        throw new ConfigurationConflictError('status-name-duplicate', 'status-name-duplicate');
      }
      // Build SET clauses — column names come from literals, not user input
      const sets: string[] = [];
      const vals: unknown[] = [];
      let idx = 1;
      if (name !== undefined)          { sets.push(`name = $${idx}`);      vals.push(name);       idx++; }
      if (input.category !== undefined) { sets.push(`category = $${idx}`); vals.push(input.category); idx++; }
      if (input.description !== undefined) { sets.push(`description = $${idx}`); vals.push(input.description); idx++; }
      if (input.color !== undefined)    { sets.push(`color = $${idx}`);    vals.push(input.color);    idx++; }
      if (input.sortOrder !== undefined) { sets.push(`sort_order = $${idx}`); vals.push(input.sortOrder); idx++; }
      if (input.isDefault !== undefined) { sets.push(`is_default = $${idx}`); vals.push(input.isDefault); idx++; }
      if (input.isActive !== undefined)  { sets.push(`is_active = $${idx}`);  vals.push(input.isActive);  idx++; }
      // Early exit: no changes
      if (!sets.length) {
        const cur = await c.query<StatusRow>(
          `SELECT id, workspace_id, name, category, description, color, `
          + `sort_order, is_default, is_active FROM statuses WHERE id = $1 AND workspace_id = $2`,
          [statusId, workspaceId]);
        return mapStatus(cur.rows[0]!);
      }
      vals.push(statusId, workspaceId);
      const up = await c.query<StatusRow>(
        `UPDATE statuses SET ${sets.join(', ')} WHERE id = $${idx} AND workspace_id = $${idx + 1} RETURNING *`,
        vals);
      if (!up.rows[0]) throw new ConfigurationNotFoundError('not-found');
      // Audit
      const details: Record<string, unknown> = { action: 'updated' };
      if (name !== undefined) details.name = name;
      if (input.category !== undefined) details.category = input.category;
      await new PostgresAudit(this.pool).appendViaClient(c, {
        kind: 'status-updated' as AuditEventKind, actorUserId: actorId, workspaceId, details,
      });
      return mapStatus(up.rows[0]);
    });
  }

  // ── reorderStatuses (V1 / S4) ──────────────────────────────────────────

  async reorderStatuses(
    workspaceId: WorkspaceId,
    actorId: string,
    orderedIds: Uuid[],
  ): Promise<void> {
    if (!orderedIds.length) {
      throw new ConfigurationValidationError('sort-order-invalid', 'sort-order-invalid');
    }
    return txn(this.pool, async (c) => {
      // Collect workspace IDs via a single query
      const wsRows = await c.query(
        `SELECT id FROM statuses WHERE workspace_id = $1`, [workspaceId]);
      const wsIds = new Map<string, true>();
      for (const r of wsRows.rows) wsIds.set(r.id, true);
      if (!wsIds.size) throw new ConfigurationNotFoundError('not-found');
      // Validate input: no duplicates, all belong to workspace, complete set
      const inpIds = new Map<string, true>();
      for (const id of orderedIds) {
        if (inpIds.has(id)) throw new ConfigurationValidationError('sort-order-invalid', 'sort-order-invalid');
        if (!wsIds.has(id)) throw new ConfigurationNotFoundError('not-found');
        inpIds.set(id, true);
      }
      if (inpIds.size !== wsIds.size) {
        throw new ConfigurationValidationError('sort-order-invalid', 'sort-order-invalid');
      }
      // Update sort_order via unnest — fully parameterized, no string interp.
      // $1 = uuid[] of ids, $2 = int[] of positions, $3 = workspace_id
      // SAFETY: uuid[] is accepted by pg driver; cast is a safe coercion
      // from Uuid[] → string[] because pg sends arrays as JS strings.
      const idsArr = orderedIds as unknown as string[];
      const positions = orderedIds.map((_, i) => i + 1);
      await c.query(
        `WITH ordered(id, sort_order) AS (SELECT * FROM unnest($1::uuid[], $2::int[]) AS t(id, sort_order)) `
        + `UPDATE statuses s SET sort_order = o.sort_order FROM ordered o `
        + `WHERE o.id = s.id AND s.workspace_id = $3`,
        [idsArr, positions, workspaceId]);
      // Audit
      await new PostgresAudit(this.pool).appendViaClient(c, {
        kind: 'config-updated' as AuditEventKind, actorUserId: actorId, workspaceId,
        details: { action: 'reorder', entityType: 'status', count: orderedIds.length },
      });
    });
  }

  // ── setStatusActive (V2 / S6) ──────────────────────────────────────────

  async setStatusActive(
    workspaceId: WorkspaceId,
    actorId: string,
    statusId: Uuid,
    isActive: boolean,
  ): Promise<StatusView> {
    return txn(this.pool, async (c) => {
      // Verify existence and workspace ownership, read current state
      const cur = await c.query<StatusRow>(
        `SELECT is_active, is_default FROM statuses WHERE id = $1 AND workspace_id = $2`,
        [statusId, workspaceId]);
      if (!cur.rows[0]) throw new ConfigurationNotFoundError('not-found');
      const curDef = cur.rows[0].is_default;
      const curAct = cur.rows[0].is_active;
      // V2: deactivating the current default is forbidden
      if (!isActive && curDef && curAct) {
        throw new ConfigurationValidationError('default-inactive', 'default-inactive');
      }
      // Determine audit kind
      const kind = isActive ? ('status-updated' as AuditEventKind) : ('status-deactivated' as AuditEventKind);
      await new PostgresAudit(this.pool).appendViaClient(c, {
        kind, actorUserId: actorId, workspaceId,
        details: { action: isActive ? 'activate' : 'deactivate', statusId },
      });
      // Update
      await c.query(
        `UPDATE statuses SET is_active = $1 WHERE id = $2 AND workspace_id = $3`,
        [isActive, statusId, workspaceId]);
      // Return updated view
      const upd = await c.query<StatusRow>(
        `SELECT id, workspace_id, name, category, description, color, `
        + `sort_order, is_default, is_active FROM statuses WHERE id = $1 AND workspace_id = $2`,
        [statusId, workspaceId]);
      return mapStatus(upd.rows[0]!);
    });
  }
}