# ADR 0056 — Adopt `ipepio/dev-templates` as the documentation working contract

- **Status:** accepted (owner request)
- **Date:** 2026-11-14

## Context

The repository already carried strong product and architecture decisions (`docs/adr/0001`–`0055`),
a product specification, a backlog and a glossary. It had no single working contract telling an agent
*how* to work here: where a change belongs, which dependency directions hold, how verification is
proven, and which parts are documented rules rather than executable enforcement.

The owner pointed at `https://github.com/ipepio/dev-templates` — documentation templates that encode a
working contract — and asked for its adoption in this repository, with two constraints: the adoption
must not be a redesign of existing code, and it must not be presented as scaffolding that already
exists.

## Decision

Adopt the two templates as the repository's documentation contract, adapted, not copied verbatim:

- `AGENTS.md` and `CONTENTS.md` at the repository root are the agent entry point and navigation index.
- `docs/AGENTS.md` and `docs/project-context.md` hold documentation-editing rules and project facts.
- `docs/architecture/` holds the reusable guides: structure, features, REST, persistence, shared
  infrastructure, conventions, testing and workflow.
- `docs/portal/` holds the portal rules: component architecture, conventions and verification.
- `docs/preferences.md` and `docs/project-status.md` hold owner preferences and evidence-backed status.
- `docs/adr/README.md` indexes this repository's decisions; `docs/templates/` holds the ADR,
  feature-specification and feature-local `AGENTS.md` templates.

Framework mechanics are substituted while the rules survive. The source template assumes NestJS; this
repository uses Fastify 5 with zod validation at the boundary. Therefore:

- "Nest module and `@Inject` wiring" becomes a feature module under `packages/app/src/<feature>/`
  implementing an interface from `packages/domain/src/<feature>.ts`, wired explicitly in
  `packages/app/src/app.ts`.
- "Controller" becomes a Fastify route handler in `packages/app/src/routes/<area>.ts`.
- "PostgreSQL through `pg` behind explicit repositories" already holds here and is now documented as
  `<feature>/postgres.ts` plus the contracts in `packages/domain/src/`.

Existing project material is indexed, not rewritten: `docs/architecture.md`, `docs/glossary.md`,
`docs/roadmap.md`, `docs/specs/`, `docs/backlog/`, `CONTEXT.md` and ADRs `0001`–`0055` keep their
content and their authority.

## Alternatives and consequences

Keeping only the ADR set was rejected: decisions explain *what* was chosen, not how a change is
routed, verified and reported. A full unification with the template's examples was rejected as well,
because the template's NestJS and Vue assumptions do not describe this repository.

Benefits: one entry point for agents, task routing by change type, documented dependency directions,
and an explicit separation between a documented rule and an implemented check. Costs: more documents
to keep consistent, and two sources of architecture truth (these guides and the ADR set) that must not
drift — the guides own reusable patterns, ADRs own decisions.

This adoption changes no source code, dependency, migration or behaviour. It creates no enforcement:
architecture import checks are documented as expected and remain unimplemented, and CI does not run
them.

## Verification and adoption

Verified by inspection: every guide is linked from `CONTENTS.md`, links are relative and resolve,
`README.md` no longer claims that implementation has not started, and the guides name only commands
that exist in `package.json`. Framework references from the source templates (NestJS, Vue, Pinia) were
removed.

Future template improvements reach this repository by explicit diff review only. A later revision must
not silently overwrite a decision recorded here or in `0001`–`0055`.
