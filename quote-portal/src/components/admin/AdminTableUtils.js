// Admin Table Utils - Table column management and data formatting
import React from 'react';
import * as Utils from '../../lib/utils.js'

// Safe formatPrice function with fallback
const formatPrice = Utils.formatPrice || function(price, currency = 'TL') {
  const n = typeof price === 'number' ? price : (parseFloat(price) || 0)
  const formatted = n.toFixed(2) // dot decimal, no grouping
  return `₺${formatted}`
}

// Price change button helper functions
function getPriceChangeButtonColor(changeType) {
  switch (changeType) {
    case 'price-changed':
      return '#dc3545' // 🔴 Kırmızı - Fiyat gerçekten değişti
    case 'formula-changed':
      return '#ffc107' // 🟡 Sarı - Formül/parametre değişti ama fiyat aynı
    default:
      return '#6c757d' // Gri - Bilinmeyen durum
  }
}

function getPriceChangeButtonTextColor(changeType) {
  switch (changeType) {
    case 'price-changed':
      return 'white' // Kırmızı arkaplan için beyaz yazı
    case 'formula-changed':
      return '#000' // Sarı arkaplan için siyah yazı
    default:
      return 'white' // Gri arkaplan için beyaz yazı
  }
}

function getPriceChangeButtonTitle(changeType) {
  switch (changeType) {
    case 'price-changed':
      return 'Fiyat değişti - Yeni hesaplama mevcut fiyattan farklı'
    case 'formula-changed':
      return 'Formül değişti - Parametre veya formül güncellendi ama fiyat aynı kaldı'
    default:
      return 'Fiyat durumu belirsiz'
  }
}

function getPriceChangeButtonSymbol(changeType) {
  switch (changeType) {
    case 'price-changed':
      return '!' // Ünlem - Fiyat değişti
    case 'formula-changed':
      return '~' // Tilde - Formül değişti
    default:
      return '?' // Soru işareti - Bilinmeyen
  }
}

export function getTableColumns(formConfig) {
  // Fixed columns that always appear in the table
  const fixedColumns = [
    { id: 'date', label: 'Tarih', type: 'date' },
    { id: 'name', label: 'Müşteri', type: 'text' },
    { id: 'company', label: 'Şirket', type: 'text' },
    { id: 'proj', label: 'Proje', type: 'text' },
    { id: 'phone', label: 'Telefon', type: 'phone' },
    { id: 'email', label: 'E-posta', type: 'email' }
  ]
  
  // Add dynamic fields from form config if any
  const configFields = formConfig?.fields || formConfig?.formStructure?.fields || []
  const dynamicFields = configFields
    .filter(field => field.display?.showInTable)
    .sort((a, b) => (a.display?.tableOrder || 0) - (b.display?.tableOrder || 0))
  
  // Add fixed end columns
  const endColumns = [
    { id: 'price', label: 'Tahmini Fiyat', type: 'currency' },
    { id: 'due', label: 'Termine Kalan', type: 'text' },
    { id: 'status', label: 'Durum', type: 'text' }
  ]
  
  return [...fixedColumns, ...dynamicFields, ...endColumns]
}

export function getFieldValue(quote, fieldId) {
  // Fixed fields are directly on the quote object
  const fixedFields = ['date', 'name', 'company', 'proj', 'phone', 'email', 'price', 'due', 'status']
  
  if (fixedFields.includes(fieldId)) {
    if (fieldId === 'date') {
      return quote.createdAt || quote.date || ''
    }
    return quote[fieldId] || ''
  } else {
    // Dynamic fields are in customFields
    return quote.customFields?.[fieldId] || ''
  }
}

