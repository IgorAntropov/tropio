import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import {
  readdirSync,
  readFileSync,
} from 'node:fs';
import {
  mkdir,
  mkdtemp,
  rm,
} from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import process from 'node:process';
import {
  fileURLToPath,
  pathToFileURL,
} from 'node:url';
import pg from 'pg';
import demoAccount from '../../fixtures/demo-account.json' with { type: 'json' };
import type { DemoVersion } from './travel-demo.js';
import {
  allowLocalDemoData,
  ensureLocalDemoAccount,
} from './demo-account.mts';

interface DemoDatabases {
  identityUrl: string;
  travelUrl: string;
  geoUrl: string;
}

interface AppliedVersion {
  version: number;
  filename: string;
  checksum: string;
  applied_at: Date | null;
}

function readDemoVersions(directory: string) {
  const files = readdirSync(directory).filter(file => file.endsWith('.json')).sort();
  if (!files.length) {
    throw new Error('Нет версий локальных демонстрационных данных.');
  }
  const ids = new Set<string>();
  const slugs = new Set<string>();
  return files.map((filename, index) => {
    const bytes = readFileSync(join(directory, filename));
    const data = JSON.parse(bytes.toString('utf8')) as DemoVersion;
    const version = index + 1;
    const personal = filename.endsWith('-personal-equipment.json');
    if (!/^\d{4}-[a-z][a-z0-9-]*\.json$/.test(filename) || Number(filename.slice(0, 4)) !== version || data.version !== version
      || personal !== ('personalEquipment' in data)
      || ('personalEquipment' in data
        ? !Array.isArray(data.personalEquipment)
        : !data.organizer?.id || !data.organizer.email?.endsWith('.test') || !data.organizer.displayName?.trim() || !Array.isArray(data.trips))) {
      throw new Error(`Некорректная версия демонстрационных данных: ${filename}`);
    }
    for (const trip of ('trips' in data ? data.trips : [])) {
      const id = trip.id.toLowerCase();
      if (ids.has(id) || slugs.has(trip.slug)) {
        throw new Error('Повтор UUID или slug демонстрационной поездки: ' + trip.slug);
      }
      ids.add(id);
      slugs.add(trip.slug);
    }
    return {
      version,
      filename,
      data,
      checksum: createHash('sha256').update(bytes).digest('hex'),
    };
  });
}

export async function retryDemoStatementTimeout(apply: () => Promise<void>) {
  try {
    await apply();
  }
  catch (error) {
    if (!(error instanceof Error) || !('code' in error) || error.code !== '57014'
      || error.message !== 'canceling statement due to statement timeout') {
      throw error;
    }
    await apply();
  }
}

async function applyPendingVersions(client: pg.Client, databases: DemoDatabases, versions: ReturnType<typeof readDemoVersions>) {
  const outputRoot = fileURLToPath(new URL('./dist/', import.meta.url));
  await mkdir(outputRoot, { recursive: true });
  const output = await mkdtemp(join(outputRoot, 'build-'));
  try {
    const compiler = createRequire(import.meta.url).resolve('typescript/bin/tsc');
    const config = fileURLToPath(new URL('./tsconfig.json', import.meta.url));
    const build = spawn(process.execPath, [compiler, '-p', config, '--outDir', output], { stdio: 'inherit' });
    const [exitCode] = await once(build, 'exit');
    if (exitCode !== 0) {
      throw new Error('Не удалось собрать локальную миграцию Travel и Geo.');
    }
    const worker: Pick<typeof import('./travel-demo.js'), 'applyTravelDemoVersion'>
      = await import(pathToFileURL(join(output, 'local/travel-demo.js')).href);

    for (const { version, filename, checksum, data } of versions) {
      await client.query(
        'INSERT INTO travel.local_demo_versions (version, filename, checksum) VALUES ($1, $2, $3) ON CONFLICT (version) DO NOTHING',
        [version, filename, checksum],
      );
      await retryDemoStatementTimeout(async () => {
        if ('organizer' in data) {
          const { id, email, displayName } = data.organizer;
          await ensureLocalDemoAccount(databases.identityUrl, { id, email, displayName });
        }
        await worker.applyTravelDemoVersion({ ...databases, travelerId: demoAccount.id }, data);
      });
      await client.query('UPDATE travel.local_demo_versions SET applied_at = clock_timestamp() WHERE version = $1', [version]);
    }
  }
  finally {
    await rm(output, { recursive: true, force: true });
  }
}

export async function applyLocalDemoData(
  databases: DemoDatabases,
  directory = fileURLToPath(new URL('../../fixtures/demo/', import.meta.url)),
): Promise<boolean> {
  if (!allowLocalDemoData(Object.values(databases))) {
    return false;
  }
  const versions = readDemoVersions(directory);
  const client = new pg.Client({ connectionString: databases.travelUrl, connectionTimeoutMillis: 5000 });
  client.on('error', () => {});
  await client.connect();
  try {
    await client.query('SET ROLE tropio_travel_runtime');
    await client.query('SET search_path TO pg_catalog');
    await client.query('SELECT pg_advisory_lock(1746837265, 2)');
    const { rows } = await client.query<AppliedVersion>(
      'SELECT version, filename, checksum, applied_at FROM travel.local_demo_versions ORDER BY version',
    );
    for (const [index, row] of rows.entries()) {
      const version = versions[index];
      if (version?.version !== row.version || version.filename !== row.filename || version.checksum !== row.checksum
        || (row.applied_at === null && index !== rows.length - 1)) {
        throw new Error(`История локальных демонстрационных данных расходится с ${row.filename}`);
      }
    }
    await ensureLocalDemoAccount(databases.identityUrl, demoAccount);
    const completed = rows.filter(row => row.applied_at !== null).length;
    if (completed < versions.length) {
      await applyPendingVersions(client, databases, versions.slice(completed));
    }
    return true;
  }
  finally {
    await client.end();
  }
}
