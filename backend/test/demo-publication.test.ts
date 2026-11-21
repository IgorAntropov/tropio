import {
  afterEach,
  expect,
  it,
  vi,
} from 'vitest';
import { publishDemoTrip } from '../local/travel-demo.js';
import type { PublicationService } from '../src/travel/publication.service.js';

const editor = { userId: 'owner', confirmSession: async () => {} };
const command = { trip_revision_id: 'draft', routes: [], poi_ids: [] };
const pending = { operation_id: 'first', status: 'pending' } as const;
const succeeded = {
  ...pending,
  status: 'succeeded',
  publication_id: 'published',
  trip_revision_id: 'latest',
} as const;

afterEach(() => vi.useRealTimers());

it('retries only the pending demo publication with backoff after a temporary worker failure', async () => {
  vi.useFakeTimers();
  const publish = vi.fn<PublicationService['publish']>().mockResolvedValue(pending);
  const status = vi.fn<PublicationService['status']>().mockResolvedValueOnce(pending).mockResolvedValueOnce(succeeded);
  const prepare = vi.fn(async () => {});
  const completed = publishDemoTrip({ publish, status }, { prepare }, editor, 'trip', command, 'initial');
  const result = expect(completed).resolves.toBe('latest');
  await vi.advanceTimersByTimeAsync(999);
  expect(prepare).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1);
  await result;
  expect(prepare.mock.calls).toEqual([[{ id: 'first', trip_id: 'trip' }], [{ id: 'first', trip_id: 'trip' }]]);
  expect(publish).toHaveBeenCalledTimes(1);
});

it('bounds retries when the worker keeps the operation pending', async () => {
  vi.useFakeTimers();
  const publish = vi.fn<PublicationService['publish']>().mockResolvedValue(pending);
  const status = vi.fn<PublicationService['status']>().mockResolvedValue(pending);
  const prepare = vi.fn(async () => {});
  const finished = expect(publishDemoTrip({ publish, status }, { prepare }, editor, 'trip', command, 'initial'))
    .rejects.toThrow('Истекло время ожидания');
  await vi.advanceTimersByTimeAsync(120_000);
  await finished;
  expect(prepare).toHaveBeenCalledTimes(8);
  expect(publish).toHaveBeenCalledTimes(1);
  expect(vi.getTimerCount()).toBe(0);
});

it('resumes an expired publication with its stable successor key', async () => {
  const expired = { ...pending, status: 'failed', code: 'PUBLICATION_TIMED_OUT' } as const;
  const publish = vi.fn<PublicationService['publish']>().mockResolvedValueOnce(expired).mockResolvedValueOnce(succeeded);
  const status = vi.fn<PublicationService['status']>();
  const prepare = vi.fn(async () => {});
  await publishDemoTrip({ publish, status }, { prepare }, editor, 'trip', command, 'initial');
  expect(publish.mock.calls.map(call => call[2])).toEqual(['initial', 'first']);
  expect(prepare).not.toHaveBeenCalled();
});
