# Workspace administration — workflow configuration and Queue management

Requirement source: `docs/specs/admin-configuration-and-queue-management.md` (status `ready-for-agent`).
Close the Workspace Admin browser journey for Ticket configuration (Statuses, Priorities, Ticket Types)
and Queue management (Queues, access mode, Queue Members), through capability-authorized domain modules.

## Specs

S1. Capability authorization, quoted from the spec: "All configuration and Queue mutations require the
relevant capability: `config:manage`, `queues:manage`, or `queues:restrict`. A generic membership
administration check is not sufficient." The current single `memberships:manage` gate is wrong.

S2. Workspace isolation, quoted: "RLS remains defense in depth. Every operation also filters and
validates active Workspace IDs explicitly at the domain-module boundary." A request naming another
Workspace's Status, Priority, Ticket Type, Queue or User is rejected.

S3. Audit, quoted: "Create, update, reorder, activation, default, Queue access-mode, and Queue Member
changes append Audit Events with actor, Workspace, resource ID, and before/after details appropriate to
the action." No admin mutation may skip it.

S4. Ordering and active state, quoted: "Every mutable configuration resource has an explicit ordered
position and an active state. Reordering is persisted server-side and is not a portal-only presentation
choice."

S5. Exactly one active default, quoted: "Exactly one active default Priority is maintained
transactionally per Workspace. Setting a new default clears the previous default in the same
transaction." Ticket Type default follows: "A Workspace either has one active default Ticket Type or
Ticket creation requires an explicit Type."

S6. Inactive configuration stays readable, quoted: "Statuses, Priorities, and Ticket Types referenced by
historical Tickets are deactivated rather than destructively deleted. Hard deletion is not exposed while
references exist."

S7. Queue access vocabulary, quoted: "Queue access mode uses the accepted domain vocabulary:
`workspace-agents` and `restricted`. Existing persisted `open` values are migrated to
`workspace-agents` without changing effective behavior."

S8. Queue Member eligibility and idempotency, quoted: "Adding a Queue Member validates that the Queue and
Workspace Membership belong to the active Workspace and that the Membership is active with Agent or
Workspace Admin capabilities." and "Queue Member insertion and removal are idempotent." and "A Workspace
Admin can always manage a restricted Queue regardless of explicit Queue Membership".

S9. Ticket creation input, quoted: "The Ticket creation interface returns only active same-Workspace
Ticket Types and Priorities, ordered by configured position."

S10. Portal behaviour, quoted: "The portal uses controlled forms with dedicated create/edit dialogs.
Closing a dialog intentionally discards draft values; server or validation failures do not." and
"Error responses use stable machine-readable codes plus localized portal copy. Raw SQL errors and
unlocalized `API 500` strings are never shown to Users."

S11. Portal accessibility, quoted: "As a keyboard user, I want to move through configuration tabs and
controls without a mouse" and "As a mobile Workspace Admin, I want configuration lists and Queue Member
management usable on a narrow viewport".

S12. Verification, quoted: "The primary suite uses a real browser, the real Admin HTTP adapter, and an
isolated real PostgreSQL database named `ticketos_e2e`." and "Direct SQL is limited to isolated fixture
provisioning and is never used as the behavior assertion." and "Authorization examples cover a Workspace
Admin success path, an Agent denial, a Requester denial, and a cross-Workspace resource attempt."

S13. No ORM, parameterized SQL, append-only migrations; existing ADRs 0007, 0010, 0018, 0042, 0049, 0053
stay authoritative.

## Tasks

| ID | Specs | Route | Commit |
| --- | --- | --- | --- |
| T1 | S4,S5,S6,S7 | worker | feat(admin): migration for ordering, descriptions, colors and access mode |
| T2 | S2,S4,S5,S7 | worker | feat(workflow): configuration domain contract |
| T3 | S2,S3,S4,S5,S7 | worker | feat(workflow): status configuration policy |
| T3a | S2,S3,S4,S5,S7 | worker | feat(workflow): priority configuration policy |
| T3b | S2,S3,S4,S5,S7 | worker | feat(workflow): ticket type configuration policy |
| T3c | S2,S3,S5 | worker | feat(workflow): transitions and selectable catalogue |
| T3d | S2 | worker | feat(workflow): compose the configuration module |
| T4 | S2,S4,S7,S8 | worker | feat(workspace): queue and member policy implementation |
| T5 | S1,S2,S3 | worker | feat(admin): capability checks and audit for config routes |
| T6 | S1,S2,S3 | worker | feat(admin): capability checks and audit for queue routes |
| T7 | S3,S4,S5 | worker | feat(admin): reorder, default and transition endpoints |
| T8 | S9 | worker | feat(ticket): creation uses active workspace configuration |
| T9 | S10,S11 | worker | feat(portal): status, priority and type config dialogs |
| T10 | S10,S11 | worker | feat(portal): transitions editor |
| T11 | S7,S10,S11 | worker | feat(portal): queue edit, access mode and member management |
| T12 | S10,S11,S12 | worker | feat(portal): creation form driven by workspace configuration |
| T13 | S12 | worker | test(e2e): browser journeys for configuration and queues |
| T14 | S6,S12 | worker | chore(e2e): replace direct SQL assertions and drop backup test |

