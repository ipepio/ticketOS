# ticketOS

Open Source, self-hosted, multi-Workspace ticketing platform.

> **Status:** designed; implementation has not started.

## Start here

- [Architecture](docs/architecture.md)
- [Product specification](docs/specs/000-ticketos-product-spec.md)
- [Engineering backlog](docs/backlog/README.md)
- [P0 operational-core work items](docs/backlog/p0-operational-core.md)
- [P1–P3 work items](docs/backlog/p1-p3.md)
- [Roadmap](docs/roadmap.md)
- [Domain glossary](docs/glossary.md)
- [Architecture Decision Records](docs/adr/)

The first implementation work item is `P0-01`.

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
