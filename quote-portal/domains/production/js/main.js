// Entry point: wire modules to global for inline handlers to keep working
import { MESData, loadData, saveData, currentView, setCurrentView, getSavedView } from './state.js';
import { showSuccessToast, showErrorToast, showWarningToast, showInfoToast } from '../../../shared/components/Toast.js';
import { generateModernDashboard, generateWorkerPanel, generateSettings, generateOperations, generateWorkers, generateStations, generateStationDuplicateModal, generatePlanDesigner, generateTemplates, generateApprovedQuotes, injectMetadataToggleStyles, toggleMetadataColumns, initDashboardWidgets, initWorkPackagesWidget, showWorkPackageDetail, closeWorkPackageDetail } from './views.js';
import { initPlanOverviewUI, setActivePlanTab, openCreatePlan, filterProductionPlans, togglePlanFilterPanel, hidePlanFilterPanel, onPlanFilterChange, clearPlanFilter, clearAllPlanFilters, cancelPlanCreation, viewProductionPlan, releasePlanFromOverview, editTemplateById, deleteTemplateById } from './planOverview.js';
import { initializeWorkersUI, openAddWorkerModal, editWorker, deleteWorker as deleteWorkerAction, saveWorker, closeWorkerModal, showWorkerDetail, closeWorkerDetail, editWorkerFromDetail, deleteWorkerFromDetail, openWorkerScheduleModal, closeWorkerScheduleModal, handleWorkerScheduleModeChange, saveWorkerSchedule } from './workers.js';
import { initializePlanDesigner, loadOperationsToolbox, handleOperationDragStart, handleCanvasDragOver, handleCanvasDrop, renderCanvas, editNode, saveNodeEdit, closeNodeEditModal, deleteNode, toggleConnectMode, clearCanvas, handleOrderChange, savePlanAsTemplate, deployWorkOrder, handleCanvasClick, handleScheduleTypeChange, handleRecurringTypeChange, handlePeriodicFrequencyChange, savePlanDraft, togglePlanOrderPanel, hidePlanOrderPanel, clearPlanOrder, filterPlanOrderList, selectPlanOrder, togglePlanTypePanel, hidePlanTypePanel, clearPlanType, selectPlanType } from './planDesigner.js';
import { loadOperationsToolboxBackend, editNodeBackend, handleCanvasDropBackend, loadApprovedOrdersToSelect, handleOrderChangeBackend, saveNodeEditBackend, handleAssignModeChangeBackend, handleStationChangeInEdit, openMaterialDropdown, filterMaterialDropdown, selectMaterialFromDropdown, debugMaterialsLoad, debugShowAllMaterials, addMaterialRow, removeMaterialRow, updateOutputCodePreviewBackend } from './planDesignerBackend.js';
import { openAddStationModal, resetAllStations, editStation, closeStationModal, saveStation, toggleStationStatus, deleteStation as deleteStationAction, initializeStationsUI, setActiveStationTab, deleteStationFromModal, showStationDetail, closeStationDetail, showSubStationDetail, closeSubStationDetail, editStationFromDetail, duplicateStationFromDetail, showStationDuplicateModal, closeStationDuplicateModal, confirmStationDuplicate, deleteStationFromDetail, handleSubStationAdd, handleSubStationAddInputChange, toggleSubStationStatus, deleteSubStation, sortStations } from './stations.js';
import { initializeOperationsUI, openAddOperationModal, editOperation, deleteOperation, saveOperation, closeOperationModal, showOperationDetail, closeOperationDetail, editOperationFromDetail, deleteOperationFromDetail, openOperationTypesModal, closeOperationTypesModal, addOperationTypeFromModal, editOperationType, deleteOperationTypeConfirm, toggleOperationTypeDropdown, selectOperationTypeFromDropdown, addNewOperationTypeFromInput } from './operations.js';
import { openHelp, closeHelp, switchHelpTab, toggleFAQ, initHelp } from './help.js';
import { initializeApprovedQuotesUI, showApprovedQuoteDetail, closeApprovedQuoteDetail, toggleAQFilterPanel, hideAQFilterPanel, onAQFilterChange, clearAQFilter, clearAllAQFilters, applyAQDeliveryFilter, toggleAQPlanType, applyOverdueFilter, applyQuickDateFilter, sortApprovedQuotes } from './approvedQuotes.js';
import { initMasterDataUI, addSkillFromSettings, renameSkill, deleteSkill, activateSkillRow, onSkillNameInput, cancelSkillEdit, onSkillsSearchInput, onOperationsSearchInput, activateOperationRow, onOperationDefectRateInput, cancelOperationEdit, saveOperationEdit, deleteOperationFromMaster } from './masterData.js';
import { toggleMobileNav, closeMobileNav } from './mobile.js';
import { API_BASE, withAuth } from '../../../shared/lib/api.js';
import { getMasterData, invalidateMasterDataCache } from './mesApi.js';

