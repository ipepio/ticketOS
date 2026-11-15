# Navigation index — ticketOS

## Entry points

- [README.md](README.md): adoption and documentation-only scope.
- [AGENTS.md](AGENTS.md): agent working contract and task routing.
- [docs/AGENTS.md](docs/AGENTS.md): local documentation editing rules.
- [docs/project-context.md](docs/project-context.md): project facts, unresolved decisions and real commands.
- [docs/preferences.md](docs/preferences.md): confirmed maintainer preferences and proposed defaults.
- [docs/project-status.md](docs/project-status.md): known issues, uncertainty and continuation evidence.

## Architecture and patterns

- [Structure](docs/architecture/structure.md): placement map and dependency boundaries.
- [Features](docs/architecture/features.md): domain, commands, queries and business ownership.
- [REST](docs/architecture/rest.md): HTTP resources, DTOs, errors, pagination and compatibility.
- [Persistence](docs/architecture/persistence.md): PostgreSQL, pg, repositories, transactions and migrations.
- [Shared](docs/architecture/shared.md): technical infrastructure, gateways, configuration and wiring.
- [Conventions](docs/architecture/conventions.md): names, types, imports, formatting and exports.
- [Testing](docs/architecture/testing.md): required evidence and future architecture enforcement.
- [Workflow](docs/architecture/workflow.md): agent scope, decisions and adoption/evolution.

## Decisions and reusable templates

- [ADR index](docs/adr/README.md) and records `docs/adr/0001`–`docs/adr/0056`.
- [ADR template](docs/templates/adr.md).
- [Feature specification template](docs/templates/feature-spec.md).
- [Feature-local AGENTS template](docs/templates/feature-agents.md).

## Project material

- [Overview](docs/architecture.md): architectural overview and system boundaries.
- [Glossary](docs/glossary.md): shared terminology and domain language.
- [Roadmap](docs/roadmap.md): planned milestones and delivery timeline.
- [Specifications](docs/specs/): detailed feature specifications and requirements.
- [Backlog](docs/backlog/README.md): tracked work items and pending tasks.

## Authoring record — do not copy into an application

- [Adoption tracker](odd/tasks/dev-template-adoption.md): scope correction and verification of this
  documentation deliverable, not part of an application's architecture or business specifications.
