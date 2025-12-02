import React from 'react'
import { AlertCircle, Lock, ArrowLeft, Check } from '../../../../shared/components/Icons.jsx'

/**
 * QuoteEditLockBanner - Displays edit lock status for quotes with work orders
 * 
 * Props:
 * - editStatus: Object with { canEdit, reason, warning, workOrderCode, productionState, completedNodes, totalNodes }
 * - onViewWorkOrder: Optional callback to navigate to work order
 */
export default function QuoteEditLockBanner({ editStatus, onViewWorkOrder }) {
  if (!editStatus) return null
  
  // No banner needed if fully editable without any warnings
  if (editStatus.canEdit && !editStatus.warning) return null
  
  const isLocked = !editStatus.canEdit
  const hasWarning = editStatus.warning === 'wo_exists'
  
  // Determine banner type and content
  let bannerType = 'warning' // yellow
  let icon = <AlertCircle size={18} />
  let title = ''
  let message = ''
  
  if (isLocked) {
    switch (editStatus.reason) {
      case 'production_completed':
        // Green banner for completed production
        bannerType = 'success'
        icon = <Check size={18} />
        title = 'Üretim Tamamlandı'
        message = `Bu teklif için üretim tamamlandı. İş emri: ${editStatus.workOrderCode || 'N/A'}`
        break
      case 'production_in_progress':
        // Red banner for in-progress production
        bannerType = 'error'
        icon = <Lock size={18} />
        title = 'Düzenleme Kilitli'
        message = `Bu teklif için üretim başlatıldı. İş emri: ${editStatus.workOrderCode || 'N/A'}`
        break
      case 'wo_launched':
        bannerType = 'error'
        icon = <Lock size={18} />
        title = 'Düzenleme Kilitli'
        message = `Bu teklif için üretim başlatıldı. İş emri: ${editStatus.workOrderCode || 'N/A'}`
        break
      case 'wo_in_production':
        bannerType = 'error'
        icon = <Lock size={18} />
        title = 'Düzenleme Kilitli'
        message = `Bu teklif için üretim başlatıldı. İş emri: ${editStatus.workOrderCode || 'N/A'}`
        break
      case 'wo_completed':
        bannerType = 'success'
        icon = <Check size={18} />
        title = 'Üretim Tamamlandı'
        message = `Bu teklif için üretim tamamlandı. İş emri: ${editStatus.workOrderCode || 'N/A'}`
        break
      case 'not_found':
        bannerType = 'error'
        icon = <Lock size={18} />
        title = 'Teklif Bulunamadı'
        message = 'Bu teklif sistemde bulunamadı.'
        break
      default:
        bannerType = 'error'
        icon = <Lock size={18} />
        title = 'Düzenleme Kilitli'
        message = editStatus.reason || 'Bu teklif düzenlenemez.'
    }
  } else if (hasWarning) {
    bannerType = 'warning'
    title = 'Dikkat: İş Emri Mevcut'
    message = `Bu teklife bağlı bir iş emri var (${editStatus.workOrderCode || 'N/A'}). Düzenleme yapılabilir ancak dikkatli olunuz.`
  }
  
  // Production state info with progress
  const productionStateLabel = {
    'pending': 'Beklemede',
    'in_progress': 'Üretimde',
    'Beklemede': 'Beklemede',
    'Üretiliyor': 'Üretimde',
    'Tamamlandı': 'Tamamlandı',
    'completed': 'Tamamlandı'
  }
  
  const stateText = editStatus.productionState 
    ? productionStateLabel[editStatus.productionState] || editStatus.productionState 
    : null
  
  // Show progress if available
  const progressText = (editStatus.totalNodes && editStatus.totalNodes > 0)
    ? ` (${editStatus.completedNodes || 0}/${editStatus.totalNodes} iş paketi)`
    : ''

  return (
    <div className={`quote-edit-lock-banner ${bannerType}`}>
      <div className="banner-icon">
        {icon}
      </div>
      <div className="banner-content">
        <div className="banner-title">{title}</div>
        <div className="banner-message">{message}</div>
        {stateText && (
          <div className="banner-state">
            Üretim Durumu: <strong>{stateText}{progressText}</strong>
          </div>
        )}
      </div>
      {editStatus.workOrderCode && onViewWorkOrder && (
        <button 
          className="banner-action"
          onClick={() => onViewWorkOrder(editStatus.workOrderCode)}
          title="İş Emrini Görüntüle"
        >
          <ArrowLeft size={14} style={{ transform: 'rotate(180deg)' }} />
          <span>İş Emri</span>
        </button>
      )}
    </div>
  )
}
