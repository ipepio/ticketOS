# ADR 0023 — Controlled and auditable automation cascades

- **Status:** accepted
- **Date:** 2026-07-10

## Context

Automation actions can produce Ticket events that are themselves eligible to
trigger other rules. Disallowing all cascades blocks useful workflows; allowing
unbounded recursion creates loops, duplicated side effects, and unexplainable
Ticket histories.

## Decision

Automation supports controlled cascades:

- an automation-caused event may trigger eligible Rules;
- a Rule executes at most once for the same causal event chain;
- every chain has a bounded maximum depth; and
- execution, skipped rules, failure, and loop/depth blocking are auditable in
  the Ticket Timeline/automation log.

## Consequences

- **Easier:** useful multi-step workflows with deterministic loop protection
  and operational diagnosis.
- **Harder:** causal-event propagation and idempotency keys are required across
  the Automation module’s interface.
- The exact ordering of simultaneously eligible Rules and retry semantics
  remains to be decided.
