/**
 * Worker PIN Management
 * 
 * Simple script to add PIN management to worker details panel
 * Called from workers.js through global functions
 */

/**
 * Open PIN modal for a worker
 */
window.openSetPinModal = async function (workerId, workerName) {
    const modal = document.getElementById('setPinModal');
    if (!modal) {
        // Create modal if it doesn't exist
        createSetPinModal();
    }

    document.getElementById('setPinWorkerId').value = workerId;
    document.getElementById('setPinWorkerName').textContent = workerName;
    document.getElementById('setPinInput').value = '';
    document.getElementById('setPinConfirm').value = '';
    document.getElementById('setPinError').textContent = '';
    document.getElementById('setPinModal').style.display = 'flex';
};

/**
 * Close PIN modal
 */
window.closeSetPinModal = function () {
    document.getElementById('setPinModal').style.display = 'none';
    document.getElementById('setPinInput').value = '';
    document.getElementById('setPinConfirm').value = '';
    document.getElementById('setPinError').textContent = '';
};

/**
 * Save PIN
 */
window.saveWorkerPin = async function () {
    const workerId = document.getElementById('setPinWorkerId').value;
    const pin = document.getElementById('setPinInput').value;
    const confirm = document.getElementById('setPinConfirm').value;
    const errorEl = document.getElementById('setPinError');

    errorEl.textContent = '';

    // Validate
    if (!pin || pin.length !== 4 || !/^\d{4}$/.test(pin)) {
        errorEl.textContent = 'PIN 4 haneli sayı olmalıdır';
        return;
    }

    if (pin !== confirm) {
        errorEl.textContent = 'PIN\'ler eşleşmiyor';
        return;
    }

    try {
        const token = localStorage.getItem('bp_admin_token');
        const response = await fetch(`/api/mes/workers/${workerId}/set-pin`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ pin })
        });

        const data = await response.json();

        if (!response.ok || !data.success) {
            errorEl.textContent = data.error || 'PIN ayarlanamadı';
            return;
        }

        // Success
        alert('✅ PIN başarıyla ayarlandı');
        closeSetPinModal();
    } catch (error) {
        console.error('Set PIN error:', error);
        errorEl.textContent = 'Bağlantı hatası';
    }
};

/**
 * Create PIN modal (called once)
 */
function createSetPinModal() {
    const modalHTML = `
    <div id="setPinModal" class="modal-overlay" style="display: none;">
      <div class="modal-container" style="max-width: 400px;">
        <div class="modal-header">
          <h3 class="modal-title">PIN Belirle</h3>
          <button class="modal-close-btn" onclick="closeSetPinModal()">×</button>
        </div>
        <div class="modal-body">
          <input type="hidden" id="setPinWorkerId">
          
          <div style="margin-bottom: 16px; padding: 12px; background: var(--muted); border-radius: 8px;">
            <div style="font-size: 14px; color: var(--muted-foreground);">
              <strong id="setPinWorkerName"></strong> için 4 haneli PIN belirleyin
            </div>
          </div>
          
          <div style="margin-bottom: 16px;">
            <label class="form-label-sm">PIN (4 haneli):</label>
            <input type="password" id="setPinInput" class="form-input-sm" maxlength="4" pattern="[0-9]{4}" placeholder="0000" autocomplete="new-password">
          </div>
          
          <div style="margin-bottom: 16px;">
            <label class="form-label-sm">PIN Tekrar:</label>
            <input type="password" id="setPinConfirm" class="form-input-sm" maxlength="4" pattern="[0-9]{4}" placeholder="0000" autocomplete="new-password">
          </div>
          
          <div class="pin-error" id="setPinError"></div>
          
          <div style="display: flex; gap: 12px; margin-top: 24px;">
            <button type="button" class="btn-secondary" onclick="closeSetPinModal()" style="flex: 1;">İptal</button>
            <button type="button" class="btn-primary" onclick="saveWorkerPin()" style="flex: 1;">Kaydet</button>
          </div>
        </div>
      </div>
    </div>
  `;

    document.body.insertAdjacentHTML('beforeend', modalHTML);
}

// Auto-initialize modal on load
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', createSetPinModal);
} else {
    createSetPinModal();
}
