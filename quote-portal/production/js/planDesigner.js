// Plan Designer logic and state
import { showToast } from './ui.js';

export const planDesignerState = {
  nodes: [],
  connectMode: false,
  connectingFrom: null,
  draggedOperation: null,
  selectedNode: null,
  nodeIdCounter: 1
};

export function loadOperationsToolbox() {
  const operations = [
    // Operations will be loaded from Firebase
  ];

  const listContainer = document.getElementById('operations-list');
  if (!listContainer) return;
  
  if (operations.length === 0) {
    listContainer.innerHTML = '<div style="padding: 8px; color: var(--muted-foreground); font-size: 12px; text-align: center;">No operations available<br>Add operations in Master Data</div>';
    return;
  }
  
  listContainer.innerHTML = operations.map(op =>
    '<div draggable="true" ondragstart="handleOperationDragStart(event, \'' + op.id + '\')" style="padding: 6px 8px; border: 1px solid var(--border); border-radius: 4px; cursor: grab; background: white; margin-bottom: 4px; font-size: 13px; font-weight: 500;" onmouseover="this.style.background=\'var(--muted)\'" onmouseout="this.style.background=\'white\'">' + op.name + '</div>'
  ).join('');
}

export function handleOperationDragStart(event, operationId) {
  planDesignerState.draggedOperation = operationId;
  event.dataTransfer.effectAllowed = 'copy';
}

export function handleCanvasDragOver(event) {
  event.preventDefault();
  event.dataTransfer.dropEffect = 'copy';
}

export function handleCanvasDrop(event) {
  event.preventDefault();
  if (!planDesignerState.draggedOperation) return;

  const canvas = document.getElementById('plan-canvas');
  const rect = canvas.getBoundingClientRect();
  const x = event.clientX - rect.left - 80;
  const y = event.clientY - rect.top - 40;

  // TODO: Get operations from Firebase/global state
  const operations = [];
  const operation = operations.find(op => op.id === planDesignerState.draggedOperation);
  if (!operation) {
    console.warn('Operation not found:', planDesignerState.draggedOperation);
    return;
  }

  const nodeId = 'node-' + planDesignerState.nodeIdCounter++;
  const newNode = {
    id: nodeId,
    operationId: operation.id,
    name: operation.name,
    type: operation.type,
    time: operation.time,
    skills: operation.skills,
    x: Math.max(0, x),
    y: Math.max(0, y),
    connections: [],
    assignedWorker: null,
    assignedStation: null
  };
  planDesignerState.nodes.push(newNode);
  renderCanvas();
  planDesignerState.draggedOperation = null;
  showToast(operation.name + ' operasyonu eklendi', 'success');
}

export function renderCanvas() {
  const canvas = document.getElementById('plan-canvas');
  if (!canvas) return;
  const existingElements = canvas.querySelectorAll('.canvas-node, .connection-container');
  existingElements.forEach(element => element.remove());

  planDesignerState.nodes.forEach(node => {
    node.connections.forEach(targetId => {
      const targetNode = planDesignerState.nodes.find(n => n.id === targetId);
      if (targetNode) renderConnection(node, targetNode);
    });
  });
  planDesignerState.nodes.forEach(node => renderNode(node));
}

