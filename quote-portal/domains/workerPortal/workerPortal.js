// Worker Portal Domain Module
// Handles worker task management, status updates, and scrap reporting

import { getWorkerPortalTasks, updateWorkPackage, getWorkers } from '../production/js/mesApi.js';
import { showSuccessToast, showErrorToast, showWarningToast, showInfoToast } from '../../shared/components/Toast.js';
import { 
  getEffectiveStatus, 
  getWorkerStatusBanner, 
  isWorkerAvailable,
  getStatusLabel,
  canWorkerStartTasks
} from '../../shared/utils/workerStatus.js';

// ============================================================================
// STATE MANAGEMENT
// ============================================================================

const state = {
  tasks: [],
  loading: false,
  error: null,
  currentWorker: null,
  currentWorkerDetails: null, // Full worker object with status/leave info
  nextTaskId: null
};

// ============================================================================
// INITIALIZATION
// ============================================================================

async function init() {
  console.log('Initializing Worker Portal...');
  
  // Get workerId from URL parameter
  const urlParams = new URLSearchParams(window.location.search);
  const workerId = urlParams.get('workerId');
  
  if (!workerId) {
    // Redirect to worker selection page
    window.location.href = '/pages/worker-selection.html';
    return;
  }
  
  state.currentWorker = { id: workerId };
  
  // Make app globally accessible for refresh button
  window.workerPortalApp = { loadWorkerTasks };
  
  // Load initial data
  await loadWorkerTasks();
  
  // Listen for assignment updates from other parts of the app
  window.addEventListener('assignments:updated', () => {
    console.log('Assignments updated, reloading tasks...');
    loadWorkerTasks();
  });
  
  // Listen for BroadcastChannel messages (from launch/pause/resume/cancel)
  try {
    const assignmentsChannel = new BroadcastChannel('mes-assignments');
    assignmentsChannel.onmessage = (e) => {
      if (e.data && e.data.type === 'assignments:updated') {
        console.log('BroadcastChannel: Assignments updated, reloading tasks...');
        loadWorkerTasks();
      }
    };
  } catch (err) {
    console.warn('BroadcastChannel not available:', err);
  }
}

// ============================================================================
// DATA LOADING
// ============================================================================

async function loadWorkerTasks() {
  state.loading = true;
  state.error = null;
  render();
  
  try {
    const result = await getWorkerPortalTasks(state.currentWorker.id);
    let tasks = result.tasks || [];
    
    // ✅ Work order'lara göre grupla ve canStart logic uygula
    const tasksByWorkOrder = {};
    tasks.forEach(task => {
      const wo = task.workOrderCode;
      if (!tasksByWorkOrder[wo]) tasksByWorkOrder[wo] = [];
      tasksByWorkOrder[wo].push(task);
    });
    
    // ✅ Her work order için canStart belirle
    Object.keys(tasksByWorkOrder).forEach(workOrderCode => {
      const woTasks = tasksByWorkOrder[workOrderCode];
      
      // Pending/in-progress/ready olanları filtrele
      const activeTasks = woTasks.filter(t => 
        t.status === 'pending' || t.status === 'in-progress' || t.status === 'in_progress' || t.status === 'ready'
      );
      
      // Sort by expectedStart (FIFO mode) or optimizedStart (optimized mode)
      activeTasks.sort((a, b) => {
        const aStart = new Date(a.optimizedStart || a.expectedStart || a.plannedStart).getTime();
        const bStart = new Date(b.optimizedStart || b.expectedStart || b.plannedStart).getTime();
        return aStart - bStart;
      });
      
      // ✅ canStart logic: isUrgent=true ise hepsi, değilse sadece ilk pending/ready
      const firstPendingIndex = activeTasks.findIndex(t => t.status === 'pending' || t.status === 'ready');
      
      console.log(`🔍 canStart logic for ${workOrderCode}:`, {
        totalTasks: woTasks.length,
        activeTasks: activeTasks.length,
        firstPendingIndex,
        isUrgent: activeTasks[0]?.isUrgent,
        tasks: activeTasks.map(t => ({ 
          id: t.assignmentId, 
          status: t.status, 
          expectedStart: t.expectedStart, 
          isUrgent: t.isUrgent 
        }))
      });
      
      activeTasks.forEach((task, index) => {
        if (task.status === 'in-progress' || task.status === 'in_progress') {
          task.canStart = false; // Already started
        } else {
          task.canStart = task.isUrgent || (index === firstPendingIndex);
        }
        console.log(`  Task ${task.assignmentId}: status=${task.status}, isUrgent=${task.isUrgent}, index=${index}, firstPending=${firstPendingIndex}, canStart=${task.canStart}`);
      });
    });
    
    state.tasks = tasks;
    state.nextTaskId = result.nextTaskId || null;
    
    // Debug: Log first task to check data
    if (state.tasks.length > 0) {
      console.log('📊 First task data:', {
        name: state.tasks[0].name,
        estimatedNominalTime: state.tasks[0].estimatedNominalTime,
        estimatedEffectiveTime: state.tasks[0].estimatedEffectiveTime,
        plannedStart: state.tasks[0].plannedStart,
        plannedEnd: state.tasks[0].plannedEnd,
        actualStart: state.tasks[0].actualStart,
        actualStartType: typeof state.tasks[0].actualStart,
        status: state.tasks[0].status,
        assignmentId: state.tasks[0].assignmentId
      });
      
      // Log the first in-progress task for debugging timer
      const inProgressTask = state.tasks.find(t => t.status === 'in-progress' || t.status === 'in_progress');
      if (inProgressTask) {
        console.log('⏱️ In-progress task for timer:', {
          name: inProgressTask.name,
          status: inProgressTask.status,
          actualStart: inProgressTask.actualStart,
          estimatedEffectiveTime: inProgressTask.estimatedEffectiveTime,
          estimatedNominalTime: inProgressTask.estimatedNominalTime
        });
      }
    }
    
    // Extract worker info from first task
    if (state.tasks.length > 0) {
      state.currentWorker = {
        id: state.tasks[0].workerId,
        name: state.tasks[0].workerName
      };
      
      // Fetch full worker details (status, leave info)
      try {
        const workers = await getWorkers();
        state.currentWorkerDetails = workers.find(w => w.id === state.currentWorker.id);
      } catch (err) {
        console.warn('Failed to load worker details:', err);
      }
    } else {
      // No tasks, fetch worker details directly
      try {
        const workers = await getWorkers();
        state.currentWorkerDetails = workers.find(w => w.id === state.currentWorker.id);
        if (state.currentWorkerDetails) {
          state.currentWorker.name = state.currentWorkerDetails.name;
        }
      } catch (err) {
        console.warn('Failed to load worker details:', err);
      }
    }
    
    state.loading = false;
    render();
  } catch (err) {
    console.error('Failed to load worker tasks:', err);
    state.error = err.message;
    state.loading = false;
    render();
  }
}

// ============================================================================
// TASK ACTIONS
// ============================================================================

async function startTask(assignmentId) {
  try {
    const result = await updateWorkPackage(assignmentId, { action: 'start' });
    
    // Check if backend rejected due to preconditions
    if (result.error && result.error.includes('precondition')) {
      showNotification('Görev başlatılamadı: Önkoşullar sağlanmadı', 'warning');
      
      // Mark task as blocked in UI
      const task = state.tasks.find(t => t.assignmentId === assignmentId);
      if (task) {
        task.status = 'blocked'; // Temporarily mark as blocked
      }
      render();
      
      // Reload tasks to get fresh status
      await loadWorkerTasks();
      return;
    }
    
    await loadWorkerTasks();
    
    // Notify other components
    window.dispatchEvent(new CustomEvent('assignments:updated'));
    
    showNotification('Görev başlatıldı', 'success');
  } catch (err) {
    console.error('Failed to start task:', err);
    
    // Check if error has material_shortage code
    if (err.code === 'material_shortage') {
      const shortages = err.shortages || [];
      const shortageList = shortages.map(s => 
        `${s.name || s.code}: ${s.shortage} ${s.unit} eksik (Var: ${s.available}, Gerek: ${s.required})`
      ).join('<br>');
      
      showNotification(
        `Malzeme eksikliği nedeniyle görev başlatılamadı:<br>${shortageList}`, 
        'error',
        10000 // Show for 10 seconds
      );
      
      // Mark task as blocked
      const task = state.tasks.find(t => t.assignmentId === assignmentId);
      if (task) {
        task.status = 'blocked';
        task.blockReasons = ['Malzeme eksik'];
      }
      
      render();
      
      // Reload tasks to get fresh status
      setTimeout(() => loadWorkerTasks(), 3000);
      return;
    }
    
    // Check if error has precondition_failed code
    if (err.code === 'precondition_failed') {
      // Display inline error with details
      const task = state.tasks.find(t => t.assignmentId === assignmentId);
      if (task) {
        task.status = 'blocked';
        task.blockReasons = err.details || [err.message];
      }
      
      // Show notification with details
      const reasons = err.details?.join(', ') || err.message;
      showNotification(`Görev başlatılamadı: ${reasons}`, 'warning');
      
      // Re-render to show blocked status
      render();
      
      // Reload tasks after short delay to get fresh status
      setTimeout(() => loadWorkerTasks(), 2000);
    } else {
      // Generic error handling
      const errorMsg = err.message || String(err);
      showNotification('Görev başlatılamadı: ' + errorMsg, 'error');
      
      // Reload to refresh task status
      await loadWorkerTasks();
    }
  }
}

