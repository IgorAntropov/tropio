import { log } from 'node:console';
import { createHash } from 'node:crypto';
import {
  readdirSync,
  readFileSync,
} from 'node:fs';
import { join } from 'node:path';
import {
  fileURLToPath,
  URL,
} from 'node:url';
import { composeSql } from './compose-sql.mjs';

export const migrationDirectory = fileURLToPath(new URL('./', import.meta.url));
export const migrationOwners = ['platform', 'identity', 'travel', 'geo'];

function readMigrations(directory) {
  return migrationOwners.flatMap((owner) => {
    const ownerDirectory = join(directory, owner);
    const files = readdirSync(ownerDirectory).filter(name => name.endsWith('.sql')).sort();
    if (files.length === 0) {
      throw new Error(`Missing migrations for ${owner}`);
    }

    return files.map((filename, index) => {
      const version = index + 1;
      const prefix = String(version).padStart(4, '0');
      if (!/^\d{4}_[a-z][a-z0-9_]*\.sql$/.test(filename) || !filename.startsWith(`${prefix}_`)) {
        throw new Error(`Expected migration ${owner}/${prefix}_<name>.sql, found ${filename}`);
      }
      const bytes = readFileSync(join(ownerDirectory, filename));
      return {
        owner,
        version,
        filename,
        checksum: createHash('sha256').update(bytes).digest('hex'),
        sql: bytes.toString('utf8'),
      };
    });
  });
}

function manifestRow({ owner, version, filename, checksum }) {
  return `('${owner}', ${version}, '${filename}', '${checksum}')`;
}

function migrationBlock(migration) {
  const { owner, version, filename, sql } = migration;
  const role = owner === 'platform'
    ? ''
    : `
SET LOCAL ROLE tropio_${owner}_owner;
SET LOCAL search_path = ${owner}, public;`;
  return `
SELECT NOT EXISTS (
    SELECT FROM tropio_migrations.applied WHERE owner = '${owner}' AND version = ${version}
) AS migration_pending \\gset
\\if :migration_pending
\\echo Applying ${owner}/${filename}
${role}
${sql}
RESET ROLE;
SET LOCAL search_path = pg_catalog, public;
INSERT INTO tropio_migrations.applied (owner, version, filename, checksum)
VALUES ${manifestRow(migration)};
\\endif
`;
}

export function applyMigrations({ database, directory = migrationDirectory } = {}) {
  const migrations = readMigrations(directory);
  const manifest = migrations.map(manifestRow).join(',\n');
  const sql = `
SET LOCAL client_min_messages = warning;
SET LOCAL search_path = pg_catalog, public;
SELECT pg_advisory_xact_lock(1746837265, 1) AS migration_lock \\gset

CREATE SCHEMA IF NOT EXISTS tropio_migrations;
REVOKE ALL ON SCHEMA tropio_migrations FROM PUBLIC;
CREATE TABLE IF NOT EXISTS tropio_migrations.applied (
    owner text NOT NULL,
    version integer NOT NULL CHECK (version > 0),
    filename text NOT NULL,
    checksum text NOT NULL,
    applied_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (owner, version)
);

CREATE TEMP TABLE migration_manifest (
    owner text NOT NULL,
    version integer NOT NULL,
    filename text NOT NULL,
    checksum text NOT NULL,
    PRIMARY KEY (owner, version)
) ON COMMIT DROP;

INSERT INTO migration_manifest VALUES ${manifest};

DO $history$
DECLARE
    invalid_migration text;
BEGIN
    SELECT format('%s/%s', applied.owner, applied.filename) INTO invalid_migration
    FROM tropio_migrations.applied AS applied
    LEFT JOIN migration_manifest AS expected USING (owner, version)
    WHERE expected.filename IS DISTINCT FROM applied.filename
        OR expected.checksum IS DISTINCT FROM applied.checksum
    LIMIT 1;

    IF invalid_migration IS NOT NULL THEN
        RAISE EXCEPTION 'Migration history differs for %', invalid_migration;
    END IF;

    IF EXISTS (
        SELECT 1
        FROM tropio_migrations.applied AS applied
        JOIN migration_manifest AS earlier ON earlier.owner = applied.owner AND earlier.version < applied.version
        WHERE NOT EXISTS (
            SELECT 1 FROM tropio_migrations.applied
            WHERE owner = earlier.owner AND version = earlier.version
        )
    ) THEN
        RAISE EXCEPTION 'Migration history has an unapplied predecessor';
    END IF;
END;
$history$;

${migrations.map(migrationBlock).join('\n')}
`;

  return composeSql(sql, { database, transaction: true });
}

if (import.meta.main) {
  const applied = applyMigrations();
  if (applied) {
    log(applied);
  }
  log('Миграции PostgreSQL применены.');
}
