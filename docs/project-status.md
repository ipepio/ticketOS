# Project status and evidence

Status: active monorepo adopting a Markdown-only agent working-contract layout from `ipepio/dev-templates`. Documentation adoption is the current task.

## Baseline

| Area | Status | Evidence |
| --- | --- | --- |
| Source architecture | Documented | [docs/architecture/structure.md](architecture/structure.md), [docs/architecture/features.md](architecture/features.md), [docs/architecture/rest.md](architecture/rest.md), [docs/architecture/persistence.md](architecture/persistence.md), [docs/architecture/shared.md](architecture/shared.md), [docs/architecture/conventions.md](architecture/conventions.md), [docs/architecture/workflow.md](architecture/workflow.md), [docs/architecture/testing.md](architecture/testing.md) |
| Dependencies and runtime | Node ≥ 22, pnpm ≥ 9; monorepo with `@ticketos/app`, `@ticketos/portal`, `@ticketos/worker`, `@ticketos/tests`, `@ticketos/domain`; `pg` for PostgreSQL, React 19 for the portal, vitest + Playwright for tests (see [package.json](../package.json) and [pnpm-lock.yaml](../pnpm-lock.yaml)) |
| Tests / type-check / lint / build | Observed green on the goal branches: typecheck 0, lint 0, build emits, app unit 259/259, portal 13/13, Playwright 57/57, `pnpm check:arch` 0 violations |
| Authentication and security | Not assessed | Do not infer from stack alone |
| Deployment and rollback | Not assessed | Inspect configuration and external assumptions |

## Findings

Use one entry per finding:

- **ID / title:** stable identifier and concrete symptom.
- **Classification:** confirmed defect, conditional risk, or recommendation.
- **Evidence:** source paths, observed output, or reproduction; avoid credentials and private data.
- **Impact / priority:** explain consequence rather than relying on a severity label alone.
- **Status:** open, accepted, in progress, resolved, or deferred by maintainer.
- **Verification:** what was checked and what remains unknown.

Do not treat an open finding as permission to fix it.

### F1 / README misstates implementation state

- **Classification:** confirmed defect.
- **Evidence:** `README.md` previously claimed "implementation has not started" while the repository contains implemented features (route handlers in `packages/app/src/routes/`, domain interfaces in `packages/domain/src/`, running migrations, etc.).
- **Impact / priority:** downstream agents may waste effort re-implementing existing behavior or mis-evaluating progress.
- **Status:** resolved — README now describes the implemented system, links AGENTS.md/CONTENTS.md, and the first-run setup section landed with the onboarding feature.
- **Verification:** README.md current state; onboarding journeys pin the described behavior.

### F2 / Unfinished admin-configuration feature with uncommitted changes

- **Classification:** conditional risk.
- **Evidence:** uncommitted modifications to `docker-compose.yml`, `packages/app/package.json`, `packages/app/src/app.ts`, `packages/app/src/identity/postgres.ts`, `packages/app/src/routes/auth.ts`, `packages/app/src/routes/index.ts`, `packages/app/src/routes/setup.ts`, `packages/app/src/routes/tickets.ts`, `packages/app/src/ticket/postgres.test.ts`, `packages/app/src/ticket/postgres.ts`, `packages/domain/src/interfaces.ts`, `packages/portal/src/i18n.ts`, `packages/portal/src/main.tsx`, `packages/portal/src/ticketos.css`, `packages/tests/e2e/release-e2e.spec.ts`, `packages/tests/package.json`, `packages/tests/src/fixtures.ts`, `pnpm-lock.yaml`; new untracked files include `migrations/022_member_admin_and_status_configuration.sql`, `migrations/023_ticket_priority_id_column.sql`, `migrations/024_config_active_state_columns.sql`, `packages/app/src/email/smtp.ts`, `packages/app/src/routes/admin.ts`, `packages/app/src/ticket/postgres.test.ts.bak`, `packages/app/src/ticket/ticket-creation.test.ts`, `packages/portal/src/AdminPages.tsx`, `packages/tests/e2e/admin-config.spec.ts`; a stray `.bak` file at `packages/app/src/ticket/postgres.test.ts.bak`.
- **Impact / priority:** uncommitted changes risk being lost; the stray `.bak` file is noise that may confuse agents.
- **Status:** resolved — the admin-configuration feature was committed, verified green, merged to master (cb2364a..3dc4447) and pushed; the `.bak` file is gone.
- **Verification:** git log master; `git remote -v`.

### F3 / No architecture import checks

- **Classification:** recommendation.
- **Evidence:** [docs/architecture/testing.md](architecture/testing.md) documents dependency rules (domain must not import Fastify, `pg`, HTTP clients; commands/queries must not import route handlers or transport DTOs; route handlers must not import `postgres.ts` or the pool) but no executable architecture-check tool or negative-fixture runner is configured. CI runs typecheck, lint, unit tests, e2e tests, and build — none invoke a dependency-audit tool.
- **Impact / priority:** dependency violations can introduce subtle coupling without being caught by existing checks.
- **Status:** resolved — `pnpm check:arch` (scripts/check-architecture.ts, AST-based, zero new dependencies) enforces the documented rules with negative-fixture proof; CI runs it; the 14 pre-existing runtime violations it surfaced were refactored away (owner decision: fix-now).
- **Verification:** `pnpm check:arch` reports 0 violations across 75 source files; scripts/check-architecture.test.ts proves each boundary fails.

### F4 / No git remote configured

- **Classification:** confirmed defect.
- **Evidence:** the repository has no remote URL configured (no origin), so `git push`, `git fetch`, and pull requests cannot function against an upstream.
- **Impact / priority:** changes cannot be shared or reviewed through the normal GitHub workflow.
- **Status:** resolved — origin (git@github.com:ipepio/ticketOS.git) configured; master and feature branches pushed.
- **Verification:** `git remote -v`; `git log origin/master`.

## Current task / continuation

- [Goal — complete every pending feature (odd/tasks/goal-pending-features.md)](../odd/tasks/goal-pending-features.md)
  — features 1-5 landed on stacked feature branches; merge to master at each boundary is the
  owner's decision. Findings F1, F2 and F4 below are resolved (see their Status lines); F3 is
  resolved by the executable checker.

## Maintenance

Update stale facts when relevant code changes. Preserve useful decision evidence, but remove obsolete operational instructions. A checklist is not proof that a check ran.
