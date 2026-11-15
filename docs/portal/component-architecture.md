# Component architecture

These are accepted template rules for new or modified UI code, not a description of an inspected project. Apply them only where relevant. Preserve the target repository's domain-oriented structure; this document does not authorize moving existing files.

## Responsibility boundaries

| Kind | Owns | May depend on | Must not own |
| --- | --- | --- | --- |
| Route view | Screen composition and coordination of its user flow | Router, domain state, services or hooks | HTTP transport implementation, unrelated operational flows |
| Domain component | A coherent business interaction | Domain models, domain rules, UI primitives | Unrelated domains or hidden global side effects |
| Shared UI component | Reusable presentation and interaction contract | Props, events, slots, established UI system | Domain stores, business services, route parameters |
| Hook or reactive controller | A cohesive reactive responsibility and its lifecycle | Required services and state | A grab bag of unrelated helpers |
| API service | Transport operations and explicit DTO mapping | Shared HTTP client, transport types | Navigation, dialogs, form loading state |
| Shared state owner | Shared state with clear ownership and a documented reset/invalidation policy | Relevant services when appropriate | Every local field or transient UI state by default |

A simple view may call a service directly. Do not require a hook, shared state owner, or class for every screen. Existing global patterns (such as the i18n context used throughout the portal) are an architectural constraint to inspect, not permission for a broad refactor.

## Placement and extraction

- Keep a domain-specific component in its domain. Promote it to shared UI only when its contract is independent of that domain and a real reuse case exists.
- Extract a component when it represents a coherent interaction with clear inputs and outputs. File length alone is not a reason.
- Extract a hook when reactive state, effects, and cleanup form a distinct responsibility. Keep pure transformations as ordinary functions.
- Separate loading, editing, dynamic fields, and operational actions when their responsibilities evolve independently. Do not split every block into a file.
- A wrapper must add a useful policy or contract; do not add a pass-through abstraction merely for consistency.
- Similar code is not necessarily the same concept. Share it only if consumers should evolve together.

Illustrative placement, not mandatory scaffolding:

```text
packages/portal/src/<domain>/
packages/portal/src/components/
```

## State ownership

- Keep visual state and simple form drafts local by default.
- Use a shared state owner (React context or a store introduced deliberately) when state must be shared or survive component unmount/remount; document its reset/invalidation policy.
- Do not maintain multiple editable copies without an explicit synchronization rule and owner.
- Distinguish API responses, editable values, and write payloads where their contracts differ.
- After a successful write, explicitly update, invalidate, or reload affected server data.

## React / TypeScript profile

- Use typed props interfaces and explicit callback props instead of emitted events; never mutate props or caller-owned objects/arrays.
- Derive values during render or with `useMemo`; use `useEffect` for effects, not to duplicate state.
- Type absent values honestly; no broad casts, no non-null assertions, no disabled compiler checks.
- Clean up timers, listeners and in-flight requests on unmount; ignore stale responses where cancellation is unavailable.
- Reload intentionally when a route parameter changes (dependency array or a `key` remount), never rely on component identity.
- No global store exists in this repository today: keep state local unless a real shared owner is introduced with its reset policy documented.

## Review checklist

For changed components, identify their category, state owner, inputs/outputs, dependencies, and applicable UI checks from [verification](verification.md). Before changing shared code, identify direct consumers and verify compatibility. If the proposed boundary conflicts with existing architecture, explain the smallest in-scope resolution rather than rewriting neighboring modules.
