import React from 'react';
import API, { API_BASE } from '../../lib/api.js'
import { uid, downloadDataUrl, ACCEPT_EXT, MAX_FILES, MAX_FILE_MB, MAX_PRODUCT_FILES, extOf, readFileAsDataUrl, isImageExt } from '../../lib/utils.js'
import { statusLabel } from '../../i18n/index.js'

export function DetailModal({ item, onClose, setItemStatus, onSaved, t, isNew, showNotification, formConfig }) {
  console.log('🔧 DEBUG: DetailModal rendered with item:', item?.id, 'formConfig:', !!formConfig)
  
  const [currStatus, setCurrStatus] = React.useState(item.status || 'new')
  const [editing, setEditing] = React.useState(!!isNew)
  const [form, setForm] = React.useState({})
  const [techFiles, setTechFiles] = React.useState(item.files || [])
  const [prodImgs, setProdImgs] = React.useState(item.productImages || [])
  
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
      React.createElement('div', { className: 'row' },
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