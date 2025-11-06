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
    case 'settings': content = generateSettings(); setTimeout(() => initMasterDataUI(), 0); break;
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
  toggleMetadataColumns
});

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
