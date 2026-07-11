# ADR 0008 — A unified immutable Ticket Timeline

- **Status:** accepted
- **Date:** 2026-07-10

## Context

Tickets need both a requester-facing conversation and an auditable history of
operational changes. Future omnichannel support must add email, chat, and other
inbound/outbound messages without each channel creating a separate history.

## Decision

A Ticket owns one ordered, immutable **Timeline**. Its entries include:

- requester-visible **Messages** (the conversation),
- agent-only **Internal Notes**, and
- **System Events** such as assignment, status changes, and automations.

Channels translate inbound and outbound communication into Message Timeline
entries. A separate Conversation aggregate is not required.

## Consequences

- **Easier:** a coherent chronological history, auditability, and channel-
  independent omnichannel evolution.
- **Harder:** Timeline ordering, visibility, and redaction/retention semantics
  must be deliberate from the beginning.
- “Requester-visible” does not mean publicly available on the internet. The
  exact requester/Organization audience rules remain to be decided.
