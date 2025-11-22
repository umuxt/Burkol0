// Plan Designer logic and state
import { showSuccessToast, showErrorToast, showWarningToast, showInfoToast } from '../../../shared/components/MESToast.js';
import { computeAndAssignSemiCode, getSemiCodePreviewForNode, getPrefixForNode, collectPendingSemiCodes } from './semiCode.js';
import { upsertProducedWipFromNode, getStations, createProductionPlan, createTemplate, getNextProductionPlanId, genId, updateProductionPlan, getApprovedQuotes, getProductionPlans, getOperations, getWorkers, getWorkerAssignments, getSubstations, batchWorkerAssignments, getMaterials, checkMesMaterialAvailability, getGeneralMaterials, activateWorkerAssignments, commitSemiCodes } from './mesApi.js';
import { cancelPlanCreation, setActivePlanTab } from './planOverview.js';
import { populateUnitSelect } from './units.js';
import { API_BASE, withAuth } from '../../../shared/lib/api.js';
import { renderMaterialFlow } from '../components/materialFlowView.js';

export const planDesignerState = {
  nodes: [],
  connectMode: false,
  connectingFrom: null,
  draggedOperation: null,
  selectedNode: null,
  nodeIdCounter: 1,
  isFullscreen: false,
  availableOperations: [],
  availableWorkers: [], // Cache for migration lookup only
  availableStations: [], // Cache for migration lookup only
  workersCache: [], // For display purposes only (not assignment)
  stationsCache: [], // For display purposes only (not assignment)
  availableMaterials: [], // Cache for material availability checks
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
  // Auto-assignment caching
  workerAssignmentsCache: new Map(), // workerId -> assignments[]
  substationsCache: new Map(), // stationId -> substations[]
  cacheTimestamp: null,
  cacheExpirationMs: 5 * 60 * 1000, // 5 minutes
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
  // Plan quantity - how many times the production flow should repeat
  planQuantity: 1,
  // Timing summary cache (invalidated on node changes)
  timingSummary: null,
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

// ============================================================================
// GRAPH VALIDATION UTILITIES
// ============================================================================

/**
 * Döngü kontrolü - DFS algoritması ile döngü tespiti
 * @param {string} fromId - Kaynak node ID
 * @param {string} toId - Hedef node ID  
 * @returns {boolean} - true ise döngü oluşur
 */
function wouldCreateCycle(fromId, toId) {
  const visited = new Set();
  const recursionStack = new Set();
  
  function dfs(nodeId) {
    visited.add(nodeId);
    recursionStack.add(nodeId);
    
    const node = planDesignerState.nodes.find(n => n.id === nodeId);
    if (!node) return false;
    
    // NEW MODEL: Check successor
    const successor = node.successor;
    
    if (successor) {
      // Yeni bağlantıyı simüle et
      const effectiveTarget = (nodeId === fromId) ? toId : successor;
      
      if (!visited.has(effectiveTarget)) {
        if (dfs(effectiveTarget)) return true;
      } else if (recursionStack.has(effectiveTarget)) {
        return true; // Döngü bulundu!
      }
    }
    
    // Yeni bağlantıyı da kontrol et
    if (nodeId === fromId && toId) {
      if (!visited.has(toId)) {
        if (dfs(toId)) return true;
      } else if (recursionStack.has(toId)) {
        return true;
      }
    }
    
    recursionStack.delete(nodeId);
    return false;
  }
  
  return dfs(fromId);
}

/**
 * Topological sort - Başlangıçtan sona doğru sıralama
 * Kahn's Algorithm kullanarak dependency-aware numaralandırma
 * @returns {Array} - Sıralanmış node ID'leri
 */
function calculateTopologicalOrder() {
  const nodes = planDesignerState.nodes;
  
  if (nodes.length === 0) return [];
  
  // Her node'un kaç predecessor'ı olduğunu say
  const inDegree = new Map();
  nodes.forEach(node => {
    inDegree.set(node.id, (node.predecessors || []).length);
  });
  
  // Başlangıç node'ları (predecessor'ı olmayanlar)
  const queue = [];
  nodes.forEach(node => {
    if ((node.predecessors || []).length === 0) {
      queue.push(node.id);
    }
  });
  
  // Topological sıralama
  const sortedIds = [];
  
  while (queue.length > 0) {
    const nodeId = queue.shift();
    sortedIds.push(nodeId);
    
    // Bu node'un successor'ını kontrol et
    const node = nodes.find(n => n.id === nodeId);
    if (node && node.successor) {
      const successorId = node.successor;
      const currentInDegree = inDegree.get(successorId) - 1;
      inDegree.set(successorId, currentInDegree);
      
      // Tüm predecessor'ları tamamlandıysa kuyruğa ekle
      if (currentInDegree === 0) {
        queue.push(successorId);
      }
    }
  }
  
  // Döngü kontrolü - tüm node'lar işlenmeli
  if (sortedIds.length !== nodes.length) {
    console.warn('⚠️ Döngü tespit edildi! Tüm node\'lar sıralanamadı.');
    return [];
  }
  
  return sortedIds;
}

/**
 * Node'lara sequence numarası ata (topological sort'a göre)
 */
export function updateNodeSequences() {
  const sortedIds = calculateTopologicalOrder();
  
  if (sortedIds.length === 0 && planDesignerState.nodes.length > 0) {
    // Döngü var, sequence atanamaz
    planDesignerState.nodes.forEach(node => {
      node.sequence = undefined;
    });
    return false;
  }
  
  sortedIds.forEach((nodeId, index) => {
    const node = planDesignerState.nodes.find(n => n.id === nodeId);
    if (node) {
      node.sequence = index + 1;
    }
  });
  
  return true;
}

// ============================================================================
// TIMING AND CAPACITY UTILITIES  
// ============================================================================

// Compute effective duration based on station and worker efficiency
export function computeNodeEffectiveDuration(node) {
  const nominalTime = parseFloat(node.time) || 0;
  if (nominalTime <= 0) return 0;
  
  // In Plan Designer, we only track nominal time
  // Effective time calculation happens at launch by the backend auto-assignment engine
  return nominalTime;
}

// Aggregate material requirements across all nodes
export function aggregatePlanMaterials(nodes, planQuantity = 1) {
  const materialMap = new Map();
  
  // Collect all materials from all nodes
  nodes.forEach(node => {
    const materials = Array.isArray(node.materialInputs) ? node.materialInputs : [];
    
    materials.forEach(mat => {
      if (!mat || !mat.materialCode) return;
      
      const qty = parseFloat(mat.requiredQuantity);
      // Skip items without quantity
      if (!Number.isFinite(qty) || qty <= 0) return;
      
      const key = mat.materialCode;
      const required = qty * planQuantity;
      
      if (materialMap.has(key)) {
        const existing = materialMap.get(key);
        existing.required += required;
      } else {
        materialMap.set(key, {
          id: mat.materialCode,
          code: mat.materialCode,
          name: mat.name || mat.materialCode,
          unit: 'pcs', // Default unit
          required: required,
          stock: 0, // Will be populated from API
          isDerived: !!mat.derivedFrom
        });
      }
    });
  });
  
  return Array.from(materialMap.values());
}

// DEPRECATED: Material availability check removed from Plan Designer
// Material warnings now appear only when launching production in Approved Quotes
export async function checkMaterialAvailability(nodes, planQuantity = 1) {
  // Stub function - no longer performs actual checks
  console.log('⚠️ Material checks are disabled in Plan Designer');
  
  return {
    items: [],
    hasShortages: false,
    shortageDetails: [],
    allAvailable: true,
    message: 'Material checks disabled in designer'
  };
}

// Summarize plan timing and capacity
export function summarizePlanTiming(nodes, planQuantity = 1) {
  let totalNominalTime = 0;
  let totalEffectiveTime = 0;
  const stationLoadMap = new Map(); // stationId -> cumulative effective time
  
  nodes.forEach(node => {
    const nominalTime = parseFloat(node.time) || 0;
    const effectiveTime = typeof node.effectiveTime === 'number' ? node.effectiveTime : nominalTime;
    
    totalNominalTime += nominalTime;
    totalEffectiveTime += effectiveTime;
    
    // Track station load
    // Station info (from assignedStations array)
    if (Array.isArray(node.assignedStations) && node.assignedStations[0]?.stationId) {
      const stationId = node.assignedStations[0].stationId;
      const currentLoad = stationLoadMap.get(stationId) || 0;
      stationLoadMap.set(stationId, currentLoad + effectiveTime);
    }
  });
  
  // Find bottleneck station (highest load)
  let bottleneckStation = null;
  let bottleneckLoad = 0;
  
  stationLoadMap.forEach((load, stationId) => {
    if (load > bottleneckLoad) {
      bottleneckLoad = load;
      bottleneckStation = stationId;
    }
  });
  
  // Get bottleneck station name
  let bottleneckName = null;
  if (bottleneckStation && planDesignerState.stationsCache) {
    const station = planDesignerState.stationsCache.find(s => s.id === bottleneckStation);
    if (station) bottleneckName = station.name;
  }
  
  // Calculate daily capacity and estimated completion days
  // Daily shift minutes: try to get from master data, default to 480 (8 hours)
  let dailyShiftMinutes = 480;
  try {
    const masterData = planDesignerState.masterDataCache;
    if (masterData && masterData.timeSettings && masterData.timeSettings.dailyShiftMinutes) {
      dailyShiftMinutes = parseFloat(masterData.timeSettings.dailyShiftMinutes) || 480;
    }
  } catch {}
  
  // Estimated completion days based on bottleneck (critical path)
  let estimatedDays = 0;
  if (bottleneckLoad > 0 && planQuantity > 0 && dailyShiftMinutes > 0) {
    const totalBottleneckTime = bottleneckLoad * planQuantity;
    estimatedDays = Math.ceil(totalBottleneckTime / dailyShiftMinutes);
  }
  
  return {
    totalNominalTime,
    totalEffectiveTime,
    stationLoads: Array.from(stationLoadMap.entries()).map(([stationId, load]) => {
      const station = planDesignerState.stationsCache?.find(s => s.id === stationId);
      return {
        stationId,
        stationName: station?.name || stationId,
        load
      };
    }).sort((a, b) => b.load - a.load),
    bottleneck: bottleneckStation ? {
      stationId: bottleneckStation,
      stationName: bottleneckName || bottleneckStation,
      load: bottleneckLoad
    } : null,
    dailyShiftMinutes,
    planQuantity,
    estimatedDays
  };
}

export async function loadOperationsToolbox() {
  const listContainer = document.getElementById('operations-list');
  const fullscreenListContainer = document.getElementById('fullscreen-operations-list');
  
  if (listContainer) {
    listContainer.innerHTML = '<div style="padding:6px;color:#888;">Loading operations...</div>';
  }
  if (fullscreenListContainer) {
    fullscreenListContainer.innerHTML = '<div style="padding:12px;color:#888;">Loading operations...</div>';
  }
  
  try {
    // Backend'den gerçek operations verilerini getir
    const operations = await getOperations(true);
    
    // Store in planDesignerState for drag & drop
    planDesignerState.availableOperations = operations;

    // Load workers and stations for migration lookup (silent load)
    try {
      const [workers, stations] = await Promise.all([
        getWorkers(true).catch(() => []),
        getStations(true).catch(() => [])
      ]);
      planDesignerState.availableWorkers = workers;
      planDesignerState.availableStations = stations;
      // Also populate workersCache and stationsCache for efficiency calculations
      planDesignerState.workersCache = workers;
      planDesignerState.stationsCache = stations;
    } catch (e) {
      console.warn('Could not load workers/stations for migration:', e);
      planDesignerState.availableWorkers = [];
      planDesignerState.availableStations = [];
      planDesignerState.workersCache = [];
      planDesignerState.stationsCache = [];
    }

    // Normal operations list
    if (listContainer) {
      if (operations.length === 0) {
        listContainer.innerHTML = '<div style="padding: 8px; color: var(--muted-foreground); font-size: 12px; text-align: center;">No operations available<br>Add operations in Master Data</div>';
      } else {
        listContainer.innerHTML = operations.map(op => {
          const effBadge = op.defaultEfficiency ? `<span style="margin-left: 8px; padding: 2px 6px; background: #dbeafe; color: #1e40af; border-radius: 3px; font-size: 10px; font-weight: 600;">⚡ ${(op.defaultEfficiency * 100).toFixed(0)}%</span>` : '';
          return `<div draggable="true" ondragstart="handleOperationDragStart(event, '${op.id}')" style="padding: 6px 8px; border: 1px solid var(--border); border-radius: 4px; cursor: grab; background: white; margin-bottom: 4px; font-size: 13px; font-weight: 500; display: flex; align-items: center; justify-content: space-between;" onmouseover="this.style.background='var(--muted)'" onmouseout="this.style.background='white'"><span>${escapeHtml(op.name)}</span>${effBadge}</div>`;
        }).join('');
      }
    }
  
    // Fullscreen operations list
    if (fullscreenListContainer) {
      if (operations.length === 0) {
        fullscreenListContainer.innerHTML = '<div style="padding: 12px; color: var(--muted-foreground); font-size: 14px; text-align: center;">No operations available<br>Add operations in Master Data</div>';
      } else {
        fullscreenListContainer.innerHTML = operations.map(op => {
          const effBadge = op.defaultEfficiency ? `<span style="margin-left: 8px; padding: 3px 8px; background: #dbeafe; color: #1e40af; border-radius: 4px; font-size: 11px; font-weight: 600;">⚡ ${(op.defaultEfficiency * 100).toFixed(0)}%</span>` : '';
          return `<div draggable="true" ondragstart="handleOperationDragStart(event, '${op.id}')" style="padding: 8px 12px; border: 1px solid var(--border); border-radius: 6px; cursor: grab; background: white; margin-bottom: 8px; font-size: 14px; font-weight: 500; display: flex; align-items: center; justify-content: space-between;" onmouseover="this.style.background='var(--muted)'" onmouseout="this.style.background='white'"><span>${escapeHtml(op.name)}</span>${effBadge}</div>`;
        }).join('');
      }
    }
    
    // Initialize global event handlers if not already done
    initializeGlobalEventHandlers();
  } catch (e) {
    console.error('loadOperationsToolbox error', e);
    if (listContainer) {
      listContainer.innerHTML = '<div style="padding:6px;color:#ef4444;">Failed to load operations</div>';
    }
    if (fullscreenListContainer) {
      fullscreenListContainer.innerHTML = '<div style="padding:12px;color:#ef4444;">Failed to load operations</div>';
    }
  }
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
        // Quiet
        return;
    }
    // Quiet


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
      // Quiet
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
        // Quiet
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
  
  // Quiet: avoid noisy logs in production
  
  if (fullscreenCanvas && fullscreenCanvas.offsetParent !== null) {
    const rect = fullscreenCanvas.getBoundingClientRect();
    if (e.clientX >= rect.left && e.clientX <= rect.right && 
        e.clientY >= rect.top && e.clientY <= rect.bottom) {
      return fullscreenCanvas;
    }
  }
  
  if (normalCanvas && normalCanvas.offsetParent !== null) {
    const rect = normalCanvas.getBoundingClientRect();
    if (e.clientX >= rect.left && e.clientX <= rect.right && 
        e.clientY >= rect.top && e.clientY <= rect.bottom) {
      return normalCanvas;
    }
  }
  
  // Fallback to current mode
  const fallback = planDesignerState.isFullscreen ? fullscreenCanvas : normalCanvas;
  return fallback;
}

