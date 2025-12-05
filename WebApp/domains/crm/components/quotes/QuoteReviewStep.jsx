import React from 'react'
import { uid, readFileAsDataUrl, ACCEPT_EXT, MAX_FILES, MAX_FILE_MB, MAX_PRODUCT_FILES } from '../../../../shared/lib/utils.js'
import { showToast } from '../../../../shared/components/MESToast.js'
import { User, FileEdit, Pencil, Calendar, FileText, Paperclip, FolderOpen, Image, MessageSquare, X } from '../../../../shared/components/Icons.jsx'

/**
 * QuoteReviewStep - Step 3: Review and submit
 * 
 * Shows summary of all data entered in previous steps:
 * - Customer information
 * - Form data
 * - Files upload
 * - Notes
 * 
 * @param {Object} customerStepData - Step 1 data (customerType, selectedCustomer, customerData, deliveryDate)
 * @param {Object} formData - Step 2 form field values
 * @param {Object} formConfig - Form template configuration
 * @param {Array} techFiles - Technical files
 * @param {Array} prodImgs - Product images
 * @param {string} notes - Notes text
 * @param {Function} onFilesChange - Callback for file changes
 * @param {Function} onNotesChange - Callback for notes change
 * @param {Function} onEditStep - Callback to go back to specific step
 * @param {Function} t - Translation function
 */
