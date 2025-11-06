// Approved Quotes listing (read-only). Uses backend API only.
import { API_BASE, withAuth } from '../../shared/lib/api.js'
import { updateProductionState } from './mesApi.js'

let quotesState = []
let selectedQuoteId = null
let queryFilter = ''
let approvedChannel = null
let productionPlansMap = {} // Map of workOrderCode to production plan data

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
  await loadQuotesAndRender()
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
  if (tbody) tbody.innerHTML = '<tr><td colspan="5"><em>Loading quotes...</em></td></tr>'
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
    if (tbody) tbody.innerHTML = '<tr><td colspan="5" style="color:#ef4444;">Quotes yüklenemedi.</td></tr>'
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

  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="6"><em>Kayıt bulunamadı</em></td></tr>'
    return
  }

  tbody.innerHTML = rows.map(q => {
    const customer = q.customer || q.name || '-'
    const company = q.company || '-'
    const idForRow = q.workOrderCode || q.id || q.quoteId || ''
    const esc = (s) => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]))
    
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
      const planUrl = `../pages/production.html?${actionMode}PlanId=${encodeURIComponent(fullPlanId)}`
      planCell = `<span style=\\"display:inline-flex; align-items:center; gap:4px;\\">${shortPlanId} / ${planName} ${typeIcon}<button onclick="event.stopPropagation(); window.open('${planUrl}', '_blank')" style="border:none; background:transparent; cursor:pointer; font-size:12px; line-height:1; padding:0 2px; vertical-align:baseline;" title="${actionMode === 'view' ? 'View Plan' : 'Edit Plan'}">${actionIcon}</button>`
    } else {
      // No production plan exists - show create button
      const createPlanUrl = `../pages/production.html?view=plan-designer&action=create&orderCode=${encodeURIComponent(idForRow)}`
      planCell = `<span style=\\"display:inline-flex; align-items:center;\\"><button onclick="event.stopPropagation(); window.open('${createPlanUrl}', '_blank')" style="background: var(--primary); color: var(--primary-foreground); padding: 4px 8px; border: none; border-radius: 4px; font-size: 11px; font-weight: 500; cursor: pointer; white-space: nowrap;" title="Üretim Planı Oluştur">+ Üretim Planı Oluştur</button></span>`
    }
    
    // Get production state
    const currentState = getProductionState(idForRow)
    let stateColor = '#6b7280' // default gray
    switch(currentState) {
      case PRODUCTION_STATES.WAITING_APPROVAL:
        stateColor = '#f59e0b' // amber
        break
      case PRODUCTION_STATES.IN_PRODUCTION:
        stateColor = '#10b981' // green
        break
      case PRODUCTION_STATES.PAUSED:
        stateColor = '#ef4444' // red
        break
      case PRODUCTION_STATES.COMPLETED:
        stateColor = '#3b82f6' // blue
        break
      case PRODUCTION_STATES.CANCELLED:
        stateColor = '#6b7280' // gray
        break
    }
    
    const productionStateCell = `<div style="color: ${stateColor}; font-weight: 600; font-size: 12px;">${esc(currentState)}</div>`
    
    // Actions column with buttons
    let actionsCell = ''
    const buttonStyle = 'border: none; background: transparent; cursor: pointer; font-size: 11px; padding: 3px 6px; margin: 1px; border-radius: 3px; white-space: nowrap; display: inline-block;'
    
    // State-specific action buttons first
    if (currentState === PRODUCTION_STATES.WAITING_APPROVAL) {
      actionsCell += `<button onclick="event.stopPropagation(); startProduction('${esc(idForRow)}')" style="${buttonStyle} background: #dcfce7; color: #166534;" title="Üretimi Başlat">🏁 Başlat</button>`
    } else if (currentState === PRODUCTION_STATES.IN_PRODUCTION) {
      actionsCell += `<button onclick="event.stopPropagation(); pauseProduction('${esc(idForRow)}')" style="${buttonStyle} background: #fef3c7; color: #92400e;" title="Üretimi Durdur">⏹️ Durdur</button>`
    } else if (currentState === PRODUCTION_STATES.PAUSED) {
      actionsCell += `<button onclick="event.stopPropagation(); resumeProduction('${esc(idForRow)}')" style="${buttonStyle} background: #dbeafe; color: #1d4ed8;" title="Üretime Devam Et">▶️ Devam Et</button>`
    } else if (currentState === PRODUCTION_STATES.COMPLETED) {
      actionsCell += `<span style="color: #3b82f6; font-size: 11px;">✅ Tamamlandı</span>`
    } else if (currentState === PRODUCTION_STATES.CANCELLED) {
      actionsCell = `<span style="color: #6b7280; font-size: 11px;">❌ İptal Edildi</span>`
    }
    
    // Cancel button on the right (except for cancelled items)
    if (currentState !== PRODUCTION_STATES.CANCELLED) {
      actionsCell += ` <button onclick="event.stopPropagation(); cancelProduction('${esc(idForRow)}')" style="${buttonStyle} background: #fee2e2; color: #dc2626;" title="İptal Et">❌ İptal Et</button>`
    }
    
    return `
      <tr data-quote-id="${esc(idForRow)}" onclick="showApprovedQuoteDetail('${esc(idForRow)}')" style="cursor: pointer;">
        <td style="padding:8px; border-bottom:1px solid var(--border);"><strong>${esc(idForRow)}</strong></td>
        <td style="padding:8px; border-bottom:1px solid var(--border);">${esc(customer)}</td>
        <td style="padding:8px; border-bottom:1px solid var(--border);">${esc(company)}</td>
        <td style="padding:8px; border-bottom:1px solid var(--border);">${planCell}</td>
        <td style="padding:8px; border-bottom:1px solid var(--border);">${productionStateCell}</td>
        <td style="padding:8px; border-bottom:1px solid var(--border);">${actionsCell}</td>
      </tr>
    `
  }).join('')

  // If details are open, keep only Quote # and Company visible
  setTableDetailMode(Boolean(selectedQuoteId))
}

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
  // We keep columns 1 (WO Code) and 3 (Company); hide 2 (Customer), 4 (Production Plan), 5 (Production State), 6 (Actions)
  const hideCols = [2, 4, 5, 6] // 1-based index
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
