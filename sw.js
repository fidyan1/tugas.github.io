const CACHE_NAME = 'smart-todo-v2';
const ASSETS = [
  './',
  './index.html',
  './script.js',
  './style.css', // Added style.css
  './manifest.json',
  'https://cdn.tailwindcss.com',
  'https://unpkg.com/boxicons@2.1.4/css/boxicons.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/Sortable/1.15.0/Sortable.min.js',
  'https://cdn.jsdelivr.net/npm/marked/marked.min.js',
  'https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&display=swap'
];

self.addEventListener('install', (e) => {
  self.skipWaiting(); // Activate worker immediately
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
});

self.addEventListener('activate', (e) => {
    e.waitUntil(
        caches.keys().then((keyList) => {
            return Promise.all(keyList.map((key) => {
                if (key !== CACHE_NAME) {
                    return caches.delete(key);
                }
            }));
        })
    );
    self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  e.respondWith(
    caches.match(e.request).then((cachedResponse) => {
        // Return cached response if found
        if (cachedResponse) {
            // But also fetch from network in background to update cache for next time (Stale-While-Revalidate)
            fetch(e.request).then((networkResponse) => {
                if(networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(e.request, networkResponse.clone());
                    });
                }
            }).catch(() => {}); // Ignore network errors
            return cachedResponse;
        }
        // Fallback to network
        return fetch(e.request);
    })
  );
});
