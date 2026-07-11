# ADR 0042 — Configurable Ticket Types with canonical ITSM categories

- **Status:** accepted
- **Date:** 2026-07-10

## Context

Workspaces need local language such as “VPN outage” and “Access request”, but
ITSM behavior and reporting need to distinguish interruption restoration from
standard fulfillment. Fixed names are too rigid; untyped custom labels lose
that semantic distinction.

## Decision

Each Workspace configures named **Ticket Types**. Every Type belongs to one
canonical MVP **Ticket Type Category**:

- `Incident`, or
- `Service Request`.

SLA, reporting, catalog, and workflow behavior can use the canonical category,
while the UI displays the Workspace Type name. Future categories such as
`Problem`, `Change`, and `Issue` may be added without changing the Ticket core.

## Consequences

- **Easier:** Workspace-specific vocabulary with stable ITSM meaning and a
  forward path to later product flavors.
- **Harder:** Type edits/removal need migration rules for historical Tickets;
  category expansion needs careful semantic design.
- Type-specific form, Queue, SLA, and approval configuration remains to be
  decided.
