const CACHE_NAME = 'myticksystem-v7';
const urlsToCache = [
    '/',
    '/offline.html', // Daftarkan file offline statis di sini
    '/css/output.css',
    '/vendor/cropperjs/cropper.min.css',
    '/vendor/tom-select/tom-select.bootstrap5.min.css',
    '/vendor/tom-select/tom-select.complete.min.js',
    '/vendor/cropperjs/cropper.min.js',
    '/vendor/alpine.min.js',
    '/vendor/sweetalert2.all.min.js',
    '/vendor/chart.umd.min.js',
];

// 1. Install Service Worker & Cache Aset Dasar
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => {
            return cache.addAll(urlsToCache);
        })
    );
    self.skipWaiting();
});

// 2. Activate & Bersihkan Cache Lama
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys => {
            return Promise.all(
                keys.map(key => {
                    if (key !== CACHE_NAME) {
                        return caches.delete(key);
                    }
                })
            );
        })
    );
    self.clients.claim();
});

// 3. Fetch Interceptor: Ambil offline.html saat navigasi gagal total
self.addEventListener('fetch', event => {
    if (event.request.method !== 'GET') return;

    event.respondWith(
        fetch(event.request)
            .catch(() => {
                return caches.match(event.request).then(cachedResponse => {
                    if (cachedResponse) {
                        return cachedResponse;
                    }
                    
                    // Jika mode navigasi (termasuk halaman login atau dashboard) gagal karena offline
                    if (event.request.mode === 'navigate') {
                        return caches.match('/offline.html').then(offlineCache => {
                            return offlineCache || caches.match('/');
                        });
                    }
                });
            })
    );
});