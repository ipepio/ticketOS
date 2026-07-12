# User-story traceability matrix

This matrix makes every product User Story actionable. The implementation item
contains its task list and acceptance criteria; developers must not close a
story until every linked item's criteria pass through its stated seam.

## Status Legend

- ✅ **Done** — implementation complete, tests passing, code-reviewed
- 🔄 **In Progress** — work in progress
- 📋 **Ready** — specified, dependencies met, awaiting implementation

## Delivery Items

| Item | Title | Status | Depends On |
|------|-------|--------|------------|
| P0-01 | Repository, runtime, database, and self-hosted baseline | ✅ Done | none |
| P0-02 | Identity, Workspaces, Organizations, and authorization | ✅ Done | P0-01 |
| P0-03 | Workflow, Queues, priorities, and Ticket Types | ✅ Done | P0-02 |
| P0-04 | Ticket and immutable Timeline | ✅ Done | P0-02, P0-03 |
| P0-05 | Portal journeys and accessibility | ✅ Done | P0-02, P0-04 |
| P0-06 | Secure Attachment lifecycle | ✅ Done | P0-04, P0-05 |
| P0-07 | Inbound/outbound email and Intake Quarantine | ✅ Done | P0-02, P0-04, P0-06 |
| P0-08 | Audit, operations, recovery, and release evidence | ✅ Done | P0-01 through P0-07 |
| P1-01 | Business Calendars and SLA | ✅ Done | P0-03, P0-04, P0-08 |
| P1-02 | Versioned Forms and configurable Ticket Types | ✅ Done | P0-03, P0-04 |
| P1-03 | Automation Rules | ✅ Done | P0-04, P1-01 |
| P1-04 | Knowledge Base and Search | ✅ Done | P0-02, P0-05, P0-06 |
| P1-05 | Notifications, SSE, i18n, and observability | ✅ Done | P0-05, P0-08 |
| P1-06 | Versioned API and signed Webhooks | ✅ Done | P0-02, P0-04, P0-08 |
| P2-01 | Service Catalog | 📋 Ready | P1-01, P1-02 |
| P2-02 | Approval | 📋 Ready | P2-01 |
| P2-03 | Reporting | 📋 Ready | P1-01, P1-03, P1-06 |
| P2-04 | Retention, Legal Holds, and MFA | 📋 Ready | P0-06, P0-08 |
| P3-01 | Omnichannel support (D) | 📋 Ready | P1-05, P1-06 |
| P3-02 | Project/issue tracking (B) | 📋 Ready | P1-02, P1-03, P2-03 |
| P3-03 | Problem, Change, and CMDB | 📋 Ready | P2-02, P2-04 |
| P3-04 | Hybrid platform (E) | 📋 Ready | P3-01 through P3-03 |

## User Story Traceability

