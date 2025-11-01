// UI helpers (toast notifications)

export function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.style.cssText = [
    'position: fixed;',
    'top: 20px;',
    'right: 20px;',
    `background: ${type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : type === 'warning' ? '#f59e0b' : '#3b82f6'};`,
    'color: white;',
    'padding: 12px 20px;',
    'border-radius: 6px;',
    'z-index: 9999;',
    'box-shadow: 0 4px 6px rgba(0,0,0,0.1);',
    'font-weight: 500;',
    'opacity: 0;',
    'transform: translateX(100%);',
    'transition: all 0.3s ease;'
  ].join('');

  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '1';
    toast.style.transform = 'translateX(0)';
  }, 10);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    setTimeout(() => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 300);
  }, 3000);
}

