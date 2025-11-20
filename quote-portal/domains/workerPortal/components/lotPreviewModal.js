/**
 * LOT PREVIEW MODAL COMPONENT
 * Shows FIFO lot consumption preview before starting a task
 * STEP 11: Material Reservation - Lot Preview UI
 */

// Modal state
let currentModal = null;
let currentAssignmentId = null;
let onConfirmCallback = null;

/**
 * Show lot preview modal before starting a task
 * @param {string} assignmentId - Assignment ID to preview
 * @param {Function} onConfirm - Callback to execute when user confirms
 */
export async function showLotPreviewModal(assignmentId, onConfirm) {
  currentAssignmentId = assignmentId;
  onConfirmCallback = onConfirm;
  
  // Fetch lot preview data
  console.log(`📦 Fetching lot preview for assignment ${assignmentId}...`);
  
  try {
    const response = await fetch(`/api/mes/assignments/${assignmentId}/lot-preview`);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    console.log('✅ Lot preview data:', data);
    
    // Render modal with preview data
    renderModal(data);
  } catch (error) {
    console.error('❌ Failed to load lot preview:', error);
    
    // Show error modal
    renderErrorModal(error.message);
  }
}

/**
 * Close the lot preview modal
 */
export function closeLotPreviewModal() {
  if (currentModal) {
    currentModal.remove();
    currentModal = null;
    currentAssignmentId = null;
    onConfirmCallback = null;
  }
}

/**
 * Render the lot preview modal with data
 */
function renderModal(data) {
  const { materials = [], warnings = [] } = data;
  
  // Check if any material has lot tracking
  const hasLots = materials.some(m => m.lotsToConsume && m.lotsToConsume.length > 0);
  
  // Create modal HTML
  const modalHtml = `
    <div class="lot-preview-modal-overlay">
      <div class="lot-preview-modal">
        <!-- Header -->
        <div class="lot-preview-modal-header">
          <h3>📦 Malzeme Lot Önizleme (FIFO)</h3>
          <button class="lot-preview-close-btn" aria-label="Kapat">✕</button>
        </div>
        
        <!-- Content -->
        <div class="lot-preview-modal-content">
          ${hasLots ? renderMaterials(materials) : renderNoLots()}
          ${warnings.length > 0 ? renderWarnings(warnings) : ''}
        </div>
        
        <!-- Footer -->
        <div class="lot-preview-modal-footer">
          <button class="lot-preview-cancel-btn">İptal</button>
          <button class="lot-preview-confirm-btn" ${hasInsufficientMaterials(materials) ? 'disabled' : ''}>
            ${hasInsufficientMaterials(materials) ? '❌ Yetersiz Stok' : '✅ Onayla ve Başlat'}
          </button>
        </div>
      </div>
    </div>
  `;
  
  // Insert modal into DOM
  const modalElement = document.createElement('div');
  modalElement.innerHTML = modalHtml;
  currentModal = modalElement.firstElementChild;
  document.body.appendChild(currentModal);
  
  // Attach event listeners
  attachModalEventListeners();
  
  // Focus on modal for accessibility
  setTimeout(() => {
    const confirmBtn = currentModal.querySelector('.lot-preview-confirm-btn');
    if (confirmBtn && !confirmBtn.disabled) {
      confirmBtn.focus();
    }
  }, 100);
}

/**
 * Render materials with FIFO lot consumption
 */
function renderMaterials(materials) {
  let html = '<div class="lot-preview-materials">';
  
  for (const material of materials) {
    const { 
      materialCode, 
      materialName, 
      requiredQty, 
      unit = 'adet',
      lotsToConsume = [],
      totalAvailable = 0,
      sufficient = true
    } = material;
    
    // Skip materials without lot tracking
    if (lotsToConsume.length === 0) continue;
    
    const statusClass = sufficient ? 'sufficient' : 'insufficient';
    const statusIcon = sufficient ? '✅' : '⚠️';
    
    html += `
      <div class="lot-preview-material ${statusClass}">
        <!-- Material Header -->
        <div class="lot-preview-material-header">
          <div class="lot-preview-material-name">
            <strong>${materialName || materialCode}</strong>
            ${materialName && materialCode !== materialName ? `<span class="material-code">(${materialCode})</span>` : ''}
          </div>
          <div class="lot-preview-material-qty">
            <span class="required-qty">${requiredQty} ${unit}</span>
            <span class="available-qty">${statusIcon} Mevcut: ${totalAvailable} ${unit}</span>
          </div>
        </div>
        
        <!-- Lot List (FIFO Order) -->
        <div class="lot-preview-lots">
          <div class="lot-preview-lots-header">
            <span>Tüketilecek Lotlar (En Eski → En Yeni):</span>
          </div>
          ${renderLots(lotsToConsume, unit)}
        </div>
        
        ${!sufficient ? renderInsufficientWarning(requiredQty, totalAvailable, unit) : ''}
      </div>
    `;
  }
  
  html += '</div>';
  
  return html;
}

/**
 * Render lot consumption list (FIFO sorted)
 */