| US | User story outcome | Delivery item(s) | Acceptance-criteria source | Status |
|----|-------------------|-----------------|---------------------------|--------|
| US-01 | Initialize self-hosted Installation | P0-01 | P0-01 acceptance criteria | ✅ P0-01 done |
| US-02 | Create isolated Workspaces | P0-02 | P0-02 acceptance criteria | 📋 P0-02 ready |
| US-03 | One User identity with Memberships | P0-02 | P0-02 acceptance criteria | 📋 P0-02 ready |
| US-04 | Magic-link and OIDC sign-in | P0-02 | P0-02 acceptance criteria | 📋 P0-02 ready |
| US-05 | Fixed roles backed by Capabilities | P0-02 | P0-02 acceptance criteria | 📋 P0-02 ready |
| US-06 | Group Requesters in Organizations | P0-02 | P0-02 acceptance criteria | 📋 P0-02 ready |
| US-07 | Create portal Ticket | P0-04, P0-05 | P0-04/P0-05 acceptance criteria | ✅ P0-04/P0-05 done |
| US-08 | Create email Ticket | P0-07 | P0-07 acceptance criteria | ✅ P0-07 done |
| US-09 | Route inbound mail to Queue | P0-07 | P0-07 acceptance criteria | ✅ P0-07 done |
| US-10 | Claim Ticket as Assignee | P0-03, P0-04, P0-05 | P0-03/P0-04/P0-05 | ✅ P0-03/P0-04/P0-05 done |
| US-11 | Move Queue/Status | P0-03, P0-04, P0-05 | P0-03/P0-04/P0-05 | ✅ P0-03/P0-04/P0-05 done |
| US-12 | Read requester-visible Messages | P0-04, P0-05 | P0-04/P0-05 acceptance criteria | ✅ P0-04/P0-05 done |
| US-13 | Write Internal Notes | P0-04, P0-05 | P0-04/P0-05 acceptance criteria | ✅ P0-04/P0-05 done |
| US-14 | Understand chronological Timeline | P0-04 | P0-04 acceptance criteria | ✅ P0-04 done |
| US-15 | Restrict confidential Queues | P0-02, P0-03 | P0-02/P0-03 acceptance criteria | ✅ P0-02/P0-03 done |
| US-16 | Private/Organization visibility | P0-04 | P0-04 acceptance criteria | ✅ P0-04 done |
| US-17 | Configure Statuses, Priorities, Types | P0-03; P1-02 | P0-03; P1-02 | ✅ P0-03 done |
| US-18 | Secure Attachments | P0-06 | P0-06 acceptance criteria | ✅ P0-06 done |
| US-19 | Quarantine unsafe inbound email | P0-07 | P0-07 acceptance criteria | ✅ P0-07 done |
| US-20 | RLS and authorization audit | P0-02, P0-08 | P0-02/P0-08 acceptance criteria | ✅ P0-02/P0-08 done |
| US-21 | Business Calendars and SLA Policies | P1-01 | P1-01 acceptance criteria | 📋 pending |
| US-22 | SLA risk/breach visibility | P1-01, P1-05 | P1-01/P1-05 acceptance criteria | 📋 pending |
| US-23 | Versioned Ticket Forms | P1-02 | P1-02 acceptance criteria | 📋 pending |
| US-24 | Bounded Automation Rules | P1-03 | P1-03 acceptance criteria | 📋 pending |
| US-25 | Scoped Knowledge Base | P1-04 | P1-04 acceptance criteria | 📋 pending |
| US-26 | Notification preferences | P1-05 | P1-05 acceptance criteria | 📋 pending |
| US-27 | REST API and signed Webhooks | P1-06 | P1-06 acceptance criteria | 📋 pending |
| US-28 | Production observability | P0-08, P1-05 | P0-08/P1-05 acceptance criteria | 📋 pending |
| US-29 | Select Service Catalog Item | P2-01 | P2-01 acceptance criteria | 📋 pending |
| US-30 | Auditable Approvals | P2-02 | P2-02 acceptance criteria | 📋 pending |
| US-31 | Configurable reports/exports | P2-03 | P2-03 acceptance criteria | 📋 pending |
| US-32 | Retention Policies and Legal Holds | P2-04 | P2-04 acceptance criteria | 📋 pending |
| US-33 | Backup, restore, upgrade | P0-01, P0-08 | P0-01/P0-08 acceptance criteria | ✅ P0-01/P0-08 done |
| US-34 | Spanish/English experience | P0-05, P1-05 | P0-05/P1-05 acceptance criteria | ✅ P0-05 done |

## Coverage rules

- **No orphan story:** every User Story must appear in this table.
- **No untested story:** every mapped delivery item must meet its listed
  acceptance criteria at its agreed seam.
- **No hidden work:** a new User Story requires a feature item with tasks,
  acceptance criteria, dependencies, ADR references, and a test seam before
  implementation begins.
- **Cross-cutting stories:** when a story maps to several items, it is done only
  after each item is done and the release E2E journey covers the integrated
  behavior.
