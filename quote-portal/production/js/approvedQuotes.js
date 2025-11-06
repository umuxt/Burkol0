// Approved Quotes listing (read-only). Uses backend API only.
import { API_BASE, withAuth } from '../../shared/lib/api.js'
import { updateProductionState } from './mesApi.js'

let quotesState = []
let selectedQuoteId = null
let queryFilter = ''
let approvedChannel = null
let productionPlansMap = {} // Map of workOrderCode to production plan data
// Filters state for Approved Quotes
const aqFilters = {
  planTypes: new Set(), // 'production' | 'template' | 'none'
  states: new Set(),    // labels from PRODUCTION_STATES
  deliveryFrom: '',     // YYYY-MM-DD
  deliveryTo: ''
}
// Plan type toggle helper (cycles: all -> production -> template -> all)
function toggleAQPlanType() {
  const hasProd = aqFilters.planTypes.has('production')
  const hasTpl = aqFilters.planTypes.has('template')
  if (!hasProd && !hasTpl) {
    aqFilters.planTypes.clear(); aqFilters.planTypes.add('production')
  } else if (hasProd) {
    aqFilters.planTypes.clear(); aqFilters.planTypes.add('template')
  } else {
    aqFilters.planTypes.clear()
  }
  updateAQFilterBadges()
  renderApprovedQuotesTable()
}

// Production state management - simulated for UI only
let productionStates = {} // Map of workOrderCode to production state

// Production state constants
const PRODUCTION_STATES = {
  WAITING_APPROVAL: 'Üretim Onayı Bekliyor',
  IN_PRODUCTION: 'Üretiliyor', 
  PAUSED: 'Üretim Durduruldu',
  COMPLETED: 'Üretim Tamamlandı',
  CANCELLED: 'İptal Edildi'
}

export async function initializeApprovedQuotesUI() {
  // Subscribe to cross-tab notifications from Quotes dashboard
  try {
    approvedChannel = new BroadcastChannel('mes-approved-quotes')
    approvedChannel.onmessage = (e) => {
      const data = e?.data || {}
      if (data && (data.type === 'approvedCreated' || data.type === 'refresh')) {
        if (data.quoteId) {
          ensureApprovedQuote(data.quoteId).finally(() => loadQuotesAndRender())
        } else {
          loadQuotesAndRender()
        }
      }
    }
  } catch {}

  const search = document.getElementById('approved-quotes-search')
  if (search) {
    search.addEventListener('input', (e) => {
      queryFilter = String(e.target.value || '').toLowerCase()
      renderApprovedQuotesTable()
    })
  }
  // Default to show completed (production) plans
  try { aqFilters.planTypes.add('production') } catch {}
  updateAQFilterBadges()
  // Also bind filter toggle buttons (in case inline onclick isn't executed)
  const btnPlan = document.getElementById('aq-filter-plan-type-btn')
  if (btnPlan) btnPlan.addEventListener('click', () => toggleAQPlanType())
  const btnState = document.getElementById('aq-filter-state-btn')
  if (btnState) btnState.addEventListener('click', () => toggleAQFilterPanel('state'))
  const btnDel = document.getElementById('aq-filter-delivery-btn')
  if (btnDel) btnDel.addEventListener('click', () => toggleAQFilterPanel('delivery'))
  const btnClearAll = document.getElementById('aq-filter-clear-all')
  if (btnClearAll) btnClearAll.addEventListener('click', clearAllAQFilters)
  
  // Add event listeners for panel controls that used to use onclick
  setupPanelEventListeners()
  
  // Initialize complete
  await loadQuotesAndRender()
}

