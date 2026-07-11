# Feature ID — Title

**Status:** ready  
**Phase:** P0 | P1 | P2 | P3  
**Depends on:** Feature IDs or none  
**ADRs:** ADR numbers  
**Primary seam:** Module interface name

## Problem Statement

What a user/operator cannot currently do and why it matters.

## Solution

The externally observable behavior to add. State invariants and error behavior.

## User Stories

1. As a <actor>, I want <feature>, so that <benefit>

## Tasks

1. A small vertical implementation task.

## Acceptance Criteria

- [ ] Observable behavior with a known expected result.
- [ ] Authorization/Workspace isolation behavior.
- [ ] Timeline/Audit/outbox behavior when applicable.
- [ ] Accessibility/localization behavior when UI is involved.

## Testing Decisions

- Test through `<primary seam>`.
- Use real PostgreSQL when persistence/RLS/outbox behavior matters.
- Fake only true external adapters.
- First test is red; implement only enough for green; repeat per vertical slice.

## Out of Scope

What must not be added in this feature.

## Notes

Migration, configuration, observability, documentation, or rollout concerns.
