// Approved Quotes listing (read-only). Uses backend API only.
import { API_BASE, withAuth } from '../../shared/lib/api.js'
import { updateProductionState, launchProductionPlan, pauseProductionPlan, resumeProductionPlan, cancelProductionPlan } from './mesApi.js'

let quotesState = []
let selectedQuoteId = null
let queryFilter = ''
let approvedChannel = null
let productionPlansMap = {} // Map of workOrderCode to production plan data

// Sorting state
let currentSort = { field: null, direction: 'asc' }

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
  // No default filters applied - show all quotes
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
  
  // Initialize sort indicators
  updateSortIndicators()
  
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

/**
 * Start production: Launch the production plan with auto-assignment
 * Button is only enabled if quote has linked production plan with status=production and not yet launched
 */
async function startProduction(workOrderCode) {
  try {
    // Find the production plan for this work order
    const plan = productionPlansMap[workOrderCode];
    
    if (!plan || plan.type !== 'production') {
      alert('Üretim planı bulunamadı. Lütfen önce bir üretim planı oluşturun.');
      return;
    }
    
    // Confirm launch
    const confirmed = confirm(
      `Üretimi Başlatmak İstediğinizden Emin misiniz?\n\n` +
      `İş Emri: ${workOrderCode}\n` +
      `Plan: ${plan.name}\n\n` +
      `Bu işlem tüm operasyonlar için kaynak ataması yapacak ve üretim başlatılacaktır.`
    );
    
    if (!confirmed) return;
    
    // Show loading state
    const originalState = getProductionState(workOrderCode);
    await setProductionState(workOrderCode, 'Başlatılıyor...');
    
    try {
      // Call launch endpoint
      const result = await launchProductionPlan(plan.id, workOrderCode);
      
      // Success! Update state to IN_PRODUCTION
      await setProductionState(workOrderCode, PRODUCTION_STATES.IN_PRODUCTION);
      
      // Show success message
      const message = result.warnings && result.warnings.length > 0
        ? `Üretim başlatıldı!\n\n${result.assignmentCount} atama oluşturuldu.\n\n⚠️ Uyarılar:\n${result.warnings.map(w => `- ${w.nodeName}: ${w.warnings.join(', ')}`).join('\n')}`
        : `Üretim başarıyla başlatıldı!\n\n${result.assignmentCount} atama oluşturuldu.`;
      
      alert(message);
      
      // Refresh quotes and plans
      await loadQuotesAndRender();
      
      // Emit event for other components (e.g., plan overview)
      try {
        const channel = new BroadcastChannel('mes-assignments');
        channel.postMessage({ type: 'assignments:updated', planId: plan.id, workOrderCode });
        channel.close();
      } catch {}
      
    } catch (error) {
      console.error('Launch failed:', error);
      
      // Restore original state
      await setProductionState(workOrderCode, originalState);
      
      // Show detailed error message based on error type
      if (error.code === 'approved_quote_not_found') {
        // Approved quote not found - direct user to create it
        alert(
          `Onaylı Teklif Bulunamadı\n\n` +
          `${workOrderCode} iş emri için onaylı teklif bulunamadı.\n\n` +
          `Quotes ekranından bu iş emrini oluşturup onayladıktan sonra tekrar deneyin.`
        );
      } else if (error.status === 422 && error.shortages) {
        // Material shortage
        const shortageList = error.shortages.map(s => 
          `- ${s.name} (${s.code}): İhtiyaç ${s.required} ${s.unit}, Stok ${s.available} ${s.unit}, Eksik ${s.shortage} ${s.unit}`
        ).join('\n');
        alert(`Malzeme Eksikliği Nedeniyle Üretim Başlatılamadı\n\n${shortageList}\n\nLütfen eksik malzemeleri temin edip tekrar deneyin.`);
      } else if (error.status === 422 && error.errors) {
        // Assignment errors
        const errorList = error.errors.map(e => 
          `- ${e.nodeName || e.nodeId}: ${e.message}`
        ).join('\n');
        alert(`Kaynak Ataması Başarısız\n\n${errorList}\n\nLütfen planı kontrol edip tekrar deneyin.`);
      } else {
        // Generic error
        alert(`Üretim Başlatılamadı\n\n${error.message || 'Bilinmeyen hata'}\n\nLütfen tekrar deneyin.`);
      }
    }
  } catch (error) {
    console.error('Start production error:', error);
    alert('Üretim başlatılırken beklenmeyen bir hata oluştu. Lütfen tekrar deneyin.');
  }
}

