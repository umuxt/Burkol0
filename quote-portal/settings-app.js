// Settings App - Dedicated settings interface
import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import PricingTab from './src/components/settings/DynamicPricingTab.js'
import FormTab from './src/components/settings/FormTab.js'
import UsersTab from './src/components/settings/UsersTab.jsx'

// Notification Hook
function useNotifications() {
  const [notifications, setNotifications] = useState([])

  const showNotification = (message, type = 'info') => {
    const id = Date.now()
    const notification = { id, message, type }
    
    setNotifications(prev => [...prev, notification])
    
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id))
    }, 4000)
  }

  const removeNotification = (id) => {
    setNotifications(prev => prev.filter(n => n.id !== id))
  }

  return { notifications, showNotification, removeNotification }
}

// Notification Component
function NotificationContainer({ notifications, onRemove }) {
  if (notifications.length === 0) return null

  return React.createElement('div', {
    style: {
      position: 'fixed',
      top: '1rem',
      right: '1rem',
      zIndex: 9999,
      display: 'flex',
      flexDirection: 'column',
      gap: '0.5rem'
    }
  }, notifications.map(notification => 
    React.createElement('div', {
      key: notification.id,
      style: {
        background: notification.type === 'error' ? '#dc3545' : 
                   notification.type === 'success' ? '#28a745' : '#007bff',
        color: 'white',
        padding: '0.75rem 1rem',
        borderRadius: '0.375rem',
        boxShadow: '0 0.25rem 0.5rem rgba(0,0,0,0.1)',
        cursor: 'pointer',
        maxWidth: '300px'
      },
      onClick: () => onRemove(notification.id)
    }, notification.message)
  ))
}

// Main Settings App Component
function SettingsApp() {
  const [activeTab, setActiveTab] = useState('pricing') // 'pricing' | 'form' | 'users'
  const { notifications, showNotification, removeNotification } = useNotifications()

  // Simple translation object
  const t = {
    settings_title: 'Sistem Ayarları',
    pricing: 'Fiyatlandırma',
    form_structure: 'Form Yapısı',
    users: 'Kullanıcılar',
    close: 'Kapat',
    save: 'Kaydet'
  }

  function onSettingsUpdated() {
    // Callback when settings are updated
    console.log('Settings updated')
  }

  return React.createElement('div', { className: 'settings-app' },
    // Notifications
    React.createElement(NotificationContainer, {
      notifications,
      onRemove: removeNotification
    }),

    // Tab navigation
    React.createElement('div', { className: 'tab-navigation' },
      React.createElement('button', {
        className: `tab-button ${activeTab === 'pricing' ? 'active' : ''}`,
        onClick: () => setActiveTab('pricing')
      }, 'Fiyatlandırma'),
      
      React.createElement('button', {
        className: `tab-button ${activeTab === 'form' ? 'active' : ''}`,
        onClick: () => setActiveTab('form')
      }, 'Form Yapısı'),

      React.createElement('button', {
        className: `tab-button ${activeTab === 'users' ? 'active' : ''}`,
        onClick: () => setActiveTab('users')
      }, 'Kullanıcılar')
    ),

    // Tab content
    React.createElement('div', { className: 'tab-content' },
      activeTab === 'pricing' && React.createElement(PricingTab, {
        t,
        showNotification
      }),
      
      activeTab === 'form' && React.createElement(FormTab, {
        t,
        showNotification
      }),

      activeTab === 'users' && React.createElement(UsersTab, {
        t,
        showNotification
      })
    )
  )
}

// Initialize the app
const settingsRoot = document.getElementById('settings-root')
if (settingsRoot) {
  const root = createRoot(settingsRoot)
  root.render(React.createElement(SettingsApp))
}