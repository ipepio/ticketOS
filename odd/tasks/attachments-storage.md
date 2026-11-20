# Feature — Attachment storage: S3 adapter, selection policy, dev MinIO

Implement F8/F9 of `docs/specs/operational-portal-completion.md` (TDD slices 11–16).
Stack: feat/attachments-storage on top of feat/portal-journeys.

## Specs

S1 (F8, verbatim): "A permitted User can add one or more Attachments to a Ticket." /
"The server validates size, content type, blocked extensions, Ticket access, and Workspace scope." /
"Attachment metadata and object lifecycle remain consistent if upload fails." / "Download uses an
authorized endpoint or short-lived authorized URL; never a permanent public URL." / "Requesters cannot
access Attachments belonging only to Internal Notes." / "Deletion and quarantine remain auditable and
follow the owning content."

S2 (F9, verbatim): "If a complete S3 configuration exists, use the S3 adapter." / "If no complete S3
configuration exists, use the local-volume adapter." / "An incomplete S3 configuration fails startup with
a useful configuration error; it must not be treated as local mode." / "A configured S3 adapter that becomes
unavailable returns an operation error; it must not silently write to local storage." / "Docker development
includes MinIO, a persistent volume, healthcheck, bucket initialization, and application environment
variables." / "The local fallback uses the existing Docker Attachment volume."

S3 (slices 11–16, verbatim): "11. A Requester uploads and downloads an Attachment through local storage."
/ "12. An unauthorized User cannot download that Attachment." / "13. The same upload/download example
passes against MinIO." / "14. Missing S3 configuration selects local storage." / "15. Incomplete S3
configuration prevents startup." / "16. S3 runtime failure does not write to local storage."

S4 (invariants, verbatim): "A configured S3 adapter must never silently fall back to local storage after a
runtime failure."

## Tasks

| ID | Spec | Route | Commit |
| --- | --- | --- | --- |
| T1 | S2, S3 (14–16) | worker: storage selection policy (complete/incomplete/missing matrix) + startup behavior, unit seam | — |
| T2 | S2, S3 (13), dependency | worker: S3 adapter (@aws-sdk/client-s3) + MinIO dev service + upload/download e2e against MinIO | — |
| T3 | S1, S3 (11–12) | worker: F8 hardening audit (validation, internal-note isolation, audit) + local-storage journeys | — |

## Log

L1 (verbatim): "organiza un goal para hacer todas las features pendientes, y orquestalo todo. El desarrollo que sea todo con deepseekv4-flash o hy4-flash ambos de nan.builders, vale?"

L2 (dependency authorization): the spec's F9 mandates an S3 adapter and dev MinIO; no S3 client exists in
the tree. `@aws-sdk/client-s3` is authorized as the single new dependency (standard, endpoint-compatible
with MinIO/R2/self-hosted). Docker dev gains a MinIO service with persistent volume, healthcheck, bucket
init, and app env vars per S2.
