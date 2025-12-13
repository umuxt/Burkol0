import React, { useState, useRef, useCallback } from 'react'
import { X, CheckCircle2, Download, Upload, FileText, Info } from 'lucide-react'
import { showToast } from '../../../../../shared/components/MESToast.js'

/**
 * ExportSuccessModal - Export Başarılı Modal
 * 
 * 6.5 tasarımına göre:
 * - Başarı mesajı
 * - İndirilen dosya bilgisi
 * - Import file upload alanı (drag & drop)
 * - Resmi belge no input
 * - "Şimdi Değil" ve "Dosya Yükle & Tamamla" butonları
 * 
 * Props:
 * - isOpen: boolean
 * - onClose: () => void
 * - shipment: { id, shipmentCode, ... }
 * - exportedFiles: [{ format, filename }]
 * - onImportComplete: (result) => void
 */
export default function ExportSuccessModal({
  isOpen,
  onClose,
  shipment,
  exportedFiles = [],
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

      const token = localStorage.getItem('bp_admin_token');
      const response = await fetch(`/api/materials/shipments/${shipment.id}/import`, {
        method: 'POST',
        headers: token ? { 'Authorization': `Bearer ${token}` } : {},
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
            <CheckCircle2 size={24} className="text-success" style={{ color: '#10b981' }} />
            <h2 style={{ margin: 0, fontSize: '18px' }}>Export Başarılı!</h2>
          </div>
          <button className="modal-close-btn" onClick={handleClose}>
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="modal-body" style={{ padding: '20px' }}>
          {/* Downloaded Files Info */}
          <div style={{ 
            background: '#f0fdf4', 
            border: '1px solid #bbf7d0',
            borderRadius: '8px',
            padding: '12px 16px',
            marginBottom: '20px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <Download size={16} style={{ color: '#16a34a' }} />
              <span style={{ fontWeight: '500', color: '#166534' }}>
                Dosya{exportedFiles.length > 1 ? 'lar' : ''} indirildi
              </span>
            </div>
            {exportedFiles.map((file, idx) => (
              <div key={idx} style={{ 
                fontSize: '13px', 
                color: '#15803d',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                marginLeft: '24px'
              }}>
                <FileText size={14} />
                {file.filename || `${shipment?.shipmentCode}.${file.format}`}
              </div>
            ))}
          </div>

          {/* Import Section */}
          <div style={{ marginBottom: '16px' }}>
            <p style={{ 
              fontSize: '14px', 
              color: '#374151',
              marginBottom: '16px'
            }}>
              Logo/Zirve'den işlem tamamlandıktan sonra onay dosyasını yükleyebilirsiniz:
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
              Resmi Belge No
            </label>
            <input
              type="text"
              value={externalDocNumber}
              onChange={(e) => setExternalDocNumber(e.target.value)}
              placeholder="Örn: A-2025-001234"
              className="mes-filter-input"
              style={{ width: '100%' }}
            />
          </div>

          {/* Info Note */}
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
            <Info size={16} style={{ flexShrink: 0, marginTop: '1px' }} />
            <span>
              Daha sonra: <strong>Sevkiyatlar &gt; {shipment?.shipmentCode} &gt; Import</strong>
            </span>
          </div>
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
            Şimdi Değil
          </button>
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
                Dosya Yükle & Tamamla
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
