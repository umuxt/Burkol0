// Plan Overview UI: tabs, filter, and create action

import { getProductionPlans, getPlanTemplates, deleteProductionPlan, clearTemplateFromApprovedQuotes } from './mesApi.js'
import { API_BASE, withAuth } from '../../../shared/lib/api.js'
import { loadPlanNodes, setReadOnly, setPlanMeta, resetPlanDesignerState, planDesignerState } from './planDesigner.js'
import { loadApprovedOrdersToSelect } from './planDesignerBackend.js'
import { showSuccessToast, showErrorToast, showWarningToast, showInfoToast } from '../../../shared/components/Toast.js';

export function initPlanOverviewUI() {
  // Default active tab
  setActivePlanTab('production');
  updatePlanFilterCounts();
  // Load plans and templates from backend
  try { fetchCurrentUser().finally(() => loadAndRenderPlans()); } catch (e) { console.warn('Plans load init failed', e?.message); try { loadAndRenderPlans(); } catch {} }
}

// First-time loader moved below to avoid duplicate declarations

function fmtDate(d) {
  try {
    if (!d) return '—'
    const dt = (typeof d?.toDate === 'function')
      ? d.toDate()
      : (typeof d?.seconds === 'number'
          ? new Date(d.seconds * 1000)
          : (typeof d?._seconds === 'number' ? new Date(d._seconds * 1000) : new Date(d)))
    if (isNaN(dt.getTime())) return '—'
    const pad = (n) => String(n).padStart(2, '0')
    const yyyy = dt.getFullYear()
    const mm = pad(dt.getMonth() + 1)
    const dd = pad(dt.getDate())
    const HH = pad(dt.getHours())
    const MM = pad(dt.getMinutes())
    const SS = pad(dt.getSeconds())
    return `${yyyy}-${mm}-${dd} ${HH}:${MM}:${SS}`
  } catch { return '—' }
}

function renderProductionPlans(plans) {
  const body = document.getElementById('production-table-body')
  const count = document.getElementById('production-count')
  if (!body) return
  if (!plans || plans.length === 0) {
    body.innerHTML = '<tr><td colspan="11" style="padding: 16px 12px; color: var(--muted-foreground); font-size: 12px; text-align: center;">No production plans yet</td></tr>'
  } else {
    body.innerHTML = plans.map(p => {
      const fullPlanId = (p.id || '—').toString()
      // Display full plan ID for new format (PPL-MMYY-XXX), keep slice for old format
      const planId = fullPlanId === '—' ? '—' : 
                    fullPlanId.startsWith('PPL-') ? fullPlanId : fullPlanId.slice(-10)
      const name = (p.name || p.id || '').toString()
      const order = (p.orderCode || '—')
      const steps = Array.isArray(p.nodes) ? p.nodes.length : (Array.isArray(p.steps) ? p.steps.length : (p.stepsCount || 0))
      const status = (p.status || 'Draft')
      const created = (p.createdDate && p.createdTime) ? `${p.createdDate} ${p.createdTime}` : fmtDate(p.createdAt)
      const createdBy = p.createdByName || p.createdBy || (_currentUser && (_currentUser.name || _currentUser.email)) || '—'
      const updated = (p.updatedDate && p.updatedTime) ? `${p.updatedDate} ${p.updatedTime}` : fmtDate(p.updatedAt || p.lastModifiedAt || p.createdAt)
      const updatedBy = p.updatedByName || p.lastModifiedByName || p.updatedBy || p.lastModifiedBy || (_currentUser && (_currentUser.name || _currentUser.email)) || '—'
      
      // Format timing summary data
      const timingSummary = p.timingSummary;
      let throughputDisplay = '—';
      let bottleneckDisplay = '—';
      let tooltipText = '';
      
      if (timingSummary) {
        // Convert minutes to hours for display
        const nominalHrs = (timingSummary.totalNominalTime / 60).toFixed(1);
        const effectiveHrs = (timingSummary.totalEffectiveTime / 60).toFixed(1);
        throughputDisplay = `${nominalHrs} / ${effectiveHrs} hrs`;
        
        if (timingSummary.bottleneck) {
          const loadMin = timingSummary.bottleneck.load.toFixed(0);
          bottleneckDisplay = `${timingSummary.bottleneck.stationName} (${loadMin} min)`;
        }
        
        const days = timingSummary.estimatedDays || 0;
        const shiftMin = timingSummary.dailyShiftMinutes || 480;
        const shiftHrs = (shiftMin / 60).toFixed(1);
        tooltipText = `Est. completion: ${days} day${days !== 1 ? 's' : ''} @ ${shiftHrs}h shifts`;
      }
      
      // Action buttons based on status
      const viewBtn = `<button onclick="viewProductionPlan('${p.id || ''}')" style="padding:4px 8px; border:1px solid var(--border); background:white; border-radius:4px; cursor:pointer; font-size:12px;">View</button>`;
      
      return `<tr data-status="${status}">
        <td>${planId}</td>
        <td>${name}</td>
        <td>${order}</td>
        <td>${steps}</td>
        <td style="font-size: 12px;" title="${tooltipText}">${throughputDisplay}</td>
        <td style="font-size: 11px; max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${tooltipText}">${bottleneckDisplay}</td>
        <td class="metadata-column hidden">${created}</td>
        <td class="metadata-column hidden">${createdBy}</td>
        <td class="metadata-column hidden">${updated}</td>
        <td class="metadata-column hidden">${updatedBy}</td>
        <td style="text-align:right;">
          ${viewBtn}
        </td>
      </tr>`
    }).join('')
  }
  if (count) count.textContent = `(${plans?.length || 0})`
}

