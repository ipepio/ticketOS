import type { Config } from '../config.js';
import { LocalStorageAdapter } from './local.js';
import { S3StorageAdapter } from './s3.js';

/**
 * Attachment storage selection policy (F9 in docs/specs/operational-portal-completion.md).
 *
 * S2, verbatim:
 * - "If a complete S3 configuration exists, use the S3 adapter."
 * - "If no complete S3 configuration exists, use the local-volume adapter."
 * - "An incomplete S3 configuration fails startup with a useful configuration
 *   error; it must not be treated as local mode."
 * - "A configured S3 adapter that becomes unavailable returns an operation
 *   error; it must not silently write to local storage."
 *
 * The policy is therefore:
 *   1. every required S3 field set        -> S3 adapter
 *   2. no required S3 field set           -> local-volume adapter
 *   3. anything in between (some fields, or ATTACHMENT_STORAGE_ADAPTER=s3 with
 *      no fields at all)                  -> StorageConfigurationError
 *
 * `resolveStorageAdapter` is pure: it only builds adapter objects (neither
 * constructor performs I/O), so the matrix is unit-testable without a database,
 * a network or a filesystem. I/O belongs to `initializeAttachmentStorage`,
 * which the application composition root awaits at startup.
 */

/** Fields that must all be present before the S3 adapter can be used. */
export const REQUIRED_S3_FIELDS = [
  'ATTACHMENT_S3_BUCKET',
  'ATTACHMENT_S3_REGION',
  'ATTACHMENT_S3_ACCESS_KEY_ID',
  'ATTACHMENT_S3_SECRET_ACCESS_KEY',
] as const;

export type RequiredS3Field = (typeof REQUIRED_S3_FIELDS)[number];

/** The Config fields the storage decision depends on; all optional so the
 * selection matrix is testable from configuration literals. */
export type StorageSelectionConfig = Partial<
  Pick<
    Config,
    | 'ATTACHMENT_STORAGE_ADAPTER'
    | 'ATTACHMENT_LOCAL_DIR'
    | RequiredS3Field
    | 'ATTACHMENT_S3_ENDPOINT'
    | 'ATTACHMENT_S3_FORCE_PATH_STYLE'
  >
>;

export type StorageMode = 'local' | 's3';

export type ResolvedStorage =
  | { mode: 'local'; adapter: LocalStorageAdapter }
  | { mode: 's3'; adapter: S3StorageAdapter; bucket: string };

export class StorageConfigurationError extends Error {
  readonly missingFields: RequiredS3Field[];

  constructor(missingFields: RequiredS3Field[], requestedByAdapterKey: boolean) {
    const subject = requestedByAdapterKey
      ? 'ATTACHMENT_STORAGE_ADAPTER=s3 requires a complete S3 configuration'
      : 'the configured S3 settings are incomplete';
    super(
      `Invalid attachment storage configuration: ${subject}. ` +
        `Missing: ${missingFields.join(', ')}. ` +
        `Set every required field (${REQUIRED_S3_FIELDS.join(', ')}) to use S3, ` +
        `or unset all ATTACHMENT_S3_* variables to use the local Attachment volume. ` +
        `Startup aborted: an incomplete S3 configuration is never treated as local mode.`,
    );
    this.name = 'StorageConfigurationError';
    this.missingFields = missingFields;
  }
}

function isConfigured(value: string | undefined): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

export function resolveStorageAdapter(config: StorageSelectionConfig): ResolvedStorage {
  const adapterKeyRequestsS3 = config.ATTACHMENT_STORAGE_ADAPTER === 's3';
  const missing = REQUIRED_S3_FIELDS.filter((field) => !isConfigured(config[field]));
  const configured = REQUIRED_S3_FIELDS.filter((field) => isConfigured(config[field]));

  if (missing.length === 0) {
    return {
      mode: 's3',
      bucket: config.ATTACHMENT_S3_BUCKET as string,
      adapter: new S3StorageAdapter({
        bucket: config.ATTACHMENT_S3_BUCKET as string,
        region: config.ATTACHMENT_S3_REGION as string,
        endpoint: isConfigured(config.ATTACHMENT_S3_ENDPOINT)
          ? config.ATTACHMENT_S3_ENDPOINT
          : undefined,
        accessKeyId: config.ATTACHMENT_S3_ACCESS_KEY_ID as string,
        secretAccessKey: config.ATTACHMENT_S3_SECRET_ACCESS_KEY as string,
        forcePathStyle: config.ATTACHMENT_S3_FORCE_PATH_STYLE === 'true',
      }),
    };
  }

  if (configured.length > 0 || adapterKeyRequestsS3) {
    throw new StorageConfigurationError(missing, adapterKeyRequestsS3);
  }

  return {
    mode: 'local',
    adapter: new LocalStorageAdapter(
      isConfigured(config.ATTACHMENT_LOCAL_DIR) ? config.ATTACHMENT_LOCAL_DIR : undefined,
    ),
  };
}

/**
 * Composition step used by `initApp`: resolve the adapter and prepare it.
 *
 * Local mode creates the Attachment volume directory; S3 mode initializes the
 * bucket. Configuration errors and S3 connection errors both reject, so the
 * application never starts against an incomplete configuration or a missing
 * service.
 */
export async function initializeAttachmentStorage(
  config: StorageSelectionConfig,
): Promise<ResolvedStorage> {
  const resolved = resolveStorageAdapter(config);

  if (resolved.mode === 's3') {
    await resolved.adapter.initialize();
    return resolved;
  }

  await resolved.adapter.ensureDir();
  return resolved;
}