function renderView(viewId) {
  let content = '';
  switch (viewId) {
    case 'dashboard': 
      content = generateModernDashboard(); 
      setTimeout(() => initDashboardWidgets(), 100);
      break;
    case 'worker-panel': 
      content = generateWorkerPanel(); 
      setTimeout(() => initWorkPackagesWidget(), 100);
      break;
    case 'plan-designer':
      content = generatePlanDesigner();
      setTimeout(async () => {
        initPlanOverviewUI();
        // Initialize designer backend (designer UI is initially hidden but present in DOM)
        await initializePlanDesigner();
        await loadOperationsToolboxBackend();
        await loadApprovedOrdersToSelect();
        // Inject metadata toggle styles
        injectMetadataToggleStyles();
        
        // Check URL parameters for auto-actions (only on first load)
        const urlParams = new URLSearchParams(window.location.search);
        const action = urlParams.get('action');
        const orderCode = urlParams.get('orderCode');
        
        if (action === 'create') {
          // Clear URL parameters after reading them
          const newUrl = window.location.pathname + window.location.hash;
          window.history.replaceState({}, '', newUrl);
          
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
      setTimeout(async () => {
        // Ensure fresh master data for skills UI
        try { invalidateMasterDataCache() } catch {}
        clearOldTimeSettings();
        initMasterDataUI();
        initializeTimeline();
        applyCompanyTimeSettingsToUI();
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
  MESData, saveData, showSuccessToast, showErrorToast, showWarningToast, showInfoToast,
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
  openAddStationModal, resetAllStations, editStation, closeStationModal, saveStation, toggleStationStatus, deleteStation: deleteStationAction, setActiveStationTab, deleteStationFromModal, showStationDetail, closeStationDetail, showSubStationDetail, closeSubStationDetail, editStationFromDetail, duplicateStationFromDetail, showStationDuplicateModal, closeStationDuplicateModal, confirmStationDuplicate, deleteStationFromDetail, sortStations,
  handleSubStationAdd, handleSubStationAddInputChange, toggleSubStationStatus, deleteSubStation, closeSubStationDetail, sortStations,
  // work packages
  showWorkPackageDetail, closeWorkPackageDetail,
  // operations
  openAddOperationModal, editOperation, deleteOperation, saveOperation, closeOperationModal, showOperationDetail, closeOperationDetail, editOperationFromDetail, deleteOperationFromDetail,
  openOperationTypesModal, closeOperationTypesModal, addOperationTypeFromModal, editOperationType, deleteOperationTypeConfirm,
  toggleOperationTypeDropdown, selectOperationTypeFromDropdown, addNewOperationTypeFromInput,
  // workers
  openAddWorkerModal, editWorker, deleteWorker: deleteWorkerAction, saveWorker, closeWorkerModal, showWorkerDetail, closeWorkerDetail, editWorkerFromDetail, deleteWorkerFromDetail,
  // worker schedule modal
  openWorkerScheduleModal, closeWorkerScheduleModal, handleWorkerScheduleModeChange, saveWorkerSchedule,
  // help
  openHelp, closeHelp, switchHelpTab, toggleFAQ,
  // master data (skills)
  addSkillFromSettings, renameSkill, deleteSkill, activateSkillRow, onSkillNameInput, cancelSkillEdit, onSkillsSearchInput,
  // master data (operations)
  onOperationsSearchInput, activateOperationRow, onOperationDefectRateInput, cancelOperationEdit, saveOperationEdit, deleteOperationFromMaster,
  // time management
  saveTimeManagement, initializeTimeline, createScheduleBlock, editScheduleBlock, saveScheduleBlock, deleteScheduleBlock, cancelScheduleEdit, clearOldTimeSettings,
  // mobile
  toggleMobileNav, closeMobileNav
  ,
  // approved quotes
  showApprovedQuoteDetail, closeApprovedQuoteDetail,
  toggleAQFilterPanel, hideAQFilterPanel, onAQFilterChange, clearAQFilter, clearAllAQFilters, applyAQDeliveryFilter, toggleAQPlanType, applyOverdueFilter, applyQuickDateFilter, sortApprovedQuotes,
  // plan overview (tabs/filter/create)
  setActivePlanTab, openCreatePlan, filterProductionPlans,
  togglePlanFilterPanel, hidePlanFilterPanel, onPlanFilterChange, clearPlanFilter, clearAllPlanFilters, cancelPlanCreation
  , viewProductionPlan, releasePlanFromOverview, editTemplateById, deleteTemplateById,
  // metadata toggle functionality
  toggleMetadataColumns,
  // time management / schedules
  switchWorkType,
  // timeline edit helpers
  startTimelineEdit,
  stopTimelineEdit,
  markTimelineDirty
});

// Clear old localStorage data (run once)
function clearOldTimeSettings() {
  if (localStorage.getItem('companyTimeSettings')) {
    console.log('Clearing old localStorage timeSettings data...');
    localStorage.removeItem('companyTimeSettings');
  }
}

// Time management placeholder function
async function saveTimeManagement() {
  try {
    const laneInput = document.getElementById('lane-count-input');
    const laneCount = laneInput ? parseInt(laneInput.value || '1', 10) || 1 : 1;
    const workType = laneCount > 1 ? 'shift' : 'fixed';

    // Collect blocks from fixed schedule
    const fixedBlocks = {};
    ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'].forEach(day => {
      const col = document.getElementById(`timeline-${day}`);
      const blocks = col ? Array.from(col.querySelectorAll('[data-block-info]')).map(el => {
        try { 
          const block = JSON.parse(el.dataset.blockInfo);
          // Migrate legacy block types: rest/Dinlenme -> break
          if (block && (block.type === 'rest' || block.type === 'Dinlenme' || block.type === 'dinlenme')) {
            block.type = 'break';
          }
          return block;
        } catch { return null }
      }).filter(Boolean) : [];
      fixedBlocks[day] = blocks;
    });

    // Collect blocks from shift schedule
    const shiftBlocks = {};
    ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'].forEach(day => {
      const key = `shift-${day}`;
      const col = document.getElementById(`timeline-${key}`);
      const blocks = col ? Array.from(col.querySelectorAll('[data-block-info]')).map(el => {
        try { 
          const block = JSON.parse(el.dataset.blockInfo);
          // Migrate legacy block types: rest/Dinlenme -> break
          if (block && (block.type === 'rest' || block.type === 'Dinlenme' || block.type === 'dinlenme')) {
            block.type = 'break';
          }
          return block;
        } catch { return null }
      }).filter(Boolean) : [];
      shiftBlocks[key] = blocks;
    });

    // Build split-by-lane structure for shift (easier consumption: Pazartesi 1, Pazartesi 2, ...)
    const shiftByLane = {};
    for (let lane = 1; lane <= laneCount; lane++) {
      const laneIdx = lane - 1;
      const laneDays = {};
      ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'].forEach(day => {
        const key = `shift-${day}`;
        const list = Array.isArray(shiftBlocks[key]) ? shiftBlocks[key] : [];
        laneDays[day] = list.filter(b => (typeof b?.laneIndex === 'number') ? b.laneIndex === laneIdx : false);
      });
      shiftByLane[String(lane)] = laneDays;
    }

    // Persist to backend master data (mes-settings/master-data.timeSettings)
    let remoteOk = true;
    const timeSettingsData = { workType, laneCount, fixedBlocks, shiftBlocks, shiftByLane };
    
    try {
      console.log('Saving timeSettings to Firebase:', timeSettingsData);
      
      // Use saveMasterData to ensure cache is updated
      const { saveMasterData } = await import('./mesApi.js');
      await saveMasterData({ timeSettings: timeSettingsData });
      
      console.log('Firebase save successful, cache updated');
    } catch (e) {
      remoteOk = false;
      console.error('Master time settings save error:', e);
    }
    
    if (remoteOk) {
      showSuccessToast('Çalışma programı güncellendi');
      // Apply lane count to UI
      try { setTimelineLaneCount(laneCount); } catch {}
      // Exit edit mode
      try { stopTimelineEdit(); } catch {}
      
      // Refresh timeline UI immediately by re-fetching master data and rebuilding
      try {
        const { getMasterData } = await import('./mesApi.js');
        const freshData = await getMasterData(true); // force refresh
        
        // Rebuild the timeline with fresh data
        if (freshData && freshData.timeSettings) {
          const ts = freshData.timeSettings;
          const currentWorkType = ts.workType || 'fixed';
          const currentLaneCount = ts.laneCount || 1;
          
          // Update lane count input
          const laneInput = document.getElementById('lane-count-input');
          if (laneInput) laneInput.value = currentLaneCount;
          
          // Update work type tabs
          const fixedTab = document.getElementById('work-type-fixed');
          const shiftTab = document.getElementById('work-type-shift');
          if (fixedTab && shiftTab) {
            fixedTab.classList.toggle('active', currentWorkType === 'fixed');
            shiftTab.classList.toggle('active', currentWorkType === 'shift');
          }
          
          // Show/hide appropriate schedule panels
          const fixedPanel = document.getElementById('fixed-schedule');
          const shiftPanel = document.getElementById('shift-schedule');
          if (fixedPanel) fixedPanel.style.display = currentWorkType === 'fixed' ? 'block' : 'none';
          if (shiftPanel) shiftPanel.style.display = currentWorkType === 'shift' ? 'block' : 'none';
          
          // Rebuild timeline blocks
          const days = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];
          
          if (currentWorkType === 'fixed') {
            // Rebuild fixed schedule blocks
            const fixedBlocks = ts.fixedBlocks || {};
            days.forEach(day => {
              const col = document.getElementById(`timeline-${day}`);
              if (!col) return;
              
              // Clear existing blocks
              col.querySelectorAll('[data-block-info]').forEach(el => el.remove());
              
              // Add fresh blocks
              const blocks = fixedBlocks[day] || [];
              blocks.forEach((block, laneIdx) => {
                try {
                  createScheduleBlock(day, block.type, block.startHour, block.endHour, block.start, block.end, laneIdx);
                } catch (e) {
                  console.error('Failed to create block:', e);
                }
              });
            });
          } else {
            // Rebuild shift schedule blocks
            const shiftBlocks = ts.shiftBlocks || {};
            days.forEach(day => {
              const key = `shift-${day}`;
              const col = document.getElementById(`timeline-${key}`);
              if (!col) return;
              
              // Clear existing blocks
              col.querySelectorAll('[data-block-info]').forEach(el => el.remove());
              
              // Add fresh blocks
              const blocks = shiftBlocks[key] || [];
              blocks.forEach((block) => {
                try {
                  createScheduleBlock(key, block.type, block.startHour, block.endHour, block.start, block.end, block.laneIndex || 0);
                } catch (e) {
                  console.error('Failed to create block:', e);
                }
              });
            });
          }
          
          // Apply lane count
          setTimelineLaneCount(currentLaneCount);
        }
        
        console.log('Timeline UI refreshed with latest data');
      } catch (e) {
        console.error('Failed to refresh timeline UI:', e);
      }
    } else {
      showErrorToast('Zaman ayarları kaydedilemedi');
      // Revert to snapshot
      try { restoreTimeline(); } catch {}
    }
  } catch (e) {
    console.error('saveTimeManagement error', e);
    showErrorToast('Zaman ayarları kaydedilemedi');
    // Revert to snapshot
    try { restoreTimeline(); } catch {}
  }
}

