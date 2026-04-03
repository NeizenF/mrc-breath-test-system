// Minimal service worker — required for PWA install prompt on Chrome.
// No caching: all requests go straight to the network.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", () => self.clients.claim());
self.addEventListener("fetch", (event) => {
  event.respondWith(fetch(event.request));
});
