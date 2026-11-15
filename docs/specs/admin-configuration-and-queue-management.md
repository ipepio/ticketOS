# Workspace administration — workflow configuration and Queue management

- **Status:** ready-for-agent
- **Triage label:** `ready-for-agent`
- **Primary seam:** Workspace Admin browser journey → Admin HTTP interface → domain modules → PostgreSQL
- **Related ADRs:** 0007, 0010, 0018, 0042, 0049, 0053

## Problem Statement

A Workspace Admin can navigate to Ticket configuration and Queue administration,
but the experience is incomplete and unreliable.

Statuses can be listed and activated or deactivated, but their name, Status
Category, description, color, ordering, and default behavior cannot be edited
through a complete browser journey. Ticket Types and Priorities appear as
partial lists rather than configurable resources. Their create, edit, order,
default, and lifecycle behavior is missing or inconsistent with Ticket creation.

The Queue navigation opens an unfinished surface. A Workspace Admin cannot
reliably create or edit a Queue, choose its access mode, inspect its Queue
Members, or add and remove Queue Members. Existing HTTP operations are partial,
perform policy directly in adapters, and do not yet provide sufficient
Workspace validation, audit evidence, browser feedback, or integration tests.

As a result, configuration can look editable while not being operational.
Workspace Admins cannot trust that changes are saved, that Ticket forms use the
new configuration, or that restricted Queue access is enforced.

## Solution

Provide one complete Workspace administration experience with two connected
areas:

1. **Ticket configuration**, containing tabs for Statuses, Priorities, and
   Ticket Types. Every resource can be created, edited, ordered, activated or
   deactivated, and assigned a valid default where applicable.
2. **Queue management**, where a Workspace Admin can create and edit Queues,
   choose `workspace-agents` or `restricted` access, and manage explicit Queue
   Members for restricted Queues.

All mutations go through capability-authorized domain-module interfaces and are
Workspace-scoped. The portal reports validation and server errors without losing
entered values. Changes are immediately visible in Ticket creation and Queue
operation. Historical Tickets remain readable when referenced configuration is
inactive.

## User Stories

