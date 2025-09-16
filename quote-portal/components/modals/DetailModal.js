import API, { API_BASE } from '../../lib/api.js'
import { uid, downloadDataUrl, ACCEPT_EXT, MAX_FILES, MAX_FILE_MB, MAX_PRODUCT_FILES, extOf, readFileAsDataUrl, isImageExt } from '../../lib/utils.js'
import { statusLabel } from '../../i18n/index.js'

export function DetailModal({ item, onClose, setItemStatus, onSaved, t, isNew, showNotification }) {
  const [currStatus, setCurrStatus] = React.useState(item.status || 'new')
  const [editing, setEditing] = React.useState(!!isNew)
  const [form, setForm] = React.useState({})
  const [techFiles, setTechFiles] = React.useState(item.files || [])
  const [prodImgs, setProdImgs] = React.useState(item.productImages || [])
  
  React.useEffect(() => {
    setCurrStatus(item.status || 'new')
    setForm({
      name: item.name || '', 
      company: item.company || '', 
      email: item.email || '', 
      phone: item.phone || '', 
      country: item.country || '', 
      city: item.city || '',
      proj: item.proj || '', 
      process: (item.process || []).join(', '), 
      material: item.material || '', 
      grade: item.grade || '', 
      thickness: item.thickness || '', 
      qty: item.qty || '', 
      dims: item.dims || '', 
      tolerance: item.tolerance || '', 
      finish: item.finish || '', 
      due: item.due || '', 
      repeat: item.repeat || '', 
      budget: item.budget || '', 
      address: item.address || '', 
      drawing: item.drawing || 'no', 
      productPics: item.productPics || 'no', 
      desc: item.desc || '',
      // Additional technical fields
      toleranceStd: item.toleranceStd || '',
      criticalTolerance: item.criticalTolerance || '',
      bendCount: item.bendCount || '',
      weldMethod: item.weldMethod || '',
      surfaceRa: item.surfaceRa || '',
      finishRal: item.finishRal || '',
      anodizing: item.anodizing || '',
      qtyT1: item.qtyT1 || '',
      qtyT2: item.qtyT2 || '',
      qtyT3: item.qtyT3 || '',
    })
    setTechFiles(item.files || [])
    setProdImgs(item.productImages || [])
  }, [item.id])
  
  function setF(k, v) { 
    setForm((s) => ({ ...s, [k]: v })) 
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
        name: form.name, company: form.company, email: form.email, phone: form.phone, country: form.country, city: form.city,
        proj: form.proj, process: form.process.split(',').map(s=>s.trim()).filter(Boolean), material: form.material, grade: form.grade,
        thickness: form.thickness, qty: form.qty, dims: form.dims, tolerance: form.tolerance, finish: form.finish, due: form.due,
        repeat: form.repeat, budget: form.budget, address: form.address, drawing: form.drawing, productPics: form.productPics, desc: form.desc,
        files: techFiles, productImages: prodImgs,
        // Additional technical fields
        toleranceStd: form.toleranceStd, criticalTolerance: form.criticalTolerance, bendCount: form.bendCount,
        weldMethod: form.weldMethod, surfaceRa: form.surfaceRa, finishRal: form.finishRal, anodizing: form.anodizing,
        qtyT1: form.qtyT1, qtyT2: form.qtyT2, qtyT3: form.qtyT3,
      }
      await API.createQuote(payload)
      showNotification('Yeni kayıt başarıyla oluşturuldu!', 'success')
    } else {
      const patch = {
        status: currStatus,
        name: form.name, company: form.company, email: form.email, phone: form.phone, country: form.country, city: form.city,
        proj: form.proj, process: form.process.split(',').map(s=>s.trim()).filter(Boolean), material: form.material, grade: form.grade,
        thickness: form.thickness, qty: form.qty, dims: form.dims, tolerance: form.tolerance, finish: form.finish, due: form.due,
        repeat: form.repeat, budget: form.budget, address: form.address, drawing: form.drawing, productPics: form.productPics, desc: form.desc,
        files: techFiles, productImages: prodImgs,
        // Additional technical fields
        toleranceStd: form.toleranceStd, criticalTolerance: form.criticalTolerance, bendCount: form.bendCount,
        weldMethod: form.weldMethod, surfaceRa: form.surfaceRa, finishRal: form.finishRal, anodizing: form.anodizing,
        qtyT1: form.qtyT1, qtyT2: form.qtyT2, qtyT3: form.qtyT3,
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
    React.createElement('div', { className: 'card', style: { width: 'min(680px, 96vw)', maxHeight: '85vh', overflowY: 'auto', position: 'relative', padding: 12, fontSize: 13 }, onClick: (e) => e.stopPropagation() },
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
      (!editing && !isNew) ? React.createElement('div', { className: 'grid two', style: { gap: 8 } },
        info('ID', item.id), info(t.th_date, (item.createdAt||'').replace('T',' ').slice(0,16)), info(t.a_status, statusLabel(currStatus, t)), info(t.f_name, item.name),
        info(t.f_company, item.company), info(t.f_email, item.email), info(t.f_phone, item.phone), info(t.f_country + '/' + t.f_city, `${item.country} / ${item.city}`),
        info(t.f_proj, item.proj), info(t.f_process, (item.process||[]).join(', ')), info(t.f_material, item.material), info(t.f_grade, item.grade),
        info(t.f_thickness, item.thickness + ' mm'), info(t.f_qty, item.qty), info(t.f_dims, item.dims), info(t.f_tolerance, item.tolerance),
        info(t.f_finish, item.finish), info(t.f_due, item.due), info(t.f_repeat, item.repeat === 'recurrent' ? t.repeat_recurrent : t.repeat_one), info(t.f_budget, item.budget),
        info(t.f_drawing, item.drawing), info(t.f_address, item.address), info(t.f_desc, item.desc),
        // Additional technical fields
        info('Tolerans Standardı', item.toleranceStd), info('Kritik Toleranslar', item.criticalTolerance), info('Büküm Sayısı', item.bendCount),
        info('Kaynak Yöntemi', item.weldMethod), info('Ra', item.surfaceRa), info('RAL', item.finishRal), info('Anodize', item.anodizing),
        info('Adet Kademeleri', `T1:${item.qtyT1||''} T2:${item.qtyT2||''} T3:${item.qtyT3||''}`)
      ) : React.createElement('div', { className: 'grid two', style: { gap: 8 } },
        editField(t.f_name, 'name'), editField(t.f_company, 'company'), editField(t.f_email, 'email'), editField(t.f_phone, 'phone'),
        editField(t.f_country, 'country'), editField(t.f_city, 'city'), editField(t.f_proj, 'proj'), editField(t.f_process, 'process'),
        editField(t.f_material, 'material'), editField(t.f_grade, 'grade'), editField(t.f_thickness, 'thickness'), editField(t.f_qty, 'qty'),
        editField(t.f_dims, 'dims'), editField(t.f_tolerance, 'tolerance'), editField(t.f_finish, 'finish'), editField(t.f_due, 'due'),
        editField(t.f_repeat, 'repeat'), editField(t.f_budget, 'budget'), editArea(t.f_address, 'address'), editRadio(t.f_drawing, 'drawing'), editRadio(t.f_prodimg, 'productPics'), editArea(t.f_desc, 'desc'),
        // Additional technical fields
        editField('Tolerans Standardı', 'toleranceStd'), editField('Kritik Toleranslar', 'criticalTolerance'), editField('Büküm Sayısı', 'bendCount'),
        editField('Kaynak Yöntemi', 'weldMethod'), editField('Ra', 'surfaceRa'), editField('RAL', 'finishRal'), editField('Anodize', 'anodizing'),
        editField('Adet T1', 'qtyT1'), editField('Adet T2', 'qtyT2'), editField('Adet T3', 'qtyT3')
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
      ) : null,
      React.createElement('div', { style: { height: 10 } }),
      React.createElement('div', { className: 'grid two', style: { gap: 8 } },
        info(t.f_tolerance_std, item.toleranceStd), info(t.f_tolerance_crit, item.toleranceCrit),
        info(t.f_bend_count, item.bendCount), info(t.f_weld_method, item.weldMethod),
        info('Ra', item.surfaceRa), info('RAL', item.finishRal),
        info('Anodize', item.anodizeType), info(t.f_qty_tiers, (item.qtyTiers||[]).join(' | '))
      )
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
  function editRadio(label, key) {
    return React.createElement('div', { className: 'card', style: { padding: 10 } },
      React.createElement('div', { className: 'help', style: { fontSize: 11, marginBottom: 6 } }, label),
      React.createElement('div', { className: 'row' },
        React.createElement('label', { className: 'chip' },
          React.createElement('input', { type: 'radio', name: key, checked: (form[key]||'') === 'yes', onChange: () => setF(key, 'yes') }),
          React.createElement('span', null, t.yes)
        ),
        React.createElement('label', { className: 'chip' },
          React.createElement('input', { type: 'radio', name: key, checked: (form[key]||'') === 'no', onChange: () => setF(key, 'no') }),
          React.createElement('span', null, t.no)
        )
      )
    )
  }
}