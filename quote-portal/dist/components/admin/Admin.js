import API from '../../lib/api.js'
import { statusLabel, procLabel, materialLabel } from '../../i18n/index.js'

const ReactGlobal = typeof React !== 'undefined' ? React : (typeof window !== 'undefined' ? window.React : undefined)
if (!ReactGlobal) {
  throw new Error('React global not found. Ensure React CDN script loads before admin module.')
}
const { useState, useEffect, useMemo } = ReactGlobal

function Admin({ t, onLogout, showNotification, SettingsModal, DetailModal, FilterPopup }) {
  const [list, setList] = useState([])
  const [detail, setDetail] = useState(null)
  const [creating, setCreating] = useState(false)
  const [selected, setSelected] = useState(new Set())
  const [settingsModal, setSettingsModal] = useState(false)
  const [priceSettings, setPriceSettings] = useState(null)
  
  // Search and Filter States
  const [globalSearch, setGlobalSearch] = useState('')
  const [fieldSearch, setFieldSearch] = useState('')
  const [filterPopup, setFilterPopup] = useState(null) // null | 'status' | 'material' | 'process' | 'dateRange' | 'qtyRange' | 'country'
  const [filters, setFilters] = useState({
    status: [],
    material: [],
    process: [],
    dateRange: { from: '', to: '' },
    qtyRange: { min: '', max: '' },
    country: []
  })

  useEffect(() => { 
    refresh()
    loadPriceSettings()
  }, [])
  
  async function refresh() {
    try { setList(await API.listQuotes()) } catch (e) { console.error(e) }
  }

  async function loadPriceSettings() {
    try {
      const settings = await API.getSettings()
      setPriceSettings(settings)
    } catch (e) {
      console.error('Settings load error:', e)
    }
  }

  async function handleLogout() {
    try {
      await API.logout()
      onLogout()
    } catch (e) {
      console.error('Logout error:', e)
      // Even if logout fails on server, clear local session
      onLogout()
    }
  }

  // Calculate price using formula and parameters
  function calculatePrice(quote) {
    if (!priceSettings || !priceSettings.parameters || !priceSettings.formula) {
      return quote.price || 0
    }

    try {
      // Create parameter values map
      const paramValues = {}
      
      priceSettings.parameters.forEach(param => {
        if (param.type === 'fixed') {
          paramValues[param.id] = parseFloat(param.value) || 0
        } else if (param.type === 'form') {
          let value = 0
          
          if (param.formField === 'qty') {
            value = parseFloat(quote.qty) || 0
          } else if (param.formField === 'thickness') {
            value = parseFloat(quote.thickness) || 0
          } else if (param.formField === 'dimensions') {
            // Calculate area from dimensions
            const dims = quote.dimensions || ''
            const match = dims.match(/(\d+)\s*[x×]\s*(\d+)/)
            if (match) {
              value = (parseFloat(match[1]) || 0) * (parseFloat(match[2]) || 0)
            }
          } else {
            // For fields with lookup table
            if (param.lookupTable && param.lookupTable.length > 0) {
              const fieldValue = quote[param.formField]
              const lookupItem = param.lookupTable.find(item => item.option === fieldValue)
              value = lookupItem ? parseFloat(lookupItem.value) || 0 : 0
            } else {
              // Direct form value for fields without lookup
              value = parseFloat(quote[param.formField]) || 0
            }
          }
          
          paramValues[param.id] = value
        }
      })

      // Evaluate formula (simple Excel-like evaluation)
      let formula = priceSettings.formula.replace(/^=/, '') // Remove leading =
      
      // Replace parameter IDs with actual values
      Object.keys(paramValues).forEach(paramId => {
        const regex = new RegExp(`\\b${paramId}\\b`, 'g')
        formula = formula.replace(regex, paramValues[paramId])
      })

      // Basic mathematical evaluation (be careful with eval in production!)
      // This is a simplified version - in production, use a proper formula parser
      const result = Function('"use strict"; return (' + formula + ')')()
      return isNaN(result) ? (quote.price || 0) : result
      
    } catch (e) {
      console.error('Price calculation error:', e)
      return quote.price || 0
    }
  }

  // Check if calculated price differs from stored price
  function needsPriceUpdate(quote) {
    if (!priceSettings || !priceSettings.parameters || !priceSettings.formula) {
      return false
    }
    
    const calculatedPrice = calculatePrice(quote)
    const storedPrice = parseFloat(quote.price) || 0
    
    return Math.abs(calculatedPrice - storedPrice) > 0.01 // 1 cent tolerance
  }

  const filtered = useMemo(() => {
    let result = [...list]
    
    // Global search - searches across all fields
    if (globalSearch.trim()) {
      const searchTerm = globalSearch.toLowerCase().trim()
      result = result.filter(item => {
        const searchableText = [
          item.name, item.company, item.email, item.phone, item.country, item.city,
          item.proj, item.material, item.grade, item.desc, item.finish, item.toleranceStd,
          item.toleranceCrit, item.weldMethod, item.anodizeType, item.finishRal,
          item.id, item.status, item.dims, item.tolerance, item.due, item.repeat,
          ...(Array.isArray(item.process) ? item.process : [])
        ].filter(Boolean).join(' ').toLowerCase()
        
        return searchableText.includes(searchTerm)
      })
    }
    
    // Field-specific search (if implemented later)
    if (fieldSearch.trim()) {
      const searchTerm = fieldSearch.toLowerCase().trim()
      result = result.filter(item => {
        // Add specific field search logic here if needed
        return (item.name || '').toLowerCase().includes(searchTerm) ||
               (item.company || '').toLowerCase().includes(searchTerm) ||
               (item.proj || '').toLowerCase().includes(searchTerm)
      })
    }
    
    // Status filter
    if (filters.status.length > 0) {
      result = result.filter(item => filters.status.includes(item.status))
    }
    
    // Material filter
    if (filters.material.length > 0) {
      result = result.filter(item => filters.material.includes(item.material))
    }
    
    // Process filter
    if (filters.process.length > 0) {
      result = result.filter(item => {
        if (!Array.isArray(item.process)) return false
        return filters.process.some(filterProcess => item.process.includes(filterProcess))
      })
    }
    
    // Date range filter
    if (filters.dateRange.from || filters.dateRange.to) {
      result = result.filter(item => {
        if (!item.createdAt) return false
        const itemDate = new Date(item.createdAt)
        const fromDate = filters.dateRange.from ? new Date(filters.dateRange.from) : null
        const toDate = filters.dateRange.to ? new Date(filters.dateRange.to) : null
        
        if (fromDate && itemDate < fromDate) return false
        if (toDate && itemDate > toDate) return false
        return true
      })
    }
    
    // Quantity range filter
    if (filters.qtyRange.min || filters.qtyRange.max) {
      result = result.filter(item => {
        const qty = Number(item.qty) || 0
        const min = Number(filters.qtyRange.min) || 0
        const max = Number(filters.qtyRange.max) || Infinity
        return qty >= min && qty <= max
      })
    }
    
    // Country filter
    if (filters.country.length > 0) {
      result = result.filter(item => filters.country.includes(item.country))
    }
    
    // Sort by createdAt descending (newest first), then by id as fallback
    return result.sort((a, b) => {
      const dateA = new Date(a.createdAt || 0).getTime()
      const dateB = new Date(b.createdAt || 0).getTime()
      if (dateB !== dateA) return dateB - dateA
      return (b.id || '').localeCompare(a.id || '')
    })
  }, [list, globalSearch, fieldSearch, filters])

  // Helper functions for filters
  function updateFilter(category, value, action = 'toggle') {
    setFilters(prev => {
      const newFilters = { ...prev }
      if (action === 'toggle') {
        if (Array.isArray(newFilters[category])) {
          const index = newFilters[category].indexOf(value)
          if (index > -1) {
            newFilters[category] = newFilters[category].filter(v => v !== value)
          } else {
            newFilters[category] = [...newFilters[category], value]
          }
        }
      } else if (action === 'set') {
        newFilters[category] = value
      }
      return newFilters
    })
  }

  function clearFilters() {
    setFilters({
      status: [],
      material: [],
      process: [],
      dateRange: { from: '', to: '' },
      qtyRange: { min: '', max: '' },
      country: []
    })
    setGlobalSearch('')
    setFieldSearch('')
  }

  // Get unique values for filter options
  const filterOptions = useMemo(() => {
    const options = {
      status: [...new Set(list.map(item => item.status).filter(Boolean))],
      material: [...new Set(list.map(item => item.material).filter(Boolean))],
      process: [...new Set(list.flatMap(item => Array.isArray(item.process) ? item.process : []).filter(Boolean))],
      country: [...new Set(list.map(item => item.country).filter(Boolean))]
    }
    return options
  }, [list])

  async function setItemStatus(id, st) { 
    await API.updateStatus(id, st)
    refresh()
    showNotification('Kayıt durumu güncellendi!', 'success')
  }
  async function remove(id) { await API.remove(id); refresh() }
  function toggleOne(id, checked) {
    setSelected((prev) => {
      const n = new Set(prev)
      if (checked) n.add(id); else n.delete(id)
      return n
    })
  }
  function toggleAll(e) {
    const checked = e.target.checked
    if (checked) {
      setSelected(new Set(filtered.map(it => it.id)))
    } else {
      setSelected(new Set())
    }
  }
  async function bulkDelete() {
    if (!selected.size) return
    if (!confirm(t.confirm_delete)) return
    for (const id of Array.from(selected)) {
      await API.remove(id)
    }
    setSelected(new Set())
    refresh()
  }

  function exportCSV() {
    const headers = ['id','createdAt','status','name','company','email','phone','country','city','proj','process','material','grade','thickness','qty','dims','tolerance','finish','due','daysToDue','estPrice','estLead','repeat','budget','address','drawing','productPics','desc','files','productImages']
    const rows = list.map((it) => {
      const daysToDue = (it.status === 'approved' && it.due) ? Math.ceil((new Date(it.due).getTime() - Date.now()) / (1000*60*60*24)) : ''
      const estPrice = '₺ 16'
      const estLead = '16'
      return [ it.id, it.createdAt, statusLabel(it.status, t), it.name, it.company, it.email, it.phone, it.country, it.city, it.proj, (it.process||[]).join('|'), it.material, it.grade, it.thickness, it.qty, it.dims, it.tolerance, it.finish, it.due, daysToDue, estPrice, estLead, it.repeat, it.budget, (it.address||'').replace(/\n/g, ' '), it.drawing, it.productPics, (it.desc||'').replace(/\n/g, ' '), (it.files||[]).map(f=>f.name).join('|'), (it.productImages||[]).map(f=>f.name).join('|') ]
    })
    const csvBody = [headers.join(','), ...rows.map(r => r.map(v => '"' + String(v ?? '').replace(/"/g,'""') + '"').join(','))].join('\n')
    const csvWithBOM = '\ufeff' + csvBody
    const blob = new Blob([csvWithBOM], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = 'burkol_quotes.csv'; a.click()
    URL.revokeObjectURL(url)
    showNotification('CSV dosyası başarıyla indirildi!', 'success')
  }

  // Stats
  const statsAll = useMemo(() => {
    const src = list
    const byStatus = {}
    const byProcess = {}
    const byMaterial = {}
    const byDay = {}
    for (const it of src) {
      const status = statusLabel(it.status, t)
      byStatus[status] = (byStatus[status] || 0) + 1
      for (const p of it.process || []) {
        const proc = procLabel(p, t)
        byProcess[proc] = (byProcess[proc] || 0) + 1
      }
      const m = materialLabel(it.material || 'Other', t)
      byMaterial[m] = (byMaterial[m] || 0) + 1
      const day = (it.createdAt || '').slice(0, 10)
      byDay[day] = (byDay[day] || 0) + 1
    }
    return { byStatus, byProcess, byMaterial, byDay }
  }, [list, t])

  function metricLabel() { return t.metric_count }

  function sortEntriesGeneric(obj, byKeyAlpha) {
    const entries = Object.entries(obj || {})
    if (byKeyAlpha) return entries.sort((a,b) => a[0].localeCompare(b[0]))
    return entries.sort((a,b) => b[1]-a[1])
  }

  function BarChart({ data, xLabel, yLabel, byKeyAlpha }) {
    const entries = sortEntriesGeneric(data, byKeyAlpha)
    if (!entries.length) return React.createElement('div', { className: 'help' }, t.empty_data)
    const w = 420, h = 200, ml = 46, mr = 8, mt = 8, mb = 34
    const cw = w - ml - mr, ch = h - mt - mb
    const max = Math.max(1, ...entries.map(e => e[1]))
    const barW = cw / entries.length * 0.7
    const xStep = cw / entries.length
    return React.createElement('svg', { width: '100%', viewBox: `0 0 ${w} ${h}` },
      // axes
      React.createElement('line', { x1: ml, y1: h - mb, x2: w - mr, y2: h - mb, stroke: '#999' }),
      React.createElement('line', { x1: ml, y1: mt, x2: ml, y2: h - mb, stroke: '#999' }),
      // y ticks
      [0, 0.25, 0.5, 0.75, 1].map((tck, i) => {
        const y = h - mb - tck * ch
        const val = Math.round(tck * max)
        return React.createElement(React.Fragment, { key: i },
          React.createElement('line', { x1: ml, y1: y, x2: w - mr, y2: y, stroke: '#eee' }),
          React.createElement('text', { x: ml - 8, y: y + 4, fontSize: 10, textAnchor: 'end', fill: '#666' }, String(val))
        )
      }),
      // bars + x labels
      entries.map(([k, v], i) => {
        const x = ml + i * xStep + (xStep - barW) / 2
        const bh = (v / max) * ch
        const y = h - mb - bh
        return React.createElement(React.Fragment, { key: k },
          React.createElement('rect', { x, y, width: barW, height: bh, fill: '#0a84ff', rx: 3 }),
          React.createElement('text', { x: ml + i * xStep + xStep / 2, y: h - mb + 14, fontSize: 10, textAnchor: 'middle', fill: '#444' }, k)
        )
      }),
      // axis titles
      React.createElement('text', { x: ml + cw / 2, y: h - 6, fontSize: 12, textAnchor: 'middle', fill: '#fff' }, xLabel || ''),
      React.createElement('text', { x: 12, y: mt + ch / 2, fontSize: 12, textAnchor: 'middle', fill: '#fff', transform: `rotate(-90 12 ${mt + ch / 2})` }, yLabel || metricLabel())
    )
  }

  function LineChart({ data, xLabel, yLabel, byKeyAlpha }) {
    const entries = sortEntriesGeneric(data, byKeyAlpha)
    const w = 520, h = 240, ml = 50, mr = 10, mt = 10, mb = 40
    const cw = w - ml - mr, ch = h - mt - mb
    const max = Math.max(1, ...entries.map(e => e[1]))
    if (!entries.length) return React.createElement('div', { className: 'help' }, t.empty_data)
    const pts = entries.map((e, i) => {
      const x = ml + (i * cw) / Math.max(1, entries.length - 1)
      const y = h - mb - (e[1] / max) * ch
      return `${x},${y}`
    }).join(' ')
    return React.createElement('svg', { width: '100%', viewBox: `0 0 ${w} ${h}` },
      // axes
      React.createElement('line', { x1: ml, y1: h - mb, x2: w - mr, y2: h - mb, stroke: '#999' }),
      React.createElement('line', { x1: ml, y1: mt, x2: ml, y2: h - mb, stroke: '#999' }),
      // y ticks
      [0, 0.25, 0.5, 0.75, 1].map((tck, i) => {
        const y = h - mb - tck * ch
        const val = Math.round(tck * max)
        return React.createElement(React.Fragment, { key: i },
          React.createElement('line', { x1: ml, y1: y, x2: w - mr, y2: y, stroke: '#eee' }),
          React.createElement('text', { x: ml - 8, y: y + 4, fontSize: 10, textAnchor: 'end', fill: '#666' }, String(val))
        )
      }),
      // x labels
      entries.map((e, i) => React.createElement('text', { key: i, x: ml + (i * cw) / Math.max(1, entries.length - 1), y: h - mb + 14, fontSize: 10, textAnchor: 'middle', fill: '#444' }, e[0])),
      // line
      React.createElement('polyline', { fill: 'none', stroke: '#0a84ff', strokeWidth: 2, points: pts }),
      // axis titles
      React.createElement('text', { x: ml + cw / 2, y: h - 6, fontSize: 12, textAnchor: 'middle', fill: '#333' }, xLabel || ''),
      React.createElement('text', { x: 12, y: mt + ch / 2, fontSize: 12, textAnchor: 'middle', fill: '#333', transform: `rotate(-90 12 ${mt + ch / 2})` }, yLabel || metricLabel())
    )
  }

  return React.createElement('div', { className: 'container' },
    React.createElement('div', { className: 'row', style: { justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 } },
      React.createElement('div', null,
        React.createElement('h1', { className: 'page-title', style: { margin: 0 } }, t.title_admin),
        React.createElement('p', { className: 'page-sub', style: { margin: 0 } }, t.sub_admin)
      ),
      React.createElement('div', { style: { display: 'flex', gap: '8px', alignItems: 'center' } },
        React.createElement('button', { 
          onClick: () => setSettingsModal(true), 
          className: 'btn', 
          style: { 
            backgroundColor: '#007bff', 
            color: 'white', 
            border: 'none',
            padding: '8px 12px',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '16px',
            transition: 'all 0.2s ease'
          },
          onMouseOver: (e) => e.target.style.backgroundColor = '#0056b3',
          onMouseOut: (e) => e.target.style.backgroundColor = '#007bff',
          title: 'Ayarlar'
        }, '⚙️'),
        React.createElement('button', { 
          onClick: handleLogout, 
          className: 'btn', 
          style: { 
            backgroundColor: '#ff3b30', 
            color: 'white', 
            border: 'none',
            padding: '8px 16px',
            borderRadius: '6px',
            cursor: 'pointer'
          } 
        }, t.logout_btn || 'Çıkış Yap')
      )
    ),
    // Default multi-charts (unfiltered)
    React.createElement('div', { className: 'card', style: { marginBottom: 12 } },
      React.createElement('label', null, t.a_charts),
      React.createElement('div', { className: 'row wrap', style: { gap: 12, marginTop: 6 } },
        React.createElement('div', { style: { flex: '1 1 300px', minWidth: 280 } },
          React.createElement(BarChart, { data: statsAll.byStatus, xLabel: t.dim_status, yLabel: metricLabel(), byKeyAlpha: false })
        ),
        React.createElement('div', { style: { flex: '1 1 300px', minWidth: 280 } },
          React.createElement(BarChart, { data: statsAll.byProcess, xLabel: t.dim_process, yLabel: metricLabel(), byKeyAlpha: false })
        ),
        React.createElement('div', { style: { flex: '1 1 300px', minWidth: 280 } },
          React.createElement(BarChart, { data: statsAll.byMaterial, xLabel: t.dim_material, yLabel: metricLabel(), byKeyAlpha: false })
        ),
      )
    ),

    React.createElement('div', { className: 'card', style: { marginTop: 16 } },
      React.createElement('div', { className: 'row', style: { justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' } },
        React.createElement('label', { style: { fontSize: '16px', fontWeight: '600', margin: 0, minWidth: '120px' } }, t.a_list),
        
        // Search Section
        React.createElement('div', { className: 'row', style: { gap: '8px', flex: '1 1 400px', minWidth: '300px', maxWidth: '500px' } },
          React.createElement('input', {
            type: 'text',
            placeholder: 'Genel arama (isim, firma, email, tel, proje...)',
            value: globalSearch,
            onChange: (e) => setGlobalSearch(e.target.value),
            style: { 
              flex: 1,
              padding: '6px 10px', 
              border: '1px solid #ced4da', 
              borderRadius: '4px', 
              fontSize: '12px',
              minWidth: '200px'
            }
          }),
          React.createElement('button', {
            onClick: () => {
              setGlobalSearch('')
              setFieldSearch('')
              clearFilters()
            },
            title: 'Aramaları temizle',
            style: { 
              padding: '6px 8px', 
              fontSize: '12px', 
              backgroundColor: '#6c757d', 
              color: 'white', 
              border: 'none', 
              borderRadius: '4px', 
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              transition: 'all 0.2s ease'
            },
            onMouseOver: (e) => e.target.style.backgroundColor = '#5a6268',
            onMouseOut: (e) => e.target.style.backgroundColor = '#6c757d'
          }, '✕')
        ),
        
        // Action Buttons
        React.createElement('div', { className: 'row', style: { gap: 6, flexShrink: 0 } },
          React.createElement('button', { 
            className: 'btn', 
            onClick: () => refresh(), 
            title: t.tt_refresh, 
            style: { padding: '6px 10px', fontSize: 12, transition: 'all 0.2s ease' },
            onMouseOver: (e) => e.target.style.backgroundColor = 'rgba(0,0,0,0.1)',
            onMouseOut: (e) => e.target.style.backgroundColor = ''
          }, t.refresh),
          React.createElement('button', { 
            className: 'btn', 
            onClick: () => setCreating(true), 
            title: t.a_add, 
            style: { padding: '6px 10px', fontSize: 12, transition: 'all 0.2s ease' },
            onMouseOver: (e) => e.target.style.backgroundColor = 'rgba(0,0,0,0.1)',
            onMouseOut: (e) => e.target.style.backgroundColor = ''
          }, t.a_add),
          React.createElement('button', { 
            className: 'btn danger', 
            onClick: bulkDelete, 
            title: t.tt_delete, 
            disabled: selected.size === 0, 
            style: { padding: '6px 10px', fontSize: 12, transition: 'all 0.2s ease' },
            onMouseOver: (e) => !e.target.disabled && (e.target.style.backgroundColor = 'rgba(255,255,255,0.2)'),
            onMouseOut: (e) => e.target.style.backgroundColor = ''
          }, t.a_delete),
          React.createElement('button', { 
            className: 'btn', 
            onClick: exportCSV, 
            title: t.tt_export_csv, 
            style: { padding: '6px 10px', fontSize: 12, transition: 'all 0.2s ease' },
            onMouseOver: (e) => e.target.style.backgroundColor = 'rgba(0,0,0,0.1)',
            onMouseOut: (e) => e.target.style.backgroundColor = ''
          }, t.a_export_csv)
        )
      ),
      
      // Compact filter bar (optional - can be added later)
      React.createElement('div', { style: { margin: '8px 0', fontSize: '12px', color: '#6c757d' } },
        // Active filters display (if any)
        (filters.status.length > 0 || filters.material.length > 0 || filters.process.length > 0 || filters.dateRange.from || filters.dateRange.to || filters.qtyRange.min || filters.qtyRange.max) &&
        React.createElement('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '4px', alignItems: 'center' } },
          React.createElement('span', { style: { fontWeight: '500' } }, 'Aktif filtreler: '),
          filters.status.length > 0 && React.createElement('span', { style: { backgroundColor: '#007bff', color: 'white', padding: '2px 6px', borderRadius: '12px', fontSize: '11px' } }, `Durum: ${filters.status.join(', ')}`),
          filters.material.length > 0 && React.createElement('span', { style: { backgroundColor: '#28a745', color: 'white', padding: '2px 6px', borderRadius: '12px', fontSize: '11px' } }, `Malzeme: ${filters.material.join(', ')}`),
          filters.process.length > 0 && React.createElement('span', { style: { backgroundColor: '#ffc107', color: '#212529', padding: '2px 6px', borderRadius: '12px', fontSize: '11px' } }, `İşlem: ${filters.process.join(', ')}`),
          (filters.dateRange.from || filters.dateRange.to) && React.createElement('span', { style: { backgroundColor: '#6c757d', color: 'white', padding: '2px 6px', borderRadius: '12px', fontSize: '11px' } }, `Tarih: ${filters.dateRange.from || '?'} - ${filters.dateRange.to || '?'}`),
          (filters.qtyRange.min || filters.qtyRange.max) && React.createElement('span', { style: { backgroundColor: '#17a2b8', color: 'white', padding: '2px 6px', borderRadius: '12px', fontSize: '11px' } }, `Miktar: ${filters.qtyRange.min || '0'} - ${filters.qtyRange.max || '∞'}`)
        )
      ),
      
      filtered.length === 0 ? React.createElement('div', { className: 'notice' }, `${t.a_none} ${list.length > 0 ? '(filtrelenmiş)' : ''}`) : (
        React.createElement('div', { style: { overflowX: 'auto', width: '100%' } },
          React.createElement('table', { className: 'table', style: { minWidth: '1200px' } },
            React.createElement('thead', null,
              React.createElement('tr', null,
                React.createElement('th', null,
                  React.createElement('input', { type: 'checkbox', onChange: toggleAll, checked: filtered.length > 0 && selected.size === filtered.length })
                ),
                React.createElement('th', null, t.th_date, ' ', React.createElement('span', { 
                  style: { fontSize: '12px', opacity: 0.7, cursor: 'pointer', marginLeft: '4px', userSelect: 'none' }, 
                  title: 'Tarih filtresi',
                  onClick: (e) => { e.stopPropagation(); setFilterPopup('dateRange') }
                }, '🔽')),
                React.createElement('th', null, t.th_customer, ' ', React.createElement('span', { 
                  style: { fontSize: '12px', opacity: 0.7, cursor: 'pointer', marginLeft: '4px', userSelect: 'none' }, 
                  title: 'Ülke filtresi',
                  onClick: (e) => { e.stopPropagation(); setFilterPopup('country') }
                }, '🔽')),
                React.createElement('th', null, t.th_project, ' ', React.createElement('span', { 
                  style: { fontSize: '12px', opacity: 0.7, cursor: 'pointer', marginLeft: '4px', userSelect: 'none' }, 
                  title: 'İşlem filtresi',
                  onClick: (e) => { e.stopPropagation(); setFilterPopup('process') }
                }, '🔽')),
                React.createElement('th', null, t.th_material, ' ', React.createElement('span', { 
                  style: { fontSize: '12px', opacity: 0.7, cursor: 'pointer', marginLeft: '4px', userSelect: 'none' }, 
                  title: 'Malzeme filtresi',
                  onClick: (e) => { e.stopPropagation(); setFilterPopup('material') }
                }, '🔽')),
                React.createElement('th', null, t.th_qty, ' ', React.createElement('span', { 
                  style: { fontSize: '12px', opacity: 0.7, cursor: 'pointer', marginLeft: '4px', userSelect: 'none' }, 
                  title: 'Miktar filtresi',
                  onClick: (e) => { e.stopPropagation(); setFilterPopup('qtyRange') }
                }, '🔽')),
                React.createElement('th', null, t.th_due, ' ', React.createElement('span', { 
                  style: { fontSize: '12px', opacity: 0.7, cursor: 'pointer', marginLeft: '4px', userSelect: 'none' }, 
                  title: 'Teslim tarihi filtresi',
                  onClick: (e) => { e.stopPropagation(); setFilterPopup('dateRange') }
                }, '🔽')),
                React.createElement('th', null, t.th_days_to_due),
                React.createElement('th', null, t.th_est_price),
                React.createElement('th', null, t.th_est_lead),
                React.createElement('th', null, t.a_status, ' ', React.createElement('span', { 
                  style: { fontSize: '12px', opacity: 0.7, cursor: 'pointer', marginLeft: '4px', userSelect: 'none' }, 
                  title: 'Durum filtresi',
                  onClick: (e) => { e.stopPropagation(); setFilterPopup('status') }
                }, '🔽')),
                React.createElement('th', null, t.th_actions),
              )
            ),
            React.createElement('tbody', null,
              filtered.map((it, index) => (
                React.createElement('tr', { 
                  key: it.id,
                  style: {
                    cursor: 'pointer'
                  },
                  onClick: () => setDetail(it)
                },
                  React.createElement('td', null,
                    React.createElement('input', { type: 'checkbox', checked: selected.has(it.id), onChange: (e) => toggleOne(it.id, e.target.checked) })
                  ),
                  React.createElement('td', { style: { whiteSpace: 'nowrap' } }, (it.createdAt||'').slice(0,10)),
                  React.createElement('td', { style: { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '200px' } }, (it.name || '') + (it.company ? ' — ' + it.company : '')),
                  React.createElement('td', { style: { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '150px' } }, (it.proj || '').length > 15 ? (it.proj || '').substring(0, 15) + '...' : (it.proj || '')),
                  React.createElement('td', null, it.material || ''),
                  React.createElement('td', null, String(it.qty ?? '')),
                  React.createElement('td', null, it.due || ''),
                  React.createElement('td', null, (() => {
                    if (!(it.status === 'approved' && it.due)) return ''
                    const days = Math.ceil((new Date(it.due).getTime() - Date.now()) / (1000*60*60*24))
                    const style = days <= 3 ? { color: '#ff6b6b', fontWeight: 600 } : {}
                    return React.createElement('span', { style }, String(days))
                  })()),
                  React.createElement('td', null, (() => {
                    const needsUpdate = needsPriceUpdate(it)
                    return React.createElement('div', { 
                      style: { display: 'flex', alignItems: 'center', gap: '4px' } 
                    },
                      React.createElement('span', null, `₺ ${(it.price || 0).toLocaleString('tr-TR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`),
                      needsUpdate && React.createElement('span', { 
                        style: { color: '#ff6b6b', fontSize: '14px' },
                        title: `Formül değişti! Yeni fiyat: ₺ ${calculatePrice(it).toLocaleString('tr-TR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`
                      }, '❗')
                    )
                  })()),
                  React.createElement('td', null, '16'),
                  React.createElement('td', null, React.createElement('span', { className: 'status ' + (it.status === 'new' ? 'new' : it.status === 'review' ? 'review' : it.status === 'feasible' ? 'feasible' : it.status === 'quoted' ? 'quoted' : it.status === 'approved' ? 'approved' : 'not') }, statusLabel(it.status, t))),
                  React.createElement('td', null,
                    React.createElement('div', { className: 'row actions-row', style: { gap: 8 } },
                      React.createElement('button', { 
                        type: 'button', 
                        className: 'btn', 
                        onClick: (e) => { e.stopPropagation(); setDetail(it) }, 
                        title: t.tt_detail,
                        style: { 
                          padding: '0',
                          borderRadius: '50%',
                          backgroundColor: 'transparent',
                          border: '2px solid white',
                          color: 'white',
                          fontSize: '14px',
                          height: '28px',
                          width: '28px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontWeight: 'bold',
                          fontFamily: 'Arial, sans-serif',
                          cursor: 'pointer',
                          transition: 'all 0.2s ease'
                        },
                        onMouseOver: (e) => e.target.style.backgroundColor = 'rgba(255,255,255,0.2)',
                        onMouseOut: (e) => e.target.style.backgroundColor = 'transparent'
                      }, 'i'),
                      React.createElement('div', { className: 'tt-wrap' },
                        React.createElement('select', {
                          value: it.status,
                          onChange: (e) => { e.stopPropagation(); setItemStatus(it.id, e.target.value) },
                          className: 'btn',
                          style: { padding: '4px 6px', borderRadius: 6, fontSize: '11px', height: '28px', transition: 'all 0.2s ease' },
                          onMouseOver: (e) => e.target.style.backgroundColor = 'rgba(255,255,255,0.1)',
                          onMouseOut: (e) => e.target.style.backgroundColor = '',
                          title: t.tt_change_status
                        },
                          React.createElement('option', { value: 'new' }, t.s_new),
                          React.createElement('option', { value: 'review' }, t.s_review),
                          React.createElement('option', { value: 'feasible' }, t.s_feasible),
                          React.createElement('option', { value: 'not' }, t.s_not),
                        React.createElement('option', { value: 'quoted' }, t.s_quoted),
                        React.createElement('option', { value: 'approved' }, t.s_approved),
                      ),
                        React.createElement('span', { className: 'tt' }, t.tt_change_status)
                      ),
                      React.createElement('button', { 
                        type: 'button', 
                        className: 'btn', 
                        onClick: (e) => { e.stopPropagation(); API.downloadTxt(it.id, it, showNotification) }, 
                        title: t.tt_download_txt,
                        style: { padding: '4px 6px', fontSize: '11px', borderRadius: '4px', height: '28px', transition: 'all 0.2s ease' },
                        onMouseOver: (e) => e.target.style.backgroundColor = 'rgba(255,255,255,0.2)',
                        onMouseOut: (e) => e.target.style.backgroundColor = ''
                      }, 'TXT'),
                      React.createElement('button', { 
                        type: 'button', 
                        className: 'btn danger', 
                        onClick: (e) => { e.stopPropagation(); if (confirm(t.confirm_delete)) remove(it.id) }, 
                        title: t.tt_delete,
                        style: { padding: '4px 6px', fontSize: '11px', borderRadius: '4px', height: '28px', transition: 'all 0.2s ease' },
                        onMouseOver: (e) => e.target.style.backgroundColor = 'rgba(255,255,255,0.2)',
                        onMouseOut: (e) => e.target.style.backgroundColor = ''
                      }, t.a_delete),
                    )
                  )
                )
              ))
            )
          )
        )
      )
    ),

    detail ? React.createElement(DetailModal, { item: detail, onClose: () => setDetail(null), setItemStatus, onSaved: refresh, t, showNotification }) : null,
    creating ? React.createElement(DetailModal, { item: {}, isNew: true, onClose: () => setCreating(false), onSaved: () => { setCreating(false); refresh() }, t, showNotification }) : null,
    filterPopup ? React.createElement(FilterPopup, { 
      type: filterPopup, 
      filters: filters, 
      filterOptions: filterOptions, 
      onClose: () => setFilterPopup(null), 
      onUpdateFilter: updateFilter, 
      t: t 
    }) : null,
    settingsModal ? React.createElement(SettingsModal, { 
      onClose: () => setSettingsModal(false), 
      onSettingsUpdated: loadPriceSettings,
      t: t,
      showNotification: showNotification
    }) : null
  )
}

export default Admin
