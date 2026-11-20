import { isIPv4 } from 'node:net';
import process from 'node:process';
import pg from 'pg';
import { isLoopbackHost } from '../../shared/loopback-host.mts';
import {
  hashPassword,
  matchesPassword,
} from '../src/identity/identity-crypto.ts';

interface DemoAccount {
  id: string;
  email: string;
  password?: string;
  displayName: string;
}

interface LocalEndpoints {
  browserOrigin?: string;
  bffHost?: string;
  bffBaseUrl?: string;
}

function isDatabaseLoopback(host: string) {
  return host === 'localhost' || host === '::1' || host === '[::1]' || (isIPv4(host) && host.startsWith('127.'));
}

export function allowLocalDemoData(databaseUrls: string[], {
  browserOrigin = process.env.TROPIO_BROWSER_ORIGIN || 'http://127.0.0.1:3000',
  bffHost = process.env.BFF_HOST || '127.0.0.1',
  bffBaseUrl = process.env.NUXT_BFF_BASE_URL || 'http://127.0.0.1:3001',
}: LocalEndpoints = {}) {
  if (!isLoopbackHost(bffHost) || !isLoopbackHost(new URL(browserOrigin).hostname)
    || !isLoopbackHost(new URL(bffBaseUrl).hostname)) {
    return false;
  }
  return databaseUrls.every(url => isDatabaseLoopback(new pg.Client({ connectionString: url }).host));
}

export async function ensureLocalDemoAccount(databaseUrl: string, account: DemoAccount, endpoints?: LocalEndpoints) {
  if (!allowLocalDemoData([databaseUrl], endpoints)) {
    return false;
  }
  const client = new pg.Client({ connectionString: databaseUrl, connectionTimeoutMillis: 5000, statement_timeout: 5000 });
  client.on('error', () => {});
  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query('SET LOCAL ROLE tropio_identity_runtime');
    await client.query('SET LOCAL search_path TO pg_catalog');
    await client.query(
      `WITH created AS (
         INSERT INTO identity.users (id, email_normalized, email_verified_at, display_name, avatar_asset_id)
         SELECT $1, $2, now(), $3, a.id
         FROM identity.avatar_assets a JOIN identity.avatar_collections c ON c.id = a.collection_id
         WHERE a.active AND c.status = 'active'
         ORDER BY a.object_key, a.id LIMIT 1
         ON CONFLICT DO NOTHING RETURNING id
       )
       INSERT INTO identity.user_consents (user_id, document_code, document_version)
       SELECT id, 'terms', 'local-development' FROM created WHERE $4`,
      [account.id, account.email, account.displayName, account.password !== undefined],
    );
    const { rows: [user] } = await client.query<{ password_hash: string | null }>(
      `SELECT password_hash FROM identity.users
       WHERE id = $1 AND email_normalized = $2 AND status = 'active' AND email_verified_at IS NOT NULL
       FOR UPDATE`,
      [account.id, account.email],
    );
    if (!user) {
      throw new Error('Не удалось подготовить тестовый аккаунт. Проверь коллизию UUID или email, статус и системные аватары.');
    }
    if (account.password === undefined && user.password_hash !== null) {
      throw new Error('Профиль тестового организатора уже используется для входа.');
    }
    if (account.password !== undefined && (!user.password_hash || !await matchesPassword(account.password, user.password_hash))) {
      await client.query(
        'UPDATE identity.users SET password_hash = $2, updated_at = clock_timestamp() WHERE id = $1',
        [account.id, await hashPassword(account.password)],
      );
    }
    await client.query('COMMIT');
    return true;
  }
  catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
  finally {
    await client.end();
  }
}
