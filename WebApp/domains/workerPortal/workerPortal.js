// Worker Portal Domain Module
// Handles worker task management, status updates, and scrap reporting

import { getWorkerPortalTasks, updateWorkPackage, getWorkers } from '../production/js/mesApi.js';
import { showSuccessToast, showErrorToast, showWarningToast, showInfoToast } from '../../shared/components/MESToast.js';
import { 
  getEffectiveStatus, 
  getWorkerStatusBanner, 
  isWorkerAvailable,
  getStatusLabel,
  canWorkerStartTasks
} from '../../shared/utils/workerStatus.js';
import { showLotPreviewModal } from './components/lotPreviewModal.js';

// ============================================================================
// STATE MANAGEMENT
// ============================================================================

const state = {
  tasks: [],
  loading: false,
  error: null,
  currentWorker: null,
  currentWorkerDetails: null, // Full worker object with status/leave info
  nextTaskId: null,
  systemSettings: { lotTracking: true } // System settings for lot tracking toggle
};

// ============================================================================
// INITIALIZATION
// ============================================================================

async function init() {
  console.log('Initializing Worker Portal...');
  
  // Load system settings first
  await loadSystemSettings();
  
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
  
  // Initialize Lucide icons
  if (typeof lucide !== 'undefined' && lucide.createIcons) {
    lucide.createIcons();
  }
  
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
  
  // ========================================================================
  // STEP 9: Real-time SSE Connection for Worker Assignment Updates
  // ========================================================================
  // Connect to Server-Sent Events stream for real-time task notifications
  // This replaces polling and provides instant updates when:
  // - New tasks are assigned
  // - Task status changes
  // - Priorities are adjusted
  // - Tasks are cancelled
  try {
    console.log(`📡 Connecting to SSE stream for worker ${workerId}...`);
    
    const eventSource = new EventSource(`/api/mes/stream/assignments?workerId=${encodeURIComponent(workerId)}`);
    
    // Connection opened
    eventSource.addEventListener('connected', (e) => {
      try {
        const data = JSON.parse(e.data);
        console.log(`✅ SSE connected to channel: ${data.channel}`);
      } catch (err) {
        console.warn('Failed to parse SSE connected event:', err);
      }
    });
    
    // Receive assignment updates
    eventSource.addEventListener('message', (e) => {
      try {
        const notification = JSON.parse(e.data);
        console.log('📬 SSE notification received:', notification);
        
        // Check if this update is for current worker
        if (notification.workerId === workerId || notification.worker_id === workerId) {
          console.log(`🔄 Assignment update for worker ${workerId}, reloading tasks...`);
          
          // Reload tasks to reflect changes
          loadWorkerTasks();
          
          // Show toast notification for significant events
          if (notification.operation === 'INSERT') {
            showToast('🆕 Yeni görev atandı!', 'info');
          } else if (notification.operation === 'UPDATE' && notification.status === 'cancelled') {
            showToast('❌ Görev iptal edildi', 'warning');
          }
        }
      } catch (err) {
        console.error('Failed to process SSE message:', err);
      }
    });
    
    // Handle errors (EventSource will auto-reconnect)
    eventSource.onerror = (error) => {
      console.error('❌ SSE connection error:', error);
      console.log('🔄 EventSource will attempt to reconnect automatically...');
      // Browser handles reconnection automatically
    };
    
    // Store for cleanup
    window._workerPortalSSE = eventSource;
    
    console.log('✅ SSE stream initialized successfully');
    
  } catch (err) {
    console.error('Failed to initialize SSE stream:', err);
    // Continue without SSE - app will work with manual refresh
  }
}

// ============================================================================
// SYSTEM SETTINGS
// ============================================================================

/**
 * Load system settings (lot tracking enabled/disabled)
 */