async function pauseTask(assignmentId) {
  try {
    await updateWorkPackage(assignmentId, { action: 'pause' });
    await loadWorkerTasks();
    
    window.dispatchEvent(new CustomEvent('assignments:updated'));
    
    showNotification('Görev duraklatıldı', 'info');
  } catch (err) {
    console.error('Failed to pause task:', err);
    showNotification('Görev duraksatılamadı: ' + err.message, 'error');
  }
}

async function reportStationError(assignmentId) {
  const note = await showStationErrorModal();
  if (!note) return; // User cancelled
  
  try {
    await updateWorkPackage(assignmentId, { 
      action: 'station_error',
      stationNote: note
    });
    await loadWorkerTasks();
    
    window.dispatchEvent(new CustomEvent('assignments:updated'));
    
    showNotification('İstasyon hatası bildirildi', 'warning');
  } catch (err) {
    console.error('Failed to report station error:', err);
    showNotification('Hata bildirimi gönderilemedi: ' + err.message, 'error');
  }
}

async function completeTask(assignmentId) {
  // Find the task to get plannedOutput information
  const task = state.tasks.find(t => t.assignmentId === assignmentId);
  
  const completionData = await showCompletionModal(task);
  if (completionData === null) return; // User cancelled
  
  try {
    const payload = { 
      action: 'complete',
      actualOutputQuantity: completionData.actualOutputQuantity,
      defectQuantity: completionData.defectQuantity,
      // Keep scrapQty for backward compatibility
      scrapQty: completionData.defectQuantity
    };
    
    // Include scrap counter details if available
    if (completionData.scrapCounters) {
      payload.scrapCounters = completionData.scrapCounters;
    }
    
    await updateWorkPackage(assignmentId, payload);
    await loadWorkerTasks();
    
    window.dispatchEvent(new CustomEvent('assignments:updated'));
    
    const message = completionData.defectQuantity > 0 
      ? `Görev tamamlandı (Üretilen: ${completionData.actualOutputQuantity}, Fire: ${completionData.defectQuantity})`
      : `Görev tamamlandı (Üretilen: ${completionData.actualOutputQuantity})`;
    showNotification(message, 'success');
  } catch (err) {
    console.error('Failed to complete task:', err);
    showNotification('Görev tamamlanamadı: ' + err.message, 'error');
  }
}

// ============================================================================
// MODALS
// ============================================================================

function showStationErrorModal() {
  return new Promise((resolve) => {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal-content" style="max-width: 500px;">
        <div class="modal-header">
          <h2 class="modal-title">⚠️ İstasyon Hatası Bildirimi</h2>
          <button class="modal-close" onclick="this.closest('.modal-overlay').remove(); arguments[0].stopPropagation();">×</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label class="form-label">Hata Açıklaması</label>
            <textarea 
              id="stationErrorNote" 
              class="form-input" 
              rows="4" 
              placeholder="İstasyon ile ilgili sorunu açıklayın..."
              required
            ></textarea>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" onclick="this.closest('.modal-overlay').remove();">İptal</button>
          <button class="btn-primary" id="confirmErrorBtn">Hata Bildir</button>
        </div>
      </div>
    `;
    
    document.body.appendChild(modal);
    
    const noteInput = modal.querySelector('#stationErrorNote');
    const confirmBtn = modal.querySelector('#confirmErrorBtn');
    
    noteInput.focus();
    
    confirmBtn.onclick = () => {
      const note = noteInput.value.trim();
      if (!note) {
        showNotification('Lütfen hata açıklaması girin', 'warning');
        return;
      }
      modal.remove();
      resolve(note);
    };
    
    modal.onclick = (e) => {
      if (e.target === modal) {
        modal.remove();
        resolve(null);
      }
    };
  });
}

function showCompletionModal(task) {
  return new Promise(async (resolve) => {
    // Extract planned output information
    let plannedQty = 0;
    let outputUnit = 'adet';
    let outputCode = '';
    
    if (task && task.plannedOutput) {
      // plannedOutput is an object like { "AK-002": 100 }
      const outputEntries = Object.entries(task.plannedOutput);
      if (outputEntries.length > 0) {
        [outputCode, plannedQty] = outputEntries[0];
      }
    }
    
    // Fallback to hasOutputs and outputQty if plannedOutput not available
    if (plannedQty === 0 && task) {
      plannedQty = task.outputQty || 0;
      outputCode = task.outputCode || '';
    }
    
    // Fetch scrap counters
    const counters = await getScrapCounters(task.assignmentId);
    const outputDefectQty = counters.defectQuantity || 0;
    const hasScrapData = (Object.keys(counters.inputScrapCounters).length > 0 || 
                          Object.keys(counters.productionScrapCounters).length > 0 || 
                          outputDefectQty > 0);
    
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal-content" style="max-width: 550px;">
        <div class="modal-header">
          <h2 class="modal-title">✅ Görev Tamamlama</h2>
          <button class="modal-close" onclick="this.closest('.modal-overlay').remove(); arguments[0].stopPropagation();">×</button>
        </div>
        <div class="modal-body">
          ${outputCode ? `<div class="form-info" style="margin-bottom: 16px; padding: 12px; background: #f0f9ff; border-left: 3px solid #0284c7; border-radius: 4px;">
            <div style="font-size: 13px; color: #0c4a6e; font-weight: 600; margin-bottom: 4px;">
              📦 Üretim Kodu: ${outputCode}
            </div>
            <div style="font-size: 12px; color: #075985;">
              Bu görevin hedef çıktısı
            </div>
          </div>` : ''}
          
          <div class="form-group">
            <label class="form-label" for="actualOutputQty">
              Üretilen Miktar (${outputUnit})
              <span style="color: #dc2626;">*</span>
            </label>
            <input 
              type="number" 
              id="actualOutputQty" 
              class="form-input" 
              min="0" 
              step="0.01" 
              value="${plannedQty}"
              placeholder="Üretilen sağlam ürün miktarı"
              required
            />
            <p class="form-help">Bu görev sonunda kaç adet sağlam ürün ürettiğinizi girin.</p>
          </div>
          
          <div class="form-group">
            <label class="form-label" for="defectQty">
              Çıktı Hatası / Output Defect (${outputUnit})
            </label>
            <input 
              type="number" 
              id="defectQty" 
              class="form-input" 
              min="0" 
              step="0.01" 
              value="${outputDefectQty}"
              placeholder="0.00"
            />
            <p class="form-help">${hasScrapData ? '🔥 Fire sayacından otomatik yüklendi. Düzenleyebilirsiniz.' : 'Çıktı malzemesinde oluşan hatalı ürün miktarını girin.'}</p>
          </div>
          
          ${hasScrapData ? `
          <div class="form-info" style="margin-top: 16px; padding: 12px; background: #fef3c7; border-left: 3px solid #f59e0b; border-radius: 4px;">
            <div style="font-size: 12px; color: #92400e; margin-bottom: 8px;">
              <strong>🔥 Fire Detayları:</strong>
            </div>
            ${Object.keys(counters.inputScrapCounters).length > 0 ? `
            <div style="font-size: 11px; color: #78350f; margin-bottom: 4px;">
              <strong>Hasarlı Gelen:</strong> ${Object.entries(counters.inputScrapCounters).map(([code, qty]) => `${code}: ${qty}`).join(', ')}
            </div>` : ''}
            ${Object.keys(counters.productionScrapCounters).length > 0 ? `
            <div style="font-size: 11px; color: #78350f; margin-bottom: 4px;">
              <strong>Üretimde Hurda:</strong> ${Object.entries(counters.productionScrapCounters).map(([code, qty]) => `${code}: ${qty}`).join(', ')}
            </div>` : ''}
            ${counters.defectQuantity > 0 ? `
            <div style="font-size: 11px; color: #78350f;">
              <strong>Çıktı Hatası:</strong> ${counters.defectQuantity}
            </div>` : ''}
          </div>` : ''}
          
          <div class="form-info" style="margin-top: 16px; padding: 12px; background: #fef3c7; border-left: 3px solid #f59e0b; border-radius: 4px;">
            <div style="font-size: 12px; color: #92400e;">
              <strong>💡 Not:</strong> Planlanan miktar ${plannedQty} ${outputUnit} olarak ayarlanmıştır. 
              Gerçekleşen miktarı değiştirebilir ve fire varsa girebilirsiniz.
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" onclick="this.closest('.modal-overlay').remove();">İptal</button>
          <button class="btn-primary" id="confirmCompleteBtn">Onayla ve Bitir</button>
        </div>
      </div>
    `;
    
    document.body.appendChild(modal);
    
    const actualOutputInput = modal.querySelector('#actualOutputQty');
    const defectInput = modal.querySelector('#defectQty');
    const confirmBtn = modal.querySelector('#confirmCompleteBtn');
    
    actualOutputInput.focus();
    actualOutputInput.select();
    
    // Store current defect value for delta calculation
    let currentDefectValue = outputDefectQty;
    
    // Update output defect counter when defectQty changes
    let updateTimeout;
    defectInput.addEventListener('input', () => {
      clearTimeout(updateTimeout);
      updateTimeout = setTimeout(async () => {
        const newDefectQty = parseFloat(defectInput.value) || 0;
        if (newDefectQty >= 0 && newDefectQty !== currentDefectValue) {
          try {
            // Calculate delta and update backend counter
            const delta = newDefectQty - currentDefectValue;
            await incrementScrap(outputCode, 'output_scrap', delta);
            currentDefectValue = newDefectQty; // Update tracking value
            counters.defectQuantity = newDefectQty;
            console.log(`Updated output defect: ${currentDefectValue - delta} → ${newDefectQty} (delta: ${delta})`);
          } catch (error) {
            console.error('Failed to update output defect counter:', error);
          }
        }
      }, 500); // Debounce 500ms
    });
    
    confirmBtn.onclick = () => {
      const actualOutputQuantity = parseFloat(actualOutputInput.value);
      const defectQuantity = parseFloat(defectInput.value) || 0;
      
      // Validation
      if (isNaN(actualOutputQuantity) || actualOutputQuantity < 0) {
        showNotification('Lütfen geçerli bir üretim miktarı girin', 'warning');
        actualOutputInput.focus();
        return;
      }
      
      if (defectQuantity < 0) {
        showNotification('Fire miktarı negatif olamaz', 'warning');
        defectInput.focus();
        return;
      }
      
      modal.remove();
      resolve({
        actualOutputQuantity,
        defectQuantity,
        scrapCounters: hasScrapData ? counters : null // Include scrap counter data
      });
    };
    
    modal.onclick = (e) => {
      if (e.target === modal) {
        modal.remove();
        resolve(null);
      }
    };
    
    // Allow Enter key to submit
    const handleEnter = (e) => {
      if (e.key === 'Enter') {
        confirmBtn.click();
      }
    };
    
    actualOutputInput.addEventListener('keypress', handleEnter);
    defectInput.addEventListener('keypress', handleEnter);
  });
}

