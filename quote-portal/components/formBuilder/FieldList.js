// Field List Component - Display and manage existing form fields
import React from 'react'

const { useState } = React

export function FieldList({ fields, onEditField, onDeleteField, onDuplicateField, onReorderField, showNotification }) {
  const [draggedIndex, setDraggedIndex] = useState(null)

  function handleDragStart(e, index) {
    setDraggedIndex(index)
    e.dataTransfer.effectAllowed = 'move'
  }

  function handleDragOver(e) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }

  function handleDrop(e, targetIndex) {
    e.preventDefault()
    if (draggedIndex !== null && draggedIndex !== targetIndex) {
      onReorderField(draggedIndex, targetIndex)
    }
    setDraggedIndex(null)
  }

  function confirmDelete(fieldId, fieldLabel) {
    if (window.confirm(`"${fieldLabel}" alanını silmek istediğinizden emin misiniz?`)) {
      onDeleteField(fieldId)
    }
  }

  if (fields.length === 0) {
    return React.createElement('div', { 
      className: 'empty-state',
      style: {
        textAlign: 'center',
        padding: '40px',
        color: '#666',
        border: '2px dashed #ddd',
        borderRadius: '8px'
      }
    },
      React.createElement('p', null, 'Henüz form alanı eklenmemiş.'),
      React.createElement('p', null, '"Yeni Alan Ekle" butonunu kullanarak başlayın.')
    )
  }

  return React.createElement('div', { 
    className: 'field-list',
    style: {
      display: 'flex',
      flexDirection: 'column',
      minHeight: 'auto'
    }
  },
    React.createElement('h4', { 
      style: { margin: '0 0 16px 0' } 
    }, `Form Alanları (${fields.length})`),
    
    React.createElement('div', { 
      className: 'field-cards',
      style: {
        display: 'flex',
        flexDirection: 'column',
        gap: '12px'
      }
    }, fields.map((field, index) =>
      React.createElement('div', {
          key: field.id,
          className: 'field-card',
          draggable: true,
          onDragStart: (e) => handleDragStart(e, index),
          onDragOver: handleDragOver,
          onDrop: (e) => handleDrop(e, index),
          style: {
            border: '1px solid #ddd',
            borderRadius: '8px',
            padding: '16px',
            backgroundColor: draggedIndex === index ? '#f0f0f0' : 'white',
            cursor: 'move',
            transition: 'all 0.2s ease'
          }
        },
          React.createElement('div', { className: 'field-header', style: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' } },
            React.createElement('div', { style: { flex: 1 } },
              React.createElement('h5', { style: { margin: '0 0 4px 0', color: '#333' } }, field.label),
              React.createElement('div', { style: { fontSize: '12px', color: '#666' } },
                `ID: ${field.id} | Tür: ${getFieldTypeLabel(field.type)}`
              )
            ),
            
            React.createElement('div', { className: 'field-actions', style: { display: 'flex', gap: '4px' } },
              React.createElement('button', {
                onClick: () => onEditField(field),
                className: 'btn btn-sm btn-primary',
                style: { fontSize: '12px', padding: '4px 8px' }
              }, 'Düzenle'),
              React.createElement('button', {
                onClick: () => confirmDelete(field.id, field.label),
                className: 'btn btn-sm btn-danger',
                style: { fontSize: '12px', padding: '4px 8px' }
              }, 'Sil')
            )
          ),
          
          React.createElement('div', { className: 'field-details', style: { marginTop: '12px' } },
            field.placeholder && React.createElement('div', { style: { fontSize: '12px', color: '#666', marginBottom: '4px' } },
              `Placeholder: "${field.placeholder}"`
            ),
            
            field.options && field.options.length > 0 && React.createElement('div', { style: { fontSize: '12px', color: '#666', marginBottom: '4px' } },
              `Seçenekler: ${field.options.slice(0, 3).join(', ')}${field.options.length > 3 ? '...' : ''}`
            ),
            
            React.createElement('div', { style: { fontSize: '11px', color: '#999', display: 'flex', gap: '12px' } },
              React.createElement('span', null, field.display?.showInTable ? '✓ Tabloda' : '✗ Tabloda'),
              React.createElement('span', null, field.display?.showInFilter ? '✓ Filtrede' : '✗ Filtrede'),
              field.validation?.min && React.createElement('span', null, `Min: ${field.validation.min}`),
              field.validation?.max && React.createElement('span', null, `Max: ${field.validation.max}`)
            )
          )
        )
      )
    )
  )
}

function getFieldTypeLabel(type) {
  const types = {
    'text': 'Metin',
    'textarea': 'Uzun Metin',
    'number': 'Sayı',
    'email': 'E-posta',
    'phone': 'Telefon',
    'dropdown': 'Açılır Liste',
    'multiselect': 'Çoklu Seçim',
    'radio': 'Seçenek Butonları',
    'checkbox': 'Onay Kutusu',
    'date': 'Tarih',
    'file': 'Dosya'
  }
  return types[type] || type
}

export default FieldList