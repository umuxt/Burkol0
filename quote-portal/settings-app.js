// Settings App - Dedicated settings interface
import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import PricingTab from './src/components/settings/DynamicPricingTab.js'
import FormTab from './src/components/settings/FormTab.js'
import AccountTab from './src/components/settings/AccountTab.jsx'

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
  // URL'den veya localStorage'dan aktif sekmeyi belirle
  function getInitialTab() {
    // URL search params kontrolü (?tab=form)
    const urlParams = new URLSearchParams(window.location.search)
    const tabParam = urlParams.get('tab')
    if (['account', 'pricing', 'form'].includes(tabParam)) {
      return tabParam
    }
    
    // URL'de hash varsa onu kullan (#form, #pricing, #account)
    const hash = window.location.hash.replace('#', '')
    if (['account', 'pricing', 'form'].includes(hash)) {
      return hash
    }
    
    // localStorage'dan son seçilen sekmeyi al
    const savedTab = localStorage.getItem('burkol-settings-tab')
    if (['account', 'pricing', 'form'].includes(savedTab)) {
      return savedTab
    }
    
    // Varsayılan olarak hesap ayarları
    return 'account'
  }
  
  const [activeTab, setActiveTab] = useState(getInitialTab) // 'account' | 'pricing' | 'form'
  const { notifications, showNotification, removeNotification } = useNotifications()

  // Sayfa ilk yüklendiğinde URL hash'ini doğru sekmeye ayarla
  useEffect(() => {
    const currentTab = getInitialTab()
    if (window.location.hash !== `#${currentTab}`) {
      window.location.hash = currentTab
    }
  }, [])

  // Sekme değiştiğinde URL ve localStorage'ı güncelle
  function handleTabChange(newTab) {
    setActiveTab(newTab)
    localStorage.setItem('burkol-settings-tab', newTab)
    window.location.hash = newTab
  }

  // URL hash değişikliklerini dinle (geri/ileri butonları için)
  useEffect(() => {
    function handleHashChange() {
      const hash = window.location.hash.replace('#', '')
      if (['account', 'pricing', 'form'].includes(hash)) {
        setActiveTab(hash)
        localStorage.setItem('burkol-settings-tab', hash)
      }
    }

    window.addEventListener('hashchange', handleHashChange)
    return () => window.removeEventListener('hashchange', handleHashChange)
  }, [])

  // Simple translation object
  const t = {
    settings_title: 'Sistem Ayarları',
    account: 'Hesap Ayarları',
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
        className: `tab-button ${activeTab === 'account' ? 'active' : ''}`,
        onClick: () => handleTabChange('account')
      }, 'Hesap Ayarları'),

      React.createElement('button', {
        className: `tab-button ${activeTab === 'pricing' ? 'active' : ''}`,
        onClick: () => handleTabChange('pricing')
      }, 'Fiyatlandırma'),
      
      React.createElement('button', {
        className: `tab-button ${activeTab === 'form' ? 'active' : ''}`,
        onClick: () => handleTabChange('form')
      }, 'Form Yapısı')
    ),

    // Tab content
    React.createElement('div', { className: 'tab-content' },
      activeTab === 'account' && React.createElement(AccountTab, {
        t,
        showNotification
      }),

      activeTab === 'pricing' && React.createElement(PricingTab, {
        t,
        showNotification
      }),
      
      activeTab === 'form' && React.createElement(FormTab, {
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