var CACHE = 'tbx-v000-00000000';   // at use: origin/main:sw.js number + 1 and today's date (version-at-push rule)
// TBX-EMERGENCY-SW — PREPARED, NOT FOR NORMAL USE. Read tools/emergency/README.md first.
// Ship this file as /sw.js ONLY if a released service worker stops phones from loading ToolBox or from working
// offline. It takes over at once (no "Update ready" tap needed), deletes nothing (the app shell, the offline photos in
// 'tbx-img', queued data and every localStorage key stay), and serves network-first with ANY cached copy as the
// offline fallback — so phones load the fixed site online and keep working offline from what they already saved.
// It precaches nothing new: follow it with a normal fixed release within a day.
self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (e) { e.waitUntil(self.clients.claim()); });
self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(fetch(req).catch(function () {
    return caches.match(req, { ignoreSearch: true }).then(function (hit) { return hit || Response.error(); });
  }));
});
self.addEventListener('message', function (e) { if (e.data === 'SKIP_WAITING') self.skipWaiting(); });
