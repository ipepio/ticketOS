# ADR 0030 — Use TypeScript as the primary language

- **Status:** accepted
- **Date:** 2026-07-10

## Context

ticketOS needs a rich web portal, a transactional application, configuration-
heavy interfaces, and background processing. Keeping these in one language
reduces contribution and maintenance friction for an Open Source modular
monolith.

## Decision

Use **TypeScript** as ticketOS’s primary implementation language for the web
application, domain modules, and background worker. Domain modules must remain
independent of framework-specific types and runtime concerns.

## Consequences

- **Easier:** shared types and validation, contributor onboarding, and reuse
  across UI/application/worker layers.
- **Harder:** runtime validation and careful async/resource handling remain
  necessary; TypeScript alone does not guarantee persistence correctness.
- The web framework, database, ORM/query approach, and job transport remain to
  be decided.
