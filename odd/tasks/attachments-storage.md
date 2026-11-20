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
| T1 | S2, S3 (14–16) | worker: storage selection policy (complete/incomplete/missing matrix) + startup behavior, unit seam | fa1e5f6 |
| T2 | S2, S3 (13), dependency | worker: S3 adapter (@aws-sdk/client-s3) + MinIO dev service + upload/download e2e against MinIO | fa1e5f6 (adapter) + seaweedfs swap (owner decision L3); e2e landed with T3 |
| T3 | S1, S3 (11–13) | worker: F8 upload/download endpoints + internal-note isolation + portal wiring + journeys | 170943d |

## Log

L1 (verbatim): "organiza un goal para hacer todas las features pendientes, y orquestalo todo. El desarrollo que sea todo con deepseekv4-flash o hy4-flash ambos de nan.builders, vale?"

L2 (dependency authorization): the spec's F9 mandates an S3 adapter and dev MinIO; no S3 client exists in
the tree. `@aws-sdk/client-s3` is authorized as the single new dependency (standard, endpoint-compatible
with MinIO/R2/self-hosted). Docker dev gains a MinIO service with persistent volume, healthcheck, bucket
init, and app env vars per S2.

L3 (owner decision, 2026-11-20): Docker Hub rejects the pull of `minio/minio` from this network
("pull access denied ... repository does not exist"), so the dev S3 service is SeaweedFS
(`chrislusf/seaweedfs:latest`, image already local) instead of MinIO — owner selected it explicitly from
the locally available S3-compatible images. The S3 gateway (port 8333, host 9100) speaks the same
protocol the adapter targets; verified with a live SDK roundtrip: headBucket -> createBucket ->
put -> get against http://localhost:9100 with forcePathStyle. The spec's "MinIO" is satisfied in
intent by a real S3 service; swapping back to MinIO later is a compose-only change.

L4 (T3 evidence, worker + parent gates): commit 170943d — multipart upload (@fastify/multipart, one
spec-standard dependency), authorized download, visibility-filtered list; migration 028 adds attachment
visibility for Internal-Note isolation; object+metadata+audit lifecycle atomic; portal Attach control and
attachments list wired (5 keys x 9 locales). Two real defects fixed en route: LocalStorageAdapter.store
missing mkdir (ENOENT on first upload per Ticket) and the ticket list passing assignedTo: null which hid
every unassigned Ticket. 14 new browser journeys: slices 11-13 (13 against the dev SeaweedFS through a
scratch instance with the local volume asserted empty), validation rejections, internal-note isolation.
Final gates: Playwright 57/57, app 259/259, portal 13/13, typecheck 0, lint 0, build emits.
Environment incident (resolved): a stale Docker container (ticketos-app-e2e-1, baked image) silently
claimed port 3021 after the host dev process died; symptom = 404 on every new route + unrelated spec
failures. Fix: docker compose stop app-e2e + relaunch the source dev app; container stopped and must
stay stopped while host-driven e2e runs. Also: the repo's .gitignore was self-ignored and untracked
(fixed, now tracked with anchored dev-volume patterns).
