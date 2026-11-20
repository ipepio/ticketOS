# ticketOS

Open Source, self-hosted, multi-Workspace ticketing platform.

## For agents

- [Agent working contract](AGENTS.md) — required starting point.
- [Navigation & context index](CONTENTS.md) — project structure and file map.

## For humans

[Architecture](docs/architecture.md) · [Product spec](docs/specs/000-ticketos-product-spec.md) · [Backlog](docs/backlog/README.md) · [P0](docs/backlog/p0-operational-core.md) · [P1–P3](docs/backlog/p1-p3.md) · [Roadmap](docs/roadmap.md) · [Glossary](docs/glossary.md) · [ADR index](docs/adr/)

## Status

Implemented as a TypeScript modular monolith in this pnpm workspace. The operational core
(backlog P0–P3) is implemented. Browser-journey completion work is still in progress —
this is not production-ready.

## Repository layout

| Path | Purpose |
| --- | --- |
| `packages/app` | Fastify HTTP adapters, feature modules, SQL adapters, outbox |
| `packages/domain` | Framework-free domain contracts |
| `packages/portal` | React 19 portal |
| `packages/shared` | Cross-package value types |
| `packages/worker` | Outbox worker |
| `packages/tests` | Playwright end-to-end suite |
| `migrations/` | Append-only SQL migrations |

## Development

| Command | Purpose |
| --- | --- |
| `pnpm install` | Install dependencies |
| `pnpm docker:up` | Start PostgreSQL and dependencies |
| `pnpm db:migrate` | Run pending migrations |
| `pnpm dev:app` | Fastify API in dev mode |
| `pnpm dev:portal` | React portal in dev mode |
| `pnpm -r typecheck` | TypeScript check across packages |
| `pnpm -r test` | Run vitest unit tests across packages |
| `pnpm test:e2e` | Run Playwright end-to-end tests |

## First-run setup

A fresh installation has no Workspace yet, so `GET /api/setup/status` reports
`configured: false` and the portal renders a dedicated setup wizard instead of
the application shell. While setup is pending there is no Sidebar, topbar,
bottom navigation, "My Tickets", or "New Ticket": the wizard is a full-page
state, not a modal over the authenticated portal.

The wizard creates the first Workspace, its Workspace Admin, the default Inbox
queue, and the default statuses, priorities, and ticket types, then signs that
admin in with a session cookie.

Defaults come from the browser:

- **Language** — the first supported value in `navigator.languages` (`es`, `en`,
  `fr`, `de`, `pt`, `it`, `nl`, `ja`, `zh`), with English as the fallback. A
  previously chosen `ticketos-locale` value always wins over the browser
  preference, and the wizard's language selector persists the chosen value in
  `ticketos-locale` and `document.documentElement.lang`.
- **Timezone** — `Intl.DateTimeFormat().resolvedOptions().timeZone`, or `UTC`
  when the browser cannot report one. The chosen timezone seeds the default
  business calendar.

The first required field is focused on load, every field has a label, and a
failed submission is announced once with `role="alert"` without clearing the
entered values.

`packages/tests/e2e/first-run-onboarding.spec.ts` covers this state against a
disposable app instance that it starts itself (fixed `ticketos_setup_e2e`
database), so the shared e2e installation can stay configured.

## Architecture guardrails

- Build a modular monolith, not microservices.
- Test through domain-module interfaces, not internal implementation details.
- Treat Workspace isolation, RLS, authorization, Timeline immutability, and
  Attachment authorization as non-negotiable invariants.
- Follow the phase order and ADRs; add an ADR before changing an accepted
  product/security/architecture decision.

## License

Planned license: AGPL-3.0-or-later. Add the canonical license text before the
first source release.
