// Backend-powered overrides for Plan Designer
import { showSuccessToast, showErrorToast, showWarningToast, showInfoToast } from '../../../shared/components/MESToast.js';
import { getOperations, getStations, getSubstations, getApprovedQuotes, getMaterials, getProductionPlans, getWorkers } from './mesApi.js'
import { planDesignerState, renderCanvas, closeNodeEditModal, renderPlanOrderListFromSelect, propagateDerivedMaterialUpdate, aggregatePlanMaterials, checkMaterialAvailability, computeNodeEffectiveDuration } from './planDesigner.js'
import { computeAndAssignSemiCode, getSemiCodePreviewForNode, getPrefixForNode } from './semiCode.js'
import { populateUnitSelect } from './units.js'

// Helper functions to manage body scroll lock
function lockBodyScroll() {
  document.body.style.overflow = 'hidden'
  document.body.style.paddingRight = getScrollbarWidth() + 'px'
}

function unlockBodyScroll() {
  document.body.style.overflow = ''
  document.body.style.paddingRight = ''
}

function getScrollbarWidth() {
  // Create temporary element to measure scrollbar width
  const outer = document.createElement('div')
  outer.style.visibility = 'hidden'
  outer.style.overflow = 'scroll'
  outer.style.msOverflowStyle = 'scrollbar'
  document.body.appendChild(outer)
  
  const inner = document.createElement('div')
  outer.appendChild(inner)
  
  const scrollbarWidth = outer.offsetWidth - inner.offsetWidth
  outer.parentNode.removeChild(outer)
  
  return scrollbarWidth
}

// Rebuild material rows UI from current node state (includes auto-derived materials)
function rebuildMaterialRowsFromNode(node) {
  try {
    const container = document.getElementById('edit-materials-rows')
    if (!container || !node) return
    const rows = Array.isArray(node.materialInputs) ? node.materialInputs : []
    const buildRow = (rm, idx) => {
      const isDerived = !!(rm && rm.derivedFrom)
      const badge = isDerived ? '<span style="margin-left:6px; font-size:11px; color:#2563eb; background:#eff6ff; border:1px solid #bfdbfe; padding:1px 6px; border-radius:8px;">auto</span>' : ''
      const displayInput = isDerived
        ? `<input id="edit-material-display-${idx}" type="text" readonly placeholder="Select material" value="${escapeHtml(formatMaterialLabel(rm))}" style="width: 100%; padding: 8px; border: 1px solid var(--border); border-radius: 4px; background: #f3f4f6; color:#6b7280; cursor: default;" />${badge}`
        : `<input id="edit-material-display-${idx}" type="text" readonly placeholder="Select material" value="${escapeHtml(formatMaterialLabel(rm))}" style="width: 100%; padding: 8px; border: 1px solid var(--border); border-radius: 4px; background: #f9fafb; cursor: pointer;" onclick="openMaterialDropdown(${idx})" />`
      const dropdown = isDerived ? '' : (
        `<div id="edit-material-dropdown-${idx}" style="display:none; position:absolute; left:0; right:0; top:38px; background:white; border:1px solid var(--border); border-radius: 6px; box-shadow: 0 8px 16px rgba(0,0,0,0.08); z-index:9999;">
           <div style=\"padding:6px; border-bottom:1px solid var(--border);\"><input id=\"edit-material-search-${idx}\" type=\"text\" placeholder=\"Ara: kod, isim, tedarikçi\" oninput=\"filterMaterialDropdown(${idx})\" style=\"width:100%; padding:6px 8px; border:1px solid var(--border); border-radius:6px; font-size:12px;\" /></div>
           <div id=\"edit-material-list-${idx}\" style=\"max-height:220px; overflow:auto; font-size:13px;\"></div>
         </div>`)
      const qtyInput = `<input id="edit-material-qty-${idx}" type="number" min="0" step="0.01" placeholder="Qty" style="width:100%; padding: 8px; border: 1px solid var(--border); border-radius: 4px;${isDerived ? ' background:#f3f4f6; color:#6b7280;' : ''}" value="${rm?.requiredQuantity ?? ''}" ${isDerived ? 'disabled' : 'oninput="updateOutputCodePreviewBackend()"'} />`
      const removeBtn = isDerived ? '' : `<button type=\"button\" onclick=\"removeMaterialRow(${idx})\" title=\"Kaldır\" style=\"width:28px; height:32px; border:1px solid var(--border); background:#fee2e2; color:#ef4444; border-radius:6px;\">-</button>`
      return (
        `<div class=\"material-row\" data-row-index=\"${idx}\" ${isDerived?'data-derived=\"1\"':''} style=\"display:flex; gap:8px; align-items:flex-start; margin-bottom:8px;\">` +
          '<div style=\"position:relative; flex: 3;\">' +
            `<input type=\"hidden\" id=\"edit-material-id-${idx}\" value=\"${escapeHtml(rm?.materialCode ?? '')}\" />` +
            `<input type=\"hidden\" id=\"edit-material-name-${idx}\" value=\"${escapeHtml(rm?.name ?? '')}\" />` +
            displayInput +
            dropdown +
          '</div>' +
          '<div style=\"flex:2;\">' +
            qtyInput +
          '</div>' +
          '<div style=\"flex:1;\">' +
            `<input id=\"edit-material-unit-${idx}\" type=\"text\" readonly placeholder=\"Unit\" style=\"width:100%; padding: 8px; border: 1px solid var(--border); border-radius: 4px; background: #f9fafb; color: #6b7280;\" value=\"${escapeHtml(rm?.unit ?? '')}\" />` +
          '</div>' +
          '<div style=\"flex:0; display:flex; align-items:center;\">' +
            removeBtn +
          '</div>' +
        '</div>'
      )
    }
    const rowsHtml = rows.map((rm, i) => buildRow(rm, i)).join('')
    container.innerHTML = rowsHtml
  } catch (e) {
    console.warn('rebuildMaterialRowsFromNode failed', e)
  }
}

let _opsCache = []
let _approvedOrders = []
let _ordersByCode = new Map()
let _stationsCacheFull = []
let _substationsCacheFull = []
let _materialsCacheFull = []
let _workersCacheFull = [] // Add workers cache

// Global escape handler for modal
let modalEscapeHandler = null;
// Listener for live-sync of materials when graph changes while modal is open
let materialChangeHandler = null;

export async function loadOperationsToolboxBackend() {
  const listContainer = document.getElementById('operations-list')
  const fullscreenListContainer = document.getElementById('fullscreen-operations-list')
  
  if (listContainer) {
    listContainer.innerHTML = '<div style="padding:6px;color:#888;">Loading operations...</div>'
  }
  if (fullscreenListContainer) {
    fullscreenListContainer.innerHTML = '<div style="padding:12px;color:#888;">Loading operations...</div>'
  }
  
  try {
    _opsCache = await getOperations(true)
    
    // Store in planDesignerState for drag & drop
    planDesignerState.availableOperations = _opsCache
    
    if (!_opsCache.length) {
      if (listContainer) {
        listContainer.innerHTML = '<div style="padding:6px;color:#666;">No operations defined yet. Add from Operations page.</div>'
      }
      if (fullscreenListContainer) {
        fullscreenListContainer.innerHTML = '<div style="padding:12px;color:#666;">No operations defined yet. Add from Operations page.</div>'
      }
      return
    }
    
    // Normal operations list
    if (listContainer) {
      listContainer.innerHTML = _opsCache.map(op =>
        `<div draggable="true" ondragstart="handleOperationDragStart(event, '${op.id}')" style="padding: 6px 8px; border: 1px solid var(--border); border-radius: 4px; cursor: grab; background: white; margin-bottom: 4px; font-size: 13px; font-weight: 500;" onmouseover="this.style.background='var(--muted)'" onmouseout="this.style.background='white'">${escapeHtml(op.name)}</div>`
      ).join('')
    }
    
    // Fullscreen operations list
    if (fullscreenListContainer) {
      fullscreenListContainer.innerHTML = _opsCache.map(op =>
        `<div draggable="true" ondragstart="handleOperationDragStart(event, '${op.id}')" style="padding: 8px 12px; border: 1px solid var(--border); border-radius: 6px; cursor: grab; background: white; margin-bottom: 8px; font-size: 14px; font-weight: 500;" onmouseover="this.style.background='var(--muted)'" onmouseout="this.style.background='white'">${escapeHtml(op.name)}</div>`
      ).join('')
    }
    
  } catch (e) {
    console.error('loadOperationsToolboxBackend error', e)
    if (listContainer) {
      listContainer.innerHTML = '<div style="padding:6px;color:#ef4444;">Failed to load operations</div>'
    }
    if (fullscreenListContainer) {
      fullscreenListContainer.innerHTML = '<div style="padding:12px;color:#ef4444;">Failed to load operations</div>'
    }
  }
}

export async function loadApprovedOrdersToSelect() {
  const select = document.getElementById('order-select')
  if (!select) return
  try {
    // Allow URL param to pre-seed selection before list is loaded
    const urlParams = new URLSearchParams(window.location.search)
    const urlOrderCode = urlParams.get('orderCode') || ''
    const previouslySelected = urlOrderCode || select.value || planDesignerState.currentPlanMeta?.orderCode || ''
    select.innerHTML = '<option value="">Loading orders...</option>'

    const [quotes, plans] = await Promise.all([
      getApprovedQuotes().catch(() => []),
      getProductionPlans().catch(() => [])
    ])
    _approvedOrders = Array.isArray(quotes) ? quotes : []

    const takenCodes = new Set(
      (Array.isArray(plans) ? plans : [])
        .map(p => (p?.orderCode || '').trim())
        .filter(Boolean)
    )

    if (previouslySelected) {
      takenCodes.delete(String(previouslySelected).trim())
    }

    const availableQuotes = _approvedOrders.filter(q => {
      const code = (q?.workOrderCode || q?.id || q?.quoteId || '').trim()
      return code && !takenCodes.has(code)
    })

    const ensuredList = [...availableQuotes]
    if (previouslySelected) {
      const normalized = String(previouslySelected).trim()
      const alreadyIncluded = ensuredList.some(q => (q?.workOrderCode || q?.id || q?.quoteId || '').trim() === normalized)
      if (!alreadyIncluded) {
        const fallback = _approvedOrders.find(q => (q?.workOrderCode || q?.id || q?.quoteId || '').trim() === normalized)
        if (fallback) {
          ensuredList.unshift(fallback)
        } else {
          ensuredList.unshift({ workOrderCode: normalized, company: planDesignerState.currentPlanMeta?.orderCompany || '-', name: normalized })
        }
      }
    }

    _ordersByCode = new Map()
    const options = ['<option value="">Select an order...</option>']
    if (ensuredList.length === 0) {
      options.push('<option value="" disabled>No unplanned work orders available</option>')
    }

    for (const q of ensuredList) {
      const rawCode = q?.workOrderCode || q?.id || q?.quoteId
      const code = (rawCode || '').trim()
      if (!code) continue
      _ordersByCode.set(code, q)
      const label = `${escapeHtml(code)} — ${escapeHtml(q?.company || q?.customer || q?.name || '-')}`
      options.push(`<option value="${escapeHtml(code)}">${label}</option>`)
    }
    select.innerHTML = options.join('')
    if (previouslySelected) {
      select.value = previouslySelected
    }

    const labelEl = document.getElementById('plan-order-label')
    if (labelEl) {
      if (select.value) {
        const selectedOpt = Array.from(select.options).find(opt => opt.value === select.value)
        labelEl.textContent = selectedOpt ? selectedOpt.textContent : select.value
      } else {
        labelEl.textContent = 'Select an order...'
      }
    }

    setTimeout(() => {
      try { renderPlanOrderListFromSelect() } catch (err) { console.warn('Failed to render plan order list:', err) }
    }, 100)
  } catch (e) {
    console.error('loadApprovedOrdersToSelect error', e)
    select.innerHTML = '<option value="">Failed to load orders</option>'
  }
}

