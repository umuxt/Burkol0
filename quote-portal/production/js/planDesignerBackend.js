// Backend-powered overrides for Plan Designer
import { showToast } from './ui.js'
import { getOperations, getWorkers, getStations, getApprovedQuotes, getMaterials } from './mesApi.js'
import { planDesignerState, renderCanvas, closeNodeEditModal } from './planDesigner.js'
import { computeAndAssignSemiCode, getSemiCodePreview, getPrefixForNode } from './semiCode.js'
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

let _opsCache = []
let _approvedOrders = []
let _ordersByCode = new Map()
let _workersCacheFull = []
let _stationsCacheFull = []
let _materialsCacheFull = []

// Global escape handler for modal
let modalEscapeHandler = null;

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
    select.innerHTML = '<option value="">Loading orders...</option>'
    _approvedOrders = await getApprovedQuotes()
    _ordersByCode = new Map()
    const options = ['<option value="">Select an order...</option>']
    for (const q of _approvedOrders) {
      const code = q.workOrderCode || q.id || q.quoteId
      if (!code) continue
      _ordersByCode.set(code, q)
      const label = `${escapeHtml(code)} — ${escapeHtml(q.company || q.customer || q.name || '-')}`
      options.push(`<option value="${escapeHtml(code)}">${label}</option>`)
    }
    select.innerHTML = options.join('')
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
    showToast(`Selected: ${code} • ${q.company || q.customer || q.name || '-'} • ${price}`, 'info')
  }
}

export function handleCanvasDropBackend(event) {
  event.preventDefault()
  if (!planDesignerState.draggedOperation) return
  const op = (_opsCache||[]).find(o => o.id === planDesignerState.draggedOperation)
  if (!op) { showToast('Operation not found. Refresh list.', 'error'); return }

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
    rawMaterials: [],
    semiCode: null,
    x: Math.max(0, x),
    y: Math.max(0, y),
    connections: [],
    assignedWorker: null,
    assignedStation: null
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
  showToast(`${op.name} operasyonu eklendi`, 'success')
}