// Setup event listeners for panel controls
function setupPanelEventListeners() {
  // State panel controls - use more specific selectors
  const stateButtons = document.querySelectorAll('#aq-filter-state-panel button')
  stateButtons.forEach(btn => {
    if (btn.textContent.trim() === 'Clear') {
      btn.addEventListener('click', () => clearAQFilter('state'))
    } else if (btn.title === 'Close') {
      btn.addEventListener('click', () => hideAQFilterPanel('state'))
    }
  })
  
  // Delivery panel controls
  const deliveryButtons = document.querySelectorAll('#aq-filter-delivery-panel button')
  deliveryButtons.forEach(btn => {
    if (btn.textContent.trim() === 'Clear') {
      btn.addEventListener('click', () => clearAQFilter('delivery'))
    } else if (btn.title === 'Close') {
      btn.addEventListener('click', () => hideAQFilterPanel('delivery'))
    } else if (btn.textContent.trim() === 'Apply') {
      btn.addEventListener('click', () => applyAQDeliveryFilter())
    }
  })
  
  // Gecikmiş workorderlar butonu
  const overdueBtn = document.getElementById('aq-filter-delivery-overdue')
  if (overdueBtn) {
    overdueBtn.addEventListener('click', () => applyOverdueFilter())
  }
  
  // Hızlı seçim butonları
  const quickSelectBtns = document.querySelectorAll('.quick-select-btn')
  quickSelectBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      const days = parseInt(e.target.getAttribute('data-days'))
      applyQuickDateFilter(days)
    })
  })
  
  // State filter checkboxes using data-state attribute
  const stateCheckboxes = document.querySelectorAll('#aq-filter-state-panel input[type="checkbox"][data-state]')
  stateCheckboxes.forEach(checkbox => {
    const stateValue = checkbox.getAttribute('data-state')
    if (stateValue) {
      checkbox.addEventListener('change', (e) => {
        onAQFilterChange('state', stateValue, e.target.checked)
      })
    }
  })
}

// Optional: expose manual refresh hook for other apps to call directly
try { window.refreshApprovedQuotes = () => loadQuotesAndRender() } catch {}

// Production state management functions
function getProductionState(workOrderCode) {
  // First check if we have it from server data
  const quote = quotesState.find(q => (q.workOrderCode || q.id || q.quoteId) === workOrderCode)
  if (quote && quote.productionState) {
    return quote.productionState
  }
  
  // Fallback to local state or default
  return productionStates[workOrderCode] || PRODUCTION_STATES.WAITING_APPROVAL
}

async function setProductionState(workOrderCode, newState) {
  try {
    // Update in Firebase via API
    await updateProductionState(workOrderCode, newState)
    
    // Update local state
    productionStates[workOrderCode] = newState
    
    // Update the quote in quotesState as well
    const quoteIndex = quotesState.findIndex(q => (q.workOrderCode || q.id || q.quoteId) === workOrderCode)
    if (quoteIndex !== -1) {
      quotesState[quoteIndex].productionState = newState
    }
    
    renderApprovedQuotesTable()
    console.log(`Production state updated to ${newState} for ${workOrderCode}`)
  } catch (error) {
    console.error('Failed to update production state:', error)
    alert('Üretim durumu güncellenirken hata oluştu. Lütfen tekrar deneyin.')
  }
}

async function startProduction(workOrderCode) {
  await setProductionState(workOrderCode, PRODUCTION_STATES.IN_PRODUCTION)
}

async function pauseProduction(workOrderCode) {
  await setProductionState(workOrderCode, PRODUCTION_STATES.PAUSED)
}

async function resumeProduction(workOrderCode) {
  await setProductionState(workOrderCode, PRODUCTION_STATES.IN_PRODUCTION)
}

async function completeProduction(workOrderCode) {
  await setProductionState(workOrderCode, PRODUCTION_STATES.COMPLETED)
}

async function cancelProduction(workOrderCode) {
  // Show confirmation dialog
  const confirmed = confirm('Tüm İşlemi Sonlandırmak İstediğinizden Emin misiniz?\n\nBu işlemin geri dönüşü yoktur.')
  
  if (confirmed) {
    await setProductionState(workOrderCode, PRODUCTION_STATES.CANCELLED)
  }
}

// Expose functions globally for onclick handlers
window.startProduction = startProduction
window.pauseProduction = pauseProduction
window.resumeProduction = resumeProduction
window.completeProduction = completeProduction
window.cancelProduction = cancelProduction

