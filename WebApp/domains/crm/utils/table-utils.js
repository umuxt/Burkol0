// Quotes Table Utils - Table column management and data formatting for quotes
import React from 'react';
import * as Utils from '../../../shared/lib/utils.js'

// Safe formatPrice function with fallback
const formatPrice = Utils.formatPrice || function(price, currency = 'TL') {
  const n = typeof price === 'number' ? price : (parseFloat(price) || 0)
  const formatted = n.toFixed(2) // dot decimal, no grouping
  return `₺${formatted}`
}

// Import warning info from QuotesManager.js to avoid duplication
// We'll use a helper function instead of duplicating the logic

// Helper function to get warning info - will be passed from QuotesManager.js
function getWarningInfoForQuote(quote) {
  if (!quote || !quote.priceStatus) {
    return { type: 'none', color: null, priority: 0 }
  }

  const status = quote.priceStatus.status
  const diffSummary = quote.priceStatus.differenceSummary
  const priceDiff = Math.abs(diffSummary?.priceDiff || 0)
  
  // Eğer uyarı gizlenmişse warning yok
  if (quote.versionWarningHidden === true) {
    return { type: 'none', color: null, priority: 0 }
  }

  // Kırmızı uyarı: Fiyat farkı var
  if (priceDiff > 0 || status === 'price-drift') {
    return { 
      type: 'price', 
      color: '#dc3545', // Kırmızı
      textColor: 'white',
      symbol: '!',
      title: 'Fiyat değişti - Güncelleme gerekli',
      priority: 2 
    }
  }

  // Sarı uyarı: Sadece versiyon/parametre farkı var, fiyat aynı
  if (status === 'content-drift' || status === 'outdated') {
    const hasParameterChanges = diffSummary?.parameterChanges && 
      (diffSummary.parameterChanges.added?.length > 0 ||
       diffSummary.parameterChanges.removed?.length > 0 ||
       diffSummary.parameterChanges.modified?.length > 0)
    const hasFormulaChange = diffSummary?.formulaChanged === true
    
    if (hasParameterChanges || hasFormulaChange) {
      return { 
        type: 'version', 
        color: '#ffc107', // Sarı
        textColor: '#000',
        symbol: '~',
        title: 'Versiyon değişti - Parametre/formül güncellemesi',
        priority: 1 
      }
    }
  }

  return { type: 'none', color: null, priority: 0 }
}

function getPriceChangeButtonColor(changeType) {
  // Legacy support for old changeType system
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
  // Legacy support for old changeType system
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
  // Legacy support for old changeType system
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
  // Legacy support for old changeType system
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
    { id: 'delivery_date', label: 'Termine Kalan', type: 'text' },
    { id: 'status', label: 'Durum', type: 'text' }
  ]
  
  return [...fixedColumns, ...dynamicFields, ...endColumns]
}

