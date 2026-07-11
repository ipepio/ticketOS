# ADR 0009 — Per-ticket requester visibility with private default

- **Status:** accepted
- **Date:** 2026-07-10

## Context

Both internal support and B2B customer support need requester-facing Ticket
messages. Internal requests often contain confidential information, while B2B
customers may need colleagues in their Organization to collaborate on a case.
A single universal visibility policy cannot meet both needs safely.

## Decision

Every Ticket has a requester-audience visibility mode:

- **Private** — visible to its Requester, explicitly added Followers, and
  authorized Agents.
- **Organization** — also visible to eligible members of the Requester’s
  Organization.

New Tickets default to **Private**. “Requester-visible” Timeline entries follow
the Ticket’s requester-audience visibility; Internal Notes never do.

## Consequences

- **Easier:** secure internal support by default and collaborative B2B support
  when explicitly chosen.
- **Harder:** authorization must account for both Ticket visibility and
  Organization membership; changing Organization membership has access effects.
- Exact rules for changing visibility and Organization eligibility remain to be
  decided.
