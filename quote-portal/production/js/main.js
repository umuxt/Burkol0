// Entry point: wire modules to global for inline handlers to keep working
import { MESData, loadData, saveData, currentView, setCurrentView } from './state.js';
import { showToast } from './ui.js';
import { generateModernDashboard, generateWorkerPanel, generateSettings, generateOperations, generateWorkers, generateStations, generatePlanDesigner, generateTemplates } from './views.js';
import { initializePlanDesigner, loadOperationsToolbox, handleOperationDragStart, handleCanvasDragOver, handleCanvasDrop, renderCanvas, editNode, saveNodeEdit, closeNodeEditModal, deleteNode, toggleConnectMode, clearCanvas, handleOrderChange, savePlanAsTemplate, deployWorkOrder, handleCanvasClick } from './planDesigner.js';
import { openAddStationModal, editStation, closeStationModal, saveStation, toggleStationStatus, deleteStation as deleteStationAction } from './stations.js';
import { openHelp, closeHelp, switchHelpTab, toggleFAQ, initHelp } from './help.js';
import { toggleMobileNav, closeMobileNav } from './mobile.js';

function renderView(viewId) {
  let content = '';
  switch (viewId) {
    case 'dashboard': content = generateModernDashboard(); break;
    case 'worker-panel': content = generateWorkerPanel(); break;
    case 'plan-designer': content = generatePlanDesigner(); setTimeout(() => initializePlanDesigner(), 100); break;
    case 'templates': content = generateTemplates(); break;
    case 'settings': content = generateSettings(); break;
    case 'stations': content = generateStations(); break;
    case 'operations': content = generateOperations(); break;
    case 'workers': content = generateWorkers(); break;
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
  loadOperationsToolbox, handleOperationDragStart, handleCanvasDragOver, handleCanvasDrop, renderCanvas,
  editNode, saveNodeEdit, closeNodeEditModal, deleteNode, toggleConnectMode, clearCanvas, handleOrderChange, savePlanAsTemplate, deployWorkOrder, handleCanvasClick,
  // stations
  openAddStationModal, editStation, closeStationModal, saveStation, toggleStationStatus, deleteStation: deleteStationAction,
  // help
  openHelp, closeHelp, switchHelpTab, toggleFAQ,
  // mobile
  toggleMobileNav, closeMobileNav
});

document.addEventListener('DOMContentLoaded', () => {
  loadData();
  initHelp();
  navigateToView('dashboard');
});