async function loadSystemSettings() {
  try {
    const response = await fetch('/api/settings/system');
    if (response.ok) {
      const settings = await response.json();
      state.systemSettings = settings || { lotTracking: true };
      console.log('⚙️ System settings loaded:', state.systemSettings);
    }
  } catch (error) {
    console.error('Failed to load system settings:', error);
    // Keep default (lotTracking: true)
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
    
    // ✅ Backend'den gelen canStart değerini kullan (duplicate logic kaldırıldı)
    console.log(`📊 Loaded ${tasks.length} tasks with canStart from backend:`, 
      tasks.map(t => ({ 
        id: t.assignmentId, 
        workOrder: t.workOrderCode,
        status: t.status, 
        isUrgent: t.isUrgent,
        canStart: t.canStart
      }))
    );
    
    state.tasks = tasks;
    state.nextTaskId = result.nextTaskId || null;
    
    // Load lot preview for ready/pending tasks
    await loadLotPreviews();
    
    // Debug: Log first task to check data
    if (state.tasks.length > 0) {
      console.log('📊 First task data:', {
        name: state.tasks[0].name,
        estimatedNominalTime: state.tasks[0].estimatedNominalTime,
        estimatedEffectiveTime: state.tasks[0].estimatedEffectiveTime,
        estimatedStartTime: state.tasks[0].estimatedStartTime,
        estimatedEndTime: state.tasks[0].estimatedEndTime,
        startedAt: state.tasks[0].startedAt,
        startedAtType: typeof state.tasks[0].startedAt,
        status: state.tasks[0].status,
        assignmentId: state.tasks[0].assignmentId
      });
      
      // Log the first in-progress task for debugging timer
      const inProgressTask = state.tasks.find(t => t.status === 'in-progress' || t.status === 'in_progress');
      if (inProgressTask) {
        console.log('⏱️ In-progress task for timer:', {
          name: inProgressTask.name,
          status: inProgressTask.status,
          startedAt: inProgressTask.startedAt,
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
// LOT PREVIEW LOADING
// ============================================================================

async function loadLotPreviews() {
  try {
    // Skip lot preview loading if lot tracking is disabled
    if (!state.systemSettings.lotTracking) {
      console.log('📦 Lot tracking disabled - skipping lot preview loading');
      return;
    }

    // Only load previews for ready/pending tasks
    const tasksNeedingPreview = state.tasks.filter(t => 
      (t.status === 'ready' || t.status === 'pending') && 
      (t.preProductionReservedAmount || t.materialInputs)
    );
    
    if (tasksNeedingPreview.length === 0) {
      console.log('📦 No tasks need lot preview');
      return;
    }
    
    console.log(`📦 Loading lot previews for ${tasksNeedingPreview.length} tasks...`);
    
    // Load lot previews in parallel
    await Promise.all(tasksNeedingPreview.map(async (task) => {
      try {
        // Build material requirements from task data
        const materialInputs = task.preProductionReservedAmount || task.materialInputs || {};
        const materialRequirements = Object.entries(materialInputs).map(([code, qty]) => ({
          materialCode: code,
          requiredQty: parseFloat(qty) || 0
        }));
        
        if (materialRequirements.length === 0) {
          return;
        }
        
        // Fetch lot preview from API (silently fail if endpoint not implemented)
        const queryString = encodeURIComponent(JSON.stringify(materialRequirements));
        const response = await fetch(`/api/mes/assignments/${task.assignmentId}/lot-preview?materialRequirements=${queryString}`)
          .catch(() => null); // Silently catch network errors
        
        if (!response || !response.ok) {
          // Silently skip - lot preview endpoint not yet implemented
          task.lotPreview = { materials: [], error: null };
          return;
        }
        
        const data = await response.json();
        task.lotPreview = data;
        
        console.log(`✅ Lot preview loaded for ${task.assignmentId}:`, data.materials?.length || 0, 'materials');
      } catch (error) {
        // Silently skip errors
        task.lotPreview = { materials: [], error: null };
      }
    }));
    
  } catch (error) {
    console.error('Error loading lot previews:', error);
  }
}

// ============================================================================
// TASK ACTIONS
// ============================================================================

/**
 * Show lot preview modal and start task on confirmation
 * STEP 11: Material Reservation - Lot Preview UI Integration
 * If lot tracking is disabled, start task directly without preview modal
 */
async function startTaskWithLotPreview(assignmentId) {
  console.log(`🚀 Starting task with lot preview: ${assignmentId}`);
  
  // Check if materials are insufficient - need confirmation first
  const task = state.tasks.find(t => String(t.assignmentId) === String(assignmentId));
  const materialsInsufficient = task?.prerequisites?.materialsReady === false || task?.materialStatus === 'insufficient';
  
  if (materialsInsufficient) {
    // Show material confirmation modal before proceeding
    const confirmed = await showMaterialConfirmationModal(task);
    if (!confirmed) {
      console.log('❌ User cancelled due to material shortage');
      return;
    }
    console.log('✅ User confirmed to proceed despite material shortage');
  }
  
  // If lot tracking is disabled, start directly without preview modal
  if (!state.systemSettings.lotTracking) {
    console.log('📦 Lot tracking disabled - starting task directly');
    await startTaskDirectly(assignmentId);
    return;
  }
  
  // Show lot preview modal
  await showLotPreviewModal(assignmentId, async (confirmedAssignmentId) => {
    // User confirmed, proceed with starting task
    await startTaskDirectly(confirmedAssignmentId);
  });
}

/**
 * Show confirmation modal when materials are insufficient
 */
function showMaterialConfirmationModal(task) {
  return new Promise((resolve) => {
    const materialStatus = task?.materialStatus || 'insufficient';
    const taskName = task?.nodeName || task?.operationName || `Görev #${task?.assignmentId}`;
    
    const modalHtml = `
      <div id="material-confirm-modal" class="modal-overlay" style="position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 9999;">
        <div class="modal-content" style="background: white; border-radius: 12px; padding: 24px; max-width: 400px; width: 90%; box-shadow: 0 20px 60px rgba(0,0,0,0.3);">
          <div style="text-align: center; margin-bottom: 20px;">
            <div style="width: 60px; height: 60px; background: #fef3c7; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 16px;">
              <span style="font-size: 28px;">⚠️</span>
            </div>
            <h3 style="margin: 0 0 8px; font-size: 18px; font-weight: 600; color: #1f2937;">Malzeme Uyarısı</h3>
            <p style="margin: 0; color: #6b7280; font-size: 14px;">
              <strong>${taskName}</strong> için yeterli malzeme bulunmuyor.
            </p>
          </div>
          <div style="background: #fef3c7; border: 1px solid #f59e0b; border-radius: 8px; padding: 12px; margin-bottom: 20px;">
            <p style="margin: 0; color: #92400e; font-size: 13px;">
              Bu göreve başlarsanız, eksik malzeme nedeniyle üretim aksamaları yaşanabilir. Devam etmek istiyor musunuz?
            </p>
          </div>
          <div style="display: flex; gap: 12px;">
            <button id="material-confirm-cancel" style="flex: 1; padding: 12px; border: 1px solid #d1d5db; background: white; border-radius: 8px; font-weight: 500; cursor: pointer;">
              İptal
            </button>
            <button id="material-confirm-proceed" style="flex: 1; padding: 12px; border: none; background: #f59e0b; color: white; border-radius: 8px; font-weight: 500; cursor: pointer;">
              Devam Et
            </button>
          </div>
        </div>
      </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    
    const modal = document.getElementById('material-confirm-modal');
    const cancelBtn = document.getElementById('material-confirm-cancel');
    const proceedBtn = document.getElementById('material-confirm-proceed');
    
    const cleanup = () => {
      modal.remove();
    };
    
    cancelBtn.onclick = () => {
      cleanup();
      resolve(false);
    };
    
    proceedBtn.onclick = () => {
      cleanup();
      resolve(true);
    };
    
    // Close on overlay click
    modal.onclick = (e) => {
      if (e.target === modal) {
        cleanup();
        resolve(false);
      }
    };
  });
}

/**
 * Start task directly (called after lot preview confirmation)
 */
async function startTaskDirectly(assignmentId) {
  try {
    // Call new FIFO-enabled start endpoint
    const response = await fetch(`/api/mes/assignments/${assignmentId}/start`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        workerId: state.currentWorker.id
      }),
      credentials: 'include'
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || `HTTP ${response.status}`);
    }

    const result = await response.json();
    
    // Check for warnings (partial material reservations)
    if (result.materialReservation?.warnings?.length > 0) {
      const warningMsg = result.materialReservation.warnings.join('<br>');
      showToast(`Görev başlatıldı (uyarılar var):<br>${warningMsg}`, 'warning', 8000);
    } else {
      showToast('Görev başlatıldı', 'success');
    }
    
    await loadWorkerTasks();
    
    // Notify other components
    window.dispatchEvent(new CustomEvent('assignments:updated'));
    
  } catch (err) {
    console.error('Failed to start task:', err);
    
    // Check if error has material_shortage code
    if (err.code === 'material_shortage') {
      const shortages = err.shortages || [];
      const shortageList = shortages.map(s => 
        `${s.name || s.code}: ${s.shortage} ${s.unit} eksik (Var: ${s.available}, Gerek: ${s.required})`
      ).join('<br>');
      
      showToast(
        `Malzeme eksikliği nedeniyle görev başlatılamadı:<br>${shortageList}`, 
        'error',
        10000 // Show for 10 seconds
      );
      
      // Mark task as blocked
      const numericId = typeof assignmentId === 'string' ? parseInt(assignmentId, 10) : assignmentId;
      const task = state.tasks.find(t => t.assignmentId === numericId);
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
      const numericId = typeof assignmentId === 'string' ? parseInt(assignmentId, 10) : assignmentId;
      const task = state.tasks.find(t => t.assignmentId === numericId);
      if (task) {
        task.status = 'blocked';
        task.blockReasons = err.details || [err.message];
      }
      
      // Show notification with details
      const reasons = err.details?.join(', ') || err.message;
      showToast(`Görev başlatılamadı: ${reasons}`, 'warning');
      
      // Re-render to show blocked status
      render();
      
      // Reload tasks after short delay to get fresh status
      setTimeout(() => loadWorkerTasks(), 2000);
    } else {
      // Generic error handling
      const errorMsg = err.message || String(err);
      showToast('Görev başlatılamadı: ' + errorMsg, 'error');
      
      // Reload to refresh task status
      await loadWorkerTasks();
    }
  }
}

async function pauseTask(assignmentId) {
  const numericId = typeof assignmentId === 'string' ? parseInt(assignmentId, 10) : assignmentId;
  try {
    const response = await fetch(`/api/mes/assignments/${numericId}/pause`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workerId: state.currentWorker.id }),
      credentials: 'include'
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to pause task');
    }

    await loadWorkerTasks();
    window.dispatchEvent(new CustomEvent('assignments:updated'));
    showToast('Görev duraklatıldı', 'info');
  } catch (err) {
    console.error('Failed to pause task:', err);
    showToast('Görev duraksatılamadı: ' + err.message, 'error');
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
    
    showToast('İstasyon hatası bildirildi', 'warning');
  } catch (err) {
    console.error('Failed to report station error:', err);
    showToast('Hata bildirimi gönderilemedi: ' + err.message, 'error');
  }
}

async function completeTask(assignmentId) {
  // Convert to number if string (from HTML onclick attributes)
  const numericId = typeof assignmentId === 'string' ? parseInt(assignmentId, 10) : assignmentId;
  
  // Find the task to get plannedOutput information
  const task = state.tasks.find(t => t.assignmentId === numericId);
  
  if (!task) {
    console.error('❌ Task not found! assignmentId:', numericId);
    showToast('Görev bulunamadı', 'error');
    return;
  }
  
  const completionData = await showCompletionModal(task);
  if (completionData === null) return; // User cancelled
  
  try {
    // Get scrap counters for this assignment
    const counters = completionData.scrapCounters || await getScrapCounters(task.assignmentId);
    
    // Backend expects: { workerId, quantityProduced, defectQuantity, inputScrapCounters, productionScrapCounters, notes }
    const payload = { 
      workerId: task.workerId || state.currentWorker.id,
      quantityProduced: completionData.actualOutputQuantity,
      defectQuantity: completionData.defectQuantity,
      inputScrapCounters: counters.inputScrapCounters || {},
      productionScrapCounters: counters.productionScrapCounters || {},
      notes: completionData.notes || ''
    };
    
    console.log('📤 Sending completion data with scrap counters:', payload);
    
    // Use FIFO complete endpoint
    const response = await fetch(`/api/mes/assignments/${task.assignmentId}/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to complete task');
    }
    const result = await response.json();
    console.log('✅ Task completed successfully:', result);
    
    // Log material adjustments if any
    if (result.adjustments && result.adjustments.length > 0) {
      console.log('📊 Material consumption adjustments:');
      result.adjustments.forEach(adj => {
        console.log(`  ${adj.materialCode}: Reserved=${adj.reserved}, Consumed=${adj.consumed}, Delta=${adj.delta > 0 ? '+' : ''}${adj.delta}`);
        console.log(`    → Input scrap: ${adj.breakdown.inputScrap}, Production scrap: ${adj.breakdown.productionScrap}, Production used: ${adj.breakdown.productionUsed}`);
      });
    }
    
    await loadWorkerTasks();
    window.dispatchEvent(new CustomEvent('assignments:updated'));
    
    const message = completionData.defectQuantity > 0 
      ? `Görev tamamlandı (Üretilen: ${completionData.actualOutputQuantity}, Fire: ${completionData.defectQuantity})`
      : `Görev tamamlandı (Üretilen: ${completionData.actualOutputQuantity})`;
    showToast(message, 'success');
  } catch (err) {
    console.error('Failed to complete task:', err);
    showToast('Görev tamamlanamadı: ' + err.message, 'error');
  }
}

async function resumeTask(assignmentId) {
  const numericId = typeof assignmentId === 'string' ? parseInt(assignmentId, 10) : assignmentId;
  try {
    const response = await fetch(`/api/mes/assignments/${numericId}/resume`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workerId: state.currentWorker.id }),
      credentials: 'include'
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to resume task');
    }

    await loadWorkerTasks();
    window.dispatchEvent(new CustomEvent('assignments:updated'));
    showToast('Görev devam ettiriliyor', 'success');
  } catch (err) {
    console.error('Failed to resume task:', err);
    showToast('Görev devam ettirilemedi: ' + err.message, 'error');
  }
}

// ============================================================================
// GLOBAL FUNCTIONS FOR ONCLICK HANDLERS (Modern Card UI)
// ============================================================================

// Make functions globally accessible for onclick handlers
window.startTaskFlow = async (assignmentId) => {
  await startTaskWithLotPreview(assignmentId);
};

window.pauseTask = async (assignmentId) => {
  await pauseTask(assignmentId);
};

window.resumeTask = async (assignmentId) => {
  await resumeTask(assignmentId);
};

window.completeTaskFlow = async (assignmentId) => {
  await completeTask(assignmentId);
};

window.viewTaskDetails = (assignmentId) => {
  showTaskDetailModal(assignmentId);
};

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
        showToast('Lütfen hata açıklaması girin', 'warning');
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
    if (!task) {
      console.error('❌ showCompletionModal called without task');
      resolve(null);
      return;
    }
    
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
    const inputScrapCounters = counters?.inputScrapCounters || {};
    const productionScrapCounters = counters?.productionScrapCounters || {};
    const outputDefectQty = counters?.defectQuantity || 0;
    const hasScrapData = (Object.keys(inputScrapCounters).length > 0 || 
                          Object.keys(productionScrapCounters).length > 0 || 
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
            ${Object.keys(inputScrapCounters).length > 0 ? `
            <div style="font-size: 11px; color: #78350f; margin-bottom: 4px;">
              <strong>Hasarlı Gelen:</strong> ${Object.entries(inputScrapCounters).map(([code, qty]) => `${code}: ${qty}`).join(', ')}
            </div>` : ''}
            ${Object.keys(productionScrapCounters).length > 0 ? `
            <div style="font-size: 11px; color: #78350f; margin-bottom: 4px;">
              <strong>Üretimde Hurda:</strong> ${Object.entries(productionScrapCounters).map(([code, qty]) => `${code}: ${qty}`).join(', ')}
            </div>` : ''}
            ${outputDefectQty > 0 ? `
            <div style="font-size: 11px; color: #78350f;">
              <strong>Çıktı Hatası:</strong> ${outputDefectQty}
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
        showToast('Lütfen geçerli bir üretim miktarı girin', 'warning');
        actualOutputInput.focus();
        return;
      }
      
      if (defectQuantity < 0) {
        showToast('Fire miktarı negatif olamaz', 'warning');
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

// ============================================================================
// TASK DETAIL MODAL
// ============================================================================

function showTaskDetailModal(assignmentId) {
  const task = state.tasks.find(t => t.assignmentId === assignmentId);
  if (!task) return;
  
  // Extract material information
  const inputMaterials = task.plannedInputs ? 
    Object.entries(task.plannedInputs).map(([code, qty]) => ({ code, qty })) : [];
  const outputMaterials = task.plannedOutput ? 
    Object.entries(task.plannedOutput).map(([code, qty]) => ({ code, qty })) : [];
  
  // Status and priority info
  const statusInfo = getStatusInfo(task.status);
  const priorityLabels = {1: 'DÜŞÜK', 2: 'NORMAL', 3: 'YÜKSEK'};
  const priority = task.priority || 2;
  
  // Format times
  const estimatedStart = formatTime(task.estimatedStartTime);
  const estimatedEnd = formatTime(task.estimatedEndTime);
  const actualStartTime = task.startedAt ? formatTime(task.startedAt) : '—';
  const actualEndTime = task.completedAt ? formatTime(task.completedAt) : '—';
  
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal-content" style="max-width: 700px;">
      <div class="modal-header">
        <h2 class="modal-title">📋 Görev Detayları</h2>
        <button class="modal-close" onclick="this.closest('.modal-overlay').remove();">×</button>
      </div>
      <div class="modal-body" style="max-height: 70vh; overflow-y: auto;">
        
        <!-- Genel Bilgiler -->
        <div style="margin-bottom: 20px;">
          <h3 style="font-size: 14px; font-weight: 600; margin-bottom: 12px; color: #1f2937; border-bottom: 2px solid #e5e7eb; padding-bottom: 6px;">
            🔖 Genel Bilgiler
          </h3>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; font-size: 13px;">
            <div>
              <span style="color: #6b7280; font-weight: 500;">Görev Adı:</span><br>
              <span style="color: #111827; font-weight: 600;">${task.name || task.operationName || 'İsimsiz Görev'}</span>
            </div>
            <div>
              <span style="color: #6b7280; font-weight: 500;">Durum:</span><br>
              <span class="status-badge status-${task.status}">${statusInfo.icon} ${statusInfo.label}</span>
            </div>
            <div>
              <span style="color: #6b7280; font-weight: 500;">Öncelik:</span><br>
              <span style="color: #111827;">${priorityLabels[priority]}</span>
            </div>
            <div>
              <span style="color: #6b7280; font-weight: 500;">İstasyon:</span><br>
              <span style="color: #111827;">${task.substationCode || task.stationName || 'Belirsiz'}</span>
            </div>
            <div>
              <span style="color: #6b7280; font-weight: 500;">Plan ID:</span><br>
              <span style="color: #111827; font-family: monospace;">${task.planId || '—'}</span>
            </div>
            <div>
              <span style="color: #6b7280; font-weight: 500;">Node ID:</span><br>
              <span style="color: #111827; font-family: monospace;">${task.nodeId || '—'}</span>
            </div>
          </div>
        </div>
        
        <!-- Malzemeler -->
        ${inputMaterials.length > 0 || outputMaterials.length > 0 ? `
        <div style="margin-bottom: 20px;">
          <h3 style="font-size: 14px; font-weight: 600; margin-bottom: 12px; color: #1f2937; border-bottom: 2px solid #e5e7eb; padding-bottom: 6px;">
            📦 Malzemeler
          </h3>
          ${inputMaterials.length > 0 ? `
          <div style="margin-bottom: 12px;">
            <div style="font-size: 12px; color: #6b7280; font-weight: 500; margin-bottom: 6px;">GİRDİ:</div>
            <div style="display: flex; flex-wrap: wrap; gap: 8px;">
              ${inputMaterials.map(m => `
                <div style="background: #f0f9ff; border: 1px solid #bae6fd; padding: 6px 12px; border-radius: 6px; font-size: 12px;">
                  <span style="color: #0c4a6e; font-weight: 600;">${m.code}</span>
                  <span style="color: #075985; margin-left: 4px;">× ${m.qty}</span>
                </div>
              `).join('')}
            </div>
          </div>
          ` : ''}
          ${outputMaterials.length > 0 ? `
          <div>
            <div style="font-size: 12px; color: #6b7280; font-weight: 500; margin-bottom: 6px;">ÇIKTI:</div>
            <div style="display: flex; flex-wrap: wrap; gap: 8px;">
              ${outputMaterials.map(m => `
                <div style="background: #f0fdf4; border: 1px solid #bbf7d0; padding: 6px 12px; border-radius: 6px; font-size: 12px;">
                  <span style="color: #14532d; font-weight: 600;">${m.code}</span>
                  <span style="color: #166534; margin-left: 4px;">× ${m.qty}</span>
                </div>
              `).join('')}
            </div>
          </div>
          ` : ''}
        </div>
        ` : ''}
        
        <!-- Üretim Detayları -->
        <div style="margin-bottom: 20px;">
          <h3 style="font-size: 14px; font-weight: 600; margin-bottom: 12px; color: #1f2937; border-bottom: 2px solid #e5e7eb; padding-bottom: 6px;">
            ⚙️ Üretim Detayları
          </h3>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; font-size: 13px;">
            <div>
              <span style="color: #6b7280; font-weight: 500;">Planlanan Miktar:</span><br>
              <span style="color: #111827;">${task.outputQty || outputMaterials[0]?.qty || '—'}</span>
            </div>
            <div>
              <span style="color: #6b7280; font-weight: 500;">Üretilen Miktar:</span><br>
              <span style="color: #111827;">${task.actualQuantity || '—'}</span>
            </div>
            <div>
              <span style="color: #6b7280; font-weight: 500;">Tahmini Süre:</span><br>
              <span style="color: #111827;">${formatDuration(task.estimatedEffectiveTime || task.estimatedNominalTime)}</span>
            </div>
            <div>
              <span style="color: #6b7280; font-weight: 500;">Gerçek Süre:</span><br>
              <span style="color: #111827;">${task.actualDuration ? formatDuration(task.actualDuration) : '—'}</span>
            </div>
          </div>
        </div>
        
        <!-- Zaman Bilgileri -->
        <div style="margin-bottom: 20px;">
          <h3 style="font-size: 14px; font-weight: 600; margin-bottom: 12px; color: #1f2937; border-bottom: 2px solid #e5e7eb; padding-bottom: 6px;">
            ⏰ Zaman Bilgileri
          </h3>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; font-size: 13px;">
            <div>
              <span style="color: #6b7280; font-weight: 500;">Tahmini Başlangıç:</span><br>
              <span style="color: #111827;">${estimatedStart}</span>
            </div>
            <div>
              <span style="color: #6b7280; font-weight: 500;">Tahmini Bitiş:</span><br>
              <span style="color: #111827;">${estimatedEnd}</span>
            </div>
            <div>
              <span style="color: #6b7280; font-weight: 500;">Gerçek Başlangıç:</span><br>
              <span style="color: #111827;">${actualStartTime}</span>
            </div>
            <div>
              <span style="color: #6b7280; font-weight: 500;">Gerçek Bitiş:</span><br>
              <span style="color: #111827;">${actualEndTime}</span>
            </div>
          </div>
        </div>
        
        <!-- Worker ID -->
        ${task.workerId ? `
        <div style="margin-bottom: 20px;">
          <h3 style="font-size: 14px; font-weight: 600; margin-bottom: 12px; color: #1f2937; border-bottom: 2px solid #e5e7eb; padding-bottom: 6px;">
            👤 Atama Bilgisi
          </h3>
          <div style="font-size: 13px;">
            <span style="color: #6b7280; font-weight: 500;">İşçi ID:</span><br>
            <span style="color: #111827; font-family: monospace;">${task.workerId}</span>
          </div>
        </div>
        ` : ''}
        
      </div>
      <div class="modal-footer">
        <button class="btn-primary" onclick="this.closest('.modal-overlay').remove();">Kapat</button>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  // Close on overlay click
  modal.onclick = (e) => {
    if (e.target === modal) {
      modal.remove();
    }
  };
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
  const numericId = typeof assignmentId === 'string' ? parseInt(assignmentId, 10) : assignmentId;
  
  // Find assignment from current tasks
  const task = state.tasks.find(t => t.assignmentId === numericId);
  if (!task) {
    showToast('Görev bulunamadı', 'error');
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
    showToast('Fire sayacı güncellenemedi: ' + error.message, 'error');
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
      `/api/mes/work-packages/${currentFireAssignment.assignmentId}/scrap/${scrapType}/${encodeURIComponent(materialCode)}/${quantity}`,
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
    showToast('Fire sayacı azaltılamadı: ' + error.message, 'error');
  }
}

// Make functions globally accessible for onclick handlers
window.openFireModal = openFireModal;
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
  
  // Initialize Lucide icons
  if (typeof lucide !== 'undefined' && lucide.createIcons) {
    lucide.createIcons();
  }
  
  // Attach event listeners
  attachEventListeners();
  
  // Start live duration updates
  startDurationUpdates();
}

function renderLoading() {
  return `
    <div class="loading-container" style="text-align: center; padding: 64px 24px;">
      <div style="display: inline-block; margin-bottom: 20px;">
        <i data-lucide="loader" style="width: 48px; height: 48px; color: var(--primary); animation: spin 1s linear infinite;"></i>
      </div>
      <p style="color: var(--muted-foreground); font-size: 14px;">Görevler yükleniyor...</p>
    </div>
    <style>
      @keyframes spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
      }
    </style>
  `;
}

function renderError(error) {
  return `
    <div class="error-container" style="text-align: center; padding: 64px 24px;">
      <div style="display: inline-block; margin-bottom: 20px;">
        <i data-lucide="alert-circle" style="width: 48px; height: 48px; color: #ef4444;"></i>
      </div>
      <h3 style="font-size: 18px; font-weight: 600; color: var(--foreground); margin-bottom: 8px;">
        Bir Hata Oluştu
      </h3>
      <p style="color: var(--muted-foreground); font-size: 14px; margin-bottom: 16px;">
        ${error}
      </p>
      <button class="btn-primary" onclick="window.workerPortalApp.loadWorkerTasks()" style="display: inline-flex; align-items: center; gap: 8px;">
        <i data-lucide="refresh-cw" style="width: 16px; height: 16px;"></i>
        <span>Tekrar Dene</span>
      </button>
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
          <div class="worker-avatar" style="background: var(--muted); display: flex; align-items: center; justify-content: center;">
            <i data-lucide="user-x" style="width: 32px; height: 32px; color: var(--muted-foreground);"></i>
          </div>
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
        <div class="worker-avatar" style="background: linear-gradient(135deg, #3b82f6, #1e40af); display: flex; align-items: center; justify-content: center;">
          <i data-lucide="user" style="width: 32px; height: 32px; color: white;"></i>
        </div>
        <div style="flex: 1;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <h3 class="worker-name">${state.currentWorker.name || 'İsimsiz İşçi'}</h3>
            ${statusBadgeHtml}
          </div>
          <p class="worker-subtitle">ID: ${state.currentWorker.id}</p>
        </div>
        <div class="worker-stats">
          <div class="stat-item">
            <i data-lucide="play-circle" style="width: 18px; height: 18px; color: #3b82f6; margin-bottom: 4px;"></i>
            <div class="stat-value">${activeTasks}</div>
            <div class="stat-label">Devam Eden</div>
          </div>
          <div class="stat-item">
            <i data-lucide="check-circle" style="width: 18px; height: 18px; color: #10b981; margin-bottom: 4px;"></i>
            <div class="stat-value">${readyTasks}</div>
            <div class="stat-label">Hazır</div>
          </div>
          <div class="stat-item">
            <i data-lucide="clock" style="width: 18px; height: 18px; color: #6b7280; margin-bottom: 4px;"></i>
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
        <div class="empty-icon">
          <i data-lucide="clipboard-list" style="width: 64px; height: 64px; opacity: 0.3;"></i>
        </div>
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
          class="btn-primary"
          style="margin-top: 16px; display: inline-flex; align-items: center; gap: 8px;"
        >
          <i data-lucide="refresh-cw" style="width: 16px; height: 16px;"></i>
          <span>Görevleri Yenile</span>
        </button>
      </div>
    `;
  }
  
  // ========================================================================
  // MODERN CARD-BASED LAYOUT
  // ========================================================================
  // Sort tasks by FIFO order
  const sortedTasks = [...state.tasks].sort((a, b) => {
    // Urgent tasks always come first
    if (a.isUrgent !== b.isUrgent) {
      return a.isUrgent ? -1 : 1;
    }
    
    // Then sort by expected start time (FIFO)
    const aStart = new Date(a.optimizedStart || a.estimatedStartTime || a.estimatedStartTime).getTime();
    const bStart = new Date(b.optimizedStart || b.estimatedStartTime || b.estimatedStartTime).getTime();
    return aStart - bStart;
  });
  
  // Check if there's already an in-progress or paused task (active work exists)
  const hasActiveTask = sortedTasks.some(t => 
    t.status === 'in_progress' || t.status === 'in-progress' || t.status === 'paused'
  );
  
  // Identify next task (FIFO Position #1) - only if no active task exists
  const nextTask = hasActiveTask 
    ? null 
    : sortedTasks.find(t => t.status === 'ready' || t.status === 'pending');
  
  // Separate current/active tasks from upcoming tasks
  const currentTasks = [];
  const upcomingTasks = [];
  
  let fifoPosition = 1;
  sortedTasks.forEach(task => {
    const isNextTask = nextTask && task.assignmentId === nextTask.assignmentId;
    const currentFifoPosition = (task.status === 'ready' || task.status === 'pending') ? fifoPosition++ : null;
    
    // Current tasks: in-progress, paused, or the next task (only when no in-progress exists)
    if (task.status === 'in_progress' || task.status === 'in-progress' || task.status === 'paused' || isNextTask) {
      currentTasks.push(renderModernTaskCard(task, isNextTask, currentFifoPosition));
    } 
    // Upcoming tasks: other ready/pending tasks
    else if (task.status === 'ready' || task.status === 'pending') {
      upcomingTasks.push(renderCompactTaskCard(task, currentFifoPosition));
    }
  });
  
  return `
    <div class="task-list-container">
      <div class="task-list-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;">
        <div>
          <h2 class="section-title" style="display: flex; align-items: center; gap: 12px; margin: 0;">
            <i data-lucide="clipboard-list" style="width: 28px; height: 28px; color: var(--primary);"></i>
            <span>Görevlerim</span>
          </h2>
        </div>
        <button class="btn-secondary" onclick="window.workerPortalApp.loadWorkerTasks()" style="display: inline-flex; align-items: center; gap: 8px;">
          <i data-lucide="refresh-cw" style="width: 16px; height: 16px;"></i>
          <span>Yenile</span>
        </button>
      </div>
      
      <div class="task-cards-container">
        <!-- Current Task(s) - Left Column -->
        <div class="current-tasks-column">
          ${currentTasks.length > 0 ? currentTasks.join('') : '<div class="empty-state-small">Aktif görev yok</div>'}
        </div>
        
        <!-- Upcoming Tasks - Right Column -->
        <div class="upcoming-tasks-column">
          ${upcomingTasks.length > 0 ? `
            <div style="font-size: 12px; font-weight: 600; color: var(--muted-foreground); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 8px; padding: 0 4px;">
              <i data-lucide="clock" style="width: 14px; height: 14px;"></i>
              Sırada Bekleyenler (${upcomingTasks.length})
            </div>
            ${upcomingTasks.join('')}
          ` : '<div class="empty-state-small">Bekleyen görev yok</div>'}
        </div>
      </div>
    </div>
  `;
}

// ============================================================================
// MODERN TASK CARD RENDERING
// ============================================================================

function renderModernTaskCard(task, isNextTask, fifoPosition) {
  // If this is NOT the next task and is in pending/ready status, render compact version
  if (!isNextTask && (task.status === 'ready' || task.status === 'pending')) {
    return renderCompactTaskCard(task, fifoPosition);
  }
  
  // Otherwise render full card (for next task, in-progress, paused, etc.)
  const statusInfo = getStatusInfo(task.status);
  
  // Extract material information
  const inputMaterials = [];
  const outputMaterials = [];
  
  // materialInputs comes as object from backend in two possible formats:
  // Format 1: { "M-001": { qty: 100, name: "...", unit: "..." } } (new format with details)
  // Format 2: { "M-001": 100 } (legacy simple format)
  if (task.materialInputs && typeof task.materialInputs === 'object' && Object.keys(task.materialInputs).length > 0) {
    Object.entries(task.materialInputs).forEach(([code, data]) => {
      // Check if data is an object with qty property or just a number
      if (typeof data === 'object' && data !== null && 'qty' in data) {
        inputMaterials.push({ 
          code, 
          qty: parseFloat(data.qty),
          name: data.name,
          unit: data.unit
        });
      } else {
        // Legacy format: data is just the quantity
        inputMaterials.push({ code, qty: parseFloat(data) });
      }
    });
  } else if (task.preProductionReservedAmount) {
    // Fallback: preProductionReservedAmount includes defect rate buffer
    Object.entries(task.preProductionReservedAmount).forEach(([code, qty]) => {
      inputMaterials.push({ code, qty: parseFloat(qty) });
    });
  }
  
  if (task.plannedOutput) {
    Object.entries(task.plannedOutput).forEach(([code, data]) => {
      // Check if data is an object with qty property or just a number
      if (typeof data === 'object' && data !== null && 'qty' in data) {
        outputMaterials.push({ 
          code, 
          qty: parseFloat(data.qty),
          name: data.name,
          unit: data.unit
        });
      } else {
        // Legacy format: data is just the quantity
        outputMaterials.push({ code, qty: data });
      }
    });
  }
  
  // Card styling based on status
  let cardClass = 'task-card-modern';
  if (isNextTask) cardClass += ' task-card-next';
  if (task.status === 'in_progress' || task.status === 'in-progress') cardClass += ' task-card-active';
  if (task.isUrgent) cardClass += ' task-card-urgent';
  
  // FIFO Position Badge
  const fifoBadgeHtml = fifoPosition 
    ? `<div class="fifo-badge ${fifoPosition === 1 ? 'fifo-badge-next' : 'fifo-badge-waiting'}">
        <i data-lucide="hash" style="width: 14px; height: 14px;"></i>
        <span>${fifoPosition}</span>
      </div>`
    : '';
  
  return `
    <div class="${cardClass}" data-assignment-id="${task.assignmentId}">
      <!-- Card Header -->
      <div class="task-card-header">
        <div class="task-card-title-row">
          <div class="task-card-title">
            <i data-lucide="wrench" style="width: 20px; height: 20px; color: var(--primary);"></i>
            <h3>${task.name || task.operationName || 'İsimsiz Görev'}</h3>
          </div>
          <div class="task-card-badges">
            ${fifoBadgeHtml}
            <span class="status-badge-modern status-${task.status}">
              ${statusInfo.icon} ${statusInfo.label}
            </span>
            ${task.isUrgent ? '<span class="urgent-badge-modern"><i data-lucide="zap" style="width: 14px; height: 14px;"></i> ÖNCELİKLİ</span>' : ''}
          </div>
        </div>
        <div class="task-card-meta">
          <span><i data-lucide="package" style="width: 14px; height: 14px;"></i> ${task.workOrderCode || 'İş Emri Yok'}</span>
          ${task.planName ? `<span style="margin-left: 4px; opacity: 0.7;">• ${task.planName}</span>` : ''}
        </div>
      </div>
      
      <!-- Card Body -->
      <div class="task-card-body">
        <!-- Station Info (Prominent) -->
        <div class="info-section-primary">
          <div class="info-icon">
            <i data-lucide="factory" style="width: 24px; height: 24px; color: #3b82f6;"></i>
          </div>
          <div class="info-content">
            <div class="info-label">Çalışılacak Makine</div>
            <div class="info-value">${task.substationCode || task.stationName || 'Belirsiz'}</div>
            ${task.stationName && task.substationCode ? `<div class="info-sub">${task.stationName}</div>` : ''}
          </div>
        </div>
        
        <!-- Materials Grid -->
        ${inputMaterials.length > 0 || outputMaterials.length > 0 ? `
        <div class="materials-section">
          <div class="section-title-small">
            <i data-lucide="package-2" style="width: 16px; height: 16px;"></i>
            <span>Malzemeler</span>
          </div>
          <div class="materials-grid">
            ${inputMaterials.length > 0 ? `
            <div class="material-group">
              <div class="material-group-label">
                <i data-lucide="arrow-down-to-line" style="width: 14px; height: 14px;"></i>
                GİRDİ
              </div>
              <div class="material-tags">
                ${inputMaterials.map(m => `
                  <div class="material-tag material-tag-input" title="${m.name || m.code}">
                    <span class="material-code">${m.code}</span>
                    ${m.name ? `<span class="material-name" style="font-size: 11px; opacity: 0.8;">${m.name}</span>` : ''}
                    <span class="material-qty">× ${m.qty}${m.unit ? ' ' + m.unit : ''}</span>
                  </div>
                `).join('')}
              </div>
            </div>
            ` : ''}
            ${outputMaterials.length > 0 ? `
            <div class="material-group">
              <div class="material-group-label">
                <i data-lucide="arrow-up-from-line" style="width: 14px; height: 14px;"></i>
                ÇIKTI
              </div>
              <div class="material-tags">
                ${outputMaterials.map(m => `
                  <div class="material-tag material-tag-output" title="${m.name || m.code}">
                    <span class="material-code">${m.code}</span>
                    ${m.name ? `<span class="material-name" style="font-size: 11px; opacity: 0.8;">${m.name}</span>` : ''}
                    <span class="material-qty">× ${m.qty}${m.unit ? ' ' + m.unit : ''}</span>
                  </div>
                `).join('')}
              </div>
            </div>
            ` : ''}
          </div>
        </div>
        ` : ''}
        
        <!-- Time & Duration Info -->
        <div class="info-grid">
          <div class="info-item">
            <i data-lucide="clock" style="width: 16px; height: 16px; color: #6b7280;"></i>
            <div>
              <div class="info-item-label">Tahmini Süre</div>
              <div class="info-item-value">${formatDuration(task.estimatedEffectiveTime || task.estimatedNominalTime)}</div>
            </div>
          </div>
          <div class="info-item">
            <i data-lucide="${task.startedAt ? 'play-circle' : 'calendar-clock'}" style="width: 16px; height: 16px; color: ${task.startedAt ? '#10b981' : '#6b7280'};"></i>
            <div>
              <div class="info-item-label">${task.startedAt ? 'Başlangıç' : 'Tahmini Başlangıç'}</div>
              <div class="info-item-value">${task.startedAt ? formatTime(task.startedAt) : (task.estimatedStartTime ? formatTime(task.estimatedStartTime) : '—')}</div>
            </div>
          </div>
          ${task.status === 'in_progress' || task.status === 'in-progress' ? `
          <div class="info-item" style="background: linear-gradient(135deg, #dbeafe, #eff6ff); border-color: #3b82f6;">
            <i data-lucide="timer" style="width: 16px; height: 16px; color: #3b82f6;"></i>
            <div>
              <div class="info-item-label">Geçen Süre</div>
              <div class="info-item-value duration-live" data-started-at="${task.startedAt}" data-assignment-id="${task.assignmentId}">—</div>
            </div>
          </div>
          ` : `
          <div class="info-item">
            <i data-lucide="flag" style="width: 16px; height: 16px; color: #6b7280;"></i>
            <div>
              <div class="info-item-label">Tahmini Bitiş</div>
              <div class="info-item-value">${task.estimatedEndTime ? formatTime(task.estimatedEndTime) : '—'}</div>
            </div>
          </div>
          `}
        </div>
      </div>
      
      <!-- Card Actions -->
      <div class="task-card-actions">
        ${renderModernTaskActions(task, isNextTask, fifoPosition)}
      </div>
    </div>
  `;
}

// ============================================================================
// COMPACT TASK CARD (for future tasks in queue)
// ============================================================================

function renderCompactTaskCard(task, fifoPosition) {
  const statusInfo = getStatusInfo(task.status);
  
  // FIFO Position Badge
  const fifoBadgeHtml = fifoPosition 
    ? `<div class="fifo-badge fifo-badge-waiting">
        <i data-lucide="hash" style="width: 14px; height: 14px;"></i>
        <span>${fifoPosition}</span>
      </div>`
    : '';
  
  return `
    <div class="task-card-compact" data-assignment-id="${task.assignmentId}">
      <div class="task-card-header">
        <div class="task-card-title-row">
          <div class="task-card-title">
            <i data-lucide="wrench" style="width: 20px; height: 20px; color: var(--primary);"></i>
            <h3>${task.name || task.operationName || 'İsimsiz Görev'}</h3>
          </div>
          <div class="task-card-badges">
            ${fifoBadgeHtml}
            <span class="status-badge-modern status-${task.status}">
              ${statusInfo.icon} ${statusInfo.label}
            </span>
            ${task.isUrgent ? '<span class="urgent-badge-modern"><i data-lucide="zap" style="width: 14px; height: 14px;"></i> ÖNCELİKLİ</span>' : ''}
          </div>
        </div>
        <div class="task-card-meta" style="display: flex; justify-content: space-between; align-items: center;">
          <div>
            <span><i data-lucide="package" style="width: 14px; height: 14px;"></i> ${task.workOrderCode || 'İş Emri Yok'}</span>
            ${task.planName ? `<span style="margin-left: 4px; opacity: 0.7;">• ${task.planName}</span>` : ''}
          </div>
          <div style="font-size: 11px; opacity: 0.5; display: flex; gap: 8px; align-items: center;">
            ${task.estimatedStartTime ? `<div style="display: flex; align-items: center; gap: 3px;"><i data-lucide="play-circle" style="width: 12px; height: 12px;"></i> <span>${formatTime(task.estimatedStartTime)}</span></div>` : ''}
            ${task.estimatedEndTime ? `<div style="display: flex; align-items: center; gap: 3px;"><i data-lucide="flag" style="width: 12px; height: 12px;"></i> <span>${formatTime(task.estimatedEndTime)}</span></div>` : ''}
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderModernTaskActions(task, isNextTask, fifoPosition) {
  const canStart = task.canStart || (isNextTask && (task.status === 'ready' || task.status === 'pending'));
  
  if (task.status === 'in_progress' || task.status === 'in-progress') {
    return `
      <div class="action-buttons-row" style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px;">
        <button class="btn-danger action-btn" onclick="openFireModal(${task.assignmentId})" style="padding: 12px 8px;">
          <i data-lucide="flame" style="width: 28px; height: 28px;"></i>
          <span style="font-size: 13px;">Fire</span>
        </button>
        <button class="btn-outline action-btn" onclick="pauseTask('${task.assignmentId}')" style="padding: 12px 8px;">
          <i data-lucide="pause" style="width: 28px; height: 28px;"></i>
          <span style="font-size: 13px;">Duraklat</span>
        </button>
        <button class="btn-primary action-btn" onclick="completeTaskFlow('${task.assignmentId}')" style="padding: 12px 8px;">
          <i data-lucide="check-circle" style="width: 28px; height: 28px;"></i>
          <span style="font-size: 13px;">Tamamla</span>
        </button>
      </div>
    `;
  }
  
  if (task.status === 'paused') {
    return `
      <div class="action-buttons-row">
        <button class="btn-primary action-btn" onclick="resumeTask('${task.assignmentId}')">
          <i data-lucide="play" style="width: 32px; height: 32px;"></i>
          <span>Devam Et</span>
        </button>
      </div>
    `;
  }
  
  if (canStart) {
    return `
      <div class="action-buttons-row">
        <button class="btn-outline action-btn" onclick="viewTaskDetails('${task.assignmentId}')">
          <i data-lucide="info" style="width: 32px; height: 32px;"></i>
          <span>Detaylar</span>
        </button>
        <button class="btn-success action-btn" onclick="startTaskFlow('${task.assignmentId}')">
          <i data-lucide="play-circle" style="width: 32px; height: 32px;"></i>
          <span>${isNextTask ? 'ŞİMDİ BAŞLAT' : 'Başlat'}</span>
        </button>
      </div>
    `;
  }
  
  return `
    <div class="action-buttons-row">
      <button class="btn-outline action-btn" onclick="viewTaskDetails('${task.assignmentId}')">
        <i data-lucide="info" style="width: 32px; height: 32px;"></i>
        <span>Detaylar</span>
      </button>
      <button class="btn-outline action-btn" disabled title="Sıranız bekleniyor">
        <i data-lucide="clock" style="width: 32px; height: 32px;"></i>
        <span>Bekliyor${fifoPosition ? ` (#${fifoPosition})` : ''}</span>
      </button>
    </div>
  `;
}

function renderTaskRow(task, isNextTask, fifoPosition) {
  const statusInfo = getStatusInfo(task.status);
  
  // ========================================================================
  // STEP 9: FIFO Position Badge (#1, #2, #3...)
  // ========================================================================
  // Show queue position for ready/pending tasks
  // Position #1 is highlighted in green and has "ŞİMDİ BAŞLAT" button
  const fifoBadge = fifoPosition 
    ? `<span class="fifo-position-badge ${fifoPosition === 1 ? 'fifo-next' : 'fifo-waiting'}">#${fifoPosition}</span>` 
    : '';
  
  // Priority badge (for urgent tasks)
  const priorityBadge = task.isUrgent 
    ? '<span class="priority-badge urgent-badge">⭐ ÖNCELİKLİ</span>' 
    : (isNextTask ? '<span class="priority-badge">Sırada</span>' : '');
  
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
  
  // Lot consumption preview (for ready/pending tasks with lot tracking)
  const lotPreviewHtml = renderLotPreview(task);
  
  // Priority badge based on priority field (1=Low, 2=Normal, 3=High)
  const priorityLabels = {1: 'DÜŞÜK', 2: 'NORMAL', 3: 'YÜKSEK'};
  const priorityColors = {1: 'priority-low', 2: 'priority-normal', 3: 'priority-high'};
  const priority = task.priority || 2; // Default to normal
  const priorityBadgeHtml = `<span class="priority-level-badge ${priorityColors[priority]}">${priorityLabels[priority]}</span>`;
  
  // ========================================================================
  // STEP 9: Urgent Task Highlighting
  // ========================================================================
  // Urgent tasks get special styling (red border, star icon)
  const urgentClass = task.isUrgent ? 'urgent-card' : '';
  
  // ========================================================================
  // STEP 9: Next Task Highlighting (#1 in FIFO queue)
  // ========================================================================
  // First task in queue gets green border and "ŞİMDİ BAŞLAT" button
  const nextTaskClass = isNextTask ? 'next-task-card' : '';
  
  return `
    <tr class="task-row ${task.status === 'paused' ? 'task-paused' : ''} ${urgentClass} ${nextTaskClass}" data-assignment-id="${task.assignmentId}">
      <td>
        <div class="priority-index">${fifoBadge || '#' + (task.workPackageId?.split('-').pop() || '?')}</div>
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
          ${lotPreviewHtml}
          ${renderPrerequisites(task.prerequisites, task)}
          ${pausedBannerHtml}
          ${blockReasonsHtml}
        </div>
      </td>
      <td>
        <div class="station-info">${task.substationCode || task.stationName || 'Belirsiz'}</div>
      </td>
      <td>
        <div class="duration-info" 
             data-assignment-id="${task.assignmentId}"
             data-status="${task.status}"
             data-started-at="${task.startedAt ? (typeof task.startedAt === 'object' ? JSON.stringify(task.startedAt) : task.startedAt) : ''}"
             data-estimated-time="${task.estimatedEffectiveTime || task.estimatedNominalTime || 0}">
          ${task.startedAt && (task.status === 'in-progress' || task.status === 'in_progress') ? '⏱️ 0dk' : formatDuration(task.estimatedEffectiveTime || task.estimatedNominalTime)}
        </div>
      </td>
      <td>
        ${renderTaskActions(task, isNextTask, fifoPosition)}
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
  if ((task.substationCode || task.stationName) && task.stationName !== 'Belirsiz') {
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
  if (task.startedAt) {
    // Show expected start/end in muted style
    if (task.estimatedStartTime || task.estimatedEndTime) {
      const plannedParts = [];
      if (task.estimatedStartTime) {
        plannedParts.push(`Beklenen: ${formatTime(task.estimatedStartTime)}`);
      }
      if (task.estimatedEndTime) {
        plannedParts.push(`${formatTime(task.estimatedEndTime)}`);
      }
      timingDetails.push(`<span style="color: #9ca3af; font-size: 10px;">${plannedParts.join(' → ')}</span>`);
    }
    
    // Show actual start time prominently
    const actualStartTime = formatTime(task.startedAt);
    timingDetails.push(`<span style="color: #059669;">▶️ Başladı: <strong>${actualStartTime}</strong></span>`);
    
    // Calculate expected end based on actual start + effective time
    // Always calculate from startedAt, not estimatedEndTime
    try {
      let startDate;
      
      // Handle Firestore Timestamp objects
      if (typeof task.startedAt === 'object' && task.startedAt._seconds !== undefined) {
        startDate = new Date(task.startedAt._seconds * 1000);
      } else {
        startDate = new Date(task.startedAt);
      }
      
      // Use effective time if available, otherwise use nominal time, otherwise calculate from estimatedEndTime
      let durationMinutes = task.estimatedEffectiveTime || task.estimatedNominalTime;
      
      if (!durationMinutes && task.estimatedEndTime && task.estimatedStartTime) {
        // Calculate duration from planned times as fallback
        const estimatedEndTimeDate = new Date(task.estimatedEndTime);
        const estimatedStartTimeDate = new Date(task.estimatedStartTime);
        durationMinutes = Math.round((estimatedEndTimeDate - estimatedStartTimeDate) / 60000);
      }
      
      if (durationMinutes > 0) {
        const expectedEndDate = new Date(startDate.getTime() + (durationMinutes * 60000));
        const expectedEndTime = formatTime(expectedEndDate.toISOString());
        timingDetails.push(`<span style="color: #dc2626;">🎯 Bitmeli: <strong>${expectedEndTime}</strong></span>`);
      } else if (task.estimatedEndTime) {
        // Fallback to planned end if no effective time
        const expectedEndTime = formatTime(task.estimatedEndTime);
        timingDetails.push(`<span style="color: #dc2626;">🎯 Bitmeli: <strong>${expectedEndTime}</strong></span>`);
      }
    } catch (err) {
      console.error('Error calculating expected end:', err);
      // Fallback to planned end if calculation fails
      if (task.estimatedEndTime) {
        const expectedEndTime = formatTime(task.estimatedEndTime);
        timingDetails.push(`<span style="color: #dc2626;">🎯 Bitmeli: <strong>${expectedEndTime}</strong></span>`);
      }
    }
  } else {
    // Task not started yet - show expected times normally
    if (task.estimatedStartTime) {
      const estimatedStartTimeTime = formatTime(task.estimatedStartTime);
      timingDetails.push(`📅 Beklenen Başlangıç: <strong>${estimatedStartTimeTime}</strong>`);
    }
    
    if (task.estimatedEndTime) {
      const expectedEndTime = formatTime(task.estimatedEndTime);
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

function renderLotPreview(task) {
  // Skip if lot tracking is disabled
  if (!state.systemSettings.lotTracking) {
    return '';
  }

  // Only show lot preview for ready/pending tasks that haven't started yet
  if (task.status !== 'ready' && task.status !== 'pending') {
    return '';
  }
  
  // Check if lot preview data is loaded
  if (!task.lotPreview) {
    return '';
  }
  
  const { materials, error } = task.lotPreview;
  
  if (error) {
    return `
      <div class="lot-preview" style="margin-top: 6px; padding: 6px 8px; background: #fef3c7; border-radius: 4px; border-left: 3px solid #f59e0b;">
        <div style="font-size: 11px; color: #92400e;">
          <span style="font-weight: 600;">⚠️ Lot önizleme yüklenemedi:</span> ${error}
        </div>
      </div>
    `;
  }
  
  if (!materials || materials.length === 0) {
    return '';
  }
  
  // Check if any material has lot tracking
  const hasLots = materials.some(m => m.lotsToConsume && m.lotsToConsume.length > 0);
  
  if (!hasLots) {
    return ''; // No lot tracking data available
  }
  
  let lotHtml = '<div class="lot-preview" style="margin-top: 6px; padding: 8px 10px; background: #f0f9ff; border-radius: 4px; border-left: 3px solid #0ea5e9;">';
  lotHtml += '<div style="font-size: 11px; font-weight: 600; color: #0c4a6e; margin-bottom: 6px;">📦 Tüketilecek Lotlar (FIFO):</div>';
  
  for (const material of materials) {
    if (!material.lotsToConsume || material.lotsToConsume.length === 0) continue;
    
    lotHtml += `<div style="margin-bottom: 6px;">`;
    lotHtml += `<div style="font-size: 10px; color: #075985; font-weight: 600;">${material.materialName || material.materialCode}:</div>`;
    
    for (const lot of material.lotsToConsume) {
      const lotDate = lot.lotDate ? new Date(lot.lotDate).toLocaleDateString('tr-TR') : '-';
      lotHtml += `<div style="font-size: 10px; color: #0369a1; margin-left: 8px;">
        • ${lot.lotNumber} (${lotDate}) → ${lot.consumeQty} ${material.unit || 'adet'}
      </div>`;
    }
    
    // Show warning if insufficient
    if (!material.sufficient) {
      lotHtml += `<div style="font-size: 10px; color: #c2410c; margin-left: 8px; margin-top: 2px;">
        ⚠️ Yetersiz stok (Var: ${material.totalAvailable}, Gerek: ${material.requiredQty})
      </div>`;
    }
    
    lotHtml += `</div>`;
  }
  
  lotHtml += '</div>';
  
  return lotHtml;
}


function renderTimeInfo(task) {
  // Show actual times if task has started, otherwise show planned times
  if (task.startedAt) {
    let timeHtml = `
      <div class="time-info" style="margin-top: 8px; padding: 8px; background: #f0f9ff; border-radius: 4px; border-left: 3px solid #3b82f6;">
        <div style="font-size: 11px; color: #1e40af; display: flex; align-items: center; gap: 6px;">
          <span>⏰</span>
          <span><strong>Başlangıç:</strong> ${formatTime(task.startedAt)}</span>
    `;
    
    // Show planned start time for comparison if different
    if (task.estimatedStartTime) {
      const actualDate = new Date(task.startedAt);
      const plannedDate = new Date(task.estimatedStartTime);
      const diff = Math.abs(actualDate - plannedDate) / 60000; // minutes
      if (diff > 5) { // Show if difference > 5 minutes
        timeHtml += ` <span style="color: #9ca3af;">(Plan: ${formatTime(task.estimatedStartTime)})</span>`;
      }
    }
    timeHtml += `</div>`;
    
    // Show end time if completed
    if (task.completedAt) {
      timeHtml += `
        <div style="font-size: 11px; color: #059669; margin-top: 4px; display: flex; align-items: center; gap: 6px;">
          <span>✅</span>
          <span><strong>Bitiş:</strong> ${formatTime(task.completedAt)}</span>
        </div>
      `;
    } else if (task.estimatedEndTime) {
      // Show expected end time
      timeHtml += `
        <div style="font-size: 11px; color: #6b7280; margin-top: 4px; display: flex; align-items: center; gap: 6px;">
          <span>📅</span>
          <span><strong>Tahmini Bitiş:</strong> ${formatTime(task.estimatedEndTime)}</span>
        </div>
      `;
    }
    
    timeHtml += `</div>`;
    return timeHtml;
  } else if (task.estimatedStartTime) {
    // Task hasn't started yet, show planned times
    return `
      <div class="time-info" style="margin-top: 8px; padding: 6px; background: #f9fafb; border-radius: 4px; border-left: 3px solid #d1d5db;">
        <div style="font-size: 11px; color: #6b7280; display: flex; align-items: center; gap: 6px;">
          <span>📅</span>
          <span><strong>Planlanan:</strong> ${formatTime(task.estimatedStartTime)}</span>
          ${task.estimatedEndTime ? ` <span>→</span> <span>${formatTime(task.estimatedEndTime)}</span>` : ''}
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

function renderTaskActions(task, isNextTask, fifoPosition) {
  const actions = [];
  
  // Urgent badge
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
  
  // ========================================================================
  // STEP 9: FIFO Enforcement - Only position #1 can start
  // ========================================================================
  // Check canStart flag (backend value) - undefined means false
  // canStart = false → task must wait in queue
  // isNextTask = true → this is FIFO position #1 (can start if no other blocks)
  const cannotStartYet = (task.canStart === false) && (task.status === 'pending' || task.status === 'ready');
  
  // Build tooltip for blocked reasons
  let blockTooltip = '';
  if (workerUnavailable) {
    blockTooltip = `title="İşçi durumu görev başlatmaya uygun değil: ${workCheck.reason || 'Bilinmeyen sebep'}"`;
  } else if (isPlanPaused) {
    blockTooltip = `title="Admin tarafından durduruldu"`;
  } else if (cannotStartYet && !isNextTask) {
    blockTooltip = `title="⏳ FIFO Sırası #${fifoPosition || '?'} - Önce #1 tamamlanmalı"`;
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
  
  // ========================================================================
  // STEP 9: Start Button with FIFO Position #1 Highlighting
  // ========================================================================
  // Show different button text and style for FIFO position #1
  // KURAL: SADECE next task (#1) veya urgent task aktif olabilir!
  if (task.status === 'ready' || task.status === 'pending') {
    // Check if this task can be started (next in FIFO or urgent)
    const canStartThis = isNextTask || task.isUrgent;
    const disabled = !canStartThis || isBlocked || isPlanPaused || workerUnavailable;
    
    if (task.isUrgent && !disabled) {
      // Urgent task - always active (red button)
      actions.push(`
        <button class="action-btn action-start action-start-urgent" data-action="start" data-id="${task.assignmentId}">
          ⭐ ÖNCELİKLİ BAŞLAT
        </button>
      `);
    } else if (isNextTask && !disabled) {
      // ========================================================================
      // STEP 9: "ŞİMDİ BAŞLAT" Button for FIFO Position #1
      // ========================================================================
      // This is the next task in FIFO queue - show green highlighted button
      actions.push(`
        <button class="action-btn action-start action-start-now" data-action="start" data-id="${task.assignmentId}">
          🚀 ŞİMDİ BAŞLAT
        </button>
      `);
    } else {
      // Other tasks - ALWAYS DISABLED (FIFO enforcement)
      actions.push(`
        <button class="action-btn action-start disabled" data-action="start" data-id="${task.assignmentId}" disabled title="Bu görevi başlatmak için sıradaki diğer görevleri tamamlayın">
          ▶️ Sırada Bekliyor
        </button>
        ${fifoPosition ? `<small class="waiting-text">⏳ Sıra #${fifoPosition}</small>` : ''}
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
          // STEP 11: Show lot preview modal before starting
          await startTaskWithLotPreview(assignmentId);
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
  
  // Task row click - show detail modal
  document.querySelectorAll('.task-row').forEach(row => {
    row.addEventListener('click', (e) => {
      // Ignore clicks on buttons
      if (e.target.closest('.action-btn')) return;
      
      const assignmentId = row.dataset.assignmentId;
      if (assignmentId) {
        showTaskDetailModal(assignmentId);
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
    // Update old table-based durations (backward compatibility)
    document.querySelectorAll('.duration-info[data-status="in-progress"], .duration-info[data-status="in_progress"]').forEach(el => {
      const startedAt = el.dataset.startedAt;
      if (!startedAt) return;
      
      try {
        let startTime;
        
        // Try to parse as Firestore Timestamp JSON
        try {
          const parsed = JSON.parse(startedAt);
          if (parsed._seconds !== undefined) {
            startTime = new Date(parsed._seconds * 1000);
          } else {
            startTime = new Date(startedAt);
          }
        } catch {
          // Not JSON, treat as ISO string
          startTime = new Date(startedAt);
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
    
    // Update new card-based live durations
    document.querySelectorAll('.duration-live').forEach(el => {
      const startedAt = el.dataset.startedAt;
      if (!startedAt) return;
      
      try {
        const startTime = new Date(startedAt);
        const elapsed = Math.floor((Date.now() - startTime.getTime()) / 60000); // minutes
        el.textContent = formatDuration(elapsed);
      } catch (err) {
        console.error('Error updating live duration:', err);
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
    'pending': { label: 'Bekliyor', icon: '<i data-lucide="clock" style="width: 14px; height: 14px;"></i>', color: 'gray' },
    'ready': { label: 'Hazır', icon: '<i data-lucide="check-circle" style="width: 14px; height: 14px;"></i>', color: 'green' },
    'blocked': { label: 'Bloke', icon: '<i data-lucide="ban" style="width: 14px; height: 14px;"></i>', color: 'red' },
    'in_progress': { label: 'Devam Ediyor', icon: '<i data-lucide="play-circle" style="width: 14px; height: 14px;"></i>', color: 'blue' },
    'paused': { label: 'Duraklatıldı', icon: '<i data-lucide="pause-circle" style="width: 14px; height: 14px;"></i>', color: 'orange' },
    'completed': { label: 'Tamamlandı', icon: '<i data-lucide="check" style="width: 14px; height: 14px;"></i>', color: 'success' },
    'cancelled_pending_report': { label: 'İptal - Rapor Gerekli', icon: '<i data-lucide="x-circle" style="width: 14px; height: 14px;"></i>', color: 'red' }
  };
  
  return statusMap[status] || { label: status, icon: '<i data-lucide="help-circle" style="width: 14px; height: 14px;"></i>', color: 'gray' };
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

function showToast(message, type = 'info') {
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
