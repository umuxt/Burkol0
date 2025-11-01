// API and localStorage fallback (ES module)
import { tFor, statusLabel } from '../i18n.js'

const LS_KEY = 'bk_quotes_v1'
let LOCAL_STORAGE_MODE = false // Global flag for localStorage fallback mode

// Initialize localStorage with sample data if empty
function initializeSampleData() {
  // Disabled - no automatic sample data initialization
  // Only Backend API data should be shown in quote table
  console.log('🔧 DEBUG: Sample data initialization disabled - using Backend API only')
}

function lsLoad() {
  try { const raw = localStorage.getItem(LS_KEY); const arr = raw ? JSON.parse(raw) : []; return Array.isArray(arr) ? arr : [] } catch { return [] }
}
function lsSave(arr) { localStorage.setItem(LS_KEY, JSON.stringify(arr)) }
function lsClear() { localStorage.removeItem(LS_KEY); console.log('🔧 DEBUG: Cleared localStorage quotes') }
function lsAdd(q) { const arr = lsLoad(); arr.unshift(q); lsSave(arr) }
function lsUpdate(id, patch) { 
  const arr = lsLoad().map(x => x.id === id ? { ...x, ...patch } : x); 
  lsSave(arr);
  console.log('🔧 DEBUG: Updated localStorage quote:', id, 'with patch:', patch);
  return arr.find(x => x.id === id);
}
function lsDelete(id) { const arr = lsLoad().filter(x => x.id !== id); lsSave(arr) }

export async function fetchWithTimeout(url, options = {}, timeoutMs = 15000) {
  try {
    const lang = (typeof localStorage !== 'undefined' && (localStorage.getItem('bk_lang') || localStorage.getItem('lang'))) || 'tr'
    const mergedHeaders = { 
      ...(options.headers || {}), 
      'Accept-Language': lang,
      'Cache-Control': 'no-cache'
    }
    const mergedOptions = { ...options, headers: mergedHeaders }
    
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs)
    
    try {
      const response = await fetch(url, { 
        ...mergedOptions, 
        signal: controller.signal 
      })
      clearTimeout(timeoutId)
      
      // Handle 429 (rate limit) specifically
      if (response.status === 429) {
        const retryAfter = response.headers.get('Retry-After') || '60'
        throw new Error(`Rate limit exceeded. Retry after ${retryAfter} seconds.`)
      }
      
      // Handle 503 (service unavailable) with specific message
      if (response.status === 503) {
        throw new Error('Service temporarily unavailable. Please try again later.')
      }
      
      return response
    } catch (fetchError) {
      clearTimeout(timeoutId)
      
      if (fetchError.name === 'AbortError') {
        throw new Error('timeout')
      }
      
      // Network or other fetch errors
      throw fetchError
    }
  } catch (e) {
    // Fallback to original behavior if localStorage not accessible
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs)
    
    try {
      const response = await fetch(url, { 
        ...options, 
        signal: controller.signal 
      })
      clearTimeout(timeoutId)
      return response
    } catch (fetchError) {
      clearTimeout(timeoutId)
      
      if (fetchError.name === 'AbortError') {
        throw new Error('timeout')
      }
      
      throw fetchError
    }
  }
}

// Robust API base URL detection that works regardless of Vercel build settings
function getApiBase() {
  // First try environment variable
  if (import.meta.env.VITE_API_BASE_URL) {
    return import.meta.env.VITE_API_BASE_URL
  }
  
  // Runtime URL detection - most reliable for production
  if (typeof window !== 'undefined' && window.location) {
    const hostname = window.location.hostname
    const protocol = window.location.protocol
    const port = window.location.port
    
    // Production domains
    if (hostname.includes('vercel.app') || 
        hostname.includes('burkol0.vercel.app') ||
        hostname.includes('burkol') ||
        protocol === 'https:') {
      console.log('🔧 API: Production detected, using empty string (Vercel rewrites handle /api)')
      return ''
    }
    
    // Local development - check if server is running
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      console.log('🔧 API: Local development detected')
      // Frontend on 3001, Backend on 3000
      if (port === '3001') {
        console.log('🔧 API: Frontend on 3001, routing to backend on 3000')
        return 'http://localhost:3000'
      }
      return ''
    }
  }
  
  // Final fallback - assume production
  console.log('🔧 API: Fallback to empty string (for Vercel rewrites)')
  return ''
}

export const API_BASE = getApiBase()

function getToken() { 
  try { 
    const token = localStorage.getItem('bk_admin_token')
    // Development fallback: use dev token if no real token exists
    // Accept several common local hostnames and Vite dev mode
    const hostname = (window && window.location && window.location.hostname) || ''
    const isLocalHostLike = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '0.0.0.0' || hostname.startsWith('192.')
    const isDevEnv = typeof import.meta !== 'undefined' && Boolean(import.meta.env && import.meta.env.DEV)
    if (!token && (isLocalHostLike || isDevEnv)) {
      console.log('🔧 getToken: using development fallback token (dev-admin-token)', { hostname, isDevEnv })
      return 'dev-admin-token'
    }
    return token || '' 
  } catch { 
    return '' 
  } 
}
function setToken(t) { try { if (t) localStorage.setItem('bk_admin_token', t); else localStorage.removeItem('bk_admin_token') } catch {} }

