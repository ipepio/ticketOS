# ticketOS architecture

## Product direction

TicketOS is an **AGPL-3.0-or-later**, self-hosted, multi-Workspace ticketing
platform. It starts as an IT Service Desk (A), expands to omnichannel support
(D), then issue/project tracking (B), and ultimately a hybrid configurable
platform (E).

## Core hierarchy and actors

```text
Installation
└── Workspace (isolation and administration)
    ├── Organization (requester/customer grouping)
    ├── Workspace Membership (User + role/capabilities)
    ├── Queue (operational team/department)
    └── Ticket
        ├── Timeline: Message | Internal Note | System Event
        ├── Form Version + typed answers
        ├── Queue + optional Agent Assignee
        └── SLA / Approval / Automation history
```

A User is global to the Installation; access is granted only by Workspace
Membership. The MVP roles are Installation Admin, Workspace Admin, Agent, and
Requester. Authorization is capability-based and default-deny.

## Domain modules and seams

The product is a modular monolith. These are domain modules, not deployment
services:

| Module | Owns |
| --- | --- |
| Identity | Users, sessions, magic links, OIDC, memberships, capabilities |
| Workspace | Workspace/Organization/Queue configuration and membership |
| Ticket | Tickets, Timeline, requester visibility, assignment, tags |
| Workflow | Statuses, categories, transitions, Ticket Types |
| Forms & Catalog | Fields, versioned Forms, catalog items |
| SLA | policies, calendars, targets and breach state |
| Approval | approval policies, steps and decisions |
| Automation | bounded event-condition-action rules and cascades |
| Knowledge Base | Articles, audiences and publication |
| Notification | in-app/email notifications and preferences |
| Search | authorization-aware full-text and structured search |
| Integration | REST API, tokens, webhooks |
| Audit | Installation Audit Log |
| Retention | retention policies, legal holds, erasure/anonymization |

Fastify is the HTTP adapter; React/Vite is the portal adapter. The worker is an
asynchronous adapter consuming the PostgreSQL transactional outbox. Domain
modules do not import Fastify, React, database-driver, or worker types.

## Persistence and external adapters

- PostgreSQL shared schema, `workspace_id` on Workspace-owned records, RLS as
  defense in depth.
- PostgreSQL job queue plus transactional outbox; consumers are idempotent and
  tolerate at-least-once delivery.
- Attachment storage adapter: S3-compatible (including R2) or local volume,
  never database blobs/public permanent URLs.
- Email adapter: SMTP outbound, IMAP inbound; provider webhooks can be added.
- OIDC is the external Identity Provider adapter; SAML/LDAP are future adapters.
- Search initially uses PostgreSQL full-text behind the Search module.
- SSE delivers authorized real-time portal updates; future chat can use a
  WebSocket adapter.

## Security invariants

1. No request reads or writes Workspace data without Membership/capability
   authorization and active Workspace database context.
2. RLS is defense in depth, not the authorization source of truth.
3. Timeline and Audit Log are append-only; corrections/redactions are explicit
   and auditable.
4. Internal Notes never reach Requesters, search snippets, notifications, or
   webhooks without an explicit authorized interface.
5. Attachments are authorized, scanned, and retained/deleted with their owning
   content.
6. Email correlation needs a signed token plus headers and sender authorization;
   failures go to Intake Quarantine.
7. API/service tokens are Workspace- and Capability-scoped; webhooks are signed.

## Default operational behavior

Tickets enter the Inbox in `New`, then move to one active Queue with zero or
one Agent Assignee. Default statuses are New/Open/Pending/Resolved/Closed;
resolution SLA runs in Open, pauses in Pending, and completes on Resolved or
Closed. A first-response SLA completes at the first requester-visible Agent
Message.

Queues are open to all Workspace Agents or explicitly restricted to Queue
Members. Tickets default to requester-private visibility; Organization-visible
sharing is opt-in.

## Documentation map

- [Glossary](./glossary.md)
- [ADR directory](./adr/)
- [Phased roadmap](./roadmap.md)
