# ADR 0053 — Test domain interfaces and production delivery paths

- **Status:** accepted (delegated recommendation)
- **Date:** 2026-07-10

## Context

The system has security-sensitive domain behavior, PostgreSQL RLS, asynchronous
outbox processing, and external adapters. Shallow unit tests of implementation
details would not establish the required confidence.

## Decision

Tests cross the highest useful module interface and assert observable behavior.
The suite includes:

- domain-module tests for Ticket, Workflow, SLA, Automation, Approval, and
  authorization behavior;
- integration tests against real PostgreSQL for migrations, transactions, RLS,
  full-text search, and the outbox/job queue;
- adapter contract tests for storage, email, OIDC, and webhook delivery;
- browser end-to-end tests for portal, access control, email-originated flow,
  and critical admin workflows; and
- upgrade/backup-restore smoke tests for release artifacts.

CI runs formatting, linting, type checks, dependency/security scanning, the
above tests, and container builds. Tests must not inspect module internals past
their interface.

## Consequences

- **Easier:** refactor-safe behavior verification and confidence in real
  self-hosted paths.
- **Harder:** test environments need PostgreSQL and controlled external-adapter
  fakes; the test suite will be slower than isolated mock-only tests.