## Log

L5 (incident, T3): the first attempt produced a single 1.802-line rewrite of `workflow/postgres.ts` with
invented audit-kind literals, a broken constructor and 33 type errors; it was cancelled mid-run and the
file was restored from `HEAD`. Replacement design, decided by the orchestrator: one implementation file
per resource (`config-statuses.ts`, `config-priorities.ts`, `config-ticket-types.ts`,
`config-transitions.ts`) plus a thin delegating compositor (`config-module.ts`) that implements the
existing `WorkflowConfigurationModule` interface. The domain contract does not change. Each slice must
stay under ~350 lines and must pass `pnpm --filter @ticketos/app typecheck` on its own.

L6 (repair): T4 widened `WorkspaceModule` to the workspace-scoped signatures the spec requires; the six
stale call sites in `identity/workspace.test.ts` were adapted without touching a single assertion. After
the repair `pnpm -r typecheck` and `pnpm -r lint` both pass across all seven packages (observed, 0
errors); `lens_diagnostics` could not confirm three of five files because the language server is
silent-on-clean, so `tsc --noEmit` is the evidence used.

## Ordering and review concurrency

T1 unblocks T2. T2 unblocks T3-T3d. T3, T3a, T3b touch disjoint files and can run together; T3d needs all
three plus T3c. T3-T3d unblock T5-T7. T4 already landed. T8 is independent of the portal tasks and starts
after T2. T9-T11 follow T3/T3c/T4/T7. T12 follows T8. T13 follows all of them. T14 is last.

## Carried requirements from the T1 verification

V1. The migration leaves `DEFAULT 0` on `statuses.sort_order` and `ticket_types.sort_order`, so an insert
without an explicit position sorts first and collides. Every create in the domain layer MUST compute an
explicit appended position (`max(sort_order) + 1` inside the same transaction), never rely on the default.

V2. The database enforces only *at most one* active default per Workspace. The domain layer owns
*exactly one*: `setDefaultPriority`/`setDefaultTicketType` must clear the previous default and set the new
one in one transaction, reject an inactive target with `default-inactive`, and deactivating the current
default must not silently leave zero active defaults without the caller choosing a replacement.

V3. Legacy `tickets.priority = 'urgent'` rows keep `priority_id IS NULL`. Every read path added by this
feature tolerates a null `priorityId` instead of assuming it.

## Log

L1 (verbatim): "dale, retoma la build a medio hacer, dividelo todo en tareas atomicas, utiliza qwen3.6 para la implementacion, tu haz de juez y revisor"

L2 (evidence): baseline observed on this working tree — `pnpm -r typecheck` passes, `pnpm -r lint` passes,
`pnpm -r test` cannot run: the app suite needs PostgreSQL on 5432 and the e2e suite needs `ticketos_e2e`
on 15433; neither container is up and no `ticketos` container exists. No test failure is attributable to
source yet.

L3 (evidence): read-only gap analysis of the current tree. All 20 admin routes gate on
`memberships:manage` (`packages/app/src/routes/admin.ts:9-24`), none appends an audit event, all
configuration SQL is written inline in the adapter instead of the owning module, `open` is still the
persisted access mode (`admin.ts:335`), `getQueueMembers(queueId)` has no Workspace filter
(`packages/domain/src/interfaces.ts:225`), the priority name CHECK enum still exists, Statuses and
Ticket Types have no `sort_order`, and `POST /api/tickets` requires `ticketTypeId`+`priorityId` while the
portal sends only title and description. `packages/tests/e2e/admin-config.spec.ts` is API-only.

L4 (decision): the migrations task T1 is high risk (item 1: it rewrites persisted access-mode values and
backfills a new `priority_id`). It gets its own review, its own commit and a dedicated verifier pass.
No other task touches stored data irreversibly.

