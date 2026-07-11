import { Pool } from 'pg';
import type { DomainEvent, AuditModule } from '@ticketos/domain';
import type { WorkspaceId, QueueId } from '@ticketos/shared';

interface StatusRow {
  id: string;
  workspace_id: string;
  name: string;
  category: string;
  is_default: boolean;
  created_at: string;
}

interface PriorityRow {
  id: string;
  workspace_id: string;
  name: string;
  sort_order: number;
  is_default: boolean;
  created_at: string;
}

interface TicketTypeRow {
  id: string;
  workspace_id: string;
  name: string;
  category: string;
  is_default: boolean;
  created_at: string;
}

interface TransitionRow {
  id: string;
  workspace_id: string;
  from_status_id: string;
  to_status_id: string;
  created_at: string;
}

export interface Status {
  id: string;
  workspaceId: WorkspaceId;
  name: string;
  category: string;
  isDefault: boolean;
  createdAt: string;
}

export interface Priority {
  id: string;
  workspaceId: WorkspaceId;
  name: string;
  sortOrder: number;
  isDefault: boolean;
  createdAt: string;
}

export interface TicketType {
  id: string;
  workspaceId: WorkspaceId;
  name: string;
  category: string;
  isDefault: boolean;
  createdAt: string;
}

export interface Transition {
  id: string;
  workspaceId: WorkspaceId;
  fromStatusId: string;
  toStatusId: string;
  createdAt: string;
}

export class PostgresWorkflow {
  constructor(private pool: Pool) {}

  /**
   * Provision default statuses, priorities, ticket types, and Inbox Queue
   * for a newly created workspace. Called within the workspace creation
   * transaction.
   */
  async provisionDefaults(workspaceId: WorkspaceId): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Default statuses
      const defaultStatuses = [
        { name: 'New', category: 'new', sortOrder: 0 },
        { name: 'Open', category: 'open', sortOrder: 1 },
        { name: 'Pending', category: 'pending', sortOrder: 2 },
        { name: 'Resolved', category: 'resolved', sortOrder: 3 },
        { name: 'Closed', category: 'closed', sortOrder: 4 },
      ];

      for (const s of defaultStatuses) {
        await client.query(
          `INSERT INTO statuses (workspace_id, name, category, is_default)
           VALUES ($1, $2, $3, true)`,
          [workspaceId, s.name, s.category],
        );
      }

      // Default priorities
      const defaultPriorities = [
        { name: 'critical', sortOrder: 0 },
        { name: 'high', sortOrder: 1 },
        { name: 'normal', sortOrder: 2 },
        { name: 'low', sortOrder: 3 },
      ];

      for (const p of defaultPriorities) {
        await client.query(
          `INSERT INTO priorities (workspace_id, name, sort_order, is_default)
           VALUES ($1, $2, $3, true)`,
          [workspaceId, p.name, p.sortOrder],
        );
      }

      // Default ticket types
      await client.query(
        `INSERT INTO ticket_types (workspace_id, name, category, is_default)
         VALUES ($1, 'Incident', 'incident', true),
                ($1, 'Service Request', 'service-request', true)`,
        [workspaceId],
      );

      // Default Inbox Queue
      await client.query(
        `INSERT INTO queues (workspace_id, name, access_mode)
         VALUES ($1, 'Inbox', 'open')`,
        [workspaceId],
      );

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async getStatuses(workspaceId: WorkspaceId): Promise<Status[]> {
    const { rows } = await this.pool.query<StatusRow>(
      'SELECT id, workspace_id, name, category, is_default, created_at FROM statuses WHERE workspace_id = $1 ORDER BY created_at',
      [workspaceId],
    );

    return rows.map((r) => ({
      id: r.id,
      workspaceId: r.workspace_id,
      name: r.name,
      category: r.category,
      isDefault: r.is_default,
      createdAt: r.created_at,
    }));
  }

  async getPriorities(workspaceId: WorkspaceId): Promise<Priority[]> {
    const { rows } = await this.pool.query<PriorityRow>(
      'SELECT id, workspace_id, name, sort_order, is_default, created_at FROM priorities WHERE workspace_id = $1 ORDER BY sort_order',
      [workspaceId],
    );

    return rows.map((r) => ({
      id: r.id,
      workspaceId: r.workspace_id,
      name: r.name,
      sortOrder: r.sort_order,
      isDefault: r.is_default,
      createdAt: r.created_at,
    }));
  }

  async getTicketTypes(workspaceId: WorkspaceId): Promise<TicketType[]> {
    const { rows } = await this.pool.query<TicketTypeRow>(
      'SELECT id, workspace_id, name, category, is_default, created_at FROM ticket_types WHERE workspace_id = $1',
      [workspaceId],
    );

    return rows.map((r) => ({
      id: r.id,
      workspaceId: r.workspace_id,
      name: r.name,
      category: r.category,
      isDefault: r.is_default,
      createdAt: r.created_at,
    }));
  }

  async getTransitions(workspaceId: WorkspaceId): Promise<Transition[]> {
    const { rows } = await this.pool.query<TransitionRow>(
      `SELECT t.id, t.workspace_id, t.from_status_id, t.to_status_id, t.created_at
       FROM transitions t
       JOIN statuses s ON s.id = t.from_status_id
       WHERE s.workspace_id = $1`,
      [workspaceId],
    );

    return rows.map((r) => ({
      id: r.id,
      workspaceId: r.workspace_id,
      fromStatusId: r.from_status_id,
      toStatusId: r.to_status_id,
      createdAt: r.created_at,
    }));
  }

  async addTransition(
    workspaceId: WorkspaceId,
    fromStatusId: string,
    toStatusId: string,
  ): Promise<void> {
    await this.pool.query(
      `INSERT INTO transitions (workspace_id, from_status_id, to_status_id)
       VALUES ($1, $2, $3)
       ON CONFLICT DO NOTHING`,
      [workspaceId, fromStatusId, toStatusId],
    );
  }

  async removeTransition(
    workspaceId: WorkspaceId,
    fromStatusId: string,
    toStatusId: string,
  ): Promise<void> {
    await this.pool.query(
      `DELETE FROM transitions
       WHERE workspace_id = $1 AND from_status_id = $2 AND to_status_id = $3`,
      [workspaceId, fromStatusId, toStatusId],
    );
  }

  async validateTransition(
    workspaceId: WorkspaceId,
    fromStatusId: string,
    toStatusId: string,
  ): Promise<boolean> {
    // If no transitions are configured, all transitions are allowed
    const { rows } = await this.pool.query(
      `SELECT 1 FROM transitions
       JOIN statuses s ON s.id = transitions.from_status_id
       WHERE s.workspace_id = $1
         AND transitions.from_status_id = $2
         AND transitions.to_status_id = $3`,
      [workspaceId, fromStatusId, toStatusId],
    );

    return rows.length > 0;
  }
}
