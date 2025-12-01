/**
 * Order CSV Export Utilities
 * Siparişleri CSV formatında dışa aktarma işlemleri
 */

/**
 * Teslimat durumu özet metnini hesaplar
 */
function computeDeliverySummary(order) {
  const today = new Date()
  const deliveryDate = order.expectedDeliveryDate ? new Date(order.expectedDeliveryDate) : null
  let status = 'hesaplanıyor'
  let daysRemaining = 0
  
  if (deliveryDate && !isNaN(deliveryDate.getTime())) {
    const diff = deliveryDate.getTime() - today.getTime()
    daysRemaining = Math.ceil(diff / (1000 * 3600 * 24))
    if (order.orderStatus === 'Teslim Edildi') status = 'teslim-edildi'
    else if (daysRemaining < 0) status = 'gecikmiş'
    else if (daysRemaining === 0) status = 'bugün-teslim'
    else if (daysRemaining <= 7) status = 'bu-hafta-teslim'
    else status = 'zamanında'
  }
  
  switch (status) {
    case 'bugün-teslim': return 'Bugün Teslim'
    case 'bu-hafta-teslim': return `${daysRemaining} gün kaldı`
    case 'gecikmiş': return `${Math.abs(daysRemaining)} gün gecikti`
    case 'zamanında': return 'Zamanında'
    case 'erken': return 'Erken teslim'
    case 'teslim-edildi': return 'Teslim edildi'
    default: return 'Teslimat tarihi belirsiz'
  }
}

/**
 * Siparişleri CSV formatında dışa aktarır
 * @param {Array} orders - Dışa aktarılacak siparişler
 * @param {Object} options - Export seçenekleri
 * @param {boolean} options.includeStatusCol - Durum sütunu dahil edilsin mi
 * @param {string} options.tabName - Tab ismi (dosya adı için)
 * @param {boolean} options.isSelected - Seçili siparişler mi
 */
export function exportOrdersToCSV(orders, options = {}) {
  const { 
    includeStatusCol = true, 
    tabName = 'all',
    isSelected = false 
  } = options

  // Delimiter: Excel/TR çoğunlukla ';' bekler
  const userLocale = (typeof navigator !== 'undefined' ? navigator.language : 'tr-TR') || 'tr-TR'
  const delimiter = /^tr(-|_)/i.test(userLocale) ? ';' : ','

  const escapeCSV = (val) => {
    const s = (val ?? '').toString()
    const needsQuote = new RegExp(`["\n${delimiter === ';' ? ';' : ','}]`)
    if (needsQuote.test(s)) {
      return '"' + s.replace(/"/g, '""') + '"'
    }
    return s
  }

  // Determine max item count across export set
  const maxItemCount = (orders || []).reduce((max, o) => {
    const c = Array.isArray(o.items) ? o.items.length : 0
    return Math.max(max, c)
  }, 0)

  // Group header (row 1) – emulate merged cells by repeating group labels
  const headerRow1Parts = [
    'Sipariş Bilgileri', // Sipariş Kodu
    '',                   // Sipariş ID
    '',                   // Sipariş Tarihi
    'Tedarikçi',          // Tedarikçi Kodu/ID
    '',                   // Tedarikçi Adı
    'Teslimat',           // Beklenen
    '',                   // Gerçekleşen
    'Teslimat Durumu',    // Özet
    'Özet',               // Satır Sayısı
    '',                   // placeholder (align)
    'Sipariş Toplamı',    // Para Birimi
    ''                    // Toplam Tutar
  ]
  if (includeStatusCol) headerRow1Parts.push('')
  for (let i = 1; i <= maxItemCount; i++) {
    headerRow1Parts.push(`Satır ${i}`, '', '', '', '', '')
  }

  // Detail header (row 2)
  const headerRow2Parts = [
    'Sipariş Kodu',
    'Sipariş ID',
    'Sipariş Tarihi',
    'Tedarikçi Kodu/ID',
    'Tedarikçi Adı',
    'Beklenen Teslim Tarihi',
    'Gerçekleşen Teslim Tarihi',
    'Teslimat Durumu (Özet)',
    'Satır Sayısı',
    '',
    'Para Birimi',
    'Toplam Tutar'
  ]
  if (includeStatusCol) headerRow2Parts.push('Sipariş Durumu')
  for (let i = 1; i <= maxItemCount; i++) {
    headerRow2Parts.push(
      `Satır ${i} Malzeme ID`,
      `Satır ${i} Malzeme Adı`,
      `Satır ${i} Miktar`,
      `Satır ${i} Birim Fiyat`,
      `Satır ${i} Para Birimi`,
      `Satır ${i} Satır Tutar`
    )
  }

  const rows = orders.map(order => {
    const items = Array.isArray(order.items) ? order.items : []
    const orderDate = order.orderDate ? (order.orderDate instanceof Date ? order.orderDate : new Date(order.orderDate)) : null
    const expected = order.expectedDeliveryDate ? (order.expectedDeliveryDate instanceof Date ? order.expectedDeliveryDate : new Date(order.expectedDeliveryDate)) : null
    const actual = order.deliveryDate ? (order.deliveryDate instanceof Date ? order.deliveryDate : new Date(order.deliveryDate)) : null
    const currency = (order.currency || 'TRY')
    const total = Number(order.totalPrice || order.totalAmount || 0)

    const base = [
      order.orderCode || '',
      order.id || '',
      orderDate ? orderDate.toLocaleDateString(userLocale) : '',
      order.supplierId || order.supplierCode || '',
      order.supplierName || '',
      expected ? expected.toLocaleDateString(userLocale) : '',
      actual ? actual.toLocaleDateString(userLocale) : '',
      computeDeliverySummary(order),
      items.length,
      '',
      currency,
      total
    ]
    if (includeStatusCol) base.push(order.orderStatus || '')
    
    // Append per-line dynamic columns normalized to maxItemCount
    for (let i = 0; i < maxItemCount; i++) {
      const it = items[i]
      if (it) {
        const code = it.materialCode || it.itemCode || it.lineId || ''
        const name = it.materialName || ''
        const qty = it.quantity != null ? Number(it.quantity) : ''
        const unitPrice = it.unitPrice != null ? Number(it.unitPrice) : ''
        const lineCurrency = it.currency || currency || 'TRY'
        const lineTotal = (it.quantity != null && it.unitPrice != null)
          ? Number(it.quantity) * Number(it.unitPrice)
          : ''
        base.push(code, name, qty, unitPrice, lineCurrency, lineTotal)
      } else {
        base.push('', '', '', '', '', '')
      }
    }
    return base.map(escapeCSV).join(delimiter)
  })

  const headerRow1 = headerRow1Parts.map(escapeCSV).join(delimiter)
  const headerRow2 = headerRow2Parts.map(escapeCSV).join(delimiter)
  const csv = ['\uFEFF' + headerRow1, headerRow2, ...rows].join('\n') // UTF-8 BOM ile Excel uyumu
  
  // Download
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  const suffix = isSelected ? '-selected' : ''
  a.href = url
  a.download = `orders-${tabName}${suffix}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export default { exportOrdersToCSV }
