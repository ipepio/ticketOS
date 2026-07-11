# ADR 0003 — Separate workspaces from customer organizations

- **Status:** accepted
- **Date:** 2026-07-10

## Context

In a multi-organization helpdesk, “organization” can ambiguously mean either:

- the top-level unit whose data and administration must be isolated, or
- a customer company/team that groups requesters served by that unit.

Using one term for both would produce ambiguous authorization rules and a
confusing data model.

## Decision

Use this hierarchy and vocabulary:

```
Installation → Workspace → Organization → User / Ticket
```

- A **Workspace** is the top-level isolation and administration unit inside a
  ticketOS installation. It owns its tickets, configuration, agents, workflows,
  and permissions.
- An **Organization** is a group of requesters/customers within a Workspace.
  A Workspace may serve zero, one, or many Organizations.

## Consequences

- **Easier:** a managed-service provider can serve many customer Organizations
  from one Workspace; independently administered customers can instead receive
  separate Workspaces.
- **Harder:** authorization must consistently distinguish workspace membership
  from organization membership.
- The terms are mandatory domain vocabulary; avoid using “tenant” where
  “Workspace” is meant.
