# ADR 0036 — PostgreSQL job queue with transactional outbox

- **Status:** accepted
- **Date:** 2026-07-10

## Context

Email, attachment scanning, Automation, webhook delivery, and retention are
asynchronous. A self-hosted MVP should not require a separate Redis or message
broker merely to ensure work is not lost after a transactional Ticket change.

## Decision

Use a PostgreSQL-backed job queue and a **transactional outbox**. Domain changes
and their pending outbox events are committed atomically in the same PostgreSQL
transaction. The worker reliably claims and processes jobs from the queue.

Redis/BullMQ or external brokers may later be introduced as adapters if a real
scale or operational need justifies them.

## Consequences

- **Easier:** reliable event handoff, fewer self-hosted dependencies, and
  transactionally consistent asynchronous work.
- **Harder:** job claiming, retries, idempotency, scheduling, cleanup, and
  worker concurrency need careful PostgreSQL-aware implementation.
- All asynchronous consumers must tolerate at-least-once delivery.
