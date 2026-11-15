# Agent working contract

This file is the entry point for AI-assisted work in this repository. Adapt to the architecture
documented here; do not redesign it to match an agent's preferred framework, folder layout or
dependency stack. The rules below describe how work is routed and verified; they are not scaffolding
and reading them does not authorize generating an application, installing a dependency or running a
migration.

## Start here

1. Read the project request and this file.
2. Read [project context](docs/project-context.md) and the feature specification under
   [docs/specs/](docs/specs/) before implementation.
3. Read [architecture and placement](docs/architecture/structure.md).
4. Read the task-relevant guide below and [docs/AGENTS.md](docs/AGENTS.md), if present.
5. Read accepted [ADRs](docs/adr/README.md) and [docs/preferences.md](docs/preferences.md).
6. Inspect a neighboring implementation. Preserve its contract unless the requested change alters it.

| Task | Required guide |
| --- | --- |
| HTTP endpoint or external contract | [REST](docs/architecture/rest.md) |
| Command, use case or business rule | [Feature patterns](docs/architecture/features.md) |
| SQL, repositories or transactions | [Persistence](docs/architecture/persistence.md) |
| External API, common infrastructure or wiring | [Shared and gateways](docs/architecture/shared.md) |
| Naming, types, errors or configuration | [Conventions](docs/architecture/conventions.md) |
| Verification | [Testing](docs/architecture/testing.md) |
| Delivery, documentation or an architectural exception | [Workflow](docs/architecture/workflow.md) |

## Fixed baseline

- Fastify 5 for the application shell; business logic must not depend on Fastify.
- Zod validation at the boundary; REST with OpenAPI when exposing an HTTP API.
- PostgreSQL for this repository; direct SQL through `pg`, **no ORM**.
- Explicit repository contracts for the application's own database; gateways for external systems.
- Feature-based organization: per-feature modules under `packages/app/src/<feature>/` implementing
  domain interfaces from `packages/domain/src/<feature>.ts`.
- Route handlers in `packages/app/src/routes/<area>.ts`; raw SQL in `<feature>/postgres.ts`.
- TypeScript ESM/NodeNext; pnpm workspace; React 19 portal in `packages/portal/src/`.
- No PMS, POS, Oracle or other industry assumptions in the baseline.

These choices come from the owner's decisions and the adopted `ipepio/dev-templates` contract, adapted
to this stack in ADR 0056. Fastify replaces the template's NestJS assumption; PostgreSQL through `pg`
without an ORM is the owner's decision recorded in ADR 0003 of that contract and already implemented
here. Do not present an adapted default as reverse-engineered behavior.

## Dependency rules

```text
Fastify route handler / event consumer / scheduled adapter (zod-validated)
                         |
                         v
                  use case
                         |
                         v
             domain + repository/gateway contracts
                         ^
                         |
        SQL repository / external API gateway implementations

pnpm workspace package = composition root that wires these objects
```

- Route handlers never access SQL, the connection pool or external HTTP clients directly.
- Use cases never import transport DTOs, driver types or Fastify HTTP decorators.
- Domain code has no Fastify, `pg`, HTTP, environment or filesystem dependencies.
- A repository owns SQL and row mapping, not the business workflow.
- A gateway owns an external system's protocol, not cross-feature business policy.
- A feature exposes intentional public use cases/contracts, not its internal repository implementation.
- Only composition modules wire concrete adapters. Avoid dependency cycles and broad internal barrels.
- Never bypass these rules with dynamic imports, path aliases, type casts or lint suppression.

## Before changing code

- Establish the requested behavior and acceptance examples. Ask only about consequential uncertainty.
- Choose the owning feature and the smallest necessary change; do not refactor unrelated code.
- Reuse the documented pattern. Do not introduce a base class, generic CRUD framework, CQRS bus,
  microservice, ORM, dependency or alternative transport without approval.
- Add only the files needed by actual behavior. The layout guide is not a checklist of empty folders.
- Document a proposed exception before implementation; an agent-authored ADR is not owner approval.

## Completion contract

For authorized implementation: verify the behavior through its public interface; cover affected
existing behavior; update OpenAPI and relevant guides when contracts change; run the project's actual
checks. Report observed results, skipped checks and blockers honestly.

No commands, CI jobs, linters, tests, dependencies, authentication or repositories exist merely because
these Markdown files describe them. Do not claim enforcement until executable checks exist and pass.
The repository has `pnpm -r typecheck`, `pnpm -r lint`, `pnpm -r build`, `pnpm -r test` and
`pnpm test:e2e`, but no architecture import check yet. A rule in these guides is only enforced when an
executable check proves it fails on a violation.