export function getFieldValue(quote, fieldId) {
  // Fixed fields are directly on the quote object
  const fixedFields = ['date', 'name', 'company', 'proj', 'phone', 'email', 'price', 'delivery_date', 'status']
  
  if (fixedFields.includes(fieldId)) {
    if (fieldId === 'date') {
      return quote.createdAt || quote.date || ''
    }
    // Map frontend field names to backend column names (camelCase)
    if (fieldId === 'name') return quote.customerName || ''
    if (fieldId === 'company') return quote.customerCompany || ''
    if (fieldId === 'phone') return quote.customerPhone || ''
    if (fieldId === 'email') return quote.customerEmail || ''
    if (fieldId === 'price') return quote.finalPrice || quote.calculatedPrice || 0
    if (fieldId === 'delivery_date') return quote.deliveryDate || ''
    if (fieldId === 'proj') return quote.formData?.project || quote.formData?.proj || quote.project || ''
    
    return quote[fieldId] || ''
  } else {
    // Dynamic fields are in customFields or formData
    return quote.customFields?.[fieldId] || quote.formData?.[fieldId] || ''
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
    const { getPriceChangeType, setSettingsModal, openPriceReview, calculatePrice, statusLabel, t } = context;
    
    switch (column.id) {
      case 'date':
        if (value) {
          // Convert to local date/time using toLocaleString
          const date = new Date(value);
          if (!isNaN(date.getTime())) {
            return date.toLocaleString('tr-TR', { 
              day: '2-digit', 
              month: '2-digit', 
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit'
            });
          }
        }
        return '';
        
      case 'customer':
        return (item.customerName || '') + (item.customerCompany ? ' — ' + item.customerCompany : '');
        
      case 'project':
        const proj = value || '';
        return proj.length > 15 ? proj.substring(0, 15) + '...' : proj;
        
      case 'price':
        const priceStatus = item?.priceStatus || null
        const manualOverrideActive = item?.manualOverride?.active === true || priceStatus?.status === 'manual'

        if (manualOverrideActive) {
          return React.createElement('span', {
            style: {
              color: 'var(--text, #f8fafc)', // Normal beyaz renk
              fontWeight: 'normal'
            },
            title: 'Bu fiyat manuel olarak kilitlendi'
          }, `${formatPrice(parseFloat(value) || 0)}🔒`)
        }

        // Yeni uyarı sistemi kullan
        const warningInfo = getWarningInfoForQuote(item)
        
        if (warningInfo.priority === 0) {
          // Uyarı yok, normal fiyat göster
          return formatPrice(parseFloat(value) || 0)
        }

        // Uyarı var, buton ve indicator ile göster
        const differenceSummary = priceStatus?.differenceSummary || null
        const originalPrice = differenceSummary?.oldPrice ?? (parseFloat(item.finalPrice || item.calculatedPrice) || 0)
        const fallbackCalculated = typeof calculatePrice === 'function'
          ? parseFloat(calculatePrice(item)) || 0
          : (item.pendingCalculatedPrice !== undefined ? parseFloat(item.pendingCalculatedPrice) || 0 : 0)
        const recalculatedPrice = differenceSummary?.newPrice
          ?? (parseFloat(priceStatus?.calculatedPrice) || fallbackCalculated || originalPrice)

        const priceDiffValue = Number(differenceSummary?.priceDiff ?? (recalculatedPrice - originalPrice))
        const baseTitle = differenceSummary
          ? `Fark: ₺${priceDiffValue.toFixed(2)} (${formatPrice(originalPrice)} → ${formatPrice(recalculatedPrice)})`
          : 'Fiyat ayarları değişti'
        const reasonLines = differenceSummary?.reasons?.length ? `\n${differenceSummary.reasons.join('\n')}` : ''
        const indicatorTitle = `${baseTitle}${reasonLines}`

        return React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
          React.createElement('span', null, formatPrice(parseFloat(value) || 0)),
          React.createElement('div', {
            style: {
              display: 'inline-block',
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              backgroundColor: warningInfo.color
            },
            title: indicatorTitle
          }),
          React.createElement('button', {
            onClick: (e) => {
              e.stopPropagation()
              if (typeof openPriceReview === 'function') {
                openPriceReview(item, {
                  originalPrice,
                  newPrice: recalculatedPrice,
                  differenceSummary
                })
              }
            },
            style: {
              backgroundColor: warningInfo.color,
              color: warningInfo.textColor,
              border: 'none',
              padding: '2px 6px',
              borderRadius: '4px',
              fontSize: '10px',
              cursor: 'pointer',
              fontWeight: '600'
            },
            title: warningInfo.title
          }, warningInfo.symbol)
        )

      case 'delivery_date':
        // Calculate days remaining from delivery date
        if (!value || value === '') {
          return '';
        }
        
        // Parse date - if it's just a date string (YYYY-MM-DD), create date at noon local time
        // to avoid timezone issues
        let deliveryDate;
        if (typeof value === 'string' && value.match(/^\d{4}-\d{2}-\d{2}$/)) {
          const [year, month, day] = value.split('-').map(Number);
          deliveryDate = new Date(year, month - 1, day, 12, 0, 0);
        } else {
          deliveryDate = new Date(value);
        }
        
        const today = new Date();
        today.setHours(12, 0, 0, 0);
        deliveryDate.setHours(12, 0, 0, 0);
        
        const diffTime = deliveryDate - today;
        const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
        
        let displayText = '';
        let style = {};
        
        if (diffDays < 0) {
          displayText = `${Math.abs(diffDays)} gün gecikti`;
          style = { color: '#dc3545', fontWeight: '600' };
        } else if (diffDays === 0) {
          displayText = 'Bugün';
          style = { color: '#ffc107', fontWeight: '600' };
        } else if (diffDays <= 3) {
          displayText = `${diffDays} gün kaldı`;
          style = { color: '#ffc107', fontWeight: '600' };
        } else {
          displayText = `${diffDays} gün kaldı`;
          style = {};
        }
        
        return React.createElement('span', { style }, displayText);
        
      case 'status':
        const statusValue = value || 'new';
        const statusText = statusLabel(statusValue, t);
        const statusOptions = [
          { value: 'new', label: 'Yeni' },
          { value: 'pending', label: 'Beklemede' },
          { value: 'approved', label: 'Onaylandı' },
          { value: 'rejected', label: 'Reddedildi' }
        ];
        
        // Map status to CSS class
        const statusClassMap = {
          'new': 'new',
          'pending': 'pending',
          'approved': 'approved',
          'rejected': 'rejected'
        };
        
        return React.createElement('div', { 
          style: { position: 'relative', display: 'inline-block' } 
        },
          React.createElement('select', {
            value: statusValue,
            onChange: (e) => {
              e.stopPropagation();
              const newStatus = e.target.value;
              if (context?.setItemStatus && typeof context.setItemStatus === 'function') {
                context.setItemStatus(item.id, newStatus);
              }
            },
            onClick: (e) => e.stopPropagation(),
            className: `status-badge ${statusClassMap[statusValue] || 'new'}`
          },
            ...statusOptions.map(option =>
              React.createElement('option', { 
                key: option.value, 
                value: option.value
              }, option.label)
            )
          )
        );
        
      default:
        if (column.type === 'currency') {
          return formatPrice(parseFloat(value) || 0)
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
    case 'review': return '#fff3e0';
    case 'feasible': return '#e8f5e8';
    case 'not': return '#ffebee';
    case 'quoted': return '#f3e5f5';
    case 'approved': return '#e8f5e8';
    default: return '#f5f5f5';
  }
}

function getStatusTextColor(status) {
  switch (status) {
    case 'new': return '#1976d2';
    case 'review': return '#f57c00';
    case 'feasible': return '#388e3c';
    case 'not': return '#d32f2f';
    case 'quoted': return '#7b1fa2';
    case 'approved': return '#2e7d32';
    default: return '#666';
  }
}
