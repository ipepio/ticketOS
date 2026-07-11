# ADR 0048 — Deliver ticketOS through explicit phases

- **Status:** accepted
- **Date:** 2026-07-10

## Context

The accepted product vision is deliberately broad: a self-hosted multi-Workspace
IT Service Desk that evolves into omnichannel support, issue tracking, and a
hybrid workflow platform. Delivering every accepted capability in one initial
release would delay usable feedback and concentrate unacceptable integration
risk.

## Decision

Preserve the accepted architecture and deliver it in explicit phases:

- **P0 — Operational core:** Installation/Workspace/Identity/RBAC, Ticket and
  Timeline, Queue/assignee, portal, secure inbound/outbound email, Attachments,
  basic operational views, and Docker Compose deployment.
- **P1 — Full Service Desk:** SLA, Forms, Automation, Knowledge Base,
  Notifications, Search, API/webhooks, SSE, i18n, and observability.
- **P2 — Governed operations:** Service Catalog, Approvals, configurable
  reporting, retention/legal holds, and advanced administration.
- **P3 — Platform expansion:** omnichannel support (D), project tracking (B),
  Problem/Change/CMDB, and the hybrid configurable platform (E).

No phase may bypass the domain/module interfaces established by earlier phases.

## Consequences

- **Easier:** production feedback, incremental verification, and deployable
  value before the complete platform is finished.
- **Harder:** feature flags, migration compatibility, and a maintained roadmap
  are required; P0 must resist absorbing P1/P2 scope.
