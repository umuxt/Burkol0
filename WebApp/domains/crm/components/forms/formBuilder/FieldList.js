// Field List Component - Display and manage existing form fields
import React from 'react';
const { useState } = React;

export function FieldList({ fields, onEditField, onDeleteField, onDuplicateField, onReorderField, showNotification }) {
  const [draggedIndex, setDraggedIndex] = useState(null)
  const [dragOverIndex, setDragOverIndex] = useState(null)
  
  // Form sırası verisine göre sırala
  const sortedFields = [...fields].sort((a, b) => {
    const orderA = a.display?.formOrder || 0
    const orderB = b.display?.formOrder || 0
    return orderA - orderB
  })

  function handleDragStart(e, index) {
    setDraggedIndex(index)
    e.dataTransfer.effectAllowed = 'move'
  }

  function handleDragOver(e, index) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverIndex(index)
  }

  function handleDragLeave() {
    setDragOverIndex(null)
  }

  function handleDrop(e, targetIndex) {
    e.preventDefault()
    if (draggedIndex !== null && draggedIndex !== targetIndex) {
      onReorderField(draggedIndex, targetIndex)
    }
    setDraggedIndex(null)
    setDragOverIndex(null)
  }

  function handleDragEnd() {
    setDraggedIndex(null)
    setDragOverIndex(null)
  }

  function confirmDelete(fieldId, fieldLabel) {
    if (window.confirm(`"${fieldLabel}" alanını silmek istediğinizden emin misiniz?`)) {
      onDeleteField(fieldId)
    }
  }

  // Görüntüleme için sortedFields kullan, drag-drop işlemleri için orijinal index'i koru
  if (sortedFields.length === 0) {
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
    }, `Form Alanları (${sortedFields.length})`),
    
    React.createElement('div', { 
      className: 'field-cards',
      style: {
        display: 'flex',
        flexDirection: 'column',
        gap: '6px'
      }
    }, sortedFields.map((field, sortedIndex) => {
      const isDragging = draggedIndex === sortedIndex
      const isDragOver = dragOverIndex === sortedIndex
      
      return React.createElement('div', {
          key: field.id,
          className: 'field-card',
          draggable: true,
          onDragStart: (e) => handleDragStart(e, sortedIndex),
          onDragOver: (e) => handleDragOver(e, sortedIndex),
          onDragLeave: handleDragLeave,
          onDrop: (e) => handleDrop(e, sortedIndex),
          onDragEnd: handleDragEnd,
          style: {
            border: isDragging ? '2px solid #3b82f6' : (isDragOver ? '2px dashed #3b82f6' : '1px solid #ddd'),
            borderRadius: '8px',
            padding: '16px',
            backgroundColor: isDragging ? '#eff6ff' : 'white',
            cursor: 'move',
            transition: 'all 0.2s ease',
            opacity: isDragging ? 0.5 : 1,
            transform: isDragging ? 'scale(0.98)' : 'scale(1)'
          }
        },
          React.createElement('div', { className: 'field-header', style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' } },
            React.createElement('div', { 
              style: { flex: 1, cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: '6px' },
              onClick: () => onEditField(field)
            },
              React.createElement('h5', { style: { margin: 0, color: '#333', fontSize: '14px', fontWeight: 600 } }, field.label),
              React.createElement('div', { style: { fontSize: '12px', color: '#666', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' } },
                React.createElement('span', null, `Tür: ${getFieldTypeLabel(field.type)}`),
                field.placeholder && React.createElement('span', null, `Placeholder: "${field.placeholder}"`),
                React.createElement('span', null, field.display?.showInTable ? '✓ Tabloda' : '✗ Tabloda'),
                React.createElement('span', null, field.display?.showInFilter ? '✓ Filtrede' : '✗ Filtrede')
              )
            ),
            
            React.createElement('div', { className: 'field-actions', style: { display: 'flex', gap: '4px', flexShrink: 0 } },
              React.createElement('button', {
                onClick: () => confirmDelete(field.id, field.label),
                className: 'btn btn-sm btn-danger',
                style: { 
                  fontSize: '12px', 
                  padding: '6px 8px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  minWidth: '32px',
                  background: '#dc3545',
                  border: 'none',
                  color: '#fff'
                }
              },
                React.createElement('span', {
                  style: { display: 'flex', alignItems: 'center' },
                  dangerouslySetInnerHTML: { 
                    __html: '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>' 
                  }
                })
              )
            )
          )
        )
      })
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