// --- Timeline edit UI helpers ---
window.timelineEditMode = false;
window.timelineDirty = false;
window.timelineSnapshot = null;
window._laneCountDirtyHandler = null;

function getTimelineContainers() {
  const wrapper = document.getElementById('timeline-wrapper');
  if (!wrapper) return [];
  return Array.from(wrapper.querySelectorAll('[id^="blocks-"]'));
}

function snapshotTimeline() {
  const snap = {};
  // include lane count in snapshot
  try {
    const laneInput = document.getElementById('lane-count-input');
    const val = laneInput ? parseInt(laneInput.value || '1', 10) || 1 : (typeof timelineLaneCount === 'number' ? timelineLaneCount : 1);
    snap.__laneCount = val;
  } catch {}
  getTimelineContainers().forEach(cnt => {
    const dayId = cnt.id.replace(/^blocks-/, '');
    const list = Array.from(cnt.querySelectorAll('[data-block-info]')).map(el => {
      try { return JSON.parse(el.dataset.blockInfo) } catch { return null }
    }).filter(Boolean);
    snap[dayId] = list;
  });
  return snap;
}

function restoreTimeline(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') return;
  Object.entries(snapshot).forEach(([dayId, list]) => {
    const cnt = document.getElementById(`blocks-${dayId}`);
    if (!cnt) return;
    cnt.innerHTML = '';
    (Array.isArray(list) ? list : []).forEach(b => {
      try {
        const sh = typeof b.startHour === 'number' ? b.startHour : timeToHour(b.startTime);
        const eh = typeof b.endHour === 'number' ? b.endHour : timeToHour(b.endTime);
        const startTime = b.startTime || formatHourToTime(sh);
        const endTime = b.endTime || formatHourToTime(eh);
        createScheduleBlock(dayId, b.type || 'work', sh, eh, startTime, endTime, (typeof b.laneIndex === 'number' ? b.laneIndex : 0));
      } catch {}
    });
  });
}