// Legacy function for backward compatibility
function showScrapModal() {
  return new Promise((resolve) => {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal-content" style="max-width: 500px;">
        <div class="modal-header">
          <h2 class="modal-title">✅ Görev Tamamlama</h2>
          <button class="modal-close" onclick="this.closest('.modal-overlay').remove(); arguments[0].stopPropagation();">×</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label class="form-label">Fire Miktarı (varsa)</label>
            <input 
              type="number" 
              id="scrapQtyInput" 
              class="form-input" 
              min="0" 
              step="0.01" 
              value="0"
              placeholder="0.00"
            />
            <p class="form-help">Fire yoksa 0 bırakın ve tamamlayın</p>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" onclick="this.closest('.modal-overlay').remove();">İptal</button>
          <button class="btn-primary" id="confirmCompleteBtn">Tamamla</button>
        </div>
      </div>
    `;
    
    document.body.appendChild(modal);
    
    const scrapInput = modal.querySelector('#scrapQtyInput');
    const confirmBtn = modal.querySelector('#confirmCompleteBtn');
    
    scrapInput.focus();
    scrapInput.select();
    
    confirmBtn.onclick = () => {
      const scrapQty = parseFloat(scrapInput.value) || 0;
      modal.remove();
      resolve(scrapQty);
    };
    
    modal.onclick = (e) => {
      if (e.target === modal) {
        modal.remove();
        resolve(null);
      }
    };
    
    // Allow Enter key to submit
    scrapInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        confirmBtn.click();
      }
    });
  });
}

// ============================================================================
// FIRE COUNTER SYSTEM (Real-time with atomic backend sync)
// ============================================================================

let currentFireAssignment = null;
let scrapCounters = {
  inputScrapCounters: {},      // { 'M-001': 5, 'M-002': 3 }
  productionScrapCounters: {}, // { 'M-001': 2 }
  defectQuantity: 0
};
let pendingMaterialCode = null; // For scrap type selection

// Get total scrap count for an assignment
async function getScrapCounters(assignmentId) {
  try {
    const response = await fetch(`/api/mes/work-packages/${assignmentId}/scrap`);
    if (!response.ok) {
      // No counters yet
      return {
        inputScrapCounters: {},
        productionScrapCounters: {},
        defectQuantity: 0
      };
    }
    return await response.json();
  } catch (error) {
    console.error('Failed to fetch scrap counters:', error);
    return {
      inputScrapCounters: {},
      productionScrapCounters: {},
      defectQuantity: 0
    };
  }
}

// Calculate total scrap from counters
function calculateTotalScrap(counters) {
  let total = 0;
  
  // Input damaged materials
  if (counters.inputScrapCounters) {
    total += Object.values(counters.inputScrapCounters).reduce((sum, val) => sum + val, 0);
  }
  
  // Production scraps
  if (counters.productionScrapCounters) {
    total += Object.values(counters.productionScrapCounters).reduce((sum, val) => sum + val, 0);
  }
  
  // Output defects
  if (counters.defectQuantity) {
    total += counters.defectQuantity;
  }
  
  return total;
}

// Open fire modal for an assignment
async function openFireModal(assignmentId) {
  // Find assignment from current tasks
  const task = state.tasks.find(t => t.assignmentId === assignmentId);
  if (!task) {
    showNotification('Görev bulunamadı', 'error');
    return;
  }
  
  console.log('Opening fire modal for assignment:', assignmentId);
  console.log('Task data:', task);
  console.log('preProductionReservedAmount:', task.preProductionReservedAmount);
  console.log('materialInputs:', task.materialInputs);
  console.log('outputCode:', task.outputCode);
  
  currentFireAssignment = task;
  
  // Load current scrap counters from backend
  try {
    const response = await fetch(`/api/mes/work-packages/${assignmentId}/scrap`);
    
    if (!response.ok) {
      // If 404, assignment might not have counters yet - initialize empty
      if (response.status === 404) {
        console.warn('Assignment not found, initializing empty counters');
        scrapCounters = {
          inputScrapCounters: {},
          productionScrapCounters: {},
          defectQuantity: 0
        };
      } else {
        const errorText = await response.text();
        throw new Error(`Failed to fetch scrap counters: ${response.status} ${errorText}`);
      }
    } else {
      const data = await response.json();
      scrapCounters = {
        inputScrapCounters: data.inputScrapCounters || {},
        productionScrapCounters: data.productionScrapCounters || {},
        defectQuantity: data.defectQuantity || 0
      };
    }
  } catch (error) {
    console.error('Failed to load scrap counters:', error);
    // Initialize empty counters and continue - we can still add new scrap entries
    console.log('Continuing with empty counters...');
    scrapCounters = {
      inputScrapCounters: {},
      productionScrapCounters: {},
      defectQuantity: 0
    };
  }
  
  // Create modal
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.id = 'fireModal';
  modal.innerHTML = `
    <div class="modal-content" style="max-width: 700px;">
      <div class="modal-header">
        <h2 class="modal-title">🗑️ Fire Sayacı - ${task.name || task.operationName}</h2>
        <button class="modal-close" onclick="closeFireModal()">×</button>
      </div>
      
      <div class="modal-body">
        <p class="info-text">Malzeme butonlarına tıklayarak fire sayaçlarını artırın. Değişiklikler anında backend'e senkronize edilir.</p>
        
        <div class="material-section">
          <h4 style="color: #111827; margin-bottom: 12px; font-size: 14px; font-weight: 600;">Giriş Malzemeleri</h4>
          <div class="material-buttons-grid" id="inputMaterialsGrid"></div>
        </div>
        
        <div class="material-section">
          <h4 style="color: #111827; margin-bottom: 12px; font-size: 14px; font-weight: 600;">Çıktı Ürün</h4>
          <div class="material-buttons-grid" id="outputMaterialGrid"></div>
        </div>
        
        <div class="totals-summary">
          <h4 style="margin-bottom: 12px; font-size: 14px; color: #111827;">Oturum Toplamları</h4>
          <div id="totalsSummary" class="totals-list"></div>
        </div>
      </div>
      
      <div class="modal-footer">
        <button class="btn-secondary" onclick="closeFireModal()">Kapat</button>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  // Populate material buttons
  populateMaterialButtons();
  updateCounterDisplay();
}

function closeFireModal() {
  const modal = document.getElementById('fireModal');
  if (modal) modal.remove();
  currentFireAssignment = null;
}

// Show scrap type selector for input materials
function showScrapTypeSelector(materialCode) {
  pendingMaterialCode = materialCode;
  
  // Check if modal already exists
  let modal = document.getElementById('scrapTypeModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.id = 'scrapTypeModal';
    modal.style.zIndex = '10000';
    modal.innerHTML = `
      <div class="modal-content" style="max-width: 400px;">
        <div class="modal-header">
          <h2 class="modal-title">Fire Tipi Seçin</h2>
        </div>
        <div class="modal-body">
          <p style="margin-bottom: 16px;">Malzeme: <strong id="selectedMaterialCode"></strong></p>
          <div class="scrap-type-buttons">
            <button class="scrap-type-btn" 
                    data-type="input_damaged"
                    onclick="incrementScrapWithType('input_damaged')">
              <span style="font-size: 16px; font-weight: 600;">📦 Hasarlı Gelen</span>
              <small style="color: #6b7280; font-size: 12px; margin-top: 4px; display: block;">Malzeme hasarlı geldi</small>
            </button>
            <button class="scrap-type-btn" 
                    data-type="production_scrap"
                    onclick="incrementScrapWithType('production_scrap')">
              <span style="font-size: 16px; font-weight: 600;">🔧 Üretimde Hurda</span>
              <small style="color: #6b7280; font-size: 12px; margin-top: 4px; display: block;">Üretim sırasında hasar gördü</small>
            </button>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" onclick="closeScrapTypeModal()">İptal</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  }
  
  document.getElementById('selectedMaterialCode').textContent = materialCode;
  modal.style.display = 'flex';
}

function closeScrapTypeModal() {
  const modal = document.getElementById('scrapTypeModal');
  if (modal) modal.style.display = 'none';
  pendingMaterialCode = null;
}

// Increment scrap with selected type (for input materials)
async function incrementScrapWithType(scrapType) {
  if (!pendingMaterialCode) return;
  
  await incrementScrap(pendingMaterialCode, scrapType, 1);
  closeScrapTypeModal();
}

// Real-time counter increment (syncs to backend immediately)
async function incrementScrap(materialCode, scrapType, quantity) {
  if (!currentFireAssignment) return;
  
  try {
    // Optimistic UI update
    if (scrapType === 'input_damaged') {
      scrapCounters.inputScrapCounters[materialCode] = 
        (scrapCounters.inputScrapCounters[materialCode] || 0) + quantity;
    } else if (scrapType === 'production_scrap') {
      scrapCounters.productionScrapCounters[materialCode] = 
        (scrapCounters.productionScrapCounters[materialCode] || 0) + quantity;
    } else if (scrapType === 'output_scrap') {
      scrapCounters.defectQuantity += quantity;
    }
    
    updateCounterDisplay();
    
    // Sync to backend (atomic increment)
    const response = await fetch(`/api/mes/work-packages/${currentFireAssignment.assignmentId}/scrap`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        scrapType,
        entry: {
          materialCode,
          quantity
        }
      })
    });
    
    if (!response.ok) {
      throw new Error('Failed to sync counter');
    }
    
    // Show success feedback (brief toast)
    showToast(`✅ ${materialCode}: +${quantity}`, 'success');
    
  } catch (error) {
    console.error('Failed to increment scrap:', error);
    // Revert optimistic update
    if (scrapType === 'input_damaged') {
      scrapCounters.inputScrapCounters[materialCode] -= quantity;
    } else if (scrapType === 'production_scrap') {
      scrapCounters.productionScrapCounters[materialCode] -= quantity;
    } else if (scrapType === 'output_scrap') {
      scrapCounters.defectQuantity -= quantity;
    }
    updateCounterDisplay();
    showNotification('Fire sayacı güncellenemedi: ' + error.message, 'error');
  }
}

// Populate material buttons from assignment data
function populateMaterialButtons() {
  if (!currentFireAssignment) return;
  
  const inputGrid = document.getElementById('inputMaterialsGrid');
  const outputGrid = document.getElementById('outputMaterialGrid');
  
  if (!inputGrid || !outputGrid) return;
  
  // Try multiple field names for input materials
  const inputMaterials = currentFireAssignment.preProductionReservedAmount 
    || currentFireAssignment.materialInputs
    || currentFireAssignment.inputs
    || {};
  
  console.log('Input materials found:', inputMaterials);
  
  const materialCodes = Object.keys(inputMaterials);
  
  if (materialCodes.length === 0) {
    inputGrid.innerHTML = '<p style="color: #9ca3af; font-size: 13px;">Giriş malzemesi bulunamadı</p>';
  } else {
    inputGrid.innerHTML = materialCodes.map(materialCode => {
      const totalCount = 
        (scrapCounters.inputScrapCounters[materialCode] || 0) + 
        (scrapCounters.productionScrapCounters[materialCode] || 0);
      
      return `
        <div class="material-button-wrapper">
          <button class="material-btn" 
                  data-material-code="${materialCode}" 
                  onclick="showScrapTypeSelector('${materialCode}')">
            <div class="material-info">
              <span class="material-code">${materialCode}</span>
            </div>
            <div class="counter-badge ${totalCount > 0 ? 'has-count' : ''}" 
                 id="counter-input-${materialCode}">${totalCount}</div>
          </button>
        </div>
      `;
    }).join('');
  }
  
  // Output material (from outputCode)
  const outputCode = currentFireAssignment.outputCode;
  if (outputCode) {
    outputGrid.innerHTML = `
      <button class="material-btn material-btn-output" 
              data-material-code="${outputCode}" 
              onclick="incrementScrap('${outputCode}', 'output_scrap', 1)">
        <div class="material-info">
          <span class="material-code">${outputCode}</span>
        </div>
        <div class="counter-badge counter-badge-output ${scrapCounters.defectQuantity > 0 ? 'has-count' : ''}" 
             id="counter-output-${outputCode}">${scrapCounters.defectQuantity}</div>
      </button>
    `;
  } else {
    outputGrid.innerHTML = '<p style="color: #9ca3af; font-size: 13px;">Çıktı ürün tanımlı değil</p>';
  }
}

// Update counter display (badges and totals)
function updateCounterDisplay() {
  // Update input material badges
  Object.keys(scrapCounters.inputScrapCounters).forEach(materialCode => {
    const badgeEl = document.getElementById(`counter-input-${materialCode}`);
    if (badgeEl) {
      const totalCount = 
        (scrapCounters.inputScrapCounters[materialCode] || 0) + 
        (scrapCounters.productionScrapCounters[materialCode] || 0);
      badgeEl.textContent = totalCount;
      badgeEl.classList.toggle('has-count', totalCount > 0);
    }
  });
  
  Object.keys(scrapCounters.productionScrapCounters).forEach(materialCode => {
    const badgeEl = document.getElementById(`counter-input-${materialCode}`);
    if (badgeEl) {
      const totalCount = 
        (scrapCounters.inputScrapCounters[materialCode] || 0) + 
        (scrapCounters.productionScrapCounters[materialCode] || 0);
      badgeEl.textContent = totalCount;
      badgeEl.classList.toggle('has-count', totalCount > 0);
    }
  });
  
  // Update output badge
  const outputCode = currentFireAssignment?.outputCode;
  if (outputCode) {
    const outputBadgeEl = document.getElementById(`counter-output-${outputCode}`);
    if (outputBadgeEl) {
      outputBadgeEl.textContent = scrapCounters.defectQuantity;
      outputBadgeEl.classList.toggle('has-count', scrapCounters.defectQuantity > 0);
    }
  }
  
  // Update totals summary
  updateTotalsSummary();
}

// Update totals summary display
function updateTotalsSummary() {
  const summaryEl = document.getElementById('totalsSummary');
  if (!summaryEl) return;
  
  const entries = [];
  
  // Input damaged
  Object.entries(scrapCounters.inputScrapCounters).forEach(([code, qty]) => {
    if (qty > 0) {
      entries.push(`
        <div class="total-item">
          <span class="badge badge-red">Hasarlı Gelen</span> ${code}: ${qty}
          <button class="decrement-btn" onclick="decrementScrap('${code}', 'input_damaged', 1)" title="1 azalt">
            −
          </button>
        </div>
      `);
    }
  });
  
  // Production scrap
  Object.entries(scrapCounters.productionScrapCounters).forEach(([code, qty]) => {
    if (qty > 0) {
      entries.push(`
        <div class="total-item">
          <span class="badge badge-orange">Üretimde Hurda</span> ${code}: ${qty}
          <button class="decrement-btn" onclick="decrementScrap('${code}', 'production_scrap', 1)" title="1 azalt">
            −
          </button>
        </div>
      `);
    }
  });
  
  // Output defects
  if (scrapCounters.defectQuantity > 0) {
    entries.push(`
      <div class="total-item">
        <span class="badge badge-yellow">Çıktı Fire</span> ${currentFireAssignment.outputCode}: ${scrapCounters.defectQuantity}
        <button class="decrement-btn" onclick="decrementScrap('${currentFireAssignment.outputCode}', 'output_scrap', 1)" title="1 azalt">
          −
        </button>
      </div>
    `);
  }
  
  summaryEl.innerHTML = entries.length > 0 
    ? entries.join('') 
    : '<p class="no-data">Henüz fire kaydı yok</p>';
}

// Show toast notification (brief feedback)
function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  toast.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    padding: 12px 20px;
    background: ${type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#3b82f6'};
    color: white;
    border-radius: 6px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    z-index: 10001;
    font-size: 13px;
    font-weight: 500;
  `;
  
  document.body.appendChild(toast);
  
  setTimeout(() => toast.remove(), 2000);
}

// Decrement scrap counter (undo)
async function decrementScrap(materialCode, scrapType, quantity) {
  if (!currentFireAssignment) return;
  
  // Check if counter has value to decrement
  let currentValue = 0;
  if (scrapType === 'input_damaged') {
    currentValue = scrapCounters.inputScrapCounters[materialCode] || 0;
  } else if (scrapType === 'production_scrap') {
    currentValue = scrapCounters.productionScrapCounters[materialCode] || 0;
  } else if (scrapType === 'output_scrap') {
    currentValue = scrapCounters.defectQuantity || 0;
  }
  
  if (currentValue <= 0) {
    showToast('⚠️ Sayaç zaten 0', 'warning');
    return;
  }
  
  try {
    // Optimistic UI update
    if (scrapType === 'input_damaged') {
      scrapCounters.inputScrapCounters[materialCode] = Math.max(0, currentValue - quantity);
    } else if (scrapType === 'production_scrap') {
      scrapCounters.productionScrapCounters[materialCode] = Math.max(0, currentValue - quantity);
    } else if (scrapType === 'output_scrap') {
      scrapCounters.defectQuantity = Math.max(0, currentValue - quantity);
    }
    
    updateCounterDisplay();
    
    // Sync to backend (atomic decrement)
    const response = await fetch(
      `/api/mes/work-packages/${currentFireAssignment.assignmentId}/scrap/${scrapType}/${materialCode}/${quantity}`,
      { method: 'DELETE' }
    );
    
    if (!response.ok) {
      throw new Error('Failed to decrement counter');
    }
    
    // Show success feedback
    showToast(`✅ ${materialCode}: −${quantity}`, 'success');
    
  } catch (error) {
    console.error('Failed to decrement scrap:', error);
    // Revert optimistic update
    if (scrapType === 'input_damaged') {
      scrapCounters.inputScrapCounters[materialCode] = currentValue;
    } else if (scrapType === 'production_scrap') {
      scrapCounters.productionScrapCounters[materialCode] = currentValue;
    } else if (scrapType === 'output_scrap') {
      scrapCounters.defectQuantity = currentValue;
    }
    updateCounterDisplay();
    showNotification('Fire sayacı azaltılamadı: ' + error.message, 'error');
  }
}

// Make functions globally accessible for onclick handlers
window.closeFireModal = closeFireModal;
window.showScrapTypeSelector = showScrapTypeSelector;
window.closeScrapTypeModal = closeScrapTypeModal;
window.incrementScrapWithType = incrementScrapWithType;
window.incrementScrap = incrementScrap;
window.decrementScrap = decrementScrap;

// ============================================================================
// RENDERING
// ============================================================================

function render() {
  const container = document.getElementById('workerPortalContent');
  if (!container) return;
  
  if (state.loading) {
    container.innerHTML = renderLoading();
    return;
  }
  
  if (state.error) {
    container.innerHTML = renderError(state.error);
    return;
  }
  
  container.innerHTML = `
    ${renderStatusBanner()}
    ${renderWorkerSummary()}
    ${renderTaskList()}
  `;
  
  // Attach event listeners
  attachEventListeners();
  
  // Start live duration updates
  startDurationUpdates();
}

function renderLoading() {
  return `
    <div class="loading-container">
      <div class="spinner"></div>
      <p>Görevler yükleniyor...</p>
    </div>
  `;
}

function renderError(error) {
  return `
    <div class="error-container">
      <div class="error-icon">⚠️</div>
      <h3>Görevler Yüklenemedi</h3>
      <p>${error}</p>
      <button class="btn-primary" onclick="window.workerPortalApp.loadWorkerTasks()">Tekrar Dene</button>
    </div>
  `;
}

function renderStatusBanner() {
  // Only show banner if we have worker details
  if (!state.currentWorkerDetails) return '';
  
  // Check if worker can start tasks (includes schedule check)
  const workCheck = canWorkerStartTasks(state.currentWorkerDetails);
  
  if (!workCheck.canWork) {
    const icons = {
      'İşten ayrıldı': '❌',
      'Hasta': '🤒',
      'İzinli': '🏖️',
      'Mola': '☕',
      'Mesai programına göre mola saatinde': '⏰'
    };
    const types = {
      'İşten ayrıldı': 'error',
      'Hasta': 'warning',
      'İzinli': 'warning',
      'Mola': 'info',
      'Mesai programına göre mola saatinde': 'info'
    };
    
    const icon = icons[workCheck.reason] || '⚠️';
    const type = types[workCheck.reason] || 'info';
    const message = workCheck.reason === 'Mesai programına göre mola saatinde' 
      ? 'Şu an çalışma programınıza göre mola saatindesiniz. Görev başlatılamaz.'
      : getWorkerStatusBanner(state.currentWorkerDetails)?.message || `Durum: ${workCheck.reason}`;
    
    const typeClasses = {
      error: 'bg-red-50 border-red-500 text-red-900',
      warning: 'bg-yellow-50 border-yellow-500 text-yellow-900',
      info: 'bg-blue-50 border-blue-500 text-blue-900'
    };
    
    const bgClass = typeClasses[type] || typeClasses.info;
    
    return `
      <div class="worker-status-banner" style="margin-bottom: 16px; padding: 16px; ${bgClass} border-l-4; border-radius: 8px;">
        <div style="display: flex; align-items: start; gap: 12px;">
          <div style="font-size: 24px;">${icon}</div>
          <div style="flex: 1;">
            <div style="font-size: 14px; font-weight: 600; margin-bottom: 4px;">
              Durum Bildirimi
            </div>
            <div style="font-size: 13px;">
              ${message}
            </div>
          </div>
        </div>
      </div>
    `;
  }
  
  return '';
}

function renderWorkerSummary() {
  if (!state.currentWorker) {
    return `
      <div class="worker-card">
        <div class="worker-card-header">
          <div class="worker-avatar">👷</div>
          <div>
            <h3 class="worker-name">Henüz görev atanmadı</h3>
            <p class="worker-subtitle">Yöneticinizle iletişime geçin</p>
          </div>
        </div>
      </div>
    `;
  }
  
  const activeTasks = state.tasks.filter(t => t.status === 'in_progress').length;
  const readyTasks = state.tasks.filter(t => t.status === 'ready').length;
  const pendingTasks = state.tasks.filter(t => t.status === 'pending').length;
  
  // Get worker status badge if we have details
  let statusBadgeHtml = '';
  if (state.currentWorkerDetails) {
    const effectiveStatus = getEffectiveStatus(state.currentWorkerDetails);
    const statusLabel = getStatusLabel(effectiveStatus);
    const badgeColors = {
      'available': 'bg-green-100 text-green-800',
      'busy': 'bg-yellow-100 text-yellow-800',
      'break': 'bg-blue-100 text-blue-800',
      'inactive': 'bg-gray-100 text-gray-800',
      'leave-sick': 'bg-red-100 text-red-800',
      'leave-vacation': 'bg-orange-100 text-orange-800'
    };
    const badgeColor = badgeColors[effectiveStatus] || 'bg-gray-100 text-gray-800';
    statusBadgeHtml = `
      <div style="padding: 4px 12px; ${badgeColor}; border-radius: 12px; font-size: 12px; font-weight: 600;">
        ${statusLabel}
      </div>
    `;
  }
  
  return `
    <div class="worker-card">
      <div class="worker-card-header">
        <div class="worker-avatar">👷</div>
        <div style="flex: 1;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <h3 class="worker-name">${state.currentWorker.name || 'İsimsiz İşçi'}</h3>
            ${statusBadgeHtml}
          </div>
          <p class="worker-subtitle">ID: ${state.currentWorker.id}</p>
        </div>
        <div class="worker-stats">
          <div class="stat-item">
            <div class="stat-value">${activeTasks}</div>
            <div class="stat-label">Devam Eden</div>
          </div>
          <div class="stat-item">
            <div class="stat-value">${readyTasks}</div>
            <div class="stat-label">Hazır</div>
          </div>
          <div class="stat-item">
            <div class="stat-value">${pendingTasks}</div>
            <div class="stat-label">Bekleyen</div>
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderTaskList() {
  if (state.tasks.length === 0) {
    return `
      <div class="empty-state">
        <div class="empty-icon">📋</div>
        <h3>Görev Bulunamadı</h3>
        <p>Henüz size atanmış aktif görev bulunmuyor</p>
        <div style="margin-top: 16px; padding: 12px; background: var(--muted); border-radius: 8px; text-align: left;">
          <div style="font-size: 13px; font-weight: 600; margin-bottom: 8px; color: var(--foreground);">Görev almak için:</div>
          <ul style="font-size: 12px; color: var(--muted-foreground); margin: 0; padding-left: 20px;">
            <li>Admin bir üretim planını başlatmalı (Onaylı Siparişler → 🏁 Başlat)</li>
            <li>Görevler otomatik olarak size atanacaktır</li>
            <li>Sayfa yeni görevler geldiğinde otomatik yenilenecektir</li>
          </ul>
        </div>
        <button 
          onclick="window.workerPortalApp.loadWorkerTasks()" 
          style="margin-top: 16px; padding: 10px 20px; background: var(--primary); color: var(--primary-foreground); border: none; border-radius: 6px; font-size: 14px; cursor: pointer; font-weight: 500;"
        >
          🔄 Görevleri Yenile
        </button>
      </div>
    `;
  }
  
  // ✅ PROMPT 11: Sort by expectedStart (FIFO) or optimizedStart (optimized mode)
  const sortedTasks = [...state.tasks].sort((a, b) => {
    const aStart = new Date(a.optimizedStart || a.expectedStart || a.plannedStart).getTime();
    const bStart = new Date(b.optimizedStart || b.expectedStart || b.plannedStart).getTime();
    return aStart - bStart;
  });
  
  // Find first ready/pending task
  const nextTask = sortedTasks.find(t => t.status === 'ready' || t.status === 'pending');
  
  const rows = sortedTasks.map(task => {
    const isNextTask = nextTask && task.assignmentId === nextTask.assignmentId;
    return renderTaskRow(task, isNextTask);
  }).join('');
  
  return `
    <div class="task-list-container">
      <div class="task-list-header">
        <h2 class="section-title">Görevler</h2>
        <p class="section-subtitle">Öncelik sırasına göre görevleriniz</p>
      </div>
      
      <div class="table-container">
        <table class="task-table">
          <thead>
            <tr>
              <th style="width: 50px;">#</th>
              <th style="width: 150px;">Durum</th>
              <th>Görev</th>
              <th style="width: 120px;">İstasyon</th>
              <th style="width: 100px;">Süre (dk)</th>
              <th style="width: 200px;">İşlemler</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function renderTaskRow(task, isNextTask) {
  const statusInfo = getStatusInfo(task.status);
  const priorityBadge = isNextTask ? '<span class="priority-badge">Öncelikli</span>' : '';
  
  // Show paused banner based on pause context
  let pausedBannerHtml = '';
  if (task.status === 'paused') {
    if (task.pauseContext === 'plan') {
      // Admin plan pause - blocks worker
      pausedBannerHtml = `<div style="margin-top: 8px; padding: 10px; background: #fee2e2; border-left: 3px solid #ef4444; border-radius: 4px;">
         <div style="font-size: 12px; color: #991b1b; font-weight: 600; display: flex; align-items: center; gap: 6px;">
           ⏸️ Bu görev admin tarafından durduruldu
         </div>
         <div style="font-size: 11px; color: #7f1d1d; margin-top: 4px;">
           Görevi başlatmak için admin tarafından devam ettirilmesini bekleyin
         </div>
       </div>`;
    } else if (task.pauseContext === 'station_error') {
      // Station error pause - can be resumed by worker
      pausedBannerHtml = `<div style="margin-top: 8px; padding: 10px; background: #fef3c7; border-left: 3px solid #f59e0b; border-radius: 4px;">
         <div style="font-size: 12px; color: #92400e; font-weight: 600; display: flex; align-items: center; gap: 6px;">
           ⚠️ İstasyon hatası nedeniyle duraklatıldı
         </div>
         <div style="font-size: 11px; color: #78350f; margin-top: 4px;">
           Hata giderildiğinde görevi devam ettirebilirsiniz
         </div>
       </div>`;
    } else {
      // Worker pause - can be resumed
      pausedBannerHtml = `<div style="margin-top: 8px; padding: 10px; background: #dbeafe; border-left: 3px solid #3b82f6; border-radius: 4px;">
         <div style="font-size: 12px; color: #1e40af; font-weight: 600; display: flex; align-items: center; gap: 6px;">
           ⏸️ Tarafınızdan duraklatıldı
         </div>
         <div style="font-size: 11px; color: #1e3a8a; margin-top: 4px;">
           Hazır olduğunuzda devam edebilirsiniz
         </div>
       </div>`;
    }
  }
  
  // Render inline block reasons if task failed to start
  const blockReasonsHtml = task.blockReasons && task.blockReasons.length > 0 
    ? `<div style="margin-top: 8px; padding: 8px; background: #fef3c7; border-left: 3px solid #f59e0b; border-radius: 4px;">
         <div style="font-size: 11px; color: #92400e; font-weight: 600; margin-bottom: 4px;">⚠️ Başlatma engellendi:</div>
         <div style="font-size: 11px; color: #78350f;">${task.blockReasons.join('<br>')}</div>
       </div>`
    : '';
  
  // Material status badge
  const materialStatusBadge = renderMaterialStatus(task.prerequisites);
  
  // Material preview (inputs → outputs)
  const materialPreviewHtml = renderMaterialPreview(task);
  
  // ✅ PROMPT 11: Priority badge based on priority field (1=Low, 2=Normal, 3=High)
  const priorityLabels = {1: 'DÜŞÜK', 2: 'NORMAL', 3: 'YÜKSEK'};
  const priorityColors = {1: 'priority-low', 2: 'priority-normal', 3: 'priority-high'};
  const priority = task.priority || 2; // Default to normal
  const priorityBadgeHtml = `<span class="priority-level-badge ${priorityColors[priority]}">${priorityLabels[priority]}</span>`;
  
  // ✅ Urgent class for card highlighting
  const urgentClass = task.isUrgent ? 'urgent-card' : '';
  
  return `
    <tr class="task-row ${task.status === 'paused' ? 'task-paused' : ''} ${urgentClass}" data-assignment-id="${task.assignmentId}">
      <td>
        <div class="priority-index">#${task.workPackageId?.split('-').pop() || '?'}</div>
      </td>
      <td>
        <span class="status-badge status-${task.status}">${statusInfo.icon} ${statusInfo.label}</span>
        ${priorityBadge}
        ${priorityBadgeHtml}
      </td>
      <td>
        <div class="task-info">
          <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
            <div class="task-name">${task.name || task.operationName || 'İsimsiz Görev'}</div>
            ${materialStatusBadge}
          </div>
          <div class="task-details">
            Plan: ${task.planId} | Node: ${task.nodeId}
          </div>
          ${renderOperationalDetails(task)}
          ${materialPreviewHtml}
          ${renderPrerequisites(task.prerequisites, task)}
          ${pausedBannerHtml}
          ${blockReasonsHtml}
        </div>
      </td>
      <td>
        <div class="station-info">${task.stationName || 'Belirsiz'}</div>
      </td>
      <td>
        <div class="duration-info" 
             data-assignment-id="${task.assignmentId}"
             data-status="${task.status}"
             data-actual-start="${task.actualStart ? (typeof task.actualStart === 'object' ? JSON.stringify(task.actualStart) : task.actualStart) : ''}"
             data-estimated-time="${task.estimatedEffectiveTime || task.estimatedNominalTime || 0}">
          ${task.actualStart && (task.status === 'in-progress' || task.status === 'in_progress') ? '⏱️ 0dk' : formatDuration(task.estimatedEffectiveTime || task.estimatedNominalTime)}
        </div>
      </td>
      <td>
        ${renderTaskActions(task)}
      </td>
    </tr>
  `;
}

function renderMaterialStatus(prerequisites) {
  if (!prerequisites) {
    return '<span style="font-size: 14px; color: #9ca3af;" title="Malzeme durumu bilinmiyor">?</span>';
  }
  
  if (prerequisites.materialsReady === true) {
    return '<span style="font-size: 14px; color: #10b981;" title="Malzemeler hazır">✓</span>';
  } else if (prerequisites.materialsReady === false) {
    return '<span style="font-size: 14px; color: #ef4444;" title="Malzeme eksikliği">⚠️</span>';
  }
  
  return '<span style="font-size: 14px; color: #9ca3af;" title="Malzeme durumu bilinmiyor">?</span>';
}

function renderOperationalDetails(task) {
  // Build operational details with station, substation, and time estimates
  const details = [];
  
  // Station info
  if (task.stationName && task.stationName !== 'Belirsiz') {
    details.push(`🏭 İstasyon: <strong>${task.stationName}</strong>`);
  }
  
  // Substation info (if available)
  if (task.substationCode) {
    details.push(`🔧 Alt İstasyon: <strong>${task.substationCode}</strong>`);
  }
  
  // Operation type (if available)
  if (task.operationId || task.operationName) {
    const opName = task.operationName || task.operationId;
    details.push(`⚙️ Operasyon: <strong>${opName}</strong>`);
  }
  
  // Time estimates - always show if available
  const timeDetails = [];
  if (task.estimatedNominalTime && task.estimatedNominalTime > 0) {
    const nominalStr = formatDuration(task.estimatedNominalTime);
    timeDetails.push(`⏱️ Nominal: <strong>${nominalStr}</strong>`);
  }
  
  if (task.estimatedEffectiveTime && task.estimatedEffectiveTime > 0) {
    const effectiveStr = formatDuration(task.estimatedEffectiveTime);
    timeDetails.push(`⚡ Efektif: <strong>${effectiveStr}</strong>`);
  }
  
  if (timeDetails.length > 0) {
    details.push(timeDetails.join(' <span style="color: #cbd5e1;">•</span> '));
  }
  
  if (details.length === 0) {
    return ''; // No operational details to show
  }
  
  // Build timing section separately for better visibility
  const timingDetails = [];
  
  // If task has started, show expected times in gray (muted)
  if (task.actualStart) {
    // Show expected start/end in muted style
    if (task.plannedStart || task.plannedEnd) {
      const plannedParts = [];
      if (task.plannedStart) {
        plannedParts.push(`Beklenen: ${formatTime(task.plannedStart)}`);
      }
      if (task.plannedEnd) {
        plannedParts.push(`${formatTime(task.plannedEnd)}`);
      }
      timingDetails.push(`<span style="color: #9ca3af; font-size: 10px;">${plannedParts.join(' → ')}</span>`);
    }
    
    // Show actual start time prominently
    const actualStartTime = formatTime(task.actualStart);
    timingDetails.push(`<span style="color: #059669;">▶️ Başladı: <strong>${actualStartTime}</strong></span>`);
    
    // Calculate expected end based on actual start + effective time
    // Always calculate from actualStart, not plannedEnd
    try {
      let startDate;
      
      // Handle Firestore Timestamp objects
      if (typeof task.actualStart === 'object' && task.actualStart._seconds !== undefined) {
        startDate = new Date(task.actualStart._seconds * 1000);
      } else {
        startDate = new Date(task.actualStart);
      }
      
      // Use effective time if available, otherwise use nominal time, otherwise calculate from plannedEnd
      let durationMinutes = task.estimatedEffectiveTime || task.estimatedNominalTime;
      
      if (!durationMinutes && task.plannedEnd && task.plannedStart) {
        // Calculate duration from planned times as fallback
        const plannedEndDate = new Date(task.plannedEnd);
        const plannedStartDate = new Date(task.plannedStart);
        durationMinutes = Math.round((plannedEndDate - plannedStartDate) / 60000);
      }
      
      if (durationMinutes > 0) {
        const expectedEndDate = new Date(startDate.getTime() + (durationMinutes * 60000));
        const expectedEndTime = formatTime(expectedEndDate.toISOString());
        timingDetails.push(`<span style="color: #dc2626;">🎯 Bitmeli: <strong>${expectedEndTime}</strong></span>`);
      } else if (task.plannedEnd) {
        // Fallback to planned end if no effective time
        const expectedEndTime = formatTime(task.plannedEnd);
        timingDetails.push(`<span style="color: #dc2626;">🎯 Bitmeli: <strong>${expectedEndTime}</strong></span>`);
      }
    } catch (err) {
      console.error('Error calculating expected end:', err);
      // Fallback to planned end if calculation fails
      if (task.plannedEnd) {
        const expectedEndTime = formatTime(task.plannedEnd);
        timingDetails.push(`<span style="color: #dc2626;">🎯 Bitmeli: <strong>${expectedEndTime}</strong></span>`);
      }
    }
  } else {
    // Task not started yet - show expected times normally
    if (task.plannedStart) {
      const expectedStartTime = formatTime(task.plannedStart);
      timingDetails.push(`📅 Beklenen Başlangıç: <strong>${expectedStartTime}</strong>`);
    }
    
    if (task.plannedEnd) {
      const expectedEndTime = formatTime(task.plannedEnd);
      timingDetails.push(`🎯 Beklenen Bitiş: <strong>${expectedEndTime}</strong>`);
    }
  }
  
  let timingHtml = '';
  if (timingDetails.length > 0) {
    timingHtml = `
      <div style="font-size: 11px; color: #1e40af; margin-top: 6px; padding-top: 6px; border-top: 1px solid #dbeafe; line-height: 1.6;">
        ${timingDetails.join(' <span style="color: #cbd5e1;">•</span> ')}
      </div>
    `;
  }
  
  return `
    <div class="operational-details" style="margin-top: 8px; padding: 8px 10px; background: #eff6ff; border-radius: 6px; border-left: 3px solid #3b82f6;">
      <div style="font-size: 11px; color: #1e40af; line-height: 1.6;">
        ${details.join(' <span style="color: #cbd5e1;">•</span> ')}
      </div>
      ${timingHtml}
    </div>
  `;
}

function renderMaterialPreview(task) {
  const inputMaterials = task.preProductionReservedAmount || task.materialInputs || {};
  const outputMaterials = task.plannedOutput || {};
  
  // Get output code if plannedOutput is empty
  let outputCode = '';
  let outputQty = 0;
  if (Object.keys(outputMaterials).length === 0 && task.outputCode) {
    outputCode = task.outputCode;
    outputQty = task.outputQty || 0;
  }
  
  // Build compact material preview
  const inputEntries = Object.entries(inputMaterials);
  const outputEntries = Object.entries(outputMaterials);
  
  if (inputEntries.length === 0 && outputEntries.length === 0 && !outputCode) {
    return ''; // No materials to show
  }
  
  let materialsHtml = '<div class="material-preview" style="margin-top: 6px; padding: 6px 8px; background: #f9fafb; border-radius: 4px; font-size: 11px; color: #6b7280; border-left: 3px solid #d1d5db;">';
  materialsHtml += '<span style="font-weight: 600; color: #374151;">📦 Malzemeler:</span> ';
  
  // Input materials (compact format)
  if (inputEntries.length > 0) {
    const inputStrs = inputEntries.slice(0, 3).map(([code, qty]) => `${code} (${qty})`);
    if (inputEntries.length > 3) {
      inputStrs.push(`+${inputEntries.length - 3} daha`);
    }
    materialsHtml += `<span style="color: #3b82f6;">${inputStrs.join(', ')}</span>`;
  }
  
  // Arrow separator
  if ((inputEntries.length > 0 || outputCode) && (outputEntries.length > 0 || outputCode)) {
    materialsHtml += ' <span style="color: #9ca3af;">→</span> ';
  }
  
  // Output materials (compact format)
  if (outputEntries.length > 0) {
    const outputStrs = outputEntries.slice(0, 2).map(([code, qty]) => `${code} (${qty})`);
    if (outputEntries.length > 2) {
      outputStrs.push(`+${outputEntries.length - 2} daha`);
    }
    materialsHtml += `<span style="color: #10b981;">${outputStrs.join(', ')}</span>`;
  } else if (outputCode) {
    materialsHtml += `<span style="color: #10b981;">${outputCode}${outputQty > 0 ? ` (${outputQty})` : ''}</span>`;
  }
  
  materialsHtml += '</div>';
  
  return materialsHtml;
}


function renderTimeInfo(task) {
  // Show actual times if task has started, otherwise show planned times
  if (task.actualStart) {
    let timeHtml = `
      <div class="time-info" style="margin-top: 8px; padding: 8px; background: #f0f9ff; border-radius: 4px; border-left: 3px solid #3b82f6;">
        <div style="font-size: 11px; color: #1e40af; display: flex; align-items: center; gap: 6px;">
          <span>⏰</span>
          <span><strong>Başlangıç:</strong> ${formatTime(task.actualStart)}</span>
    `;
    
    // Show planned start time for comparison if different
    if (task.plannedStart) {
      const actualDate = new Date(task.actualStart);
      const plannedDate = new Date(task.plannedStart);
      const diff = Math.abs(actualDate - plannedDate) / 60000; // minutes
      if (diff > 5) { // Show if difference > 5 minutes
        timeHtml += ` <span style="color: #9ca3af;">(Plan: ${formatTime(task.plannedStart)})</span>`;
      }
    }
    timeHtml += `</div>`;
    
    // Show end time if completed
    if (task.actualEnd) {
      timeHtml += `
        <div style="font-size: 11px; color: #059669; margin-top: 4px; display: flex; align-items: center; gap: 6px;">
          <span>✅</span>
          <span><strong>Bitiş:</strong> ${formatTime(task.actualEnd)}</span>
        </div>
      `;
    } else if (task.plannedEnd) {
      // Show expected end time
      timeHtml += `
        <div style="font-size: 11px; color: #6b7280; margin-top: 4px; display: flex; align-items: center; gap: 6px;">
          <span>📅</span>
          <span><strong>Tahmini Bitiş:</strong> ${formatTime(task.plannedEnd)}</span>
        </div>
      `;
    }
    
    timeHtml += `</div>`;
    return timeHtml;
  } else if (task.plannedStart) {
    // Task hasn't started yet, show planned times
    return `
      <div class="time-info" style="margin-top: 8px; padding: 6px; background: #f9fafb; border-radius: 4px; border-left: 3px solid #d1d5db;">
        <div style="font-size: 11px; color: #6b7280; display: flex; align-items: center; gap: 6px;">
          <span>📅</span>
          <span><strong>Planlanan:</strong> ${formatTime(task.plannedStart)}</span>
          ${task.plannedEnd ? ` <span>→</span> <span>${formatTime(task.plannedEnd)}</span>` : ''}
        </div>
      </div>
    `;
  }
  
  return ''; // No time info available
}

function renderPrerequisites(prerequisites, task) {
  if (!prerequisites) return '';
  
  const items = [];
  if (!prerequisites.predecessorsDone) items.push('⏳ Önceki görevler');
  if (!prerequisites.workerAvailable) items.push('👷 İşçi meşgul');
  
  // Enhanced substation/station busy message
  if (!prerequisites.stationAvailable || !prerequisites.substationAvailable) {
    // Check if we have substation workload details
    if (task && task.substationCurrentWorkPackageId && task.substationCurrentExpectedEnd) {
      const expectedEnd = new Date(task.substationCurrentExpectedEnd);
      const now = new Date();
      const minutesRemaining = Math.max(0, Math.round((expectedEnd - now) / 60000));
      
      const timeStr = minutesRemaining > 60 
        ? `${Math.floor(minutesRemaining / 60)}s ${minutesRemaining % 60}dk`
        : `${minutesRemaining}dk`;
      
      items.push(`🏭 Makine meşgul (${task.substationCurrentWorkPackageId}, ~${timeStr})`);
    } else {
      items.push('🏭 Makine meşgul');
    }
  }
  
  if (!prerequisites.materialsReady) items.push('📦 Malzeme eksik');
  
  if (items.length === 0) return '';
  
  return `<div class="task-blockers">${items.join(' • ')}</div>`;
}

function renderTaskActions(task) {
  const actions = [];
  
  // ✅ Urgent badge (yeni)
  if (task.isUrgent) {
    actions.push(`<span class="urgent-badge">🚨 Acil</span>`);
  }
  
  // Check if worker can start tasks (includes general status + schedule check)
  const workCheck = state.currentWorkerDetails ? canWorkerStartTasks(state.currentWorkerDetails) : { canWork: true, reason: null };
  const workerUnavailable = !workCheck.canWork;
  
  // Check if task is paused by admin plan
  const isPlanPaused = task.status === 'paused' && task.pauseContext === 'plan';
  
  // Check if task is paused by worker (can be resumed)
  const isWorkerPaused = task.status === 'paused' && task.pauseContext !== 'plan';
  
  // Check if task is blocked by prerequisites
  const isBlocked = task.prerequisites && (
    !task.prerequisites.predecessorsDone ||
    !task.prerequisites.workerAvailable ||
    !task.prerequisites.substationAvailable ||
    !task.prerequisites.materialsReady
  );
  
  // ✅ Check canStart flag (yeni)
  const cannotStartYet = !task.canStart && (task.status === 'pending' || task.status === 'ready');
  
  // Build tooltip for blocked reasons
  let blockTooltip = '';
  if (workerUnavailable) {
    blockTooltip = `title="İşçi durumu görev başlatmaya uygun değil: ${workCheck.reason || 'Bilinmeyen sebep'}"`;
  } else if (isPlanPaused) {
    blockTooltip = `title="Admin tarafından durduruldu"`;
  } else if (cannotStartYet) {
    blockTooltip = `title="⏳ Sırada bekliyor - Önceki görevler tamamlanmalı"`;
  } else if (isBlocked) {
    const reasons = [];
    if (!task.prerequisites.predecessorsDone) reasons.push('Önceki görevler tamamlanmadı');
    if (!task.prerequisites.workerAvailable) reasons.push('İşçi meşgul');
    if (!task.prerequisites.substationAvailable) reasons.push('Makine meşgul');
    if (!task.prerequisites.materialsReady) reasons.push('Malzeme eksik');
    blockTooltip = `title="${reasons.join(', ')}"`;
  }
  
  // Resume button - only if paused by worker/station (not admin)
  if (isWorkerPaused) {
    const disabled = (isBlocked || workerUnavailable || cannotStartYet) ? 'disabled' : '';
    actions.push(`
      <button class="action-btn action-start" data-action="start" data-id="${task.assignmentId}" ${disabled} ${blockTooltip}>
        ▶️ Devam
      </button>
    `);
  }
  
  // Start button - for ready OR pending tasks (and not paused, blocked, or worker unavailable)
  if (task.status === 'ready' || task.status === 'pending') {
    const disabled = (isBlocked || isPlanPaused || workerUnavailable || cannotStartYet) ? 'disabled' : '';
    
    // ✅ Waiting text için kontrol
    if (cannotStartYet && !disabled) {
      actions.push(`
        <button class="action-btn action-start disabled" data-action="start" data-id="${task.assignmentId}" disabled ${blockTooltip}>
          ▶️ Başla
        </button>
        <small class="waiting-text">⏳ Sırada bekliyor</small>
      `);
    } else {
      actions.push(`
        <button class="action-btn action-start" data-action="start" data-id="${task.assignmentId}" ${disabled} ${blockTooltip}>
          ▶️ Başla
        </button>
      `);
    }
  }
  
  // Pause button - only if in progress (and worker available)
  if (task.status === 'in_progress') {
    const disabled = workerUnavailable ? 'disabled' : '';
    actions.push(`
      <button class="action-btn action-pause" data-action="pause" data-id="${task.assignmentId}" ${disabled}>
        ⏸️ Duraklat
      </button>
    `);
  }
  
  // Complete button - only if in progress (and worker available)
  if (task.status === 'in_progress') {
    const disabled = workerUnavailable ? 'disabled' : '';
    actions.push(`
      <button class="action-btn action-complete" data-action="complete" data-id="${task.assignmentId}" ${disabled}>
        ✅ Tamamla
      </button>
    `);
  }
  
  // Report scrap for cancelled tasks - show complete button to allow scrap reporting
  if (task.status === 'cancelled_pending_report') {
    const disabled = workerUnavailable ? 'disabled' : '';
    actions.push(`
      <button class="action-btn action-complete" data-action="complete" data-id="${task.assignmentId}" ${disabled}>
        📝 Raporla
      </button>
    `);
  }
  
  // Station error - always available (except completed and cancelled_pending_report)
  if (task.status !== 'completed' && task.status !== 'cancelled_pending_report') {
    actions.push(`
      <button class="action-btn action-error" data-action="error" data-id="${task.assignmentId}">
        ⚠️ Hata
      </button>
    `);
  }
  
  // Fire button - only if in progress (and worker available)
  if (task.status === 'in_progress') {
    const disabled = workerUnavailable ? 'disabled' : '';
    actions.push(`
      <button class="action-btn action-fire" data-action="fire" data-id="${task.assignmentId}" ${disabled}>
        🗑️ Fire
      </button>
    `);
  }
  
  if (actions.length === 0) {
    return '<span class="text-muted">-</span>';
  }
  
  return `<div class="action-buttons">${actions.join('')}</div>`;
}

// ============================================================================
// EVENT HANDLERS
// ============================================================================

function attachEventListeners() {
  // Action buttons
  document.querySelectorAll('.action-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const action = e.target.dataset.action;
      const assignmentId = e.target.dataset.id;
      
      if (!assignmentId) return;
      
      switch (action) {
        case 'start':
          await startTask(assignmentId);
          break;
        case 'pause':
          await pauseTask(assignmentId);
          break;
        case 'complete':
          await completeTask(assignmentId);
          break;
        case 'error':
          await reportStationError(assignmentId);
          break;
        case 'fire':
          await openFireModal(assignmentId);
          break;
      }
    });
  });
}

// ============================================================================
// LIVE DURATION UPDATES
// ============================================================================

let durationUpdateInterval = null;

function startDurationUpdates() {
  // Clear existing interval
  if (durationUpdateInterval) {
    clearInterval(durationUpdateInterval);
  }
  
  // Update all in-progress task durations every second
  durationUpdateInterval = setInterval(() => {
    document.querySelectorAll('.duration-info[data-status="in-progress"], .duration-info[data-status="in_progress"]').forEach(el => {
      const actualStart = el.dataset.actualStart;
      if (!actualStart) return;
      
      try {
        let startTime;
        
        // Try to parse as Firestore Timestamp JSON
        try {
          const parsed = JSON.parse(actualStart);
          if (parsed._seconds !== undefined) {
            startTime = new Date(parsed._seconds * 1000);
          } else {
            startTime = new Date(actualStart);
          }
        } catch {
          // Not JSON, treat as ISO string
          startTime = new Date(actualStart);
        }
        
        const elapsed = Math.floor((Date.now() - startTime.getTime()) / 60000); // minutes
        el.textContent = `⏱️ ${formatDuration(elapsed)}`;
        
        // Color code based on estimated time
        const estimatedTime = parseInt(el.dataset.estimatedTime) || 0;
        if (estimatedTime > 0) {
          const progress = (elapsed / estimatedTime) * 100;
          if (progress > 100) {
            el.style.color = '#dc2626'; // red - over time
          } else if (progress > 80) {
            el.style.color = '#f59e0b'; // orange - warning
          } else {
            el.style.color = '#059669'; // green - on track
          }
        }
      } catch (err) {
        console.error('Error updating duration:', err);
      }
    });
  }, 1000); // Update every second
}

// Stop interval when page is hidden
document.addEventListener('visibilitychange', () => {
  if (document.hidden && durationUpdateInterval) {
    clearInterval(durationUpdateInterval);
    durationUpdateInterval = null;
  } else if (!document.hidden) {
    startDurationUpdates();
  }
});

// ============================================================================
// UTILITIES
// ============================================================================

function getStatusInfo(status) {
  const statusMap = {
    'pending': { label: 'Bekliyor', icon: '⏳', color: 'gray' },
    'ready': { label: 'Hazır', icon: '✅', color: 'green' },
    'blocked': { label: 'Bloke', icon: '🚫', color: 'red' },
    'in_progress': { label: 'Devam Ediyor', icon: '▶️', color: 'blue' },
    'paused': { label: 'Duraklatıldı', icon: '⏸️', color: 'orange' },
    'completed': { label: 'Tamamlandı', icon: '✓', color: 'success' },
    'cancelled_pending_report': { label: 'İptal - Rapor Gerekli', icon: '❌', color: 'red' }
  };
  
  return statusMap[status] || { label: status, icon: '❓', color: 'gray' };
}

function formatDuration(minutes) {
  if (!minutes) return '-';
  
  const mins = Math.round(minutes);
  if (mins < 60) return `${mins}dk`;
  
  const hours = Math.floor(mins / 60);
  const remainingMins = mins % 60;
  return `${hours}s ${remainingMins}dk`;
}

function formatTime(isoString) {
  if (!isoString) return '—';
  try {
    let date;
    
    // Handle Firestore Timestamp objects (from JSON serialization)
    if (typeof isoString === 'object' && isoString._seconds !== undefined) {
      date = new Date(isoString._seconds * 1000);
    } 
    // Handle ISO string
    else if (typeof isoString === 'string') {
      date = new Date(isoString);
    }
    // Handle Date objects
    else if (isoString instanceof Date) {
      date = isoString;
    }
    // Handle epoch milliseconds
    else if (typeof isoString === 'number') {
      date = new Date(isoString);
    }
    else {
      console.warn('Unknown date format:', isoString);
      return '—';
    }
    
    // Check if date is valid
    if (isNaN(date.getTime())) {
      console.warn('Invalid date:', isoString);
      return '—';
    }
    
    return date.toLocaleString('tr-TR', { 
      month: 'short', 
      day: 'numeric', 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  } catch (err) {
    console.error('Error formatting time:', err, isoString);
    return '—';
  }
}

// ============================================================================
// NOTIFICATION SYSTEM (using new Toast component)
// ============================================================================

function showNotification(message, type = 'info') {
  // Map old types to toast types
  const toastTypeMap = {
    'info': showInfoToast,
    'success': showSuccessToast,
    'warning': showWarningToast,
    'error': showErrorToast
  };
  
  const toastFn = toastTypeMap[type] || showInfoToast;
  toastFn(message);
}

// ============================================================================
// INITIALIZATION
// ============================================================================

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

// Export for debugging
export { loadWorkerTasks, state };
