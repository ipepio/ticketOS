# ADR 0002 — Self-hosted, multi-organization deployment

- **Status:** accepted
- **Date:** 2026-07-10

## Context

The deployment model determines isolation, authentication, data ownership, and
the shape of every persistent entity. Adding tenant isolation after a
single-organization implementation requires pervasive, risky rewrites.

ticketOS must remain Open Source and self-hostable, while being capable of
serving multiple independently administered organizations from one deployment.

## Decision

TicketOS will be **self-hosted and multi-organization** from its first release.
A single installation can host multiple isolated organizations. Multi-organization
is a core domain concern, not an optional SaaS add-on.

The exact name and semantics of the isolation unit, the relation between that
unit and helpdesk customer organizations, and the technical isolation strategy
remain to be decided.

## Consequences

- **Easier:** self-hosted OSS adoption, managed-hosting offerings in the future,
  and multi-organization deployments without a data-model rewrite.
- **Harder:** authorization and data isolation are first-class concerns from the
  first feature; every domain model must have a clear ownership scope.
- **Risk accepted:** deployments that only need one organization carry some
  additional configuration and conceptual complexity.
