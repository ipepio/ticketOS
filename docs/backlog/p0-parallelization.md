# P0 execution lanes

Use these lanes after their dependencies are satisfied. Parallel work must not
invent cross-module interfaces; changes to an agreed seam require review against
`docs/architecture.md` and the relevant ADR.

| Lane | Start condition | Work items | Shared contract to protect |
| --- | --- | --- | --- |
| Foundation | immediately | P0-01 | TypeScript workspace, migrations, PostgreSQL transaction/outbox interface |
| Identity | P0-01 | P0-02 | active Workspace context and Capability authorization |
| Operational config | P0-02 | P0-03 | Workflow/Queue behavior, no Ticket persistence policy in callers |
| Ticket core | P0-02 + P0-03 | P0-04 | Ticket interface and immutable Timeline |
| Portal | P0-02 + P0-04 | P0-05 | HTTP/Identity/Ticket interfaces only |
| Storage | P0-04 | P0-06 | Attachment lifecycle and storage adapter contract |
| Email | P0-02 + P0-04 + P0-06 | P0-07 | Email interface, Ticket behavior, outbox delivery semantics |
| Release assurance | P0-01 onward | P0-08 | Audit/telemetry/recovery interfaces; final gate after P0-07 |

## Integration cadence

1. Land P0-01 before any business code.
2. Agree and test the Identity + active Workspace context before persistent
   Workspace modules.
3. Land Workflow and Ticket as separate deep modules; the portal calls their
   interfaces, never repositories directly.
4. Add external adapters (storage/email) only after the owning domain behavior
   has a passing fake-adapter test.
5. Run the P0-08 release journey on every merge after email is introduced.
