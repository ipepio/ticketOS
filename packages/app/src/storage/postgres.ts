import type { Pool } from 'pg';
import type { AttachmentModule, Attachment, CreateAttachmentInput } from '@ticketos/domain';
import type { UserId } from '@ticketos/shared';

/**
 * Attachment metadata persistence (F8/S1).
 *
 * The object bytes live in the storage adapter; this module owns only the row.
 * Two lifecycle guarantees are expressed here rather than in the route:
 *
 * - `createStoredAttachment` writes the metadata of an object that has already
 *   been stored, and accepts a transaction client so the route can commit the
 *   row together with its audit event.
 * - `getAttachmentForDownload` returns the stored object key, which never
 *   leaves the server: download stays an authorized endpoint (S1: "never a
 *   permanent public URL").
 */

/** S1: "Requesters cannot access Attachments belonging only to Internal Notes." */
export type AttachmentVisibility = 'public' | 'internal';

/** The metadata plus the visibility the requesting reader is allowed to see. */
export interface AttachmentWithVisibility extends Attachment {
  visibility: AttachmentVisibility;
}

export interface StoreAttachmentInput {
  ticketId: string;
  filename: string;
  mimeType: string;
  size: number;
  storageKey: string;
  uploaderId: UserId;
  visibility: AttachmentVisibility;
}

export interface DownloadableAttachment {
  attachment: AttachmentWithVisibility;
  storageKey: string;
}

/** The part of a `Pool`/`PoolClient` these queries need. */
export interface Queryable {
  query(text: string, values?: unknown[]): Promise<{ rows: any[] }>;
}

export class PostgresAttachment implements AttachmentModule {
  constructor(private pool: Pool) {}

  /** Lifecycle step 1 (unchanged): request metadata before a scan or upload. */
  async createAttachment(input: CreateAttachmentInput): Promise<AttachmentWithVisibility> {
    const { rows } = await this.pool.query(
      `INSERT INTO attachments (id, ticket_id, filename, mime_type, size, status, uploader_id, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, 'requested', $5, NOW(), NOW())
       RETURNING id, ticket_id, filename, mime_type, size, storage_key, status,
                 scan_result, visibility, uploader_id, created_at, updated_at`,
      [input.ticketId, input.filename, input.mimeType, input.size, input.uploaderId],
    );
    return this.mapAttachment(rows[0]!);
  }

  /**
   * Persist the metadata of an already-stored object.
   *
   * `executor` lets the caller run this insert inside the same transaction as
   * the audit event, so a failed upload leaves neither row nor audit trailer.
   */
  async createStoredAttachment(
    input: StoreAttachmentInput,
    executor: Queryable = this.pool,
  ): Promise<AttachmentWithVisibility> {
    const { rows } = await executor.query(
      `INSERT INTO attachments
         (id, ticket_id, filename, mime_type, size, storage_key, status, visibility, uploader_id, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, 'available', $6, $7, NOW(), NOW())
       RETURNING id, ticket_id, filename, mime_type, size, storage_key, status,
                 scan_result, visibility, uploader_id, created_at, updated_at`,
      [
        input.ticketId,
        input.filename,
        input.mimeType,
        input.size,
        input.storageKey,
        input.visibility,
        input.uploaderId,
      ],
    );
    return this.mapAttachment(rows[0]!);
  }

  async getAttachment(id: string): Promise<AttachmentWithVisibility | null> {
    const { rows } = await this.pool.query(
      `SELECT id, ticket_id, filename, mime_type, size, storage_key, status,
              scan_result, visibility, uploader_id, created_at, updated_at
         FROM attachments WHERE id = $1`,
      [id],
    );
    return rows.length === 0 ? null : this.mapAttachment(rows[0]!);
  }

  async listAttachments(ticketId: string): Promise<AttachmentWithVisibility[]> {
    const { rows } = await this.pool.query(
      `SELECT id, ticket_id, filename, mime_type, size, storage_key, status,
              scan_result, visibility, uploader_id, created_at, updated_at
         FROM attachments WHERE ticket_id = $1 ORDER BY created_at`,
      [ticketId],
    );
    return rows.map((r) => this.mapAttachment(r));
  }

  /**
   * List the Attachments a reader may see.
   *
   * Internal-Note Attachments are only returned when the reader holds
   * `tickets:internal-note` (S1). Deleted and rejected Attachments are never
   * returned: they no longer have readable content.
   */
  async listVisibleAttachments(
    ticketId: string,
    options: { includeInternal: boolean },
  ): Promise<AttachmentWithVisibility[]> {
    // The filter is a fixed predicate, not caller-authored SQL: a reader either
    // holds `tickets:internal-note` or sees public Attachments only.
    const sql = options.includeInternal
      ? `SELECT id, ticket_id, filename, mime_type, size, storage_key, status,
                scan_result, visibility, uploader_id, created_at, updated_at
           FROM attachments
          WHERE ticket_id = $1
            AND status IN ('available', 'requested', 'scanning', 'quarantine')
          ORDER BY created_at`
      : `SELECT id, ticket_id, filename, mime_type, size, storage_key, status,
                scan_result, visibility, uploader_id, created_at, updated_at
           FROM attachments
          WHERE ticket_id = $1
            AND status IN ('available', 'requested', 'scanning', 'quarantine')
            AND visibility = 'public'
          ORDER BY created_at`;
    const { rows } = await this.pool.query(sql, [ticketId]);
    return rows.map((r) => this.mapAttachment(r));
  }

  /**
   * Resolve one Attachment for an authorized download.
   *
   * Returns `null` when the row has no stored object (a lifecycle state such as
   * `requested`), so the route answers 404 rather than streaming nothing.
   */
  async getAttachmentForDownload(id: string): Promise<DownloadableAttachment | null> {
    const { rows } = await this.pool.query(
      `SELECT id, ticket_id, filename, mime_type, size, storage_key, status,
              scan_result, visibility, uploader_id, created_at, updated_at
         FROM attachments WHERE id = $1`,
      [id],
    );
    if (rows.length === 0) return null;
    const storageKey = rows[0]!.storage_key as string | null;
    if (!storageKey) return null;
    return { attachment: this.mapAttachment(rows[0]!), storageKey };
  }

  async markAvailable(id: string): Promise<void> {
    await this.pool.query(
      `UPDATE attachments SET status = 'available', updated_at = NOW() WHERE id = $1`,
      [id],
    );
  }

  async markRejected(id: string, reason: string): Promise<void> {
    await this.pool.query(
      `UPDATE attachments SET status = 'rejected', scan_result = $2, updated_at = NOW() WHERE id = $1`,
      [id, reason],
    );
  }

  async deleteAttachment(id: string): Promise<void> {
    await this.pool.query(
      `UPDATE attachments SET status = 'deleted', updated_at = NOW() WHERE id = $1`,
      [id],
    );
  }

  private mapAttachment(row: any): AttachmentWithVisibility {
    return {
      id: row.id,
      ticketId: row.ticket_id,
      filename: row.filename,
      mimeType: row.mime_type,
      size: Number(row.size),
      status: row.status,
      uploaderId: row.uploader_id,
      scanResult: row.scan_result,
      visibility: row.visibility ?? 'public',
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