async function ensureApprovedQuote(quoteId) {
  try {
    const res = await fetch(`${API_BASE}/api/mes/approved-quotes/ensure`, {
      method: 'POST',
      headers: withAuth({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ quoteId })
    })
    // Ignore non-200s silently; listing will still refresh
    await res.json().catch(() => ({}))
  } catch {}
}

async function fetchProductionPlans() {
  try {
    // Fetch both production plans and templates
    const [plansRes, templatesRes] = await Promise.all([
      fetch(`${API_BASE}/api/mes/production-plans?_t=${Date.now()}`, { headers: withAuth() }),
      fetch(`${API_BASE}/api/mes/templates?_t=${Date.now()}`, { headers: withAuth() })
    ])
    
    const plansData = plansRes.ok ? await plansRes.json() : { productionPlans: [] }
    const templatesData = templatesRes.ok ? await templatesRes.json() : { templates: [] }
    
    const plans = Array.isArray(plansData?.productionPlans) ? plansData.productionPlans : []
    const templates = Array.isArray(templatesData?.templates) ? templatesData.templates : []
    
    // Create a map of orderCode to plan data
    productionPlansMap = {}
    
    // Add production plans
    plans.forEach(plan => {
      if (plan.orderCode) {
        productionPlansMap[plan.orderCode] = {
          id: plan.id,
          name: plan.name,
          type: 'production'
        }
      }
    })
    
    // Add templates
    templates.forEach(template => {
      if (template.orderCode) {
        productionPlansMap[template.orderCode] = {
          id: template.id,
          name: template.name,
          type: 'template'
        }
      }
    })
  } catch (e) {
    console.error('Failed to fetch production plans:', e)
    productionPlansMap = {}
  }
}

async function loadQuotesAndRender() {
  const tbody = document.getElementById('approved-quotes-table-body')
  if (tbody) tbody.innerHTML = '<tr><td colspan="7"><em>Loading quotes...</em></td></tr>'
  try {
    // Load both quotes and production plans in parallel
    const [quotesRes] = await Promise.all([
      fetch(`${API_BASE}/api/mes/approved-quotes?_t=${Date.now()}`, { headers: withAuth() }),
      fetchProductionPlans()
    ])
    
    if (!quotesRes.ok) throw new Error(`quotes_load_failed ${quotesRes.status}`)
    const data = await quotesRes.json()
    // API returns { approvedQuotes }
    const rows = Array.isArray(data?.approvedQuotes) ? data.approvedQuotes : []
    quotesState = rows
    renderApprovedQuotesTable()
  } catch (e) {
    console.error('Approved quotes load error:', e)
    if (tbody) tbody.innerHTML = '<tr><td colspan="7" style="color:#ef4444;">Quotes yüklenemedi.</td></tr>'
  }
}

