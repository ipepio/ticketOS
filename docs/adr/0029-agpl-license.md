# ADR 0029 — License ticketOS under AGPL-3.0-or-later

- **Status:** accepted
- **Date:** 2026-07-10

## Context

ticketOS is intended to be a complete Open Source, self-hostable ticketing
platform. A permissive license allows hosted providers to keep improvements
private; a dual license adds commercial and contributor-governance complexity.

## Decision

License ticketOS under **GNU Affero General Public License v3.0 or later
(AGPL-3.0-or-later)**.

## Consequences

- **Easier:** improvements to modified versions offered over a network remain
  available to their users and the wider ecosystem.
- **Harder:** organizations that cannot accept AGPL terms may not adopt or
  integrate ticketOS; license notices and contributor policy must be handled
  correctly.
- No proprietary dual-licensing exception is planned at this point.
