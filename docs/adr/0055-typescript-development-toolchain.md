# ADR 0055 — TypeScript development toolchain baseline

- **Status:** accepted (delegated recommendation)
- **Date:** 2026-07-10

## Context

The selected React/Vite + Fastify modular monolith needs a reproducible,
framework-light toolchain that supports shared domain modules, PostgreSQL RLS,
and real integration tests.

## Decision

Use a pnpm workspace monorepo with Node.js active LTS. Use TypeScript strict
mode, Fastify, React/Vite, PostgreSQL via `pg` and Kysely, and SQL migrations
managed in-repository. Zod validates untrusted adapter input at HTTP, email,
webhook, and job seams; it is not allowed to leak as a domain-module interface.

Use Vitest for module/integration tests, Testcontainers (or equivalent local
PostgreSQL) for real database tests, Playwright for browser E2E, ESLint and
Prettier for static formatting/linting, and GitHub Actions as the initial CI
adapter. The portal targets WCAG 2.2 AA and current evergreen desktop/mobile
browsers.

## Consequences

- **Easier:** one reproducible contributor workflow and explicit SQL/RLS control
  without ORM-generated abstractions concealing database context.
- **Harder:** Kysely does not generate a schema automatically; migrations and
  database types need disciplined ownership.
