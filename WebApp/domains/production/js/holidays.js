// Holiday Management for Master Data
import { showSuccessToast, showErrorToast } from '../../../shared/components/MESToast.js';

let holidaysState = [];

// Ay isimleri
const MONTHS = [
  'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
  'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'
];

// Initialize holidays UI
export async function initHolidaysUI() {
  const container = document.getElementById('holidays-calendar');
  if (!container) return;

  try {
    await loadHolidays();
    renderHolidaysCalendar(container);
  } catch (error) {
    console.error('Holidays load error:', error);
    container.innerHTML = '<div class="hl-text-error">Tatiller yüklenemedi</div>';
  }
}

// Load holidays from API
async function loadHolidays() {
  try {
    const response = await fetch('/api/mes/holidays');
    if (!response.ok) throw new Error('Failed to fetch holidays');
    
    const data = await response.json();
    holidaysState = data.holidays || [];
  } catch (error) {
    console.error('Load holidays error:', error);
    throw error;
  }
}

// Render holidays calendar (2 rows x 6 columns = 12 months)
function renderHolidaysCalendar(container) {
  const currentYear = new Date().getFullYear();
  
  // Group holidays by month
  const holidaysByMonth = {};
  MONTHS.forEach((_, idx) => {
    holidaysByMonth[idx] = [];
  });
  
  holidaysState.forEach(holiday => {
    const startDate = new Date(holiday.startDate);
    const endDate = new Date(holiday.endDate);
    const month = startDate.getMonth();
    if (!holidaysByMonth[month]) holidaysByMonth[month] = [];
    holidaysByMonth[month].push(holiday);
  });
  
  // Generate calendar grid
  let html = `
    <div class="hl-grid-6col">
  `;
  
  MONTHS.forEach((monthName, monthIndex) => {
    const monthHolidays = holidaysByMonth[monthIndex] || [];
    
    html += `
      <div class="month-card" class="hl-card">
        <div class="hl-section-title">
          ${monthName} ${currentYear}
        </div>
        <div class="hl-flex-col">
    `;
    
    if (monthHolidays.length === 0) {
      html += `<div class="hl-day-italic">Tatil yok</div>`;
    } else {
      monthHolidays.forEach(holiday => {
        const startDate = new Date(holiday.startDate);
        const endDate = new Date(holiday.endDate);
        const startDay = startDate.getDate();
        const endDay = endDate.getDate();
        
        // Aynı gün mü kontrol et
        const isSameDay = startDate.toDateString() === endDate.toDateString();
        const dateRange = isSameDay ? startDay : `${startDay}↔${endDay}`;
        
        html += `
          <div class="holiday-item" onclick="editHoliday('${holiday.id}')" class="hl-day-cell" onmouseover="this.style.background='#f3f4f6'" onmouseout="this.style.background='#f9fafb'">
            <span class="hl-day-name">${dateRange}</span>
            <span class="hl-day-note" title="${escapeHtml(holiday.name)}">${escapeHtml(holiday.name)}</span>
          </div>
        `;
      });
    }
    
    html += `
        </div>
      </div>
    `;
  });
  
  html += `</div>`;
  
  container.innerHTML = html;
}

// Open holiday modal (create or edit)
export function openHolidayModal(holidayId = null) {
  const holiday = holidayId ? holidaysState.find(h => h.id === holidayId) : null;
  
  const modalHtml = `
    <div id="holiday-modal" class="hl-modal-overlay" onclick="if(event.target.id==='holiday-modal') closeHolidayModal()">
      <div class="hl-modal" onclick="event.stopPropagation()">
        <h3 class="hl-title">${holiday ? 'Tatil Güncelle' : 'Yeni Tatil Ekle'}</h3>
        
        <form id="holiday-form" onsubmit="saveHoliday(event, '${holidayId || ''}')">
          <div class="pm-mb-16">
            <label class="hl-label">Tatil Adı</label>
            <input type="text" id="holiday-name" value="${holiday ? escapeHtml(holiday.name) : ''}" required placeholder="Örn: Ramazan Bayramı" class="hl-input" />
          </div>
          
          <div class="hl-grid-2col">
            <div>
              <label class="hl-label">Başlangıç</label>
              <input type="datetime-local" id="holiday-start" value="${holiday && holiday.startDate ? holiday.startDate.substring(0, 16) : ''}" required class="hl-input" />
            </div>
            <div>
              <label class="hl-label">Bitiş</label>
              <input type="datetime-local" id="holiday-end" value="${holiday && holiday.endDate ? holiday.endDate.substring(0, 16) : ''}" required class="hl-input" />
            </div>
          </div>
          
          <div class="hl-flex-between">
            <button type="button" onclick="event.stopPropagation(); deleteHolidayFromModal('${holidayId || ''}')" style="padding: 8px 16px; background: white; color: #ef4444; border: 1px solid #ef4444; border-radius: 6px; font-weight: 500; cursor: pointer; ${holidayId ? '' : 'display: none;'}">Sil</button>
            <div class="hl-flex-gap">
              <button type="button" onclick="closeHolidayModal()" class="hl-btn-cancel">İptal</button>
              <button type="submit" class="hl-btn-primary">${holiday ? 'Güncelle' : 'Ekle'}</button>
            </div>
          </div>
        </form>
      </div>
    </div>
  `;
  
  // Remove existing modal if any
  const existingModal = document.getElementById('holiday-modal');
  if (existingModal) existingModal.remove();
  
  // Add modal to body
  document.body.insertAdjacentHTML('beforeend', modalHtml);
}

