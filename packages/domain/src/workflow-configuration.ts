// Workflow Configuration module — domain interfaces for Status, Priority,
// Ticket Type, and Transition configuration.  No framework types.
//
// All operations are Workspace-scoped via an explicit `workspaceId` argument.

import type { WorkspaceId, UserId, Uuid } from '@ticketos/shared';

// ---------------------------------------------------------------------------
// Value types (mirrors the column types from migration 022/024/025)
// ---------------------------------------------------------------------------

/** Canonical status category from `status_categories.name`. */
export type StatusCategory = 'new' | 'open' | 'pending' | 'resolved' | 'closed';

/** Canonical ticket type category from `ticket_type_categories.name`. */
export type TicketTypeCategory = 'incident' | 'service-request';

// ---------------------------------------------------------------------------
// Read models (View)
// ---------------------------------------------------------------------------

export interface StatusView {
  id: Uuid;
  workspaceId: WorkspaceId;
  name: string;
  category: StatusCategory;
  description: string | null;
  color: string;
  sortOrder: number;
  isDefault: boolean;
  isActive: boolean;
}

export interface PriorityView {
  id: Uuid;
  workspaceId: WorkspaceId;
  name: string;
  description: string | null;
  color: string;
  sortOrder: number;
  isDefault: boolean;
  isActive: boolean;
}

export interface TicketTypeView {
  id: Uuid;
  workspaceId: WorkspaceId;
  name: string;
  category: TicketTypeCategory;
  description: string | null;
  color: string;
  sortOrder: number;
  isDefault: boolean;
  isActive: boolean;
}

export interface TransitionView {
  id: Uuid;
  workspaceId: WorkspaceId;
  fromStatusId: Uuid;
  toStatusId: Uuid;
}

/** Combined view returned by the catalog endpoint used during Ticket creation. */
export interface SelectableConfiguration {
  statuses: StatusView[];
  priorities: PriorityView[];
  ticketTypes: TicketTypeView[];
}

// ---------------------------------------------------------------------------
// Input types
// ---------------------------------------------------------------------------

export interface CreateStatusInput {
  name: string;
  category: StatusCategory;
  description?: string | null;
  color?: string;
}

export interface UpdateStatusInput {
  name?: string | null;
  category?: StatusCategory | null;
  description?: string | null;
  color?: string | null;
  sortOrder?: number | null;
  isDefault?: boolean | null;
  isActive?: boolean | null;
}

export interface CreatePriorityInput {
  name: string;
  description?: string | null;
  color?: string;
  sortOrder?: number;
}

export interface UpdatePriorityInput {
  name?: string | null;
  description?: string | null;
  color?: string | null;
  sortOrder?: number | null;
  isDefault?: boolean | null;
  isActive?: boolean | null;
}

export interface CreateTicketTypeInput {
  name: string;
  category: TicketTypeCategory;
  description?: string | null;
  color?: string;
  sortOrder?: number;
}

export interface UpdateTicketTypeInput {
  name?: string | null;
  category?: TicketTypeCategory | null;
  description?: string | null;
  color?: string | null;
  sortOrder?: number | null;
  isDefault?: boolean | null;
  isActive?: boolean | null;
}

// ---------------------------------------------------------------------------
// Error types — stable machine-readable codes (S10)
// ---------------------------------------------------------------------------

export type WorkflowConfigurationErrorCode =
  | 'status-name-required'
  | 'status-name-duplicate'
  | 'status-category-invalid'
  | 'priority-name-required'
  | 'priority-name-duplicate'
  | 'ticket-type-name-required'
  | 'ticket-type-name-duplicate'
  | 'ticket-type-category-invalid'
  | 'ticket-type-category-in-use'
  | 'sort-order-invalid'
  | 'default-inactive'
  | 'transition-invalid'
  | 'transition-duplicate'
  | 'not-found'
  | 'cross-workspace';

export class ConfigurationValidationError extends Error {
  constructor(
    message: string,
    public readonly code: WorkflowConfigurationErrorCode,
  ) {
    super(message);
    this.name = 'ConfigurationValidationError';
  }
}

export class ConfigurationConflictError extends Error {
  constructor(
    message: string,
    public readonly code: WorkflowConfigurationErrorCode,
  ) {
    super(message);
    this.name = 'ConfigurationConflictError';
  }
}

export class ConfigurationNotFoundError extends Error {
  constructor(
    message: string,
    public readonly code: WorkflowConfigurationErrorCode = 'not-found',
  ) {
    super(message);
    this.name = 'ConfigurationNotFoundError';
  }
}

export class CrossWorkspaceReferenceError extends Error {
  constructor(
    message: string,
    public readonly code: WorkflowConfigurationErrorCode = 'cross-workspace',
  ) {
    super(message);
    this.name = 'CrossWorkspaceReferenceError';
  }
}