function renderApprovedQuotesTable() {
  const tbody = document.getElementById('approved-quotes-table-body')
  if (!tbody) return

  let rows = quotesState
  if (queryFilter) {
    rows = rows.filter(q => {
      const hay = `${q.id || ''} ${q.name || ''} ${q.customer || ''} ${q.company || ''} ${q.email || ''}`.toLowerCase()
      return hay.includes(queryFilter)
    })
  }

  // Apply advanced filters
  rows = rows.filter(q => {
    const idForRow = q.workOrderCode || q.id || q.quoteId || ''
    const plan = productionPlansMap[idForRow]
    const planType = plan ? plan.type : 'none'

    // Plan type filter
    if (aqFilters.planTypes.size > 0 && !aqFilters.planTypes.has(planType)) return false

    // Delivery date range filter
    const deliveryDate = q.deliveryDate || (q.quoteSnapshot && q.quoteSnapshot.deliveryDate) || ''
    if (aqFilters.deliveryFrom || aqFilters.deliveryTo) {
      const parseYMD = (str) => {
        if (typeof str !== 'string') return new Date('');
        const m = str.trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
        if (m) return new Date(parseInt(m[1],10), parseInt(m[2],10)-1, parseInt(m[3],10))
        return new Date(str)
      }
      const d = parseYMD(deliveryDate)
      if (aqFilters.deliveryFrom) {
        const from = parseYMD(aqFilters.deliveryFrom)
        if (!(d instanceof Date) || isNaN(d.getTime()) || d < from) return false
      }
      if (aqFilters.deliveryTo) {
        const to = parseYMD(aqFilters.deliveryTo)
        if (!(d instanceof Date) || isNaN(d.getTime()) || d > to) return false
      }
    }

    // Production state filter (only meaningful if has production plan)
    if (aqFilters.states.size > 0) {
      if (!plan || planType !== 'production') return false
      const st = getProductionState(idForRow)
      if (!aqFilters.states.has(st)) return false
    }

    return true
  })

  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="7"><em>Kayıt bulunamadı</em></td></tr>'
    return
  }

  tbody.innerHTML = rows.map(q => {
    const customer = q.customer || q.name || '-'
    const company = q.company || '-'
    const idForRow = q.workOrderCode || q.id || q.quoteId || ''
    const deliveryDate = q.deliveryDate || (q.quoteSnapshot && q.quoteSnapshot.deliveryDate) || ''
    const esc = (s) => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]))
    
    // Build delivery date cell with remaining/overdue badge
    let deliveryCell = '-'
    if (deliveryDate) {
      // Robust parser for YYYY-M-D or YYYY-MM-DD strings (Safari-safe)
      const parseYMD = (str) => {
        if (typeof str !== 'string') return new Date('');
        const m = str.trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
        if (m) {
          const y = parseInt(m[1], 10);
          const mo = parseInt(m[2], 10) - 1;
          const d = parseInt(m[3], 10);
          return new Date(y, mo, d);
        }
        // Fallback to native parsing
        return new Date(str);
      }
      const msPerDay = 24 * 60 * 60 * 1000
      const toMidnight = (d) => { const x = new Date(d); x.setHours(0,0,0,0); return x }
      const today = toMidnight(new Date())
      const d = parseYMD(deliveryDate)
      if (!isNaN(d.getTime())) {
        const due = toMidnight(d)
        const daysDiff = Math.ceil((due - today) / msPerDay)
        if (daysDiff >= 0) {
          const badge = `<span style=\"margin-left:6px; font-size:11px; padding:2px 6px; border-radius: 10px; background: #dcfce7; color: #166534; border: 1px solid #bbf7d0; font-weight: 600;\">${daysDiff}</span>`
          deliveryCell = `${esc(deliveryDate)} ${badge}`
        } else {
          const overdue = Math.abs(daysDiff)
          const late = `<span style=\"margin-left:6px; font-size:11px; padding:2px 6px; border-radius: 4px; background: #fee2e2; color: #dc2626; border: 1px solid #fecaca; font-weight: 600;\">${overdue} gün gecikti</span>`
          deliveryCell = `${esc(deliveryDate)} ${late}`
        }
      } else {
        deliveryCell = esc(deliveryDate)
      }
    }
    
    // Get production plan info
    let planCell = '-'
    const plan = productionPlansMap[idForRow]
    if (plan) {
      const fullPlanId = plan.id || ''
      const shortPlanId = fullPlanId.length > 10 ? fullPlanId.slice(-10) : fullPlanId
      const planName = plan.name || ''
      const typeIcon = plan.type === 'production' ? '✅' : '☑️'
      const actionIcon = plan.type === 'production' ? '👁️' : '✏️'
      const actionMode = plan.type === 'production' ? 'view' : 'edit'
      const planUrl = `../pages/production.html?${actionMode}PlanId=${encodeURIComponent(fullPlanId)}&orderCode=${encodeURIComponent(idForRow)}`
      planCell = `<span style=\\"display:inline-flex; align-items:center; gap:4px;\\">${shortPlanId} / ${planName} ${typeIcon}<button onclick="event.stopPropagation(); window.open('${planUrl}', '_blank')" style="border:none; background:transparent; cursor:pointer; font-size:12px; line-height:1; padding:0 2px; vertical-align:baseline;" title="${actionMode === 'view' ? 'View Plan' : 'Edit Plan'}">${actionIcon}</button></span>`
    } else {
      // No production plan exists - show create button
      const createPlanUrl = `../pages/production.html?view=plan-designer&action=create&orderCode=${encodeURIComponent(idForRow)}`
      planCell = `<span style=\\"display:inline-flex; align-items:center;\\"><button onclick="event.stopPropagation(); window.open('${createPlanUrl}', '_blank')" style="background: var(--primary); color: var(--primary-foreground); padding: 3px 8px; border: none; border-radius: 4px; font-size: 11px; font-weight: 500; cursor: pointer; white-space: nowrap; line-height:1; height:22px; display:inline-flex; align-items:center;" title="Üretim Planı Oluştur">+ Üretim Planı Oluştur</button></span>`
    }

    // Production state/actions only visible if a production plan exists
    const hasProductionPlan = !!plan && plan.type === 'production'
    let productionStateCell = '<span style=\"font-size:11px; color:#6b7280;\">—</span>'
    let actionsCell = ''
    if (hasProductionPlan) {
      const currentState = getProductionState(idForRow)
      let stateColor = '#6b7280'
      switch(currentState) {
        case PRODUCTION_STATES.WAITING_APPROVAL:
          stateColor = '#f59e0b'; break
        case PRODUCTION_STATES.IN_PRODUCTION:
          stateColor = '#10b981'; break
        case PRODUCTION_STATES.PAUSED:
          stateColor = '#ef4444'; break
        case PRODUCTION_STATES.COMPLETED:
          stateColor = '#3b82f6'; break
        case PRODUCTION_STATES.CANCELLED:
          stateColor = '#6b7280'; break
      }
      productionStateCell = `<div style=\"color: ${stateColor}; font-weight: 600; font-size: 12px;\">${esc(currentState)}</div>`

      const buttonStyle = 'border: none; background: transparent; cursor: pointer; font-size: 11px; padding: 3px 6px; margin: 1px; border-radius: 3px; white-space: nowrap; display: inline-block;'
      if (currentState === PRODUCTION_STATES.WAITING_APPROVAL) {
        actionsCell += `<button onclick=\"event.stopPropagation(); startProduction('${esc(idForRow)}')\" style=\"${buttonStyle} background: #dcfce7; color: #166534;\" title=\"Üretimi Başlat\">🏁 Başlat</button>`
      } else if (currentState === PRODUCTION_STATES.IN_PRODUCTION) {
        actionsCell += `<button onclick=\"event.stopPropagation(); pauseProduction('${esc(idForRow)}')\" style=\"${buttonStyle} background: #fef3c7; color: #92400e;\" title=\"Üretimi Durdur\">⏹️ Durdur</button>`
      } else if (currentState === PRODUCTION_STATES.PAUSED) {
        actionsCell += `<button onclick=\"event.stopPropagation(); resumeProduction('${esc(idForRow)}')\" style=\"${buttonStyle} background: #dbeafe; color: #1d4ed8;\" title=\"Üretime Devam Et\">▶️ Devam Et</button>`
      } else if (currentState === PRODUCTION_STATES.COMPLETED) {
        actionsCell += `<span style=\"color: #3b82f6; font-size: 11px;\">✅ Tamamlandı</span>`
      } else if (currentState === PRODUCTION_STATES.CANCELLED) {
        actionsCell = `<span style=\"color: #6b7280; font-size: 11px;\">❌ İptal Edildi</span>`
      }

      if (currentState !== PRODUCTION_STATES.CANCELLED) {
        actionsCell += ` <button onclick=\"event.stopPropagation(); cancelProduction('${esc(idForRow)}')\" style=\"${buttonStyle} background: #fee2e2; color: #dc2626;\" title=\"İptal Et\">❌ İptal Et</button>`
      }
    }

    return `
      <tr data-quote-id="${esc(idForRow)}" onclick="showApprovedQuoteDetail('${esc(idForRow)}')" style="cursor: pointer;">
        <td style="padding:8px; border-bottom:1px solid var(--border);"><strong>${esc(idForRow)}</strong></td>
        <td style="padding:8px; border-bottom:1px solid var(--border);">${esc(customer)}</td>
        <td style="padding:8px; border-bottom:1px solid var(--border);">${esc(company)}</td>
        <td style="padding:8px; border-bottom:1px solid var(--border);">${deliveryCell}</td>
        <td style="padding:8px; border-bottom:1px solid var(--border);">${planCell}</td>
        <td style="padding:8px; border-bottom:1px solid var(--border);">${productionStateCell}</td>
        <td style="padding:8px; border-bottom:1px solid var(--border);">${actionsCell}</td>
      </tr>
    `
  }).join('')

  // If details are open, keep only Quote # and Company visible
  setTableDetailMode(Boolean(selectedQuoteId))
}