L7 (review finding, diagnostics): `lens_diagnostics` reports blocking items that are not project gates.
`ast-grep:no-sql-in-code` fires on every raw SQL string, which is the mandated style (ADR 0003, no ORM);
`sql-injection` fires on a static template literal that only contains `$n` placeholders
(`packages/app/src/ticket/postgres.ts:98`); the TypeScript 6133 entries and the `ts-open-redirect` entry
live in the pre-existing `SetupWizard` (`packages/portal/src/main.tsx:1402-1433`), untouched by this
feature, and the redirect target is `window.location.pathname` (same origin). The gates that count are
`pnpm -r typecheck` (tsc --noEmit) and `pnpm -r lint`, both observed at 0 errors. These diagnostics are
recorded, not chased.

L8 (review findings to fix before delivery):
- `PostgresTicket.getTicket(id)` and `deleteTicket(id)` read and delete by id alone, with no Workspace
  predicate, which contradicts S2's "every operation also filters and validates active Workspace IDs
  explicitly at the domain-module boundary". Pre-existing, in scope because S2 covers this feature's
  seam.
- `updateTicket` does not refresh `priority_id` and omits it from its RETURNING list.
- `updateStatus` can set `isDefault` on a second status without clearing the previous one; Status
  defaults are outside S5 (which covers Priority and Ticket Type), so this is recorded as a follow-up,
  not a blocker.

L9 (delivery, verified): the full gate now passes on this working tree.
- `pnpm -r typecheck`: 0 errors across 7 packages.
- `pnpm -r lint`: 0 errors across 7 packages.
- `pnpm -r build`: 0 failures; `packages/app`, `packages/domain`, `packages/portal`, `packages/shared`, `packages/worker` all emit.
- `DATABASE_URL=...15432/ticketos pnpm --filter @ticketos/app test`: 22 files, 205 tests passed (previously 23 failing: fixtures still used the retired `open` access mode, two active defaults per Workspace, and a Requester membership in the Queue Member fixtures — the failures were the new rules firing, so the fixtures were adapted, not the rules).
- `E2E_DATABASE_URL=...15433/ticketos_e2e PLAYWRIGHT_BASE_URL=http://localhost:3021 pnpm exec playwright test`: 16 tests passed, including the three new browser journeys (Ticket configuration, Queue management, Authorization) and the rewritten release suite.

L10 (defects found while verifying, all fixed):
- `migrations/026_ticket_queue_routing.sql` (new): `003` declared `tickets.queue_id`, `004` recreated the live table without it, so no Ticket could be routed to a Queue and the Queue list aggregate was a hard 500. Added nullable `queue_id`, its foreign key and `(workspace_id, queue_id)` index; additive and non-destructive.
- `packages/domain/src/index.ts`, `packages/shared/src/index.ts`, `packages/app/src/db/connection.ts`: relative imports had no `.js` extension. `moduleResolution: bundler` accepts that at compile time, but the emitted ESM could not boot (`ERR_MODULE_NOT_FOUND`), which meant the built app never started. All 20 specifiers fixed.
- `packages/app/src/routes/admin-config.ts`: the composed configuration module was resolved at module scope, before `initApp()`, which threw `Cannot access 'workflow' before initialization` on boot. Now resolved lazily per request through `getWorkflowConfiguration()`.
- `packages/app/src/app.ts`: the portal bundle path was `../../../../portal/dist` (one level too high) and the failure was swallowed, so `/` served the JSON info route and the browser UI was never reachable. Path corrected to `../../portal/dist`, static serving registered before the route plugins, an SPA not-found handler added for deep links, and the missing bundle now logs a warning instead of passing silently. `routes/root.ts` moved its informational payload from `/` to `/api` so the portal owns `/`.
- `packages/app/src/workspace/postgres.ts`: `getQueueMembers` selected a non-existent `workspace_memberships.capabilities` column (500) and returned `displayName: null`. It now reads `users.display_name` and derives capabilities from the exported `CAPABILITY_MAP` instead of duplicating the role policy.
- `packages/portal/src/AdminPages.tsx`: tab arrow keys did not wrap; they now follow the ARIA tab-ring practice. Dead state (`fromName`/`toName`) removed and the create-queue error is rendered in the dialog with `role="alert"` instead of being stored unseen.