function startTimelineEdit() {
  const overlay = document.getElementById('timeline-edit-overlay');
  if (overlay) overlay.style.display = 'none';
  // take snapshot of current blocks
  window.timelineSnapshot = snapshotTimeline();
  // listen lane-count changes to update dirty state immediately
  try {
    const laneInput = document.getElementById('lane-count-input');
    if (laneInput) {
      laneInput.disabled = false;
      window._laneCountDirtyHandler = () => markTimelineDirty();
      laneInput.addEventListener('input', window._laneCountDirtyHandler);
      laneInput.addEventListener('change', window._laneCountDirtyHandler);
    }
  } catch {}
  const btnEdit = document.getElementById('timeline-edit-btn');
  const btnSave = document.getElementById('timeline-save-btn');
  const btnCancel = document.getElementById('timeline-cancel-btn');
  if (btnEdit) btnEdit.style.display = 'none';
  if (btnCancel) btnCancel.style.display = 'inline-flex';
  window.timelineDirty = false;
  if (btnSave) btnSave.style.display = 'none';
  window.timelineEditMode = true;
}

function stopTimelineEdit() {
  const overlay = document.getElementById('timeline-edit-overlay');
  if (overlay) overlay.style.display = 'block';
  // restore from snapshot and clear dirty state
  try { restoreTimeline(window.timelineSnapshot); } catch {}
  // remove lane-count listeners
  try {
    const laneInput = document.getElementById('lane-count-input');
    if (laneInput && window._laneCountDirtyHandler) {
      laneInput.removeEventListener('input', window._laneCountDirtyHandler);
      laneInput.removeEventListener('change', window._laneCountDirtyHandler);
    }
    if (laneInput) {
      // restore input value from snapshot and disable when not editing
      const snapLane = (typeof (window.timelineSnapshot?.__laneCount) === 'number') ? window.timelineSnapshot.__laneCount : undefined;
      if (typeof snapLane === 'number') laneInput.value = String(snapLane);
      laneInput.disabled = true;
    }
    window._laneCountDirtyHandler = null;
  } catch {}
  // finally clear snapshot reference
  window.timelineSnapshot = null;
  const btnEdit = document.getElementById('timeline-edit-btn');
  const btnSave = document.getElementById('timeline-save-btn');
  const btnCancel = document.getElementById('timeline-cancel-btn');
  if (btnEdit) btnEdit.style.display = 'inline-flex';
  if (btnCancel) btnCancel.style.display = 'none';
  if (btnSave) btnSave.style.display = 'none';
  window.timelineEditMode = false;
  window.timelineDirty = false;
}

