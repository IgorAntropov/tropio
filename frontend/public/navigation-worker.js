const scope = new URL(self.registration.scope);
const cacheName = `trulala-offline:${encodeURIComponent(scope.pathname)}`;
const offlinePage = new URL('offline.html', scope).href;
const style = new URL('system-pages/screen.css', scope).href;
const logo = new URL('trulala-logo.svg', scope).href;
const radio = new URL('system-pages/radio.webp', scope).href;
const publicAssets = new Map([
  [style, { destination: 'style', type: 'text/css' }],
  [logo, { destination: 'image', type: 'image/svg+xml' }],
  [radio, { destination: 'image', type: 'image/webp' }],
]);

async function loadAsset(url, type) {
  const response = await fetch(url, { cache: 'reload', credentials: 'omit', redirect: 'error' });
  if (!response.ok || response.headers.get('content-type')?.split(';')[0] !== type) {
    throw new Error('Offline asset unavailable');
  }
  return [url, response];
}

async function installPage() {
  const assets = await Promise.all(Array.from(publicAssets, ([url, asset]) => loadAsset(url, asset.type)));
  const html = `<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex"><meta name="referrer" content="no-referrer">
<title>Нет соединения · Трулала</title><link rel="icon" href="data:,"><link rel="stylesheet" href="${style}"></head>
<body><div class="system-page">
<header class="system-page-bar"><a class="system-page-brand" href="${scope.pathname}" aria-label="Трулала — на главную"><img src="${logo}" width="92" height="52" alt="Трулала"></a></header>
<main class="system-page-panel"><section class="system-state system-state--page" aria-labelledby="offline-title">
<img class="system-state-art" src="${radio}" alt="" width="600" height="440">
<div class="system-state-copy"><h1 class="system-state-title" id="offline-title">Нет соединения</h1>
<p class="system-state-description">Проверь подключение к интернету и попробуй открыть страницу снова.</p></div>
<div class="system-state-actions"><a class="system-action system-action--primary" href="" onclick="location.reload();return false">Попробовать снова</a></div>
</section></main></div></body></html>`;
  const cache = await caches.open(cacheName);
  await Promise.all(assets.map(([url, response]) => cache.put(url, response)));
  await cache.put(offlinePage, new Response(html, {
    status: 503,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      'x-robots-tag': 'noindex',
      'referrer-policy': 'no-referrer',
    },
  }));
  await self.skipWaiting();
}

self.addEventListener('install', (event) => {
  event.waitUntil(installPage());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

async function networkWithFallback(request, key) {
  try {
    return await fetch(request);
  }
  catch {
    return await caches.match(key, { cacheName }) ?? Response.error();
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') {
    return;
  }
  if (publicAssets.get(request.url)?.destination === request.destination) {
    event.respondWith(networkWithFallback(request, request.url));
    return;
  }
  if (request.mode !== 'navigate' || request.destination !== 'document') {
    return;
  }
  const url = new URL(request.url);
  if (url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname)) {
    return;
  }
  let path;
  try {
    path = decodeURIComponent(url.pathname.slice(scope.pathname.length));
  }
  catch {
    return;
  }
  if (/^(?:[_.@/]|(?:api|avatars|licenses|route-map|system-pages)(?:\/|$))/.test(path)
    || /\.[^/]+\/?$/.test(path) || url.searchParams.has('download')) {
    return;
  }
  event.respondWith(networkWithFallback(request, offlinePage));
});
