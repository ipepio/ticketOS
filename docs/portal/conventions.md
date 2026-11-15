# Implementation conventions

Follow existing repository conventions when compatible with correctness, safety, and this contract. Do not repeat known defects for consistency. Explain necessary departures and keep their scope bounded. For UI boundaries and extraction criteria, use [component architecture](component-architecture.md).

## Changes

- Keep each change focused on requested behavior. Include related tests and documentation, not opportunistic cleanup.
- Read the implementation and direct consumers before modifying shared code.
- Preserve public interfaces unless their change is authorized; identify compatibility implications.
- Model absent, loading, failed, and successful states explicitly when relevant. Do not hide uncertainty with broad casts or disabled checks.
- Avoid unnecessary wrappers, dependencies, and generic frameworks.

## Asynchronous behavior and data

- Propagate failures deliberately; do not use async executors inside `new Promise`.
- Restore transient UI state on both success and failure.
- Validate before side effects. Rejected input must not partially mutate persistent state.
- Account for stale responses, overlapping requests, and cleanup where asynchronous lifecycle is involved.
- Prevent duplicate submissions where they can repeat a write. Do not automatically retry writes without understanding their idempotency and failure semantics.
- Do not send read-only response fields back as write payloads accidentally.
- Do not hardcode credentials or sensitive provisioning policy in browser code.

## UI work, when applicable

- Reuse the established component system and localization approach.
- Do not mutate input props or caller-owned collections unexpectedly.
- Check loading, empty, error, and success states relevant to the change.
- Preserve labels, keyboard operation, focus behavior, and responsive behavior. Use browser verification when available; report when it is not.

## Verification

Follow [verification](verification.md) for test-first applicability, shared-consumer regression checks, UI acceptance states, and the authoritative project command table. Never run a formatter or lint autofix over unrelated files. Do not use production systems or real customer data for tests.
