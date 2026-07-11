# ADR 0050 — Ticket operational defaults

- **Status:** accepted (delegated recommendation)
- **Date:** 2026-07-10

## Context

Configurable workflow and forms require safe defaults to make a new Workspace
usable, while preserving historical meaning and a clean path to later flavors.

## Decision

New Workspaces receive statuses `New` (Open), `Open` (Open), `Pending`
(Pending), `Resolved` (Resolved), and `Closed` (Closed). New email and portal
Tickets enter the Inbox in `New`; triage moves them to an operational Queue.
`Resolved` Tickets may be reopened to `Open`; `Closed` is terminal unless a
Workspace Admin explicitly reopens it. Rejected/cancelled catalog requests use
a configured terminal Status in the `Closed` category.

Each Ticket also has a Type, Priority, requester-audience visibility, optional
Organization, zero-or-more Tags, exactly one Queue, and zero-or-one Assignee.
Tags are Workspace-scoped, normalized labels used for triage/search/reporting.

Timeline entries are append-only. Corrections use an explicit redaction or
superseding entry with an audit reason rather than destructive editing. Form
answers can be changed only through an auditable update operation; the original
Form Version remains recorded.

## Consequences

- **Easier:** immediately usable Workspaces, safe history, and consistent
  operational semantics.
- **Harder:** reopening, redaction, and historical answer updates need explicit
  capability checks and report semantics.
