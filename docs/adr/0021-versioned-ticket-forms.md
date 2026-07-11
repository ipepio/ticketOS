# ADR 0021 — Version Ticket Forms and preserve historical meaning

- **Status:** accepted
- **Date:** 2026-07-10

## Context

Workspace Admins must be able to evolve intake forms, but Tickets created under
an earlier form must retain their original labels, options, validation context,
and typed answers for auditability and accurate reporting.

## Decision

Ticket Forms are versioned. Editing a published Form creates a new version;
new Tickets use the current published version. Each Ticket permanently records
the Form version used at creation together with its typed Field responses.

## Consequences

- **Easier:** safe form evolution, accurate historical interpretation, and
  auditable reporting.
- **Harder:** Form configuration has a publication lifecycle and historical
  versions cannot be destructively mutated.
- The rules for editing answers after creation and which Field types are
  available remain to be decided.
