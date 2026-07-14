const CACHE_NAME = 'qc-scanner-v13';
const ASSETS = [
  './',
  './index.html',
  './js/app.js?v=1.2.1',
  './js/components.js?v=1.5.0',
  './js/VoiceEngine.js?v=1.0.0',
  './js/VoiceFeedback.js?v=1.0.0',
  './js/tabs/voice/useEfficiencyTimer.js?v=1.0.0',
  './js/tabs/VoiceTab.js?v=2.15.0',
  './js/tabs/DatabaseTab.js?v=1.1.0',
  './js/tabs/LiveMonitoringTab.js?v=1.2.0',
  './js/tabs/AsakaiTab.js?v=1.1.0',
  './js/tabs/SettingsTab.js?v=1.0.0',
  './js/tabs/LineStopTab.js?v=1.0.0'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all([
        clients.claim(),
        ...cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log('SW: Clearing old cache', cache);
            return caches.delete(cache);
          }
        })
      ]);
    })
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') {
    return;
  }
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const fetchPromise = fetch(event.request).then((response) => {
        if (response && response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => cached);
      return cached || fetchPromise;
    })
  );
});
