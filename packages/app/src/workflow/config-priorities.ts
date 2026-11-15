// Priority configuration — Postgres implementation (T3a, S2–S5, S7).
// Every statement filters workspace_id = $1. Mutations: one tx + client release.

import type { Pool, PoolClient } from 'pg';
import type { WorkspaceId, UserId, Uuid, AuditEventKind } from '@ticketos/shared';
import type {
  PriorityView, CreatePriorityInput, UpdatePriorityInput,
} from '@ticketos/domain';
import {
  ConfigurationValidationError, ConfigurationConflictError,
  ConfigurationNotFoundError,
} from '@ticketos/domain';
import type { PostgresAudit } from '../db/audit.js';

interface PriorityRow {
  id: string; workspace_id: string; name: string;
  description: string | null; color: string; sort_order: number;
  is_default: boolean; is_active: boolean;
}
function mapPriority(r: PriorityRow): PriorityView {
  return { id: r.id, workspaceId: r.workspace_id, name: r.name,
    description: r.description, color: r.color, sortOrder: r.sort_order,
    isDefault: r.is_default, isActive: r.is_active };
}
const PRI_COLS = 'id, workspace_id, name, description, color, sort_order, is_default, is_active';
function notFound(client: PoolClient) {
  client.query('ROLLBACK'); throw new ConfigurationNotFoundError('Priority not found', 'not-found');
}

// ---------------------------------------------------------------------------
// Transactions: each mutation is one tx with client.release() in finally.
// ---------------------------------------------------------------------------

