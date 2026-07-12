// Integration module — Versioned REST API tokens and signed Webhooks
// No framework-specific types may leak into domain interfaces.

import type { WorkspaceId, UserId, Capability, Uuid, Timestamp } from '@ticketos/shared';

// ---------------------------------------------------------------------------
// Service Tokens (API keys)
// ---------------------------------------------------------------------------

export type TokenStatus = 'active' | 'revoked';

export interface ServiceToken {
  id: Uuid;
  workspaceId: WorkspaceId;
  name: string;
  tokenPrefix: string; // first 8 chars for display
  tokenHash: string; // SHA-256 hash of the full token
  capabilities: Capability[];
  createdBy: UserId;
  status: TokenStatus;
  lastUsedAt: Timestamp | null;
  expiresAt: Timestamp | null;
  createdAt: Timestamp;
}

// ---------------------------------------------------------------------------
// Webhooks
// ---------------------------------------------------------------------------

export type WebhookStatus = 'active' | 'paused' | 'disabled';

export interface Webhook {
  id: Uuid;
  workspaceId: WorkspaceId;
  name: string;
  url: string;
  secret: string; // HMAC signing secret
  events: string[]; // event types to subscribe to
  status: WebhookStatus;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface WebhookDelivery {
  id: Uuid;
  webhookId: Uuid;
  eventType: string;
  payload: string; // JSON payload
  status: 'pending' | 'success' | 'failed';
  statusCode: number | null;
  response: string | null;
  attempts: number;
  nextRetryAt: Timestamp | null;
  createdAt: Timestamp;
}

// ---------------------------------------------------------------------------
// Input types
// ---------------------------------------------------------------------------

export interface CreateServiceTokenInput {
  workspaceId: WorkspaceId;
  name: string;
  capabilities: Capability[];
  createdBy: UserId;
  expiresAt?: Timestamp | null;
}

export interface CreateWebhookInput {
  workspaceId: WorkspaceId;
  name: string;
  url: string;
  events: string[];
}

export interface WebhookDeliveryInput {
  webhookId: Uuid;
  eventType: string;
  payload: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Integration Module interface
// ---------------------------------------------------------------------------

export interface IntegrationModule {
  // Service Tokens
  createServiceToken(input: CreateServiceTokenInput): Promise<{ token: ServiceToken; rawToken: string }>;
  revokeServiceToken(id: Uuid): Promise<void>;
  getServiceToken(id: Uuid): Promise<ServiceToken | null>;
  listServiceTokens(workspaceId: WorkspaceId): Promise<ServiceToken[]>;
  validateServiceToken(rawToken: string): Promise<{ token: ServiceToken; workspaceId: WorkspaceId } | null>;

  // Webhooks
  createWebhook(input: CreateWebhookInput): Promise<Webhook>;
  updateWebhook(id: Uuid, input: Partial<CreateWebhookInput>): Promise<Webhook>;
  deleteWebhook(id: Uuid): Promise<void>;
  getWebhook(id: Uuid): Promise<Webhook | null>;
  listWebhooks(workspaceId: WorkspaceId): Promise<Webhook[]>;

  // Webhook Delivery
  deliverWebhook(input: WebhookDeliveryInput): Promise<WebhookDelivery>;
  getDeliveriesForWebhook(webhookId: Uuid, options?: { limit?: number }): Promise<WebhookDelivery[]>;
  retryDelivery(deliveryId: Uuid): Promise<WebhookDelivery>;

  // Signature
  signPayload(payload: string, secret: string): string;
  verifySignature(payload: string, signature: string, secret: string): boolean;
}
