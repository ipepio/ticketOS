import type { Pool } from 'pg';
import type {
  ReportingModule,
  ReportDefinition,
  ReportResult,
  ReportRow,
  CreateReportInput,
  UpdateReportInput,
  ReportFilter,
  ReportDimension,
  ReportMeasure,
  ReportGranularity,
} from '@ticketos/domain';
import type { WorkspaceId, Uuid } from '@ticketos/shared';

interface ReportRow_ {
  id: string;
  workspace_id: string;
  name: string;
  dimensions: string; // JSON
  measures: string; // JSON
  filters: string; // JSON
  granularity: string;
  created_at: string;
  updated_at: string;
}

function mapReport(r: ReportRow_): ReportDefinition {
  const dims = typeof r.dimensions === 'string' ? JSON.parse(r.dimensions) : r.dimensions;
  const meass = typeof r.measures === 'string' ? JSON.parse(r.measures) : r.measures;
  const filts = typeof r.filters === 'string' ? JSON.parse(r.filters) : r.filters;
  return {
    id: r.id,
    workspaceId: r.workspace_id,
    name: r.name,
    dimensions: dims as ReportDimension[],
    measures: meass as ReportMeasure[],
    filters: filts as ReportFilter[],
    granularity: r.granularity as ReportGranularity,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export class PostgresReporting implements ReportingModule {
  constructor(private pool: Pool) {}

  async createReport(input: CreateReportInput): Promise<ReportDefinition> {
    const { rows } = await this.pool.query<ReportRow_>(
      `INSERT INTO report_definitions (workspace_id, name, dimensions, measures, filters, granularity)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [
        input.workspaceId,
        input.name,
        JSON.stringify(input.dimensions),
        JSON.stringify(input.measures),
        JSON.stringify(input.filters ?? []),
        input.granularity ?? 'daily',
      ],
    );
    return mapReport(rows[0]!);
  }

  async updateReport(id: Uuid, input: UpdateReportInput): Promise<ReportDefinition> {
    const sets: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (input.name !== undefined) { sets.push(`name = $${idx++}`); values.push(input.name); }
    if (input.dimensions !== undefined) { sets.push(`dimensions = $${idx++}`); values.push(JSON.stringify(input.dimensions)); }
    if (input.measures !== undefined) { sets.push(`measures = $${idx++}`); values.push(JSON.stringify(input.measures)); }
    if (input.filters !== undefined) { sets.push(`filters = $${idx++}`); values.push(JSON.stringify(input.filters)); }
    if (input.granularity !== undefined) { sets.push(`granularity = $${idx++}`); values.push(input.granularity); }
    sets.push('updated_at = NOW()');
    values.push(id);

    const { rows } = await this.pool.query<ReportRow_>(
      `UPDATE report_definitions SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
      values,
    );
    if (!rows[0]) throw new Error(`Report not found: ${id}`);
    return mapReport(rows[0]);
  }

  async deleteReport(id: Uuid): Promise<void> {
    await this.pool.query('DELETE FROM report_definitions WHERE id = $1', [id]);
  }

  async getReport(id: Uuid): Promise<ReportDefinition | null> {
    const { rows } = await this.pool.query<ReportRow_>(
      'SELECT * FROM report_definitions WHERE id = $1',
      [id],
    );
    return rows[0] ? mapReport(rows[0]) : null;
  }

  async listReports(workspaceId: WorkspaceId): Promise<ReportDefinition[]> {
    const { rows } = await this.pool.query<ReportRow_>(
      'SELECT * FROM report_definitions WHERE workspace_id = $1 ORDER BY name',
      [workspaceId],
    );
    return rows.map(mapReport);
  }

  async executeReport(reportId: Uuid): Promise<ReportResult> {
    return this.executeReportWithFilters(reportId, []);
  }

  async executeReportWithFilters(reportId: Uuid, filters: ReportFilter[]): Promise<ReportResult> {
    const report = await this.getReport(reportId);
    if (!report) throw new Error(`Report not found: ${reportId}`);

    // Build dynamic SQL based on dimensions and measures
    const rows: ReportRow[] = [];

    for (const measure of report.measures) {
      for (const dimension of report.dimensions) {
        const value = await this.queryMeasure(measure, dimension, report.workspaceId, filters);
        rows.push({ dimension, measure, value });
      }
    }

    return {
      reportId,
      rows,
      generatedAt: new Date().toISOString(),
    };
  }

  async exportReportToCSV(reportId: Uuid): Promise<string> {
    const result = await this.executeReport(reportId);
    return this.exportResultToCSV(result);
  }

  exportResultToCSV(result: ReportResult): string {
    const header = 'dimension,measure,value';
    const data = result.rows.map(
      (r) => `${r.dimension},${r.measure},${r.value}`,
    );
    return [header, ...data].join('\n');
  }

  private async queryMeasure(
    measure: string,
    dimension: string,
    workspaceId: WorkspaceId,
    _filters: ReportFilter[],
  ): Promise<number> {
    // Simplified: query actual ticket counts from the DB
    let sql: string;
    const values: unknown[] = [workspaceId];

    switch (measure) {
      case 'ticket_count':
        sql = `SELECT count(*)::int AS value FROM tickets WHERE workspace_id = $1`;
        break;
      case 'sla_breach_count':
        sql = `SELECT count(*)::int AS value FROM sla_targets WHERE status = 'breached'
               AND ticket_id IN (SELECT id FROM tickets WHERE workspace_id = $1)`;
        break;
      case 'sla_met_count':
        sql = `SELECT count(*)::int AS value FROM sla_targets WHERE status = 'met'
               AND ticket_id IN (SELECT id FROM tickets WHERE workspace_id = $1)`;
        break;
      default:
        return 0;
    }

    void dimension; // TODO: add GROUP BY
    const { rows } = await this.pool.query<{ value: number }>(sql, values);
    return rows[0]?.value ?? 0;
  }
}
