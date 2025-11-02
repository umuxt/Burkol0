// MES Service - Backend API calls (similar to materials-service.js pattern)
import { fetchWithTimeout, API_BASE } from './api.js'

function withAuth(headers = {}) {
  try {
    const t = localStorage.getItem('bk_admin_token') || (typeof window !== 'undefined' && window.location.hostname === 'localhost' ? 'dev-admin-token' : '')
    return t ? { ...headers, Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' } : { ...headers, 'Content-Type': 'application/json' }
  } catch {
    return { ...headers, 'Content-Type': 'application/json' }
  }
}

// Enhanced fetch with retry mechanism
async function fetchWithRetry(url, options = {}, maxRetries = 2) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetchWithTimeout(url, options, attempt === 1 ? 15000 : 25000)
      
      if (response.ok) {
        return response
      }
      
      if (response.status === 429 && attempt < maxRetries) {
        const retryAfter = parseInt(response.headers.get('Retry-After') || '60')
        console.warn(`⚠️ Rate limited, waiting ${retryAfter}s before retry ${attempt + 1}`)
        await new Promise(resolve => setTimeout(resolve, retryAfter * 1000))
        continue
      }
      
      if (response.status === 503 && attempt < maxRetries) {
        const backoffMs = Math.pow(2, attempt) * 1000
        console.warn(`⚠️ Service unavailable, waiting ${backoffMs}ms before retry ${attempt + 1}`)
        await new Promise(resolve => setTimeout(resolve, backoffMs))
        continue
      }
      
      return response
    } catch (error) {
      console.error(`❌ Fetch attempt ${attempt} failed:`, error.message)
      
      if (attempt === maxRetries) {
        throw error
      }
      
      const backoffMs = Math.pow(2, attempt) * 1000
      await new Promise(resolve => setTimeout(resolve, backoffMs))
    }
  }
}

// ============================================================================
// OPERATIONS SERVICE
// ============================================================================

export const OperationsService = {
  // Get all operations
  async getOperations() {
    try {
      const response = await fetchWithRetry(`${API_BASE}/mes/operations`, {
        headers: withAuth()
      })
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.message || `HTTP ${response.status}`)
      }
      
      const data = await response.json()
      return data.operations || []
    } catch (error) {
      console.error('❌ Error fetching operations:', error)
      throw error
    }
  },

  // Update operations (batch)
  async setOperations(operations) {
    try {
      const response = await fetchWithRetry(`${API_BASE}/mes/operations`, {
        method: 'POST',
        headers: withAuth(),
        body: JSON.stringify({ operations })
      })
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.message || `HTTP ${response.status}`)
      }
      
      return await response.json()
    } catch (error) {
      console.error('❌ Error updating operations:', error)
      throw error
    }
  }
}

// ============================================================================
// WORKERS SERVICE
// ============================================================================

export const WorkersService = {
  // Get all workers
  async getWorkers() {
    try {
      const response = await fetchWithRetry(`${API_BASE}/mes/workers`, {
        headers: withAuth()
      })
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.message || `HTTP ${response.status}`)
      }
      
      const data = await response.json()
      return data.workers || []
    } catch (error) {
      console.error('❌ Error fetching workers:', error)
      throw error
    }
  },

  // Update workers (batch)
  async setWorkers(workers) {
    try {
      const response = await fetchWithRetry(`${API_BASE}/mes/workers`, {
        method: 'POST',
        headers: withAuth(),
        body: JSON.stringify({ workers })
      })
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.message || `HTTP ${response.status}`)
      }
      
      return await response.json()
    } catch (error) {
      console.error('❌ Error updating workers:', error)
      throw error
    }
  }
}

// ============================================================================
// STATIONS SERVICE
// ============================================================================

export const StationsService = {
  // Get all stations
  async getStations() {
    try {
      const response = await fetchWithRetry(`${API_BASE}/mes/stations`, {
        headers: withAuth()
      })
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.message || `HTTP ${response.status}`)
      }
      
      const data = await response.json()
      return data.stations || []
    } catch (error) {
      console.error('❌ Error fetching stations:', error)
      throw error
    }
  },

  // Update stations (batch)
  async setStations(stations) {
    try {
      const response = await fetchWithRetry(`${API_BASE}/mes/stations`, {
        method: 'POST',
        headers: withAuth(),
        body: JSON.stringify({ stations })
      })
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.message || `HTTP ${response.status}`)
      }
      
      return await response.json()
    } catch (error) {
      console.error('❌ Error updating stations:', error)
      throw error
    }
  }
}

// ============================================================================
// WORK ORDERS SERVICE
// ============================================================================

