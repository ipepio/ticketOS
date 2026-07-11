# ADR 0043 — Catalog items support optional ordered approval policies

- **Status:** accepted
- **Date:** 2026-07-10

## Context

Many Service Requests require authorization before fulfillment, such as access,
purchases, or privileged changes. A catalog that only renders a form cannot
represent this safely; encoding approval as arbitrary Ticket Statuses makes it
hard to audit and reuse for future Change Management.

## Decision

Each **Service Catalog Item** may configure its Ticket Type, Form, destination
Queue, SLA selection, and an optional **Approval Policy**. A Policy has one or
more ordered approval steps. A Ticket created from such an Item cannot proceed
to fulfillment until its policy is approved or rejected.

Approval is a separate, auditable domain module rather than an ad hoc workflow
Status collection.

## Consequences

- **Easier:** governed request fulfillment and a reusable foundation for future
  Change Management.
- **Harder:** approver resolution, delegation, reminders, expiry, and what
  Ticket actions are blocked while pending approval need precise rules.
- Step voting semantics and approver targeting remain to be decided.
