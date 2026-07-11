# ADR 0034 — Installation-configured IdPs enabled per Workspace

- **Status:** accepted
- **Date:** 2026-07-10

## Context

A multi-Workspace self-hosted Installation may represent one company with a
shared identity provider or an operator serving independent customer
Workspaces. Identity-provider credentials are Installation-level infrastructure,
while admission policy is a Workspace concern.

## Decision

OIDC/OAuth 2.0 Identity Providers are configured once at **Installation**
scope. Each Workspace explicitly enables or restricts the configured providers
that its Users may use.

## Consequences

- **Easier:** a shared corporate IdP across Workspaces and selective provider
  access for independently administered Workspaces without duplicating
  credentials.
- **Harder:** login discovery, Workspace selection, and provider-to-account
  linking need a clear UX and authorization policy.
- Provider credentials require Installation Admin protection and Audit Log
  coverage.