1. As a Workspace Admin, I want to open Ticket configuration from the sidebar, so that I can manage the Workspace workflow in one place.
2. As a Workspace Admin, I want separate Status, Priority, and Ticket Type tabs, so that related settings are easy to find.
3. As a Workspace Admin, I want the active tab to remain visually and programmatically identifiable, so that I understand which resource I am editing.
4. As a keyboard user, I want to move through configuration tabs and controls without a mouse, so that administration is accessible.
5. As a Workspace Admin, I want to see every Status with its name, Status Category, description, color, order, default state, and active state, so that I understand the current workflow.
6. As a Workspace Admin, I want to create a Status with a valid canonical Status Category, so that Workspace-specific terminology retains stable platform semantics.
7. As a Workspace Admin, I want to edit a Status name, so that the workflow uses our operational vocabulary.
8. As a Workspace Admin, I want to edit a Status description, so that Agents understand when to use it.
9. As a Workspace Admin, I want to edit a Status color, so that Statuses remain distinguishable without color being the only information channel.
10. As a Workspace Admin, I want to edit a Status Category, so that SLA and reporting semantics match the intended lifecycle state.
11. As a Workspace Admin, I want invalid Status Category changes rejected with a useful message, so that I cannot create ambiguous workflow semantics.
12. As a Workspace Admin, I want to reorder Statuses, so that selectors present the operational sequence.
13. As a Workspace Admin, I want to activate or deactivate a Status, so that obsolete Statuses cannot be selected for new transitions.
14. As an Agent, I want inactive Statuses to remain visible on historical Tickets, so that existing history remains intelligible.
15. As a Workspace Admin, I want to configure permitted Transitions, so that Agents can only move Tickets through the accepted workflow.
16. As a Workspace Admin, I want to see every Priority with its name, color, order, default state, and active state, so that urgency configuration is explicit.
17. As a Workspace Admin, I want to create a Priority with a Workspace-specific name, so that local terminology is supported.
18. As a Workspace Admin, I want to edit a Priority name and color, so that it remains meaningful to Agents and Requesters.
19. As a Workspace Admin, I want to reorder Priorities, so that urgency selectors and triage lists use the intended order.
20. As a Workspace Admin, I want exactly one active default Priority, so that new Tickets receive a deterministic initial selection.
21. As a Workspace Admin, I want to activate or deactivate a Priority, so that obsolete choices disappear from new Ticket forms.
22. As a Requester, I want inactive Priorities excluded from Ticket creation, so that I cannot submit unsupported values.
23. As an Agent, I want historical Tickets to retain their inactive Priority label, so that past decisions remain understandable.
24. As a Workspace Admin, I want to see every Ticket Type with its name, canonical category, description, order, default state, and active state, so that Ticket intake is understandable.
25. As a Workspace Admin, I want to create a Ticket Type in the Incident or Service Request category, so that custom names retain stable ITSM meaning.
26. As a Workspace Admin, I want to edit a Ticket Type name and description, so that Requesters understand which Type to choose.
27. As a Workspace Admin, I want to change a Ticket Type category only when existing Ticket behavior remains valid, so that history and automation are not silently reinterpreted.
28. As a Workspace Admin, I want to reorder Ticket Types, so that the most common choices appear first.
29. As a Workspace Admin, I want exactly one active default Ticket Type or an explicitly required selection, so that Ticket creation is deterministic.
30. As a Workspace Admin, I want to activate or deactivate a Ticket Type, so that obsolete Types disappear from new Ticket forms.
31. As a Requester, I want the Ticket creation form to load active Ticket Types and Priorities from my active Workspace, so that I can submit valid configuration IDs.
32. As a Requester, I want my entered Ticket form values preserved when configuration validation fails, so that I do not have to re-enter the request.
33. As a Workspace Admin, I want to open Queue administration from the sidebar, so that routing and access are managed independently from Ticket configuration.
34. As a Workspace Admin, I want to list every Queue with its access mode, Queue Member count, and active Ticket count, so that I understand operational ownership.
35. As a Workspace Admin, I want to create a Queue with a name and access mode, so that Tickets can be routed to a new operational group.
36. As a Workspace Admin, I want duplicate Queue names rejected within the Workspace, so that routing choices remain unambiguous.
37. As a Workspace Admin, I want to edit a Queue name, so that organizational changes do not require replacing the Queue.
38. As a Workspace Admin, I want to change a Queue between `workspace-agents` and `restricted`, so that access follows confidentiality needs.
39. As a Workspace Admin, I want a confirmation before restricting a Queue, so that I understand which Agents may lose access.
40. As a Workspace Admin, I want to inspect explicit Queue Members, so that restricted access is reviewable.
41. As a Workspace Admin, I want to add an Agent as a Queue Member, so that the Agent can work Tickets in a restricted Queue.
42. As a Workspace Admin, I want only active Agent or Workspace Admin Memberships selectable as Queue Members, so that Requesters and inactive Users cannot be granted Agent access accidentally.
43. As a Workspace Admin, I want to remove a Queue Member, so that access can be revoked immediately.
44. As a Workspace Admin, I want the portal to prevent removing my last viable administrator path where that would make the Queue unmanageable, so that restricted Queues do not become operationally orphaned.
45. As an Agent, I want access to a restricted Queue only when I am a Queue Member, so that confidential Tickets remain protected.
46. As an Agent, I want all Workspace Agents to access a `workspace-agents` Queue, so that open operational work is available without explicit membership.
47. As a Workspace Admin, I want Queue Member changes to take effect immediately, so that access revocation is reliable.
48. As a Workspace Admin, I want Queue creation, edits, and Queue Member changes recorded in the Audit Log, so that access and routing changes are accountable.
49. As a Workspace Admin, I want clear success and error feedback after every save, so that I know whether the system persisted the change.
50. As a Workspace Admin, I want failed forms to retain entered values, so that transient errors do not destroy my work.
51. As a User without `config:manage`, I want Ticket configuration denied without partial data disclosure, so that Workspace policy remains protected.
52. As a User without `queues:manage`, I want Queue administration denied without partial data disclosure, so that Queue structure and membership remain protected.
53. As a Workspace Admin in one Workspace, I want requests referencing another Workspace's Status, Priority, Ticket Type, Queue, or User rejected, so that Workspace isolation is preserved.
54. As a mobile Workspace Admin, I want configuration lists and Queue Member management usable on a narrow viewport, so that urgent administration is possible away from desktop.
55. As a screen-reader user, I want dialogs, validation errors, switches, tabs, and status messages announced correctly, so that administration is understandable.
56. As a self-hosted operator, I want upgrades to preserve existing Statuses, Priorities, Ticket Types, Queues, and Queue Members, so that configuration is not lost.