export function handleOrderChangeBackend() {
  const select = document.getElementById('order-select')
  const code = select?.value || ''
  if (!code) return
  const q = _ordersByCode.get(code)
  if (q) {
    const price = q.price != null ? `₺${Number(q.price).toFixed(2)}` : '—'
    showInfoToast(`Selected: ${code} • ${q.company || q.customer || q.name || '-'} • ${price}`)
  }
}

export function handleCanvasDropBackend(event) {
  event.preventDefault()
  if (!planDesignerState.draggedOperation) return
  const op = (_opsCache||[]).find(o => o.id === planDesignerState.draggedOperation)
  if (!op) { showErrorToast('Operation not found. Refresh list.'); return }

  // Determine which canvas is active (normal or fullscreen)
  const canvas = planDesignerState.isFullscreen ? 
    document.getElementById('fullscreen-plan-canvas') : 
    document.getElementById('plan-canvas')
    
  if (!canvas) return
  
  const rect = canvas.getBoundingClientRect()
  const x = event.clientX - rect.left - 80
  const y = event.clientY - rect.top - 40

  const nodeId = 'node-' + planDesignerState.nodeIdCounter++
  const newNode = {
    id: nodeId,
    operationId: op.id,
    name: op.name,
    type: op.type || 'General',
    time: 30, // Default planning time, will be overridden by station assignment
    skills: Array.isArray(op.skills) ? op.skills : [],
    predecessors: [],
    materialInputs: [],
    semiCode: null,
    x: Math.max(0, x),
    y: Math.max(0, y),
    connections: [],
    assignedWorkerId: null,
    assignedWorkerName: null,
    assignedStations: []  // Multiple stations in priority order: [{ id, name, priority }]
  }
  planDesignerState.nodes.push(newNode)
  
  // Render appropriate canvas
  if (planDesignerState.isFullscreen) {
    // Import and use renderCanvasContent for fullscreen
    import('./planDesigner.js').then(module => {
      if (module.renderCanvasContent) {
        module.renderCanvasContent(canvas)
      }
    })
  } else {
    renderCanvas()
  }
  
  planDesignerState.draggedOperation = null
  showSuccessToast(`${op.name} operasyonu eklendi`)
}

export async function editNodeBackend(nodeId) {
  const node = planDesignerState.nodes.find(n => n.id === nodeId)
  if (!node) return
  
  // Create a deep copy snapshot of the node before editing (for cancel functionality)
  planDesignerState.nodeEditSnapshot = JSON.parse(JSON.stringify({
    name: node.name,
    time: node.time,
    efficiency: node.efficiency,
    assignedStations: node.assignedStations,
    assignmentMode: node.assignmentMode,
    assignedWorkerId: node.assignedWorkerId,
    assignedWorkerName: node.assignedWorkerName,
    materialInputs: node.materialInputs,
    outputQty: node.outputQty,
    outputUnit: node.outputUnit,
    _isTemplateApplied: node._isTemplateApplied,
    _templateCode: node._templateCode,
    _templateRatios: node._templateRatios
  }));
  
  planDesignerState.selectedNode = node
  
  // Initialize assignedStations array if missing (backward compatibility)
  if (!Array.isArray(node.assignedStations)) {
    node.assignedStations = [];
    
    // Migrate from old single station structure (legacy format)
    if (node.assignedStationId && node.assignedStationName) {
      node.assignedStations = [{
        stationId: node.assignedStationId,  // SCHEMA-COMPLIANT: stationId
        name: node.assignedStationName,
        priority: 1
      }];
    }
  }
  
  let stations = []
  let materials = []
  let workers = []
  let operations = []
  let operationDefaultEfficiency = 1.0 // Default efficiency
  
  try {
    stations = await getStations(true)
    materials = await getMaterials()
    workers = await getWorkers()
    operations = await getOperations(true)
    
    // Get operation's default efficiency
    if (node.operationId) {
      const operation = operations.find(op => op.id === node.operationId)
      if (operation && operation.defaultEfficiency) {
        operationDefaultEfficiency = operation.defaultEfficiency
        console.log(`Operation ${operation.name} defaultEfficiency: ${operationDefaultEfficiency} (${Math.round(operationDefaultEfficiency * 100)}%)`)
      }
    }
    
    console.log(`Loaded data: ${stations.length} stations, ${materials.length} materials, ${workers.length} workers, ${operations.length} operations`)
    
    // Update planDesignerState caches for efficiency calculations
    planDesignerState.stationsCache = stations;
    planDesignerState.availableWorkers = workers; // Add workers to state
  } catch (e) {
    console.error('editNodeBackend data load failed', e)
    // Continue with empty arrays to prevent UI breaking
  }
  _stationsCacheFull = stations || []
  _workersCacheFull = workers || []
  _materialsCacheFull = (materials || []).filter(isRawMaterial)
  console.log(`Filtered to ${_materialsCacheFull.length} active raw materials (Ham madde)`)

  const compatibleStations = _stationsCacheFull.filter(s => Array.isArray(s.operationIds) && s.operationIds.includes(node.operationId))
  const selectedAssignMode = node.assignmentMode === 'manual' ? 'manual' : 'auto'
  const manualEnabled = true // Always allow manual assignment

  // Calculate effective time for display
  const nominalTime = parseFloat(node.time) || 0;
  // Use node's efficiency override, or fall back to operation's defaultEfficiency
  const currentEfficiency = node.efficiency || operationDefaultEfficiency;
  const initialEffectiveTime = nominalTime > 0 ? Math.round(nominalTime / currentEfficiency) : 0;
  const effectiveTime = typeof node.effectiveTime === 'number' ? node.effectiveTime : nominalTime;
  const showEffectiveTime = Math.abs(effectiveTime - nominalTime) > 0.01 && (node.assignedWorkerId || (Array.isArray(node.assignedStations) && node.assignedStations.length > 0));
  const effectiveTimeDisplay = showEffectiveTime
    ? `<div style="font-size: 12px; color: ${effectiveTime < nominalTime ? '#059669' : '#dc2626'}; margin-top: 4px;">
        Effective time: ${effectiveTime.toFixed(1)} min 
        <span style="font-weight: 500;">(${effectiveTime < nominalTime ? '↓' : '↑'} ${Math.abs(((nominalTime - effectiveTime) / nominalTime * 100)).toFixed(1)}%)</span>
       </div>`
    : '';

  const formContent =
    '<div style="margin-bottom: 16px;"><label style="display: block; margin-bottom: 4px; font-weight: 500;">Operation Name</label><input type="text" id="edit-name" value="' + escapeHtml(node.name) + '" style="width: 100%; padding: 8px; border: 1px solid var(--border); border-radius: 4px;" /></div>' +
    '<div style="margin-bottom: 16px;"><label style="display: block; margin-bottom: 4px; font-weight: 500;">Estimated Unit Production Time (minutes)</label><input type="number" id="edit-time" value="' + Number(node.time || 0) + '" min="1" style="width: 100%; padding: 8px; border: 1px solid var(--border); border-radius: 4px;" oninput="updateEffectiveTimePreviewBackend()" />' + effectiveTimeDisplay + '</div>' +
    '<div style="margin-bottom: 16px;"><label style="display: block; margin-bottom: 4px; font-weight: 500;">Verimlilik Override (%) <span style="font-size: 11px; color: #6b7280; font-weight: normal;">(opsiyonel)</span></label><input type="number" id="edit-efficiency" value="' + (node.efficiency ? (node.efficiency * 100).toFixed(1) : '') + '" min="1" max="100" step="0.1" placeholder="Boş bırakın (operasyon varsayılanı: ' + Math.round(operationDefaultEfficiency * 100) + '% kullanılır)" style="width: 100%; padding: 8px; border: 1px solid var(--border); border-radius: 4px;" oninput="updateEffectiveTimePreviewBackend()" data-operation-efficiency="' + operationDefaultEfficiency + '" /><div id="effective-time-preview-backend" style="font-size: 12px; color: #3b82f6; margin-top: 4px; font-weight: 500;">Effective Time: ' + initialEffectiveTime + ' min</div><div style="font-size: 11px; color: #6b7280; margin-top: 2px;">Bu node için özel verimlilik ayarlayın. Boş ise operasyonun varsayılan verimlilik değeri (' + Math.round(operationDefaultEfficiency * 100) + '%) kullanılır.</div></div>' +
    generateMultiStationSelector(node, compatibleStations) +
    '<div style="margin-bottom: 16px;"><label style="display:block; margin-bottom: 6px; font-weight: 500;">Worker Assignment</label>' +
      '<div style="font-size: 12px; color: #6b7280; margin-bottom: 8px;">Select how worker will be assigned to this operation</div>' +
      `<label style="margin-right:12px; font-size:13px;"><input type="radio" name="edit-assign-mode" value="auto" ${selectedAssignMode==='auto'?'checked':''} onchange="toggleWorkerDropdown()"> Auto-assign (at launch)</label>` +
      `<label style="font-size:13px;"><input type="radio" name="edit-assign-mode" value="manual" ${selectedAssignMode==='manual'?'checked':''} onchange="toggleWorkerDropdown()"> Manual-assign (select now)</label>` +
      `<div id="manual-worker-select" style="margin-top: 12px; display: ${selectedAssignMode==='manual'?'block':'none'};">` +
        '<label style="display: block; margin-bottom: 4px; font-weight: 500;">Select Worker <span style="color: #ef4444;">*</span></label>' +
        '<select id="edit-worker" style="width: 100%; padding: 8px; border: 1px solid var(--border); border-radius: 4px; background: white;"><option value="">-- Select a worker --</option></select>' +
        '<div style="font-size: 11px; color: #6b7280; margin-top: 4px;">Only workers with matching skills are shown</div>' +
      '</div>' +
    '</div>' +
    (function(){
      const rows = Array.isArray(node.materialInputs) ? node.materialInputs : []
      const buildRow = (rm, idx) => {
        const isDerived = !!(rm && rm.derivedFrom)
        const badge = isDerived ? '<span style="margin-left:6px; font-size:11px; color:#2563eb; background:#eff6ff; border:1px solid #bfdbfe; padding:1px 6px; border-radius:8px;">auto</span>' : ''
        const displayInput = isDerived
          ? `<input id="edit-material-display-${idx}" type="text" readonly placeholder="Select material" value="${escapeHtml(formatMaterialLabel(rm))}" style="width: 100%; padding: 8px; border: 1px solid var(--border); border-radius: 4px; background: #f3f4f6; color:#6b7280; cursor: default;" />${badge}`
          : `<input id="edit-material-display-${idx}" type="text" readonly placeholder="Select material" value="${escapeHtml(formatMaterialLabel(rm))}" style="width: 100%; padding: 8px; border: 1px solid var(--border); border-radius: 4px; background: #f9fafb; cursor: pointer;" onclick="openMaterialDropdown(${idx})" />`
        const dropdown = isDerived
          ? ''
          : `<div id="edit-material-dropdown-${idx}" style="display:none; position:absolute; left:0; right:0; top:38px; background:white; border:1px solid var(--border); border-radius: 6px; box-shadow: 0 8px 16px rgba(0,0,0,0.08); z-index:9999;">
              <div style="padding:6px; border-bottom:1px solid var(--border);"><input id="edit-material-search-${idx}" type="text" placeholder="Ara: kod, isim, tedarikçi" oninput="filterMaterialDropdown(${idx})" style="width:100%; padding:6px 8px; border:1px solid var(--border); border-radius:6px; font-size:12px;" /></div>
              <div id="edit-material-list-${idx}" style="max-height:220px; overflow:auto; font-size:13px;"></div>
            </div>`
        const qtyInput = `<input id="edit-material-qty-${idx}" type="number" min="0" step="0.01" placeholder="Qty" style="width:100%; padding: 8px; border: 1px solid var(--border); border-radius: 4px;${isDerived ? ' background:#f3f4f6; color:#6b7280;' : ''}" value="${rm?.requiredQuantity ?? ''}" ${isDerived ? 'disabled' : 'oninput="updateOutputCodePreviewBackend()"'} />`
        const removeBtn = isDerived ? '' : `<button type="button" onclick="removeMaterialRow(${idx})" title="Kaldır" style="width:28px; height:32px; border:1px solid var(--border); background:#fee2e2; color:#ef4444; border-radius:6px;">-</button>`
        return (
          `<div class="material-row" data-row-index="${idx}" ${isDerived?'data-derived="1"':''} style="display:flex; gap:8px; align-items:flex-start; margin-bottom:8px;">` +
            '<div style="position:relative; flex: 3;">' +
              `<input type="hidden" id="edit-material-id-${idx}" value="${rm?.materialCode ?? ''}" />` +
              `<input type="hidden" id="edit-material-name-${idx}" value="${escapeHtml(rm?.name ?? '')}" />` +
              displayInput +
              dropdown +
            '</div>' +
            '<div style="flex:2;">' +
              qtyInput +
            '</div>' +
            '<div style="flex:1;">' +
              `<input id="edit-material-unit-${idx}" type="text" readonly placeholder="Unit" style="width:100%; padding: 8px; border: 1px solid var(--border); border-radius: 4px; background: #f9fafb; color: #6b7280;" value="${rm?.unit ?? ''}" />` +
            '</div>' +
            '<div style="flex:0; display:flex; align-items:center;">' +
              removeBtn +
            '</div>' +
          '</div>'
        )
      }
      const rowsHtml = (rows.length ? rows : [null]).map((rm, i)=>buildRow(rm, i)).join('')
      return '<div style="margin-bottom: 16px;">' +
        '<label style="display:block; margin-bottom: 4px; font-weight: 500;">Raw Material</label>' +
        '<div id="edit-materials-rows">' + rowsHtml + '</div>' +
        '<div><button type="button" onclick="addMaterialRow()" style="margin-top:4px; padding:6px 10px; border:1px solid var(--border); border-radius:6px; background:#f3f4f6;">+ Add Material</button></div>' +
      '</div>'
    })() +
    '</div>' +
    '<div style="margin-bottom: 16px;"><label style="display: block; margin-bottom: 4px; font-weight: 500;">Required Skills</label><div id="required-skills-display" style="font-size: 12px; color: var(--muted-foreground);">' + (Array.isArray(node.skills) ? node.skills.map(escapeHtml).join(', ') : 'None') + '</div></div>'

  const formEl = document.getElementById('node-edit-form')
  if (formEl) formEl.innerHTML = formContent
  const modal = document.getElementById('node-edit-modal')
  if (modal) {
    modal.style.display = 'block'
    lockBodyScroll() // Prevent background scrolling
    // Populate output qty/unit fields from node if present
    try {
      const qtyEl = document.getElementById('edit-output-qty')
      const unitEl = document.getElementById('edit-output-unit')
      if (qtyEl) qtyEl.value = node.outputQty != null ? String(node.outputQty) : ''
      if (unitEl) populateUnitSelect(unitEl, node.outputUnit || '')
      // dynamic preview on output qty/unit change
      try {
        if (qtyEl) qtyEl.addEventListener('input', updateOutputCodePreviewBackend)
        if (unitEl) unitEl.addEventListener('change', updateOutputCodePreviewBackend)
      } catch {}
    } catch {}
    // Initial output code preview
    try { updateOutputCodePreviewBackend() } catch {}

    // Live update: when connections/materials change on this node while modal is open
    try {
      if (materialChangeHandler) {
        window.removeEventListener('nodeMaterialsChanged', materialChangeHandler)
        materialChangeHandler = null
      }
      materialChangeHandler = (ev) => {
        try {
          const modalEl = document.getElementById('node-edit-modal')
          if (!modalEl || modalEl.style.display === 'none') {
            // modal closed, cleanup listener
            window.removeEventListener('nodeMaterialsChanged', materialChangeHandler)
            materialChangeHandler = null
            return
          }
          const nid = ev?.detail?.nodeId
          if (!nid || nid !== node.id) return
          // Rebuild rows from current node state to include auto-derived materials and then refresh preview
          rebuildMaterialRowsFromNode(node)
          updateOutputCodePreviewBackend()
        } catch (e) { console.warn('materialChangeHandler failed', e) }
      }
      window.addEventListener('nodeMaterialsChanged', materialChangeHandler)
    } catch {}
    
    // Setup drag and drop for station selection
    setTimeout(() => {
      setupStationDragAndDrop()
      setupGlobalDropdownHandlers()
      updateWorkerAssignmentFromStations() // Initialize worker dropdown
    }, 100)
    
    // Add escape key listener
    modalEscapeHandler = (e) => {
      if (e.key === 'Escape') {
        closeNodeEditModal()
      }
    }
    document.addEventListener('keydown', modalEscapeHandler)
  }
}

