import type { Pool } from 'pg';
import type {
  ProblemChangeModule,
  Problem,
  Change,
  Asset,
  CreateProblemInput,
  CreateChangeInput,
  CreateAssetInput,
  ProblemStatus,
  ChangeStatus,
  ChangeRisk,
  AssetStatus,
} from '@ticketos/domain';
import type { WorkspaceId, Uuid } from '@ticketos/shared';

interface ProblemRow {
  id: string; workspace_id: string; title: string; description: string | null;
  status: string; root_cause: string | null; workaround: string | null;
  assignee_id: string | null; created_by: string; created_at: string; updated_at: string;
}
interface ChangeRow {
  id: string; workspace_id: string; title: string; description: string | null;
  status: string; risk: string; reason: string | null; impact_analysis: string | null;
  rollback_plan: string | null; scheduled_at: string | null; completed_at: string | null;
  created_by: string; created_at: string; updated_at: string;
}
interface AssetRow {
  id: string; workspace_id: string; name: string; type: string; status: string;
  metadata: string; created_by: string; created_at: string; updated_at: string;
}

function mapProblem(r: ProblemRow): Problem {
  return { id: r.id, workspaceId: r.workspace_id, title: r.title, description: r.description,
    status: r.status as ProblemStatus, rootCause: r.root_cause, workaround: r.workaround,
    assigneeId: r.assignee_id, createdBy: r.created_by, createdAt: r.created_at, updatedAt: r.updated_at };
}
function mapChange(r: ChangeRow): Change {
  return { id: r.id, workspaceId: r.workspace_id, title: r.title, description: r.description,
    status: r.status as ChangeStatus, risk: r.risk as ChangeRisk, reason: r.reason,
    impactAnalysis: r.impact_analysis, rollbackPlan: r.rollback_plan,
    scheduledAt: r.scheduled_at, completedAt: r.completed_at,
    createdBy: r.created_by, createdAt: r.created_at, updatedAt: r.updated_at };
}
function mapAsset(r: AssetRow): Asset {
  const meta = typeof r.metadata === 'string' ? JSON.parse(r.metadata) : r.metadata;
  return { id: r.id, workspaceId: r.workspace_id, name: r.name, type: r.type,
    status: r.status as AssetStatus, metadata: meta as Record<string, string>,
    createdBy: r.created_by, createdAt: r.created_at, updatedAt: r.updated_at };
}

export class PostgresProblemChange implements ProblemChangeModule {
  constructor(private pool: Pool) {}

