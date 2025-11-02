// Service Worker for Burkol Quote Portal PWA
const CACHE_NAME = 'burkol-quote-portal-v1.3'
const STATIC_CACHE = 'burkol-static-v1.3'
const DYNAMIC_CACHE = 'burkol-dynamic-v1.3'

// Files to cache immediately
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/quote-dashboard.html',
  '/config/manifest.json',
  
  // JavaScript modules
  '/app.js',
  'shared/i18n.js',
  
  // Essential components
  'shared/lib/api.js',
  'shared/lib/utils.js',
  '/lib/enhanced-api.js',
  '/lib/react-optimizations.js',
  
  // Images
  '/img/filter-icon.png',
  '/img/info.png',
  
  // Fonts (Google Fonts URLs will be cached dynamically)
]

// URLs that should always be fetched from network
const NETWORK_FIRST = [
  '/api/',
  '/api/quotes',
  '/api/settings',
  '/api/upload'
]

// URLs that can be cached with stale-while-revalidate
const STALE_WHILE_REVALIDATE = [
  '/styles/',
  '/components/',
  '/hooks/'
]

// Install event - cache static assets
self.addEventListener('install', (event) => {
  console.log('🔧 Service Worker installing...')
  
  event.waitUntil(
    Promise.all([
      // Cache static assets
      caches.open(STATIC_CACHE).then((cache) => {
        console.log('📦 Caching static assets')
        return cache.addAll(STATIC_ASSETS)
      }),
      
      // Skip waiting to activate immediately
      self.skipWaiting()
    ])
  )
})

// Service worker activation - cleanup unused caches
self.addEventListener('activate', (event) => {
  console.log('✅ Service Worker activating...')
  
  event.waitUntil(
    Promise.all([
      // Remove unused cache versions
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== STATIC_CACHE && 
                cacheName !== DYNAMIC_CACHE && 
                cacheName !== CACHE_NAME) {
              console.log('🗑️ Deleting old cache:', cacheName)
              return caches.delete(cacheName)
            }
          })
        )
      }),
      
      // Take control of all clients
      self.clients.claim()
    ])
  )
})

// Fetch event - handle all network requests
self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  // Skip non-HTTP requests
  if (!request.url.startsWith('http')) {
    return
  }

  // Handle different caching strategies
  if (isNetworkFirst(request.url)) {
    event.respondWith(networkFirst(request))
  } else if (isStaleWhileRevalidate(request.url)) {
    event.respondWith(staleWhileRevalidate(request))
  } else {
    event.respondWith(cacheFirst(request))
  }
})

// Cache first strategy (for static assets)
async function cacheFirst(request) {
  try {
    const cachedResponse = await caches.match(request)
    if (cachedResponse) {
      return cachedResponse
    }

    const networkResponse = await fetch(request)
    
    // Cache successful responses
    if (networkResponse.status === 200) {
      const cache = await caches.open(DYNAMIC_CACHE)
      cache.put(request, networkResponse.clone())
    }
    
    return networkResponse
  } catch (error) {
    console.error('❌ Cache first failed:', error)
    
    // Return offline page for navigation requests
    if (request.mode === 'navigate') {
      return caches.match('/offline.html') || new Response('Offline')
    }
    
    throw error
  }
}

// Network first strategy (for API calls)
async function networkFirst(request) {
  try {
    const networkResponse = await fetch(request)
    
    // Cache successful API responses with short TTL
    if (networkResponse.status === 200 && request.method === 'GET') {
      const cache = await caches.open(DYNAMIC_CACHE)
      
      // Add timestamp for TTL
      const responseWithTimestamp = new Response(networkResponse.clone().body, {
        status: networkResponse.status,
        statusText: networkResponse.statusText,
        headers: {
          ...networkResponse.headers,
          'sw-cached-at': Date.now().toString()
        }
      })
      
      cache.put(request, responseWithTimestamp)
    }
    
    return networkResponse
  } catch (error) {
    console.log('🌐 Network failed, trying cache for:', request.url)
    
    const cachedResponse = await caches.match(request)
    if (cachedResponse) {
      // Check if cached response is not too old (5 minutes for API)
      const cachedAt = cachedResponse.headers.get('sw-cached-at')
      if (cachedAt && Date.now() - parseInt(cachedAt) < 300000) {
        return cachedResponse
      }
    }
    
    throw error
  }
}

// Stale while revalidate strategy
async function staleWhileRevalidate(request) {
  const cache = await caches.open(DYNAMIC_CACHE)
  const cachedResponse = await cache.match(request)
  
  // Start fetching update in background
  const fetchPromise = fetch(request).then((networkResponse) => {
    if (networkResponse.status === 200) {
      cache.put(request, networkResponse.clone())
    }
    return networkResponse
  }).catch(() => {
    // Network failed, but we have cache
    return cachedResponse
  })
  
  // Return cached version immediately if available
  return cachedResponse || fetchPromise
}

// Helper functions
function isNetworkFirst(url) {
  return NETWORK_FIRST.some(pattern => url.includes(pattern))
}

function isStaleWhileRevalidate(url) {
  return STALE_WHILE_REVALIDATE.some(pattern => url.includes(pattern))
}

// Background sync for offline form submissions
self.addEventListener('sync', (event) => {
  if (event.tag === 'quote-submission') {
    event.waitUntil(syncOfflineQuotes())
  }
})

async function syncOfflineQuotes() {
  try {
    const offlineQuotes = await getOfflineQuotes()
    
    for (const quote of offlineQuotes) {
      try {
        await fetch('/api/quotes', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(quote.data)
        })
        
        // Remove from offline storage after successful sync
        await removeOfflineQuote(quote.id)
        
        // Notify user of successful sync
        self.registration.showNotification('Quote Synced', {
          body: 'Your offline quote has been submitted successfully',
          icon: '/img/icon-192.png',
          badge: '/img/badge.png',
          tag: 'quote-sync'
        })
      } catch (error) {
        console.error('Failed to sync quote:', error)
      }
    }
  } catch (error) {
    console.error('Background sync failed:', error)
  }
}

// Push notifications
self.addEventListener('push', (event) => {
  const options = {
    body: 'You have new quote updates',
    icon: '/img/icon-192.png',
    badge: '/img/badge.png',
    vibrate: [100, 50, 100],
    data: {
      dateOfArrival: Date.now(),
      primaryKey: '2'
    },
    actions: [
      {
        action: 'explore',
        title: 'View Details',
        icon: '/img/checkmark.png'
      },
      {
        action: 'close',
        title: 'Close',
        icon: '/img/xmark.png'
      }
    ]
  }

  event.waitUntil(
    self.registration.showNotification('Burkol Quote Portal', options)
  )
})

// Notification click handling
self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  if (event.action === 'explore') {
    event.waitUntil(
      clients.openWindow('/quote-dashboard.html')
    )
  }
})

// Helper functions for offline storage
async function getOfflineQuotes() {
  // This would integrate with IndexedDB for offline storage
  return []
}

async function removeOfflineQuote(id) {
  // Remove from IndexedDB
}

// Cache management
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting()
  } else if (event.data && event.data.type === 'CACHE_STATS') {
    getCacheStats().then(stats => {
      event.ports[0].postMessage(stats)
    })
  }
})

async function getCacheStats() {
  const cacheNames = await caches.keys()
  const stats = {}
  
  for (const cacheName of cacheNames) {
    const cache = await caches.open(cacheName)
    const keys = await cache.keys()
    stats[cacheName] = keys.length
  }
  
  return stats
}