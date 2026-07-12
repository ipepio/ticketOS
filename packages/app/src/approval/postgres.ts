import type { Pool } from 'pg';
import type {
  ApprovalModule,
  ApprovalPolicy,
  ApprovalStep,
  ApprovalInstance,
  ApprovalDecisionRecord,
  CreateApprovalPolicyInput,
  CreateApprovalStepInput,
  DecideApprovalInput,
  ApprovalInstanceStatus,
  ApprovalStepType,
  ApprovalDecision,
} from '@ticketos/domain';
import type { WorkspaceId, Uuid } from '@ticketos/shared';

interface PolicyRow {
  id: string;
  workspace_id: string;
  name: string;
  description: string | null;
  created_at: string;
}

interface StepRow {
  id: string;
  policy_id: string;
  step_order: number;
  step_type: string;
  approver_user_ids: string; // JSON
  created_at: string;
}

interface InstanceRow {
  id: string;
  ticket_id: string;
  policy_id: string;
  status: string;
  created_at: string;
  completed_at: string | null;
}

interface DecisionRow {
  id: string;
  instance_id: string;
  step_id: string;
  approver_user_id: string;
  decision: string;
  comment: string | null;
  decided_at: string;
}

function mapPolicy(r: PolicyRow): ApprovalPolicy {
  return {
    id: r.id,
    workspaceId: r.workspace_id,
    name: r.name,
    description: r.description,
    createdAt: r.created_at,
  };
}

function mapStep(r: StepRow): ApprovalStep {
  const ids = typeof r.approver_user_ids === 'string' ? JSON.parse(r.approver_user_ids) : r.approver_user_ids;
  return {
    id: r.id,
    policyId: r.policy_id,
    stepOrder: r.step_order,
    stepType: r.step_type as ApprovalStepType,
    approverUserIds: ids as Uuid[],
    createdAt: r.created_at,
  };
}

function mapInstance(r: InstanceRow): ApprovalInstance {
  return {
    id: r.id,
    ticketId: r.ticket_id,
    policyId: r.policy_id,
    status: r.status as ApprovalInstanceStatus,
    createdAt: r.created_at,
    completedAt: r.completed_at,
  };
}

function mapDecision(r: DecisionRow): ApprovalDecisionRecord {
  return {
    id: r.id,
    instanceId: r.instance_id,
    stepId: r.step_id,
    approverUserId: r.approver_user_id,
    decision: r.decision as ApprovalDecision,
    comment: r.comment,
    decidedAt: r.decided_at,
  };
}

export class PostgresApproval implements ApprovalModule {
  constructor(private pool: Pool) {}

  // ---------------------------------------------------------------------------
  // Policies
  // ---------------------------------------------------------------------------

  async createPolicy(input: CreateApprovalPolicyInput): Promise<ApprovalPolicy> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const { rows } = await client.query<PolicyRow>(
        `INSERT INTO approval_policies (workspace_id, name, description)
         VALUES ($1, $2, $3) RETURNING *`,
        [input.workspaceId, input.name, input.description ?? null],
      );
      const policy = mapPolicy(rows[0]!);

      for (const step of input.steps) {
        await client.query(
          `INSERT INTO approval_steps (policy_id, step_order, step_type, approver_user_ids)
           VALUES ($1, $2, $3, $4)`,
          [policy.id, step.stepOrder, step.stepType, JSON.stringify(step.approverUserIds)],
        );
      }

      await client.query('COMMIT');
      return policy;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async getPolicy(id: Uuid): Promise<ApprovalPolicy | null> {
    const { rows } = await this.pool.query<PolicyRow>(
      'SELECT * FROM approval_policies WHERE id = $1',
      [id],
    );
    return rows[0] ? mapPolicy(rows[0]) : null;
  }

  async listPolicies(workspaceId: WorkspaceId): Promise<ApprovalPolicy[]> {
    const { rows } = await this.pool.query<PolicyRow>(
      'SELECT * FROM approval_policies WHERE workspace_id = $1 ORDER BY name',
      [workspaceId],
    );
    return rows.map(mapPolicy);
  }

  async deletePolicy(id: Uuid): Promise<void> {
    await this.pool.query('DELETE FROM approval_policies WHERE id = $1', [id]);
  }

  // ---------------------------------------------------------------------------
  // Steps
  // ---------------------------------------------------------------------------

