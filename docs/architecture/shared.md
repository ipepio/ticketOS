# Shared infrastructure and external gateways

`shared` contains cross-package value types and technical capabilities, not business concepts that
happen to be used twice. A feature owns its business logic even when other features consume it.

## What belongs where

| Concern | Placement |
| --- | --- |
| Environment parsing and technical settings | `packages/app/src/config.ts` and `packages/app/src/config-module/` |
| Correlation/request context | `packages/app/src/app.ts` request hooks |
| Logger contract, structured logger adapter | a `packages/app/src/` logging capability |
| HTTP transport defaults and timeout plumbing | `packages/app/src/` infrastructure helpers |
| Pool lifecycle and transaction infrastructure | `packages/app/src/db/` |
| Mapping application errors to HTTP | the route layer |
| External API operations and their DTOs | `packages/app/src/email/` and `packages/app/src/storage/` |
| Pricing, eligibility, reservation or other business rule | Owning feature's domain/use case |
| Business workflow spanning several features | Explicitly owned application use case |
| Cross-package value types | `packages/shared/src/` |

Do not create `CommonService`, `BaseService`, `utils.ts` or a generic helpers bucket to avoid deciding
ownership. A tiny pure technical helper can live with the capability it supports. Extract a shared
abstraction only when the shared responsibility is understood, not from superficial duplication.

## Gateway pattern

A gateway encapsulates the external system's HTTP protocol, authentication, endpoints and wire DTOs.
Use a narrow contract at the application seam when a use case needs substitution. Do not expose
Axios responses, raw fetch responses or external payloads as domain results.

Configure timeouts explicitly. Retry only identified transient failures when replay is safe, with
bounded attempts and backoff. Never automatically retry non-idempotent writes without a safe strategy.
Validate external payloads before relying on them; TypeScript generics do not validate runtime data.
Map expected external absence/conflicts deliberately and preserve unexpected failures for the boundary.

Authentication credentials stay in the gateway's infrastructure/configuration path, not in commands.
Do not log authorization headers, passwords, tokens or full sensitive response bodies. Circuit
breakers, caches and queues are optional project decisions, not mandatory template features.

The project already owns two external gateways that illustrate this pattern:

- **Email gateway** (`packages/app/src/email/`): IMAP/SMTP email access using
  [nodemailer](https://nodemailer.com/). Documents the wire contract for incoming and outgoing
  message operations (ADR 0025).
- **Storage gateway** (`packages/app/src/storage/`): an S3-compatible object storage adapter.
  Captures bucket layout, credential loading and key operations (ADR 0051).

## Composition and wiring

Only composition modules in the application package wire concrete adapters. Construct instances
explicitly in `packages/app/src/app.ts` and pass them to route handlers, commands and queries.
No DI container, no injection decorators and no framework module boilerplate.
Keep feature modules and domain code free of transport-level imports.

Wire instances, not constructor arrays. Build each dependency tree top-down: create infrastructure
objects (pools, HTTP clients, loggers) first, then compose the use-case objects that consume them,
and finally connect route handlers or event consumers at the top. This makes the wiring surface
small, explicit and easy to audit when adding or removing dependencies.

Register **instances resolved by the application**, not arrays of class constructors masquerading as
handlers. Use focused factories when wiring plain framework-free use cases. Keep transport and
infrastructure concerns out of domain models and commands/queries.

## Configuration and lifecycle

Validate required configuration once at startup. Parse booleans, numbers, URLs and bounds explicitly;
no scattered `process.env` reads or unvalidated `Object.assign` into a typed config class.
Document each required variable and safe example when executable setup is authorized. Never commit
real credentials. Separate migration credentials from ordinary runtime credentials when appropriate.

`.env.example` in the repository root documents the required environment variables with safe placeholder
values and must never contain real secrets or connection strings.

Use structured logging through a common logger contract, with correlation context. Avoid competing
logger types and application `console.log` calls. Redact confidential fields and define
logging retention/exposure for the deployment. Close pools and consumers on shutdown; cap concurrent
work and define failure handling if the project later introduces background processing.
