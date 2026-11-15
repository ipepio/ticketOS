# Verification by change type

Select checks from the observable effects of the change, not from a fixed ritual. Record exact commands and observed results; a checklist is not execution evidence.

## Selection matrix

| Change | Applicable evidence |
| --- | --- |
| Passive documentation | Local links, paths, consistency, factual claims; no automatic application build |
| Pure logic / validation | Deterministic public-behavior tests including affected boundaries and rejected inputs |
| API / shared helper | Success and failure propagation, payload contract, direct-consumer regressions |
| Form | Invalid input, successful submit, failure recovery, loading reset, duplicate-submit prevention |
| Route / session | Direct URL load, parameter changes, redirect, relevant expired/absent session behavior |
| Async lifecycle / polling | Overlap policy, stale responses, failure recovery, cleanup |
| Shared UI | Existing consumers and prop/event/slot compatibility |
| Visual / interaction | Relevant states, keyboard, focus, accessible names, responsive behavior in a safe browser environment |

## UI states

For the modified flow, select applicable loading, empty, error/recovery, success, invalid-input, and submitting states. Not every state applies to every change. Explain meaningful exclusions; do not add unrelated features to satisfy this list.

A passing build does not prove a screen works. Browser checks complement tests and do not replace them. If the browser or required environment is unavailable, state exactly which behavior remains unverified.

## Execution rules

1. Inspect configured scripts and their side effects before running them. Obtain any required authorization for environment setup.
2. For deterministic behavior with a meaningful runner, observe a failing regression test before the fix, then a passing result. Explain when RED is not applicable or unavailable.
3. Test through public behavior. Rejected operations must preserve persistent data where the rule requires it. Use isolated state, never production or customer data.
4. Identify direct consumers before modifying shared code. Preserve existing behavior unless changing it is authorized; cover affected consumers with relevant checks.
5. Run focused checks and applicable project gates. Do not suppress failures, weaken validation, or run unrelated autofixes to get green output.
6. Inspect final changes for unrelated edits, sensitive content, and stale documentation.

## Project commands

| Purpose | Exact command | Preconditions / side effects |
| --- | --- | --- |
| Install | `pnpm install` | Needs authorization the first time; reads `pnpm-lock.yaml` |
| Focused tests | `pnpm --filter @ticketos/portal test` | vitest, no external service |
| Test suite | `pnpm -r test` | Some package suites need the test PostgreSQL instance |
| Type-check | `pnpm -r typecheck` | May generate build caches |
| Lint without fixes | `pnpm -r lint` | Must not silently rewrite source |
| Build | `pnpm -r build` | May generate artifacts |
| UI verification | `pnpm test:e2e` | App on port 3021, dockerised e2e database on port 15433 |

Never assume a script exists; re-check `package.json` when a command changes. Keep commands here as
the single source of truth, not copied into multiple documents.

## E2E browser verification

Browser verification happens through the Playwright e2e specs in `packages/tests/e2e/`. The app must be running on port 3021 and the test suite requires the dockerised e2e database. These specs exercise real routing, authentication flows, and full request/response cycles; they complement the focused unit tests that target individual components or hooks.

## Evidence report

For each executed check, report command or manual procedure, result, and relevant coverage. Classify failures as introduced, pre-existing, or unknown only when evidence supports that classification. List skipped/unavailable checks and missing proof. A required unresolved check means the task is not fully verified; report the specific blocker and decision rather than claiming completion.
