# Architecture decision records

ADRs record significant decisions, alternatives and consequences. They do not replace feature
specifications or tests, and creating one does not authorize implementation.

## Baseline decisions

### Product / vocabulary (0001 — 0014)

| ADR | Status | Decision |
| --- | --- | --- |
| [0001 — Domain scope and flavor priority](0001-domain-scope-and-flavor-priority.md) | Accepted | Four flavor priority: IT helpdesk A, omnichannel support D, issue tracking B, hybrid platform E |
| [0002 — Self-hosted multi-organization](0002-self-hosted-multi-organization.md) | Accepted | Self-hosted, multi-organization architecture |
| [0003 — Workspace and organization vocabulary](0003-workspace-and-organization-vocabulary.md) | Accepted | Workspace and organization as domain terms |
| [0004 — Unified internal and external requesters](0004-unified-internal-and-external-requesters.md) | Accepted | Single requester model across channels |
| [0005 — Global identities and workspace memberships](0005-global-identities-and-workspace-memberships.md) | Accepted | Global identity with workspace-scoped memberships |
| [0006 — Fixed MVP roles and capability-based authorization](0006-fixed-mvp-roles-capability-based-authorization.md) | Accepted | MVP roles with capability-based access |
| [0007 — Configurable workflows with canonical status categories](0007-configurable-workflows-with-canonical-status-categories.md) | Accepted | Configurable workflows anchored to canonical status buckets |
| [0008 — Unified ticket timeline](0008-unified-ticket-timeline.md) | Accepted | Single chronological timeline per ticket |
| [0009 — Ticket requester visibility](0009-ticket-requester-visibility.md) | Accepted | Requester-only visibility rules |
| [0010 — One active queue per ticket](0010-one-active-queue-per-ticket.md) | Accepted | Single active queue model |
| [0011 — Single agent assignee](0011-single-agent-assignee.md) | Accepted | One assignee at a time per ticket |
| [0012 — MVP portal and email channels](0012-mvp-portal-and-email-channels.md) | Accepted | Web portal and email as MVP channels |
| [0013 — Email addresses route to workspace queues](0013-email-addresses-route-to-workspace-queues.md) | Accepted | Email-to-queue routing by address |
| [0014 — Email-initiated requester provisioning](0014-email-initiated-requester-provisioning.md) | Accepted | Auto-provisioning on first email |

### Queue and SLA (0015 — 0019)

| ADR | Status | Decision |
| --- | --- | --- |
| [0015 — Secure email reply threading](0015-secure-email-reply-threading.md) | Accepted | Secure threading via encrypted IDs |
| [0016 — Queue and priority SLA policies](0016-queue-and-priority-sla-policies.md) | Accepted | Per-queue per-priority SLA |
| [0017 — Canonical SLA clock semantics](0017-canonical-sla-clock-semantics.md) | Accepted | Unified SLA clock rules |
| [0018 — Workspace-configurable ticket priorities](0018-workspace-configurable-ticket-priorities.md) | Accepted | Workspaces define their own priority list |
| [0019 — Queue-selected business calendars](0019-queue-selected-business-calendars.md) | Accepted | SLA clocks follow per-queue business calendars |

### Forms and automation (0020 — 0024)

| ADR | Status | Decision |
| --- | --- | --- |
| [0020 — Configurable ticket forms](0020-configurable-ticket-forms.md) | Accepted | Workspace-level form builder |
| [0021 — Versioned ticket forms](0021-versioned-ticket-forms.md) | Accepted | Forms versioned per ticket instance |
| [0022 — Bounded workspace automation rules](0022-bounded-workspace-automation-rules.md) | Accepted | Automations scoped to workspace |
| [0023 — Controlled automation cascades](0023-controlled-automation-cascades.md) | Accepted | Cascade limits and ordering |
| [0024 — Workspace knowledge base](0024-workspace-knowledge-base.md) | Accepted | Shared knowledge base per workspace |

### Storage / retention / audit (0025 — 0027)

| ADR | Status | Decision |
| --- | --- | --- |
| [0025 — Secure pluggable attachment storage](0025-secure-pluggable-attachment-storage.md) | Accepted | Pluggable, permission-checked storage |
| [0026 — Workspace data retention and legal holds](0026-workspace-data-retention-and-legal-holds.md) | Accepted | Retention schedules with legal hold |
| [0027 — Installation-wide audit log](0027-installation-wide-audit-log.md) | Accepted | Immutable, installation-wide audit log |

### Platform and stack (0028 — 0036)

