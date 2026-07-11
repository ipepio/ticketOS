# ADR 0011 — One optional Agent assignee per Ticket

- **Status:** accepted
- **Date:** 2026-07-10

## Context

A Queue establishes the team or department responsible for a Ticket, but
individual accountability is also required for operational ownership and
metrics. Multiple equivalent assignees create ambiguity over responsibility.

## Decision

A Ticket has exactly one active Queue and **zero or one Agent assignee**:

- The **Queue** is the responsible department/team.
- The **assignee** is the individual Agent who has taken the Ticket.
- An untriaged or unclaimed Ticket has an active Queue and no assignee.

Assignments and unassignments are recorded as System Events in the Ticket
Timeline. Collaboration uses Followers and Internal Notes, not multiple
assignees.

## Consequences

- **Easier:** clear individual accountability, unclaimed-work views, and
  meaningful agent workload metrics.
- **Harder:** complex collaborative cases cannot use several equivalent
  assignees; a future collaborator role requires an explicit new model.
