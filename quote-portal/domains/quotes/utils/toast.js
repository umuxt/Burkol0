/**
 * Toast Notification System for Quotes Domain
 * 
 * Lightweight toast notification component with:
 * - Auto-close after 10 seconds
 * - Manual close button (×)
 * - Bottom-right positioning
 * - Multiple toast types (success, error, warning, info)
 * - Stacking support for multiple toasts
 * 
 * Usage:
 *   import { showToast } from '../utils/toast.js';
 *   showToast('Operation successful!', 'success');
 *   showToast('An error occurred', 'error');
 */

const TOAST_AUTO_CLOSE_DURATION = 10000; // 10 seconds
const TOAST_ANIMATION_DURATION = 300; // 0.3 seconds

let toastContainer = null;
let toastCounter = 0;

/**
 * Initialize toast container (call once on page load)
 */
function initToastContainer() {
  if (toastContainer) return;
  
  toastContainer = document.createElement('div');
  toastContainer.id = 'quotes-toast-container';
  toastContainer.className = 'quotes-toast-container';
  document.body.appendChild(toastContainer);
  
  // Add CSS if not already present
  if (!document.getElementById('quotes-toast-styles')) {
    const style = document.createElement('style');
    style.id = 'quotes-toast-styles';
    style.textContent = `
      .quotes-toast-container {
        position: fixed;
        bottom: 24px;
        right: 24px;
        z-index: 99999;
        display: flex;
        flex-direction: column;
        gap: 12px;
        max-width: 400px;
        pointer-events: none;
      }
      
      .quotes-toast {
        background: white;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15), 0 2px 6px rgba(0, 0, 0, 0.1);
        padding: 16px;
        display: flex;
        align-items: flex-start;
        gap: 12px;
        min-width: 320px;
        max-width: 400px;
        pointer-events: auto;
        transform: translateX(calc(100% + 24px));
        opacity: 0;
        transition: all ${TOAST_ANIMATION_DURATION}ms cubic-bezier(0.4, 0, 0.2, 1);
        position: relative;
      }
      
      .quotes-toast.show {
        transform: translateX(0);
        opacity: 1;
      }
      
      .quotes-toast.hide {
        transform: translateX(calc(100% + 24px));
        opacity: 0;
      }
      
      .quotes-toast .toast-icon {
        flex-shrink: 0;
        width: 24px;
        height: 24px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 16px;
        font-weight: bold;
      }
      
      .quotes-toast.success .toast-icon {
        background: #10b981;
        color: white;
      }
      
      .quotes-toast.error .toast-icon {
        background: #ef4444;
        color: white;
      }
      
      .quotes-toast.warning .toast-icon {
        background: #f59e0b;
        color: white;
      }
      
      .quotes-toast.info .toast-icon {
        background: #3b82f6;
        color: white;
      }
      
      .quotes-toast .toast-content {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 4px;
        min-width: 0;
      }
      
      .quotes-toast .toast-title {
        font-size: 14px;
        font-weight: 600;
        color: #111827;
        line-height: 1.4;
        word-wrap: break-word;
      }
      
      .quotes-toast .toast-message {
        font-size: 13px;
        color: #6b7280;
        line-height: 1.5;
        word-wrap: break-word;
      }
      
      .quotes-toast .toast-close {
        flex-shrink: 0;
        width: 24px;
        height: 24px;
        border: none;
        background: transparent;
        color: #9ca3af;
        font-size: 20px;
        line-height: 1;
        cursor: pointer;
        padding: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 4px;
        transition: all 150ms;
        margin: -4px -4px 0 0;
      }
      
      .quotes-toast .toast-close:hover {
        background: #f3f4f6;
        color: #111827;
      }
      
      .quotes-toast .toast-close:active {
        transform: scale(0.95);
      }
      
      .quotes-toast .toast-progress {
        position: absolute;
        bottom: 0;
        left: 0;
        height: 3px;
        background: rgba(0, 0, 0, 0.1);
        width: 100%;
        border-radius: 0 0 8px 8px;
        overflow: hidden;
      }
      
      .quotes-toast .toast-progress-bar {
        height: 100%;
        background: currentColor;
        transform-origin: left;
        transform: scaleX(1);
        transition: transform linear;
      }
      
      .quotes-toast.success .toast-progress-bar {
        color: #10b981;
      }
      
      .quotes-toast.error .toast-progress-bar {
        color: #ef4444;
      }
      
      .quotes-toast.warning .toast-progress-bar {
        color: #f59e0b;
      }
      
      .quotes-toast.info .toast-progress-bar {
        color: #3b82f6;
      }
      
      @media (max-width: 640px) {
        .quotes-toast-container {
          left: 12px;
          right: 12px;
          bottom: 12px;
          max-width: none;
        }
        
        .quotes-toast {
          min-width: auto;
          max-width: none;
        }
      }
    `;
    document.head.appendChild(style);
  }
}

/**
 * Get icon for toast type
 */
function getToastIcon(type) {
  const icons = {
    success: '✓',
    error: '✕',
    warning: '⚠',
    info: 'i'
  };
  return icons[type] || icons.info;
}