function renderTemplatesList(templates) {
  const body = document.getElementById('templates-table-body')
  const count = document.getElementById('templates-count')
  if (!body) return
  if (!templates || templates.length === 0) {
    body.innerHTML = '<tr><td colspan="9" style="padding: 16px 12px; color: var(--muted-foreground); font-size: 12px; text-align: center;">No templates yet</td></tr>'
  } else {
    body.innerHTML = templates.map(t => {
      const fullTemplateId = (t.id || '—').toString()
      // Display full template ID for new format (PPL-MMYY-XXX), keep slice for old format
      const templateId = fullTemplateId === '—' ? '—' : 
                         fullTemplateId.startsWith('PPL-') ? fullTemplateId : fullTemplateId.slice(-10)
      const name = (t.name || t.id || '').toString()
      const order = (t.orderCode || '—')
      const steps = Array.isArray(t.steps) ? t.steps.length : (t.stepsCount || 0)
      const created = (t.createdDate && t.createdTime) ? `${t.createdDate} ${t.createdTime}` : fmtDate(t.createdAt)
      const createdBy = t.createdByName || t.ownerName || t.createdBy || t.owner || (_currentUser && (_currentUser.name || _currentUser.email)) || '—'
      const updated = (t.updatedDate && t.updatedTime) ? `${t.updatedDate} ${t.updatedTime}` : fmtDate(t.lastModifiedAt || t.updatedAt || t.createdAt)
      const updatedBy = t.lastModifiedByName || t.updatedByName || t.lastModifiedBy || t.updatedBy || t.ownerName || t.createdByName || t.owner || t.createdBy || (_currentUser && (_currentUser.name || _currentUser.email)) || '—'
      return `<tr>
        <td>${templateId}</td>
        <td>${name}</td>
        <td>${order}</td>
        <td>${steps}</td>
        <td class="metadata-column hidden">${created}</td>
        <td class="metadata-column hidden">${createdBy}</td>
        <td class="metadata-column hidden">${updated}</td>
        <td class="metadata-column hidden">${updatedBy}</td>
        <td style="text-align:right;">
          <button onclick="editTemplateById('${t.id || ''}')" style="padding:4px 8px; border:1px solid var(--border); background:white; border-radius:4px; cursor:pointer; font-size:12px; margin-right:4px;">Edit</button>
          <button onclick="deleteTemplateById('${t.id || ''}')" style="padding:4px 8px; border:1px solid #dc2626; background:white; color:#dc2626; border-radius:4px; cursor:pointer; font-size:12px;">Delete</button>
        </td>
      </tr>`
    }).join('')
  }
  if (count) count.textContent = `(${templates?.length || 0})`
}

