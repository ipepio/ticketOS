# ADR 0014 — Provision requesters from unknown inbound email senders

- **Status:** accepted
- **Date:** 2026-07-10

## Context

Email is an MVP intake channel. Requiring a pre-created portal account blocks
external support and makes email intake impractical. Conversely, granting an
unverified email sender broad access creates an authorization risk.

## Decision

When an inbound email creates a new Ticket and its sender does not match a
User, ticketOS will:

1. provision a global **User** with the sender email as an unverified identity;
2. create the Ticket as that User’s private requester Ticket in the routed
   Workspace and Queue; and
3. send a passwordless **magic link** to verify the address and access the
   portal.

The provisioned User receives only minimum requester access. Anti-spam limits
and verification are mandatory. No sender identity grants elevated Workspace
or Organization access by itself.

## Consequences

- **Easier:** low-friction external support and a coherent portal identity for
  email-originated cases.
- **Harder:** email verification, account recovery, spam/abuse controls, and
  duplicate-identity handling are core requirements.
- Reply threading and the exact lifecycle of unverified identities remain to be
  decided.
