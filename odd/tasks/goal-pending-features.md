# Goal — Complete every pending feature

Two-work line header: implement all features still pending in ticketOS, in the owner-agreed order,
with development delegated to `gentle-ai-worker` on `nan/deepseek-v4-flash` (fallback `nan/hy4`) and
the orchestrator acting as judge and reviewer. Deployment/hardening stays out of scope (owner decision).

## Feature order

| # | Feature | Specification | Branch | Feature doc | Status |
| --- | --- | --- | --- | --- | --- |
| 1 | First-run onboarding | docs/specs/first-run-onboarding.md | feat/first-run-onboarding | odd/tasks/first-run-onboarding.md | done (559fc73) |
| 2 | Ticket status model convergence (migration, high risk item 1) | docs/specs/operational-portal-completion.md (Known model mismatch; F4) | feat/status-convergence | odd/tasks/status-convergence.md | done (26d9b7d) |
| 3 | Portal journeys: landing/intake, durable sessions, orgs/memberships, ticket form (F1, F2, F3, F7; slices 17–19) | docs/specs/operational-portal-completion.md | feat/portal-journeys | odd/tasks/portal-journeys.md (created when started) | pending |
| 4 | Attachments: S3 adapter, selection policy, dev MinIO (F8, F9; slices 11–16) | docs/specs/operational-portal-completion.md | feat/attachments-storage | created when started | pending |
| 5 | Architecture import checks (project-status finding F3; no new dependency) | docs/architecture/testing.md | feat/architecture-checks | created when started | pending |
| 6 | docs/project-status.md maintenance (close resolved findings F1/F2/F4) | docs/project-status.md | rides with feature 5 | — | pending |

Slices 1–10 of operational-portal-completion's TDD list are already done (ticket-creation.test.ts and
the admin-configuration feature merged to master at cb2364a..3dc4447).

## Orchestration rules

- One worker task at a time; every task is a bounded TDD unit with explicit Allowed edit surfaces.
- The parent (this orchestrator) judges each handoff, runs the gates, commits work units, and records
  evidence in the feature doc's Log.
- Feature 2 is the only high-risk item (stored data rewrite): it gets its own verifier pass
  (gentle-ai-verify) and its own commits.
- Merge to master and push are owner decisions at each feature boundary.

## Log

L1 (verbatim): "organiza un goal para hacer todas las features pendientes, y orquestalo todo. El desarrollo que sea todo con deepseekv4-flash o hy4-flash ambos de nan.builders, vale?"

L2 (model resolution): nan catalog has `deepseek-v4-flash` and `hy4`; there is no `hy4-flash` under
nan (`hy4-flash-free` lives under opencode-go). Primary: `nan/deepseek-v4-flash`; fallback: `nan/hy4`.
Project-local override created at `.pi/agents/gentle-ai-worker.md` (model: nan/deepseek-v4-flash,
effort/thinking: medium) overriding the global HelmCode definition; verified live via
subagent_list_agents.
