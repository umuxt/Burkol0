/**
 * Material Status Utilities
 * Tedarikçi-Malzeme statü yönetimi için utility fonksiyonları
 */

/**
 * Tedarikçi statüleri
 */
export const SUPPLIER_STATUSES = {
  ACTIVE: 'Aktif',
  INACTIVE: 'Pasif', 
  PENDING: 'Onay Bekliyor',
  SUSPENDED: 'Askıda'
}

/**
 * Malzeme statüleri
 */
export const MATERIAL_STATUSES = {
  ACTIVE: 'Aktif',
  INACTIVE: 'Pasif',
  UNDER_REVIEW: 'Değerlendirmede'
}

/**
 * Statüyü normalize eder (küçük harf -> büyük harf)
 */
const normalizeStatus = (status) => {
  if (!status) return null
  
  const statusMap = {
    // Malzeme statüleri
    'aktif': MATERIAL_STATUSES.ACTIVE,
    'pasif': MATERIAL_STATUSES.INACTIVE, 
    'değerlendirmede': MATERIAL_STATUSES.UNDER_REVIEW,
    
    // Tedarikçi statüleri
    'Aktif': SUPPLIER_STATUSES.ACTIVE,
    'Pasif': SUPPLIER_STATUSES.INACTIVE,
    'Onay Bekliyor': SUPPLIER_STATUSES.PENDING,
    'Askıda': SUPPLIER_STATUSES.SUSPENDED
  }
  
  return statusMap[status] || status
}

/**
 * Malzemenin effective statüsünü hesaplar
 * İş Kuralı:
 * - Tedarikçi "Aktif" ise → malzemenin kendi statüsü
 * - Tedarikçi "Aktif değil" ise → tedarikçinin statüsü
 * 
 * @param {Object} material - Malzeme objesi
 * @param {Object} supplier - Tedarikçi objesi  
 * @param {Object} suppliedMaterial - Tedarikçi-malzeme ilişki objesi (opsiyonel)
 * @returns {Object} { status, source, color, displayText }
 */
export const getEffectiveMaterialStatus = (material, supplier, suppliedMaterial = null) => {
  // Normalize statuses
  const normalizedSupplierStatus = normalizeStatus(supplier.status)
  
  // Tedarikçi aktif değilse, tedarikçi statüsünü kullan
  if (normalizedSupplierStatus !== SUPPLIER_STATUSES.ACTIVE) {
    return {
      status: normalizedSupplierStatus,
      source: 'supplier',
      color: getStatusColor(normalizedSupplierStatus),
      displayText: normalizedSupplierStatus,
      tooltip: `Bu statü tedarikçi durumundan kaynaklanıyor (${supplier.name || supplier.companyName})`
    }
  }
  
  // Tedarikçi aktifse, malzeme statüsünü kullan
  // Önce suppliedMaterial'dan, sonra genel material'dan al
  const rawMaterialStatus = suppliedMaterial?.status || material.status || 'aktif'
  const normalizedMaterialStatus = normalizeStatus(rawMaterialStatus) || MATERIAL_STATUSES.ACTIVE
  
  return {
    status: normalizedMaterialStatus,
    source: 'material', 
    color: getStatusColor(normalizedMaterialStatus),
    displayText: normalizedMaterialStatus,
    tooltip: `Bu statü malzemenin kendi durumu`
  }
}

/**
 * Statüye göre renk kodunu döndürür
 * @param {string} status - Statü
 * @returns {Object} { background, color, borderColor }
 */
