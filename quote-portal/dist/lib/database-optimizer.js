// Database Query Optimizer - JSON database performance improvements
import fs from 'fs'
import path from 'path'

class DatabaseOptimizer {
  constructor(dbPath) {
    this.dbPath = dbPath
    this.cache = new Map()
    this.indexes = new Map()
    this.queryStats = new Map()
    this.config = {
      cacheSize: 1000,
      cacheTTL: 300000, // 5 minutes
      indexThreshold: 100, // Create index after 100 items
      queryLogging: true
    }
  }

  // Initialize optimizer
  async initialize() {
    await this.buildIndexes()
    this.setupPeriodicOptimization()
    console.log('🗄️ Database optimizer initialized')
  }

  // Build indexes for commonly queried fields
  async buildIndexes() {
    try {
      const data = await this.loadData()
      
      // Build indexes for common query fields
      const indexFields = ['status', 'email', 'company', 'createdAt', 'material']
      
      for (const field of indexFields) {
        this.buildIndex(data, field)
      }
      
      console.log(`📊 Built ${this.indexes.size} database indexes`)
    } catch (error) {
      console.error('❌ Index building failed:', error)
    }
  }

  // Build single field index
  buildIndex(data, field) {
    const index = new Map()
    
    data.forEach((item, idx) => {
      const value = this.getNestedValue(item, field)
      if (value !== undefined) {
        if (!index.has(value)) {
          index.set(value, [])
        }
        index.get(value).push(idx)
      }
    })
    
    this.indexes.set(field, index)
  }

  // Get nested value from object (e.g., 'user.profile.name')
  getNestedValue(obj, path) {
    return path.split('.').reduce((curr, key) => curr?.[key], obj)
  }

  // Optimized query execution
  async query(conditions = {}, options = {}) {
    const queryKey = this.generateQueryKey(conditions, options)
    
    // Log query for statistics
    if (this.config.queryLogging) {
      this.logQuery(queryKey)
    }

    // Check cache first
    const cached = this.getFromCache(queryKey)
    if (cached) {
      console.log('💾 Query served from cache')
      return cached
    }

    const startTime = performance.now()
    
    try {
      const data = await this.loadData()
      let results = data

      // Apply filters using indexes where possible
      results = this.applyFilters(results, conditions)
      
      // Apply sorting
      if (options.sortBy) {
        results = this.applySorting(results, options.sortBy, options.sortOrder)
      }
      
      // Apply pagination
      if (options.limit || options.offset) {
        results = this.applyPagination(results, options.limit, options.offset)
      }

      // Apply field selection
      if (options.select) {
        results = this.applyFieldSelection(results, options.select)
      }

      const endTime = performance.now()
      console.log(`⚡ Query executed in ${(endTime - startTime).toFixed(2)}ms`)

      // Cache the results
      this.setCache(queryKey, results)
      
      return results
    } catch (error) {
      console.error('❌ Query execution failed:', error)
      throw error
    }
  }

  // Apply filters with index optimization
  applyFilters(data, conditions) {
    if (Object.keys(conditions).length === 0) return data

    // Try to use indexes for the first condition
    const firstCondition = Object.entries(conditions)[0]
    const [field, value] = firstCondition
    
    if (this.indexes.has(field)) {
      const index = this.indexes.get(field)
      const indexedIndices = index.get(value) || []
      let results = indexedIndices.map(idx => data[idx])
      
      // Apply remaining conditions
      const remainingConditions = Object.fromEntries(
        Object.entries(conditions).slice(1)
      )
      
      if (Object.keys(remainingConditions).length > 0) {
        results = results.filter(item => 
          this.matchesConditions(item, remainingConditions)
        )
      }
      
      console.log(`📊 Used index for field '${field}', filtered to ${results.length} items`)
      return results
    }

    // Fallback to full scan
    console.log('🔍 Full table scan (no suitable index)')
    return data.filter(item => this.matchesConditions(item, conditions))
  }

  // Check if item matches all conditions
  matchesConditions(item, conditions) {
    return Object.entries(conditions).every(([field, expectedValue]) => {
      const actualValue = this.getNestedValue(item, field)
      
      if (typeof expectedValue === 'object' && expectedValue !== null) {
        // Handle operators like { $gt: 100 }, { $like: 'pattern' }
        return this.applyOperator(actualValue, expectedValue)
      }
      
      return actualValue === expectedValue
    })
  }

  // Apply query operators
  applyOperator(value, condition) {
    for (const [operator, operand] of Object.entries(condition)) {
      switch (operator) {
        case '$gt':
          return value > operand
        case '$gte':
          return value >= operand
        case '$lt':
          return value < operand
        case '$lte':
          return value <= operand
        case '$ne':
          return value !== operand
        case '$like':
          return typeof value === 'string' && value.toLowerCase().includes(operand.toLowerCase())
        case '$in':
          return Array.isArray(operand) && operand.includes(value)
        case '$nin':
          return Array.isArray(operand) && !operand.includes(value)
        default:
          return false
      }
    }
    return false
  }

  // Apply sorting
  applySorting(data, sortBy, sortOrder = 'asc') {
    return [...data].sort((a, b) => {
      const aValue = this.getNestedValue(a, sortBy)
      const bValue = this.getNestedValue(b, sortBy)
      
      let comparison = 0
      if (aValue < bValue) comparison = -1
      else if (aValue > bValue) comparison = 1
      
      return sortOrder === 'desc' ? -comparison : comparison
    })
  }

