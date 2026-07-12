import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Pool } from 'pg';
import { PostgresApproval } from './postgres.js';

const MIGRATIONS = [
  `CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL UNIQUE, verified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS workspaces (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS tickets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    title TEXT NOT NULL, description TEXT,
    status TEXT NOT NULL DEFAULT 'backlog' CHECK (status IN ('backlog', 'todo', 'in_progress', 'done', 'cancelled')),
    priority TEXT NOT NULL DEFAULT 'normal',
    created_by UUID NOT NULL REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS approval_policies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name TEXT NOT NULL, description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS approval_steps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    policy_id UUID NOT NULL REFERENCES approval_policies(id) ON DELETE CASCADE,
    step_order INTEGER NOT NULL, step_type TEXT NOT NULL CHECK (step_type IN ('any-one', 'all')),
    approver_user_ids JSONB NOT NULL DEFAULT '[]', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(policy_id, step_order)
  )`,
  `CREATE TABLE IF NOT EXISTS approval_instances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    policy_id UUID NOT NULL REFERENCES approval_policies(id) ON DELETE RESTRICT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), completed_at TIMESTAMPTZ
  )`,
  `CREATE TABLE IF NOT EXISTS approval_decisions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    instance_id UUID NOT NULL REFERENCES approval_instances(id) ON DELETE CASCADE,
    step_id UUID NOT NULL REFERENCES approval_steps(id) ON DELETE CASCADE,
    approver_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    decision TEXT NOT NULL CHECK (decision IN ('approved', 'rejected')),
    comment TEXT, decided_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(instance_id, step_id, approver_user_id)
  )`,
];

function createTestPool(): Pool {
  return new Pool({
    connectionString: process.env.DATABASE_URL ?? 'postgresql://ticketos:ticketos@localhost:5432/ticketos',
  });
}

