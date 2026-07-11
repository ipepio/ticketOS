# ADR 0038 — OpenTelemetry-based operational observability

- **Status:** accepted
- **Date:** 2026-07-10

## Context

Self-hosted operators must diagnose failures across HTTP, database access,
email, workers, SLA calculations, Automation, and webhooks. Plain logs alone
cannot reliably correlate an inbound request with asynchronous consequences.

## Decision

Provide structured logs, metrics, distributed traces through **OpenTelemetry**,
and liveness/readiness health checks. Telemetry is exportable to operator-chosen
backends. Correlation IDs cross HTTP, worker, database, email, and webhook
workflows.

Ticket content, Attachment contents, secrets, and unnecessary PII are excluded
from telemetry by default.

## Consequences

- **Easier:** diagnosis, capacity planning, reliability monitoring, and
  operator-selected observability backends.
- **Harder:** instrumentation consistency, sampling, cardinality control, and
  redaction require ongoing discipline.
- Exact metrics, trace retention, and operator configuration remain to be
  decided.
