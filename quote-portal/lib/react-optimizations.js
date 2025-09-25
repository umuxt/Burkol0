// React Performance Optimizations - HOCs and hooks for component optimization
const { memo, useMemo, useCallback, useState, useEffect, useRef } = React

// Higher-Order Component for memoization with custom comparison
export function withMemoization(Component, propsAreEqual = null) {
  const MemoizedComponent = memo(Component, propsAreEqual)
  
  MemoizedComponent.displayName = `Memoized(${Component.displayName || Component.name})`
  
  return MemoizedComponent
}

// HOC for lazy rendering (render only when visible)
export function withLazyRender(Component, threshold = '100px') {
  return function LazyRenderedComponent(props) {
    const [isVisible, setIsVisible] = useState(false)
    const [hasRendered, setHasRendered] = useState(false)
    const ref = useRef()

    useEffect(() => {
      const observer = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) {
            setIsVisible(true)
            setHasRendered(true)
            observer.unobserve(entry.target)
          }
        },
        { rootMargin: threshold }
      )

      if (ref.current) {
        observer.observe(ref.current)
      }

      return () => observer.disconnect()
    }, [])

    if (!hasRendered) {
      return React.createElement('div', {
        ref,
        style: { minHeight: '100px' },
        className: 'lazy-placeholder'
      }, '⏳')
    }

    return React.createElement(Component, props)
  }
}

// HOC for error boundaries
export function withErrorBoundary(Component, fallback = null) {
  class ErrorBoundary extends React.Component {
    constructor(props) {
      super(props)
      this.state = { hasError: false, error: null }
    }

    static getDerivedStateFromError(error) {
      return { hasError: true, error }
    }

    componentDidCatch(error, errorInfo) {
      console.error('Component error caught by boundary:', error, errorInfo)
    }

    render() {
      if (this.state.hasError) {
        return fallback || React.createElement('div', {
          style: {
            padding: '1rem',
            background: '#ff6b6b',
            color: 'white',
            borderRadius: '4px',
            margin: '1rem 0'
          }
        }, `❌ Component error: ${this.state.error?.message || 'Unknown error'}`)
      }

      return React.createElement(Component, this.props)
    }
  }

  ErrorBoundary.displayName = `ErrorBoundary(${Component.displayName || Component.name})`
  
  return ErrorBoundary
}

// Custom hook for debounced values
export function useDebounce(value, delay) {
  const [debouncedValue, setDebouncedValue] = useState(value)

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value)
    }, delay)

    return () => clearTimeout(handler)
  }, [value, delay])

  return debouncedValue
}

// Custom hook for throttled functions
export function useThrottle(callback, delay) {
  const lastRun = useRef(Date.now())

  return useCallback((...args) => {
    if (Date.now() - lastRun.current >= delay) {
      callback(...args)
      lastRun.current = Date.now()
    }
  }, [callback, delay])
}

// Custom hook for optimized API calls
export function useOptimizedAPI(apiCall, dependencies = [], options = {}) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const mountedRef = useRef(true)
  const abortControllerRef = useRef(null)

  const {
    cacheKey = null,
    cacheTTL = 300000, // 5 minutes
    retryCount = 0,
    onSuccess = null,
    onError = null
  } = options

  const fetchData = useCallback(async (forceRefresh = false) => {
    // Check cache first
    if (cacheKey && !forceRefresh) {
      const cached = sessionStorage.getItem(cacheKey)
      if (cached) {
        try {
          const { data: cachedData, timestamp } = JSON.parse(cached)
          if (Date.now() - timestamp < cacheTTL) {
            setData(cachedData)
            return cachedData
          }
        } catch (e) {
          // Invalid cache, continue with API call
        }
      }
    }

    // Cancel previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }

    abortControllerRef.current = new AbortController()
    setLoading(true)
    setError(null)

    try {
      const result = await apiCall({ 
        signal: abortControllerRef.current.signal 
      })
      
      if (mountedRef.current) {
        setData(result)
        setLoading(false)
        
        // Cache the result
        if (cacheKey) {
          sessionStorage.setItem(cacheKey, JSON.stringify({
            data: result,
            timestamp: Date.now()
          }))
        }
        
        onSuccess?.(result)
      }
      
      return result
    } catch (err) {
      if (mountedRef.current && err.name !== 'AbortError') {
        setError(err)
        setLoading(false)
        onError?.(err)
      }
      throw err
    }
  }, [apiCall, cacheKey, cacheTTL, onSuccess, onError])

  useEffect(() => {
    fetchData()
    
    return () => {
      mountedRef.current = false
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
    }
  }, dependencies)

  const refetch = useCallback(() => fetchData(true), [fetchData])

  return { data, loading, error, refetch }
}

