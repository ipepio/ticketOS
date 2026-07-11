# ADR 0012 — MVP channels are web portal and email

- **Status:** accepted
- **Date:** 2026-07-10

## Context

The first release must be useful as a real IT Service Desk while retaining a
path toward omnichannel customer support. The Ticket Timeline is channel-
independent, but each additional channel adds significant identity, delivery,
session, provider, and abuse-handling complexity.

## Decision

The MVP supports two bidirectional channels:

- the authenticated **web portal**, and
- **email** for inbound Ticket creation/replies and outbound agent replies.

Chat, WhatsApp, social networks, and other channels are deferred to the
omnichannel phase (D). All channel communication becomes Message entries in
the unified Ticket Timeline.

## Consequences

- **Easier:** a useful MVP with forms/self-service and the universal email
  workflow, while keeping channel adapters limited.
- **Harder:** email routing, identity verification, threading, delivery, and
  spam controls are MVP concerns.
- The ownership and routing rules of inbound email addresses remain to be
  decided.
