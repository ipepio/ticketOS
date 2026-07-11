# ADR 0016 — SLA policies by Queue and priority

- **Status:** accepted
- **Date:** 2026-07-10

## Context

SLA management is core to a Service Desk: different departments and urgency
levels require distinct response and resolution commitments. A single global
clock cannot represent business hours, priority, or Queue ownership accurately.

## Decision

The MVP includes **SLA Policies** selected by a Ticket’s Queue and priority.
Policies use business calendars and define at least:

- a first-response target; and
- a resolution target.

SLA evaluation relies on Ticket Status Categories, not Workspace-specific Status
names. The exact priority model, calendar ownership, clock pause/restart rules,
and policy-selection precedence remain to be decided.

## Consequences

- **Easier:** operationally meaningful commitments, breach reporting, and
  escalation automation for the IT Service Desk MVP.
- **Harder:** time calculation, holidays, DST, changing Queue/priority, and
  status transitions become correctness-critical domain behaviour.
- SLA is a deep domain module with a small observable interface; callers should
  consume calculated targets/breach state rather than implement time arithmetic.
