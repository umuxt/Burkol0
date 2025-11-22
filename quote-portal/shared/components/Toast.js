/**
 * MES Toast Notification System
 * 
 * Exact copy from MES production system
 * - Auto-close with progress bar
 * - Manual close button (×)
 * - Top-center positioning (MES standard)
 * - Multiple toast types (success, error, warning, info)
 * - Stacking support for multiple toasts
 */

let toastCounter = 0;

/**
 * Inject toast container and styles (MES standard)
 */
function ensureToastStyles() {
  if (document.getElementById('toast-styles')) return;
  
  const style = document.createElement('style');
  style.id = 'toast-styles';
  style.textContent = `
    #toast-container {
      position: fixed;
      top: 80px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 99999;
      display: flex;
      flex-direction: column;
      gap: 12px;
      pointer-events: none;
    }
    
    .toast {
      background: white;
      border-radius: 12px;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12), 0 2px 8px rgba(0, 0, 0, 0.08);
      padding: 16px 20px;
      min-width: 400px;
      max-width: 500px;
      display: flex;
      align-items: center;
      gap: 12px;
      pointer-events: auto;
      opacity: 0;
      transform: translateY(-20px);
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      position: relative;
      overflow: hidden;
    }
    
    .toast.show {
      opacity: 1;
      transform: translateY(0);
    }
    
    .toast.hide {
      opacity: 0;
      transform: translateY(-20px);
    }
    
    .toast.success {
      background: linear-gradient(135deg, #10b981 0%, #059669 100%);
      color: white;
    }
    
    .toast.error {
      background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
      color: white;
    }
    
    .toast.warning {
      background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
      color: white;
    }
    
    .toast.info {
      background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
      color: white;
    }
    
    .toast-icon {
      font-size: 24px;
      line-height: 1;
      flex-shrink: 0;
    }
    
    .toast-content {
      flex: 1;
      min-width: 0;
    }
    
    .toast-title {
      font-weight: 600;
      font-size: 15px;
      margin-bottom: 4px;
      line-height: 1.2;
    }
    
    .toast-message {
      font-size: 14px;
      opacity: 0.95;
      line-height: 1.4;
      word-wrap: break-word;
    }
    
    .toast-close {
      background: none;
      border: none;
      color: inherit;
      font-size: 24px;
      line-height: 1;
      cursor: pointer;
      padding: 0;
      width: 28px;
      height: 28px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 6px;
      opacity: 0.8;
      transition: all 0.15s;
      flex-shrink: 0;
    }
    
    .toast-close:hover {
      opacity: 1;
      background: rgba(0, 0, 0, 0.1);
    }
    
    .toast-progress {
      position: absolute;
      bottom: 0;
      left: 0;
      height: 4px;
      width: 100%;
      background: rgba(0, 0, 0, 0.2);
      overflow: hidden;
    }
    
    .toast-progress-bar {
      height: 100%;
      background: rgba(255, 255, 255, 0.6);
      transform-origin: left;
      transform: scaleX(1);
      transition: transform linear;
    }
    
    @media (max-width: 640px) {
      #toast-container {
        left: 12px;
        right: 12px;
        transform: none;
      }
      
      .toast {
        min-width: auto;
        max-width: none;
      }
    }
  `;
  document.head.appendChild(style);
}

/**
 * Get toast container (create if not exists)
 */
function getToastContainer() {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
  }
  return container;
}

/**
 * Create and show a toast notification (MES standard)
 */
function createToast(message, type = 'info', duration = 10000) {
  ensureToastStyles();
  const container = getToastContainer();
  
  const toastId = `toast-${++toastCounter}`;
  const toast = document.createElement('div');
  toast.id = toastId;
  toast.className = `toast ${type}`;
  
  // Get icon and title based on type
  const icons = {
    success: '✓',
    error: '✕',
    warning: '⚠',
    info: 'i'
  };
  
  const titles = {
    success: 'Başarılı',
    error: 'Hata',
    warning: 'Uyarı',
    info: 'Bilgi'
  };
  
  const icon = icons[type] || icons.info;
  const title = titles[type] || titles.info;
  
  toast.innerHTML = `
    <div class="toast-icon">${icon}</div>
    <div class="toast-content">
      <div class="toast-title">${title}</div>
      <div class="toast-message">${message}</div>
    </div>
    <button class="toast-close" aria-label="Close">×</button>
    <div class="toast-progress"><div class="toast-progress-bar"></div></div>
  `;
  
  container.appendChild(toast);
  
  // Close button handler
  const closeBtn = toast.querySelector('.toast-close');
  closeBtn.onclick = () => removeToast(toast);
  
  // Show animation
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      toast.classList.add('show');
      
      // Start progress bar animation
      const progressBar = toast.querySelector('.toast-progress-bar');
      if (progressBar && duration > 0) {
        progressBar.style.transitionDuration = `${duration}ms`;
        progressBar.style.transform = 'scaleX(0)';
      }
    });
  });
  
  // Auto-close
  if (duration > 0) {
    setTimeout(() => removeToast(toast), duration);
  }
  
  return toast;
}

/**
 * Remove toast with animation
 */
function removeToast(toast) {
  if (!toast || !toast.parentNode) return;
  
  toast.classList.remove('show');
  toast.classList.add('hide');
  
  setTimeout(() => {
    if (toast.parentNode) {
      toast.remove();
    }
  }, 300);
}

// MES Standard Toast Functions
export function showSuccessToast(message, duration = 10000) {
  return createToast(message, 'success', duration);
}

export function showErrorToast(message, duration = 10000) {
  return createToast(message, 'error', duration);
}

export function showWarningToast(message, duration = 10000) {
  return createToast(message, 'warning', duration);
}

export function showInfoToast(message, duration = 10000) {
  return createToast(message, 'info', duration);
}

// Legacy showToast function for backward compatibility
export function showToast(message, type = 'info', duration = 10000) {
  return createToast(message, type, duration);
}

// Make functions available globally for inline handlers (MES compatibility)
if (typeof window !== 'undefined') {
  window.showSuccessToast = showSuccessToast;
  window.showErrorToast = showErrorToast;
  window.showWarningToast = showWarningToast;
  window.showInfoToast = showInfoToast;
  window.showToast = showToast;
}
