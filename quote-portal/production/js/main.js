// Entry point: wire modules to global for inline handlers to keep working
import { MESData, loadData, saveData, currentView, setCurrentView, getSavedView } from './state.js';
import { showToast } from './ui.js';
import { generateModernDashboard, generateWorkerPanel, generateSettings, generateOperations, generateWorkers, generateStations, generateStationDuplicateModal, generatePlanDesigner, generateTemplates, generateApprovedQuotes, injectMetadataToggleStyles, toggleMetadataColumns } from './views.js';
import { initPlanOverviewUI, setActivePlanTab, openCreatePlan, filterProductionPlans, togglePlanFilterPanel, hidePlanFilterPanel, onPlanFilterChange, clearPlanFilter, clearAllPlanFilters, cancelPlanCreation, viewProductionPlan, editTemplateById } from './planOverview.js';
import { initializeWorkersUI, openAddWorkerModal, editWorker, deleteWorker as deleteWorkerAction, saveWorker, closeWorkerModal, showWorkerDetail, closeWorkerDetail, editWorkerFromDetail, deleteWorkerFromDetail } from './workers.js';
import { initializePlanDesigner, loadOperationsToolbox, handleOperationDragStart, handleCanvasDragOver, handleCanvasDrop, renderCanvas, editNode, saveNodeEdit, closeNodeEditModal, deleteNode, toggleConnectMode, clearCanvas, handleOrderChange, savePlanAsTemplate, deployWorkOrder, handleCanvasClick, handleScheduleTypeChange, handleRecurringTypeChange, handlePeriodicFrequencyChange, savePlanDraft, togglePlanOrderPanel, hidePlanOrderPanel, clearPlanOrder, filterPlanOrderList, selectPlanOrder, togglePlanTypePanel, hidePlanTypePanel, clearPlanType, selectPlanType } from './planDesigner.js';
import { loadOperationsToolboxBackend, editNodeBackend, handleCanvasDropBackend, loadApprovedOrdersToSelect, handleOrderChangeBackend, saveNodeEditBackend, handleAssignModeChangeBackend, handleStationChangeInEdit, openMaterialDropdown, filterMaterialDropdown, selectMaterialFromDropdown, debugMaterialsLoad, debugShowAllMaterials, addMaterialRow, removeMaterialRow, updateOutputCodePreviewBackend } from './planDesignerBackend.js';
import { openAddStationModal, editStation, closeStationModal, saveStation, toggleStationStatus, deleteStation as deleteStationAction, initializeStationsUI, setActiveStationTab, deleteStationFromModal, showStationDetail, closeStationDetail, editStationFromDetail, duplicateStationFromDetail, showStationDuplicateModal, closeStationDuplicateModal, confirmStationDuplicate, deleteStationFromDetail, handleSubStationAdd, handleSubStationAddInputChange, toggleSubStationStatus, deleteSubStation, sortStations } from './stations.js';
import { initializeOperationsUI, openAddOperationModal, editOperation, deleteOperation, saveOperation, closeOperationModal, showOperationDetail, closeOperationDetail, editOperationFromDetail, deleteOperationFromDetail, openOperationTypesModal, closeOperationTypesModal, addOperationTypeFromModal, editOperationType, deleteOperationTypeConfirm, toggleOperationTypeDropdown, selectOperationTypeFromDropdown, addNewOperationTypeFromInput } from './operations.js';
import { openHelp, closeHelp, switchHelpTab, toggleFAQ, initHelp } from './help.js';
import { initializeApprovedQuotesUI, showApprovedQuoteDetail, closeApprovedQuoteDetail, toggleAQFilterPanel, hideAQFilterPanel, onAQFilterChange, clearAQFilter, clearAllAQFilters, applyAQDeliveryFilter, toggleAQPlanType, applyOverdueFilter, applyQuickDateFilter, sortApprovedQuotes } from './approvedQuotes.js';
import { initMasterDataUI, addSkillFromSettings, renameSkill, deleteSkill } from './masterData.js';
import { toggleMobileNav, closeMobileNav } from './mobile.js';

