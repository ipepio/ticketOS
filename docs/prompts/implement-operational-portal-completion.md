# Pi implementation prompt — operational portal completion

Copy everything below into a new Pi session.

---

You are implementing the ticketOS operational portal completion in:

```bash
cd /Users/ipepio/Workspace/ipepio/ticketOS
```

## Mandatory sources

Read these files completely before editing code:

1. `/Users/ipepio/.pi/agent/skills/mattpocock/engineering/tdd/SKILL.md`
2. `/Users/ipepio/.pi/agent/skills/mattpocock/engineering/tdd/tests.md`
3. `/Users/ipepio/.pi/agent/skills/mattpocock/engineering/tdd/mocking.md`
4. `CONTEXT.md`
5. `docs/specs/operational-portal-completion.md`
6. `docs/architecture.md`
7. `docs/glossary.md`
8. The ADRs referenced by the modules being changed.
9. The Open Design project, prioritizing its Markdown, HTML, CSS, JavaScript,
   assets, and package metadata:

```text
/Users/ipepio/Library/Application Support/Open Design/namespaces/release-stable/data/projects/901f5b5d-1606-4323-a26f-6e344ab2c095
```

The test seams in `docs/specs/operational-portal-completion.md` are confirmed by
the product owner. Do not ask for reconfirmation unless implementation requires
changing a seam or a stated product policy.

## Existing work protection

The working tree contains intentional uncommitted work. Before editing:

```bash
git status --short
git diff --stat
git diff
```

Do not discard, reset, overwrite, or revert existing changes. Integrate with
them. Never run destructive commands against the development database. E2E must
use only the database whose name is `ticketos_e2e`.

## Required behavior

Implement every requirement and acceptance criterion in:

```text
docs/specs/operational-portal-completion.md
```

This includes:

- support landing and return-to-Ticket-creation flow;
- 30-day renewable sessions;
- Organization and Workspace Membership administration;
- external Requesters;
- configurable Statuses;
- required configurable Ticket Types;
- required configurable Priorities;
- reliable Ticket persistence;
- authorized Attachment upload/list/download;
- MinIO in Docker development;
- local-volume storage when S3 is not configured;
- startup failure for incomplete S3 configuration;
- no runtime fallback from configured S3 to local storage.

Preserve the Open Design visual language, responsive behavior, interactions, and
WCAG 2.2 AA behavior. The destination is the existing React/Vite portal, not a
separate prototype.

## TDD protocol — follow literally

Work through the ordered slices in the specification one at a time.

For each slice:

1. State the public seam and the single behavior under test.
2. Write exactly one behavior-focused failing test through that seam.
3. Run the smallest command that executes the new test.
4. Confirm that it fails for the expected missing behavior. If it passes before
   implementation, the test is invalid: fix the test before continuing.
5. Implement only enough production code to make that test pass.
6. Re-run the focused test until green.
7. Run the nearest relevant existing suite.
8. Continue to the next slice only after green.

Never write all tests first. Never implement several imagined slices at once.
Do not refactor during red → green. Do not test private functions, React state,
SQL rows, bucket contents, filesystem paths, internal call counts, or internal
module wiring.

Expected values must be known literals from the specification, not values
recomputed using production logic.

## Testing boundaries

- Use real PostgreSQL for Identity, Workspace, Workflow, Ticket, authorization,
  RLS, migrations, and persisted Attachment metadata.
- Use the HTTP interface or browser interface to arrange and observe behavior.
- Use real MinIO for the S3 Attachment integration example.
- Use a temporary directory for the local Attachment integration example.
- Fake only true external adapters such as SMTP and malware scanning.
- Do not mock ticketOS modules.
- Never verify success by querying PostgreSQL, reading local files, or listing an
  S3 bucket. Verify through the same public interface a caller uses.

## Data migration constraints

The current Ticket schema has hard-coded status/priority strings and nullable
`ticket_type_id`. Replace the split sources of truth with configuration IDs.
Use additive migrations, backfill existing Tickets and Workspace defaults, then
add constraints. Migrations must work on both a fresh Installation and an
upgraded Installation containing Tickets.

Do not edit an already-applied migration. Add new numbered migrations.

## Storage policy

Storage selection is deterministic at startup:

- complete S3 configuration → S3 adapter;
- absent S3 configuration → local adapter;
- partial S3 configuration → startup error;
- configured S3 unavailable during an operation → visible operation error;
- never silently redirect a failed S3 operation to local storage.

Development Docker Compose must provide MinIO, persistence, health checking, and
bucket creation without weakening production behavior.

## Security requirements

- Validate Ticket Type, Priority, Status, Organization, and Attachment ownership
  against the active Workspace server-side.
- Capability checks are mandatory; RLS is defense in depth.
- Requesters never receive Internal Notes or their Attachments.
- Attachment downloads are authorized and non-public.
- Do not reveal whether an email belongs to an unrelated Workspace.
- Preserve append-only Timeline and Audit behavior.

## Engineering constraints

- Keep the modular monolith.
- Domain modules expose framework-independent interfaces.
- Fastify remains an HTTP adapter.
- React consumes HTTP interfaces; it does not infer domain policy.
- Do not introduce microservices.
- Keep TypeScript strict and avoid `any` in new code.
- Use exact glossary vocabulary in code, tests, copy, and documentation.
- Update documentation only when behavior or operation changes.
- Do not delete architecture, glossary, ADR, specification, or operational docs.

## Verification

During development use focused commands. Before completion run:

```bash
pnpm typecheck
pnpm lint
pnpm build
pnpm test
docker compose config
docker compose ps
```

Also verify:

```bash
curl -fsS http://localhost:3020/health
curl -fsS http://localhost:3020/ready
```

Report:

1. Every red → green slice completed.
2. Files and migrations changed.
3. Commands run and their results.
4. Remaining known limitations, without claiming incomplete behavior is done.
5. Exact execution and preview commands and URLs.

Do not stop after producing a plan. Begin the first red → green slice after
reading the mandatory sources and inspecting the existing working tree.

---
