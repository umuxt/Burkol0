// Compact Settings Modal - Modular tab-based settings interface
import React from 'react';
import PricingTab from '../settings/DynamicPricingTab.js'
import FormTab from '../settings/FormTab.js'
import UsersTab from '../settings/UsersTab.js'
import AdvancedPriceRules from '../settings/AdvancedPriceRules.js'

const { useState, useEffect } = React;

function SettingsModalCompact({ onClose, onSettingsUpdated, t, showNotification }) {
  const [activeTab, setActiveTab] = useState('advanced-rules') // 'pricing' | 'form' | 'users' | 'advanced-rules'

  // Body scroll lock on mount/unmount
  useEffect(() => {
    document.body.classList.add('modal-open')
    return () => {
      document.body.classList.remove('modal-open')
    }
  }, [])

  function handleClose() {
    onSettingsUpdated()
    onClose()
  }

  return React.createElement('div', { className: 'modal-overlay', onClick: handleClose },
    React.createElement('div', { 
      className: 'modal-content',
      onClick: (e) => e.stopPropagation(),
      style: { 
        maxWidth: '900px',
        width: '90vw',
        maxHeight: '90vh',
        overflow: 'auto'
      }
    },
      // Modal header
      React.createElement('div', { className: 'modal-header' },
        React.createElement('h2', null, t.settings_title || 'Ayarlar'),
        React.createElement('button', {
          onClick: handleClose,
          className: 'btn btn-close',
          style: {
            position: 'absolute',
            top: '15px',
            right: '15px',
            background: 'none',
            border: 'none',
            fontSize: '24px',
            cursor: 'pointer'
          }
        }, '×')
      ),

      // Tab navigation
      React.createElement('div', { className: 'tab-navigation', style: { borderBottom: '1px solid #ddd', marginBottom: '20px' } },
        React.createElement('button', {
          className: `tab-button ${activeTab === 'advanced-rules' ? 'active' : ''}`,
          onClick: () => setActiveTab('advanced-rules'),
          style: {
            padding: '10px 20px',
            border: 'none',
            background: activeTab === 'advanced-rules' ? '#007bff' : 'transparent',
            color: activeTab === 'advanced-rules' ? 'white' : '#007bff',
            cursor: 'pointer',
            borderRadius: '4px 4px 0 0'
          }
        }, '🎯 Gelişmiş Kurallar'),
        
        React.createElement('button', {
          className: `tab-button ${activeTab === 'pricing' ? 'active' : ''}`,
          onClick: () => setActiveTab('pricing'),
          style: {
            padding: '10px 20px',
            border: 'none',
            background: activeTab === 'pricing' ? '#007bff' : 'transparent',
            color: activeTab === 'pricing' ? 'white' : '#007bff',
            cursor: 'pointer',
            borderRadius: '4px 4px 0 0',
            marginLeft: '5px'
          }
        }, 'Fiyatlandırma'),
        
        React.createElement('button', {
          className: `tab-button ${activeTab === 'form' ? 'active' : ''}`,
          onClick: () => setActiveTab('form'),
          style: {
            padding: '10px 20px',
            border: 'none',
            background: activeTab === 'form' ? '#007bff' : 'transparent',
            color: activeTab === 'form' ? 'white' : '#007bff',
            cursor: 'pointer',
            borderRadius: '4px 4px 0 0',
            marginLeft: '5px'
          }
        }, 'Form Yapısı'),

        React.createElement('button', {
          className: `tab-button ${activeTab === 'users' ? 'active' : ''}`,
          onClick: () => setActiveTab('users'),
          style: {
            padding: '10px 20px',
            border: 'none',
            background: activeTab === 'users' ? '#007bff' : 'transparent',
            color: activeTab === 'users' ? 'white' : '#007bff',
            cursor: 'pointer',
            borderRadius: '4px 4px 0 0',
            marginLeft: '5px'
          }
        }, 'Kullanıcılar')
      ),

      // Tab content
      React.createElement('div', { className: 'tab-content' },
        activeTab === 'advanced-rules' && React.createElement(AdvancedPriceRules, {
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
        }),

        activeTab === 'users' && React.createElement(UsersTab, {
          t,
          showNotification
        })
      ),

      // Modal footer
      React.createElement('div', { className: 'modal-footer', style: { marginTop: '20px', textAlign: 'right' } },
        React.createElement('button', {
          onClick: handleClose,
          className: 'btn btn-secondary'
        }, t.close || 'Kapat')
      )
    )
  )
}

export default SettingsModalCompact