function renderView(viewId) {
  let content = '';
  switch (viewId) {
    case 'dashboard': content = generateModernDashboard(); break;
    case 'worker-panel': content = generateWorkerPanel(); break;
    case 'plan-designer':
      content = generatePlanDesigner();
      setTimeout(() => {
        initPlanOverviewUI();
        // Initialize designer backend (designer UI is initially hidden but present in DOM)
        initializePlanDesigner();
        loadOperationsToolboxBackend();
        loadApprovedOrdersToSelect();
        // Inject metadata toggle styles
        injectMetadataToggleStyles();
        
        // Check URL parameters for auto-actions
        const urlParams = new URLSearchParams(window.location.search);
        const action = urlParams.get('action');
        const orderCode = urlParams.get('orderCode');
        
        if (action === 'create') {
          // Trigger create new plan
          openCreatePlan();

          // If orderCode is provided, auto-select it after orders load
          if (orderCode) {
            // Try multiple times in case async population takes longer
            let attempts = 0;
            const trySelect = () => {
              attempts++;
              try {
                const select = document.getElementById('order-select');
                const labelEl = document.getElementById('plan-order-label');
                if (select && select.options && select.options.length > 0) {
                  // Prefer the actual option label if present
                  const opt = Array.from(select.options).find(o => o.value === orderCode);
                  const label = opt ? opt.textContent : `${orderCode}`;
                  selectPlanOrder(orderCode, label);
                  // Ensure visible label reflects selection
                  if (labelEl) labelEl.textContent = label;
                  return; // success
                }
              } catch (_) {}
              if (attempts < 10) setTimeout(trySelect, 200);
            };
            setTimeout(trySelect, 400);
          }
        }
      }, 100);
      break;
    case 'templates': content = generateTemplates(); break;
    case 'approved-quotes': content = generateApprovedQuotes(); setTimeout(() => initializeApprovedQuotesUI(), 0); break;
    case 'settings': 
      content = generateSettings(); 
      setTimeout(() => {
        initMasterDataUI();
        initializeTimeline();
      }, 0); 
      break;
    case 'stations': content = generateStations() + generateStationDuplicateModal(); setTimeout(() => initializeStationsUI(), 0); break;
    case 'operations': content = generateOperations(); setTimeout(() => initializeOperationsUI(), 0); break;
    case 'workers': content = generateWorkers(); setTimeout(() => initializeWorkersUI(), 0); break;
    default: content = generateModernDashboard();
  }
  document.getElementById('content-area').innerHTML = content;
}

// expose navigation keeping inline onclick working
function navigateToView(viewId) {
  setCurrentView(viewId);
  closeMobileNav();
  document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
  const clickedItem = document.querySelector(`[onclick="navigateToView('${viewId}')"]`);
  if (clickedItem) clickedItem.classList.add('active');
  renderView(viewId);
}

