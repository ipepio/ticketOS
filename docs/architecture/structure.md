# Architecture and placement

Organize by business feature, keep infrastructure behind contracts and compose dependencies in
`packages/app/src/app.ts`. The following paths describe the current placement convention, not an
instruction to create empty directories.

```text
packages/app/src/
  index.ts                      bootstrap only
  app.ts                        application composition and route registration
  config.ts                     validated technical configuration
  config-module/                configuration module
  db/                           pool, transaction plumbing, migration runner
  routes/                       Fastify route handlers, one file per area
  <feature>/                    owning module per business capability
    <feature>.ts                use-case and policy implementation
    postgres.ts                 SQL adapter implementing the domain interface
packages/domain/src/            framework-free domain contracts and invariants
packages/shared/src/            cross-package value types
packages/portal/src/            React portal
packages/worker/src/            outbox worker
migrations/                     append-only SQL schema changes
packages/*/src/**/*.test.ts     colocated vitest tests
```

A command can contain its own `.request.ts` application input alongside the command, following the
source repo. This is not a REST request DTO: it must not depend on HTTP validation decorators.

## Placement decisions

| Need | Owner |
| --- | --- |
| HTTP validation, status or response serialization | Route handler + zod schema + mapper |
| A write workflow | Feature module method |
| A read workflow | Feature module read method |
| SQL for the application's database | `<feature>/postgres.ts` |
| External REST endpoint or protocol | Gateway module (email, storage) |
| Pure conversion | Mapper; no I/O |
| Global pool/logging/configuration plumbing | `db/`, `config.ts`, `config-module/` |
| Business capability used by another feature | Owning domain contract in `packages/domain/src/` |

## Boundaries, not extra layers

Contracts live in `packages/domain/src/` while implementations stay in
`packages/app/src/<feature>/`; a route handler imports only the domain contract, never the SQL
adapter. The feature module imports the implementation to wire it. Future lint rules must
distinguish these files.

Do not add a generic `services/` bucket. A focused domain service is appropriate only when an actual
business rule does not naturally belong to a model or use case. Name it for that responsibility.

Do not force every domain model into a class: the source uses both plain types and readonly classes.
Use constructors/factories when invariants require them; preserve the neighboring feature's style.
Do not create a mapper for a conversion that does not exist or a repository for a feature with no DB.

Cross-feature calls go through an intentional public use case or contract, never another feature's
route handler, SQL adapter or internal table. Resolve cycles by clarifying ownership, not by
defaulting to a cycle-breaking wrapper or moving the code to `shared`.
