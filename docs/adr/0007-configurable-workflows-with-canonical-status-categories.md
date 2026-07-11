# ADR 0007 — Configurable workflows with canonical status categories

- **Status:** accepted
- **Date:** 2026-07-10

## Context

Workspaces need their own language and process (for example, “Waiting for
approval” or “Mitigated”), while the platform needs stable semantics for SLA
clocks, reporting, automation, and cross-workspace features. Fully fixed
statuses are too restrictive; fully untyped statuses make core behaviour
ambiguous.

## Decision

Each Workspace may configure named Ticket **Statuses** and permitted
**Transitions**. Every Status belongs to exactly one canonical **Status
Category**:

- `Open`
- `Pending`
- `Resolved`
- `Closed`

The core uses Status Categories for platform-wide semantics. Workspace-facing
UI may use the configured status names.

## Consequences

- **Easier:** workspace-specific workflows while preserving reliable SLA,
  reporting, search, and automation semantics.
- **Harder:** status configuration must prevent invalid categorization and
  transitions; migrations of existing statuses need care.
- Exact default statuses, transition authorization, and SLA pause rules are
  still undecided.