// Attach to window for inline event handlers
Object.assign(window, {
  MESData, saveData, showToast,
  navigateToView,
  // plan designer handlers
  // prefer backend-enhanced versions where provided
  loadOperationsToolbox: loadOperationsToolboxBackend, handleOperationDragStart, handleCanvasDragOver, handleCanvasDrop: handleCanvasDropBackend, renderCanvas,
  editNode: editNodeBackend, saveNodeEdit: saveNodeEditBackend, closeNodeEditModal, deleteNode, toggleConnectMode, clearCanvas, handleOrderChange, savePlanAsTemplate, deployWorkOrder, handleCanvasClick,
  savePlanDraft,
  // plan designer schedule UI handlers
  handleScheduleTypeChange, handleRecurringTypeChange, handlePeriodicFrequencyChange,
  // override order change to use backend-loaded orders
  handleOrderChange: handleOrderChangeBackend,
  handleAssignModeChangeBackend,
  handleStationChangeInEdit,
  openMaterialDropdown, filterMaterialDropdown, selectMaterialFromDropdown, debugMaterialsLoad, debugShowAllMaterials, addMaterialRow, removeMaterialRow,
  updateOutputCodePreviewBackend,
  // plan order/type dropdown helpers
  togglePlanOrderPanel, hidePlanOrderPanel, clearPlanOrder, filterPlanOrderList, selectPlanOrder,
  togglePlanTypePanel, hidePlanTypePanel, clearPlanType, selectPlanType,
  // stations
  openAddStationModal, editStation, closeStationModal, saveStation, toggleStationStatus, deleteStation: deleteStationAction, setActiveStationTab, deleteStationFromModal, showStationDetail, closeStationDetail, editStationFromDetail, duplicateStationFromDetail, showStationDuplicateModal, closeStationDuplicateModal, confirmStationDuplicate, deleteStationFromDetail, sortStations,
  handleSubStationAdd, handleSubStationAddInputChange, toggleSubStationStatus, deleteSubStation, sortStations,
  // operations
  openAddOperationModal, editOperation, deleteOperation, saveOperation, closeOperationModal, showOperationDetail, closeOperationDetail, editOperationFromDetail, deleteOperationFromDetail,
  openOperationTypesModal, closeOperationTypesModal, addOperationTypeFromModal, editOperationType, deleteOperationTypeConfirm,
  toggleOperationTypeDropdown, selectOperationTypeFromDropdown, addNewOperationTypeFromInput,
  // workers
  openAddWorkerModal, editWorker, deleteWorker: deleteWorkerAction, saveWorker, closeWorkerModal, showWorkerDetail, closeWorkerDetail, editWorkerFromDetail, deleteWorkerFromDetail,
  // help
  openHelp, closeHelp, switchHelpTab, toggleFAQ,
  // master data (skills)
  addSkillFromSettings, renameSkill, deleteSkill,
  // time management
  saveTimeManagement, initializeTimeline, editScheduleBlock, saveScheduleBlock, deleteScheduleBlock, cancelScheduleEdit,
  // mobile
  toggleMobileNav, closeMobileNav
  ,
  // approved quotes
  showApprovedQuoteDetail, closeApprovedQuoteDetail,
  toggleAQFilterPanel, hideAQFilterPanel, onAQFilterChange, clearAQFilter, clearAllAQFilters, applyAQDeliveryFilter, toggleAQPlanType, applyOverdueFilter, applyQuickDateFilter, sortApprovedQuotes,
  // plan overview (tabs/filter/create)
  setActivePlanTab, openCreatePlan, filterProductionPlans,
  togglePlanFilterPanel, hidePlanFilterPanel, onPlanFilterChange, clearPlanFilter, clearAllPlanFilters, cancelPlanCreation
  , viewProductionPlan, editTemplateById,
  // metadata toggle functionality
  toggleMetadataColumns,
  // time management / schedules
  switchWorkType
});

// Time management placeholder function
function saveTimeManagement() {
  console.log('Time management settings saved - placeholder function');
  // Bu fonksiyon ileride gerçek backend entegrasyonu için kullanılacak
}

// Timeline drag & drop functionality
let dragStart = null;
let currentDragDay = null;
let timelineLaneCount = 1;
const nextLaneByDay = {};

