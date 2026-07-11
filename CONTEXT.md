# ticketOS contributor context

## Vocabulary

Use the domain terms defined in [docs/glossary.md](docs/glossary.md):
Installation, Workspace, Organization, User, Workspace Membership, Queue,
Ticket, Timeline, Message, Internal Note, System Event, Status Category,
Capability, and Attachment. Do not substitute ambiguous terms such as “tenant”,
“team”, “comment”, or “public” when the glossary has a precise term.

## Architecture

TicketOS is a TypeScript modular monolith: React/Vite portal, Fastify HTTP
adapter, PostgreSQL with RLS, and a PostgreSQL outbox-backed worker. Domain
modules own policy behind framework-independent interfaces. See
[docs/architecture.md](docs/architecture.md) and all relevant ADRs before
changing behavior.

## Testing

Test only through agreed module seams from
[docs/backlog/README.md](docs/backlog/README.md). Use real PostgreSQL for
Workspace authorization, RLS, migrations, outbox, and search. Fake only true
external adapters such as email, storage, OIDC, clocks, and webhook consumers.
Write red → green vertical slices; do not test module internals or mock internal
modules.

## Delivery

Start with [P0-01](docs/backlog/p0-operational-core.md). Respect the dependency
order in [P0 parallelization](docs/backlog/p0-parallelization.md). The product
spec and ADRs are the source of truth for acceptance criteria and decisions.