| ADR | Status | Decision |
| --- | --- | --- |
| [0028 — Modular monolith with worker](0028-modular-monolith-with-worker.md) | Accepted | Frontend + backend server + separate worker |
| [0029 — AGPL license](0029-agpl-license.md) | Accepted | AGPL-3.0 licensing |
| [0030 — TypeScript primary language](0030-typescript-primary-language.md) | Accepted | TypeScript with strict mode |
| [0031 — React, Vite and Fastify](0031-react-vite-and-fastify.md) | Accepted | React 19 + Vite for portal; Fastify 5 for API |
| [0032 — PostgreSQL shared schema with RLS](0032-postgresql-shared-schema-with-rls.md) | Accepted | Single schema, row-level security for multi-tenancy |
| [0033 — Magic link and OIDC authentication](0033-magic-link-and-oidc-authentication.md) | Accepted | Magic link for end-users; OIDC for workspaces |
| [0034 — Installation IDPs workspace-enabled](0034-installation-idps-workspace-enabled.md) | Accepted | Installation-level SAML/OIDC with workspace mapping |
| [0035 — Versioned REST API and signed webhooks](0035-versioned-rest-api-and-signed-webhooks.md) | Accepted | REST API versioning; HMAC-signed webhooks |
| [0036 — PostgreSQL job queue and transactional outbox](0036-postgresql-job-queue-and-transactional-outbox.md) | Accepted | DB-backed job queue; outbox pattern for reliability |

### Observability and search (0037 — 0042)

| ADR | Status | Decision |
| --- | --- | --- |
| [0037 — i18n: Spanish and English](0037-i18n-spanish-and-english.md) | Accepted | i18n support for es and en locales |
| [0038 — OpenTelemetry observability](0038-opentelemetry-observability.md) | Accepted | OTel traces, metrics, and logs |
| [0039 — User-configurable notifications](0039-user-configurable-notifications.md) | Accepted | Per-user notification preferences |
| [0040 — PostgreSQL full-text search](0040-postgresql-full-text-search.md) | Accepted | PG native FTS for ticket search |
| [0041 — MVP ITSM incident request catalog](0041-mvp-itsm-incident-request-catalog.md) | Accepted | ITSM-style request catalog as MVP |
| [0042 — Configurable ticket types with ITSM categories](0042-configurable-ticket-types-with-itsm-categories.md) | Accepted | Ticket types mapped to ITIL categories |

### Approvals / reporting / realtime (0043 — 0047)

| ADR | Status | Decision |
| --- | --- | --- |
| [0043 — Catalog item approval policies](0043-catalog-item-approval-policies.md) | Accepted | Configurable approval chains |
| [0044 — Approval step strategies](0044-approval-step-strategies.md) | Accepted | Parallel and serial approval modes |
| [0045 — Catalog item SLA activation](0045-catalog-item-sla-activation.md) | Accepted | SLA starts on approval trigger |
| [0046 — Authorized workspace reporting](0046-authorized-workspace-reporting.md) | Accepted | Role-scoped reporting |
| [0047 — SSE realtime portal updates](0047-sse-realtime-portal-updates.md) | Accepted | Server-sent events for live portal |

### Delivery and security (0048 — 0053)

| ADR | Status | Decision |
| --- | --- | --- |
| [0048 — Phased delivery roadmap](0048-phased-delivery-roadmap.md) | Accepted | Phased release across MVP → production |
| [0049 — Security and queue access baseline](0049-security-and-queue-access-baseline.md) | Accepted | Minimum security and queue-permission rules |
| [0050 — Ticket operational defaults](0050-ticket-operational-defaults.md) | Accepted | Default values for status, priority, assignee |
| [0051 — Portable email adapters and intake quarantine](0051-portable-email-adapters-and-intake-quarantine.md) | Accepted | Pluggable email intake with quarantine |
| [0052 — Self-hosted distribution and recovery](0052-self-hosted-distribution-and-recovery.md) | Accepted | Backup, restore and export tooling |
| [0053 — Testing and delivery strategy](0053-testing-and-delivery-strategy.md) | Accepted | Vitest unit/integration + Playwright E2E; manual staging sign-off |

### Policy defaults and toolchain (0054 — 0055)

| ADR | Status | Decision |
| --- | --- | --- |
| [0054 — MVP policy defaults](0054-mvp-policy-defaults.md) | Accepted | Default policies before workspace customization |
| [0055 — TypeScript development toolchain baseline](0055-typescript-development-toolchain.md) | Accepted | pnpm monorepo, TS strict, Vitest, Playwright, Kysely, SQL migrations |

Baseline records preserve the agreed direction; details in the linked guides operationalize it.
Application-specific choices not made by the owner remain open in [project context](../project-context.md).
No executable implementation is implied by accepted documentation.

## Lifecycle

1. Copy [the ADR template](../templates/adr.md) to the next unused `NNNN-short-decision.md`.
2. Keep status `Proposed` while a consequential decision is unresolved. Include alternatives and costs.
3. Record explicit owner acceptance before relying on an architectural exception or business choice.
4. Link accepted records from the feature specification/local instructions and this index.
5. To change an accepted decision, create a successor and mark the predecessor superseded with a link.
   Preserve the historical reasoning; do not silently rewrite it to match current code.

Use ADRs for significant business policy or architectural trade-offs. Routine behavior belongs in
specifications/tests; routine use of an existing pattern does not require another ADR. A business ADR
cannot implicitly authorize changing the global architecture, dependencies or persistence strategy.