function initializeTimeline() {
  // Initialize timeline drag events after DOM is loaded
  setTimeout(() => {
    const dayColumns = Array.from(document.querySelectorAll('.day-timeline-vertical'));
    if (!dayColumns.length) return;
    const dayIdsInOrder = dayColumns.map(col => col.dataset.day);
    // Magnetic snap settings (minutes)
    const SNAP_MINUTES = 30; // 30‑minute grid: 0, 0.5, 1.0, ...
    const STEP_HOURS = SNAP_MINUTES / 60; // 0.5
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const snapHour = (h) => Math.round(h / STEP_HOURS) * STEP_HOURS;

    // Initialize lane controls
    initializeLaneControls();

    dayColumns.forEach(timeline => {
      let isDragging = false;
      let dragStartY = 0;
      let dragElement = null;
      let moveHandler = null;
      let upHandler = null;
      let startDayIndex = dayColumns.indexOf(timeline);
      let currentDayIndex = startDayIndex;
      // Map<HTMLElement, HTMLElement> for per‑day overlays
      let overlays = new Map();
      // Drag threshold detection
      let hasMovedEnough = false;
      let startClientX = 0;
      let startClientY = 0;
      // Selected lane index during this drag (for multi‑lane days)
      let selectedLaneIndex = 0;

      const getRelativeY = (clientY) => {
        const rect = timeline.getBoundingClientRect();
        let y = clientY - rect.top;
        if (y < 0) y = 0;
        if (y > rect.height) y = rect.height;
        return y;
      };

      timeline.addEventListener('mousedown', (e) => {
        isDragging = true;
        dragStartY = getRelativeY(e.clientY);
        currentDragDay = timeline.dataset.day;
        startDayIndex = dayColumns.indexOf(timeline);
        currentDayIndex = startDayIndex;
        hasMovedEnough = false;
        startClientX = e.clientX;
        startClientY = e.clientY;

        // Determine which lane was clicked
        const rect = timeline.getBoundingClientRect();
        const relX = clamp((e.clientX - rect.left), 0, rect.width);
        const laneW = rect.width / Math.max(1, timelineLaneCount);
        selectedLaneIndex = Math.min(Math.max(0, Math.floor(relX / laneW)), Math.max(0, timelineLaneCount - 1));

        // Create temporary drag element
        dragElement = document.createElement('div');
        dragElement.style.position = 'absolute';
        dragElement.style.left = '2px';
        dragElement.style.right = '2px';
        dragElement.style.top = dragStartY + 'px';
        dragElement.style.height = '0px';
        dragElement.style.background = 'rgba(59, 130, 246, 0.3)';
        dragElement.style.border = '1px dashed #3b82f6';
        dragElement.style.borderRadius = '3px';
        dragElement.style.pointerEvents = 'none';
        timeline.appendChild(dragElement);

        moveHandler = (ev) => {
          if (!isDragging || !dragElement) return;
          // Check movement threshold to treat as drag, not click
          if (!hasMovedEnough) {
            const dx = Math.abs(ev.clientX - startClientX);
            const dy = Math.abs(ev.clientY - startClientY);
            if (dx < 6 && dy < 6) return; // not enough movement yet
            hasMovedEnough = true;
          }
          // Determine which day column we're over
          const el = document.elementFromPoint(ev.clientX, ev.clientY);
          const hoveredCol = el && el.closest ? el.closest('.day-timeline-vertical') : null;
          currentDayIndex = hoveredCol ? dayColumns.indexOf(hoveredCol) : currentDayIndex;
          if (currentDayIndex < 0) currentDayIndex = startDayIndex;

          // Compute hour range based on start and current Y positions
          const startRect = dayColumns[startDayIndex].getBoundingClientRect();
          const currRect = dayColumns[currentDayIndex].getBoundingClientRect();
          const startY = Math.max(0, Math.min(startRect.height, (dragStartY)));
          const currY = Math.max(0, Math.min(currRect.height, (ev.clientY - currRect.top)));

          // Convert to hours (0..24)
          const startHourRaw = (startY / startRect.height) * 24;
          const currHourRaw = (currY / currRect.height) * 24;
          let topHour = clamp(snapHour(Math.min(startHourRaw, currHourRaw)), 0, 24);
          let bottomHour = clamp(snapHour(Math.max(startHourRaw, currHourRaw)), 0, 24);
          // Ensure visible thickness when both snap to same step
          if (bottomHour === topHour) {
            if (currHourRaw >= startHourRaw) bottomHour = clamp(topHour + STEP_HOURS, 0, 24);
            else topHour = clamp(bottomHour - STEP_HOURS, 0, 24);
          }

          // Update overlays across spanned days (only selected lane in each day)
          const minIdx = Math.min(startDayIndex, currentDayIndex);
          const maxIdx = Math.max(startDayIndex, currentDayIndex);
          // Clear previous overlays
          overlays.forEach((ov, col) => { try { col.removeChild(ov); } catch {} });
          overlays.clear();
          for (let i = minIdx; i <= maxIdx; i++) {
            const col = dayColumns[i];
            const topPct = (topHour / 24) * 100;
            const heightPct = ((bottomHour - topHour) / 24) * 100;
            const laneWidthPct = 100 / Math.max(1, timelineLaneCount);
            const leftPct = selectedLaneIndex * laneWidthPct;
            const ov = document.createElement('div');
            ov.style.position = 'absolute';
            ov.style.left = `calc(${leftPct}% + 2px)`;
            ov.style.width = `calc(${laneWidthPct}% - 4px)`;
            ov.style.top = `${topPct}%`;
            ov.style.height = `${heightPct}%`;
            ov.style.background = 'rgba(59, 130, 246, 0.22)';
            ov.style.border = '1px dashed #3b82f6';
            ov.style.borderRadius = '3px';
            ov.style.pointerEvents = 'none';
            col.appendChild(ov);
            overlays.set(col, ov);
          }
          // Also update the original dragElement for first column for responsiveness
          dragElement.style.top = `${(topHour / 24) * 100}%`;
          dragElement.style.height = `${((bottomHour - topHour) / 24) * 100}%`;
          const laneWidthPct0 = 100 / Math.max(1, timelineLaneCount);
          const leftPct0 = selectedLaneIndex * laneWidthPct0;
          dragElement.style.left = `calc(${leftPct0}% + 2px)`;
          dragElement.style.width = `calc(${laneWidthPct0}% - 4px)`;
        };
        upHandler = (ev) => {
          if (!isDragging || !dragElement) return;
          // If it was just a click (no real drag), do nothing
          if (!hasMovedEnough) {
            if (dragElement && dragElement.parentNode) dragElement.parentNode.removeChild(dragElement);
            overlays.forEach((ov, col) => { try { col.removeChild(ov); } catch {} });
            overlays.clear();
            isDragging = false; dragElement = null; currentDragDay = null;
            document.removeEventListener('mousemove', moveHandler);
            document.removeEventListener('mouseup', upHandler);
            return;
          }
          // Determine final hour range and spanned days
          const el = document.elementFromPoint(ev.clientX, ev.clientY);
          const hoveredCol = el && el.closest ? el.closest('.day-timeline-vertical') : null;
          currentDayIndex = hoveredCol ? dayColumns.indexOf(hoveredCol) : currentDayIndex;
          if (currentDayIndex < 0) currentDayIndex = startDayIndex;

          const startRect = dayColumns[startDayIndex].getBoundingClientRect();
          const currRect = dayColumns[currentDayIndex].getBoundingClientRect();
          const startY = Math.max(0, Math.min(startRect.height, dragStartY));
          const currY = Math.max(0, Math.min(currRect.height, (ev.clientY - currRect.top)));
          const startHourRaw = (startY / startRect.height) * 24;
          const endHourRaw = (currY / currRect.height) * 24;
          let clampedStartHour = clamp(snapHour(Math.min(startHourRaw, endHourRaw)), 0, 24);
          let clampedEndHour = clamp(snapHour(Math.max(startHourRaw, endHourRaw)), 0, 24);
          if (clampedEndHour === clampedStartHour) {
            if (endHourRaw >= startHourRaw) clampedEndHour = clamp(clampedStartHour + STEP_HOURS, 0, 24);
            else clampedStartHour = clamp(clampedEndHour - STEP_HOURS, 0, 24);
          }

          const minIdx = Math.min(startDayIndex, currentDayIndex);
          const maxIdx = Math.max(startDayIndex, currentDayIndex);
          const selectedDays = dayIdsInOrder.slice(minIdx, maxIdx + 1);

          if (clampedEndHour - clampedStartHour > 0.01) {
            if (selectedDays.length > 1) {
              // Multi‑day selection → open modal once to confirm/apply times to all
              showBlockTypeModal(clampedStartHour, clampedEndHour, selectedDays, 0, 0);
              // Persist lane index to use on save
              if (window.currentEditBlock) window.currentEditBlock.laneIndex = selectedLaneIndex;
            } else {
              // Single‑day selection → create default 'work' block directly (no modal)
              const dayId = selectedDays[0] || currentDragDay;
              const startTime = formatHourToTime(clampedStartHour);
              const endTime = formatHourToTime(clampedEndHour);
              try { createScheduleBlock(dayId, 'work', clampedStartHour, clampedEndHour, startTime, endTime, selectedLaneIndex); } catch (e) { console.warn('createScheduleBlock failed', e); }
            }
          }
          if (dragElement && dragElement.parentNode) dragElement.parentNode.removeChild(dragElement);
          overlays.forEach((ov, col) => { try { col.removeChild(ov); } catch {} });
          overlays.clear();
          isDragging = false;
          dragElement = null;
          currentDragDay = null;
          document.removeEventListener('mousemove', moveHandler);
          document.removeEventListener('mouseup', upHandler);
        };
        document.addEventListener('mousemove', moveHandler);
        document.addEventListener('mouseup', upHandler);
        e.preventDefault();
      });

      // We intentionally ignore mouseleave: selection sticks to bounds
      timeline.addEventListener('mouseleave', () => {});
    });
  }, 500);
}