function renderLots(lots, unit) {
  let html = '<ul class="lot-list">';
  
  for (let i = 0; i < lots.length; i++) {
    const lot = lots[i];
    const { lotNumber, lotDate, consumeQty, availableQty } = lot;
    
    // Format lot date
    const formattedDate = lotDate 
      ? new Date(lotDate).toLocaleDateString('tr-TR', { 
          year: 'numeric', 
          month: 'short', 
          day: 'numeric' 
        })
      : '-';
    
    // Highlight oldest lot (FIFO priority)
    const lotClass = i === 0 ? 'lot-item lot-oldest' : 'lot-item';
    const lotIcon = i === 0 ? '🔵' : '⚪';
    
    html += `
      <li class="${lotClass}">
        <span class="lot-icon">${lotIcon}</span>
        <span class="lot-number">${lotNumber}</span>
        <span class="lot-date">(${formattedDate})</span>
        <span class="lot-arrow">→</span>
        <span class="lot-consume">${consumeQty} ${unit}</span>
        ${availableQty !== undefined ? `<span class="lot-available">/ ${availableQty} ${unit} mevcut</span>` : ''}
      </li>
    `;
  }
  
  html += '</ul>';
  
  return html;
}

/**
 * Render insufficient stock warning
 */
function renderInsufficientWarning(required, available, unit) {
  const shortage = required - available;
  
  return `
    <div class="lot-preview-warning">
      <span class="warning-icon">⚠️</span>
      <span class="warning-text">
        Yetersiz stok: <strong>${shortage} ${unit}</strong> eksik 
        (Gerekli: ${required} ${unit}, Mevcut: ${available} ${unit})
      </span>
    </div>
  `;
}

/**
 * Render warnings section
 */
function renderWarnings(warnings) {
  let html = '<div class="lot-preview-warnings-section">';
  html += '<div class="warnings-header">⚠️ Uyarılar:</div>';
  html += '<ul class="warnings-list">';
  
  for (const warning of warnings) {
    html += `<li>${warning}</li>`;
  }
  
  html += '</ul>';
  html += '</div>';
  
  return html;
}

/**
 * Render no lots message
 */
function renderNoLots() {
  return `
    <div class="lot-preview-no-lots">
      <div class="no-lots-icon">📦</div>
      <div class="no-lots-message">Bu görev için lot takibi gerektiren malzeme bulunmamaktadır.</div>
      <div class="no-lots-submessage">Görevi doğrudan başlatabilirsiniz.</div>
    </div>
  `;
}

/**
 * Render error modal
 */
function renderErrorModal(errorMessage) {
  const modalHtml = `
    <div class="lot-preview-modal-overlay">
      <div class="lot-preview-modal">
        <div class="lot-preview-modal-header">
          <h3>❌ Lot Önizleme Hatası</h3>
          <button class="lot-preview-close-btn" aria-label="Kapat">✕</button>
        </div>
        
        <div class="lot-preview-modal-content">
          <div class="lot-preview-error">
            <div class="error-icon">⚠️</div>
            <div class="error-message">Lot önizleme verileri yüklenemedi:</div>
            <div class="error-details">${errorMessage}</div>
          </div>
        </div>
        
        <div class="lot-preview-modal-footer">
          <button class="lot-preview-cancel-btn">Kapat</button>
        </div>
      </div>
    </div>
  `;
  
  const modalElement = document.createElement('div');
  modalElement.innerHTML = modalHtml;
  currentModal = modalElement.firstElementChild;
  document.body.appendChild(currentModal);
  
  attachModalEventListeners();
}

/**
 * Check if any material has insufficient stock
 */
function hasInsufficientMaterials(materials) {
  return materials.some(m => m.sufficient === false);
}

/**
 * Attach event listeners to modal buttons
 */
function attachModalEventListeners() {
  if (!currentModal) return;
  
  // Close button (X)
  const closeBtn = currentModal.querySelector('.lot-preview-close-btn');
  if (closeBtn) {
    closeBtn.addEventListener('click', closeLotPreviewModal);
  }
  
  // Cancel button
  const cancelBtn = currentModal.querySelector('.lot-preview-cancel-btn');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', closeLotPreviewModal);
  }
  
  // Confirm button
  const confirmBtn = currentModal.querySelector('.lot-preview-confirm-btn');
  if (confirmBtn && !confirmBtn.disabled) {
    confirmBtn.addEventListener('click', handleConfirm);
  }
  
  // Close on overlay click
  const overlay = currentModal;
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      closeLotPreviewModal();
    }
  });
  
  // Close on ESC key
  const handleEscape = (e) => {
    if (e.key === 'Escape') {
      closeLotPreviewModal();
      document.removeEventListener('keydown', handleEscape);
    }
  };
  document.addEventListener('keydown', handleEscape);
}

/**
 * Handle confirm button click
 */
async function handleConfirm() {
  if (!onConfirmCallback) {
    console.error('No confirm callback provided');
    closeLotPreviewModal();
    return;
  }
  
  console.log(`✅ User confirmed lot preview for assignment ${currentAssignmentId}`);
  
  // Disable confirm button to prevent double-click
  const confirmBtn = currentModal.querySelector('.lot-preview-confirm-btn');
  if (confirmBtn) {
    confirmBtn.disabled = true;
    confirmBtn.textContent = '⏳ Başlatılıyor...';
  }
  
  try {
    // Execute callback (start task)
    await onConfirmCallback(currentAssignmentId);
    
    // Close modal on success
    closeLotPreviewModal();
  } catch (error) {
    console.error('Error in confirm callback:', error);
    
    // Re-enable button on error
    if (confirmBtn) {
      confirmBtn.disabled = false;
      confirmBtn.textContent = '✅ Onayla ve Başlat';
    }
    
    // Keep modal open to show error
  }
}