export function renderNode(node) {
  const canvas = document.getElementById('plan-canvas');
  const colors = { 'Machining': '#3b82f6', 'Welding': '#ef4444', 'Quality': '#10b981', 'Assembly': '#8b5cf6', 'Packaging': '#f97316', 'Treatment': '#06b6d4', 'Finishing': '#ec4899' };
  const nodeElement = document.createElement('div');
  nodeElement.className = 'canvas-node';
  nodeElement.id = 'node-' + node.id;
  nodeElement.style.cssText = [
    'position: absolute;', `left: ${node.x}px;`, `top: ${node.y}px;`, 'width: 160px;', 'min-height: 80px;', 'background: white;',
    `border: 2px solid ${colors[node.type] || '#6b7280'};`, 'border-radius: 8px;', 'padding: 8px;', 'cursor: move;',
    'box-shadow: 0 2px 4px rgba(0,0,0,0.1);', 'z-index: 10;', 'user-select: none;'
  ].join('');
  // Material summary for display
  const matSummary = (() => {
    const rms = Array.isArray(node.rawMaterials) ? node.rawMaterials : (node.rawMaterial ? [node.rawMaterial] : [])
    if (!rms.length) return 'Not selected'
    const parts = rms.slice(0,2).map(m => {
      const nm = m.name || m.id
      const qty = m.qty != null && m.qty !== '' ? ` (${m.qty}${m.unit?(' '+m.unit):''})` : ''
      return (nm||'').toString() + qty
    })
    const extra = rms.length > 2 ? ` +${rms.length-2} more` : ''
    return parts.join(', ') + extra
  })()
  nodeElement.innerHTML = [
    '<div style="display: flex; justify-content: between; align-items: flex-start; margin-bottom: 4px;">',
    `<div class="drag-handle" style="font-weight: 600; font-size: 14px; color: ${colors[node.type] || '#6b7280'}; flex: 1; cursor: move; padding: 2px;">🔸 ${node.name}</div>`,
    '<div style="display: flex; gap: 2px;">',
    `<button onclick="event.stopPropagation(); editNode('${node.id}')" style="width: 20px; height: 20px; border: none; background: #f3f4f6; border-radius: 3px; cursor: pointer; font-size: 10px;">✏️</button>`,
    `<button onclick="event.stopPropagation(); deleteNode('${node.id}')" style="width: 20px; height: 20px; border: none; background: #fee2e2; border-radius: 3px; cursor: pointer; font-size: 10px;">🗑️</button>`,
    '</div></div>',
    `<div style="font-size: 11px; color: #6b7280; margin-bottom: 2px;">Type: ${node.type}</div>`,
    `<div style=\"font-size: 11px; color: #6b7280; margin-bottom: 2px;\">⏱️ ${node.time} min</div>`,
    `<div style=\"font-size: 10px; color: #9ca3af;\">Worker: ${node.assignedWorker || 'Not assigned'}<br>Station: ${node.assignedStation || 'Not assigned'}<br>Materials: ${matSummary}</div>`
  ].join('');

  let isDragging = false; let dragStartX = 0; let dragStartY = 0; let nodeStartX = node.x; let nodeStartY = node.y;
  nodeElement.onmousedown = (e) => {
    if (e.target.closest('button')) return;
    if (planDesignerState.connectMode) { handleNodeClick(node.id); return; }
    isDragging = true; dragStartX = e.clientX; dragStartY = e.clientY; nodeStartX = node.x; nodeStartY = node.y;
    nodeElement.style.zIndex = '20'; nodeElement.style.transform = 'scale(1.05)'; e.preventDefault();
  };
  document.onmousemove = (e) => {
    if (!isDragging) return; const deltaX = e.clientX - dragStartX; const deltaY = e.clientY - dragStartY;
    const newX = Math.max(0, nodeStartX + deltaX); const newY = Math.max(0, nodeStartY + deltaY);
    node.x = newX; node.y = newY; nodeElement.style.left = newX + 'px'; nodeElement.style.top = newY + 'px'; updateConnectionsForNode(node.id);
  };
  document.onmouseup = () => { if (isDragging) { isDragging = false; nodeElement.style.zIndex = '10'; nodeElement.style.transform = 'scale(1)'; } };
  nodeElement.onclick = (e) => { e.stopPropagation(); if (!isDragging) handleNodeClick(node.id); };
  canvas.appendChild(nodeElement);
}

export function renderConnection(fromNode, toNode) {
  const canvas = document.getElementById('plan-canvas');
  const connectionId = 'connection-' + fromNode.id + '-' + toNode.id;
  const container = document.createElement('div');
  container.className = 'connection-container';
  container.id = connectionId; container.style.cssText = 'position: absolute;pointer-events: none;z-index: 5;';
  const fromX = fromNode.x + 80; const fromY = fromNode.y + 40; const toX = toNode.x + 80; const toY = toNode.y + 40;
  const length = Math.sqrt(Math.pow(toX - fromX, 2) + Math.pow(toY - fromY, 2));
  const angle = Math.atan2(toY - fromY, toX - fromX) * 180 / Math.PI;

  const line = document.createElement('div');
  line.className = 'connection-line';
  line.style.cssText = `position:absolute; left:${fromX}px; top:${fromY}px; width:${length}px; height:2px; background:#9ca3af; transform-origin: 0 0; transform: rotate(${angle}deg);`;

  const middleArrow = document.createElement('div');
  const middleX = fromX + (toX - fromX) / 2; const middleY = fromY + (toY - fromY) / 2;
  middleArrow.className = 'middle-arrow';
  middleArrow.style.cssText = `position:absolute; left:${middleX - 4}px; top:${middleY - 4}px; width:0; height:0; border-left:8px solid #6b7280; border-top:4px solid transparent; border-bottom:4px solid transparent; transform: rotate(${angle}deg);`;

  const arrowHead = document.createElement('div');
  arrowHead.className = 'arrow-head';
  arrowHead.style.cssText = `position:absolute; left:${toX - 4}px; top:${toY - 4}px; width:0; height:0; border-left:8px solid #6b7280; border-top:4px solid transparent; border-bottom:4px solid transparent; transform: rotate(${angle}deg);`;

  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'connection-delete-btn';
  deleteBtn.textContent = '×';
  deleteBtn.style.cssText = `position:absolute; left:${middleX - 10}px; top:${middleY - 10}px; width:20px; height:20px; border:none; border-radius:50%; background:#ef4444; color:white; cursor:pointer; opacity:0; pointer-events:none;`;
  const showDeleteBtn = () => { deleteBtn.style.opacity = '1'; deleteBtn.style.pointerEvents = 'auto'; };
  const hideDeleteBtn = () => { deleteBtn.style.opacity = '0'; deleteBtn.style.pointerEvents = 'none'; };
  [line, middleArrow, arrowHead].forEach(el => { el.onmouseenter = showDeleteBtn; el.onmouseleave = hideDeleteBtn; });
  deleteBtn.onmouseenter = showDeleteBtn; deleteBtn.onmouseleave = hideDeleteBtn;
  deleteBtn.onclick = () => deleteConnection(fromNode.id, toNode.id);

  container.appendChild(line); container.appendChild(middleArrow); container.appendChild(arrowHead); container.appendChild(deleteBtn);
  canvas.appendChild(container);
}

