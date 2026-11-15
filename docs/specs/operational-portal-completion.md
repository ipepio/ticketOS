# Feature — Operational portal completion

- **Status:** ready
- **Delivery method:** TDD, vertical red → green slices
- **Visual source:** `/Users/ipepio/Library/Application Support/Open Design/namespaces/release-stable/data/projects/901f5b5d-1606-4323-a26f-6e344ab2c095`
- **Primary seams:** browser portal → HTTP adapters → domain modules → PostgreSQL/storage

## Goal

Complete the browser journeys required for an Installation to accept and operate
Tickets without bypassing Workspace authorization or maintaining configuration
that the Ticket module ignores.

## Non-negotiable vocabulary and invariants

- Use Installation, Workspace, Organization, User, Workspace Membership, Queue,
  Ticket, Timeline, Message, Internal Note, System Event, Status Category,
  Capability, and Attachment as defined in `docs/glossary.md`.
- A User gets Workspace access only through a Workspace Membership.
- Workspace authorization is explicit; RLS remains defense in depth.
- Internal Notes are never returned to Requesters.
- Ticket Type, Priority, Status, Queue, and Attachment records are scoped to the
  active Workspace.
- A configured S3 adapter must never silently fall back to local storage after a
  runtime failure.

## Confirmed test seams

### 1. Ticket creation seam

**Interface:** portal → Ticket HTTP API → Ticket module → PostgreSQL.

Use real PostgreSQL. A test creates a Ticket through the HTTP interface and reads
it back through the HTTP interface. Tests must not query tables to verify the
result.

### 2. Workflow configuration seam

**Interface:** Workspace Admin portal → Workflow HTTP API → Workflow module →
PostgreSQL.

Use real PostgreSQL. Tests create and update Ticket Types, Priorities, and
Statuses through the HTTP interface, then observe the available configuration
through that same interface or through the Ticket creation journey.

### 3. Attachment seam

**Interface:** portal → Attachment HTTP API → Storage module → configured object
storage.

Use real PostgreSQL plus:

- real MinIO for S3 integration tests;
- a temporary filesystem directory for local-storage integration tests;
- a fake only for the external malware scanner, if scanning is exercised.

Tests verify upload, list, authorized download, and denial through public HTTP
interfaces. They do not inspect buckets, files, or database rows as assertions.

### 4. Authentication and session seam

**Interface:** browser → Auth HTTP API → Identity module → PostgreSQL.

Use real PostgreSQL and a controlled clock where expiry behavior is tested.
SMTP is an external adapter and may be faked. Browser tests observe session
continuity, not cookies or database rows as implementation details.

### 5. Workspace administration seam

**Interface:** Workspace Admin portal → Admin HTTP API → Identity/Workspace
modules → PostgreSQL.

Use real PostgreSQL. Observe Organizations and Workspace Memberships only via
the HTTP interface and browser journey.

## Functional requirements

### F1 — Landing and Ticket intake

- A configured Installation has a clear support landing page with an “Open a
  Ticket” action.
- An authenticated Requester reaches the Ticket creation form directly.
- An unauthenticated known User completes magic-link authentication and returns
  to Ticket creation.
- An unknown email receives localized, non-technical feedback. The product must
  not expose whether unrelated Workspace Memberships exist.
- Anonymous Ticket creation is out of scope unless separately specified.

### F2 — Durable sessions

- Interactive sessions last 30 days.
- Activity renews both server expiry and browser cookie consistently.
- Logout invalidates the session immediately.
- Expired and invalid sessions return to authentication without losing a safe
  post-login destination such as “create Ticket”.
- E2E tests must use `ticketos_e2e`, never the development database.

### F3 — Organizations and Workspace Memberships

- A Workspace Admin can list and create Organizations.
- A Workspace Admin can add, edit, activate, and deactivate Workspace
  Memberships.
- Internal members use Agent or Workspace Admin roles.
- External members use the Requester role and may belong to an Organization.
- Adding an external member makes their email eligible for magic-link login.
- Cross-Workspace reads and writes are denied.

### F4 — Configurable Statuses

- A Workspace Admin can list, add, edit, order, activate, and deactivate
  Statuses.
- Every Status belongs to one canonical Status Category: `new`, `open`,
  `pending`, `resolved`, or `closed`.
- Ticket transitions use persisted Status IDs, not a separate hard-coded status
  enum.
- Inactive Statuses remain readable on historical Tickets but cannot be selected
  for new transitions.

### F5 — Configurable Ticket Types

