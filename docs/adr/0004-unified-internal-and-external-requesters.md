# ADR 0004 — Unify internal and external requesters

- **Status:** accepted
- **Date:** 2026-07-10

## Context

An IT service desk primarily serves internal employees, while customer support
serves external customers. ticketOS must support both without evolving into two
parallel ticket systems or requiring Ticket types that encode audience.

## Decision

A Workspace may serve both internal users and external customers from its first
release. Every person who requests help is modeled through one **Requester**
role. Internal versus external status is contextual metadata and authorization,
not a distinct Ticket type or separate core workflow.

## Consequences

- **Easier:** helpdesk (A) and omnichannel customer support (D) use the same
  Ticket, conversation, and workflow spine.
- **Harder:** visibility and permissions must be explicit; internal-only notes
  and external-facing replies cannot rely on a Ticket category alone.
- The concrete identity, membership, and role model remains to be decided.
