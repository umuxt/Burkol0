// Settings Modal - Using static imports to avoid module loading errors

import SettingsModal from './SettingsModal.js';

// Use static import instead of lazy loading to avoid console errors
const LazySettingsModal = SettingsModal;
export function SettingsModalLazy({ isOpen, onClose, t }) {
  if (!isOpen) return null
  
  // Simply pass through to SettingsModal
  return React.createElement(SettingsModal, {
    onClose,
    onSettingsUpdated: () => {},
    t,
    showNotification: (msg, type) => console.log(msg, type)
  })
}

// Export wrapper that handles loading state
function SettingsModalWrapper(props) {
  if (!props.isOpen) return null
  return React.createElement(SettingsModalLazy, props)
}

// Preload function for intersection observer
export function preloadSettingsModal(triggerElement) {
  // Not needed anymore, keeping for compatibility
}

// Export the main component
export default LazySettingsModal;