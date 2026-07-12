import type { Pool } from 'pg';
import crypto from 'node:crypto';
import type {
  IdentityModule,
  AuthenticateResult,
  MagicLinkResult,
  WorkspaceMembership,
  OutboxModule,
  AuditModule,
} from '@ticketos/domain';
import type {
  UserId,
  WorkspaceId,
  Capability,
  Role,
} from '@ticketos/shared';

const CAPABILITY_MAP: Record<Role, Capability[]> = {
  'installation-admin': [
    'admin:installation',
    'workspaces:manage',
    'workspaces:create',
    'memberships:manage',
    'audit:read',
  ],
  'workspace-admin': [
    'workspaces:manage',
    'memberships:manage',
    'memberships:invite',
    'organizations:manage',
    'queues:manage',
    'config:manage',
    'audit:read',
    'tickets:create',
    'tickets:read',
    'tickets:update',
    'tickets:delete',
    'tickets:cancel',
    'tickets:assign',
    'tickets:move',
    'tickets:comment',
    'tickets:internal-note',
    'tickets:redact',
    'tickets:attach',
    'queues:access',
    'queues:restrict',
  ],
  agent: [
    'tickets:create',
    'tickets:read',
    'tickets:update',
    'tickets:cancel',
    'tickets:assign',
    'tickets:move',
    'tickets:comment',
    'tickets:internal-note',
    'tickets:attach',
    'queues:access',
  ],
  requester: [
    'tickets:create',
    'tickets:read',
    'tickets:update',
    'tickets:cancel',
    'tickets:comment',
    'tickets:attach',
  ],
};

export class PostgresIdentity implements IdentityModule {
  constructor(
    private pool: Pool,
    private outbox: OutboxModule,
    private audit: AuditModule,
  ) {}

  async requestMagicLink(
    email: string,
    workspaceId: WorkspaceId,
  ): Promise<MagicLinkResult> {
    // Upsert user
    const { rows } = await this.pool.query(
      `INSERT INTO users (email, verified_at)
       VALUES ($1, NULL)
       ON CONFLICT (email) DO UPDATE SET verified_at = NULL
       RETURNING id`,
      [email],
    );
    const userId = rows[0]!.id;

    // Generate token
    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    // Store magic link
    await this.pool.query(
      `INSERT INTO magic_links (user_id, token_hash, workspace_id, expires_at)
       VALUES ($1, $2, $3, NOW() + INTERVAL '1 hour')`,
      [userId, tokenHash, workspaceId],
    );

    // Enqueue outbox event
    await this.outbox.enqueue({
      aggregateId: userId,
      eventType: 'magic-link.issued',
      data: { email, workspaceId },
    });

    // Audit
    await this.audit.append({
      kind: 'magic-link-issued',
      actorUserId: null,
      workspaceId,
      details: { email },
    });

    return { token };
  }

  async verifyMagicLink(
    token: string,
  ): Promise<AuthenticateResult | null> {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    const { rows } = await this.pool.query(
      `SELECT ml.user_id, ml.workspace_id
       FROM magic_links ml
       WHERE ml.token_hash = $1
         AND ml.expires_at > NOW()
         AND ml.used_at IS NULL
       LIMIT 1`,
      [tokenHash],
    );

    if (rows.length === 0) {
      return null;
    }

    const { user_id, workspace_id } = rows[0]!;

    // Mark as used
    await this.pool.query(
      'UPDATE magic_links SET used_at = NOW() WHERE token_hash = $1',
      [tokenHash],
    );

    // Verify user exists
    const { rows: userRows } = await this.pool.query(
      'SELECT id FROM users WHERE id = $1 AND verified_at IS NOT NULL',
      [user_id],
    );

    if (userRows.length === 0) {
      // Mark user as verified
      await this.pool.query(
        'UPDATE users SET verified_at = NOW() WHERE id = $1',
        [user_id],
      );
    }

    return { userId: user_id, workspaceId: workspace_id };
  }

  async getUserIdByEmail(email: string): Promise<UserId | null> {
    const { rows } = await this.pool.query(
      'SELECT id FROM users WHERE email = $1',
      [email],
    );
    return rows[0]?.id ?? null;
  }

  async authenticate(
    token: string,
  ): Promise<AuthenticateResult | null> {
    // Try magic link first
    const result = await this.verifyMagicLink(token);
    if (result) return result;

    // Future: OIDC authentication
    return null;
  }

