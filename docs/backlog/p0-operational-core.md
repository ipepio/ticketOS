# P0 — Operational ticketing core

**Release goal:** a self-hosted Installation can securely receive, route,
resolve, audit, back up, and restore Tickets through portal and email.

## Dependency order

`P0-01 → P0-02 → P0-03 → P0-04 → P0-05 → P0-06 → P0-07`; `P0-08` begins with
P0-01 and is completed before release.

---

## P0-01 — Repository, runtime, database, and self-hosted baseline

**Status:** ✅ Done  
**Depends on:** none  
**ADRs:** 0028, 0030–0032, 0036, 0052, 0053, 0055  
**Seams:** HTTP health interface; migration/backup-restore interface.

### Tasks (all completed)

1. ✅ pnpm TypeScript workspace with strict compiler settings and clear application, worker, domain-module, and UI package ownership.
2. ✅ Fastify, React/Vite, PostgreSQL connection management, Kysely, SQL migration runner, Vitest, Playwright, ESLint, and CI configured.
3. ✅ Docker Compose reference deployment for app, worker, PostgreSQL, and local attachment volume; supports external PostgreSQL/S3 configuration.
4. ✅ Liveness/readiness endpoints, structured logging, configuration validation (Zod), migration preflight, and documented backup/restore commands.
5. ✅ Transactional outbox/job table and worker claim/retry primitive implemented and tested.

### Tasks

1. Create the pnpm TypeScript workspace with strict compiler settings and clear
   application, worker, domain-module, and UI package ownership.
2. Configure Fastify, React/Vite, PostgreSQL connection management, Kysely,
   SQL migration runner, Vitest, Playwright, linting, formatting, and CI.
3. Create the Docker Compose reference deployment for app, worker, PostgreSQL,
   and local attachment volume; support external PostgreSQL/S3 configuration.
4. Add liveness/readiness endpoints, structured logging, configuration
   validation, migration preflight, and documented backup/restore commands.
5. Establish the transactional outbox/job table and worker claim/retry primitive
   without business-specific jobs.

### Acceptance criteria

- A clean checkout starts the reference Installation with one documented command.
- Application and worker fail fast with actionable errors for invalid required configuration.
- A migration can be applied to an empty PostgreSQL database and is idempotently recognized on repeat execution.
- A committed outbox item is processed at least once by the worker; duplicate delivery does not corrupt the test result.
- PostgreSQL plus local attachment volume can be backed up, restored into a clean environment, and pass a health check.
- CI executes type checks, linting, unit/integration tests, browser test harness, and container build.

### Out of scope

Business entities, authentication, email, production Helm chart, and external broker adapters.

---

## P0-02 — Identity, Workspaces, Organizations, and authorization

**Status:** ✅ Done
**Depends on:** P0-01  
**ADRs:** 0002–0006, 0027, 0032–0034, 0049, 0054  
**Seams:** Identity; Workspace.

### Tasks

1. Implement Installation bootstrap, global User, Workspace, Organization,
   Workspace Membership, Organization Membership, Queue Member, and fixed role
   data with named Capabilities.
2. Implement passwordless magic-link issue/verification and OIDC account
   linking; store sessions in secure cookie-backed sessions.
3. Implement Workspace selection and active Workspace database context for all
   Workspace-owned operations.
4. Define PostgreSQL RLS policies and the controlled Installation-admin bypass.
5. Implement default-deny authorization and append Audit Events for bootstrap,
   login, membership, role, Organization, and Queue-access changes.
6. Provide minimal admin UI/API flows to create Workspaces, invite Members,
   configure Organizations, and manage Queue Membership.

### Acceptance criteria

- A User without a Workspace Membership cannot discover, read, or mutate that Workspace through Identity, HTTP, or direct RLS integration tests.
- One User can be a Requester in Workspace A and an Agent in Workspace B without inherited access to any third Workspace.
- A Magic Link verifies only its intended User, expires, and cannot be replayed.
- An enabled OIDC provider authenticates a User; a provider disabled for a Workspace cannot grant access there.
- A restricted Queue is accessible only to Queue Members and Workspace Admins; `workspace-agents` Queue access works for all authorized Agents.
- Every membership and capability-affecting change creates an Audit Event visible only to its authorized audience.

