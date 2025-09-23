// Settings App - Dedicated settings interface
import PricingTab from './components/settings/DynamicPricingTab.js'
import FormTab from './components/settings/FormTab.js'
import UsersTab from './components/settings/UsersTab.js'

const ReactGlobal = typeof React !== 'undefined' ? React : (typeof window !== 'undefined' ? window.React : undefined)
const { useState, useEffect } = ReactGlobal

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

  return ReactGlobal.createElement('div', {
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
    ReactGlobal.createElement('div', {
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

  return ReactGlobal.createElement('div', { className: 'settings-app' },
    // Notifications
    ReactGlobal.createElement(NotificationContainer, {
      notifications,
      onRemove: removeNotification
    }),

    // Tab navigation
    ReactGlobal.createElement('div', { className: 'tab-navigation' },
      ReactGlobal.createElement('button', {
        className: `tab-button ${activeTab === 'pricing' ? 'active' : ''}`,
        onClick: () => setActiveTab('pricing')
      }, 'Fiyatlandırma'),
      
      ReactGlobal.createElement('button', {
        className: `tab-button ${activeTab === 'form' ? 'active' : ''}`,
        onClick: () => setActiveTab('form')
      }, 'Form Yapısı'),

      ReactGlobal.createElement('button', {
        className: `tab-button ${activeTab === 'users' ? 'active' : ''}`,
        onClick: () => setActiveTab('users')
      }, 'Kullanıcılar')
    ),

    // Tab content
    ReactGlobal.createElement('div', { className: 'tab-content' },
      activeTab === 'pricing' && ReactGlobal.createElement(PricingTab, {
        t,
        showNotification
      }),
      
      activeTab === 'form' && ReactGlobal.createElement(FormTab, {
        t,
        showNotification
      }),

      activeTab === 'users' && ReactGlobal.createElement(UsersTab, {
        t,
        showNotification
      })
    )
  )
}

// Initialize the app
const settingsRoot = document.getElementById('settings-root')
if (settingsRoot) {
  const root = ReactDOM.createRoot(settingsRoot)
  root.render(ReactGlobal.createElement(SettingsApp))
}