  async addStep(policyId: Uuid, input: CreateApprovalStepInput): Promise<ApprovalStep> {
    const { rows } = await this.pool.query<StepRow>(
      `INSERT INTO approval_steps (policy_id, step_order, step_type, approver_user_ids)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [policyId, input.stepOrder, input.stepType, JSON.stringify(input.approverUserIds)],
    );
    return mapStep(rows[0]!);
  }

  async removeStep(stepId: Uuid): Promise<void> {
    await this.pool.query('DELETE FROM approval_steps WHERE id = $1', [stepId]);
  }

  async getStepsForPolicy(policyId: Uuid): Promise<ApprovalStep[]> {
    const { rows } = await this.pool.query<StepRow>(
      'SELECT * FROM approval_steps WHERE policy_id = $1 ORDER BY step_order',
      [policyId],
    );
    return rows.map(mapStep);
  }

  // ---------------------------------------------------------------------------
  // Instances
  // ---------------------------------------------------------------------------

  async startApproval(ticketId: Uuid, policyId: Uuid): Promise<ApprovalInstance> {
    const { rows } = await this.pool.query<InstanceRow>(
      `INSERT INTO approval_instances (ticket_id, policy_id, status)
       VALUES ($1, $2, 'pending') RETURNING *`,
      [ticketId, policyId],
    );
    return mapInstance(rows[0]!);
  }

  async getInstanceForTicket(ticketId: Uuid): Promise<ApprovalInstance | null> {
    const { rows } = await this.pool.query<InstanceRow>(
      'SELECT * FROM approval_instances WHERE ticket_id = $1 ORDER BY created_at DESC LIMIT 1',
      [ticketId],
    );
    return rows[0] ? mapInstance(rows[0]) : null;
  }

  async decideApproval(input: DecideApprovalInput): Promise<ApprovalDecisionRecord> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Record decision
      const { rows } = await client.query<DecisionRow>(
        `INSERT INTO approval_decisions (instance_id, step_id, approver_user_id, decision, comment)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [input.instanceId, input.stepId, input.approverUserId, input.decision, input.comment ?? null],
      );

      // Check if step is complete
      const { rows: decisions } = await client.query<DecisionRow>(
        'SELECT * FROM approval_decisions WHERE instance_id = $1 AND step_id = $2',
        [input.instanceId, input.stepId],
      );

      const { rows: steps } = await client.query<StepRow>(
        'SELECT * FROM approval_steps WHERE id = $1',
        [input.stepId],
      );

      if (steps[0]) {
        const step = steps[0]!;
        const approverIds = typeof step.approver_user_ids === 'string'
          ? JSON.parse(step.approver_user_ids) : step.approver_user_ids;

        let stepComplete = false;
        if (step.step_type === 'any-one' && decisions.length >= 1) {
          stepComplete = true;
        } else if (step.step_type === 'all' && decisions.length >= approverIds.length) {
          stepComplete = true;
        }

        if (stepComplete) {
          const hasRejection = decisions.some((d) => d.decision === 'rejected');
          const newStatus = hasRejection ? 'rejected' : 'approved';
          await client.query(
            'UPDATE approval_instances SET status = $1, completed_at = NOW() WHERE id = $2',
            [newStatus, input.instanceId],
          );
        }
      }

      await client.query('COMMIT');
      return mapDecision(rows[0]!);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async getDecisionsForInstance(instanceId: Uuid): Promise<ApprovalDecisionRecord[]> {
    const { rows } = await this.pool.query<DecisionRow>(
      'SELECT * FROM approval_decisions WHERE instance_id = $1 ORDER BY decided_at',
      [instanceId],
    );
    return rows.map(mapDecision);
  }

  // ---------------------------------------------------------------------------
  // Status checks
  // ---------------------------------------------------------------------------

  async isApproved(instanceId: Uuid): Promise<boolean> {
    const instance = await this.getInstance(instanceId);
    return instance?.status === 'approved';
  }

  async isRejected(instanceId: Uuid): Promise<boolean> {
    const instance = await this.getInstance(instanceId);
    return instance?.status === 'rejected';
  }

  async isPending(instanceId: Uuid): Promise<boolean> {
    const instance = await this.getInstance(instanceId);
    return instance?.status === 'pending';
  }

  private async getInstance(id: Uuid): Promise<ApprovalInstance | null> {
    const { rows } = await this.pool.query<InstanceRow>(
      'SELECT * FROM approval_instances WHERE id = $1',
      [id],
    );
    return rows[0] ? mapInstance(rows[0]) : null;
  }
}
