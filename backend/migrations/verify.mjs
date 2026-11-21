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
import {
  basename,
  join,
} from 'node:path';
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
  const beforeCovers = mkdtempSync(join(tmpdir(), 'tropio-travel-upgrade-'));
  try {
    for (const owner of migrationOwners) {
      cpSync(join(migrationDirectory, owner), join(beforeCovers, owner), {
        recursive: true,
        filter: entry => owner !== 'travel' || !entry.endsWith('.sql') || Number(basename(entry).slice(0, 4)) <= 8,
      });
    }
    applyMigrations({ database, directory: beforeCovers });
    sql(`
SET LOCAL ROLE tropio_travel_runtime;
WITH old_trip AS (
  INSERT INTO travel.trips (owner_user_id, created_by_user_id, title)
  VALUES (gen_random_uuid(), gen_random_uuid(), 'Travel upgrade fixture') RETURNING id
)
INSERT INTO travel.trip_equipment (trip_id, position, label, required)
SELECT id, 1, 'Термос', true FROM old_trip;
`);
    for (const file of readdirSync(join(migrationDirectory, 'travel')).filter(name => /^00(09|10)_/.test(name))) {
      cpSync(join(migrationDirectory, 'travel', file), join(beforeCovers, 'travel', file));
    }
    applyMigrations({ database, directory: beforeCovers });
    sql(`
SET LOCAL ROLE tropio_travel_runtime;
WITH existing AS (
    INSERT INTO travel.personal_equipment (owner_user_id, label)
    VALUES (gen_random_uuid(), 'Старая личная вещь') RETURNING id, owner_user_id, label
)
INSERT INTO travel.equipment_commands (owner_user_id, idempotency_key, request_label, response)
SELECT owner_user_id, gen_random_uuid(), label, jsonb_build_object('id', id, 'label', label, 'scope', 'personal', 'category', 'other') FROM existing;
`);
    const oldFolders = '0011_personal_equipment_groups.sql';
    cpSync(join(migrationDirectory, 'travel', oldFolders), join(beforeCovers, 'travel', oldFolders));
    applyMigrations({ database, directory: beforeCovers });
    sql(`
SET LOCAL ROLE tropio_travel_runtime;
INSERT INTO travel.trip_applications (trip_id, applicant_user_id)
SELECT id, gen_random_uuid() FROM travel.trips WHERE title = 'Travel upgrade fixture';
`);
    const oldFavorites = '0012_trip_favorites.sql';
    cpSync(join(migrationDirectory, 'travel', oldFavorites), join(beforeCovers, 'travel', oldFavorites));
    applyMigrations({ database, directory: beforeCovers });
    sql(`
SET LOCAL ROLE tropio_travel_runtime;
INSERT INTO travel.trip_favorites (trip_id, user_id)
SELECT id, owner_user_id FROM travel.trips WHERE title = 'Travel upgrade fixture'
UNION ALL SELECT trip_id, applicant_user_id FROM travel.trip_applications;
`);
  }
  finally {
    rmSync(beforeCovers, { recursive: true, force: true });
  }
  applyMigrations({ database });
  sql(`
DO $fixture$
BEGIN
    IF EXISTS (SELECT FROM travel.trip_favorites f JOIN travel.trips t ON t.id = f.trip_id WHERE f.user_id = t.owner_user_id)
       OR NOT EXISTS (SELECT FROM travel.trip_favorites f JOIN travel.trip_applications a ON (a.trip_id, a.applicant_user_id) = (f.trip_id, f.user_id))
       OR NOT EXISTS (
        SELECT FROM travel.trip_applications a JOIN travel.trips t ON t.id = a.trip_id
        WHERE t.title = 'Travel upgrade fixture' AND a.status = 'pending') THEN
        RAISE EXCEPTION 'Previous participation, foreign favorite or self-favorite cleanup missing after upgrade';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM travel.trips t JOIN travel.trip_equipment e ON e.trip_id = t.id
                   WHERE t.title = 'Travel upgrade fixture' AND t.cover_id IS NULL AND e.label = 'Термос' AND e.required)
       OR NOT EXISTS (SELECT 1 FROM travel.equipment_catalog WHERE code = 'tent') THEN
        RAISE EXCEPTION 'Existing draft equipment or system dictionary missing after upgrade';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM travel.personal_equipment e JOIN travel.equipment_commands c
                   ON c.owner_user_id = e.owner_user_id AND c.response->>'id' = e.id::text
                   WHERE e.label = 'Старая личная вещь' AND e.group_id IS NULL AND e.subgroup_id IS NULL
                       AND e.icon IS NULL AND c.request_options = '{}' AND c.request_label = e.label) THEN
        RAISE EXCEPTION 'Personal equipment or command replay missing after upgrade';
    END IF;
END;
$fixture$;
`);
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
