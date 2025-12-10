import React, { useState, useRef, useCallback } from 'react'
import { X, Upload, FileText, CheckCircle2, AlertCircle } from 'lucide-react'
import { showToast } from '../../../../../shared/components/MESToast.js'

/**
 * ImportModal - Standalone Import Modal
 * 
 * Detay panelinden import işlemi için kullanılır.
 * ExportSuccessModal'dan farklı olarak:
 * - Başarı mesajı yok (doğrudan import odaklı)
 * - Sevkiyat bilgisi gösterilir
 * - Daha önce export edilmiş olmalı uyarısı
 * 
 * Props:
 * - isOpen: boolean
 * - onClose: () => void
 * - shipment: { id, shipmentCode, status, lastExportedAt, ... }
 * - onImportComplete: (result) => void
 */
export default function ImportModal({
  isOpen,
  onClose,
  shipment,
  onImportComplete
}) {
  const [importFile, setImportFile] = useState(null)
  const [externalDocNumber, setExternalDocNumber] = useState('')
  const [isDragging, setIsDragging] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const fileInputRef = useRef(null)

  // Reset state when modal closes
  const handleClose = () => {
    setImportFile(null)
    setExternalDocNumber('')
    setIsDragging(false)
    setIsUploading(false)
    onClose?.()
  }

  // File selection handler
  const handleFileSelect = (file) => {
    if (file) {
      // Validate file type (allow common document types)
      const allowedTypes = [
        'application/pdf',
        'image/jpeg',
        'image/png',
        'application/xml',
        'text/xml',
        'text/csv',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      ]
      
      if (!allowedTypes.includes(file.type) && !file.name.match(/\.(pdf|jpg|jpeg|png|xml|csv|xls|xlsx)$/i)) {
        showToast('Desteklenmeyen dosya formatı', 'error')
        return
      }
      
      // Max 10MB
      if (file.size > 10 * 1024 * 1024) {
        showToast('Dosya boyutu 10MB\'dan büyük olamaz', 'error')
        return
      }
      
      setImportFile(file)
    }
  }

  // Drag handlers
  const handleDragEnter = useCallback((e) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }, [])

  const handleDragOver = useCallback((e) => {
    e.preventDefault()
    e.stopPropagation()
  }, [])

  const handleDrop = useCallback((e) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
    
    const files = e.dataTransfer?.files
    if (files && files.length > 0) {
      handleFileSelect(files[0])
    }
  }, [])

  // Upload import file
  const handleImportUpload = async () => {
    if (!importFile) {
      showToast('Lütfen bir dosya seçin', 'warning')
      return
    }

    if (!externalDocNumber.trim()) {
      showToast('Lütfen resmi belge numarasını girin', 'warning')
      return
    }

    setIsUploading(true)

    try {
      const formData = new FormData()
      formData.append('file', importFile)
      formData.append('externalDocNumber', externalDocNumber.trim())

      const response = await fetch(`/api/materials/shipments/${shipment.id}/import`, {
        method: 'POST',
        body: formData
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Import işlemi başarısız')
      }

      showToast('✅ Import başarılı! Stok güncellendi.', 'success')
      onImportComplete?.(result)
      handleClose()
    } catch (error) {
      console.error('Import error:', error)
      showToast(error.message || 'Import sırasında hata oluştu', 'error')
    } finally {
      setIsUploading(false)
    }
  }

  if (!isOpen) return null

  // Check if shipment can be imported
  const canImport = shipment?.status === 'exported' || shipment?.status === 'pending'
  const isAlreadyCompleted = shipment?.status === 'completed'
  const isExported = shipment?.lastExportedAt || shipment?.status === 'exported'

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div 
        className="modal-content" 
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '500px' }}
      >
        {/* Header */}
        <div className="modal-header" style={{ borderBottom: '1px solid #e5e7eb' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Upload size={24} style={{ color: '#3b82f6' }} />
            <h2 style={{ margin: 0, fontSize: '18px' }}>Import Dosyası Yükle</h2>
          </div>
          <button className="modal-close-btn" onClick={handleClose}>
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="modal-body" style={{ padding: '20px' }}>
          {/* Shipment Info */}
          <div style={{ 
            background: '#f3f4f6', 
            border: '1px solid #e5e7eb',
            borderRadius: '8px',
            padding: '12px 16px',
            marginBottom: '20px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
              <FileText size={16} style={{ color: '#6b7280' }} />
              <span style={{ fontWeight: '600', color: '#374151' }}>
                {shipment?.shipmentCode}
              </span>
            </div>
            <div style={{ fontSize: '13px', color: '#6b7280', marginLeft: '24px' }}>
              {shipment?.customerCompany || shipment?.customerName || 'Müşteri bilgisi yok'}
            </div>
            {isExported && (
              <div style={{ 
                fontSize: '12px', 
                color: '#059669', 
                marginLeft: '24px',
                marginTop: '4px',
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
              }}>
                <CheckCircle2 size={12} />
                Export edildi
                {shipment?.lastExportedAt && (
                  <span>
                    ({new Date(shipment.lastExportedAt).toLocaleDateString('tr-TR')})
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Already Completed Warning */}
          {isAlreadyCompleted && (
            <div style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '8px',
              padding: '12px 14px',
              background: '#fef2f2',
              border: '1px solid #fecaca',
              borderRadius: '8px',
              marginBottom: '20px'
            }}>
              <AlertCircle size={18} style={{ color: '#dc2626', flexShrink: 0, marginTop: '1px' }} />
              <div>
                <p style={{ margin: '0 0 4px 0', fontWeight: '500', color: '#991b1b' }}>
                  Bu sevkiyat zaten tamamlanmış
                </p>
                <p style={{ margin: 0, fontSize: '13px', color: '#b91c1c' }}>
                  Tamamlanmış sevkiyatlara tekrar import yapılamaz.
                </p>
              </div>
            </div>
          )}

          {/* Import Section - Only if not completed */}
          {!isAlreadyCompleted && (
            <>
              <div style={{ marginBottom: '16px' }}>
                <p style={{ 
                  fontSize: '14px', 
                  color: '#374151',
                  marginBottom: '16px'
                }}>
                  Logo/Zirve'den aldığınız onay dosyasını yükleyin:
                </p>

                {/* File Drop Zone */}
                <div
                  onDragEnter={handleDragEnter}
                  onDragLeave={handleDragLeave}
                  onDragOver={handleDragOver}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  style={{
                    border: `2px dashed ${isDragging ? '#3b82f6' : importFile ? '#10b981' : '#d1d5db'}`,
                    borderRadius: '8px',
                    padding: '24px',
                    textAlign: 'center',
                    cursor: 'pointer',
                    background: isDragging ? '#eff6ff' : importFile ? '#f0fdf4' : '#f9fafb',
                    transition: 'all 0.2s ease'
                  }}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png,.xml,.csv,.xls,.xlsx"
                    onChange={(e) => handleFileSelect(e.target.files?.[0])}
                    style={{ display: 'none' }}
                  />
                  
                  {importFile ? (
                    <div>
                      <CheckCircle2 size={32} style={{ color: '#10b981', marginBottom: '8px' }} />
                      <p style={{ margin: '0 0 4px 0', fontWeight: '500', color: '#166534' }}>
                        {importFile.name}
                      </p>
                      <p style={{ margin: 0, fontSize: '12px', color: '#6b7280' }}>
                        {(importFile.size / 1024).toFixed(1)} KB
                      </p>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          setImportFile(null)
                        }}
                        style={{
                          marginTop: '8px',
                          padding: '4px 12px',
                          fontSize: '12px',
                          color: '#6b7280',
                          background: 'white',
                          border: '1px solid #d1d5db',
                          borderRadius: '4px',
                          cursor: 'pointer'
                        }}
                      >
                        Değiştir
                      </button>
                    </div>
                  ) : (
                    <div>
                      <Upload size={32} style={{ color: '#9ca3af', marginBottom: '8px' }} />
                      <p style={{ margin: '0 0 4px 0', fontWeight: '500', color: '#374151' }}>
                        Dosya Seç veya Sürükle
                      </p>
                      <p style={{ margin: 0, fontSize: '12px', color: '#9ca3af' }}>
                        PDF, JPG, PNG, XML, CSV, XLS (Max 10MB)
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* External Document Number */}
              <div style={{ marginBottom: '16px' }}>
                <label style={{ 
                  display: 'block', 
                  fontSize: '13px', 
                  fontWeight: '500',
                  color: '#374151',
                  marginBottom: '6px'
                }}>
                  Resmi Belge No <span style={{ color: '#dc2626' }}>*</span>
                </label>
                <input
                  type="text"
                  value={externalDocNumber}
                  onChange={(e) => setExternalDocNumber(e.target.value)}
                  placeholder="Örn: A-2025-001234"
                  className="mes-filter-input"
                  style={{ width: '100%' }}
                />
                <p style={{ 
                  margin: '4px 0 0 0', 
                  fontSize: '12px', 
                  color: '#6b7280' 
                }}>
                  Logo/Zirve'den aldığınız fatura veya irsaliye numarası
                </p>
              </div>

              {/* Warning Note */}
              <div style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '8px',
                padding: '10px 12px',
                background: '#fef3c7',
                border: '1px solid #fcd34d',
                borderRadius: '6px',
                fontSize: '12px',
                color: '#92400e'
              }}>
                <AlertCircle size={16} style={{ flexShrink: 0, marginTop: '1px' }} />
                <span>
                  Import tamamlandığında stok otomatik olarak düşürülecektir.
                </span>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="modal-footer" style={{ 
          display: 'flex', 
          justifyContent: 'flex-end', 
          gap: '10px',
          padding: '16px 20px',
          borderTop: '1px solid #e5e7eb'
        }}>
          <button
            type="button"
            className="mes-filter-button"
            onClick={handleClose}
          >
            {isAlreadyCompleted ? 'Kapat' : 'İptal'}
          </button>
          {!isAlreadyCompleted && (
            <button
              type="button"
              className="mes-primary-action"
              onClick={handleImportUpload}
              disabled={!importFile || !externalDocNumber.trim() || isUploading}
            >
              {isUploading ? (
                <>
                  <span className="spinner-sm"></span>
                  Yükleniyor...
                </>
              ) : (
                <>
                  <Upload size={16} />
                  Import & Tamamla
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
