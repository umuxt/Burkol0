// Plan Designer logic and state
import { showToast } from './ui.js';
import { computeAndAssignSemiCode, getSemiCodePreview, getPrefixForNode } from './semiCode.js';
import { upsertProducedWipFromNode, getStations, createProductionPlan, createTemplate, getNextProductionPlanId, genId, updateProductionPlan, getApprovedQuotes, getProductionPlans } from './mesApi.js';
import { cancelPlanCreation, setActivePlanTab } from './planOverview.js';
import { populateUnitSelect } from './units.js';
import { API_BASE, withAuth } from '../../shared/lib/api.js';

export const planDesignerState = {
  nodes: [],
  connectMode: false,
  connectingFrom: null,
  draggedOperation: null,
  selectedNode: null,
  nodeIdCounter: 1,
  isFullscreen: false,
  availableOperations: [],
  // Global drag state
  isDragging: false,
  draggedNode: null,
  dragStartX: 0,
  dragStartY: 0,
  nodeStartX: 0,
  nodeStartY: 0,
  // Connection hover state
  isConnecting: false,
  connectionSource: null,
  hoveredNode: null,
  connectionTarget: null,
  // Fullscreen zoom state
  fullscreenZoom: 100,
  // Canvas pan state
  isPanning: false,
  panStartX: 0,
  panStartY: 0,
  panOffsetX: 0,
  panOffsetY: 0,
  // Read-only viewing mode
  readOnly: false,
  // Metadata about the currently opened plan/template (e.g., status, name)
  currentPlanMeta: null,
  // Dropdown debounce timestamps
  _orderPanelLastToggle: 0,
  _typePanelLastToggle: 0
};

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function loadOperationsToolbox() {
  // Gerçek operations verilerini kullan (şimdilik hardcoded, Firebase'den gelecek)
  const operations = [
    { id: 'op-225d1xh', name: 'Boyama', type: 'painting', time: 30, skills: ['painter'] },
    { id: 'op-25m0lvw', name: 'Montaj', type: 'assembly', time: 45, skills: ['assembly'] },
    { id: 'op-me5qd1y', name: 'Press Kalıp Şekillendirme', type: 'forming', time: 60, skills: ['operator'] },
    { id: 'op-rqjlcwf', name: 'Torna', type: 'machining', time: 40, skills: ['machinist'] }
  ];

  // Normal operations list
  const listContainer = document.getElementById('operations-list');
  if (listContainer) {
    if (operations.length === 0) {
      listContainer.innerHTML = '<div style="padding: 8px; color: var(--muted-foreground); font-size: 12px; text-align: center;">No operations available<br>Add operations in Master Data</div>';
    } else {
      listContainer.innerHTML = operations.map(op =>
        `<div draggable="true" ondragstart="handleOperationDragStart(event, '${op.id}')" style="padding: 6px 8px; border: 1px solid var(--border); border-radius: 4px; cursor: grab; background: white; margin-bottom: 4px; font-size: 13px; font-weight: 500;" onmouseover="this.style.background='var(--muted)'" onmouseout="this.style.background='white'">${op.name}</div>`
      ).join('');
    }
  }
  
  // Fullscreen operations list
  const fullscreenListContainer = document.getElementById('fullscreen-operations-list');
  if (fullscreenListContainer) {
    if (operations.length === 0) {
      fullscreenListContainer.innerHTML = '<div style="padding: 12px; color: var(--muted-foreground); font-size: 14px; text-align: center;">No operations available<br>Add operations in Master Data</div>';
    } else {
      fullscreenListContainer.innerHTML = operations.map(op =>
        `<div draggable="true" ondragstart="handleOperationDragStart(event, '${op.id}')" style="padding: 8px 12px; border: 1px solid var(--border); border-radius: 6px; cursor: grab; background: white; margin-bottom: 8px; font-size: 14px; font-weight: 500;" onmouseover="this.style.background='var(--muted)'" onmouseout="this.style.background='white'">${op.name}</div>`
      ).join('');
    }
  }
  
  // Store in planDesignerState for drag & drop
  planDesignerState.availableOperations = operations
  
  // Initialize global event handlers if not already done
  initializeGlobalEventHandlers()
}

// Global event handlers for drag functionality
let globalEventHandlersInitialized = false;

function initializeGlobalEventHandlers() {
  if (globalEventHandlersInitialized) return;
  
  // Global mousedown for connection zone detection and pan start
  document.addEventListener('mousedown', (e) => {
    const normalCanvas = document.getElementById('plan-canvas');
    const fullscreenCanvas = document.getElementById('fullscreen-plan-canvas');

    // Guard clause: Check if the click originated inside a canvas.
    // If not, exit early to avoid interfering with other UI elements like dropdowns.
    const isClickOnCanvas = (normalCanvas && normalCanvas.contains(e.target)) ||
                            (fullscreenCanvas && fullscreenCanvas.contains(e.target));

    if (!isClickOnCanvas) {
        console.log('DEBUG: Mousedown event ignored because click was outside canvas. Target:', e.target);
        return;
    }
    console.log('DEBUG: Mousedown event is ON CANVAS. Processing...');


    // Determine which canvas we're working with
    const targetCanvas = getActiveCanvas(e);
    if (!targetCanvas) return;
    
    // Check if we're clicking on empty canvas space (for panning in fullscreen)
    // Pan is only allowed with right-click and when connect mode is OFF
    if (targetCanvas.id === 'fullscreen-plan-canvas' && !planDesignerState.connectMode) {
      const target = e.target;
      
      // Only allow panning with right click
      const isRightClick = e.button === 2;
      
      if (isRightClick) {
        // For right click, check that we're not on interactive elements
        if (target.closest('button') || target.closest('.drag-handle')) {
          return; // Don't pan on interactive elements
        }
        
        planDesignerState.isPanning = true;
        planDesignerState.panStartX = e.clientX;
        planDesignerState.panStartY = e.clientY;
        targetCanvas.style.cursor = 'grabbing';
        e.preventDefault();
        return;
      }
    }
    
    // Check if we're in a connection zone (near but not on a node)
    // Disabled in read-only mode
    if (!planDesignerState.readOnly && planDesignerState.hoveredNode) {
      planDesignerState.isConnecting = true;
      planDesignerState.connectionSource = planDesignerState.hoveredNode;
      console.log('Connection started from node:', planDesignerState.hoveredNode.id);
      e.preventDefault();
      return;
    }
  });
  
  // Disable context menu on fullscreen canvas for better pan experience
  document.addEventListener('contextmenu', (e) => {
    const targetCanvas = getActiveCanvas(e);
    if (targetCanvas && targetCanvas.id === 'fullscreen-plan-canvas') {
      e.preventDefault();
    }
  });
  
  document.addEventListener('mousemove', (e) => {
    // Determine which canvas we're working with
    const targetCanvas = getActiveCanvas(e);
    if (!targetCanvas) return;
    
    // Handle canvas panning
    if (planDesignerState.isPanning) {
      const deltaX = e.clientX - planDesignerState.panStartX;
      const deltaY = e.clientY - planDesignerState.panStartY;
      planDesignerState.panOffsetX += deltaX;
      planDesignerState.panOffsetY += deltaY;
      planDesignerState.panStartX = e.clientX;
      planDesignerState.panStartY = e.clientY;
      updateCanvasPan();
      return;
    }
    
    // Handle drag functionality
    if (planDesignerState.isDragging && planDesignerState.draggedNode) {
      const deltaX = e.clientX - planDesignerState.dragStartX;
      const deltaY = e.clientY - planDesignerState.dragStartY;
      const newX = Math.max(0, planDesignerState.nodeStartX + deltaX);
      const newY = Math.max(0, planDesignerState.nodeStartY + deltaY);
      
      // Update node position
      planDesignerState.draggedNode.x = newX;
      planDesignerState.draggedNode.y = newY;
      
      // Update DOM element in the appropriate canvas
      const nodeElement = targetCanvas.querySelector('#node-' + planDesignerState.draggedNode.id);
      if (nodeElement) {
        nodeElement.style.left = newX + 'px';
        nodeElement.style.top = newY + 'px';
      }
      
      // Update connections in the appropriate canvas
      updateConnectionsForNodeInCanvas(planDesignerState.draggedNode.id, targetCanvas);
      return;
    }
    
    // Handle connection hover detection
    if (!planDesignerState.isDragging) {
      checkNodeHover(e);
      
      // If we're in drag-to-connect flow, highlight potential target
      if (planDesignerState.isConnecting && planDesignerState.connectionSource) {
        highlightConnectionTarget(e);
      } else if (planDesignerState.connectMode && planDesignerState.connectingFrom !== null) {
        // Also support highlight while in manual connect mode
        const src = planDesignerState.nodes.find(n => n.id === planDesignerState.connectingFrom);
        if (src) {
          planDesignerState.connectionSource = src;
          highlightConnectionTarget(e);
        }
      }
    }
  });
  
  document.addEventListener('mouseup', (e) => {
    // Determine which canvas we're working with
    const targetCanvas = getActiveCanvas(e);
    if (!targetCanvas) return;
    
    // Handle pan end
    if (planDesignerState.isPanning) {
      planDesignerState.isPanning = false;
      if (targetCanvas && targetCanvas.id === 'fullscreen-plan-canvas') {
        // Set cursor based on current mode
        updateCanvasCursor();
      }
      return;
    }
    
    // Handle drag end
    if (planDesignerState.isDragging && planDesignerState.draggedNode) {
      planDesignerState.isDragging = false;
      
      const nodeElement = targetCanvas.querySelector('#node-' + planDesignerState.draggedNode.id);
      if (nodeElement) {
        nodeElement.style.zIndex = '10';
        nodeElement.style.transform = 'scale(1)';
      }
      
      planDesignerState.draggedNode = null;
      return;
    }
    
    // Handle connection drop
    if (planDesignerState.isConnecting && planDesignerState.connectionSource) {
      // First check if we have a connection target
      let targetNode = planDesignerState.connectionTarget;
      
      // If no connection target, check direct mouse position for any node
      if (!targetNode) {
        const canvasRect = targetCanvas.getBoundingClientRect();
        const mouseX = e.clientX - canvasRect.left;
        const mouseY = e.clientY - canvasRect.top;
        
        const nodes = targetCanvas.querySelectorAll('.canvas-node');
        for (const nodeEl of nodes) {
          const rect = nodeEl.getBoundingClientRect();
          const nodeX = rect.left - canvasRect.left;
          const nodeY = rect.top - canvasRect.top;
          
          if (mouseX >= nodeX && mouseX <= nodeX + rect.width && 
              mouseY >= nodeY && mouseY <= nodeY + rect.height) {
            const nodeId = nodeEl.id.replace('node-', '');
            targetNode = planDesignerState.nodes.find(n => n.id === nodeId);
            break;
          }
        }
      }
      
      // Create connection if we found a target
      if (targetNode && planDesignerState.connectionSource.id !== targetNode.id) {
        connectNodes(planDesignerState.connectionSource.id, targetNode.id);
        console.log('Connection created:', planDesignerState.connectionSource.id, '->', targetNode.id);
      }
      
      // Reset connection state
      resetConnectionState();
    }
  });
  
  globalEventHandlersInitialized = true;
}

