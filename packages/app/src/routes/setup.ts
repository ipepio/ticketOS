import crypto from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { getPool } from '../db/connection.js';
import { getAudit } from '../app.js';
import type { Config } from '../config.js';

/**
 * Setup routes — first-run onboarding wizard
 */
export async function registerSetupRoutes(
  fastify: FastifyInstance,
  _config: Config,
): Promise<void> {
  // GET /api/setup/status — is this installation configured?
  fastify.get('/api/setup/status', async (_request, reply) => {
    const pool = getPool();
    const { rows } = await pool.query(
      "SELECT count(*)::int AS count FROM workspaces",
    );
    const configured = (rows[0]?.count ?? 0) > 0;
    return reply.send({ configured });
  });

  // POST /api/setup/bootstrap — create initial Workspace + admin
  fastify.post('/api/setup/bootstrap', async (request, reply) => {
    // Guard: only one bootstrap allowed
    const pool = getPool();
    const { rows: existing } = await pool.query(
      "SELECT count(*)::int AS count FROM workspaces",
    );
    if ((existing[0]?.count ?? 0) > 0) {
      return reply.status(409).send({ error: 'Installation already configured' });
    }

    const body = request.body as {
      installationName?: string;
      workspaceName?: string;
      adminEmail?: string;
      adminName?: string;
      locale?: string;
      timezone?: string;
    };

    if (!body.workspaceName || !body.adminEmail) {
      return reply.status(400).send({ error: 'workspaceName and adminEmail are required' });
    }

    const audit = getAudit();
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // 1. Create workspace
      const { rows: wsRows } = await client.query(
        'INSERT INTO workspaces (name) VALUES ($1) RETURNING id',
        [body.workspaceName],
      );
      const workspaceId = wsRows[0]!.id;

      // 2. Create user
      const { rows: userRows } = await client.query(
        'INSERT INTO users (email, verified_at) VALUES ($1, NOW()) RETURNING id',
        [body.adminEmail],
      );
      const userId = userRows[0]!.id;

      // 3. Create membership as workspace-admin (includes all capabilities)
      await client.query(
        `INSERT INTO workspace_memberships (user_id, workspace_id, role)
         VALUES ($1, $2, 'workspace-admin')`,
        [userId, workspaceId],
      );

      // 4. Create default Inbox queue
      await client.query(
        `INSERT INTO queues (workspace_id, name, access_mode)
         VALUES ($1, 'Inbox', 'open')`,
        [workspaceId],
      );

      // 5. Provision defaults (statuses, priorities, ticket types)
      const defaultStatuses = [
        { name: 'New', category: 'new' },
        { name: 'Open', category: 'open' },
        { name: 'Pending', category: 'pending' },
        { name: 'Resolved', category: 'resolved' },
        { name: 'Closed', category: 'closed' },
      ];
      for (const s of defaultStatuses) {
        await client.query(
          `INSERT INTO statuses (workspace_id, name, category, is_default)
           VALUES ($1, $2, $3, true)
           ON CONFLICT DO NOTHING`,
          [workspaceId, s.name, s.category],
        );
      }

      const defaultPriorities = [
        { name: 'critical', sortOrder: 0 },
        { name: 'high', sortOrder: 1 },
        { name: 'normal', sortOrder: 2 },
        { name: 'low', sortOrder: 3 },
      ];
      for (const p of defaultPriorities) {
        await client.query(
          `INSERT INTO priorities (workspace_id, name, sort_order, is_default)
           VALUES ($1, $2, $3, true)
           ON CONFLICT DO NOTHING`,
          [workspaceId, p.name, p.sortOrder],
        );
      }

      await client.query(
        `INSERT INTO ticket_types (workspace_id, name, category, is_default)
         VALUES ($1, 'Incident', 'incident', true),
                ($1, 'Service Request', 'service-request', false)
         ON CONFLICT DO NOTHING`,
        [workspaceId],
      );

      // 6. Create default business calendar
      await client.query(
        `INSERT INTO business_calendars (workspace_id, name, timezone, is_default, working_hours)
         VALUES ($1, 'Default 9x5', $2, true, $3)
         ON CONFLICT DO NOTHING`,
        [
          workspaceId,
          body.timezone ?? 'UTC',
          JSON.stringify([
            { day: 'mon', startMinute: 480, endMinute: 1020 },
            { day: 'tue', startMinute: 480, endMinute: 1020 },
            { day: 'wed', startMinute: 480, endMinute: 1020 },
            { day: 'thu', startMinute: 480, endMinute: 1020 },
            { day: 'fri', startMinute: 480, endMinute: 1020 },
          ]),
        ],
      );

      // 7. Create session directly for immediate login
      const sessionId = crypto.randomUUID();
      await client.query(
        `INSERT INTO sessions (id, user_id, workspace_id, data, expires_at)
         VALUES ($1, $2, $3, '{}', NOW() + INTERVAL '24 hours')`,
        [sessionId, userId, workspaceId],
      );

      // 8. Audit
      await audit.append({
        kind: 'workspace-created',
        actorUserId: userId,
        workspaceId,
        details: { name: body.workspaceName, email: body.adminEmail },
      });

      await client.query('COMMIT');

      return reply.send({
        workspaceId,
        sessionId,
        message: 'Installation configured.',
      });
    } catch (err) {
      await client.query('ROLLBACK');
      fastify.log.error({ err }, 'Bootstrap failed');
      return reply.status(500).send({ error: 'Bootstrap failed' });
    } finally {
      client.release();
    }
  });
}