// Legacy function kept for compatibility (no longer used in plan designer)
export function handleAssignModeChangeBackend() {
  // Worker assignment mode selection is now only stored, not processed during plan design
  // Actual assignment happens when production starts
}

export function saveNodeEditBackend() {
  const node = planDesignerState.selectedNode
  if (!node) return
  const name = document.getElementById('edit-name')?.value?.trim()
  const time = parseInt(document.getElementById('edit-time')?.value, 10)
  const efficiencyInput = document.getElementById('edit-efficiency')?.value || ''
  const assignMode = (document.querySelector('input[name="edit-assign-mode"]:checked')?.value || null)
  const workerChoice = document.getElementById('edit-worker')?.value || null // Get selected worker
  const outQtyVal = document.getElementById('edit-output-qty')?.value
  const outUnit = document.getElementById('edit-output-unit')?.value || ''
  
  // collect materials rows
  const rowsContainer = document.getElementById('edit-materials-rows')
  const rows = rowsContainer ? Array.from(rowsContainer.querySelectorAll('.material-row')) : []
  const materialInputs = []
  // Map previous derived relations to preserve derivedFrom on save
  const prev = Array.isArray(node.materialInputs) ? node.materialInputs : []
  const derivedMap = new Map()
  prev.forEach(pm => {
    if (pm && pm.derivedFrom) {
      const keyA = (pm.materialCode || '').toString()
      const keyB = (pm.name || '').toString()
      if (keyA) derivedMap.set(keyA, pm.derivedFrom)
      if (keyB) derivedMap.set(keyB, pm.derivedFrom)
    }
  })
  for (const row of rows) {
    const idx = row.getAttribute('data-row-index')
    const materialCode = document.getElementById('edit-material-id-'+idx)?.value || ''
    const name = document.getElementById('edit-material-name-'+idx)?.value || ''
    const qtyVal = document.getElementById('edit-material-qty-'+idx)?.value
    const requiredQuantity = qtyVal === '' ? null : (parseFloat(qtyVal))
    const unit = document.getElementById('edit-material-unit-'+idx)?.value || ''
    const isDerived = row.getAttribute('data-derived') === '1'
    if (materialCode) {
      const base = { materialCode, name: name || materialCode, requiredQuantity: Number.isFinite(requiredQuantity)?requiredQuantity:null, unit }
      if (isDerived) {
        const df = derivedMap.get(materialCode) || derivedMap.get(name)
        if (df) base.derivedFrom = df
      }
      materialInputs.push(base)
    }
  }

  // ============================================================================
  // STRICT VALIDATION RULES FOR NODE SAVE
  // ============================================================================
  
  // 1. Validate operation name and estimated time
  if (!name || !Number.isFinite(time) || time < 1) { 
    showErrorToast('Please fill in the operation name and estimated time.');
    return;
  }
  
  // 1b. Validate manual worker assignment (if manual mode selected)
  if (assignMode === 'manual' && !workerChoice) {
    showErrorToast('Manual assignment requires a worker selection.');
    return;
  }

  // 2. Validate station selection (at least 1 required)
  if (!Array.isArray(node.assignedStations) || node.assignedStations.length === 0) {
    showErrorToast('At least one work station must be selected.');
    return;
  }

  // 3. Validate material inputs (PRIORITY: Check materials first)
  // Check if starting operations (no predecessors) have at least one material input
  const hasPredecessors = Array.isArray(node.predecessors) && node.predecessors.length > 0;
  const hasNonDerivedMaterial = materialInputs.some(m => !m.derivedFrom);

  if (!hasPredecessors && !hasNonDerivedMaterial && materialInputs.length === 0) {
    showErrorToast('Starting operations must have at least one material input.');
    return;
  }

  // Check if each selected material has a valid quantity
  for (const material of materialInputs) {
    console.log('🔍 Validating material:', material);
    if (!Number.isFinite(material.requiredQuantity) || material.requiredQuantity < 0) {
      showErrorToast('Please enter a valid quantity for each selected material.');
      return;
    }
  }

  // 4. Validate output quantity and unit
  const outQtyNum = outQtyVal === '' ? null : parseFloat(outQtyVal);
  if (!Number.isFinite(outQtyNum) || outQtyNum <= 0) {
    showErrorToast('Output quantity must be a number greater than 0.');
    return;
  }
  if (!outUnit || outUnit.trim() === '') {
    showErrorToast('An output unit must be selected.');
    return;
  }

  // ============================================================================
  // APPLY VALIDATED VALUES TO NODE
  // ============================================================================
  
  node.name = name
  node.time = time
  
  // Validate and convert efficiency (percent to decimal)
  if (efficiencyInput.trim() !== '') {
    const efficiencyPercent = parseFloat(efficiencyInput);
    if (!Number.isFinite(efficiencyPercent) || efficiencyPercent <= 0 || efficiencyPercent > 100) {
      showErrorToast('Verimlilik %0.1 ile %100 arasında olmalıdır');
      return;
    }
    node.efficiency = efficiencyPercent / 100; // Convert to decimal (0.0-1.0)
    console.log(`Node ${node.id} efficiency override: ${node.efficiency} (${efficiencyPercent}%)`);
  } else {
    // Remove efficiency override if input is empty
    delete node.efficiency;
    console.log(`Node ${node.id} will use operation default efficiency`);
  }
  
  // Calculate effectiveTime based on efficiency (node override or operation default)
  let effectiveTimeEfficiency = node.efficiency;
  if (!effectiveTimeEfficiency) {
    // Fallback to operation default efficiency
    const operation = _opsCache?.find(op => op.name === node.name);
    effectiveTimeEfficiency = operation?.defaultEfficiency || 1.0;
  }
  node.effectiveTime = time > 0 ? Math.round(time / effectiveTimeEfficiency) : 0;
  console.log(`Node ${node.id} effectiveTime calculated: ${node.effectiveTime} min (nominalTime: ${time}, efficiency: ${effectiveTimeEfficiency})`);
  
  // Stations are already set by UI handlers
  // assignedStations[] is already updated with priority order
  
  node.assignmentMode = assignMode || 'auto'
  node.outputQty = outQtyNum // Already validated as finite number > 0
  node.outputUnit = outUnit.trim() // Already validated as non-empty

  // Worker assignment based on mode
  if (assignMode === 'manual') {
    // Manual mode: keep worker selection from dropdown
    node.assignedWorkerId = workerChoice || null;
    if (node.assignedWorkerId) {
      const selectedWorker = _workersCacheFull.find(w => w.id === node.assignedWorkerId);
      node.assignedWorkerName = selectedWorker ? selectedWorker.name : null;
    } else {
      node.assignedWorkerName = null;
    }
  } else {
    // Auto mode: clear worker assignment (backend will assign at launch)
    node.assignedWorkerId = null;
    node.assignedWorkerName = null;
  }
  node.assignedWorker = null; // Legacy field, not used
  
  console.log('🔍 Node saved with assignment data:', {
    nodeId: node.id,
    nodeName: node.name,
    assignmentMode: node.assignmentMode,
    assignedWorkerId: node.assignedWorkerId,
    assignedWorkerName: node.assignedWorkerName,
    time: node.time,
    outputQty: node.outputQty,
    outputUnit: node.outputUnit
  });
  
  // Summary log for easier debugging
  if (node.assignmentMode === 'manual') {
    if (node.assignedWorkerId) {
      console.log(`✅ Manual worker assignment: ${node.assignedWorkerName} (${node.assignedWorkerId})`);
    } else {
      console.warn('⚠️ Manual mode selected but no worker assigned!');
    }
  } else {
    console.log('✅ Auto worker assignment mode (backend will assign at launch)');
  }

  applyMaterial();

  function applyMaterial() {
    // Support multi materials
    node.materialInputs = materialInputs.map(m => ({
      materialCode: m.materialCode,
      name: m.name,
      requiredQuantity: m.requiredQuantity,
      unit: m.unit,
      unitRatio: 1,
      ...(m.derivedFrom ? { derivedFrom: m.derivedFrom } : {})
    }))
    
    console.log('🔍 STEP 1 - saveNodeEdit applyMaterial:', {
      nodeId: node.id,
      materialInputsCount: materialInputs.length,
      materialInputs: materialInputs,
      nodeMaterialInputs: node.materialInputs
    });
    
    // Compute/update semi-finished product code preview (not committed yet)
    // Actual commit happens when the plan is saved
    try {
      computeAndAssignSemiCode(node, _opsCache, planDesignerState.availableStations || [])
      // Propagate changes to downstream nodes (derived materials)
      try { propagateDerivedMaterialUpdate(node.id) } catch {}
    } catch (e) {
      console.warn('Semi-code computation failed:', e)
    }
    
    // Invalidate timing summary cache when node changes
    planDesignerState.timingSummary = null;
    
    // Clear edit snapshot (changes are saved, no need to restore)
    planDesignerState.nodeEditSnapshot = null;
    
    renderCanvas()
    const modal = document.getElementById('node-edit-modal')
    if (modal) {
      modal.style.display = 'none'
      unlockBodyScroll() // Restore background scrolling
    }
    planDesignerState.selectedNode = null
    
    // Remove escape key listener
    if (modalEscapeHandler) {
      document.removeEventListener('keydown', modalEscapeHandler)
      modalEscapeHandler = null
    }
    // Remove materials sync listener
    if (materialChangeHandler) {
      try { window.removeEventListener('nodeMaterialsChanged', materialChangeHandler) } catch {}
      materialChangeHandler = null
    }
    showSuccessToast('Operation updated')
  }
}

