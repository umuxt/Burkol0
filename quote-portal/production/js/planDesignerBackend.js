// Backend-powered overrides for Plan Designer
import { showToast } from './ui.js'
import { getOperations, getWorkers, getStations, getApprovedQuotes } from './mesApi.js'
import { planDesignerState, renderCanvas } from './planDesigner.js'

let _opsCache = []
let _approvedOrders = []
let _ordersByCode = new Map()

export async function loadOperationsToolboxBackend() {
  const listContainer = document.getElementById('operations-list')
  if (!listContainer) return
  listContainer.innerHTML = '<div style="padding:6px;color:#888;">Loading operations...</div>'
  try {
    _opsCache = await getOperations(true)
    if (!_opsCache.length) {
      listContainer.innerHTML = '<div style="padding:6px;color:#666;">No operations defined yet. Add from Operations page.</div>'
      return
    }
    listContainer.innerHTML = _opsCache.map(op =>
      `<div draggable="true" ondragstart="handleOperationDragStart(event, '${op.id}')" style="padding: 6px 8px; border: 1px solid var(--border); border-radius: 4px; cursor: grab; background: white; margin-bottom: 4px; font-size: 13px; font-weight: 500;" onmouseover="this.style.background='var(--muted)'" onmouseout="this.style.background='white'">${escapeHtml(op.name)}</div>`
    ).join('')
  } catch (e) {
    console.error('loadOperationsToolboxBackend error', e)
    listContainer.innerHTML = '<div style="padding:6px;color:#ef4444;">Failed to load operations</div>'
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

  const canvas = document.getElementById('plan-canvas')
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
    x: Math.max(0, x),
    y: Math.max(0, y),
    connections: [],
    assignedWorker: null,
    assignedStation: null
  }
  planDesignerState.nodes.push(newNode)
  renderCanvas()
  planDesignerState.draggedOperation = null
  showToast(`${op.name} operasyonu eklendi`, 'success')
}

export async function editNodeBackend(nodeId) {
  const node = planDesignerState.nodes.find(n => n.id === nodeId)
  if (!node) return
  planDesignerState.selectedNode = node
  let workers = []
  let stations = []
  try {
    workers = await getWorkers(true)
    stations = await getStations()
  } catch (e) {
    console.error('editNodeBackend data load failed', e)
  }
  const compatibleWorkers = workers.filter(w => Array.isArray(w.skills) && w.skills.some(skill => (node.skills||[]).includes(skill)))
  const compatibleStations = stations.filter(s => Array.isArray(s.operationIds) && s.operationIds.includes(node.operationId))

  const formContent =
    '<div style="margin-bottom: 16px;"><label style="display: block; margin-bottom: 4px; font-weight: 500;">Operation Name</label><input type="text" id="edit-name" value="' + escapeHtml(node.name) + '" style="width: 100%; padding: 8px; border: 1px solid var(--border); border-radius: 4px;" /></div>' +
    '<div style="margin-bottom: 16px;"><label style="display: block; margin-bottom: 4px; font-weight: 500;">Estimated Time (minutes)</label><input type="number" id="edit-time" value="' + Number(node.time || 0) + '" min="1" style="width: 100%; padding: 8px; border: 1px solid var(--border); border-radius: 4px;" /></div>' +
    '<div style="margin-bottom: 16px;"><label style="display: block; margin-bottom: 4px; font-weight: 500;">Assigned Worker</label><select id="edit-worker" style="width: 100%; padding: 8px; border: 1px solid var(--border); border-radius: 4px;"><option value="">Not assigned</option>' +
    compatibleWorkers.map(w => '<option value="' + escapeHtml(w.name) + '" ' + (node.assignedWorker === w.name ? 'selected' : '') + '>' + escapeHtml(w.name) + '</option>').join('') +
    '</select></div>' +
    '<div style="margin-bottom: 16px;"><label style="display: block; margin-bottom: 4px; font-weight: 500;">Assigned Station</label><select id="edit-station" style="width: 100%; padding: 8px; border: 1px solid var(--border); border-radius: 4px;"><option value="">Not assigned</option>' +
    compatibleStations.map(s => '<option value="' + escapeHtml(s.name) + '" ' + (node.assignedStation === s.name ? 'selected' : '') + '>' + escapeHtml(s.name) + '</option>').join('') +
    '</select></div>' +
    '<div style="margin-bottom: 16px;"><label style="display: block; margin-bottom: 4px; font-weight: 500;">Required Skills</label><div style="font-size: 12px; color: var(--muted-foreground);">' + (node.skills||[]).map(escapeHtml).join(', ') + '</div></div>'

  const formEl = document.getElementById('node-edit-form')
  if (formEl) formEl.innerHTML = formContent
  const modal = document.getElementById('node-edit-modal')
  if (modal) modal.style.display = 'block'
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
    .replace(/'/g, '&#039;')
}