function initializeLaneControls() {
  // Single control bar under work-type, visible only in shift mode
  const dec = document.getElementById('lane-dec');
  const inc = document.getElementById('lane-inc');
  const inp = document.getElementById('lane-count-input');
  const apply = (n) => { setTimelineLaneCount(n); if (inp) inp.value = String(timelineLaneCount); };
  if (dec) dec.addEventListener('click', () => apply(Math.max(1, (timelineLaneCount - 1))));
  if (inc) inc.addEventListener('click', () => apply(Math.min(7, (timelineLaneCount + 1))));
  if (inp) inp.addEventListener('change', (e) => {
    const v = parseInt(e.target.value, 10);
    apply(isFinite(v) ? Math.max(1, Math.min(7, v)) : 1);
  });
  // First time apply
  apply(parseInt(inp?.value || '1', 10));
}

function setTimelineLaneCount(n) {
  timelineLaneCount = n;
  // Reset per-day round‑robin indices
  document.querySelectorAll('.day-timeline-vertical').forEach(col => {
    nextLaneByDay[col.dataset.day] = 0;
    // Update lane guides (simple separators)
    // Remove old
    col.querySelectorAll('.lanes-overlay, .lanes-labels').forEach(x => x.remove());
    if (timelineLaneCount <= 1) return;
    const overlay = document.createElement('div');
    overlay.className = 'lanes-overlay';
    overlay.style.position = 'absolute';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.right = '0';
    overlay.style.bottom = '0';
    overlay.style.pointerEvents = 'none';
    for (let i = 1; i < timelineLaneCount; i++) {
      const sep = document.createElement('div');
      const leftPct = (i * 100) / timelineLaneCount;
      sep.style.position = 'absolute';
      sep.style.top = '0';
      sep.style.bottom = '0';
      sep.style.left = `calc(${leftPct}% - 0.5px)`;
      sep.style.width = '1px';
      sep.style.background = 'var(--border)';
      overlay.appendChild(sep);
    }
    col.appendChild(overlay);

    // Add lane labels (1..N) under day area (stick to top of the column)
    const labels = document.createElement('div');
    labels.className = 'lanes-labels';
    labels.style.position = 'absolute';
    labels.style.top = '2px';
    labels.style.left = '2px';
    labels.style.right = '2px';
    labels.style.height = '16px';
    labels.style.display = 'grid';
    labels.style.gridTemplateColumns = `repeat(${timelineLaneCount}, 1fr)`;
    labels.style.gap = '0px';
    labels.style.pointerEvents = 'none';
    for (let i = 1; i <= timelineLaneCount; i++) {
      const tag = document.createElement('div');
      tag.textContent = String(i);
      tag.style.fontSize = '11px';
      tag.style.color = 'var(--muted-foreground)';
      tag.style.textAlign = 'center';
      labels.appendChild(tag);
    }
    col.appendChild(labels);
  });
}

