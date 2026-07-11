// ---------------------------------------------------------------------------
// Attachment domain interfaces (P0-06)
// ---------------------------------------------------------------------------

import type { UserId } from '@ticketos/shared';

export type AttachmentStatus = 'requested' | 'quarantine' | 'scanning' | 'available' | 'rejected' | 'deleted';

export interface Attachment {
  id: string;
  ticketId: string;
  filename: string;
  mimeType: string;
  size: number;
  status: AttachmentStatus;
  uploaderId: UserId;
  scanResult: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateAttachmentInput {
  ticketId: string;
  filename: string;
  mimeType: string;
  size: number;
  uploaderId: UserId;
}

export interface StorageAdapter {
  /** Store a file and return a stable key/ID */
  store(input: { key: string; data: Buffer; mimeType: string }): Promise<string>;

  /** Retrieve a file by its storage key */
  retrieve(key: string): Promise<Buffer>;

  /** Delete a file by its storage key */
  delete(key: string): Promise<void>;

  /** Check if a file exists */
  exists(key: string): Promise<boolean>;
}

export interface AttachmentModule {
  createAttachment(input: CreateAttachmentInput): Promise<Attachment>;
  getAttachment(id: string): Promise<Attachment | null>;
  listAttachments(ticketId: string): Promise<Attachment[]>;
  markAvailable(id: string): Promise<void>;
  markRejected(id: string, reason: string): Promise<void>;
  deleteAttachment(id: string): Promise<void>;
}
