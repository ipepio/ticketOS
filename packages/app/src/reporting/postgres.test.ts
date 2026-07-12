import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Pool } from 'pg';
import { PostgresReporting } from './postgres.js';

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
  `CREATE TABLE IF NOT EXISTS sla_targets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    policy_id UUID NOT NULL,
    target_kind TEXT NOT NULL,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deadline_at TIMESTAMPTZ NOT NULL,
    elapsed_minutes INTEGER NOT NULL DEFAULT 0,
    remaining_minutes INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS report_definitions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    dimensions JSONB NOT NULL DEFAULT '[]',
    measures JSONB NOT NULL DEFAULT '[]',
    filters JSONB NOT NULL DEFAULT '[]',
    granularity TEXT NOT NULL DEFAULT 'daily',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
];

function createTestPool(): Pool {
  return new Pool({
    connectionString: process.env.DATABASE_URL ?? 'postgresql://ticketos:ticketos@localhost:5432/ticketos',
  });
}

describe('Reporting Module', () => {
  let pool: Pool;
  let reporting: PostgresReporting;
  let workspaceId: string;
  let userId: string;

  beforeEach(async () => {
    pool = createTestPool();
    for (const sql of MIGRATIONS) {
      await pool.query(sql).catch(() => {});
    }

    await pool.query('DELETE FROM report_definitions');
    await pool.query('DELETE FROM sla_targets');
    await pool.query('DELETE FROM tickets');
    await pool.query('DELETE FROM users');
    await pool.query('DELETE FROM workspaces');

    reporting = new PostgresReporting(pool);

    const { rows: wsRows } = await pool.query(
      'INSERT INTO workspaces (id, name) VALUES ($1, $2) RETURNING id',
      [crypto.randomUUID(), 'Reporting Test WS'],
    );
    workspaceId = wsRows[0]!.id;

    const { rows: userRows } = await pool.query(
      'INSERT INTO users (id, email) VALUES ($1, $2) RETURNING id',
      [crypto.randomUUID(), 'report-test@test.com'],
    );
    userId = userRows[0]!.id;
  });

  afterEach(async () => {
    await pool.end();
  });

  describe('Report definitions', () => {
    it('creates a report definition', async () => {
      const report = await reporting.createReport({
        workspaceId,
        name: 'Ticket Volume',
        dimensions: ['queue'],
        measures: ['ticket_count'],
      });

      expect(report.id).toBeDefined();
      expect(report.name).toBe('Ticket Volume');
      expect(report.dimensions).toEqual(['queue']);
      expect(report.measures).toEqual(['ticket_count']);
    });

    it('updates a report', async () => {
      const report = await reporting.createReport({
        workspaceId,
        name: 'Original',
        dimensions: ['queue'],
        measures: ['ticket_count'],
      });

      const updated = await reporting.updateReport(report.id, {
        name: 'Updated',
        dimensions: ['queue', 'priority'],
      });
      expect(updated.name).toBe('Updated');
      expect(updated.dimensions).toEqual(['queue', 'priority']);
    });

    it('deletes a report', async () => {
      const report = await reporting.createReport({
        workspaceId,
        name: 'Delete Me',
        dimensions: ['queue'],
        measures: ['ticket_count'],
      });
      await reporting.deleteReport(report.id);
      const found = await reporting.getReport(report.id);
      expect(found).toBeNull();
    });

    it('lists reports for a workspace', async () => {
      await reporting.createReport({
        workspaceId,
        name: 'Report A',
        dimensions: ['queue'],
        measures: ['ticket_count'],
      });
      await reporting.createReport({
        workspaceId,
        name: 'Report B',
        dimensions: ['priority'],
        measures: ['ticket_count'],
      });

      const reports = await reporting.listReports(workspaceId);
      expect(reports).toHaveLength(2);
    });
  });

  describe('Report execution', () => {
    it('executes a report and returns results', async () => {
      // Create some tickets
      await pool.query(
        'INSERT INTO tickets (workspace_id, title, created_by) VALUES ($1, $2, $3)',
        [workspaceId, 'Ticket 1', userId],
      );
      await pool.query(
        'INSERT INTO tickets (workspace_id, title, created_by) VALUES ($1, $2, $3)',
        [workspaceId, 'Ticket 2', userId],
      );

      const report = await reporting.createReport({
        workspaceId,
        name: 'Count Report',
        dimensions: ['queue'],
        measures: ['ticket_count'],
      });

      const result = await reporting.executeReport(report.id);
      expect(result.reportId).toBe(report.id);
      expect(result.rows.length).toBeGreaterThan(0);
      expect(result.rows[0]!.value).toBe(2); // 2 tickets
    });

    it('exports report to CSV', async () => {
      await pool.query(
        'INSERT INTO tickets (workspace_id, title, created_by) VALUES ($1, $2, $3)',
        [workspaceId, 'CSV Ticket', userId],
      );

      const report = await reporting.createReport({
        workspaceId,
        name: 'CSV Report',
        dimensions: ['queue'],
        measures: ['ticket_count'],
      });

      const csv = await reporting.exportReportToCSV(report.id);
      expect(csv).toContain('dimension,measure,value');
      expect(csv).toContain('ticket_count');
    });

    it('exports result to CSV string', async () => {
      const result = {
        reportId: 'test',
        rows: [
          { dimension: 'queue', measure: 'ticket_count', value: 5 },
          { dimension: 'priority', measure: 'ticket_count', value: 3 },
        ],
        generatedAt: new Date().toISOString(),
      };

      const csv = reporting.exportResultToCSV(result);
      expect(csv).toBe('dimension,measure,value\nqueue,ticket_count,5\npriority,ticket_count,3');
    });
  });
});
