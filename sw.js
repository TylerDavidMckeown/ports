const CACHE = 'web-ports-v1';
const OFFLINE = '/offline.html';

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(['/', '/index.html', OFFLINE])));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

function isHtml(request, response) {
  return request.mode === 'navigate' || response.headers.get('content-type')?.includes('text/html');
}

async function localiseHtml(request, response) {
  if (!isHtml(request, response)) return response;
  const text = await response.text();
  // The original game pages point their relative assets at jsDelivr. The repository
  // contains those assets locally, so remove the external base URL for self-hosting.
  const local = text.replace(/\s*<base\s+href=["']https:\/\/cdn\.jsdelivr\.net\/gh\/genizy\/web-port@main\/[^"']+["']\s*\/?>(?:\s*)/i, '\n');
  return new Response(local, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers
  });
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;

  if (request.mode === 'navigate' || request.destination === 'document') {
    event.respondWith((async () => {
      try {
        const network = await fetch(request);
        const response = await localiseHtml(request, network.clone());
        const cache = await caches.open(CACHE);
        await cache.put(request, response.clone());
        return response;
      } catch {
        const cached = await caches.match(request);
        return cached || caches.match(OFFLINE);
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cached = await caches.match(request);
    if (cached) return cached;
    try {
      const response = await fetch(request);
      if (response.ok) {
        const cache = await caches.open(CACHE);
        cache.put(request, response.clone());
      }
      return response;
    } catch {
      return new Response('Offline and this game asset has not been cached yet.', { status: 503 });
    }
  })());
});
