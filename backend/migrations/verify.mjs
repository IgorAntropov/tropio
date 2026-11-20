import assert from 'node:assert/strict';
import { log } from 'node:console';
import { randomBytes } from 'node:crypto';
import {
  appendFileSync,
  cpSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { URL } from 'node:url';
import { composeSql } from './compose-sql.mjs';
import {
  applyMigrations,
  migrationDirectory,
  migrationOwners,
} from './migrate.mjs';

const contract = readFileSync(new URL('./verify.sql', import.meta.url), 'utf8');
const migrationCount = migrationOwners.reduce((count, owner) =>
  count + readdirSync(join(migrationDirectory, owner)).filter(name => name.endsWith('.sql')).length, 0);

function inTestDatabase(check) {
  const database = `tropio_migration_test_${randomBytes(8).toString('hex')}`;
  composeSql(`CREATE DATABASE ${database} TEMPLATE template0;`);
  try {
    check(database, sql => composeSql(sql, { database, transaction: true }));
  }
  finally {
    composeSql(`DROP DATABASE ${database};`);
  }
}

function checkHistory(sql, expectedCount) {
  sql(`
DO $fixture$
BEGIN
    IF (SELECT count(*) FROM tropio_migrations.applied) <> ${expectedCount} THEN
        RAISE EXCEPTION 'Unexpected migration count';
    END IF;
END;
$fixture$;
`);
}

inTestDatabase((database, sql) => {
  applyMigrations({ database });
  sql(contract);
  checkHistory(sql, migrationCount);
  assert.equal(applyMigrations({ database }), '');
  checkHistory(sql, migrationCount);
  log('Чистая база без PostGIS, права владельцев, доменные ограничения и повторный запуск проверены.');
});

inTestDatabase((database, sql) => {
  sql('CREATE EXTENSION postgis WITH SCHEMA public;');
  applyMigrations({ database });
  sql(contract);
  checkHistory(sql, migrationCount);

  sql(`
SET LOCAL ROLE tropio_identity_runtime;
INSERT INTO identity.users (email_normalized, display_name) VALUES ('fixture@example.test', 'GIS-01');
`);

  const fixture = mkdtempSync(join(tmpdir(), 'tropio-migration-fixture-'));
  try {
    for (const owner of migrationOwners) {
      cpSync(join(migrationDirectory, owner), join(fixture, owner), { recursive: true });
    }
    const identityDirectory = join(fixture, 'identity');
    const version = String(readdirSync(identityDirectory).filter(name => name.endsWith('.sql')).length + 1).padStart(4, '0');
    const next = join(identityDirectory, `${version}_test_upgrade.sql`);
    const change = 'ALTER TABLE users ADD COLUMN migration_test_field boolean NOT NULL DEFAULT true;\n';
    writeFileSync(next, `${change}SELECT missing_column FROM users;\n`);
    assert.throws(() => applyMigrations({ database, directory: fixture }), /missing_column/);
    checkHistory(sql, migrationCount);
    sql(`
DO $fixture$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'identity' AND table_name = 'users' AND column_name = 'migration_test_field') THEN
        RAISE EXCEPTION 'Failed migration did not roll back';
    END IF;
END;
$fixture$;
`);

    writeFileSync(next, change);
    applyMigrations({ database, directory: fixture });
    checkHistory(sql, migrationCount + 1);
    sql(`
SET LOCAL ROLE tropio_identity_runtime;
DO $fixture$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM identity.users
        WHERE email_normalized = 'fixture@example.test' AND migration_test_field) THEN
        RAISE EXCEPTION 'Original account or upgrade data is missing';
    END IF;
END;
$fixture$;
`);
    assert.equal(applyMigrations({ database, directory: fixture }), '');

    appendFileSync(next, '\n');
    assert.throws(() => applyMigrations({ database, directory: fixture }), /Migration history differs/);
    checkHistory(sql, migrationCount + 1);
  }
  finally {
    rmSync(fixture, { recursive: true, force: true });
  }
  log('База с установленным PostGIS, откат ошибки, обновление с данными и контроль сумм проверены.');
});