// Helper function to get active canvas based on mouse event
function getActiveCanvas(e) {
  // Check if mouse is over fullscreen canvas
  const fullscreenCanvas = document.getElementById('fullscreen-plan-canvas');
  const normalCanvas = document.getElementById('plan-canvas');
  
  console.log('Checking canvases:', {
    fullscreen: !!fullscreenCanvas,
    normal: !!normalCanvas,
    fullscreenVisible: fullscreenCanvas?.offsetParent !== null,
    normalVisible: normalCanvas?.offsetParent !== null
  });
  
  if (fullscreenCanvas && fullscreenCanvas.offsetParent !== null) {
    const rect = fullscreenCanvas.getBoundingClientRect();
    console.log('Fullscreen canvas rect:', rect);
    if (e.clientX >= rect.left && e.clientX <= rect.right && 
        e.clientY >= rect.top && e.clientY <= rect.bottom) {
      console.log('Mouse is over fullscreen canvas');
      return fullscreenCanvas;
    }
  }
  
  if (normalCanvas && normalCanvas.offsetParent !== null) {
    const rect = normalCanvas.getBoundingClientRect();
    console.log('Normal canvas rect:', rect);
    if (e.clientX >= rect.left && e.clientX <= rect.right && 
        e.clientY >= rect.top && e.clientY <= rect.bottom) {
      console.log('Mouse is over normal canvas');
      return normalCanvas;
    }
  }
  
  // Fallback to current mode
  const fallback = planDesignerState.isFullscreen ? fullscreenCanvas : normalCanvas;
  console.log('Using fallback canvas:', fallback?.id);
  return fallback;
}

// Updated connection update function that works with specific canvas
function updateConnectionsForNodeInCanvas(nodeId, canvas) {
  if (!canvas) return;
  
  const existing = canvas.querySelectorAll('.connection-container');
  existing.forEach(el => el.remove());
  
  planDesignerState.nodes.forEach(node => {
    node.connections.forEach(targetId => {
      const targetNode = planDesignerState.nodes.find(n => n.id === targetId);
      if (targetNode) {
        renderConnection(node, targetNode, canvas);
      }
    });
  });
}

// Connection hover and highlighting functions
function checkNodeHover(e) {
  // In view mode, do not show or compute connection hover
  if (planDesignerState.readOnly) {
    if (planDesignerState.hoveredNode) {
      removeNodeHoverEffect(planDesignerState.hoveredNode);
      planDesignerState.hoveredNode = null;
    }
    const activeCanvas = getActiveCanvas(e);
    if (activeCanvas) {
      if (activeCanvas.id === 'fullscreen-plan-canvas') {
        activeCanvas.style.cursor = 'grab';
      } else {
        activeCanvas.style.cursor = 'default';
      }
    }
    return;
  }
  const nearbyNode = getNodeNearMouse(e);
  const activeCanvas = getActiveCanvas(e);
  
  // Remove previous hover effects
  if (planDesignerState.hoveredNode && planDesignerState.hoveredNode !== nearbyNode) {
    removeNodeHoverEffect(planDesignerState.hoveredNode);
  }
  
  planDesignerState.hoveredNode = nearbyNode;
  
  if (nearbyNode) {
    addNodeHoverEffect(nearbyNode);
    if (activeCanvas) activeCanvas.style.cursor = 'crosshair';
  } else {
    // Restore cursor based on context
    if (activeCanvas) {
      if (activeCanvas.id === 'fullscreen-plan-canvas') {
        activeCanvas.style.cursor = planDesignerState.connectMode ? 'crosshair' : 'grab';
      } else {
        activeCanvas.style.cursor = 'default';
      }
    }
  }
}

function getNodeNearMouse(e) {
  const activeCanvas = getActiveCanvas(e);
  if (!activeCanvas) {
    return null;
  }
  
  const canvasRect = activeCanvas.getBoundingClientRect();
  const mouseX = e.clientX - canvasRect.left;
  const mouseY = e.clientY - canvasRect.top;
  
  // On-screen hover tolerance in pixels
  const hoverDistance = 25;
  
  // Find node within hover distance range
  const nodes = activeCanvas.querySelectorAll('.canvas-node');
  
  for (const nodeEl of nodes) {
    let nodeX, nodeY, nodeWidth, nodeHeight;
    
    // Use transformed bounding rect for both modes
    const rect = nodeEl.getBoundingClientRect();
    nodeX = rect.left - canvasRect.left;
    nodeY = rect.top - canvasRect.top;
    nodeWidth = rect.width;
    nodeHeight = rect.height;
    
    // Check if mouse is within hover distance around the node (not on it)
    const isNearNode = (
      mouseX >= nodeX - hoverDistance && mouseX <= nodeX + nodeWidth + hoverDistance &&
      mouseY >= nodeY - hoverDistance && mouseY <= nodeY + nodeHeight + hoverDistance
    );
    
    // But not directly on the node
    const isOnNode = (
      mouseX >= nodeX && mouseX <= nodeX + nodeWidth &&
      mouseY >= nodeY && mouseY <= nodeY + nodeHeight
    );
    
    if (isNearNode && !isOnNode) {
      const nodeId = nodeEl.id.replace('node-', '');
      const foundNode = planDesignerState.nodes.find(n => n.id === nodeId);
      return foundNode;
    }
  }
  
  return null;
}

function addNodeHoverEffect(node) {
  if (planDesignerState.readOnly) return; // No hover styles in view mode
  // Update hover effect in both normal and fullscreen canvases
  const normalNodeElement = document.querySelector('#plan-canvas #node-' + node.id);
  const fullscreenNodeElement = document.querySelector('#fullscreen-plan-canvas #node-' + node.id);
  
  [normalNodeElement, fullscreenNodeElement].forEach(nodeElement => {
    if (nodeElement) {
      nodeElement.style.boxShadow = '0 0 15px 3px #3b82f6, 0 2px 4px rgba(0,0,0,0.1)';
      nodeElement.style.borderColor = '#3b82f6';
      nodeElement.style.transition = 'all 0.2s ease';
      console.log('Added hover effect to:', nodeElement.id, 'in canvas:', nodeElement.parentElement.id);
    }
  });
}

function removeNodeHoverEffect(node) {
  // Remove hover effect from both normal and fullscreen canvases
  const normalNodeElement = document.querySelector('#plan-canvas #node-' + node.id);
  const fullscreenNodeElement = document.querySelector('#fullscreen-plan-canvas #node-' + node.id);
  
  [normalNodeElement, fullscreenNodeElement].forEach(nodeElement => {
    if (nodeElement) {
      nodeElement.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
      nodeElement.style.borderColor = '';
      nodeElement.style.transition = '';
      console.log('Removed hover effect from:', nodeElement.id, 'in canvas:', nodeElement.parentElement.id);
    }
  });
}

function highlightConnectionTarget(e) {
  if (planDesignerState.readOnly) return; // No target highlight in view mode
  const activeCanvas = getActiveCanvas(e);
  if (!activeCanvas) return;
  
  const canvasRect = activeCanvas.getBoundingClientRect();
  const mouseX = e.clientX - canvasRect.left;
  const mouseY = e.clientY - canvasRect.top;
  
  // Find target node under mouse
  const nodes = activeCanvas.querySelectorAll('.canvas-node');
  let targetNode = null;
  
  for (const nodeEl of nodes) {
    const rect = nodeEl.getBoundingClientRect();
    const nodeX = rect.left - canvasRect.left;
    const nodeY = rect.top - canvasRect.top;
    
    if (mouseX >= nodeX && mouseX <= nodeX + rect.width && 
        mouseY >= nodeY && mouseY <= nodeY + rect.height) {
      const nodeId = nodeEl.id.replace('node-', '');
      const foundNode = planDesignerState.nodes.find(n => n.id === nodeId);
      
      // Don't highlight source node
      if (foundNode && foundNode.id !== planDesignerState.connectionSource.id) {
        targetNode = foundNode;
      }
      break;
    }
  }
  
  // Remove previous target highlight
  if (planDesignerState.connectionTarget) {
    removeConnectionTargetHighlight(planDesignerState.connectionTarget);
  }
  
  // Add new target highlight
  if (targetNode) {
    addConnectionTargetHighlight(targetNode);
    planDesignerState.connectionTarget = targetNode;
  } else {
    planDesignerState.connectionTarget = null;
  }
}

function addConnectionTargetHighlight(node) {
  // Apply highlight in both canvases to avoid ID collision issues
  const normalNodeElement = document.querySelector('#plan-canvas #node-' + node.id);
  const fullscreenNodeElement = document.querySelector('#fullscreen-plan-canvas #node-' + node.id);
  [normalNodeElement, fullscreenNodeElement].forEach(nodeElement => {
    if (nodeElement) {
      nodeElement.style.borderColor = '#3b82f6';
      nodeElement.style.borderWidth = '3px';
      nodeElement.style.boxShadow = '0 0 10px 2px rgba(59, 130, 246, 0.3)';
    }
  });
}

function removeConnectionTargetHighlight(node) {
  const normalNodeElement = document.querySelector('#plan-canvas #node-' + node.id);
  const fullscreenNodeElement = document.querySelector('#fullscreen-plan-canvas #node-' + node.id);
  [normalNodeElement, fullscreenNodeElement].forEach(nodeElement => {
    if (nodeElement) {
      nodeElement.style.borderColor = '';
      nodeElement.style.borderWidth = '2px';
      nodeElement.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
    }
  });
}

function resetConnectionState() {
  planDesignerState.isConnecting = false;
  planDesignerState.connectionSource = null;
  
  if (planDesignerState.hoveredNode) {
    removeNodeHoverEffect(planDesignerState.hoveredNode);
  }
  planDesignerState.hoveredNode = null;
  
  if (planDesignerState.connectionTarget) {
    removeConnectionTargetHighlight(planDesignerState.connectionTarget);
  }
  planDesignerState.connectionTarget = null;
  
  document.body.style.cursor = 'default';
  const normalCanvas = document.getElementById('plan-canvas');
  const fullscreenCanvas = document.getElementById('fullscreen-plan-canvas');
  
  if (normalCanvas) normalCanvas.style.cursor = 'default';
  if (fullscreenCanvas) fullscreenCanvas.style.cursor = 'default';
}

export function handleOperationDragStart(event, operationId) {
  if (planDesignerState.readOnly) { event.preventDefault(); return; }
  planDesignerState.draggedOperation = operationId;
  event.dataTransfer.effectAllowed = 'copy';
}

export function handleCanvasDragOver(event) {
  event.preventDefault();
  event.dataTransfer.dropEffect = 'copy';
}