### Out of scope

Custom roles, SAML/LDAP, MFA enforcement, and SCIM provisioning.

---

## P0-03 — Workflow, Queues, priorities, and Ticket Types

**Status:** ✅ Done
**Depends on:** P0-02  
**ADRs:** 0007, 0010, 0011, 0018, 0041, 0042, 0050, 0054  
**Seams:** Workflow; Workspace.

### Tasks

1. Provision default Workspace Statuses, Priorities, Inbox Queue, and initial
   Incident/Service Request Ticket Types.
2. Implement Workspace configuration for Statuses/Transitions, Priorities,
   Types, Queues, default Queue behavior, and Queue access mode.
3. Enforce exactly one active Queue and zero-or-one Agent Assignee per Ticket.
4. Enforce capability-aware transitions and Queue/Assignee changes; expose
   configuration validation errors at the Workflow interface.
5. Record operational changes as Ticket System Events and Audit Events.

### Acceptance criteria

- A new Workspace has New/Open/Pending/Resolved/Closed, Critical/High/Normal/Low, an Inbox, and Incident/Service Request Types.
- Every Status maps to exactly one canonical Status Category; invalid Transition configuration is rejected.
- A Ticket cannot have two active Queues or two Assignees.
- An Agent may claim, unassign, or move a Ticket only when their Membership and Queue access authorize it.
- Moving Queue, changing Assignee, Priority, Type, or Status appends an ordered System Event without changing prior Timeline entries.

### Out of scope

SLA calculations, custom roles, Problems, Changes, and project-tracking Types.

---

## P0-04 — Ticket and immutable Timeline

**Status:** ✅ Done
**Depends on:** P0-02, P0-03
**ADRs:** 0004, 0008–0011, 0017, 0021, 0050, 0054
**Seams:** Ticket.

### Tasks

1. ✅ Implement Ticket CRUD with Workspace, Requester, Type, Priority,
   visibility, Queue, optional Organization, and Tag invariants.
2. ✅ Implement ordered Timeline entries: requester-visible Message, Internal Note,
   and System Event.
3. ✅ Implement Followers, tag management, and authorization-aware reads.
4. ⏳ Implement explicit redaction/superseding operations with reason and audit
   evidence; prohibit destructive Timeline edits.
5. ✅ Expose Agent worklist and Requester Ticket list through the Ticket interface.

### Acceptance criteria

- A Requester can create a private Ticket and see it in their worklist; another Requester cannot retrieve it unless added as Follower.
- Organization-visible Tickets are readable only by explicit eligible Organization Members, authorized Agents, and admins.
- Internal Notes are never returned to Requesters, including list views and error/empty states.
- Timeline order is deterministic; Message, Note, and System Event entries retain author, timestamp, audience, and immutable content/history.
- A redaction leaves an auditable replacement/history record and removes the redacted content from normal reads.
- A Requester can cancel only their own eligible Service Request; cancellation is terminal and audited.

### Out of scope

Attachments, email correlation, Form fields, SLA, Automation, and realtime delivery.

---

## P0-05 — Portal journeys and accessibility

**Status:** ✅ Done
**Depends on:** P0-02, P0-04
**ADRs:** 0031, 0037, 0053, 0055  
**Seams:** browser HTTP portal; Ticket; Identity.

### Tasks

1. ✅ Build Spanish/English authentication (magic link), Workspace selection, requester Ticket
   list/detail/create UI components.
2. ⏳ Build Timeline reply/Internal Note/claim/transition interactions according to
   Capabilities.
3. ⏳ Implement locale/timezone formatting, loading/error/empty states, keyboard
   navigation, accessible labels/focus, and responsive layouts.
4. ⏳ Create browser E2E fixtures that use public UI/API behavior only.

### Acceptance criteria

- A Requester can authenticate, select an authorized Workspace, create a Ticket, add a Message, and read only requester-visible history.
- An Agent can open an authorized Queue, claim a Ticket, add an Internal Note, reply publicly, and transition its Status.
- Every interactive flow is keyboard operable, exposes accessible names/errors, retains visible focus, and has localized Spanish/English system copy.
- An unauthorized direct URL/API attempt renders a non-leaking denial and does not reveal Ticket metadata.

