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
    container.innerHTML = '<div style="color:#ef4444;">Tatiller yüklenemedi</div>';
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
    <div style="display: grid; grid-template-columns: repeat(6, 1fr); gap: 12px; margin-bottom: 16px;">
  `;
  
  MONTHS.forEach((monthName, monthIndex) => {
    const monthHolidays = holidaysByMonth[monthIndex] || [];
    
    html += `
      <div class="month-card" style="background: white; border: 1px solid var(--border); border-radius: 8px; padding: 12px; min-height: 120px;">
        <div style="font-weight: 600; font-size: 13px; color: var(--foreground); margin-bottom: 8px; padding-bottom: 6px; border-bottom: 1px solid var(--border);">
          ${monthName} ${currentYear}
        </div>
        <div style="display: flex; flex-direction: column; gap: 4px;">
    `;
    
    if (monthHolidays.length === 0) {
      html += `<div style="font-size: 11px; color: var(--muted-foreground); font-style: italic;">Tatil yok</div>`;
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
          <div class="holiday-item" onclick="editHoliday('${holiday.id}')" style="display: flex; flex-direction: column; padding: 6px 8px; background: #f9fafb; border-radius: 4px; font-size: 11px; cursor: pointer; transition: background 0.2s;" onmouseover="this.style.background='#f3f4f6'" onmouseout="this.style.background='#f9fafb'">
            <span style="font-weight: 600; color: var(--foreground); margin-bottom: 2px;">${dateRange}</span>
            <span style="color: var(--muted-foreground); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${escapeHtml(holiday.name)}">${escapeHtml(holiday.name)}</span>
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
    <div id="holiday-modal" style="display: flex; position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); z-index: 9999; align-items: center; justify-content: center;" onclick="if(event.target.id==='holiday-modal') closeHolidayModal()">
      <div style="background: white; border-radius: 8px; padding: 24px; min-width: 400px; max-width: 500px;" onclick="event.stopPropagation()">
        <h3 style="margin: 0 0 20px; font-size: 18px; font-weight: 600;">${holiday ? 'Tatil Güncelle' : 'Yeni Tatil Ekle'}</h3>
        
        <form id="holiday-form" onsubmit="saveHoliday(event, '${holidayId || ''}')">
          <div style="margin-bottom: 16px;">
            <label style="display: block; margin-bottom: 6px; font-weight: 500; font-size: 13px;">Tatil Adı</label>
            <input type="text" id="holiday-name" value="${holiday ? escapeHtml(holiday.name) : ''}" required placeholder="Örn: Ramazan Bayramı" style="width: 100%; padding: 8px 10px; border: 1px solid var(--border); border-radius: 6px; font-size: 14px;" />
          </div>
          
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px;">
            <div>
              <label style="display: block; margin-bottom: 6px; font-weight: 500; font-size: 13px;">Başlangıç</label>
              <input type="datetime-local" id="holiday-start" value="${holiday && holiday.startDate ? holiday.startDate.substring(0, 16) : ''}" required style="width: 100%; padding: 8px 10px; border: 1px solid var(--border); border-radius: 6px; font-size: 14px;" />
            </div>
            <div>
              <label style="display: block; margin-bottom: 6px; font-weight: 500; font-size: 13px;">Bitiş</label>
              <input type="datetime-local" id="holiday-end" value="${holiday && holiday.endDate ? holiday.endDate.substring(0, 16) : ''}" required style="width: 100%; padding: 8px 10px; border: 1px solid var(--border); border-radius: 6px; font-size: 14px;" />
            </div>
          </div>
          
          <div style="display: flex; gap: 8px; justify-content: space-between; align-items: center;">
            <button type="button" onclick="event.stopPropagation(); deleteHolidayFromModal('${holidayId || ''}')" style="padding: 8px 16px; background: white; color: #ef4444; border: 1px solid #ef4444; border-radius: 6px; font-weight: 500; cursor: pointer; ${holidayId ? '' : 'display: none;'}">Sil</button>
            <div style="display: flex; gap: 8px;">
              <button type="button" onclick="closeHolidayModal()" style="padding: 8px 16px; background: white; color: var(--foreground); border: 1px solid var(--border); border-radius: 6px; font-weight: 500; cursor: pointer;">İptal</button>
              <button type="submit" style="padding: 8px 16px; background: var(--primary); color: white; border: none; border-radius: 6px; font-weight: 500; cursor: pointer;">${holiday ? 'Güncelle' : 'Ekle'}</button>
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
