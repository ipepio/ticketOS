# Feature — Ticket status model convergence

Remove the runtime model mismatch named by `docs/specs/operational-portal-completion.md`
("Known model mismatch to remove"): converge Ticket status on Workspace-configured
`statuses` rows referenced by ID, ending the hard-coded status enum as a source of truth.

## Specs

S1 (from "Known model mismatch to remove", verbatim): "The current runtime Ticket model stores
hard-coded status and priority strings and permits a nullable `ticket_type_id`, while Workspace
configuration is stored in separate tables. The implementation must converge on configuration IDs.
Do not add translation layers that preserve two independent sources of truth. Use
additive/backfill migrations before enforcing new constraints."

S2 (F4, verbatim): "Ticket transitions use persisted Status IDs, not a separate hard-coded status
enum."

S3 (F4, verbatim): "Inactive Statuses remain readable on historical Tickets but cannot be selected
for new transitions."

S4 (F4, verbatim): "A Workspace Admin can list, add, edit, order, activate, and deactivate
Statuses." (already implemented by the admin feature; only the transitions integration is new here)

S5 (from spec's invariants, verbatim): "Every Status belongs to one canonical Status Category:
`new`, `open`, `pending`, `resolved`, or `closed`."

S6 (migration discipline, verbatim): "Use additive/backfill migrations before enforcing new
constraints."

## Tasks

| ID | Spec | Route | Commit |
| --- | --- | --- | --- |
| T1 | S1, S6 | worker: additive migration `status_id` + backfill from `status` per Workspace (high risk item 1 — dedicated verifier pass after) | 9162846 (verifier PASS) |
| T2 | S2, S5 | worker: `createTicket`/`updateTicket`/transitions resolve `status_id` against the Workspace's statuses and validate transitions | a98d4ca (validation, not transitions) |
| T3 | S1 | worker: read paths return the configured status; remove the enum writes (`'backlog'` literals in ticket + email intake) | a98d4ca |
| T4 | S2, S3 | worker: portal/journeys observe configured statuses; e2e journey slice 10 ("A Workspace Admin can configure a Status and use it in an allowed transition") | — |

## Log

L1 (verbatim): "organiza un goal para hacer todas las features pendientes, y orquestalo todo. El desarrollo que sea todo con deepseekv4-flash o hy4-flash ambos de nan.builders, vale?"

L2 (blast radius, parent exploration): `TicketStatus` enum lives in `packages/domain/src/interfaces.ts:330`;
writes: `packages/app/src/ticket/postgres.ts` (createTicket 'backlog' literal, updateTicket set, cancelTicket
'cancelled'), `packages/app/src/email/postgres.ts:270` (intake INSERT 'backlog'); read/aggregates:
`packages/app/src/workspace/postgres.ts:393-394` (queue totals filter `t.status IN ('backlog','todo','in_progress')`),
`mapTicket` casts, `packages/app/src/routes/tickets.ts` query filter; portal `StatusBadge` statusMap and
TicketList/AgentQueue filters; `migrations/004_ticket_and_timeline.sql` CHECK constraint on the enum;
`migrations/003_workflow.sql` already defines `statuses` + `transitions` with status_id references.

L3 (T1 evidence, worker + independent verifier): migration 027 landed as 9162846 — additive column, backfill
mapped by category with default→sort_order→id determinism, (workspace_id, status_id) index, idempotent.
Migration-layer tests in `packages/app/src/ticket/status-backfill.test.ts` (scratch `ticketos_status_test`).
Independent verifier (gentle-ai-verify) PASS on its own scratch database: additive-only pg_dump diff,
deterministic replay, zero cross-Workspace references, no-overwrite, no destructive operation. App suite
217/217.

L4 (T2+T3 evidence, worker + parent gates): commit a98d4ca — domain drops the TicketStatus enum
(Ticket carries statusId/statusName/statusCategory); createTicket/updateTicket/list/cancel converge on
status_id with Workspace validation; email intake reuses the exported resolver; queue aggregates filter
by category; REST shape + portal badge/filters updated; e2e consumers updated with the same unit.
Parent judge note: the worker's app-suite failures on first run were environment state, not code — the
shared dev database (15432) had not run migration 027; `pnpm db:migrate` on it turned 28 failures into
226/226. Playwright 27/27 (26 + 1 new release-e2e assertion test for the status response shape), portal
13/13, typecheck 0, lint 0.

L5 (slice discipline): the goal doc records that feat/status-convergence stacks on
feat/first-run-onboarding; merge order must be onboarding first, then this branch. T4 (transitions via
the transitions table + journey slice 10) remains open; it closes the feature.