// Updated connection update function that works with specific canvas
function updateConnectionsForNodeInCanvas(nodeId, canvas) {
  if (!canvas) return;
  
  const existing = canvas.querySelectorAll('.connection-container');
  existing.forEach(el => el.remove());
  
  // NEW MODEL: Render successor connections
  planDesignerState.nodes.forEach(node => {
    if (node.successor) {
      const targetNode = planDesignerState.nodes.find(n => n.id === node.successor);
      if (targetNode) {
        renderConnection(node, targetNode, canvas);
      }
    }
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
      // Quiet
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
      // Quiet
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
      
      // Quiet
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
    time: operation.time || 30, // Ensure time is always a valid number
    // Rule-based fields for auto-assignment at launch
    requiredSkills: operation.skills || [], // Skills required for this operation
    preferredStations: [], // Preferred station IDs or tags (multi-select)
    assignmentMode: 'auto', // 'auto' (default) or 'manual' - SCHEMA-COMPLIANT
    workerHint: null, // Optional hint for manual allocation: { workerId?, workerNameHint? }
    priorityTag: null, // Optional priority or lane identifier
    // Scheduling dependencies (NEW MODEL)
    predecessors: [], // Explicit list of predecessor node IDs
    successor: null, // Single successor node ID (one-to-one)
    // Material inputs/outputs (SCHEMA-COMPLIANT)
    materialInputs: [], // List of materials consumed: [{ materialCode, requiredQuantity, unitRatio }]
    semiCode: null, // Output semi-finished product code
    outputQty: 1, // Default output quantity (will be updated when user configures)
    outputUnit: 'pcs', // Default output unit (will be updated when user configures)
    // Canvas positioning
    x: Math.max(0, x),
    y: Math.max(0, y)
  };
  
  // Quiet
  planDesignerState.nodes.push(newNode);
  
  // Sequence'leri hesapla
  updateNodeSequences();
  
  // Render appropriate canvas
  if (planDesignerState.isFullscreen) {
    // Quiet
    renderCanvasContent(canvas);
  } else {
    // Quiet
    renderCanvas();
  }
  
  planDesignerState.draggedOperation = null;
  showSuccessToast(operation.name + ' operasyonu eklendi');
}

export function renderCanvas() {
  const canvas = document.getElementById('plan-canvas');
  if (!canvas) return;
  const existingElements = canvas.querySelectorAll('.canvas-node, .connection-container');
  existingElements.forEach(element => element.remove());

  // Sequence'leri güncelle
  updateNodeSequences();

  // NEW MODEL: Render successor connections
  planDesignerState.nodes.forEach(node => {
    if (node.successor) {
      const targetNode = planDesignerState.nodes.find(n => n.id === node.successor);
      if (targetNode) renderConnection(node, targetNode);
    }
  });
  planDesignerState.nodes.forEach(node => renderNode(node));

  // Recalculate timing summary cache
  planDesignerState.timingSummary = summarizePlanTiming(
    planDesignerState.nodes, 
    planDesignerState.planQuantity || 1
  );

  // Also render material flow view under the canvas
  try { renderMaterialFlow(); } catch (e) { console.warn('renderMaterialFlow failed', e); }
  
  // Render timing/capacity summary
  try { renderTimingSummary(); } catch (e) { console.warn('renderTimingSummary failed', e); }
}

// Render timing and capacity summary card
export function renderTimingSummary() {
  const container = document.getElementById('timing-summary-container');
  
  // If container doesn't exist (not in Plan Designer view), exit silently
  if (!container) {
    return;
  }
  
  const summary = planDesignerState.timingSummary;
  
  // If no summary data, show minimal message
  if (!summary || planDesignerState.nodes.length === 0) {
    container.innerHTML = `
      <div style="color: #6b7280; font-size: 14px; text-align: center; padding: 12px;">No operations in plan</div>
    `;
    return;
  }
  
  const efficiencyGain = summary.totalNominalTime > 0 
    ? ((summary.totalNominalTime - summary.totalEffectiveTime) / summary.totalNominalTime * 100)
    : 0;
  
  const efficiencyBadge = Math.abs(efficiencyGain) > 0.5
    ? `<span style="color: ${efficiencyGain > 0 ? '#059669' : '#dc2626'}; font-size: 12px; font-weight: 500;">
        (${efficiencyGain > 0 ? '↓' : '↑'} ${Math.abs(efficiencyGain).toFixed(1)}%)
       </span>`
    : '';
  
  const bottleneckInfo = summary.bottleneck
    ? `
      <div style="background: #fef3c7; border: 1px solid #fbbf24; border-radius: 6px; padding: 10px; margin-top: 12px;">
        <div style="font-size: 13px; font-weight: 600; color: #92400e; margin-bottom: 4px;">
          🔴 Bottleneck Station
        </div>
        <div style="font-size: 12px; color: #78350f;">
          <strong>${summary.bottleneck.stationName}</strong><br>
          Load: ${summary.bottleneck.load.toFixed(1)} min
        </div>
      </div>
    `
    : '';
  
  const stationsList = summary.stationLoads.length > 0
    ? `
      <div style="margin-top: 12px;">
        <div style="font-size: 13px; font-weight: 600; color: #374151; margin-bottom: 6px;">
          Station Loads
        </div>
        ${summary.stationLoads.slice(0, 5).map(st => `
          <div style="display: flex; justify-content: space-between; font-size: 12px; color: #6b7280; margin-bottom: 4px;">
            <span>${st.stationName}</span>
            <span style="font-weight: 500;">${st.load.toFixed(1)} min</span>
          </div>
        `).join('')}
        ${summary.stationLoads.length > 5 ? `<div style="font-size: 11px; color: #9ca3af; margin-top: 4px;">+${summary.stationLoads.length - 5} more stations</div>` : ''}
      </div>
    `
    : '';
  
  container.innerHTML = `
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">
      <div style="background: #f3f4f6; border-radius: 6px; padding: 10px;">
        <div style="font-size: 11px; color: #6b7280; margin-bottom: 4px;">Nominal Time</div>
        <div style="font-size: 18px; font-weight: 600; color: #1f2937;">${summary.totalNominalTime.toFixed(1)} min</div>
      </div>
      <div style="background: #f3f4f6; border-radius: 6px; padding: 10px;">
        <div style="font-size: 11px; color: #6b7280; margin-bottom: 4px;">Effective Time</div>
        <div style="font-size: 18px; font-weight: 600; color: #1f2937;">${summary.totalEffectiveTime.toFixed(1)} min</div>
      </div>
    </div>
    
    ${efficiencyBadge ? `<div style="text-align: center; margin-bottom: 12px;">${efficiencyBadge}</div>` : ''}
    
    <div style="background: #eff6ff; border: 1px solid #3b82f6; border-radius: 6px; padding: 10px;">
      <div style="font-size: 13px; font-weight: 600; color: #1e40af; margin-bottom: 6px;">
        📅 Estimated Completion
      </div>
      <div style="font-size: 20px; font-weight: 700; color: #1e40af;">
        ${summary.estimatedDays} ${summary.estimatedDays === 1 ? 'day' : 'days'}
      </div>
      <div style="font-size: 11px; color: #3b82f6; margin-top: 4px;">
        Plan Qty: ${summary.planQuantity} × ${summary.dailyShiftMinutes} min/day
      </div>
    </div>
    
    ${bottleneckInfo}
    ${stationsList}
  `;
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
    const materials = Array.isArray(node.materialInputs) ? node.materialInputs : []
    if (!materials.length) return 'Not selected'
    const parts = materials.slice(0,2).map(m => {
      const nm = m.name || m.materialCode
      const qty = m.requiredQuantity != null && m.requiredQuantity !== '' ? ` (${m.requiredQuantity})` : ''
      return (nm||'').toString() + qty
    })
    const extra = materials.length > 2 ? ` +${materials.length-2} more` : ''
    return parts.join(', ') + extra
  })()
  const warningBadge = node.requiresAttention ? 
    '<span style="background: #dc2626; color: white; font-size: 10px; padding: 1px 4px; border-radius: 8px; margin-left: 4px;">!</span>' : '';
  
  // Efficiency badge (show if overridden)
  const hasEfficiencyOverride = node.efficiency !== undefined && node.efficiency !== null;
  const efficiencyBadge = hasEfficiencyOverride
    ? `<span style="margin-left: 4px; padding: 2px 6px; background: #dbeafe; color: #1e40af; border-radius: 3px; font-size: 10px; font-weight: 600;">⚡ ${Math.round(node.efficiency * 100)}%</span>`
    : '';
  
  const actionsHtml = planDesignerState.readOnly ? '' : [
    '<div style="display: flex; gap: 2px;">',
    `<button onclick="event.stopPropagation(); editNode('${node.id}')" style="width: 20px; height: 20px; border: none; background: #f3f4f6; border-radius: 3px; cursor: pointer; font-size: 10px;"><i class="fa-solid fa-edit" style="font-size: 8px;"></i></button>`,
    `<button onclick="event.stopPropagation(); deleteNode('${node.id}')" style="width: 20px; height: 20px; border: none; background: #fee2e2; border-radius: 3px; cursor: pointer; font-size: 10px;">🗑️</button>`,
    '</div>'
  ].join('');
  const scheduleInfo = node.startTime && node.endTime ? 
    `<div style="font-size: 10px; color: #059669; margin-bottom: 2px;">⏰ ${new Date(node.startTime).toLocaleString('tr-TR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })} - ${new Date(node.endTime).toLocaleString('tr-TR', { hour: '2-digit', minute: '2-digit' })}</div>` : '';
  
  // Time display with efficiency
  const timeDisplay = (() => {
    const nominalTime = parseFloat(node.time) || 0;
    const effectiveTime = typeof node.effectiveTime === 'number' ? node.effectiveTime : nominalTime;
    
    // If effective time differs from nominal, show both
    if (Math.abs(effectiveTime - nominalTime) > 0.01 && (node.assignedWorkerId || (Array.isArray(node.assignedStations) && node.assignedStations.length > 0))) {
      return `⏱️ ${nominalTime} min → ${effectiveTime.toFixed(1)} min effective`;
    }
    return `⏱️ ${nominalTime} min`;
  })();
  
  // Worker display with manual hint indicator
  const workerDisplay = (() => {
    // If already assigned (should not happen in planning phase, but legacy support)
    if (node.assignedWorkerName || node.assignedWorker) {
      return node.assignedWorkerName || node.assignedWorker;
    }
    
    // Check for manual assignment with worker ID
    if (node.assignmentMode === 'manual' && node.assignedWorkerId) {
      // Try to find worker name from availableWorkers
      const worker = (planDesignerState.availableWorkers || []).find(w => w.id === node.assignedWorkerId);
      const workerName = worker ? worker.name : node.assignedWorkerId;
      return `📌 ${workerName}`;
    }
    
    return 'Auto-assign at launch';
  })();
  
  // Sequence badge (sol üst köşe)
  const sequenceBadge = node.sequence 
    ? `<div style="position: absolute; top: -8px; left: -8px; background: #3b82f6; color: white; border-radius: 50%; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 700; box-shadow: 0 2px 4px rgba(0,0,0,0.2); z-index: 20;">${node.sequence}</div>`
    : '';
  
  nodeElement.innerHTML = [
    sequenceBadge,
    '<div style="display: flex; justify-content: between; align-items: flex-start; margin-bottom: 4px;">',
    `<div class="drag-handle" style="font-weight: 600; font-size: 14px; color: ${colors[node.type] || '#6b7280'}; flex: 1; cursor: ${planDesignerState.readOnly ? 'default' : 'move'}; padding: 2px;">🔸 ${node.name}${warningBadge}${efficiencyBadge}</div>`,
    actionsHtml,
    '</div>',
    `<div style="font-size: 11px; color: #6b7280; margin-bottom: 2px;">Type: ${node.type}</div>`,
    `<div style=\"font-size: 11px; color: #6b7280; margin-bottom: 2px;\">${timeDisplay}</div>`,
    scheduleInfo,
    `<div style=\"font-size: 10px; color: #9ca3af;\">Worker: ${workerDisplay}<br>Station: ${node.assignedStationName || node.assignedStation || 'Auto-assign at launch'}<br>Materials: ${matSummary}</div>`
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
  
  // Render connections using successor model
  planDesignerState.nodes.forEach(node => {
    if (node.successor) {
      const targetNode = planDesignerState.nodes.find(n => n.id === node.successor);
      if (targetNode) {
        renderConnection(node, targetNode, canvas);
      }
    }
  });
}

