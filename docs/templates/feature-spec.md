# Feature specification template

Copy to the project's chosen feature-specification location only when a real feature is requested.
Replace placeholders with explicit requirements; do not turn examples into assumed scope.

Specifications live under [docs/specs/](../specs/).

## Goal and source request

- Owner:
- Source request (verbatim):
- Expected outcome:
- Non-goals:
- Owning feature and local instructions:
- Relevant accepted ADRs:

## Behavior

For each rule, give its input/preconditions, expected output, errors and observable side effects.
Include acceptance examples and relevant boundaries. Distinguish required behavior from proposals.

- Rule:
- Successful example:
- Rejected example and unchanged state:
- Missing/omitted/null semantics:
- Timezone, identity, money or tenant semantics, if relevant:

## Contracts and boundaries

- REST resources/methods, DTOs, statuses and OpenAPI impact, if HTTP is exposed:
- Public/protected classification and resource-level access policy:
- Command/query inputs and outputs:
- Repository operations and expected missing/conflict behavior:
- External gateway operations, if any:
- Transaction/atomicity and partial-failure requirements:
- Retry/idempotency requirements, if any:
- Compatibility and migration impact:

## Implementation and proof

- Minimal affected paths: domain interface in `packages/domain/src/<feature>.ts`, repository in
  `<feature>/postgres.ts`, route handler in `packages/app/src/routes/<area>.ts`, feature module in
  `packages/app/src/<feature>/<feature>.ts`:
- Tests per rule and affected existing behavior:
- Safe isolated database setup, if applicable:
- Actual verification commands: `pnpm -r test` for unit/integration; `pnpm test:e2e` for end-to-end:
- Documentation updates:
- Observed results and unavailable checks:

## Open decisions

Record the specific unresolved question, consequence, owner and resolution. Do not implement a
consequential assumption as if it had already been approved.
