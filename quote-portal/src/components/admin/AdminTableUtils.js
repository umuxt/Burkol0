// Admin Table Utils - Table column management and data formatting
import React from 'react';
import * as Utils from '../../lib/utils.js'

// Safe formatPrice function with fallback
const formatPrice = Utils.formatPrice || function(price, currency = 'TL') {
  const n = typeof price === 'number' ? price : (parseFloat(price) || 0)
  const formatted = n.toFixed(2) // dot decimal, no grouping
  return `₺${formatted}`
}

// Import warning info from Admin.js to avoid duplication
// We'll use a helper function instead of duplicating the logic

// Helper function to get warning info - will be passed from Admin.js
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
    const { getPriceChangeType, setSettingsModal, openPriceReview, calculatePrice, statusLabel, t } = context;
    
    switch (column.id) {
      case 'date':
        const dateStr = value || '';
        if (dateStr) {
          // YYYY-MM-DD formatından DD-MM-YYYY formatına çevir
          const datePart = dateStr.slice(0, 10);
          if (datePart.includes('-') && datePart.length === 10) {
            const [year, month, day] = datePart.split('-');
            return `${day}-${month}-${year}`;
          }
        }
        return dateStr.slice(0, 10);
        
      case 'customer':
        return (item.name || '') + (item.company ? ' — ' + item.company : '');
        
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
        const originalPrice = differenceSummary?.oldPrice ?? (parseFloat(item.price) || 0)
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

      case 'due':
        const due = value || '';
        if (due.includes('Gecikti')) {
          return React.createElement('span', { style: { color: '#dc3545', fontWeight: '600' } }, due);
        } else if (due.includes('gün')) {
          const days = parseInt(due.match(/\d+/)?.[0] || '0');
          if (days <= 3) {
            return React.createElement('span', { style: { color: '#ffc107', fontWeight: '600' } }, due);
          }
        }
        return due;
        
      case 'status':
        const statusText = statusLabel(value || 'new', t);
        const statusOptions = [
          { value: 'new', label: statusLabel('new', t) },
          { value: 'review', label: statusLabel('review', t) },
          { value: 'feasible', label: statusLabel('feasible', t) },
          { value: 'not', label: statusLabel('not', t) },
          { value: 'quoted', label: statusLabel('quoted', t) },
          { value: 'approved', label: statusLabel('approved', t) }
        ];
        
        return React.createElement('div', { 
          style: { position: 'relative', display: 'inline-block' } 
        },
          React.createElement('select', {
            value: value || 'new',
            onChange: (e) => {
              e.stopPropagation();
              const newStatus = e.target.value;
              if (context?.setItemStatus && typeof context.setItemStatus === 'function') {
                context.setItemStatus(item.id, newStatus);
              }
            },
            onClick: (e) => e.stopPropagation(),
            style: {
              padding: '2px 8px',
              paddingRight: '20px',
              borderRadius: '12px',
              fontSize: '11px',
              fontWeight: '600',
              backgroundColor: getStatusColor(value),
              color: getStatusTextColor(value),
              border: `1px solid ${getStatusTextColor(value)}20`,
              cursor: 'pointer',
              appearance: 'none',
              backgroundImage: `url("data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAiIGhlaWdodD0iNiIgdmlld0JveD0iMCAwIDEwIDYiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxwYXRoIGQ9Ik01IDZMMCAzTDEuNSAxLjVMNSAzTDguNSAxLjVMMTAgM0w1IDZaIiBmaWxsPSIke getStatusTextColor(value)}Ii8+KPHN2Zz4K")`,
              backgroundRepeat: 'no-repeat',
              backgroundPosition: 'right 6px center',
              backgroundSize: '8px',
              minWidth: '80px',
              transition: 'all 0.2s ease'
            }
          },
            ...statusOptions.map(option =>
              React.createElement('option', { 
                key: option.value, 
                value: option.value,
                style: { backgroundColor: 'white', color: 'black' }
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