export function handleCanvasDrop(event) {
  if (planDesignerState.readOnly) { event.preventDefault(); return; }
  event.preventDefault();
  if (!planDesignerState.draggedOperation) return;

  // Determine which canvas is active
  const canvas = planDesignerState.isFullscreen ? 
    document.getElementById('fullscreen-plan-canvas') : 
    document.getElementById('plan-canvas');
    
  if (!canvas) return;
  
  const rect = canvas.getBoundingClientRect();
  let x = event.clientX - rect.left - 80;
  let y = event.clientY - rect.top - 40;

  // If fullscreen canvas, adjust for transform
  if (planDesignerState.isFullscreen) {
    const transform = canvas.style.transform;
    
    if (transform && transform !== 'none') {
      // Parse scale from transform
      const scaleMatch = transform.match(/scale\(([^)]+)\)/);
      const scale = scaleMatch ? parseFloat(scaleMatch[1]) : 1;
      
      // Parse translate from transform
      const translateMatch = transform.match(/translate\(([^,]+)px[^,]*,\s*([^)]+)px\)/);
      const translateX = translateMatch ? parseFloat(translateMatch[1]) : 0;
      const translateY = translateMatch ? parseFloat(translateMatch[2]) : 0;
      
      // Adjust drop coordinates for transform (same logic as hover)
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;
      
      // Undo translate
      x = x - translateX;
      y = y - translateY;
      
      // Undo scale around center
      x = (x - centerX) / scale + centerX;
      y = (y - centerY) / scale + centerY;
      
      console.log('Adjusted drop coordinates:', { x, y, scale, translateX, translateY });
    }
  }

  // Get operations from state
  const operation = planDesignerState.availableOperations.find(op => op.id === planDesignerState.draggedOperation);
  if (!operation) {
    console.warn('Operation not found:', planDesignerState.draggedOperation);
    return;
  }

  const nodeId = planDesignerState.nodeIdCounter++;
  const newNode = {
    id: nodeId,
    operationId: operation.id,
    name: operation.name,
    type: operation.type,
    time: operation.time,
    skills: operation.skills,
    // Scheduling and material fields
    predecessors: [],
    // Optional logical successors; not required for scheduling but useful
    // successors: [],
    rawMaterials: [],
    semiCode: null,
    x: Math.max(0, x),
    y: Math.max(0, y),
    connections: [],
    assignedWorker: null,
    assignedStation: null
  };
  
  console.log('Adding new node:', newNode);
  planDesignerState.nodes.push(newNode);
  
  // Render appropriate canvas
  if (planDesignerState.isFullscreen) {
    console.log('Rendering fullscreen canvas');
    renderCanvasContent(canvas);
  } else {
    console.log('Rendering normal canvas');
    renderCanvas();
  }
  
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

