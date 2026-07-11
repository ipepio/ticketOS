# ADR 0013 — Configurable email addresses route to Workspace Queues

- **Status:** accepted
- **Date:** 2026-07-10

## Context

A self-hosted installation can serve several Workspaces, and a Workspace can
operate several departments. Sending all inbound email to a global Inbox loses
routing intent; inferring it from message content is fragile and risks
cross-Workspace data exposure.

## Decision

A Workspace may configure multiple inbound **Email Addresses**. Each Email
Address belongs to exactly one Workspace and routes new Tickets to exactly one
destination Queue. A Workspace may configure a general address that routes to
its Inbox for triage.

## Consequences

- **Easier:** direct, deterministic routing for departmental addresses such as
  support, HR, and billing, while preserving a general intake address.
- **Harder:** email address provisioning, DNS/provider setup, and ownership
  validation need administration flows.
- The handling of unknown senders, reply threading, and anti-spam rules remains
  to be decided.