- Ticket Types have Workspace-scoped ID, name, canonical category, description,
  order, active state, and default state.
- Canonical categories remain `incident` and `service-request` unless an ADR
  changes that decision.
- A Ticket Type is required when creating a Ticket.
- Only active Ticket Types are selectable.
- A Workspace must have exactly one usable default Ticket Type, or Ticket
  creation must require an explicit selection.

### F6 — Configurable Priorities

- Priorities have Workspace-scoped ID, name, color, order, active state, and
  default state.
- Names are configurable; Ticket persistence references a Priority ID rather
  than a hard-coded enum.
- A Priority is required when creating a Ticket.
- The active default Priority is preselected in the form.
- Inactive Priorities remain readable on historical Tickets but cannot be used
  for new Tickets.

### F7 — Ticket persistence

- The creation form loads active Ticket Types and Priorities for the active
  Workspace.
- Submit includes `ticketTypeId` and `priorityId`.
- The server rejects missing, inactive, nonexistent, or cross-Workspace values.
- A successful response can be read back with the same title, description,
  Ticket Type, and Priority.
- Ticket creation and its initial System Event are atomic.
- Validation errors preserve entered form values and are announced accessibly.

### F8 — Attachments

- A permitted User can add one or more Attachments to a Ticket.
- The server validates size, content type, blocked extensions, Ticket access, and
  Workspace scope.
- Attachment metadata and object lifecycle remain consistent if upload fails.
- Download uses an authorized endpoint or short-lived authorized URL; never a
  permanent public URL.
- Requesters cannot access Attachments belonging only to Internal Notes.
- Deletion and quarantine remain auditable and follow the owning content.

### F9 — Storage selection and development MinIO

- If a complete S3 configuration exists, use the S3 adapter.
- If no complete S3 configuration exists, use the local-volume adapter.
- An incomplete S3 configuration fails startup with a useful configuration
  error; it must not be treated as local mode.
- A configured S3 adapter that becomes unavailable returns an operation error;
  it must not silently write to local storage.
- Docker development includes MinIO, a persistent volume, healthcheck, bucket
  initialization, and application environment variables.
- The local fallback uses the existing Docker Attachment volume.

## Known model mismatch to remove

The current runtime Ticket model stores hard-coded status and priority strings
and permits a nullable `ticket_type_id`, while Workspace configuration is stored
in separate tables. The implementation must converge on configuration IDs.
Do not add translation layers that preserve two independent sources of truth.
Use additive/backfill migrations before enforcing new constraints.

## TDD slices

Execute strictly in this order. Each line is one independent red → green cycle:

1. Creating a Ticket without a Ticket Type is rejected.
2. Creating a Ticket without a Priority is rejected.
3. A Ticket created with active same-Workspace configuration is readable with
   the same known values.
4. A cross-Workspace Ticket Type is rejected.
5. A cross-Workspace Priority is rejected.
6. An inactive Ticket Type is not available and is rejected on submit.
7. An inactive Priority is not available and is rejected on submit.
8. A Workspace Admin can create a Ticket Type and see it in Ticket creation.
9. A Workspace Admin can create a Priority and see it preselected when default.
10. A Workspace Admin can configure a Status and use it in an allowed transition.
11. A Requester uploads and downloads an Attachment through local storage.
12. An unauthorized User cannot download that Attachment.
13. The same upload/download example passes against MinIO.
14. Missing S3 configuration selects local storage.
15. Incomplete S3 configuration prevents startup.
16. S3 runtime failure does not write to local storage.
17. An external Requester added by a Workspace Admin can request a magic link.
18. An active session remains authenticated after renewal.
19. The landing journey returns an authenticated Requester to Ticket creation.

For every slice: write one failing test, run it and record the expected failure,
implement only enough behavior to pass, then run the focused test and relevant
suite. Do not batch tests before implementation.

## Out of scope

- Anonymous Ticket submission.
- New canonical Ticket Type or Status Categories.
- Public permanent object URLs.
- Silent S3-to-local failover.
- Replacing the accepted Open Design visual language.
- Microservices or a separate storage service.

## Completion evidence

- Browser journeys match the Open Design source and meet WCAG 2.2 AA.
- Ticket creation persists required configured values.
- Workspace isolation tests cover configuration and Attachments.
- Local and MinIO Attachment examples pass.
- Session tests use the Auth seam and E2E runs against its dedicated database.
- `pnpm typecheck`, `pnpm lint`, `pnpm build`, and `pnpm test` pass.
