# ADR 0031 — React/Vite portal with Fastify application server

- **Status:** accepted
- **Date:** 2026-07-10

## Context

The application requires substantial server-side capability: authenticated APIs,
inbound email/webhooks, RBAC, background-job integration, real-time delivery,
and self-hosted operations. A Next.js-centric server would make those concerns
secondary to a UI framework. NestJS offers conventions but brings a decorator/
DI architecture that can obscure dependencies in a complex domain.

## Decision

Use **React with Vite** for the portal UI and **Fastify** as the TypeScript HTTP
application server. They are separate delivery adapters but are packaged
alongside each other in the main self-hosted deployment. The background worker
runs separately.

Fastify is an adapter to domain-module interfaces; Ticket, SLA, Automation,
and other domain modules must not depend on Fastify or React.

## Consequences

- **Easier:** explicit server control, lightweight HTTP/webhook handling, rich
  client UI, and preservation of framework-independent domain modules.
- **Harder:** UI and server integration conventions, auth transport, SSR for
  public articles if needed, and build packaging are our responsibility.
- Database and tenancy-isolation mechanisms remain to be decided.
