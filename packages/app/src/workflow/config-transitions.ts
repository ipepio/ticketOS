// Transition configuration — Postgres implementation (T3c, S2–S5).
// Every statement filters workspace_id = $1. Mutations: one tx + client.release().

import type { Pool, PoolClient } from 'pg';
import type { WorkspaceId, UserId, Uuid, AuditEventKind } from '@ticketos/shared';
import type {
  TransitionView, SelectableConfiguration,
  StatusView, PriorityView, TicketTypeView,
} from '@ticketos/domain';
import {
  ConfigurationValidationError, ConfigurationConflictError,
  ConfigurationNotFoundError,
} from '@ticketos/domain';
import { PostgresAudit } from '../db/audit.js';

// ---------------------------------------------------------------------------
// Row types (explicit mapping to domain View)
// ---------------------------------------------------------------------------

interface TransitionRow {
  id: string; workspace_id: string; from_status_id: string; to_status_id: string;
  from_name: string; to_name: string;
}
function mapTransition(r: TransitionRow): TransitionView {
  return {
    id: r.id, workspaceId: r.workspace_id,
    fromStatusId: r.from_status_id, toStatusId: r.to_status_id,
  };
}

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

interface PriorityRow {
  id: string; workspace_id: string; name: string;
  description: string | null; color: string; sort_order: number;
  is_default: boolean; is_active: boolean;
}
function mapPriority(r: PriorityRow): PriorityView {
  return {
    id: r.id, workspaceId: r.workspace_id, name: r.name,
    description: r.description, color: r.color,
    sortOrder: r.sort_order, isDefault: r.is_default, isActive: r.is_active,
  };
}

interface TicketTypeRow {
  id: string; workspace_id: string; name: string; category: string;
  description: string | null; color: string; sort_order: number;
  is_default: boolean; is_active: boolean;
}
function mapTicketType(r: TicketTypeRow): TicketTypeView {
  return {
    id: r.id, workspaceId: r.workspace_id, name: r.name,
    category: r.category as TicketTypeView['category'],
    description: r.description, color: r.color,
    sortOrder: r.sort_order, isDefault: r.is_default, isActive: r.is_active,
  };
}

// ---------------------------------------------------------------------------
// Tx helper (pattern from config-statuses.ts)
// ---------------------------------------------------------------------------

async function txn<T>(pool: Pool, fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const c = await pool.connect();
  try { await c.query('BEGIN'); const r = await fn(c); await c.query('COMMIT'); return r; }
  catch (e) { await c.query('ROLLBACK'); throw e; }
  finally { c.release(); }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export class PostgresTransitionConfiguration {
  constructor(private pool: Pool) {}

  // -- listTransitions (S2) --
  // Join both statuses so each entry carries the from/to status ids and names.

  async listTransitions(workspaceId: WorkspaceId): Promise<TransitionView[]> {
    const { rows } = await this.pool.query<TransitionRow>(
      `SELECT t.id, t.workspace_id, t.from_status_id, t.to_status_id, `
      + `fs.name AS from_name, ts.name AS to_name `
      + `FROM transitions t `
      + `JOIN statuses fs ON t.from_status_id = fs.id `
      + `JOIN statuses ts ON t.to_status_id = ts.id `
      + `WHERE t.workspace_id = $1`, [workspaceId]);
    return rows.map(mapTransition);
  }

  // -- addTransition (S2, S3) --
  // One tx: verify workspace + active, self-transition guard, duplicate guard,
  // insert, audit event.

  async addTransition(
    workspaceId: WorkspaceId, actorId: UserId,
    fromStatusId: Uuid, toStatusId: Uuid,
  ): Promise<TransitionView> {
    return txn(this.pool, async (c) => {
      // 1. Verify both statuses belong to the workspace and are active.
      const statusIds = [fromStatusId, toStatusId];
      const { rows: statusRows } = await c.query<StatusRow>(
        `SELECT id, is_active FROM statuses WHERE workspace_id = $1 AND id = ANY($2::uuid[])`,
        [workspaceId, statusIds]);

      if (statusRows.length !== 2) {
        throw new ConfigurationNotFoundError('not-found');
      }
      if (!statusRows.every(s => s.is_active)) {
        throw new ConfigurationNotFoundError('not-found');
      }

      // 2. Self-transition guard → transition-invalid.
      if (fromStatusId === toStatusId) {
        throw new ConfigurationValidationError(
          'Transition cannot go from a status to itself', 'transition-invalid');
      }

      // 3. Duplicate guard → transition-duplicate (not unique constraint leak).
      const { rows: dupRows } = await c.query(
        `SELECT 1 FROM transitions WHERE workspace_id = $1 AND from_status_id = $2 AND to_status_id = $3`,
        [workspaceId, fromStatusId, toStatusId]);
      if (dupRows.length > 0) {
        throw new ConfigurationConflictError('transition-duplicate', 'transition-duplicate');
      }

      // 4. Insert the transition.
      const { rows: ins } = await c.query<TransitionRow>(
        `INSERT INTO transitions (workspace_id, from_status_id, to_status_id) `
        + `VALUES ($1, $2, $3) `
        + `RETURNING id, workspace_id, from_status_id, to_status_id`,
        [workspaceId, fromStatusId, toStatusId]);

      // 5. Audit event.
      await new PostgresAudit(this.pool).appendViaClient(c, {
        kind: 'config-updated' as AuditEventKind,
        actorUserId: actorId, workspaceId,
        details: { action: 'transition-added' },
      });

      return mapTransition(ins[0]!);
    });
  }

  // -- removeTransition (S2, S3) --
  // Idempotent: missing row returns normally with no audit event.

  async removeTransition(
    workspaceId: WorkspaceId, actorId: UserId,
    fromStatusId: Uuid, toStatusId: Uuid,
  ): Promise<void> {
    return txn(this.pool, async (c) => {
      const { rowCount } = await c.query(
        `DELETE FROM transitions WHERE workspace_id = $1 AND from_status_id = $2 AND to_status_id = $3`,
        [workspaceId, fromStatusId, toStatusId]);

      if (rowCount === 0) return; // idempotent — nothing to do

      await new PostgresAudit(this.pool).appendViaClient(c, {
        kind: 'config-updated' as AuditEventKind,
        actorUserId: actorId, workspaceId,
        details: { action: 'transition-removed' },
      });
    });
  }

  // -- listSelectableConfiguration (S9) --
  // Only active rows, ordered by sort_order then name. No per-row loop.

  async listSelectableConfiguration(
    workspaceId: WorkspaceId,
  ): Promise<SelectableConfiguration> {
    const [s, p, t] = await Promise.all([
      this.pool.query<StatusRow>(
        `SELECT id, workspace_id, name, category, description, color, sort_order, is_default, is_active `
        + `FROM statuses WHERE workspace_id = $1 AND is_active `
        + `ORDER BY sort_order, name`, [workspaceId]),
      this.pool.query<PriorityRow>(
        `SELECT id, workspace_id, name, description, color, sort_order, is_default, is_active `
        + `FROM priorities WHERE workspace_id = $1 AND is_active `
        + `ORDER BY sort_order, name`, [workspaceId]),
      this.pool.query<TicketTypeRow>(
        `SELECT id, workspace_id, name, category, description, color, sort_order, is_default, is_active `
        + `FROM ticket_types WHERE workspace_id = $1 AND is_active `
        + `ORDER BY sort_order, name`, [workspaceId]),
    ]);

    return {
      statuses: s.rows.map(mapStatus),
      priorities: p.rows.map(mapPriority),
      ticketTypes: t.rows.map(mapTicketType),
    };
  }
}