// Material dropdown logic
export async function openMaterialDropdown(rowIdx) {
  try {
    console.log('🎯 openMaterialDropdown called')
    const dd = document.getElementById('edit-material-dropdown-' + rowIdx)
    const list = document.getElementById('edit-material-list-' + rowIdx)
    const search = document.getElementById('edit-material-search-' + rowIdx)
    
    console.log('DOM elements found:', {
      dropdown: !!dd,
      list: !!list,
      search: !!search
    })
    
    if (!dd || !list) {
      console.error('Required DOM elements not found!')
      return
    }
    
    // Load materials if not cached or cache is empty
    if (!_materialsCacheFull || !_materialsCacheFull.length) {
      try {
        console.log('Loading materials from API...')
        const mats = await getMaterials(true)
        console.log(`Received ${mats?.length || 0} materials from API`)
        
        if (mats && mats.length > 0) {
          console.log('First few raw materials from API:', mats.slice(0, 5).map(m => ({ 
            code: m.code, 
            name: m.name, 
            category: m.category, 
            status: m.status,
            type: m.type
          })))
        }
        
        const beforeFilter = mats?.length || 0
        _materialsCacheFull = (mats || []).filter(isRawMaterial)
        const afterFilter = _materialsCacheFull.length
        
        console.log(`Material filtering: ${beforeFilter} → ${afterFilter} (filtered ${beforeFilter - afterFilter})`)
        console.log(`Loaded ${_materialsCacheFull.length} active raw materials (Ham madde)`)
        
        // If no materials pass filter, show debug info and use ALL materials for testing
        if (_materialsCacheFull.length === 0 && mats && mats.length > 0) {
          console.warn('⚠️ No materials passed the filter! Showing ALL materials for debugging:')
          console.log('Available categories:', [...new Set(mats.map(m => m.category))].sort())
          console.log('Available statuses:', [...new Set(mats.map(m => m.status))].sort())
          _materialsCacheFull = mats // Use ALL materials for debugging instead of just 5
          console.log('Fallback materials count:', _materialsCacheFull.length)
        }
        
        if (_materialsCacheFull.length > 0) {
          console.log('Sample filtered materials:', _materialsCacheFull.slice(0, 5).map(m => ({ 
            code: m.code, 
            name: m.name, 
            category: m.category, 
            status: m.status 
          })))
          console.log(`Total materials available for dropdown: ${_materialsCacheFull.length}`)
        }
      } catch (error) {
        console.error('Failed to load materials:', error)
        _materialsCacheFull = []
        list.innerHTML = '<div style="padding:8px; color:#ef4444;">Failed to load materials. Please try again.</div>'
        dd.style.display = 'block'
        return
      }
    }
    
    buildMaterialList('', rowIdx)
    dd.style.display = 'block'
    setTimeout(() => { try { search?.focus() } catch {} }, 0)
    document.addEventListener('click', (ev) => handleMaterialClickOutside(ev, rowIdx), { once: true })
  } catch (e) { 
    console.warn('openMaterialDropdown failed', e)
    // Try to show some feedback to user
    const list = document.getElementById('edit-material-list-' + rowIdx)
    if (list) {
      list.innerHTML = '<div style="padding:8px; color:#ef4444;">Error opening materials dropdown</div>'
    }
  }
}

export function filterMaterialDropdown(rowIdx) {
  const q = document.getElementById('edit-material-search-' + rowIdx)?.value || ''
  buildMaterialList(q, rowIdx)
}

function buildMaterialList(query, rowIdx) {
  const list = document.getElementById('edit-material-list-' + rowIdx)
  if (!list) {
    console.warn('buildMaterialList: edit-material-list element not found')
    return
  }
  
  console.log('buildMaterialList called with query:', query)
  console.log('_materialsCacheFull:', _materialsCacheFull)
  console.log('_materialsCacheFull length:', _materialsCacheFull?.length || 0)
  
  if (!_materialsCacheFull || _materialsCacheFull.length === 0) {
    console.warn('No materials in cache')
    list.innerHTML = '<div style="padding:8px; color:#ef4444;">No materials loaded</div>'
    return
  }
  
  const q = (query || '').toString().trim().toLowerCase()
  const items = (_materialsCacheFull||[]).filter(m => {
    const code = (m.code || '').toString().toLowerCase()
    const name = (m.name || m.title || '').toString().toLowerCase()
    const supplier = Array.isArray(m.suppliers) ? (m.suppliers.join(' ').toLowerCase()) : (m.supplier || '').toString().toLowerCase()
    const hay = `${code} ${name} ${supplier}`
    const match = !q || hay.includes(q)
    if (!match && q) {
      console.log(`Material filtered out: "${m.name}" (${m.code}) - search: "${q}", hay: "${hay}"`)
    }
    return match
  }) // Removed the .slice(0, 200) limit to show ALL materials
  
  console.log(`Filtered materials count: ${items.length} (showing all)`)
  if (items.length > 0) {
    console.log('First few materials:', items.slice(0, 3).map(m => ({ code: m.code, name: m.name, category: m.category, status: m.status })))
    console.log(`Total materials displayed: ${items.length}`)
  }
  
  list.innerHTML = items.map(m => {
    const label = formatMaterialLabel(m)
    const id = escapeHtml(m.id || m.code || m.name)
    return `<div onclick="selectMaterialFromDropdown('${id}', ${rowIdx})" style="padding:6px 8px; cursor:pointer; border-bottom:1px solid var(--border); transition: background-color 0.15s ease;" onmouseover="this.style.background='#f9fafb'" onmouseout="this.style.background='white'">${escapeHtml(label)}</div>`
  }).join('') || '<div style="padding:8px; color:#6b7280;">No materials found</div>'
  
  console.log('Material list HTML set, length:', list.innerHTML.length)
  console.log(`Generated ${items.length} material items for dropdown`)
}

export function selectMaterialFromDropdown(id, rowIdx) {
  try {
    console.log('🎯 selectMaterialFromDropdown called:', { id, rowIdx, idType: typeof id })
    // Convert id to both string and number for flexible matching
    const idStr = String(id)
    const idNum = parseInt(id, 10)
    const m = (_materialsCacheFull||[]).find(x => 
      x.id === id || x.id === idStr || x.id === idNum ||
      x.code === id || x.code === idStr ||
      x.name === id
    )
    console.log('🔍 Material found:', m ? `${m.code} - ${m.name}` : 'NOT FOUND')
    const disp = document.getElementById('edit-material-display-' + rowIdx)
    const idEl = document.getElementById('edit-material-id-' + rowIdx)
    const nameEl = document.getElementById('edit-material-name-' + rowIdx)
    const unitEl = document.getElementById('edit-material-unit-' + rowIdx)
    const dd = document.getElementById('edit-material-dropdown-' + rowIdx)
    console.log('🔍 DOM elements:', { disp: !!disp, idEl: !!idEl, nameEl: !!nameEl, dd: !!dd })
    if (!m || !disp || !idEl || !nameEl || !dd) {
      console.warn('❌ Selection failed - missing:', { m: !!m, disp: !!disp, idEl: !!idEl, nameEl: !!nameEl, dd: !!dd })
      return
    }
    
    const node = planDesignerState.selectedNode;
    
    // Check if material code changed (breaks template lock)
    if (node && node._isTemplateApplied) {
      const oldMaterialCode = idEl.value;
      const newMaterialCode = m.id || m.code || '';
      
      if (oldMaterialCode && oldMaterialCode !== newMaterialCode) {
        const confirmChange = confirm(
          `⚠️ UYARI: Malzemeyi değiştiriyorsunuz!\n\n` +
          `Eski: ${oldMaterialCode}\n` +
          `Yeni: ${newMaterialCode}\n\n` +
          `Malzeme değiştiği için template lock kaldırılacak ve yeni bir ürün kodu (Output Code) oluşturulacaktır.\n\n` +
          `Devam etmek istediğinizden emin misiniz?`
        );
        
        if (!confirmChange) {
          dd.style.display = 'none';
          return;
        }
        
        // Unlock template
        node._isTemplateApplied = false;
        console.log('🔓 Template unlocked - material code changed');
      }
    }
    
    // Store material CODE (M-001), not database ID (7) - materialCode field expects code
    idEl.value = m.code || m.id || ''
    nameEl.value = m.name || m.title || ''
    disp.value = formatMaterialLabel(m)
    if (unitEl) {
      unitEl.value = m.unit || m.measurementUnit || m.birim || ''
    }
    dd.style.display = 'none'
    console.log('✅ Material selected:', { code: m.code, name: m.name })
    try { updateOutputCodePreviewBackend() } catch {}
  } catch (err) {
    console.error('❌ Error in selectMaterialFromDropdown:', err)
  }
}

function handleMaterialClickOutside(ev, rowIdx) {
  const dd = document.getElementById('edit-material-dropdown-' + rowIdx)
  const disp = document.getElementById('edit-material-display-' + rowIdx)
  if (!dd || !disp) return
  const target = ev.target
  if (dd.contains(target) || disp.contains(target)) {
    document.addEventListener('click', (e) => handleMaterialClickOutside(e, rowIdx), { once: true })
    return
  }
  dd.style.display = 'none'
}

