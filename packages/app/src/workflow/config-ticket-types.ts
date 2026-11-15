// Ticket Type configuration — Postgres implementation (T3b, S2–S5, S7).
// Every statement filters workspace_id = $1. Mutations: one tx + client release.

import type { Pool, PoolClient } from 'pg';
import type { WorkspaceId, UserId, Uuid, AuditEventKind } from '@ticketos/shared';
import type {
  TicketTypeView, CreateTicketTypeInput, UpdateTicketTypeInput,
} from '@ticketos/domain';
import {
  ConfigurationValidationError, ConfigurationConflictError,
  ConfigurationNotFoundError,
} from '@ticketos/domain';
import type { PostgresAudit } from '../db/audit.js';

interface TicketTypeRow {
  id: string; workspace_id: string; name: string;
  category: string; description: string | null; color: string;
  sort_order: number; is_default: boolean; is_active: boolean;
}
function mapTicketType(r: TicketTypeRow): TicketTypeView {
  return { id: r.id, workspaceId: r.workspace_id, name: r.name,
    category: r.category as TicketTypeView['category'],
    description: r.description, color: r.color,
    sortOrder: r.sort_order, isDefault: r.is_default,
    isActive: r.is_active };
}
const TT_COLS = 'id, workspace_id, name, category, description, color, sort_order, is_default, is_active';
const VALID_CATEGORIES = new Set(['incident', 'service-request']);
function notFound(client: PoolClient) {
  client.query('ROLLBACK'); throw new ConfigurationNotFoundError('Ticket type not found', 'not-found');
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

export class PostgresTicketTypeConfiguration {
  constructor(private pool: Pool, private audit: PostgresAudit) {}

  // -- Read --

  async listTicketTypes(workspaceId: WorkspaceId): Promise<TicketTypeView[]> {
    const { rows } = await this.pool.query<TicketTypeRow>(
      `SELECT ${TT_COLS} FROM ticket_types WHERE workspace_id = $1 ORDER BY sort_order, name`, [workspaceId]);
    return rows.map(mapTicketType);
  }

  // -- Create (V1: explicit appended sort_order) --

  async createTicketType(workspaceId: WorkspaceId, actorId: UserId,
    input: CreateTicketTypeInput): Promise<TicketTypeView> {
    return tx(this.pool, async (client) => {
      const trimmed = input.name.trim();
      if (!trimmed) { throw new ConfigurationValidationError('ticket-type-name-required', 'ticket-type-name-required'); }
      if (!VALID_CATEGORIES.has(input.category)) {
        throw new ConfigurationValidationError('ticket-type-category-invalid', 'ticket-type-category-invalid');
      }
      const { rows: dupRows } = await client.query<TicketTypeRow>(
        `SELECT 1 FROM ticket_types WHERE workspace_id = $1 AND name = $2`, [workspaceId, trimmed]);
      if (dupRows.length) throw new ConfigurationConflictError('ticket-type-name-duplicate', 'ticket-type-name-duplicate');

      const maxRow = await client.query<{ sort_order: number }>(
        `SELECT COALESCE(MAX(sort_order), 0) + 1 AS sort_order FROM ticket_types WHERE workspace_id = $1`, [workspaceId]);

      const { rows: ins } = await client.query<TicketTypeRow>(
        `INSERT INTO ticket_types (workspace_id, name, category, description, color, sort_order, is_default, is_active)
         VALUES ($1, $2, $3, $4, $5, $6, false, true)
         RETURNING ${TT_COLS}`, [workspaceId, trimmed, input.category, input.description ?? null, input.color ?? '', maxRow.rows[0]!.sort_order]);

      await this.audit.appendViaClient(client, { kind: 'ticket-type-created' as AuditEventKind, actorUserId: actorId, workspaceId,
        details: { name: trimmed } });
      return mapTicketType(ins[0]!);
    });
  }

  // -- Update --

  async updateTicketType(workspaceId: WorkspaceId, actorId: UserId, ticketTypeId: Uuid,
    input: UpdateTicketTypeInput): Promise<TicketTypeView> {
    return tx(this.pool, async (client) => {
      const { rows: exist } = await client.query<TicketTypeRow>(
        `SELECT id, category FROM ticket_types WHERE workspace_id = $1 AND id = $2`, [workspaceId, ticketTypeId]);
      if (!exist[0]) notFound(client);

      // V2/S5: a generic update must never bypass the default invariants.
      // Promoting a default clears the previous one in this transaction, and a
      // default can never be left inactive.
      if (input.isDefault === true || input.isActive === false) {
        const { rows: cur } = await client.query<{ is_default: boolean; is_active: boolean }>(
          `SELECT is_default, is_active FROM ticket_types WHERE workspace_id = $1 AND id = $2`,
          [workspaceId, ticketTypeId]);
        const current = cur[0]!;
        const willBeActive = input.isActive ?? current.is_active;
        const willBeDefault = input.isDefault ?? current.is_default;
        if (willBeDefault && !willBeActive) {
          throw new ConfigurationValidationError('default-inactive', 'default-inactive');
        }
        if (input.isDefault === true && !current.is_default) {
          await client.query(
            `UPDATE ticket_types SET is_default = false WHERE workspace_id = $1 AND is_default AND id <> $2`,
            [workspaceId, ticketTypeId]);
        }
      }
      const existing = exist[0]!;

      let name = input.name;
      if (name != null) {
        const trimmed = name.trim();
        if (!trimmed) throw new ConfigurationValidationError('ticket-type-name-required', 'ticket-type-name-required');
        const { rows: dup } = await client.query(
          `SELECT 1 FROM ticket_types WHERE workspace_id = $1 AND name = $2 AND id != $3`,
          [workspaceId, trimmed, ticketTypeId]);
        if (dup.length) throw new ConfigurationConflictError('ticket-type-name-duplicate', 'ticket-type-name-duplicate');
        name = trimmed;
      }

      const category = input.category;
      if (category != null) {
        if (!VALID_CATEGORIES.has(category)) {
          throw new ConfigurationValidationError('ticket-type-category-invalid', 'ticket-type-category-invalid');
        }
        // Check category-in-use: only when changing the category and the type already has Tickets.
        if (category !== existing.category) {
          const { rows: cnt } = await client.query<{ count: number }>(
            `SELECT COUNT(*) FROM tickets WHERE workspace_id = $1 AND ticket_type_id = $2`,
            [workspaceId, ticketTypeId]);
          if (Number(cnt[0]!.count) > 0) {
            throw new ConfigurationValidationError('ticket-type-category-in-use', 'ticket-type-category-in-use');
          }
        }
      }

      const sets: string[] = []; const vals: unknown[] = []; let idx = 1;
      if (name != null) { sets.push(`name=$${idx++}`); vals.push(name); }
      if (category != null) { sets.push(`category=$${idx++}`); vals.push(category); }
      if (input.description != null) { sets.push(`description=$${idx++}`); vals.push(input.description); }
      if (input.color != null) { sets.push(`color=$${idx++}`); vals.push(input.color); }
      if (input.sortOrder != null) { sets.push(`sort_order=$${idx++}`); vals.push(input.sortOrder); }
      if (input.isDefault != null) { sets.push(`is_default=$${idx++}`); vals.push(input.isDefault); }
      if (input.isActive != null) { sets.push(`is_active=$${idx++}`); vals.push(input.isActive); }

      if (!sets.length) {
        await client.query('COMMIT');
        const { rows } = await client.query<TicketTypeRow>(`SELECT ${TT_COLS} FROM ticket_types WHERE id = $1`, [ticketTypeId]);
        return mapTicketType(rows[0]!);
      }
      vals.push(ticketTypeId, workspaceId);

      const { rows: updated } = await client.query<TicketTypeRow>(
        `UPDATE ticket_types SET ${sets.join(',')} WHERE id=$${idx} AND workspace_id=$${idx + 1} RETURNING ${TT_COLS}`, vals);
      if (!updated[0]) notFound(client);

      await this.audit.appendViaClient(client, { kind: 'ticket-type-updated' as AuditEventKind, actorUserId: actorId, workspaceId,
        details: { ticketTypeId, changes: input } });
      return mapTicketType(updated[0]!);
    });
  }

  // -- Reorder (V3: verify exact id set, assign 1..n) --

  async reorderTicketTypes(workspaceId: WorkspaceId, actorId: UserId,
    orderedIds: Uuid[]): Promise<void> {
    return tx(this.pool, async (client) => {
      const { rows: ec } = await client.query<{ count: number }>(
        `SELECT COUNT(*) FROM ticket_types WHERE workspace_id = $1 AND id = ANY($2::uuid[])`,
        [workspaceId, orderedIds]);
      const { rows: tc } = await client.query<{ count: number }>(
        `SELECT COUNT(*) FROM ticket_types WHERE workspace_id = $1`, [workspaceId]);
      if (Number(ec[0]!.count) !== orderedIds.length || Number(tc[0]!.count) !== orderedIds.length) {
        throw new ConfigurationValidationError('sort-order-invalid', 'sort-order-invalid');
      }
      if (orderedIds.length) {
        await client.query(
          `WITH o AS (SELECT unnest($1::uuid[]) AS id, generate_subscripts($1::uuid[], 1) AS rn
           UPDATE ticket_types t SET sort_order = o.rn FROM o WHERE t.id = o.id AND t.workspace_id = $2`,
          [orderedIds, workspaceId]);
      }
      await this.audit.appendViaClient(client, { kind: 'config-updated' as AuditEventKind, actorUserId: actorId, workspaceId,
        details: { orderedCount: orderedIds.length } });
    });
  }

  // -- Activate / deactivate (V2: block deactivating the default) --

  async setTicketTypeActive(workspaceId: WorkspaceId, actorId: UserId,
    ticketTypeId: Uuid, isActive: boolean): Promise<TicketTypeView> {
    return tx(this.pool, async (client) => {
      const { rows: exist } = await client.query<TicketTypeRow>(
        `SELECT id, is_default FROM ticket_types WHERE workspace_id = $1 AND id = $2`,
        [workspaceId, ticketTypeId]);
      if (!exist[0]) notFound(client);
      const t1 = exist[0]!;
      if (!isActive && t1.is_default) {
        throw new ConfigurationValidationError('default-inactive', 'default-inactive');
      }

      const { rows: updated } = await client.query<TicketTypeRow>(
        `UPDATE ticket_types SET is_active = $3 WHERE id = $1 AND workspace_id = $2 RETURNING ${TT_COLS}`,
        [ticketTypeId, workspaceId, isActive]);
      if (!updated[0]) notFound(client);

      const kind: AuditEventKind =
        (isActive ? 'ticket-type-updated' : 'ticket-type-deactivated') as AuditEventKind;
      await this.audit.appendViaClient(client, { kind, actorUserId: actorId, workspaceId,
        details: { ticketTypeId, isActive } });
      return mapTicketType(updated[0]!);
    });
  }

  // -- Default (S5, V2: clear→verify→set in one tx; null clears) --

  async setDefaultTicketType(workspaceId: WorkspaceId, actorId: UserId,
    ticketTypeId: Uuid | null): Promise<TicketTypeView | null> {
    return tx(this.pool, async (client) => {
      // 1. Clear previous default.
      await client.query(
        `UPDATE ticket_types SET is_default = false WHERE workspace_id = $1 AND is_default`, [workspaceId]);

      // 2. Null clears the default and is valid.
      if (ticketTypeId === null) {
        await this.audit.appendViaClient(client, { kind: 'ticket-type-default-set' as AuditEventKind,
          actorUserId: actorId, workspaceId, details: { ticketTypeId: null } });
        return null;
      }

      // 3. Verify target exists and is active.
      const { rows: target } = await client.query<TicketTypeRow>(
        `SELECT id, is_active FROM ticket_types WHERE workspace_id = $1 AND id = $2`,
        [workspaceId, ticketTypeId]);
      if (!target[0]) notFound(client);
      const t2 = target[0]!;
      if (!t2.is_active) {
        client.query('ROLLBACK'); throw new ConfigurationValidationError('default-inactive', 'default-inactive');
      }

      // 4. Set new default.
      const { rows: updated } = await client.query<TicketTypeRow>(
        `UPDATE ticket_types SET is_default = true WHERE id = $1 AND workspace_id = $2 RETURNING ${TT_COLS}`,
        [ticketTypeId, workspaceId]);
      if (!updated[0]) notFound(client);

      await this.audit.appendViaClient(client, { kind: 'ticket-type-default-set' as AuditEventKind,
        actorUserId: actorId, workspaceId, details: { ticketTypeId } });
      return mapTicketType(updated[0]!);
    });
  }
}