export const WorkOrdersService = {
  // Get all work orders
  async getWorkOrders() {
    try {
      const response = await fetchWithRetry(`${API_BASE}/mes/work-orders`, {
        headers: withAuth()
      })
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.message || `HTTP ${response.status}`)
      }
      
      const data = await response.json()
      return data.workOrders || []
    } catch (error) {
      console.error('❌ Error fetching work orders:', error)
      throw error
    }
  },

  // Create work order
  async addWorkOrder(workOrder) {
    try {
      const response = await fetchWithRetry(`${API_BASE}/mes/work-orders`, {
        method: 'POST',
        headers: withAuth(),
        body: JSON.stringify(workOrder)
      })
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.message || `HTTP ${response.status}`)
      }
      
      return await response.json()
    } catch (error) {
      console.error('❌ Error adding work order:', error)
      throw error
    }
  },

  // Update work order
  async updateWorkOrder(id, updates) {
    try {
      const response = await fetchWithRetry(`${API_BASE}/mes/work-orders/${id}`, {
        method: 'PUT',
        headers: withAuth(),
        body: JSON.stringify(updates)
      })
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.message || `HTTP ${response.status}`)
      }
      
      return await response.json()
    } catch (error) {
      console.error('❌ Error updating work order:', error)
      throw error
    }
  },

  // Delete work order
  async deleteWorkOrder(id) {
    try {
      const response = await fetchWithRetry(`${API_BASE}/mes/work-orders/${id}`, {
        method: 'DELETE',
        headers: withAuth()
      })
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.message || `HTTP ${response.status}`)
      }
      
      return await response.json()
    } catch (error) {
      console.error('❌ Error deleting work order:', error)
      throw error
    }
  }
}

// ============================================================================
// MASTER DATA SERVICE
// ============================================================================

let _mdCache = null
function ssRead(key) { try { const raw = sessionStorage.getItem(key); return raw ? JSON.parse(raw) : null } catch { return null } }
function ssWrite(key, val) { try { sessionStorage.setItem(key, JSON.stringify(val)) } catch {} }
function ssClear(key) { try { sessionStorage.removeItem(key) } catch {} }
function isReload() {
  try {
    const nav = performance.getEntriesByType && performance.getEntriesByType('navigation')[0]
    if (nav) return nav.type === 'reload'
    const legacy = performance.navigation && performance.navigation.type
    return legacy === 1
  } catch { return false }
}
let _reloadForcedMasterReact = false
const MD_CHANGED_EVENT = 'master-data:changed'
const MD_INVALIDATED_EVENT = 'master-data:invalidated'

export const MasterDataService = {
  // Get master data (skills, operation types) with caching
  async getMasterData(force = false) {
    try {
      const shouldForce = force || (isReload() && !_reloadForcedMasterReact)
      if (!shouldForce && _mdCache) return _mdCache
      if (!shouldForce && !_mdCache) {
        const persisted = ssRead('react_mes_master_data_cache')
        if (persisted) { _mdCache = persisted; return _mdCache }
      }
      const response = await fetchWithRetry(`${API_BASE}/mes/master-data`, { headers: withAuth() })
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.message || `HTTP ${response.status}`)
      }
      _mdCache = await response.json()
      ssWrite('react_mes_master_data_cache', _mdCache)
      if (isReload()) _reloadForcedMasterReact = true
      return _mdCache
    } catch (error) {
      console.error('❌ Error fetching master data:', error)
      throw error
    }
  },

  // Update master data and update cache + broadcast
  async setMasterData(masterData) {
    try {
      const response = await fetchWithRetry(`${API_BASE}/mes/master-data`, {
        method: 'POST',
        headers: withAuth(),
        body: JSON.stringify(masterData)
      })
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.message || `HTTP ${response.status}`)
      }
      // Backend returns { success: true }; keep client cache in sync using the payload or refetch if needed
      try { await response.json().catch(() => ({})) } catch {}
      _mdCache = masterData
      ssWrite('react_mes_master_data_cache', _mdCache)
      try { window.dispatchEvent(new CustomEvent(MD_CHANGED_EVENT, { detail: { source: 'react' } })) } catch {}
      return _mdCache
    } catch (error) {
      console.error('❌ Error updating master data:', error)
      throw error
    }
  },

  invalidateCache() {
    _mdCache = null
    ssClear('react_mes_master_data_cache')
    try { window.dispatchEvent(new CustomEvent(MD_INVALIDATED_EVENT, { detail: { source: 'react' } })) } catch {}
  }
}

// Listen cross-context events to keep cache in sync
try {
  window.addEventListener(MD_INVALIDATED_EVENT, () => { _mdCache = null })
  window.addEventListener(MD_CHANGED_EVENT, async () => {
    // Minimal strategy: invalidate, consumers can refetch via hook
    _mdCache = null
  })
} catch {}

// ============================================================================
// MES SERVICE - Combined Interface
// ============================================================================

export const MESService = {
  ...OperationsService,
  ...WorkersService, 
  ...StationsService,
  ...WorkOrdersService,
  ...MasterDataService
}
