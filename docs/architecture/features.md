# Feature and use-case patterns

A feature owns its business language, invariants, use cases and adapters. Keep this ownership visible
instead of spreading business logic through route handlers, SQL queries or shared helpers.

## Commands and queries

- A command performs a business write; a query reads without changing business state.
- Each exposes one operation named for its intent, such as `createTicket` or `getTicket` on the ticket
  feature module. These names are examples, not a requirement to add a tickets feature.
- Constructors receive collaborators explicitly, supplied by `packages/app/src/app.ts` wiring.
  Do not locate them through a global registry, environment variables or a service locator.
- Inputs use camelCase and application types, not Fastify request objects or SQL rows.
- The use case coordinates domain rules, repository calls and required external operations.
- Return application/domain values. The route handler maps them to REST response contracts.
- Do not add a command bus, event bus or CQRS library merely to use command/query terminology.

## Domain rules

Put invariants close to the owning concept. Use a focused policy when the rule spans domain objects.
Do not duplicate the rule in REST validation, a repository and a scheduled job.

Transport validation checks shape and syntax; the domain enforces business validity. Database
constraints protect stored integrity, including concurrent writes. These protections complement each
other rather than replacing each other.

Define updates deliberately: omitted, `null`, empty string and empty array are not interchangeable.
Specify the intended effects and test them before changing a mapper or persistence query.

Compare value objects by value (`equals()` or their canonical value), never by object identity.
Compare dates by the intended instant/calendar meaning, not reference equality. Avoid ad hoc
`JSON.stringify` comparisons for nested business state.

## Errors

Use named application/domain errors for expected failures. They do not import HTTP status codes,
Nest exceptions or PostgreSQL error objects. A boundary adapter translates them for REST or another
transport. Unknown infrastructure failures remain unexpected failures, not misleading business errors.

At the route handler, translate domain errors to Fastify HTTP errors (4xx / 5xx). Do not nest
exceptions outside the handler layer.

Keep error messages useful but exclude secrets and internal SQL details. Machine-readable error codes
are part of the external contract and must remain stable unless a change is authorized.

## Write boundaries

State the atomicity requirement in the feature specification. A repository method must not secretly
commit one part of a larger workflow. If multiple writes must succeed together, use one explicit
transaction boundary with the same connection; see [persistence](persistence.md).

A PostgreSQL transaction cannot atomically cover an external API call. Do not claim it can. If the
business requires reliable coordination, propose the failure semantics and a specific solution in
an ADR instead of automatically adding distributed transactions or an outbox. This repository already
has a transactional outbox in `packages/app/src/db/outbox.ts` and ADR 0036 governs it.

## Adding a feature

1. Name the owner and document behavior using the [feature specification](../templates/feature-spec.md).
2. Define inputs, outputs, errors and repository/gateway contracts needed by that behavior.
3. Implement the smallest use case and tests, then its transport and infrastructure adapters.
4. Wire real instances in `packages/app/src/app.ts` and register the route from
   `packages/app/src/routes/<area>.ts`.
5. Add local instructions only for feature-specific invariants; use the
   [feature AGENTS template](../templates/feature-agents.md), not a copy of all global rules.
