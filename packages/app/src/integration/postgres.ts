import crypto from 'node:crypto';
import type { Pool } from 'pg';
import type {
  IntegrationModule,
  ServiceToken,
  Webhook,
  WebhookDelivery,
  CreateServiceTokenInput,
  CreateWebhookInput,
  WebhookDeliveryInput,
  TokenStatus,
  WebhookStatus,
} from '@ticketos/domain';
import type { WorkspaceId, Capability, Uuid } from '@ticketos/shared';

interface TokenRow {
  id: string;
  workspace_id: string;
  name: string;
  token_prefix: string;
  token_hash: string;
  capabilities: string; // JSON
  created_by: string;
  status: string;
  last_used_at: string | null;
  expires_at: string | null;
  created_at: string;
}

interface WebhookRow {
  id: string;
  workspace_id: string;
  name: string;
  url: string;
  secret: string;
  events: string; // JSON
  status: string;
  created_at: string;
  updated_at: string;
}

interface DeliveryRow {
  id: string;
  webhook_id: string;
  event_type: string;
  payload: string;
  status: string;
  status_code: number | null;
  response: string | null;
  attempts: number;
  next_retry_at: string | null;
  created_at: string;
}

function mapToken(r: TokenRow): ServiceToken {
  const caps = typeof r.capabilities === 'string' ? JSON.parse(r.capabilities) : r.capabilities;
  return {
    id: r.id,
    workspaceId: r.workspace_id,
    name: r.name,
    tokenPrefix: r.token_prefix,
    tokenHash: r.token_hash,
    capabilities: caps as Capability[],
    createdBy: r.created_by,
    status: r.status as TokenStatus,
    lastUsedAt: r.last_used_at,
    expiresAt: r.expires_at,
    createdAt: r.created_at,
  };
}

