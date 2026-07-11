# ADR 0001 — Domain scope and flavor priority

- **Status:** accepted
- **Date:** 2026-07-10

## Context

"Ticketing" is an ambiguous word covering very different products: IT
helpdesk, issue/project tracking, event ticketing, omnichannel customer
support, and general-purpose configurable platforms. Each has a different
core domain model, workflow, role set, and SLA semantics. Choosing a flavor
(or an ordered set of flavors) is the most foundational decision — it shapes
every downstream model.

## Decision

ticketOS targets four flavors in this priority order:

1. **A — IT Helpdesk / Service Desk** (first deliverable). Tickets, queues,
   SLA, agents, knowledge base, automations.
2. **D — Omnichannel customer support** (next). Email, chat, WhatsApp, and
   other channels feeding the same ticket stream.
3. **B — Issue / project tracking** (later). Backlogs, sprints, epics, boards.
4. **E — Hybrid / general-purpose configurable platform** (ultimate goal).
   Generic tickets + configurable workflows, unifying A, D, and B.

Event ticketing (payments, seating, QR check-in) is explicitly **out of scope**.

The architecture must anticipate E from day one (generic ticket + configurable
workflow as the spine) without building B/D/E features yet. We build A on top
of that spine.

## Consequences

- **Easier:** future flavors compose onto a generic core rather than being
  bolted onto a helpdesk-specific model.
- **Harder:** the core model must be abstract enough to host A, D, and B
  without leaking helpdesk assumptions — more upfront design discipline.
- **Risk accepted:** over-abstraction. We mitigate by building only A's
  concrete features now, and letting the generic spine emerge from real A
  needs rather than speculating B/D/E shapes.
