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
      // Refresh quote list when settings change to show updated price warnings
      await refresh()
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
            // Calculate area from numeric dims if present; fallback to parsing string
            const l = parseFloat(quote.dimsL)
            const w = parseFloat(quote.dimsW)
            if (!isNaN(l) && !isNaN(w)) {
              value = l * w
            } else {
              const dims = quote.dims || ''
              const match = String(dims).match(/(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)/i)
              if (match) {
                value = (parseFloat(match[1]) || 0) * (parseFloat(match[2]) || 0)
              }
            }
          } else {
            // For fields with lookup table or arrays
            const fieldValue = quote[param.formField]
            if (Array.isArray(fieldValue)) {
              if (param.lookupTable && param.lookupTable.length > 0) {
                value = fieldValue.reduce((sum, opt) => {
                  const found = param.lookupTable.find(item => item.option === opt)
                  return sum + (found ? (parseFloat(found.value) || 0) : 0)
                }, 0)
              } else {
                value = fieldValue.length || 0
              }
            } else if (param.lookupTable && param.lookupTable.length > 0) {
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

      // Evaluate formula with comprehensive math functions
      let formula = priceSettings.formula.replace(/^=/, '') // Remove leading =
      
      // Replace parameter IDs with actual values
      Object.keys(paramValues).forEach(paramId => {
        const regex = new RegExp(`\\b${paramId}\\b`, 'g')
        formula = formula.replace(regex, paramValues[paramId])
      })

      // Create comprehensive math context matching server-side
      const mathContext = {
        // Basic Math Functions
        SQRT: Math.sqrt,
        ROUND: Math.round,
        MAX: Math.max,
        MIN: Math.min,
        ABS: Math.abs,
        POWER: Math.pow,
        POW: Math.pow,
        EXP: Math.exp,
        LN: Math.log,
        LOG: Math.log10,
        LOG10: Math.log10,
        
        // Trigonometric Functions
        SIN: Math.sin,
        COS: Math.cos,
        TAN: Math.tan,
        ASIN: Math.asin,
        ACOS: Math.acos,
        ATAN: Math.atan,
        ATAN2: Math.atan2,
        
        // Rounding Functions
        CEILING: Math.ceil,
        CEIL: Math.ceil,
        FLOOR: Math.floor,
        TRUNC: Math.trunc,
        ROUNDUP: (num, digits = 0) => Math.ceil(num * Math.pow(10, digits)) / Math.pow(10, digits),
        ROUNDDOWN: (num, digits = 0) => Math.floor(num * Math.pow(10, digits)) / Math.pow(10, digits),
        
        // Statistical Functions
        AVERAGE: (...args) => args.reduce((a, b) => a + b, 0) / args.length,
        SUM: (...args) => args.reduce((a, b) => a + b, 0),
        COUNT: (...args) => args.filter(x => typeof x === 'number' && !isNaN(x)).length,
        COUNTA: (...args) => args.filter(x => x != null && x !== '').length,
        
        // Logical Functions
        IF: (condition, trueValue, falseValue) => condition ? trueValue : falseValue,
        AND: (...args) => args.every(arg => Boolean(arg)),
        OR: (...args) => args.some(arg => Boolean(arg)),
        NOT: (value) => !Boolean(value),
        
        // Text Functions
        LEN: (text) => String(text || '').length,
        LEFT: (text, num) => String(text || '').substring(0, num),
        RIGHT: (text, num) => String(text || '').substring(String(text || '').length - num),
        MID: (text, start, num) => String(text || '').substring(start - 1, start - 1 + num),
        UPPER: (text) => String(text || '').toUpperCase(),
        LOWER: (text) => String(text || '').toLowerCase(),
        
        // Constants
        PI: Math.PI,
        E: Math.E,
        
        // Custom Functions for Business Logic
        MARGIN: (cost, markup) => cost * (1 + markup / 100),
        DISCOUNT: (price, discountPercent) => price * (1 - discountPercent / 100),
        VAT: (amount, vatRate) => amount * (1 + vatRate / 100),
        MARKUP: (cost, marginPercent) => cost / (1 - marginPercent / 100),
        
        // Range/Array Functions (simplified)
        SUMPRODUCT: (...pairs) => {
          if (pairs.length % 2 !== 0) return 0;
          let sum = 0;
          for (let i = 0; i < pairs.length; i += 2) {
            sum += pairs[i] * pairs[i + 1];
          }
          return sum;
        }
      }

      // Add math functions to formula context
      let evalCode = Object.keys(mathContext).map(key => `const ${key} = ${mathContext[key]};`).join(' ')
      evalCode += `return (${formula});`
      
      const result = Function('"use strict"; ' + evalCode)()
      return isNaN(result) ? (quote.price || 0) : result
      
    } catch (e) {
      console.error('Price calculation error:', e)
      return quote.price || 0
    }
  }

  // Check if calculated price differs significantly from stored price - OPTIMIZED
  function needsPriceUpdate(quote) {
    if (!priceSettings || !priceSettings.parameters || !priceSettings.formula) {
      return false
    }
    
    try {
      // Check if settings have been updated after quote was last calculated
      const settingsUpdated = priceSettings.lastUpdated || null
      const quoteCalculated = quote.priceCalculatedAt || quote.createdAt || null
      
      // If settings were updated after quote calculation, show update warning
      const settingsNewer = settingsUpdated && quoteCalculated && 
        new Date(settingsUpdated).getTime() > new Date(quoteCalculated).getTime()
      
      const calculatedPrice = calculatePrice(quote)
      const storedPrice = parseFloat(quote.price) || 0
      
      // Only show warning if there's a significant price difference (>1%) OR settings are newer
      const priceThreshold = Math.max(storedPrice * 0.01, 0.5) // 1% or minimum 0.5 TL
      const priceDiffers = Math.abs(calculatedPrice - storedPrice) > priceThreshold
      
      const needsUpdate = priceDiffers || settingsNewer
      
      // Log for debugging (remove in production)
      if (needsUpdate) {
        console.log(`Price update needed for quote ${quote.id}:`, {
          calculatedPrice: calculatedPrice.toFixed(2),
          storedPrice: storedPrice.toFixed(2),
          difference: (calculatedPrice - storedPrice).toFixed(2),
          threshold: priceThreshold.toFixed(2),
          settingsNewer,
          settingsUpdated,
          quoteCalculated
        })
      }
      
      return needsUpdate
      
    } catch (e) {
      console.error('Price calculation error for needsPriceUpdate:', e)
      return false
    }
  }

  // Popup for price update
  const [priceReview, setPriceReview] = useState(null) // { item, newPrice }
  async function applyNewPrice(item) {
    try {
      const newPrice = calculatePrice(item)
      await API.updateQuote(item.id, { 
        price: Number(newPrice), 
        priceUpdatedAt: new Date().toISOString(), 
        priceSettingsStamp: priceSettings && priceSettings.lastUpdated ? priceSettings.lastUpdated : null 
      })
      showNotification && showNotification('Fiyat güncellendi', 'success')
      setPriceReview(null)
      refresh()
    } catch (e) {
      console.error(e)
      showNotification && showNotification('Fiyat güncellenemedi', 'error')
    }
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
                  React.createElement('td', { 
                    onClick: (e) => e.stopPropagation() // Prevent row click when clicking checkbox
                  },
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
                      style: { display: 'flex', alignItems: 'center', gap: '6px' } 
                    },
                      React.createElement('span', null, `₺ ${(it.price || 0).toLocaleString('tr-TR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`),
                      needsUpdate && React.createElement('button', { 
                        className: 'btn danger',
                        style: { 
                          padding: '2px 8px', 
                          fontSize: '11px', 
                          lineHeight: '18px', 
                          height: '22px',
                          backgroundColor: '#ff4444',
                          color: 'white',
                          border: 'none',
                          borderRadius: '4px',
                          fontWeight: 'bold',
                          animation: 'pulse 1.5s infinite',
                          boxShadow: '0 2px 4px rgba(255,68,68,0.3)'
                        },
                        title: `Fiyat güncellenmeli! Formül veya parametreler değişti.` ,
                        onClick: (e) => { e.stopPropagation(); setPriceReview({ item: it, newPrice: calculatePrice(it) }) }
                      }, '⚠ GÜNCELLE')
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
    }) : null,
    priceReview ? (function () {
      const pr = priceReview
      const overlay = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)' }
      const box = { position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', background: '#111', color: '#fff', padding: 16, borderRadius: 8, width: 320 }
      return React.createElement(React.Fragment, null,
        React.createElement('div', { style: overlay, onClick: () => setPriceReview(null) }),
        React.createElement('div', { style: box },
          React.createElement('h3', { style: { marginTop: 0 } }, 'Yeni fiyat önerisi'),
          React.createElement('div', { style: { margin: '8px 0 16px' } }, `Hesaplanan: ₺ ${Number(pr.newPrice || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`),
          React.createElement('div', { style: { display: 'flex', gap: 8, justifyContent: 'flex-end' } },
            React.createElement('button', { className: 'btn', onClick: () => setPriceReview(null) }, 'Kapat'),
            React.createElement('button', { className: 'btn accent', onClick: () => applyNewPrice(pr.item) }, 'Fiyatı Güncelle')
          )
        )
      )
    })() : null
  )
}

export default Admin