// Close holiday modal
export function closeHolidayModal() {
  const modal = document.getElementById('holiday-modal');
  if (modal) modal.remove();
}

// Save holiday (create or update)
export async function saveHoliday(event, holidayId) {
  event.preventDefault();
  
  const startDate = document.getElementById('holiday-start').value;
  const endDate = document.getElementById('holiday-end').value;
  const name = document.getElementById('holiday-name').value;
  
  // Validation: end date should be after start date
  if (new Date(endDate) < new Date(startDate)) {
    showErrorToast('Bitiş tarihi başlangıç tarihinden önce olamaz');
    return;
  }
  
  try {
    const method = holidayId ? 'PUT' : 'POST';
    const url = holidayId ? `/api/mes/holidays/${holidayId}` : '/api/mes/holidays';
    
    const response = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        startDate: new Date(startDate).toISOString(), 
        endDate: new Date(endDate).toISOString(), 
        name 
      })
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Tatil kaydedilemedi');
    }
    
    const result = await response.json();
    
    // Update local state
    if (holidayId) {
      const index = holidaysState.findIndex(h => h.id === holidayId);
      if (index !== -1) holidaysState[index] = result.holiday;
    } else {
      holidaysState.push(result.holiday);
    }
    
    // Re-render calendar
    const container = document.getElementById('holidays-calendar');
    if (container) renderHolidaysCalendar(container);
    
    closeHolidayModal();
    showSuccessToast(holidayId ? 'Tatil güncellendi' : 'Tatil eklendi');
  } catch (error) {
    console.error('Save holiday error:', error);
    showErrorToast(error.message || 'Tatil kaydedilemedi');
  }
}

// Edit holiday
export function editHoliday(holidayId) {
  openHolidayModal(holidayId);
}

// Delete holiday
export async function deleteHoliday(holidayId) {
  if (!confirm('Bu tatil silinsin mi?')) return;
  
  try {
    const response = await fetch(`/api/mes/holidays/${holidayId}`, {
      method: 'DELETE'
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Tatil silinemedi');
    }
    
    // Update local state
    holidaysState = holidaysState.filter(h => h.id !== holidayId);
    
    // Re-render calendar
    const container = document.getElementById('holidays-calendar');
    if (container) renderHolidaysCalendar(container);
    
    showSuccessToast('Tatil silindi');
  } catch (error) {
    console.error('Delete holiday error:', error);
    showErrorToast(error.message || 'Tatil silinemedi');
  }
}

// Delete holiday from modal (without confirmation since it's in edit mode)
export async function deleteHolidayFromModal(holidayId) {
  if (!holidayId) return;
  if (!confirm('Bu tatil silinsin mi?')) return;
  
  try {
    const response = await fetch(`/api/mes/holidays/${holidayId}`, {
      method: 'DELETE'
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Tatil silinemedi');
    }
    
    // Update local state
    holidaysState = holidaysState.filter(h => h.id !== holidayId);
    
    // Close modal
    closeHolidayModal();
    
    // Re-render calendar
    const container = document.getElementById('holidays-calendar');
    if (container) renderHolidaysCalendar(container);
    
    showSuccessToast('Tatil silindi');
  } catch (error) {
    console.error('Delete holiday error:', error);
    showErrorToast(error.message || 'Tatil silinemedi');
  }
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Make functions globally available
window.openHolidayModal = openHolidayModal;
window.closeHolidayModal = closeHolidayModal;
window.saveHoliday = saveHoliday;
window.editHoliday = editHoliday;
window.deleteHoliday = deleteHoliday;
window.deleteHolidayFromModal = deleteHolidayFromModal;
