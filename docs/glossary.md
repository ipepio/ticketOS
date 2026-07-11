# Glossary — ticketOS

> Domain vocabulary for the ticketing portal. Terms are added as decisions are
> confirmed during the grilling session. Use these terms exactly; don't
> substitute synonyms.

| Term | Definition | Status |
| ---- | ---------- | ------ |
| _Ticket_ | The Workspace-owned unit of work: Type, Priority, requester visibility, Queue, optional Assignee, versioned Form answers, and immutable Timeline. | accepted |
| _Flavor_ | A product variant of ticketOS: Helpdesk (A), Omnichannel (D), Issue tracking (B), Hybrid (E). See ADR 0001. | accepted |
| _Spine_ | The generic ticket + configurable-workflow core that all flavors compose onto. See ADR 0001. | accepted |
| _Workspace_ | The top-level isolated and independently administered unit within an installation. It owns tickets, configuration, agents, workflows, and permissions. See ADR 0003. | accepted |
| _Organization_ | A group of customer/requester Users within a Workspace; it is not a data-isolation unit. A Workspace can serve many Organizations. See ADR 0003. | accepted |
| _Installation_ | One self-hosted deployment of ticketOS, which can contain multiple Workspaces. See ADR 0002. | accepted |
| _Requester_ | A User seeking help through a Ticket. Requesters may be internal to the Workspace operator or external customers; both use the same core model. See ADR 0004. |
| _User_ | A globally authenticated person within an Installation. A User has no implicit access to a Workspace. See ADR 0005. | accepted |
| _Workspace Membership_ | A User's explicit access grant to one Workspace, carrying their role and permissions there. See ADR 0005. |
| _Capability_ | A named authorization action evaluated by ticketOS. Roles map to capabilities; checks do not depend directly on role names. See ADR 0006. | accepted |
| _Agent_ | A Workspace Member whose role grants capabilities to work on Tickets. | accepted |
| _Status_ | A Workspace-configured named point in a Ticket workflow. Every Status belongs to one Status Category. See ADR 0007. | accepted |
| _Status Category_ | Canonical Ticket lifecycle semantics: `Open`, `Pending`, `Resolved`, or `Closed`. The core relies on categories, not Workspace-specific status names. See ADR 0007. | accepted |
| _Transition_ | A permitted change from one Status to another within a Workspace workflow. See ADR 0007. | accepted |
| _Timeline_ | The immutable, ordered history owned by one Ticket. It contains Messages, Internal Notes, and System Events. See ADR 0008. | accepted |
| _Message_ | A requester-visible Timeline entry carrying inbound or outbound communication through a channel. See ADR 0008. | accepted |
| _Internal Note_ | An agent-only Timeline entry; it is never visible to Requesters. See ADR 0008. | accepted |
| _System Event_ | An immutable Timeline entry recording an operational fact such as assignment, status change, or automation. See ADR 0008. | accepted |
| _Follower_ | A User explicitly granted requester-facing access to a private Ticket. See ADR 0009. | accepted |
| _Private Ticket_ | A Ticket visible to its Requester, Followers, and authorized Agents only. This is the default requester-audience visibility. See ADR 0009. | accepted |
| _Organization-visible Ticket_ | A Ticket also visible to eligible members of the Requester’s Organization. See ADR 0009. | accepted |
| _Queue_ | The single active routing and operational ownership scope for a Ticket within a Workspace. A Ticket may move between Queues but cannot be in several at once. See ADR 0010. | accepted |
| _Inbox_ | The initial Queue for untriaged Tickets. See ADR 0010 and ADR 0050. | accepted |
| _Assignee_ | The optional individual Agent who has taken operational responsibility for a Ticket. It is distinct from the responsible Queue. See ADR 0011. |
| _Channel_ | The medium through which a Message enters or leaves a Ticket. The MVP supports the web portal and email. See ADR 0012. |
| _Email Address_ | A configured inbound address belonging to one Workspace and routing new email Tickets to one Queue. See ADR 0013. |
| _Magic Link_ | A passwordless, time-limited email link used to verify a User identity and grant portal access. See ADR 0014. | accepted |
| _Unverified User_ | A User provisioned from an inbound email sender before verifying control of that address. It has minimum requester access only. See ADR 0014. |
| _Correlation Token_ | An opaque, signed, expiring token in an outbound email Reply-To address that securely links a reply to a Ticket. See ADR 0015. |
| _SLA Policy_ | A Queue- and priority-selected policy that calculates first-response and resolution commitments using a business calendar. See ADR 0016. | accepted |
| _First-response target_ | The SLA deadline for the first qualifying Agent response to a Ticket. See ADR 0016. | accepted |
| _Resolution target_ | The SLA deadline by which a Ticket must be resolved. Time accrues in `Open`, pauses in `Pending`, and completes in `Resolved`/`Closed`. See ADR 0017. | accepted |
| _Qualifying first response_ | The first requester-visible Message authored by an Agent; it completes the first-response SLA target. See ADR 0017. |
| _Priority_ | One ordered, Workspace-configured urgency level assigned to every Ticket and used to select an SLA Policy. See ADR 0018. |
| _Business Calendar_ | A Workspace-reusable definition of timezone, working hours, holidays, and exceptions. Queues select one for SLA calculation. See ADR 0019. |
| _Field_ | A reusable Workspace-configured, typed data definition used in Ticket Forms. See ADR 0020. | accepted |
| _Ticket Form_ | A configured composition of Fields used to collect typed answers when creating a Ticket. See ADR 0020. |
| _Form Version_ | The immutable published definition of a Ticket Form used by a Ticket at creation time. See ADR 0021. |
| _Automation Rule_ | A Workspace-configured, bounded event–condition–action rule applied to Tickets by the Automation module. See ADR 0022. |
| _Automation Cascade_ | A bounded causal chain in which automation-caused Ticket events may trigger further eligible rules. See ADR 0023. |
| _Knowledge Base_ | The Workspace-owned collection of categorized support Articles. See ADR 0024. | accepted |
| _Article_ | A draft or published Knowledge Base entry with an explicit `internal`, `authenticated`, or `public` audience. See ADR 0024. |
| _Attachment_ | A protected file on a Message, Internal Note, or Article. Its content is stored outside the database via an S3-compatible or local-volume adapter. See ADR 0025. |
| _Retention Policy_ | A Workspace-configured schedule governing archival and deletion/anonymization of Tickets, Timeline content, Attachments, and derived data. See ADR 0026. | accepted |
| _Legal Hold_ | A hold on a Ticket/case that prevents retention purge until released. See ADR 0026. |
| _Audit Log_ | The Installation-wide append-only record of security, permission, configuration, and domain actions outside or alongside Ticket Timelines. See ADR 0027. |
| _Modular Monolith_ | One deployable application plus a worker, organized as deep domain modules with deliberate internal seams. See ADR 0028. |
| _AGPL-3.0-or-later_ | The project license requiring source availability for modified versions offered over a network. See ADR 0029. |
| _Domain Module_ | A deep module implementing one cohesive domain concern behind a framework-independent interface. See ADR 0028 and ADR 0030. |
| _HTTP Adapter_ | The Fastify layer that translates HTTP requests into calls to domain-module interfaces. See ADR 0031. |
| _Row-Level Security (RLS)_ | PostgreSQL policy enforcement that restricts Workspace-owned rows to the active Workspace context as defense in depth. See ADR 0032. |
| _Identity Provider (IdP)_ | An external OIDC/OAuth 2.0 provider through which a User can authenticate. It is configured at Installation scope and enabled per Workspace. See ADR 0034. |
| _Service Token_ | A non-human credential scoped to one Workspace and explicit Capabilities for API integration. See ADR 0035. | accepted |
| _Webhook_ | A signed, asynchronous outgoing notification of a ticketOS domain event to an external consumer. See ADR 0035. |
| _Transactional Outbox_ | Records pending domain events in the same PostgreSQL transaction as the state change, so the worker can reliably enqueue/process them. See ADR 0036. |
| _Locale_ | A User preference controlling UI/system-notification language and locale-aware formatting; initial locales are Spanish and English. See ADR 0037. |
| _Correlation ID_ | An identifier propagated across synchronous and asynchronous operations for tracing and structured observability. See ADR 0038. |
| _Notification_ | A non-authoritative User alert derived from a domain event, delivered by email or in-app according to preferences. See ADR 0039. |
| _Search Module_ | The authorization-aware interface for full-text and structured search; initially implemented with PostgreSQL. See ADR 0040. |
| _Incident_ | An ITSM Ticket concerned with restoring an interrupted or degraded service. In MVP scope. See ADR 0041. | accepted |
| _Service Request_ | An ITSM Ticket seeking delivery of a standard service. In MVP scope. See ADR 0041. | accepted |
| _Service Catalog_ | The Workspace offering of requestable services, using Ticket Forms for structured intake. In MVP scope. See ADR 0041. |
| _Ticket Type_ | A Workspace-configured name for a Ticket, assigned to a canonical Ticket Type Category. See ADR 0042. | accepted |
| _Ticket Type Category_ | Canonical ITSM meaning of a Ticket Type: `Incident` or `Service Request` in the MVP. See ADR 0042. |
| _Service Catalog Item_ | A requestable service configured with a Type, Form, Queue, SLA selection, and optional Approval Policy. See ADR 0043. | accepted |
| _Approval Policy_ | An auditable, ordered set of approval steps required before a Service Request can proceed. See ADR 0043. |
| _Approval Step_ | One ordered Approval Policy stage, completed by either any one or all of its eligible approvers. See ADR 0044. |
| _SLA Activation Point_ | The catalog-item setting that starts SLA targets at Ticket creation or approval completion. See ADR 0045. |
| _Report_ | An authorization-aware, Workspace-configured aggregation with filters, grouping, metrics, and CSV export. See ADR 0046. |
| _SSE_ | The server-to-browser real-time transport for authorized portal updates in the MVP. See ADR 0047. |
| _Delivery Phase_ | An explicit roadmap increment (P0–P3) that delivers usable capability without changing established domain seams. See ADR 0048. | accepted |
| _Queue Member_ | An Agent explicitly authorized to work Tickets in a restricted Queue. See ADR 0049. | accepted |
| _Intake Quarantine_ | Restricted review area for inbound email that cannot be safely correlated and authorized to a Ticket. See ADR 0051. | accepted |
| _Tag_ | A normalized Workspace-scoped label for Ticket triage, search, and reporting. See ADR 0050. | accepted |
