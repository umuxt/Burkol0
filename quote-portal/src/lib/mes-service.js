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

export const MasterDataService = {
  // Get master data (skills, operation types)
  async getMasterData() {
    try {
      const response = await fetchWithRetry(`${API_BASE}/mes/master-data`, {
        headers: withAuth()
      })
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.message || `HTTP ${response.status}`)
      }
      
      return await response.json()
    } catch (error) {
      console.error('❌ Error fetching master data:', error)
      throw error
    }
  },

  // Update master data
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
      
      return await response.json()
    } catch (error) {
      console.error('❌ Error updating master data:', error)
      throw error
    }
  }
}

// ============================================================================
// MES SERVICE - Combined Interface
// ============================================================================

export const MESService = {
  ...OperationsService,
  ...WorkersService, 
  ...StationsService,
  ...WorkOrdersService,
  ...MasterDataService,

  // Polling functionality for real-time updates
  async startPolling(callbacks = {}, interval = 5000) {
    const poll = async () => {
      try {
        if (callbacks.onOperations) {
          const operations = await this.getOperations()
          callbacks.onOperations(operations)
        }
        
        if (callbacks.onWorkers) {
          const workers = await this.getWorkers()
          callbacks.onWorkers(workers)
        }
        
        if (callbacks.onStations) {
          const stations = await this.getStations()
          callbacks.onStations(stations)
        }
        
        if (callbacks.onWorkOrders) {
          const workOrders = await this.getWorkOrders()
          callbacks.onWorkOrders(workOrders)
        }
        
        if (callbacks.onMasterData) {
          const masterData = await this.getMasterData()
          callbacks.onMasterData(masterData)
        }
      } catch (error) {
        console.error('❌ Polling error:', error)
        if (callbacks.onError) {
          callbacks.onError(error)
        }
      }
    }

    // Initial load
    await poll()

    // Set up polling
    const pollId = setInterval(poll, interval)
    
    return () => {
      clearInterval(pollId)
      console.log('🔴 MES polling stopped')
    }
  }
}