// ---------------------------------------------------------------------------
// Module interface
// ---------------------------------------------------------------------------

export interface WorkflowConfigurationModule {
  // --- Statuses (S4) ---

  listStatuses(workspaceId: WorkspaceId): Promise<StatusView[]>;

  createStatus(
    workspaceId: WorkspaceId,
    actorId: UserId,
    input: CreateStatusInput,
  ): Promise<StatusView>;

  updateStatus(
    workspaceId: WorkspaceId,
    actorId: UserId,
    statusId: Uuid,
    input: UpdateStatusInput,
  ): Promise<StatusView>;

  /**
   * Reorder statuses to `orderedIds`.  The array must contain every status
   * id exactly once and correspond to the workspace.
   */
  reorderStatuses(
    workspaceId: WorkspaceId,
    actorId: UserId,
    orderedIds: Uuid[],
  ): Promise<void>;

  /** Activate or deactivate a single status. */
  setStatusActive(
    workspaceId: WorkspaceId,
    actorId: UserId,
    statusId: Uuid,
    isActive: boolean,
  ): Promise<StatusView>;

  // --- Priorities (S4, S5) ---

  listPriorities(workspaceId: WorkspaceId): Promise<PriorityView[]>;

  createPriority(
    workspaceId: WorkspaceId,
    actorId: UserId,
    input: CreatePriorityInput,
  ): Promise<PriorityView>;

  updatePriority(
    workspaceId: WorkspaceId,
    actorId: UserId,
    priorityId: Uuid,
    input: UpdatePriorityInput,
  ): Promise<PriorityView>;

  /** Reorder priorities to `orderedIds`. */
  reorderPriorities(
    workspaceId: WorkspaceId,
    actorId: UserId,
    orderedIds: Uuid[],
  ): Promise<void>;

  /** Activate or deactivate a single priority. */
  setPriorityActive(
    workspaceId: WorkspaceId,
    actorId: UserId,
    priorityId: Uuid,
    isActive: boolean,
  ): Promise<PriorityView>;

  /**
   * Set the single active default priority for the workspace (S5).
   * Clears the previous default in the same transaction.
   * `priorityId` must be `null` is NOT supported here — the caller
   * must set another priority as default first.
   */
  setDefaultPriority(
    workspaceId: WorkspaceId,
    actorId: UserId,
    priorityId: Uuid,
  ): Promise<PriorityView>;

  // --- Ticket Types (S4, S5) ---

  listTicketTypes(workspaceId: WorkspaceId): Promise<TicketTypeView[]>;

  createTicketType(
    workspaceId: WorkspaceId,
    actorId: UserId,
    input: CreateTicketTypeInput,
  ): Promise<TicketTypeView>;

  updateTicketType(
    workspaceId: WorkspaceId,
    actorId: UserId,
    ticketTypeId: Uuid,
    input: UpdateTicketTypeInput,
  ): Promise<TicketTypeView>;

  /** Reorder ticket types to `orderedIds`. */
  reorderTicketTypes(
    workspaceId: WorkspaceId,
    actorId: UserId,
    orderedIds: Uuid[],
  ): Promise<void>;

  /** Activate or deactivate a single ticket type. */
  setTicketTypeActive(
    workspaceId: WorkspaceId,
    actorId: UserId,
    ticketTypeId: Uuid,
    isActive: boolean,
  ): Promise<TicketTypeView>;

  /**
   * Set the single active default ticket type for the workspace (S5).
   * `ticketTypeId` may be `null` to clear the default (meaning Ticket
   * creation will require an explicit Type).
   */
  setDefaultTicketType(
    workspaceId: WorkspaceId,
    actorId: UserId,
    ticketTypeId: Uuid | null,
  ): Promise<TicketTypeView | null>;

  // --- Transitions ---

  listTransitions(workspaceId: WorkspaceId): Promise<TransitionView[]>;

  addTransition(
    workspaceId: WorkspaceId,
    actorId: UserId,
    fromStatusId: Uuid,
    toStatusId: Uuid,
  ): Promise<TransitionView>;

  removeTransition(
    workspaceId: WorkspaceId,
    actorId: UserId,
    fromStatusId: Uuid,
    toStatusId: Uuid,
  ): Promise<void>;

  // --- Catalogue for Ticket creation (S9) ---

  /**
   * Return only active Ticket Types and Priorities ordered by `sortOrder`,
   * plus all active Statuses, so the Ticket creation form is driven by
   * the current workspace configuration.
   */
  listSelectableConfiguration(workspaceId: WorkspaceId): Promise<SelectableConfiguration>;
}