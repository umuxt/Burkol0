// Lazy-loaded Detail Modal - Temporarily using static imports to avoid console errors// Lazy-loaded Detail Modal - Temporarily using static imports to avoid console errors

import { DetailModal } from './DetailModal.js'// import ModuleLoader from '../../performance/module-loader.js'

import { DetailModal } from './DetailModal.js'

// Use static import instead of lazy loading to avoid console spam

const LazyDetailModal = DetailModal// Use static import instead of lazy loading to avoid console spam

const LazyDetailModal = DetailModal

// Export the component    }

export { LazyDetailModal as DetailModal }  }, React.createElement('div', {

export default LazyDetailModal    className: 'modal-content',
    style: {
      background: 'var(--surface)',
      borderRadius: 'var(--radius-lg)',
      padding: '2rem',
      display: 'flex',
      alignItems: 'center',
      gap: '1rem',
      color: 'var(--text)'
    }
  }, [
    React.createElement('div', {
      key: 'spinner',
      className: 'spinner',
      style: {
        width: '20px',
        height: '20px',
        border: '2px solid var(--accent)',
        borderTop: '2px solid transparent',
        borderRadius: '50%',
        animation: 'spin 1s linear infinite'
      }
    }),
    React.createElement('span', { key: 'text' }, 'Detay modal yükleniyor...')
  ]))
)

// Lightweight wrapper for immediate response
export function DetailModalWrapper(props) {
  const { useState, useEffect } = React
  const [shouldRender, setShouldRender] = useState(false)

  useEffect(() => {
    // Trigger render on next frame for smooth interaction
    const timer = requestAnimationFrame(() => {
      setShouldRender(true)
    })
    
    return () => cancelAnimationFrame(timer)
  }, [])

  // Don't render anything until next frame
  if (!shouldRender) {
    return React.createElement('div', {
      className: 'modal-overlay',
      style: { 
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.1)',
        zIndex: 1000
      }
    })
  }

  return React.createElement(LazyDetailModal, props)
}

// Export the wrapper as default
export default DetailModalWrapper

// Also export the lazy component for direct use
export { LazyDetailModal }

// Preload trigger for intersection observer
export function preloadDetailModal(triggerElement) {
  if (window.moduleLoader && triggerElement) {
    window.moduleLoader.setupIntersectionObserver(
      './components/modals/DetailModal.js',
      triggerElement
    )
  }
}