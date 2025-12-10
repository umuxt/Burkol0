// Quotes Table Utils - Table column management and data formatting for quotes
import React from 'react';
import * as Utils from '../../../shared/lib/utils.js'
import { FileText, CheckCircle } from '../../../shared/components/Icons.jsx'

// Safe formatPrice function with fallback
const formatPrice = Utils.formatPrice || function (price, currency = 'TL') {
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

/**
 * QT-4: Form field tipini tablo kolon tipine çevir
 * @param {string} fieldType - Form field tipi
 * @returns {string} Tablo kolon tipi
 */
function mapFieldType(fieldType) {
  const typeMap = {
    'text': 'text',
    'textarea': 'text',
    'number': 'number',
    'select': 'text',
    'radio': 'text',
    'checkbox': 'boolean',
    'date': 'date',
    'email': 'email',
    'phone': 'phone',
    'currency': 'currency'
  };
  return typeMap[fieldType] || 'text';
}

export function getTableColumns(formConfig) {
  // PRE-QT4-1, PRE-QT4-2, PRE-QT4-3: Sabit Sol Kolonlar (Freeze)
  // - proj → projectName (PRE-QT4-1)
  // - name, phone, email kaldırıldı (PRE-QT4-2)
  // - width, freeze metadata eklendi (PRE-QT4-3)
  const fixedLeftColumns = [
    { id: 'date', label: 'Tarih', type: 'date', width: 140, freeze: 'left' },
    { id: 'company', label: 'Şirket', type: 'text', width: 150, freeze: 'left' },
    { id: 'projectName', label: 'Proje', type: 'text', width: 150, freeze: 'left' }
  ]

  // QT-4: Dinamik kolonları form config'den oluştur
  const dynamicColumns = [];
  const fields = formConfig?.fields || formConfig?.formStructure?.fields || [];

  const filteredAndSorted = fields
    .filter(field => field.display?.showInTable === true || field.showInTable === true)
    .sort((a, b) => {
      const orderA = a.display?.tableOrder ?? a.tableOrder ?? 999;
      const orderB = b.display?.tableOrder ?? b.tableOrder ?? 999;
      return orderA - orderB;
    });

  filteredAndSorted.forEach(field => {
    dynamicColumns.push({
      id: field.fieldCode || field.id,
      label: field.fieldName || field.label,
      type: mapFieldType(field.fieldType || field.type),
      width: 120,
      freeze: null,
      isDynamic: true  // QT-5 için önemli flag
    });
  });

  // PRE-QT4-3: Sabit Sağ Kolonlar (Freeze)
  const fixedRightColumns = [
    { id: 'price', label: 'Tahmini Fiyat', type: 'currency', width: 120, freeze: 'right' },
    { id: 'delivery_date', label: 'Termine Kalan', type: 'text', width: 110, freeze: 'right' },
    { id: 'invoiceStatus', label: 'E-Belge', type: 'invoice_status', width: 70, freeze: 'right', align: 'center' },
    { id: 'status', label: 'Durum', type: 'text', width: 100, freeze: 'right' }
  ]

  return [...fixedLeftColumns, ...dynamicColumns, ...fixedRightColumns]
}

/**
 * QT-5: Quote'un dinamik field'larının mevcut form config ile uyuşup uyuşmadığını kontrol et
 * @param {Object} quote - Quote objesi (formData içerir)
 * @param {Array} dynamicColumns - Tabloda gösterilen dinamik kolonlar
 * @returns {Object} { hasMismatch: boolean, missingFields: string[], extraFields: string[] }
 */
export function checkFieldMismatch(quote, dynamicColumns) {
  const quoteFieldCodes = Object.keys(quote?.formData || {});
  const tableFieldCodes = dynamicColumns
    .filter(col => col.isDynamic)
    .map(col => col.id);

  // Quote'ta olan ama tabloda olmayan alanlar
  const extraFields = quoteFieldCodes.filter(code => !tableFieldCodes.includes(code));

  // Tabloda olan ama quote'ta olmayan alanlar
  const missingFields = tableFieldCodes.filter(code => !quoteFieldCodes.includes(code));

  // Herhangi bir uyuşmazlık var mı?
  const hasMismatch = extraFields.length > 0 || missingFields.length > 0;

  return { hasMismatch, missingFields, extraFields };
}

export function getFieldValue(quote, fieldId, formConfig = null) {
  // QT-4: Sabit alanlar - map yapısı ile temiz erişim
  const fixedFieldMap = {
    'date': () => quote.createdAt || quote.date || '',
    'company': () => quote.customerCompany || '',
    'projectName': () => quote.projectName || '',
    'price': () => quote.finalPrice || quote.calculatedPrice || 0,
    'delivery_date': () => quote.deliveryDate || '',
    'invoiceStatus': () => {
      if (!!quote.invoiceImportedAt || quote.status === 'invoiceImported') return '3_imported';
      if (!!quote.invoiceExportedAt || quote.status === 'invoiceExported') return '2_exported';
      if (!!quote.proformaNumber || quote.status === 'proformaSent') return '1_proforma';
      return '0_none';
    },
    'status': () => quote.status || 'new'
  };

  if (fixedFieldMap[fieldId]) {
    return fixedFieldMap[fieldId]();
  }

  // Detay paneli için backward compatibility (name, phone, email)
  if (fieldId === 'name') return quote.customerName || ''
  if (fieldId === 'phone') return quote.customerPhone || ''
  if (fieldId === 'email') return quote.customerEmail || ''

  // QT-4: Dinamik alanlar - formData veya customFields'dan oku
  // PostgreSQL formatı: quote.formData = { FIELD_xxx: value, ... }
  // Legacy formatı: quote.customFields = { fieldId: value, ... }
  const rawValue = quote.formData?.[fieldId] || quote.customFields?.[fieldId] || '';

  // QT-4: Option code ise label'a çevir (dropdown, select, radio alanları için)
  if (rawValue && formConfig) {
    const fields = formConfig?.fields || formConfig?.formStructure?.fields || [];
    const field = fields.find(f => (f.fieldCode || f.id) === fieldId);

    if (field && field.options && field.options.length > 0) {
      // Option code ile eşleşen option'ı bul
      const option = field.options.find(opt =>
        opt.optionCode === rawValue || opt.value === rawValue
      );
      if (option) {
        return option.optionLabel || option.label || rawValue;
      }
      // QT-5: Eğer option bulunamazsa (eski form versiyonu) boş göster
      // Kullanıcı "Form Güncelle" ile yeni versiyona geçmeli
      if (typeof rawValue === 'string' && rawValue.startsWith('FFOC-')) {
        return '';
      }
    }
  }

  return rawValue;
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

      case 'invoiceStatus':
        const hasProforma = !!item.proformaNumber || item.status === 'proformaSent';
        const isExported = !!item.invoiceExportedAt || item.status === 'invoiceExported';
        const isImported = !!item.invoiceImportedAt || item.status === 'invoiceImported';

        if (isImported || isExported) {
          return React.createElement('div', {
            title: isImported ? 'Fatura Tamamlandı (ETTN Alındı)' : 'Fatura Kesildi (Export Edildi)',
            style: { display: 'flex', justifyContent: 'center', alignItems: 'center', width: '100%' }
          },
            React.createElement(CheckCircle, { size: 18, color: '#10b981' }) // Green
          );
        }

        if (hasProforma) {
          return React.createElement('div', {
            title: `Proforma Oluşturuldu: ${item.proformaNumber}`,
            style: { display: 'flex', justifyContent: 'center', alignItems: 'center', width: '100%' }
          },
            React.createElement(FileText, { size: 18, color: '#3b82f6' }) // Blue
          );
        }

        return React.createElement('div', {
          title: 'Belge Yok',
          style: { display: 'flex', justifyContent: 'center', alignItems: 'center', width: '100%' }
        },
          React.createElement('span', { style: { color: '#9ca3af', fontSize: '20px', lineHeight: '18px' } }, '-')
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
