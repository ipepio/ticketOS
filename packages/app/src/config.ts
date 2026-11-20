import { z } from 'zod';

// Environment variables are strings: Boolean('false') is true, so Zod's
// coerce.boolean() is unsafe for SMTP/IMAP TLS flags.
const environmentBoolean = z.preprocess(
  (value) => value === 'true' ? true : value === 'false' ? false : value,
  z.boolean(),
);

export const configSchema = z.object({
  DATABASE_URL: z.string().url(),
  ATTACHMENT_STORAGE_ADAPTER: z.enum(['local', 's3']).default('local'),
  ATTACHMENT_LOCAL_DIR: z.string().default('./storage/attachments'),
  ATTACHMENT_S3_BUCKET: z.string().optional(),
  ATTACHMENT_S3_REGION: z.string().optional(),
  ATTACHMENT_S3_ENDPOINT: z.string().optional(),
  ATTACHMENT_S3_ACCESS_KEY_ID: z.string().optional(),
  ATTACHMENT_S3_SECRET_ACCESS_KEY: z.string().optional(),
  ATTACHMENT_S3_FORCE_PATH_STYLE: z
    .enum(['true', 'false'])
    .optional()
    .default('false'),
  SMTP_HOST: z.string().default('localhost'),
  SMTP_PORT: z.coerce.number().default(1025),
  SMTP_SECURE: environmentBoolean.default(false),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  SMTP_FROM: z.string().email().default('no-reply@ticketos.local'),
  IMAP_HOST: z.string().optional(),
  IMAP_PORT: z.coerce.number().optional(),
  IMAP_SECURE: environmentBoolean.optional(),
  IMAP_USER: z.string().optional(),
  IMAP_PASSWORD: z.string().optional(),
  OIDC_ISSUER: z.string().optional(),
  OIDC_CLIENT_ID: z.string().optional(),
  OIDC_CLIENT_SECRET: z.string().optional(),
  OIDC_SCOPES: z.string().optional().default('openid email profile'),
  SESSION_SECRET: z.string().min(32),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().default(3000),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  PUBLIC_APP_URL: z.string().url().default('http://localhost:5173'),
  CORRELATION_ID_HEADER: z.string().default('X-Correlation-Id'),
  LOG_LEVEL: z
    .enum(['silent', 'fatal', 'error', 'warn', 'info', 'debug', 'trace'])
    .default('info'),
  REPLY_TOKEN_SECRET: z.string().min(32),
});

export type Config = z.infer<typeof configSchema>;

export function loadConfig(): Config {
  const raw: Record<string, string | undefined> = {};
  for (const key of configSchema.keyof().options) {
    raw[key] = process.env[key];
  }

  const parsed = configSchema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    if (first) {
      throw new Error(
        `Invalid required configuration: ${first.path.join('.')} — ${first.message}`,
      );
    }
    throw new Error('Invalid configuration');
  }

  return parsed.data;
}