let _plansCache = []
let _templatesCache = []
let _currentUser = null

async function fetchCurrentUser() {
  try {
    const res = await fetch(`${API_BASE}/api/auth/me`, { headers: withAuth() })
    if (!res.ok) throw new Error('me_failed')
    const data = await res.json()
    _currentUser = data || null
  } catch (e) {
    _currentUser = null
  }
}
// Keep caches for actions
async function loadAndRenderPlans() {
  try {
    const [plans, templates] = await Promise.all([
      getProductionPlans().catch(() => []),
      getPlanTemplates().catch(() => [])
    ])
    _plansCache = plans
    _templatesCache = templates
    renderProductionPlans(plans)
    renderTemplatesList(templates)
  } catch (e) {
    console.warn('Failed to load plans/templates', e?.message)
  }
}
// Make reloader accessible to other modules
try { Object.assign(window, { loadAndRenderPlans }) } catch {}

export async function viewProductionPlan(id) {
  console.log('👁️ Opening View Production Plan mode for:', id);
  
  try {
    let p = (_plansCache || []).find(x => x.id === id)
    if (!p) {
      // Cache miss: reload plans from backend and try again
      try {
        const fresh = await getProductionPlans().catch(() => [])
        _plansCache = fresh
        p = (_plansCache || []).find(x => x.id === id)
      } catch {}
    }
    if (!p) {
      console.error('❌ Plan not found:', id);
      return;
    }
    
    // Open designer in read-only view
    if (typeof window.openCreatePlan === 'function') window.openCreatePlan()
    
    // Title should reflect view mode
    try {
      const title = document.getElementById('plans-title');
      if (title) title.textContent = 'Production Route Management / Overview';
    } catch {}
    
    // Show plan ID in configuration header
    try {
      const planIdElement = document.getElementById('plan-config-id');
      if (planIdElement && id) {
        const displayId = id.startsWith('PPL-') ? id : id.slice(-10);
        planIdElement.textContent = displayId;
        planIdElement.style.display = 'inline';
      }
    } catch {}
    
    setReadOnly(true)
    setPlanMeta({ 
      name: p.name, 
      description: p.description, 
      orderCode: p.orderCode, 
      scheduleType: p.scheduleType, 
      quantity: p.quantity || 1,
      mode: 'view',
      status: p.status || 'production',
      id: p.id
    })
    
    console.log('✅ View Plan mode initialized:', {
      mode: planDesignerState.currentPlanMeta?.mode,
      readOnly: planDesignerState.readOnly
    });
    
    // Ensure the order dropdown reflects this plan's order even if it's taken
    try { await loadApprovedOrdersToSelect(); } catch {}
    const nodes = Array.isArray(p.nodes) ? p.nodes : (Array.isArray(p.steps) ? p.steps : (p.graph && Array.isArray(p.graph.nodes) ? p.graph.nodes : []))
    loadPlanNodes(nodes || [])
  } catch (e) { console.warn('viewProductionPlan failed', e?.message) }
}