export default function QuoteReviewStep({
  customerStepData,
  formData,
  formConfig,
  techFiles = [],
  prodImgs = [],
  notes = '',
  onFilesChange,
  onNotesChange,
  onEditStep,
  t
}) {
  const { customerType, selectedCustomer, customerData, deliveryDate } = customerStepData || {}
  const displayCustomer = customerData || selectedCustomer || {}
  const formFields = formConfig?.formStructure?.fields || formConfig?.fields || []

  // Get customer type label
  function getCustomerTypeLabel(type) {
    switch (type) {
      case 'existing': return 'Mevcut Müşteri'
      case 'new': return 'Yeni Müşteri'
      case 'without': return 'Müşterisiz'
      default: return '-'
    }
  }

  // Format display value
  function formatValue(value) {
    if (value === null || value === undefined || value === '') return '-'
    if (Array.isArray(value)) return value.join(', ')
    return value
  }

  // Format file size
  function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  }

  // Handle file upload
  async function handleFileUpload(e, type = 'tech') {
    const files = Array.from(e.target.files)
    if (files.length === 0) return

    const maxFiles = type === 'tech' ? MAX_FILES : MAX_PRODUCT_FILES
    const currentFiles = type === 'tech' ? techFiles : prodImgs
    const currentCount = currentFiles.length

    if (currentCount + files.length > maxFiles) {
      showToast(`Maksimum ${maxFiles} dosya yükleyebilirsiniz`, 'error')
      return
    }

    try {
      const uploadPromises = files.map(async (file) => {
        if (file.size > MAX_FILE_MB * 1024 * 1024) {
          throw new Error(`${file.name} çok büyük (max ${MAX_FILE_MB}MB)`)
        }

        const dataUrl = await readFileAsDataUrl(file)
        return {
          id: uid(),
          name: file.name,
          url: dataUrl,
          type: file.type,
          size: file.size,
          uploadedAt: new Date().toISOString()
        }
      })

      const uploadedFiles = await Promise.all(uploadPromises)

      if (type === 'tech') {
        onFilesChange?.('tech', [...techFiles, ...uploadedFiles])
      } else {
        onFilesChange?.('product', [...prodImgs, ...uploadedFiles])
      }

      showToast(`${files.length} dosya yüklendi`, 'success')
    } catch (error) {
      console.error('File upload error:', error)
      showToast(error.message || 'Dosya yüklenirken hata oluştu', 'error')
    }
  }

  // Handle file delete
  function handleFileDelete(fileId, type = 'tech') {
    if (type === 'tech') {
      onFilesChange?.('tech', techFiles.filter(f => f.id !== fileId))
    } else {
      onFilesChange?.('product', prodImgs.filter(f => f.id !== fileId))
    }
  }

  // Count filled form fields
  const filledFields = formFields.filter(f => {
    const val = formData[f.id]
    return val !== null && val !== undefined && val !== ''
  })

  return (
    <div className="quote-review-step">
      {/* Customer Summary */}
      <div className="review-section">
        <div className="review-section-header">
          <h4 className="review-section-title">
            <span className="section-icon"><User size={16} /></span>
            Müşteri Bilgileri
          </h4>
          <button
            type="button"
            className="review-edit-btn"
            onClick={() => onEditStep?.(1)}
          >
            <Pencil size={12} style={{ marginRight: '4px' }} /> Düzenle
          </button>
        </div>

        <div className="review-grid">
          <div className="review-item">
            <span className="review-label">Müşteri Tipi:</span>
            <span className="review-value highlight">
              {getCustomerTypeLabel(customerType)}
            </span>
          </div>
          <div className="review-item">
            <span className="review-label">Ad Soyad:</span>
            <span className="review-value">{formatValue(displayCustomer.name)}</span>
          </div>
          <div className="review-item">
            <span className="review-label">Şirket:</span>
            <span className="review-value">{formatValue(displayCustomer.company)}</span>
          </div>
          <div className="review-item">
            <span className="review-label">E-posta:</span>
            <span className="review-value">{formatValue(displayCustomer.email)}</span>
          </div>
          <div className="review-item">
            <span className="review-label">Telefon:</span>
            <span className="review-value">{formatValue(displayCustomer.phone)}</span>
          </div>
          <div className="review-item">
            <span className="review-label">Adres:</span>
            <span className="review-value">{formatValue(displayCustomer.address)}</span>
          </div>
          {deliveryDate && (
            <div className="review-item full-width">
              <span className="review-label"><Calendar size={14} style={{ marginRight: '4px', verticalAlign: 'text-bottom' }} />Teslim Tarihi:</span>
              <span className="review-value highlight">{deliveryDate}</span>
            </div>
          )}
        </div>
      </div>

      {/* Form Data Summary */}
      <div className="review-section">
        <div className="review-section-header">
          <h4 className="review-section-title">
            <span className="section-icon"><FileEdit size={16} /></span>
            Form Bilgileri
            <span className="field-count">({filledFields.length}/{formFields.length} alan dolduruldu)</span>
          </h4>
          <button
            type="button"
            className="review-edit-btn"
            onClick={() => onEditStep?.(2)}
          >
            <Pencil size={12} style={{ marginRight: '4px' }} /> Düzenle
          </button>
        </div>

        <div className="review-grid">
          {formFields.map(field => {
            const value = formData[field.id]
            const isEmpty = value === null || value === undefined || value === ''

            // PROMPT-D2: Get display value - show optionLabel for select/radio fields
            const getDisplayValue = () => {
              if (isEmpty) return '-'
              
              const fieldType = field.type || field.fieldType
              if ((fieldType === 'select' || fieldType === 'dropdown' || fieldType === 'radio') && field.options) {
                const selectedOption = field.options.find(opt => opt.optionCode === value)
                return selectedOption?.optionLabel || value
              }
              
              if (fieldType === 'multiselect' && field.options && Array.isArray(value)) {
                return value.map(v => {
                  const opt = field.options.find(o => o.optionCode === v)
                  return opt?.optionLabel || v
                }).join(', ')
              }
              
              if (Array.isArray(value)) return value.join(', ')
              return value
            }

            return (
              <div
                key={field.id}
                className={`review-item ${field.type === 'textarea' ? 'full-width' : ''} ${isEmpty ? 'empty' : ''}`}
              >
                <span className="review-label">
                  {field.label || field.id}
                  {field.required && <span className="required-marker">*</span>}:
                </span>
                <span className="review-value">
                  {getDisplayValue()}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Files Section */}
      <div className="review-section">
        <div className="review-section-header">
          <h4 className="review-section-title">
            <span className="section-icon"><Paperclip size={16} /></span>
            Dosyalar
          </h4>
        </div>

        {/* Technical Files */}
        <div className="files-upload-area">
          <label className="form-label">
            Teknik Dosyalar
            <span className="file-count">({techFiles.length}/{MAX_FILES})</span>
          </label>
          <div className="file-input-wrapper">
            <input
              type="file"
              multiple
              accept={ACCEPT_EXT}
              onChange={(e) => handleFileUpload(e, 'tech')}
              className="file-input"
              id="tech-files-input"
            />
            <label htmlFor="tech-files-input" className="file-input-label">
              <FolderOpen size={14} style={{ marginRight: '4px' }} /> Dosya Seç
            </label>
          </div>
          {techFiles.length > 0 && (
            <div className="files-list">
              {techFiles.map(file => (
                <div key={file.id} className="file-item">
                  <span className="file-icon"><FileText size={14} /></span>
                  <span className="file-name">{file.name}</span>
                  <span className="file-size">{formatFileSize(file.size)}</span>
                  <button
                    type="button"
                    onClick={() => handleFileDelete(file.id, 'tech')}
                    className="file-delete-btn"
                    title="Dosyayı sil"
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Product Images */}
        <div className="files-upload-area" style={{ marginTop: '16px' }}>
          <label className="form-label">
            Ürün Görselleri
            <span className="file-count">({prodImgs.length}/{MAX_PRODUCT_FILES})</span>
          </label>
          <div className="file-input-wrapper">
            <input
              type="file"
              multiple
              accept="image/*"
              onChange={(e) => handleFileUpload(e, 'product')}
              className="file-input"
              id="product-images-input"
            />
            <label htmlFor="product-images-input" className="file-input-label">
              <Image size={14} style={{ marginRight: '4px' }} /> Görsel Seç
            </label>
          </div>
          {prodImgs.length > 0 && (
            <div className="images-grid">
              {prodImgs.map(img => (
                <div key={img.id} className="image-item">
                  <img src={img.url} alt={img.name} />
                  <div className="image-overlay">
                    <span className="image-name">{img.name}</span>
                    <button
                      type="button"
                      onClick={() => handleFileDelete(img.id, 'product')}
                      className="image-delete-btn"
                      title="Görseli sil"
                    >
                      <X size={12} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Notes Section */}
      <div className="review-section">
        <div className="review-section-header">
          <h4 className="review-section-title">
            <span className="section-icon"><MessageSquare size={16} /></span>
            Notlar
          </h4>
        </div>
        <textarea
          value={notes}
          onChange={(e) => onNotesChange?.(e.target.value)}
          placeholder="Teklif için ek notlar ekleyin..."
          className="form-textarea notes-textarea"
          rows={4}
        />
      </div>

      {/* Summary Stats */}
      <div className="review-summary">
        <div className="summary-item">
          <span className="summary-icon"><User size={16} /></span>
          <span className="summary-text">
            {customerType === 'existing' ? 'Mevcut müşteri seçildi' :
             customerType === 'new' ? 'Yeni müşteri kaydedilecek' :
             'Müşterisiz teklif'}
          </span>
        </div>
        <div className="summary-item">
          <span className="summary-icon"><FileEdit size={16} /></span>
          <span className="summary-text">{filledFields.length} alan dolduruldu</span>
        </div>
        <div className="summary-item">
          <span className="summary-icon"><Paperclip size={16} /></span>
          <span className="summary-text">{techFiles.length + prodImgs.length} dosya eklendi</span>
        </div>
      </div>
    </div>
  )
}
