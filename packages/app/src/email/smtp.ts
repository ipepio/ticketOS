import nodemailer from 'nodemailer';
import type { Config } from '../config.js';

export interface MagicLinkEmail {
  to: string;
  verifyUrl: string;
}

/** Deliver an authentication link through the installation's SMTP adapter. */
export async function sendMagicLinkEmail(
  config: Config,
  message: MagicLinkEmail,
): Promise<void> {
  const transport = nodemailer.createTransport({
    host: config.SMTP_HOST,
    port: config.SMTP_PORT,
    secure: config.SMTP_SECURE,
    auth: config.SMTP_USER && config.SMTP_PASSWORD
      ? { user: config.SMTP_USER, pass: config.SMTP_PASSWORD }
      : undefined,
  });

  await transport.sendMail({
    from: config.SMTP_FROM,
    to: message.to,
    subject: 'Sign in to ticketOS',
    text: `Use this link to sign in to ticketOS:\n\n${message.verifyUrl}\n\nThis link expires in one hour.`,
    html: `<p>Use this link to sign in to ticketOS:</p><p><a href="${message.verifyUrl}">Sign in to ticketOS</a></p><p>This link expires in one hour.</p>`,
  });
}
