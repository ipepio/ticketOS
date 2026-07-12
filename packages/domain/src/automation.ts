// Automation module — Bounded Workspace event-condition-action rules
// No framework-specific types may leak into domain interfaces.

import type { WorkspaceId, Timestamp, Uuid } from '@ticketos/shared';

// ---------------------------------------------------------------------------
// Event types that can trigger rules
// ---------------------------------------------------------------------------

export type AutomationEvent =
  | 'ticket-created'
  | 'ticket-updated'
  | 'ticket-status-changed'
  | 'ticket-priority-changed'
  | 'ticket-assigned'
  | 'ticket-moved'
  | 'ticket-tagged'
  | 'ticket-untagged'
  | 'ticket-commented'
  | 'ticket-cancelled'
  | 'sla-at-risk'
  | 'sla-breach';

// ---------------------------------------------------------------------------
// Condition operators
// ---------------------------------------------------------------------------

export type ConditionField =
  | 'status'
  | 'priority'
  | 'queue_id'
  | 'assignee_id'
  | 'ticket_type_id'
  | 'tag'
  | 'organization_id'
  | 'created_by';

export type ConditionOperator =
  | 'equals'
  | 'not_equals'
  | 'in'
  | 'not_in'
  | 'contains'
  | 'is_empty'
  | 'is_not_empty';

export interface AutomationCondition {
  field: ConditionField;
  operator: ConditionOperator;
  value: string | string[];
}

// ---------------------------------------------------------------------------
// Action types
// ---------------------------------------------------------------------------

export type AutomationActionType =
  | 'move-to-queue'
  | 'assign-to-agent'
  | 'set-status'
  | 'set-priority'
  | 'add-tag'
  | 'remove-tag'
  | 'send-notification'
  | 'add-note';

export interface AutomationAction {
  type: AutomationActionType;
  params: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Rule
// ---------------------------------------------------------------------------

export type AutomationRuleStatus = 'active' | 'paused' | 'disabled';

export interface AutomationRule {
  id: Uuid;
  workspaceId: WorkspaceId;
  name: string;
  description: string | null;
  status: AutomationRuleStatus;
  event: AutomationEvent;
  conditions: AutomationCondition[];
  actions: AutomationAction[];
  sortOrder: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ---------------------------------------------------------------------------
// Execution log
// ---------------------------------------------------------------------------

export type AutomationExecutionStatus = 'success' | 'failure' | 'skipped' | 'loop-blocked';

export interface AutomationExecution {
  id: Uuid;
  ruleId: Uuid;
  ticketId: Uuid;
  causalChainId: Uuid; // tracks the causal event chain
  depth: number; // depth in the causal chain
  status: AutomationExecutionStatus;
  result: string | null; // human-readable result
  error: string | null;
  executedAt: Timestamp;
}

// ---------------------------------------------------------------------------
// Input types
// ---------------------------------------------------------------------------

export interface CreateAutomationRuleInput {
  workspaceId: WorkspaceId;
  name: string;
  description?: string | null;
  event: AutomationEvent;
  conditions: AutomationCondition[];
  actions: AutomationAction[];
  sortOrder?: number;
}

export interface UpdateAutomationRuleInput {
  name?: string;
  description?: string | null;
  status?: AutomationRuleStatus;
  event?: AutomationEvent;
  conditions?: AutomationCondition[];
  actions?: AutomationAction[];
  sortOrder?: number;
}

// ---------------------------------------------------------------------------
// Automation Module interface
// ---------------------------------------------------------------------------

export interface AutomationModule {
  // Rules
  createRule(input: CreateAutomationRuleInput): Promise<AutomationRule>;
  updateRule(id: Uuid, input: UpdateAutomationRuleInput): Promise<AutomationRule>;
  deleteRule(id: Uuid): Promise<void>;
  getRule(id: Uuid): Promise<AutomationRule | null>;
  listRules(workspaceId: WorkspaceId): Promise<AutomationRule[]>;
  listActiveRules(workspaceId: WorkspaceId, event: AutomationEvent): Promise<AutomationRule[]>;

  // Execution
  evaluateAndExecute(
    workspaceId: WorkspaceId,
    event: AutomationEvent,
    ticketId: Uuid,
    causalChainId?: Uuid,
    depth?: number,
  ): Promise<AutomationExecution[]>;

  // Execution log
  getExecutionsForTicket(ticketId: Uuid): Promise<AutomationExecution[]>;
  getExecutionsForRule(ruleId: Uuid): Promise<AutomationExecution[]>;

  // Constants
  readonly MAX_CASCADE_DEPTH: number;
}
