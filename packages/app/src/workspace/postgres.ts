import type { Pool } from 'pg';
import type {
  WorkspaceModule,
  Workspace,
  Organization,
  Queue,
  AddQueueMemberInput,
} from '@ticketos/domain';
import type { WorkspaceId, QueueId, UserId } from '@ticketos/shared';

export class PostgresWorkspace implements WorkspaceModule {
  constructor(private pool: Pool) {}

  async createWorkspace(
    input: { name: string },
  ): Promise<Workspace> {
    const { rows } = await this.pool.query(
      `INSERT INTO workspaces (name) VALUES ($1) RETURNING id, name, created_at`,
      [input.name],
    );

    const row = rows[0]!;
    return {
      id: row.id,
      name: row.name,
      createdAt: row.created_at,
    };
  }

  async getWorkspace(id: WorkspaceId): Promise<Workspace | null> {
    const { rows } = await this.pool.query(
      'SELECT id, name, created_at FROM workspaces WHERE id = $1',
      [id],
    );
    if (rows.length === 0) return null;

    const row = rows[0]!;
    return {
      id: row.id,
      name: row.name,
      createdAt: row.created_at,
    };
  }

  async createOrganization(
    input: { workspaceId: WorkspaceId; name: string },
  ): Promise<Organization> {
    const { rows } = await this.pool.query(
      `INSERT INTO organizations (workspace_id, name) VALUES ($1, $2)
       RETURNING id, workspace_id, name, created_at`,
      [input.workspaceId, input.name],
    );

    const row = rows[0]!;
    return {
      id: row.id,
      workspaceId: row.workspace_id,
      name: row.name,
    };
  }

  async getOrganizations(
    workspaceId: WorkspaceId,
  ): Promise<Organization[]> {
    const { rows } = await this.pool.query(
      'SELECT id, workspace_id, name FROM organizations WHERE workspace_id = $1',
      [workspaceId],
    );

    return rows.map((r) => ({
      id: r.id,
      workspaceId: r.workspace_id,
      name: r.name,
    }));
  }

  async getOrganization(id: string): Promise<Organization | null> {
    const { rows } = await this.pool.query(
      'SELECT id, workspace_id, name FROM organizations WHERE id = $1',
      [id],
    );
    if (rows.length === 0) return null;

    const row = rows[0]!;
    return {
      id: row.id,
      workspaceId: row.workspace_id,
      name: row.name,
    };
  }

  async createQueue(
    input: { workspaceId: WorkspaceId; name: string; accessMode?: 'open' | 'restricted' },
  ): Promise<Queue> {
    const { rows } = await this.pool.query(
      `INSERT INTO queues (workspace_id, name, access_mode)
       VALUES ($1, $2, $3)
       RETURNING id, workspace_id, name, access_mode, created_at`,
      [input.workspaceId, input.name, input.accessMode ?? 'open'],
    );

    const row = rows[0]!;
    return {
      id: row.id,
      workspaceId: row.workspace_id,
      name: row.name,
      accessMode: row.access_mode as 'open' | 'restricted',
      createdAt: row.created_at,
    };
  }

  async getQueue(id: QueueId): Promise<Queue | null> {
    const { rows } = await this.pool.query(
      'SELECT id, workspace_id, name, access_mode, created_at FROM queues WHERE id = $1',
      [id],
    );
    if (rows.length === 0) return null;

    const row = rows[0]!;
    return {
      id: row.id,
      workspaceId: row.workspace_id,
      name: row.name,
      accessMode: row.access_mode as 'open' | 'restricted',
      createdAt: row.created_at,
    };
  }

  async getQueues(workspaceId: WorkspaceId): Promise<Queue[]> {
    const { rows } = await this.pool.query(
      'SELECT id, workspace_id, name, access_mode, created_at FROM queues WHERE workspace_id = $1',
      [workspaceId],
    );

    return rows.map((r) => ({
      id: r.id,
      workspaceId: r.workspace_id,
      name: r.name,
      accessMode: r.access_mode as 'open' | 'restricted',
      createdAt: r.created_at,
    }));
  }

  async addQueueMember(input: AddQueueMemberInput): Promise<void> {
    await this.pool.query(
      `INSERT INTO queue_members (workspace_id, queue_id, user_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (workspace_id, queue_id, user_id) DO NOTHING`,
      [input.workspaceId, input.queueId, input.userId],
    );
  }

  async removeQueueMember(
    workspaceId: WorkspaceId,
    queueId: QueueId,
    userId: UserId,
  ): Promise<void> {
    await this.pool.query(
      'DELETE FROM queue_members WHERE workspace_id = $1 AND queue_id = $2 AND user_id = $3',
      [workspaceId, queueId, userId],
    );
  }

  async getQueueMembers(queueId: QueueId): Promise<UserId[]> {
    const { rows } = await this.pool.query(
      'SELECT user_id FROM queue_members WHERE queue_id = $1',
      [queueId],
    );

    return rows.map((r) => r.user_id);
  }

  async isQueueMember(
    queueId: QueueId,
    userId: UserId,
  ): Promise<boolean> {
    const { rows } = await this.pool.query(
      'SELECT 1 FROM queue_members WHERE queue_id = $1 AND user_id = $2',
      [queueId, userId],
    );

    return rows.length > 0;
  }
}
