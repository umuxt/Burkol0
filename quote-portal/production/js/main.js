// Entry point: wire modules to global for inline handlers to keep working
import { MESData, loadData, saveData, currentView, setCurrentView, getSavedView } from './state.js';
import { showToast } from './ui.js';
import { generateModernDashboard, generateWorkerPanel, generateSettings, generateOperations, generateWorkers, generateStations, generatePlanDesigner, generateTemplates } from './views.js';
import { initializeWorkersUI, openAddWorkerModal, editWorker, deleteWorker as deleteWorkerAction, saveWorker, closeWorkerModal, showWorkerDetail, closeWorkerDetail, editWorkerFromDetail, deleteWorkerFromDetail } from './workers.js';
import { initializePlanDesigner, loadOperationsToolbox, handleOperationDragStart, handleCanvasDragOver, handleCanvasDrop, renderCanvas, editNode, saveNodeEdit, closeNodeEditModal, deleteNode, toggleConnectMode, clearCanvas, handleOrderChange, savePlanAsTemplate, deployWorkOrder, handleCanvasClick } from './planDesigner.js';
import { loadOperationsToolboxBackend, editNodeBackend, handleCanvasDropBackend } from './planDesignerBackend.js';
import { openAddStationModal, editStation, closeStationModal, saveStation, toggleStationStatus, deleteStation as deleteStationAction, initializeStationsUI, setActiveStationTab, deleteStationFromModal, showStationDetail, closeStationDetail, editStationFromDetail, deleteStationFromDetail } from './stations.js';
import { initializeOperationsUI, openAddOperationModal, editOperation, deleteOperation, saveOperation, closeOperationModal, showOperationDetail, closeOperationDetail, editOperationFromDetail, deleteOperationFromDetail, openOperationTypesModal, closeOperationTypesModal, addOperationTypeFromModal, editOperationType, deleteOperationTypeConfirm, toggleOperationTypeDropdown, selectOperationTypeFromDropdown, addNewOperationTypeFromInput } from './operations.js';
import { openHelp, closeHelp, switchHelpTab, toggleFAQ, initHelp } from './help.js';
import { initMasterDataUI, addSkillFromSettings, renameSkill, deleteSkill } from './masterData.js';
import { toggleMobileNav, closeMobileNav } from './mobile.js';

function renderView(viewId) {
  let content = '';
  switch (viewId) {
    case 'dashboard': content = generateModernDashboard(); break;
    case 'worker-panel': content = generateWorkerPanel(); break;
    case 'plan-designer':
      content = generatePlanDesigner();
      setTimeout(() => { initializePlanDesigner(); loadOperationsToolboxBackend(); }, 100);
      break;
    case 'templates': content = generateTemplates(); break;
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
  editNode: editNodeBackend, saveNodeEdit, closeNodeEditModal, deleteNode, toggleConnectMode, clearCanvas, handleOrderChange, savePlanAsTemplate, deployWorkOrder, handleCanvasClick,
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
});

document.addEventListener('DOMContentLoaded', () => {
  loadData();
  initHelp();
  const initialView = getSavedView();
  navigateToView(initialView);
});
