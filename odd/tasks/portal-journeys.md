# Feature — Operational portal journeys: landing, sessions, members, ticket form

Implement the remaining browser journeys of `docs/specs/operational-portal-completion.md`
(F1, F2, F3, F7; TDD slices 17–19). Slices 1–16 except 17–19 are done or belong to F4
(attachments). Stack: feat/portal-journeys on top of feat/status-convergence.

## Specs

S1 (F1, verbatim): "A configured Installation has a clear support landing page with an “Open a
Ticket” action." / "An authenticated Requester reaches the Ticket creation form directly." /
"An unauthenticated known User completes magic-link authentication and returns to Ticket
creation." / "An unknown email receives localized, non-technical feedback. The product must
not expose whether unrelated Workspace Memberships exist." (Anonymous Ticket creation is out
of scope.)

S2 (F2, verbatim): "Interactive sessions last 30 days." / "Activity renews both server expiry
and browser cookie consistently." / "Logout invalidates the session immediately." / "Expired
and invalid sessions return to authentication without losing a safe post-login destination
such as “create Ticket”." / "E2E tests must use `ticketos_e2e`, never the development database."

S3 (F3, verbatim): "A Workspace Admin can list and create Organizations." / "A Workspace Admin
can add, edit, activate, and deactivate Workspace Memberships." / "Internal members use Agent
or Workspace Admin roles." / "External members use the Requester role and may belong to an
Organization." / "Adding an external member makes their email eligible for magic-link login." /
"Cross-Workspace reads and writes are denied."

S4 (F7, verbatim): "The creation form loads active Ticket Types and Priorities for the active
Workspace." / "Submit includes `ticketTypeId` and `priorityId`." / "The server rejects missing,
inactive, nonexistent, or cross-Workspace values." / "A successful response can be read back
with the same title, description, Ticket Type, and Priority." / "Ticket creation and its
initial System Event are atomic." / "Validation errors preserve entered form values and are
announced accessibly." (Form already submits both fields — F7 is complete at the API seam;
this feature verifies it as a browser journey.)

S5 (TDD slices 17–19, verbatim): "17. An external Requester added by a Workspace Admin can
request a magic link." / "18. An active session remains authenticated after renewal." /
"19. The landing journey returns an authenticated Requester to Ticket creation."

## Tasks

| ID | Spec | Route | Commit |
| --- | --- | --- | --- |
| T1 | S1, S5 (slice 19) | worker: landing page with "Open a Ticket" + post-login destination preservation; e2e journey | 025e270 |
| T2 | S2, S5 (slices 18) | worker: session renewal (server expiry + cookie max-age refresh on activity), logout invalidation, expired-session redirect preserving destination; e2e journeys | 19bff79 (pinning: behavior already satisfied) |
| T3 | S3, S5 (slice 17) | worker: members/org admin journeys in the portal + magic-link eligibility for external Requesters; e2e journeys | 344ba30 |

## Log

L1 (verbatim): "organiza un goal para hacer todas las features pendientes, y orquestalo todo. El desarrollo que sea todo con deepseekv4-flash o hy4-flash ambos de nan.builders, vale?"

L2 (context): the admin-members/organizations portal pages exist (AdminPages.tsx, landed with
the admin feature) but the magic-link eligibility journey (17) and the durable-session
behaviors (18) were never covered by browser tests, and there is no landing page — the portal
routes `/` to login when unauthenticated. REST seams exist: /api/auth/magic-link (issue),
/api/auth/verify (exchange), /api/auth/session, /api/auth/logout.

L3 (T1 evidence, worker + parent gates): commit 025e270 — landing page + Open a Ticket CTA, post-login
destination consumed once from a fixed page allowlist (localStorage, cleared on logout), unknown-email
response no longer leaks membership existence (auth.ts) + localized generic feedback, 4 new i18n keys in
all 9 locales, 5 new browser journeys (landing-journey.spec.ts). Parent cleanup in the same unit: dead
SetupWizard state/bindings and unused verify result removed. Gates: Playwright 34/34, app 230/230,
portal 13/13, typecheck 0, lint 0.