  async hasCapability(
    userId: UserId,
    workspaceId: WorkspaceId,
    capability: Capability,
  ): Promise<boolean> {
    const caps = await this.getCapabilities(userId, workspaceId);
    return caps.includes(capability);
  }

  async createMembership(
    input: { userId: UserId; workspaceId: WorkspaceId; role: Role },
  ): Promise<WorkspaceMembership> {
    const { rows } = await this.pool.query(
      `INSERT INTO workspace_memberships (user_id, workspace_id, role)
       VALUES ($1, $2, $3)
       RETURNING id, user_id, workspace_id, role, NOW() as created_at`,
      [input.userId, input.workspaceId, input.role],
    );

    const row = rows[0]!;
    const caps = CAPABILITY_MAP[input.role];

    return {
      id: row.id,
      userId: row.user_id,
      workspaceId: row.workspace_id,
      role: row.role as Role,
      capabilities: caps,
    };
  }

  async getUserMemberships(
    userId: UserId,
  ): Promise<WorkspaceMembership[]> {
    const { rows } = await this.pool.query(
      `SELECT id, user_id, workspace_id, role FROM workspace_memberships
       WHERE user_id = $1`,
      [userId],
    );

    return rows.map((r) => ({
      id: r.id,
      userId: r.user_id,
      workspaceId: r.workspace_id,
      role: r.role as Role,
      capabilities: CAPABILITY_MAP[r.role as Role] ?? [],
    }));
  }

  async getCapabilities(
    userId: UserId,
    workspaceId: WorkspaceId,
  ): Promise<Capability[]> {
    const { rows } = await this.pool.query(
      `SELECT role FROM workspace_memberships
       WHERE user_id = $1 AND workspace_id = $2`,
      [userId, workspaceId],
    );

    if (rows.length === 0) return [];

    const role = rows[0]!.role as Role;
    return CAPABILITY_MAP[role] ?? [];
  }

  async linkOidcAccount(
    userId: UserId,
    issuer: string,
    subject: string,
    email?: string,
  ): Promise<void> {
    await this.pool.query(
      `INSERT INTO oidc_accounts (user_id, provider_issuer, provider_subject, email)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (provider_issuer, provider_subject) DO UPDATE
       SET email = COALESCE($4, oidc_accounts.email)`,
      [userId, issuer, subject, email ?? null],
    );
  }

  async authenticateOidc(
    issuer: string,
    subject: string,
  ): Promise<AuthenticateResult | null> {
    const { rows } = await this.pool.query(
      `SELECT user_id FROM oidc_accounts
       WHERE provider_issuer = $1 AND provider_subject = $2`,
      [issuer, subject],
    );

    if (rows.length === 0) return null;

    return { userId: rows[0]!.user_id };
  }

  // ---------------------------------------------------------------------------
  // Session management
  // ---------------------------------------------------------------------------

  async createSession(
    userId: UserId,
    workspaceId: WorkspaceId | null,
    data: Record<string, unknown> = {},
  ): Promise<string> {
    const sessionId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h

    await this.pool.query(
      `INSERT INTO sessions (id, user_id, workspace_id, data, expires_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [sessionId, userId, workspaceId, JSON.stringify(data), expiresAt],
    );

    return sessionId;
  }

  async getSession(sessionId: string): Promise<{
    userId: UserId;
    workspaceId: WorkspaceId | null;
    data: Record<string, unknown>;
    expiresAt: string;
  } | null> {
    const { rows } = await this.pool.query(
      `SELECT user_id, workspace_id, data, expires_at
       FROM sessions
       WHERE id = $1 AND expires_at > NOW()`,
      [sessionId],
    );

    if (rows.length === 0) return null;

    const r = rows[0]!;
    return {
      userId: r.user_id,
      workspaceId: r.workspace_id,
      data: r.data as Record<string, unknown>,
      expiresAt: r.expires_at,
    };
  }

  async deleteSession(sessionId: string): Promise<void> {
    await this.pool.query('DELETE FROM sessions WHERE id = $1', [sessionId]);
  }

  async deleteAllUserSessions(userId: UserId): Promise<void> {
    await this.pool.query('DELETE FROM sessions WHERE user_id = $1', [userId]);
  }
}
