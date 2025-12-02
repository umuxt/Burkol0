import React, { useState, useEffect, useMemo } from 'react'
import { ArrowLeft, Edit, Download, Trash2, Lock, Unlock } from '../../../../shared/components/Icons.jsx'
import { PriceStatusBadge } from '../pricing/PriceStatusBadge.js'
import API, { API_BASE } from '../../../../shared/lib/api.js'
import { uid, downloadDataUrl, ACCEPT_EXT, MAX_FILES, MAX_FILE_MB, MAX_PRODUCT_FILES, extOf, readFileAsDataUrl, isImageExt } from '../../../../shared/lib/utils.js'
import { statusLabel } from '../../../../shared/i18n.js'
import { showToast } from '../../../../shared/components/MESToast.js'

export default function QuoteDetailsPanel({ 
  quote,
  onClose, 
  onSave,
  onDelete,
  onStatusChange,
  formConfig,
  t,
  loading = false,
  onRefreshQuote,
  globalProcessing,
  setGlobalProcessing,
  checkAndProcessVersionUpdates,
  currentQuotes
}) {
  const [currStatus, setCurrStatus] = useState(quote?.status || 'new')
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({})
  const [techFiles, setTechFiles] = useState(quote?.files || [])
  const [prodImgs, setProdImgs] = useState(quote?.productImages || [])
  const [manualOverride, setManualOverride] = useState(quote?.manualOverride || null)
  const [manualPriceInput, setManualPriceInput] = useState('')
  const [manualNote, setManualNote] = useState(quote?.manualOverride?.note || '')
  const [manualLoading, setManualLoading] = useState(false)
  const [originalData, setOriginalData] = useState(null)

  // Initialize form data when quote changes
  useEffect(() => {
    if (quote) {
      setCurrStatus(quote.status || 'new')
      
      // Initialize form with dynamic fields based on formConfig
      const initialForm = {}
      
      // Support both old and new formConfig structures
      const fields = formConfig?.formStructure?.fields || formConfig?.fields || []
      
      if (fields && fields.length > 0) {
        fields.forEach(field => {
          let value = quote.customFields?.[field.id] || quote[field.id] || ''
          
          // Handle special field types
          if (field.type === 'multiselect' && Array.isArray(value)) {
            value = value.join(', ')
          } else if (field.type === 'radio' && !value) {
            value = field.options?.[0] || ''
          }
          
          initialForm[field.id] = value
        })
      }
      
      setForm(initialForm)
      setOriginalData(initialForm)
      setTechFiles(quote.files || [])
      setProdImgs(quote.productImages || [])

      const override = quote.manualOverride || null
      setManualOverride(override)
      const initialManualPrice = override?.price ?? quote.price
      setManualPriceInput(formatManualPriceInput(initialManualPrice))
      setManualNote(override?.note || '')
      setEditing(false)
    }
  }, [quote?.id, quote?.status, quote?.price, quote?.manualOverride, formConfig])

  const formatManualPriceInput = (price) => {
    if (price === null || price === undefined || price === '') return ''
    const numPrice = parseFloat(price)
    if (isNaN(numPrice)) return ''
    return numPrice.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }

  const handleInputChange = (e) => {
    if (!editing) return
    
    const { name, value } = e.target
    setForm(prev => ({ ...prev, [name]: value }))
  }

  const handleUnlock = () => {
    setEditing(true)
  }

  const handleCancel = () => {
    setEditing(false)
    setForm(originalData || {})
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    
    if (!editing) return

    try {
      // Prepare quote data for update
      const quoteData = {
        ...form,
        status: currStatus
      }

      // Save the quote
      await onSave(quote.id, quoteData)
      
      setEditing(false)
      setOriginalData(form)
      
      showToast('Teklif güncellendi!', 'success')
      
      if (onRefreshQuote) {
        onRefreshQuote()
      }
    } catch (error) {
      console.error('Quote update error:', error)
      showToast('Teklif güncellenirken hata oluştu', 'error')
    }
  }

  const handleClose = () => {
    setForm({})
    setOriginalData(null)
    setEditing(false)
    onClose()
  }

  const handleStatusChange = async (newStatus) => {
    try {
      await onStatusChange(quote.id, newStatus)
      setCurrStatus(newStatus)
      showToast('Durum güncellendi!', 'success')
    } catch (error) {
      console.error('Status update error:', error)
      showToast('Durum güncellenirken hata oluştu', 'error')
    }
  }

  const handleDelete = () => {
    if (confirm(`${quote.id} numaralı teklifi silmek istediğinizden emin misiniz?`)) {
      onDelete(quote.id)
      handleClose()
    }
  }

  const handleManualPriceToggle = async () => {
    if (!quote) return
    
    const isCurrentlyLocked = manualOverride?.active === true
    
    if (isCurrentlyLocked) {
      // Unlock - remove manual override
      if (!confirm('Manuel fiyatı kaldırıp otomatik fiyatlandırmaya dönmek istiyor musunuz?')) {
        return
      }
      
      try {
        setManualLoading(true)
        const response = await API.clearManualPrice(quote.id)
        
        if (response.success) {
          setManualOverride(null)
          setManualPriceInput(formatManualPriceInput(quote.price))
          setManualNote('')
          showToast('Manuel fiyat kaldırıldı', 'success')
          
          if (onRefreshQuote) {
            onRefreshQuote()
          }
        }
      } catch (error) {
        console.error('Clear manual price error:', error)
        showToast('Manuel fiyat kaldırılırken hata oluştu', 'error')
      } finally {
        setManualLoading(false)
      }
    } else {
      // Lock - set manual override
      const parsedPrice = parseFloat(manualPriceInput.replace(/\./g, '').replace(',', '.'))
      
      if (isNaN(parsedPrice) || parsedPrice < 0) {
        showToast('Geçerli bir fiyat girin', 'error')
        return
      }
      
      try {
        setManualLoading(true)
        const response = await API.setManualPrice(quote.id, {
          price: parsedPrice,
          note: manualNote || 'Manuel fiyat belirlendi'
        })
        
        if (response.success) {
          setManualOverride(response.manualOverride)
          showToast('Manuel fiyat ayarlandı', 'success')
          
          if (onRefreshQuote) {
            onRefreshQuote()
          }
        }
      } catch (error) {
        console.error('Set manual price error:', error)
        showToast('Manuel fiyat ayarlanırken hata oluştu', 'error')
      } finally {
        setManualLoading(false)
      }
    }
  }

  const handleFileUpload = async (e, type = 'tech') => {
    const files = Array.from(e.target.files)
    
    if (files.length === 0) return
    
    try {
      const uploadPromises = files.map(async (file) => {
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
      showToast('Dosya yüklenirken hata oluştu', 'error')
    }
  }

  const handleFileDelete = (fileId, type = 'tech') => {
    if (type === 'tech') {
      setTechFiles(prev => prev.filter(f => f.id !== fileId))
    } else {
      setProdImgs(prev => prev.filter(f => f.id !== fileId))
    }
  }

  if (!quote) return null

  const formFields = formConfig?.formStructure?.fields || formConfig?.fields || []
  
  const formatPriceDisplay = (price) => {
    if (price === null || price === undefined || price === '') return '—'
    const numPrice = parseFloat(price)
    if (isNaN(numPrice)) return '—'
    return numPrice.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ₺'
  }

  const isLocked = manualOverride?.active === true

  return (
    <div className="quote-detail-panel">
      {/* Header */}
      <div style={{ 
          padding: '16px 20px', 
          borderBottom: '1px solid #e5e7eb',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button
              onClick={handleClose}
              style={{
                padding: '6px 12px',
                border: '1px solid #d1d5db',
                borderRadius: '4px',
                background: 'white',
                color: '#374151',
                cursor: 'pointer',
                fontSize: '12px'
              }}
              title="Detayları Kapat"
            >
              <ArrowLeft size={14} />
            </button>
            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '600', color: '#111827' }}>
              Teklif Detayları {isLocked && <span style={{ color: '#f59e0b', fontSize: '14px' }}>(Kilitli)</span>}
            </h3>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            {!editing ? (
              <button
                onClick={handleUnlock}
                style={{
                  padding: '6px 12px',
                  border: '1px solid #d1d5db',
                  borderRadius: '4px',
                  background: 'white',
                  color: '#374151',
                  cursor: 'pointer',
                  fontSize: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
              >
                <Edit size={14} /> Düzenle
              </button>
            ) : (
              <>
                <button
                  type="submit"
                  form="quote-detail-form"
                  style={{
                    padding: '6px 12px',
                    border: 'none',
                    borderRadius: '4px',
                    background: '#3b82f6',
                    color: 'white',
                    cursor: 'pointer',
                    fontSize: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                >
                  <Download size={14} /> Kaydet
                </button>
                <button
                  onClick={handleCancel}
                  style={{
                    padding: '6px 12px',
                    border: '1px solid #d1d5db',
                    borderRadius: '4px',
                    background: 'white',
                    color: '#374151',
                    cursor: 'pointer',
                    fontSize: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                >
                  <ArrowLeft size={14} /> İptal
                </button>
              </>
            )}
            {onDelete && (
              <button
                onClick={handleDelete}
                style={{
                  padding: '6px 12px',
                  border: '1px solid #dc2626',
                  borderRadius: '4px',
                  background: 'white',
                  color: '#dc2626',
                  cursor: 'pointer',
                  fontSize: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
              >
                <Trash2 size={14} /> Sil
              </button>
            )}
          </div>
        </div>

        {/* Content - Scrollable */}
        <div style={{ flex: 1, overflow: 'auto', padding: '20px' }}>
          <form id="quote-detail-form" onSubmit={handleSubmit}>
            {/* Temel Bilgiler */}
            <div style={{ 
              marginBottom: '16px', 
              padding: '12px', 
              background: 'white', 
              borderRadius: '6px',
              border: '1px solid #e5e7eb'
            }}>
              <h3 style={{ 
                margin: '0 0 12px 0', 
                fontSize: '14px', 
                fontWeight: '600', 
                color: '#111827', 
                borderBottom: '1px solid #e5e7eb', 
                paddingBottom: '6px' 
              }}>
                Temel Bilgiler
              </h3>
              
              <div className="detail-item" style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                <span className="detail-label" style={{ 
                  fontWeight: '600', 
                  fontSize: '12px', 
                  color: '#374151', 
                  minWidth: '120px', 
                  marginRight: '8px' 
                }}>
                  Teklif ID:
                </span>
                <span style={{ fontSize: '12px', color: '#111827' }}>
                  {quote.id}
                </span>
              </div>

              <div className="detail-item" style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                <span className="detail-label" style={{ 
                  fontWeight: '600', 
                  fontSize: '12px', 
                  color: '#374151', 
                  minWidth: '120px', 
                  marginRight: '8px' 
                }}>
                  Tarih:
                </span>
                <span style={{ fontSize: '12px', color: '#111827' }}>
                  {(quote.createdAt || '').replace('T', ' ').slice(0, 16)}
                </span>
              </div>

              {/* Durum */}
              <div className="detail-item" style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                <span className="detail-label" style={{ 
                  fontWeight: '600', 
                  fontSize: '12px', 
                  color: '#374151', 
                  minWidth: '120px', 
                  marginRight: '8px' 
                }}>
                  Durum:
                </span>
                {editing ? (
                  <select
                    value={currStatus}
                    onChange={(e) => setCurrStatus(e.target.value)}
                    style={{
                      padding: '8px 12px',
                      border: '1px solid #3b82f6',
                      borderRadius: '4px',
                      background: 'white',
                      fontSize: '14px'
                    }}
                  >
                    <option value="new">Yeni</option>
                    <option value="pending">Beklemede</option>
                    <option value="approved">Onaylandı</option>
                    <option value="rejected">Reddedildi</option>
                  </select>
                ) : (
                  <span style={{ fontSize: '12px', color: '#111827' }}>
                    {statusLabel[currStatus] || currStatus}
                  </span>
                )}
              </div>

              {/* Dynamic Form Fields */}
              {formFields.map(field => {
                let value = form[field.id] || ''
                const label = field.label || field.id

                return (
                  <div key={field.id} className="detail-item" style={{ 
                    display: 'flex', 
                    alignItems: field.type === 'textarea' ? 'flex-start' : 'center', 
                    marginBottom: '8px' 
                  }}>
                    <span className="detail-label" style={{ 
                      fontWeight: '600', 
                      fontSize: '12px', 
                      color: '#374151', 
                      minWidth: '120px', 
                      marginRight: '8px' 
                    }}>
                      {label}:
                    </span>
                    {editing ? (
                      field.type === 'textarea' ? (
                        <textarea
                          name={field.id}
                          value={value}
                          onChange={handleInputChange}
                          style={{
                            padding: '8px 12px',
                            border: '1px solid #3b82f6',
                            borderRadius: '4px',
                            background: 'white',
                            width: '100%',
                            fontSize: '14px',
                            minHeight: '80px',
                            resize: 'vertical'
                          }}
                        />
                      ) : field.type === 'radio' && field.options ? (
                        <div style={{ display: 'flex', gap: '12px' }}>
                          {field.options.map(option => (
                            <label key={option} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <input
                                type="radio"
                                name={field.id}
                                value={option}
                                checked={value === option}
                                onChange={handleInputChange}
                              />
                              <span style={{ fontSize: '12px' }}>{option}</span>
                            </label>
                          ))}
                        </div>
                      ) : (
                        <input
                          type={field.type === 'number' ? 'number' : 'text'}
                          name={field.id}
                          value={value}
                          onChange={handleInputChange}
                          style={{
                            padding: '8px 12px',
                            border: '1px solid #3b82f6',
                            borderRadius: '4px',
                            background: 'white',
                            width: '100%',
                            fontSize: '14px'
                          }}
                        />
                      )
                    ) : (
                      <span style={{ fontSize: '12px', color: '#111827' }}>
                        {value || '—'}
                      </span>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Fiyat Bilgileri */}
            <div style={{ 
              marginBottom: '16px', 
              padding: '12px', 
              background: 'white', 
              borderRadius: '6px',
              border: '1px solid #e5e7eb'
            }}>
              <h3 style={{ 
                margin: '0 0 12px 0', 
                fontSize: '14px', 
                fontWeight: '600', 
                color: '#111827', 
                borderBottom: '1px solid #e5e7eb', 
                paddingBottom: '6px' 
              }}>
                Fiyat Bilgileri
              </h3>

              <div className="detail-item" style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                <span className="detail-label" style={{ 
                  fontWeight: '600', 
                  fontSize: '12px', 
                  color: '#374151', 
                  minWidth: '120px', 
                  marginRight: '8px' 
                }}>
                  Fiyat:
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
                  <span style={{ fontSize: '14px', fontWeight: '600', color: '#111827' }}>
                    {formatPriceDisplay(quote.price)}
                  </span>
                  {quote.priceStatus && (
                    <PriceStatusBadge priceStatus={quote.priceStatus} />
                  )}
                </div>
              </div>

              {/* Manuel Fiyat Kontrolü */}
              <div style={{ 
                marginTop: '12px', 
                padding: '12px', 
                background: isLocked ? '#fef3c7' : '#f3f4f6', 
                borderRadius: '4px',
                border: `1px solid ${isLocked ? '#fbbf24' : '#d1d5db'}`
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span style={{ fontSize: '12px', fontWeight: '600', color: '#374151' }}>
                    {isLocked ? '🔒 Manuel Fiyat Aktif' : '🔓 Otomatik Fiyatlandırma'}
                  </span>
                  <button
                    type="button"
                    onClick={handleManualPriceToggle}
                    disabled={manualLoading}
                    style={{
                      padding: '4px 8px',
                      border: 'none',
                      borderRadius: '4px',
                      background: isLocked ? '#dc2626' : '#3b82f6',
                      color: 'white',
                      cursor: manualLoading ? 'not-allowed' : 'pointer',
                      fontSize: '11px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                  >
                    {isLocked ? <Unlock size={12} /> : <Lock size={12} />}
                    {manualLoading ? 'İşleniyor...' : (isLocked ? 'Kilidi Kaldır' : 'Manuel Fiyat Belirle')}
                  </button>
                </div>

                {!isLocked && (
                  <>
                    <input
                      type="text"
                      value={manualPriceInput}
                      onChange={(e) => setManualPriceInput(e.target.value)}
                      placeholder="Manuel fiyat girin"
                      style={{
                        width: '100%',
                        padding: '8px',
                        border: '1px solid #d1d5db',
                        borderRadius: '4px',
                        fontSize: '12px',
                        marginBottom: '8px'
                      }}
                    />
                    <textarea
                      value={manualNote}
                      onChange={(e) => setManualNote(e.target.value)}
                      placeholder="Not (opsiyonel)"
                      style={{
                        width: '100%',
                        padding: '8px',
                        border: '1px solid #d1d5db',
                        borderRadius: '4px',
                        fontSize: '12px',
                        minHeight: '60px',
                        resize: 'vertical'
                      }}
                    />
                  </>
                )}

                {isLocked && manualOverride && (
                  <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '4px' }}>
                    <div>Not: {manualOverride.note || 'Yok'}</div>
                    <div>Tarih: {new Date(manualOverride.timestamp).toLocaleString('tr-TR')}</div>
                  </div>
                )}
              </div>
            </div>

            {/* Dosyalar */}
            <div style={{ 
              marginBottom: '16px', 
              padding: '12px', 
              background: 'white', 
              borderRadius: '6px',
              border: '1px solid #e5e7eb'
            }}>
              <h3 style={{ 
                margin: '0 0 12px 0', 
                fontSize: '14px', 
                fontWeight: '600', 
                color: '#111827', 
                borderBottom: '1px solid #e5e7eb', 
                paddingBottom: '6px' 
              }}>
                Teknik Dosyalar
              </h3>

              {editing && (
                <div style={{ marginBottom: '12px' }}>
                  <input
                    type="file"
                    multiple
                    accept={ACCEPT_EXT}
                    onChange={(e) => handleFileUpload(e, 'tech')}
                    style={{ fontSize: '12px' }}
                  />
                </div>
              )}

              {techFiles.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {techFiles.map(file => (
                    <div key={file.id} style={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'space-between',
                      padding: '8px',
                      background: '#f9fafb',
                      borderRadius: '4px',
                      border: '1px solid #e5e7eb'
                    }}>
                      <span style={{ fontSize: '12px' }}>{file.name}</span>
                      <div style={{ display: 'flex', gap: '4px' }}>
                        <button
                          type="button"
                          onClick={() => downloadDataUrl(file.url, file.name)}
                          style={{
                            padding: '4px 8px',
                            border: 'none',
                            borderRadius: '4px',
                            background: '#3b82f6',
                            color: 'white',
                            cursor: 'pointer',
                            fontSize: '11px'
                          }}
                        >
                          İndir
                        </button>
                        {editing && (
                          <button
                            type="button"
                            onClick={() => handleFileDelete(file.id, 'tech')}
                            style={{
                              padding: '4px 8px',
                              border: 'none',
                              borderRadius: '4px',
                              background: '#dc2626',
                              color: 'white',
                              cursor: 'pointer',
                              fontSize: '11px'
                            }}
                          >
                            Sil
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ fontSize: '12px', color: '#6b7280', margin: 0 }}>Dosya yok</p>
              )}
            </div>

            {/* Ürün Görselleri */}
            <div style={{ 
              marginBottom: '16px', 
              padding: '12px', 
              background: 'white', 
              borderRadius: '6px',
              border: '1px solid #e5e7eb'
            }}>
              <h3 style={{ 
                margin: '0 0 12px 0', 
                fontSize: '14px', 
                fontWeight: '600', 
                color: '#111827', 
                borderBottom: '1px solid #e5e7eb', 
                paddingBottom: '6px' 
              }}>
                Ürün Görselleri
              </h3>

              {editing && (
                <div style={{ marginBottom: '12px' }}>
                  <input
                    type="file"
                    multiple
                    accept="image/*"
                    onChange={(e) => handleFileUpload(e, 'product')}
                    style={{ fontSize: '12px' }}
                  />
                </div>
              )}

              {prodImgs.length > 0 ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: '8px' }}>
                  {prodImgs.map(img => (
                    <div key={img.id} style={{ position: 'relative' }}>
                      <img 
                        src={img.url} 
                        alt={img.name}
                        style={{ 
                          width: '100%', 
                          height: '100px', 
                          objectFit: 'cover', 
                          borderRadius: '4px',
                          border: '1px solid #e5e7eb'
                        }}
                      />
                      {editing && (
                        <button
                          type="button"
                          onClick={() => handleFileDelete(img.id, 'product')}
                          style={{
                            position: 'absolute',
                            top: '4px',
                            right: '4px',
                            padding: '4px',
                            border: 'none',
                            borderRadius: '4px',
                            background: '#dc2626',
                            color: 'white',
                            cursor: 'pointer',
                            fontSize: '10px'
                          }}
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ fontSize: '12px', color: '#6b7280', margin: 0 }}>Görsel yok</p>
              )}
            </div>
          </form>
        </div>
    </div>
  )
}