export async function releasePlanFromOverview(planId, planName) {
  if (!planId) {
    window.showToast?.('No plan ID specified', 'error');
    return;
  }
  
  // NEW WORKFLOW: Direct users to Approved Quotes for launch
  const orderCode = window._currentPlanMeta?.orderCode;
  
  if (!orderCode) {
    window.showToast?.('Bu planın iş emri bulunamadı. Lütfen plana bir iş emri atayın.', 'warning');
    return;
  }
  
  const confirmMsg = `"${planName || planId}" planını onaylanmış tekliflerden başlatmak ister misiniz?\n\nYeni üretim akışı:\n✓ Plan tasarlanır\n✓ Teklif onaylanır\n✓ Onaylı Teklifler sayfasından "🏁 Başlat" tıklanır\n✓ Sistem otomatik atama yapar\n✓ Work Packages'tan takip edilir\n✓ İşçi Portal'dan çalışılır\n\nOnaylı Teklifler sayfasına gitmek için Tamam'a basın.`;
  
  if (!confirm(confirmMsg)) return;
  
  try {
    // Navigate to Approved Quotes view
    if (typeof window.loadView === 'function') {
      window.loadView('approvedQuotes');
      window.showToast?.(`"${orderCode}" iş emrini Onaylı Teklifler'de bulup 🏁 Başlat düğmesine tıklayın`, 'info', 8000);
    } else {
      window.showToast?.('Onaylı Teklifler sayfasına gidin ve bu planı başlatın', 'info');
    }
  } catch (error) {
    console.error('Navigation failed:', error);
    window.showToast?.(`Onaylı Teklifler sayfasına gidin ve "${orderCode}" iş emrini başlatın`, 'info');
  }
}

export function editTemplateById(id) {
  console.log('📝 Opening Edit Template mode for:', id);
  
  try {
    const openTpl = (tpl) => {
      if (!tpl) {
        console.error('❌ Template not found:', id);
        return;
      }
      
      if (typeof window.openCreatePlan === 'function') window.openCreatePlan()
      setReadOnly(false)
      
      // Show plan ID in configuration header for template editing
      try {
        const planIdElement = document.getElementById('plan-config-id');
        if (planIdElement && tpl.id) {
          const displayId = tpl.id.startsWith('PPL-') ? tpl.id : tpl.id.slice(-10);
          planIdElement.textContent = displayId;
          planIdElement.style.display = 'inline';
        }
      } catch {}
      
      console.log('📋 Template loaded:', {
        id: tpl.id,
        name: tpl.name,
        orderCode: tpl.orderCode,
        scheduleType: tpl.scheduleType,
        quantity: tpl.quantity
      });
      
      // Set mode to 'edit' with template status
      setPlanMeta({ 
        name: tpl.name, 
        description: tpl.description || '', 
        orderCode: tpl.orderCode || '', 
        scheduleType: tpl.scheduleType || 'one-time',
        quantity: tpl.quantity || 1,
        mode: 'edit',
        status: 'template', 
        sourceTemplateId: tpl.id 
      });
      
      console.log('✅ Edit Template mode initialized:', {
        mode: planDesignerState.currentPlanMeta?.mode,
        status: planDesignerState.currentPlanMeta?.status,
        sourceTemplateId: planDesignerState.currentPlanMeta?.sourceTemplateId
      });
      
      try { loadApprovedOrdersToSelect(); } catch {}
      loadPlanNodes(tpl.steps || [])
    }

    let t = (_templatesCache || []).find(x => x.id === id)
    if (t) { openTpl(t); return }
    // Fallback: refresh templates from backend then try again
    getPlanTemplates()
      .then(list => { _templatesCache = list || []; openTpl((_templatesCache || []).find(x => x.id === id)) })
      .catch(e => console.warn('editTemplateById reload failed', e?.message))
  } catch (e) { console.warn('editTemplateById failed', e?.message) }
}