export function updateConnectionsForNode(nodeId) {
  const canvas = document.getElementById('plan-canvas');
  const existing = canvas.querySelectorAll('.connection-container');
  existing.forEach(el => el.remove());
  planDesignerState.nodes.forEach(node => {
    node.connections.forEach(targetId => {
      const targetNode = planDesignerState.nodes.find(n => n.id === targetId);
      if (targetNode) renderConnection(node, targetNode);
    });
  });
}

export function deleteConnection(fromNodeId, toNodeId) {
  const fromNode = planDesignerState.nodes.find(n => n.id === fromNodeId);
  if (fromNode) {
    fromNode.connections = fromNode.connections.filter(id => id !== toNodeId);
    renderCanvas();
    showToast('Connection deleted', 'success');
  }
}

export function handleNodeClick(nodeId) {
  if (planDesignerState.connectMode) {
    if (planDesignerState.connectingFrom === null) {
      planDesignerState.connectingFrom = nodeId;
      showToast('Select target operation to connect', 'info');
    } else if (planDesignerState.connectingFrom !== nodeId) {
      connectNodes(planDesignerState.connectingFrom, nodeId);
      planDesignerState.connectingFrom = null; planDesignerState.connectMode = false; updateConnectButton();
    }
  }
}

export function connectNodes(fromId, toId) {
  const fromNode = planDesignerState.nodes.find(n => n.id === fromId);
  if (fromNode && !fromNode.connections.includes(toId)) {
    fromNode.connections.push(toId);
    renderCanvas();
    showToast('Operations connected', 'success');
  }
}

export function toggleConnectMode() {
  planDesignerState.connectMode = !planDesignerState.connectMode;
  planDesignerState.connectingFrom = null;
  updateConnectButton();
  if (planDesignerState.connectMode) showToast('Connect mode active. Click source operation, then target operation.', 'info');
}

export function updateConnectButton() {
  const btn = document.getElementById('connect-mode-btn');
  if (btn) {
    btn.style.background = planDesignerState.connectMode ? 'var(--primary)' : 'white';
    btn.style.color = planDesignerState.connectMode ? 'white' : 'black';
    btn.innerHTML = planDesignerState.connectMode ? '🔗 Connecting...' : '🔗 Connect';
  }
}

export function clearCanvas() {
  if (planDesignerState.nodes.length === 0) { showToast('Canvas is already empty', 'info'); return; }
  if (confirm('Are you sure you want to clear all operations?')) {
    planDesignerState.nodes = []; planDesignerState.connectMode = false; planDesignerState.connectingFrom = null; updateConnectButton(); renderCanvas(); showToast('Canvas cleared', 'success');
  }
}

// Global escape handler for modal
let modalEscapeHandler = null;

