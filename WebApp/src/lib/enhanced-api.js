// Enhanced API with caching, retry logic, and performance optimization
import { API_BASE, fetchWithTimeout } from './api.js'

class EnhancedAPI {
  constructor() {
    this.cache = new Map()
    this.requestQueue = new Map()
    this.retryConfig = {
      maxRetries: 3,
      baseDelay: 1000,
      maxDelay: 10000
    }
    this.cacheConfig = {
      defaultTTL: 300000, // 5 minutes
      maxCacheSize: 100,
      quotesTTL: 60000,   // 1 minute for quotes
      settingsTTL: 600000 // 10 minutes for settings
    }
  }

  // Get cached data if available and not expired
  getCached(key) {
    const cached = this.cache.get(key)
    if (!cached) return null
    
    if (Date.now() > cached.expiresAt) {
      this.cache.delete(key)
      return null
    }
    
    return cached.data
  }

  // Set data in cache with TTL
  setCache(key, data, ttl = this.cacheConfig.defaultTTL) {
    // Prevent cache from growing too large
    if (this.cache.size >= this.cacheConfig.maxCacheSize) {
      // Remove oldest entries
      const entries = Array.from(this.cache.entries())
      entries.sort((a, b) => a[1].createdAt - b[1].createdAt)
      const toRemove = entries.slice(0, Math.floor(this.cacheConfig.maxCacheSize / 2))
      toRemove.forEach(([key]) => this.cache.delete(key))
    }

    this.cache.set(key, {
      data,
      createdAt: Date.now(),
      expiresAt: Date.now() + ttl
    })
  }

  // Clear cache by pattern or all
  clearCache(pattern = null) {
    if (!pattern) {
      this.cache.clear()
      return
    }

    for (const key of this.cache.keys()) {
      if (key.includes(pattern)) {
        this.cache.delete(key)
      }
    }
  }

  // Retry logic with exponential backoff
  async retryRequest(requestFn, retries = 0) {
    try {
      return await requestFn()
    } catch (error) {
      if (retries >= this.retryConfig.maxRetries) {
        throw error
      }

      // Don't retry on 4xx errors (except 408, 429)
      if (error.status && error.status >= 400 && error.status < 500 && 
          error.status !== 408 && error.status !== 429) {
        throw error
      }

      const delay = Math.min(
        this.retryConfig.baseDelay * Math.pow(2, retries),
        this.retryConfig.maxDelay
      )

      console.log(`🔄 Retry ${retries + 1}/${this.retryConfig.maxRetries} after ${delay}ms`)
      
      await new Promise(resolve => setTimeout(resolve, delay))
      return this.retryRequest(requestFn, retries + 1)
    }
  }

  // Deduplication: prevent multiple identical requests
  async deduplicateRequest(key, requestFn) {
    if (this.requestQueue.has(key)) {
      return this.requestQueue.get(key)
    }

    const promise = requestFn()
    this.requestQueue.set(key, promise)

    try {
      const result = await promise
      this.requestQueue.delete(key)
      return result
    } catch (error) {
      this.requestQueue.delete(key)
      throw error
    }
  }

  // Enhanced quotes listing with caching
  async listQuotes(forceRefresh = false) {
    const cacheKey = 'quotes:list'
    
    if (!forceRefresh) {
      const cached = this.getCached(cacheKey)
      if (cached) {
        console.log('📋 Quotes loaded from cache')
        return cached
      }
    }

    return this.deduplicateRequest(cacheKey, async () => {
      const result = await this.retryRequest(async () => {
        const res = await fetchWithTimeout(`${API_BASE}/api/quotes`, {
          headers: this.getAuthHeaders()
        })
        
        if (res.status === 401) throw new Error('unauthorized')
        if (!res.ok) throw new Error('list failed')
        
        return res.json()
      })

      this.setCache(cacheKey, result, this.cacheConfig.quotesTTL)
      console.log('📋 Quotes loaded from API and cached')
      return result
    })
  }

