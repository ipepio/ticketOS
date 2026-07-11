# Engineering backlog guide

This local backlog is the issue-tracker substitute until a remote tracker is
configured. Each item is written so one developer can take it without reopening
product design.

## States

`ready` → `in progress` → `review` → `done`. Do not start an item until all
listed dependencies are `done`. Split an item if it cannot be delivered and
reviewed as a vertical slice.

## Agreed test seams

| Seam | Primary observable behavior | Test environment |
| --- | --- | --- |
| Identity | authenticate, grant/revoke Membership, authorize Capability | real PostgreSQL; fake OIDC/email only |
| Workspace | configure Organization, Queue, Queue Member, Calendar | real PostgreSQL |
| Ticket | create/read/update a Ticket and its Timeline under caller visibility | real PostgreSQL |
| Workflow | validate a Status/Type transition and expose outcome | in-process + real PostgreSQL where persisted |
| Email | accept inbound mail, correlate/quarantine, queue outbound reply | fake transport + real PostgreSQL/outbox |
| SLA | calculate targets/risk/breach from known calendar examples | in-process clock + real PostgreSQL persistence |
| Automation | apply bounded rule cascade and expose audited result | real PostgreSQL/outbox; fake external adapters |
| HTTP portal | complete authorized user journey | browser E2E against application + PostgreSQL |

Tests must only observe these interfaces. Mocks are permitted at true external
adapters, never between ticketOS domain modules. The expected result must be a
known example from the acceptance criteria, not recomputed by the test.

## Definition of ready

An item is ready when it has: a feature ID, dependencies, a bounded task list,
acceptance criteria, one or more agreed seams, and an explicit out-of-scope
list. ADR references are mandatory for policy-sensitive work.

## Definition of done

- Acceptance criteria pass through the stated seam.
- New behavior has red → green tests; no implementation-detail tests.
- RLS and authorization behavior is tested where Workspace data is involved.
- Audit/Timeline/outbox effects required by the item are observable.
- UI work meets WCAG 2.2 AA for keyboard navigation, labels, contrast, focus,
  error feedback, and localized copy.
- Documentation/configuration and upgrade impact are updated.

See [P0](./p0-operational-core.md) and [later phases](./p1-p3.md).
