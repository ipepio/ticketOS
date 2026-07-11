# ADR 0040 — PostgreSQL full-text search behind a Search module

- **Status:** accepted
- **Date:** 2026-07-10

## Context

Operators need to find Tickets, Timeline communication, and Knowledge Base
Articles. An external search cluster adds a costly self-hosted dependency before
real scale or relevance requirements prove it necessary. Search results must
never bypass Workspace or requester/agent visibility rules.

## Decision

The MVP uses PostgreSQL full-text search behind a framework- and engine-
independent **Search** module. Queries are filtered by Workspace and
authorization before results are returned. External search engines are deferred
as possible adapters. Attachment text is indexed only after safe extraction and
with the same authorization guarantees.

## Consequences

- **Easier:** useful search with no infrastructure beyond PostgreSQL and a
  future replacement seam when scale demands it.
- **Harder:** relevance, indexing lag, language stemming, and safe attachment
  text extraction need deliberate implementation.
- Search must not expose inaccessible Ticket or Internal Note content through
  snippets, counts, autocomplete, or ranking metadata.
