# ticketOS — Product specification and engineering contract

## Problem Statement

Organizations need a self-hosted, Open Source Service Desk that can receive,
route, secure, resolve, audit, and report on support work across independently
administered Workspaces. Existing systems either impose SaaS tenancy, lack modern
self-service and automation, or force teams to choose between helpdesk,
omnichannel support, and future work tracking.

## Solution

ticketOS is an AGPL-3.0-or-later, self-hosted multi-Workspace platform. It first
delivers an operational IT Service Desk, then expands through the approved P0–P3
roadmap. The core is a modular monolith: each Workspace owns its Tickets,
Queues, configured workflow, and data; a Ticket owns its append-only Timeline.

## User Stories

1. As an Installation Admin, I want to initialize a self-hosted Installation, so that I can operate ticketOS without a SaaS dependency.
2. As an Installation Admin, I want to create isolated Workspaces, so that independent organizations cannot access one another’s data.
3. As a User, I want one identity with Workspace Memberships, so that I can access only the Workspaces in which I participate.
4. As an Installation Admin, I want magic-link and OIDC authentication, so that both external Requesters and enterprise users can sign in securely.
5. As a Workspace Admin, I want to assign fixed MVP roles backed by Capabilities, so that access is understandable now and extensible later.
6. As a Workspace Admin, I want to group Requesters in Organizations, so that customer colleagues can collaborate where permitted.
7. As a Requester, I want to create a Ticket in the portal, so that I can ask for help and track its progress.
8. As a Requester, I want to create a Ticket by email, so that I can get help without pre-provisioned portal access.
9. As an Agent, I want inbound email routed to the correct Queue, so that work arrives with clear team ownership.
10. As an Agent, I want to claim a Ticket as its Assignee, so that individual responsibility is unambiguous.
11. As an Agent, I want to move a Ticket between Queues and Statuses, so that triage and fulfillment reflect reality.
12. As a Requester, I want to read requester-visible Messages, so that I can follow the conversation.
13. As an Agent, I want to write Internal Notes, so that colleagues can collaborate without exposing operational detail.
14. As an authorized user, I want a chronological Ticket Timeline, so that I can understand every communication and operational change.
15. As a security-sensitive team, I want restricted Queues, so that only authorized Queue Members work confidential Tickets.
16. As a Requester, I want private Tickets by default and optional Organization visibility, so that confidential work is not shared accidentally.
17. As a Workspace Admin, I want configured statuses, priorities, and Ticket Types, so that local processes retain canonical platform semantics.
18. As a User, I want secure attachments, so that I can share evidence without public file exposure.
19. As an operator, I want failed email correlations quarantined, so that unsafe replies are never appended to the wrong Ticket.
20. As an operator, I want PostgreSQL RLS and auditable authorization, so that an omitted application filter does not expose Workspace data.
21. As a Workspace Admin, I want Business Calendars and SLA Policies, so that commitments reflect each Queue’s real working time.
22. As an Agent, I want SLA risk and breach visibility, so that I can prioritize Tickets before commitments fail.
23. As a Workspace Admin, I want versioned Ticket Forms, so that structured intake can evolve without corrupting history.
24. As a Workspace Admin, I want bounded Automation Rules, so that repetitive routing and notifications happen consistently and safely.
25. As a Requester, I want a scoped Knowledge Base, so that I can solve common issues before opening a Ticket.
26. As a User, I want in-app/email notification preferences, so that urgent events reach me without excessive noise.
27. As an integrator, I want a versioned REST API and signed Webhooks, so that external systems can participate safely.
28. As an operator, I want structured logs, metrics, traces, and health checks, so that I can diagnose production failures.
29. As a Requester, I want to select a Service Catalog Item, so that a service request uses the correct form, Queue, SLA, and approval path.
30. As an Approver, I want auditable approval steps, so that governed requests proceed only with the required authorization.
31. As a manager, I want configurable reports and exports, so that I can understand Queue, Agent, SLA, and volume trends.
32. As a compliance owner, I want Retention Policies and Legal Holds, so that data is retained or erased appropriately.
33. As an operator, I want backup, restore, and upgrade paths, so that the Installation is recoverable.
34. As a Spanish or English User, I want localized UI and notifications, so that I can work in my preferred language.

## Implementation Decisions

The authoritative architectural decisions are in `docs/adr/` and summarized in
`docs/architecture.md`. Developers must preserve these module seams:

- **Ticket** is the primary test/caller seam for Ticket creation, requester
  visibility, Timeline, Queue/Assignee, Tags, and lifecycle actions.
- **Identity** is the seam for authentication, Membership, Capability checks,
  and active Workspace context.
- **Workflow**, **SLA**, **Forms & Catalog**, **Approval**, and **Automation**
  each own their respective rules; Ticket callers consume their outcomes rather
  than duplicating their logic.
- **Email**, storage, OIDC, webhooks, SSE, and observability are adapters at
  external seams. They are injected into the owning module; they do not contain
  business policy.
- PostgreSQL is the production persistence adapter. RLS complements domain
  authorization, never replaces it.

## Testing Decisions

A good test crosses an agreed module interface and asserts user-observable
behavior. Tests do not mock internal modules, query implementation state behind
the interface, or assert call ordering. Work vertically: one failing behavior
test, the minimal implementation to pass it, then the next behavior.

- Test domain behavior through module interfaces using real PostgreSQL for RLS,
  migration, transaction, outbox, and search behavior.
- Use adapter fakes only for true external dependencies: email transport,
  object storage, clock/randomness, OIDC provider, and webhook endpoint.
- Use browser E2E tests for critical portal journeys and container-based
  upgrade/restore smoke tests for releases.
- Treat the seams in `docs/backlog/README.md` as the agreed test surfaces.

## Out of Scope

P0 does not include chat/WhatsApp/social channels, project boards/sprints,
Problem Management, Change Management, CMDB, SAML/LDAP, Kubernetes/Helm,
custom RBAC editors, external search clusters, arbitrary automation code, or
custom multilingual authored content. Those belong to the approved later phases.

## Further Notes

P0/P1/P2/P3 sequencing is binding unless an ADR changes it. Any task that adds
a new external seam requires two justified adapters (normally production plus
test) and must state its interface, invariants, error modes, and test seam.