export function renderNode(node, targetCanvas = null) {
  const canvas = targetCanvas || document.getElementById('plan-canvas');
  if (!canvas) return;
  const colors = { 'Machining': '#3b82f6', 'Welding': '#ef4444', 'Quality': '#10b981', 'Assembly': '#8b5cf6', 'Packaging': '#f97316', 'Treatment': '#06b6d4', 'Finishing': '#ec4899' };
  const nodeElement = document.createElement('div');
  nodeElement.className = 'canvas-node';
  nodeElement.id = 'node-' + node.id;
  nodeElement.style.cssText = [
    'position: absolute;', `left: ${node.x}px;`, `top: ${node.y}px;`, 'width: 160px;', 'min-height: 80px;', 'background: white;',
    `border: 2px solid ${colors[node.type] || '#6b7280'};`, 'border-radius: 8px;', 'padding: 8px;', `cursor: ${planDesignerState.readOnly ? 'default' : 'move'};`,
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
  const actionsHtml = planDesignerState.readOnly ? '' : [
    '<div style="display: flex; gap: 2px;">',
    `<button onclick="event.stopPropagation(); editNode('${node.id}')" style="width: 20px; height: 20px; border: none; background: #f3f4f6; border-radius: 3px; cursor: pointer; font-size: 10px;">✏️</button>`,
    `<button onclick="event.stopPropagation(); deleteNode('${node.id}')" style="width: 20px; height: 20px; border: none; background: #fee2e2; border-radius: 3px; cursor: pointer; font-size: 10px;">🗑️</button>`,
    '</div>'
  ].join('');
  nodeElement.innerHTML = [
    '<div style="display: flex; justify-content: between; align-items: flex-start; margin-bottom: 4px;">',
    `<div class="drag-handle" style="font-weight: 600; font-size: 14px; color: ${colors[node.type] || '#6b7280'}; flex: 1; cursor: ${planDesignerState.readOnly ? 'default' : 'move'}; padding: 2px;">🔸 ${node.name}</div>`,
    actionsHtml,
    '</div>',
    `<div style="font-size: 11px; color: #6b7280; margin-bottom: 2px;">Type: ${node.type}</div>`,
    `<div style=\"font-size: 11px; color: #6b7280; margin-bottom: 2px;\">⏱️ ${node.time} min</div>`,
    `<div style=\"font-size: 10px; color: #9ca3af;\">Worker: ${node.assignedWorker || 'Not assigned'}<br>Station: ${node.assignedStation || 'Not assigned'}<br>Materials: ${matSummary}</div>`
  ].join('');

  // Use global drag state instead of local variables
  nodeElement.onmousedown = (e) => {
    if (planDesignerState.readOnly) return;
    if (e.target.closest('button')) return;
    if (planDesignerState.connectMode) { handleNodeClick(node.id); return; }
    
    // Only handle drag if we're directly on the node (not in connection zone)
    if (!planDesignerState.hoveredNode) {
      // Set global drag state
      planDesignerState.isDragging = true;
      planDesignerState.draggedNode = node;
      planDesignerState.dragStartX = e.clientX;
      planDesignerState.dragStartY = e.clientY;
      planDesignerState.nodeStartX = node.x;
      planDesignerState.nodeStartY = node.y;
      
      const nodeElement = document.getElementById('node-' + node.id);
      if (nodeElement) {
        nodeElement.style.zIndex = '20';
        nodeElement.style.transform = 'scale(1.05)';
      }
      e.preventDefault();
    }
  };
  
  nodeElement.onclick = (e) => { 
    e.stopPropagation(); 
    if (planDesignerState.readOnly) {
      // Show details in read-only mode using the same modal but disable controls
      try { editNode(node.id); setTimeout(() => makeEditModalReadOnly(), 0); } catch {}
      return;
    }
    if (!planDesignerState.isDragging) handleNodeClick(node.id); 
  };
  canvas.appendChild(nodeElement);
}

export function renderConnection(fromNode, toNode, targetCanvas = null) {
  const canvas = targetCanvas || document.getElementById('plan-canvas');
  if (!canvas) return;
  const connectionId = 'connection-' + fromNode.id + '-' + toNode.id;
  const container = document.createElement('div');
  container.className = 'connection-container';
  container.id = connectionId; 
  container.style.cssText = 'position: absolute; z-index: 5;';
  
  const fromX = fromNode.x + 80; const fromY = fromNode.y + 40; 
  const toX = toNode.x + 80; const toY = toNode.y + 40;
  const length = Math.sqrt(Math.pow(toX - fromX, 2) + Math.pow(toY - fromY, 2));
  const angle = Math.atan2(toY - fromY, toX - fromX) * 180 / Math.PI;

  const line = document.createElement('div');
  line.className = 'connection-line';
  line.style.cssText = `position:absolute; left:${fromX}px; top:${fromY}px; width:${length}px; height:8px; background:transparent; transform-origin: 0 0; transform: rotate(${angle}deg); cursor: pointer;`;
  
  // Visible line inside the clickable area
  const visibleLine = document.createElement('div');
  visibleLine.style.cssText = `position:absolute; top:3px; left:0; width:100%; height:2px; background:#9ca3af; pointer-events: none;`;
  line.appendChild(visibleLine);

  const middleArrow = document.createElement('div');
  const middleX = fromX + (toX - fromX) / 2; const middleY = fromY + (toY - fromY) / 2;
  middleArrow.className = 'middle-arrow';
  middleArrow.style.cssText = `position:absolute; left:${middleX - 4}px; top:${middleY - 4}px; width:0; height:0; border-left:8px solid #6b7280; border-top:4px solid transparent; border-bottom:4px solid transparent; transform: rotate(${angle}deg); pointer-events: none; cursor: pointer;`;

  const arrowHead = document.createElement('div');
  arrowHead.className = 'arrow-head';
  // Arrow head should be at the exact end of the line, positioned correctly
  const arrowX = fromX + Math.cos(angle * Math.PI / 180) * length;
  const arrowY = fromY + Math.sin(angle * Math.PI / 180) * length;
  arrowHead.style.cssText = `position:absolute; left:${arrowX - 6}px; top:${arrowY - 6}px; width:0; height:0; border-left:12px solid #6b7280; border-top:6px solid transparent; border-bottom:6px solid transparent; transform: rotate(${angle}deg); pointer-events: none; cursor: pointer;`;

  // In view mode, do not show pointer cursor on connection parts
  if (planDesignerState.readOnly) {
    line.style.cursor = 'default';
    middleArrow.style.cursor = 'default';
    arrowHead.style.cursor = 'default';
  }

  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'connection-delete-btn';
  deleteBtn.innerHTML = '🗑️';
  deleteBtn.style.cssText = `position:absolute; left:${middleX - 12}px; top:${middleY - 12}px; width:24px; height:24px; border:2px solid white; border-radius:50%; background:#ef4444; color:white; cursor:pointer; opacity:0; pointer-events:none; transition: all 0.2s ease; box-shadow: 0 2px 4px rgba(0,0,0,0.2);`;

  if (!planDesignerState.readOnly) {
    const showDeleteBtn = () => { 
      deleteBtn.style.opacity = '1'; 
      deleteBtn.style.pointerEvents = 'auto';
      deleteBtn.style.transform = 'scale(1.1)';
    };
    const hideDeleteBtn = () => { 
      deleteBtn.style.opacity = '0'; 
      deleteBtn.style.pointerEvents = 'none'; 
      deleteBtn.style.transform = 'scale(1)';
    };
    // Hover events for line and arrows
    [line, middleArrow, arrowHead].forEach(el => { 
      el.onmouseenter = showDeleteBtn; 
      el.onmouseleave = hideDeleteBtn; 
    });
    deleteBtn.onmouseenter = showDeleteBtn; 
    deleteBtn.onmouseleave = hideDeleteBtn;
    deleteBtn.onclick = (e) => {
      e.stopPropagation();
      deleteConnection(fromNode.id, toNode.id);
    };
  } else {
    // In view mode, do not display or enable the delete control
    deleteBtn.style.display = 'none';
  }

  container.appendChild(line); 
  container.appendChild(middleArrow); 
  container.appendChild(arrowHead); 
  container.appendChild(deleteBtn);
  canvas.appendChild(container);
}

export function updateConnectionsForNode(nodeId) {
  // Determine which canvas is active
  const canvas = planDesignerState.isFullscreen ? 
    document.getElementById('fullscreen-plan-canvas') : 
    document.getElementById('plan-canvas');
    
  if (!canvas) return;
  
  const existing = canvas.querySelectorAll('.connection-container');
  existing.forEach(el => el.remove());
  
  planDesignerState.nodes.forEach(node => {
    node.connections.forEach(targetId => {
      const targetNode = planDesignerState.nodes.find(n => n.id === targetId);
      if (targetNode) {
        renderConnection(node, targetNode, canvas);
      }
    });
  });
}

export function deleteConnection(fromNodeId, toNodeId) {
  if (planDesignerState.readOnly) { showToast('Read-only mode', 'info'); return; }
  const fromNode = planDesignerState.nodes.find(n => n.id === fromNodeId);
  const toNode = planDesignerState.nodes.find(n => n.id === toNodeId);
  if (fromNode) {
    fromNode.connections = fromNode.connections.filter(id => id !== toNodeId);
  }
  if (toNode) {
    // Remove scheduling dependency
    if (Array.isArray(toNode.predecessors)) {
      toNode.predecessors = toNode.predecessors.filter(pid => pid !== fromNodeId);
    }
    // Remove auto-propagated material
    if (Array.isArray(toNode.rawMaterials)) {
      toNode.rawMaterials = toNode.rawMaterials.filter(m => !(m && m.derivedFrom === fromNodeId));
      toNode.rawMaterial = toNode.rawMaterials.length ? { ...toNode.rawMaterials[0] } : null;
    }
  }
  
  // Render appropriate canvas
  if (planDesignerState.isFullscreen) {
    const fullscreenCanvas = document.getElementById('fullscreen-plan-canvas');
    if (fullscreenCanvas) renderCanvasContent(fullscreenCanvas);
  } else {
    renderCanvas();
  }
  
  showToast('Connection deleted', 'success');
}

export function handleNodeClick(nodeId) {
  if (planDesignerState.readOnly) { return; }
  if (planDesignerState.connectMode) {
    if (planDesignerState.connectingFrom === null) {
      planDesignerState.connectingFrom = nodeId;
      // Set source for hover/highlight feedback in connect mode
      planDesignerState.connectionSource = planDesignerState.nodes.find(n => n.id === nodeId) || null;
      showToast('Select target operation to connect', 'info');
    } else if (planDesignerState.connectingFrom !== nodeId) {
      connectNodes(planDesignerState.connectingFrom, nodeId);
      // Keep connect mode active for chaining? If desired, comment next line to keep mode.
      planDesignerState.connectingFrom = null; planDesignerState.connectMode = false; updateConnectButton();
      // Clear temporary source and any target highlight
      planDesignerState.connectionSource = null;
      if (planDesignerState.connectionTarget) {
        removeConnectionTargetHighlight(planDesignerState.connectionTarget);
        planDesignerState.connectionTarget = null;
      }
    }
  }
}

export function connectNodes(fromId, toId) {
  if (planDesignerState.readOnly) { showToast('Read-only mode', 'info'); return; }
  const fromNode = planDesignerState.nodes.find(n => n.id === fromId);
  const toNode = planDesignerState.nodes.find(n => n.id === toId);
  if (fromNode && toNode && !fromNode.connections.includes(toId)) {
    // Graph edge (from -> to)
    fromNode.connections.push(toId);
    // Scheduling dependency: to cannot start before from completes
    if (!Array.isArray(toNode.predecessors)) toNode.predecessors = [];
    if (!toNode.predecessors.includes(fromId)) toNode.predecessors.push(fromId);

    // Material propagation: from's output becomes default raw material of to
    if (!Array.isArray(toNode.rawMaterials)) toNode.rawMaterials = [];
    const existingIdx = toNode.rawMaterials.findIndex(m => m && (m.derivedFrom === fromId || m.id === `node-${fromId}-output`));
    if (existingIdx === -1) {
      const autoMat = {
        id: fromNode.semiCode || `node-${fromId}-output`,
        name: fromNode.semiCode ? `${fromNode.semiCode}` : `${fromNode.name} (semi)`,
        qty: (typeof fromNode.outputQty === 'number' && Number.isFinite(fromNode.outputQty)) ? fromNode.outputQty : null,
        unit: fromNode.outputUnit || '',
        derivedFrom: fromId
      };
      toNode.rawMaterials.push(autoMat);
      // Keep legacy rawMaterial for compatibility with older summaries
      toNode.rawMaterial = toNode.rawMaterials.length ? { ...toNode.rawMaterials[0] } : null;
    }

    // Render appropriate canvas
    if (planDesignerState.isFullscreen) {
      const fullscreenCanvas = document.getElementById('fullscreen-plan-canvas');
      if (fullscreenCanvas) renderCanvasContent(fullscreenCanvas);
    } else {
      renderCanvas();
    }
    
    showToast('Operations connected', 'success');
  }
}

export function toggleConnectMode() {
  if (planDesignerState.readOnly) { showToast('Read-only mode', 'info'); return; }
  planDesignerState.connectMode = !planDesignerState.connectMode;
  planDesignerState.connectingFrom = null;
  // Clear any pending target highlight
  if (planDesignerState.connectionTarget) {
    removeConnectionTargetHighlight(planDesignerState.connectionTarget);
    planDesignerState.connectionTarget = null;
  }
  updateConnectButton();
  updateCanvasCursor();
  if (planDesignerState.connectMode) {
    showToast('Connect mode active. Click source operation, then target operation.', 'info');
  }
}

function updateCanvasCursor() {
  const fullscreenCanvas = document.getElementById('fullscreen-plan-canvas');
  if (fullscreenCanvas) {
    if (planDesignerState.connectMode) {
      fullscreenCanvas.style.cursor = 'crosshair';
    } else {
      fullscreenCanvas.style.cursor = 'grab';
    }
  }
}

export function updateConnectButton() {
  const btn = document.getElementById('connect-mode-btn');
  const fullscreenBtn = document.getElementById('fullscreen-connect-mode-btn');
  
  if (btn) {
    btn.style.background = planDesignerState.connectMode ? 'var(--primary)' : 'white';
    btn.style.color = planDesignerState.connectMode ? 'white' : 'black';
    btn.innerHTML = planDesignerState.connectMode ? '🔗 Connecting...' : '🔗 Connect';
  }
  
  if (fullscreenBtn) {
    fullscreenBtn.style.background = planDesignerState.connectMode ? 'var(--primary)' : 'white';
    fullscreenBtn.style.color = planDesignerState.connectMode ? 'white' : 'black';
    fullscreenBtn.innerHTML = planDesignerState.connectMode ? '🔗 Connecting...' : '🔗 Connect';
  }
  
  // Update canvas cursor based on mode
  updateCanvasCursor();
}

export function clearCanvas() {
  if (planDesignerState.readOnly) { showToast('Read-only mode', 'info'); return; }
  if (planDesignerState.nodes.length === 0) { 
    showToast('Canvas is already empty', 'info'); 
    return; 
  }
  if (confirm('Are you sure you want to clear all operations?')) {
    planDesignerState.nodes = []; 
    planDesignerState.connectMode = false; 
    planDesignerState.connectingFrom = null; 
    updateConnectButton(); 
    updateCanvasCursor(); 
    
    // Clear both canvases
    if (planDesignerState.isFullscreen) {
      const fullscreenCanvas = document.getElementById('fullscreen-plan-canvas');
      if (fullscreenCanvas) renderCanvasContent(fullscreenCanvas);
    } else {
      renderCanvas();
    }
    
    showToast('Canvas cleared', 'success');
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
    // Populate output code preview in footer label if exists
    try {
      const label = document.getElementById('node-output-code-label');
      if (label) {
        const preview = node.semiCode || getSemiCodePreview(node, planDesignerState.availableOperations || [], []);
        if (preview) {
          label.textContent = `Output: ${preview}`;
        } else {
          const prefix = getPrefixForNode(node, planDesignerState.availableOperations || [], []);
          label.textContent = prefix ? `Output: ${prefix}-` : 'Output: —';
        }
      }
      const qtyEl = document.getElementById('edit-output-qty');
      const unitEl = document.getElementById('edit-output-unit');
      if (qtyEl) qtyEl.value = node.outputQty != null ? String(node.outputQty) : '';
      if (unitEl) populateUnitSelect(unitEl, node.outputUnit || '');
    } catch {}
    
    // Add escape key listener
    modalEscapeHandler = (e) => {
      if (e.key === 'Escape') {
        closeNodeEditModal()
      }
    }
    document.addEventListener('keydown', modalEscapeHandler)
  }
}

function makeEditModalReadOnly() {
  try {
    const form = document.getElementById('node-edit-form');
    if (!form) return;
    form.querySelectorAll('input, select, textarea, button').forEach(el => {
      if (el.closest('[id="node-edit-form"]')) {
        if (el.tagName.toLowerCase() === 'button') return; // leave modal close/save; hide save below
        el.setAttribute('disabled', 'disabled');
      }
    });
    // Hide Save button, keep Cancel
    const footer = document.querySelector('#node-edit-modal [onclick="saveNodeEdit()"]');
    if (footer) footer.style.display = 'none';
    // Also disable footer output controls (outside node-edit-form)
    const qtyEl = document.getElementById('edit-output-qty');
    const unitEl = document.getElementById('edit-output-unit');
    if (qtyEl) {
      qtyEl.setAttribute('disabled', 'disabled');
      qtyEl.style.background = '#f3f4f6';
      qtyEl.style.color = '#6b7280';
    }
    if (unitEl) {
      unitEl.setAttribute('disabled', 'disabled');
      unitEl.style.background = '#f3f4f6';
      unitEl.style.color = '#6b7280';
    }
  } catch {}
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
  if (planDesignerState.readOnly) { showToast('Read-only mode', 'info'); return; }
  if (!planDesignerState.selectedNode) return;
  const name = document.getElementById('edit-name').value;
  const time = parseInt(document.getElementById('edit-time').value);
  const worker = document.getElementById('edit-worker').value;
  const station = document.getElementById('edit-station').value;
  const outQtyVal = document.getElementById('edit-output-qty')?.value;
  const outUnit = document.getElementById('edit-output-unit')?.value || '';
  if (!name || !time || time < 1) { showToast('Please fill all required fields', 'error'); return; }
  planDesignerState.selectedNode.name = name;
  planDesignerState.selectedNode.time = time;
  planDesignerState.selectedNode.assignedWorker = worker || null;
  planDesignerState.selectedNode.assignedStation = station || null;
  const outQtyNum = outQtyVal === '' ? null : parseFloat(outQtyVal);
  planDesignerState.selectedNode.outputQty = Number.isFinite(outQtyNum) ? outQtyNum : null;
  planDesignerState.selectedNode.outputUnit = (outUnit || '').trim();
  try { computeAndAssignSemiCode(planDesignerState.selectedNode, planDesignerState.availableOperations || [], []); } catch {}
  try {
    if (planDesignerState.selectedNode.semiCode) {
      getStations().then(sts => upsertProducedWipFromNode(planDesignerState.selectedNode, planDesignerState.availableOperations || [], sts)).catch(()=>{})
    }
  } catch {}
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
    // Remove the node itself
    planDesignerState.nodes = planDesignerState.nodes.filter(n => n.id !== nodeId);
    // Clean up edges, scheduling deps and auto-materials in remaining nodes
    planDesignerState.nodes.forEach(node => {
      // Outgoing edges
      node.connections = (node.connections || []).filter(connId => connId !== nodeId);
      // Scheduling predecessors
      if (Array.isArray(node.predecessors)) {
        node.predecessors = node.predecessors.filter(pid => pid !== nodeId);
      }
      // Auto-propagated materials that originated from the deleted node
      if (Array.isArray(node.rawMaterials)) {
        node.rawMaterials = node.rawMaterials.filter(m => !(m && m.derivedFrom === nodeId));
        node.rawMaterial = node.rawMaterials.length ? { ...node.rawMaterials[0] } : null;
      }
    });
    
    // Render appropriate canvas
    if (planDesignerState.isFullscreen) {
      const fullscreenCanvas = document.getElementById('fullscreen-plan-canvas');
      if (fullscreenCanvas) renderCanvasContent(fullscreenCanvas);
    } else {
      renderCanvas();
    }
    
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
  const planNameInput = document.getElementById('plan-name');
  const planDescInput = document.getElementById('plan-description');
  const orderSelect = document.getElementById('order-select');
  const scheduleTypeSelect = document.getElementById('schedule-type');
  
  let planName = planNameInput ? planNameInput.value : '';
  const planDesc = planDescInput?.value || '';
  let orderCode = orderSelect ? orderSelect.value : '';
  const scheduleType = scheduleTypeSelect ? scheduleTypeSelect.value : 'one-time';
  
  if (planDesignerState.readOnly) {
    const base = (planDesignerState.currentPlanMeta?.name) || planName || 'Untitled';
    planName = `${base} - kopyası`;
    // Copying from a production plan: clear order linkage for the template
    orderCode = '';
  }
  if (!planName) { showToast('Please enter a plan name', 'error'); return; }
  
  // If editing from an existing template, keep the same id to update and track lastModifiedBy
  const existingTplId = planDesignerState.currentPlanMeta?.sourceTemplateId || null;
  const template = {
    id: existingTplId || undefined,
    name: planName,
    description: planDesc,
    orderCode: orderCode,
    scheduleType: scheduleType,
    steps: JSON.parse(JSON.stringify(planDesignerState.nodes)),
    createdAt: new Date().toISOString(),
    status: 'template'
  };
  
  // Debug: Log the template object being saved
  console.log('🔍 TEMPLATE BEING SAVED:', {
    orderCode: template.orderCode,
    scheduleType: template.scheduleType,
    name: template.name,
    description: template.description,
    status: template.status,
    fullTemplate: template
  });
  // If no existing template id, generate a new one; otherwise update existing via POST /templates (merge)
  const ensureId = template.id 
    ? Promise.resolve(template.id)
    : getNextProductionPlanId().then((newId) => { template.id = newId || genId('plan-'); return template.id })

  ensureId
    .then(() => createTemplate(template))
    .catch(() => {
      // As an extra fallback, still try to save with a local id
      template.id = template.id || genId('tpl-');
      return createTemplate(template)
    })
    .then(() => {
      const msg = existingTplId
        ? `Template updated: ${template.name}`
        : (planDesignerState.readOnly ? `Copied to template: ${template.name}` : `Template saved: ${template.name}`);
      showToast(msg, 'success');
      // Exit to list and reload strictly from backend to avoid stale DOM
      // Reset graph only when not in view-copy flow (optional)
      if (!planDesignerState.readOnly) {
        planDesignerState.nodes = [];
        renderCanvas();
      }
      cancelPlanCreation();
      setActivePlanTab('templates');
      try { if (typeof window.loadAndRenderPlans === 'function') window.loadAndRenderPlans(); } catch {}
    })
    .catch(e => {
      console.error('Template save failed', e);
      showToast('Template save failed', 'error');
    });
}

export function savePlanDraft() {
  if (planDesignerState.nodes.length === 0) { showToast('Cannot save empty plan', 'error'); return; }
  const planName = document.getElementById('plan-name')?.value || 'Untitled';
  const planDesc = document.getElementById('plan-description')?.value || '';
  const orderCode = document.getElementById('order-select')?.value || '';
  const scheduleType = document.getElementById('schedule-type')?.value || 'one-time';
  const meta = planDesignerState.currentPlanMeta || {};
  const isFromTemplate = (meta.status === 'template' && meta.sourceTemplateId);
  if (isFromTemplate) {
    const id = meta.sourceTemplateId;
    const updates = {
      name: planName,
      description: planDesc,
      orderCode,
      scheduleType,
      nodes: JSON.parse(JSON.stringify(planDesignerState.nodes)),
      status: 'production'
    };
    updateProductionPlan(id, updates)
      .then(() => {
        showToast(`Plan converted to production: ${planName}`, 'success');
        planDesignerState.nodes = [];
        renderCanvas();
        cancelPlanCreation();
        setActivePlanTab('production');
        try { if (typeof window.loadAndRenderPlans === 'function') window.loadAndRenderPlans(); } catch {}
      })
      .catch(e => {
        console.error('Plan conversion failed', e);
        showToast('Plan conversion failed', 'error');
      });
    return;
  }

  const plan = {
    id: undefined,
    name: planName,
    description: planDesc,
    orderCode,
    scheduleType,
    nodes: JSON.parse(JSON.stringify(planDesignerState.nodes)),
    createdAt: new Date().toISOString(),
    status: 'production'
  };
  getNextProductionPlanId()
    .then((newId) => { plan.id = newId || genId('plan-'); return createProductionPlan(plan) })
    .catch(() => {
      plan.id = plan.id || genId('plan-');
      return createProductionPlan(plan)
    })
    .then(() => {
      showToast(`Plan saved: ${plan.name}`, 'success');
      planDesignerState.nodes = [];
      renderCanvas();
      cancelPlanCreation();
      setActivePlanTab('production');
      try { if (typeof window.loadAndRenderPlans === 'function') window.loadAndRenderPlans(); } catch {}
    })
    .catch(e => {
      console.error('Plan save failed', e);
      showToast('Plan save failed', 'error');
    });
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
  if (planDesignerState.connectMode && (event.target.id === 'plan-canvas' || event.target.id === 'fullscreen-plan-canvas')) {
    planDesignerState.connectMode = false; planDesignerState.connectingFrom = null; updateConnectButton(); showToast('Connect mode cancelled', 'info');
    // Clear any target highlight
    if (planDesignerState.connectionTarget) {
      removeConnectionTargetHighlight(planDesignerState.connectionTarget);
      planDesignerState.connectionTarget = null;
    }
    planDesignerState.connectionSource = null;
  }
}

export function initializePlanDesigner() {
  setTimeout(() => {
    loadOperationsToolbox();
    renderCanvas();
    
    // Load orders into the dropdown
    loadOrdersIntoSelect();
    
    handleScheduleTypeChange();

    // Wire dropdowns programmatically (we removed inline onclick in views)
    try { wirePlanDropdownsOnce(); } catch {}
    // Pre-render order list from select for immediate interaction
    try { renderPlanOrderListFromSelect(); } catch {}
    
    // Initialize order/type dropdown button labels from hidden selects
    try {
      const orderSelect = document.getElementById('order-select');
      const orderLabel = document.getElementById('plan-order-label');
      const selOpt = orderSelect && orderSelect.options ? orderSelect.options[orderSelect.selectedIndex] : null;
      if (orderLabel) orderLabel.textContent = selOpt && selOpt.value ? (selOpt.text || selOpt.value) : 'Select an order...';
    } catch {}
    try {
      const typeSelect = document.getElementById('schedule-type');
      const typeLabel = document.getElementById('plan-type-label');
      const val = typeSelect ? typeSelect.value : 'one-time';
      if (typeLabel) typeLabel.textContent = val === 'recurring' ? 'Devirli' : 'Tek seferlik';
    } catch {}
  }, 100);
}

let _dropdownsWired = false;
function wirePlanDropdownsOnce() {
  if (_dropdownsWired) return; _dropdownsWired = true;
  const orderBtn = document.getElementById('plan-order-btn');
  const orderPanel = document.getElementById('plan-order-panel');
  const orderSearch = document.getElementById('plan-order-search');
  const orderClear = document.getElementById('plan-order-clear');
  const orderClose = document.getElementById('plan-order-close');
  const typeBtn = document.getElementById('plan-type-btn');
  const typePanel = document.getElementById('plan-type-panel');
  const typeClear = document.getElementById('plan-type-clear');
  const typeClose = document.getElementById('plan-type-close');

  if (orderBtn) orderBtn.addEventListener('click', togglePlanOrderPanel);
  if (orderSearch) orderSearch.addEventListener('input', filterPlanOrderList);
  if (orderClear) orderClear.addEventListener('click', clearPlanOrder);
  if (orderClose) orderClose.addEventListener('click', hidePlanOrderPanel);

  if (typeBtn) typeBtn.addEventListener('click', togglePlanTypePanel);
  if (typeClear) typeClear.addEventListener('click', () => selectPlanType('one-time', 'Tek seferlik'));
  if (typeClose) typeClose.addEventListener('click', hidePlanTypePanel);

  // Attach change listeners to type radios
  if (typePanel) {
    typePanel.addEventListener('change', (e) => {
      const t = e.target;
      if (t && t.name === 'plan-type-radio') {
        const val = t.value;
        selectPlanType(val, val === 'recurring' ? 'Devirli' : 'Tek seferlik');
      }
    });
  }

  // Click-outside to close panels
  document.addEventListener('click', (e) => {
    const target = e.target;
    if (orderPanel && orderPanel.style.display === 'block') {
      if (!orderPanel.contains(target) && target !== orderBtn && !orderBtn.contains(target)) {
        hidePlanOrderPanel();
      }
    }
    if (typePanel && typePanel.style.display === 'block') {
      if (!typePanel.contains(target) && target !== typeBtn && !typeBtn.contains(target)) {
        hidePlanTypePanel();
      }
    }
  });
  // ESC to close
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { hidePlanOrderPanel(); hidePlanTypePanel(); }
  });
}