/**
 * Pause production: Pause all assignments for this plan
 */
async function pauseProduction(workOrderCode) {
  try {
    const plan = productionPlansMap[workOrderCode];
    
    if (!plan || plan.type !== 'production') {
      alert('Üretim planı bulunamadı.');
      return;
    }
    
    // Confirm pause
    const confirmed = confirm(
      `Üretimi Durdurmak İstediğinizden Emin misiniz?\n\n` +
      `İş Emri: ${workOrderCode}\n` +
      `Plan: ${plan.name}\n\n` +
      `Tüm görevler duraklatılacak ve işçiler bu iş emrinde çalışamayacak.`
    );
    
    if (!confirmed) return;
    
    // Show loading state
    const originalState = getProductionState(workOrderCode);
    await setProductionState(workOrderCode, 'Duraklatılıyor...');
    
    try {
      // Call pause endpoint
      const result = await pauseProductionPlan(plan.id);
      
      // Success! Update state to PAUSED
      await setProductionState(workOrderCode, PRODUCTION_STATES.PAUSED);
      
      // Show success message
      alert(
        `Üretim durduruldu!\n\n` +
        `${result.pausedCount} görev duraklatıldı.\n` +
        `${result.workersCleared} işçi ve ${result.stationsCleared} istasyon temizlendi.`
      );
      
      // Refresh
      await loadQuotesAndRender();
      
    } catch (error) {
      console.error('Pause failed:', error);
      await setProductionState(workOrderCode, originalState);
      
      // Handle specific error types
      if (error.code === 'approved_quote_not_found') {
        alert(
          `Onaylı Teklif Bulunamadı\n\n` +
          `${workOrderCode} iş emri için onaylı teklif bulunamadı.\n\n` +
          `Quotes ekranından bu iş emrini oluşturup onayladıktan sonra tekrar deneyin.`
        );
      } else {
        alert(`Üretim Durdurulamadı\n\n${error.message || 'Bilinmeyen hata'}\n\nLütfen tekrar deneyin.`);
      }
    }
  } catch (error) {
    console.error('Pause production error:', error);
    alert('Üretim durdurulurken beklenmeyen bir hata oluştu.');
  }
}

/**
 * Resume production: Resume all paused assignments
 */
async function resumeProduction(workOrderCode) {
  try {
    const plan = productionPlansMap[workOrderCode];
    
    if (!plan || plan.type !== 'production') {
      alert('Üretim planı bulunamadı.');
      return;
    }
    
    // Confirm resume
    const confirmed = confirm(
      `Üretime Devam Etmek İstediğinizden Emin misiniz?\n\n` +
      `İş Emri: ${workOrderCode}\n` +
      `Plan: ${plan.name}\n\n` +
      `Duraklatılmış görevler devam edecek.`
    );
    
    if (!confirmed) return;
    
    // Show loading state
    const originalState = getProductionState(workOrderCode);
    await setProductionState(workOrderCode, 'Devam ettiriliyor...');
    
    try {
      // Call resume endpoint
      const result = await resumeProductionPlan(plan.id);
      
      // Success! Update state to IN_PRODUCTION
      await setProductionState(workOrderCode, PRODUCTION_STATES.IN_PRODUCTION);
      
      // Show success message
      alert(
        `Üretim devam ediyor!\n\n` +
        `${result.resumedCount} görev devam ettirildi.`
      );
      
      // Refresh
      await loadQuotesAndRender();
      
    } catch (error) {
      console.error('Resume failed:', error);
      await setProductionState(workOrderCode, originalState);
      
      // Handle specific error types
      if (error.code === 'approved_quote_not_found') {
        alert(
          `Onaylı Teklif Bulunamadı\n\n` +
          `${workOrderCode} iş emri için onaylı teklif bulunamadı.\n\n` +
          `Quotes ekranından bu iş emrini oluşturup onayladıktan sonra tekrar deneyin.`
        );
      } else {
        alert(`Üretim Devam Ettirilemedi\n\n${error.message || 'Bilinmeyen hata'}\n\nLütfen tekrar deneyin.`);
      }
    }
  } catch (error) {
    console.error('Resume production error:', error);
    alert('Üretim devam ettirilirken beklenmeyen bir hata oluştu.');
  }
}

