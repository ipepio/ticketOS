# Local AGENTS.md template

Copy the content below into a real feature's `AGENTS.md`, then replace placeholders. This file itself
is a reference template, not automatically active instructions for a nonexistent feature.
Keep only feature-specific information; root instructions still apply.

---

# Feature: <name>

## Ownership

- Owns: <business capability and data>.
- Does not own: <neighboring capabilities>.
- Public use cases/contracts: <actual paths and exported operations>.
- Internal adapters that other features must not import: <actual paths>.

## Business invariants

- <Rule and link to accepted specification/ADR>.
- <Relevant identity, timezone, money, permission or tenant constraint>.
- <Omitted/null/update semantics and compatibility requirement>.

## Existing patterns to follow

- Command/query reference: `packages/app/src/<feature>/<feature>.ts` (actual file).
- Repository/gateway contract and implementation: `packages/domain/src/<feature>.ts` (contract),
  `<feature>/postgres.ts` (implementation).
- DTO/mapper and module wiring: `<feature>/postgres.ts`, `packages/app/src/app.ts` (wiring).
- Route handler: `packages/app/src/routes/<area>.ts` (HTTP boundary).
- Known local inconsistencies not to copy: <specific exception, or none>.

## Verification

- Focused tests and actual command:
- Required isolated integration setup:
- Observable effects that must remain unchanged:
- Unavailable checks and why:

## Decisions

- Accepted feature ADRs:
- Questions requiring owner resolution before changing behavior:

Do not repeat global architecture, introduce local exceptions without acceptance, or claim referenced
files exist until they actually do.