// Plan Order dropdown (button + panel) helpers
export function togglePlanOrderPanel() {
  console.warn('DEBUG: togglePlanOrderPanel function was successfully called!');
  console.log('togglePlanOrderPanel called');
  const now = Date.now();
  if (now - (planDesignerState._orderPanelLastToggle || 0) < 150) { console.log('debounced order panel toggle'); return; }
  planDesignerState._orderPanelLastToggle = now;
  
  const panel = document.getElementById('plan-order-panel');
  const button = document.getElementById('plan-order-btn');
  console.log('panel found:', panel);
  
  if (!panel || !button) return;
  
  renderPlanOrderListFromSelect();
  
  const isOpen = (typeof window !== 'undefined' ? window.getComputedStyle(panel).display : panel.style.display) !== 'none';
  console.log('isOpen:', isOpen, 'current display:', panel.style.display);
  
  if (isOpen) {
    panel.style.display = 'none';
  } else {
    // Force positioning and visibility
    const buttonRect = button.getBoundingClientRect();
    panel.style.position = 'fixed';
    panel.style.top = (buttonRect.bottom + 6) + 'px';
    panel.style.left = (buttonRect.right - 360) + 'px';
    panel.style.zIndex = '9999';
    panel.style.display = 'block';
    panel.style.visibility = 'visible';
    panel.style.opacity = '1';
    console.log('Panel positioned at:', {
      top: panel.style.top,
      left: panel.style.left,
      display: panel.style.display
    });
  }
  
  console.log('new display:', panel.style.display);
  
  // Hide the other panel to avoid overlaps
  if (panel.style.display === 'block') {
    const other = document.getElementById('plan-type-panel');
    if (other) other.style.display = 'none';
  }
}

