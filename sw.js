const CACHE_VERSION = "chrono-drive-pwa-20260527-opponent-layout";
const APP_SHELL_CACHE = `${CACHE_VERSION}-shell`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;

const APP_SHELL_URLS = [
  "/",
  "/index.html",
  "/styles.css?v=20260527opponentLayout",
  "/manifest.webmanifest",
  "/assets/icons/icon-192.png",
  "/assets/icons/icon-512.png",
  "/assets/cards/card-back.png",
  "/assets/ui/gacha-stone.png",
  "/assets/ui/dismantle-stone.png",
  "/assets/home/home-bg.png",
  "/assets/board/duel-board-cyberpunk-layout.png",
  "/src/data/cards.js?v=20260526optionaleffects",
  "/src/core/deck-store.js?v=20260526missingDeckCards",
  "/src/core/effect-resolver.js?v=20260526optionaleffects",
  "/src/core/cpu-controller.js?v=20260525safeattack",
  "/src/core/duel-game.js?v=20260526optionaleffects",
  "/src/ui/scale-manager.js?v=20260524a",
  "/src/ui/card-renderer.js?v=20260527rubyfix",
  "/src/ui/sound-effects.js?v=20260522h",
  "/src/ui/card-zoom.js?v=20260522k",
  "/src/ui/deck-builder-view.js?v=20260526missingDeckCards",
  "/src/ui/pack-view.js?v=20260526packResultFlow",
  "/src/net/online-client.js?v=20260525openingattack",
  "/src/ui/duel-view.js?v=20260527thumbs",
  "/src/main.js?v=20260527thumbs"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(APP_SHELL_CACHE)
      .then((cache) => cache.addAll(APP_SHELL_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key !== APP_SHELL_CACHE && key !== RUNTIME_CACHE)
          .map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request, "/index.html"));
    return;
  }

  event.respondWith(staleWhileRevalidate(request));
});

async function networkFirst(request, fallbackUrl) {
  const cache = await caches.open(APP_SHELL_CACHE);
  try {
    const response = await fetch(request);
    cache.put(request, response.clone());
    return response;
  } catch (error) {
    const cached = await cache.match(request);
    return cached || cache.match(fallbackUrl);
  }
}

async function staleWhileRevalidate(request) {
  const cached = await caches.match(request);
  const cacheName = isAppShellRequest(request) ? APP_SHELL_CACHE : RUNTIME_CACHE;
  const fresh = fetch(request)
    .then(async (response) => {
      if (response && response.ok) {
        const cache = await caches.open(cacheName);
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => cached);

  return cached || fresh;
}

function isAppShellRequest(request) {
  const url = new URL(request.url);
  return APP_SHELL_URLS.includes(`${url.pathname}${url.search}`) || APP_SHELL_URLS.includes(url.pathname);
}
