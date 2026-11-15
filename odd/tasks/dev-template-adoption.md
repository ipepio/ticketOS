# Adopt the dev-templates documentation contract

Documentation-only migration: replace this repository's ad-hoc guidance with the working-contract
layout of `ipepio/dev-templates` (backend + frontend templates), adapted to this repository's actual
stack. No source, dependency, migration or behaviour change is in scope.

## Specs

S1. The source of truth is `https://github.com/ipepio/dev-templates`; its two templates are a
contract for documents that tell agents how to work. Content is copied and adapted, never invented.

S2. Contract documents live at root `AGENTS.md` and `CONTENTS.md`, `docs/AGENTS.md`,
`docs/project-context.md`, `docs/architecture/*.md`, `docs/portal/*.md`, `docs/adr/README.md`,
`docs/templates/*.md`, `docs/preferences.md`, `docs/project-status.md`. Existing `docs/specs/`,
`docs/backlog/`, `docs/glossary.md`, `docs/roadmap.md` and `docs/adr/0001-0055` stay and are indexed,
not rewritten.

S3. Every rule of the source template survives; only its framework mechanics are substituted:
"NestJS" becomes Fastify 5 + zod boundary validation, "Nest module / @Inject" becomes a feature module
in `packages/app/src/<feature>/` plus explicit wiring in `packages/app/src/app.ts`, "controller"
becomes a route handler in `packages/app/src/routes/<area>.ts`. ADR 0056 records the substitution.

S4. Documents state real repository facts, not template facts: pnpm workspace, `pg` with raw SQL in
`<feature>/postgres.ts`, domain interfaces in `packages/domain/src/<feature>.ts`, React 19 portal,
vitest + Playwright, and only the exact scripts that exist in `package.json`.

S5. Rules that cannot be proven stay marked as documented expectation versus implemented enforcement.

S6. Technical documents are English; owner quotes stay verbatim.

S7. `README.md` stops claiming "implementation has not started"; it points at `AGENTS.md` and
`CONTENTS.md`.

## Tasks

| ID | Specs | Route | Commit |
| --- | --- | --- | --- |
| T1 | S1,S2,S3,S6 | worker-lite | dev-docs: adopt working contract root |
| T2 | S1,S2,S3,S4,S6 | worker-lite | dev-docs: navigation index |
| T3 | S1,S3,S5,S6 | worker-lite | dev-docs: doc rules and project context |
| T4 | S1,S3,S4 | worker-lite | dev-docs: structure map |
| T5 | S1,S3 | worker-lite | dev-docs: feature patterns |
| T6 | S1,S3,S4 | worker-lite | dev-docs: REST contracts |
| T7 | S1,S3,S4 | worker-lite | dev-docs: persistence rules |
| T8 | S1,S3 | worker-lite | dev-docs: shared and gateways |
| T9 | S1,S3,S4 | worker-lite | dev-docs: conventions |
| T10 | S1,S3,S4,S5 | worker-lite | dev-docs: verification guidance |
| T11 | S1,S3 | worker-lite | dev-docs: agent workflow |
| T12 | S1,S2 | worker-lite | dev-docs: ADR index and templates |
| T13 | S1,S3,S4 | worker-lite | dev-docs: portal rules |
| T14 | S1,S3,S6 | worker-lite | dev-docs: preferences and status |
| T15 | S3,S7 | worker-lite | dev-docs: README rewrite |
| T16 | S1,S3 | parent | dev-docs: record adoption decision |

## Adaptation contract (read before every task)

1. Read the named source template file fully. Preserve its sections, rules and tone. Only mechanics change.
2. Substitute stack mechanics per S3. Never keep "NestJS", "Nest module", `@Inject`, `main.ts` +
   `app.module.ts` untouched; never add Nest as a fact.
3. Replace template example paths (`src/features/...`, commands/queries folders) with the real
   repository shape: `packages/app/src/<feature>/<feature>.ts`, `<feature>/postgres.ts`,
   `packages/app/src/routes/<area>.ts`, `packages/domain/src/<feature>.ts`, `packages/portal/src/`.
4. Real commands only, exactly as in `package.json`: `pnpm -r typecheck`, `pnpm -r lint`, `pnpm -r build`,
   `pnpm -r test`, `pnpm test:e2e`, `pnpm db:migrate`. No invented script.
5. No scaffolding claims: these are rules, not proof of enforcement (S5).
6. Keep Markdown links relative and working. Add no secret, connection string or business requirement.
7. English prose; an owner quote stays exactly as written.

## Log

L1 (verbatim): "vamos a hacer una cosa, aunque choque con el harness mira este repo https://github.com/ipepio/dev-templates no deja de ser un contrato para documentos y que agentes trabajen. aplica el contacto al repositorio y orquesta a un subagente de qwen3.6 con tareas muy atomicas para migrar el repositorio a dicha arquitectura. Trato? Después ya terminaremos la feature a mdeio hacer y verificaremos el build, pero lo primero te diría que sea eso"

L2 (decision): the repo is Fastify, the template baseline is NestJS. Substitution, not redesign:
existing code, packages and ADRs are the base. Recorded as ADR 0056 instead of rewriting code.

L3 (decision): `docs/architecture.md` stays where it is instead of moving to
`docs/architecture/overview.md`. It is already linked from `CONTEXT.md`, `docs/specs/000-*` and the
backlog, and S2 says existing project material is indexed, not rewritten. `CONTENTS.md` and
`docs/project-context.md` index it as the architecture overview.
