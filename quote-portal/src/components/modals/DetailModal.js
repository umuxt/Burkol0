import React from 'react';
import API, { API_BASE } from '../../lib/api.js'
import { uid, downloadDataUrl, ACCEPT_EXT, MAX_FILES, MAX_FILE_MB, MAX_PRODUCT_FILES, extOf, readFileAsDataUrl, isImageExt } from '../../lib/utils.js'
import { statusLabel } from '../../i18n/index.js'
import { PriceStatusBadge } from '../admin/PriceStatusUI.js'

export function DetailModal({ item, onClose, setItemStatus, onSaved, t, isNew, showNotification, formConfig, globalProcessing, setGlobalProcessing, checkAndProcessVersionUpdates }) {
  console.log('🔧 DEBUG: DetailModal rendered with item:', item?.id, 'formConfig:', !!formConfig)
  
  const [currStatus, setCurrStatus] = React.useState(item.status || 'new')
  const [editing, setEditing] = React.useState(!!isNew)
  const [form, setForm] = React.useState({})
  const [techFiles, setTechFiles] = React.useState(item.files || [])
  const [prodImgs, setProdImgs] = React.useState(item.productImages || [])
  const [manualOverride, setManualOverride] = React.useState(item.manualOverride || null)
  const [manualPriceInput, setManualPriceInput] = React.useState(() => formatManualPriceInput(item.manualOverride?.price ?? item.price))
  const [manualNote, setManualNote] = React.useState(item.manualOverride?.note || '')
  const [manualLoading, setManualLoading] = React.useState(false)
  
  React.useEffect(() => {
    setCurrStatus(item.status || 'new')
    
    // Initialize form with dynamic fields based on formConfig
    const initialForm = {}
    if (formConfig && formConfig.formStructure && formConfig.formStructure.fields) {
      formConfig.formStructure.fields.forEach(field => {
        let value = item.customFields?.[field.id] || item.customFields?.[field.id] || item[field.id] || ''
        
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
    setTechFiles(item.files || [])
    setProdImgs(item.productImages || [])

    const override = item.manualOverride || null
    setManualOverride(override)
    const initialManualPrice = override?.price ?? item.price
    setManualPriceInput(formatManualPriceInput(initialManualPrice))
    setManualNote(override?.note || '')
  }, [item.id, item.status])
  
  function setF(k, v) { 
    setForm((s) => ({ ...s, [k]: v })) 
  }

  function renderDetailFields() {
    if (!formConfig || !formConfig.formStructure.fields) {
      return []
    }
    
    const fields = []
    
    // Add system fields first
    fields.push(
      info('ID', item.id),
      info(t.th_date || 'Tarih', (item.createdAt||'').replace('T',' ').slice(0,16)),
      info(t.a_status || 'Durum', statusLabel(currStatus, t))
    )
    
    // Add dynamic fields from form config
    formConfig.formStructure.fields.forEach(field => {
      
        let value = item.customFields?.[field.id] || item[field.id] || '—'
        let label = field.label || field.id
        
        // Format value based on field type
        if (field.type === 'multiselect' && Array.isArray(item.customFields?.[field.id] || item[field.id])) {
          value = item.customFields?.[field.id] || item[field.id].join(', ') || '—'
        } else if (field.type === 'radio' && field.options) {
          // Keep the selected value as is
          value = value || '—'
        } else if (field.type === 'number') {
          value = value ? (value + (field.unit || '')) : '—'
        } else if (field.type === 'date') {
          value = value || '—'
        } else if (field.type === 'textarea') {
          value = value || '—'
        } else if (!value || value === '') {
          value = '—'
        }
        
        // Handle special formatting
        if (field.id === 'thickness' && value !== '—') {
          value = value + ' mm'
        } else if (field.id === 'country' || field.id === 'city') {
          // Handle country/city combination
          const country = item.country || 'undefined'
          const city = item.city || 'undefined'
          if (field.id === 'country') {
            value = `${country} / ${city}`
            label = (t.f_country || 'Ülke') + '/' + (t.f_city || 'Şehir')
          } else if (field.id === 'city') {
            return null // Skip city field as it's combined with country
          }
        } else if (field.id === 'repeat') {
          value = value === 'recurrent' ? (t.repeat_recurrent || 'Sürekli') : (t.repeat_one || 'Tek Seferlik')
        }
        
        if (value !== null) {
          fields.push(info(label, value))
        }
      })
    
    return fields.filter(Boolean)
  }

  function renderEditFields() {
    if (!formConfig || !formConfig.formStructure.fields) {
      return []
    }
    
    const fields = []
    
    formConfig.formStructure.fields.forEach(field => {
      
        const label = field.label || field.id
        
        if (field.type === 'textarea') {
          fields.push(editArea(label, field.id))
        } else if (field.type === 'radio' && field.options) {
          fields.push(editRadio(label, field.id, field.options))
        } else if (field.type === 'multiselect') {
          fields.push(editField(label, field.id)) // Convert array to comma-separated string for editing
        } else {
          fields.push(editField(label, field.id, field.type === 'number' ? 'number' : 'text'))
        }
      })
    
    return fields
  }

  function renderDetailFields() {
    if (!formConfig || !formConfig.formStructure.fields) {
      return []
    }
    
    const fields = []
    
    // Add system fields first
    fields.push(
      info('ID', item.id),
      info(t.th_date || 'Tarih', (item.createdAt||'').replace('T',' ').slice(0,16)),
      info(t.a_status || 'Durum', statusLabel(currStatus, t))
    )
    
    // Add dynamic fields from form config
    formConfig.formStructure.fields.forEach(field => {
      
        let value = item.customFields?.[field.id] || item[field.id] || '—'
        let label = field.label || field.id
        
        // Format value based on field type
        if (field.type === 'multiselect' && Array.isArray(item.customFields?.[field.id] || item[field.id])) {
          value = item.customFields?.[field.id] || item[field.id].join(', ') || '—'
        } else if (field.type === 'radio' && field.options) {
          // Keep the selected value as is
          value = value || '—'
        } else if (field.type === 'number') {
          value = value ? (value + (field.unit || '')) : '—'
        } else if (field.type === 'date') {
          value = value || '—'
        } else if (field.type === 'textarea') {
          value = value || '—'
        } else if (!value || value === '') {
          value = '—'
        }
        
        // Handle special formatting
        if (field.id === 'thickness' && value !== '—') {
          value = value + ' mm'
        } else if (field.id === 'country' || field.id === 'city') {
          // Handle country/city combination
          const country = item.country || 'undefined'
          const city = item.city || 'undefined'
          if (field.id === 'country') {
            value = `${country} / ${city}`
            label = (t.f_country || 'Ülke') + '/' + (t.f_city || 'Şehir')
          } else if (field.id === 'city') {
            return null // Skip city field as it's combined with country
          }
        } else if (field.id === 'repeat') {
          value = value === 'recurrent' ? (t.repeat_recurrent || 'Sürekli') : (t.repeat_one || 'Tek Seferlik')
        }
        
        if (value !== null) {
          fields.push(info(label, value))
        }
      })
    
    return fields.filter(Boolean)
  }

  const manualOverrideActive = !!(manualOverride && manualOverride.active)
  const manualSetAtText = manualOverride?.setAt ? new Date(manualOverride.setAt).toLocaleString('tr-TR') : null
  const manualSetByText = manualOverride?.setByLabel || manualOverride?.setBy || null

  function formatManualPriceInput(value) {
    if (value === null || value === undefined || value === '') return ''
    const parsed = Number(String(value).replace(',', '.'))
    if (Number.isNaN(parsed)) return ''
    return parsed.toFixed(2)
  }

  function parseManualPrice(value) {
    if (value === null || value === undefined || value === '') return NaN
    return Number(String(value).replace(',', '.'))
  }

  function formatPriceDisplay(value) {
    const parsed = parseManualPrice(value)
    if (Number.isNaN(parsed)) return '—'
    return `₺${parsed.toFixed(2)}`
  }

  async function handleManualPriceSave() {
    if (!item || !item.id) return
    const parsedPrice = parseManualPrice(manualPriceInput)
    if (Number.isNaN(parsedPrice) || parsedPrice < 0) {
      showNotification?.('Geçerli bir fiyat giriniz', 'error')
      return
    }

    setManualLoading(true)
    try {
      const response = await API.setManualPrice(item.id, {
        price: parsedPrice,
        note: manualNote
      })

      const updatedQuote = response?.quote || response || {}
      setManualOverride(updatedQuote.manualOverride || { active: true, price: parsedPrice, note: manualNote })
      setManualPriceInput(formatManualPriceInput(updatedQuote.manualOverride?.price ?? parsedPrice))
      setManualNote(updatedQuote.manualOverride?.note || manualNote)

      showNotification?.('Fiyat manuel olarak kilitlendi', 'success')
      if (typeof onSaved === 'function') {
        await onSaved()
      }

      // Check for version updates after manual price save
      if (checkAndProcessVersionUpdates && setGlobalProcessing) {
        await checkAndProcessVersionUpdates()
      }
    } catch (error) {
      console.error('Manual price save error:', error)
      showNotification?.(`Manuel fiyat kaydedilemedi: ${error.message || 'Beklenmeyen hata'}`, 'error')
    } finally {
      setManualLoading(false)
    }
  }

  async function handleManualRelease(applyLatest = false) {
    if (!item || !item.id) return
    setManualLoading(true)
    try {
      const response = await API.clearManualPrice(item.id, applyLatest ? 'Manuel fiyat kilidi kaldırıldı ve güncel sürüm uygulandı' : 'Manuel fiyat kilidi kaldırıldı')
      const clearedQuote = response?.quote || response || {}
      setManualOverride(clearedQuote.manualOverride || { active: false })
      setManualPriceInput(formatManualPriceInput(clearedQuote.manualOverride?.price ?? clearedQuote.price ?? ''))
      setManualNote(clearedQuote.manualOverride?.note || '')

      if (applyLatest) {
        const applyResponse = await API.applyCurrentPriceToQuote(item.id)
        if (!applyResponse || applyResponse.success === false) {
          throw new Error(applyResponse?.error || 'Güncel fiyat uygulanamadı')
        }
      }

      showNotification?.(applyLatest ? 'Kilit kaldırıldı ve güncel fiyat uygulandı' : 'Manuel kilit kaldırıldı', 'success')
      if (typeof onSaved === 'function') {
        await onSaved()
      }

      // Check for version updates after manual price release
      if (checkAndProcessVersionUpdates && setGlobalProcessing) {
        await checkAndProcessVersionUpdates()
      }
    } catch (error) {
      console.error('Manual override release error:', error)
      showNotification?.(`İşlem başarısız: ${error.message || 'Beklenmeyen hata'}`, 'error')
    } finally {
      setManualLoading(false)
    }
  }
  
  async function onAddTech(filesList) {
    const arr = Array.from(filesList)
    const parsed = []
    for (const f of arr) {
      const sizeMb = f.size / (1024*1024)
      if (sizeMb > MAX_FILE_MB) continue
      const ext = extOf(f.name)
      if (!ACCEPT_EXT.includes(ext)) continue
      const dataUrl = await readFileAsDataUrl(f)
      parsed.push({ name: f.name, type: f.type || ext, size: f.size, dataUrl })
    }
    setTechFiles((p) => p.concat(parsed).slice(0, MAX_FILES))
  }
  
  async function onAddProd(filesList) {
    const arr = Array.from(filesList)
    const parsed = []
    for (const f of arr) {
      const sizeMb = f.size / (1024*1024)
      if (sizeMb > MAX_FILE_MB) continue
      const ext = extOf(f.name)
      if (!isImageExt(ext) && !isImageExt(f.type)) continue
      const dataUrl = await readFileAsDataUrl(f)
      parsed.push({ name: f.name, type: f.type || ext, size: f.size, dataUrl })
    }
    setProdImgs((p) => p.concat(parsed).slice(0, MAX_PRODUCT_FILES))
  }
  
  async function onSave() {
    if (isNew) {
      const payload = {
        id: uid(),
        createdAt: new Date().toISOString(),
        status: currStatus,
        files: techFiles, 
        productImages: prodImgs
      }
      
      // Add dynamic fields from form config
      if (formConfig && formConfig.formStructure.fields) {
        formConfig.formStructure.fields.forEach(field => {
          
            let value = form[field.id]
            
            // Handle special field types
            if (field.type === 'multiselect' && typeof value === 'string') {
              value = value.split(',').map(s => s.trim()).filter(Boolean)
            } else if (field.type === 'number') {
              value = value ? parseFloat(value) || value : value
            }
            
            payload[field.id] = value
          })
      }
      
      await API.createQuote(payload)
      showNotification('Yeni kayıt başarıyla oluşturuldu!', 'success')
    } else {
      const patch = {
        status: currStatus,
        files: techFiles, 
        productImages: prodImgs
      }
      
      // Add dynamic fields from form config
      if (formConfig && formConfig.formStructure.fields) {
        formConfig.formStructure.fields.forEach(field => {
          
            let value = form[field.id]
            
            // Handle special field types
            if (field.type === 'multiselect' && typeof value === 'string') {
              value = value.split(',').map(s => s.trim()).filter(Boolean)
            } else if (field.type === 'number') {
              value = value ? parseFloat(value) || value : value
            }
            
            patch[field.id] = value
          })
      }
      
      await API.updateQuote(item.id, patch)
      showNotification('Kayıt başarıyla güncellendi!', 'success')
    }
    setEditing(false)
    try { if (typeof onSaved === 'function') await onSaved() } catch {}
   
    onClose()
  }
  
  return React.createElement('div', { style: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50
  }, onClick: onClose },
    React.createElement('div', { className: 'card detail-modal', style: { width: 'min(680px, 96vw)', maxHeight: '85vh', overflowY: 'auto', position: 'relative', padding: 12, fontSize: 13 }, onClick: (e) => e.stopPropagation() },
      React.createElement('div', { className: 'row', style: { justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, position: 'sticky', top: 0, zIndex: 5, background: 'linear-gradient(180deg, #0f1e2c, #0c1924)', padding: '8px 6px', borderBottom: '1px solid rgba(255,255,255,0.08)' } },
        React.createElement('h3', { style: { margin: 0, fontSize: 16 } }, t.a_detail),
      React.createElement('div', { className: 'row', style: { alignItems: 'center', gap: '8px' } },
          (!editing && !isNew) ? React.createElement('button', { 
            className: 'btn', 
            onClick: () => setEditing(true),
            onMouseOver: (e) => e.target.style.backgroundColor = 'rgba(0,0,0,0.1)',
            onMouseOut: (e) => e.target.style.backgroundColor = '',
            style: { transition: 'all 0.2s ease' }
          }, t.edit) : React.createElement(React.Fragment, null,
            React.createElement('button', { 
              className: 'btn accent', 
              onClick: onSave,
              onMouseOver: (e) => e.target.style.backgroundColor = 'rgba(255,255,255,0.2)',
              onMouseOut: (e) => e.target.style.backgroundColor = '',
              style: { transition: 'all 0.2s ease' }
            }, t.save),
            React.createElement('button', { 
              className: 'btn', 
              onClick: () => setEditing(false),
              onMouseOver: (e) => e.target.style.backgroundColor = 'rgba(0,0,0,0.1)',
              onMouseOut: (e) => e.target.style.backgroundColor = '',
              style: { transition: 'all 0.2s ease' }
            }, t.cancel)
          ),
          !editing && item.priceStatus && React.createElement(PriceStatusBadge, {
            quote: item,
            compact: true,
            onUpdate: async () => {
              if (typeof onSaved === 'function') {
                try { await onSaved() } catch {}
              }
            }
          }),
          React.createElement('button', { 
            className: 'btn', 
            onClick: onClose, 
            title: t.tt_close,
            onMouseOver: (e) => e.target.style.backgroundColor = 'rgba(0,0,0,0.1)',
            onMouseOut: (e) => e.target.style.backgroundColor = '',
            style: { transition: 'all 0.2s ease' }
          }, '×')
        )
      ),
      
      !isNew && React.createElement('div', {
        className: 'card manual-price-management',
        style: {
          padding: '12px',
          marginBottom: '12px',
          background: 'rgba(15, 30, 44, 0.65)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '8px'
        }
      },
        React.createElement('div', {
          className: 'manual-price-header',
          style: {
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '8px'
          }
        },
          React.createElement('strong', null, 'Manuel Fiyat Yönetimi'),
          manualOverrideActive && React.createElement('span', {
            className: 'manual-price-lock-indicator',
            style: { color: '#ffc107', fontSize: '12px', fontWeight: 600 }
          }, `###🔒 ${formatPriceDisplay(manualOverride?.price ?? item.price)}`)
        ),
        React.createElement('div', {
          className: 'manual-price-controls',
          style: {
            display: 'flex',
            flexWrap: 'wrap',
            gap: '8px',
            alignItems: 'center',
            marginBottom: '6px'
          }
        },
          React.createElement('input', {
            type: 'number',
            step: '0.01',
            min: '0',
            value: manualPriceInput,
            onChange: (e) => setManualPriceInput(e.target.value),
            disabled: manualLoading,
            className: 'manual-price-input',
            style: {
              flex: '0 0 140px',
              padding: '6px 8px',
              borderRadius: '4px',
              border: '1px solid rgba(255,255,255,0.2)',
              background: 'rgba(15,23,42,0.45)',
              color: 'var(--text, #f8fafc)'
            }
          }),
          React.createElement('input', {
            type: 'text',
            placeholder: 'Not (opsiyonel)',
            value: manualNote,
            onChange: (e) => setManualNote(e.target.value),
            disabled: manualLoading,
            className: 'manual-price-note',
            style: {
              flex: '1 1 200px',
              minWidth: '160px',
              padding: '6px 8px',
              borderRadius: '4px',
              border: '1px solid rgba(255,255,255,0.2)',
              background: 'rgba(15,23,42,0.45)',
              color: 'var(--text, #f8fafc)'
            }
          }),
          React.createElement('button', {
            className: 'btn manual-price-btn',
            onClick: handleManualPriceSave,
            disabled: manualLoading,
            style: {
              padding: '4px 8px',
              fontSize: '12px',
              opacity: manualLoading ? 0.6 : 1
            }
          }, manualOverrideActive ? 'Güncelle' : 'Kilitle'),
          manualOverrideActive && React.createElement('button', {
            onClick: () => handleManualRelease(true),
            disabled: manualLoading,
            className: 'manual-price-apply-btn',
            style: {
              marginLeft: '4px',
              padding: '2px 4px',
              border: '1px solid rgba(220, 53, 69, 0.6)',
              borderRadius: '4px',
              backgroundColor: 'rgb(220, 53, 69)',
              color: '#fff',
              fontSize: '10px',
              cursor: manualLoading ? 'not-allowed' : 'pointer',
              opacity: manualLoading ? 0.7 : 1
            }
          }, 'Uygula'),
          manualOverrideActive && React.createElement('button', {
            className: 'btn manual-price-btn',
            onClick: () => handleManualRelease(false),
            disabled: manualLoading,
            style: {
              padding: '4px 8px',
              fontSize: '12px',
              opacity: manualLoading ? 0.6 : 1
            }
          }, 'Kilidi Aç')
        ),
        React.createElement('div', {
          className: 'manual-price-description',
          style: {
            fontSize: '12px',
            color: 'rgba(255,255,255,0.75)',
            lineHeight: 1.5
          }
        }, manualOverrideActive
          ? [
              manualSetAtText ? `Kilit ${manualSetAtText} tarihinde ${manualSetByText || 'admin'} tarafından oluşturuldu.` : `Kilit ${(manualSetByText || 'admin')} tarafından oluşturuldu.`,
              manualOverride?.note ? ` Not: ${manualOverride.note}` : null
            ].filter(Boolean).join(' ') : 'Bu alanı kullanarak otomatik fiyatı geçersiz kılıp manuel değer belirleyebilirsiniz.'),
        manualLoading && React.createElement('div', {
          className: 'manual-price-loading',
          style: { fontSize: '11px', color: '#9ca3af', marginTop: '4px' }
        }, 'İşlem yapılıyor...')
      ),
      (!editing && !isNew) ? React.createElement('div', { className: 'grid two', style: { gap: 8 } },
        ...renderDetailFields()
      ) : React.createElement('div', { className: 'grid two', style: { gap: 8 } },
        ...renderEditFields()
      ),
      React.createElement('div', { style: { height: 10 } }),
      React.createElement('div', { className: 'row wrap' },
        React.createElement('button', { className: (currStatus === 'review' ? 'btn accent' : 'btn'), onClick: () => { setCurrStatus('review'); setItemStatus(item.id, 'review') }, style: { padding: '6px 10px', fontSize: 12 }, title: t.tt_status_review }, t.s_review),
        React.createElement('button', { className: (currStatus === 'feasible' ? 'btn accent' : 'btn'), onClick: () => { setCurrStatus('feasible'); setItemStatus(item.id, 'feasible') }, style: { padding: '6px 10px', fontSize: 12 }, title: t.tt_status_feasible }, t.s_feasible),
        React.createElement('button', { className: (currStatus === 'not' ? 'btn accent' : 'btn'), onClick: () => { setCurrStatus('not'); setItemStatus(item.id, 'not') }, style: { padding: '6px 10px', fontSize: 12 }, title: t.tt_status_not }, t.s_not),
        React.createElement('button', { className: (currStatus === 'quoted' ? 'btn accent' : 'btn'), onClick: () => { setCurrStatus('quoted'); setItemStatus(item.id, 'quoted') }, style: { padding: '6px 10px', fontSize: 12 }, title: t.tt_status_quoted }, t.s_quoted),
        React.createElement('button', { className: (currStatus === 'approved' ? 'btn accent' : 'btn'), onClick: () => { setCurrStatus('approved'); setItemStatus(item.id, 'approved') }, style: { padding: '6px 10px', fontSize: 12 } }, t.s_approved)
      ),
      React.createElement('div', { style: { height: 10 } }),
      (editing ? React.createElement('div', { className: 'grid two', style: { gap: 8, marginBottom: 6 } },
        React.createElement('div', { className: 'card', style: { padding: 10 } },
          React.createElement('div', { className: 'help', style: { marginBottom: 6 } }, t.add_tech_file),
          React.createElement('input', { type: 'file', multiple: true, accept: '.pdf,.png,.jpg,.jpeg,.dxf,.dwg,.step,.stp,.iges,.igs,application/pdf,image/png,image/jpeg,image/jpg', onChange: (e) => onAddTech(e.target.files) })
        ),
        React.createElement('div', { className: 'card', style: { padding: 10 } },
          React.createElement('div', { className: 'help', style: { marginBottom: 6 } }, t.add_prod_image),
          React.createElement('input', { type: 'file', multiple: true, accept: '.png,.jpg,.jpeg,image/png,image/jpeg,image/jpg', onChange: (e) => onAddProd(e.target.files) })
        )
      ) : null),
      (techFiles||[]).length ? React.createElement('div', { className: 'grid two', style: { gap: 8 } },
        techFiles.map((f, i) => React.createElement('div', { key: i, className: 'card file-card', style: { padding: 10, position: 'relative' } },
          React.createElement('div', { style: { marginBottom: 6 } }, `${f.name} (${(f.size/1024).toFixed(0)} KB)`),
          ((f.type||'').toLowerCase().includes('image') || ['png','jpg','jpeg'].includes((f.type||'').toLowerCase()))
            ? React.createElement('img', { className: 'preview-img', src: (function(){const u=(f.dataUrl||'')||(f.url||''); return /^https?:/i.test(u)?u:(u?API_BASE.replace(/\/$/,'')+u:'')})(), alt: f.name })
            : React.createElement('div', { className: 'file-thumb' }, 'Preview not available'),
          editing
            ? React.createElement('div', { className: 'dl-group' },
                React.createElement('button', { className: 'btn icon-btn', title: t.tt_download_txt, onClick: () => { if (f.dataUrl) downloadDataUrl(f.name, f.dataUrl); else window.open(f.url, '_blank') } }, '⬇'),
                React.createElement('button', { className: 'btn icon-btn danger', title: t.a_delete, onClick: () => setTechFiles((p)=>p.filter((_,ix)=>ix!==i)) }, '🗑️')
              )
            : React.createElement('button', { className: 'btn icon-btn dl-center', title: t.tt_download_txt, onClick: () => { if (f.dataUrl) downloadDataUrl(f.name, f.dataUrl); else { const u=f.url||''; window.open(/^https?:/i.test(u)?u:(API_BASE.replace(/\/$/,'')+u), '_blank') } } }, '⬇')
        ))
      ) : null,
      (prodImgs||[]).length ? React.createElement('div', { className: 'grid two', style: { gap: 8, marginTop: 10 } },
        prodImgs.map((f, i) => React.createElement('div', { key: i, className: 'card file-card', style: { padding: 10, position: 'relative' } },
          React.createElement('div', { style: { marginBottom: 6 } }, `${f.name} (${(f.size/1024).toFixed(0)} KB)`),
          ((f.type||'').toLowerCase().includes('image') || ['png','jpg','jpeg'].includes((f.type||'').toLowerCase()))
            ? React.createElement('img', { className: 'preview-img', src: (function(){const u=(f.dataUrl||'')||(f.url||''); return /^https?:/i.test(u)?u:(u?API_BASE.replace(/\/$/,'')+u:'')})(), alt: f.name })
            : React.createElement('div', { className: 'file-thumb' }, 'Preview not available'),
          editing
            ? React.createElement('div', { className: 'dl-group' },
                React.createElement('button', { className: 'btn icon-btn', title: t.tt_download_txt, onClick: () => { if (f.dataUrl) downloadDataUrl(f.name, f.dataUrl); else window.open(f.url, '_blank') } }, '⬇'),
                React.createElement('button', { className: 'btn icon-btn danger', title: t.a_delete, onClick: () => setProdImgs((p)=>p.filter((_,ix)=>ix!==i)) }, '🗑️')
              )
            : React.createElement('button', { className: 'btn icon-btn dl-center', title: t.tt_download_txt, onClick: () => { if (f.dataUrl) downloadDataUrl(f.name, f.dataUrl); else { const u=f.url||''; window.open(/^https?:/i.test(u)?u:(API_BASE.replace(/\/$/,'')+u), '_blank') } } }, '⬇')
        ))
      ) : null
    )
  )

  function info(k, v) {
    return React.createElement('div', { className: 'card', style: { padding: 10, fontSize: 13 } },
      React.createElement('div', { className: 'help', style: { fontSize: 11 } }, k),
      React.createElement('div', null, String(v || '—'))
    )
  }
  function editField(label, key) {
    return React.createElement('div', { className: 'card', style: { padding: 10 } },
      React.createElement('div', { className: 'help', style: { fontSize: 11 } }, label),
      React.createElement('input', { value: form[key] ?? '', onChange: (e) => setF(key, e.target.value) })
    )
  }
  function editArea(label, key) {
    return React.createElement('div', { className: 'card', style: { padding: 10 } },
      React.createElement('div', { className: 'help', style: { fontSize: 11 } }, label),
      React.createElement('textarea', { value: form[key] ?? '', onChange: (e) => setF(key, e.target.value) })
    )
  }
  function editRadio(label, key, options = ['yes', 'no']) {
    return React.createElement('div', { className: 'card', style: { padding: 10 } },
      React.createElement('div', { className: 'help', style: { fontSize: 11, marginBottom: 6 } }, label),
      React.createElement('div', { className: 'row' },
        options.map(option => 
          React.createElement('label', { 
            key: option,
            className: 'chip' 
          },
            React.createElement('input', { 
              type: 'radio', 
              name: key, 
              checked: (form[key]||'') === option, 
              onChange: () => setF(key, option) 
            }),
            React.createElement('span', null, option === 'yes' ? (t.yes || 'Evet') : option === 'no' ? (t.no || 'Hayır') : option)
          )
        )
      )
    )
  }
}
