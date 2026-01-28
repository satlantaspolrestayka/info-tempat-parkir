// sw.js - Updated Version
const CACHE_NAME = 'parkir-cache-v3';
const API_CACHE_NAME = 'parkir-api-cache-v1';
const urlsToCache = [
  '/',
  '/index.html',
  '/admin-petugas.html',
  '/manifest.json',
  '/scripts/api-handler.js'
];

// Install event
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Opened cache');
        return cache.addAll(urlsToCache);
      })
      .then(() => self.skipWaiting())
  );
});

// Activate event
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME && cacheName !== API_CACHE_NAME) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch event with stale-while-revalidate strategy
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  
  // API requests - network first, then cache
  if (url.pathname.includes('/data/')) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          // Clone the response
          const responseToCache = response.clone();
          
          caches.open(API_CACHE_NAME)
            .then(cache => {
              cache.put(event.request, responseToCache);
            });
            
          return response;
        })
        .catch(() => {
          return caches.match(event.request);
        })
    );
    return;
  }
  
  // Static assets - cache first, then network
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Return cached response if found
        if (response) {
          // Update cache in background
          fetch(event.request)
            .then(networkResponse => {
              caches.open(CACHE_NAME)
                .then(cache => {
                  cache.put(event.request, networkResponse);
                });
            })
            .catch(() => {}); // Ignore network errors
          return response;
        }
        
        // If not in cache, fetch from network
        return fetch(event.request)
          .then(response => {
            // Check if we received a valid response
            if (!response || response.status !== 200 || response.type !== 'basic') {
              return response;
            }
            
            // Clone the response
            const responseToCache = response.clone();
            
            caches.open(CACHE_NAME)
              .then(cache => {
                cache.put(event.request, responseToCache);
              });
              
            return response;
          });
      })
  );
});

// Background sync for offline updates
self.addEventListener('sync', event => {
  if (event.tag === 'sync-parking-updates') {
    event.waitUntil(syncParkingUpdates());
  }
});

async function syncParkingUpdates() {
  try {
    const queueKey = 'parking_update_queue';
    const queue = JSON.parse(localStorage.getItem(queueKey) || '[]');
    
    if (queue.length === 0) return;
    
    for (const update of queue) {
      try {
        // Try to send update
        const response = await fetch('/api/update', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(update)
        });
        
        if (response.ok) {
          // Remove from queue
          const newQueue = queue.filter(item => item.id !== update.id);
          localStorage.setItem(queueKey, JSON.stringify(newQueue));
        }
      } catch (error) {
        console.error('Sync failed for update:', update.id);
        update.attempts = (update.attempts || 0) + 1;
        
        // Remove if too many attempts
        if (update.attempts >= 3) {
          const newQueue = queue.filter(item => item.id !== update.id);
          localStorage.setItem(queueKey, JSON.stringify(newQueue));
        }
      }
    }
  } catch (error) {
    console.error('Background sync failed:', error);
  }
}

// Push notifications
self.addEventListener('push', event => {
  const options = {
    body: event.data ? event.data.text() : 'Parking data updated',
    icon: '/icon-192.png',
    badge: '/badge-72.png',
    vibrate: [100, 50, 100],
    data: {
      dateOfArrival: Date.now(),
      primaryKey: 1
    },
    actions: [
      {
        action: 'view',
        title: 'View updates'
      },
      {
        action: 'close',
        title: 'Close'
      }
    ]
  };
  
  event.waitUntil(
    self.registration.showNotification('Parking Update', options)
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  
  if (event.action === 'view') {
    event.waitUntil(
      clients.openWindow('/')
    );
  }
});