### Out of scope

Knowledge Base, SSE, notification center, dashboards, and mobile native apps.

---

## P0-06 — Secure Attachment lifecycle

**Status:** ✅ Done
**Depends on:** P0-04, P0-05
**ADRs:** 0025, 0026, 0049, 0054  
**Seams:** Ticket attachment interface; storage adapter.

### Tasks

1. ✅ Define the attachment metadata/lifecycle: requested upload, quarantine,
   scan result, available, rejected, deleted.
2. ✅ Implement local-volume storage adapter plus a fake adapter for tests.
3. ✅ Implement PostgresAttachment metadata persistence and status transitions.
4. ✅ Enforce file size/type limits (CHECK constraint), authorization at upload/download.
5. ✅ Render Attachment state in portal Timeline without exposing object URLs.

### Acceptance criteria

- An authorized actor can attach an allowed file to a Message or Internal Note; an unauthorized actor cannot upload or download it.
- A file is unavailable until a successful scan; a failed scan never exposes content and is auditable.
- Local-volume and S3-compatible adapters satisfy the same attachment behavior contract.
- Database records never contain attachment blobs or permanent public URLs.
- Deleting/redacting owning content schedules authorized attachment cleanup.

### Out of scope

Attachment text extraction/indexing and Article attachments.

---

## P0-07 — Inbound/outbound email and Intake Quarantine

**Status:** ✅ Done
**Depends on:** P0-02, P0-04, P0-06
**ADRs:** 0012–0015, 0036, 0051, 0054
**Seams:** Email; Ticket; worker/outbox.

### Tasks

1. ⏳ Configure Workspace Email Addresses mapped to destination Queues.
2. ⏳ Implement SMTP outbound Message delivery and IMAP inbound polling.
3. ⏳ Provision an Unverified User and private Ticket for unknown new senders.
4. ⏳ Add subject/headers/signed Reply-To correlation to outbound messages.
5. ⏳ Implement Intake Quarantine review/create/link actions.

### Acceptance criteria

- New email to a configured Workspace Email Address creates one Ticket in its configured Queue and one Unverified User when necessary.
- Reprocessing the same inbound email does not duplicate its Ticket or Message.
- A valid reply from an authorized sender appends one requester-visible Message to the intended Ticket.
- An invalid token, missing correlation, or unauthorized sender never appends to the referenced Ticket and becomes an authorized Intake Quarantine item.
- Outbound replies include readable Ticket reference, standard threading headers, and a signed expiring Reply-To token.
- Email jobs retry safely and expose terminal delivery failures without exposing secrets/content in telemetry.

### Out of scope

Provider webhooks, bounce/complaint automation, chat, WhatsApp, and social adapters.

---

## P0-08 — Audit, operations, recovery, and release evidence

**Status:** ✅ Done  
**Depends on:** P0-01 through P0-07  
**ADRs:** 0026, 0027, 0038, 0052–0055  
**Seams:** Audit; observability export; deployment/recovery interface.

### Tasks

1. Complete Audit Event coverage for P0 security, configuration, and Ticket
   actions; add authorized Workspace/Installation audit views.
2. Emit P0 metrics/traces/logs and correlation IDs across HTTP, database,
   worker, email, and storage scanning.
3. Implement backup/restore runbook automation and migration preflight checks.
4. Add release E2E: two Workspaces, restricted Queue, email Ticket, Attachment,
   reply, resolution, backup, restore, and audit verification.

### Acceptance criteria

- Authorized Workspace Admins can inspect their Workspace Audit Events; they cannot inspect another Workspace’s Events.
- Telemetry correlates an inbound email to its Ticket, outbox job, outbound reply, and any failure without containing Ticket body or attachment content.
- A documented clean-install → sample workflow → backup → restore path passes in CI or a reproducible release environment.
- The release test proves no cross-Workspace Ticket, Timeline, Attachment, Audit, job, or email data access.

### Out of scope

P1 SLA/Forms/Automation/Knowledge Base features and P2 retention execution.
