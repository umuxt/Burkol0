// Timezone Management
import { showSuccessToast, showErrorToast } from '../../../shared/components/MESToast.js';

let currentTimezone = 'Europe/Istanbul';

// Initialize timezone UI
export async function initTimezoneUI() {
  try {
    await loadTimezone();
    updateTimezoneUI();
  } catch (error) {
    console.error('Timezone load error:', error);
    showErrorToast('Saat dilimi yüklenemedi');
  }
}

// Load timezone from API
async function loadTimezone() {
  try {
    const response = await fetch('/api/mes/timezone');
    if (!response.ok) throw new Error('Failed to fetch timezone');
    
    const data = await response.json();
    currentTimezone = data.timezone || 'Europe/Istanbul';
  } catch (error) {
    console.error('Load timezone error:', error);
    currentTimezone = 'Europe/Istanbul'; // Default
  }
}

// Update UI with current timezone
function updateTimezoneUI() {
  const select = document.getElementById('timezone-select');
  if (select) {
    select.value = currentTimezone;
  }
}

// Save timezone
export async function saveTimezone() {
  const select = document.getElementById('timezone-select');
  if (!select) return;
  
  const newTimezone = select.value;
  
  try {
    const response = await fetch('/api/mes/timezone', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ timezone: newTimezone })
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Saat dilimi kaydedilemedi');
    }
    
    currentTimezone = newTimezone;
    showSuccessToast(`Saat dilimi güncellendi: ${newTimezone}`);
  } catch (error) {
    console.error('Save timezone error:', error);
    showErrorToast(error.message || 'Saat dilimi kaydedilemedi');
  }
}

// Get current timezone
export function getCurrentTimezone() {
  return currentTimezone;
}

// Make functions globally available
window.saveTimezone = saveTimezone;
