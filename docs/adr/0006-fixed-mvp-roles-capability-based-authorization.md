# ADR 0006 — Fixed MVP roles over capability-based authorization

- **Status:** accepted
- **Date:** 2026-07-10

## Context

ticketOS needs simple, understandable permissions for its first release, but
its long-term hybrid platform goal will require configurable roles. Encoding
all authorization as a fixed role enum would make that evolution invasive;
shipping a full custom-RBAC editor before real use cases would be premature.

## Decision

The MVP exposes four fixed roles:

- **Installation Admin**
- **Workspace Admin**
- **Agent**
- **Requester**

Authorization evaluates named **Capabilities**, not role names directly. The
fixed roles are mappings to capabilities. Creating custom roles and editing
those mappings is deferred.

## Consequences

- **Easier:** an understandable MVP and a future path to custom roles without
  changing every authorization check.
- **Harder:** the capability vocabulary must be deliberately designed and
  consistently enforced; it is an important internal interface.
- The exact capabilities and organization-level visibility rules remain to be
  decided.