// Dynamic material rows
export function addMaterialRow() {
  const container = document.getElementById('edit-materials-rows')
  if (!container) return
  const idx = container.querySelectorAll('.material-row').length
  const html = (
    '<div class="material-row" data-row-index="'+idx+'" style="display:flex; gap:8px; align-items:flex-start; margin-bottom:8px;">' +
      '<div style="position:relative; flex: 3;">' +
        '<input type="hidden" id="edit-material-id-'+idx+'" value="" />' +
        '<input type="hidden" id="edit-material-name-'+idx+'" value="" />' +
        '<input id="edit-material-display-'+idx+'" type="text" readonly placeholder="Select material" value="" style="width: 100%; padding: 8px; border: 1px solid var(--border); border-radius: 4px; background: #f9fafb; cursor: pointer;" onclick="openMaterialDropdown('+idx+')" />' +
        '<div id="edit-material-dropdown-'+idx+'" style="display:none; position:absolute; left:0; right:0; top:38px; background:white; border:1px solid var(--border); border-radius: 6px; box-shadow: 0 8px 16px rgba(0,0,0,0.08); z-index:9999;">' +
          '<div style="padding:6px; border-bottom:1px solid var(--border);"><input id="edit-material-search-'+idx+'" type="text" placeholder="Ara: kod, isim, tedarikçi" oninput="filterMaterialDropdown('+idx+')" style="width:100%; padding:6px 8px; border:1px solid var(--border); border-radius:6px; font-size:12px;" /></div>' +
          '<div id="edit-material-list-'+idx+'" style="max-height:220px; overflow:auto; font-size:13px;"></div>' +
        '</div>' +
      '</div>' +
      '<div style="flex:2;">' +
        '<input id="edit-material-qty-'+idx+'" type="number" min="0" step="0.01" placeholder="Qty" style="width:100%; padding: 8px; border: 1px solid var(--border); border-radius: 4px;" value="" oninput="updateOutputCodePreviewBackend()" />' +
      '</div>' +
      '<div style="flex:1;">' +
        '<input id="edit-material-unit-'+idx+'" type="text" readonly placeholder="Unit" style="width:100%; padding: 8px; border: 1px solid var(--border); border-radius: 4px; background: #f9fafb; color: #6b7280;" value="" />' +
      '</div>' +
      '<div style="flex:0; display:flex; align-items:center;">' +
        '<button type="button" onclick="removeMaterialRow('+idx+')" title="Kaldır" style="width:28px; height:32px; border:1px solid var(--border); background:#fee2e2; color:#ef4444; border-radius:6px;">-</button>' +
      '</div>' +
    '</div>'
  )
  const wrapper = document.createElement('div')
  wrapper.innerHTML = html
  container.appendChild(wrapper.firstChild)
}

// Update footer output code label based on current form values
export async function updateOutputCodePreviewBackend() {
  try {
    const node = planDesignerState.selectedNode
    if (!node) return
    
    // If template is locked, don't recalculate code - show template code
    if (node._isTemplateApplied && node._templateCode) {
      const label = document.getElementById('node-output-code-label')
      if (label) {
        label.textContent = `Output: ${node._templateCode}`
        label.style.color = '#10b981'; // Green = locked
      }
      console.log('🔒 Template locked - showing template code:', node._templateCode);
      return;
    }
    
    // Collect material inputs from form
    const rowsContainer = document.getElementById('edit-materials-rows')
    const rows = rowsContainer ? Array.from(rowsContainer.querySelectorAll('.material-row')) : []
    const materialInputs = []
    for (const row of rows) {
      const idx = row.getAttribute('data-row-index')
      const materialCode = document.getElementById('edit-material-id-'+idx)?.value || ''
      const qtyVal = document.getElementById('edit-material-qty-'+idx)?.value
      const requiredQuantity = qtyVal === '' ? null : parseFloat(qtyVal)
      const unit = document.getElementById('edit-material-unit-'+idx)?.value || ''
      if (materialCode) {
        materialInputs.push({ 
          materialCode, 
          requiredQuantity: Number.isFinite(requiredQuantity) ? requiredQuantity : null,
          unit,
          unitRatio: 1
        })
      }
    }
    
    // Create temp node with current form values (schema-compliant)
    const temp = { 
      ...node, 
      materialInputs,
      assignedStations: node.assignedStations || []
    }
    
    const code = await getSemiCodePreviewForNode(temp, _opsCache, _stationsCacheFull).catch(() => null)
    const label = document.getElementById('node-output-code-label')
    if (label) {
      if (code) {
        label.textContent = `Output: ${code}`
        label.style.color = ''; // Default color = unlocked
      } else {
        const prefix = getPrefixForNode(temp, _opsCache, _stationsCacheFull)
        label.textContent = prefix ? `Output: ${prefix}-` : 'Output: —'
      }
    }
  } catch (e) {
    console.warn('updateOutputCodePreviewBackend failed', e)
  }
}

export function removeMaterialRow(idx) {
  const row = document.querySelector('.material-row[data-row-index="'+idx+'"]')
  if (!row) return
  if (row.getAttribute('data-derived') === '1') return // do not remove auto-derived materials
  const container = row.parentElement
  row.remove()
  if (!container) return
  // Reindex remaining rows
  const rows = Array.from(container.querySelectorAll('.material-row'))
  rows.forEach((r, i) => {
    r.setAttribute('data-row-index', i)
    const hid = r.querySelector('[id^="edit-material-id-"]'); if (hid) hid.id = 'edit-material-id-' + i
    const hname = r.querySelector('[id^="edit-material-name-"]'); if (hname) hname.id = 'edit-material-name-' + i
    const disp = r.querySelector('[id^="edit-material-display-"]'); if (disp) {
      disp.id = 'edit-material-display-' + i
      if (r.getAttribute('data-derived') !== '1') {
        disp.setAttribute('onclick', 'openMaterialDropdown('+i+')')
      } else {
        disp.removeAttribute('onclick')
      }
    }
    const dd = r.querySelector('[id^="edit-material-dropdown-"]'); if (dd) dd.id = 'edit-material-dropdown-' + i
    const search = r.querySelector('[id^="edit-material-search-"]'); if (search) { search.id = 'edit-material-search-' + i; search.setAttribute('oninput', 'filterMaterialDropdown('+i+')') }
    const list = r.querySelector('[id^="edit-material-list-"]'); if (list) list.id = 'edit-material-list-' + i
    const qty = r.querySelector('[id^="edit-material-qty-"]'); if (qty) qty.id = 'edit-material-qty-' + i
    const unit = r.querySelector('[id^="edit-material-unit-"]'); if (unit) unit.id = 'edit-material-unit-' + i
    const btn = r.querySelector('button'); if (btn) btn.setAttribute('onclick', 'removeMaterialRow('+i+')')
  })
}

function formatMaterialLabel(m) {
  if (!m) return ''
  const code = m.code || m.materialCode || ''
  const name = m.name || m.materialName || m.title || ''
  return [code, name].filter(Boolean).join(' — ')
}

// Multi-station priority selector (substations assigned automatically at launch)
function generateMultiStationSelector(node, compatibleStations) {
  // Ensure assignedStations array exists
  if (!Array.isArray(node.assignedStations)) {
    node.assignedStations = [];
  }
  
  const selectedStations = node.assignedStations || [];
  
  // Build selected stations list
  const selectedStationsHtml = selectedStations.length > 0 
    ? '<div style="margin-bottom: 12px; border: 1px solid var(--border); border-radius: 4px; padding: 8px; background: #f9fafb;">' +
        '<div style="font-size: 11px; color: #6b7280; margin-bottom: 6px; font-weight: 500; text-transform: uppercase;">Selected Stations (Priority Order)</div>' +
        selectedStations
          .sort((a, b) => a.priority - b.priority)
          .map(station => {
            const stId = station.stationId || station.id;  // Support both for backward compatibility
            return '<div style="display: flex; align-items: center; padding: 8px; background: white; border-radius: 4px; margin-bottom: 4px; border: 1px solid #e5e7eb;">' +
              '<span style="display: inline-flex; align-items: center; justify-content: center; width: 24px; height: 24px; background: #3b82f6; color: white; border-radius: 50%; font-size: 12px; font-weight: 600; margin-right: 8px;">' + station.priority + '</span>' +
              '<span style="flex: 1; font-weight: 500; font-size: 13px;">' + escapeHtml(stId) + ' – ' + escapeHtml(station.name) + '</span>' +
              '<button type="button" onclick="removeSelectedStationById(\'' + escapeHtml(stId) + '\')" ' +
                'style="padding: 4px 8px; background: #fee; color: #c00; border: 1px solid #fcc; border-radius: 4px; cursor: pointer; font-size: 11px; font-weight: 500;">' +
                'Remove' +
              '</button>' +
            '</div>';
          }).join('') +
      '</div>'
    : '<div style="margin-bottom: 12px; padding: 12px; background: #fef3c7; border: 1px solid #fde68a; border-radius: 4px; font-size: 13px; color: #92400e;">' +
        '⚠️ No stations selected. Please add at least one station below.' +
      '</div>';

  return '<div style="margin-bottom: 16px;">' +
    '<label style="display: block; margin-bottom: 4px; font-weight: 500;">Work Stations * <span style="font-size: 11px; color: #6b7280; font-weight: 400;">(Priority order)</span></label>' +
    selectedStationsHtml +
    '<div class="custom-dropdown" style="position: relative;">' +
      '<div id="station-selector-button" onclick="toggleStationDropdown()" ' +
        'style="padding: 8px 12px; border: 1px solid var(--border); border-radius: 4px; background: white; cursor: pointer; ' +
        'display: flex; align-items: center; justify-content: space-between; min-height: 40px;">' +
        '<span id="station-selector-text" style="color: #6b7280;">Select station to add...</span>' +
        '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
          '<path d="M6 9l6 6 6-6"></path>' +
        '</svg>' +
      '</div>' +
      '<div id="station-dropdown-list" style="position: absolute; top: 100%; left: 0; right: 0; background: white; ' +
        'border: 1px solid var(--border); border-radius: 4px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); ' +
        'max-height: 250px; overflow-y: auto; z-index: 1000; display: none;">' +
        (compatibleStations.length === 0 ? 
          '<div style="padding: 12px; color: #6b7280; text-align: center; font-style: italic;">No compatible stations</div>' :
          compatibleStations.map(s => {
            const displayName = `${s.id} – ${s.name}`;
            const alreadySelected = selectedStations.some(ss => (ss.stationId || ss.id) === s.id);
            return '<div class="station-dropdown-item" data-station-id="' + escapeHtml(s.id) + '" ' +
              'onclick="selectStationFromDropdown(\'' + escapeHtml(s.id) + '\', \'' + escapeHtml(s.name) + '\')" ' +
              'style="padding: 10px 12px; cursor: pointer; border-bottom: 1px solid #f3f4f6; display: flex; align-items: center; gap: 8px; ' +
              'background: white; transition: all 0.2s; ' + (alreadySelected ? 'opacity: 0.4; pointer-events: none;' : '') + '">' +
              '<div style="width: 8px; height: 8px; background: #10b981; border-radius: 50%; flex-shrink: 0;"></div>' +
              '<span style="flex: 1; font-weight: 500;">' + escapeHtml(displayName) + '</span>' +
              (alreadySelected ? '<span style="font-size: 11px; color: #10b981;">✓</span>' : '') +
              '</div>';
          }).join('')
        ) +
      '</div>' +
    '</div>' +
    '<button type="button" onclick="addSelectedStation()" ' +
      'style="margin-top: 8px; padding: 6px 12px; background: #3b82f6; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 13px; font-weight: 500; width: 100%;">' +
      '+ Add Selected Station' +
    '</button>' +
    '</div>';
}

// Station change handler inside edit modal
export function handleStationChangeInEdit() {
  try {
    updateOutputCodePreviewBackend()
  } catch (e) { console.warn('handleStationChangeInEdit failed', e) }
}