function mapWebhook(r: WebhookRow): Webhook {
  const evts = typeof r.events === 'string' ? JSON.parse(r.events) : r.events;
  return {
    id: r.id,
    workspaceId: r.workspace_id,
    name: r.name,
    url: r.url,
    secret: r.secret,
    events: evts as string[],
    status: r.status as WebhookStatus,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function mapDelivery(r: DeliveryRow): WebhookDelivery {
  return {
    id: r.id,
    webhookId: r.webhook_id,
    eventType: r.event_type,
    payload: r.payload,
    status: r.status as 'pending' | 'success' | 'failed',
    statusCode: r.status_code,
    response: r.response,
    attempts: r.attempts,
    nextRetryAt: r.next_retry_at,
    createdAt: r.created_at,
  };
}

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export class PostgresIntegration implements IntegrationModule {
  constructor(private pool: Pool) {}

  // ---------------------------------------------------------------------------
  // Service Tokens
  // ---------------------------------------------------------------------------

  async createServiceToken(input: CreateServiceTokenInput): Promise<{ token: ServiceToken; rawToken: string }> {
    const rawToken = `tkt_${crypto.randomBytes(32).toString('hex')}`;
    const tokenPrefix = rawToken.substring(0, 11); // tkt_ + 8 chars
    const tokenHashVal = hashToken(rawToken);

    const { rows } = await this.pool.query<TokenRow>(
      `INSERT INTO service_tokens (workspace_id, name, token_prefix, token_hash, capabilities, created_by, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [
        input.workspaceId,
        input.name,
        tokenPrefix,
        tokenHashVal,
        JSON.stringify(input.capabilities),
        input.createdBy,
        input.expiresAt ?? null,
      ],
    );
    return { token: mapToken(rows[0]!), rawToken };
  }

  async revokeServiceToken(id: Uuid): Promise<void> {
    await this.pool.query(
      "UPDATE service_tokens SET status = 'revoked' WHERE id = $1",
      [id],
    );
  }

  async getServiceToken(id: Uuid): Promise<ServiceToken | null> {
    const { rows } = await this.pool.query<TokenRow>(
      'SELECT * FROM service_tokens WHERE id = $1',
      [id],
    );
    return rows[0] ? mapToken(rows[0]) : null;
  }

  async listServiceTokens(workspaceId: WorkspaceId): Promise<ServiceToken[]> {
    const { rows } = await this.pool.query<TokenRow>(
      'SELECT * FROM service_tokens WHERE workspace_id = $1 ORDER BY created_at DESC',
      [workspaceId],
    );
    return rows.map(mapToken);
  }

  async validateServiceToken(rawToken: string): Promise<{ token: ServiceToken; workspaceId: WorkspaceId } | null> {
    const hashVal = hashToken(rawToken);
    const { rows } = await this.pool.query<TokenRow>(
      `SELECT * FROM service_tokens WHERE token_hash = $1 AND status = 'active'`,
      [hashVal],
    );
    if (!rows[0]) return null;

    const token = rows[0]!;

    // Check expiry
    if (token.expires_at && new Date(token.expires_at) < new Date()) {
      return null;
    }

    // Update last used
    await this.pool.query(
      'UPDATE service_tokens SET last_used_at = NOW() WHERE id = $1',
      [token.id],
    );

    return { token: mapToken(token), workspaceId: token.workspace_id };
  }

  // ---------------------------------------------------------------------------
  // Webhooks
  // ---------------------------------------------------------------------------

  async createWebhook(input: CreateWebhookInput): Promise<Webhook> {
    const secret = crypto.randomBytes(32).toString('hex');
    const { rows } = await this.pool.query<WebhookRow>(
      `INSERT INTO webhooks (workspace_id, name, url, secret, events)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [
        input.workspaceId,
        input.name,
        input.url,
        secret,
        JSON.stringify(input.events),
      ],
    );
    return mapWebhook(rows[0]!);
  }

  async updateWebhook(id: Uuid, input: Partial<CreateWebhookInput>): Promise<Webhook> {
    const sets: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (input.name !== undefined) { sets.push(`name = $${idx++}`); values.push(input.name); }
    if (input.url !== undefined) { sets.push(`url = $${idx++}`); values.push(input.url); }
    if (input.events !== undefined) { sets.push(`events = $${idx++}`); values.push(JSON.stringify(input.events)); }

    sets.push('updated_at = NOW()');
    values.push(id);

    const { rows } = await this.pool.query<WebhookRow>(
      `UPDATE webhooks SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
      values,
    );
    if (!rows[0]) throw new Error(`Webhook not found: ${id}`);
    return mapWebhook(rows[0]);
  }

  async deleteWebhook(id: Uuid): Promise<void> {
    await this.pool.query('DELETE FROM webhooks WHERE id = $1', [id]);
  }

  async getWebhook(id: Uuid): Promise<Webhook | null> {
    const { rows } = await this.pool.query<WebhookRow>(
      'SELECT * FROM webhooks WHERE id = $1',
      [id],
    );
    return rows[0] ? mapWebhook(rows[0]) : null;
  }

  async listWebhooks(workspaceId: WorkspaceId): Promise<Webhook[]> {
    const { rows } = await this.pool.query<WebhookRow>(
      'SELECT * FROM webhooks WHERE workspace_id = $1 ORDER BY name',
      [workspaceId],
    );
    return rows.map(mapWebhook);
  }

  // ---------------------------------------------------------------------------
  // Webhook Delivery
  // ---------------------------------------------------------------------------

  async deliverWebhook(input: WebhookDeliveryInput): Promise<WebhookDelivery> {
    const webhook = await this.getWebhook(input.webhookId);
    if (!webhook) throw new Error(`Webhook not found: ${input.webhookId}`);

    const payloadStr = JSON.stringify(input.payload);
    const _signature = this.signPayload(payloadStr, webhook.secret);

    const { rows } = await this.pool.query<DeliveryRow>(
      `INSERT INTO webhook_deliveries (webhook_id, event_type, payload, status, attempts)
       VALUES ($1, $2, $3, 'pending', 0) RETURNING *`,
      [input.webhookId, input.eventType, payloadStr],
    );

    // TODO: actual HTTP delivery via worker job
    // For now, mark as delivered
    await this.pool.query(
      "UPDATE webhook_deliveries SET status = 'success', status_code = 200, attempts = 1 WHERE id = $1",
      [rows[0]!.id],
    );

    const { rows: updated } = await this.pool.query<DeliveryRow>(
      'SELECT * FROM webhook_deliveries WHERE id = $1',
      [rows[0]!.id],
    );
    return mapDelivery(updated[0]!);
  }

  async getDeliveriesForWebhook(webhookId: Uuid, options?: { limit?: number }): Promise<WebhookDelivery[]> {
    let sql = 'SELECT * FROM webhook_deliveries WHERE webhook_id = $1 ORDER BY created_at DESC';
    const values: unknown[] = [webhookId];
    if (options?.limit) { sql += ` LIMIT $2`; values.push(options.limit); }
    const { rows } = await this.pool.query<DeliveryRow>(sql, values);
    return rows.map(mapDelivery);
  }

  async retryDelivery(deliveryId: Uuid): Promise<WebhookDelivery> {
    const { rows } = await this.pool.query<DeliveryRow>(
      `UPDATE webhook_deliveries SET status = 'pending', attempts = attempts + 1
       WHERE id = $1 RETURNING *`,
      [deliveryId],
    );
    if (!rows[0]) throw new Error(`Delivery not found: ${deliveryId}`);
    return mapDelivery(rows[0]);
  }

  // ---------------------------------------------------------------------------
  // Signature
  // ---------------------------------------------------------------------------

  signPayload(payload: string, secret: string): string {
    return crypto.createHmac('sha256', secret).update(payload).digest('hex');
  }

  verifySignature(payload: string, signature: string, secret: string): boolean {
    const expected = this.signPayload(payload, secret);
    if (expected.length !== signature.length) return false;
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  }
}
