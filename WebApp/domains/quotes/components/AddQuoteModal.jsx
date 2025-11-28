import React, { useState, useEffect } from 'react'
import quotesApi from '../api/quotesApi.js'
import { uid, readFileAsDataUrl, ACCEPT_EXT, MAX_FILES, MAX_FILE_MB, MAX_PRODUCT_FILES } from '../../../shared/lib/utils.js'
import { showToast } from '../../../shared/components/MESToast.js'

export default function AddQuoteModal({ 
  onClose, 
  onSaved, 
  formConfig,
  t,
  globalProcessing,
  setGlobalProcessing
}) {
  const [form, setForm] = useState({})
  const [techFiles, setTechFiles] = useState([])
  const [prodImgs, setProdImgs] = useState([])
  const [saving, setSaving] = useState(false)

  // Initialize form with default values
  useEffect(() => {
    const fields = formConfig?.formStructure?.fields || formConfig?.fields || []
    const initialForm = {}
    
    fields.forEach(field => {
      if (field.type === 'radio' && field.options) {
        initialForm[field.id] = field.options[0] || ''
      } else {
        initialForm[field.id] = ''
      }
    })
    
    setForm(initialForm)
  }, [formConfig])

  const handleInputChange = (e) => {
    const { name, value } = e.target
    setForm(prev => ({ ...prev, [name]: value }))
  }

  const handleFileUpload = async (e, type = 'tech') => {
    const files = Array.from(e.target.files)
    
    if (files.length === 0) return
    
    const maxFiles = type === 'tech' ? MAX_FILES : MAX_PRODUCT_FILES
    const currentCount = type === 'tech' ? techFiles.length : prodImgs.length
    
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
        setTechFiles(prev => [...prev, ...uploadedFiles])
      } else {
        setProdImgs(prev => [...prev, ...uploadedFiles])
      }
      
      showToast(`${files.length} dosya yüklendi`, 'success')
    } catch (error) {
      console.error('File upload error:', error)
      showToast(error.message || 'Dosya yüklenirken hata oluştu', 'error')
    }
  }

  const handleFileDelete = (fileId, type = 'tech') => {
    if (type === 'tech') {
      setTechFiles(prev => prev.filter(f => f.id !== fileId))
    } else {
      setProdImgs(prev => prev.filter(f => f.id !== fileId))
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    
    // Validate required fields
    const fields = formConfig?.formStructure?.fields || formConfig?.fields || []
    const requiredFields = fields.filter(f => f.required)
    
    for (const field of requiredFields) {
      if (!form[field.id] || form[field.id].trim() === '') {
        showToast(`${field.label || field.id} alanı zorunludur`, 'error')
        return
      }
    }
    
    try {
      setSaving(true)
      if (setGlobalProcessing) {
        setGlobalProcessing(true)
      }
      
      const quoteData = {
        customFields: form,
        files: techFiles,
        productImages: prodImgs,
        status: 'new',
        createdAt: new Date().toISOString()
      }
      
      const response = await quotesApi.create(quoteData)
      
      if (response && response.id) {
        showToast('Teklif başarıyla oluşturuldu!', 'success')
        
        if (onSaved) {
          await onSaved()
        }
        
        onClose()
      } else {
        throw new Error('Teklif oluşturulamadı')
      }
    } catch (error) {
      console.error('Create quote error:', error)
      showToast(error.message || 'Teklif oluşturulurken hata oluştu', 'error')
    } finally {
      setSaving(false)
      if (setGlobalProcessing) {
        setGlobalProcessing(false)
      }
    }
  }

  const formFields = formConfig?.formStructure?.fields || formConfig?.fields || []

  return (
    <div 
      className="modal-overlay" 
      onClick={onClose}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000
      }}
    >
      <div 
        className="card detail-modal" 
        onClick={(e) => e.stopPropagation()}
        style={{ 
          width: 'min(600px, 90vw)',
          maxHeight: '85vh',
          overflowY: 'auto',
          position: 'relative',
          padding: '20px',
          margin: '20px',
          background: 'white',
          borderRadius: '8px'
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '20px',
          paddingBottom: '12px',
          borderBottom: '2px solid #e5e7eb'
        }}>
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '600', color: '#111827' }}>
            Yeni Teklif Oluştur
          </h2>
          <button
            onClick={onClose}
            disabled={saving}
            style={{
              padding: '4px 8px',
              border: 'none',
              background: 'transparent',
              color: '#6b7280',
              cursor: saving ? 'not-allowed' : 'pointer',
              fontSize: '20px'
            }}
          >
            ✕
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '20px' }}>
            {formFields.map(field => {
              const label = field.label || field.id
              const value = form[field.id] || ''
              const isRequired = field.required

              return (
                <div key={field.id} style={{ marginBottom: '16px' }}>
                  <label style={{ 
                    display: 'block', 
                    fontSize: '13px', 
                    fontWeight: '600', 
                    color: '#374151',
                    marginBottom: '6px'
                  }}>
                    {label} {isRequired && <span style={{ color: '#dc2626' }}>*</span>}
                  </label>
                  
                  {field.type === 'textarea' ? (
                    <textarea
                      name={field.id}
                      value={value}
                      onChange={handleInputChange}
                      required={isRequired}
                      placeholder={field.placeholder}
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        border: '1px solid #d1d5db',
                        borderRadius: '4px',
                        fontSize: '14px',
                        minHeight: '80px',
                        resize: 'vertical',
                        fontFamily: 'inherit'
                      }}
                    />
                  ) : field.type === 'radio' && field.options ? (
                    <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                      {field.options.map(option => (
                        <label key={option} style={{ 
                          display: 'flex', 
                          alignItems: 'center', 
                          gap: '6px',
                          cursor: 'pointer'
                        }}>
                          <input
                            type="radio"
                            name={field.id}
                            value={option}
                            checked={value === option}
                            onChange={handleInputChange}
                            required={isRequired}
                          />
                          <span style={{ fontSize: '14px' }}>{option}</span>
                        </label>
                      ))}
                    </div>
                  ) : field.type === 'select' && field.options ? (
                    <select
                      name={field.id}
                      value={value}
                      onChange={handleInputChange}
                      required={isRequired}
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        border: '1px solid #d1d5db',
                        borderRadius: '4px',
                        fontSize: '14px',
                        background: 'white'
                      }}
                    >
                      <option value="">Seçiniz...</option>
                      {field.options.map(option => (
                        <option key={option} value={option}>{option}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text'}
                      name={field.id}
                      value={value}
                      onChange={handleInputChange}
                      required={isRequired}
                      placeholder={field.placeholder}
                      step={field.type === 'number' ? 'any' : undefined}
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        border: '1px solid #d1d5db',
                        borderRadius: '4px',
                        fontSize: '14px'
                      }}
                    />
                  )}
                </div>
              )
            })}
          </div>

          {/* Teknik Dosyalar */}
          <div style={{ marginBottom: '20px' }}>
            <label style={{ 
              display: 'block', 
              fontSize: '13px', 
              fontWeight: '600', 
              color: '#374151',
              marginBottom: '6px'
            }}>
              Teknik Dosyalar
            </label>
            <input
              type="file"
              multiple
              accept={ACCEPT_EXT}
              onChange={(e) => handleFileUpload(e, 'tech')}
              style={{ fontSize: '12px', marginBottom: '8px' }}
            />
            {techFiles.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '8px' }}>
                {techFiles.map(file => (
                  <div key={file.id} style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'space-between',
                    padding: '6px 8px',
                    background: '#f9fafb',
                    borderRadius: '4px',
                    fontSize: '12px'
                  }}>
                    <span>{file.name}</span>
                    <button
                      type="button"
                      onClick={() => handleFileDelete(file.id, 'tech')}
                      style={{
                        padding: '2px 6px',
                        border: 'none',
                        borderRadius: '3px',
                        background: '#dc2626',
                        color: 'white',
                        cursor: 'pointer',
                        fontSize: '10px'
                      }}
                    >
                      Sil
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Ürün Görselleri */}
          <div style={{ marginBottom: '20px' }}>
            <label style={{ 
              display: 'block', 
              fontSize: '13px', 
              fontWeight: '600', 
              color: '#374151',
              marginBottom: '6px'
            }}>
              Ürün Görselleri
            </label>
            <input
              type="file"
              multiple
              accept="image/*"
              onChange={(e) => handleFileUpload(e, 'product')}
              style={{ fontSize: '12px', marginBottom: '8px' }}
            />
            {prodImgs.length > 0 && (
              <div style={{ 
                display: 'grid', 
                gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))', 
                gap: '8px',
                marginTop: '8px'
              }}>
                {prodImgs.map(img => (
                  <div key={img.id} style={{ position: 'relative' }}>
                    <img 
                      src={img.url} 
                      alt={img.name}
                      style={{ 
                        width: '100%', 
                        height: '80px', 
                        objectFit: 'cover', 
                        borderRadius: '4px',
                        border: '1px solid #e5e7eb'
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => handleFileDelete(img.id, 'product')}
                      style={{
                        position: 'absolute',
                        top: '2px',
                        right: '2px',
                        padding: '2px 4px',
                        border: 'none',
                        borderRadius: '3px',
                        background: '#dc2626',
                        color: 'white',
                        cursor: 'pointer',
                        fontSize: '10px'
                      }}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Actions */}
          <div style={{ 
            display: 'flex', 
            gap: '12px', 
            justifyContent: 'flex-end',
            paddingTop: '20px',
            borderTop: '1px solid #e5e7eb'
          }}>
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              style={{
                padding: '8px 16px',
                border: '1px solid #d1d5db',
                borderRadius: '4px',
                background: 'white',
                color: '#374151',
                cursor: saving ? 'not-allowed' : 'pointer',
                fontSize: '14px'
              }}
            >
              İptal
            </button>
            <button
              type="submit"
              disabled={saving}
              style={{
                padding: '8px 16px',
                border: 'none',
                borderRadius: '4px',
                background: saving ? '#93c5fd' : '#3b82f6',
                color: 'white',
                cursor: saving ? 'not-allowed' : 'pointer',
                fontSize: '14px'
              }}
            >
              {saving ? 'Kaydediliyor...' : 'Teklif Oluştur'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
