// FormBuilder - Main entry point using modular architecture
import React from 'react'
import { FormBuilderCompact } from './formBuilder/FormBuilderCompact.js'

export default function FormBuilder({ onClose, showNotification, t, isDarkMode }) {
  return React.createElement('div', { className: 'form-builder-wrapper' },
    React.createElement('div', { 
      className: 'modal-overlay',
      style: {
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }
    },
      React.createElement('div', {
        className: 'form-builder-modal',
        style: {
          backgroundColor: 'white',
          borderRadius: '8px',
          width: '95vw',
          height: '90vh',
          maxWidth: '1400px',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: '0 10px 30px rgba(0, 0, 0, 0.3)'
        }
      },
        // Modal Header
        React.createElement('div', {
          className: 'modal-header',
          style: {
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '16px 24px',
            borderBottom: '1px solid #ddd',
            backgroundColor: '#f8f9fa'
          }
        },
          React.createElement('h3', { style: { margin: 0 } }, 'Form Oluşturucu'),
          React.createElement('button', {
            onClick: onClose,
            className: 'btn btn-close',
            style: {
              background: 'none',
              border: 'none',
              fontSize: '24px',
              cursor: 'pointer',
              padding: '0',
              width: '32px',
              height: '32px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '4px'
            }
          }, '×')
        ),
        
        // Modal Body
        React.createElement('div', {
          className: 'modal-body',
          style: {
            flex: 1,
            overflow: 'auto',
            padding: '0'
          }
        },
          React.createElement(FormBuilderCompact, {
            isDarkMode,
            t,
            showNotification
          })
        )
      )
    )
  )
}