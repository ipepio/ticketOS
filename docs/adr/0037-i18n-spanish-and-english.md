# ADR 0037 — Internationalization foundation with Spanish and English

- **Status:** accepted
- **Date:** 2026-07-10

## Context

ticketOS is an Open Source, self-hosted product intended for diverse users.
Adding localization after UI and notification copy are embedded in code creates
pervasive, expensive rework. Full multilingual authoring for every custom form
and Knowledge Base article is a separate editorial platform concern.

## Decision

Implement i18n from the start. The initial UI and system notifications ship in
**Spanish** and **English**. Each User has a locale, timezone, and locale-aware
formatting preference. Ticket and Article content remains authored content; it
is not automatically translated.

## Consequences

- **Easier:** broader adoption and correct time/date/number presentation
  without later UI rewrites.
- **Harder:** all UI/system copy needs translation discipline and test coverage.
- Workspace-authored multilingual Forms, Fields, and Articles are deferred.
