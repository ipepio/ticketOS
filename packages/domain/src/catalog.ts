// Service Catalog module — Published items for structured request intake
// No framework-specific types may leak into domain interfaces.

import type { WorkspaceId, QueueId, Uuid, Timestamp } from '@ticketos/shared';

// ---------------------------------------------------------------------------
// Catalog Item
// ---------------------------------------------------------------------------

export type CatalogItemStatus = 'draft' | 'published' | 'archived';

export interface CatalogItem {
  id: Uuid;
  workspaceId: WorkspaceId;
  name: string;
  description: string;
  status: CatalogItemStatus;
  ticketTypeId: Uuid | null;
  formId: Uuid | null;
  queueId: QueueId | null;
  priority: string;
  slaPolicyId: Uuid | null;
  icon: string | null;
  sortOrder: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  publishedAt: Timestamp | null;
}

// ---------------------------------------------------------------------------
// Input types
// ---------------------------------------------------------------------------

export interface CreateCatalogItemInput {
  workspaceId: WorkspaceId;
  name: string;
  description: string;
  ticketTypeId?: Uuid | null;
  formId?: Uuid | null;
  queueId?: QueueId | null;
  priority?: string;
  slaPolicyId?: Uuid | null;
  icon?: string | null;
  sortOrder?: number;
}

export interface UpdateCatalogItemInput {
  name?: string;
  description?: string;
  ticketTypeId?: Uuid | null;
  formId?: Uuid | null;
  queueId?: QueueId | null;
  priority?: string;
  slaPolicyId?: Uuid | null;
  icon?: string | null;
  sortOrder?: number;
  status?: CatalogItemStatus;
}

// ---------------------------------------------------------------------------
// Service Catalog Module interface
// ---------------------------------------------------------------------------

export interface CatalogModule {
  createItem(input: CreateCatalogItemInput): Promise<CatalogItem>;
  updateItem(id: Uuid, input: UpdateCatalogItemInput): Promise<CatalogItem>;
  deleteItem(id: Uuid): Promise<void>;
  getItem(id: Uuid): Promise<CatalogItem | null>;
  listItems(workspaceId: WorkspaceId, options?: { status?: CatalogItemStatus }): Promise<CatalogItem[]>;
  publishItem(id: Uuid): Promise<CatalogItem>;
  archiveItem(id: Uuid): Promise<CatalogItem>;
}
