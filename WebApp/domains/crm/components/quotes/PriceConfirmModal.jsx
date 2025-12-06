import React from 'react'
import { AlertTriangle } from '../../../../shared/components/Icons.jsx'

/**
 * PriceConfirmModal - D1/E2: Modal for confirming price changes after form edit
 * 
 * Shows:
 * - Changed fields list (fieldName: oldValue → newValue)
 * - Price comparison (current vs new)
 * - Price difference with color coding (green=decrease, orange=increase)
 * - Confirm/Cancel buttons
 * 
 * Used when: User edits form fields and the price calculation changes
 */
export default function PriceConfirmModal({
  isOpen,
  currentPrice = 0,
  newPrice = 0,
  priceDiff = 0,
  changedFields = [],
  onConfirm,
  onCancel,
  confirmLoading = false
}) {
  if (!isOpen) return null

  const formatPrice = (price) => {
    return parseFloat(price || 0).toLocaleString('tr-TR', { 
      minimumFractionDigits: 2, 
      maximumFractionDigits: 2 
    }) + ' ₺'
  }

  const isIncrease = priceDiff > 0

  return (
    <div style={overlayStyle}>
      <div style={modalStyle}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
          <div style={{
            width: '48px',
            height: '48px',
            borderRadius: '50%',
            background: isIncrease ? '#fef3c7' : '#dcfce7',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <AlertTriangle size={24} style={{ color: isIncrease ? '#d97706' : '#16a34a' }} />
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '600', color: '#111827' }}>
              Fiyat Değişikliği Onayı
            </h3>
            <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#6b7280' }}>
              Form değişiklikleri fiyatı etkiledi
            </p>
          </div>
        </div>
        
        {/* Changed Fields */}
        {changedFields?.length > 0 && (
          <div style={{
            background: '#f9fafb',
            borderRadius: '8px',
            padding: '12px',
            marginBottom: '16px'
          }}>
            <div style={{ fontSize: '12px', fontWeight: '600', color: '#6b7280', marginBottom: '8px' }}>
              Değişen Alanlar:
            </div>
            {changedFields.map((change, idx) => (
              <div key={idx} style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '6px 0',
                borderBottom: idx < changedFields.length - 1 ? '1px solid #e5e7eb' : 'none',
                fontSize: '13px'
              }}>
                <span style={{ color: '#374151', fontWeight: '500' }}>{change.fieldName}:</span>
                <span style={{ color: '#6b7280' }}>
                  <span style={{ textDecoration: 'line-through', marginRight: '8px' }}>{change.oldValue}</span>
                  <span style={{ color: '#16a34a', fontWeight: '500' }}>→ {change.newValue}</span>
                </span>
              </div>
            ))}
          </div>
        )}
        
        {/* Price Change */}
        <div style={{
          background: isIncrease ? '#fef3c7' : '#dcfce7',
          borderRadius: '8px',
          padding: '16px',
          marginBottom: '20px'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '13px', color: '#6b7280' }}>Mevcut Fiyat:</span>
            <span style={{ fontSize: '16px', fontWeight: '500', color: '#374151' }}>
              {formatPrice(currentPrice)}
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '13px', color: '#6b7280' }}>Yeni Fiyat:</span>
            <span style={{ fontSize: '18px', fontWeight: '600', color: isIncrease ? '#d97706' : '#16a34a' }}>
              {formatPrice(newPrice)}
            </span>
          </div>
          <div style={{
            paddingTop: '8px',
            borderTop: '1px solid rgba(0,0,0,0.1)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <span style={{ fontSize: '13px', color: '#6b7280' }}>Fark:</span>
            <span style={{
              fontSize: '14px',
              fontWeight: '600',
              color: isIncrease ? '#dc2626' : '#16a34a'
            }}>
              {isIncrease ? '+' : ''}{formatPrice(priceDiff)}
            </span>
          </div>
        </div>
        
        {/* Footer Buttons */}
        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
          <button
            onClick={onCancel}
            disabled={confirmLoading}
            style={cancelButtonStyle}
          >
            Düzenlemeye Dön
          </button>
          <button
            onClick={onConfirm}
            disabled={confirmLoading}
            style={{
              ...confirmButtonStyle,
              background: isIncrease ? '#d97706' : '#16a34a',
              opacity: confirmLoading ? 0.6 : 1,
              cursor: confirmLoading ? 'not-allowed' : 'pointer'
            }}
          >
            {confirmLoading ? 'Kaydediliyor...' : 'Onayla ve Kaydet'}
          </button>
        </div>
      </div>
    </div>
  )
}

// Styles
const overlayStyle = {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  background: 'rgba(0, 0, 0, 0.5)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1000
}

const modalStyle = {
  background: 'white',
  borderRadius: '12px',
  boxShadow: '0 25px 50px rgba(0, 0, 0, 0.25)',
  width: '100%',
  maxWidth: '500px',
  maxHeight: '90vh',
  overflow: 'auto',
  padding: '24px'
}

const cancelButtonStyle = {
  padding: '10px 20px',
  border: '1px solid #d1d5db',
  borderRadius: '6px',
  background: 'white',
  color: '#374151',
  cursor: 'pointer',
  fontSize: '14px',
  fontWeight: '500'
}

const confirmButtonStyle = {
  padding: '10px 20px',
  border: 'none',
  borderRadius: '6px',
  color: 'white',
  cursor: 'pointer',
  fontSize: '14px',
  fontWeight: '500'
}
