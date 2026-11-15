# PostgreSQL without an ORM

Use `pg` behind explicit feature repository contracts. SQL and driver details do not escape the
persistence boundary. This is a documented baseline, not an installed database implementation.

The repository already enforces these rules: no ORM, `pool.query` with `$n` parameters, and one
shared pool. Kysely is used only for `kysely-codegen` type generation, not as a query builder.

## Contract versus implementation

| Contract | PostgreSQL implementation |
| --- | --- |
| Business-intent methods such as `findByExternalId` | Parameterized SQL and connection handling |
| Domain/application inputs and outputs | Row types, column casing and row-to-domain conversion |
| Explicit missing-record behavior | Translate zero rows to the contract's missing value |
| Expected application conflicts | Translate only identified PostgreSQL constraints |
| No driver, SQL or Fastify types | Own the `pg` dependency |

Avoid `BaseRepository<T>` APIs that expose arbitrary filters, SQL execution or the underlying pool.
Do not return `QueryResult`, persistence rows or mutable driver objects to use cases.
Read projections are allowed when intentional: name and type them as application results rather
than leaking raw rows.

Domain interfaces live in `packages/domain/src/<feature>.ts`. Repository implementations live in
`packages/app/src/<feature>/postgres.ts`. The connection pool is created once in
`packages/app/src/db/connection.ts`. Route handlers live in `packages/app/src/routes/<area>.ts`.

## Query rules

- Bind all values using parameters (`$1`, `$2`, ...); never interpolate user values into SQL.
- Identifiers and sort directions cannot be value parameters. Map public sort keys through a fixed
  allowlist, and reject unsupported keys. Never accept a raw table/column/expression from a request.
- Select explicit columns. Bound collection sizes and define deterministic ordering, including a
  tie-breaker for pagination. Avoid unbounded queries and per-row network/database loops.
- Let unique/foreign-key/check constraints enforce integrity. A pre-insert lookup cannot guarantee
  uniqueness under concurrency.
- Translate a duplicate violation only when both its code and the intended constraint match.
  Unexpected constraints and connectivity errors are not silently converted to business conflicts.
- Review indexes against actual query predicates; do not create indexes speculatively.

## Mapping and values

SQL columns may use snake_case; application/domain fields use camelCase. Map explicitly.
PostgreSQL `bigint`/`numeric` may be returned as strings: do not coerce blindly into a JavaScript
number or change global parsers without auditing precision. Represent money with an explicit currency
and exact amount strategy; do not use floating-point arithmetic for exact monetary calculations.

Use `timestamptz` for instants and retain timezone/calendar information separately when the domain
needs it. A local date, such as a birthday, is not automatically a UTC instant. Decide semantics in
the feature specification, not through whatever conversion a driver happens to perform.

Every row table carries a `workspace_id` column. Row-level security on those columns is defense in
depth. Picking rows without a Workspace predicate is a defect even when RLS hides the row in tests.
Repository contracts and query predicates must always include the Workspace filter.

## Connections and transactions

- Configure one managed pool per application instance in `packages/app/src/db/connection.ts`;
  validate its settings, use bounded timeouts and close it during shutdown.
- Repository operations normally acquire connections through that infrastructure.
- A multi-operation transaction must use one checked-out client for `BEGIN`, all operations,
  `COMMIT`/`ROLLBACK`, with release in `finally`. Never scatter transaction queries across
  `pool.query`.
- Keep the application transaction contract driver-free. Use a narrow transaction runner that
  supplies the necessary repository contracts; do not introduce it for a single atomic statement.
- Preserve the original failure if rollback also fails. Do not keep a transaction open while waiting
  for an unrelated remote API call.
- Define isolation/locking/retry behavior only when required. Retries must be bounded and replay-safe.
- The Worker consumes the outbox table using `SELECT ... FOR UPDATE SKIP LOCKED` (ADR 0036). A
  transaction must never stay open across an adapter HTTP call.

## Schema changes

Migration files are append-only, versioned SQL. Applied migrations are immutable; corrections get a
new migration. No automatic schema synchronization and no migrations during ordinary application
startup. Production migrations are an explicit deployment step with operator-controlled credentials.

The migration runner lives at `packages/app/src/db/migrate.ts` and applies `migrations/NNN_*.sql`
files against the shared pool. When implementation is requested, select a migration runner with
version history, drift checks and serialization of concurrent migration runs. Document transactional
and nontransactional limitations. Do not invent a hand-built migration framework by default.
Destructive changes require explicit approval, data/backfill planning and a recovery strategy; a
`down` file is not proof of reversibility.

## Verification

Test repositories against an isolated real PostgreSQL database/schema, including constraint and
transaction behavior. Mocking `pg.query` verifies call construction, not SQL correctness. Never
truncate shared or production data for a test. Require an explicit test connection and isolation
before any setup or cleanup; missing PostgreSQL means integration checks are unavailable, not passed.

Run `pnpm -r test` for unit and integration tests. The e2e database runs on port 15433.