/**
 * Get default title for toast type
 */
function getToastTitle(type) {
  const titles = {
    success: 'Başarılı',
    error: 'Hata',
    warning: 'Uyarı',
    info: 'Bilgi'
  };
  return titles[type] || titles.info;
}

/**
 * Remove toast from DOM
 */
function removeToast(toastElement, immediate = false) {
  if (!toastElement || !toastElement.parentNode) return;
  
  if (immediate) {
    toastElement.remove();
  } else {
    toastElement.classList.remove('show');
    toastElement.classList.add('hide');
    
    setTimeout(() => {
      if (toastElement.parentNode) {
        toastElement.remove();
      }
    }, TOAST_ANIMATION_DURATION);
  }
}

/**
 * Show a toast notification
 * 
 * @param {string|Object} messageOrOptions - Toast message or options object
 * @param {string} type - Toast type: 'success', 'error', 'warning', 'info' (default: 'info')
 * @param {Object} options - Additional options
 * @param {string} options.title - Custom title (optional)
 * @param {number} options.duration - Custom duration in ms (default: 10000, 0 = no auto-close)
 * @param {boolean} options.closeable - Show close button (default: true)
 * @param {Function} options.onClose - Callback when toast is closed
 * @returns {Object} Toast API with close() method
 */
export function showToast(messageOrOptions, type = 'info', options = {}) {
  // Initialize container on first use
  if (!toastContainer) {
    initToastContainer();
  }
  
  // Handle both simple and object syntax
  let message, title, duration, closeable, onClose;
  
  // Set default duration based on toast type
  const getDefaultDuration = (toastType) => {
    return (toastType === 'info' || toastType === 'message') ? 5000 : TOAST_AUTO_CLOSE_DURATION;
  };
  
  if (typeof messageOrOptions === 'object') {
    ({ message, type = 'info', title, duration, closeable = true, onClose } = messageOrOptions);
    duration = duration !== undefined ? duration : getDefaultDuration(type);
  } else {
    message = messageOrOptions;
    title = options.title;
    duration = options.duration !== undefined ? options.duration : getDefaultDuration(type);
    closeable = options.closeable !== undefined ? options.closeable : true;
    onClose = options.onClose;
  }
  
  // Validate type
  const validTypes = ['success', 'error', 'warning', 'info'];
  if (!validTypes.includes(type)) {
    type = 'info';
  }
  
  // Create toast element
  const toastId = `quotes-toast-${++toastCounter}`;
  const toast = document.createElement('div');
  toast.id = toastId;
  toast.className = `quotes-toast ${type}`;
  
  // Build toast HTML
  const icon = getToastIcon(type);
  const defaultTitle = getToastTitle(type);
  const displayTitle = title || defaultTitle;
  
  toast.innerHTML = `
    <div class="toast-icon">${icon}</div>
    <div class="toast-content">
      <div class="toast-title">${displayTitle}</div>
      ${message ? `<div class="toast-message">${message}</div>` : ''}
    </div>
    ${closeable ? '<button class="toast-close" aria-label="Close">×</button>' : ''}
    ${duration > 0 ? '<div class="toast-progress"><div class="toast-progress-bar"></div></div>' : ''}
  `;
  
  // Add to container
  toastContainer.appendChild(toast);
  
  // Trigger show animation
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      toast.classList.add('show');
      
      // Start progress bar animation if duration is set
      if (duration > 0) {
        const progressBar = toast.querySelector('.toast-progress-bar');
        if (progressBar) {
          progressBar.style.transitionDuration = `${duration}ms`;
          progressBar.style.transform = 'scaleX(0)';
        }
      }
    });
  });
  
  // Setup auto-close timer
  let autoCloseTimer = null;
  if (duration > 0) {
    autoCloseTimer = setTimeout(() => {
      closeToast();
    }, duration);
  }
  
  // Setup close button
  if (closeable) {
    const closeButton = toast.querySelector('.toast-close');
    closeButton.addEventListener('click', closeToast);
  }
  
  // Close function
  function closeToast() {
    if (autoCloseTimer) {
      clearTimeout(autoCloseTimer);
    }
    removeToast(toast);
    if (onClose) {
      onClose();
    }
  }
  
  // Return API
  return {
    close: closeToast,
    element: toast,
    id: toastId
  };
}

/**
 * Convenience methods for specific toast types
 */
export function showSuccessToast(message, options) {
  return showToast(message, 'success', options);
}

export function showErrorToast(message, options) {
  return showToast(message, 'error', options);
}

export function showWarningToast(message, options) {
  return showToast(message, 'warning', options);
}

export function showInfoToast(message, options) {
  return showToast(message, 'info', options);
}

/**
 * Clear all toasts
 */
export function clearAllToasts() {
  if (!toastContainer) return;
  
  const toasts = toastContainer.querySelectorAll('.quotes-toast');
  toasts.forEach(toast => removeToast(toast, true));
}

// Initialize on import
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initToastContainer);
  } else {
    initToastContainer();
  }
}