export function hidePlanOrderPanel() { const p = document.getElementById('plan-order-panel'); if (p) p.style.display = 'none'; }

export function clearPlanOrder() {
  const sel = document.getElementById('order-select');
  const label = document.getElementById('plan-order-label');
  if (sel) sel.value = '';
  if (label) label.textContent = 'Select an order...';
  hidePlanOrderPanel();
  // Trigger change handler to clear dependent UI
  try { if (typeof window.handleOrderChange === 'function') window.handleOrderChange(); } catch {}
}

export function filterPlanOrderList() {
  const q = (document.getElementById('plan-order-search')?.value || '').toLowerCase();
  const items = document.querySelectorAll('#plan-order-list label');
  items.forEach(lab => { const t = lab.textContent?.toLowerCase() || ''; lab.style.display = t.includes(q) ? '' : 'none'; });
}

export function selectPlanOrder(value, labelText) {
  const sel = document.getElementById('order-select');
  const label = document.getElementById('plan-order-label');
  if (sel) sel.value = value;
  if (label) label.textContent = labelText || value;
  hidePlanOrderPanel();
  try { if (typeof window.handleOrderChange === 'function') window.handleOrderChange(); } catch {}
}

export function renderPlanOrderListFromSelect() {
  const list = document.getElementById('plan-order-list');
  const sel = document.getElementById('order-select');
  if (!list || !sel) return;
  const opts = Array.from(sel.options || []);
  const rows = opts
    .filter(o => o.value)
    .map(o => `<label style="display:flex; align-items:center; gap:8px; padding:1.5px 2px; border:1px solid var(--border); border-radius:6px; cursor:pointer; font-size:12px;">
      <input type="radio" name="plan-order-radio" value="${o.value}" data-label="${(o.text||o.value).replace(/"/g, '&quot;')}">
      <span style="font-size:12px;">${o.text || o.value}</span>
    </label>`)
    .join('');
  list.innerHTML = rows || '<div style="color: var(--muted-foreground); font-size: 12px;">No orders</div>';
  
  // Add event listeners to radio buttons
  const radios = list.querySelectorAll('input[type="radio"]');
  radios.forEach(radio => {
    radio.addEventListener('change', function() {
      if (this.checked) {
        selectPlanOrder(this.value, this.dataset.label);
      }
    });
  });
}