export const getStatusColor = (status) => {
  const colorMap = {
    // Malzeme statüleri
    [MATERIAL_STATUSES.ACTIVE]: {
      background: '#dcfce7', // açık yeşil
      color: '#166534',       // koyu yeşil
      borderColor: '#16a34a'  // orta yeşil
    },
    [MATERIAL_STATUSES.INACTIVE]: {
      background: '#fecaca',  // açık kırmızı
      color: '#991b1b',       // koyu kırmızı  
      borderColor: '#dc2626'  // orta kırmızı
    },
    [MATERIAL_STATUSES.UNDER_REVIEW]: {
      background: '#fef3c7',  // açık sarı
      color: '#92400e',       // koyu turuncu
      borderColor: '#f59e0b'  // orta turuncu
    },
    
    // Tedarikçi statüleri
    [SUPPLIER_STATUSES.ACTIVE]: {
      background: '#dcfce7',
      color: '#166534', 
      borderColor: '#16a34a'
    },
    [SUPPLIER_STATUSES.INACTIVE]: {
      background: '#fecaca',
      color: '#991b1b',
      borderColor: '#dc2626'
    },
    [SUPPLIER_STATUSES.PENDING]: {
      background: '#ede9fe',  // açık mor
      color: '#581c87',       // koyu mor
      borderColor: '#8b5cf6'  // orta mor
    },
    [SUPPLIER_STATUSES.SUSPENDED]: {
      background: '#f3f4f6',  // açık gri
      color: '#374151',       // koyu gri
      borderColor: '#6b7280'  // orta gri
    }
  }
  
  return colorMap[status] || colorMap[MATERIAL_STATUSES.INACTIVE] // varsayılan kırmızı
}

/**
 * Statü badge component için props oluşturur
 * @param {Object} effectiveStatus - getEffectiveMaterialStatus sonucu
 * @param {Object} options - Ek seçenekler (size, showTooltip vs.)
 * @returns {Object} Badge props
 */
export const createStatusBadgeProps = (effectiveStatus, options = {}) => {
  const { size = 'small', showTooltip = true, showIcon = false } = options
  const colors = effectiveStatus.color
  
  const props = {
    style: {
      backgroundColor: colors.background,
      color: colors.color,
      border: `1px solid ${colors.borderColor}`,
      padding: size === 'small' ? '1px 4px' : '2px 6px',
      borderRadius: '3px',
      fontSize: size === 'small' ? '10px' : '11px',
      fontWeight: '500',
      display: 'inline-flex',
      alignItems: 'center',
      gap: '2px'
    },
    children: effectiveStatus.displayText
  }
  
  if (showTooltip) {
    props.title = effectiveStatus.tooltip
  }
  
  if (showIcon) {
    const iconMap = {
      supplier: '🏢',
      material: '📦'
    }
    props.children = `${iconMap[effectiveStatus.source]} ${effectiveStatus.displayText}`
  }
  
  return props
}

/**
 * Çoklu tedarikçi durumunda malzemenin genel statüsünü hesaplar
 * @param {Object} material - Malzeme objesi
 * @param {Array} suppliers - Malzemeyi tedarik eden tedarikçiler listesi
 * @returns {Object} Genel effective status
 */
export const getOverallMaterialStatus = (material, suppliers = []) => {
  if (!suppliers.length) {
    return {
      status: material.status || MATERIAL_STATUSES.INACTIVE,
      source: 'material',
      color: getStatusColor(material.status || MATERIAL_STATUSES.INACTIVE),
      displayText: material.status || MATERIAL_STATUSES.INACTIVE,
      tooltip: 'Tedarikçi bulunmuyor'
    }
  }
  
  // En az bir aktif tedarikçi varsa, malzeme statüsünü kullan
  const hasActiveSupplier = suppliers.some(s => s.status === SUPPLIER_STATUSES.ACTIVE)
  
  if (hasActiveSupplier) {
    return {
      status: material.status || MATERIAL_STATUSES.ACTIVE,
      source: 'material',
      color: getStatusColor(material.status || MATERIAL_STATUSES.ACTIVE),
      displayText: material.status || MATERIAL_STATUSES.ACTIVE,
      tooltip: 'En az bir aktif tedarikçi var'
    }
  }
  
  // Tüm tedarikçiler aktif değilse, en kötü durumu göster
  const worstStatus = suppliers.reduce((worst, supplier) => {
    const statusPriority = {
      [SUPPLIER_STATUSES.SUSPENDED]: 4,
      [SUPPLIER_STATUSES.INACTIVE]: 3, 
      [SUPPLIER_STATUSES.PENDING]: 2,
      [SUPPLIER_STATUSES.ACTIVE]: 1
    }
    
    if (statusPriority[supplier.status] > statusPriority[worst]) {
      return supplier.status
    }
    return worst
  }, SUPPLIER_STATUSES.ACTIVE)
  
  return {
    status: worstStatus,
    source: 'supplier',
    color: getStatusColor(worstStatus),
    displayText: worstStatus,
    tooltip: 'Tüm tedarikçiler aktif değil'
  }
}