  async createProblem(input: CreateProblemInput): Promise<Problem> {
    const { rows } = await this.pool.query<ProblemRow>(
      `INSERT INTO problems (workspace_id, title, description, assignee_id, created_by) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [input.workspaceId, input.title, input.description ?? null, input.assigneeId ?? null, input.createdBy],
    );
    return mapProblem(rows[0]!);
  }
  async updateProblem(id: Uuid, input: Partial<CreateProblemInput & { status: ProblemStatus; rootCause: string | null; workaround: string | null }>): Promise<Problem> {
    const sets: string[] = []; const values: unknown[] = []; let idx = 1;
    if (input.title !== undefined) { sets.push(`title = $${idx++}`); values.push(input.title); }
    if (input.description !== undefined) { sets.push(`description = $${idx++}`); values.push(input.description); }
    if (input.status !== undefined) { sets.push(`status = $${idx++}`); values.push(input.status); }
    if (input.rootCause !== undefined) { sets.push(`root_cause = $${idx++}`); values.push(input.rootCause); }
    if (input.workaround !== undefined) { sets.push(`workaround = $${idx++}`); values.push(input.workaround); }
    sets.push('updated_at = NOW()'); values.push(id);
    const { rows } = await this.pool.query<ProblemRow>(`UPDATE problems SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`, values);
    if (!rows[0]) throw new Error(`Problem not found: ${id}`);
    return mapProblem(rows[0]);
  }
  async getProblem(id: Uuid): Promise<Problem | null> {
    const { rows } = await this.pool.query<ProblemRow>('SELECT * FROM problems WHERE id = $1', [id]);
    return rows[0] ? mapProblem(rows[0]) : null;
  }
  async listProblems(workspaceId: WorkspaceId): Promise<Problem[]> {
    const { rows } = await this.pool.query<ProblemRow>('SELECT * FROM problems WHERE workspace_id = $1 ORDER BY created_at DESC', [workspaceId]);
    return rows.map(mapProblem);
  }

  async createChange(input: CreateChangeInput): Promise<Change> {
    const { rows } = await this.pool.query<ChangeRow>(
      `INSERT INTO changes (workspace_id, title, description, risk, reason, impact_analysis, rollback_plan, created_by) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [input.workspaceId, input.title, input.description ?? null, input.risk ?? 'medium', input.reason ?? null, input.impactAnalysis ?? null, input.rollbackPlan ?? null, input.createdBy],
    );
    return mapChange(rows[0]!);
  }
  async updateChange(id: Uuid, input: Partial<CreateChangeInput & { status: ChangeStatus; scheduledAt: string | null }>): Promise<Change> {
    const sets: string[] = []; const values: unknown[] = []; let idx = 1;
    if (input.title !== undefined) { sets.push(`title = $${idx++}`); values.push(input.title); }
    if (input.status !== undefined) { sets.push(`status = $${idx++}`); values.push(input.status); }
    if (input.scheduledAt !== undefined) { sets.push(`scheduled_at = $${idx++}`); values.push(input.scheduledAt); }
    sets.push('updated_at = NOW()'); values.push(id);
    const { rows } = await this.pool.query<ChangeRow>(`UPDATE changes SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`, values);
    if (!rows[0]) throw new Error(`Change not found: ${id}`);
    return mapChange(rows[0]);
  }
  async getChange(id: Uuid): Promise<Change | null> {
    const { rows } = await this.pool.query<ChangeRow>('SELECT * FROM changes WHERE id = $1', [id]);
    return rows[0] ? mapChange(rows[0]) : null;
  }
  async listChanges(workspaceId: WorkspaceId): Promise<Change[]> {
    const { rows } = await this.pool.query<ChangeRow>('SELECT * FROM changes WHERE workspace_id = $1 ORDER BY created_at DESC', [workspaceId]);
    return rows.map(mapChange);
  }

  async createAsset(input: CreateAssetInput): Promise<Asset> {
    const { rows } = await this.pool.query<AssetRow>(
      `INSERT INTO assets (workspace_id, name, type, metadata, created_by) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [input.workspaceId, input.name, input.type, JSON.stringify(input.metadata ?? {}), input.createdBy],
    );
    return mapAsset(rows[0]!);
  }
  async updateAsset(id: Uuid, input: Partial<CreateAssetInput & { status: AssetStatus }>): Promise<Asset> {
    const sets: string[] = []; const values: unknown[] = []; let idx = 1;
    if (input.name !== undefined) { sets.push(`name = $${idx++}`); values.push(input.name); }
    if (input.status !== undefined) { sets.push(`status = $${idx++}`); values.push(input.status); }
    sets.push('updated_at = NOW()'); values.push(id);
    const { rows } = await this.pool.query<AssetRow>(`UPDATE assets SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`, values);
    if (!rows[0]) throw new Error(`Asset not found: ${id}`);
    return mapAsset(rows[0]);
  }
  async getAsset(id: Uuid): Promise<Asset | null> {
    const { rows } = await this.pool.query<AssetRow>('SELECT * FROM assets WHERE id = $1', [id]);
    return rows[0] ? mapAsset(rows[0]) : null;
  }
  async listAssets(workspaceId: WorkspaceId): Promise<Asset[]> {
    const { rows } = await this.pool.query<AssetRow>('SELECT * FROM assets WHERE workspace_id = $1 ORDER BY name', [workspaceId]);
    return rows.map(mapAsset);
  }
}