function markTimelineDirty() {
  // Compare with snapshot and set dirty accordingly
  try {
    const current = snapshotTimeline();
    const snap = window.timelineSnapshot || {};
    const isEqual = timelinesEqual(snap, current);
    window.timelineDirty = !isEqual;
  } catch { window.timelineDirty = true; }
  if (!window.timelineEditMode) return;
  const btnSave = document.getElementById('timeline-save-btn');
  if (btnSave) btnSave.style.display = (window.timelineDirty ? 'inline-flex' : 'none');
}

function normalizeBlocks(list) {
  const arr = (Array.isArray(list) ? list : []).map(b => ({
    type: b.type || 'work',
    startHour: typeof b.startHour === 'number' ? b.startHour : timeToHour(b.startTime),
    endHour: typeof b.endHour === 'number' ? b.endHour : timeToHour(b.endTime),
    laneIndex: typeof b.laneIndex === 'number' ? b.laneIndex : 0
  }));
  arr.sort((a,b) => a.startHour - b.startHour || a.endHour - b.endHour || (a.type > b.type ? 1 : a.type < b.type ? -1 : 0) || a.laneIndex - b.laneIndex);
  return arr;
}

function timelinesEqual(snapA, snapB) {
  // compare lane counts first (default to 1)
  const laneA = (typeof snapA?.__laneCount === 'number') ? snapA.__laneCount : 1;
  const laneB = (typeof snapB?.__laneCount === 'number') ? snapB.__laneCount : 1;
  if (laneA !== laneB) return false;
  const keys = new Set([...Object.keys(snapA||{}), ...Object.keys(snapB||{})]);
  for (const k of keys) {
    if (k === '__laneCount') continue;
    const a = normalizeBlocks(snapA?.[k]);
    const b = normalizeBlocks(snapB?.[k]);
    if (a.length !== b.length) return false;
    for (let i=0;i<a.length;i++) {
      const x = a[i], y = b[i];
      if (x.type !== y.type || Math.abs(x.startHour - y.startHour) > 0.0001 || Math.abs(x.endHour - y.endHour) > 0.0001 || x.laneIndex !== y.laneIndex) {
        return false;
      }
    }
  }
  return true;
}

