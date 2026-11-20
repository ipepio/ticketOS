import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  type BucketLocationConstraint,
} from '@aws-sdk/client-s3';
import type { StorageAdapter } from '@ticketos/domain';

/**
 * S3-compatible Attachment storage (F9).
 *
 * Works against AWS S3 and any endpoint-compatible service (MinIO, R2,
 * self-hosted): the endpoint and path-style addressing are explicit
 * configuration, never inferred.
 *
 * Invariant S4: this adapter never touches the filesystem. When the configured
 * service is unavailable the operation error propagates to the caller; there is
 * no local fallback path in this module.
 */
export interface S3StorageOptions {
  bucket: string;
  region: string;
  endpoint?: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle?: boolean;
}

function isNotFoundError(error: unknown): boolean {
  const candidate = error as {
    name?: string;
    Code?: string;
    $metadata?: { httpStatusCode?: number };
  } | null;
  if (!candidate) return false;
  return (
    candidate.name === 'NotFound' ||
    candidate.name === 'NoSuchBucket' ||
    candidate.name === 'NoSuchKey' ||
    candidate.Code === 'NotFound' ||
    candidate.Code === 'NoSuchBucket' ||
    candidate.Code === 'NoSuchKey' ||
    candidate.$metadata?.httpStatusCode === 404
  );
}

export class S3StorageAdapter implements StorageAdapter {
  readonly bucket: string;
  private readonly region: string;
  private readonly endpoint?: string;
  private readonly client: S3Client;

  constructor(options: S3StorageOptions) {
    this.bucket = options.bucket;
    this.region = options.region;
    this.endpoint = options.endpoint;
    this.client = new S3Client({
      region: options.region,
      ...(options.endpoint ? { endpoint: options.endpoint } : {}),
      forcePathStyle: options.forcePathStyle ?? false,
      credentials: {
        accessKeyId: options.accessKeyId,
        secretAccessKey: options.secretAccessKey,
      },
    });
  }

  /**
   * Bucket initialization: create the bucket when it does not exist yet.
   *
   * Runs at startup so a fresh development MinIO needs no extra tooling. Any
   * other failure — unreachable endpoint, bad credentials — propagates so
   * startup fails instead of continuing towards the local volume.
   */
  async initialize(): Promise<void> {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
      return;
    } catch (error) {
      if (!isNotFoundError(error)) throw error;
    }

    await this.client.send(
      new CreateBucketCommand({
        Bucket: this.bucket,
        // AWS requires the location constraint outside us-east-1; endpoint-
        // compatible services (MinIO) create the bucket without it.
        ...(this.endpoint === undefined && this.region !== 'us-east-1'
          ? {
              CreateBucketConfiguration: {
                LocationConstraint: this.region as BucketLocationConstraint,
              },
            }
          : {}),
      }),
    );
  }

  async store(input: { key: string; data: Buffer; mimeType: string }): Promise<string> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: input.key,
        Body: input.data,
        ContentType: input.mimeType,
        ContentLength: input.data.byteLength,
      }),
    );
    return input.key;
  }

  async retrieve(key: string): Promise<Buffer> {
    const response = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
    );
    if (!response.Body) {
      throw new Error(`S3 object body missing: s3://${this.bucket}/${key}`);
    }
    const bytes = await response.Body.transformToByteArray();
    return Buffer.from(bytes);
  }

  async delete(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
    );
  }

  async exists(key: string): Promise<boolean> {
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return true;
    } catch (error) {
      if (isNotFoundError(error)) return false;
      // Connectivity or credential failures are operation errors, not "absent".
      throw error;
    }
  }
}
