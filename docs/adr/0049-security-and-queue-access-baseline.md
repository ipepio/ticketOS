# ADR 0049 — Default-deny authorization and restricted Queue access

- **Status:** accepted (delegated recommendation)
- **Date:** 2026-07-10

## Context

Workspace isolation alone is insufficient: HR, security, and customer-facing
Queues can require more limited Agent access. The product also exposes email,
API tokens, public Knowledge Base content, and self-hosted administrative
surfaces.

## Decision

Authorization is default-deny and evaluated at the domain-module interface,
with PostgreSQL RLS as defense in depth. Every Queue has an access mode:

- `workspace-agents` — any authorized Workspace Agent may work its Tickets;
- `restricted` — only explicit Queue Members and Workspace Admins may work its
  Tickets.

Requester visibility remains governed by ADR 0009 independently of Queue access.

Use secure, HttpOnly, SameSite session cookies; CSRF/origin protection for
browser mutations; rate limits on authentication, email intake, API, and public
KB endpoints; secret encryption at rest; and complete security-event auditing.
MFA enforcement for privileged accounts is a P1 administration capability,
implemented with WebAuthn and TOTP adapters.

## Consequences

- **Easier:** confidential Queue handling and a consistent authorization policy
  across UI, API, worker, and email adapters.
- **Harder:** Queue-membership administration, context propagation, and
  authorization test coverage are mandatory.
