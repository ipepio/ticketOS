# ADR 0022 — Bounded Workspace event–condition–action automation

- **Status:** accepted
- **Date:** 2026-07-10

## Context

Manual routing, escalation, and notification do not scale in a full Service
Desk. Arbitrary user code is unsafe and non-portable in a self-hosted,
multi-Workspace product; hard-coded automations cannot address workspace-
specific operations.

## Decision

Each Workspace may configure bounded **Automation Rules** with an event,
conditions, and predefined actions. Initial actions are limited to moving a
Ticket to a Queue, assigning an Agent, changing Status or Priority, adding a
tag, sending a notification, and recording a Note/Event. Rules cannot execute
arbitrary code.

The Automation module owns evaluation, auditing, idempotency, and loop
protection. Rule cascade semantics remain to be decided.

## Consequences

- **Easier:** configurable operations across helpdesk, omnichannel, and future
  hybrid workflows without code deployments.
- **Harder:** rule ordering, loops, permission validation, observability, and
  safe failure handling are correctness-critical.
- The action vocabulary should grow only from real use cases, preserving a
  small, deep Automation interface.
