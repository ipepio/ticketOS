import type { Pool, PoolClient } from 'pg';
import type { AuditEvent } from '@ticketos/domain';
import type { WorkspaceId, AuditEventKind } from '@ticketos/shared';

/** Minimal shape for building an audit event with resource context. */
export interface AuditEventInput {
  kind: AuditEventKind;
  actorUserId: string | null;
  workspaceId: WorkspaceId | null;
  resourceType: string;
  resourceId: string | null;
  details: Record<string, unknown>;
}

export class PostgresAudit {
  constructor(private pool: Pool) {}

  async append(event: Omit<AuditEvent, 'id' | 'createdAt'>): Promise<void> {
    await this.pool.query(
      `INSERT INTO audit_events (id, kind, actor_user_id, workspace_id, details, created_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, NOW())`,
      [event.kind, event.actorUserId, event.workspaceId, JSON.stringify(event.details)],
    );
  }

  /**
   * Append an audit event within an existing transaction (via client).
   */
  async appendViaClient(
    client: PoolClient,
    event: Omit<AuditEvent, 'id' | 'createdAt'>,
  ): Promise<void> {
    await client.query(
      `INSERT INTO audit_events (id, kind, actor_user_id, workspace_id, details, created_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, NOW())`,
      [event.kind, event.actorUserId, event.workspaceId, JSON.stringify(event.details)],
    );
  }

  /**
   * Convenience: build an audit event from resource context and append
   * within the transaction.  Merges `before` and `after` into `details`.
   */
  async appendResource(
    client: PoolClient,
    input: AuditEventInput,
  ): Promise<void> {
    const { kind, actorUserId, workspaceId, resourceType, resourceId, details } = input;
    await client.query(
      `INSERT INTO audit_events (id, kind, actor_user_id, workspace_id, details, created_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, NOW())`,
      [
        kind,
        actorUserId,
        workspaceId,
        JSON.stringify({ resourceType, resourceId, ...details }),
      ],
    );
  }

  async query(
    workspaceId: WorkspaceId | null,
    limit = 50,
  ): Promise<AuditEvent[]> {
    let result;
    if (workspaceId) {
      result = await this.pool.query(
        `SELECT id, kind, actor_user_id, workspace_id, details, created_at
         FROM audit_events
         WHERE workspace_id = $1
         ORDER BY created_at DESC
         LIMIT $2`,
        [workspaceId, limit],
      );
    } else {
      result = await this.pool.query(
        `SELECT id, kind, actor_user_id, workspace_id, details, created_at
         FROM audit_events
         ORDER BY created_at DESC
         LIMIT $1`,
        [limit],
      );
    }

    return result.rows.map(
      (r) =>
        ({
          id: r.id,
          kind: r.kind as AuditEventKind,
          actorUserId: r.actor_user_id,
          workspaceId: r.workspace_id,
          details: r.details,
          createdAt: r.created_at,
        }) as AuditEvent,
    );
  }
}