# ADR 0005 — Global identities with workspace memberships

- **Status:** accepted
- **Date:** 2026-07-10

## Context

A person may participate in more than one Workspace: an administrator can
operate several customer Workspaces, and a requester may belong to multiple
customer Organizations. Workspace-local identities duplicate credentials and
complicate single sign-on, invitations, and auditing.

## Decision

A **User** is a global identity within an Installation. Access to a Workspace is
granted by a **Workspace Membership**, which carries that User’s role and
permissions in the Workspace. A User has no implicit access to every Workspace.

## Consequences

- **Easier:** SSO, authentication, cross-workspace invitations, centralized
  auditing, and people participating in multiple Workspaces.
- **Harder:** every request must verify Workspace Membership before reading or
  changing Workspace-owned data.
- Organization membership is separate from Workspace Membership and remains to
  be specified.