// Plan Type dropdown (button + panel) helpers
export function togglePlanTypePanel() {
  console.warn('DEBUG: togglePlanTypePanel function was successfully called!');
  console.log('togglePlanTypePanel called');
  const now = Date.now();
  if (now - (planDesignerState._typePanelLastToggle || 0) < 150) { console.log('debounced type panel toggle'); return; }
  planDesignerState._typePanelLastToggle = now;
  
  const panel = document.getElementById('plan-type-panel');
  const button = document.getElementById('plan-type-btn');
  console.log('plan-type-panel found:', panel);
  
  if (!panel || !button) return;
  
  const isOpen = (typeof window !== 'undefined' ? window.getComputedStyle(panel).display : panel.style.display) !== 'none';
  console.log('isOpen:', isOpen, 'current display:', panel.style.display);
  
  if (isOpen) {
    panel.style.display = 'none';
  } else {
    // Initialize modal state before showing
    initializePlanTypeModal();
    
    // Force positioning and visibility  
    const buttonRect = button.getBoundingClientRect();
    panel.style.position = 'fixed';
    panel.style.top = (buttonRect.bottom + 6) + 'px';
    panel.style.left = (buttonRect.right - 320) + 'px'; // Adjusted for wider modal
    panel.style.zIndex = '9999';
    panel.style.display = 'block';
    panel.style.visibility = 'visible';
    panel.style.opacity = '1';
    console.log('Panel positioned at:', {
      top: panel.style.top,
      left: panel.style.left,
      display: panel.style.display
    });
  }
  
  console.log('new display:', panel.style.display);
  
  if (panel.style.display === 'block') {
    const other = document.getElementById('plan-order-panel');
    if (other) other.style.display = 'none';
  }
}
export function hidePlanTypePanel() { const p = document.getElementById('plan-type-panel'); if (p) p.style.display = 'none'; }
export function clearPlanType() { selectPlanType('one-time', 'Tek seferlik'); }
export function selectPlanType(value, labelText) {
  const sel = document.getElementById('schedule-type');
  const label = document.getElementById('plan-type-label');
  const planTypeButton = document.getElementById('plan-type-btn');
  
  if (sel) sel.value = value;
  if (label) label.textContent = labelText || (value === 'recurring' ? 'Devirli' : 'Tek seferlik');
  
  // Update the plan type button text
  if (planTypeButton) {
    const displayText = labelText || (value === 'recurring' ? 'Devirli' : 'Tek seferlik');
    planTypeButton.innerHTML = `<span>${displayText}</span><svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  }
  
  // Update state
  if (planDesignerState.currentPlanMeta) {
    planDesignerState.currentPlanMeta.scheduleType = value;
  }
  
  // Sync modal radio buttons
  const radioButtons = document.querySelectorAll('input[name="plan-type-radio"]');
  radioButtons.forEach(radio => {
    radio.checked = radio.value === value;
  });
  
  // Only close panel if "Tek seferlik" is selected
  // Keep panel open for "Devirli" so user can fill additional fields
  if (value !== 'recurring') {
    hidePlanTypePanel();
  }
  
  try { if (typeof window.handleScheduleTypeChange === 'function') window.handleScheduleTypeChange(); } catch {}
}

// Fullscreen Canvas Functions
export function toggleCanvasFullscreen() {
  const modal = document.getElementById('canvas-fullscreen-modal');
  const sidebar = document.getElementById('sidebar');
  const mainContent = document.querySelector('.main-content');
  
  if (!modal) return;
  
  const isFullscreen = modal.style.display !== 'none';
  
  if (isFullscreen) {
    // Exit fullscreen
    modal.style.display = 'none';
    if (sidebar) sidebar.style.display = 'block';
    syncCanvasFromFullscreen();
  } else {
    // Enter fullscreen  
    modal.style.display = 'block';
    if (sidebar) sidebar.style.display = 'none';
    syncCanvasToFullscreen();
  }
}

function syncCanvasToFullscreen() {
  // Set fullscreen mode
  planDesignerState.isFullscreen = true;
  
  // Reset zoom to 100% and pan to center
  planDesignerState.fullscreenZoom = 100;
  resetCanvasPan();
  setCanvasZoom(100);
  
  // Set appropriate cursor based on current mode
  updateCanvasCursor();
  
  // Load operations in fullscreen list
  loadOperationsToolbox();
  
  // Render existing nodes in fullscreen canvas
  const fullscreenCanvas = document.getElementById('fullscreen-plan-canvas');
  if (fullscreenCanvas) {
    renderCanvasContent(fullscreenCanvas);
  }
}

function syncCanvasFromFullscreen() {
  // Exit fullscreen mode
  planDesignerState.isFullscreen = false;
  
  // Render nodes back to normal canvas
  const normalCanvas = document.getElementById('plan-canvas');
  if (normalCanvas) {
    renderCanvas(); // Use the existing renderCanvas function for normal mode
  }
}

export function renderCanvasContent(canvasElement) {
  if (!canvasElement) return;
  
  // Clear existing content
  const existingElements = canvasElement.querySelectorAll('.canvas-node, .connection-container');
  existingElements.forEach(element => element.remove());

  // Render connections first
  planDesignerState.nodes.forEach(node => {
    node.connections.forEach(targetId => {
      const targetNode = planDesignerState.nodes.find(n => n.id === targetId);
      if (targetNode) renderConnection(node, targetNode, canvasElement);
    });
  });
  
  // Render nodes using the same renderNode function
  planDesignerState.nodes.forEach(node => renderNode(node, canvasElement));
}

// Make functions globally available
window.toggleCanvasFullscreen = toggleCanvasFullscreen;

// Fullscreen Zoom Functions
export function adjustCanvasZoom(delta) {
  const newZoom = Math.max(30, Math.min(150, planDesignerState.fullscreenZoom + (delta * 100)));
  setCanvasZoom(newZoom);
}

export function setCanvasZoom(zoomValue) {
  const zoom = Math.max(30, Math.min(150, parseFloat(zoomValue)));
  planDesignerState.fullscreenZoom = zoom;
  
  const canvas = document.getElementById('fullscreen-plan-canvas');
  if (canvas) {
    // Set overflow hidden on container and apply transform with proper boundaries
    const container = canvas.parentElement;
    if (container) {
      container.style.overflow = 'hidden';
    }
    
    // Apply both zoom and pan transforms - CONSISTENT ORDER: scale first, then translate
    const scaleTransform = `scale(${zoom / 100})`;
    const translateTransform = `translate(${planDesignerState.panOffsetX}px, ${planDesignerState.panOffsetY}px)`;
    canvas.style.transform = `${scaleTransform} ${translateTransform}`;
    canvas.style.transformOrigin = 'center center';
    
    // Ensure canvas stays within container bounds
    canvas.style.maxWidth = '100%';
    canvas.style.maxHeight = '100%';
  }
  
  // Update UI elements
  const slider = document.getElementById('zoom-slider');
  const percentage = document.getElementById('zoom-percentage');
  
  if (slider) slider.value = zoom;
  if (percentage) percentage.textContent = `${Math.round(zoom)}%`;
}

// Pan functionality for canvas navigation
export function updateCanvasPan() {
  const canvas = document.getElementById('fullscreen-plan-canvas');
  if (canvas) {
    const zoom = planDesignerState.fullscreenZoom / 100;
    const scaleTransform = `scale(${zoom})`;
    const translateTransform = `translate(${planDesignerState.panOffsetX}px, ${planDesignerState.panOffsetY}px)`;
    // Keep transform order consistent with setCanvasZoom: scale first, then translate
    canvas.style.transform = `${scaleTransform} ${translateTransform}`;
    canvas.style.transformOrigin = 'center center';
  }
}

export function resetCanvasPan() {
  planDesignerState.panOffsetX = 0;
  planDesignerState.panOffsetY = 0;
  updateCanvasPan();
}

// Make zoom and pan functions globally available
window.adjustCanvasZoom = adjustCanvasZoom;
window.setCanvasZoom = setCanvasZoom;
window.resetCanvasPan = resetCanvasPan;
// Also expose dropdown helpers to guard against module wiring differences
try {
  Object.assign(window, {
    togglePlanOrderPanel, hidePlanOrderPanel, clearPlanOrder, filterPlanOrderList, selectPlanOrder,
    togglePlanTypePanel, hidePlanTypePanel, clearPlanType, selectPlanType
  });
} catch {}

export function resetPlanDesignerState({ preserveMeta = false } = {}) {
  planDesignerState.nodes = [];
  planDesignerState.nodeIdCounter = 1;
  planDesignerState.draggedOperation = null;
  planDesignerState.selectedNode = null;
  planDesignerState.isDragging = false;
  planDesignerState.draggedNode = null;
  planDesignerState.dragStartX = 0;
  planDesignerState.dragStartY = 0;
  planDesignerState.nodeStartX = 0;
  planDesignerState.nodeStartY = 0;
  planDesignerState.connectMode = false;
  planDesignerState.connectingFrom = null;
  planDesignerState.isConnecting = false;
  planDesignerState.connectionSource = null;
  planDesignerState.connectionTarget = null;
  planDesignerState.hoveredNode = null;
  planDesignerState.isPanning = false;
  planDesignerState.panOffsetX = 0;
  planDesignerState.panOffsetY = 0;
  planDesignerState.isFullscreen = false;
  planDesignerState.fullscreenZoom = 100;
  planDesignerState.readOnly = false;
  resetConnectionState();
  updateConnectButton();
  updateCanvasCursor();

  if (!preserveMeta) {
    planDesignerState.currentPlanMeta = {};
  }

  renderCanvas();
  const fullscreenCanvas = document.getElementById('fullscreen-plan-canvas');
  if (fullscreenCanvas) {
    renderCanvasContent(fullscreenCanvas);
  }

  const modal = document.getElementById('canvas-fullscreen-modal');
  if (modal) modal.style.display = 'none';
  const sidebar = document.getElementById('sidebar');
  if (sidebar) sidebar.style.display = 'block';

  setCanvasZoom(100);
  resetCanvasPan();

  if (!preserveMeta) {
    const planIdElement = document.getElementById('plan-config-id');
    if (planIdElement) {
      planIdElement.textContent = '';
      planIdElement.style.display = 'none';
    }
  }
}

// Public helpers to open plans/templates in designer
function extractNumericSuffix(id) {
  if (id == null) return 0;
  const match = String(id).match(/(\d+)(?!.*\d)/);
  return match ? parseInt(match[1], 10) || 0 : 0;
}

function normalizeIncomingNodes(rawNodes = []) {
  const source = Array.isArray(rawNodes) ? rawNodes : [];
  const cloned = JSON.parse(JSON.stringify(source));
  const usedIds = new Set();
  const remap = new Map();
  let sequentialSeed = 1;
  const duplicateAlerts = [];

  const generateSequentialId = () => {
    let candidate;
    do {
      candidate = `node-${sequentialSeed++}`;
    } while (usedIds.has(candidate));
    return candidate;
  };

  cloned.forEach((node, index) => {
    const preferred = (() => {
      const candidates = [node?.id, node?.nodeId, node?.localId, node?.tempId];
      for (const value of candidates) {
        if (value != null) {
          const str = String(value).trim();
          if (str) return str;
        }
      }
      return '';
    })();

    let assignedId = preferred && !usedIds.has(preferred) ? preferred : '';
    if (!assignedId) {
      assignedId = generateSequentialId();
      if (preferred) {
        duplicateAlerts.push({ original: preferred, reassigned: assignedId });
      }
    } else {
      usedIds.add(assignedId);
    }

    if (!usedIds.has(assignedId)) {
      usedIds.add(assignedId);
    }

    if (preferred) {
      if (!remap.has(preferred)) {
        remap.set(preferred, assignedId);
      }
    }
    remap.set(`__idx_${index}`, assignedId);
    node.id = assignedId;

    node.connections = Array.isArray(node?.connections)
      ? node.connections.filter(Boolean).map(val => String(val).trim())
      : [];
    node.predecessors = Array.isArray(node?.predecessors)
      ? node.predecessors.filter(Boolean).map(val => String(val).trim())
      : [];

    const materials = Array.isArray(node?.rawMaterials)
      ? node.rawMaterials
      : (node?.rawMaterial ? [node.rawMaterial] : []);
    node.rawMaterials = materials.map(mat => ({ ...mat }));
    node.rawMaterial = node.rawMaterials.length ? { ...node.rawMaterials[0] } : null;

    if (!Number.isFinite(node?.x)) {
      node.x = 80 + (index % 6) * 180;
    }
    if (!Number.isFinite(node?.y)) {
      node.y = 80 + Math.floor(index / 6) * 140;
    }
  });

  if (duplicateAlerts.length) {
    console.warn('Plan Designer normalized duplicate/missing node ids', duplicateAlerts);
  }

  const resolveId = (value) => {
    if (value == null) return null;
    const key = String(value).trim();
    if (remap.has(key)) return remap.get(key);
    return usedIds.has(key) ? key : null;
  };

  cloned.forEach(node => {
    node.connections = node.connections.map(resolveId).filter(Boolean);
    node.predecessors = node.predecessors.map(resolveId).filter(Boolean);
    node.rawMaterials = node.rawMaterials.map(mat => ({
      ...mat,
      derivedFrom: resolveId(mat?.derivedFrom)
    }));
    node.rawMaterial = node.rawMaterials.length ? { ...node.rawMaterials[0] } : null;
  });

  let maxNumeric = 0;
  usedIds.forEach(id => {
    const numeric = extractNumericSuffix(id);
    if (numeric > maxNumeric) maxNumeric = numeric;
  });

  const nextCounter = Math.max(maxNumeric + 1, sequentialSeed);
  return { normalizedNodes: cloned, nextCounter };
}

export function loadPlanNodes(nodes = []) {
  const { normalizedNodes, nextCounter } = normalizeIncomingNodes(nodes);
  planDesignerState.nodes = normalizedNodes;
  planDesignerState.nodeIdCounter = nextCounter;
  renderCanvas();
}

export function setReadOnly(flag) {
  planDesignerState.readOnly = !!flag;
  // Clear any pending connection/hover visuals when entering view mode
  if (planDesignerState.readOnly) {
    try { resetConnectionState(); } catch {}
    planDesignerState.connectMode = false;
    planDesignerState.connectingFrom = null;
  }
  updateConnectButton();
  updateCanvasCursor();
  try { 
    // Hide operations panels in view mode
    const ops = document.getElementById('operations-panel');
    if (ops) ops.parentElement && (ops.parentElement.style.display = flag ? 'none' : '');
    const fops = document.getElementById('fullscreen-operations-panel');
    if (fops) fops.style.display = flag ? 'none' : '';
    // Expand canvas grid to full width when ops hidden
    const grid = document.getElementById('plan-workspace-grid');
    if (grid) grid.style.gridTemplateColumns = flag ? '1fr' : '240px 1fr';
    configurePlanActionButtons(); 
    setPlanConfigReadOnly(planDesignerState.readOnly); 
  } catch {}
}

// Set metadata (name, description, order, schedule type) into Plan Configuration UI
export function setPlanMeta(meta = {}) {
  try {
    // Persist meta for contextual UI decisions (e.g., button labels)
    planDesignerState.currentPlanMeta = { ...(planDesignerState.currentPlanMeta || {}), ...(meta || {}) };
    const nameEl = document.getElementById('plan-name');
    const descEl = document.getElementById('plan-description');
    const orderSel = document.getElementById('order-select');
    const orderLabel = document.getElementById('plan-order-label');
    const typeSel = document.getElementById('schedule-type');
    const typeLabel = document.getElementById('plan-type-label');
    
    if (nameEl) nameEl.value = meta.name || '';
    if (descEl) descEl.value = meta.description || '';
    if (orderSel) orderSel.value = meta.orderCode || '';
    
    // Update order label - try to find matching option text
    if (orderLabel) {
      if (meta.orderCode && orderSel) {
        const matchingOption = Array.from(orderSel.options).find(opt => opt.value === meta.orderCode);
        orderLabel.textContent = matchingOption ? matchingOption.text : meta.orderCode;
      } else {
        orderLabel.textContent = 'Select an order...';
      }
    }
    
    if (typeSel) typeSel.value = meta.scheduleType || 'one-time';
    if (typeLabel) typeLabel.textContent = (meta.scheduleType === 'recurring') ? 'Devirli' : 'Tek seferlik';
    
    // Update recurring UI visibility
    try { if (typeof window.handleScheduleTypeChange === 'function') window.handleScheduleTypeChange(); } catch {}
    // Apply read-only state to config fields
    setPlanConfigReadOnly(!!planDesignerState.readOnly);
    configurePlanActionButtons();
  } catch {}
}

function setPlanConfigReadOnly(flag) {
  try {
    const nameEl = document.getElementById('plan-name');
    const descEl = document.getElementById('plan-description');
    const orderBtn = document.getElementById('plan-order-btn');
    const typeBtn = document.getElementById('plan-type-btn');
    if (nameEl) nameEl.disabled = flag;
    if (descEl) descEl.disabled = flag;
    if (orderBtn) { orderBtn.style.pointerEvents = flag ? 'none' : ''; orderBtn.style.opacity = flag ? '0.6' : ''; }
    if (typeBtn) { typeBtn.style.pointerEvents = flag ? 'none' : ''; typeBtn.style.opacity = flag ? '0.6' : ''; }
  } catch {}
}

function configurePlanActionButtons() {
  try {
    const saveBtn = document.getElementById('plan-save-btn');
    const satBtn = document.getElementById('plan-save-as-template-btn');
    if (saveBtn) {
      // Hide Save completely in read-only (production plan view)
      saveBtn.style.display = planDesignerState.readOnly ? 'none' : '';
      saveBtn.disabled = !!planDesignerState.readOnly;
      saveBtn.style.opacity = planDesignerState.readOnly ? '0.6' : '';
      saveBtn.style.cursor = planDesignerState.readOnly ? 'not-allowed' : 'pointer';
      // If user is editing a template (draft), show conversion intent on Save
      const isFromTemplate = (planDesignerState.currentPlanMeta && planDesignerState.currentPlanMeta.status === 'template');
      saveBtn.textContent = isFromTemplate ? 'Taslağı Plana Dönüştür' : 'Save';
    }
    if (satBtn) {
      satBtn.textContent = planDesignerState.readOnly ? 'Copy As Template' : 'Save As Template';
    }
  } catch {}
}

// Scheduling helpers (topological order based on predecessors)
export function getExecutionOrder() {
  const nodes = planDesignerState.nodes.map(n => ({ id: n.id, preds: new Set(n.predecessors || []) }));
  const idToNode = new Map(nodes.map(n => [n.id, n]));
  const order = [];
  const queue = nodes.filter(n => n.preds.size === 0).map(n => n.id);
  const remaining = new Set(nodes.map(n => n.id));
  while (queue.length) {
    const id = queue.shift();
    if (!remaining.has(id)) continue;
    remaining.delete(id);
    order.push(id);
    // Remove as predecessor from others
    for (const m of nodes) {
      if (m.preds.has(id)) {
        m.preds.delete(id);
        if (m.preds.size === 0) queue.push(m.id);
      }
    }
  }
  if (remaining.size) {
    console.warn('Cycle detected in plan graph. Remaining nodes:', Array.from(remaining));
  }
  return order;
}

// Load approved quotes with WO codes into the order select dropdown
export async function loadOrdersIntoSelect() {
  const select = document.getElementById('order-select');
  if (!select) return;

  const previouslySelected = select.value || planDesignerState.currentPlanMeta?.orderCode || '';
  select.innerHTML = '<option value="">Loading orders...</option>';

  try {
    const [quotes, plans] = await Promise.all([
      getApprovedQuotes().catch(() => []),
      getProductionPlans().catch(() => [])
    ]);

    const takenCodes = new Set(
      (Array.isArray(plans) ? plans : [])
        .map(plan => (plan?.orderCode || '').trim())
        .filter(Boolean)
    );

    if (previouslySelected) {
      takenCodes.delete(String(previouslySelected).trim());
    }

    const availableQuotes = (Array.isArray(quotes) ? quotes : []).filter(quote => {
      const code = (quote?.workOrderCode || quote?.id || quote?.quoteId || '').trim();
      return code && !takenCodes.has(code);
    });

    const ensuredList = [...availableQuotes];
    if (previouslySelected) {
      const normalized = String(previouslySelected).trim();
      const alreadyIncluded = ensuredList.some(q => (q?.workOrderCode || q?.id || q?.quoteId || '').trim() === normalized);
      if (!alreadyIncluded) {
        const fallback = (Array.isArray(quotes) ? quotes : []).find(q => (q?.workOrderCode || q?.id || q?.quoteId || '').trim() === normalized);
        if (fallback) {
          ensuredList.unshift(fallback);
        } else {
          ensuredList.unshift({ workOrderCode: normalized, company: planDesignerState.currentPlanMeta?.orderCompany || '-', name: normalized });
        }
      }
    }

    const options = ['<option value="">Select an order...</option>'];
    if (ensuredList.length === 0) {
      options.push('<option value="" disabled>No unplanned work orders available</option>');
    }

    ensuredList.forEach(quote => {
      const rawCode = quote?.workOrderCode || quote?.id || quote?.quoteId;
      const code = (rawCode || '').trim();
      if (!code) return;
      const label = `${escapeHtml(code)} — ${escapeHtml(quote?.companyName || quote?.company || quote?.customerName || quote?.customer || quote?.name || '-')}`;
      options.push(`<option value="${escapeHtml(code)}">${label}</option>`);
    });

    select.innerHTML = options.join('');
    if (previouslySelected) {
      select.value = previouslySelected;
    }

    const labelEl = document.getElementById('plan-order-label');
    if (labelEl) {
      if (select.value) {
        const selectedOpt = Array.from(select.options).find(opt => opt.value === select.value);
        labelEl.textContent = selectedOpt ? selectedOpt.textContent : select.value;
      } else {
        labelEl.textContent = 'Select an order...';
      }
    }

    setTimeout(() => {
      try { renderPlanOrderListFromSelect(); } catch (e) { console.warn('Failed to render order list:', e); }
    }, 100);

    console.log(`Loaded ${ensuredList.length} unplanned work orders into plan order select`);
  } catch (error) {
    console.error('Error loading approved quotes:', error);
    select.innerHTML = '<option value="">Failed to load orders</option>';
  }
}

// Initialize order loading when plan designer is opened
export function initializePlanOrdersDropdown() {
  // Load orders when plan designer is initialized
  loadOrdersIntoSelect();
}

// Modal functions for plan type panel
window.handlePlanTypeModalChange = function(planType) {
  console.log('handlePlanTypeModalChange called with:', planType);
  const recurringOptions = document.getElementById('modal-recurring-options');
  console.log('Found modal-recurring-options element:', recurringOptions);
  
  if (planType === 'recurring') {
    if (recurringOptions) {
      recurringOptions.style.display = 'block';
      console.log('Showing recurring options');
    } else {
      console.warn('modal-recurring-options element not found!');
    }
  } else {
    if (recurringOptions) {
      recurringOptions.style.display = 'none';
      console.log('Hiding recurring options');
    }
  }
};

window.handleModalRecurringTypeChange = function() {
  console.log('handleModalRecurringTypeChange called');
  const recurringType = document.getElementById('modal-recurring-type');
  const periodicContainer = document.getElementById('modal-periodic-frequency-container');
  
  console.log('Found elements:', { recurringType, periodicContainer });
  
  if (recurringType && periodicContainer) {
    console.log('Recurring type value:', recurringType.value);
    if (recurringType.value === 'periodic') {
      periodicContainer.style.display = 'block';
      console.log('Showing periodic frequency container');
    } else {
      periodicContainer.style.display = 'none';
      console.log('Hiding periodic frequency container');
    }
  }
};

window.handleModalPeriodicFrequencyChange = function() {
  console.log('handleModalPeriodicFrequencyChange called');
  const periodicFrequency = document.getElementById('modal-periodic-frequency');
  const customContainer = document.getElementById('modal-custom-frequency-container');
  
  console.log('Found elements:', { periodicFrequency, customContainer });
  
  if (periodicFrequency && customContainer) {
    console.log('Periodic frequency value:', periodicFrequency.value);
    if (periodicFrequency.value === 'custom') {
      customContainer.style.display = 'block';
      console.log('Showing custom frequency container');
    } else {
      customContainer.style.display = 'none';
      console.log('Hiding custom frequency container');
    }
  }
};

window.clearPlanType = function() {
  // Clear radio buttons
  const radioButtons = document.querySelectorAll('input[name="plan-type-radio"]');
  radioButtons.forEach(radio => radio.checked = false);
  
  // Hide recurring options
  const recurringOptions = document.getElementById('modal-recurring-options');
  if (recurringOptions) {
    recurringOptions.style.display = 'none';
  }
  
  // Reset plan type in state
  if (planDesignerState.currentPlanMeta) {
    planDesignerState.currentPlanMeta.scheduleType = null;
  }
  
  // Update button text
  const planTypeButton = document.getElementById('plan-type-selector');
  if (planTypeButton) {
    planTypeButton.innerHTML = `<span>Plan Türü</span><svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  }
};

