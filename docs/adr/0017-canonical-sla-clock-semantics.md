# ADR 0017 — Canonical SLA clock semantics by Status Category

- **Status:** accepted
- **Date:** 2026-07-10

## Context

Configurable Status names must not make SLA calculations opaque or inconsistent
between Workspaces. The platform needs predictable, auditable clock semantics
while retaining configurable workflows.

## Decision

For resolution targets:

- time accrues while a Ticket is in the `Open` Status Category;
- time pauses while it is `Pending`; and
- the clock completes when it reaches `Resolved` or `Closed`.

A first-response target completes only on the first requester-visible **Message**
written by an **Agent**. Internal Notes, status changes, assignment changes, and
automated events do not qualify.

## Consequences

- **Easier:** explainable SLA calculations and consistent reporting across
  configured workflows.
- **Harder:** some organizations may want unusual pause rules; those are
  intentionally not configurable in the MVP.
- Reopening semantics, breached-target behaviour, and targets after Queue or
  priority changes remain to be decided.
