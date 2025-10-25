import React, { useState, useCallback } from 'react';

export function ToastNotification({ message, type = 'success', onClose }) {
  const toastStyle = {
    position: 'fixed',
    top: '20px',
    left: '50%',
    transform: 'translateX(-50%)',
    backgroundColor: type === 'success' ? '#28a745' : type === 'error' ? '#dc3545' : type === 'warning' ? '#ffc107' : '#17a2b8',
    color: type === 'warning' ? '#212529' : 'white',
    padding: '12px 20px',
    borderRadius: '8px',
    boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
    zIndex: 9999,
    minWidth: '300px',
    maxWidth: '500px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    fontSize: '14px',
    fontWeight: '500',
    animation: 'slideInDown 0.3s ease-out'
  }

  return React.createElement('div', { style: toastStyle },
    React.createElement('span', null, message),
    React.createElement('button', {
      onClick: onClose,
      style: {
        background: 'none',
        border: 'none',
        color: 'inherit',
        fontSize: '16px',
        fontWeight: 'bold',
        cursor: 'pointer',
        marginLeft: '12px',
        padding: '0 4px',
        opacity: 0.8
      },
      onMouseOver: (e) => e.target.style.opacity = '1',
      onMouseOut: (e) => e.target.style.opacity = '0.8'
    }, '×')
  )
}

export function useNotifications() {
  const [notifications, setNotifications] = useState([])

  const showNotification = (message, type = 'success', duration = 4000) => {
    const id = Date.now() + Math.random()
    const notification = { id, message, type }
    
    setNotifications(prev => [...prev, notification])
    
    // Auto-remove after duration
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id))
    }, duration)
  }

  const removeNotification = (id) => {
    setNotifications(prev => prev.filter(n => n.id !== id))
  }

  return { notifications, showNotification, removeNotification }
}