// Station management functions for multi-select
window.addSelectedStation = function() {
  const selectedStation = window.selectedStationValue || null
  if (!selectedStation || !selectedStation.id || !selectedStation.name) {
    showWarningToast('Please select a station first')
    return
  }

  const node = planDesignerState.selectedNode
  if (!node) return

  // Check template lock before modifying stations
  if (node._isTemplateApplied && node._templateCode) {
    const confirmChange = confirm(
      "⚠️ UYARI: Tezgah ekliyorsunuz!\n\n" +
      "Mevcut template lock kaldırılacak ve yeni bir ürün kodu oluşturulacaktır.\n\n" +
      "Devam etmek istediğinizden emin misiniz?"
    );
    if (!confirmChange) return;
    
    // Unlock template
    node._isTemplateApplied = false;
    node._templateCode = null;
    node._templateRatios = null;
    console.log('🔓 Template unlocked - station added');
    
    // Update code preview immediately
    updateOutputCodePreviewBackend();
  }

  // Initialize assignedStations if not exists
  if (!Array.isArray(node.assignedStations)) {
    node.assignedStations = []
  }

  // Check if already selected (by stationId)
  if (node.assignedStations.find(s => (s.stationId || s.id) === selectedStation.id)) {
    showWarningToast('Station already selected')
    return
  }

  // Add with next priority
  const maxPriority = Math.max(0, ...node.assignedStations.map(s => s.priority || 0))
  node.assignedStations.push({
    stationId: selectedStation.id,  // SCHEMA: stationId (not id)
    name: selectedStation.name,
    priority: maxPriority + 1
  })

  // Reset selection
  window.selectedStationValue = null
  const textEl = document.getElementById('station-selector-text')
  if (textEl) {
    textEl.textContent = 'Select station to add...'
    textEl.style.color = '#6b7280' // Reset to gray placeholder color
  }
  
  // Close dropdown
  const dropdown = document.getElementById('station-dropdown-list')
  if (dropdown) dropdown.style.display = 'none'

  // Refresh UI
  refreshStationSelector()
  handleStationChangeInEdit()
  showSuccessToast('Station added')
}

// Custom dropdown functions
window.toggleStationDropdown = function() {
  const dropdown = document.getElementById('station-dropdown-list')
  if (!dropdown) return
  
  const isVisible = dropdown.style.display !== 'none'
  
  // Close all other dropdowns first
  document.querySelectorAll('.station-dropdown-list, [id*="dropdown"]').forEach(d => {
    if (d !== dropdown) d.style.display = 'none'
  })
  
  dropdown.style.display = isVisible ? 'none' : 'block'
  
  // Add click outside handler
  if (!isVisible) {
    setTimeout(() => {
      document.addEventListener('click', function closeDropdown(e) {
        if (!e.target.closest('.custom-dropdown')) {
          dropdown.style.display = 'none'
          document.removeEventListener('click', closeDropdown)
        }
      })
    }, 0)
  }
}

window.selectStationFromDropdown = function(stationId, stationName) {
  window.selectedStationValue = { id: stationId, name: stationName }
  const textEl = document.getElementById('station-selector-text')
  if (textEl) {
    const displayText = stationId ? `${stationId} – ${stationName}` : stationName
    textEl.textContent = displayText
    textEl.style.color = '#111827' // Darker color when selected
  }
  
  // Close dropdown
  const dropdown = document.getElementById('station-dropdown-list')
  if (dropdown) dropdown.style.display = 'none'
}

window.removeSelectedStationById = function(stationId) {
  const node = planDesignerState.selectedNode
  if (!node || !Array.isArray(node.assignedStations)) return

  // Check template lock before modifying stations
  if (node._isTemplateApplied && node._templateCode) {
    const confirmChange = confirm(
      "⚠️ UYARI: Tezgah kaldırıyorsunuz!\n\n" +
      "Mevcut template lock kaldırılacak ve yeni bir ürün kodu oluşturulacaktır.\n\n" +
      "Devam etmek istediğinizden emin misiniz?"
    );
    if (!confirmChange) return;
    
    // Unlock template
    node._isTemplateApplied = false;
    node._templateCode = null;
    node._templateRatios = null;
    console.log('🔓 Template unlocked - station removed');
    
    // Update code preview immediately
    updateOutputCodePreviewBackend();
  }

  // Remove station by stationId (with fallback to id for backward compatibility)
  node.assignedStations = node.assignedStations.filter(s => (s.stationId || s.id) !== stationId)

  // Renumber priorities
  node.assignedStations.forEach((station, index) => {
    station.priority = index + 1
  })

  // Refresh UI
  refreshStationSelector()
  handleStationChangeInEdit()
  showSuccessToast('Station removed')
}

window.removeSelectedStation = function(stationName) {
  const node = planDesignerState.selectedNode
  if (!node || !Array.isArray(node.assignedStations)) return

  // Remove station by name (legacy support)
  node.assignedStations = node.assignedStations.filter(s => s.name !== stationName)

  // Renumber priorities
  node.assignedStations.forEach((station, index) => {
    station.priority = index + 1
  })

  // Refresh UI
  refreshStationSelector()
  handleStationChangeInEdit()
  showSuccessToast('Station removed')
}

function refreshStationSelector() {
  const node = planDesignerState.selectedNode
  if (!node) return

  // Get compatible stations
  const compatibleStations = _stationsCacheFull.filter(s => 
    Array.isArray(s.operationIds) && s.operationIds.includes(node.operationId)
  )

  // Find the station selector container
  const listElement = document.querySelector('#station-selector-button');
  if (!listElement) {
    console.warn('Station selector not found in DOM, cannot refresh');
    return;
  }
  
  // Find the parent container (the entire station selector section)
  const container = listElement.closest('[style*="margin-bottom"]');
  if (!container) {
    console.warn('Station selector container not found');
    return;
  }

  // Replace the entire station selector HTML
  const newHtml = generateMultiStationSelector(node, compatibleStations);
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = newHtml;
  container.replaceWith(tempDiv.firstElementChild);

  // Reset selected value
  window.selectedStationValue = null;
}

function setupStationDragAndDrop() {
  const container = document.getElementById('selected-stations-list')
  if (!container) return

  let draggedElement = null

  container.addEventListener('dragstart', (e) => {
    if (e.target.classList.contains('selected-station-item')) {
      draggedElement = e.target
      e.target.style.opacity = '0.5'
    }
  })

  container.addEventListener('dragend', (e) => {
    if (e.target.classList.contains('selected-station-item')) {
      e.target.style.opacity = '1'
      draggedElement = null
    }
  })

  container.addEventListener('dragover', (e) => {
    e.preventDefault()
  })

  container.addEventListener('drop', (e) => {
    e.preventDefault()
    if (!draggedElement) return

    const dropTarget = e.target.closest('.selected-station-item')
    if (!dropTarget || dropTarget === draggedElement) return

    const container = document.getElementById('selected-stations-list')
    const allItems = Array.from(container.querySelectorAll('.selected-station-item'))
    const draggedIndex = allItems.indexOf(draggedElement)
    const targetIndex = allItems.indexOf(dropTarget)

    if (draggedIndex < targetIndex) {
      dropTarget.parentNode.insertBefore(draggedElement, dropTarget.nextSibling)
    } else {
      dropTarget.parentNode.insertBefore(draggedElement, dropTarget)
    }

    // Update priorities in node
    updateStationPriorities()
    handleStationChangeInEdit()
  })
}

function setupGlobalDropdownHandlers() {
  // Close dropdowns when clicking outside
  document.addEventListener('click', function(e) {
    if (!e.target.closest('.custom-dropdown')) {
      const dropdowns = document.querySelectorAll('[id$="-dropdown-list"]')
      dropdowns.forEach(dropdown => {
        dropdown.style.display = 'none'
      })
    }
  })

  // Close dropdowns on Escape key
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
      const dropdowns = document.querySelectorAll('[id$="-dropdown-list"]')
      dropdowns.forEach(dropdown => {
        dropdown.style.display = 'none'
      })
    }
  })
}

function updateStationPriorities() {
  const node = planDesignerState.selectedNode
  if (!node || !Array.isArray(node.assignedStations)) return

  const items = Array.from(document.querySelectorAll('.selected-station-item'))
  const newOrder = items.map(item => item.dataset.station)

  // Reorder assignedStations array
  const reorderedStations = []
  newOrder.forEach((stationName, index) => {
    const station = node.assignedStations.find(s => s.name === stationName)
    if (station) {
      station.priority = index + 1
      reorderedStations.push(station)
    }
  })

  node.assignedStations = reorderedStations
  
  // Update display text with station ID and name
  items.forEach((item, index) => {
    const stationName = item.dataset.station
    const stationDetails = (_stationsCacheFull || []).find(s => s.name === stationName)
    const stationId = stationDetails ? stationDetails.id : ''
    const displayText = stationId ? `${stationId} - ${stationName}` : stationName
    
    const mainSpan = item.querySelector('span:first-child')
    if (mainSpan) {
      mainSpan.textContent = `${index + 1}. ${displayText}`
    }
  })
}

function updateWorkerAssignmentFromStations() {
  const node = planDesignerState.selectedNode
  if (!node) return

  // Get primary station (first in priority)
  const primaryStation = Array.isArray(node.assignedStations) && node.assignedStations.length > 0 
    ? node.assignedStations.sort((a, b) => (a.priority || 0) - (b.priority || 0))[0]
    : null

  const hasStations = !!primaryStation
  const stName = primaryStation ? primaryStation.name : ''
  const st = (_stationsCacheFull||[]).find(s => s.name === stName)
  const stSkills = st ? computeStationEffectiveSkills(st) : []
  const req = Array.from(new Set([ ...((node?.skills)||[]), ...stSkills ]))
  
  const reqEl = document.getElementById('required-skills-display')
  if (reqEl) reqEl.textContent = req.join(', ')

  // Assignment controls are always enabled (no dependency on station selection)
  const radios = document.querySelectorAll('input[name="edit-assign-mode"]')
  radios.forEach(r => { r.disabled = false }) // Always enabled
  
  const labelInputs = document.querySelectorAll('label input[name="edit-assign-mode"]')
  labelInputs.forEach(inp => {
    const lbl = inp.closest('label')
    if (lbl) lbl.style.opacity = '1' // Always visible
  })

  // Rebuild manual worker options (show when manual mode is selected)
  const select = document.getElementById('edit-worker')
  const box = document.getElementById('manual-worker-select')
  if (box) box.style.display = (document.querySelector('input[name="edit-assign-mode"][value="manual"]')?.checked) ? '' : 'none'
  
  if (select) {
    const opts = ['<option value="">-- Select a worker --</option>']
    const compatible = getWorkersMatchingAllSkills(req)
    
    if (compatible.length === 0) {
      opts.push(`<option value="" disabled>⚠️ No workers with required skills (${req.join(', ')})</option>`)
    } else {
      for (const w of compatible) {
        const skills = (w.skills || []).join(', ') || 'No skills';
        const shift = w.shift || 'Day';
        const selected = w.id === node.assignedWorkerId ? 'selected' : '';
        opts.push(`<option value="${escapeHtml(w.id)}" ${selected}>${escapeHtml(w.name)} (${shift} shift, Skills: ${skills})</option>`)
      }
    }
    select.innerHTML = opts.join('')
  }
}

// Helpers
function computeStationEffectiveSkills(station) {
  const sub = Array.isArray(station.subSkills) ? station.subSkills : (typeof station.subSkills === 'string' ? station.subSkills.split(',').map(s=>s.trim()).filter(Boolean) : [])
  if (Array.isArray(station.effectiveSkills) && station.effectiveSkills.length) {
    return Array.from(new Set([ ...station.effectiveSkills, ...sub ]))
  }
  const opIds = Array.isArray(station.operationIds) ? station.operationIds : []
  const opMap = new Map((_opsCache||[]).map(o => [o.id, o]))
  const inherited = []
  for (const id of opIds) {
    const op = opMap.get(id)
    if (op && Array.isArray(op.skills)) inherited.push(...op.skills)
  }
  return Array.from(new Set([ ...inherited, ...sub ]))
}

function getWorkersMatchingAllSkills(requiredSkills) {
  // Filter workers who have ALL required skills
  return (_workersCacheFull || []).filter(worker => {
    const workerSkills = worker.skills || [];
    if (requiredSkills.length === 0) return true; // No skills required, show all
    return requiredSkills.every(skill => workerSkills.includes(skill));
  });
}