export async function deleteTemplateById(id) {
  if (!id) {
    console.warn('No template ID provided for deletion');
    return;
  }
  
  // Confirm deletion
  const confirmed = confirm('Bu template\'i silmek istediğinizden emin misiniz? Bu işlem geri alınamaz ve bu template ile bağlantılı tüm approved quotes\'ların plan bağlantıları kaldırılacaktır.');
  if (!confirmed) return;
  
  try {
    console.log('Deleting template:', id);
    
    // 1. First, clear production plan references from approved quotes
    await clearTemplateFromApprovedQuotes(id);
    
    // 2. Then delete the template from Firebase
    await deleteProductionPlan(id);
    
    // 3. Update local cache
    _templatesCache = _templatesCache.filter(t => t.id !== id);
    
    // 4. Refresh the templates table
    if (typeof window.loadAndRenderPlans === 'function') {
      await window.loadAndRenderPlans();
    }
    
    console.log('Template deleted successfully:', id);
    if (typeof window.showToast === 'function') {
      showSuccessToast('Template başarıyla silindi');
    }
    
  } catch (error) {
    console.error('Error deleting template:', error);
    if (typeof window.showToast === 'function') {
      showErrorToast('Template silinirken hata oluştu: ' + error.message);
    }
  }
}

export function setActivePlanTab(tabId) {
  const buttons = document.querySelectorAll('#plans-tabs .station-tab-button');
  buttons.forEach(btn => {
    const isActive = btn.dataset.tab === tabId;
    btn.classList.toggle('active', Boolean(isActive));
  });

  const prodPanel = document.getElementById('production-table-panel');
  const templPanel = document.getElementById('templates-table-panel');
  if (prodPanel && templPanel) {
    prodPanel.style.display = tabId === 'production' ? 'block' : 'none';
    templPanel.style.display = tabId === 'templates' ? 'block' : 'none';
  }

  // Refresh current lists to reflect any external changes/deletions
  try { loadAndRenderPlans(); } catch {}
}

export function filterProductionPlans() {
  const input = document.getElementById('plan-filter-search');
  const term = (input?.value || '').toLowerCase();
  const rows = document.querySelectorAll('#production-table-body tr');
  rows.forEach(row => {
    // Skip empty state row which has a single td[colspan]
    const tds = row.querySelectorAll('td');
    if (!tds || tds.length <= 1) return;
    const text = Array.from(tds).slice(0, tds.length - 1).map(td => td.textContent?.toLowerCase() || '').join(' ');
    // Basic search filter; advanced filters can be added via data attributes
    const matchSearch = text.includes(term);
    // If we add data attributes like data-status, data-priority, data-type in the future:
    const f = planFilters;
    const statusOk = f.status.size === 0 || (row.dataset.status && f.status.has(row.dataset.status));
    const priorityOk = f.priority.size === 0 || (row.dataset.priority && f.priority.has(row.dataset.priority));
    const typeOk = f.type.size === 0 || (row.dataset.type && f.type.has(row.dataset.type));
    row.style.display = matchSearch && statusOk && priorityOk && typeOk ? '' : 'none';
  });
}

export function openCreatePlan() {
  console.log('🆕 Opening Create Plan mode');
  
  try { 
    resetPlanDesignerState(); 
  } catch (e) { 
    console.warn('Failed to reset designer state before opening', e); 
  }
  
  try { 
    setReadOnly(false); 
  } catch (e) { 
    console.warn('Failed to set designer editable mode', e); 
  }
  
  try { 
    setPlanMeta({ 
      name: '', 
      description: '', 
      orderCode: '', 
      scheduleType: 'one-time',
      quantity: 1,
      mode: 'create',
      status: null,
      sourceTemplateId: null
    }); 
  } catch (e) { 
    console.warn('Failed to clear plan configuration inputs', e); 
  }
  
  console.log('✅ Create Plan mode initialized:', {
    mode: planDesignerState.currentPlanMeta?.mode,
    readOnly: planDesignerState.readOnly
  });
  
  const section = document.getElementById('plan-designer-section');
  if (!section) return;
  // Hide list-related UI
  const tabs = document.getElementById('plans-tabs');
  const panelCard = document.getElementById('plans-panel-card');
  const headerControls = document.getElementById('plans-header-controls');
  const createButton = document.getElementById('create-plan-button');
  const filterBar = document.getElementById('plans-filter-compact');
  const title = document.getElementById('plans-title');
  const backBtn = document.getElementById('plans-back-btn');
  if (tabs) tabs.style.display = 'none';
  if (panelCard) panelCard.style.display = 'none';
  if (headerControls) headerControls.style.display = 'none';
  if (createButton) createButton.style.display = 'none';
  if (filterBar) filterBar.style.display = 'none';
  if (title) title.textContent = 'Production Route Management / New Route Creation';
  if (backBtn) backBtn.style.display = '';

  // Hide plan ID in configuration header for new plans
  try {
    const planIdElement = document.getElementById('plan-config-id');
    if (planIdElement) {
      planIdElement.style.display = 'none';
    }
  } catch {}

  // Show designer
  section.style.display = 'block';
}