export function deleteConnection(fromNodeId, toNodeId) {
  if (planDesignerState.readOnly) { showInfoToast('Read-only mode'); return; }
  const fromNode = planDesignerState.nodes.find(n => n.id === fromNodeId);
  const toNode = planDesignerState.nodes.find(n => n.id === toNodeId);
  if (fromNode) {
    // NEW MODEL: Clear successor if it matches
    if (fromNode.successor === toNodeId) {
      fromNode.successor = null;
    }
  }
  if (toNode) {
    // Remove scheduling dependency
    if (Array.isArray(toNode.predecessors)) {
      toNode.predecessors = toNode.predecessors.filter(pid => pid !== fromNodeId);
    }
    // Remove auto-propagated material
    if (Array.isArray(toNode.materialInputs)) {
      toNode.materialInputs = toNode.materialInputs.filter(m => !(m && m.derivedFrom === fromNodeId));
    }
    try { window.dispatchEvent(new CustomEvent('nodeMaterialsChanged', { detail: { nodeId: toNodeId } })) } catch {}
  }
  
  // Sequence'leri yeniden hesapla
  updateNodeSequences();
  
  // Render appropriate canvas
  if (planDesignerState.isFullscreen) {
    const fullscreenCanvas = document.getElementById('fullscreen-plan-canvas');
    if (fullscreenCanvas) renderCanvasContent(fullscreenCanvas);
  } else {
    renderCanvas();
  }
  
  showSuccessToast('Connection deleted');
}

