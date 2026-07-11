# ADR 0020 — Configurable Ticket forms from reusable fields

- **Status:** accepted
- **Date:** 2026-07-10

## Context

A complete Service Desk requires structured data beyond a fixed title and
description: affected system, category, purchase information, environment, and
more. A generic hybrid platform cannot create a schema column or a distinct
Ticket type for every such need.

## Decision

Each Workspace may configure reusable **Fields** and compose them into **Ticket
Forms**. A Form can be selected for Ticket creation by a Queue and, later, by a
Ticket Type. The Ticket core stores typed responses to the selected Form; a
Form is configuration, not a different Ticket aggregate.

## Consequences

- **Easier:** custom intake, service catalog evolution, and future hybrid use
  cases without database schema changes per customer.
- **Harder:** field type validation, queryability, form versioning, permission
  rules, and historical meaning become core platform concerns.
- Supported field types, routing behavior, and versioning semantics remain to
  be decided.
