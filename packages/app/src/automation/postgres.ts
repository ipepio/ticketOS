import type { Pool } from 'pg';
import type {
  AutomationModule,
  AutomationRule,
  AutomationExecution,
  CreateAutomationRuleInput,
  UpdateAutomationRuleInput,
  AutomationEvent,
  AutomationRuleStatus,
  AutomationExecutionStatus,
  AutomationCondition,
  AutomationAction,
} from '@ticketos/domain';
import type { WorkspaceId, Uuid } from '@ticketos/shared';

interface RuleRow {
  id: string;
  workspace_id: string;
  name: string;
  description: string | null;
  status: string;
  event: string;
  conditions: string; // JSON
  actions: string; // JSON
  sort_order: number;
  created_at: string;
  updated_at: string;
}

interface ExecutionRow {
  id: string;
  rule_id: string;
  ticket_id: string;
  causal_chain_id: string;
  depth: number;
  status: string;
  result: string | null;
  error: string | null;
  executed_at: string;
}

function mapRule(r: RuleRow): AutomationRule {
  const conds = typeof r.conditions === 'string' ? JSON.parse(r.conditions) : r.conditions;
  const acts = typeof r.actions === 'string' ? JSON.parse(r.actions) : r.actions;
  return {
    id: r.id,
    workspaceId: r.workspace_id,
    name: r.name,
    description: r.description,
    status: r.status as AutomationRuleStatus,
    event: r.event as AutomationEvent,
    conditions: conds as AutomationCondition[],
    actions: acts as AutomationAction[],
    sortOrder: r.sort_order,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function mapExecution(r: ExecutionRow): AutomationExecution {
  return {
    id: r.id,
    ruleId: r.rule_id,
    ticketId: r.ticket_id,
    causalChainId: r.causal_chain_id,
    depth: r.depth,
    status: r.status as AutomationExecutionStatus,
    result: r.result,
    error: r.error,
    executedAt: r.executed_at,
  };
}

export class PostgresAutomation implements AutomationModule {
  readonly MAX_CASCADE_DEPTH = 10;

  constructor(private pool: Pool) {}

  async createRule(input: CreateAutomationRuleInput): Promise<AutomationRule> {
    const { rows } = await this.pool.query<RuleRow>(
      `INSERT INTO automation_rules (workspace_id, name, description, event, conditions, actions, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [
        input.workspaceId,
        input.name,
        input.description ?? null,
        input.event,
        JSON.stringify(input.conditions),
        JSON.stringify(input.actions),
        input.sortOrder ?? 0,
      ],
    );
    return mapRule(rows[0]!);
  }

  async updateRule(id: Uuid, input: UpdateAutomationRuleInput): Promise<AutomationRule> {
    const sets: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (input.name !== undefined) { sets.push(`name = $${idx++}`); values.push(input.name); }
    if (input.description !== undefined) { sets.push(`description = $${idx++}`); values.push(input.description); }
    if (input.status !== undefined) { sets.push(`status = $${idx++}`); values.push(input.status); }
    if (input.event !== undefined) { sets.push(`event = $${idx++}`); values.push(input.event); }
    if (input.conditions !== undefined) { sets.push(`conditions = $${idx++}`); values.push(JSON.stringify(input.conditions)); }
    if (input.actions !== undefined) { sets.push(`actions = $${idx++}`); values.push(JSON.stringify(input.actions)); }
    if (input.sortOrder !== undefined) { sets.push(`sort_order = $${idx++}`); values.push(input.sortOrder); }

    sets.push('updated_at = NOW()');
    values.push(id);

    const { rows } = await this.pool.query<RuleRow>(
      `UPDATE automation_rules SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
      values,
    );
    if (!rows[0]) throw new Error(`Automation rule not found: ${id}`);
    return mapRule(rows[0]);
  }

  async deleteRule(id: Uuid): Promise<void> {
    await this.pool.query('DELETE FROM automation_rules WHERE id = $1', [id]);
  }

  async getRule(id: Uuid): Promise<AutomationRule | null> {
    const { rows } = await this.pool.query<RuleRow>(
      'SELECT * FROM automation_rules WHERE id = $1',
      [id],
    );
    return rows[0] ? mapRule(rows[0]) : null;
  }

  async listRules(workspaceId: WorkspaceId): Promise<AutomationRule[]> {
    const { rows } = await this.pool.query<RuleRow>(
      'SELECT * FROM automation_rules WHERE workspace_id = $1 ORDER BY sort_order, name',
      [workspaceId],
    );
    return rows.map(mapRule);
  }

  async listActiveRules(workspaceId: WorkspaceId, event: AutomationEvent): Promise<AutomationRule[]> {
    const { rows } = await this.pool.query<RuleRow>(
      `SELECT * FROM automation_rules
       WHERE workspace_id = $1 AND event = $2 AND status = 'active'
       ORDER BY sort_order, name`,
      [workspaceId, event],
    );
    return rows.map(mapRule);
  }

  async evaluateAndExecute(
    workspaceId: WorkspaceId,
    event: AutomationEvent,
    ticketId: Uuid,
    causalChainId?: Uuid,
    depth: number = 0,
  ): Promise<AutomationExecution[]> {
    // Loop protection
    if (depth >= this.MAX_CASCADE_DEPTH) {
      // Return a synthetic execution without persisting (no valid rule to reference)
      return [{
        id: crypto.randomUUID(),
        ruleId: '',
        ticketId,
        causalChainId: causalChainId ?? ticketId,
        depth,
        status: 'loop-blocked' as AutomationExecutionStatus,
        result: `Maximum cascade depth (${this.MAX_CASCADE_DEPTH}) exceeded`,
        error: null,
        executedAt: new Date().toISOString(),
      }];
    }

    const rules = await this.listActiveRules(workspaceId, event);
    const executions: AutomationExecution[] = [];

    for (const rule of rules) {
      // Check if this rule already executed in this causal chain (idempotency)
      const alreadyExecuted = await this.hasExecutedInChain(
        rule.id,
        causalChainId ?? ticketId,
      );
      if (alreadyExecuted) {
        const execution = await this.recordExecution({
          ruleId: rule.id,
          ticketId,
          causalChainId: causalChainId ?? ticketId,
          depth,
          status: 'skipped',
          result: 'Rule already executed in this causal chain',
        });
        executions.push(execution);
        continue;
      }

      // Evaluate conditions
      const conditionsMet = await this.evaluateConditions(rule.conditions, ticketId);
      if (!conditionsMet) {
        const execution = await this.recordExecution({
          ruleId: rule.id,
          ticketId,
          causalChainId: causalChainId ?? ticketId,
          depth,
          status: 'skipped',
          result: 'Conditions not met',
        });
        executions.push(execution);
        continue;
      }

      // Execute actions
      try {
        await this.executeActions(rule.actions, ticketId);
        const execution = await this.recordExecution({
          ruleId: rule.id,
          ticketId,
          causalChainId: causalChainId ?? ticketId,
          depth,
          status: 'success',
          result: `Executed ${rule.actions.length} action(s)`,
        });
        executions.push(execution);
      } catch (err) {
        const execution = await this.recordExecution({
          ruleId: rule.id,
          ticketId,
          causalChainId: causalChainId ?? ticketId,
          depth,
          status: 'failure',
          error: String(err),
        });
        executions.push(execution);
      }
    }

    return executions;
  }

  async getExecutionsForTicket(ticketId: Uuid): Promise<AutomationExecution[]> {
    const { rows } = await this.pool.query<ExecutionRow>(
      'SELECT * FROM automation_executions WHERE ticket_id = $1 ORDER BY executed_at',
      [ticketId],
    );
    return rows.map(mapExecution);
  }

  async getExecutionsForRule(ruleId: Uuid): Promise<AutomationExecution[]> {
    const { rows } = await this.pool.query<ExecutionRow>(
      'SELECT * FROM automation_executions WHERE rule_id = $1 ORDER BY executed_at DESC',
      [ruleId],
    );
    return rows.map(mapExecution);
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private async hasExecutedInChain(ruleId: Uuid, causalChainId: Uuid): Promise<boolean> {
    const { rows } = await this.pool.query(
      `SELECT 1 FROM automation_executions
       WHERE rule_id = $1 AND causal_chain_id = $2 AND status = 'success'
       LIMIT 1`,
      [ruleId, causalChainId],
    );
    return rows.length > 0;
  }

  private async evaluateConditions(
    conditions: AutomationCondition[],
    _ticketId: Uuid,
  ): Promise<boolean> {
    // Simplified: if no conditions, rule is eligible
    if (conditions.length === 0) return true;

    // TODO: implement full condition evaluation against ticket state
    // For now, return true (conditions are evaluated at the API/route level)
    return true;
  }

  private async executeActions(
    actions: AutomationAction[],
    _ticketId: Uuid,
  ): Promise<void> {
    // TODO: implement actual action execution (move queue, assign, etc.)
    // For now, record that actions were executed
    for (const action of actions) {
      // Actions will be wired to the Ticket module in the API layer
      void action;
    }
  }

  private async recordExecution(input: {
    ruleId: Uuid;
    ticketId: Uuid;
    causalChainId: Uuid;
    depth: number;
    status: AutomationExecutionStatus;
    result?: string;
    error?: string;
  }): Promise<AutomationExecution> {
    const { rows } = await this.pool.query<ExecutionRow>(
      `INSERT INTO automation_executions (rule_id, ticket_id, causal_chain_id, depth, status, result, error)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [
        input.ruleId,
        input.ticketId,
        input.causalChainId,
        input.depth,
        input.status,
        input.result ?? null,
        input.error ?? null,
      ],
    );
    return mapExecution(rows[0]!);
  }
}