export function handleNodeClick(nodeId) {
  if (planDesignerState.readOnly) { return; }
  if (planDesignerState.connectMode) {
    if (planDesignerState.connectingFrom === null) {
      planDesignerState.connectingFrom = nodeId;
      // Set source for hover/highlight feedback in connect mode
      planDesignerState.connectionSource = planDesignerState.nodes.find(n => n.id === nodeId) || null;
      showInfoToast('Select target operation to connect');
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
  if (planDesignerState.readOnly) { showInfoToast('Read-only mode'); return; }
  const fromNode = planDesignerState.nodes.find(n => n.id === fromId);
  const toNode = planDesignerState.nodes.find(n => n.id === toId);
  
  if (!fromNode || !toNode) return;
  
  // ÖNEMLİ: Bir node'dan sadece BİR çıkış olabilir!
  if (fromNode.successor) {
    showErrorToast('Bu operasyonun zaten bir çıkışı var! Bir operasyondan sadece bir yere gidilebilir.');
    return;
  }
  
  // Döngü kontrolü - DFS ile
  if (wouldCreateCycle(fromId, toId)) {
    showErrorToast('Bu bağlantı döngü oluşturur! İş akışında döngü olamaz.');
    return;
  }
  
  // Zaten bağlı mı kontrolü
  if (fromNode.successor === toId) {
    showWarningToast('Bu operasyonlar zaten bağlı');
    return;
  }
  
  // NEW MODEL: Set successor (single value)
  fromNode.successor = toId;
  
  // Scheduling dependency: to cannot start before from completes
  if (!Array.isArray(toNode.predecessors)) toNode.predecessors = [];
  if (!toNode.predecessors.includes(fromId)) toNode.predecessors.push(fromId);

  // Material propagation: from's output becomes input material of to (SCHEMA-COMPLIANT)
  if (!Array.isArray(toNode.materialInputs)) toNode.materialInputs = [];
  const existingIdx = toNode.materialInputs.findIndex(m => m && (m.derivedFrom === fromId || m.materialCode === (fromNode.semiCode || `node-${fromId}-output`)));
  if (existingIdx === -1) {
    const autoMat = {
      materialCode: fromNode.semiCode || `node-${fromId}-output`,  // SCHEMA: materialCode
      name: fromNode.semiCode ? `${fromNode.semiCode}` : `${fromNode.name} (semi)`,  // Display only
      requiredQuantity: (typeof fromNode.outputQty === 'number' && Number.isFinite(fromNode.outputQty)) ? fromNode.outputQty : 0,  // SCHEMA: requiredQuantity
      unitRatio: 1,  // SCHEMA: unitRatio
      derivedFrom: fromId  // Tracking only
    };
    toNode.materialInputs.push(autoMat);
    try { window.dispatchEvent(new CustomEvent('nodeMaterialsChanged', { detail: { nodeId: toId } })) } catch {}
  } else {
    // If a matching row exists, update it with new values
    const m = toNode.materialInputs[existingIdx]
    if (m) {
      m.derivedFrom = fromId
      m.materialCode = fromNode.semiCode || `node-${fromId}-output`  // SCHEMA
      m.name = fromNode.semiCode ? `${fromNode.semiCode}` : `${fromNode.name} (semi)`
      m.requiredQuantity = (typeof fromNode.outputQty === 'number' && Number.isFinite(fromNode.outputQty)) ? fromNode.outputQty : 0  // SCHEMA
      m.unitRatio = 1  // SCHEMA
      try { window.dispatchEvent(new CustomEvent('nodeMaterialsChanged', { detail: { nodeId: toId } })) } catch {}
    }
  }

  // Sequence'leri yeniden hesapla
  updateNodeSequences();

  // Render appropriate canvas
  if (planDesignerState.isFullscreen) {
    const fullscreenCanvas = document.getElementById('fullscreen-plan-canvas');
    if (fullscreenCanvas) renderCanvasContent(fullscreenCanvas);
  } else {
    renderCanvas();
  }
  
  showSuccessToast('Operations connected');
}

export function toggleConnectMode() {
  if (planDesignerState.readOnly) { showInfoToast('Read-only mode'); return; }
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
    showInfoToast('Connect mode active. Click source operation, then target operation.');
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
  if (planDesignerState.readOnly) { showInfoToast('Read-only mode'); return; }
  if (planDesignerState.nodes.length === 0) { 
    showInfoToast('Canvas is already empty'); 
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
    
    showSuccessToast('Canvas cleared');
  }
}

/**
 * Build station selector HTML with multi-select chips interface
 * @param {Object} node - The node being edited
 * @returns {Object} - { stationSelectHTML, missingStationsWarning }
 */
function buildStationSelector(node) {
  const availableStations = planDesignerState.availableStations || [];
  
  // CRITICAL: Extract station IDs from multiple possible formats
  // 1. assignedStations array (new format: [{ stationId: 'xxx' }])
  // 2. preferredStationIds array (legacy format: ['xxx', 'yyy'])
  // 3. preferredStations array (oldest format: station names/tags)
  
  let currentStationIds = [];
  
  // Parse assignedStations (new canonical format)
  if (Array.isArray(node.assignedStations) && node.assignedStations.length > 0) {
    node.assignedStations.forEach(item => {
      if (typeof item === 'string') {
        currentStationIds.push(item);
      } else if (item && item.stationId) {
        currentStationIds.push(item.stationId);
      }
    });
  }
  
  // Check legacy preferredStationIds field
  const preferredStationIds = node.preferredStationIds || [];
  if (currentStationIds.length === 0 && preferredStationIds.length > 0) {
    currentStationIds = [...preferredStationIds];
  }
  
  // Data migration: resolve old preferredStations (names/tags) to station IDs
  const legacyPreferredStations = node.preferredStations || [];
  const missingStations = [];
  
  if (legacyPreferredStations.length > 0 && currentStationIds.length === 0) {
    // Try to resolve station names/IDs to current format
    legacyPreferredStations.forEach(pref => {
      const station = availableStations.find(s => 
        s.id === pref || 
        s.name === pref ||
        (s.tags && s.tags.includes(pref))
      );
      if (station && !currentStationIds.includes(station.id)) {
        currentStationIds.push(station.id);
      } else if (!station) {
        missingStations.push(pref);
      }
    });
  }
  
  // Remove duplicates
  currentStationIds = [...new Set(currentStationIds)];
  
  // Check if any currently selected stations are missing
  currentStationIds.forEach(stationId => {
    const station = availableStations.find(s => s.id === stationId);
    if (!station) {
      missingStations.push(stationId);
    }
  });
  
  // Build multi-select with chips
  let stationSelectHTML = `
    <div style="border: 1px solid var(--border); border-radius: 4px; padding: 8px; background: white; min-height: 42px;">
      <div id="station-chips-container" style="display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 6px;">
        ${currentStationIds.map(stationId => {
          const station = availableStations.find(s => s.id === stationId);
          if (!station) {
            return `<span class="station-chip" data-station-id="${escapeHtml(stationId)}" style="display: inline-flex; align-items: center; gap: 4px; padding: 4px 8px; background: #fef3c7; border: 1px solid #fbbf24; border-radius: 4px; font-size: 12px; color: #92400e;">⚠️ ${escapeHtml(stationId)} (missing)<button type="button" onclick="removeStationChip('${escapeHtml(stationId)}')" style="border: none; background: none; cursor: pointer; padding: 0; margin-left: 4px; color: #92400e; font-weight: bold;">×</button></span>`;
          }
          const stationType = station.type || 'Unknown';
          const stationLabel = `${station.name} (${stationType})`;
          return `<span class="station-chip" data-station-id="${escapeHtml(station.id)}" style="display: inline-flex; align-items: center; gap: 4px; padding: 4px 8px; background: #dbeafe; border: 1px solid #3b82f6; border-radius: 4px; font-size: 12px; color: #1e40af;">${escapeHtml(stationLabel)}<button type="button" onclick="removeStationChip('${escapeHtml(station.id)}')" style="border: none; background: none; cursor: pointer; padding: 0; margin-left: 4px; color: #1e40af; font-weight: bold;">×</button></span>`;
        }).join('')}
      </div>
      <div style="position: relative;">
        <input 
          type="text" 
          id="station-search-input" 
          placeholder="Search and select stations..." 
          autocomplete="off"
          style="width: 100%; padding: 6px 8px; border: 1px solid #e5e7eb; border-radius: 4px; font-size: 13px;"
        />
        <div id="station-dropdown" style="display: none; position: absolute; top: 100%; left: 0; right: 0; max-height: 200px; overflow-y: auto; background: white; border: 1px solid #e5e7eb; border-radius: 4px; margin-top: 4px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); z-index: 1000;"></div>
      </div>
    </div>
  `;
  
  // Build warning for missing stations
  let missingStationsWarning = '';
  if (missingStations.length > 0) {
    const missingList = missingStations.map(s => escapeHtml(s)).join(', ');
    missingStationsWarning = `<div style="padding: 8px; background: #fef3c7; border: 1px solid #fbbf24; border-radius: 4px; font-size: 12px; color: #92400e; margin-top: 8px;">⚠️ Some previously selected stations no longer exist: ${missingList}. Please remove them and select new stations.</div>`;
  }
  
  return { stationSelectHTML, missingStationsWarning };
}

/**
 * Remove a station chip from the selection
 */
window.removeStationChip = function(stationId) {
  const chip = document.querySelector(`.station-chip[data-station-id="${stationId}"]`);
  if (chip) {
    chip.remove();
  }
};

/**
 * Setup station search and selection dropdown
 * Called after the form is rendered
 */
function setupStationSearch() {
  const searchInput = document.getElementById('station-search-input');
  const dropdown = document.getElementById('station-dropdown');
  if (!searchInput || !dropdown) return;
  
  const availableStations = planDesignerState.availableStations || [];
  
  // Show dropdown on focus
  searchInput.addEventListener('focus', () => {
    updateStationDropdown('');
    dropdown.style.display = 'block';
  });
  
  // Update dropdown on input
  searchInput.addEventListener('input', (e) => {
    updateStationDropdown(e.target.value.toLowerCase());
    dropdown.style.display = 'block';
  });
  
  // Hide dropdown on blur (with delay to allow click)
  searchInput.addEventListener('blur', () => {
    setTimeout(() => {
      dropdown.style.display = 'none';
      searchInput.value = '';
    }, 200);
  });
  
  function updateStationDropdown(searchTerm) {
    const chipsContainer = document.getElementById('station-chips-container');
    const selectedIds = Array.from(chipsContainer.querySelectorAll('.station-chip'))
      .map(chip => chip.getAttribute('data-station-id'));
    
    const filtered = availableStations.filter(station => {
      // Exclude already selected stations
      if (selectedIds.includes(station.id)) return false;
      
      // Filter by search term
      if (searchTerm) {
        const name = (station.name || '').toLowerCase();
        const type = (station.type || '').toLowerCase();
        const tags = (station.tags || []).map(t => t.toLowerCase()).join(' ');
        return name.includes(searchTerm) || type.includes(searchTerm) || tags.includes(searchTerm);
      }
      
      return true;
    });
    
    if (filtered.length === 0) {
      dropdown.innerHTML = '<div style="padding: 8px; color: #6b7280; font-size: 12px;">No stations found</div>';
      return;
    }
    
    dropdown.innerHTML = filtered.map(station => {
      const stationType = station.type || 'Unknown';
      const stationTags = station.tags && station.tags.length > 0 ? ` [${station.tags.join(', ')}]` : '';
      const label = `${station.name} (${stationType})${stationTags}`;
      
      return `<div class="station-option" data-station-id="${escapeHtml(station.id)}" style="padding: 8px; cursor: pointer; font-size: 13px; border-bottom: 1px solid #f3f4f6;" onmouseover="this.style.background='#f3f4f6'" onmouseout="this.style.background='white'" onclick="selectStation('${escapeHtml(station.id)}')">${escapeHtml(label)}</div>`;
    }).join('');
  }
}

/**
 * Select a station and add it as a chip
 */
window.selectStation = function(stationId) {
  const availableStations = planDesignerState.availableStations || [];
  const station = availableStations.find(s => s.id === stationId);
  if (!station) return;
  
  const chipsContainer = document.getElementById('station-chips-container');
  const searchInput = document.getElementById('station-search-input');
  
  // Check if already selected
  const existing = chipsContainer.querySelector(`.station-chip[data-station-id="${stationId}"]`);
  if (existing) return;
  
  // Add chip
  const stationType = station.type || 'Unknown';
  const stationLabel = `${station.name} (${stationType})`;
  const chipHTML = `<span class="station-chip" data-station-id="${escapeHtml(station.id)}" style="display: inline-flex; align-items: center; gap: 4px; padding: 4px 8px; background: #dbeafe; border: 1px solid #3b82f6; border-radius: 4px; font-size: 12px; color: #1e40af;">${escapeHtml(stationLabel)}<button type="button" onclick="removeStationChip('${escapeHtml(station.id)}')" style="border: none; background: none; cursor: pointer; padding: 0; margin-left: 4px; color: #1e40af; font-weight: bold;">×</button></span>`;
  
  chipsContainer.insertAdjacentHTML('beforeend', chipHTML);
  
  // Clear search
  if (searchInput) {
    searchInput.value = '';
    searchInput.focus();
  }
};

// Global escape handler for modal
let modalEscapeHandler = null;

export async function editNode(nodeId) {
  const node = planDesignerState.nodes.find(n => n.id === nodeId);
  if (!node) return; 
  planDesignerState.selectedNode = node;
  
  // Build form content with rules-based fields only
  const requiredSkills = node.requiredSkills || [];
  const assignmentMode = node.assignmentMode || 'auto';  // SCHEMA-COMPLIANT
  
  // Build worker select options with skill filtering
  const availableWorkers = planDesignerState.availableWorkers || [];
  const selectedWorkerId = node.assignedWorkerId || '';
  
  // Filter workers by required skills
  const matchingWorkers = availableWorkers.filter(worker => {
    const workerSkills = worker.skills || [];
    // If no required skills, show all workers
    if (requiredSkills.length === 0) return true;
    // Worker must have ALL required skills
    return requiredSkills.every(skill => workerSkills.includes(skill));
  });
  
  let workerOptions = '<option value="">-- Select a worker --</option>';
  let workerNotFoundWarning = '';
  
  // If no matching workers, show warning
  if (matchingWorkers.length === 0 && requiredSkills.length > 0) {
    workerOptions += '<option value="" disabled>⚠️ No workers with required skills found</option>';
    workerNotFoundWarning = `<div style="padding: 8px; background: #fef3c7; border: 1px solid #fbbf24; border-radius: 4px; font-size: 12px; color: #92400e; margin-top: 8px;">⚠️ No workers have all required skills (${requiredSkills.join(', ')}). Please use auto-assignment or add skills to workers.</div>`;
  } else {
    matchingWorkers.forEach(worker => {
      const skills = (worker.skills || []).join(', ') || 'No skills';
      const shift = worker.shift || 'Day';
      const label = `${worker.name} (${shift} shift, Skills: ${skills})`;
      const selected = worker.id === selectedWorkerId ? 'selected' : '';
      workerOptions += `<option value="${escapeHtml(worker.id)}" ${selected}>${escapeHtml(label)}</option>`;
    });
  }
  
  // Check if saved worker no longer exists or doesn't have required skills
  if (selectedWorkerId) {
    const savedWorker = availableWorkers.find(w => w.id === selectedWorkerId);
    if (!savedWorker) {
      workerNotFoundWarning = `<div style="padding: 8px; background: #fef3c7; border: 1px solid #fbbf24; border-radius: 4px; font-size: 12px; color: #92400e; margin-top: 8px;">⚠️ Previously selected worker "${escapeHtml(selectedWorkerId)}" no longer exists. Please select another worker.</div>`;
    } else if (!matchingWorkers.find(w => w.id === selectedWorkerId)) {
      workerNotFoundWarning = `<div style="padding: 8px; background: #fef3c7; border: 1px solid #fbbf24; border-radius: 4px; font-size: 12px; color: #92400e; margin-top: 8px;">⚠️ Previously selected worker "${escapeHtml(savedWorker.name)}" no longer has required skills (${requiredSkills.join(', ')}). Please select another worker.</div>`;
    }
  }
  
  // Build station selection UI
  const { stationSelectHTML, missingStationsWarning } = buildStationSelector(node);
  
  // Build capability tags input
  const preferredStationTags = node.preferredStationTags || [];
  const tagsInputValue = preferredStationTags.join(', ');
  
  // Get operation time (nominalTime is primary, time is internal fallback)
  const nominalTime = node.nominalTime || node.time || 60;
  
  // CRITICAL FIX: Parse efficiency correctly (0-1 range or percentage)
  let efficiency = 1.0;
  if (node.efficiency !== undefined && node.efficiency !== null) {
    const effVal = parseFloat(node.efficiency);
    // If efficiency > 1, it's in percentage (e.g., 80), convert to decimal
    efficiency = effVal > 1 ? effVal / 100 : effVal;
  }
  
  const effectiveTime = nominalTime > 0 && efficiency > 0 
    ? Math.round(nominalTime / efficiency) 
    : nominalTime;
  const efficiencyPercent = efficiency * 100;
  
  // Build material inputs display
  const materialInputs = node.materialInputs || [];
  let materialsHTML = '<div style="margin-bottom: 16px;"><label style="display: block; margin-bottom: 4px; font-weight: 500;">Material Inputs</label>';
  
  if (materialInputs.length === 0) {
    materialsHTML += '<div style="font-size: 12px; color: var(--muted-foreground); padding: 8px; background: #f9fafb; border-radius: 4px;">No material inputs defined</div>';
  } else {
    materialsHTML += '<div style="border: 1px solid var(--border); border-radius: 4px; overflow: hidden;">';
    materialInputs.forEach((mat, idx) => {
      const bgColor = idx % 2 === 0 ? '#ffffff' : '#f9fafb';
      const materialCode = mat.materialCode || mat.code || 'N/A';
      const quantity = mat.requiredQuantity || mat.quantity || 0;
      const ratio = mat.unitRatio !== undefined ? mat.unitRatio : 1;
      
      materialsHTML += `
        <div style="padding: 8px 12px; background: ${bgColor}; display: flex; justify-content: space-between; align-items: center;">
          <div style="flex: 1;">
            <div style="font-size: 13px; font-weight: 500; color: #1f2937;">${escapeHtml(materialCode)}</div>
            <div style="font-size: 11px; color: #6b7280; margin-top: 2px;">Qty: ${quantity} | Ratio: ${ratio}</div>
          </div>
        </div>
      `;
    });
    materialsHTML += '</div>';
  }
  materialsHTML += '<div style="font-size: 11px; color: #6b7280; margin-top: 4px;">Material inputs are inherited from the operation definition</div></div>';
  
  const formContent =
    '<div style="margin-bottom: 16px;"><label style="display: block; margin-bottom: 4px; font-weight: 500;">Operation Name</label><input type="text" id="edit-name" value="' + escapeHtml(node.name) + '" style="width: 100%; padding: 8px; border: 1px solid var(--border); border-radius: 4px;" /></div>' +
    '<div style="margin-bottom: 16px;"><label style="display: block; margin-bottom: 4px; font-weight: 500;">Nominal Time (minutes)</label><input type="number" id="edit-time" value="' + nominalTime + '" min="1" style="width: 100%; padding: 8px; border: 1px solid var(--border); border-radius: 4px;" oninput="updateEffectiveTimePreview()" /><div style="font-size: 11px; color: #6b7280; margin-top: 4px;">Design-time duration (will be adjusted by efficiency)</div></div>' +
    '<div style="margin-bottom: 16px;"><label style="display: block; margin-bottom: 4px; font-weight: 500;">Efficiency Override (%) <span style="font-size: 11px; color: #6b7280; font-weight: normal;">(optional)</span></label><input type="number" id="edit-efficiency" value="' + (efficiency < 1.0 ? efficiencyPercent.toFixed(1) : '') + '" min="1" max="100" step="0.1" placeholder="Leave empty for operation default" style="width: 100%; padding: 8px; border: 1px solid var(--border); border-radius: 4px;" oninput="updateEffectiveTimePreview()" /><div id="effective-time-preview" style="font-size: 12px; color: #3b82f6; margin-top: 4px; font-weight: 500;">Effective Time: ' + effectiveTime + ' min</div><div style="font-size: 11px; color: #6b7280; margin-top: 2px;">Lower efficiency → longer effective time (e.g., 80% = 1.25x time)</div></div>' +
    materialsHTML +
    '<div style="margin-bottom: 16px;"><label style="display: block; margin-bottom: 4px; font-weight: 500;">Required Skills</label><div style="font-size: 12px; color: var(--muted-foreground); padding: 8px; background: #f9fafb; border-radius: 4px;">' + (requiredSkills.length > 0 ? requiredSkills.join(', ') : 'None specified') + '</div><div style="font-size: 11px; color: #6b7280; margin-top: 4px;">Skills are inherited from the operation definition</div></div>' +
    '<div style="margin-bottom: 16px;"><label style="display: block; margin-bottom: 4px; font-weight: 500;">Preferred Specific Stations <span style="font-size: 11px; color: #6b7280; font-weight: normal;">(optional)</span> <span style="cursor: help; color: #3b82f6;" title="Select specific stations by name. At launch, the system will prefer these exact stations.">ℹ️</span></label>' + stationSelectHTML + missingStationsWarning + '<div style="font-size: 11px; color: #6b7280; margin-top: 4px;">Select specific stations for this operation. System will try to assign one of these first.</div></div>' +
    '<div style="margin-bottom: 16px;"><label style="display: block; margin-bottom: 4px; font-weight: 500;">Capability Tags <span style="font-size: 11px; color: #6b7280; font-weight: normal;">(optional)</span> <span style="cursor: help; color: #3b82f6;" title="Enter generic capability tags like \'CNC\', \'Welding\', etc. System will match stations with these tags as fallback.">ℹ️</span></label><input type="text" id="edit-station-tags" value="' + escapeHtml(tagsInputValue) + '" placeholder="e.g., CNC, Welding, Laser" style="width: 100%; padding: 8px; border: 1px solid var(--border); border-radius: 4px;" /><div style="font-size: 11px; color: #6b7280; margin-top: 4px;">Generic capabilities (comma-separated). Used if no specific station is available.</div></div>' +
    '<div style="margin-bottom: 16px;"><label style="display: block; margin-bottom: 4px; font-weight: 500;">Assignment Mode</label><div style="display: flex; gap: 16px;"><label style="display: flex; align-items: center; gap: 6px;"><input type="radio" name="assignment-mode" value="auto" ' + (assignmentMode === 'auto' ? 'checked' : '') + ' style="cursor: pointer;" />Auto (System assigns at launch)</label><label style="display: flex; align-items: center; gap: 6px;"><input type="radio" name="assignment-mode" value="manual" ' + (assignmentMode === 'manual' ? 'checked' : '') + ' style="cursor: pointer;" />Manual (Assign specific worker)</label></div></div>' +
    '<div id="worker-hint-section" style="margin-bottom: 16px; display: ' + (assignmentMode === 'manual' ? 'block' : 'none') + ';"><label style="display: block; margin-bottom: 4px; font-weight: 500;">Assigned Worker <span style="color: #ef4444;">*</span></label><select id="edit-worker-select" style="width: 100%; padding: 8px; border: 1px solid var(--border); border-radius: 4px; background: white;">' + workerOptions + '</select>' + workerNotFoundWarning + '<div style="font-size: 11px; color: #6b7280; margin-top: 4px;">Backend will assign this worker at launch (if available).</div></div>';
    
  document.getElementById('node-edit-form').innerHTML = formContent;
  
  // Setup station search dropdown
  setupStationSearch();
  
  // Add event listener for assignment mode radio buttons
  const radioButtons = document.querySelectorAll('input[name="assignment-mode"]');
  radioButtons.forEach(radio => {
    radio.addEventListener('change', (e) => {
      const workerHintSection = document.getElementById('worker-hint-section');
      if (workerHintSection) {
        workerHintSection.style.display = e.target.value === 'manual' ? 'block' : 'none';
      }
    });
  });
  
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
        const preview = node.semiCode || await getSemiCodePreviewForNode(node, planDesignerState.availableOperations || [], planDesignerState.availableStations || []).catch(() => null);
        if (preview) {
          label.textContent = `Output: ${preview}`;
        } else {
          const prefix = getPrefixForNode(node, planDesignerState.availableOperations || [], planDesignerState.availableStations || []);
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

// Helper function to update effectiveTime preview in node editor
window.updateEffectiveTimePreview = function() {
  try {
    const timeInput = document.getElementById('edit-time');
    const efficiencyInput = document.getElementById('edit-efficiency');
    const preview = document.getElementById('effective-time-preview');
    
    if (!timeInput || !preview) return;
    
    const nominalTime = parseInt(timeInput.value) || 0;
    const efficiencyPercent = parseFloat(efficiencyInput?.value || 100);
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
  if (planDesignerState.readOnly) { showInfoToast('Read-only mode'); return; }
  if (!planDesignerState.selectedNode) return;
  
  const name = document.getElementById('edit-name').value;
  const time = parseInt(document.getElementById('edit-time').value);
  const efficiencyInput = document.getElementById('edit-efficiency')?.value || '';
  const stationTagsInput = document.getElementById('edit-station-tags')?.value || '';
  const assignmentModeRadio = document.querySelector('input[name="assignment-mode"]:checked');
  const assignmentMode = assignmentModeRadio ? assignmentModeRadio.value : 'auto';
  const workerSelect = document.getElementById('edit-worker-select');
  const outQtyVal = document.getElementById('edit-output-qty')?.value;
  const outUnit = document.getElementById('edit-output-unit')?.value || '';
  
  if (!name || !time || time < 1) { 
    showErrorToast('Please fill all required fields'); 
    return; 
  }
  
  // Validate manual allocation has worker selected
  if (assignmentMode === 'manual') {
    const selectedWorkerId = workerSelect?.value || '';
    if (!selectedWorkerId) {
      showErrorToast('Manual allocation requires a worker selection');
      // Highlight the worker select field
      if (workerSelect) {
        workerSelect.style.border = '2px solid #ef4444';
        setTimeout(() => { workerSelect.style.border = '1px solid var(--border)'; }, 2000);
      }
      return;
    }
  }
  
  // Validate and convert efficiency (percent to decimal)
  if (efficiencyInput.trim() !== '') {
    const efficiencyPercent = parseFloat(efficiencyInput);
    if (!Number.isFinite(efficiencyPercent) || efficiencyPercent <= 0 || efficiencyPercent > 100) {
      showErrorToast('Efficiency must be between 0.1 and 100');
      const effInput = document.getElementById('edit-efficiency');
      if (effInput) {
        effInput.style.border = '2px solid #ef4444';
        setTimeout(() => { effInput.style.border = '1px solid var(--border)'; }, 2000);
      }
      return;
    }
    planDesignerState.selectedNode.efficiency = efficiencyPercent / 100; // Convert to decimal (0.0-1.0)
  } else {
    // Remove efficiency override if input is empty
    delete planDesignerState.selectedNode.efficiency;
  }
  
  // Update node with new values
  planDesignerState.selectedNode.name = name;
  planDesignerState.selectedNode.time = time;
  
  // Extract selected station IDs from chips
  const chipsContainer = document.getElementById('station-chips-container');
  const selectedStationIds = Array.from(chipsContainer.querySelectorAll('.station-chip'))
    .map(chip => chip.getAttribute('data-station-id'))
    .filter(id => id);
  
  planDesignerState.selectedNode.preferredStationIds = selectedStationIds;
  
  // Parse capability tags (comma-separated list)
  const stationTags = stationTagsInput
    .split(',')
    .map(s => s.trim())
    .filter(s => s.length > 0);
  planDesignerState.selectedNode.preferredStationTags = stationTags;
  
  // Store station IDs in legacy field for internal state consistency
  const legacyStations = [...selectedStationIds];
  planDesignerState.selectedNode.preferredStations = legacyStations;
  
  // Update assignment mode
  planDesignerState.selectedNode.assignmentMode = assignmentMode;
  
  // Update assigned worker (only if manual assignment)
  if (assignmentMode === 'manual' && workerSelect) {
    planDesignerState.selectedNode.assignedWorkerId = workerSelect.value;
  } else {
    planDesignerState.selectedNode.assignedWorkerId = null;
  }
  
  // Update output qty/unit
  const outQtyNum = outQtyVal === '' ? null : parseFloat(outQtyVal);
  planDesignerState.selectedNode.outputQty = Number.isFinite(outQtyNum) ? outQtyNum : null;
  planDesignerState.selectedNode.outputUnit = (outUnit || '').trim();
  
  // Update semi-code
  try { 
    computeAndAssignSemiCode(
      planDesignerState.selectedNode, 
      planDesignerState.availableOperations || [], 
      planDesignerState.availableStations || []
    ); 
  } catch {}
  
  // Upsert WIP material
  try {
    if (planDesignerState.selectedNode.semiCode) {
      getStations().then(sts => upsertProducedWipFromNode(planDesignerState.selectedNode, planDesignerState.availableOperations || [], sts)).catch(()=>{})
    }
  } catch {}
  
  renderCanvas();
  closeNodeEditModal();
  showSuccessToast('Operation updated');
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
  
  // Restore node to original state (cancel changes)
  if (planDesignerState.selectedNode && planDesignerState.nodeEditSnapshot) {
    const node = planDesignerState.selectedNode;
    const snapshot = planDesignerState.nodeEditSnapshot;
    
    // Restore all editable properties from snapshot
    node.name = snapshot.name;
    node.time = snapshot.time;
    node.efficiency = snapshot.efficiency;
    node.assignedStations = snapshot.assignedStations;
    node.assignmentMode = snapshot.assignmentMode;
    node.assignedWorkerId = snapshot.assignedWorkerId;
    node.assignedWorkerName = snapshot.assignedWorkerName;
    node.materialInputs = snapshot.materialInputs;
    node.outputQty = snapshot.outputQty;
    node.outputUnit = snapshot.outputUnit;
    node._isTemplateApplied = snapshot._isTemplateApplied;
    node._templateCode = snapshot._templateCode;
    node._templateRatios = snapshot._templateRatios;
    
    // Re-render canvas to show restored state
    renderCanvas();
  }
  
  // Clear temporary state
  planDesignerState.tempMaterialSelections = [];
  planDesignerState.nodeEditSnapshot = null;
  planDesignerState.selectedNode = null;
  
  // Remove escape key listener
  if (modalEscapeHandler) {
    document.removeEventListener('keydown', modalEscapeHandler);
    modalEscapeHandler = null;
  }
}

// Update downstream nodes' materialInputs when a node's output changes (SCHEMA-COMPLIANT)
export function propagateDerivedMaterialUpdate(fromNodeId) {
  const fromId = asIdString(fromNodeId)
  if (!fromId) return
  const fromNode = planDesignerState.nodes.find(n => asIdString(n.id) === fromId)
  if (!fromNode) return
  const updatedMaterialCode = fromNode.semiCode || `node-${fromId}-output`  // SCHEMA: materialCode
  const updatedLabel = fromNode.semiCode ? `${fromNode.semiCode}` : `${fromNode.name} (semi)`
  const updatedQty = (typeof fromNode.outputQty === 'number' && Number.isFinite(fromNode.outputQty)) ? fromNode.outputQty : 0  // SCHEMA: requiredQuantity

  planDesignerState.nodes.forEach(n => {
    if (!Array.isArray(n.materialInputs)) return
    let changed = false
    n.materialInputs.forEach(m => {
      if (m && asIdString(m.derivedFrom) === fromId) {
        m.materialCode = updatedMaterialCode     // SCHEMA: materialCode
        m.name = updatedLabel                    // Display only
        m.requiredQuantity = updatedQty          // SCHEMA: requiredQuantity
        m.unitRatio = 1                          // SCHEMA: unitRatio
        changed = true
      }
    })
    if (changed) {
      try { window.dispatchEvent(new CustomEvent('nodeMaterialsChanged', { detail: { nodeId: n.id } })) } catch {}
    }
  })
}

// ----- Material Flow Rendering -----
function asIdString(v) {
  return v == null ? '' : String(v)
}

function findNodeByIdAny(id) {
  const key = asIdString(id)
  return planDesignerState.nodes.find(n => asIdString(n.id) === key)
}

function topoSortNodes(nodes) {
  const arr = Array.isArray(nodes) ? nodes.slice() : []
  const idKey = n => asIdString(n.id)
  const idToNode = new Map(arr.map(n => [idKey(n), n]))
  const indeg = new Map(arr.map(n => [idKey(n), 0]))

  // NEW MODEL: Build indegrees from successor
  arr.forEach(n => {
    const from = idKey(n)
    if (n.successor) {
      const to = asIdString(n.successor)
      if (idToNode.has(to)) indeg.set(to, (indeg.get(to) || 0) + 1)
    }
  })

  // Kahn
  const q = []
  indeg.forEach((d, id) => { if ((d|0) === 0) q.push(id) })
  const order = []
  while (q.length) {
    const id = q.shift()
    const node = idToNode.get(id)
    if (!node) continue
    order.push(node)
    // NEW MODEL: Process successor
    if (node.successor) {
      const to = asIdString(node.successor)
      if (indeg.has(to)) {
        const nd = (indeg.get(to) || 0) - 1
        indeg.set(to, nd)
        if (nd === 0) q.push(to)
      }
    }
  }
  // Fallback: if cycle or missing, append remaining
  if (order.length < arr.length) {
    const picked = new Set(order.map(n => idKey(n)))
    arr.forEach(n => { if (!picked.has(idKey(n))) order.push(n) })
  }
  return order
}

function uniqueByKey(items, keyFn) {
  const seen = new Set()
  const out = []
  items.forEach(it => {
    const k = keyFn(it)
    if (seen.has(k)) return
    seen.add(k)
    out.push(it)
  })
  return out
}

function materialLabel(mat) {
  if (!mat) return ''
  const code = mat.code || mat.id || ''
  const name = mat.name || mat.title || ''
  return [code, name].filter(Boolean).join(' — ') || code || name || ''
}

function derivedLabel(mat) {
  const fromId = asIdString(mat?.derivedFrom)
  if (!fromId) return materialLabel(mat)
  const src = findNodeByIdAny(fromId)
  // Only show semi/material, never operation names. If no semi yet, hide.
  if (src && src.semiCode) return src.semiCode
  return ''
}




export function deleteNode(nodeId) {
  if (confirm('Are you sure you want to delete this Production Step?')) {
    // Remove the node itself
    planDesignerState.nodes = planDesignerState.nodes.filter(n => n.id !== nodeId);
    // Clean up edges, scheduling deps and auto-materials in remaining nodes
    planDesignerState.nodes.forEach(node => {
      // NEW MODEL: Clear successor if it points to deleted node
      if (node.successor === nodeId) {
        node.successor = null;
      }
      // Scheduling predecessors
      if (Array.isArray(node.predecessors)) {
        node.predecessors = node.predecessors.filter(pid => pid !== nodeId);
      }
      // Auto-propagated materials that originated from the deleted node
      if (Array.isArray(node.materialInputs)) {
        node.materialInputs = node.materialInputs.filter(m => !(m && m.derivedFrom === nodeId));
      }
    });
    
    // Sequence'leri yeniden hesapla
    updateNodeSequences();
    
    // Render appropriate canvas
    if (planDesignerState.isFullscreen) {
      const fullscreenCanvas = document.getElementById('fullscreen-plan-canvas');
      if (fullscreenCanvas) renderCanvasContent(fullscreenCanvas);
    } else {
      renderCanvas();
    }
    
    showSuccessToast('Operation deleted');
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
      showInfoToast(`Selected: ${order.product} (${order.quantity} units, due ${order.dueDate})`);
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
  if (planDesignerState.nodes.length === 0) { showErrorToast('Cannot save empty plan as template'); return; }
  const planNameInput = document.getElementById('plan-name');
  const planDescInput = document.getElementById('plan-description');
  const orderSelect = document.getElementById('order-select');
  const scheduleTypeSelect = document.getElementById('schedule-type');
  
  let planName = planNameInput ? planNameInput.value : '';
  const planDesc = planDescInput?.value || '';
  let orderCode = orderSelect ? orderSelect.value : '';
  const scheduleType = scheduleTypeSelect ? scheduleTypeSelect.value : 'one-time';
  
  // Get quantity from modal input if available, fallback to state
  const quantityInput = document.getElementById('modal-plan-quantity');
  const planQuantity = quantityInput ? (parseInt(quantityInput.value) || 1) : (planDesignerState.planQuantity || 1);
  
  if (planDesignerState.readOnly) {
    const base = (planDesignerState.currentPlanMeta?.name) || planName || 'Untitled';
    planName = `${base} - kopyası`;
    // Copying from a production plan: clear order linkage for the template
    orderCode = '';
  }
  if (!planName) { showErrorToast('Please enter a plan name'); return; }
  
  // If editing from an existing template, keep the same id to update and track lastModifiedBy
  const existingTplId = planDesignerState.currentPlanMeta?.sourceTemplateId || null;
  const template = {
    id: existingTplId || undefined,
    name: planName,
    description: planDesc,
    orderCode: orderCode,
    scheduleType: scheduleType,
    quantity: planQuantity,
    steps: JSON.parse(JSON.stringify(planDesignerState.nodes)),
    createdAt: new Date().toISOString(),
    status: 'template'
  };
  
  // Debug: Log the template object being saved
  console.log('🔍 TEMPLATE BEING SAVED:', {
    orderCode: template.orderCode,
    scheduleType: template.scheduleType,
    quantity: template.quantity,
    planQuantity: planQuantity,
    stateQuantity: planDesignerState.planQuantity,
    metaQuantity: planDesignerState.currentPlanMeta?.quantity,
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
    .then(async () => {
      // Commit pending semi codes before saving template
      const pendingCodes = collectPendingSemiCodes(planDesignerState.nodes);
      if (pendingCodes.length > 0) {
        try {
          console.log(`Committing ${pendingCodes.length} semi codes...`);
          const result = await commitSemiCodes(pendingCodes);
          console.log(`Semi codes committed: ${result.committed}, skipped: ${result.skipped}`);
          
          // Clear pending flags
          planDesignerState.nodes.forEach(node => {
            if (node._semiCodePending) {
              node._semiCodePending = false;
            }
          });
        } catch (error) {
          console.error('Failed to commit semi codes:', error);
          showWarningToast('Warning: Semi codes may not be persisted');
        }
      }
      
      return createTemplate(template);
    })
    .catch(() => {
      // As an extra fallback, still try to save with a local id
      template.id = template.id || genId('tpl-');
      return createTemplate(template)
    })
    .then(() => {
      const msg = existingTplId
        ? `Template updated: ${template.name}`
        : (planDesignerState.readOnly ? `Copied to template: ${template.name}` : `Template saved: ${template.name}`);
      showSuccessToast(msg);
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
      showErrorToast('Template save failed');
    });
}

// DEPRECATED: Material check modal removed from Plan Designer
// Material warnings now appear at launch time in Approved Quotes
export async function showMaterialCheckModal() {
  showInfoToast('Material checks are now performed at launch time');
}

export function closeMaterialCheckModal() {
  // No-op - modal no longer exists
}

// Export functions to global scope
window.showMaterialCheckModal = showMaterialCheckModal;
window.closeMaterialCheckModal = closeMaterialCheckModal;

/**
 * Sanitize nodes for backend submission
 * Transforms internal node structure to canonical backend schema
 * @param {Array} nodes - Frontend node objects
 * @returns {Array} Sanitized nodes with canonical field names (nodeId, nominalTime, etc.)
 */
function sanitizeNodesForBackend(nodes) {
  return nodes.map(node => {
    const sanitized = {
      // Backend canonical schema uses 'nodeId' throughout the codebase
      nodeId: node.id || node.nodeId,
      name: node.name || 'Unnamed Node',
      operationId: node.operationId,
      type: node.type || 'General',
      
      // Canvas layout coordinates
      x: typeof node.x === 'number' ? node.x : 100,
      y: typeof node.y === 'number' ? node.y : 100,
      
      // Timing: nominalTime is the canonical field
      nominalTime: node.nominalTime || 60,
      
      // Skills: support both requiredSkills (new) and skills (old) formats
      requiredSkills: Array.isArray(node.requiredSkills) 
        ? node.requiredSkills 
        : (Array.isArray(node.skills) ? node.skills : []),
      
      // Stations: convert various formats to canonical array of objects
      // Backend expects: [{ stationId: string, priority?: number }]
      assignedStations: node.assignedStationId && typeof node.assignedStationId === 'string'
        ? [{ stationId: node.assignedStationId, priority: 1 }]
        : (Array.isArray(node.assignedStations) 
          ? node.assignedStations.map(s => 
              typeof s === 'string' 
                ? { stationId: s, priority: 1 }
                : (s && s.stationId ? s : null)
            ).filter(Boolean)
          : []),
      
      // Worker assignment
      assignedSubstations: Array.isArray(node.assignedSubstations) ? node.assignedSubstations : [],
      assignmentMode: node.assignmentMode || 'auto',
      assignedWorkerId: node.assignedWorkerId || null,
      
      // Dependencies and workflow (NEW MODEL)
      predecessors: Array.isArray(node.predecessors) ? node.predecessors : [],
      successor: node.successor || null,
      
      // Material inputs (canonical schema)
      materialInputs: Array.isArray(node.materialInputs) 
        ? node.materialInputs.map(m => ({
            materialCode: m.materialCode,
            requiredQuantity: m.requiredQuantity || 0,
            unitRatio: m.unitRatio || 1
          }))
        : [],
      
      // Output configuration
      semiCode: node.semiCode || node.outputCode || null,
      outputCode: node.semiCode || node.outputCode || null,
      outputQty: parseFloat(node.outputQty) || 0,
      outputUnit: node.outputUnit || 'pcs',
      
      // Effective time (computed or fallback to nominal)
      effectiveTime: node.effectiveTime !== undefined && node.effectiveTime !== null 
        ? parseFloat(node.effectiveTime) 
        : (node.nominalTime || 60)
    };
    
    // Optional: efficiency (only if set)
    if (node.efficiency !== undefined && node.efficiency !== null) {
      sanitized.efficiency = parseFloat(node.efficiency);
    }
    
    return sanitized;
  });
}

export async function savePlanDraft() {
  console.log('🔵 savePlanDraft called');
  console.log('🔍 Current state:', {
    nodesCount: planDesignerState.nodes.length,
    mode: planDesignerState.currentPlanMeta?.mode,
    status: planDesignerState.currentPlanMeta?.status,
    sourceTemplateId: planDesignerState.currentPlanMeta?.sourceTemplateId
  });
  
  // Validation
  if (planDesignerState.nodes.length === 0) { 
    showErrorToast('Cannot save empty plan'); 
    return; 
  }
  
  // Validate nodes before saving (canonical schema validation)
  const validationErrors = [];
  const nodeIds = new Set();
  
  planDesignerState.nodes.forEach((node, idx) => {
    // Check for id
    if (!node.id || typeof node.id !== 'string' || node.id.trim() === '') {
      validationErrors.push(`Node ${idx + 1}: Missing or invalid id`);
    } else if (nodeIds.has(node.id)) {
      validationErrors.push(`Node ${idx + 1}: Duplicate id "${node.id}"`);
    } else {
      nodeIds.add(node.id);
    }
    
    // Check for nominalTime (or time as fallback)
    const nominalTime = node.nominalTime || node.time;
    if (!Number.isFinite(nominalTime) || nominalTime <= 0) {
      validationErrors.push(`Node ${idx + 1} (${node.id || 'unknown'}): nominalTime must be > 0`);
    }
    
    // Check predecessors reference existing nodes
    if (Array.isArray(node.predecessors)) {
      node.predecessors.forEach(predId => {
        if (!planDesignerState.nodes.find(n => n.id === predId)) {
          validationErrors.push(`Node ${idx + 1} (${node.id || 'unknown'}): predecessor "${predId}" not found`);
        }
      });
    }
  });
  
  if (validationErrors.length > 0) {
    console.error('❌ Validation errors:', validationErrors);
    showErrorToast(`Validation failed: ${validationErrors[0]}`);
    return;
  }
  
  const planName = document.getElementById('plan-name')?.value || 'Untitled';
  const planDesc = document.getElementById('plan-description')?.value || '';
  const orderCode = document.getElementById('order-select')?.value || '';
  const scheduleType = document.getElementById('schedule-type')?.value || 'one-time';
  
  if (!orderCode) {
    showWarningToast('Select a work order before saving this plan');
    return;
  }
  
  const quantityInput = document.getElementById('modal-plan-quantity');
  const planQuantity = quantityInput ? (parseInt(quantityInput.value) || 1) : (planDesignerState.planQuantity || 1);
  
  console.log('📝 Plan data:', { planName, orderCode, planQuantity });
  
  const meta = planDesignerState.currentPlanMeta || {};
  const isTemplateConversion = (meta.mode === 'edit' && meta.status === 'template' && meta.sourceTemplateId);
  
  console.log('🔀 Operation mode:', isTemplateConversion ? 'Template → Plan Conversion' : 'New Plan Creation');
  
  // Build common data structures
  const aggregatedMaterials = aggregatePlanMaterials(planDesignerState.nodes, planQuantity);
  const enrichedMaterials = aggregatedMaterials.map(mat => ({
    id: mat.id,
    code: mat.code,
    name: mat.name,
    required: mat.required,
    unit: mat.unit,
    isDerived: mat.isDerived || false,
    stock: 0,
    shortage: 0,
    isOk: true
  }));
  
  const wipOutputs = [];
  planDesignerState.nodes.forEach(node => {
    if (node.semiCode) {
      wipOutputs.push({
        code: node.semiCode,
        name: node.semiCode,
        quantity: (node.outputQty || 1) * planQuantity,
        unit: node.outputUnit || 'pcs',
        nodeId: node.id,
        operationId: node.operationId
      });
    }
  });
  
  const materialSummary = {
    checkedAt: new Date().toISOString(),
    totalItems: enrichedMaterials.length,
    allAvailable: false,
    hasShortages: false,
    items: enrichedMaterials,
    shortages: [],
    materialInputs: enrichedMaterials.map(item => ({
      materialCode: item.code,
      name: item.name,
      requiredQuantity: item.required,
      isDerived: item.isDerived
    })),
    wipOutputs
  };
  
  const timingSummary = planDesignerState.timingSummary || summarizePlanTiming(planDesignerState.nodes, planQuantity);
  
  // Commit semi codes before saving
  const pendingCodes = collectPendingSemiCodes(planDesignerState.nodes);
  if (pendingCodes.length > 0) {
    try {
      console.log(`Committing ${pendingCodes.length} semi codes...`);
      const result = await commitSemiCodes(pendingCodes);
      console.log(`Semi codes committed: ${result.committed}, skipped: ${result.skipped}`);
      
      planDesignerState.nodes.forEach(node => {
        if (node._semiCodePending) {
          node._semiCodePending = false;
        }
      });
    } catch (error) {
      console.error('Failed to commit semi codes:', error);
      showWarningToast('Warning: Semi codes may not be persisted');
    }
  }
  
  // TEMPLATE CONVERSION PATH
  if (isTemplateConversion) {
    console.log('📦 Converting template to production plan...');
    const templateId = meta.sourceTemplateId;
    
    // Sanitize nodes to canonical schema
    const sanitizedNodes = sanitizeNodesForBackend(planDesignerState.nodes);
    
    const updates = {
      name: planName,
      description: planDesc,
      orderCode,
      scheduleType,
      quantity: planQuantity,
      nodes: sanitizedNodes,  // CANONICAL: Sanitized nodes with canonical field names
      status: 'production',
      autoAssign: true,
      materialSummary,
      timingSummary
    };
    
    try {
      await updateProductionPlan(templateId, updates);
      showSuccessToast(`Plan converted to production: ${planName}`);
      planDesignerState.nodes = [];
      renderCanvas();
      cancelPlanCreation();
      setActivePlanTab('production');
      try { if (typeof window.loadAndRenderPlans === 'function') window.loadAndRenderPlans(); } catch {}
    } catch (e) {
      console.error('❌ Plan conversion failed', e);
      showErrorToast('Plan conversion failed');
    }
    return;
  }
  
  // NEW PLAN CREATION PATH
  console.log('✨ Creating new production plan...');
  
  // Sanitize nodes to canonical schema
  const sanitizedNodes = sanitizeNodesForBackend(planDesignerState.nodes);
  
  const plan = {
    id: undefined,
    name: planName,
    description: planDesc,
    orderCode,
    scheduleType,
    quantity: planQuantity,
    nodes: sanitizedNodes,  // CANONICAL: Use sanitized nodes
    createdAt: new Date().toISOString(),
    status: 'production',
    autoAssign: true,
    materialSummary,
    timingSummary
  };
  
  // Verification logging
  console.log('📤 Sending plan to backend:');
  console.log('  - Nodes count:', plan.nodes.length);
  if (plan.nodes.length > 0) {
    console.log('  - First node fields:', Object.keys(plan.nodes[0]));
    console.log('  - Has nominalTime:', plan.nodes[0]?.nominalTime ? '✅ YES' : '❌ NO');
    console.log('  - Has requiredSkills:', plan.nodes[0]?.requiredSkills ? '✅ YES' : '❌ NO');
    console.log('  - Has assignedStations:', Array.isArray(plan.nodes[0]?.assignedStations) ? '✅ YES (array)' : '❌ NO');
    console.log('  - Has efficiency:', plan.nodes[0]?.efficiency !== undefined ? `✅ YES (${plan.nodes[0].efficiency})` : 'ℹ️ NO (will use operation default)');
    console.log('  - First node materialInputs:', JSON.stringify(plan.nodes[0]?.materialInputs, null, 2));
    console.log('  - First node assignedStations:', JSON.stringify(plan.nodes[0]?.assignedStations, null, 2));
  }
  
  try {
    const newId = await getNextProductionPlanId();
    plan.id = newId || genId('plan-');
    console.log('🆔 Generated plan ID:', plan.id);
    
    await createProductionPlan(plan);
    console.log('✅ Plan created successfully');
    
    showSuccessToast(`Plan saved: ${plan.name}`);
    planDesignerState.nodes = [];
    renderCanvas();
    cancelPlanCreation();
    setActivePlanTab('production');
    try { if (typeof window.loadAndRenderPlans === 'function') window.loadAndRenderPlans(); } catch {}
  } catch (e) {
    console.error('❌ Plan save failed', e);
    showErrorToast(`Plan save failed: ${e.message || 'Unknown error'}`);
  }
}

export function deployWorkOrder() {
  if (planDesignerState.nodes.length === 0) { showErrorToast('Cannot deploy empty plan'); return; }
  const planName = document.getElementById('plan-name').value;
  const selectedOrder = document.getElementById('order-select').value;
  if (!planName) { showErrorToast('Please enter a plan name'); return; }
  if (!selectedOrder) { showErrorToast('Please select an order'); return; }
  
  // Note: Worker/station assignment is now done at launch time, not during plan creation
  const totalTime = planDesignerState.nodes.reduce((sum, n) => sum + n.time, 0);
  showSuccessToast(`Work Order deployed successfully! Total estimated time: ${totalTime} minutes`);
  planDesignerState.nodes = [];
  const pn = document.getElementById('plan-name'); if (pn) pn.value = '';
  const pd = document.getElementById('plan-description'); if (pd) pd.value = '';
  const os = document.getElementById('order-select'); if (os) os.value = '';
  renderCanvas();
}

// Release plan to production (launches auto-assignment engine)
export async function releasePlanToProduction() {
  // Validation: Plan must be saved
  const currentPlanMeta = planDesignerState.currentPlanMeta;
  if (!currentPlanMeta || !currentPlanMeta.id) {
    showWarningToast('Plan must be saved before releasing to production');
    return;
  }
  
  const planId = currentPlanMeta.id;
  
  // Material validation removed - checks happen at launch time in Approved Quotes
  console.log('✓ Releasing plan without material checks (validation at launch)');
  
  try {
    showInfoToast('Releasing plan to production...');
    
    // Step 1: Update plan status to 'released'
    // The backend auto-assignment engine will handle worker/station assignment at launch
    await updateProductionPlan(planId, {
      status: 'released',
      releaseNotes: `Released on ${new Date().toLocaleString('tr-TR')}`,
      launchMode: 'auto' // Trigger backend auto-assignment engine
    });
    
    console.log(`✓ Plan ${planId} released - backend will handle resource assignment`);
    
    // Show success message
    showSuccessToast('Plan marked as production-ready! Use "Başlat" button in Approved Quotes to launch with auto-assignment.');
    
    // Dispatch event to refresh workers view
    window.dispatchEvent(new CustomEvent('assignments:updated'));
    
    // Update current plan meta to reflect new status
    if (planDesignerState.currentPlanMeta) {
      planDesignerState.currentPlanMeta.status = 'released';
    }
    
    // Refresh plan list
    try {
      if (typeof window.loadAndRenderPlans === 'function') {
        window.loadAndRenderPlans();
      }
    } catch (e) {
      console.warn('Could not refresh plan list:', e);
    }
    
  } catch (error) {
    console.error('Failed to release plan:', error);
    showErrorToast(`Failed to release plan: ${error.message}`);
  }
}

export function handleCanvasClick(event) {
  if (planDesignerState.connectMode && (event.target.id === 'plan-canvas' || event.target.id === 'fullscreen-plan-canvas')) {
    planDesignerState.connectMode = false; planDesignerState.connectingFrom = null; updateConnectButton(); showInfoToast('Connect mode cancelled');
    // Clear any target highlight
    if (planDesignerState.connectionTarget) {
      removeConnectionTargetHighlight(planDesignerState.connectionTarget);
      planDesignerState.connectionTarget = null;
    }
    planDesignerState.connectionSource = null;
  }
}

export async function initializePlanDesigner() {
  setTimeout(async () => {
    await loadOperationsToolbox();
    renderCanvas();
    
    // Load orders into the dropdown
    await loadOrdersIntoSelect();
    
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
  
  // Also update quantity from modal if available
  const quantityInput = document.getElementById('modal-plan-quantity');
  if (quantityInput) {
    const quantity = parseInt(quantityInput.value) || 1;
    planDesignerState.planQuantity = quantity;
    if (planDesignerState.currentPlanMeta) {
      planDesignerState.currentPlanMeta.quantity = quantity;
    }
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
export async function toggleCanvasFullscreen() {
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
    await syncCanvasToFullscreen();
  }
}

async function syncCanvasToFullscreen() {
  // Set fullscreen mode
  planDesignerState.isFullscreen = true;
  
  // Reset zoom to 100% and pan to center
  planDesignerState.fullscreenZoom = 100;
  resetCanvasPan();
  setCanvasZoom(100);
  
  // Set appropriate cursor based on current mode
  updateCanvasCursor();
  
  // Load operations in fullscreen list
  await loadOperationsToolbox();
  
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

  // NEW MODEL: Render successor connections first
  planDesignerState.nodes.forEach(node => {
    if (node.successor) {
      const targetNode = planDesignerState.nodes.find(n => n.id === node.successor);
      if (targetNode) renderConnection(node, targetNode, canvasElement);
    }
  });
  
  // Render nodes using the same renderNode function
  planDesignerState.nodes.forEach(node => renderNode(node, canvasElement));
}

// Make functions globally available - wrapper for async function
window.toggleCanvasFullscreen = () => {
  toggleCanvasFullscreen().catch(console.error);
};

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
  planDesignerState.timingSummary = null;
  
  resetConnectionState();
  updateConnectButton();
  updateCanvasCursor();

  if (!preserveMeta) {
    planDesignerState.currentPlanMeta = {
      mode: 'create', // create | edit | view
      status: null,
      sourceTemplateId: null,
      id: null
    };
    planDesignerState.planQuantity = 1;
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
  
  console.log('🔄 Plan Designer State Reset', { 
    mode: planDesignerState.currentPlanMeta?.mode,
    preserveMeta 
  });
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

    // NEW MODEL: Normalize successor (single value)
    node.successor = node.successor ? String(node.successor).trim() : null;
    
    node.predecessors = Array.isArray(node?.predecessors)
      ? node.predecessors.filter(Boolean).map(val => String(val).trim())
      : [];

    const materials = Array.isArray(node?.materialInputs) ? node.materialInputs : [];
    node.materialInputs = materials.map(mat => ({ ...mat }));

    if (!Number.isFinite(node?.x)) {
      node.x = 80 + (index % 6) * 180;
    }
    if (!Number.isFinite(node?.y)) {
      node.y = 80 + Math.floor(index / 6) * 140;
    }

    // Strip legacy assignment fields to prevent data leakage
    delete node.assignedWorker;
    delete node.assignedWorkerId;
    delete node.assignedWorkerName;
    delete node.assignedStation;
    delete node.assignedStationId;
    delete node.assignedStationName;
    delete node.assignedSubStation;
    delete node.startTime;
    delete node.endTime;
    delete node.assignmentMode;
    delete node.requiresAttention;
    delete node.assignmentWarnings;
    delete node.effectiveTime;
    
    // Migrate legacy fields to new structure if they don't exist
    if (!node.requiredSkills && node.skills) {
      node.requiredSkills = node.skills;
      delete node.skills;
    }
    if (!node.requiredSkills) {
      node.requiredSkills = [];
    }
    if (!node.preferredStations) {
      node.preferredStations = [];
    }
    if (!node.assignmentMode) {
      node.assignmentMode = 'auto';
    }
    if (!node.workerHint) {
      node.workerHint = null;
    }
    if (!node.priorityTag) {
      node.priorityTag = null;
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
    // NEW MODEL: Resolve successor
    node.successor = resolveId(node.successor);
    node.predecessors = node.predecessors.map(resolveId).filter(Boolean);
    node.materialInputs = (node.materialInputs || []).map(mat => ({
      ...mat,
      derivedFrom: resolveId(mat?.derivedFrom)
    }));
  });
  
  // BACKWARD COMPATIBILITY: Build successor from predecessors if missing
  cloned.forEach(node => {
    if (!node.successor) {
      // Find the node that has this node as predecessor (if single)
      const successors = cloned.filter(n => n.predecessors && n.predecessors.includes(node.id));
      if (successors.length === 1) {
        node.successor = successors[0].id;
      }
    }
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

// Set metadata (name, description, order, schedule type, quantity) into Plan Configuration UI
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
    
    // Set plan quantity
    planDesignerState.planQuantity = meta.quantity || 1;
    const quantityInput = document.getElementById('modal-plan-quantity');
    if (quantityInput) {
      quantityInput.value = planDesignerState.planQuantity;
      console.log('🔍 setPlanMeta - Set quantity input to:', quantityInput.value, 'from meta.quantity:', meta.quantity);
    }
    
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
    // Plan type button should still be clickable in read-only mode to view details
    if (typeBtn) { 
      typeBtn.style.opacity = flag ? '0.8' : '1';
      // Remove pointer-events restriction so modal can open in read-only mode
    }
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
  
  // Reset plan quantity to 1
  const quantityInput = document.getElementById('modal-plan-quantity');
  if (quantityInput) {
    quantityInput.value = 1;
  }
  planDesignerState.planQuantity = 1;
  
  // Reset plan type in state
  if (planDesignerState.currentPlanMeta) {
    planDesignerState.currentPlanMeta.scheduleType = null;
    planDesignerState.currentPlanMeta.quantity = 1;
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
  
  // Get and save plan quantity
  const quantityInput = document.getElementById('modal-plan-quantity');
  if (quantityInput) {
    const quantity = parseInt(quantityInput.value) || 1;
    planDesignerState.planQuantity = quantity;
    if (planDesignerState.currentPlanMeta) {
      planDesignerState.currentPlanMeta.quantity = quantity;
    }
    console.log('Applied plan quantity:', quantity);
  }
  
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
  
  // Initialize plan quantity - use meta first, then state, then default
  const quantityInput = document.getElementById('modal-plan-quantity');
  if (quantityInput) {
    const currentQuantity = planDesignerState.currentPlanMeta?.quantity || planDesignerState.planQuantity || 1;
    quantityInput.value = currentQuantity;
    planDesignerState.planQuantity = currentQuantity; // Sync state
    console.log('Set plan quantity to:', quantityInput.value, 'from meta:', planDesignerState.currentPlanMeta?.quantity);
  }
  
  // Set modal elements to read-only if in view mode
  const isReadOnly = planDesignerState.readOnly;
  if (isReadOnly) {
    setPlanTypeModalReadOnly(true);
    
    // Update modal title for view mode
    const modalTitle = document.getElementById('plan-type-modal-title');
    if (modalTitle) {
      modalTitle.textContent = 'Plan Türü Detayları (Görüntüleme)';
    }
  } else {
    // Update modal title for edit mode
    const modalTitle = document.getElementById('plan-type-modal-title');
    if (modalTitle) {
      modalTitle.textContent = 'Plan Türü Ayarları';
    }
  }
}

// Set plan type modal elements to read-only state
function setPlanTypeModalReadOnly(flag) {
  try {
    // Disable radio buttons
    const radioButtons = document.querySelectorAll('input[name="plan-type-radio"]');
    radioButtons.forEach(radio => {
      radio.disabled = flag;
      if (flag) radio.style.pointerEvents = 'none';
    });
    
    // Disable quantity input
    const quantityInput = document.getElementById('modal-plan-quantity');
    if (quantityInput) {
      quantityInput.readOnly = flag;
      if (flag) {
        quantityInput.style.backgroundColor = '#f9fafb';
        quantityInput.style.cursor = 'not-allowed';
      }
    }
    
    // Disable recurring selects
    const recurringType = document.getElementById('modal-recurring-type');
    if (recurringType) {
      recurringType.disabled = flag;
      if (flag) recurringType.style.backgroundColor = '#f9fafb';
    }
    
    const periodicFreq = document.getElementById('modal-periodic-frequency');
    if (periodicFreq) {
      periodicFreq.disabled = flag;
      if (flag) periodicFreq.style.backgroundColor = '#f9fafb';
    }
    
    const customFreq = document.getElementById('modal-custom-frequency');
    if (customFreq) {
      customFreq.readOnly = flag;
      if (flag) {
        customFreq.style.backgroundColor = '#f9fafb';
        customFreq.style.cursor = 'not-allowed';
      }
    }
    
    // Hide action buttons in read-only mode
    const clearBtn = document.getElementById('plan-type-clear');
    const applyBtn = document.getElementById('modal-apply-btn');
    if (flag) {
      if (clearBtn) clearBtn.style.display = 'none';
      if (applyBtn) applyBtn.style.display = 'none';
    } else {
      if (clearBtn) clearBtn.style.display = '';
      if (applyBtn) applyBtn.style.display = '';
    }
  } catch (e) {
    console.warn('Error setting plan type modal read-only state:', e);
  }
}

// Handle plan quantity change
window.handlePlanQuantityChange = function() {
  const quantityInput = document.getElementById('modal-plan-quantity');
  if (!quantityInput) return;
  
  const newQuantity = parseInt(quantityInput.value) || 1;
  
  // Ensure minimum value is 1
  if (newQuantity < 1) {
    quantityInput.value = 1;
    planDesignerState.planQuantity = 1;
  } else {
    planDesignerState.planQuantity = newQuantity;
  }
  
  // Save to current plan meta if exists
  if (planDesignerState.currentPlanMeta) {
    planDesignerState.currentPlanMeta.quantity = planDesignerState.planQuantity;
  }
  
  console.log('Plan quantity changed to:', planDesignerState.planQuantity);
};
