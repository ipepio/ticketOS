# ticketOS delivery roadmap

This roadmap preserves the accepted product design while sequencing it into
usable releases. It is intentionally capability-based rather than a file/task
list.

## P0 — Operational ticketing core

**Goal:** a self-hosted organization can receive, work, and securely resolve
Tickets through portal and email.

- Docker Compose deployment; PostgreSQL, worker, local/S3 attachment storage.
- Installation, Workspaces, Organizations, global Users and Memberships.
- Magic-link auth and OIDC; fixed MVP roles backed by Capabilities.
- Queues, Queue access, Inbox, assignment, statuses/transitions, priorities.
- Ticket creation, private/Organization visibility, immutable Timeline,
  Messages, Internal Notes, System Events, tags and Attachments.
- SMTP/IMAP email routing, signed reply correlation and Intake Quarantine.
- PostgreSQL RLS, Audit Log, basic logs/health checks, backups and restore.
- Basic agent/requester portal views and authorization-aware REST foundations.

**Exit evidence:** two Workspaces cannot access each other’s data through UI,
API, search, email, jobs, or direct RLS integration tests; an email-originated
Ticket can be assigned, replied to, resolved, backed up and restored.

## P1 — Full Service Desk

**Goal:** teams operate against commitments, automate routine work, and enable
self-service/integration.

- Business Calendars, SLA policies and breach/escalation behavior.
- Versioned Forms and configurable Ticket Types.
- Bounded Automation and controlled cascades.
- Knowledge Base, in-app/email Notifications, PostgreSQL Search, SSE.
- Versioned REST resources, service tokens, signed webhooks.
- Spanish/English UI and notification i18n.
- OpenTelemetry traces, metrics and production readiness.

**Exit evidence:** an SLA path, automation cascade, article visibility rule,
webhook retry and authorized search result are independently testable through
their module interfaces.

## P2 — Governed service operations

**Goal:** formalize high-value service fulfillment and compliance workflows.

- Service Catalog Items with Type/Form/Queue/SLA configuration.
- Ordered Approval Policies with `any-one`/`all` steps.
- Configurable reporting and CSV export.
- Retention policies, legal holds and auditable erasure/anonymization.
- Privileged-user MFA enforcement and mature administrative controls.

**Exit evidence:** an approval-gated request, its SLA activation point, report,
legal hold, and eventual retention action have end-to-end audit evidence.

## P3 — Platform expansion

**Goal:** realize the A → D → B → E product strategy without replacing the core.

- D: chat and messaging-channel adapters, unified customer-support inbox.
- B: project, backlog, board, sprint, epic, and issue-tracking modules.
- ITSM: Problem Management, Change Management and CMDB/asset modules.
- E: broader configurable workflow and role administration, informed by real
  A/D/B usage rather than speculative generalization.
