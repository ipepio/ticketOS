# ADR 0018 — Ordered, Workspace-configurable Ticket priorities

- **Status:** accepted
- **Date:** 2026-07-10

## Context

SLA Policies need a stable priority selector, but organizations use different
labels and levels of urgency. Globally fixed labels are unnecessarily rigid;
Queue-specific priority systems duplicate configuration and hinder reporting.

## Decision

Each Workspace owns an ordered set of **Priorities**. Every Ticket has exactly
one Priority. New Workspaces receive the defaults `Critical`, `High`, `Normal`,
and `Low`, but Workspace Admins may configure the names and ordering. SLA
Policies select against the concrete Workspace Priority.

## Consequences

- **Easier:** local terminology while retaining one unambiguous priority for
  SLA selection, triage, and reporting.
- **Harder:** modifying/removing a Priority requires safe migration of existing
  Tickets and SLA Policies.
- Priority is Workspace-scoped, not Queue-scoped.
