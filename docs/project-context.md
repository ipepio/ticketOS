# Project context

This file describes the target project, not the reusable architecture. Unfilled entries are unknown;
an agent must not infer that a capability, script or authorization exists.

| Field | Current value |
| --- | --- |
| Project/domain | ticketOS — open source, self-hosted, multi-Workspace ticketing platform |
| Owner and decision authority | Repository owner (`ipepio`); agents propose, the owner accepts |
| Authorized deliverable | TypeScript modular monolith in this pnpm workspace |
| Template provenance | `ipepio/dev-templates` agent-template-backend, adapted; ADR 0056 |
| Runtime/framework baseline | Node >= 22, pnpm workspace, TypeScript ESM/NodeNext, Fastify 5, zod, React 19 + Vite |
| Persistence baseline | PostgreSQL with row-level security, `pg` with raw SQL, append-only migrations |
| Exposed transports | REST through Fastify with OpenAPI; SSE for realtime; signed webhooks |
| Authentication/authorization | Magic link and OIDC; capability-based Workspace authorization; RLS as defense in depth |
| API versioning/deprecation | Versioned REST API, see ADR 0035 |
| Environment/deployment | Docker Compose, self-hosted; see ADRs 0051, 0052 |
| Existing integrations | Email intake (IMAP/SMTP), S3-compatible attachment storage |
| Data sensitivity/tenant boundaries | Workspace isolation is a hard invariant; see ADR 0032 |
| Architecture overview | `docs/architecture.md` |
| Domain language | `docs/glossary.md` is authoritative vocabulary |

## Actual verification commands

- `pnpm -r typecheck`
- `pnpm -r lint`
- `pnpm -r build`
- `pnpm -r test`
- `pnpm test:e2e` (Playwright, needs the dockerised e2e database and app on port 3021)
- `pnpm db:migrate`

No architecture lint rules exist yet.

## Feature context

Implemented feature modules: `packages/app/src/` — ticket, workflow, sla, forms, automation, approvals, catalog, knowledge-base, notifications, omnichannel, problem-change, project, reporting, retention, storage, identity, email.

Specifications under `docs/specs/`.

Accepted ADRs `docs/adr/0001`–`0055`.

Feature-local `AGENTS.md` files do not exist yet.