## Implementation Decisions

- Use one highest-level test seam for this feature: the Workspace Admin browser
  journey through the Admin HTTP interface into domain modules and real
  PostgreSQL. Focused module tests may supplement complex workflow validation,
  but must not replace browser evidence for the complete journeys.
- Ticket configuration is one page with three tabs: Statuses, Priorities, and
  Ticket Types. Tabs share loading, error, save, and accessibility behavior.
- Status policy belongs to the Workflow module. The module exposes list, create,
  update, reorder, activate/deactivate, default, and Transition operations.
- Priority policy belongs to the Workflow module. Priority names are no longer
  constrained to a hard-coded database enum. Tickets reference concrete
  Workspace Priority IDs.
- Ticket Type policy belongs to the Workflow module. Ticket Types retain the
  canonical categories `incident` and `service-request` while names remain
  Workspace-configurable.
- Queue and Queue Member policy belongs to the Workspace module. HTTP adapters
  translate requests and responses but do not issue policy-bearing SQL directly.
- Queue access mode uses the accepted domain vocabulary:
  `workspace-agents` and `restricted`. Existing persisted `open` values are
  migrated to `workspace-agents` without changing effective behavior.
- Every mutable configuration resource has an explicit ordered position and an
  active state. Reordering is persisted server-side and is not a portal-only
  presentation choice.
- Statuses, Priorities, and Ticket Types referenced by historical Tickets are
  deactivated rather than destructively deleted. Hard deletion is not exposed
  while references exist.
- Exactly one active default Priority is maintained transactionally per
  Workspace. Setting a new default clears the previous default in the same
  transaction.
- Ticket Type default behavior is transactional. A Workspace either has one
  active default Ticket Type or Ticket creation requires an explicit Type.
- The Ticket creation interface returns only active same-Workspace Ticket Types
  and Priorities, ordered by configured position.
- Status Category changes and Transition changes are validated against canonical
  lifecycle semantics before persistence.
- Queue creation enforces a non-empty, Workspace-unique name and a valid access
  mode.
- Adding a Queue Member validates that the Queue and Workspace Membership belong
  to the active Workspace and that the Membership is active with Agent or
  Workspace Admin capabilities.
- Queue Member insertion and removal are idempotent. Repeating an add or remove
  produces the same externally observable state without duplicate rows or
  misleading success.
- A Workspace Admin can always manage a restricted Queue regardless of explicit
  Queue Membership, as required by ADR 0049.
- All configuration and Queue mutations require the relevant capability:
  `config:manage`, `queues:manage`, or `queues:restrict`. A generic membership
  administration check is not sufficient.
- RLS remains defense in depth. Every operation also filters and validates
  active Workspace IDs explicitly at the domain-module boundary.
- Create, update, reorder, activation, default, Queue access-mode, and Queue
  Member changes append Audit Events with actor, Workspace, resource ID, and
  before/after details appropriate to the action.
- The portal uses controlled forms with dedicated create/edit dialogs. Closing a
  dialog intentionally discards draft values; server or validation failures do
  not.