export function editNode(nodeId) {
  const node = planDesignerState.nodes.find(n => n.id === nodeId);
  if (!node) return; planDesignerState.selectedNode = node;
  const workers = [
    { id: 'w1', name: 'Ali Yılmaz', skills: ['CNC Programming', 'CAM Software'] },
    { id: 'w2', name: 'Ahmet Can', skills: ['MIG Welding', 'Blueprint Reading'] },
    { id: 'w3', name: 'Fatma Öz', skills: ['Quality Inspection', 'Measurement'] },
    { id: 'w4', name: 'Mehmet Acar', skills: ['Assembly', 'Hand Tools'] }
  ];
  const stations = [
    { id: 's1', name: 'CNC Mill 01', type: 'Machining' },
    { id: 's2', name: 'Welding Station 01', type: 'Welding' },
    { id: 's3', name: 'QC Station 01', type: 'Quality' },
    { id: 's4', name: 'Assembly Line 01', type: 'Assembly' }
  ];
  const compatibleWorkers = workers.filter(w => node.skills.some(skill => w.skills.includes(skill)));
  const compatibleStations = stations.filter(s => s.type === node.type);
  const formContent =
    '<div style="margin-bottom: 16px;"><label style="display: block; margin-bottom: 4px; font-weight: 500;">Operation Name</label><input type="text" id="edit-name" value="' + node.name + '" style="width: 100%; padding: 8px; border: 1px solid var(--border); border-radius: 4px;" /></div>' +
    '<div style="margin-bottom: 16px;"><label style="display: block; margin-bottom: 4px; font-weight: 500;">Estimated Unit Production Time (minutes)</label><input type="number" id="edit-time" value="' + node.time + '" min="1" style="width: 100%; padding: 8px; border: 1px solid var(--border); border-radius: 4px;" /></div>' +
    '<div style="margin-bottom: 16px;"><label style="display: block; margin-bottom: 4px; font-weight: 500;">Assigned Worker</label><select id="edit-worker" style="width: 100%; padding: 8px; border: 1px solid var(--border); border-radius: 4px;"><option value="">Not assigned</option>' +
    compatibleWorkers.map(w => '<option value="' + w.name + '" ' + (node.assignedWorker === w.name ? 'selected' : '') + '>' + w.name + '</option>').join('') +
    '</select></div>' +
    '<div style="margin-bottom: 16px;"><label style="display: block; margin-bottom: 4px; font-weight: 500;">Assigned Station</label><select id="edit-station" style="width: 100%; padding: 8px; border: 1px solid var(--border); border-radius: 4px;"><option value="">Not assigned</option>' +
    compatibleStations.map(s => '<option value="' + s.name + '" ' + (node.assignedStation === s.name ? 'selected' : '') + '>' + s.name + '</option>').join('') +
    '</select></div>' +
    '<div style="margin-bottom: 16px;"><label style="display: block; margin-bottom: 4px; font-weight: 500;">Required Skills</label><div style="font-size: 12px; color: var(--muted-foreground);">' + node.skills.join(', ') + '</div></div>';
  document.getElementById('node-edit-form').innerHTML = formContent;
  const modal = document.getElementById('node-edit-modal');
  if (modal) {
    modal.style.display = 'block';
    // Lock body scroll
    document.body.style.overflow = 'hidden';
    document.body.style.paddingRight = getScrollbarWidth() + 'px';
    
    // Add escape key listener
    modalEscapeHandler = (e) => {
      if (e.key === 'Escape') {
        closeNodeEditModal()
      }
    }
    document.addEventListener('keydown', modalEscapeHandler)
  }
}

