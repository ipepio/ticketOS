import type { Pool } from 'pg';
import type { AttachmentModule, Attachment, CreateAttachmentInput } from '@ticketos/domain';

export class PostgresAttachment implements AttachmentModule {
  constructor(private pool: Pool) {}

  async createAttachment(input: CreateAttachmentInput): Promise<Attachment> {
    const { rows } = await this.pool.query(
      `INSERT INTO attachments (id, ticket_id, filename, mime_type, size, status, uploader_id, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, 'requested', $5, NOW(), NOW())
       RETURNING id, ticket_id, filename, mime_type, size, status, uploader_id, scan_result, created_at, updated_at`,
      [input.ticketId, input.filename, input.mimeType, input.size, input.uploaderId],
    );
    return this.mapAttachment(rows[0]!);
  }

  async getAttachment(id: string): Promise<Attachment | null> {
    const { rows } = await this.pool.query(
      `SELECT id, ticket_id, filename, mime_type, size, status, uploader_id, scan_result, created_at, updated_at
       FROM attachments WHERE id = $1`,
      [id],
    );
    return rows.length === 0 ? null : this.mapAttachment(rows[0]!);
  }

  async listAttachments(ticketId: string): Promise<Attachment[]> {
    const { rows } = await this.pool.query(
      `SELECT id, ticket_id, filename, mime_type, size, status, uploader_id, scan_result, created_at, updated_at
       FROM attachments WHERE ticket_id = $1 ORDER BY created_at`,
      [ticketId],
    );
    return rows.map((r) => this.mapAttachment(r));
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

  private mapAttachment(row: any): Attachment {
    return {
      id: row.id,
      ticketId: row.ticket_id,
      filename: row.filename,
      mimeType: row.mime_type,
      size: Number(row.size),
      status: row.status,
      uploaderId: row.uploader_id,
      scanResult: row.scan_result,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
