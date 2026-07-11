# ADR 0044 — Sequential approval steps with configurable vote strategy

- **Status:** accepted
- **Date:** 2026-07-10

## Context

Some requests need a simple manager approval, while others require independent
approval by every designated party. A global one-size voting rule either blocks
simple flows or cannot express segregation-of-duties controls.

## Decision

Approval Policy steps execute in order. Each step selects one strategy:

- `any-one` — the first eligible approval completes the step; or
- `all` — every resolved eligible approver must approve the step.

Approvers may be concrete Users, Workspace roles, or the Requester’s manager
when that relationship exists. A rejection ends the Policy by default.

## Consequences

- **Easier:** simple manager approval and all-party controls in one auditable
  model.
- **Harder:** dynamic approver resolution, membership changes during a pending
  step, absence/delegation, and reminder expiry require explicit behaviour.
- Numeric quorum and parallel independent branches are deferred.
