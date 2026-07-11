# ADR 0010 — One active Queue per Ticket

- **Status:** accepted
- **Date:** 2026-07-10

## Context

A service desk needs a clear routing and ownership scope for each Ticket.
Allowing no Queue makes workload and SLA ownership ambiguous; allowing several
simultaneous Queues introduces conflicting routing, assignment, and reporting
semantics.

## Decision

Each Ticket belongs to exactly one active **Queue** at a time. It may be moved
between Queues, with each move recorded as a System Event in its Timeline. A
Ticket may additionally have no assignee or one assignee; the precise assignee
semantics are decided separately.

An initial Inbox Queue is expected for untriaged Tickets. Queue ownership,
access rules, and configuration policies remain to be decided.

## Consequences

- **Easier:** unambiguous routing, workload reporting, Queue-level SLA policy,
  and an intake Inbox.
- **Harder:** cross-functional work is represented through reassignment,
  Followers, or collaboration rather than multi-Queue membership.
- A future project-tracking **Project** is a separate concept and must not be
  conflated with a Queue.
