# ADR 0054 — Resolve MVP policy defaults

- **Status:** accepted (delegated recommendation)
- **Date:** 2026-07-10

## Context

Earlier ADRs intentionally left detail open while foundational choices were
made. This ADR closes the MVP-level policies needed to begin implementation.
Later phases may extend these rules only through explicit versioned configuration
and audit events.

## Decision

### Authorization and Ticket behavior

- Requesters create Tickets, add requester-visible Messages/Attachments, and
  manage their Followers; Agents own operational Status/Queue/Assignee changes.
- A Requester may cancel their own unfulfilled Service Request; cancellation
  moves it to a configured `Closed`-category Status and is audited.
- A Requester or Agent may change a Ticket from private to Organization-visible
  only if the Requester belongs to that Organization; Agents may restrict it to
  private. Every visibility change is a Timeline and Audit event.
- Organization members receive Organization-visible access only through explicit
  Organization Membership. Workspace Admins govern that membership.

### Forms, workflow, catalog, and knowledge

- P1 Field types are short/long text, number, boolean, date/date-time,
  single-select, multi-select, and user/Organization references. Attachments
  remain Timeline resources, not Field values. Rich text is limited to Message,
  Note, and Article content and is sanitized.
- A Form answer update is capability-gated, versioned as an auditable Ticket
  event, and never alters the original Form Version.
- Ticket Type, Form, Queue, Priority, and SLA policy are selected by the Catalog
  Item where applicable; otherwise Queue defaults apply.
- Articles are revisioned. Agents may draft; a Workspace capability controls
  publish/unpublish. Published revisions remain attributable and auditable.

### SLA, Automation, Notifications, and Integration

- A Ticket snapshots the applicable SLA policy and calendar at its activation
  point. Queue/Priority changes do not silently rewrite an active target;
  authorized Automation or an Agent may explicitly reassess it, producing a
  Timeline/Audit event.
- Reopening a Resolved Ticket creates a new resolution cycle using the current
  selected policy; the original cycle remains reported historically.
- Simultaneously eligible Automation Rules execute deterministically by
  priority then creation order. Failed actions retry only when idempotent;
  exhausted work is visible in a dead-letter operational view.
- Default notifications: immediate in-app for assignment, mention, direct
  reply, approval, and SLA risk/breach; email follows the User preference and
  defaults on for direct replies/approvals, off for non-urgent digests.
- Webhooks deliver at least once with event IDs, HMAC timestamps/signatures,
  exponential backoff, and a dead-letter/replay view. API compatibility uses
  path major versions and additive minor changes.

### Governance and operations

- Retention defaults to no destructive purge until a Workspace configures a
  policy. Legal Hold requires an explicit capability. Backups are encrypted,
  access-controlled, and expire on an operator-configured rolling schedule;
  erased content disappears when the relevant backup expires.
- Workspace Admins can read Audit Events for their Workspace; Installation
  Admins can read Installation events. Audit export is capability-gated and
  redacts sensitive metadata.
- OTel emits HTTP/job latency and failures, queue depth/age, email/webhook
  delivery outcomes, attachment scan outcomes, SLA risk/breach counts, and RLS/
  authorization failures. Operators choose exporter and telemetry retention.

## Consequences

- **Easier:** P0/P1 implementation can start without hidden policy decisions.
- **Harder:** these defaults must be represented as explicit module behavior and
  tested, rather than improvised in UI handlers.