L11 (independent verification, blockers fixed): a separate verifier re-ran the gates and probed the migrations in its own scratch database. It confirmed the migration layer, Workspace isolation and the capability surface, and raised two blockers plus two follow-ups, all fixed here and re-proven:
- B2 (blocker): `updatePriority` and `updateTicketType` bound `workspaceId` and the resource id in the wrong order, so every field update returned `not-found`. Fixed; re-proven by executing the built module against a real database (`updatePriority -> probe-low-renamed`, `updateTicketType -> probe-incident-renamed`).
- B2 follow-up: the same generic update paths let `isDefault`/`isActive` bypass the S5/V2 default invariants. Promoting a default now clears the previous one inside the transaction and an inactive default is rejected with `default-inactive`.
- B1 (blocker): `PATCH /api/admin/queues/:id` only checked capabilities when the body carried a name or an access mode, so an empty body reached `updateQueue` and returned queue metadata to any authenticated user. `queues:manage` is now required unconditionally, with `queues:restrict` added for access-mode changes.
- S8 follow-up: queue-member eligibility and the agent branch of `canAccessQueue` now require `status = 'active'` on the membership, not just the role.
Final observed gate after the fixes: `pnpm -r typecheck` 0 errors, `pnpm -r lint` 0 errors, `pnpm -r build` 0 failures, app unit tests 205/205, portal unit tests 12/12, Playwright 16/16. Verifier scratch databases and directories were dropped; no probe file remains in the tree.

L12 (blocker found by the owner during first manual run): "Bootstrap failed" on a fresh installation.
`POST /api/setup/bootstrap` returned 500 with
`new row for relation "queues" violates check constraint "queues_access_mode_check"`.
Four defects in the seeding code, not one:
1. `routes/setup.ts` and `workflow/postgres.ts` still inserted the default Inbox Queue with
   `access_mode = 'open'`, retired by migration 025 (S7).
2. Every seeded Status carried `is_default = true` and none supplied `sort_order`, which migration 025
   made NOT NULL with a default of 0, so all five would have collided at position 0 (S4).
3. All four seeded Priorities carried `is_default = true`, violating the new partial unique index
   `idx_priorities_workspace_default` (S5).
4. Both seeded Ticket Types carried `is_default = true` in `workflow/postgres.ts`, violating
   `idx_ticket_types_workspace_default` (S5).
Fixed in both seeding paths: Inbox Queue is `workspace-agents`; Statuses get explicit positions 1..5 with
only `New` as default; Priorities get 1..4 with only `normal` as default; Ticket Types get 1..2 with only
`Incident` as default. Verified on a fresh database: bootstrap returns 200 with a `workspaceId` and the
seeded rows are exactly that shape. The app unit suite still passes 205/205.

T15 (closed 2026-11-20): `packages/app/src/routes/setup.test.ts` now covers the first-run contract through the app instance and `inject()`: status 200/`configured:false` on a fresh install, 400 on an incomplete body with zero writes, 200 on bootstrap with the seeded rows obeying the ordering (Statuses 1..5, Priorities 1..4, Ticket Types 1..2) and single-default rules (only `New`, only `normal`, only `Incident`), `Inbox` with `workspace-agents`, an admin membership plus issued session, and 409 on a second bootstrap with the workspace count unchanged. The test runs against a scratch database (`ticketos_setup_test`, created and dropped by the suite, mirroring how e2e owns `ticketos_e2e`) so the guard is observed on a genuinely fresh installation. RED→GREEN proven: reintroducing the original `access_mode = 'open'` seeding defect makes 3 of 5 tests fail with the exact "Bootstrap failed" 500; restoring the fix makes them pass. App suite is now 210/210. `packages/app/src/config.ts` exports `configSchema` so tests can parse a valid `Config` without environment mutation.

L13 (owner-reported defect, root cause): "los tickets no se están creando".
Reproduced through the real portal with Playwright against a running server: `POST /api/tickets` returned 200
and the row existed in `tickets`, so creation itself worked. The actual defect was invisible routing: every
Ticket was inserted with `queue_id = NULL`, so the Queue screen kept reporting `TOTAL IN QUEUE: 0` and each
new Ticket was absent from every Queue view. `migrations/026` added the column but nothing populated it.
Fix: `CreateTicketInput` accepts an optional `queueId`; `createTicket` validates an explicit Queue against
the Workspace and otherwise resolves the Workspace's first Queue, then persists `queue_id` inside the same
INSERT (ADR 0010). Verified: a Ticket created through the API now lands in `Inbox`, and the data shows new
rows carrying a queue while the three pre-fix rows stay unrouted.

T16 (closed, owner decision 2026-11-20): rows created before the queue-routing fix keep `queue_id = NULL`. The owner decided that no backfill and no "Unrouted" section are needed because the pre-fix rows belong to a development database, not production, so there is no data worth repairing. If ticketOS ever carries production data, revisit this decision before relying on Queue totals.

L14 (delivery): the work landed as nine commits on the branch `feat/admin-configuration-and-queues`
(migration, domain, app policy, app routes, portal, e2e, docs, chores, app fixtures). The work unit
exceeded the ~400 authored-changed-line guideline: the feature is one indivisible delivery (schema plus
policy plus routes plus portal plus tests), so the slice boundary is the feature, not a file count. It is
recorded here rather than split into artificial commits that would not build or pass on their own.