// Panel helpers (inline onclick targets)
function toggleAQFilterPanel(type) {
  const panel = document.getElementById(`aq-filter-${type}-panel`)
  const btn = document.getElementById(`aq-filter-${type}-btn`)
  if (!panel || !btn) return
  const willShow = (panel.style.display === 'none' || !panel.style.display)
  if (willShow) {
    // Render as body-level floating panel to avoid clipping
    try {
      const rect = btn.getBoundingClientRect()
      panel.style.position = 'fixed'
      panel.style.top = `${Math.round(rect.bottom + 6)}px`
      panel.style.left = 'auto'
      panel.style.right = `${Math.round(window.innerWidth - rect.right)}px`
      panel.style.zIndex = '10000'
      if (panel.parentElement !== document.body) document.body.appendChild(panel)
      panel.style.display = 'block'
      // One‑off click outside to close
      const closer = (e) => {
        if (!panel.contains(e.target) && e.target !== btn) {
          panel.style.display = 'none'
          document.removeEventListener('mousedown', closer)
        }
      }
      document.addEventListener('mousedown', closer)
    } catch { panel.style.display = 'block' }
  } else {
    panel.style.display = 'none'
  }
}
function hideAQFilterPanel(type) {
  const el = document.getElementById(`aq-filter-${type}-panel`)
  if (el) el.style.display = 'none'
}
function onAQFilterChange(type, value, checked) {
  const set = (type === 'planType') ? aqFilters.planTypes : aqFilters.states
  if (checked) set.add(value)
  else set.delete(value)
  updateAQFilterBadges()
  renderApprovedQuotesTable()
}
function clearAQFilter(type) {
  if (type === 'planType') aqFilters.planTypes.clear()
  else if (type === 'state') aqFilters.states.clear()
  else if (type === 'delivery') { aqFilters.deliveryFrom = ''; aqFilters.deliveryTo = '';
    const f = document.getElementById('aq-filter-delivery-from'); if (f) f.value = ''
    const t = document.getElementById('aq-filter-delivery-to'); if (t) t.value = ''
  }
  updateAQFilterBadges()
  renderApprovedQuotesTable()
}
function clearAllAQFilters() {
  aqFilters.planTypes.clear(); aqFilters.states.clear(); aqFilters.deliveryFrom = ''; aqFilters.deliveryTo = ''
  const f = document.getElementById('aq-filter-delivery-from'); if (f) f.value = ''
  const t = document.getElementById('aq-filter-delivery-to'); if (t) t.value = ''
  // Uncheck all checkboxes in panels
  document.querySelectorAll('#aq-filter-plan-type-panel input[type=checkbox], #aq-filter-state-panel input[type=checkbox]').forEach(cb => cb.checked = false)
  updateAQFilterBadges()
  renderApprovedQuotesTable()
}
function applyAQDeliveryFilter() {
  const f = document.getElementById('aq-filter-delivery-from')
  const t = document.getElementById('aq-filter-delivery-to')
  aqFilters.deliveryFrom = (f && f.value) || ''
  aqFilters.deliveryTo = (t && t.value) || ''
  updateAQFilterBadges()
  hideAQFilterPanel('delivery')
  renderApprovedQuotesTable()
}

