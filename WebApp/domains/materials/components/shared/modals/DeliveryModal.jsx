import React from 'react'

/**
 * DeliveryModal - Material delivery modal with lot tracking support
 * 
 * Used for recording material deliveries with optional lot tracking fields:
 * - Supplier lot/batch code
 * - Manufacturing date
 * - Expiry date
 * 
 * @param {Object} props
 * @param {boolean} props.open - Whether modal is open
 * @param {Object} props.item - Delivery item data { item: { materialName, materialCode, quantity, unit }, orderId }
 * @param {Object} props.formData - Form state { actualDeliveryDate, supplierLotCode, manufacturingDate, expiryDate, notes }
 * @param {Function} props.onFormChange - Form change handler
 * @param {Function} props.onClose - Close modal handler
 * @param {Function} props.onSubmit - Submit delivery handler
 * @param {boolean} props.loading - Loading state
 * @param {boolean} props.lotTrackingEnabled - Whether lot tracking fields should be shown
 * @param {Function} props.getLocalDateString - Helper function for today's date
 * @param {Function} props.getTomorrowDateString - Helper function for tomorrow's date
 */
export default function DeliveryModal({
  open,
  item,
  formData,
  onFormChange,
  onClose,
  onSubmit,
  loading = false,
  lotTrackingEnabled = false,
  getLocalDateString,
  getTomorrowDateString
}) {
  if (!open || !item) return null

  // Format quantity for display
  const formatQuantity = () => {
    const qty = parseFloat(item.item?.quantity) || 0
    return Number.isInteger(qty) ? qty : qty.toFixed(2).replace(/\.?0+$/, '')
  }

  return (
    <div
      className="modal-overlay-center"
      onClick={() => !loading && onClose()}
    >
      <div
        className="modal-box"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="modal-header-section">
          <h2 className="modal-title">
            📦 Malzeme Teslim Al
          </h2>
          <div className="modal-subtitle">
            <div><strong>Malzeme:</strong> {item.item?.materialName} ({item.item?.materialCode})</div>
            <div><strong>Miktar:</strong> {formatQuantity()} {item.item?.unit || 'adet'}</div>
          </div>
        </div>
        
        {/* Form Fields */}
        <div className="modal-form-fields">
          {/* Delivery Date */}
          <div>
            <label className="supplier-label-block-sm">
              Teslim Tarihi <span className="text-required">*</span>
            </label>
            <input
              type="date"
              className="mes-filter-input w-full"
              value={formData.actualDeliveryDate}
              onChange={(e) => onFormChange({ ...formData, actualDeliveryDate: e.target.value })}
              max={getLocalDateString?.() || ''}
              required
              disabled={loading}
            />
          </div>
          
          {/* 📦 LOT TRACKING FIELDS - Only show when lot tracking is enabled */}
          {lotTrackingEnabled && (
            <>
              {/* Supplier Lot Code */}
              <div>
                <label className="supplier-label-block-sm">
                  Tedarikçi Lot/Batch Kodu <span className="text-xs-muted">(opsiyonel)</span>
                </label>
                <input
                  type="text"
                  className="mes-filter-input w-full"
                  placeholder="Örn: BATCH-2025-001"
                  value={formData.supplierLotCode}
                  onChange={(e) => onFormChange({ ...formData, supplierLotCode: e.target.value })}
                  maxLength={100}
                  disabled={loading}
                />
              </div>
              
              {/* Manufacturing Date */}
              <div>
                <label className="supplier-label-block-sm">
                  Üretim Tarihi <span className="text-xs-muted">(opsiyonel)</span>
                </label>
                <input
                  type="date"
                  className="mes-filter-input w-full"
                  value={formData.manufacturingDate}
                  onChange={(e) => onFormChange({ ...formData, manufacturingDate: e.target.value })}
                  max={getLocalDateString?.() || ''}
                  disabled={loading}
                />
                <small className="text-hint-block">
                  Üretim tarihi bugünden ileri olamaz
                </small>
              </div>
              
              {/* Expiry Date */}
              <div>
                <label className="supplier-label-block-sm">
                  Son Kullanma Tarihi <span className="text-xs-muted">(opsiyonel)</span>
                </label>
                <input
                  type="date"
                  className="mes-filter-input w-full"
                  value={formData.expiryDate}
                  onChange={(e) => onFormChange({ ...formData, expiryDate: e.target.value })}
                  min={getTomorrowDateString?.() || ''}
                  disabled={loading}
                />
                <small className="text-hint-block">
                  Son kullanma tarihi bugünden sonra olmalıdır
                </small>
              </div>
              
              {/* Info Message */}
              <div className="modal-info-box">
                <strong>ℹ️ Bilgi:</strong> Lot numarası otomatik olarak oluşturulacaktır.<br />
                Format: <code className="modal-info-code">LOT-{'{'}malzeme_kodu{'}'}-{'{'}YYYYMMDD{'}'}-{'{'}sıra{'}'}</code>
              </div>
            </>
          )}
          
          {/* Notes - Always visible */}
          <div>
            <label className="supplier-label-block-sm">
              Notlar <span className="text-xs-muted">(opsiyonel)</span>
            </label>
            <textarea
              className="mes-filter-input w-full textarea-resize-v"
              placeholder="Teslimata dair ek notlar..."
              value={formData.notes}
              onChange={(e) => onFormChange({ ...formData, notes: e.target.value })}
              rows={3}
              disabled={loading}
            />
          </div>
        </div>
        
        {/* Action Buttons */}
        <div className="modal-actions-footer">
          <button
            className="mes-filter-button px-16-py-8"
            onClick={onClose}
            disabled={loading}
          >
            İptal
          </button>
          <button
            className="mes-primary-action px-16-py-8"
            onClick={onSubmit}
            disabled={loading || !formData.actualDeliveryDate}
          >
            {loading ? '⏳ Kaydediliyor...' : '✅ Teslimi Kaydet'}
          </button>
        </div>
      </div>
    </div>
  )
}
