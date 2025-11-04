// Entry point: wire modules to global for inline handlers to keep working
import { MESData, loadData, saveData, currentView, setCurrentView, getSavedView } from './state.js';
import { showToast } from './ui.js';
import { generateModernDashboard, generateWorkerPanel, generateSettings, generateOperations, generateWorkers, generateStations, generatePlanDesigner, generateTemplates, generateApprovedQuotes, injectMetadataToggleStyles, toggleMetadataColumns } from './views.js';
import { initPlanOverviewUI, setActivePlanTab, openCreatePlan, filterProductionPlans, togglePlanFilterPanel, hidePlanFilterPanel, onPlanFilterChange, clearPlanFilter, clearAllPlanFilters, cancelPlanCreation, viewProductionPlan, editTemplateById } from './planOverview.js';
import { initializeWorkersUI, openAddWorkerModal, editWorker, deleteWorker as deleteWorkerAction, saveWorker, closeWorkerModal, showWorkerDetail, closeWorkerDetail, editWorkerFromDetail, deleteWorkerFromDetail } from './workers.js';
import { initializePlanDesigner, loadOperationsToolbox, handleOperationDragStart, handleCanvasDragOver, handleCanvasDrop, renderCanvas, editNode, saveNodeEdit, closeNodeEditModal, deleteNode, toggleConnectMode, clearCanvas, handleOrderChange, savePlanAsTemplate, deployWorkOrder, handleCanvasClick, handleScheduleTypeChange, handleRecurringTypeChange, handlePeriodicFrequencyChange, savePlanDraft, togglePlanOrderPanel, hidePlanOrderPanel, clearPlanOrder, filterPlanOrderList, selectPlanOrder, togglePlanTypePanel, hidePlanTypePanel, clearPlanType, selectPlanType } from './planDesigner.js';
import { loadOperationsToolboxBackend, editNodeBackend, handleCanvasDropBackend, loadApprovedOrdersToSelect, handleOrderChangeBackend, saveNodeEditBackend, handleAssignModeChangeBackend, handleStationChangeInEdit, openMaterialDropdown, filterMaterialDropdown, selectMaterialFromDropdown, debugMaterialsLoad, debugShowAllMaterials, addMaterialRow, removeMaterialRow, updateOutputCodePreviewBackend } from './planDesignerBackend.js';
import { openAddStationModal, editStation, closeStationModal, saveStation, toggleStationStatus, deleteStation as deleteStationAction, initializeStationsUI, setActiveStationTab, deleteStationFromModal, showStationDetail, closeStationDetail, editStationFromDetail, deleteStationFromDetail } from './stations.js';
import { initializeOperationsUI, openAddOperationModal, editOperation, deleteOperation, saveOperation, closeOperationModal, showOperationDetail, closeOperationDetail, editOperationFromDetail, deleteOperationFromDetail, openOperationTypesModal, closeOperationTypesModal, addOperationTypeFromModal, editOperationType, deleteOperationTypeConfirm, toggleOperationTypeDropdown, selectOperationTypeFromDropdown, addNewOperationTypeFromInput } from './operations.js';
import { openHelp, closeHelp, switchHelpTab, toggleFAQ, initHelp } from './help.js';
import { initializeApprovedQuotesUI, showApprovedQuoteDetail, closeApprovedQuoteDetail } from './approvedQuotes.js';
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
      }, 100);
      break;
    case 'templates': content = generateTemplates(); break;
    case 'approved-quotes': content = generateApprovedQuotes(); setTimeout(() => initializeApprovedQuotesUI(), 0); break;
    case 'settings': content = generateSettings(); setTimeout(() => initMasterDataUI(), 0); break;
    case 'stations': content = generateStations(); setTimeout(() => initializeStationsUI(), 0); break;
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
  openAddStationModal, editStation, closeStationModal, saveStation, toggleStationStatus, deleteStation: deleteStationAction, setActiveStationTab, deleteStationFromModal, showStationDetail, closeStationDetail, editStationFromDetail, deleteStationFromDetail,
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
  const initialView = getSavedView();
  navigateToView(initialView);
});
