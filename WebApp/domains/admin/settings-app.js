import { showToast } from '../../shared/components/MESToast.js';
// Settings App - Dedicated settings interface
import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import AccountTab from '../../src/components/settings/AccountTab.jsx'
import SystemTab from '../../src/components/settings/SystemTab.jsx'

// Main Settings App Component
function SettingsApp() {
  const [activeTab, setActiveTab] = useState('system'); // Default to System tab

  // Simple translation object
  const t = {
    settings_title: 'Sistem Ayarları',
    account: 'Hesap Ayarları',
    system: 'Sistem Yapılandırması',
    close: 'Kapat',
    save: 'Kaydet'
  }

  return React.createElement('div', { className: 'settings-app' },
    // Tab Navigation
    React.createElement('div', { className: 'tab-navigation mb-4' },
      React.createElement('button', {
        className: `tab-button ${activeTab === 'system' ? 'active' : ''}`,
        onClick: () => setActiveTab('system')
      }, 
        React.createElement('i', { className: 'fas fa-cogs mr-2' }),
        t.system
      ),
      React.createElement('button', {
        className: `tab-button ${activeTab === 'account' ? 'active' : ''}`,
        onClick: () => setActiveTab('account')
      }, 
        React.createElement('i', { className: 'fas fa-user-cog mr-2' }),
        t.account
      )
    ),

    // Tab Content
    React.createElement('div', { className: 'tab-content-container' },
      activeTab === 'system' && React.createElement(SystemTab, { t }),
      activeTab === 'account' && React.createElement(AccountTab, { t })
    )
  )
}

// Initialize the app
const settingsRoot = document.getElementById('settings-root')
if (settingsRoot) {
  const root = createRoot(settingsRoot)
  root.render(React.createElement(SettingsApp))
}