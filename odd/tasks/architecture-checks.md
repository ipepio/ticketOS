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
| T1 | S1, S2, S3 | worker: hand-rolled import checker script (resolved paths, cycles, negative fixtures) + package script + CI wiring | — |
| T2 | S4 | parent inline: project-status findings closure | — |

## Log

L1 (verbatim): "organiza un goal para hacer todas las features pendientes, y orquestalo todo. El desarrollo que sea todo con deepseek-v4-flash o hy4-flash ambos de nan.builders, vale?"