async function completeProduction(workOrderCode) {
  await setProductionState(workOrderCode, PRODUCTION_STATES.COMPLETED)
}

/**
 * Cancel production: Cancel all assignments and mark plan as cancelled
 */
async function cancelProduction(workOrderCode) {
  try {
    const plan = productionPlansMap[workOrderCode];
    
    if (!plan || plan.type !== 'production') {
      alert('Üretim planı bulunamadı.');
      return;
    }
    
    // Confirm cancel
    const confirmed = confirm(
      `Tüm İşlemi İPTAL Etmek İstediğinizden Emin misiniz?\n\n` +
      `İş Emri: ${workOrderCode}\n` +
      `Plan: ${plan.name}\n\n` +
      `⚠️ BU İŞLEMİN GERİ DÖNÜŞÜ YOKTUR!\n\n` +
      `Tüm görevler iptal edilecek ve üretim kaydı kalıcı olarak sonlandırılacaktır.`
    );
    
    if (!confirmed) return;
    
    // Second confirmation
    const doubleConfirm = confirm(
      `SON ONAY\n\nİptal işlemini kesinleştirmek istiyor musunuz?\n\n` +
      `Bu işlem GERİ ALINAMAZ!`
    );
    
    if (!doubleConfirm) return;
    
    // Show loading state
    const originalState = getProductionState(workOrderCode);
    await setProductionState(workOrderCode, 'İptal ediliyor...');
    
    try {
      // Call cancel endpoint
      const result = await cancelProductionPlan(plan.id);
      
      // Success! Update state to CANCELLED
      await setProductionState(workOrderCode, PRODUCTION_STATES.CANCELLED);
      
      // Show success message
      alert(
        `Üretim iptal edildi.\n\n` +
        `${result.cancelledCount} görev iptal edildi.\n` +
        `${result.workersCleared} işçi ve ${result.stationsCleared} istasyon temizlendi.`
      );
      
      // Refresh
      await loadQuotesAndRender();
      
    } catch (error) {
      console.error('Cancel failed:', error);
      await setProductionState(workOrderCode, originalState);
      
      // Handle specific error types
      if (error.code === 'approved_quote_not_found') {
        alert(
          `Onaylı Teklif Bulunamadı\n\n` +
          `${workOrderCode} iş emri için onaylı teklif bulunamadı.\n\n` +
          `Quotes ekranından bu iş emrini oluşturup onayladıktan sonra tekrar deneyin.`
        );
      } else {
        alert(`Üretim İptal Edilemedi\n\n${error.message || 'Bilinmeyen hata'}\n\nLütfen tekrar deneyin.`);
      }
    }
  } catch (error) {
    console.error('Cancel production error:', error);
    alert('Üretim iptal edilirken beklenmeyen bir hata oluştu.');
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
    
    // Add production plans with full metadata including launchStatus
    plans.forEach(plan => {
      if (plan.orderCode) {
        productionPlansMap[plan.orderCode] = {
          id: plan.id,
          name: plan.name,
          type: 'production',
          status: plan.status, // 'draft', 'production', etc.
          launchStatus: plan.launchStatus, // 'launched', 'paused', 'cancelled', undefined
          nodes: plan.nodes || []
        }
      }
    })
    
    // Add templates
    templates.forEach(template => {
      if (template.orderCode) {
        productionPlansMap[template.orderCode] = {
          id: template.id,
          name: template.name,
          type: 'template',
          status: 'template',
          nodes: template.nodes || []
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

  // Apply sorting
  if (currentSort.field) {
    rows.sort((a, b) => {
      let valueA, valueB
      
      switch (currentSort.field) {
        case 'woCode':
          valueA = (a.workOrderCode || a.id || a.quoteId || '').toLowerCase()
          valueB = (b.workOrderCode || b.id || b.quoteId || '').toLowerCase()
          break
        case 'customer':
          valueA = (a.customer || a.name || '').toLowerCase()
          valueB = (b.customer || b.name || '').toLowerCase()
          break
        case 'company':
          valueA = (a.company || '').toLowerCase()
          valueB = (b.company || '').toLowerCase()
          break
        case 'deliveryDate':
          valueA = a.deliveryDate || (a.quoteSnapshot && a.quoteSnapshot.deliveryDate) || ''
          valueB = b.deliveryDate || (b.quoteSnapshot && b.quoteSnapshot.deliveryDate) || ''
          // Convert to date for proper sorting
          valueA = valueA ? new Date(valueA) : new Date(0)
          valueB = valueB ? new Date(valueB) : new Date(0)
          break
        case 'productionPlan':
          const planA = productionPlansMap[a.workOrderCode || a.id || a.quoteId || '']
          const planB = productionPlansMap[b.workOrderCode || b.id || b.quoteId || '']
          valueA = planA ? (planA.id || '').toLowerCase() : ''
          valueB = planB ? (planB.id || '').toLowerCase() : ''
          break
        case 'productionState':
          const stateA = getProductionState(a.workOrderCode || a.id || a.quoteId || '')
          const stateB = getProductionState(b.workOrderCode || b.id || b.quoteId || '')
          valueA = stateA.toLowerCase()
          valueB = stateB.toLowerCase()
          break
        default:
          return 0
      }
      
      // Handle date comparison
      if (valueA instanceof Date && valueB instanceof Date) {
        return currentSort.direction === 'asc' ? valueA - valueB : valueB - valueA
      }
      
      // Handle string comparison
      if (valueA < valueB) return currentSort.direction === 'asc' ? -1 : 1
      if (valueA > valueB) return currentSort.direction === 'asc' ? 1 : -1
      return 0
    })
  }

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
      planCell = `<span style=\\"display:inline-flex; align-items:center; gap:4px;\\">${shortPlanId} ${typeIcon}<button onclick="event.stopPropagation(); window.open('${planUrl}', '_blank')" style="border:none; background:transparent; cursor:pointer; font-size:12px; line-height:1; padding:0 2px; vertical-align:baseline;" title="${actionMode === 'view' ? 'View Plan' : 'Edit Plan'}">${actionIcon}</button></span>`
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
      // Determine actual production state based on plan launchStatus and productionState
      let currentState = PRODUCTION_STATES.WAITING_APPROVAL;
      
      // First check plan's launchStatus (most authoritative)
      if (plan.launchStatus === 'cancelled') {
        currentState = PRODUCTION_STATES.CANCELLED;
      } else if (plan.launchStatus === 'paused') {
        currentState = PRODUCTION_STATES.PAUSED;
      } else if (plan.launchStatus === 'launched') {
        currentState = PRODUCTION_STATES.IN_PRODUCTION;
      } else {
        // Not launched yet - check if plan is ready to launch
        if (plan.status === 'production' && plan.nodes && plan.nodes.length > 0) {
          currentState = PRODUCTION_STATES.WAITING_APPROVAL; // Ready to launch
        } else {
          currentState = 'Plan Hazırlanıyor'; // Plan not ready
        }
      }
      
      // Override with productionState from quote if available
      const quoteState = getProductionState(idForRow);
      if (quoteState && quoteState !== PRODUCTION_STATES.WAITING_APPROVAL) {
        // Quote has explicit state (for backward compatibility or manual updates)
        currentState = quoteState;
      }
      
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
        case 'Plan Hazırlanıyor':
          stateColor = '#9ca3af'; break
      }
      productionStateCell = `<div style=\"color: ${stateColor}; font-weight: 600; font-size: 12px;\">${esc(currentState)}</div>`

      // Button rendering based on state
      const buttonStyle = 'border: none; background: transparent; cursor: pointer; font-size: 9px; padding: 1px 3px; margin: 1px; border-radius: 3px; white-space: nowrap; display: inline-block;'
      
      // Only show "Başla" if plan is ready (status=production, has nodes, not launched)
      const canLaunch = plan.status === 'production' && 
                        plan.nodes && plan.nodes.length > 0 && 
                        !plan.launchStatus;
      
      if (currentState === PRODUCTION_STATES.WAITING_APPROVAL && canLaunch) {
        actionsCell += `<button onclick=\"event.stopPropagation(); startProduction('${esc(idForRow)}')\" style=\"${buttonStyle} background: #dcfce7; color: #166534;\" title=\"Üretimi Başlat\">🏁 Başlat</button>`
      } else if (currentState === PRODUCTION_STATES.IN_PRODUCTION) {
        actionsCell += `<button onclick=\"event.stopPropagation(); pauseProduction('${esc(idForRow)}')\" style=\"${buttonStyle} background: #fef3c7; color: #92400e;\" title=\"Üretimi Durdur\">⏹️ Durdur</button>`
      } else if (currentState === PRODUCTION_STATES.PAUSED) {
        actionsCell += `<button onclick=\"event.stopPropagation(); resumeProduction('${esc(idForRow)}')\" style=\"${buttonStyle} background: #dbeafe; color: #1d4ed8;\" title=\"Üretime Devam Et\">▶️ Devam Et</button>`
      } else if (currentState === PRODUCTION_STATES.COMPLETED) {
        actionsCell += `<span style=\"color: #3b82f6; font-size: 11px;\">✅ Tamamlandı</span>`
      } else if (currentState === PRODUCTION_STATES.CANCELLED) {
        actionsCell = `<span style=\"color: #6b7280; font-size: 11px;\">❌ İptal Edildi</span>`
      } else if (currentState === 'Plan Hazırlanıyor') {
        actionsCell += `<span style=\"color: #9ca3af; font-size: 10px;\">Plan henüz hazır değil</span>`
      }

      // Show cancel button for all states except cancelled and completed
      if (currentState !== PRODUCTION_STATES.CANCELLED && currentState !== PRODUCTION_STATES.COMPLETED && currentState !== 'Plan Hazırlanıyor') {
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

// Sıralama fonksiyonu
function sortApprovedQuotes(field) {
  // Toggle direction if same field, otherwise reset to ascending
  if (currentSort.field === field) {
    currentSort.direction = currentSort.direction === 'asc' ? 'desc' : 'asc'
  } else {
    currentSort.field = field
    currentSort.direction = 'asc'
  }
  
  // Update sort indicators
  updateSortIndicators()
  
  // Re-render table with sorted data
  renderApprovedQuotesTable()
}

// Güncelle sıralama göstergelerini
function updateSortIndicators() {
  // Reset all sort indicators
  document.querySelectorAll('[onclick*="sortApprovedQuotes"] span').forEach(span => {
    span.textContent = '↕'
    span.style.opacity = '0.6'
  })
  
  // Set active sort indicator
  if (currentSort.field) {
    const button = document.querySelector(`[onclick*="sortApprovedQuotes('${currentSort.field}')"] span`)
    if (button) {
      button.textContent = currentSort.direction === 'asc' ? '↑' : '↓'
      button.style.opacity = '1'
    }
  }
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
export { toggleAQFilterPanel, hideAQFilterPanel, onAQFilterChange, clearAQFilter, clearAllAQFilters, applyAQDeliveryFilter, toggleAQPlanType, applyOverdueFilter, applyQuickDateFilter, sortApprovedQuotes }