function isRawMaterial(m) {
  // Filter for materials with status="Aktif" and category/type indicating raw material
  const status = (m.status || '').toString().trim()
  const category = (m.category || '').toString().trim().toLowerCase()
  const type = (m.type || '').toString().trim().toLowerCase()
  
  // Check for active status (flexible)
  const isActive = status === 'Aktif' || status === 'Active' || status === 'active' || 
                   status === 'AKTIF' || status === 'ACTIVE'
  
  // Check for raw material category/type (very flexible matching)
  const isRawCategory = category === 'ham madde' || 
                       category === 'hammadde' || 
                       category === 'raw material' || 
                       category === 'raw_material' ||
                       category.includes('ham') ||
                       category.includes('raw') ||
                       type === 'raw_material' ||
                       type === 'raw material' ||
                       type.includes('raw')
  
  const result = isActive && isRawCategory
  
  // Debug logging - show ALL unique combinations we encounter
  if (!window._seenMaterialProps) window._seenMaterialProps = new Set()
  const key = `${status}|${m.category || ''}|${m.type || ''}`
  if (!window._seenMaterialProps.has(key)) {
    window._seenMaterialProps.add(key)
    console.log(`🔍 Material properties: status="${status}", category="${m.category}", type="${m.type}", name="${m.name}", passed=${result}`)
  }
  
  return result
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

// Debug function to test materials loading manually
export async function debugMaterialsLoad() {
  console.log('🧪 Testing materials load...')
  try {
    const mats = await getMaterials(true)
    console.log('Raw materials loaded:', mats?.length || 0)
    
    if (mats && mats.length > 0) {
      console.log('Sample materials:')
      mats.slice(0, 5).forEach((m, i) => {
        console.log(`  ${i+1}. ${m.name} (${m.code}) - status: ${m.status}, category: ${m.category}, type: ${m.type}`)
      })
      
      const filtered = mats.filter(isRawMaterial)
      console.log(`Filtered count: ${filtered.length}`)
      
      if (filtered.length > 0) {
        console.log('Filtered materials:')
        filtered.slice(0, 10).forEach((m, i) => {
          console.log(`  ${i+1}. ${m.name} (${m.code})`)
        })
      }
      
      // Test with no filtering
      console.log('\n🔧 Testing with NO filtering (all materials):')
      _materialsCacheFull = mats
      console.log(`Cache set to all ${_materialsCacheFull.length} materials`)
    }
    
    return mats
  } catch (error) {
    console.error('Debug materials load failed:', error)
    return null
  }
}

// Test function to show ALL materials without any filtering
export async function debugShowAllMaterials() {
  console.log('🔧 Force showing ALL materials without filtering...')
  try {
    const mats = await getMaterials(true)
    if (mats && mats.length > 0) {
      _materialsCacheFull = mats // Set ALL materials
      console.log(`Forced cache to ${_materialsCacheFull.length} materials`)
      buildMaterialList('', 0) // Rebuild the list for first row
      console.log('Material dropdown should now show all materials')
    }
  } catch (error) {
    console.error('Failed to show all materials:', error)
  }
}

// Global function for worker assignment mode toggle
window.toggleWorkerDropdown = function() {
  const box = document.getElementById('manual-worker-select');
  const isManual = document.querySelector('input[name="edit-assign-mode"][value="manual"]')?.checked;
  if (box) {
    box.style.display = isManual ? 'block' : 'none';
  }
};

// Global function to update effective time preview when nominal time or efficiency changes
window.updateEffectiveTimePreviewBackend = function() {
  try {
    const timeInput = document.getElementById('edit-time');
    const efficiencyInput = document.getElementById('edit-efficiency');
    const preview = document.getElementById('effective-time-preview-backend');
    
    if (!timeInput || !preview) return;
    
    const nominalTime = parseInt(timeInput.value) || 0;
    const efficiencyValue = efficiencyInput?.value?.trim() || '';
    
    // Get operation's default efficiency from data attribute
    const operationDefaultEfficiency = parseFloat(efficiencyInput?.getAttribute('data-operation-efficiency')) || 1.0;
    
    // If user entered a value, use it; otherwise use operation default
    const efficiencyPercent = efficiencyValue ? parseFloat(efficiencyValue) : (operationDefaultEfficiency * 100);
    const efficiency = efficiencyPercent / 100;
    
    if (nominalTime > 0 && efficiency > 0) {
      const effectiveTime = Math.round(nominalTime / efficiency);
      preview.textContent = `Effective Time: ${effectiveTime} min`;
      preview.style.color = '#3b82f6';
    } else {
      preview.textContent = 'Effective Time: —';
      preview.style.color = '#6b7280';
    }
  } catch (e) {
    console.error('Error updating effective time preview:', e);
  }
};

/* ============================================================
   OUTPUT TEMPLATE SELECTION
   ============================================================ */

let currentTemplateDropdownVisible = false;
let availableOutputTemplates = [];

window.openOutputTemplateDropdown = async function() {
  const dropdown = document.getElementById('output-template-dropdown');
  const listContainer = document.getElementById('output-template-list');
  
  if (!dropdown || !listContainer) return;
  
  if (currentTemplateDropdownVisible) {
    dropdown.style.display = 'none';
    currentTemplateDropdownVisible = false;
    return;
  }
  
  const node = planDesignerState.selectedNode;
  if (!node || !node.operationId) {
    alert('Please select an operation first');
    return;
  }
  
  try {
    // Show loading
    listContainer.innerHTML = '<div style="padding: 12px; text-align: center; color: var(--muted-foreground); font-size: 11px;">Loading templates...</div>';
    dropdown.style.display = 'block';
    currentTemplateDropdownVisible = true;
    
    // Fetch available output codes for this operation
    const response = await fetch(`/api/mes/output-codes/list?operationId=${encodeURIComponent(node.operationId)}`, {
      headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
    });
    
    if (!response.ok) {
      throw new Error('Failed to fetch output codes');
    }
    
    const data = await response.json();
    let availableTemplates = data.codes || [];
    
    // FILTER: Only show templates that contain predecessor materials
    const predecessorMaterials = getPredecessorMaterialCodes(node);
    
    if (predecessorMaterials.length > 0) {
      const originalCount = availableTemplates.length;
      availableTemplates = availableTemplates.filter(template => {
        // Check if template contains at least one predecessor material
        return template.materials.some(mat => 
          predecessorMaterials.includes(mat.materialCode)
        );
      });
      
      console.log(`Filtered templates: ${availableTemplates.length} of ${originalCount} match predecessor materials:`, predecessorMaterials);
      
      if (availableTemplates.length === 0) {
        listContainer.innerHTML = `
          <div style="padding: 16px 12px; text-align: center;">
            <div style="font-size: 11px; color: var(--muted-foreground); margin-bottom: 8px;">No matching templates</div>
            <div style="font-size: 10px; color: var(--muted-foreground); line-height: 1.4;">
              No output codes found that use the predecessor material(s):<br/>
              <strong>${predecessorMaterials.join(', ')}</strong>
            </div>
          </div>
        `;
        return;
      }
    }
    
    availableOutputTemplates = availableTemplates;
    
    if (availableOutputTemplates.length === 0) {
      listContainer.innerHTML = '<div style="padding: 12px; text-align: center; color: var(--muted-foreground); font-size: 11px;">No templates available for this operation</div>';
      return;
    }
    
    // Render template list
    listContainer.innerHTML = availableOutputTemplates.map((template, idx) => {
      const materials = template.materials || [];
      const materialsText = materials.map(m => `${m.materialCode} (${m.ratio}${m.unit})`).join(' + ');
      const outputText = `→ ${template.outputRatio}${template.outputUnit}`;
      
      return `
        <div class="output-template-item" onclick="applyOutputTemplate(${idx})" style="padding: 10px 12px; cursor: pointer; border-bottom: 1px solid var(--border); transition: background 0.15s;">
          <div style="font-size: 12px; font-weight: 600; color: var(--foreground); margin-bottom: 4px;">${template.code}</div>
          <div style="font-size: 10px; color: var(--muted-foreground);">${materialsText} ${outputText}</div>
        </div>
      `;
    }).join('');
    
    // Add hover styles
    const style = document.createElement('style');
    style.textContent = '.output-template-item:hover { background: var(--accent) !important; }';
    if (!document.getElementById('output-template-styles')) {
      style.id = 'output-template-styles';
      document.head.appendChild(style);
    }
    
  } catch (error) {
    console.error('Error loading output templates:', error);
    listContainer.innerHTML = '<div style="padding: 12px; text-align: center; color: #ef4444; font-size: 11px;">Error loading templates</div>';
  }
};

window.applyOutputTemplate = function(templateIndex) {
  const template = availableOutputTemplates[templateIndex];
  if (!template) return;
  
  const node = planDesignerState.selectedNode;
  if (!node) return;
  
  console.log('Applying template:', template);
  
  // Close dropdown
  const dropdown = document.getElementById('output-template-dropdown');
  if (dropdown) {
    dropdown.style.display = 'none';
    currentTemplateDropdownVisible = false;
  }
  
  // 1. Apply station(s) - update assignedStations array
  if (template.stationId) {
    // Find station details from cache
    const stationDetails = _stationsCacheFull.find(s => s.id === template.stationId || s.name === template.stationId);
    
    // Update node's assignedStations (SCHEMA: stationId, not id)
    node.assignedStations = [{
      stationId: template.stationId,  // SCHEMA-COMPLIANT: stationId
      name: stationDetails?.name || template.stationId,
      priority: 1
    }];
    
    console.log(`✅ Station set from template:`, node.assignedStations);
    
    // Refresh station UI using the same pattern as refreshStationSelector()
    const compatibleStations = _stationsCacheFull.filter(s => 
      Array.isArray(s.operationIds) && s.operationIds.includes(node.operationId)
    );
    
    const listElement = document.querySelector('#station-selector-button');
    if (listElement) {
      const container = listElement.closest('[style*="margin-bottom"]');
      if (container) {
        const newHtml = generateMultiStationSelector(node, compatibleStations);
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = newHtml;
        container.replaceWith(tempDiv.firstElementChild);
      }
    }
  }
  
  // Get predecessor materials and their quantities
  const predecessorMaterials = getPredecessorMaterialsWithQuantities(node);
  
  // 2. Apply materials from template
  if (template.materials && template.materials.length > 0) {
    // Clear existing manual material selections
    planDesignerState.tempMaterialSelections = [];
    
    let autoCalculatedOutputQty = null;
    
    // Fetch actual material names from cache
    const materialNamesMap = {};
    template.materials.forEach(templateMat => {
      const cachedMaterial = _materialsCacheFull.find(m => 
        m.materialCode === templateMat.materialCode || m.code === templateMat.materialCode
      );
      if (cachedMaterial) {
        materialNamesMap[templateMat.materialCode] = cachedMaterial.name || cachedMaterial.title || templateMat.materialCode;
      } else {
        materialNamesMap[templateMat.materialCode] = templateMat.materialName || templateMat.materialCode;
      }
    });
    
    // Add template materials with full metadata
    template.materials.forEach(templateMat => {
      const predecessorMat = predecessorMaterials.find(p => p.materialCode === templateMat.materialCode);
      
      let calculatedQuantity = 0;
      
      if (predecessorMat) {
        // This material comes from predecessor - use its quantity and calculate output
        calculatedQuantity = predecessorMat.requiredQuantity;
        
        // Calculate output quantity from this material's ratio
        // Example: Template has 1.000kg → 2.000pcs, predecessor gives 50kg
        // Output = 50 / 1.000 * 2.000 = 100 pcs
        const calculatedOutput = (predecessorMat.requiredQuantity / templateMat.ratio) * template.outputRatio;
        
        if (autoCalculatedOutputQty === null) {
          autoCalculatedOutputQty = calculatedOutput;
        }
        
        console.log(`✅ Auto-calculated from predecessor ${templateMat.materialCode}: ${predecessorMat.requiredQuantity}${predecessorMat.unit} → ${calculatedOutput}${template.outputUnit}`);
      }
      
      const materialName = materialNamesMap[templateMat.materialCode];
      
      planDesignerState.tempMaterialSelections.push({
        materialCode: templateMat.materialCode,
        code: templateMat.materialCode, // For formatMaterialLabel compatibility
        materialName: materialName,
        name: materialName, // For display in UI
        title: materialName, // For formatMaterialLabel fallback
        requiredQuantity: calculatedQuantity,
        unit: templateMat.unit,
        ratio: templateMat.ratio,
        unitRatio: 1,
        derivedFrom: predecessorMat ? predecessorMat.derivedFrom : null,
        _fromTemplate: true // Mark as template-applied material
      });
    });
    
    // Store template ratios and application state
    node._templateRatios = {
      materials: template.materials,
      outputRatio: template.outputRatio,
      outputUnit: template.outputUnit
    };
    node._isTemplateApplied = true;
    node._templateCode = template.code;
    
    // If we calculated output quantity from predecessor, set it and calculate remaining materials
    if (autoCalculatedOutputQty !== null) {
      const qtyInput = document.getElementById('edit-output-qty');
      const unitSelect = document.getElementById('edit-output-unit');
      
      // Set in node object
      node.outputQty = autoCalculatedOutputQty;
      node.outputUnit = template.outputUnit || 'adet';
      
      if (qtyInput) {
        qtyInput.value = autoCalculatedOutputQty.toFixed(3);
      }
      if (unitSelect && template.outputUnit) {
        // Use populateUnitSelect to properly set the unit
        populateUnitSelect(unitSelect, template.outputUnit);
      }
      
      // Calculate quantities for non-predecessor materials
      planDesignerState.tempMaterialSelections.forEach(tempMat => {
        if (tempMat.requiredQuantity === 0) {
          const calculatedQty = (autoCalculatedOutputQty / template.outputRatio) * tempMat.ratio;
          tempMat.requiredQuantity = parseFloat(calculatedQty.toFixed(3));
        }
      });
    } else {
      // No predecessor - set output quantity from template ratio (default to ratio value)
      node.outputQty = template.outputRatio || 1;
      node.outputUnit = template.outputUnit || 'adet';
      
      const qtyInput = document.getElementById('edit-output-qty');
      const unitSelect = document.getElementById('edit-output-unit');
      
      if (qtyInput) {
        qtyInput.value = node.outputQty;
      }
      if (unitSelect && template.outputUnit) {
        populateUnitSelect(unitSelect, template.outputUnit);
      }
    }
    
    // Update node's materialInputs with template selections
    node.materialInputs = planDesignerState.tempMaterialSelections.map(tempMat => ({
      materialCode: tempMat.materialCode,
      materialName: tempMat.materialName,
      name: tempMat.name,
      requiredQuantity: tempMat.requiredQuantity,
      unit: tempMat.unit,
      unitRatio: tempMat.unitRatio || 1,
      derivedFrom: tempMat.derivedFrom || null,
      _fromTemplate: tempMat._fromTemplate || false,
      _templateRatio: tempMat.ratio // Store original template ratio for validation
    }));
    
    // Re-render material list in modal
    rebuildMaterialRowsFromNode(node);
    
    // Attach template material listeners
    attachTemplateMaterialListeners(node);
  }
  
  // 3. Update output code display
  const codeLabel = document.getElementById('node-output-code-label');
  if (codeLabel) {
    codeLabel.textContent = `Output: ${template.code}`;
    codeLabel.style.color = '#10b981';
  }
  
  // Add listener to calculate material quantities when user manually enters output qty
  const qtyInput = document.getElementById('edit-output-qty');
  if (qtyInput && !qtyInput.hasAttribute('data-template-listener')) {
    qtyInput.setAttribute('data-template-listener', 'true');
    qtyInput.addEventListener('input', calculateMaterialsFromTemplate);
  }
};

// Expose material-related functions globally for inline onclick handlers
window.openMaterialDropdown = openMaterialDropdown;
window.filterMaterialDropdown = filterMaterialDropdown;
window.selectMaterialFromDropdown = selectMaterialFromDropdown;
window.addMaterialRow = addMaterialRow;
window.removeMaterialRow = removeMaterialRow;
window.updateOutputCodePreviewBackend = updateOutputCodePreviewBackend;

// Helper: Attach bidirectional proportional update listeners to material quantity inputs
function attachTemplateMaterialListeners(node) {
  if (!node || !node._isTemplateApplied || !node._templateRatios) return;
  
  setTimeout(() => {
    let attached = 0;
    node.materialInputs.forEach((materialInput, materialIndex) => {
      if (materialInput._fromTemplate && !materialInput.derivedFrom) { // Only template materials (not predecessor-derived)
        const materialQtyInput = document.getElementById(`edit-material-qty-${materialIndex}`);
        if (materialQtyInput) {
          attached++;
          
          // Remove old listeners to avoid duplicates
          const newInput = materialQtyInput.cloneNode(true);
          materialQtyInput.parentNode.replaceChild(newInput, materialQtyInput);
          
          // Store original quantity value
          newInput.dataset.originalQty = newInput.value;
            
          // Add INPUT listener for bidirectional proportional update
          newInput.addEventListener('input', function() {
            if (!node._isTemplateApplied || !node._templateRatios) return;
            
            const newMaterialQty = parseFloat(this.value);
            if (!newMaterialQty || newMaterialQty <= 0) return;
            
            const materialCode = materialInput.materialCode;
            const templateMaterial = node._templateRatios.materials.find(m => m.materialCode === materialCode);
            if (!templateMaterial) return;
            
            // Calculate scale factor from this material's change
            // Example: Template ratio = 1.000kg, new value = 50kg, scale = 50
            const scaleFactor = newMaterialQty / templateMaterial.ratio;
            
            // Update output quantity proportionally
            const newOutputQty = scaleFactor * node._templateRatios.outputRatio;
            node.outputQty = newOutputQty;
            
            const outputQtyInput = document.getElementById('edit-output-qty');
            if (outputQtyInput) {
              outputQtyInput.value = newOutputQty.toFixed(3);
            }
            
            // Update other material quantities proportionally (both data and UI)
            node.materialInputs.forEach((matInput, idx) => {
              if (matInput.materialCode !== materialCode && !matInput.derivedFrom && matInput._fromTemplate) {
                const otherTemplateMat = node._templateRatios.materials.find(m => m.materialCode === matInput.materialCode);
                if (otherTemplateMat) {
                  const newQty = parseFloat((scaleFactor * otherTemplateMat.ratio).toFixed(3));
                  
                  // Update data
                  matInput.requiredQuantity = newQty;
                  
                  // Update UI field directly (don't rebuild!)
                  const otherInput = document.getElementById(`edit-material-qty-${idx}`);
                  if (otherInput && otherInput !== this) {
                    otherInput.value = newQty.toFixed(3);
                  }
                }
              } else if (matInput.materialCode === materialCode) {
                // Update current material's data
                matInput.requiredQuantity = newMaterialQty;
              }
            });
            
            // Sync tempMaterialSelections with updated materialInputs
            planDesignerState.tempMaterialSelections = node.materialInputs.map(mi => ({
              materialCode: mi.materialCode,
              materialName: mi.materialName,
              name: mi.name,
              requiredQuantity: mi.requiredQuantity,
              unit: mi.unit,
              unitRatio: mi.unitRatio || 1,
              derivedFrom: mi.derivedFrom || null,
              _fromTemplate: mi._fromTemplate || false,
              ratio: mi._templateRatio
            }));
            
            // console.log('🔒 Template locked - material input → output/materials updated');
          });
          
          // Update baseline after proportional change (no unlock needed since ratios are preserved)
          newInput.addEventListener('blur', function() {
            if (node._isTemplateApplied && this.value) {
              this.dataset.originalQty = this.value;
            }
          });
        }
      }
    });
    if (attached > 0) {
      console.log(`🔧 Attached ${attached} bidirectional template listeners`);
    }
  }, 100);
}

function calculateMaterialsFromTemplate() {
  const node = planDesignerState.selectedNode;
  if (!node || !node._templateRatios) return;
  
  const qtyInput = document.getElementById('edit-output-qty');
  const userOutputQty = qtyInput ? parseFloat(qtyInput.value) : 0;
  
  if (!userOutputQty || userOutputQty <= 0) return;
  
  const { materials, outputRatio } = node._templateRatios;
  
  // Update node's output quantity (preserves template lock)
  node.outputQty = userOutputQty;
  
  // Calculate input material quantities based on template ratios
  // Example: Template has 1.000kg → 2.000pcs
  // User enters 100 pcs
  // Calculate: 100 / 2.000 * 1.000 = 50 kg
  
  node.materialInputs.forEach((materialInput, materialIndex) => {
    const templateMaterial = materials.find(m => m.materialCode === materialInput.materialCode);
    if (templateMaterial && !materialInput.derivedFrom) { // Don't recalculate predecessor-derived materials
      const calculatedQuantity = (userOutputQty / outputRatio) * templateMaterial.ratio;
      materialInput.requiredQuantity = parseFloat(calculatedQuantity.toFixed(3));
      
      // Update UI field directly (don't rebuild!)
      const materialQtyInput = document.getElementById(`edit-material-qty-${materialIndex}`);
      if (materialQtyInput) {
        materialQtyInput.value = materialInput.requiredQuantity.toFixed(3);
        materialQtyInput.dataset.originalQty = materialInput.requiredQuantity.toFixed(3);
      }
    }
  });
  
  // Sync tempMaterialSelections with updated materialInputs
  planDesignerState.tempMaterialSelections = node.materialInputs.map(mi => ({
    materialCode: mi.materialCode,
    materialName: mi.materialName,
    name: mi.name,
    requiredQuantity: mi.requiredQuantity,
    unit: mi.unit,
    unitRatio: mi.unitRatio || 1,
    derivedFrom: mi.derivedFrom || null,
    _fromTemplate: mi._fromTemplate || false,
    ratio: mi._templateRatio
  }));
  
  console.log('🔒 Template locked - output quantity changed, materials recalculated proportionally');
}

// Helper: Get material codes from predecessor nodes
function getPredecessorMaterialCodes(node) {
  const codes = [];
  
  if (!node || !node.id) return codes;
  
  // Check if node has materialInputs with derivedFrom
  if (node.materialInputs && Array.isArray(node.materialInputs)) {
    node.materialInputs.forEach(mat => {
      if (mat.derivedFrom && mat.materialCode) {
        codes.push(mat.materialCode);
      }
    });
  }
  
  // Also check connections in the graph
  const connections = planDesignerState?.connections || [];
  const incomingConnections = connections.filter(conn => conn.to === node.id);
  
  incomingConnections.forEach(conn => {
    const fromNode = planDesignerState?.nodes?.find(n => n.id === conn.from);
    if (fromNode && fromNode.materialCode) {
      codes.push(fromNode.materialCode);
    }
  });
  
  return [...new Set(codes)]; // Remove duplicates
}

// Helper: Get predecessor materials with their quantities
function getPredecessorMaterialsWithQuantities(node) {
  const materials = [];
  
  if (!node || !node.id) return materials;
  
  // Get materials from node's materialInputs that have derivedFrom
  if (node.materialInputs && Array.isArray(node.materialInputs)) {
    node.materialInputs.forEach(mat => {
      if (mat.derivedFrom) {
        materials.push({
          materialCode: mat.materialCode,
          materialName: mat.materialName || mat.materialCode,
          requiredQuantity: mat.requiredQuantity || 0,
          unit: mat.unit,
          derivedFrom: mat.derivedFrom
        });
      }
    });
  }
  
  return materials;
}

// Close dropdown when clicking outside
document.addEventListener('click', function(e) {
  const dropdown = document.getElementById('output-template-dropdown');
  const btn = document.getElementById('output-template-btn');
  
  if (dropdown && btn && currentTemplateDropdownVisible) {
    if (!dropdown.contains(e.target) && !btn.contains(e.target)) {
      dropdown.style.display = 'none';
      currentTemplateDropdownVisible = false;
    }
  }
});