  // Enhanced quote creation with cache invalidation
  async createQuote(quoteData) {
    const result = await this.retryRequest(async () => {
      const res = await fetchWithTimeout(`${API_BASE}/api/quotes`, {
        method: 'POST',
        headers: {
          ...this.getAuthHeaders(),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(quoteData)
      })

      if (!res.ok) throw new Error('create failed')
      return res.json()
    })

    // Invalidate quotes cache
    this.clearCache('quotes:')
    console.log('💾 Quote created, cache invalidated')
    return result
  }

  // Enhanced quote update with cache invalidation
  async updateQuote(id, updates) {
    const result = await this.retryRequest(async () => {
      const res = await fetchWithTimeout(`${API_BASE}/api/quotes/${id}`, {
        method: 'PATCH',
        headers: {
          ...this.getAuthHeaders(),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(updates)
      })

      if (!res.ok) throw new Error('update failed')
      return res.json()
    })

    // Update specific cache entry and invalidate list
    this.clearCache('quotes:')
    console.log(`📝 Quote ${id} updated, cache invalidated`)
    return result
  }

  // Settings with longer cache
  async getSettings(forceRefresh = false) {
    const cacheKey = 'settings:all'
    
    if (!forceRefresh) {
      const cached = this.getCached(cacheKey)
      if (cached) {
        console.log('⚙️ Settings loaded from cache')
        return cached
      }
    }

    return this.deduplicateRequest(cacheKey, async () => {
      const result = await this.retryRequest(async () => {
        const res = await fetchWithTimeout(`${API_BASE}/api/settings`, {
          headers: this.getAuthHeaders()
        })
        
        if (!res.ok) throw new Error('settings failed')
        return res.json()
      })

      this.setCache(cacheKey, result, this.cacheConfig.settingsTTL)
      console.log('⚙️ Settings loaded from API and cached')
      return result
    })
  }

  // Batch operations with optimized requests
  async batchUpdateQuotes(updates) {
    return this.retryRequest(async () => {
      const res = await fetchWithTimeout(`${API_BASE}/api/quotes/batch`, {
        method: 'PATCH',
        headers: {
          ...this.getAuthHeaders(),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ updates })
      })

      if (!res.ok) throw new Error('batch update failed')
      
      // Clear all quote caches
      this.clearCache('quotes:')
      console.log('🔄 Batch update completed, cache cleared')
      return res.json()
    })
  }

  // File upload with progress and retry
  async uploadFile(file, onProgress = null) {
    return this.retryRequest(async () => {
      const formData = new FormData()
      formData.append('file', file)

      const xhr = new XMLHttpRequest()
      
      return new Promise((resolve, reject) => {
        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable && onProgress) {
            onProgress(Math.round((e.loaded / e.total) * 100))
          }
        })

        xhr.addEventListener('load', () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              resolve(JSON.parse(xhr.responseText))
            } catch (e) {
              resolve({ success: true })
            }
          } else {
            reject(new Error(`Upload failed: ${xhr.status}`))
          }
        })

        xhr.addEventListener('error', () => reject(new Error('Upload error')))
        xhr.addEventListener('timeout', () => reject(new Error('Upload timeout')))

        xhr.open('POST', `${API_BASE}/api/upload`)
        
        const token = this.getToken()
        if (token) {
          xhr.setRequestHeader('Authorization', `Bearer ${token}`)
        }

        xhr.timeout = 30000 // 30 second timeout for uploads
        xhr.send(formData)
      })
    })
  }

  // Background data preloading
  async preloadData() {
    const preloadTasks = [
      () => this.listQuotes().catch(() => null),
      () => this.getSettings().catch(() => null)
    ]

    // Run preload tasks in background without blocking UI
    Promise.allSettled(preloadTasks.map(task => task()))
      .then(() => console.log('🚀 Data preloading completed'))
      .catch(() => console.log('⚠️ Some preload tasks failed'))
  }

  // Network status monitoring
  setupNetworkMonitoring() {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        console.log('🌐 Network restored, clearing cache')
        this.clearCache()
        this.preloadData()
      })

      window.addEventListener('offline', () => {
        console.log('📴 Network lost, relying on cache')
      })
    }
  }

  // Helper methods
  getToken() {
    try {
      return localStorage.getItem('bp_admin_token') || ''
    } catch {
      return ''
    }
  }

  getAuthHeaders() {
    const token = this.getToken()
    return token ? { Authorization: `Bearer ${token}` } : {}
  }

  // Cache statistics
  getCacheStats() {
    const entries = Array.from(this.cache.entries())
    const now = Date.now()
    const expired = entries.filter(([_, v]) => now > v.expiresAt).length
    
    return {
      total: this.cache.size,
      expired,
      active: this.cache.size - expired,
      memoryUsage: JSON.stringify(entries).length,
      hitRate: 'To be implemented'
    }
  }
}

// Create singleton instance
const enhancedAPI = new EnhancedAPI()

// Setup network monitoring
enhancedAPI.setupNetworkMonitoring()

// Export singleton
export default enhancedAPI

// Also export the class for testing
export { EnhancedAPI }