async function tx<A>(pool: Pool, fn: (client: PoolClient) => A): Promise<A> {
  const client = await pool.connect();
  try { await client.query('BEGIN'); const result = await fn(client); await client.query('COMMIT'); return result; }
  catch (err) { await client.query('ROLLBACK'); throw err; }
  finally { client.release(); }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export class PostgresPriorityConfiguration {
  constructor(private pool: Pool, private audit: PostgresAudit) {}

  // -- Read --

  async listPriorities(workspaceId: WorkspaceId): Promise<PriorityView[]> {
    const { rows } = await this.pool.query<PriorityRow>(
      `SELECT ${PRI_COLS} FROM priorities WHERE workspace_id = $1 ORDER BY sort_order, name`, [workspaceId]);
    return rows.map(mapPriority);
  }

  // -- Create (V1: explicit appended sort_order) --

  async createPriority(workspaceId: WorkspaceId, actorId: UserId,
    input: CreatePriorityInput): Promise<PriorityView> {
    return tx(this.pool, async (client) => {
      const trimmed = input.name.trim();
      if (!trimmed) { throw new ConfigurationValidationError('priority-name-required', 'priority-name-required'); }
      const { rows: dupRows } = await client.query<PriorityRow>(
        `SELECT 1 FROM priorities WHERE workspace_id = $1 AND name = $2`, [workspaceId, trimmed]);
      if (dupRows.length) throw new ConfigurationConflictError('priority-name-duplicate', 'priority-name-duplicate');

      const maxRow = await client.query<{ sort_order: number }>(
        `SELECT COALESCE(MAX(sort_order), 0) + 1 AS sort_order FROM priorities WHERE workspace_id = $1`, [workspaceId]);

      const { rows: ins } = await client.query<PriorityRow>(
        `INSERT INTO priorities (workspace_id, name, description, color, sort_order, is_default, is_active)
         VALUES ($1, $2, $3, $4, $5, false, true)
         RETURNING ${PRI_COLS}`, [workspaceId, trimmed, input.description ?? null, input.color ?? '', maxRow.rows[0]!.sort_order]);

      await this.audit.appendViaClient(client, { kind: 'priority-created' as AuditEventKind, actorUserId: actorId, workspaceId, details: { name: trimmed } });
      return mapPriority(ins[0]!);
    });
  }

  // -- Update --

  async updatePriority(workspaceId: WorkspaceId, actorId: UserId, priorityId: Uuid,
    input: UpdatePriorityInput): Promise<PriorityView> {
    return tx(this.pool, async (client) => {
      const { rows: exist } = await client.query<PriorityRow>(
        `SELECT id FROM priorities WHERE workspace_id = $1 AND id = $2`, [workspaceId, priorityId]);
      if (!exist[0]) notFound(client);

      // V2/S5: a generic update must never bypass the default invariants.
      // Promoting a default clears the previous one in this transaction, and a
      // default can never be left inactive.
      if (input.isDefault === true || input.isActive === false) {
        const { rows: cur } = await client.query<{ is_default: boolean; is_active: boolean }>(
          `SELECT is_default, is_active FROM priorities WHERE workspace_id = $1 AND id = $2`,
          [workspaceId, priorityId]);
        const current = cur[0]!;
        const willBeActive = input.isActive ?? current.is_active;
        const willBeDefault = input.isDefault ?? current.is_default;
        if (willBeDefault && !willBeActive) {
          throw new ConfigurationValidationError('default-inactive', 'default-inactive');
        }
        if (input.isDefault === true && !current.is_default) {
          await client.query(
            `UPDATE priorities SET is_default = false WHERE workspace_id = $1 AND is_default AND id <> $2`,
            [workspaceId, priorityId]);
        }
      }

      let name = input.name;
      if (name != null) {
        const trimmed = name.trim();
        if (!trimmed) throw new ConfigurationValidationError('priority-name-required', 'priority-name-required');
        const { rows: dup } = await client.query(`SELECT 1 FROM priorities WHERE workspace_id = $1 AND name = $2 AND id != $3`,
          [workspaceId, trimmed, priorityId]);
        if (dup.length) throw new ConfigurationConflictError('priority-name-duplicate', 'priority-name-duplicate');
        name = trimmed;
      }

      const sets: string[] = []; const vals: unknown[] = []; let idx = 1;
      if (name != null) { sets.push(`name=$${idx++}`); vals.push(name); }
      if (input.description != null) { sets.push(`description=$${idx++}`); vals.push(input.description); }
      if (input.color != null) { sets.push(`color=$${idx++}`); vals.push(input.color); }
      if (input.sortOrder != null) { sets.push(`sort_order=$${idx++}`); vals.push(input.sortOrder); }
      if (input.isDefault != null) { sets.push(`is_default=$${idx++}`); vals.push(input.isDefault); }
      if (input.isActive != null) { sets.push(`is_active=$${idx++}`); vals.push(input.isActive); }

      if (!sets.length) {
        await client.query('COMMIT');
        const { rows } = await client.query<PriorityRow>(`SELECT ${PRI_COLS} FROM priorities WHERE id = $1`, [priorityId]);
        return mapPriority(rows[0]!);
      }
      vals.push(priorityId, workspaceId);

      const { rows: updated } = await client.query<PriorityRow>(
        `UPDATE priorities SET ${sets.join(',')} WHERE id=$${idx} AND workspace_id=$${idx + 1} RETURNING ${PRI_COLS}`, vals);
      if (!updated[0]) notFound(client);

      await this.audit.appendViaClient(client, { kind: 'priority-updated' as AuditEventKind, actorUserId: actorId, workspaceId,
        details: { priorityId, changes: input } });
      return mapPriority(updated[0]!);
    });
  }

  // -- Reorder (V3: verify exact id set, assign 1..n) --

  async reorderPriorities(workspaceId: WorkspaceId, actorId: UserId, orderedIds: Uuid[]): Promise<void> {
    return tx(this.pool, async (client) => {
      const { rows: ec } = await client.query<{ count: number }>(
        `SELECT COUNT(*) FROM priorities WHERE workspace_id = $1 AND id = ANY($2::uuid[])`, [workspaceId, orderedIds]);
      const { rows: tc } = await client.query<{ count: number }>(
        `SELECT COUNT(*) FROM priorities WHERE workspace_id = $1`, [workspaceId]);
      if (Number(ec[0]!.count) !== orderedIds.length || Number(tc[0]!.count) !== orderedIds.length) {
        throw new ConfigurationValidationError('sort-order-invalid', 'sort-order-invalid');
      }
      if (orderedIds.length) {
        await client.query(
          `WITH o AS (SELECT unnest($1::uuid[]) AS id, generate_subscripts($1::uuid[], 1) AS rn)
           UPDATE priorities p SET sort_order = o.rn FROM o WHERE p.id = o.id AND p.workspace_id = $2`,
          [orderedIds, workspaceId]);
      }
      await this.audit.appendViaClient(client, { kind: 'config-updated' as AuditEventKind, actorUserId: actorId, workspaceId,
        details: { orderedCount: orderedIds.length } });
    });
  }

  // -- Activate / deactivate (V2: block deactivating the default) --

  async setPriorityActive(workspaceId: WorkspaceId, actorId: UserId,
    priorityId: Uuid, isActive: boolean): Promise<PriorityView> {
    return tx(this.pool, async (client) => {
      const { rows: exist } = await client.query<PriorityRow>(
        `SELECT id, is_default FROM priorities WHERE workspace_id = $1 AND id = $2`, [workspaceId, priorityId]);
      if (!exist[0]) notFound(client);
      const p1 = exist[0]!;
      if (!isActive && p1.is_default) { throw new ConfigurationValidationError('default-inactive', 'default-inactive'); }

      const { rows: updated } = await client.query<PriorityRow>(
        `UPDATE priorities SET is_active = $3 WHERE id = $1 AND workspace_id = $2 RETURNING ${PRI_COLS}`,
        [priorityId, workspaceId, isActive]);
      if (!updated[0]) notFound(client);

      const kind: AuditEventKind = (isActive ? 'priority-updated' : 'priority-deactivated') as AuditEventKind;
      await this.audit.appendViaClient(client, { kind, actorUserId: actorId, workspaceId, details: { priorityId, isActive } });
      return mapPriority(updated[0]!);
    });
  }

  // -- Default (S5, V2: clear→verify→set in one tx, no two active defaults) --

  async setDefaultPriority(workspaceId: WorkspaceId, actorId: UserId, priorityId: Uuid): Promise<PriorityView> {
    return tx(this.pool, async (client) => {
      // 1. Clear previous default.
      await client.query(`UPDATE priorities SET is_default = false WHERE workspace_id = $1 AND is_default`, [workspaceId]);

      // 2. Verify target exists and is active.
      const { rows: target } = await client.query<PriorityRow>(
        `SELECT id, is_active FROM priorities WHERE workspace_id = $1 AND id = $2`, [workspaceId, priorityId]);
      if (!target[0]) notFound(client);
      const p2 = target[0]!;
      if (!p2.is_active) { client.query('ROLLBACK'); throw new ConfigurationValidationError('default-inactive', 'default-inactive'); }

      // 3. Set new default.
      const { rows: updated } = await client.query<PriorityRow>(
        `UPDATE priorities SET is_default = true WHERE id = $1 AND workspace_id = $2 RETURNING ${PRI_COLS}`,
        [priorityId, workspaceId]);
      if (!updated[0]) notFound(client);

      await this.audit.appendViaClient(client, { kind: 'priority-default-set' as AuditEventKind, actorUserId: actorId, workspaceId,
        details: { priorityId } });
      return mapPriority(updated[0]!);
    });
  }
}