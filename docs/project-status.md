# Project status and evidence

Status: active monorepo adopting a Markdown-only agent working-contract layout from `ipepio/dev-templates`. Documentation adoption is the current task.

## Baseline

| Area | Status | Evidence |
| --- | --- | --- |
| Source architecture | Documented | [docs/architecture/structure.md](architecture/structure.md), [docs/architecture/features.md](architecture/features.md), [docs/architecture/rest.md](architecture/rest.md), [docs/architecture/persistence.md](architecture/persistence.md), [docs/architecture/shared.md](architecture/shared.md), [docs/architecture/conventions.md](architecture/conventions.md), [docs/architecture/workflow.md](architecture/workflow.md), [docs/architecture/testing.md](architecture/testing.md) |
| Dependencies and runtime | Node ≥ 22, pnpm ≥ 9; monorepo with `@ticketos/app`, `@ticketos/portal`, `@ticketos/worker`, `@ticketos/tests`, `@ticketos/domain`; `pg` for PostgreSQL, React 19 for the portal, vitest + Playwright for tests (see [package.json](../package.json) and [pnpm-lock.yaml](../pnpm-lock.yaml)) |
| Tests / type-check / lint / build | Last recorded run unknown in this session — see [docs/architecture/testing.md](architecture/testing.md) for the exact commands (`pnpm -r typecheck`, `pnpm -r lint`, `pnpm -r build`, `pnpm -r test`, `pnpm test:e2e`) |
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
- **Status:** open.
- **Verification:** corrected by the dev-template adoption (S7); README will be updated in a follow-up task (T15) to point at `AGENTS.md` and `CONTENTS.md`.

### F2 / Unfinished admin-configuration feature with uncommitted changes

- **Classification:** conditional risk.
- **Evidence:** uncommitted modifications to `docker-compose.yml`, `packages/app/package.json`, `packages/app/src/app.ts`, `packages/app/src/identity/postgres.ts`, `packages/app/src/routes/auth.ts`, `packages/app/src/routes/index.ts`, `packages/app/src/routes/setup.ts`, `packages/app/src/routes/tickets.ts`, `packages/app/src/ticket/postgres.test.ts`, `packages/app/src/ticket/postgres.ts`, `packages/domain/src/interfaces.ts`, `packages/portal/src/i18n.ts`, `packages/portal/src/main.tsx`, `packages/portal/src/ticketos.css`, `packages/tests/e2e/release-e2e.spec.ts`, `packages/tests/package.json`, `packages/tests/src/fixtures.ts`, `pnpm-lock.yaml`; new untracked files include `migrations/022_member_admin_and_status_configuration.sql`, `migrations/023_ticket_priority_id_column.sql`, `migrations/024_config_active_state_columns.sql`, `packages/app/src/email/smtp.ts`, `packages/app/src/routes/admin.ts`, `packages/app/src/ticket/postgres.test.ts.bak`, `packages/app/src/ticket/ticket-creation.test.ts`, `packages/portal/src/AdminPages.tsx`, `packages/tests/e2e/admin-config.spec.ts`; a stray `.bak` file at `packages/app/src/ticket/postgres.test.ts.bak`.
- **Impact / priority:** uncommitted changes risk being lost; the stray `.bak` file is noise that may confuse agents.
- **Status:** open.
- **Verification:** git working-tree inspection confirmed; resolution requires a separate implementation task.

### F3 / No architecture import checks

- **Classification:** recommendation.
- **Evidence:** [docs/architecture/testing.md](architecture/testing.md) documents dependency rules (domain must not import Fastify, `pg`, HTTP clients; commands/queries must not import route handlers or transport DTOs; route handlers must not import `postgres.ts` or the pool) but no executable architecture-check tool or negative-fixture runner is configured. CI runs typecheck, lint, unit tests, e2e tests, and build — none invoke a dependency-audit tool.
- **Impact / priority:** dependency violations can introduce subtle coupling without being caught by existing checks.
- **Status:** open.
- **Verification:** a follow-up task may introduce an enforcement mechanism (architecture acceptance checks documented in testing.md).

### F4 / No git remote configured

- **Classification:** confirmed defect.
- **Evidence:** the repository has no remote URL configured (no origin), so `git push`, `git fetch`, and pull requests cannot function against an upstream.
- **Impact / priority:** changes cannot be shared or reviewed through the normal GitHub workflow.
- **Status:** open.
- **Verification:** `git remote -v` shows no remotes.

## Current task / continuation

- [Dev-template adoption (odd/tasks/dev-template-adoption.md)](../odd/tasks/dev-template-adoption.md) — documentation-only migration replacing ad-hoc guidance with the working-contract layout of `ipepio/dev-templates`, adapted to this repository's actual stack. This task covers T14 (S1, S3, S6): preferences and project-status documents.

## Maintenance

Update stale facts when relevant code changes. Preserve useful decision evidence, but remove obsolete operational instructions. A checklist is not proof that a check ran.