// Switch work type: 'fixed' | 'shift'
function switchWorkType(type) {
  const fixed = document.getElementById('fixed-schedule');
  const shift = document.getElementById('shift-schedule');
  const laneControls = document.getElementById('lane-controls');
  if (type === 'shift') {
    if (fixed) fixed.style.display = 'none';
    if (shift) shift.style.display = 'block';
    if (laneControls) laneControls.style.display = 'flex';
  } else {
    if (fixed) fixed.style.display = 'block';
    if (shift) shift.style.display = 'none';
    if (laneControls) laneControls.style.display = 'none';
    // Reset lanes to 1 in fixed mode for clarity
    setTimelineLaneCount(1);
  }
  // Re‑apply lane UI (controls and overlays)
  initializeLaneControls();
}

function showBlockTypeModal(startHour, endHour, dayIdOrDays, top, height) {
  const modal = document.getElementById('schedule-edit-modal');
  const blockType = document.getElementById('block-type');
  const blockStart = document.getElementById('block-start');
  const blockEnd = document.getElementById('block-end');
  
  // Convert hours to HH:MM format
  const startTime = formatHourToTime(startHour);
  const endTime = formatHourToTime(endHour);
  
  blockType.value = 'work';
  blockStart.value = startTime;
  blockEnd.value = endTime;
  
  // Store creation data
  const daysArray = Array.isArray(dayIdOrDays) ? dayIdOrDays : null;
  window.currentEditBlock = {
    isNew: true,
    dayId: daysArray ? null : dayIdOrDays,
    days: daysArray,
    startHour: startHour,
    endHour: endHour,
    top: top,
    height: height,
    laneIndex: 0
  };
  
  modal.style.display = 'flex';
}

function formatHourToTime(hour) {
  // Clamp into [0, 24]; Map 24 -> 23:59 for HTML time input compatibility
  if (hour >= 24) return '23:59';
  if (hour <= 0) return '00:00';
  const h = Math.floor(hour);
  const m = Math.round((hour - h) * 60);
  const mm = m === 60 ? 59 : m; // guard against floating rounding to 60
  return `${h.toString().padStart(2, '0')}:${mm.toString().padStart(2, '0')}`;
}