  // Apply pagination
  applyPagination(data, limit, offset = 0) {
    const start = offset
    const end = limit ? start + limit : undefined
    return data.slice(start, end)
  }

  // Apply field selection
  applyFieldSelection(data, fields) {
    if (!Array.isArray(fields)) return data
    
    return data.map(item => {
      const selected = {}
      fields.forEach(field => {
        const value = this.getNestedValue(item, field)
        if (value !== undefined) {
          this.setNestedValue(selected, field, value)
        }
      })
      return selected
    })
  }

  // Set nested value in object
  setNestedValue(obj, path, value) {
    const keys = path.split('.')
    const lastKey = keys.pop()
    const target = keys.reduce((curr, key) => {
      if (!curr[key]) curr[key] = {}
      return curr[key]
    }, obj)
    target[lastKey] = value
  }

  // Cache management
  getFromCache(key) {
    const cached = this.cache.get(key)
    if (!cached) return null
    
    if (Date.now() > cached.expiresAt) {
      this.cache.delete(key)
      return null
    }
    
    return cached.data
  }

  setCache(key, data) {
    if (this.cache.size >= this.config.cacheSize) {
      // Remove oldest entries
      const entries = Array.from(this.cache.entries())
      entries.sort((a, b) => a[1].createdAt - b[1].createdAt)
      const toRemove = entries.slice(0, Math.floor(this.config.cacheSize / 2))
      toRemove.forEach(([key]) => this.cache.delete(key))
    }

    this.cache.set(key, {
      data: JSON.parse(JSON.stringify(data)), // Deep clone
      createdAt: Date.now(),
      expiresAt: Date.now() + this.config.cacheTTL
    })
  }

  // Generate cache key from query
  generateQueryKey(conditions, options) {
    return JSON.stringify({ conditions, options })
  }

  // Load data from file
  async loadData() {
    try {
      const rawData = await fs.promises.readFile(this.dbPath, 'utf8')
      return JSON.parse(rawData)
    } catch (error) {
      console.error('❌ Failed to load database:', error)
      return []
    }
  }

  // Save data to file with backup
  async saveData(data) {
    try {
      // Create backup
      const backupPath = this.dbPath + '.backup.' + Date.now()
      await fs.promises.copyFile(this.dbPath, backupPath)
      
      // Save new data
      await fs.promises.writeFile(this.dbPath, JSON.stringify(data, null, 2))
      
      // Clean up old backups (keep last 5)
      await this.cleanupBackups()
      
      // Invalidate cache and rebuild indexes
      this.cache.clear()
      await this.buildIndexes()
      
      console.log('💾 Database saved and optimized')
    } catch (error) {
      console.error('❌ Failed to save database:', error)
      throw error
    }
  }

  // Cleanup old backup files
  async cleanupBackups() {
    try {
      const dir = path.dirname(this.dbPath)
      const basename = path.basename(this.dbPath)
      const files = await fs.promises.readdir(dir)
      
      const backupFiles = files
        .filter(file => file.startsWith(basename + '.backup.'))
        .map(file => ({
          name: file,
          path: path.join(dir, file),
          timestamp: parseInt(file.split('.backup.')[1])
        }))
        .sort((a, b) => b.timestamp - a.timestamp)
      
      // Keep only the 5 most recent backups
      const toDelete = backupFiles.slice(5)
      for (const backup of toDelete) {
        await fs.promises.unlink(backup.path)
      }
      
      if (toDelete.length > 0) {
        console.log(`🗑️ Cleaned up ${toDelete.length} old backups`)
      }
    } catch (error) {
      console.warn('⚠️ Backup cleanup failed:', error)
    }
  }

  // Query statistics logging
  logQuery(queryKey) {
    const stats = this.queryStats.get(queryKey) || { count: 0, lastUsed: 0 }
    stats.count++
    stats.lastUsed = Date.now()
    this.queryStats.set(queryKey, stats)
  }

  // Get performance statistics
  getStats() {
    const cacheHitRate = this.cache.size > 0 ? 
      Array.from(this.queryStats.values()).reduce((hits, stat) => 
        hits + (this.cache.has(JSON.stringify(stat)) ? 1 : 0), 0
      ) / this.queryStats.size : 0

    return {
      cacheSize: this.cache.size,
      indexCount: this.indexes.size,
      queryCount: this.queryStats.size,
      cacheHitRate: Math.round(cacheHitRate * 100) + '%',
      memoryUsage: this.estimateMemoryUsage()
    }
  }

  estimateMemoryUsage() {
    const cacheSize = JSON.stringify(Array.from(this.cache.entries())).length
    const indexSize = JSON.stringify(Array.from(this.indexes.entries())).length
    return Math.round((cacheSize + indexSize) / 1024) + ' KB'
  }

  // Periodic optimization
  setupPeriodicOptimization() {
    setInterval(() => {
      this.optimizeCache()
      this.optimizeIndexes()
    }, 600000) // Every 10 minutes
  }

  optimizeCache() {
    // Remove expired entries
    const now = Date.now()
    for (const [key, value] of this.cache.entries()) {
      if (now > value.expiresAt) {
        this.cache.delete(key)
      }
    }
  }

  optimizeIndexes() {
    // Rebuild indexes if data has grown significantly
    // This is a placeholder for more sophisticated logic
    console.log('🔧 Database optimization cycle completed')
  }
}

// Export for use
export default DatabaseOptimizer

// Create instance for JSON database
const dbOptimizer = new DatabaseOptimizer('./db.json')

// Initialize on import
if (typeof window === 'undefined') {
  dbOptimizer.initialize().catch(console.error)
}

export { dbOptimizer }