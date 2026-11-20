import { randomUUID } from 'node:crypto';
import {
  lstat,
  mkdir,
  writeFile,
} from 'node:fs/promises';
import { join } from 'node:path';
import process from 'node:process';
import { BffProblem } from '../http/bff-problem.js';

export interface IdentityMail {
  kind: 'verify-email' | 'reset-password';
  email: string;
  token: string;
}

export interface IdentityMailer {
  send(message: IdentityMail): Promise<void>;
}

export interface IdentityOptions {
  databaseUrl?: string;
  browserOrigin?: string;
  proxySecret?: string;
  secureCookies?: boolean;
  termsVersion?: string;
  mailer?: IdentityMailer;
  rateLimit?: { source: number; email: number };
}

export const IDENTITY_SETTINGS = Symbol('identity settings');

function fileMailer(directory: string, browserOrigin: string): IdentityMailer {
  return {
    async send(message) {
      await mkdir(directory, { recursive: true, mode: 0o700 });
      const status = await lstat(directory);
      if (!status.isDirectory() || (status.mode & 0o077) !== 0) {
        throw new BffProblem('DEPENDENCY_UNAVAILABLE');
      }

      const url = new URL(`/${message.kind}`, browserOrigin);
      url.hash = new URLSearchParams({ token: message.token }).toString();
      const filename = join(directory, `${Date.now()}-${randomUUID()}.json`);
      await writeFile(filename, JSON.stringify({ ...message, url: url.href }) + '\n', {
        encoding: 'utf8',
        flag: 'wx',
        mode: 0o600,
      });
    },
  };
}

export function identitySettings(options: IdentityOptions) {
  const production = process.env.NODE_ENV === 'production';
  const origin = new URL(options.browserOrigin ?? process.env.TROPIO_BROWSER_ORIGIN ?? 'http://127.0.0.1:3000');
  if (!['http:', 'https:'].includes(origin.protocol) || origin.username || origin.password) {
    throw new Error('Invalid Identity browser origin configuration');
  }

  const outbox = process.env.TROPIO_AUTH_OUTBOX_DIR;
  return {
    browserOrigin: origin.origin,
    proxySecret: options.proxySecret || process.env.TROPIO_BFF_PROXY_SECRET || undefined,
    databaseUrl: options.databaseUrl ?? process.env.TROPIO_IDENTITY_DATABASE_URL,
    secureCookies: production || options.secureCookies === true,
    mailer: options.mailer ?? (outbox && !production ? fileMailer(outbox, origin.origin) : undefined),
    termsVersion: options.termsVersion?.trim() || process.env.TROPIO_TERMS_VERSION?.trim()
      || (production ? undefined : 'local-development'),
    rateLimit: options.rateLimit ?? { source: 180, email: 8 },
  };
}

export type IdentitySettings = ReturnType<typeof identitySettings>;
