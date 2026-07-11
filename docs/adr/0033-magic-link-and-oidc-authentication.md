# ADR 0033 — Magic links and OIDC authentication

- **Status:** accepted
- **Date:** 2026-07-10

## Context

Email-originated requesters require passwordless verification, while self-hosted
organizations commonly need federated authentication. Supporting every
enterprise protocol in the MVP would substantially expand the identity attack
surface and operational complexity.

## Decision

The MVP supports:

- email **Magic Links** for local passwordless authentication; and
- **OIDC / OAuth 2.0** identity providers (such as Keycloak, Microsoft Entra
  ID, Google, and Okta).

SAML and LDAP/Active Directory are deferred and must later integrate through
the same Identity module seam, without changing User or Workspace Membership
semantics.

## Consequences

- **Easier:** low-friction requester access and broad modern enterprise SSO
  coverage with a bounded MVP identity surface.
- **Harder:** account linking, email trust, session security, OIDC discovery,
  and provider configuration require rigorous implementation.
- The scope at which identity providers are configured remains to be decided.