function timeToHour(timeString) {
  const [h, m] = timeString.split(':').map(Number);
  return h + (m / 60);
}

function editScheduleBlock(blockElement) {
  const modal = document.getElementById('schedule-edit-modal');
  const blockType = document.getElementById('block-type');
  const blockStart = document.getElementById('block-start');
  const blockEnd = document.getElementById('block-end');
  
  // Get block data from element
  const blockData = JSON.parse(blockElement.dataset.blockInfo || '{}');
  
  blockType.value = blockData.type || 'work';
  blockStart.value = blockData.startTime || '08:00';
  blockEnd.value = blockData.endTime || '17:00';
  
  window.currentEditBlock = {
    isNew: false,
    element: blockElement,
    dayId: blockElement.closest('.day-timeline-vertical').dataset.day
  };
  
  modal.style.display = 'flex';
}

function saveScheduleBlock() {
  const blockType = document.getElementById('block-type').value;
  const blockStart = document.getElementById('block-start').value;
  const blockEnd = document.getElementById('block-end').value;
  const editData = window.currentEditBlock;
  
  if (!editData) return;
  
  const startHour = timeToHour(blockStart);
  const endHour = timeToHour(blockEnd);
  
  if (startHour >= endHour) {
    alert('Bitiş saati başlangıç saatinden sonra olmalıdır!');
    return;
  }
  
  if (editData.isNew) {
    // Create new block(s)
    if (Array.isArray(editData.days) && editData.days.length) {
      editData.days.forEach(d => createScheduleBlock(d, blockType, startHour, endHour, blockStart, blockEnd, (editData.laneIndex || 0)));
    } else {
      createScheduleBlock(editData.dayId, blockType, startHour, endHour, blockStart, blockEnd, (editData.laneIndex || 0));
    }
  } else {
    // Update existing block
    updateScheduleBlock(editData.element, blockType, startHour, endHour, blockStart, blockEnd);
  }
  
  cancelScheduleEdit();
}

function createScheduleBlock(dayId, type, startHour, endHour, startTime, endTime, laneIdxOverride = null) {
  const timeline = document.getElementById(`timeline-${dayId}`);
  const blocksContainer = document.getElementById(`blocks-${dayId}`);
  
  if (!blocksContainer) return;
  
  // Position linearly across full 24h height
  const top = (startHour / 24) * 100;
  const height = ((endHour - startHour) / 24) * 100;
  
  const colors = {
    work: { bg: 'rgba(34, 197, 94, 0.8)', border: '#22c55e', text: 'white' },
    break: { bg: 'rgba(251, 191, 36, 0.8)', border: '#fbbf24', text: 'black' },
    rest: { bg: 'rgba(156, 163, 175, 0.8)', border: '#9ca3af', text: 'white' }
  };
  
  const typeLabels = {
    work: 'Çalışma',
    break: 'Mola', 
    rest: 'Dinlenme'
  };
  
  const block = document.createElement('div');
  block.style.position = 'absolute';
  const laneIdx = (laneIdxOverride != null)
    ? Math.max(0, Math.min(Math.max(1, timelineLaneCount) - 1, laneIdxOverride))
    : (() => {
        const next = nextLaneByDay[dayId] || 0;
        nextLaneByDay[dayId] = (next + 1) % Math.max(1, timelineLaneCount);
        return next;
      })();
  block.dataset.laneIndex = String(laneIdx);
  const laneWidthPct = 100 / Math.max(1, timelineLaneCount);
  const leftPct = laneIdx * laneWidthPct;
  block.style.left = `calc(${leftPct}% + 2px)`;
  block.style.width = `calc(${laneWidthPct}% - 4px)`;
  block.style.top = `${top}%`;
  block.style.height = `${height}%`;
  block.style.background = colors[type].bg;
  block.style.border = `1px solid ${colors[type].border}`;
  block.style.borderRadius = '3px';
  block.style.cursor = 'pointer';
  block.style.display = 'flex';
  block.style.flexDirection = 'column';
  block.style.alignItems = 'center';
  block.style.justifyContent = 'center';
  block.style.fontSize = '10px';
  block.style.color = colors[type].text;
  block.style.fontWeight = '500';
  block.style.textAlign = 'center';
  block.style.padding = '2px';
  block.style.overflow = 'hidden';
  
  // Content depends on height
  if (height > 8) { // Large enough for text
    block.innerHTML = `<div>${typeLabels[type]}</div><div style="font-size: 9px; margin-top: 1px;">${startTime}-${endTime}</div>`;
  } else if (height > 4) { // Medium size
    block.textContent = `${startTime}-${endTime}`;
  } else { // Very small
    block.textContent = typeLabels[type].substr(0, 1);
  }
  
  // Store block data
  block.dataset.blockInfo = JSON.stringify({
    type: type,
    startTime: startTime,
    endTime: endTime,
    startHour: startHour,
    endHour: endHour
  });
  
  block.addEventListener('click', () => editScheduleBlock(block));

  blocksContainer.appendChild(block);
}

