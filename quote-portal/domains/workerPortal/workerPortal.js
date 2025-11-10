// Worker Portal Domain Module
// Handles worker task management, status updates, and scrap reporting

import { getWorkerPortalTasks, updateWorkerPortalTask, getWorkers } from '../../production/js/mesApi.js';
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
    state.tasks = result.tasks || [];
    state.nextTaskId = result.nextTaskId || null;
    
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
    const result = await updateWorkerPortalTask(assignmentId, { action: 'start' });
    
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
    await updateWorkerPortalTask(assignmentId, { action: 'pause' });
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
    await updateWorkerPortalTask(assignmentId, { 
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
    await updateWorkerPortalTask(assignmentId, { 
      action: 'complete',
      actualOutputQuantity: completionData.actualOutputQuantity,
      defectQuantity: completionData.defectQuantity,
      // Keep scrapQty for backward compatibility
      scrapQty: completionData.defectQuantity
    });
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
  return new Promise((resolve) => {
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
              Fire/Hatalı Miktar (${outputUnit})
            </label>
            <input 
              type="number" 
              id="defectQty" 
              class="form-input" 
              min="0" 
              step="0.01" 
              value="0"
              placeholder="0.00"
            />
            <p class="form-help">Üretim sırasında oluşan hatalı veya hurda ürün adedini girin.</p>
          </div>
          
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
        defectQuantity
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
  
  // Sort by priorityIndex
  const sortedTasks = [...state.tasks].sort((a, b) => a.priorityIndex - b.priorityIndex);
  
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
  
  return `
    <tr class="task-row ${task.status === 'paused' ? 'task-paused' : ''}" data-assignment-id="${task.assignmentId}">
      <td>
        <div class="priority-index">${task.priorityIndex}</div>
      </td>
      <td>
        <span class="status-badge status-${task.status}">${statusInfo.icon} ${statusInfo.label}</span>
        ${priorityBadge}
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
          ${renderPrerequisites(task.prerequisites)}
          ${pausedBannerHtml}
          ${blockReasonsHtml}
        </div>
      </td>
      <td>
        <div class="station-info">${task.stationName || 'Belirsiz'}</div>
      </td>
      <td>
        <div class="duration-info">${formatDuration(task.estimatedEffectiveTime)}</div>
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

function renderPrerequisites(prerequisites) {
  if (!prerequisites) return '';
  
  const items = [];
  if (!prerequisites.predecessorsDone) items.push('⏳ Önceki görevler');
  if (!prerequisites.workerAvailable) items.push('👷 İşçi meşgul');
  if (!prerequisites.stationAvailable) items.push('🏭 İstasyon meşgul');
  if (!prerequisites.materialsReady) items.push('📦 Malzeme eksik');
  
  if (items.length === 0) return '';
  
  return `<div class="task-blockers">${items.join(' • ')}</div>`;
}

function renderTaskActions(task) {
  const actions = [];
  
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
    !task.prerequisites.stationAvailable ||
    !task.prerequisites.materialsReady
  );
  
  // Build tooltip for blocked reasons
  let blockTooltip = '';
  if (workerUnavailable) {
    blockTooltip = `title="İşçi durumu görev başlatmaya uygun değil: ${workCheck.reason || 'Bilinmeyen sebep'}"`;
  } else if (isPlanPaused) {
    blockTooltip = `title="Admin tarafından durduruldu"`;
  } else if (isBlocked) {
    const reasons = [];
    if (!task.prerequisites.predecessorsDone) reasons.push('Önceki görevler tamamlanmadı');
    if (!task.prerequisites.workerAvailable) reasons.push('İşçi meşgul');
    if (!task.prerequisites.stationAvailable) reasons.push('İstasyon meşgul');
    if (!task.prerequisites.materialsReady) reasons.push('Malzeme eksik');
    blockTooltip = `title="${reasons.join(', ')}"`;
  }
  
  // Resume button - only if paused by worker/station (not admin)
  if (isWorkerPaused) {
    const disabled = (isBlocked || workerUnavailable) ? 'disabled' : '';
    actions.push(`
      <button class="action-btn action-start" data-action="start" data-id="${task.assignmentId}" ${disabled} ${blockTooltip}>
        ▶️ Devam
      </button>
    `);
  }
  
  // Start button - for ready OR pending tasks (and not paused, blocked, or worker unavailable)
  if (task.status === 'ready' || task.status === 'pending') {
    const disabled = (isBlocked || isPlanPaused || workerUnavailable) ? 'disabled' : '';
    actions.push(`
      <button class="action-btn action-start" data-action="start" data-id="${task.assignmentId}" ${disabled} ${blockTooltip}>
        ▶️ Başla
      </button>
    `);
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
      }
    });
  });
}

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

function showNotification(message, type = 'info') {
  const notification = document.createElement('div');
  notification.className = `notification notification-${type}`;
  notification.textContent = message;
  
  document.body.appendChild(notification);
  
  setTimeout(() => {
    notification.classList.add('show');
  }, 10);
  
  setTimeout(() => {
    notification.classList.remove('show');
    setTimeout(() => notification.remove(), 300);
  }, 3000);
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
