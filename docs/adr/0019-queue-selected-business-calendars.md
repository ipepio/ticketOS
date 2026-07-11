# ADR 0019 — Queues select reusable Workspace business calendars

- **Status:** accepted
- **Date:** 2026-07-10

## Context

Different operational teams can observe different schedules: a 24/7 IT Queue,
a weekday HR Queue, and region-specific support teams. A single Installation-
or Workspace-wide calendar misstates their SLA commitments.

## Decision

A Workspace owns reusable **Business Calendars**, including timezone, working
hours, holidays, and exceptions. It designates a default Calendar. Each Queue
(meaning the responsible team/department) selects the Calendar that its SLA
Policies use; a Queue may use the Workspace default.

## Consequences

- **Easier:** accurate SLA deadlines for teams with distinct schedules, without
  duplicating calendar definitions inside every SLA Policy.
- **Harder:** calendar edits and Queue moves require deterministic rules for
  existing SLA targets; those rules remain to be specified.
- TicketOS uses **Queue**, not a separate Team entity, for the operational team
  concept.
