import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Pool } from 'pg';
import { PostgresSLA } from './postgres.js';

const MIGRATIONS = [
  `CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL UNIQUE,
    verified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS workspaces (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS workspace_memberships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('installation-admin', 'workspace-admin', 'agent', 'requester')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, workspace_id)
  )`,
  `CREATE TABLE IF NOT EXISTS queues (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    access_mode TEXT NOT NULL DEFAULT 'workspace-agents' CHECK (access_mode IN ('workspace-agents', 'restricted')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS queue_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    queue_id UUID NOT NULL,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(workspace_id, queue_id, user_id)
  )`,
  `CREATE TABLE IF NOT EXISTS business_calendars (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    timezone TEXT NOT NULL DEFAULT 'UTC',
    is_default BOOLEAN NOT NULL DEFAULT false,
    working_hours JSONB NOT NULL DEFAULT '[]',
    exceptions JSONB NOT NULL DEFAULT '[]',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(workspace_id, name)
  )`,
  `CREATE TABLE IF NOT EXISTS sla_policies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    queue_id UUID NOT NULL REFERENCES queues(id) ON DELETE CASCADE,
    priority TEXT NOT NULL,
    calendar_id UUID NOT NULL REFERENCES business_calendars(id) ON DELETE RESTRICT,
    first_response_minutes INTEGER,
    resolution_minutes INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(workspace_id, queue_id, priority)
  )`,
  `CREATE TABLE IF NOT EXISTS status_categories (
    name TEXT PRIMARY KEY CHECK (name IN ('new', 'open', 'pending', 'resolved', 'closed'))
  )`,
  `INSERT INTO status_categories (name) VALUES ('new'), ('open'), ('pending'), ('resolved'), ('closed')
   ON CONFLICT DO NOTHING`,
  `CREATE TABLE IF NOT EXISTS statuses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    category TEXT NOT NULL REFERENCES status_categories(name),
    is_default BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(workspace_id, name)
  )`,
  `CREATE TABLE IF NOT EXISTS ticket_type_categories (
    name TEXT PRIMARY KEY CHECK (name IN ('incident', 'service-request'))
  )`,
  `INSERT INTO ticket_type_categories (name) VALUES ('incident'), ('service-request')
   ON CONFLICT DO NOTHING`,
  `CREATE TABLE IF NOT EXISTS ticket_types (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    category TEXT NOT NULL REFERENCES ticket_type_categories(name),
    is_default BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(workspace_id, name)
  )`,
  `CREATE TABLE IF NOT EXISTS priorities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name TEXT NOT NULL CHECK (name IN ('critical', 'high', 'normal', 'low')),
    sort_order INTEGER NOT NULL,
    is_default BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(workspace_id, name)
  )`,
  `CREATE TABLE IF NOT EXISTS tickets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'backlog' CHECK (status IN ('backlog', 'todo', 'in_progress', 'done', 'cancelled')),
    priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
    ticket_type_id UUID,
    created_by UUID NOT NULL REFERENCES users(id) ON DELETE SET NULL,
    assigned_to UUID REFERENCES users(id) ON DELETE SET NULL,
    visibility TEXT NOT NULL DEFAULT 'public' CHECK (visibility IN ('public', 'internal', 'private')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    cancelled_at TIMESTAMPTZ,
    cancelled_by UUID REFERENCES users(id) ON DELETE SET NULL
  )`,
  `CREATE TABLE IF NOT EXISTS sla_targets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    policy_id UUID NOT NULL REFERENCES sla_policies(id) ON DELETE CASCADE,
    target_kind TEXT NOT NULL CHECK (target_kind IN ('first-response', 'resolution')),
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deadline_at TIMESTAMPTZ NOT NULL,
    paused_at TIMESTAMPTZ,
    elapsed_minutes INTEGER NOT NULL DEFAULT 0,
    remaining_minutes INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'at-risk', 'breached', 'met')),
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
];

function createTestPool(): Pool {
  return new Pool({
    connectionString: process.env.DATABASE_URL ?? 'postgresql://ticketos:ticketos@localhost:5432/ticketos',
  });
}

describe('SLA Module', () => {
  let pool: Pool;
  let sla: PostgresSLA;
  let workspaceId: string;
  let queueId: string;
  let calendarId: string;

  beforeEach(async () => {
    pool = createTestPool();
    for (const sql of MIGRATIONS) {
      await pool.query(sql);
    }

    // Clean
    await pool.query('DELETE FROM sla_targets');
    await pool.query('DELETE FROM sla_policies');
    await pool.query('DELETE FROM business_calendars');
    await pool.query('DELETE FROM tickets');
    await pool.query('DELETE FROM queue_members');
    await pool.query('DELETE FROM queues');
    await pool.query('DELETE FROM workspace_memberships');
    await pool.query('DELETE FROM users');
    await pool.query('DELETE FROM workspaces');

    sla = new PostgresSLA(pool);

    // Create workspace
    const { rows: wsRows } = await pool.query(
      'INSERT INTO workspaces (id, name) VALUES ($1, $2) RETURNING id',
      [crypto.randomUUID(), 'SLA Test Workspace'],
    );
    workspaceId = wsRows[0]!.id;

    // Create queue
    const { rows: qRows } = await pool.query(
      'INSERT INTO queues (workspace_id, name, access_mode) VALUES ($1, $2, $3) RETURNING id',
      [workspaceId, 'Support Queue', 'workspace-agents'],
    );
    queueId = qRows[0]!.id;

    // Create default calendar
    const calendar = await sla.createCalendar({
      workspaceId,
      name: 'Default 9x5',
      timezone: 'America/Mexico_City',
      isDefault: true,
    });
    calendarId = calendar.id;
  });

  afterEach(async () => {
    await pool.end();
  });

  describe('Business Calendars', () => {
    it('creates a business calendar with default working hours', async () => {
      const calendar = await sla.createCalendar({
        workspaceId,
        name: '24/7 Support',
        timezone: 'UTC',
      });

      expect(calendar.id).toBeDefined();
      expect(calendar.name).toBe('24/7 Support');
      expect(calendar.timezone).toBe('UTC');
      expect(calendar.isDefault).toBe(false);
      expect(calendar.workingHours).toHaveLength(5); // Mon-Fri
    });

    it('lists calendars for a workspace', async () => {
      const calendars = await sla.listCalendars(workspaceId);
      expect(calendars).toHaveLength(1);
      expect(calendars[0]!.name).toBe('Default 9x5');
    });

    it('gets the default calendar', async () => {
      const defaultCal = await sla.getDefaultCalendar(workspaceId);
      expect(defaultCal).not.toBeNull();
      expect(defaultCal!.isDefault).toBe(true);
    });

    it('updates a calendar', async () => {
      const updated = await sla.updateCalendar({
        id: calendarId,
        name: 'Updated Calendar',
      });
      expect(updated.name).toBe('Updated Calendar');
    });

    it('deletes a calendar', async () => {
      await sla.deleteCalendar(calendarId);
      const cal = await sla.getCalendar(calendarId);
      expect(cal).toBeNull();
    });
  });

  describe('SLA Policies', () => {
    it('creates an SLA policy with first-response and resolution targets', async () => {
      const policy = await sla.createSLAPolicy({
        workspaceId,
        name: 'Normal Priority SLA',
        queueId,
        priority: 'normal',
        calendarId,
        firstResponseMinutes: 60,
        resolutionMinutes: 480,
      });

      expect(policy.id).toBeDefined();
      expect(policy.name).toBe('Normal Priority SLA');
      expect(policy.firstResponseMinutes).toBe(60);
      expect(policy.resolutionMinutes).toBe(480);
    });

    it('finds a matching policy by queue and priority', async () => {
      await sla.createSLAPolicy({
        workspaceId,
        name: 'High Priority SLA',
        queueId,
        priority: 'high',
        calendarId,
        firstResponseMinutes: 30,
        resolutionMinutes: 240,
      });

      const matched = await sla.findMatchingPolicy(workspaceId, queueId, 'high');
      expect(matched).not.toBeNull();
      expect(matched!.name).toBe('High Priority SLA');
    });

    it('returns null when no policy matches', async () => {
      const matched = await sla.findMatchingPolicy(workspaceId, queueId, 'nonexistent');
      expect(matched).toBeNull();
    });

    it('updates an SLA policy', async () => {
      const policy = await sla.createSLAPolicy({
        workspaceId,
        name: 'Test Policy',
        queueId,
        priority: 'normal',
        calendarId,
        firstResponseMinutes: 60,
        resolutionMinutes: 480,
      });

      const updated = await sla.updateSLAPolicy(policy.id, {
        name: 'Updated Policy',
        resolutionMinutes: 960,
      });
      expect(updated.name).toBe('Updated Policy');
      expect(updated.resolutionMinutes).toBe(960);
    });

    it('lists SLA policies for a workspace', async () => {
      await sla.createSLAPolicy({
        workspaceId,
        name: 'Policy A',
        queueId,
        priority: 'normal',
        calendarId,
        firstResponseMinutes: 60,
      });
      await sla.createSLAPolicy({
        workspaceId,
        name: 'Policy B',
        queueId,
        priority: 'high',
        calendarId,
        firstResponseMinutes: 30,
      });

      const policies = await sla.listSLAPolicies(workspaceId);
      expect(policies).toHaveLength(2);
    });
  });

  describe('SLA Targets', () => {
    it('creates an SLA target with computed deadline', async () => {
      const policy = await sla.createSLAPolicy({
        workspaceId,
        name: 'Test Policy',
        queueId,
        priority: 'normal',
        calendarId,
        firstResponseMinutes: 60,
        resolutionMinutes: 480,
      });

      // Create a ticket
      const { rows: userRows } = await pool.query(
        'INSERT INTO users (id, email) VALUES ($1, $2) RETURNING id',
        [crypto.randomUUID(), 'sla-test@test.com'],
      );
      const userId = userRows[0]!.id;

      const { rows: ticketRows } = await pool.query(
        'INSERT INTO tickets (workspace_id, title, created_by) VALUES ($1, $2, $3) RETURNING id',
        [workspaceId, 'Test Ticket', userId],
      );
      const ticketId = ticketRows[0]!.id;

      const target = await sla.createSLATarget(ticketId, policy.id, 'first-response');
      expect(target.id).toBeDefined();
      expect(target.ticketId).toBe(ticketId);
      expect(target.targetKind).toBe('first-response');
      expect(target.status).toBe('pending');
      expect(target.remainingMinutes).toBe(60);
    });

    it('pauses and resumes an SLA target', async () => {
      const policy = await sla.createSLAPolicy({
        workspaceId,
        name: 'Test Policy',
        queueId,
        priority: 'normal',
        calendarId,
        resolutionMinutes: 480,
      });

      const { rows: userRows } = await pool.query(
        'INSERT INTO users (id, email) VALUES ($1, $2) RETURNING id',
        [crypto.randomUUID(), 'sla-pause@test.com'],
      );
      const { rows: ticketRows } = await pool.query(
        'INSERT INTO tickets (workspace_id, title, created_by) VALUES ($1, $2, $3) RETURNING id',
        [workspaceId, 'Pause Test', userRows[0]!.id],
      );

      const target = await sla.createSLATarget(ticketRows[0]!.id, policy.id, 'resolution');
      const paused = await sla.pauseSLATarget(target.id);
      expect(paused.pausedAt).not.toBeNull();

      const resumed = await sla.resumeSLATarget(target.id);
      expect(resumed.pausedAt).toBeNull();
    });

    it('completes an SLA target', async () => {
      const policy = await sla.createSLAPolicy({
        workspaceId,
        name: 'Test Policy',
        queueId,
        priority: 'normal',
        calendarId,
        firstResponseMinutes: 60,
      });

      const { rows: userRows } = await pool.query(
        'INSERT INTO users (id, email) VALUES ($1, $2) RETURNING id',
        [crypto.randomUUID(), 'sla-complete@test.com'],
      );
      const { rows: ticketRows } = await pool.query(
        'INSERT INTO tickets (workspace_id, title, created_by) VALUES ($1, $2, $3) RETURNING id',
        [workspaceId, 'Complete Test', userRows[0]!.id],
      );

      const target = await sla.createSLATarget(ticketRows[0]!.id, policy.id, 'first-response');
      const completed = await sla.completeSLATarget(target.id);
      expect(completed.status).toBe('met');
      expect(completed.completedAt).not.toBeNull();
      expect(completed.remainingMinutes).toBe(0);
    });
  });

  describe('Time calculation', () => {
    it('calculates a deadline by adding working minutes', async () => {
      const deadline = await sla.calculateDeadline(
        calendarId,
        '2026-07-11T08:00:00.000Z',
        60,
      );
      expect(deadline).toBe('2026-07-11T09:00:00.000Z');
    });

    it('checks if a timestamp is working time', async () => {
      // Wednesday 10:00 = working time
      const isWorking = await sla.isWorkingTime(calendarId, '2026-07-15T10:00:00.000Z');
      expect(isWorking).toBe(true);

      // Saturday = not working
      const isNotWorking = await sla.isWorkingTime(calendarId, '2026-07-18T10:00:00.000Z');
      expect(isNotWorking).toBe(false);

      // Friday 20:00 = not working (after hours)
      const afterHours = await sla.isWorkingTime(calendarId, '2026-07-17T20:00:00.000Z');
      expect(afterHours).toBe(false);
    });
  });
});