export function withAuth(headers = {}) {
  const token = getToken()
  if (token) return { ...headers, Authorization: `Bearer ${token}` }
  return headers
}

export const API = {
  // Orders API
  async listOrders(params = {}) {
    const qs = new URLSearchParams(params).toString()
    const url = `${API_BASE}/api/orders${qs ? `?${qs}` : ''}`
    const res = await fetchWithTimeout(url, { headers: withAuth() }, 10000)
    if (!res.ok) throw new Error('list_orders_failed')
    const data = await res.json()
    return Array.isArray(data) ? data : (data.orders || [])
  },
  async getOrder(orderId) {
    const res = await fetchWithTimeout(`${API_BASE}/api/orders/${encodeURIComponent(orderId)}`, { headers: withAuth() }, 10000)
    if (!res.ok) throw new Error('get_order_failed')
    const data = await res.json()
    return data.order || data
  },
  async createOrder(orderData) {
    const res = await fetchWithTimeout(`${API_BASE}/api/orders`, {
      method: 'POST',
      headers: withAuth({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ orderData })
    }, 15000)
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.error || 'create_order_failed')
    }
    const data = await res.json()
    return data.order || data
  },
  async updateOrder(orderId, updates) {
    const res = await fetchWithTimeout(`${API_BASE}/api/orders/${encodeURIComponent(orderId)}`, {
      method: 'PUT',
      headers: withAuth({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(updates)
    }, 15000)
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.error || 'update_order_failed')
    }
    const data = await res.json()
    return data.order || data
  },
  async updateOrderItem(orderId, itemId, updates) {
    const res = await fetchWithTimeout(`${API_BASE}/api/orders/${encodeURIComponent(orderId)}/items/${encodeURIComponent(itemId)}`, {
      method: 'PUT',
      headers: withAuth({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(updates)
    }, 15000)
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.error || 'update_order_item_failed')
    }
    return await res.json()
  },
  async deliverOrderItem(orderId, itemId, payload = {}) {
    const res = await fetchWithTimeout(`${API_BASE}/api/orders/${encodeURIComponent(orderId)}/items/${encodeURIComponent(itemId)}/deliver`, {
      method: 'PUT',
      headers: withAuth({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(payload)
    }, 15000)
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.error || 'deliver_order_item_failed')
    }
    return await res.json()
  },
  async listQuotes() {
    try {
      // Add cache busting to ensure fresh data
      const cacheBuster = `?_t=${Date.now()}`
      const url = `/api/quotes${cacheBuster}`
      console.log('🔧 DEBUG: API.listQuotes fetching from:', url)
      const res = await fetchWithTimeout(url, { headers: withAuth() }, 2000) // Shorter timeout for quick fallback
      if (res.status === 401) throw new Error('unauthorized')
      if (!res.ok) throw new Error('list failed')
      const backendQuotes = await res.json()
      console.log('🔧 DEBUG: API.listQuotes received from Backend API:', backendQuotes.length, 'quotes')
      
      // Only return Backend API quotes - no localStorage merging
      return backendQuotes
    } catch (e) {
      console.error('🔧 DEBUG: API.listQuotes error:', e)
      // If unauthorized, bubble up to show login
      if ((e && e.message && /401|unauthorized/i.test(e.message))) throw e
      
      // For other errors, return empty array instead of localStorage fallback
      console.log('🔧 DEBUG: Backend API connection failed, returning empty array')
      return []
    }
  },
  async applyNewPrice(id) {
    // Check localStorage mode first
    if (LOCAL_STORAGE_MODE) {
      console.log('🔧 DEBUG: Using localStorage mode for applyNewPrice')
      // Simulate price update in localStorage
      const quotes = lsLoad()
      const quote = quotes.find(q => q.id === id)
      if (quote && quote.priceStatus?.calculatedPrice) {
        // Only update specific fields, keep originalPriceVersion intact
        const updatePatch = {
          price: quote.priceStatus.calculatedPrice,
          priceVersionApplied: {
            versionNumber: 101, // Current system version  
            versionId: 'Admin-20251009-07',
            capturedAt: new Date().toISOString()
          },
          priceStatus: { 
            ...quote.priceStatus, 
            status: 'current',
            differenceSummary: null
          }
        }
        lsUpdate(id, updatePatch)
        // Return the merged quote with original data preserved
        const updatedQuote = lsLoad().find(q => q.id === id)
        return { success: true, quote: updatedQuote }
      }
      return { success: false, error: 'Quote not found or no calculated price' }
    }

    try {
      const res = await fetchWithTimeout(`${API_BASE}/api/quotes/${id}/apply-current-price`, {
        method: 'POST',
        headers: withAuth({ 'Content-Type': 'application/json' })
      })
      if (!res.ok) throw new Error('apply price failed')
      return await res.json()
    } catch (e) {
      console.warn('Apply price API failed, using localStorage fallback:', e.message)
      // Enable localStorage mode and retry
      LOCAL_STORAGE_MODE = true
      return this.applyNewPrice(id)
    }
  },
  async applyPricesBulk(ids = []) {
    const res = await fetchWithTimeout(`${API_BASE}/api/quotes/apply-price-bulk`, {
      method: 'POST',
      headers: withAuth({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ ids })
    })
    if (!res.ok) throw new Error('bulk apply failed')
    return await res.json()
  },
  async applyPricesAll() {
    const res = await fetchWithTimeout(`${API_BASE}/api/quotes/apply-price-all`, { method: 'POST', headers: withAuth({ 'Content-Type': 'application/json' }) })
    if (!res.ok) throw new Error('apply all failed')
    return await res.json()
  },
  async addUser(email, password, role = 'admin') {
    const res = await fetchWithTimeout(`${API_BASE}/api/auth/users`, {
      method: 'POST',
      headers: withAuth({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ email, password, role })
    })
    if (!res.ok) throw new Error('add_user_failed')
    return await res.json()
  },
  async listUsers() {
    const res = await fetchWithTimeout(`${API_BASE}/api/auth/users`, { headers: withAuth() })
    if (!res.ok) throw new Error('list_users_failed')
    return await res.json()
  },
  async deleteUser(email) {
    const res = await fetchWithTimeout(`${API_BASE}/api/auth/users/${encodeURIComponent(email)}`, { method: 'DELETE', headers: withAuth() })
    if (!res.ok) throw new Error('delete_user_failed')
    return await res.json()
  },
  async permanentDeleteUser(email) {
    const res = await fetchWithTimeout(`${API_BASE}/api/auth/users/${encodeURIComponent(email)}/permanent`, { method: 'DELETE', headers: withAuth() })
    if (!res.ok) throw new Error('permanent_delete_user_failed')
    return await res.json()
  },
  async updateUser(email, updates) {
    const res = await fetchWithTimeout(`${API_BASE}/api/auth/users/${encodeURIComponent(email)}`, {
      method: 'PUT',
      headers: withAuth({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(updates)
    })
    if (!res.ok) throw new Error('update_user_failed')
    return await res.json()
  },
  async createQuote(payload) {
    console.log('🔧 DEBUG: createQuote called with:', payload)
    console.log('🔧 DEBUG: API_BASE:', API_BASE)
    
    // Build correct URL - if API_BASE is already '/api', don't duplicate
    const url = API_BASE.endsWith('/api') ? `${API_BASE}/quotes` : `${API_BASE}/api/quotes`
    console.log('🔧 DEBUG: Full URL:', url)
    
    try {
      const res = await fetchWithTimeout(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      console.log('🔧 DEBUG: Response status:', res.status)
      console.log('🔧 DEBUG: Response ok:', res.ok)
      
      if (!res.ok) {
        const errorText = await res.text()
        console.log('🔧 DEBUG: Error response:', errorText)
        throw new Error(`create failed: ${res.status} - ${errorText}`)
      }
      
      const result = await res.json()
      console.log('🔧 DEBUG: Success response:', result)
      return result
    } catch (e) {
      console.log('🔧 DEBUG: createQuote error, falling back to localStorage:', e.message)
      lsAdd(payload)
      return { success: true, id: payload.id, local: true }
    }
  },

  // Alias for createQuote to maintain compatibility
  async create(payload) {
    return this.createQuote(payload)
  },

  async syncLocalQuotesToBackend() {
    try {
      const localQuotes = lsLoad()
      if (localQuotes.length === 0) {
        console.log('🔄 No local quotes to sync')
        return { synced: 0, errors: 0 }
      }

      console.log('🔄 Syncing', localQuotes.length, 'local quotes to Backend API...')
      let synced = 0
      let errors = 0

      for (const quote of localQuotes) {
        try {
          const res = await fetchWithTimeout(`${API_BASE}/api/quotes`, { 
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' }, 
            body: JSON.stringify(quote) 
          })
          if (res.ok) {
            synced++
            console.log('✅ Synced quote:', quote.id)
          } else {
            errors++
            console.error('❌ Failed to sync quote:', quote.id, res.status)
          }
        } catch (e) {
          errors++
          console.error('❌ Error syncing quote:', quote.id, e.message)
        }
      }

      // If all synced successfully, clear localStorage
      if (errors === 0 && synced > 0) {
        console.log('🧹 All quotes synced, clearing localStorage...')
        localStorage.removeItem(LS_KEY)
      }

      console.log('🔄 Sync complete:', synced, 'synced,', errors, 'errors')
      return { synced, errors }
    } catch (e) {
      console.error('🔄 Sync error:', e)
      return { synced: 0, errors: 1 }
    }
  },
  // Backward-compat alias kept for Admin.js
  async syncLocalQuotesToFirebase() {
    return this.syncLocalQuotesToBackend()
  },
  async updateStatus(id, status) {
    try {
      const res = await fetchWithTimeout(`${API_BASE}/api/quotes/${id}`, { method: 'PATCH', headers: withAuth({ 'Content-Type': 'application/json' }), body: JSON.stringify({ status }) })
      if (!res.ok) throw new Error('update failed')
      return await res.json()
    } catch (e) {
      lsUpdate(id, { status })
      return { ok: true, local: true }
    }
  },
  async addQuote(quoteData) {
    try {
      const res = await fetchWithTimeout(`${API_BASE}/api/quotes`, { 
        method: 'POST', 
        headers: withAuth({ 'Content-Type': 'application/json' }), 
        body: JSON.stringify(quoteData) 
      })
      if (!res.ok) throw new Error('add failed')
      return await res.json()
    } catch (e) {
      // Handle offline: save to localStorage and return mock response
      const quotes = JSON.parse(localStorage.getItem('quotes') || '{}')
      quotes[quoteData.id] = quoteData
      localStorage.setItem('quotes', JSON.stringify(quotes))
      return { ok: true, local: true }
    }
  },
  async updateQuote(id, patch) {
    try {
      const res = await fetchWithTimeout(`${API_BASE}/api/quotes/${id}`, { method: 'PATCH', headers: withAuth({ 'Content-Type': 'application/json' }), body: JSON.stringify(patch) })
      if (!res.ok) throw new Error('update failed')
      return await res.json()
    } catch (e) {
      lsUpdate(id, patch)
      return { ok: true, local: true }
    }
  },
  async updateQuoteStatus(id, status) {
    try {
      const res = await fetchWithTimeout(`${API_BASE}/api/quotes/${id}/status`, { method: 'PATCH', headers: withAuth({ 'Content-Type': 'application/json' }), body: JSON.stringify({ status }) })
      if (!res.ok) throw new Error('status update failed')
      return await res.json()
    } catch (e) {
      console.error('Status update error:', e)
      throw e
    }
  },
  async remove(id) {
    try {
      const res = await fetchWithTimeout(`${API_BASE}/api/quotes/${id}`, { method: 'DELETE', headers: withAuth() })
      if (!res.ok) throw new Error('delete failed')
      return await res.json()
    } catch (e) {
      lsDelete(id)
      return { ok: true, local: true }
    }
  },
  downloadTxt(id, data, showNotification) {
    const url = `${API_BASE}/api/quotes/${id}/txt`
    fetchWithTimeout(url, { headers: withAuth() }, 2500).then(async (res) => {
      if (res && res.ok) {
        const textContent = await res.text()
        const blob = new Blob([textContent], { type: 'text/plain;charset=utf-8' })
        const a = document.createElement('a')
        const downloadUrl = URL.createObjectURL(blob)
        a.href = downloadUrl
        a.download = `burkol_quote_${id}.txt`
        document.body.appendChild(a); a.click(); a.remove()
        URL.revokeObjectURL(downloadUrl)
        if (showNotification) showNotification('TXT dosyası başarıyla indirildi!', 'success')
      } else if (res && res.status === 401) {
        throw new Error('unauthorized')
      } else { throw new Error('backend txt not ok') }
    }).catch(() => {
      const q = data || lsLoad().find(x => x.id === id)
      if (!q) return
      const lines = []
      lines.push('Burkol Metal — Teklif Özeti')
      lines.push(`Tarih: ${new Date(q.createdAt || Date.now()).toLocaleString()}`)
      lines.push(`ID: ${q.id}`)
      lines.push('')
      lines.push('[Genel]')
      try {
        const lang = (localStorage.getItem('bk_lang') || 'tr')
        const t = tFor(lang)
        lines.push(`Durum: ${statusLabel(q.status, t)}`)
      } catch {
        lines.push(`Durum: ${q.status || ''}`)
      }
      lines.push(`Proje: ${q.proj || ''}`)
      lines.push(`Süreç: ${(q.process || []).join(', ')}`)
      lines.push(`Açıklama: ${q.desc || ''}`)
      lines.push('')
      lines.push('[Müşteri]')
      lines.push(`Ad Soyad: ${q.name || ''}`)
      lines.push(`Firma: ${q.company || ''}`)
      lines.push(`E‑posta: ${q.email || ''}`)
      lines.push(`Telefon: ${q.phone || ''}`)
      lines.push(`Ülke/Şehir: ${(q.country || '')} / ${(q.city || '')}`)
      lines.push('')
      lines.push('[Teknik]')
      lines.push(`Malzeme: ${q.material || ''}`)
      lines.push(`Kalite/Alaşım: ${q.grade || ''}`)
      lines.push(`Kalınlık: ${q.thickness || ''} mm`)
      lines.push(`Adet: ${q.qty || ''}`)
      lines.push(`Boyut: ${q.dims || ''}`)
      lines.push(`Tolerans: ${q.tolerance || ''}`)
      lines.push(`Yüzey: ${q.finish || ''}`)
      lines.push(`Termin: ${q.due || ''}`)
      lines.push(`Tekrarlılık: ${q.repeat || ''}`)
      lines.push(`Bütçe: ${q.budget || ''}`)
      const files = q.files || []
      lines.push('[Dosyalar]')
      if (files.length === 0) {
        lines.push('—')
      } else {
        files.forEach((f, i) => { lines.push(`${i + 1}. ${f.name} (${Math.round((f.size || 0) / 1024)} KB)`) })
      }
      lines.push('')
      const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' })
      const a = document.createElement('a'); const dl = URL.createObjectURL(blob)
      a.href = dl; a.download = `burkol_quote_${id}.txt`; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(dl)
      if (showNotification) showNotification('TXT dosyası başarıyla indirildi!', 'success')
    })
  },
  // Auth
  async login(email, password, remember) {
    try {
      const res = await fetchWithTimeout(`${API_BASE}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password, remember }) })
      const data = await res.json() // Always parse JSON body
      if (!res.ok) {
        // Throw an error with the message from the server's JSON response
        throw new Error(data.error || (res.status === 401 ? 'unauthorized' : 'server_error'))
      }
      if (data && data.token) setToken(data.token)
      return data
    } catch (e) {
      if (e && e.message) throw e
      throw new Error('network_error')
    }
  },
  async me() {
    const res = await fetchWithTimeout(`${API_BASE}/api/auth/me`, { headers: withAuth() })
    if (!res.ok) throw new Error('unauthorized')
    return await res.json()
  },
  async verifyAdminAccess(email, password) {
    try {
      const res = await fetchWithTimeout(`${API_BASE}/api/auth/verify-admin`, { 
        method: 'POST', 
        headers: withAuth({ 'Content-Type': 'application/json' }), 
        body: JSON.stringify({ email, password }) 
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'verification_failed')
      }
      return data
    } catch (e) {
      if (e && e.message) throw e
      throw new Error('network_error')
    }
  },
  async logout() {
    try { await fetchWithTimeout(`${API_BASE}/api/auth/logout`, { method: 'POST', headers: withAuth() }) } catch {}
    setToken('')
  },
  async listSessions() {
    const token = getToken()
    console.log('🔍 listSessions debug:', { 
      API_BASE, 
      token: token ? token.slice(0, 10) + '...' : 'NO_TOKEN',
      url: `${API_BASE}/api/admin/sessions`
    })
    
    let res = await fetchWithTimeout(`${API_BASE}/api/admin/sessions`, { headers: withAuth() })
    console.log('🔍 listSessions response:', { status: res.status, ok: res.ok })

    // Dev fallback: if unauthorized, retry once with dev token
    if (res.status === 401 && (window?.location?.hostname === 'localhost' || window?.location?.hostname?.startsWith('127.') || window?.location?.hostname?.startsWith('192.') )) {
      try {
        console.log('🔧 listSessions: retrying with dev token fallback')
        res = await fetchWithTimeout(`${API_BASE}/api/admin/sessions`, { headers: { Authorization: 'Bearer dev-admin-token' } })
      } catch (e) {}
    }
    if (!res.ok) throw new Error('list_sessions_failed')
    const payload = await res.json().catch(() => ([]))
    if (Array.isArray(payload)) return payload
    if (Array.isArray(payload?.sessions)) return payload.sessions
    return []
  },
  async deleteSession(sessionId) {
    const res = await fetchWithTimeout(`${API_BASE}/api/admin/sessions/${encodeURIComponent(sessionId)}`, {
      method: 'DELETE',
      headers: withAuth()
    })
    if (!res.ok) throw new Error('delete_session_failed')
    return await res.json()
  },
  async migrateIds() {
    try {
      const res = await fetchWithTimeout(`${API_BASE}/api/migrate/ids`, { method: 'POST', headers: withAuth() })
      if (!res.ok) throw new Error('migration failed')
      return await res.json()
    } catch (e) {
      throw e
    }
  },
  async getSettings() {
    try {
      const res = await fetchWithTimeout(`${API_BASE}/api/settings`, { headers: withAuth() })
      if (!res.ok) throw new Error('get settings failed')
      return await res.json()
    } catch (e) {
      throw e
    }
  },
  async saveSettings(settings) {
    try {
      const res = await fetchWithTimeout(`${API_BASE}/api/settings`, { 
        method: 'POST', 
        headers: withAuth({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(settings)
      })
      if (!res.ok) throw new Error('save settings failed')
      return await res.json()
    } catch (e) {
      throw e
    }
  },
  
  // Form Configuration APIs
  async getFormConfig() {
    try {
      const res = await fetchWithTimeout(`${API_BASE}/api/form-config`, {}, 2000)
      if (!res.ok) throw new Error('get form config failed')
      return await res.json()
    } catch (e) {
      console.warn('Form config API failed, using fallback:', e.message)
      // Return a default form config
      return {
        fields: [
          { id: 'name', label: 'Müşteri Adı', type: 'text', required: true },
          { id: 'proj', label: 'Proje Adı', type: 'text', required: true },
          { id: 'price', label: 'Fiyat', type: 'number', required: true }
        ]
      }
    }
  },
  
  async getFormFields() {
    try {
      const res = await fetchWithTimeout(`${API_BASE}/api/form-fields`)
      if (!res.ok) throw new Error('get form fields failed')
      return await res.json()
    } catch (e) {
      throw e
    }
  },

  async saveFormConfig(formConfig) {
    console.log('🔧 DEBUG: API.saveFormConfig called with:', formConfig)
    try {
      const url = `${API_BASE}/api/form-config`
      console.log('🔧 DEBUG: Sending request to:', url)
      console.log('🔧 DEBUG: Headers:', withAuth({ 'Content-Type': 'application/json' }))
      
      const res = await fetchWithTimeout(url, { 
        method: 'POST', 
        headers: withAuth({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(formConfig)
      })
      
      console.log('🔧 DEBUG: Response status:', res.status)
      console.log('🔧 DEBUG: Response ok:', res.ok)
      
      if (!res.ok) {
        const errorText = await res.text()
        console.log('🔧 DEBUG: Error response text:', errorText)
        throw new Error(`save form config failed: ${res.status} - ${errorText}`)
      }
      
      const result = await res.json()
      console.log('🔧 DEBUG: Success response:', result)
      return result
    } catch (e) {
      console.error('🔧 DEBUG: API.saveFormConfig error:', e)
      throw e
    }
  },
  async previewFormConfig(formConfig) {
    try {
      const res = await fetchWithTimeout(`${API_BASE}/api/form-config/preview`, { 
        method: 'POST', 
        headers: withAuth({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(formConfig)
      })
      if (!res.ok) throw new Error('preview form config failed')
      return await res.json()
    } catch (e) {
      throw e
    }
  },
  
  // Migration APIs
  async getMigrationStatus() {
    try {
      const res = await fetchWithTimeout(`${API_BASE}/api/migration/status`, { headers: withAuth() })
      if (!res.ok) throw new Error('get migration status failed')
      return await res.json()
    } catch (e) {
      throw e
    }
  },
  async updateQuotePrice(quoteId) {
    try {
      const res = await fetchWithTimeout(`${API_BASE}/api/migration/quotes/${quoteId}/price`, { 
        method: 'POST', 
        headers: withAuth() 
      })
      if (!res.ok) throw new Error('update quote price failed')
      return await res.json()
    } catch (e) {
      throw e
    }
  },

  // Version History API
  async saveQuoteVersion(id, reason = 'Admin modification') {
    try {
      const res = await fetchWithTimeout(`${API_BASE}/api/quotes/${id}/save-version`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ reason })
      })
      if (!res.ok) throw new Error('save version failed')
      return await res.json()
    } catch (e) {
      throw e
    }
  },

  async getQuoteVersions(id) {
    try {
      const res = await fetchWithTimeout(`${API_BASE}/api/quotes/${id}/versions`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      })
      if (!res.ok) throw new Error('get versions failed')
      return await res.json()
    } catch (e) {
      throw e
    }
  },

  async restoreQuoteVersion(id, versionIndex) {
    try {
      const res = await fetchWithTimeout(`${API_BASE}/api/quotes/${id}/restore-version`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ versionIndex })
      })
      if (!res.ok) throw new Error('restore version failed')
      return await res.json()
    } catch (e) {
      throw e
    }
  },

  // Price Settings API
  async getPriceSettings() {
    try {
      const res = await fetchWithTimeout(`${API_BASE}/api/price-settings`, { headers: withAuth() }, 2000)
      if (!res.ok) throw new Error('get price settings failed')
      return await res.json()
    } catch (e) {
      console.warn('Price settings API failed, using fallback:', e.message)
      // Return default settings if API fails
      return {
        currency: 'TRY',
        margin: 20,
        discountThreshold: 1000,
        discountPercent: 5,
        version: 1,
        versionId: 'default-v1',
        updatedAt: new Date().toISOString()
      }
    }
  },

  async savePriceSettings(settings) {
    try {
      const res = await fetchWithTimeout(`${API_BASE}/api/price-settings`, {
        method: 'POST',
        headers: withAuth({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(settings)
      }, 15000)
      if (!res.ok) throw new Error('save price settings failed')
      return await res.json()
    } catch (e) {
      throw e
    }
  },

  // VERSION MANAGEMENT API FUNCTIONS

  async getPriceSettingsVersions() {
    try {
      const res = await fetchWithTimeout(`${API_BASE}/api/price-settings/versions`, {
        headers: withAuth()
      })
      if (!res.ok) throw new Error('get price settings versions failed')
      return await res.json()
    } catch (e) {
      throw e
    }
  },

  async restorePriceSettingsVersion(versionId) {
    try {
      const res = await fetchWithTimeout(`${API_BASE}/api/price-settings/restore/${versionId}`, {
        method: 'POST',
        headers: withAuth({ 'Content-Type': 'application/json' })
      })
      if (!res.ok) throw new Error('restore version failed')
      return await res.json()
    } catch (e) {
      throw e
    }
  },

  // Quote price version comparison
  async getQuotePriceComparison(quoteId) {
    // Check localStorage mode first
    if (LOCAL_STORAGE_MODE) {
      console.log('🔧 DEBUG: Using localStorage mode for getQuotePriceComparison')
      // Simulate comparison from localStorage
      const quotes = lsLoad()
      const quote = quotes.find(q => q.id === quoteId)
      if (quote) {
        return {
          quote: quote,
          differenceSummary: quote.priceStatus?.differenceSummary || null,
          versions: {
            original: quote.originalPriceVersion || { version: 'N/A', versionId: '—' },
            applied: quote.priceVersionApplied || { version: 99, versionId: 'Admin-20251009-05' },
            latest: { version: 101, versionId: 'Admin-20251009-07' }
          },
          comparisonBaseline: 'applied'
        }
      }
      throw new Error('Quote not found in localStorage')
    }

    try {
      const res = await fetchWithTimeout(`${API_BASE}/api/quotes/${quoteId}/price-comparison`, {
        headers: withAuth()
      })
      if (!res.ok) throw new Error('get quote price comparison failed')
      return await res.json()
    } catch (e) {
      console.warn('Price comparison API failed, using localStorage fallback:', e.message)
      // Enable localStorage mode and retry
      LOCAL_STORAGE_MODE = true
      return this.getQuotePriceComparison(quoteId)
    }
  },

  async applyCurrentPriceToQuote(quoteId) {
    // Check localStorage mode first - same as other new functions
    if (LOCAL_STORAGE_MODE) {
      console.log('🔧 DEBUG: Using localStorage mode for applyCurrentPriceToQuote')
      // Simulate price update in localStorage
      const quotes = lsLoad()
      const quote = quotes.find(q => q.id === quoteId)
      if (quote && quote.priceStatus?.calculatedPrice) {
        // Only update specific fields, keep originalPriceVersion intact
        const updatePatch = {
          price: quote.priceStatus.calculatedPrice,
          priceVersionApplied: {
            versionNumber: 101, // Current system version
            versionId: 'Admin-20251009-07',
            capturedAt: new Date().toISOString()
          },
          priceStatus: { 
            ...quote.priceStatus, 
            status: 'current',
            differenceSummary: null
          }
        }
        lsUpdate(quoteId, updatePatch)
        // Return the merged quote with original data preserved
        const updatedQuote = lsLoad().find(q => q.id === quoteId)
        return { success: true, quote: updatedQuote }
      }
      return { success: false, error: 'Quote not found or no calculated price' }
    }

    try {
      const res = await fetchWithTimeout(`${API_BASE}/api/quotes/${quoteId}/apply-current-price`, {
        method: 'POST',
        headers: withAuth({ 'Content-Type': 'application/json' })
      })
      if (!res.ok) throw new Error('apply current price failed')
      return await res.json()
    } catch (e) {
      console.warn('Apply current price API failed, using localStorage fallback:', e.message)
      // Enable localStorage mode and retry
      LOCAL_STORAGE_MODE = true
      return this.applyCurrentPriceToQuote(quoteId)
    }
  },

  async setManualPrice(quoteId, { price, note } = {}) {
    try {
      const res = await fetchWithTimeout(`${API_BASE}/api/quotes/${quoteId}/manual-price`, {
        method: 'POST',
        headers: withAuth({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ price, note })
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(json?.error || 'manual price set failed')
      }
      return json
    } catch (e) {
      throw e
    }
  },

  async clearManualPrice(quoteId, reason = 'Manual fiyat kilidi kaldırıldı') {
    try {
      const res = await fetchWithTimeout(`${API_BASE}/api/quotes/${quoteId}/manual-price`, {
        method: 'DELETE',
        headers: withAuth({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ reason })
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(json?.error || 'manual price clear failed')
      }
      return json
    } catch (e) {
      throw e
    }
  },

  // Price calculation preview
  async calculatePricePreview(quote, priceSettings) {
    try {
      const res = await fetchWithTimeout(`${API_BASE}/api/calculate-price`, {
        method: 'POST',
        headers: withAuth({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ quote, priceSettings })
      })
      if (!res.ok) throw new Error('price calculation failed')
      const result = await res.json()
      return result.calculatedPrice || 0
    } catch (e) {
      console.error('Price calculation failed:', e)
      // Fallback to local calculation if server fails
      return this.calculatePriceLocal(quote, priceSettings)
    }
  },

  // Local price calculation fallback
  calculatePriceLocal(quote, priceSettings) {
    console.log('🔧 calculatePriceLocal called with:', { quote: quote?.id, priceSettings: !!priceSettings })
    
    if (!priceSettings || !priceSettings.parameters || !priceSettings.formula) {
      console.log('⚠️ Missing priceSettings data, returning fallback price')
      return quote.calculatedPrice || quote.price || 0
    }

    try {
      // Create parameter values map
      const paramValues = {}
      
      console.log('📊 Processing parameters:', priceSettings.parameters.length)
      
      priceSettings.parameters.forEach(param => {
        if (!param || !param.id) return
        
        if (param.type === 'fixed') {
          paramValues[param.id] = parseFloat(param.value) || 0
          console.log(`📌 Fixed param ${param.id} = ${paramValues[param.id]}`)
        } else if (param.type === 'form') {
          let value = 0
          
          if (param.formField === 'qty') {
            value = parseFloat(quote.qty) || 0
          } else if (param.formField === 'thickness') {
            value = parseFloat(quote.thickness) || 0
          } else if (param.formField === 'dimensions') {
            // Calculate area from dimensions
            const l = parseFloat(quote.dimsL)
            const w = parseFloat(quote.dimsW)
            if (!isNaN(l) && !isNaN(w)) {
              value = l * w
            } else {
              const dims = quote.dims || ''
              const match = String(dims).match(/(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)/i)
              if (match) {
                value = (parseFloat(match[1]) || 0) * (parseFloat(match[2]) || 0)
              }
            }
          } else {
            // For custom form fields
            let fieldValue = quote[param.formField] || quote.customFields?.[param.formField]
            
            if (Array.isArray(fieldValue)) {
              // Multi-select: sum all lookup values
              value = fieldValue.reduce((sum, opt) => {
                const lookup = param.lookupTable?.find(l => l.option === opt)
                return sum + (parseFloat(lookup?.value) || 0)
              }, 0)
            } else if (param.lookupTable && fieldValue) {
              // Single select: find lookup value
              const lookup = param.lookupTable.find(l => l.option === fieldValue)
              value = parseFloat(lookup?.value) || 0
            } else {
              value = parseFloat(fieldValue) || 0
            }
          }
          
          paramValues[param.id] = value
          console.log(`📋 Form param ${param.id} (${param.formField}) = ${value}`)
        }
      })

      // Simple formula evaluation (basic math operations)
      let formula = priceSettings.formula
      console.log('🎯 Original formula:', formula)
      
      // Replace parameter IDs with values
      Object.keys(paramValues).forEach(paramId => {
        const regex = new RegExp(`\\b${paramId}\\b`, 'g')
        formula = formula.replace(regex, paramValues[paramId])
      })
      
      console.log('🔄 Substituted formula:', formula)

      // Clean up formula for safe evaluation
      formula = formula.trim()
      
      // Check for invalid characters that could cause syntax errors
      if (!formula || formula === '' || /[=;{}[\]<>]/.test(formula)) {
        console.warn('⚠️ Invalid formula detected:', formula)
        return quote.calculatedPrice || quote.price || 0
      }

      // Handle Excel-style functions like MARKUP, DISCOUNT, etc.
      try {
        // Convert Excel functions to JavaScript equivalents
        formula = formula.replace(/\bMARKUP\s*\(/g, 'MARKUP(')
        formula = formula.replace(/\bDISCOUNT\s*\(/g, 'DISCOUNT(')
        formula = formula.replace(/\bVAT\s*\(/g, 'VAT(')
        formula = formula.replace(/\bMAX\s*\(/g, 'Math.max(')
        formula = formula.replace(/\bMIN\s*\(/g, 'Math.min(')
        formula = formula.replace(/\bABS\s*\(/g, 'Math.abs(')
        formula = formula.replace(/\bSQRT\s*\(/g, 'Math.sqrt(')
        
        // Define business functions in evaluation context
        const mathContext = {
          MARKUP: (cost, markupPercent) => cost * (1 + markupPercent / 100),
          DISCOUNT: (price, discountPercent) => price * (1 - discountPercent / 100),
          VAT: (amount, vatRate) => amount * (1 + vatRate / 100),
          Math: Math
        }
        
        // Create function names for context
        const contextKeys = Object.keys(mathContext).join(', ')
        
        console.log('🧮 Evaluating formula:', formula)
        const result = Function(contextKeys, `"use strict"; return (${formula})`)(
          ...Object.values(mathContext)
        )
        console.log('✅ Calculation result:', result)
        return isNaN(result) ? 0 : Number(result)
      } catch (e) {
        console.error('❌ Formula evaluation error:', e)
        console.error('❌ Failed formula:', formula)
        console.error('❌ Parameter values:', paramValues)
        return quote.calculatedPrice || quote.price || 0
      }
    } catch (error) {
      console.error('❌ Local price calculation error:', error)
      return quote.calculatedPrice || quote.price || 0
    }
  },

  // Version comparison for quotes
  async compareQuotePriceVersions(quoteId) {
    try {
      const res = await fetchWithTimeout(`${API_BASE}/api/quotes/${quoteId}/price-comparison`, {
        headers: withAuth()
      })
      if (!res.ok) throw new Error('price comparison failed')
      return await res.json()
    } catch (e) {
      // Fallback: basic check if quote needs update
      console.warn('Price comparison API failed, using fallback logic:', e.message)
      return {
        needsUpdate: false,
        status: { status: 'current', message: 'API unavailable' }
      }
    }
  },

  // Update quote version without changing price
  async updateQuoteVersion(id) {
    // For now, always use localStorage mode for these new endpoints
    console.log('🔧 DEBUG: Using localStorage mode for updateQuoteVersion (backend endpoints not implemented)')
    const updatedQuote = lsUpdate(id, { 
      priceVersionApplied: { 
        version: Date.now(), 
        versionId: `manual-${Date.now()}`,
        capturedAt: new Date().toISOString()
      },
      priceStatus: { status: 'current' }
    })
    return { success: true, quote: updatedQuote }
  },

  // Hide version warning for quote
  async hideVersionWarning(id) {
    // For now, always use localStorage mode for these new endpoints
    console.log('🔧 DEBUG: Using localStorage mode for hideVersionWarning (backend endpoints not implemented)')
    const updatedQuote = lsUpdate(id, { 
      versionWarningHidden: true,
      priceStatus: { status: 'current' }
    })
    return { success: true, quote: updatedQuote }
  },
  
  // Clear localStorage quotes (admin utility)
  clearLocalStorageQuotes() {
    lsClear()
    return { success: true, message: 'localStorage quotes cleared' }
  }
}

export default API
