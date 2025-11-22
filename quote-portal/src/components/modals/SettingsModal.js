// Compact Settings Modal - User management settings interface
import React from 'react';
import UsersTab from '../settings/UsersTab.jsx'
import { showToast } from '../../../shared/components/MESToast.js'

const { useEffect } = React;

function SettingsModalCompact({ onClose, onSettingsUpdated, t }) {

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
        React.createElement('h2', null, t.settings_title || 'Kullanıcı Ayarları'),
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

      // Content
      React.createElement('div', { className: 'modal-body' },
        React.createElement(UsersTab, {
          t
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