# ADR 0051 — Portable email adapters and safe intake quarantine

- **Status:** accepted (delegated recommendation)
- **Date:** 2026-07-10

## Context

The MVP needs portable self-hosted inbound/outbound email while installations
may use SMTP/IMAP or provider-specific delivery webhooks. Correlation or sender
authorization can fail, and unsafe fallback must not append a message to the
wrong Ticket.

## Decision

The Email module supports SMTP for outbound delivery and IMAP polling for
portable inbound delivery. Provider-specific inbound webhook adapters may be
added behind the same interface. Installation Admins configure delivery,
receiving, DKIM/SPF/DMARC guidance, and address ownership validation.

An inbound email that cannot be safely correlated and authorized is stored as a
restricted **Intake Quarantine** item for authorized Agent review. It is never
silently appended to a Ticket; an Agent may explicitly create a new Ticket or
link it to an existing Ticket, producing an auditable Timeline event.

## Consequences

- **Easier:** portable self-hosting and safe handling of malformed/forged email.
- **Harder:** IMAP idempotency, provider adapter contracts, bounce processing,
  and quarantine UX require reliable worker support.
