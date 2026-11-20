# Verification and future enforcement

This repository is a real monorepo. Each package has `vitest` as its test runner, e2e specs are
written with Playwright, and the project root exposes `pnpm -r typecheck`, `pnpm -r lint`,
`pnpm -r build`, `pnpm -r test` and `pnpm test:e2e` as workspace-wide commands. The CI workflow
at `.github/workflows/ci.yml` runs typecheck, lint, unit tests, e2e tests and build on every
push and pull request. The rules below specify what each layer must provide; they are not
exhaustive but are the architectural baseline an authorized change must satisfy.

## Test the responsibility

| Check | Evidence it must provide |
| --- | --- |
| Domain/use-case tests | Business rules, outputs, errors and exact intended side effects |
| Mapper tests | Contract casing, optional/null fields and value conversion |
| Repository integration | Real SQL, constraints, mapping, ordering and transaction atomicity |
| Gateway tests | Outgoing contract, external failures and response validation |
| REST/e2e tests | Input validation, status/body/headers, error format and access policy |
| Fastify app composition test | `buildApp()` registers every route and a request round-trips |
| Architecture checks | Forbidden dependencies actually fail, not just clean code passing |

Prefer deterministic tests at the nearest useful public boundary. Mock repository/gateway contracts
for use-case tests, not their implementation internals. Inject time/ID sources when determinism needs
them; do not invent wrappers for every standard-library call.

Unit tests are colocated with the module under the same directory as `*.test.ts` and run with
`pnpm -r test` through vitest at each package.

For behavior changes, observe a failing regression test before the fix when meaningful, then the
passing test and relevant existing tests. Include rejection behavior and assert that invalid input
has not performed prohibited writes. Avoid tests that only repeat implementation details.

## Database safety

Use a dedicated PostgreSQL test database or isolated schema with an explicitly supplied test
connection. Confirm isolation before setup/cleanup. Never infer that an arbitrary `DATABASE_URL` is
safe to truncate. Close pools and clean only resources the test owns. Missing database access must
be reported as missing integration evidence, not hidden with skipped tests counted as success.

The e2e suite runs against an isolated test database on port 15433 with the application on port 3021.
CI provisions a separate PostgreSQL service container per job for unit and e2e tests and never
reuses the development database.

## Architecture acceptance checks

`pnpm check:arch` runs `scripts/check-architecture.ts` (via `tsx`, no new dependencies). It reads
`packages/*/src/**/*.ts` and `.tsx` production sources (colocated `*.test.ts` files are not part of
the shipped dependency graph), resolves every import from the TypeScript AST to an absolute file —
relative paths, `@ticketos/*` workspace package names and their `exports`, and tsconfig `paths`
aliases — and then applies the rules below. Dynamic `import()`, `export ... from` and
`import x = require(...)` are included, so aliases, re-exports and package names cannot hide a
violation. Each violation prints as `file:line [rule] reason` and the command exits 1; on success it
prints a one-line summary and exits 0. The CI job `architecture-checks` in
`.github/workflows/ci.yml` runs `pnpm install --frozen-lockfile` and then `pnpm check:arch`.

`scripts/arch-fixtures/` holds two miniature monorepos: `clean/` must report zero violations, and
`violating/` carries one deliberately violating file per boundary (including alias, re-export and
dynamic-import bypass attempts) that must be reported. `scripts/check-architecture.test.ts` proves
both, materializing the fixture sources in a temp directory and asserting the exact violations:

```bash
pnpm --filter @ticketos/app exec vitest run --root ../.. --globals scripts/check-architecture.test.ts
```

- Domain must not import Fastify, `pg`, HTTP clients, configuration or infrastructure.
- Commands/queries must not import route handlers, transport DTOs or concrete SQL/gateway adapters.
- Route handlers must not import `postgres.ts` or the connection pool.
- `pg` imports stay in `<feature>/postgres.ts` and `db/`.
- Detect cycles and unresolved imports; check alternative paths and aliases as well as package names.

Use one coherent enforcement mechanism with resolved-path coverage. A few fragile relative-import
patterns are not proof of layer protection. Test that deliberately violating each boundary fails.

## CI and completion

The CI workflow at `.github/workflows/ci.yml` runs typecheck, lint, unit tests, e2e tests and build
on every push and pull request to `main`. Database changes need migration proof via
`pnpm db:migrate`; authentication changes need access-control proof. Do not add unrelated
infrastructure.

Pin tool/runtime versions and commit the package-manager lockfile when setup is authorized. Record
actual script names in [project context](../project-context.md); do not assume commands exist because
the monorepo uses pnpm.

Coverage can reveal gaps but does not prove requirements. Thresholds must be agreed and actually
executed in CI before being claimed as enforced. Do not copy unreachable thresholds or hide missing
tests behind `--passWithNoTests` as a quality guarantee.

Delivery of new tests and architectural rules follows ADR 0053. For Markdown-only changes, verify
links, consistency, scope and any examples that are executable. Do not install a test stack to
validate prose. Report precisely what ran and what did not.
