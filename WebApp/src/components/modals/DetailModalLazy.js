// Detail Modal - Static import implementation for performance optimization
// Lazy loading disabled to prevent console errors during development

import React from 'react';
import { DetailModal } from './DetailModal.js';

// Use static import instead of lazy loading to avoid console spam
const LazyDetailModal = DetailModal;

// Lightweight wrapper for immediate response
export function DetailModalWrapper(props) {
  const { useState, useEffect } = React;
  const [shouldRender, setShouldRender] = useState(false);

  useEffect(() => {
    // Trigger render on next frame for smooth interaction
    const timer = requestAnimationFrame(() => {
      setShouldRender(true);
    });
    
    return () => cancelAnimationFrame(timer);
  }, []);

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
    });
  }

  return React.createElement(LazyDetailModal, props);
}

// Export the wrapper as default
export default DetailModalWrapper;

// Also export the lazy component for direct use
export { LazyDetailModal };

// Preload trigger for intersection observer
export function preloadDetailModal(triggerElement) {
  if (window.moduleLoader && triggerElement) {
    window.moduleLoader.setupIntersectionObserver(
      './components/modals/DetailModal.js',
      triggerElement
    );
  }
}