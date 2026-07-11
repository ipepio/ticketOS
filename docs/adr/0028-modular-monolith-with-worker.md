# ADR 0028 — Modular monolith with background worker

- **Status:** accepted
- **Date:** 2026-07-10

## Context

Ticket, Timeline, Workflow, SLA, and Automation require strong transactional
consistency. The product must remain straightforward to self-host. Starting
with microservices would impose network failure modes, distributed tracing,
deployment coordination, and operational burden before any independently
scaling module exists.

## Decision

ticketOS begins as a **modular monolith**: one deployable application plus a
background worker for asynchronous tasks. Domain modules are deep modules with
small interfaces and clear internal seams, including Identity, Ticket,
Workflow, SLA, Automation, Notifications, and Audit.

A module is extracted only when a real variation or deployment need justifies
the seam; microservices are not an initial architectural target.

## Consequences

- **Easier:** self-hosting, transactions, local development, and concentrated
  domain logic/verification.
- **Harder:** module interfaces and dependency direction need active discipline
  to prevent a tangled monolith.
- The language, framework, persistence technology, and worker transport remain
  to be decided.
