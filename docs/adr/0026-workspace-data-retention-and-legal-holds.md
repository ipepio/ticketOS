# ADR 0026 — Workspace retention policies and legal holds

- **Status:** accepted
- **Date:** 2026-07-10

## Context

Tickets, Timeline entries, Article content, and Attachments can contain PII,
secrets, contractual material, and operational evidence. Workspaces in one
self-hosted installation may have different retention obligations. Immutable
audit history must not create an indefinite, uncontrolled store of personal
data.

## Decision

Each Workspace may configure **Retention Policies** that archive and then delete
or anonymize eligible data on a schedule. Policies cover Tickets, Timeline
content, Attachments, and derived data. A **Legal Hold** may be placed on a
specific Ticket/case to prevent its retention purge until released.

When removal is required, content and attachments are erased/anonymized while
retaining only the minimum non-personal audit evidence appropriate to the
policy.

## Consequences

- **Easier:** compliance with different customer obligations and controlled
  storage growth.
- **Harder:** retention jobs must be reliable, include object storage and
  indexes/backups, and reconcile immutable history with erasure requirements.
- Exact retention defaults, authorization for Legal Holds, and backup-erasure
  handling remain to be decided.