export function formatFieldValue(value, column, item, context) {
  // Normalize values to avoid passing objects/undefined to React DOM (prevents React error #130)
  const normalize = (v) => {
    if (v === null || v === undefined) return ''
    if (Array.isArray(v)) return v.join(', ')
    if (typeof v === 'object') return JSON.stringify(v)
    return v
  }
  value = normalize(value)

  // If context is provided, this is for table display with special handling
  if (context) {
    const { getPriceChangeType, setSettingsModal, setPriceReview, calculatePrice, statusLabel, t } = context;
    
    switch (column.id) {
      case 'date':
        return (value || '').slice(0, 10);
        
      case 'customer':
        return (item.name || '') + (item.company ? ' — ' + item.company : '');
        
      case 'project':
        const proj = value || '';
        return proj.length > 15 ? proj.substring(0, 15) + '...' : proj;
        
      case 'price':
        const priceChangeType = getPriceChangeType(item);
        
        if (priceChangeType === 'no-change') {
          return formatPrice(parseFloat(value) || 0);
        } else {
          // Price update needed - show with button
          return React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
            React.createElement('span', null, formatPrice(parseFloat(value) || 0)),
            React.createElement('button', {
              onClick: (e) => {
                e.stopPropagation();
                console.log('🔧 Price update button clicked for quote:', item.id, {
                  changeType: priceChangeType,
                  currentPrice: item.price,
                  needsPriceUpdate: item.needsPriceUpdate,
                  priceUpdatedAt: item.priceUpdatedAt
                });
                
                const original = parseFloat(item.price) || 0;
                // Use pendingCalculatedPrice if available (more accurate), otherwise calculate on the fly
                let calc = original;
                if (item.pendingCalculatedPrice !== undefined) {
                  calc = parseFloat(item.pendingCalculatedPrice) || 0;
                } else if (typeof calculatePrice === 'function') {
                  calc = parseFloat(calculatePrice(item)) || 0;
                }
                
                console.log('🔧 Price review data:', {
                  original,
                  calculated: calc,
                  difference: Math.abs(calc - original)
                });
                
                setPriceReview({ item, originalPrice: original, newPrice: calc });
              },
              style: {
                backgroundColor: getPriceChangeButtonColor(priceChangeType),
                color: getPriceChangeButtonTextColor(priceChangeType),
                border: 'none',
                padding: '2px 6px',
                borderRadius: '4px',
                fontSize: '10px',
                cursor: 'pointer',
                fontWeight: 'bold'
              },
              title: getPriceChangeButtonTitle(priceChangeType)
            }, getPriceChangeButtonSymbol(priceChangeType))
          );
        }
        
      case 'due':
        const due = value || '';
        if (due.includes('Gecikti')) {
          return React.createElement('span', { style: { color: '#dc3545', fontWeight: 'bold' } }, due);
        } else if (due.includes('gün')) {
          const days = parseInt(due.match(/\d+/)?.[0] || '0');
          if (days <= 3) {
            return React.createElement('span', { style: { color: '#ffc107', fontWeight: 'bold' } }, due);
          }
        }
        return due;
        
      case 'status':
        const status = statusLabel(value || 'new', t);
        return React.createElement('span', {
          style: {
            padding: '2px 8px',
            borderRadius: '12px',
            fontSize: '11px',
            fontWeight: 'bold',
            backgroundColor: getStatusColor(value),
            color: getStatusTextColor(value)
          }
        }, status);
        
      default:
        if (column.type === 'currency') {
          return formatPrice(parseFloat(value) || 0);
        } else if (column.type === 'email') {
          return React.createElement('a', { href: `mailto:${value}`, style: { color: '#007bff' } }, value);
        } else if (column.type === 'phone') {
          return React.createElement('a', { href: `tel:${value}`, style: { color: '#007bff' } }, value);
        }
        return value || '';
    }
  }
  
  // Default formatting without context
  if (column.type === 'currency') {
    return formatPrice(parseFloat(value) || 0);
  } else if (column.type === 'date') {
    return (value || '').slice(0, 10);
  }
  
  return value || '';
}

function getStatusColor(status) {
  switch (status) {
    case 'new': return '#e3f2fd';
    case 'pending': return '#fff3e0';
    case 'approved': return '#e8f5e8';
    case 'rejected': return '#ffebee';
    case 'completed': return '#f3e5f5';
    default: return '#f5f5f5';
  }
}

function getStatusTextColor(status) {
  switch (status) {
    case 'new': return '#1976d2';
    case 'pending': return '#f57c00';
    case 'approved': return '#388e3c';
    case 'rejected': return '#d32f2f';
    case 'completed': return '#7b1fa2';
    default: return '#666';
  }
}
