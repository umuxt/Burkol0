// Advanced Module Loader - Quiet lazy loading for React components// Advanced Module Loader - Lazy loading & code splitting for React components// Advanced Module Loader - Lazy loading & code splittin         // Only log loading for real components, not performance optimizations

class ModuleLoader {

  constructor() {class ModuleLoader {      if (attempt === 1 && !this.isPerformancePath(componentPath)) {

    this.cache = new Map()

    this.loading = new Map()  constructor() {        console.log(`🔄 Loading ${componentPath}`)

    this.observers = new Map()

  }    this.cache = new Map()      }/ Only log loading for real components, not performance optimizations



  // Check if this path is a performance optimization attempt that should be quiet    this.loading = new Map()      if (attempt === 1 && !this.isPerformancePath(componentPath)) {

  isPerformancePath(componentPath) {

    return componentPath.includes('/performance/components/') ||     this.observers = new Map()        console.log(`🔄 Loading ${componentPath}`)

           componentPath.includes('/performance/modals/') ||

           componentPath.includes('/performance/admin/') ||    this.config = {      }r React components

           componentPath.includes('/domains/quotes/components/QuotesManager.js') ||

           componentPath.includes('/components/modals/SettingsModal.js') ||      preloadThreshold: '100px',class ModuleLoader {

           componentPath.includes('/components/modals/FilterPopup.js') ||

           componentPath.includes('/shared/components/ui/Modal.js') ||      chunkSize: 50000,  constructor() {

           componentPath.includes('/hooks/useNotifications.js')

  }      cacheTimeout: 300000,    this.cache = new Map()



  // Check if this is an expected lazy loading failure      retryAttempts: 1    this.loading = new Map()

  isExpectedLazyLoadingError(error, componentPath) {

    const expectedFailures = [    }    this.observers = new Map()

      '/performance/',

      'Load timeout',  }    this.config = {

      'Failed to fetch',

      '404 (Not Found)',      preloadThreshold: '100px', // Intersection observer threshold

      'Importing a module script failed',

      'TypeError: Importing a module script failed'  // Lazy load a component with intersection observer      chunkSize: 50000, // 50KB chunk size limit

    ]

      async lazyLoad(componentPath, targetElement = null) {      cacheTimeout: 300000, // 5 minutes cache

    const errorMessage = error.message || ''

    return expectedFailures.some(pattern =>     try {      retryAttempts: 1 // Fast fallback to static imports

      errorMessage.includes(pattern) || componentPath.includes(pattern)

    )      // Check cache first    }

  }

      if (this.cache.has(componentPath)) {  }

  // Lazy load with minimal console output

  async lazyLoad(componentPath) {        const cached = this.cache.get(componentPath)

    try {

      if (this.cache.has(componentPath)) {        if (Date.now() - cached.timestamp < this.config.cacheTimeout) {  // Lazy load a component with intersection observer

        return this.cache.get(componentPath).module

      }          return cached.module  async lazyLoad(componentPath, targetElement = null) {



      if (this.loading.has(componentPath)) {        }    try {

        return await this.loading.get(componentPath)

      }      }      // Check cache first



      const loadingPromise = import(componentPath)      if (this.cache.has(componentPath)) {

      this.loading.set(componentPath, loadingPromise)

      // Check if already loading        const cached = this.cache.get(componentPath)

      const module = await loadingPromise

      this.cache.set(componentPath, { module, timestamp: Date.now() })      if (this.loading.has(componentPath)) {        if (Date.now() - cached.timestamp < this.config.cacheTimeout) {

      this.loading.delete(componentPath)

              return await this.loading.get(componentPath)          return cached.module

      return module

    } catch (error) {      }        }

      this.loading.delete(componentPath)

            }

      // Only log unexpected errors, silence performance optimization failures

      if (!this.isExpectedLazyLoadingError(error, componentPath) && !this.isPerformancePath(componentPath)) {      // Create loading promise

        console.error(`❌ Module load error in ${componentPath}:`, error)

      }      const loadingPromise = this.loadWithRetry(componentPath)      // Check if already loading

      

      throw error      this.loading.set(componentPath, loadingPromise)      if (this.loading.has(componentPath)) {

    }

  }        return await this.loading.get(componentPath)



  // Create lazy component with fallback      const module = await loadingPromise      }

  createLazyComponent(componentPath, fallbackComponent = null) {

    const ReactGlobal = typeof React !== 'undefined' ? React : window.React      

    if (!ReactGlobal) return fallbackComponent

      // Cache the module      // Create loading promise

    return ReactGlobal.memo((props) => {

      const [Component, setComponent] = ReactGlobal.useState(fallbackComponent)      this.cache.set(componentPath, {      const loadingPromise = this.loadWithRetry(componentPath)



      ReactGlobal.useEffect(() => {        module,      this.loading.set(componentPath, loadingPromise)

        let mounted = true

                timestamp: Date.now()

        this.lazyLoad(componentPath)

          .then(module => {      })      const module = await loadingPromise

            if (mounted) {

              setComponent(() => module.default || module)            

            }

          })      this.loading.delete(componentPath)      // Cache the module

          .catch(() => {

            if (mounted) {      return module      this.cache.set(componentPath, {

              setComponent(() => fallbackComponent)

            }        module,

          })

    } catch (error) {        timestamp: Date.now()

        return () => { mounted = false }

      }, [])      this.loading.delete(componentPath)      })



      return Component ? ReactGlobal.createElement(Component, props) : null      // Static imports will handle the functionality      

    })

  }      throw error      this.loading.delete(componentPath)



  // Batch preload with quiet failures    }      return module

  async batchPreload(componentPaths) {

    try {  }

      await Promise.allSettled(componentPaths.map(path => this.lazyLoad(path)))

    } catch (error) {    } catch (error) {

      // Silent handling - no console spam for performance optimizations

    }  // Load module with retry mechanism      this.loading.delete(componentPath)

  }

  async loadWithRetry(componentPath, attempt = 1) {      // Silent error handling - no console spam

  // Setup intersection observer

  setupIntersectionObserver(componentPath, triggerElement) {    try {      // Static imports will handle the functionality

    if (!triggerElement || this.observers.has(triggerElement)) return

      // Only log loading for real components, not performance optimizations      throw error

    const observer = new IntersectionObserver(

      (entries) => {      if (attempt === 1 && !this.isPerformancePath(componentPath)) {    }

        entries.forEach(async (entry) => {

          if (entry.isIntersecting) {        console.log(`🔄 Loading ${componentPath}`)  }

            try {

              await this.lazyLoad(componentPath)      }

            } catch (error) {

              // Silent handling        // Load module with retry mechanism

            }

            observer.disconnect()      // Dynamic import with timeout  async loadWithRetry(componentPath, attempt = 1) {

            this.observers.delete(triggerElement)

          }      const module = await Promise.race([    try {

        })

      },        import(componentPath),      // Silent loading - no console spam

      { rootMargin: '100px' }

    )        new Promise((_, reject) =>       if (attempt === 1) {



    observer.observe(triggerElement)          setTimeout(() => reject(new Error('Load timeout')), 3000)        console.log(`� Loading ${componentPath}`)

    this.observers.set(triggerElement, observer)

  }        )      }



  // Cleanup      ])      

  cleanup() {

    this.observers.forEach(observer => observer.disconnect())            // Dynamic import with timeout

    this.observers.clear()

    this.cache.clear()      if (attempt === 1 && !this.isPerformancePath(componentPath)) {      const module = await Promise.race([

    this.loading.clear()

  }        console.log(`✅ Loaded ${componentPath}`)        import(componentPath),

}

      }        new Promise((_, reject) => 

// Initialize global module loader

if (typeof window !== 'undefined') {      return module          setTimeout(() => reject(new Error('Load timeout')), 3000)

  window.moduleLoader = new ModuleLoader()

                )

  window.addEventListener('beforeunload', () => {

    window.moduleLoader.cleanup()    } catch (error) {      ])

  })

}      if (attempt < this.config.retryAttempts) {      



export default ModuleLoader        // Silent retry for performance paths      if (attempt === 1) {

        await this.delay(500 * attempt)        console.log(`✅ Loaded ${componentPath}`)

        return this.loadWithRetry(componentPath, attempt + 1)      }

      }      return module

            

      // Filter expected performance optimization failures    } catch (error) {

      if (this.isExpectedLazyLoadingError(error, componentPath)) {      if (attempt < this.config.retryAttempts) {

        // Only log for real components, not performance optimization attempts        // Silent retry - no console spam

        if (!this.isPerformancePath(componentPath)) {        await this.delay(500 * attempt) // Faster retry

          console.log(`💭 ${componentPath} → static import fallback`)        return this.loadWithRetry(componentPath, attempt + 1)

        }      }

      } else {      

        console.error(`❌ Unexpected module error in ${componentPath}:`, error)      // Final failure - log only real errors, not expected lazy loading failures

      }      if (this.isExpectedLazyLoadingError(error, componentPath)) {

      throw error        console.log(`💭 ${componentPath} → static import fallback`)

    }      } else {

  }        console.error(`❌ Unexpected module error in ${componentPath}:`, error)

      }

  // Check if this is an expected lazy loading failure vs real error      throw error

  isExpectedLazyLoadingError(error, componentPath) {    }

    const expectedFailures = [  }

      '/performance/components/',

      'Load timeout',  // Check if this is an expected lazy loading failure vs real error

      'Failed to fetch',  isExpectedLazyLoadingError(error, componentPath) {

      '404 (Not Found)',    const expectedFailures = [

      'Importing a module script failed'      '/performance/components/',

    ]      'Load timeout',

          'Failed to fetch',

    const errorMessage = error.message || ''      '404 (Not Found)',

    return expectedFailures.some(pattern =>       'Importing a module script failed'

      errorMessage.includes(pattern) || componentPath.includes(pattern)    ]

    )    

  }    const errorMessage = error.message || ''

    return expectedFailures.some(pattern => 

  // Check if this path is a performance optimization attempt      errorMessage.includes(pattern) || componentPath.includes(pattern)

  isPerformancePath(componentPath) {    )

    return componentPath.includes('/performance/components/') ||   }

           componentPath.includes('/performance/modals/') ||

           componentPath.includes('/performance/admin/')  // Check if this path is a performance optimization attempt

  }  isPerformancePath(componentPath) {

    return componentPath.includes('/performance/components/') || 

  // Preload components when they're about to be needed           componentPath.includes('/performance/modals/') ||

  setupIntersectionObserver(componentPath, triggerElement) {           componentPath.includes('/performance/admin/')

    if (!triggerElement || this.observers.has(triggerElement)) return  }



    const observer = new IntersectionObserver(  // Preload components when they're about to be needed

      (entries) => {  setupIntersectionObserver(componentPath, triggerElement) {

        entries.forEach(async (entry) => {    if (!triggerElement || this.observers.has(triggerElement)) return

          if (entry.isIntersecting) {

            // Only log for real components    const observer = new IntersectionObserver((entries) => {

            if (!this.isPerformancePath(componentPath)) {      entries.forEach(entry => {

              console.log(`👁️ Preloading ${componentPath} (intersection detected)`)        if (entry.isIntersecting) {

            }          console.log(`👁️ Preloading ${componentPath} (intersection detected)`)

            try {          this.lazyLoad(componentPath)

              const module = await window.moduleLoader.lazyLoad(componentPath)          observer.unobserve(entry.target)

              if (module.preload) module.preload()          this.observers.delete(triggerElement)

            } catch (error) {        }

              // Silent handling for expected failures      })

              if (!this.isExpectedLazyLoadingError(error, componentPath)) {    }, {

                console.warn(`⚠️ Intersection preload failed for ${componentPath}:`, error)      rootMargin: this.config.preloadThreshold

              }    })

            }

            observer.disconnect()    observer.observe(triggerElement)

            this.observers.delete(triggerElement)    this.observers.set(triggerElement, observer)

          }  }

        })

      },  // Higher-order component for lazy loading

      { rootMargin: this.config.preloadThreshold }  createLazyComponent(componentPath, fallback = null) {

    )    const { useState, useEffect, Suspense } = React

    

    observer.observe(triggerElement)    return function LazyWrapper(props) {

    this.observers.set(triggerElement, observer)      const [Component, setComponent] = useState(null)

  }      const [loading, setLoading] = useState(true)

      const [error, setError] = useState(null)

  // Create a lazy-loaded React component

  createLazyComponent(componentPath, fallbackComponent = null) {      useEffect(() => {

    const ReactGlobal = typeof React !== 'undefined' ? React : window.React        let mounted = true

    if (!ReactGlobal) return fallbackComponent

        const loadComponent = async () => {

    return ReactGlobal.memo((props) => {          try {

      const [Component, setComponent] = ReactGlobal.useState(fallbackComponent)            setLoading(true)

      const [loading, setLoading] = ReactGlobal.useState(true)            setError(null)

            

      ReactGlobal.useEffect(() => {            const module = await window.moduleLoader.lazyLoad(componentPath)

        let mounted = true            

            if (mounted) {

        const loadComponent = async () => {              setComponent(() => module.default || module)

          try {              setLoading(false)

            const module = await this.lazyLoad(componentPath)            }

            if (mounted) {          } catch (err) {

              setComponent(() => module.default || module)            if (mounted) {

              setLoading(false)              setError(err)

            }              setLoading(false)

          } catch (error) {            }

            if (mounted) {          }

              setComponent(() => fallbackComponent)        }

              setLoading(false)

            }        loadComponent()

          }

        }        return () => {

          mounted = false

        loadComponent()        }

        return () => { mounted = false }      }, [])

      }, [])

      if (loading) {

      if (loading && fallbackComponent) {        return fallback || React.createElement('div', { 

        return ReactGlobal.createElement(fallbackComponent, props)          className: 'lazy-loading',

      }          style: { 

            display: 'flex', 

      return Component ? ReactGlobal.createElement(Component, props) : null            alignItems: 'center', 

    })            justifyContent: 'center',

  }            padding: '2rem',

            opacity: 0.7

  // Batch preload multiple components          }

  async batchPreload(componentPaths) {        }, '⏳ Loading...')

    try {      }

      const loadPromises = componentPaths.map(path => this.lazyLoad(path))

      await Promise.allSettled(loadPromises)      if (error) {

              return React.createElement('div', {

      // Only log for successful batches with real components          className: 'lazy-error',

      const realComponents = componentPaths.filter(path => !this.isPerformancePath(path))          style: { 

      if (realComponents.length > 0) {            padding: '1rem', 

        console.log(`✅ Batch preloaded ${realComponents.length} components`)            background: '#ff6b6b', 

      }            color: 'white', 

    } catch (error) {            borderRadius: '4px' 

      // Filter expected performance optimization failures          }

      if (this.isExpectedLazyLoadingError(error, 'batch')) {        }, `❌ Failed to load component: ${error.message}`)

        // Only log for real components      }

        const realComponents = componentPaths.filter(path => !this.isPerformancePath(path))

        if (realComponents.length > 0) {      if (!Component) {

          console.log(`💭 Batch preload → static fallback (${realComponents.length} components)`)        return null

        }      }

      } else {

        console.error('❌ Unexpected batch preload error:', error)      return React.createElement(Component, props)

      }    }

    }  }

  }

  // Batch preload multiple components

  // Sequential loading for heavy components  async batchPreload(componentPaths, priority = 'low') {

  async sequentialLoad(componentPaths, delayMs = 100) {    const scheduler = priority === 'high' 

    for (const componentPath of componentPaths) {      ? Promise.all.bind(Promise)

      try {      : this.sequentialLoad.bind(this)

        await this.lazyLoad(componentPath)

        await this.delay(delayMs)    try {

      } catch (error) {      await scheduler(

        // Silent handling for expected failures        componentPaths.map(path => this.lazyLoad(path))

        if (!this.isExpectedLazyLoadingError(error, componentPath)) {      )

          console.warn('⚠️ Sequential load item failed:', error)      console.log(`✅ Batch preloaded ${componentPaths.length} components`)

        }    } catch (error) {

      }      // Distinguish between expected lazy loading issues and real errors

    }      if (error.message && (error.message.includes('404') || error.message.includes('Failed to fetch'))) {

  }        console.log(`💭 Batch preload → static fallback (${componentPaths.length} components)`)

      } else {

  // Preload components based on route/app        console.error('❌ Unexpected batch preload error:', error)

  async preloadRoute(appType) {      }

    const routeComponents = {    }

      admin: [  }

        './domains/quotes/components/QuotesManager.js',

        './components/modals/SettingsModal.js',  // Sequential loading for low priority

        './components/modals/DetailModal.js'  async sequentialLoad(promises) {

      ],    const results = []

      quote: [    for (const promise of promises) {

        './components/forms/QuoteForm.js',      try {

        './components/modals/FilesModal.js'        results.push(await promise)

      ]        await this.delay(100) // Small delay to not block UI

    }      } catch (error) {

        console.warn('⚠️ Sequential load item failed:', error)

    const components = routeComponents[appType] || []        results.push(null)

    if (components.length > 0) {      }

      await this.batchPreload(components)    }

    }    return results

  }  }



  // Utility delay function  // Preload critical components for route

  delay(ms) {  preloadRoute(routeName) {

    return new Promise(resolve => setTimeout(resolve, ms))    const routeComponents = {

  }      'quote': [

        './components/forms/QuoteForm.js',

  // Cleanup observers and cache        './components/modals/DetailModal.js'

  cleanup() {      ],

    this.observers.forEach(observer => observer.disconnect())      'admin': [

    this.observers.clear()        './domains/quotes/components/QuotesManager.js',

    this.cache.clear()        './components/modals/SettingsModal.js',

    this.loading.clear()        './components/modals/FilterPopup.js'

    console.log('🧹 ModuleLoader cleanup completed')      ],

  }      'common': [

        './shared/components/ui/Modal.js',

  // Get cache statistics        './hooks/useNotifications.js'

  getCacheStats() {      ]

    return {    }

      cached: this.cache.size,

      loading: this.loading.size,    const components = [

      observers: this.observers.size      ...(routeComponents[routeName] || []),

    }      ...routeComponents.common

  }    ]

}

    this.batchPreload(components, 'high')

// Initialize global module loader  }

if (typeof window !== 'undefined') {

  window.moduleLoader = new ModuleLoader()  // Clean up cache and observers

  cleanup() {

  // Cleanup on page unload    // Clear expired cache entries

  window.addEventListener('beforeunload', () => {    const now = Date.now()

    window.moduleLoader.cleanup()    for (const [key, value] of this.cache.entries()) {

  })      if (now - value.timestamp > this.config.cacheTimeout) {

        this.cache.delete(key)

  // Auto-preload based on current app      }

  const currentApp = window.BEEPLAN_APP || 'quote'    }

  if (window.moduleLoader.preloadRoute) {

    window.moduleLoader.preloadRoute(currentApp)    // Disconnect observers

  }    for (const observer of this.observers.values()) {

}      observer.disconnect()

    }

// Export for both CommonJS and ES modules    this.observers.clear()

if (typeof module !== 'undefined' && module.exports) {

  module.exports = ModuleLoader    console.log('🧹 ModuleLoader cleanup completed')

}  }



export default ModuleLoader  // Utility delay function
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  // Get loading statistics
  getStats() {
    return {
      cached: this.cache.size,
      loading: this.loading.size,
      observers: this.observers.size,
      cacheHitRate: this.calculateCacheHitRate()
    }
  }

  calculateCacheHitRate() {
    // This would need to be tracked over time
    return 'Not implemented yet'
  }
}

// Initialize global module loader
if (typeof window !== 'undefined') {
  window.moduleLoader = new ModuleLoader()
  
  // Cleanup on page unload
  window.addEventListener('beforeunload', () => {
    window.moduleLoader.cleanup()
  })
  
  // Preload based on current page
  document.addEventListener('DOMContentLoaded', () => {
    const currentApp = window.BEEPLAN_APP || 'quote'
    window.moduleLoader.preloadRoute(currentApp)
  })
}

// Export for Node.js environments
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ModuleLoader
}

// ES6 export
export default ModuleLoader