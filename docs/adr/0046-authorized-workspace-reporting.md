# ADR 0046 — Fixed dashboards and authorized configurable Workspace reporting

- **Status:** accepted
- **Date:** 2026-07-10

## Context

Service Desk operators need immediate visibility into Queue workload, Agent
performance, SLA risk, and volume trends. Different Workspaces also need their
own cuts of the same data. Exposing raw SQL is unsafe and difficult to govern,
while fixed dashboards alone cannot meet local reporting needs.

## Decision

The MVP includes fixed operational dashboards and Workspace-configurable
reports with filters, grouping, metrics, and CSV export. Expensive report
calculations are materialized asynchronously. All reports apply the caller’s
Workspace and authorization constraints before aggregation and export.

## Consequences

- **Easier:** operational insight and flexible local reporting without raw SQL
  access or unauthorized cross-Workspace datasets.
- **Harder:** report vocabulary, aggregation performance, snapshots, export
  limits, and access checks require a deliberate Reporting module.
- Custom visualizations, scheduled reports, and BI connectors remain to be
  decided.