function updateScheduleBlock(blockElement, type, startHour, endHour, startTime, endTime) {
  const timeline = blockElement.closest('.day-timeline-vertical');
  // Position linearly across full 24h height
  const top = (startHour / 24) * 100;
  const height = ((endHour - startHour) / 24) * 100;
  
  const colors = {
    work: { bg: 'rgba(34, 197, 94, 0.8)', border: '#22c55e', text: 'white' },
    break: { bg: 'rgba(251, 191, 36, 0.8)', border: '#fbbf24', text: 'black' },
    rest: { bg: 'rgba(156, 163, 175, 0.8)', border: '#9ca3af', text: 'white' }
  };
  
  const typeLabels = {
    work: 'Çalışma',
    break: 'Mola', 
    rest: 'Dinlenme'
  };
  
  blockElement.style.top = `${top}%`;
  blockElement.style.height = `${height}%`;
  // Recompute lane left/width
  const laneIdx = parseInt(blockElement.dataset.laneIndex || '0', 10) || 0;
  const laneWidthPct = 100 / Math.max(1, timelineLaneCount);
  const leftPct = laneIdx * laneWidthPct;
  blockElement.style.left = `calc(${leftPct}% + 2px)`;
  blockElement.style.width = `calc(${laneWidthPct}% - 4px)`;
  blockElement.style.background = colors[type].bg;
  blockElement.style.border = `1px solid ${colors[type].border}`;
  blockElement.style.color = colors[type].text;
  
  // Update content based on size
  if (height > 8) {
    blockElement.innerHTML = `<div>${typeLabels[type]}</div><div style="font-size: 9px; margin-top: 1px;">${startTime}-${endTime}</div>`;
  } else if (height > 4) {
    blockElement.textContent = `${startTime}-${endTime}`;
  } else {
    blockElement.textContent = typeLabels[type].substr(0, 1);
  }
  
  blockElement.dataset.blockInfo = JSON.stringify({
    type: type,
    startTime: startTime,
    endTime: endTime,
    startHour: startHour,
    endHour: endHour
  });
}

function deleteScheduleBlock() {
  const editData = window.currentEditBlock;
  
  if (!editData || editData.isNew) {
    cancelScheduleEdit();
    return;
  }
  
  if (confirm('Bu zaman bloğunu silmek istediğinizden emin misiniz?')) {
    editData.element.remove();
    cancelScheduleEdit();
  }
}

function cancelScheduleEdit() {
  const modal = document.getElementById('schedule-edit-modal');
  modal.style.display = 'none';
  window.currentEditBlock = null;
}

document.addEventListener('DOMContentLoaded', () => {
  loadData();
  initHelp();
  
  // Check URL parameters for direct plan access
  const urlParams = new URLSearchParams(window.location.search);
  // If a direct view is requested, honor it first
  const directView = urlParams.get('view');
  const viewPlanId = urlParams.get('viewPlanId');
  const editPlanId = urlParams.get('editPlanId');
  
  if (directView) {
    navigateToView(directView);
    return;
  } else if (viewPlanId) {
    // Navigate to plan designer and load plan in view mode
    navigateToView('plan-designer');
    setTimeout(() => {
      if (typeof viewProductionPlan === 'function') {
        viewProductionPlan(viewPlanId);
      }
    }, 100);
  } else if (editPlanId) {
    // Navigate to plan designer and load template in edit mode
    navigateToView('plan-designer');
    setTimeout(() => {
      if (typeof editTemplateById === 'function') {
        editTemplateById(editPlanId);
      }
    }, 100);
  } else {
    const initialView = getSavedView();
    navigateToView(initialView);
  }
});
