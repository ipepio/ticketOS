# ADR 0025 — Secure attachments with pluggable object storage

- **Status:** accepted
- **Date:** 2026-07-10

## Context

A real Service Desk needs attachments on requester Messages, Agent Internal
Notes, and Knowledge Base Articles. Storing arbitrary file blobs in the
transactional database harms operations and backup/restore; public object URLs
would bypass Ticket and Article authorization.

## Decision

The MVP supports attachments on Messages, Internal Notes, and Knowledge Base
Articles. Files are stored outside the database through a storage adapter:

1. a configured **S3-compatible object store** (including Amazon S3 and
   Cloudflare R2) is preferred; or
2. a local filesystem volume outside the database is the self-hosted fallback.

The database stores attachment metadata and protected object references only.
Uploads have configurable size/type limits and malware scanning. Downloads must
be authorized by ticketOS; storage objects are never exposed through permanent
public URLs.

## Consequences

- **Easier:** scalable managed storage and simple self-hosted deployment, with
  storage independent from the Ticket/Article interfaces.
- **Harder:** upload lifecycle, scan quarantine, cleanup of failed uploads,
  backups, encryption, and signed/authorized download delivery require care.
- The storage adapter is justified by at least local-volume and S3-compatible
  implementations; callers must not depend on either implementation.
