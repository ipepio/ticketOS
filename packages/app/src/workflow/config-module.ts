import type { Pool } from 'pg';
import type { WorkspaceId, UserId, Uuid } from '@ticketos/shared';
import type {
  WorkflowConfigurationModule,
  StatusView, PriorityView, TicketTypeView, TransitionView,
  SelectableConfiguration,
  CreateStatusInput, UpdateStatusInput,
  CreatePriorityInput, UpdatePriorityInput,
  CreateTicketTypeInput, UpdateTicketTypeInput,
} from '@ticketos/domain';
import { PostgresStatusConfiguration } from './config-statuses.js';
import { PostgresPriorityConfiguration } from './config-priorities.js';
import { PostgresTicketTypeConfiguration } from './config-ticket-types.js';
import { PostgresTransitionConfiguration } from './config-transitions.js';
import { PostgresAudit } from '../db/audit.js';

export class PostgresWorkflowConfiguration implements WorkflowConfigurationModule {
  private readonly statuses: PostgresStatusConfiguration;
  private readonly priorities: PostgresPriorityConfiguration;
  private readonly ticketTypes: PostgresTicketTypeConfiguration;
  private readonly transitions: PostgresTransitionConfiguration;

  constructor(pool: Pool) {
    const audit = new PostgresAudit(pool);
    this.statuses = new PostgresStatusConfiguration(pool);
    this.priorities = new PostgresPriorityConfiguration(pool, audit);
    this.ticketTypes = new PostgresTicketTypeConfiguration(pool, audit);
    this.transitions = new PostgresTransitionConfiguration(pool);
  }

  listStatuses(workspaceId: WorkspaceId): Promise<StatusView[]> { return this.statuses.listStatuses(workspaceId); }
  createStatus(workspaceId: WorkspaceId, actorId: UserId, input: CreateStatusInput): Promise<StatusView> { return this.statuses.createStatus(workspaceId, actorId, input); }
  updateStatus(workspaceId: WorkspaceId, actorId: UserId, statusId: Uuid, input: UpdateStatusInput): Promise<StatusView> { return this.statuses.updateStatus(workspaceId, actorId, statusId, input); }
  reorderStatuses(workspaceId: WorkspaceId, actorId: UserId, orderedIds: Uuid[]): Promise<void> { return this.statuses.reorderStatuses(workspaceId, actorId, orderedIds); }
  setStatusActive(workspaceId: WorkspaceId, actorId: UserId, statusId: Uuid, isActive: boolean): Promise<StatusView> { return this.statuses.setStatusActive(workspaceId, actorId, statusId, isActive); }

  listPriorities(workspaceId: WorkspaceId): Promise<PriorityView[]> { return this.priorities.listPriorities(workspaceId); }
  createPriority(workspaceId: WorkspaceId, actorId: UserId, input: CreatePriorityInput): Promise<PriorityView> { return this.priorities.createPriority(workspaceId, actorId, input); }
  updatePriority(workspaceId: WorkspaceId, actorId: UserId, priorityId: Uuid, input: UpdatePriorityInput): Promise<PriorityView> { return this.priorities.updatePriority(workspaceId, actorId, priorityId, input); }
  reorderPriorities(workspaceId: WorkspaceId, actorId: UserId, orderedIds: Uuid[]): Promise<void> { return this.priorities.reorderPriorities(workspaceId, actorId, orderedIds); }
  setPriorityActive(workspaceId: WorkspaceId, actorId: UserId, priorityId: Uuid, isActive: boolean): Promise<PriorityView> { return this.priorities.setPriorityActive(workspaceId, actorId, priorityId, isActive); }
  setDefaultPriority(workspaceId: WorkspaceId, actorId: UserId, priorityId: Uuid): Promise<PriorityView> { return this.priorities.setDefaultPriority(workspaceId, actorId, priorityId); }

  listTicketTypes(workspaceId: WorkspaceId): Promise<TicketTypeView[]> { return this.ticketTypes.listTicketTypes(workspaceId); }
  createTicketType(workspaceId: WorkspaceId, actorId: UserId, input: CreateTicketTypeInput): Promise<TicketTypeView> { return this.ticketTypes.createTicketType(workspaceId, actorId, input); }
  updateTicketType(workspaceId: WorkspaceId, actorId: UserId, ticketTypeId: Uuid, input: UpdateTicketTypeInput): Promise<TicketTypeView> { return this.ticketTypes.updateTicketType(workspaceId, actorId, ticketTypeId, input); }
  reorderTicketTypes(workspaceId: WorkspaceId, actorId: UserId, orderedIds: Uuid[]): Promise<void> { return this.ticketTypes.reorderTicketTypes(workspaceId, actorId, orderedIds); }
  setTicketTypeActive(workspaceId: WorkspaceId, actorId: UserId, ticketTypeId: Uuid, isActive: boolean): Promise<TicketTypeView> { return this.ticketTypes.setTicketTypeActive(workspaceId, actorId, ticketTypeId, isActive); }
  setDefaultTicketType(workspaceId: WorkspaceId, actorId: UserId, ticketTypeId: Uuid | null): Promise<TicketTypeView | null> { return this.ticketTypes.setDefaultTicketType(workspaceId, actorId, ticketTypeId); }

  listTransitions(workspaceId: WorkspaceId): Promise<TransitionView[]> { return this.transitions.listTransitions(workspaceId); }
  addTransition(workspaceId: WorkspaceId, actorId: UserId, fromStatusId: Uuid, toStatusId: Uuid): Promise<TransitionView> { return this.transitions.addTransition(workspaceId, actorId, fromStatusId, toStatusId); }
  removeTransition(workspaceId: WorkspaceId, actorId: UserId, fromStatusId: Uuid, toStatusId: Uuid): Promise<void> { return this.transitions.removeTransition(workspaceId, actorId, fromStatusId, toStatusId); }

  listSelectableConfiguration(workspaceId: WorkspaceId): Promise<SelectableConfiguration> { return this.transitions.listSelectableConfiguration(workspaceId); }
}