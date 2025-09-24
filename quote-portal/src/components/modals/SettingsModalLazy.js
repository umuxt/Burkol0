// Settings Modal - Using static imports to avoid module loading errors// Settings Modal - Using static imports to avoid module loading errors

import SettingsModal from './SettingsModal.js'import SettingsModal from './SettingsModal.js'



// Use static import instead of lazy loading to avoid console errors// Use static import instead of lazy loading to avoid console errors

export default SettingsModalconst LazySettingsModal = SettingsModal

export default LazySettingsModal
export function SettingsModalLazy({ isOpen, onClose, t }) {
  const { useState, useEffect } = React
  const [activeTab, setActiveTab] = useState('pricing')
  const [tabsLoaded, setTabsLoaded] = useState(new Set())

  // Preload next tab when current tab is selected
  useEffect(() => {
    if (!isOpen) return

    const preloadMap = {
      'pricing': './components/settings/FormTab.js',
      'form': './components/settings/MailTab.js',
      'mail': './components/settings/PricingTab.js'
    }

    if (window.moduleLoader && preloadMap[activeTab]) {
      setTimeout(() => {
        window.moduleLoader.lazyLoad(preloadMap[activeTab])
      }, 500) // Preload after 500ms
    }
  }, [activeTab, isOpen])

  if (!isOpen) return null

  const tabs = [
    { id: 'pricing', label: t.tab_pricing || 'Fiyatlandırma', icon: '💰' },
    { id: 'form', label: t.tab_form || 'Form Ayarları', icon: '📝' },
    { id: 'mail', label: t.tab_mail || 'Mail Ayarları', icon: '📧' }
  ]

  const handleTabChange = (tabId) => {
    setActiveTab(tabId)
    setTabsLoaded(prev => new Set([...prev, tabId]))
  }

  const renderTabContent = () => {
    switch (activeTab) {
      case 'pricing':
        return React.createElement(LazyPricingTab, { t })
      case 'form':
        return React.createElement(LazyFormTab, { t })
      case 'mail':
        return React.createElement(LazyMailTab, { t })
      default:
        return React.createElement('div', {}, 'Sekme bulunamadı')
    }
  }

  return React.createElement('div', {
    className: 'modal-overlay',
    onClick: (e) => e.target === e.currentTarget && onClose()
  }, 
    React.createElement('div', {
      className: 'modal-content settings-modal',
      style: {
        width: '90%',
        maxWidth: '800px',
        maxHeight: '90vh',
        backgroundColor: 'var(--surface)',
        borderRadius: 'var(--radius-lg)',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column'
      }
    }, [
      // Modal Header
      React.createElement('div', {
        key: 'header',
        className: 'modal-header',
        style: {
          padding: 'var(--spacing-lg)',
          borderBottom: '1px solid rgba(255,255,255,0.1)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }
      }, [
        React.createElement('h2', { 
          key: 'title',
          style: { margin: 0, color: 'var(--text)' }
        }, '⚙️ ' + (t.settings || 'Ayarlar')),
        
        React.createElement('button', {
          key: 'close',
          onClick: onClose,
          className: 'btn btn-ghost',
          style: {
            background: 'none',
            border: 'none',
            fontSize: '1.5rem',
            cursor: 'pointer',
            color: 'var(--muted)',
            padding: '0.5rem'
          }
        }, '×')
      ]),

      // Tab Navigation
      React.createElement('div', {
        key: 'tabs',
        className: 'tab-navigation',
        style: {
          display: 'flex',
          backgroundColor: 'var(--modal-bg)',
          borderBottom: '1px solid rgba(255,255,255,0.1)'
        }
      }, tabs.map(tab => 
        React.createElement('button', {
          key: tab.id,
          onClick: () => handleTabChange(tab.id),
          className: `tab-button ${activeTab === tab.id ? 'active' : ''}`,
          style: {
            flex: 1,
            padding: 'var(--spacing-md) var(--spacing-lg)',
            background: activeTab === tab.id ? 'var(--accent)' : 'transparent',
            border: 'none',
            color: activeTab === tab.id ? '#fff' : 'var(--muted)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--spacing-xs)',
            justifyContent: 'center',
            transition: 'all 0.2s ease'
          }
        }, [
          React.createElement('span', { key: 'icon' }, tab.icon),
          React.createElement('span', { key: 'label' }, tab.label)
        ])
      )),

      // Tab Content
      React.createElement('div', {
        key: 'content',
        className: 'tab-content',
        style: {
          flex: 1,
          overflow: 'auto',
          padding: 'var(--spacing-lg)'
        }
      }, renderTabContent())
    ])
  )
}

// Export wrapper that handles loading state
export default function SettingsModalWrapper(props) {
  const { useState, useEffect } = React
  const [moduleReady, setModuleReady] = useState(false)

  useEffect(() => {
    if (props.isOpen && !moduleReady) {
      // Quick render for immediate feedback
      requestAnimationFrame(() => {
        setModuleReady(true)
      })
    }
  }, [props.isOpen, moduleReady])

  if (!props.isOpen) return null

  if (!moduleReady) {
    return React.createElement('div', {
      className: 'modal-overlay',
      style: {
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.8)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000
      }
    }, React.createElement('div', {
      style: {
        background: 'var(--surface)',
        borderRadius: 'var(--radius-lg)',
        padding: '2rem',
        color: 'var(--text)'
      }
    }, '⚙️ Ayarlar yükleniyor...'))
  }

  return React.createElement(SettingsModalLazy, props)
}

// Preload function for intersection observer
export function preloadSettingsModal(triggerElement) {
  if (window.moduleLoader && triggerElement) {
    // Preload the main tabs
    window.moduleLoader.batchPreload([
      './components/settings/PricingTab.js',
      './components/settings/FormTab.js',
      './components/settings/MailTab.js'
    ], 'low')
  }
}