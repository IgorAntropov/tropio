import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import {
  expect,
  it,
  vi,
} from 'vitest';

const script = readFileSync(new URL('../public/navigation-worker.js', import.meta.url), 'utf8');
const scope = 'https://travel.test/tropio/';

function worker() {
  type Navigation = Pick<Request, 'url' | 'method' | 'mode' | 'destination'>;
  type FetchEvent = { request: Navigation; respondWith: (response: Promise<Response>) => void };
  const handlers = new Map<string, (event: FetchEvent) => void>();
  const network = vi.fn<typeof fetch>();
  const match = vi.fn().mockResolvedValue(new Response('Нет соединения', { status: 503 }));
  runInNewContext(script, {
    URL,
    Response,
    fetch: network,
    caches: { match },
    self: { registration: { scope }, addEventListener: handlers.set.bind(handlers) },
  });
  function request(path: string, options?: Partial<Navigation>) {
    let result: Promise<Response> | undefined;
    handlers.get('fetch')!({
      request: {
        url: new URL(path, scope).href,
        method: 'GET',
        mode: 'navigate',
        destination: 'document',
        ...options,
      },
      respondWith(response) {
        result = response;
      },
    });
    return result;
  }
  return { network, match, request };
}

it('preserves the upstream document and its HTTP error status', async () => {
  const { network, match, request } = worker();
  for (const status of [200, 404, 500, 503]) {
    const response = new Response('from the server', { status });
    network.mockResolvedValueOnce(response);
    expect(await request('trips/private-trip')).toBe(response);
  }
  expect(match).not.toHaveBeenCalled();
});

it('uses the scoped generic document only on a network failure', async () => {
  const { network, match, request } = worker();
  network.mockRejectedValue(new TypeError('Network unavailable'));
  expect((await request('trips/private-trip?view=map'))?.status).toBe(503);
  expect(match).toHaveBeenCalledExactlyOnceWith(new URL('offline.html', scope).href, { cacheName: 'trulala-offline:%2Ftropio%2F' });
});

it('recovers only the exact public style and illustrations requested with their expected destination', async () => {
  const { network, match, request } = worker();
  network.mockRejectedValue(new TypeError('Network unavailable'));
  for (const [path, destination] of [
    ['system-pages/screen.css', 'style'],
    ['system-pages/radio.webp', 'image'],
    ['trulala-logo.svg', 'image'],
  ] as const) {
    const cached = new Response('asset');
    match.mockResolvedValueOnce(cached);
    expect(await request(path, { mode: 'no-cors', destination })).toBe(cached);
    expect(match).toHaveBeenLastCalledWith(new URL(path, scope).href, { cacheName: 'trulala-offline:%2Ftropio%2F' });
  }
  for (const path of ['system-pages/radio.webp?private=1', 'avatars/me.webp', '/system-pages/radio.webp', 'api/v1/profile']) {
    expect(request(path, { mode: 'no-cors', destination: 'image' })).toBeUndefined();
  }
  expect(request('system-pages/screen.css', { mode: 'cors', destination: 'script' })).toBeUndefined();
  expect(network).toHaveBeenCalledTimes(3);
});

it('leaves APIs, other applications, downloads, and submitted forms to the browser', () => {
  const { network, match, request } = worker();
  for (const path of ['api/v1/me', '%61pi/v1/trips', 'route-map/tomsk.geojson', '_nuxt/app.js', 'trips/file?download', '/outside', 'https://other.test/']) {
    expect(request(path)).toBeUndefined();
  }
  expect(request('register', { method: 'POST' })).toBeUndefined();
  expect(request('catalog', { mode: 'cors' })).toBeUndefined();
  expect(request('catalog', { destination: 'iframe' })).toBeUndefined();
  expect(network).not.toHaveBeenCalled();
  expect(match).not.toHaveBeenCalled();
});
