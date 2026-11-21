import { randomUUID } from 'node:crypto';
import {
  copyFile,
  mkdtemp,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pg from 'pg';
import {
  expect,
  it,
  vi,
} from 'vitest';
import firstVersion from '../../fixtures/demo/0001-travel.json' with { type: 'json' };
import {
  applyLocalDemoData,
  retryDemoStatementTimeout,
} from '../local/demo-data.mjs';

it('rejects repeated trip identifiers or slugs across versions before opening a database connection', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'tropio-demo-duplicates-'));
  const connect = vi.spyOn(pg.Client.prototype, 'connect').mockImplementation(() => {
    throw new Error('Unexpected database connection');
  });
  try {
    await copyFile(new URL('../../fixtures/demo/0001-travel.json', import.meta.url), join(directory, '0001-travel.json'));
    const trip = firstVersion.trips[0]!;
    const conflicts = [
      { ...trip, id: randomUUID() },
      { ...trip, id: trip.id.toUpperCase(), slug: 'a-new-trip' },
    ];
    const url = 'postgresql://127.0.0.1/tropio';
    for (const duplicate of conflicts) {
      const version = { version: 2, organizer: firstVersion.organizer, trips: [duplicate] };
      await writeFile(join(directory, '0002-travel.json'), JSON.stringify(version));
      await expect(applyLocalDemoData({
        identityUrl: url,
        travelUrl: url,
        geoUrl: url,
        socialUrl: url,
      }, directory))
        .rejects.toThrow(/Повтор UUID или slug/);
    }
    expect(connect).not.toHaveBeenCalled();
  }
  finally {
    connect.mockRestore();
    await rm(directory, { recursive: true, force: true });
  }
});

it('retries a demo version once for a PostgreSQL statement timeout', async () => {
  const timeout = Object.assign(new Error('canceling statement due to statement timeout'), { code: '57014' });
  const transient = vi.fn<() => Promise<void>>().mockRejectedValueOnce(timeout).mockResolvedValue(undefined);
  await retryDemoStatementTimeout(transient);
  expect(transient).toHaveBeenCalledTimes(2);

  const persistent = vi.fn<() => Promise<void>>().mockRejectedValue(timeout);
  await expect(retryDemoStatementTimeout(persistent)).rejects.toBe(timeout);
  expect(persistent).toHaveBeenCalledTimes(2);
});

it('preserves explicit cancellation and data errors on the first attempt', async () => {
  const errors = [
    Object.assign(new Error('canceling statement due to user request'), { code: '57014' }),
    Object.assign(new Error('duplicate key value violates unique constraint'), { code: '23505' }),
  ];
  for (const error of errors) {
    const apply = vi.fn<() => Promise<void>>().mockRejectedValue(error);
    await expect(retryDemoStatementTimeout(apply)).rejects.toBe(error);
    expect(apply).toHaveBeenCalledTimes(1);
  }
});
