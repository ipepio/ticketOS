# ADR 0047 — Use SSE for real-time portal updates

- **Status:** accepted
- **Date:** 2026-07-10

## Context

Agents need prompt updates to Ticket Timelines, Queues, dashboards, and in-app
notifications. The MVP portal primarily needs server-to-browser delivery; it
does not yet provide a persistent bidirectional chat protocol.

## Decision

Use **Server-Sent Events (SSE)** for real-time server-to-browser portal updates.
User mutations continue through authenticated HTTP requests. Domain events are
translated to authorized subscriber updates; SSE is not a second source of
truth.

A WebSocket adapter may be added in the omnichannel chat phase without changing
domain event interfaces.

## Consequences

- **Easier:** simple, proxy-friendly self-hosted real-time updates with a
  unidirectional model matching the MVP need.
- **Harder:** connection lifecycle, reconnection, event replay, authorization,
  and horizontal scaling require care.
- Bidirectional real-time chat is explicitly deferred.