- Status rows expose an Edit action in addition to the active switch. Priority
  and Ticket Type rows expose Edit, active switch, ordering, and default actions.
- Queue selection and Queue Member management remain visible together on desktop
  and stack into a usable sequence on mobile.
- Error responses use stable machine-readable codes plus localized portal copy.
  Raw SQL errors and unlocalized `API 500` strings are never shown to Users.
- Additive migrations introduce ordering, descriptions, colors, active/default
  constraints, and normalized access-mode values. Existing records are
  backfilled before new constraints are enforced.

## Testing Decisions

- A good test describes externally visible Workspace Admin behavior and survives
  changes to React component structure, SQL statements, and internal module
  wiring.
- Tests do not inspect React state, private methods, database rows, internal call
  counts, or implementation-specific class names.
- The primary suite uses a real browser, the real Admin HTTP adapter, and an
  isolated real PostgreSQL database named `ticketos_e2e`.
- Browser tests arrange and verify configuration through the same HTTP and portal
  interfaces available to Users. Direct SQL is limited to isolated fixture
  provisioning and is never used as the behavior assertion.
- The Status journey verifies create, edit, reload persistence, ordering,
  activation, canonical category validation, and exclusion from new
  Transitions when inactive.
- The Priority journey verifies create, edit, configurable naming, ordering,
  transactional default selection, activation, and appearance in Ticket
  creation.
- The Ticket Type journey verifies create, edit, category validation, ordering,
  transactional default selection, activation, and appearance in Ticket
  creation.
- The Queue journey verifies create, edit, access-mode change, Queue Member add,
  Queue Member removal, immediate access grant/revocation, and mobile layout.
- Authorization examples cover a Workspace Admin success path, an Agent denial,
  a Requester denial, and a cross-Workspace resource attempt.
- Restricted Queue tests prove behavior through authorized Ticket list/read
  interfaces rather than querying `queue_members` directly.
- Audit requirements are observed through the authorized Audit interface, not
  direct database queries.
- Migration tests cover both a fresh Installation and an upgraded Installation
  containing active and historical Tickets, existing `open` Queues, and Queue
  Members.
- Known literals are used for expected names, categories, ordering, defaults,
  and access outcomes. Tests do not recompute expected values using production
  algorithms.
- Follow strict vertical TDD: one failing browser or module test, minimal
  implementation, focused green run, then the nearest relevant suite before the
  next slice.
- Prior art includes the existing release E2E Workspace-isolation and restricted
  Queue journeys, Workflow PostgreSQL tests, and portal i18n tests. Existing
  direct-SQL assertions in older E2E tests are not copied into new tests.

## Out of Scope

- Deleting configuration records still referenced by Tickets, SLA Policies,
  Automation Rules, Forms, Catalog Items, or reports.
- New canonical Status Categories or Ticket Type Categories.
- Queue-specific Priority sets.
- Multiple simultaneous Queues per Ticket.
- Multiple simultaneous Assignees.
- Bulk import/export of configuration.
- Configuration templates shared across Workspaces.
- Approval, SLA, Automation, or Catalog editing beyond preserving their existing
  references.
- A visual workflow graph editor; ordered Transition management is sufficient.
- Installation-wide role redesign.

## Further Notes

- Current work-in-progress code already contains partial HTTP routes and React
  surfaces for these resources. Presence of a route or component does not mean
  the user journey is complete. The implementation must close the browser seam,
  not merely add more handlers.
- The current configuration portal primarily toggles active state; it does not
  provide complete edit forms, ordering, defaults, or robust feedback.
- Current Queue handlers require additional domain ownership, capability checks,
  Workspace validation, audit effects, and browser tests before they are safe to
  call operational.
- Existing Queue access value `open` conflicts with ADR 0049 vocabulary and
  should be migrated to `workspace-agents` with compatibility handled during
  upgrade.
- An untracked backup test file exists in the working tree and should not be
  included in the final change set.
