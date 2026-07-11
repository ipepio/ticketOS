# ADR 0027 — Installation-wide append-only Audit Log

- **Status:** accepted
- **Date:** 2026-07-10

## Context

A Ticket Timeline records Ticket history, but security, configuration, and
compliance actions happen beyond a Ticket: membership changes, permission
changes, SLA/Form/automation edits, Article publication, and Legal Hold
changes. These need a cross-cutting record without overloading the Ticket
Timeline.

## Decision

ticketOS maintains an append-only **Audit Log** at Installation scope. Audit
Events record security, permission, configuration, and domain actions with an
actor, timestamp, affected Workspace where applicable, action, resource, and
safe metadata.

The Audit Log is distinct from the Ticket Timeline. It supports redaction or
minimization of PII required by Workspace Retention Policies and must not
become a second store for secrets or full sensitive content.

## Consequences

- **Easier:** compliance investigation, security review, and accountability for
  changes outside individual Tickets.
- **Harder:** audit-event taxonomy, metadata redaction, tamper resistance, and
  high-volume retention require intentional design.
- Exact event coverage, exportability, and access controls remain to be
  decided.
