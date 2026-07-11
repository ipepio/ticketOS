# User-story traceability matrix

This matrix makes every product User Story actionable. The implementation item
contains its task list and acceptance criteria; developers must not close a
story until every linked item’s criteria pass through its stated seam.

| US | User story outcome | Delivery item(s) | Acceptance-criteria source |
| --- | --- | --- | --- |
| US-01 | Initialize self-hosted Installation | P0-01 | P0-01 acceptance criteria |
| US-02 | Create isolated Workspaces | P0-02 | P0-02 acceptance criteria |
| US-03 | One User identity with Memberships | P0-02 | P0-02 acceptance criteria |
| US-04 | Magic-link and OIDC sign-in | P0-02 | P0-02 acceptance criteria |
| US-05 | Fixed roles backed by Capabilities | P0-02 | P0-02 acceptance criteria |
| US-06 | Group Requesters in Organizations | P0-02 | P0-02 acceptance criteria |
| US-07 | Create portal Ticket | P0-04, P0-05 | P0-04/P0-05 acceptance criteria |
| US-08 | Create email Ticket | P0-07 | P0-07 acceptance criteria |
| US-09 | Route inbound mail to Queue | P0-07 | P0-07 acceptance criteria |
| US-10 | Claim Ticket as Assignee | P0-03, P0-04, P0-05 | P0-03/P0-04/P0-05 acceptance criteria |
| US-11 | Move Queue/Status | P0-03, P0-04, P0-05 | P0-03/P0-04/P0-05 acceptance criteria |
| US-12 | Read requester-visible Messages | P0-04, P0-05 | P0-04/P0-05 acceptance criteria |
| US-13 | Write Internal Notes | P0-04, P0-05 | P0-04/P0-05 acceptance criteria |
| US-14 | Understand chronological Timeline | P0-04 | P0-04 acceptance criteria |
| US-15 | Restrict confidential Queues | P0-02, P0-03 | P0-02/P0-03 acceptance criteria |
| US-16 | Private/Organization visibility | P0-04 | P0-04 acceptance criteria |
| US-17 | Configure Statuses, Priorities, Types | P0-03; P1-02 | P0-03; P1-02 acceptance criteria |
| US-18 | Secure Attachments | P0-06 | P0-06 acceptance criteria |
| US-19 | Quarantine unsafe inbound email | P0-07 | P0-07 acceptance criteria |
| US-20 | RLS and authorization audit | P0-02, P0-08 | P0-02/P0-08 acceptance criteria |
| US-21 | Business Calendars and SLA Policies | P1-01 | P1-01 acceptance criteria |
| US-22 | SLA risk/breach visibility | P1-01, P1-05 | P1-01/P1-05 acceptance criteria |
| US-23 | Versioned Ticket Forms | P1-02 | P1-02 acceptance criteria |
| US-24 | Bounded Automation | P1-03 | P1-03 acceptance criteria |
| US-25 | Scoped Knowledge Base | P1-04 | P1-04 acceptance criteria |
| US-26 | Notification preferences | P1-05 | P1-05 acceptance criteria |
| US-27 | REST API and signed Webhooks | P1-06 | P1-06 acceptance criteria |
| US-28 | Production observability | P0-08, P1-05 | P0-08/P1-05 acceptance criteria |
| US-29 | Select Service Catalog Item | P2-01 | P2-01 acceptance criteria |
| US-30 | Auditable Approvals | P2-02 | P2-02 acceptance criteria |
| US-31 | Configurable reports/exports | P2-03 | P2-03 acceptance criteria |
| US-32 | Retention Policies and Legal Holds | P2-04 | P2-04 acceptance criteria |
| US-33 | Backup, restore, upgrade | P0-01, P0-08 | P0-01/P0-08 acceptance criteria |
| US-34 | Spanish/English experience | P0-05, P1-05 | P0-05/P1-05 acceptance criteria |

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
