# ADR 0039 — User-configurable email and in-app notifications

- **Status:** accepted
- **Date:** 2026-07-10

## Context

Agents and Requesters need prompt awareness of assignments, replies, mentions,
SLA risk/breach, and status changes. A fixed email-only stream is noisy and
misses in-portal work; notifications must never compete with the domain event
history as a source of truth.

## Decision

The MVP provides email and in-app notifications. Each User configures channel
preferences by event category, with digests for non-urgent events. Notifications
are derived asynchronously from domain events through the Transactional Outbox;
the Ticket Timeline and Audit Log remain authoritative.

## Consequences

- **Easier:** timely awareness with personal noise control and a future path to
  omnichannel notification adapters.
- **Harder:** preference precedence, deduplication, digest scheduling, delivery
  retries, and unread-state handling need clear behaviour.
- Exact default preferences and urgent-event overrides remain to be decided.