// Gecikmiş workorderları filtrele
function applyOverdueFilter() {
  const today = new Date().toISOString().split('T')[0] // YYYY-MM-DD format
  aqFilters.deliveryFrom = ''
  aqFilters.deliveryTo = today
  
  // Input alanlarını da güncelle
  const f = document.getElementById('aq-filter-delivery-from')
  const t = document.getElementById('aq-filter-delivery-to')
  if (f) f.value = ''
  if (t) t.value = today
  
  updateAQFilterBadges()
  hideAQFilterPanel('delivery')
  renderApprovedQuotesTable()
}

// Hızlı tarih filtreleri (X gün kaldı)
function applyQuickDateFilter(days) {
  const today = new Date()
  const targetDate = new Date(today)
  targetDate.setDate(today.getDate() + days)
  
  const todayStr = today.toISOString().split('T')[0]
  const targetStr = targetDate.toISOString().split('T')[0]
  
  aqFilters.deliveryFrom = todayStr
  aqFilters.deliveryTo = targetStr
  
  // Input alanlarını da güncelle
  const f = document.getElementById('aq-filter-delivery-from')
  const t = document.getElementById('aq-filter-delivery-to')
  if (f) f.value = todayStr
  if (t) t.value = targetStr
  
  updateAQFilterBadges()
  hideAQFilterPanel('delivery')
  renderApprovedQuotesTable()
}

