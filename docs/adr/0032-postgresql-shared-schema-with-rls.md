# ADR 0032 — PostgreSQL shared schema with Workspace RLS

- **Status:** accepted
- **Date:** 2026-07-10

## Context

ticketOS needs transactional consistency, structured querying, configurable-form
data, and reliable self-hosted operations. Its multi-Workspace model must
prevent accidental cross-Workspace reads/writes even if an application query
misses a filter.

## Decision

Use a shared **PostgreSQL** database and schema. Workspace-owned records carry
a `workspace_id`. The application domain modules enforce Workspace Membership
authorization, and PostgreSQL **Row-Level Security (RLS)** enforces the active
Workspace context as defense in depth.

A schema-per-Workspace or database-per-Workspace model is not used initially.

## Consequences

- **Easier:** strong transactions, familiar self-hosted operations, efficient
  cross-record queries, uniform migrations, and defense against omitted
  Workspace filters.
- **Harder:** every database connection/transaction must establish trustworthy
  Workspace context; administrative cross-Workspace operations need deliberate,
  auditable bypass paths.
- RLS complements rather than replaces domain authorization.