export function cancelPlanCreation() {
  try { resetPlanDesignerState(); } catch (e) { console.warn('Failed to reset designer state on cancel', e); }
  const section = document.getElementById('plan-designer-section');
  const tabs = document.getElementById('plans-tabs');
  const panelCard = document.getElementById('plans-panel-card');
  const headerControls = document.getElementById('plans-header-controls');
  const createButton = document.getElementById('create-plan-button');
  const filterBar = document.getElementById('plans-filter-compact');
  const title = document.getElementById('plans-title');
  const backBtn = document.getElementById('plans-back-btn');
  if (section) section.style.display = 'none';
  if (tabs) tabs.style.display = '';
  if (panelCard) panelCard.style.display = '';
  if (headerControls) {
    headerControls.style.display = 'flex'; // Restore flex layout
  }
  if (createButton) createButton.style.display = '';
  if (filterBar) {
    filterBar.style.display = 'flex'; // Restore flex layout
  }
  if (title) title.textContent = 'Production Route Management';
  if (backBtn) backBtn.style.display = 'none';
  // Optionally scroll back to top
  setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 0);
  // Reload lists on return
  try { loadAndRenderPlans(); } catch {}
}

// --- Rich Filters (Status / Priority / Type) ---

export const planFilters = {
  status: new Set(),
  priority: new Set(),
  type: new Set(),
};

export function togglePlanFilterPanel(name) {
  const panel = document.getElementById(`plan-filter-${name}-panel`);
  if (!panel) return;
  const isOpen = panel.style.display !== 'none';
  // Close all panels first
  ['status','priority','type'].forEach(n => { const p = document.getElementById(`plan-filter-${n}-panel`); if (p) p.style.display = 'none'; });
  panel.style.display = isOpen ? 'none' : 'block';
}

export function hidePlanFilterPanel(name) {
  const panel = document.getElementById(`plan-filter-${name}-panel`);
  if (panel) panel.style.display = 'none';
}

export function onPlanFilterChange(group, value, checked) {
  const set = planFilters[group];
  if (!set) return;
  if (checked) set.add(value); else set.delete(value);
  updatePlanFilterCounts();
  filterProductionPlans();
}

export function clearPlanFilter(group) {
  const set = planFilters[group];
  if (!set) return;
  set.clear();
  // Uncheck all checkboxes in that panel
  const panel = document.getElementById(`plan-filter-${group}-panel`);
  if (panel) panel.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = false);
  updatePlanFilterCounts();
  filterProductionPlans();
}

export function clearAllPlanFilters() {
  ['status','priority','type'].forEach(g => clearPlanFilter(g));
  updatePlanFilterCounts();
  filterProductionPlans();
}

export function updatePlanFilterCounts() {
  const setText = (id, count) => { const el = document.getElementById(id); if (el) el.textContent = count ? `(${count})` : ''; };
  setText('plan-filter-status-count', planFilters.status.size);
  setText('plan-filter-priority-count', planFilters.priority.size);
  setText('plan-filter-type-count', planFilters.type.size);
  const clearAllBtn = document.getElementById('plan-filter-clear-all');
  if (clearAllBtn) clearAllBtn.style.display = (planFilters.status.size || planFilters.priority.size || planFilters.type.size) ? '' : 'none';
}
