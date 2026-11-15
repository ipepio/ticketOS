# REST contracts

When a project exposes HTTP, use REST and document it with OpenAPI. REST is the external contract,
not a requirement to call internal modules over HTTP or to turn every use case into CRUD.

## Resources and operations

- Use plural resource nouns and kebab-case path segments: `/workspaces`, `/queues`, `/tickets`,
  `/timeline`, `/catalog-items`.
- Use `GET` for reads; never cause business writes through a GET request.
- Use `POST` for creation or an intentional business operation, `PUT` for replacement, `PATCH` for
  partial changes and `DELETE` for deletion. Define the semantics rather than treating them as aliases.
- A business transition should be explicit. Model an operation resource when useful instead of
  allowing arbitrary edits to a `status` field. Specify retry/idempotency behavior for the operation.
- Use `201` for creation, with `Location` when the new resource is addressable; `204` has no body.
  Use `400` for invalid input, `401` for missing/invalid authentication, `403` for denied permission,
  `404` for absent resources, `409` for conflicts and `500` for unexpected server failures.
- Do not return HTTP 200 with an embedded error to bypass these semantics.

## DTOs and validation

Declare input and output DTOs separately from domain objects and SQL rows. Validate request bodies,
route/query parameters and supported content types at the boundary using zod schemas defined at the
route handler level; use raw SQL in `<feature>/postgres.ts` and domain interfaces in
`packages/domain/src/<feature>.ts`, never leaking persistence shapes to transport layers. Reject
unknown body fields unless the contract explicitly supports extensible attributes. Bound strings,
arrays and page sizes.

Use camelCase for this repository's own JSON APIs; preserve the exact casing of external APIs in their
own DTOs. Map at the boundary. Document omitted-versus-null semantics, particularly for PATCH.
Do not let persistence objects or confidential fields become responses through automatic spreading.

The route handler sits in `packages/app/src/routes/<area>.ts`. The boundary zod schema is declared
next to the handler and is the only gateway between the transport layer and the domain:

```ts
import { z } from "zod";
import Fastify from "fastify";

const createTicketBody = z.object({
  queueId: z.string().uuid(),
  title: z.string().min(1).max(200),
  description: z.string().max(5000).optional(),
});

fastify.post<{ Body: z.infer<typeof createTicketBody> }>(
  "/tickets",
  { schema: { body: createTicketBody, response: { 201: ticketResponseSchema } } },
  handler,
);
```

## Collection baseline

For a newly implemented list endpoint, use the same baseline unless an accepted ADR changes it:

- Query parameters: `page` (integer >= 1, default 1), `pageSize` (integer 1..100, default 20).
- Response: `{ data: [...], pagination: { page, pageSize, hasNext } }`.
- Fetch at most one extra row to determine `hasNext`; do not require an expensive total count.
- Stable ordering with a unique tie-breaker. Explicit allowlists for filters and sorting.
- Use cursor pagination instead only for a demonstrated scale/consistency requirement, documented as
  an exception. Do not silently mix formats across endpoints.

## Errors and observability

Use RFC 9457 Problem Details (`application/problem+json`) with stable `type`, `title`, `status` and
safe `detail`; use `instance` when meaningful. Add stable `code` and `correlationId` extension fields.
Validation details may identify invalid fields, never secret values. Do not expose stack traces,
SQL text, database constraint names or upstream response bodies indiscriminately.

One boundary filter translates known business errors; unexpected errors become a generic 500 and
are logged with correlation context. Propagate a validated, bounded correlation ID or generate one.
It is an observability identifier, not authentication or permission evidence.

Every response carrying a `correlationId` extension must also emit that identifier in the structured
log line for the same request, so that a request can be traced from log to response and back.

## Security and compatibility

Every exposed endpoint needs an explicit access classification (public or protected). No implicit
"public until authentication is added" policy. Authorization is capability-based per ADR 0006:
the system evaluates named Capabilities mapped from fixed roles (Installation Admin, Workspace Admin,
Agent, Requester), not role names directly. Resource and tenant scoping is Workspace-based per
ADR 0049; every multi-tenant resource route validates the Workspace context before dispatching to the
domain module.

PostgreSQL Row-Level Security (RLS) is defense in depth, never the only check. Domain-module
authorization gate remains authoritative; RLS catches escape-through cases (compromised tokens,
direct SQL, misrouted queries).

The project owner chooses authentication and resource/tenant authorization before protected endpoints
are implemented. Do not invent a JWT scheme. Review object-level authorization, output fields,
request-size limits and applicable rate limits. CORS is an explicit allowlist where needed, not an
authentication mechanism. Keep secrets out of logs and error payloads. Define OpenAPI visibility and
production exposure deliberately.

Use additive compatible changes where possible. Before the first public release, record the API
versioning policy; breaking a consumed contract requires owner approval and a migration/deprecation
plan. Do not add `/v1` or headers arbitrarily on one feature.

`@fastify/swagger` generates the OpenAPI document automatically from route schemas. The generated
OpenAPI document is the published contract and must track route and schema changes — every route
definition, zod validation schema, and response shape must remain in sync with the document.
Documentation does not prove implementation; contract/e2e tests must check the observable behavior.
