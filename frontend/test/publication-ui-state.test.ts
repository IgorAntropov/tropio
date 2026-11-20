import {
  createSSRApp,
  h,
} from 'vue';
import { renderToString } from 'vue/server-renderer';
import {
  afterEach,
  expect,
  it,
  vi,
} from 'vitest';
import { useTripPublication } from '../src/features/publish-trip/use-trip-publication';
import type { TravelDraft } from '../src/shared/api';

vi.mock('@fsd/shared/api', () => import('../src/shared/api'));

async function setup() {
  let draft: TravelDraft = {
    trip_id: crypto.randomUUID(),
    trip_revision_id: crypto.randomUUID(),
    publication_id: null,
    visibility: 'public',
    title: 'Два берега',
    description: '',
    start_date: null,
    end_date: null,
    timezone: null,
    free_capacity: null,
    difficulty: null,
    participation_rules: null,
    equipment: [],
    admission_mode: 'request',
    days: [{
      day_id: crypto.randomUUID(),
      route_id: crypto.randomUUID(),
      position: 1,
      local_date: null,
      description: null,
      notes: null,
    }],
  };
  const denied = vi.fn();
  let model!: ReturnType<typeof useTripPublication>;
  await renderToString(createSSRApp({ setup() {
    model = useTripPublication(() => draft, (value) => {
      draft = value;
    }, denied);
    return () => h('div');
  } }));
  const request = vi.fn<typeof fetch>();
  vi.stubGlobal('fetch', request);
  request.mockResolvedValueOnce(Response.json(draft))
    .mockResolvedValueOnce(Response.json({ availability: 'available', route_revision_id: crypto.randomUUID() }))
    .mockResolvedValueOnce(Response.json({ items: [], next_cursor: null }));
  await model.prepare();
  expect(model.prepared.value?.routes).toHaveLength(1);
  return {
    model,
    request,
    draft,
    denied,
  };
}

function error(status: number, code: string) {
  return Response.json({ status, code }, { status, headers: { 'content-type': 'application/problem+json' } });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it('saves admission alone at the latest revision and preserves a prepared publication', async () => {
  const { model, request, draft } = await setup();
  await model.setAdmissionMode('open');
  expect(request).toHaveBeenCalledTimes(3);
  model.prepared.value = null;
  request.mockResolvedValueOnce(Response.json({ csrf_token: 'csrf' }))
    .mockResolvedValueOnce(error(409, 'TRIP_REVISION_CONFLICT'));
  await model.setAdmissionMode('open');
  expect(model.conflict.value).toBe(true);
  const fresh = { ...draft, trip_revision_id: crypto.randomUUID() };
  request.mockResolvedValueOnce(Response.json(fresh));
  await model.retry();
  const changed = { ...fresh, admission_mode: 'open', trip_revision_id: crypto.randomUUID() };
  request.mockResolvedValueOnce(Response.json({ csrf_token: 'csrf' }))
    .mockResolvedValueOnce(Response.json(changed)).mockResolvedValueOnce(Response.json(changed));
  await model.setAdmissionMode('open');
  const patch = request.mock.calls.at(-2)![1]!;
  expect(patch.method).toBe('PATCH');
  expect(JSON.parse(String(patch.body))).toEqual({ admission_mode: 'open', trip_revision_id: fresh.trip_revision_id });
  expect(model.notice.value).toBe('admissionSaved');
});

it.each([
  [400, 'INVALID_REQUEST'], [401, 'SESSION_REQUIRED'], [403, 'CSRF_REJECTED'], [404, 'NOT_FOUND'],
  [409, 'TRIP_REVISION_CONFLICT'], [409, 'IDEMPOTENCY_KEY_REUSED'], [422, 'INVALID_PUBLICATION_MANIFEST'],
  [503, 'DEPENDENCY_UNAVAILABLE'],
] as const)('shows publication error %i %s and keeps only retryable commands', async (status, code) => {
  const { model, request } = await setup();
  request.mockResolvedValueOnce(Response.json({ csrf_token: 'csrf' })).mockResolvedValueOnce(error(status, code));
  await model.publish();
  expect(model.issue.value).toBe(code);
  expect(model.unavailable.value).toBe([401, 403, 404].includes(status));
  expect(model.conflict.value).toBe(status === 409);
  expect(!!model.action.value).toBe(status === 503);
});

it('blocks commands when the session check fails before the publish request', async () => {
  const { model, request, denied } = await setup();
  request.mockResolvedValueOnce(error(401, 'SESSION_REQUIRED'));
  await model.publish();
  expect(model.issue.value).toBe('SESSION_REQUIRED');
  expect(model.unavailable.value).toBe(true);
  expect(model.prepared.value).toBeNull();
  expect(denied).toHaveBeenCalledOnce();
  expect(request).toHaveBeenCalledTimes(4);
});

it('resumes a lost response with the same manifest and idempotency key and refreshes the actual pointer', async () => {
  const { model, request, draft } = await setup();
  request.mockResolvedValueOnce(Response.json({ csrf_token: 'csrf' })).mockRejectedValueOnce(new TypeError('Disconnected'));
  await model.publish();
  const original = request.mock.calls.at(-1)!;
  expect(model.issue.value).toBe('NETWORK');
  const published = { ...draft, trip_revision_id: crypto.randomUUID(), publication_id: crypto.randomUUID() };
  request.mockResolvedValueOnce(Response.json({ csrf_token: 'csrf' }))
    .mockResolvedValueOnce(Response.json({
      operation_id: crypto.randomUUID(),
      status: 'succeeded',
      publication_id: published.publication_id,
      trip_revision_id: published.trip_revision_id,
    }))
    .mockResolvedValueOnce(Response.json(published));
  await model.retry();
  const repeated = request.mock.calls.at(-2)!;
  expect(repeated[0]).toBe(original[0]);
  expect(repeated[1]?.body).toBe(original[1]?.body);
  expect(new Headers(repeated[1]?.headers).get('idempotency-key')).toBe(new Headers(original[1]?.headers).get('idempotency-key'));
  expect(model.notice.value).toBe('published');
  expect(model.issue.value).toBe('');
});

it.each(['pending', 'failed'] as const)('polls %s publication without resubmitting its command', async (outcome) => {
  vi.useFakeTimers();
  const { model, request, draft } = await setup();
  const pending = { operation_id: crypto.randomUUID(), status: 'pending' };
  request.mockResolvedValueOnce(Response.json({ csrf_token: 'csrf' })).mockResolvedValueOnce(Response.json(pending, { status: 202 }));
  await model.publish();
  expect(model.operation.value).toBe(pending.operation_id);
  request.mockResolvedValueOnce(outcome === 'failed'
    ? Response.json({ ...pending, status: 'failed', code: 'ROUTE_REVISION_CONFLICT' })
    : error(503, 'DEPENDENCY_UNAVAILABLE')).mockResolvedValueOnce(Response.json(draft));
  await vi.advanceTimersByTimeAsync(1000);
  expect(model.issue.value).toBe(outcome === 'failed' ? 'ROUTE_REVISION_CONFLICT' : 'DEPENDENCY_UNAVAILABLE');
  expect(model.conflict.value).toBe(outcome === 'failed');
  expect(request.mock.calls.filter(([url]) => String(url).endsWith('/publish'))).toHaveLength(1);
});
