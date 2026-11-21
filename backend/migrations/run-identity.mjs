import {
  spawn,
  spawnSync,
} from 'node:child_process';
import { warn } from 'node:console';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { resolve } from 'node:path';
import process from 'node:process';
import {
  fileURLToPath,
  URL,
} from 'node:url';
import { allowLocalDemoData } from '../local/demo-account.mts';
import { applyLocalDemoData } from '../local/demo-data.mts';
import { composeSql } from './compose-sql.mjs';
import { applyMigrations } from './migrate.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const services = ['identity', 'travel', 'geo', 'social'];

function postgresEndpoint() {
  const result = spawnSync('docker', ['compose', 'port', 'postgres', '5432'], {
    cwd: root,
    encoding: 'utf8',
  });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error('Запусти PostgreSQL командой docker compose up -d --wait postgres');
  }

  return new URL(`postgresql://${result.stdout.trim()}`);
}

async function runPnpm(args, env) {
  const child = spawn('pnpm', args, { cwd: root, env: { ...process.env, ...env }, stdio: 'inherit' });
  const interrupt = () => child.kill('SIGINT');
  const terminate = () => child.kill('SIGTERM');

  process.on('SIGINT', interrupt);
  process.on('SIGTERM', terminate);
  try {
    const [code, signal] = await once(child, 'exit');
    return code ?? (signal === 'SIGINT' ? 130 : 1);
  }
  finally {
    process.off('SIGINT', interrupt);
    process.off('SIGTERM', terminate);
  }
}

async function withLocalRuntime(database, service, run) {
  const url = postgresEndpoint();
  const login = `tropio_${service}_${randomBytes(12).toString('hex')}`;
  const password = randomBytes(32).toString('hex');
  composeSql(`
CREATE ROLE ${login} LOGIN PASSWORD '${password}';
GRANT tropio_${service}_runtime TO ${login};
`, { transaction: true });

  url.username = login;
  url.password = password;
  url.pathname = `/${database}`;
  try {
    return await run(url.href);
  }
  finally {
    composeSql(`DROP ROLE ${login};`);
  }
}

function withDatabaseRoles(database, entries, test, run, env = {}) {
  const [service, ...remaining] = entries;
  if (!service) {
    return run(env);
  }
  const key = `TROPIO_${service.toUpperCase()}_${test ? 'TEST_' : ''}DATABASE_URL`;
  const next = url => withDatabaseRoles(database, remaining, test, run, { ...env, [key]: url });
  const configuredUrl = test ? undefined : process.env[key];
  return configuredUrl ? next(configuredUrl) : withLocalRuntime(database, service, next);
}

async function testService(service) {
  const database = `tropio_${service}_test_${randomBytes(8).toString('hex')}`;
  composeSql(`CREATE DATABASE ${database} TEMPLATE template0;`);
  try {
    applyMigrations({ database });
    const args = ['--filter', '@tropio/backend', 'exec', 'vitest', 'run', `test/${service}-http.test.ts`];
    if (service === 'travel') {
      args.push('test/equipment-library-http.test.ts');
    }
    const required = services.includes(service) ? services.slice(0, services.indexOf(service) + 1) : services;
    return await withDatabaseRoles(database, required, true,
      env => runPnpm(args, env));
  }
  finally {
    composeSql(`DROP DATABASE ${database};`);
  }
}

async function runLocal(command) {
  const seedOnly = command === 'demo-data';
  const configured = services.map(service => process.env[`TROPIO_${service.toUpperCase()}_DATABASE_URL`]).filter(Boolean);
  const skipped = 'Демонстрационные данные пропущены: базы Identity, Travel, Geo, Social, BFF и адрес сайта должны быть локальными.';
  if (seedOnly && !allowLocalDemoData(configured)) {
    warn(skipped);
    return 1;
  }
  const database = configured.length === services.length
    ? undefined
    : composeSql('COPY (SELECT current_database()) TO STDOUT;');
  return withDatabaseRoles(database, services, false, async (env) => {
    const seeded = await applyLocalDemoData({
      identityUrl: env.TROPIO_IDENTITY_DATABASE_URL,
      travelUrl: env.TROPIO_TRAVEL_DATABASE_URL,
      geoUrl: env.TROPIO_GEO_DATABASE_URL,
      socialUrl: env.TROPIO_SOCIAL_DATABASE_URL,
    });
    if (!seeded) {
      warn(skipped);
    }
    if (seedOnly) {
      return seeded ? 0 : 1;
    }

    const proxySecret = process.env.TROPIO_BFF_PROXY_SECRET || randomBytes(32).toString('hex');
    const args = command === 'dev' ? ['run', 'dev'] : ['-r', '--parallel', 'start'];
    return runPnpm(args, {
      ...env,
      NITRO_HOST: '127.0.0.1',
      NUXT_LOCAL_DEMO_LOGIN: seeded ? '1' : '0',
      TROPIO_AUTH_OUTBOX_DIR: process.env.TROPIO_AUTH_OUTBOX_DIR || resolve(root, '.local/identity-mail'),
      TROPIO_BFF_PROXY_SECRET: proxySecret,
      NUXT_BFF_PROXY_SECRET: proxySecret,
    });
  });
}

const command = process.argv[2];
const testCommands = {
  'test': 'identity',
  'test-travel': 'travel',
  'test-geo': 'geo',
  'test-publication': 'publication',
  'test-demo': 'demo',
};
if (['dev', 'start', 'demo-data'].includes(command)) {
  process.exitCode = await runLocal(command);
}
else if (Object.hasOwn(testCommands, command)) {
  process.exitCode = await testService(testCommands[command]);
}
else {
  throw new Error('Неизвестная команда локального запуска');
}