window.hidePlanTypePanel = function() {
  const panel = document.getElementById('plan-type-panel');
  if (panel) {
    panel.style.display = 'none';
  }
};

// Apply plan type modal selections and close
window.applyPlanTypeModal = function() {
  console.log('applyPlanTypeModal called');
  
  // Get selected plan type
  const selectedRadio = document.querySelector('input[name="plan-type-radio"]:checked');
  if (!selectedRadio) {
    console.warn('No plan type selected');
    return;
  }
  
  const planType = selectedRadio.value;
  console.log('Selected plan type:', planType);
  
  // Get recurring options if applicable
  if (planType === 'recurring') {
    const recurringType = document.getElementById('modal-recurring-type')?.value;
    const periodicFrequency = document.getElementById('modal-periodic-frequency')?.value;
    const customFrequency = document.getElementById('modal-custom-frequency')?.value;
    
    console.log('Recurring options:', {
      recurringType,
      periodicFrequency,
      customFrequency
    });
    
    // Save recurring options to state
    if (planDesignerState.currentPlanMeta) {
      planDesignerState.currentPlanMeta.recurringType = recurringType;
      planDesignerState.currentPlanMeta.periodicFrequency = periodicFrequency;
      planDesignerState.currentPlanMeta.customFrequency = customFrequency;
    }
    
    // Update button text to show more detail
    const planTypeButton = document.getElementById('plan-type-btn');
    if (planTypeButton && recurringType) {
      let displayText = 'Devirli';
      if (recurringType === 'periodic' && periodicFrequency) {
        const frequencyLabels = {
          'daily': 'Günlük',
          'weekly': 'Haftalık', 
          'biweekly': '2 haftalık',
          'monthly': 'Aylık',
          'custom': 'Custom'
        };
        displayText += ` (${frequencyLabels[periodicFrequency] || periodicFrequency})`;
      } else if (recurringType === 'indefinite') {
        displayText += ' (Süresiz)';
      }
      planTypeButton.innerHTML = `<span>${displayText}</span><svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    }
  }
  
  // Close the modal
  hidePlanTypePanel();
  console.log('Plan type modal applied and closed');
};

// Initialize plan type modal with current values
function initializePlanTypeModal() {
  console.log('initializePlanTypeModal called');
  const currentType = planDesignerState.currentPlanMeta?.scheduleType || 'one-time';
  console.log('Current plan type:', currentType);
  
  // Set radio buttons
  const radioButtons = document.querySelectorAll('input[name="plan-type-radio"]');
  console.log('Found radio buttons:', radioButtons.length);
  radioButtons.forEach(radio => {
    radio.checked = radio.value === currentType;
    console.log(`Radio button ${radio.value} checked:`, radio.checked);
  });
  
  // Show/hide recurring options
  const recurringOptions = document.getElementById('modal-recurring-options');
  console.log('Found recurring options element:', recurringOptions);
  if (recurringOptions) {
    recurringOptions.style.display = currentType === 'recurring' ? 'block' : 'none';
    console.log('Recurring options display:', recurringOptions.style.display);
  }
  
  // If recurring, initialize sub-options
  if (currentType === 'recurring') {
    console.log('Initializing recurring sub-options');
    // Initialize recurring type (default to periodic)
    const recurringType = document.getElementById('modal-recurring-type');
    if (recurringType && !recurringType.value) {
      recurringType.value = 'periodic';
      console.log('Set recurring type to:', recurringType.value);
    }
    
    // Show/hide periodic frequency based on recurring type
    window.handleModalRecurringTypeChange();
    
    // Initialize periodic frequency (default to daily)
    const periodicFrequency = document.getElementById('modal-periodic-frequency');
    if (periodicFrequency && !periodicFrequency.value) {
      periodicFrequency.value = 'daily';
      console.log('Set periodic frequency to:', periodicFrequency.value);
    }
    
    // Show/hide custom frequency based on periodic frequency
    window.handleModalPeriodicFrequencyChange();
  }
}
