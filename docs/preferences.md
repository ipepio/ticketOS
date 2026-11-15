# Maintainer preferences

Separate what the maintainer actually requested from defaults proposed by this template.

## Confirmed

| Preference | Evidence |
| --- | --- |
| Agents adapt to the maintainer, not the other way around | `ipepio/dev-templates` adoption request, verbatim quoted in [odd/tasks/dev-template-adoption.md](../odd/tasks/dev-template-adoption.md) L1 |
| The documentation contract is the working source of truth for this repository | Adopted by S1, S2 of the dev-template adoption spec |
| The repository follows contract-first documented rules before implementation | Documented in [AGENTS.md](../AGENTS.md) fixed baseline and architecture conventions |

## Proposed defaults — not yet confirmed

| Topic | Initial default |
| --- | --- |
| Conversation | Follow the maintainer's language; Spanish (Rioplatense voseo) when they write Spanish |
| Technical artifacts | English, per S6 of the adoption spec |
| Autonomy | Complete authorized in-scope work; pause at consequential decisions |
| Architecture | Prefer incremental improvements over rewrites |
| Dependencies | Obtain approval before adding or upgrading dependencies |
| Git | No commits, pushes, or PRs without explicit permission |
| Completion report | Outcome, affected paths, observed checks, remaining risks |

## Preference updates

When the maintainer explicitly establishes a durable preference, update the relevant row with its scope and evidence. Explicit current instructions take precedence over these defaults within platform limits. Keep task-specific exceptions local to that task.

## To refine later

- Expected explanation depth and progress-update frequency.
- Preferred branch, commit, and review policies.
- Scope of autonomous environment setup and dependency management.
- UI review and acceptance expectations.

Do not ask all of these up front. Resolve them when they affect an actual task.