function updateAQFilterBadges() {
  const planCount = document.getElementById('aq-filter-plan-type-count')
  if (planCount) planCount.textContent = ''
  const planLabel = document.getElementById('aq-filter-plan-type-label')
  if (planLabel) {
    const hasProd = aqFilters.planTypes.has('production')
    const hasTpl = aqFilters.planTypes.has('template')
    if (hasProd) planLabel.textContent = 'Tamamlanan Planlar'
    else if (hasTpl) planLabel.textContent = 'Taslak Planlar'
    else planLabel.textContent = 'Plan'
  }
  const stateCount = document.getElementById('aq-filter-state-count')
  if (stateCount) stateCount.textContent = aqFilters.states.size ? `(${aqFilters.states.size})` : ''
  const del = document.getElementById('aq-filter-delivery-summary')
  if (del) {
    if (aqFilters.deliveryFrom || aqFilters.deliveryTo) {
      del.textContent = `${aqFilters.deliveryFrom || '—'} → ${aqFilters.deliveryTo || '—'}`
    } else del.textContent = ''
  }
  const clearAll = document.getElementById('aq-filter-clear-all')
  if (clearAll) {
    const any = aqFilters.planTypes.size || aqFilters.states.size || aqFilters.deliveryFrom || aqFilters.deliveryTo
    clearAll.style.display = any ? 'inline-flex' : 'none'
  }
}

// Expose helpers for inline HTML onclicks - moved to main.js to avoid conflicts
// try {
//   Object.assign(window, { toggleAQFilterPanel, hideAQFilterPanel, onAQFilterChange, clearAQFilter, clearAllAQFilters, applyAQDeliveryFilter, toggleAQPlanType })
// } catch {}