// Helper function for scrollbar width calculation
function getScrollbarWidth() {
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

export function saveNodeEdit() {
  if (!planDesignerState.selectedNode) return;
  const name = document.getElementById('edit-name').value;
  const time = parseInt(document.getElementById('edit-time').value);
  const worker = document.getElementById('edit-worker').value;
  const station = document.getElementById('edit-station').value;
  if (!name || !time || time < 1) { showToast('Please fill all required fields', 'error'); return; }
  planDesignerState.selectedNode.name = name;
  planDesignerState.selectedNode.time = time;
  planDesignerState.selectedNode.assignedWorker = worker || null;
  planDesignerState.selectedNode.assignedStation = station || null;
  renderCanvas();
  closeNodeEditModal();
  showToast('Operation updated', 'success');
}

export function closeNodeEditModal(event) {
  if (event && event.target !== event.currentTarget) return;
  const modal = document.getElementById('node-edit-modal');
  if (modal) {
    modal.style.display = 'none';
    // Unlock body scroll
    document.body.style.overflow = '';
    document.body.style.paddingRight = '';
  }
  planDesignerState.selectedNode = null;
  
  // Remove escape key listener
  if (modalEscapeHandler) {
    document.removeEventListener('keydown', modalEscapeHandler);
    modalEscapeHandler = null;
  }
}

export function deleteNode(nodeId) {
  if (confirm('Are you sure you want to delete this Production Step?')) {
    planDesignerState.nodes = planDesignerState.nodes.filter(n => n.id !== nodeId);
    planDesignerState.nodes.forEach(node => { node.connections = node.connections.filter(connId => connId !== nodeId); });
    renderCanvas();
    showToast('Operation deleted', 'success');
  }
}

export function handleOrderChange() {
  const select = document.getElementById('order-select');
  const selectedOrder = select.value;
  if (selectedOrder) {
    // TODO: Get order data from Firebase/backend
    const orderData = {};
    const order = orderData[selectedOrder];
    if (order) {
      showToast(`Selected: ${order.product} (${order.quantity} units, due ${order.dueDate})`, 'info');
    } else {
      console.warn('Order data not found for:', selectedOrder);
    }
  }
}

// Schedule type UI handlers (frontend-only)
export function handleScheduleTypeChange() {
  const type = document.getElementById('schedule-type')?.value;
  const recurringBox = document.getElementById('recurring-subtype-container');
  const periodicBox = document.getElementById('periodic-frequency-container');
  const customBox = document.getElementById('custom-frequency-container');
  if (!recurringBox || !periodicBox || !customBox) return;
  if (type === 'recurring') {
    recurringBox.style.display = '';
    // default to periodic
    const recurringType = document.getElementById('recurring-type');
    if (recurringType) recurringType.value = recurringType.value || 'periodic';
    handleRecurringTypeChange();
  } else {
    recurringBox.style.display = 'none';
    periodicBox.style.display = 'none';
    customBox.style.display = 'none';
  }
}

export function handleRecurringTypeChange() {
  const recurringType = document.getElementById('recurring-type')?.value;
  const periodicBox = document.getElementById('periodic-frequency-container');
  const customBox = document.getElementById('custom-frequency-container');
  if (!periodicBox || !customBox) return;
  if (recurringType === 'periodic') {
    periodicBox.style.display = '';
    // ensure custom input hidden by default
    const freq = document.getElementById('periodic-frequency');
    if (freq) {
      if (!freq.value) freq.value = 'daily';
    }
    handlePeriodicFrequencyChange();
  } else {
    periodicBox.style.display = 'none';
    customBox.style.display = 'none';
  }
}

export function handlePeriodicFrequencyChange() {
  const freq = document.getElementById('periodic-frequency')?.value;
  const customBox = document.getElementById('custom-frequency-container');
  if (!customBox) return;
  if (freq === 'custom') {
    customBox.style.display = '';
  } else {
    customBox.style.display = 'none';
  }
}

export function savePlanAsTemplate() {
  if (planDesignerState.nodes.length === 0) { showToast('Cannot save empty plan as template', 'error'); return; }
  const planName = document.getElementById('plan-name').value;
  if (!planName) { showToast('Please enter a plan name', 'error'); return; }
  showToast(`Plan "${planName}" saved as template`, 'success');
}

export function deployWorkOrder() {
  if (planDesignerState.nodes.length === 0) { showToast('Cannot deploy empty plan', 'error'); return; }
  const planName = document.getElementById('plan-name').value;
  const selectedOrder = document.getElementById('order-select').value;
  if (!planName) { showToast('Please enter a plan name', 'error'); return; }
  if (!selectedOrder) { showToast('Please select an order', 'error'); return; }
  const unassignedOps = planDesignerState.nodes.filter(n => !n.assignedWorker);
  if (unassignedOps.length > 0) { showToast(`${unassignedOps.length} operations need worker assignment`, 'warning'); return; }
  const totalTime = planDesignerState.nodes.reduce((sum, n) => sum + n.time, 0);
  showToast(`Work Order deployed successfully! Total estimated time: ${totalTime} minutes`, 'success');
  planDesignerState.nodes = [];
  const pn = document.getElementById('plan-name'); if (pn) pn.value = '';
  const pd = document.getElementById('plan-description'); if (pd) pd.value = '';
  const os = document.getElementById('order-select'); if (os) os.value = '';
  renderCanvas();
}

export function handleCanvasClick(event) {
  if (planDesignerState.connectMode && event.target.id === 'plan-canvas') {
    planDesignerState.connectMode = false; planDesignerState.connectingFrom = null; updateConnectButton(); showToast('Connect mode cancelled', 'info');
  }
}

export function initializePlanDesigner() {
  setTimeout(() => { loadOperationsToolbox(); renderCanvas(); handleScheduleTypeChange(); }, 100);
}
