import type {
  Attachment,
  AuditModule,
  IdentityModule,
  StorageAdapter,
  TicketModule,
  WorkflowConfigurationModule,
  WorkspaceModule,
} from '@ticketos/domain';
import type { Role } from '@ticketos/shared';
import type { Config } from '../config.js';

/**
 * The modules the composition root injects into the route layer.
 *
 * `app.ts` is the only place that constructs a repository, the connection pool
 * or a gateway adapter (docs/architecture/structure.md). Routes therefore never
 * import them: they receive this bundle as an explicit registration argument,
 * which is also what removes the `app.ts -> routes/index.ts -> routes/*.ts ->
 * app.ts` module cycle — a route no longer imports the application module back.
 *
 * The contracts below are declared structurally on purpose: a route must not
 * import `<feature>/postgres.ts`, `db/connection.ts` or a feature gateway
 * adapter (docs/architecture/testing.md), so a type cannot be imported from
 * there either. Each one mirrors the adapter's public shape; the composition
 * root is where a drift would fail to typecheck.
 */

/** The session fields the route layer reads. */
export interface RouteSession {
  userId: string;
  workspaceId: string | null;
}

/**
 * The identity module as the routes use it: the domain contract plus the
 * session lifecycle the HTTP layer drives.
 */
export interface RouteIdentity extends IdentityModule {
  getSession(sessionId: string): Promise<RouteSession | null>;
  createSession(userId: string, workspaceId: string | null): Promise<string>;
  refreshSession(sessionId: string): Promise<void>;
  deleteSession(sessionId: string): Promise<void>;
}

/** Mirrors `OrganizationSummary` in `workspace/postgres.ts`. */
export interface OrganizationSummary {
  id: string;
  name: string;
  memberCount: number;
  createdAt: string;
}

/** Mirrors `WorkspaceMemberSummary` in `workspace/postgres.ts`. */
export interface WorkspaceMemberSummary {
  id: string;
  userId: string;
  email: string;
  name: string | null;
  role: Role;
  status: string;
  organizationId: string | null;
  organizationName: string | null;
  lastSeenAt: string | null;
  createdAt: string;
}

/**
 * The workspace module as the routes use it: the domain contract plus the
 * Workspace Admin read/write models and the first-run bootstrap the HTTP layer
 * drives.
 */
export interface RouteWorkspace extends WorkspaceModule {
  listOrganizationSummaries(workspaceId: string): Promise<OrganizationSummary[]>;
  createOrganizationSummary(workspaceId: string, name: string): Promise<OrganizationSummary>;
  listWorkspaceMemberSummaries(workspaceId: string): Promise<WorkspaceMemberSummary[]>;
  addWorkspaceMember(
    workspaceId: string,
    input: { email: string; name: string | null; role: Role; organizationId: string | null },
  ): Promise<{ id: string }>;
  updateWorkspaceMember(
    workspaceId: string,
    membershipId: string,
    input: {
      role?: Role;
      hasOrganizationId: boolean;
      organizationId?: string | null;
      status?: 'active' | 'inactive';
    },
  ): Promise<{ id: string } | null>;
  countWorkspaces(): Promise<number>;
  bootstrapInstallation(
    input: { workspaceName: string; adminEmail: string; timezone?: string },
    audit: AuditModule,
  ): Promise<{ workspaceId: string; sessionId: string }>;
}

/**
 * S1: "Requesters cannot access Attachments belonging only to Internal Notes."
 * Mirrors `AttachmentVisibility` in `storage/postgres.ts`.
 */
export type AttachmentVisibility = 'public' | 'internal';

/** The metadata plus the visibility the requesting reader is allowed to see. */
export type AttachmentWithVisibility = Attachment & { visibility: AttachmentVisibility };

/** Mirrors `DownloadableAttachment` in `storage/postgres.ts`. */
export interface DownloadableAttachment {
  attachment: AttachmentWithVisibility;
  storageKey: string;
}

/** Mirrors `StoreAttachmentInput` in `storage/postgres.ts`. */
export interface StoredAttachmentInput {
  ticketId: string;
  filename: string;
  mimeType: string;
  size: number;
  storageKey: string;
  uploaderId: string;
  visibility: AttachmentVisibility;
}

/** The Attachment metadata module as the routes use it. */
export interface StorageMetadataModule {
  createStoredAttachmentWithAudit(
    input: StoredAttachmentInput & { workspaceId: string },
  ): Promise<AttachmentWithVisibility>;
  listVisibleAttachments(
    ticketId: string,
    options: { includeInternal: boolean },
  ): Promise<AttachmentWithVisibility[]>;
  getAttachmentForDownload(id: string): Promise<DownloadableAttachment | null>;
}

/** The message the SMTP gateway delivers for a magic link. */
export interface MagicLinkEmail {
  to: string;
  verifyUrl: string;
}

/** The SMTP gateway itself, injected so a route never imports `email/`. */
export type SendMagicLinkEmail = (config: Config, message: MagicLinkEmail) => Promise<void>;

/** Everything a route registration needs, built once by `initApp`. */
export interface AppModules {
  readonly identity: RouteIdentity;
  readonly workspace: RouteWorkspace;
  readonly ticket: TicketModule;
  readonly audit: AuditModule;
  readonly workflowConfiguration: WorkflowConfigurationModule;
  readonly storageMetadata: StorageMetadataModule;
  readonly storageAdapter: StorageAdapter;
  readonly sendMagicLinkEmail: SendMagicLinkEmail;
}
