# ADR 0024 — Workspace Knowledge Base with explicit audience visibility

- **Status:** accepted
- **Date:** 2026-07-10

## Context

Self-service reduces repetitive Tickets and supports both internal IT and
external customer support. Knowledge articles may contain procedures that are
safe for the internet, safe only for authenticated customers, or restricted to
Agents.

## Decision

The MVP includes a Workspace-owned **Knowledge Base**. Each Article has a
publication lifecycle (draft or published), categories, and one explicit
audience:

- `internal` — Agents only;
- `authenticated` — signed-in Requesters allowed in the Workspace; or
- `public` — Internet-visible.

## Consequences

- **Easier:** self-service, contextual article suggestions, and audience-safe
  documentation for internal and external support.
- **Harder:** public publishing, search indexing, revisions, and audience
  authorization require careful handling.
- Article versioning, approval workflow, and Ticket deflection measurement
  remain to be decided.
