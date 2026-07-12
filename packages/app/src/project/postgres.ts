import type { Pool } from 'pg';
import type {
  ProjectModule,
  Project,
  Issue,
  CreateProjectInput,
  CreateIssueInput,
  UpdateIssueInput,
  ProjectStatus,
  IssueStatus,
  IssuePriority,
  IssueType,
} from '@ticketos/domain';
import type { WorkspaceId, Uuid } from '@ticketos/shared';

interface ProjectRow {
  id: string;
  workspace_id: string;
  name: string;
  description: string | null;
  status: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

interface IssueRow {
  id: string;
  project_id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  type: string;
  assignee_id: string | null;
  reporter_id: string;
  parent_issue_id: string | null;
  created_at: string;
  updated_at: string;
}

function mapProject(r: ProjectRow): Project {
  return {
    id: r.id,
    workspaceId: r.workspace_id,
    name: r.name,
    description: r.description,
    status: r.status as ProjectStatus,
    createdBy: r.created_by,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function mapIssue(r: IssueRow): Issue {
  return {
    id: r.id,
    projectId: r.project_id,
    title: r.title,
    description: r.description,
    status: r.status as IssueStatus,
    priority: r.priority as IssuePriority,
    type: r.type as IssueType,
    assigneeId: r.assignee_id,
    reporterId: r.reporter_id,
    parentIssueId: r.parent_issue_id,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export class PostgresProject implements ProjectModule {
  constructor(private pool: Pool) {}

  // ---------------------------------------------------------------------------
  // Projects
  // ---------------------------------------------------------------------------

  async createProject(input: CreateProjectInput): Promise<Project> {
    const { rows } = await this.pool.query<ProjectRow>(
      `INSERT INTO projects (workspace_id, name, description, created_by)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [input.workspaceId, input.name, input.description ?? null, input.createdBy],
    );
    return mapProject(rows[0]!);
  }

  async updateProject(id: Uuid, input: Partial<CreateProjectInput>): Promise<Project> {
    const sets: string[] = [];
    const values: unknown[] = [];
    let idx = 1;
    if (input.name !== undefined) { sets.push(`name = $${idx++}`); values.push(input.name); }
    if (input.description !== undefined) { sets.push(`description = $${idx++}`); values.push(input.description); }
    sets.push('updated_at = NOW()');
    values.push(id);
    const { rows } = await this.pool.query<ProjectRow>(
      `UPDATE projects SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
      values,
    );
    if (!rows[0]) throw new Error(`Project not found: ${id}`);
    return mapProject(rows[0]);
  }

  async deleteProject(id: Uuid): Promise<void> {
    await this.pool.query('DELETE FROM projects WHERE id = $1', [id]);
  }

  async getProject(id: Uuid): Promise<Project | null> {
    const { rows } = await this.pool.query<ProjectRow>(
      'SELECT * FROM projects WHERE id = $1',
      [id],
    );
    return rows[0] ? mapProject(rows[0]) : null;
  }

  async listProjects(workspaceId: WorkspaceId): Promise<Project[]> {
    const { rows } = await this.pool.query<ProjectRow>(
      "SELECT * FROM projects WHERE workspace_id = $1 AND status != 'deleted' ORDER BY name",
      [workspaceId],
    );
    return rows.map(mapProject);
  }

  // ---------------------------------------------------------------------------
  // Issues
  // ---------------------------------------------------------------------------

  async createIssue(input: CreateIssueInput): Promise<Issue> {
    const { rows } = await this.pool.query<IssueRow>(
      `INSERT INTO issues (project_id, title, description, priority, type, assignee_id, reporter_id, parent_issue_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [
        input.projectId,
        input.title,
        input.description ?? null,
        input.priority ?? 'medium',
        input.type ?? 'task',
        input.assigneeId ?? null,
        input.reporterId,
        input.parentIssueId ?? null,
      ],
    );
    return mapIssue(rows[0]!);
  }

  async updateIssue(id: Uuid, input: UpdateIssueInput): Promise<Issue> {
    const sets: string[] = [];
    const values: unknown[] = [];
    let idx = 1;
    if (input.title !== undefined) { sets.push(`title = $${idx++}`); values.push(input.title); }
    if (input.description !== undefined) { sets.push(`description = $${idx++}`); values.push(input.description); }
    if (input.status !== undefined) { sets.push(`status = $${idx++}`); values.push(input.status); }
    if (input.priority !== undefined) { sets.push(`priority = $${idx++}`); values.push(input.priority); }
    if (input.type !== undefined) { sets.push(`type = $${idx++}`); values.push(input.type); }
    if (input.assigneeId !== undefined) { sets.push(`assignee_id = $${idx++}`); values.push(input.assigneeId); }
    sets.push('updated_at = NOW()');
    values.push(id);
    const { rows } = await this.pool.query<IssueRow>(
      `UPDATE issues SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
      values,
    );
    if (!rows[0]) throw new Error(`Issue not found: ${id}`);
    return mapIssue(rows[0]);
  }

  async deleteIssue(id: Uuid): Promise<void> {
    await this.pool.query('DELETE FROM issues WHERE id = $1', [id]);
  }

  async getIssue(id: Uuid): Promise<Issue | null> {
    const { rows } = await this.pool.query<IssueRow>(
      'SELECT * FROM issues WHERE id = $1',
      [id],
    );
    return rows[0] ? mapIssue(rows[0]) : null;
  }

  async listIssues(projectId: Uuid, options?: { status?: IssueStatus; type?: IssueType }): Promise<Issue[]> {
    let sql = 'SELECT * FROM issues WHERE project_id = $1';
    const values: unknown[] = [projectId];
    let idx = 2;
    if (options?.status) { sql += ` AND status = $${idx++}`; values.push(options.status); }
    if (options?.type) { sql += ` AND type = $${idx++}`; values.push(options.type); }
    sql += ' ORDER BY created_at DESC';
    const { rows } = await this.pool.query<IssueRow>(sql, values);
    return rows.map(mapIssue);
  }
}