describe('Approval Module', () => {
  let pool: Pool;
  let approval: PostgresApproval;
  let workspaceId: string;
  let userId1: string;
  let userId2: string;
  let ticketId: string;

  beforeEach(async () => {
    pool = createTestPool();
    for (const sql of MIGRATIONS) {
      await pool.query(sql).catch(() => {});
    }

    await pool.query('DELETE FROM approval_decisions');
    await pool.query('DELETE FROM approval_instances');
    await pool.query('DELETE FROM approval_steps');
    await pool.query('DELETE FROM approval_policies');
    await pool.query('DELETE FROM tickets');
    await pool.query('DELETE FROM users');
    await pool.query('DELETE FROM workspaces');

    approval = new PostgresApproval(pool);

    const { rows: wsRows } = await pool.query(
      'INSERT INTO workspaces (id, name) VALUES ($1, $2) RETURNING id',
      [crypto.randomUUID(), 'Approval Test WS'],
    );
    workspaceId = wsRows[0]!.id;

    const { rows: u1 } = await pool.query(
      'INSERT INTO users (id, email) VALUES ($1, $2) RETURNING id',
      [crypto.randomUUID(), 'approver1@test.com'],
    );
    userId1 = u1[0]!.id;

    const { rows: u2 } = await pool.query(
      'INSERT INTO users (id, email) VALUES ($1, $2) RETURNING id',
      [crypto.randomUUID(), 'approver2@test.com'],
    );
    userId2 = u2[0]!.id;

    const { rows: t } = await pool.query(
      'INSERT INTO tickets (workspace_id, title, created_by) VALUES ($1, $2, $3) RETURNING id',
      [workspaceId, 'Approval Ticket', userId1],
    );
    ticketId = t[0]!.id;
  });

  afterEach(async () => {
    await pool.end();
  });

  describe('Policies', () => {
    it('creates a policy with steps', async () => {
      const policy = await approval.createPolicy({
        workspaceId,
        name: 'Manager Approval',
        description: 'Requires manager approval',
        steps: [
          { stepOrder: 1, stepType: 'any-one', approverUserIds: [userId1] },
        ],
      });
      expect(policy.id).toBeDefined();
      expect(policy.name).toBe('Manager Approval');

      const steps = await approval.getStepsForPolicy(policy.id);
      expect(steps).toHaveLength(1);
      expect(steps[0]!.stepType).toBe('any-one');
    });

    it('adds a step to an existing policy', async () => {
      const policy = await approval.createPolicy({
        workspaceId,
        name: 'Multi-Step',
        steps: [],
      });

      const step = await approval.addStep(policy.id, {
        stepOrder: 1,
        stepType: 'all',
        approverUserIds: [userId1, userId2],
      });
      expect(step.stepType).toBe('all');
      expect(step.approverUserIds).toHaveLength(2);
    });
  });

  describe('Approval Instances', () => {
    it('starts an approval for a ticket', async () => {
      const policy = await approval.createPolicy({
        workspaceId,
        name: 'Test Policy',
        steps: [{ stepOrder: 1, stepType: 'any-one', approverUserIds: [userId1] }],
      });

      const instance = await approval.startApproval(ticketId, policy.id);
      expect(instance.status).toBe('pending');
    });

    it('approves with any-one semantics', async () => {
      const policy = await approval.createPolicy({
        workspaceId,
        name: 'Any-One',
        steps: [{ stepOrder: 1, stepType: 'any-one', approverUserIds: [userId1, userId2] }],
      });

      const instance = await approval.startApproval(ticketId, policy.id);
      const steps = await approval.getStepsForPolicy(policy.id);

      await approval.decideApproval({
        instanceId: instance.id,
        stepId: steps[0]!.id,
        approverUserId: userId1,
        decision: 'approved',
      });

      const isApproved = await approval.isApproved(instance.id);
      expect(isApproved).toBe(true);
    });

    it('rejects when any-one step is rejected', async () => {
      const policy = await approval.createPolicy({
        workspaceId,
        name: 'Reject Test',
        steps: [{ stepOrder: 1, stepType: 'any-one', approverUserIds: [userId1] }],
      });

      const instance = await approval.startApproval(ticketId, policy.id);
      const steps = await approval.getStepsForPolicy(policy.id);

      await approval.decideApproval({
        instanceId: instance.id,
        stepId: steps[0]!.id,
        approverUserId: userId1,
        decision: 'rejected',
      });

      const isRejected = await approval.isRejected(instance.id);
      expect(isRejected).toBe(true);
    });

    it('all step requires every approver', async () => {
      const policy = await approval.createPolicy({
        workspaceId,
        name: 'All Must Approve',
        steps: [{ stepOrder: 1, stepType: 'all', approverUserIds: [userId1, userId2] }],
      });

      const instance = await approval.startApproval(ticketId, policy.id);
      const steps = await approval.getStepsForPolicy(policy.id);

      // First approver
      await approval.decideApproval({
        instanceId: instance.id,
        stepId: steps[0]!.id,
        approverUserId: userId1,
        decision: 'approved',
      });

      // Should still be pending
      const stillPending = await approval.isPending(instance.id);
      expect(stillPending).toBe(true);

      // Second approver
      await approval.decideApproval({
        instanceId: instance.id,
        stepId: steps[0]!.id,
        approverUserId: userId2,
        decision: 'approved',
      });

      const isApproved = await approval.isApproved(instance.id);
      expect(isApproved).toBe(true);
    });

    it('records decisions', async () => {
      const policy = await approval.createPolicy({
        workspaceId,
        name: 'Decision Log',
        steps: [{ stepOrder: 1, stepType: 'any-one', approverUserIds: [userId1] }],
      });

      const instance = await approval.startApproval(ticketId, policy.id);
      const steps = await approval.getStepsForPolicy(policy.id);

      await approval.decideApproval({
        instanceId: instance.id,
        stepId: steps[0]!.id,
        approverUserId: userId1,
        decision: 'approved',
        comment: 'LGTM',
      });

      const decisions = await approval.getDecisionsForInstance(instance.id);
      expect(decisions).toHaveLength(1);
      expect(decisions[0]!.decision).toBe('approved');
      expect(decisions[0]!.comment).toBe('LGTM');
    });
  });
});
