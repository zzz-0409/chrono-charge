const CACHE_VERSION = "chrono-drive-pwa-20260602-guestcollection";
const APP_SHELL_CACHE = `${CACHE_VERSION}-shell`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;

const APP_SHELL_URLS = [
  "/",
  "/index.html",
  "/styles.css?v=20260602handcost",
  "/manifest.webmanifest",
  "/assets/icons/icon-192.png",
  "/assets/icons/icon-512.png",
  "/assets/cards/card-back.png",
  "/assets/ui/gacha-stone.png",
  "/assets/ui/dismantle-stone.png",
  "/assets/ui/duel-menu/button-frames.png",
  "/assets/ui/duel-menu/duel-lobby-bg.png",
  "/assets/ui/duel-menu/duel-mode-panels.png",
  "/assets/ui/duel-menu/mode-emblems.png",
  "/assets/ui/duel-menu/shell-icons.png",
  "/assets/ui/ranked/rank-bronze.png",
  "/assets/ui/ranked/rank-silver.png",
  "/assets/ui/ranked/rank-gold.png",
  "/assets/ui/ranked/rank-platinum.png",
  "/assets/ui/ranked/rank-diamond.png",
  "/assets/ui/ranked/rank-master.png",
  "/assets/home/home-bg.png",
  "/assets/title/title-bg.png",
  "/assets/board/duel-board-cyberpunk-layout.png",
  "/assets/SE/doro-.mp3",
  "/assets/SE/botan.mp3",
  "/assets/SE/menyu-.mp3",
  "/assets/SE/kyanseru.mp3",
  "/assets/SE/ka-dohaiti.mp3",
  "/assets/SE/dame-ji.mp3",
  "/assets/SE/hakai.mp3",
  "/assets/SE/koukahatudou.mp3",
  "/assets/SE/shouri.mp3",
  "/assets/SE/haiboku.mp3",
  "/src/data/cards.js?v=20260602themes",
  "/src/data/notices.js?v=20260602themes",
  "/src/core/deck-store.js?v=20260602guestcollection",
  "/src/core/effect-resolver.js?v=20260602themes",
  "/src/core/cpu-controller.js?v=20260602themes",
  "/src/core/duel-game.js?v=20260602themes",
  "/src/ui/scale-manager.js?v=20260524a",
  "/src/ui/card-renderer.js?v=20260602themes",
  "/src/ui/sound-effects.js?v=20260529soundvolume",
  "/src/ui/card-zoom.js?v=20260522k",
  "/src/ui/deck-builder-view.js?v=20260528loginbonusui",
  "/src/ui/pack-view.js?v=20260529notice",
  "/src/net/online-client.js?v=20260528rankedsystems",
  "/src/ui/duel-view.js?v=20260601cpurank",
  "/src/main.js?v=20260601ranktable2"
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
