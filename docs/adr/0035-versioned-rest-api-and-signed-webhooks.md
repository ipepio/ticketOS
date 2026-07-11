# ADR 0035 — Versioned REST API and signed outgoing webhooks

- **Status:** accepted
- **Date:** 2026-07-10

## Context

A complete Service Desk must integrate with monitoring, CMDBs, CI/CD, chatops,
and customer systems. UI-only access forces fragile automation; an API without
events forces consumers to poll.

## Decision

The MVP provides a versioned **REST API** and signed outgoing **Webhooks**.
Personal and service tokens are limited to a Workspace and an explicit set of
Capabilities. Webhook consumers verify a signature; delivery behaviour is
asynchronous and auditable.

## Consequences

- **Easier:** safe third-party integration and event-driven downstream
  automation without cross-Workspace access.
- **Harder:** API compatibility, rate limits, token lifecycle, webhook retries,
  replay protection, and delivery observability are product commitments.
- Exact resource coverage, API versioning policy, webhook event taxonomy, and
  retry/dead-letter semantics remain to be decided.
