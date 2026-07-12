// Reporting module — Workspace-configured reports with CSV export
// No framework-specific types may leak into domain interfaces.

import type { WorkspaceId, Uuid, Timestamp } from '@ticketos/shared';

// ---------------------------------------------------------------------------
// Report definition
// ---------------------------------------------------------------------------

export type ReportDimension =
  | 'queue'
  | 'priority'
  | 'status'
  | 'ticket_type'
  | 'assignee'
  | 'organization'
  | 'created_at'
  | 'sla_state';

export type ReportMeasure =
  | 'ticket_count'
  | 'avg_resolution_time'
  | 'first_response_time'
  | 'sla_breach_count'
  | 'sla_met_count';

export type ReportGranularity = 'daily' | 'weekly' | 'monthly';

export interface ReportFilter {
  field: string;
  operator: 'equals' | 'not_equals' | 'in' | 'not_in' | 'greater_than' | 'less_than' | 'between';
  value: string | string[];
}

export interface ReportDefinition {
  id: Uuid;
  workspaceId: WorkspaceId;
  name: string;
  dimensions: ReportDimension[];
  measures: ReportMeasure[];
  filters: ReportFilter[];
  granularity: ReportGranularity;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ---------------------------------------------------------------------------
// Report results
// ---------------------------------------------------------------------------

export interface ReportRow {
  dimension: string;
  measure: string;
  value: number;
}

export interface ReportResult {
  reportId: Uuid;
  rows: ReportRow[];
  generatedAt: Timestamp;
}

// ---------------------------------------------------------------------------
// Input types
// ---------------------------------------------------------------------------

export interface CreateReportInput {
  workspaceId: WorkspaceId;
  name: string;
  dimensions: ReportDimension[];
  measures: ReportMeasure[];
  filters?: ReportFilter[];
  granularity?: ReportGranularity;
}

export interface UpdateReportInput {
  name?: string;
  dimensions?: ReportDimension[];
  measures?: ReportMeasure[];
  filters?: ReportFilter[];
  granularity?: ReportGranularity;
}

// ---------------------------------------------------------------------------
// Reporting Module interface
// ---------------------------------------------------------------------------

export interface ReportingModule {
  // Report definitions
  createReport(input: CreateReportInput): Promise<ReportDefinition>;
  updateReport(id: Uuid, input: UpdateReportInput): Promise<ReportDefinition>;
  deleteReport(id: Uuid): Promise<void>;
  getReport(id: Uuid): Promise<ReportDefinition | null>;
  listReports(workspaceId: WorkspaceId): Promise<ReportDefinition[]>;

  // Report execution
  executeReport(reportId: Uuid): Promise<ReportResult>;
  executeReportWithFilters(reportId: Uuid, filters: ReportFilter[]): Promise<ReportResult>;

  // CSV export
  exportReportToCSV(reportId: Uuid): Promise<string>;
  exportResultToCSV(result: ReportResult): string;
}
