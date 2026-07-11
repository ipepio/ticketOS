# ADR 0045 — Catalog items choose SLA activation point

- **Status:** accepted
- **Date:** 2026-07-10

## Context

Service Requests can wait for external approval before a fulfillment team can
act. Some commitments begin upon request submission; others apply only after
the requester receives approval. One global activation point misrepresents one
of these cases.

## Decision

Each Service Catalog Item explicitly selects its SLA activation point:

- `on-create`; or
- `on-approval-complete`.

While a request awaits approval it is in a `Pending` Status, so its resolution
clock is paused according to ADR 0017. The selected activation point is recorded
for reporting and auditability.

## Consequences

- **Easier:** accurate commitments for immediate and approval-gated services.
- **Harder:** first-response and resolution target activation must be displayed
  clearly and handled deterministically across approval outcomes.
- The default per Item and behavior after rejection/cancellation remain to be
  decided.