// Populate Settings timeline from saved company time settings (master-data)
async function applyCompanyTimeSettingsToUI() {
  try {
    const md = await getMasterData().catch(() => null);
    const ts = md && md.timeSettings ? md.timeSettings : null;
    if (!ts) return;

    // Set work type radio and lane count
    const workType = ts.workType === 'shift' ? 'shift' : 'fixed';
    const laneCount = Number.isFinite(ts.laneCount) ? Math.max(1, Math.min(7, ts.laneCount)) : 1;
    const fixedRadio = document.querySelector('input[name="work-type"][value="fixed"]');
    const shiftRadio = document.querySelector('input[name="work-type"][value="shift"]');
    if (workType === 'shift' && shiftRadio) shiftRadio.checked = true; else if (fixedRadio) fixedRadio.checked = true;
    switchWorkType(workType);
    const laneInput = document.getElementById('lane-count-input');
    if (laneInput) laneInput.value = String(laneCount);
    setTimelineLaneCount(laneCount);

    // Helper to clear all blocks
    const days = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];
    const clearBlocks = (prefix) => {
      days.forEach(d => {
        const el = document.getElementById(`blocks-${prefix ? `${prefix}-` : ''}${d}`);
        if (el) el.innerHTML = '';
      });
    };
    clearBlocks(''); // fixed
    clearBlocks('shift');

    // Add fixed blocks
    if (ts.fixedBlocks && typeof ts.fixedBlocks === 'object') {
      days.forEach(d => {
        const list = Array.isArray(ts.fixedBlocks[d]) ? ts.fixedBlocks[d] : [];
        list.forEach(b => {
          const sh = typeof b.startHour === 'number' ? b.startHour : timeToHour(b.startTime);
          const eh = typeof b.endHour === 'number' ? b.endHour : timeToHour(b.endTime);
          const type = b.type || 'work';
          const startTime = b.startTime || formatHourToTime(sh);
          const endTime = b.endTime || formatHourToTime(eh);
          const laneIdx = Number.isFinite(b.laneIndex) ? b.laneIndex : 0;
          createScheduleBlock(d, type, sh, eh, startTime, endTime, laneIdx);
        });
      });
    }

  // Add shift blocks
    if (ts.shiftBlocks && typeof ts.shiftBlocks === 'object') {
      days.forEach(d => {
        const key = `shift-${d}`;
        const list = Array.isArray(ts.shiftBlocks[key]) ? ts.shiftBlocks[key] : [];
        list.forEach(b => {
          const sh = typeof b.startHour === 'number' ? b.startHour : timeToHour(b.startTime);
          const eh = typeof b.endHour === 'number' ? b.endHour : timeToHour(b.endTime);
          const type = b.type || 'work';
          const startTime = b.startTime || formatHourToTime(sh);
          const endTime = b.endTime || formatHourToTime(eh);
          const laneIdx = Number.isFinite(b.laneIndex) ? b.laneIndex : 0;
          createScheduleBlock(key, type, sh, eh, startTime, endTime, laneIdx);
        });
      });
    } else if (ts.shiftByLane && typeof ts.shiftByLane === 'object') {
      // Reconstruct UI blocks from split-by-lane model
      Object.entries(ts.shiftByLane).forEach(([laneNo, daysMap]) => {
        const laneIdx = Math.max(0, (parseInt(laneNo, 10) || 1) - 1);
        days.forEach(d => {
          const key = `shift-${d}`;
          const list = Array.isArray(daysMap?.[d]) ? daysMap[d] : [];
          list.forEach(b => {
            const sh = typeof b.startHour === 'number' ? b.startHour : timeToHour(b.startTime);
            const eh = typeof b.endHour === 'number' ? b.endHour : timeToHour(b.endTime);
            const type = b.type || 'work';
            const startTime = b.startTime || formatHourToTime(sh);
            const endTime = b.endTime || formatHourToTime(eh);
            createScheduleBlock(key, type, sh, eh, startTime, endTime, laneIdx);
          });
        });
      });
    }
  } catch (e) {
    console.warn('applyCompanyTimeSettingsToUI failed', e);
  }
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
  const clampLane = (v) => (isFinite(v) ? Math.max(1, Math.min(7, v)) : 1);
  const applyImmediate = (n) => { setTimelineLaneCount(n); if (inp) inp.value = String(n); };
  const setInputOnly = (n) => { if (inp) inp.value = String(n); if (typeof markTimelineDirty === 'function') markTimelineDirty(); };
  if (dec) dec.addEventListener('click', () => {
    const next = clampLane((parseInt(inp?.value || String(timelineLaneCount), 10) || 1) - 1);
    if (window.timelineEditMode) setInputOnly(next); else applyImmediate(next);
  });
  if (inc) inc.addEventListener('click', () => {
    const next = clampLane((parseInt(inp?.value || String(timelineLaneCount), 10) || 1) + 1);
    if (window.timelineEditMode) setInputOnly(next); else applyImmediate(next);
  });
  if (inp) inp.addEventListener('change', (e) => {
    const v = clampLane(parseInt(e.target.value, 10));
    if (window.timelineEditMode) setInputOnly(v); else applyImmediate(v);
  });
  // First time apply to reflect current value
  applyImmediate(parseInt(inp?.value || '1', 10));
  // Disable input when not in edit mode
  if (inp) inp.disabled = !window.timelineEditMode;
}

