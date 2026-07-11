# ADR 0052 — Docker Compose distribution and explicit recovery operations

- **Status:** accepted (delegated recommendation)
- **Date:** 2026-07-10

## Context

Self-hosting is a product requirement. Operators need a supported path to run,
upgrade, back up, restore, and observe the application without Kubernetes or
several mandatory infrastructure dependencies.

## Decision

P0 ships versioned OCI images and a production-oriented Docker Compose
reference deployment for the application, worker, PostgreSQL, and optional local
attachment volume. PostgreSQL, S3-compatible storage, SMTP/IMAP, and OTel
exporters can be supplied externally.

Every release includes migration preflight/rollback guidance, a documented
backup/restore procedure covering PostgreSQL and Attachments, health checks,
and compatibility notes. Kubernetes/Helm packaging is deferred until the Compose
installation is operationally proven.

## Consequences

- **Easier:** low-friction evaluation and a supported recovery story for
  self-hosted users.
- **Harder:** release engineering must test upgrade/restore paths, not just
  fresh installation.
