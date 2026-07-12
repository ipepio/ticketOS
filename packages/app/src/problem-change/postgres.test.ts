import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Pool } from 'pg';
import { PostgresProblemChange } from './postgres.js';

const MIGRATIONS = [
  `CREATE TABLE IF NOT EXISTS users (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), email TEXT NOT NULL UNIQUE, verified_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`,
  `CREATE TABLE IF NOT EXISTS workspaces (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`,
  `CREATE TABLE IF NOT EXISTS problems (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE, title TEXT NOT NULL, description TEXT, status TEXT NOT NULL DEFAULT 'identified', root_cause TEXT, workaround TEXT, assignee_id UUID REFERENCES users(id) ON DELETE SET NULL, created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`,
  `CREATE TABLE IF NOT EXISTS changes (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE, title TEXT NOT NULL, description TEXT, status TEXT NOT NULL DEFAULT 'draft', risk TEXT NOT NULL DEFAULT 'medium', reason TEXT, impact_analysis TEXT, rollback_plan TEXT, scheduled_at TIMESTAMPTZ, completed_at TIMESTAMPTZ, created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`,
  `CREATE TABLE IF NOT EXISTS assets (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE, name TEXT NOT NULL, type TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active', metadata JSONB NOT NULL DEFAULT '{}', created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`,
];

function createTestPool(): Pool {
  return new Pool({ connectionString: process.env.DATABASE_URL ?? 'postgresql://ticketos:ticketos@localhost:5432/ticketos' });
}

describe('Problem/Change Module', () => {
  let pool: Pool; let pc: PostgresProblemChange; let wsId: string; let userId: string;
  beforeEach(async () => {
    pool = createTestPool();
    for (const sql of MIGRATIONS) { await pool.query(sql).catch(() => {}); }
    await pool.query('DELETE FROM assets'); await pool.query('DELETE FROM changes'); await pool.query('DELETE FROM problems');
    await pool.query('DELETE FROM tickets');
    await pool.query('DELETE FROM users'); await pool.query('DELETE FROM workspaces');
    pc = new PostgresProblemChange(pool);
    const { rows: ws } = await pool.query('INSERT INTO workspaces (id, name) VALUES ($1, $2) RETURNING id', [crypto.randomUUID(), 'PC Test']);
    wsId = ws[0]!.id;
    const { rows: u } = await pool.query('INSERT INTO users (id, email) VALUES ($1, $2) RETURNING id', [crypto.randomUUID(), 'pc@test.com']);
    userId = u[0]!.id;
  });
  afterEach(async () => { await pool.end(); });

  it('creates and updates a problem', async () => {
    const p = await pc.createProblem({ workspaceId: wsId, title: 'DB Crash', createdBy: userId });
    expect(p.status).toBe('identified');
    const updated = await pc.updateProblem(p.id, { status: 'investigating', rootCause: 'Disk full' });
    expect(updated.status).toBe('investigating');
    expect(updated.rootCause).toBe('Disk full');
  });

  it('creates and approves a change', async () => {
    const c = await pc.createChange({ workspaceId: wsId, title: 'Upgrade DB', risk: 'high', createdBy: userId });
    expect(c.status).toBe('draft');
    const approved = await pc.updateChange(c.id, { status: 'approved' });
    expect(approved.status).toBe('approved');
  });

  it('creates and updates an asset', async () => {
    const a = await pc.createAsset({ workspaceId: wsId, name: 'Server 1', type: 'server', metadata: { cpu: '8' }, createdBy: userId });
    expect(a.status).toBe('active');
    const retired = await pc.updateAsset(a.id, { status: 'retired' });
    expect(retired.status).toBe('retired');
  });

  it('lists problems, changes, assets', async () => {
    await pc.createProblem({ workspaceId: wsId, title: 'P1', createdBy: userId });
    await pc.createChange({ workspaceId: wsId, title: 'C1', createdBy: userId });
    await pc.createAsset({ workspaceId: wsId, name: 'A1', type: 'server', createdBy: userId });
    expect(await pc.listProblems(wsId)).toHaveLength(1);
    expect(await pc.listChanges(wsId)).toHaveLength(1);
    expect(await pc.listAssets(wsId)).toHaveLength(1);
  });
});
