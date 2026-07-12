import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Pool } from 'pg';
import { PostgresProject } from './postgres.js';

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
  `CREATE TABLE IF NOT EXISTS projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name TEXT NOT NULL, description TEXT,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived', 'deleted')),
    created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS issues (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title TEXT NOT NULL, description TEXT,
    status TEXT NOT NULL DEFAULT 'backlog' CHECK (status IN ('backlog', 'todo', 'in_progress', 'in_review', 'done')),
    priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('critical', 'high', 'medium', 'low')),
    type TEXT NOT NULL DEFAULT 'task' CHECK (type IN ('bug', 'feature', 'task', 'epic')),
    assignee_id UUID REFERENCES users(id) ON DELETE SET NULL,
    reporter_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    parent_issue_id UUID REFERENCES issues(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
];

function createTestPool(): Pool {
  return new Pool({
    connectionString: process.env.DATABASE_URL ?? 'postgresql://ticketos:ticketos@localhost:5432/ticketos',
  });
}

describe('Project Module', () => {
  let pool: Pool;
  let project: PostgresProject;
  let workspaceId: string;
  let userId: string;

  beforeEach(async () => {
    pool = createTestPool();
    for (const sql of MIGRATIONS) {
      await pool.query(sql).catch(() => {});
    }

    await pool.query('DELETE FROM issues');
    await pool.query('DELETE FROM projects');
    await pool.query('DELETE FROM tickets');
    await pool.query('DELETE FROM users');
    await pool.query('DELETE FROM workspaces');

    project = new PostgresProject(pool);

    const { rows: wsRows } = await pool.query(
      'INSERT INTO workspaces (id, name) VALUES ($1, $2) RETURNING id',
      [crypto.randomUUID(), 'Project Test WS'],
    );
    workspaceId = wsRows[0]!.id;

    const { rows: userRows } = await pool.query(
      'INSERT INTO users (id, email) VALUES ($1, $2) RETURNING id',
      [crypto.randomUUID(), 'project-test@test.com'],
    );
    userId = userRows[0]!.id;
  });

  afterEach(async () => {
    await pool.end();
  });

  describe('Projects', () => {
    it('creates a project', async () => {
      const proj = await project.createProject({
        workspaceId,
        name: 'Sprint 1',
        description: 'First sprint',
        createdBy: userId,
      });
      expect(proj.id).toBeDefined();
      expect(proj.name).toBe('Sprint 1');
      expect(proj.status).toBe('active');
    });

    it('lists projects', async () => {
      await project.createProject({ workspaceId, name: 'A', createdBy: userId });
      await project.createProject({ workspaceId, name: 'B', createdBy: userId });
      const list = await project.listProjects(workspaceId);
      expect(list).toHaveLength(2);
    });

    it('deletes a project', async () => {
      const proj = await project.createProject({ workspaceId, name: 'Delete', createdBy: userId });
      await project.deleteProject(proj.id);
      const found = await project.getProject(proj.id);
      expect(found).toBeNull();
    });
  });

  describe('Issues', () => {
    it('creates an issue', async () => {
      const proj = await project.createProject({ workspaceId, name: 'Proj', createdBy: userId });
      const issue = await project.createIssue({
        projectId: proj.id,
        title: 'Bug in login',
        type: 'bug',
        priority: 'high',
        reporterId: userId,
      });
      expect(issue.id).toBeDefined();
      expect(issue.type).toBe('bug');
      expect(issue.priority).toBe('high');
    });

    it('updates an issue status', async () => {
      const proj = await project.createProject({ workspaceId, name: 'Proj', createdBy: userId });
      const issue = await project.createIssue({
        projectId: proj.id,
        title: 'Task',
        reporterId: userId,
      });
      const updated = await project.updateIssue(issue.id, { status: 'in_progress' });
      expect(updated.status).toBe('in_progress');
    });

    it('lists issues by status', async () => {
      const proj = await project.createProject({ workspaceId, name: 'Proj', createdBy: userId });
      await project.createIssue({ projectId: proj.id, title: 'A', reporterId: userId });
      const b = await project.createIssue({ projectId: proj.id, title: 'B', reporterId: userId });
      await project.updateIssue(b.id, { status: 'done' });

      const backlog = await project.listIssues(proj.id, { status: 'backlog' });
      expect(backlog).toHaveLength(1);
      const done = await project.listIssues(proj.id, { status: 'done' });
      expect(done).toHaveLength(1);
    });

    it('creates sub-issues', async () => {
      const proj = await project.createProject({ workspaceId, name: 'Proj', createdBy: userId });
      const epic = await project.createIssue({
        projectId: proj.id,
        title: 'Epic',
        type: 'epic',
        reporterId: userId,
      });
      const sub = await project.createIssue({
        projectId: proj.id,
        title: 'Sub-task',
        reporterId: userId,
        parentIssueId: epic.id,
      });
      expect(sub.parentIssueId).toBe(epic.id);
    });
  });
});
