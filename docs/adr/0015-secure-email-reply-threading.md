# ADR 0015 — Secure email reply threading

- **Status:** accepted
- **Date:** 2026-07-10

## Context

Inbound replies need to reach the correct existing Ticket even when email
clients modify subjects or omit standard threading headers. A Ticket identifier
in a subject line alone is predictable and must not authorize a sender to add
content to a case.

## Decision

Outbound Ticket emails include three correlation mechanisms:

1. a human-readable Ticket reference in the subject;
2. standard `In-Reply-To` and `References` headers; and
3. an opaque, signed, expiring correlation token in the Reply-To address.

An inbound reply is appended only when correlation succeeds **and** the sender
is authorized to access that Ticket. Failed correlation or authorization is
never silently added to the target Ticket and must follow an explicit handling
policy.

## Consequences

- **Easier:** robust threading across diverse email clients and resistance to
  predictable-ID message injection.
- **Harder:** token rotation/expiry, bounced mail, and failed-correlation
  handling require operational design.
- The explicit failed-correlation policy remains to be decided.