export async function editNodeBackend(nodeId) {
  const node = planDesignerState.nodes.find(n => n.id === nodeId)
  if (!node) return
  planDesignerState.selectedNode = node
  let workers = []
  let stations = []
  let materials = []
  try {
    workers = await getWorkers(true)
    stations = await getStations()
    materials = await getMaterials()
    console.log(`Loaded data: ${workers.length} workers, ${stations.length} stations, ${materials.length} materials`)
  } catch (e) {
    console.error('editNodeBackend data load failed', e)
    // Continue with empty arrays to prevent UI breaking
  }
  _workersCacheFull = workers || []
  _stationsCacheFull = stations || []
  _materialsCacheFull = (materials || []).filter(isRawMaterial)
  console.log(`Filtered to ${_materialsCacheFull.length} active raw materials (Ham madde)`)

  const stationByName = new Map(_stationsCacheFull.map(s => [s.name, s]))
  const selectedStation = stationByName.get(node.assignedStation || '') || null
  const stationSkills = selectedStation ? computeStationEffectiveSkills(selectedStation) : []
  const requiredSkills = Array.from(new Set([ ...((node.skills)||[]), ...stationSkills ]))
  const manualEnabled = !!selectedStation
  const compatibleWorkers = getWorkersMatchingAllSkills(requiredSkills)
  const compatibleStations = _stationsCacheFull.filter(s => Array.isArray(s.operationIds) && s.operationIds.includes(node.operationId))
  const selectedAssignMode = node.assignmentMode === 'manual' ? 'manual' : 'auto'

  const formContent =
    '<div style="margin-bottom: 16px;"><label style="display: block; margin-bottom: 4px; font-weight: 500;">Operation Name</label><input type="text" id="edit-name" value="' + escapeHtml(node.name) + '" style="width: 100%; padding: 8px; border: 1px solid var(--border); border-radius: 4px;" /></div>' +
    '<div style="margin-bottom: 16px;"><label style="display: block; margin-bottom: 4px; font-weight: 500;">Estimated Unit Production Time (minutes)</label><input type="number" id="edit-time" value="' + Number(node.time || 0) + '" min="1" style="width: 100%; padding: 8px; border: 1px solid var(--border); border-radius: 4px;" /></div>' +
    '<div style="margin-bottom: 16px;"><label style="display: block; margin-bottom: 4px; font-weight: 500;">Assigned Station</label><select id="edit-station" style="width: 100%; padding: 8px; border: 1px solid var(--border); border-radius: 4px;" onchange="handleStationChangeInEdit()"><option value="">Not assigned</option>' +
    compatibleStations.map(s => '<option value="' + escapeHtml(s.name) + '" ' + (node.assignedStation === s.name ? 'selected' : '') + '>' + escapeHtml(s.name) + '</option>').join('') +
    '</select><div style="color:#6b7280; font-size: 12px; margin-top: 4px;">Select station to enable worker assignment</div></div>' +
    '<div style="margin-bottom: 8px;"><label style="display:block; margin-bottom: 6px; font-weight: 500;">Worker Assignment</label>' +
      `<label style="margin-right:12px; font-size:13px; opacity:${manualEnabled?1:0.5}"><input type="radio" name="edit-assign-mode" value="auto" ${selectedAssignMode==='auto'?'checked':''} ${manualEnabled?'':'disabled'} onchange="handleAssignModeChangeBackend()"> Auto-assign</label>` +
      `<label style="font-size:13px; opacity:${manualEnabled?1:0.5}"><input type="radio" name="edit-assign-mode" value="manual" ${selectedAssignMode==='manual'?'checked':''} ${manualEnabled?'':'disabled'} onchange="handleAssignModeChangeBackend()"> Manual-assign</label>` +
    '</div>' +
    `<div id="manual-worker-select" style="margin-bottom: 16px; ${selectedAssignMode==='manual'&&manualEnabled?'':'display:none;'}"><label style="display: block; margin-bottom: 4px; font-weight: 500;">Assigned Worker</label><select id="edit-worker" ${manualEnabled?'':'disabled'} style="width: 100%; padding: 8px; border: 1px solid var(--border); border-radius: 4px;"><option value="">Not assigned</option>` +
    compatibleWorkers.map(w => '<option value="' + escapeHtml(w.name) + '" ' + (node.assignedWorker === w.name ? 'selected' : '') + '>' + escapeHtml(w.name) + '</option>').join('') +
    '</select></div>' +
    (function(){
      const rows = Array.isArray(node.rawMaterials) ? node.rawMaterials : (node.rawMaterial ? [node.rawMaterial] : [])
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
        const qtyInput = `<input id="edit-material-qty-${idx}" type="number" min="0" step="0.01" placeholder="Qty" style="width:100%; padding: 8px; border: 1px solid var(--border); border-radius: 4px;${isDerived ? ' background:#f3f4f6; color:#6b7280;' : ''}" value="${rm?.qty ?? ''}" ${isDerived ? 'disabled' : 'oninput="updateOutputCodePreviewBackend()"'} />`
        const removeBtn = isDerived ? '' : `<button type="button" onclick="removeMaterialRow(${idx})" title="Kaldır" style="width:28px; height:32px; border:1px solid var(--border); background:#fee2e2; color:#ef4444; border-radius:6px;">-</button>`
        return (
          `<div class="material-row" data-row-index="${idx}" ${isDerived?'data-derived="1"':''} style="display:flex; gap:8px; align-items:flex-start; margin-bottom:8px;">` +
            '<div style="position:relative; flex: 3;">' +
              `<input type="hidden" id="edit-material-id-${idx}" value="${rm?.id ?? ''}" />` +
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
    '<div style="margin-bottom: 16px;"><label style="display: block; margin-bottom: 4px; font-weight: 500;">Required Skills</label><div id="required-skills-display" style="font-size: 12px; color: var(--muted-foreground);">' + requiredSkills.map(escapeHtml).join(', ') + '</div></div>'

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
    } catch {}
    // Initial output code preview
    try { updateOutputCodePreviewBackend() } catch {}
    
    // Add escape key listener
    modalEscapeHandler = (e) => {
      if (e.key === 'Escape') {
        closeNodeEditModal()
      }
    }
    document.addEventListener('keydown', modalEscapeHandler)
  }
}

export function handleAssignModeChangeBackend() {
  try {
    const stName = document.getElementById('edit-station')?.value || ''
    const manual = document.querySelector('input[name="edit-assign-mode"][value="manual"]')?.checked
    const box = document.getElementById('manual-worker-select')
    if (box) box.style.display = (manual && !!stName) ? '' : 'none'
    const select = document.getElementById('edit-worker')
    if (select) select.disabled = !stName
  } catch {}
}

export function saveNodeEditBackend() {
  const node = planDesignerState.selectedNode
  if (!node) return
  const name = document.getElementById('edit-name')?.value?.trim()
  const time = parseInt(document.getElementById('edit-time')?.value, 10)
  const station = document.getElementById('edit-station')?.value || null
  const assignMode = (document.querySelector('input[name="edit-assign-mode"]:checked')?.value || null)
  const manualWorker = document.getElementById('edit-worker')?.value || null
  const outQtyVal = document.getElementById('edit-output-qty')?.value
  const outUnit = document.getElementById('edit-output-unit')?.value || ''
  // collect materials rows
  const rowsContainer = document.getElementById('edit-materials-rows')
  const rows = rowsContainer ? Array.from(rowsContainer.querySelectorAll('.material-row')) : []
  const rawMaterials = []
  for (const row of rows) {
    const idx = row.getAttribute('data-row-index')
    const id = document.getElementById('edit-material-id-'+idx)?.value || ''
    const name = document.getElementById('edit-material-name-'+idx)?.value || ''
    const qtyVal = document.getElementById('edit-material-qty-'+idx)?.value
    const qty = qtyVal === '' ? null : (parseFloat(qtyVal))
    const unit = document.getElementById('edit-material-unit-'+idx)?.value || ''
    if (id) {
      rawMaterials.push({ id, name: name || id, qty: Number.isFinite(qty)?qty:null, unit })
    }
  }
  if (!name || !Number.isFinite(time) || time < 1) { showToast('Please fill all required fields', 'error'); return }

  node.name = name
  node.time = time
  node.assignedStation = station || null
  node.assignmentMode = station ? (assignMode || 'auto') : null
  const outQtyNum = outQtyVal === '' ? null : parseFloat(outQtyVal)
  node.outputQty = Number.isFinite(outQtyNum) ? outQtyNum : null
  node.outputUnit = (outUnit || '').trim()

  // Auto-assign worker by best skill overlap
  if (station && node.assignmentMode === 'auto') {
    // We don't have workers list here; reuse last loaded compatible workers by reopening quick filter
    getWorkers(true).then(ws => {
      const st = (_stationsCacheFull||[]).find(s => s.name === station)
      const stSkills = st ? computeStationEffectiveSkills(st) : []
      const requiredList = Array.from(new Set([...(node.skills||[]), ...stSkills]))
      const required = new Set(requiredList)
      const eligible = ws.filter(w => {
        const sset = new Set((w.skills||[]))
        for (const rs of required) { if (!sset.has(rs)) return false }
        return true
      })
      if (eligible.length > 0) {
        // choose the one with highest seniority or random; fallback to first
        node.assignedWorker = eligible[0].name || eligible[0].id
      } else {
        // fallback: best overlap
        let best = null; let bestScore = -1
        for (const w of ws) {
          const skills = new Set((w.skills||[]))
          let score = 0
          required.forEach(s => { if (skills.has(s)) score++ })
          if (score > bestScore) { best = w; bestScore = score }
        }
        node.assignedWorker = best ? (best.name || best.id) : null
      }
      applyMaterial()
    }).catch(() => { node.assignedWorker = null; applyMaterial() })
  } else {
    node.assignedWorker = manualWorker || null
    applyMaterial()
  }

  function applyMaterial() {
    // Support multi materials; keep legacy rawMaterial as first for compatibility
    node.rawMaterials = rawMaterials
    node.rawMaterial = rawMaterials.length ? { ...rawMaterials[0] } : null
    // Compute/update semi-finished product code based on op, station and materials
    try { computeAndAssignSemiCode(node, _opsCache, _stationsCacheFull) } catch {}
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
    showToast('Operation updated', 'success')
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
    const m = (_materialsCacheFull||[]).find(x => (x.id===id) || (x.code===id) || (x.name===id))
    const disp = document.getElementById('edit-material-display-' + rowIdx)
    const idEl = document.getElementById('edit-material-id-' + rowIdx)
    const nameEl = document.getElementById('edit-material-name-' + rowIdx)
    const unitEl = document.getElementById('edit-material-unit-' + rowIdx)
    const dd = document.getElementById('edit-material-dropdown-' + rowIdx)
    if (!m || !disp || !idEl || !nameEl || !dd) return
    idEl.value = m.id || m.code || ''
    nameEl.value = m.name || m.title || ''
    disp.value = formatMaterialLabel(m)
    if (unitEl) {
      unitEl.value = m.unit || m.measurementUnit || m.birim || ''
    }
    dd.style.display = 'none'
    try { updateOutputCodePreviewBackend() } catch {}
  } catch {}
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
export function updateOutputCodePreviewBackend() {
  try {
    const node = planDesignerState.selectedNode
    if (!node) return
    const stName = document.getElementById('edit-station')?.value || null
    const rowsContainer = document.getElementById('edit-materials-rows')
    const rows = rowsContainer ? Array.from(rowsContainer.querySelectorAll('.material-row')) : []
    const mats = []
    for (const row of rows) {
      const idx = row.getAttribute('data-row-index')
      const id = document.getElementById('edit-material-id-'+idx)?.value || ''
      const qtyVal = document.getElementById('edit-material-qty-'+idx)?.value
      const qty = qtyVal === '' ? null : parseFloat(qtyVal)
      const unit = document.getElementById('edit-material-unit-'+idx)?.value || ''
      if (id) mats.push({ id, qty: Number.isFinite(qty) ? qty : null, unit })
    }
    const temp = { ...node, assignedStation: stName, rawMaterials: mats }
    const code = getSemiCodePreview(temp, _opsCache, _stationsCacheFull)
    const label = document.getElementById('node-output-code-label')
    if (label) {
      if (code) {
        label.textContent = `Output: ${code}`
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
  const code = m.code || ''
  const name = m.name || m.title || ''
  return [code, name].filter(Boolean).join(' — ')
}

  // Station change handler inside edit modal
export function handleStationChangeInEdit() {
  try {
    const stName = document.getElementById('edit-station')?.value || ''
    const st = (_stationsCacheFull||[]).find(s => s.name === stName)
    const stSkills = st ? computeStationEffectiveSkills(st) : []
    const node = planDesignerState.selectedNode
    const req = Array.from(new Set([ ...((node?.skills)||[]), ...stSkills ]))
    const reqEl = document.getElementById('required-skills-display')
    if (reqEl) reqEl.textContent = req.join(', ')
    // Enable/disable assignment controls based on station selection and fix label opacity
    const radios = document.querySelectorAll('input[name="edit-assign-mode"]')
    radios.forEach(r => { r.disabled = !st })
    const labelInputs = document.querySelectorAll('label input[name="edit-assign-mode"]')
    labelInputs.forEach(inp => {
      const lbl = inp.closest('label')
      if (lbl) lbl.style.opacity = st ? '1' : '0.5'
    })
    // Rebuild manual worker options
    const select = document.getElementById('edit-worker')
    const box = document.getElementById('manual-worker-select')
    if (box) box.style.display = (document.querySelector('input[name="edit-assign-mode"][value="manual"]')?.checked && !!st) ? '' : 'none'
    if (select) {
      select.disabled = !st
      const opts = ['<option value="">Not assigned</option>']
      const compatible = getWorkersMatchingAllSkills(req)
      for (const w of compatible) {
        opts.push(`<option value="${escapeHtml(w.name)}">${escapeHtml(w.name)}</option>`) }
      select.innerHTML = opts.join('')
    }
    // Update output code preview when station changes
    try { updateOutputCodePreviewBackend() } catch {}
  } catch (e) { console.warn('handleStationChangeInEdit failed', e) }
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
  const req = Array.from(new Set(requiredSkills||[]))
  if (req.length === 0) return _workersCacheFull
  return (_workersCacheFull||[]).filter(w => {
    const skills = new Set((w.skills||[]))
    for (const rs of req) { if (!skills.has(rs)) return false }
    return true
  })
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