function setTimelineLaneCount(n) {
  timelineLaneCount = n;
  // Reset per-day round‑robin indices
  document.querySelectorAll('.day-timeline-vertical').forEach(col => {
    nextLaneByDay[col.dataset.day] = 0;
    // Update lane guides (simple separators)
    // Remove old
    col.querySelectorAll('.lanes-overlay, .lanes-labels').forEach(x => x.remove());

    // Update outside lane header for this day
    const headerCell = document.getElementById(`lanes-header-${col.dataset.day}`);
    if (headerCell) {
      headerCell.innerHTML = '';
      headerCell.style.display = 'grid';
      headerCell.style.gridTemplateColumns = `repeat(${timelineLaneCount}, 1fr)`;
      headerCell.style.gap = '4px';
      for (let i = 1; i <= timelineLaneCount; i++) {
        const span = document.createElement('div');
        span.textContent = String(i);
        span.style.fontSize = '11px';
        span.style.color = 'var(--muted-foreground)';
        span.style.textAlign = 'center';
        headerCell.appendChild(span);
      }
    }

    // Add vertical separators overlay if multi-lane
    if (timelineLaneCount > 1) {
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
    }
  });
}

// Switch work type: 'fixed' | 'shift'
function switchWorkType(type) {
  // Single-timeline mode: always show shift-schedule container
  const shift = document.getElementById('shift-schedule');
  if (shift) shift.style.display = 'block';
  // Set lanes: fixed => 1, shift => keep current or set by input
  if (type === 'fixed') {
    setTimelineLaneCount(1);
  } else {
    const laneInput = document.getElementById('lane-count-input');
    const laneCount = laneInput ? parseInt(laneInput.value || '1', 10) || 1 : 1;
    setTimelineLaneCount(laneCount);
  }
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
  
  // Check for duplicate blocks with same time range
  const existingBlocks = Array.from(blocksContainer.querySelectorAll('[data-block-info]'));
  for (const existing of existingBlocks) {
    try {
      const existingData = JSON.parse(existing.dataset.blockInfo);
      if (Math.abs(existingData.startHour - startHour) < 0.01 && 
          Math.abs(existingData.endHour - endHour) < 0.01 &&
          existingData.type === type) {
        console.warn('Duplicate block detected, skipping:', { dayId, startTime, endTime, type });
        return; // Don't create duplicate
      }
    } catch (e) {
      console.warn('Error parsing existing block data:', e);
    }
  }
  
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
  
  // Always show times stacked in the block, use inclusive end (end-1min)
  const _toMin = (t) => { const [hh,mm] = String(t||'0:0').split(':').map(x=>parseInt(x,10)||0); return hh*60+mm; };
  const _toHM = (m) => { m = Math.max(0, m); const hh=String(Math.floor(m/60)).padStart(2,'0'); const mm=String(m%60).padStart(2,'0'); return `${hh}:${mm}`; };
  const dispStart = startTime;
  const dispEnd = _toHM(_toMin(endTime)-1);
  
  // Add delete button that appears on hover
  block.innerHTML = `
    <div style="display:flex; flex-direction:column; align-items:center; line-height:1.1; gap:1px; position:relative; width:100%; height:100%;">
      <button class="block-delete-btn" onclick="event.stopPropagation(); deleteScheduleBlockDirect(this.closest('[data-block-info]'))" 
              style="position:absolute; top:1px; right:1px; width:14px; height:14px; padding:0; border:none; background:rgba(239,68,68,0.9); color:white; border-radius:2px; cursor:pointer; font-size:10px; line-height:1; display:none; z-index:10;">×</button>
      <div style="font-size:9px;">${dispStart}</div>
      <div style="font-size:9px;">-</div>
      <div style="font-size:9px;">${dispEnd}</div>
    </div>`;
  
  // Show delete button on hover
  block.addEventListener('mouseenter', () => {
    const deleteBtn = block.querySelector('.block-delete-btn');
    if (deleteBtn && window.timelineEditMode) deleteBtn.style.display = 'block';
  });
  block.addEventListener('mouseleave', () => {
    const deleteBtn = block.querySelector('.block-delete-btn');
    if (deleteBtn) deleteBtn.style.display = 'none';
  });
  
  // Store block data
  block.dataset.blockInfo = JSON.stringify({
    type: type,
    startTime: startTime,
    endTime: endTime,
    startHour: startHour,
    endHour: endHour,
    laneIndex: laneIdx
  });
  
  block.addEventListener('click', () => editScheduleBlock(block));

  blocksContainer.appendChild(block);
  if (window.timelineEditMode && typeof markTimelineDirty === 'function') markTimelineDirty();
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
  
  // Always show times stacked, use inclusive end (end-1min)
  const _toMin2 = (t) => { const [hh,mm] = String(t||'0:0').split(':').map(x=>parseInt(x,10)||0); return hh*60+mm; };
  const _toHM2 = (m) => { m = Math.max(0, m); const hh=String(Math.floor(m/60)).padStart(2,'0'); const mm=String(m%60).padStart(2,'0'); return `${hh}:${mm}`; };
  const dispStart2 = startTime;
  const dispEnd2 = _toHM2(_toMin2(endTime)-1);
  
  // Update block with delete button
  blockElement.innerHTML = `
    <div style="display:flex; flex-direction:column; align-items:center; line-height:1.1; gap:1px; position:relative; width:100%; height:100%;">
      <button class="block-delete-btn" onclick="event.stopPropagation(); deleteScheduleBlockDirect(this.closest('[data-block-info]'))" 
              style="position:absolute; top:1px; right:1px; width:14px; height:14px; padding:0; border:none; background:rgba(239,68,68,0.9); color:white; border-radius:2px; cursor:pointer; font-size:10px; line-height:1; display:none; z-index:10;">×</button>
      <div style="font-size:9px;">${dispStart2}</div>
      <div style="font-size:9px;">-</div>
      <div style="font-size:9px;">${dispEnd2}</div>
    </div>`;
  
  // Re-attach hover listeners for delete button
  blockElement.addEventListener('mouseenter', () => {
    const deleteBtn = blockElement.querySelector('.block-delete-btn');
    if (deleteBtn && window.timelineEditMode) deleteBtn.style.display = 'block';
  });
  blockElement.addEventListener('mouseleave', () => {
    const deleteBtn = blockElement.querySelector('.block-delete-btn');
    if (deleteBtn) deleteBtn.style.display = 'none';
  });
  
  // Keep laneIndex from element dataset
  blockElement.dataset.blockInfo = JSON.stringify({
    type: type,
    startTime: startTime,
    endTime: endTime,
    startHour: startHour,
    endHour: endHour,
    laneIndex: laneIdx
  });
  if (window.timelineEditMode && typeof markTimelineDirty === 'function') markTimelineDirty();
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
    if (window.timelineEditMode && typeof markTimelineDirty === 'function') markTimelineDirty();
  }
}

// Direct delete function for inline delete buttons (no confirmation needed)
function deleteScheduleBlockDirect(blockElement) {
  if (!blockElement) return;
  
  // Simply remove the element from DOM
  blockElement.remove();
  
  // Mark timeline as dirty to enable save
  if (window.timelineEditMode && typeof markTimelineDirty === 'function') {
    markTimelineDirty();
  }
}

// Make function globally accessible for onclick handlers
window.deleteScheduleBlockDirect = deleteScheduleBlockDirect;

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
