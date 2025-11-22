import { showToast } from '../../shared/components/Toast.js';
// Settings App - Dedicated settings interface
import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import AccountTab from '../../src/components/settings/AccountTab.jsx'

// Main Settings App Component
function SettingsApp() {

  // Simple translation object
  const t = {
    settings_title: 'Sistem Ayarları',
    account: 'Hesap Ayarları',
    close: 'Kapat',
    save: 'Kaydet'
  }

  function onSettingsUpdated() {
    // Callback when settings are updated
    console.log('Settings updated')
  }

  return React.createElement('div', { className: 'settings-app' },
    // Content (no tabs needed, just account settings)
    React.createElement('div', { className: 'tab-content' },
      React.createElement(AccountTab, {
        t
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