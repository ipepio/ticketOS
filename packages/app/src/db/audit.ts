import type { Pool } from 'pg';
import type { AuditEvent } from '@ticketos/domain';
import type { WorkspaceId, AuditEventKind } from '@ticketos/shared';

export class PostgresAudit {
  constructor(private pool: Pool) {}

  async append(event: Omit<AuditEvent, 'id' | 'createdAt'>): Promise<void> {
    await this.pool.query(
      `INSERT INTO audit_events (id, kind, actor_user_id, workspace_id, details, created_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, NOW())`,
      [event.kind, event.actorUserId, event.workspaceId, JSON.stringify(event.details)],
    );
  }

  async query(
    workspaceId: WorkspaceId | null,
    limit = 50,
  ): Promise<AuditEvent[]> {
    const { rows } = workspaceId
      ? await this.pool.query(
          `SELECT id, kind, actor_user_id, workspace_id, details, created_at
           FROM audit_events
           WHERE workspace_id = $1
           ORDER BY created_at DESC
           LIMIT $2`,
          [workspaceId, limit],
        )
      : await this.pool.query(
          `SELECT id, kind, actor_user_id, workspace_id, details, created_at
           FROM audit_events
           ORDER BY created_at DESC
           LIMIT $2`,
          [limit],
        );

    return rows.map(
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
