# Feature — Architecture import checks (no new dependencies)

Close finding F3 of docs/project-status.md: the documented dependency rules have no executable
enforcement. Per the repo contract, an authorized task may introduce one coherent mechanism —
hand-rolled, zero new dependencies. Also closes the stale project-status findings (F1, F2, F4
resolved by earlier work).

## Specs

S1 (docs/architecture/testing.md, verbatim — the rules to enforce): "Domain must not import
Fastify, `pg`, HTTP clients, configuration or infrastructure." / "Commands/queries must not
import route handlers, transport DTOs or concrete SQL/gateway adapters." / "Route handlers must
not import `postgres.ts` or the connection pool." / "`pg` imports stay in `<feature>/postgres.ts`
and `db/`." / "Detect cycles and unresolved imports; check alternative paths and aliases as well
as package names."

S2 (docs/architecture/testing.md, verbatim — the enforcement standard): "Use one coherent
enforcement mechanism with resolved-path coverage. A few fragile relative-import patterns are
not proof of layer protection. Test that deliberately violating each boundary fails."

S3 (repo contract, verbatim from AGENTS.md): "Never bypass these rules with dynamic imports,
path aliases, type casts or lint suppression."

S4 (docs/project-status.md findings): F1 (README misstates implementation state — resolved by
the dev-template adoption), F2 (unfinished admin feature, uncommitted — resolved: merged to
master), F4 (no git remote — resolved: origin configured and pushed) must read as resolved with
their evidence; the findings table must reflect the current truth.

## Tasks

| ID | Spec | Route | Commit |
| --- | --- | --- | --- |
| T1 | S1, S2, S3 | worker: hand-rolled import checker script (resolved paths, cycles, negative fixtures) + package script + CI wiring | 434033f (checker + fix-now refactor) |
| T2 | S4 | parent inline: project-status findings closure | 99a5a4a |

## Log

L1 (verbatim): "organiza un goal para hacer todas las features pendientes, y orquestalo todo. El desarrollo que sea todo con deepseek-v4-flash o hy4-flash ambos de nan.builders, vale?"

L2 (owner decisions, 2026-11-20): (1) dev S3 service is SeaweedFS, not MinIO (Docker Hub pull blocked;
owner selected from local images) — recorded in odd/tasks/attachments-storage.md L3. (2) "Arreglarlo
ahora": the checker's 14 real runtime violations were fixed in code, not baselined.

L3 (T1 evidence): checker (scripts/check-architecture.ts, TS compiler API, zero deps) enforces every S1
rule with resolved-path coverage; 15 negative fixtures prove each boundary fails; pg-location exempts
explicit type-only imports (erased at runtime) — precision, not weakening. CI gained the
architecture-checks job and triggers now include master. The fix-now refactor: app.ts injects an
AppModules bundle into every route registration (7 cycles broken, getters removed), routes hold no pool
(admin/setup SQL into workspace/postgres.ts, /ready into db/health.ts, attachments receive the storage
module + adapter, auth receives the SMTP gateway). Final gates: check:arch 0 violations (75 files),
Playwright 57/57, app 259/259, portal 13/13, typecheck 0, lint 0, build emits. T2: project-status
findings F1-F4 closed with evidence (99a5a4a). FEATURE COMPLETE.
