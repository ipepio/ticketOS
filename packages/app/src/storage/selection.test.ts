import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  initializeAttachmentStorage,
  REQUIRED_S3_FIELDS,
  resolveStorageAdapter,
  StorageConfigurationError,
  type StorageSelectionConfig,
} from './selection.js';
import { S3StorageAdapter } from './s3.js';
import { LocalStorageAdapter } from './local.js';

/**
 * F9 (docs/specs/operational-portal-completion.md, S2/S3 slices 14–16):
 *
 * - "If a complete S3 configuration exists, use the S3 adapter."
 * - "If no complete S3 configuration exists, use the local-volume adapter."
 * - "An incomplete S3 configuration fails startup with a useful configuration
 *   error; it must not be treated as local mode."
 * - "A configured S3 adapter that becomes unavailable returns an operation
 *   error; it must not silently write to local storage."
 */

/** Every required S3 field, plus the optional endpoint/force-path-style ones. */
const COMPLETE_S3: StorageSelectionConfig = {
  ATTACHMENT_STORAGE_ADAPTER: 's3',
  ATTACHMENT_S3_BUCKET: 'ticketos-attachments',
  ATTACHMENT_S3_REGION: 'us-east-1',
  ATTACHMENT_S3_ENDPOINT: 'http://localhost:9100',
  ATTACHMENT_S3_ACCESS_KEY_ID: 'ticketos',
  ATTACHMENT_S3_SECRET_ACCESS_KEY: 'ticketos-dev-secret',
  ATTACHMENT_S3_FORCE_PATH_STYLE: 'true',
};

/** Complete S3 configuration without the adapter key (operator only set vars). */
const COMPLETE_S3_NO_ADAPTER_KEY: StorageSelectionConfig = {
  ATTACHMENT_S3_BUCKET: 'ticketos-attachments',
  ATTACHMENT_S3_REGION: 'us-east-1',
  ATTACHMENT_S3_ENDPOINT: 'http://localhost:9100',
  ATTACHMENT_S3_ACCESS_KEY_ID: 'ticketos',
  ATTACHMENT_S3_SECRET_ACCESS_KEY: 'ticketos-dev-secret',
};

/** A reachable-then-unreachable endpoint: nothing listens on TCP/9. */
const UNREACHABLE_S3: StorageSelectionConfig = {
  ...COMPLETE_S3,
  ATTACHMENT_S3_ENDPOINT: 'http://127.0.0.1:9',
};

const scratchDirs: string[] = [];

async function makeScratchDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ticketos-storage-selection-'));
  scratchDirs.push(dir);
  return dir;
}

/** Resolve the configuration error the policy must raise for `config`. */
function captureStorageError(
  config: StorageSelectionConfig,
): StorageConfigurationError {
  try {
    resolveStorageAdapter(config);
  } catch (error) {
    if (error instanceof StorageConfigurationError) return error;
    throw error;
  }
  throw new Error('resolveStorageAdapter did not fail');
}

afterEach(async () => {
  while (scratchDirs.length > 0) {
    const dir = scratchDirs.pop()!;
    await fs.rm(dir, { recursive: true, force: true });
  }
});

describe('resolveStorageAdapter — S3 selection matrix (slice 14)', () => {
  it('selects local storage when no S3 field is configured and no adapter is requested', () => {
    const resolved = resolveStorageAdapter({});

    expect(resolved.mode).toBe('local');
    expect(resolved.adapter).toBeInstanceOf(LocalStorageAdapter);
  });

  it('selects local storage when the adapter is explicitly local and no S3 field is configured', () => {
    const resolved = resolveStorageAdapter({ ATTACHMENT_STORAGE_ADAPTER: 'local' });

    expect(resolved.mode).toBe('local');
    expect(resolved.adapter).toBeInstanceOf(LocalStorageAdapter);
  });

  it('does not touch the filesystem while resolving local storage', async () => {
    const dir = path.join(await makeScratchDir(), 'attachments');

    resolveStorageAdapter({ ATTACHMENT_LOCAL_DIR: dir });

    await expect(fs.access(dir)).rejects.toThrow();
  });

  it('selects the S3 adapter when the complete S3 configuration is present', () => {
    const resolved = resolveStorageAdapter(COMPLETE_S3);

    expect(resolved.mode).toBe('s3');
    expect(resolved.adapter).toBeInstanceOf(S3StorageAdapter);
    expect(resolved.mode === 's3' ? resolved.bucket : null).toBe('ticketos-attachments');
  });

  it('selects the S3 adapter from a complete S3 configuration even without the adapter key', () => {
    // S2: "If a complete S3 configuration exists, use the S3 adapter."
    const resolved = resolveStorageAdapter(COMPLETE_S3_NO_ADAPTER_KEY);

    expect(resolved.mode).toBe('s3');
    expect(resolved.adapter).toBeInstanceOf(S3StorageAdapter);
  });

  it('treats the endpoint and force-path-style values as optional', () => {
    const withoutEndpoint: StorageSelectionConfig = { ...COMPLETE_S3 };
    delete withoutEndpoint.ATTACHMENT_S3_ENDPOINT;
    delete withoutEndpoint.ATTACHMENT_S3_FORCE_PATH_STYLE;

    expect(resolveStorageAdapter(withoutEndpoint).mode).toBe('s3');
  });
});