// Custom hook for virtual scrolling
export function useVirtualScrolling(items, itemHeight, containerHeight) {
  const [scrollTop, setScrollTop] = useState(0)

  const visibleItemsCount = Math.ceil(containerHeight / itemHeight)
  const startIndex = Math.floor(scrollTop / itemHeight)
  const endIndex = Math.min(startIndex + visibleItemsCount + 1, items.length)

  const visibleItems = useMemo(() => {
    return items.slice(startIndex, endIndex).map((item, index) => ({
      ...item,
      index: startIndex + index
    }))
  }, [items, startIndex, endIndex])

  const totalHeight = items.length * itemHeight
  const offsetY = startIndex * itemHeight

  const handleScroll = useCallback((e) => {
    setScrollTop(e.target.scrollTop)
  }, [])

  return {
    visibleItems,
    totalHeight,
    offsetY,
    handleScroll
  }
}

// Custom hook for form optimization
export function useOptimizedForm(initialValues, validationSchema = {}) {
  const [values, setValues] = useState(initialValues)
  const [errors, setErrors] = useState({})
  const [touched, setTouchedState] = useState({})
  const [isDirty, setIsDirty] = useState(false)

  const setValue = useCallback((name, value) => {
    setValues(prev => ({ ...prev, [name]: value }))
    setIsDirty(true)
    
    // Clear error when user starts typing
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: null }))
    }
  }, [errors])

  const setTouched = useCallback((name) => {
    setTouchedState(prev => ({ ...prev, [name]: true }))
  }, [])

  const validate = useCallback(() => {
    const newErrors = {}
    
    Object.keys(validationSchema).forEach(field => {
      const validator = validationSchema[field]
      const value = values[field]
      
      if (typeof validator === 'function') {
        const error = validator(value)
        if (error) newErrors[field] = error
      }
    })

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }, [values, validationSchema])

  const reset = useCallback(() => {
    setValues(initialValues)
    setErrors({})
    setTouched({})
    setIsDirty(false)
  }, [initialValues])

  return {
    values,
    errors,
    touched,
    isDirty,
    setValue,
    setTouched,
    validate,
    reset
  }
}

// Performance monitoring hook
export function usePerformanceMonitor(componentName) {
  const renderCount = useRef(0)
  const renderTimes = useRef([])

  useEffect(() => {
    renderCount.current += 1
    const renderTime = performance.now()
    renderTimes.current.push(renderTime)
    
    // Keep only last 10 render times
    if (renderTimes.current.length > 10) {
      renderTimes.current = renderTimes.current.slice(-10)
    }

    if (renderCount.current % 10 === 0) {
      console.log(`📊 ${componentName} rendered ${renderCount.current} times`)
    }
  })

  const getStats = useCallback(() => {
    return {
      renderCount: renderCount.current,
      avgRenderTime: renderTimes.current.length > 1 
        ? renderTimes.current.reduce((a, b, i) => i === 0 ? 0 : a + (b - renderTimes.current[i-1]), 0) / (renderTimes.current.length - 1)
        : 0
    }
  }, [])

  return getStats
}

// Export all optimizations as a bundle
export const ReactOptimizations = {
  withMemoization,
  withLazyRender,
  withErrorBoundary,
  useDebounce,
  useThrottle,
  useOptimizedAPI,
  useVirtualScrolling,
  useOptimizedForm,
  usePerformanceMonitor
}