export function showApprovedQuoteDetail(id) {
  selectedQuoteId = id
  // Find by any of identifiers (WO code used as id)
  const q = quotesState.find(x => x.id === id || x.workOrderCode === id || x.quoteId === id)
  const panel = document.getElementById('approved-quote-detail-panel')
  const content = document.getElementById('approved-quote-detail-content')
  if (!panel || !content) return
  panel.style.display = 'block'

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]))
  const field = (label, value) => `
    <div style="display:flex; gap:8px; align-items:center; margin-bottom:6px;">
      <div style="min-width:140px; font-weight:600; font-size:12px; color:#374151;">${esc(label)}</div>
      <div style="font-size:12px; color:#111827;">${esc(value ?? '-')}</div>
    </div>`

  const files = Array.isArray(q?.uploadedFiles) ? q.uploadedFiles : (Array.isArray(q?.quoteSnapshot?.uploadedFiles) ? q.quoteSnapshot.uploadedFiles : [])
  const filesHtml = files.length
    ? `<ul style="margin:0; padding-left:18px;">${files.map(f => `<li><a href="${esc(f.url || f.path || '#')}" target="_blank" rel="noopener">${esc(f.name || f.fileName || 'file')}</a></li>`).join('')}</ul>`
    : '<span style="font-size:12px; color:#6b7280;">Dosya yok</span>'

  content.innerHTML = `
    <div style="margin-bottom: 12px;">
      <div style="font-weight:600; font-size:14px; margin-bottom:4px;">Temel Bilgiler</div>
      ${field('WO Kodu', q?.workOrderCode || q?.id)}
      ${field('Teklif #', q?.quoteId || q?.quoteSnapshot?.id)}
      ${field('Durum', q?.status)}
      ${field('Teslim Tarihi', q?.deliveryDate || q?.quoteSnapshot?.deliveryDate || '-')}
      ${field('Toplam Fiyat', (q?.price != null ? `₺${Number(q.price).toFixed(2)}` : '-'))}
      ${field('Oluşturulma', q?.createdAt ? new Date(q.createdAt).toLocaleString() : '-')}
    </div>
    <div style="margin-bottom: 12px;">
      <div style="font-weight:600; font-size:14px; margin-bottom:4px;">Müşteri</div>
      ${field('Ad Soyad', q?.customer || q?.name || q?.quoteSnapshot?.name)}
      ${field('Firma', q?.company)}
      ${field('E‑posta', q?.email)}
      ${field('Telefon', q?.phone)}
    </div>
    <div style="margin-bottom: 12px;">
      <div style="font-weight:600; font-size:14px; margin-bottom:4px;">Teklif İçeriği</div>
      ${field('Proje', q?.projectName || q?.project || '-')}
      ${field('Teslim Tarihi', q?.deliveryDate || q?.quoteSnapshot?.deliveryDate || '-')}
      ${field('Açıklama', q?.description || '-')}
    </div>
    <div style="margin-bottom: 12px;">
      <div style="font-weight:600; font-size:14px; margin-bottom:4px;">Dosyalar</div>
      ${filesHtml}
    </div>
  `

  // Hide extra columns while details are open
  setTableDetailMode(true)
}

export function closeApprovedQuoteDetail() {
  const panel = document.getElementById('approved-quote-detail-panel')
  if (panel) panel.style.display = 'none'
  selectedQuoteId = null

  // Restore columns when details closed
  setTableDetailMode(false)
}

// Toggle table columns visibility based on details panel state
function setTableDetailMode(isDetailsOpen) {
  const table = document.querySelector('.approved-quotes-table table')
  if (!table) return
  const theadCells = table.querySelectorAll('thead th')
  const tbodyRows = table.querySelectorAll('tbody tr')
  // We keep columns 1 (WO Code) and 3 (Company); hide 2 (Customer), 4 (Delivery), 5 (Production Plan), 6 (Production State), 7 (Actions)
  const hideCols = [2, 4, 5, 6, 7] // 1-based index
  hideCols.forEach(colIdx => {
    const th = theadCells[colIdx - 1]
    if (th) th.style.display = isDetailsOpen ? 'none' : ''
  })
  tbodyRows.forEach(tr => {
    const tds = tr.querySelectorAll('td')
    hideCols.forEach(colIdx => {
      const td = tds[colIdx - 1]
      if (td) td.style.display = isDetailsOpen ? 'none' : ''
    })
  })
}

// Export the filter functions for use in main.js
export { toggleAQFilterPanel, hideAQFilterPanel, onAQFilterChange, clearAQFilter, clearAllAQFilters, applyAQDeliveryFilter, toggleAQPlanType, applyOverdueFilter, applyQuickDateFilter }