describe('resolveStorageAdapter — incomplete S3 configuration (slice 15)', () => {
  for (const field of REQUIRED_S3_FIELDS) {
    it(`fails with a configuration error naming ${field} when it is the only missing required field`, () => {
      const partial: StorageSelectionConfig = { ...COMPLETE_S3 };
      delete partial[field];

      const error = captureStorageError(partial);

      expect(error.missingFields).toEqual([field]);
      expect(error.message).toContain(field);
      expect(error.message).not.toMatch(/local-volume adapter selected/i);
    });
  }

  it('fails when the adapter is s3 and no S3 field is set, naming every required field', () => {
    const error = captureStorageError({ ATTACHMENT_STORAGE_ADAPTER: 's3' });

    expect(error.missingFields).toEqual([...REQUIRED_S3_FIELDS]);
    for (const field of REQUIRED_S3_FIELDS) {
      expect(error.message).toContain(field);
    }
    expect(error.message).toContain('ATTACHMENT_STORAGE_ADAPTER=s3');
  });

  it('fails on a partial S3 configuration even when the adapter key says local', () => {
    // A half-filled S3 configuration is an incomplete S3 configuration: it must
    // never be silently downgraded to local mode.
    const error = captureStorageError({
      ATTACHMENT_STORAGE_ADAPTER: 'local',
      ATTACHMENT_S3_BUCKET: 'ticketos-attachments',
      ATTACHMENT_S3_REGION: 'us-east-1',
    });

    expect(error.missingFields).toEqual([
      'ATTACHMENT_S3_ACCESS_KEY_ID',
      'ATTACHMENT_S3_SECRET_ACCESS_KEY',
    ]);
  });

  it('treats an empty string as a missing field', () => {
    const error = captureStorageError({ ...COMPLETE_S3, ATTACHMENT_S3_BUCKET: '' });

    expect(error.missingFields).toEqual(['ATTACHMENT_S3_BUCKET']);
  });
});

describe('initializeAttachmentStorage — startup behavior (slice 15)', () => {
  it('rejects an incomplete S3 configuration before creating any local directory', async () => {
    const baseDir = path.join(await makeScratchDir(), 'attachments');
    const incomplete: StorageSelectionConfig = {
      ...COMPLETE_S3,
      ATTACHMENT_LOCAL_DIR: baseDir,
    };
    delete incomplete.ATTACHMENT_S3_SECRET_ACCESS_KEY;

    await expect(initializeAttachmentStorage(incomplete)).rejects.toBeInstanceOf(
      StorageConfigurationError,
    );
    // Never treated as local mode: no local volume was prepared.
    await expect(fs.access(baseDir)).rejects.toThrow();
  });

  it('prepares the local Attachment volume for local mode', async () => {
    const baseDir = path.join(await makeScratchDir(), 'attachments');

    const resolved = await initializeAttachmentStorage({
      ATTACHMENT_STORAGE_ADAPTER: 'local',
      ATTACHMENT_LOCAL_DIR: baseDir,
    });

    expect(resolved.mode).toBe('local');
    const stat = await fs.stat(baseDir);
    expect(stat.isDirectory()).toBe(true);
  });
});

describe('S3 runtime failure (slice 16, S4)', () => {
  it('propagates the operation error and never writes to local storage', async () => {
    const localDir = path.join(await makeScratchDir(), 'attachments');
    const config: StorageSelectionConfig = {
      ...UNREACHABLE_S3,
      ATTACHMENT_LOCAL_DIR: localDir,
    };

    const resolved = resolveStorageAdapter(config);
    expect(resolved.mode).toBe('s3');
    expect(resolved.adapter).not.toBeInstanceOf(LocalStorageAdapter);

    await expect(
      resolved.adapter.store({
        key: 'tickets/t1/report.pdf',
        data: Buffer.from('attachment bytes'),
        mimeType: 'application/pdf',
      }),
    ).rejects.toThrow();

    await expect(resolved.adapter.retrieve('tickets/t1/report.pdf')).rejects.toThrow();
    await expect(resolved.adapter.delete('tickets/t1/report.pdf')).rejects.toThrow();

    // No silent local fallback: the local Attachment volume stayed untouched.
    await expect(fs.readdir(localDir)).rejects.toThrow();
  });

  it('fails startup when the configured S3 endpoint is unreachable', async () => {
    // Bucket initialization is part of startup: an unavailable S3 endpoint must
    // surface there instead of degrading to local mode.
    await expect(initializeAttachmentStorage(UNREACHABLE_S3)).rejects.toThrow();
  });
});
