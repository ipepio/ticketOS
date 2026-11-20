import { randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import multipart from '@fastify/multipart';
import { z } from 'zod';
import type { Ticket } from '@ticketos/domain';
import { getIdentity, getStorage, getTicket } from '../app.js';
import { getPool } from '../db/connection.js';
import { PostgresAudit } from '../db/audit.js';
import {
  PostgresAttachment,
  type AttachmentVisibility,
  type AttachmentWithVisibility,
} from '../storage/postgres.js';

/**
 * Attachment routes — F8/S1 in docs/specs/operational-portal-completion.md.
 *
 * S1, verbatim:
 * - "A permitted User can add one or more Attachments to a Ticket."
 * - "The server validates size, content type, blocked extensions, Ticket
 *   access, and Workspace scope."
 * - "Attachment metadata and object lifecycle remain consistent if upload
 *   fails."
 * - "Download uses an authorized endpoint or short-lived authorized URL; never
 *   a permanent public URL."
 * - "Requesters cannot access Attachments belonging only to Internal Notes."
 *
 * Transport is multipart/form-data: an Attachment is a file, and multipart is
 * the only browser-native way to stream one without inflating it in the JSON
 * envelope. The parser is @fastify/multipart, configured with an explicit size
 * limit so an oversize body is refused while it is still being read, before any
 * object or row exists.
 */

/**
 * Upload size limit. 10 MB is the default this feature ships with: large enough
 * for screenshots, logs and PDFs on a support Ticket, small enough that a
 * single request cannot exhaust the application's memory.
 */
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

/**
 * Executable and otherwise dangerous extensions (S1: "blocked extensions").
 * Refused regardless of the declared content type: the extension is what a
 * user's operating system acts on.
 */
export const BLOCKED_ATTACHMENT_EXTENSIONS = [
  'ade', 'adp', 'app', 'bat', 'cmd', 'com', 'cpl', 'dll', 'exe', 'gadget',
  'hta', 'inf', 'ins', 'isp', 'jar', 'js', 'jse', 'lnk', 'msc', 'msi', 'msp',
  'mst', 'pif', 'ps1', 'ps2', 'psc1', 'psd1', 'psm1', 'reg', 'scf', 'scr',
  'sct', 'shb', 'shs', 'sys', 'vb', 'vbe', 'vbs', 'vxd', 'ws', 'wsf', 'wsh',
] as const;

const BLOCKED_EXTENSIONS = new Set<string>(BLOCKED_ATTACHMENT_EXTENSIONS);

/**
 * Content types that mark an executable or active payload (S1: "blocked
 * extensions" is extended by content type so a renamed file is still refused).
 * Everything else that is syntactically a media type is accepted — the server
 * has no allow-list to maintain, and the object is never served inline.
 */
export const BLOCKED_ATTACHMENT_MIME_TYPES = new Set([
  'application/bat',
  'application/hta',
  'application/java-archive',
  'application/vnd.android.package-archive',
  'application/vnd.microsoft.portable-executable',
  'application/x-bat',
  'application/x-dosexec',
  'application/x-executable',
  'application/x-mach-binary',
  'application/x-msdos-program',
  'application/x-msdownload',
  'application/x-msi',
  'application/x-sh',
  'application/x-shockwave-flash',
  'text/x-shellscript',
]);

const MIME_TYPE_PATTERN = /^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/i;

const VISIBILITIES: readonly AttachmentVisibility[] = ['public', 'internal'];

interface RequestContext {
  userId: string;
  workspaceId: string;
}

/** Session + active Workspace, answering 401/400 itself when absent. */
async function requireSession(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<RequestContext | null> {
  const sessionId = request.cookies.sessionId;
  if (!sessionId) {
    await reply.status(401).send({ error: 'Authentication required' });
    return null;
  }

  const identity = getIdentity();
  const session = await identity.getSession(sessionId);
  if (!session) {
    await reply.status(401).send({ error: 'Session expired' });
    return null;
  }

  if (!session.workspaceId) {
    await reply.status(400).send({ error: 'No workspace selected' });
    return null;
  }

  return { userId: session.userId, workspaceId: session.workspaceId };
}

/**
 * Ticket access (S1) and Workspace scope (S1): the Ticket is looked up inside
 * the caller's active Workspace, so another Workspace's Ticket is a 404 before
 * any Attachment is considered.
 */
async function requireTicket(
  ticketId: string,
  context: RequestContext,
  reply: FastifyReply,
): Promise<Ticket | null> {
  if (!z.string().uuid().safeParse(ticketId).success) {
    await reply.status(400).send({ error: 'Invalid Ticket id format' });
    return null;
  }

  const ticket = await getTicket().getTicket(context.workspaceId, ticketId);
  if (!ticket) {
    await reply.status(404).send({ error: 'Ticket not found' });
    return null;
  }
  return ticket;
}

/** The filename a user sees: no directory component, no control characters. */
function sanitizeFilename(raw: string): string {
  const base = raw.split(/[\\/]/).pop() ?? '';
  const cleaned = base.replace(/[\u0000-\u001f\u007f]/g, '').trim();
  return cleaned.slice(0, 200);
}

function extensionOf(filename: string): string {
  const dot = filename.lastIndexOf('.');
  return dot === -1 ? '' : filename.slice(dot + 1).toLowerCase();
}

/**
 * An authorized download is a file response, never an inline one: the browser
 * must not render an uploaded document in the application's origin.
 */
function contentDisposition(filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

function isMissingObjectError(error: unknown): boolean {
  const candidate = error as {
    code?: string;
    name?: string;
    $metadata?: { httpStatusCode?: number };
  } | null;
  if (!candidate) return false;
  return (
    candidate.code === 'ENOENT' ||
    candidate.name === 'NoSuchKey' ||
    candidate.name === 'NotFound' ||
    candidate.$metadata?.httpStatusCode === 404
  );
}

export async function registerAttachmentRoutes(
  fastify: FastifyInstance,
  _config: unknown,
): Promise<void> {
  // The limit is enforced while the body is read, so an oversize upload never
  // reaches the storage adapter. `throwFileSizeLimit: false` lets the handler
  // answer with a stable 413 payload instead of the plugin's default error.
  await fastify.register(multipart, {
    limits: { fileSize: MAX_ATTACHMENT_BYTES, files: 1, fields: 16, parts: 32 },
    throwFileSizeLimit: false,
  });

  const repository = (): PostgresAttachment => new PostgresAttachment(getPool());

  // -------------------------------------------------------------------------
  // POST /api/tickets/:id/attachments — upload (S1)
  // -------------------------------------------------------------------------
  fastify.post('/api/tickets/:id/attachments', async (request, reply) => {
    const context = await requireSession(request, reply);
    if (!context) return;

    const ticketId = (request.params as { id: string }).id;
    const ticket = await requireTicket(ticketId, context, reply);
    if (!ticket) return;

    const identity = getIdentity();
    if (
      !(await identity.hasCapability(context.userId, ticket.workspaceId, 'tickets:attach'))
    ) {
      return reply.status(403).send({ error: 'Access denied' });
    }

    let buffer: Buffer | null = null;
    let filename = '';
    let mimeType = '';
    let truncated = false;
    const fields: Record<string, string> = {};

    try {
      for await (const part of request.parts()) {
        if (part.type === 'file') {
          if (buffer !== null) {
            return reply.status(400).send({
              error: 'Exactly one file may be uploaded per request',
              code: 'multiple-files',
            });
          }
          buffer = await part.toBuffer();
          truncated = part.file.truncated;
          filename = part.filename ?? '';
          mimeType = (part.mimetype ?? '').toLowerCase();
        } else {
          fields[part.fieldname] = String(part.value);
        }
      }
    } catch (error) {
      request.log.warn({ err: error }, 'malformed multipart upload');
      return reply.status(400).send({
        error: 'Malformed multipart upload',
        code: 'invalid-multipart',
      });
    }

    if (!buffer) {
      return reply.status(400).send({ error: 'A file part is required', code: 'file-required' });
    }

    if (truncated || buffer.byteLength > MAX_ATTACHMENT_BYTES) {
      return reply.status(413).send({
        error: `Attachment exceeds the ${MAX_ATTACHMENT_BYTES} byte limit`,
        code: 'file-too-large',
      });
    }

    const safeFilename = sanitizeFilename(filename);
    if (safeFilename === '') {
      return reply.status(400).send({ error: 'A filename is required', code: 'filename-required' });
    }

    const extension = extensionOf(safeFilename);
    if (BLOCKED_EXTENSIONS.has(extension)) {
      return reply.status(400).send({
        error: `The "${extension}" extension is not allowed`,
        code: 'blocked-extension',
      });
    }

    if (!MIME_TYPE_PATTERN.test(mimeType)) {
      return reply.status(415).send({
        error: 'A media content type is required',
        code: 'invalid-content-type',
      });
    }

    if (BLOCKED_ATTACHMENT_MIME_TYPES.has(mimeType)) {
      return reply.status(400).send({
        error: `The "${mimeType}" content type is not allowed`,
        code: 'blocked-content-type',
      });
    }

    const requestedVisibility = (fields.visibility ?? 'public').trim().toLowerCase();
    if (!VISIBILITIES.includes(requestedVisibility as AttachmentVisibility)) {
      return reply.status(400).send({
        error: 'visibility must be "public" or "internal"',
        code: 'invalid-visibility',
      });
    }
    const visibility = requestedVisibility as AttachmentVisibility;

    // S1: an Attachment belonging only to an Internal Note is created by, and
    // readable to, readers holding `tickets:internal-note`.
    if (
      visibility === 'internal' &&
      !(await identity.hasCapability(context.userId, ticket.workspaceId, 'tickets:internal-note'))
    ) {
      return reply.status(403).send({ error: 'Access denied' });
    }

    const attachmentId = randomUUID();
    const storageKey = `attachments/${ticketId}/${attachmentId}`;
    const storage = getStorage();

    // 1. Store the object. Nothing is written to the database until this
    //    succeeds, so a storage failure leaves no metadata behind.
    await storage.adapter.store({ key: storageKey, data: buffer, mimeType });

    // 2. Metadata and audit commit together. If either fails, the object is
    //    removed before the request fails, so an upload can never leave an
    //    orphan object (S1: metadata and object lifecycle stay consistent).
    const created = await (async (): Promise<AttachmentWithVisibility> => {
      const pool = getPool();
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const row = await repository().createStoredAttachment(
          {
            ticketId,
            filename: safeFilename,
            mimeType,
            size: buffer.byteLength,
            storageKey,
            uploaderId: context.userId,
            visibility,
          },
          client,
        );
        await new PostgresAudit(pool).appendViaClient(client, {
          kind: 'attachment-uploaded',
          actorUserId: context.userId,
          workspaceId: ticket.workspaceId,
          details: {
            ticketId,
            attachmentId: row.id,
            filename: safeFilename,
            mimeType,
            size: buffer.byteLength,
            visibility,
            storageKey,
          },
        });
        await client.query('COMMIT');
        return row;
      } catch (error) {
        await client.query('ROLLBACK').catch(() => undefined);
        await storage.adapter.delete(storageKey).catch((cleanupError: unknown) => {
          request.log.error(
            { err: cleanupError, storageKey },
            'failed to remove an orphaned Attachment object after a metadata failure',
          );
        });
        throw error;
      } finally {
        client.release();
      }
    })();

    return reply.status(201).send(created);
  });

  // -------------------------------------------------------------------------
  // GET /api/tickets/:id/attachments — list what this reader may see
  // -------------------------------------------------------------------------
  fastify.get('/api/tickets/:id/attachments', async (request, reply) => {
    const context = await requireSession(request, reply);
    if (!context) return;

    const ticketId = (request.params as { id: string }).id;
    const ticket = await requireTicket(ticketId, context, reply);
    if (!ticket) return;

    const identity = getIdentity();
    if (
      !(await identity.hasCapability(context.userId, ticket.workspaceId, 'tickets:read'))
    ) {
      return reply.status(403).send({ error: 'Access denied' });
    }

    const canSeeInternal = await identity.hasCapability(
      context.userId,
      ticket.workspaceId,
      'tickets:internal-note',
    );

    const attachments = await repository().listVisibleAttachments(ticketId, {
      includeInternal: canSeeInternal,
    });
    return reply.send(attachments);
  });

  // -------------------------------------------------------------------------
  // GET /api/tickets/:id/attachments/:attachmentId — authorized download (S1)
  // -------------------------------------------------------------------------
  fastify.get('/api/tickets/:id/attachments/:attachmentId', async (request, reply) => {
    const context = await requireSession(request, reply);
    if (!context) return;

    const { id: ticketId, attachmentId } = request.params as {
      id: string;
      attachmentId: string;
    };
    const ticket = await requireTicket(ticketId, context, reply);
    if (!ticket) return;

    const identity = getIdentity();
    if (
      !(await identity.hasCapability(context.userId, ticket.workspaceId, 'tickets:read'))
    ) {
      return reply.status(403).send({ error: 'Access denied' });
    }

    if (!z.string().uuid().safeParse(attachmentId).success) {
      return reply.status(400).send({ error: 'Invalid Attachment id format' });
    }

    const found = await repository().getAttachmentForDownload(attachmentId);
    // The Attachment must belong to *this* Ticket: an id from another Ticket or
    // another Workspace is indistinguishable from a missing one.
    if (!found || found.attachment.ticketId !== ticketId) {
      return reply.status(404).send({ error: 'Attachment not found' });
    }
    if (found.attachment.status !== 'available') {
      return reply.status(404).send({ error: 'Attachment not found' });
    }

    if (
      found.attachment.visibility === 'internal' &&
      !(await identity.hasCapability(context.userId, ticket.workspaceId, 'tickets:internal-note'))
    ) {
      return reply.status(403).send({ error: 'Access denied' });
    }

    let data: Buffer;
    try {
      data = await getStorage().adapter.retrieve(found.storageKey);
    } catch (error) {
      if (isMissingObjectError(error)) {
        return reply.status(404).send({
          error: 'Attachment content not found',
          code: 'object-missing',
        });
      }
      request.log.error(
        { err: error, storageKey: found.storageKey },
        'attachment storage could not serve an object',
      );
      return reply.status(502).send({
        error: 'Attachment storage is unavailable',
        code: 'storage-error',
      });
    }

    reply.header('Content-Type', found.attachment.mimeType);
    reply.header('Content-Length', String(data.byteLength));
    reply.header('Content-Disposition', contentDisposition(found.attachment.filename));
    // S1: never a permanent public URL — the bytes are private, per-request and
    // not cached by any intermediary.
    reply.header('Cache-Control', 'private, no-store');
    reply.header('X-Content-Type-Options', 'nosniff');
    return reply.send(data);
  });
}
