// View generators (HTML strings)
import { MESData } from './state.js';

// Global state for table column visibility
export const tableState = {
  showMetadataColumns: false
};

export function generateModernDashboard() {
  return `
    <div style="margin-bottom: 24px;">
      <h1 style="font-size: 32px; font-weight: 700; margin-bottom: 8px;">MES Dashboard</h1>
      <p style="margin: 0; font-size: 14px; color: #64748b; line-height: 1.5;">
        Central hub for monitoring production activities, tracking work orders, and managing manufacturing execution. Access real-time production metrics and quick navigation to all system functions.
      </p>
    </div>

    <!-- Quick Actions -->
    <div style="margin-bottom: 24px;">
      <h2 style="font-size: 18px; font-weight: 600; margin-bottom: 16px; color: var(--foreground);">Hızlı Erişim</h2>
      <div class="grid grid-cols-4" style="gap: 16px;">
        <div class="card" style="cursor: pointer; transition: all 0.2s;" onclick="window.location.href='/pages/worker-selection.html'" onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 4px 12px rgba(0,0,0,0.1)'" onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow=''">
          <div class="card-content" style="text-align: center; padding: 24px;">
            <div style="font-size: 48px; margin-bottom: 12px;"><i class="fa-solid fa-hard-hat"></i></div>
            <div style="font-size: 16px; font-weight: 600; color: var(--foreground); margin-bottom: 4px;">İşçi Portalı</div>
            <div style="font-size: 13px; color: var(--muted-foreground);">Görev yönetimi ve takip</div>
          </div>
        </div>
        <div class="card" style="cursor: pointer; transition: all 0.2s;" onclick="navigateToView('plan-designer')" onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 4px 12px rgba(0,0,0,0.1)'" onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow=''">
          <div class="card-content" style="text-align: center; padding: 24px;">
            <div style="font-size: 48px; margin-bottom: 12px;"><i class="fa-solid fa-route"></i></div>
            <div style="font-size: 16px; font-weight: 600; color: var(--foreground); margin-bottom: 4px;">Plan Tasarlayıcı</div>
            <div style="font-size: 13px; color: var(--muted-foreground);">Üretim planı oluştur</div>
          </div>
        </div>
        <div class="card" style="cursor: pointer; transition: all 0.2s;" onclick="navigateToView('approved-quotes')" onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 4px 12px rgba(0,0,0,0.1)'" onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow=''">
          <div class="card-content" style="text-align: center; padding: 24px;">
            <div style="font-size: 48px; margin-bottom: 12px;"><i class="fa-solid fa-clipboard-check"></i></div>
            <div style="font-size: 16px; font-weight: 600; color: var(--foreground); margin-bottom: 4px;">Onaylı Siparişler</div>
            <div style="font-size: 13px; color: var(--muted-foreground);">Sipariş takibi</div>
          </div>
        </div>
        <div class="card" style="cursor: pointer; transition: all 0.2s;" onclick="navigateToView('settings')" onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 4px 12px rgba(0,0,0,0.1)'" onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow=''">
          <div class="card-content" style="text-align: center; padding: 24px;">
            <div style="font-size: 48px; margin-bottom: 12px;"><i class="fa-solid fa-cogs"></i></div>
            <div style="font-size: 16px; font-weight: 600; color: var(--foreground); margin-bottom: 4px;">Master Data</div>
            <div style="font-size: 13px; color: var(--muted-foreground);">Operasyonlar, istasyonlar, işçiler</div>
          </div>
        </div>
      </div>
    </div>

    <!-- System Status Bar -->
    <div class="card" style="margin-bottom: 24px;">
      <div class="card-content" style="padding: 16px 24px;">
        <div style="display: flex; align-items: center; gap: 16px; flex-wrap: wrap;">
          <div class="status-indicator"><div class="status-dot status-online"></div><span>System Online</span></div>
          <div class="status-indicator" id="status-operations"><div class="status-dot status-busy"></div><span>Operations: Loading...</span></div>
          <div class="status-indicator" id="status-stations"><div class="status-dot status-busy"></div><span>Work Stations: Loading...</span></div>
          <div class="status-indicator" id="status-workers"><div class="status-dot status-busy"></div><span>Production Personnel: Loading...</span></div>
          <div class="status-indicator" id="status-plans"><div class="status-dot status-busy"></div><span>Plans: Loading...</span></div>
        </div>
      </div>
    </div>

    <!-- Main Dashboard Widgets Grid -->
    <div class="grid grid-cols-2" style="gap: 16px; margin-bottom: 24px;">
      <!-- Production Plans Widget -->
      <div class="card">
        <div class="card-header">
          <div class="card-title"><i class="fa-solid fa-clipboard-list"></i> Üretim Planları</div>
          <div class="card-description">Aktif ve taslak planlar</div>
        </div>
        <div class="card-content">
          <div id="production-plans-widget" style="padding: 16px;">
            <div style="text-align: center; color: var(--muted-foreground);">Yükleniyor...</div>
          </div>
        </div>
      </div>

      <!-- Station Alerts Widget -->
      <div class="card">
        <div class="card-header">
          <div class="card-title"><i class="fa-solid fa-exclamation-triangle" style="color: #f59e0b;"></i> İstasyon Uyarıları</div>
          <div class="card-description">Son bildirilen hatalar</div>
        </div>
        <div class="card-content">
          <div id="station-alerts-widget" style="padding: 16px;">
            <div style="text-align: center; color: var(--muted-foreground);">Yükleniyor...</div>
          </div>
        </div>
      </div>
    </div>

    <!-- Master Data Overview Grid -->
    <div class="grid grid-cols-3" style="gap: 16px; margin-bottom: 24px;">
      <!-- Operations Overview -->
      <div class="card">
        <div class="card-header">
          <div class="card-title">🔧 Operasyonlar</div>
        </div>
        <div class="card-content">
          <div id="operations-overview-widget" style="padding: 16px;">
            <div style="text-align: center; color: var(--muted-foreground);">Yükleniyor...</div>
          </div>
        </div>
      </div>

      <!-- Work Stations Overview -->
      <div class="card">
        <div class="card-header">
          <div class="card-title"><i class="fa-solid fa-industry"></i> İş İstasyonları</div>
        </div>
        <div class="card-content">
          <div id="stations-overview-widget" style="padding: 16px;">
            <div style="text-align: center; color: var(--muted-foreground);">Yükleniyor...</div>
          </div>
        </div>
      </div>

      <!-- Production Personnel Overview -->
      <div class="card">
        <div class="card-header">
          <div class="card-title"><i class="fa-solid fa-users"></i> Üretim Personeli</div>
        </div>
        <div class="card-content">
          <div id="workers-overview-widget" style="padding: 16px;">
            <div style="text-align: center; color: var(--muted-foreground);">Yükleniyor...</div>
          </div>
        </div>
      </div>
    </div>

    <!-- Active Tasks Widget (Full Width) -->
    <div class="card">
      <div class="card-header">
        <div class="card-title"><i class="fa-solid fa-clipboard-list"></i> Aktif Görevler</div>
        <div class="card-description">Tüm işçilerin görev durumları</div>
      </div>
      <div class="card-content">
        <div id="active-tasks-widget" style="padding: 16px;">
          <div style="text-align: center; color: var(--muted-foreground);">Yükleniyor...</div>
        </div>
      </div>
    </div>
  `;
}

export function generateWorkerPanel() {
  return `
    <div style="margin-bottom: 24px;">
      <h1 style="font-size: 32px; font-weight: 700; margin-bottom: 8px;">Work Packages</h1>
      <p style="margin: 0; font-size: 14px; color: #64748b; line-height: 1.5;">
        Active work package assignments for production personnel. Monitor task progress, manage operations, and track completion status across all manufacturing activities.
      </p>
    </div>

    <div class="mes-filter-bar" style="margin-bottom: 24px;">
      <button id="work-packages-refresh-btn" type="button" class="mes-primary-action is-compact">
        <span>🔄</span>
        <span>Refresh</span>
      </button>
      <div class="mes-filter-controls">
        <input
          type="text"
          id="wp-search-input"
          placeholder="Search WO, customer, plan..."
          class="mes-filter-input is-compact"
        >

        <div id="wp-filter-status" class="mes-filter-group">
          <button id="wp-filter-status-btn" type="button" class="mes-filter-button is-compact" onclick="toggleWPFilterPanel('status')">
            <span>Status</span>
            <span id="wp-filter-status-count" class="mes-filter-count"></span>
            <span class="mes-filter-caret">▾</span>
          </button>
          <div id="wp-filter-status-panel" class="mes-filter-panel is-narrow">
            <div class="mes-filter-panel-header">
              <button id="wp-filter-status-clear" type="button" class="mes-filter-panel-button" onclick="clearWPFilter('status')">Clear</button>
              <button id="wp-filter-status-hide" type="button" title="Close" class="mes-filter-panel-button" onclick="hideWPFilterPanel('status')">×</button>
            </div>
            <div id="wp-filter-status-list" class="mes-filter-panel-content"></div>
          </div>
        </div>

        <div id="wp-filter-workers" class="mes-filter-group">
          <button id="wp-filter-workers-btn" type="button" class="mes-filter-button is-compact" onclick="toggleWPFilterPanel('workers')">
            <span>Production Personnel</span>
            <span id="wp-filter-workers-count" class="mes-filter-count"></span>
            <span class="mes-filter-caret">▾</span>
          </button>
          <div id="wp-filter-workers-panel" class="mes-filter-panel is-wide">
            <div class="mes-filter-panel-header">
              <input id="wp-filter-workers-search" type="text" placeholder="Search production personnel..." class="mes-filter-panel-input" oninput="searchWPFilter('workers', this)">
              <button id="wp-filter-workers-clear" type="button" class="mes-filter-panel-button" onclick="clearWPFilter('workers')">Clear</button>
              <button id="wp-filter-workers-hide" type="button" title="Close" class="mes-filter-panel-button" onclick="hideWPFilterPanel('workers')">×</button>
            </div>
            <div id="wp-filter-workers-list" class="mes-filter-panel-content"></div>
          </div>
        </div>

        <div id="wp-filter-stations" class="mes-filter-group">
          <button id="wp-filter-stations-btn" type="button" class="mes-filter-button is-compact" onclick="toggleWPFilterPanel('stations')">
            <span>Work Stations</span>
            <span id="wp-filter-stations-count" class="mes-filter-count"></span>
            <span class="mes-filter-caret">▾</span>
          </button>
          <div id="wp-filter-stations-panel" class="mes-filter-panel is-wide">
            <div class="mes-filter-panel-header">
              <input id="wp-filter-stations-search" type="text" placeholder="Search stations..." class="mes-filter-panel-input" oninput="searchWPFilter('stations', this)">
              <button id="wp-filter-stations-clear" type="button" class="mes-filter-panel-button" onclick="clearWPFilter('stations')">Clear</button>
              <button id="wp-filter-stations-hide" type="button" title="Close" class="mes-filter-panel-button" onclick="hideWPFilterPanel('stations')">×</button>
            </div>
            <div id="wp-filter-stations-list" class="mes-filter-panel-content"></div>
          </div>
        </div>

        <label id="wp-hide-completed-wrapper" class="mes-filter-toggle is-compact" title="Click to show completed tasks">
          <input type="checkbox" id="wp-hide-completed-toggle" checked>
          <span id="wp-hide-completed-text" style="white-space: nowrap;">Hide Completed</span>
        </label>
        <button id="wp-clear-filters-btn" type="button" class="mes-filter-clear is-compact" onclick="clearAllWPFilters()">
          Clear Filters
        </button>
      </div>
    </div>

    <div style="display: flex; gap: 16px; height: 100vh; max-height: calc(100vh - 280px);">
      <div class="workers-table-panel" style="flex: 1 1 0%; min-width: 300px; display: flex; flex-direction: column; height: auto;">
        <div id="work-packages-widget" class="mes-table-container">
          <table class="mes-table">
            <tbody class="mes-table-body">
              <tr class="mes-table-row is-empty">
                <td class="mes-empty-cell text-center"><em>Yükleniyor...</em></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div class="worker-detail-panel" id="work-package-detail-panel" style="flex: 1 1 0%; min-width: 400px; height: auto; display: none;">
        <div style="background: white; border-radius: 6px; border: 1px solid rgb(229, 231, 235); height: 100%; display: flex; flex-direction: column;">
          <div style="padding: 16px 20px; border-bottom: 1px solid rgb(229, 231, 235); display: flex; justify-content: space-between; align-items: center;">
            <div style="display: flex; align-items: center; gap: 12px;">
              <button title="Detayları Kapat" onclick="closeWorkPackageDetail()" style="padding: 6px 12px; border: 1px solid rgb(209, 213, 219); border-radius: 4px; background: white; color: rgb(55, 65, 81); cursor: pointer; font-size: 12px;">←</button>
              <h3 style="margin: 0px; font-size: 16px; font-weight: 600; color: rgb(17, 24, 39);">Work Package Detayları</h3>
            </div>
          </div>
          <div style="flex: 1 1 0%; overflow: auto; padding: 20px;">
            <div id="work-package-detail-content">
              <div style="text-align: center; color: var(--muted-foreground); padding: 64px;">
                <div style="font-size: 48px; margin-bottom: 16px;"><i class="fa-solid fa-boxes-stacked"></i></div>
                <p>Bir work package seçin</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

export function generateSettings() {
  return `
    <div style="margin-bottom: 24px;">
      <h1 style="font-size: 32px; font-weight: 700; margin-bottom: 8px;">Master Data</h1>
      <p style="margin: 0; font-size: 14px; color: #64748b; line-height: 1.5;">
        Configure fundamental system data including skills, operation types, and production settings. This master data forms the foundation for all production planning and resource management activities.
      </p>
    </div>
    
    <!-- İlk satır: Skills ve Production Settings -->
    <div class="grid grid-cols-2" style="margin-bottom: 24px; grid-template-columns: minmax(280px, 420px) 1fr; align-items: start; gap: 16px;">
      <div class="card">
        <div class="card-header" style="padding: 8px 12px;">
          <div class="card-title" style="font-size: 1.1em;">Skills Management</div>
        </div>
        <div class="card-content" style="padding: 8px 12px;">
          <div id="skills-management"></div>
        </div>
      </div>
      
      <div class="card">
        <div class="card-header" style="padding: 8px 12px;">
          <div class="card-title" style="font-size: 1.1em;">Production Settings</div>
        </div>
        <div class="card-content" style="padding: 8px 12px;">
          <div style="margin-bottom: 16px;">
            <h4 style="font-size: 0.95em; font-weight: 600; margin: 0 0 8px 0; color: var(--foreground);">Operations Management</h4>
            <div id="operations-management"></div>
          </div>
        </div>
      </div>
    </div>

    <!-- İkinci satır: Zaman Yönetimi (tek başına) -->
    <div class="card">
      <div class="card-header" style="padding: 8px 12px;">
        <div class="card-title" style="font-size: 1.1em;">Zaman Yönetimi</div>
      </div>
      <div class="card-content" style="padding: 16px 20px;">
        <div id="shift-schedule" style="display: block;">
          <div style="display:flex; align-items:center; justify-content: space-between; gap:12px; margin-bottom:16px;">
            <div style="display:flex; align-items:center; gap:12px;">
              <h3 style="font-size: 16px; font-weight: 600; margin: 0; color: var(--foreground);">Haftalık Çalışma Programı</h3>
              <span style="font-size: 11px; color: var(--muted-foreground);">( Çalışma: 🟩 , Mola: 🟨 )</span>
            </div>
            <div style="display:flex; align-items:center; gap:8px;">
              <button id="timeline-edit-btn" onclick="startTimelineEdit()" style="background: white; color: var(--foreground); padding: 6px 10px; border: 1px solid var(--border); border-radius: 6px; font-weight: 500; cursor: pointer; font-size: 12px; line-height: 1;">Düzenle</button>
              <button id="timeline-cancel-btn" onclick="stopTimelineEdit()" style="display:none; background: white; color: var(--foreground); padding: 6px 10px; border: 1px solid var(--border); border-radius: 6px; font-weight: 500; cursor: pointer; font-size: 12px; line-height: 1;">İptal</button>
              <button id="timeline-save-btn" onclick="saveTimeManagement()" style="display:none; background: var(--primary); color: var(--primary-foreground); padding: 6px 10px; border: none; border-radius: 6px; font-weight: 600; cursor: pointer; font-size: 12px; line-height: 1;">Çalışma Programını Kaydet</button>
            </div>
          </div>
          <div id="timeline-wrapper" style="position: relative;">
            ${generateWeeklyTimeline('shift')}
            <div id="timeline-edit-overlay" style="position:absolute; inset:0; background: rgba(255,255,255,0.6); z-index: 5;"></div>
          </div>
        </div>

        
      </div>
    </div>

    <!-- Block/Schedule Edit Modal -->
    <div id="schedule-edit-modal" style="display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); z-index: 9999; align-items: center; justify-content: center;">
      <div style="background: white; border-radius: 8px; padding: 20px; max-width: 400px; width: 90%;">
        <h3 style="margin-top: 0; margin-bottom: 16px;">Zaman Bloğu Düzenle</h3>
        
        <div style="margin-bottom: 12px;">
          <label style="display: block; margin-bottom: 4px; font-weight: 600;">Blok Tipi:</label>
          <select id="block-type" style="width: 100%; padding: 8px; border: 1px solid var(--border); border-radius: 4px;">
            <option value="work">Çalışma</option>
            <option value="break">Mola</option>
          </select>
        </div>
        
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px;">
          <div>
            <label style="display: block; margin-bottom: 4px; font-weight: 600;">Başlangıç:</label>
            <input type="time" id="block-start" style="width: 100%; padding: 8px; border: 1px solid var(--border); border-radius: 4px;">
          </div>
          <div>
            <label style="display: block; margin-bottom: 4px; font-weight: 600;">Bitiş:</label>
            <input type="time" id="block-end" style="width: 100%; padding: 8px; border: 1px solid var(--border); border-radius: 4px;">
          </div>
        </div>
        
        <div style="display: flex; gap: 8px; justify-content: flex-end;">
          <button onclick="deleteScheduleBlock()" style="background: #dc2626; color: white; padding: 8px 12px; border: none; border-radius: 4px; cursor: pointer;">Sil</button>
          <button onclick="cancelScheduleEdit()" style="background: var(--border); color: var(--foreground); padding: 8px 12px; border: none; border-radius: 4px; cursor: pointer;">İptal</button>
          <button onclick="saveScheduleBlock()" style="background: var(--primary); color: var(--primary-foreground); padding: 8px 12px; border: none; border-radius: 4px; cursor: pointer;">Kaydet</button>
        </div>
      </div>
    </div>

    <script>
      // Global state for schedule management
      window.scheduleBlocks = {};
      window.currentEditBlock = null;

      // Çalışma tipi değişikliği
      document.querySelectorAll('input[name="work-type"]').forEach(radio => {
        radio.addEventListener('change', function() {
          const fixedSchedule = document.getElementById('fixed-schedule');
          const shiftSchedule = document.getElementById('shift-schedule');
          
          if (this.value === 'fixed') {
            fixedSchedule.style.display = 'block';
            shiftSchedule.style.display = 'none';
          } else {
            fixedSchedule.style.display = 'none';
            shiftSchedule.style.display = 'block';
          }
        });
      });
    </script>
  `;
}

// Generate weekly timeline with vertical time and horizontal days
export function generateWeeklyTimeline(scheduleType) {
  const dayNames = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];
  // Optional idPrefix for avoiding collisions across views
  let idPrefix = '';
  if (arguments.length > 1 && typeof arguments[1] === 'string') {
    idPrefix = arguments[1] || '';
  }
  const dayIds = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].map(id => 
    idPrefix + (scheduleType === 'fixed' ? id : `${scheduleType}-${id}`)
  );
  
  return `
    <div style="border: 1px solid var(--border); border-radius: 8px; background: var(--card); overflow: hidden;">
      <!-- Header with days -->
      <div style="display: grid; grid-template-columns: 60px repeat(7, 1fr); background: var(--muted); border-bottom: 1px solid var(--border);">
        <div style="padding: 8px; font-size: 12px; font-weight: 600; border-right: 1px solid var(--border); display: flex; align-items: center; justify-content: center;">Saat</div>
        ${dayNames.map((day, index) => `
          <div style="padding: 8px; text-align: center; border-right: 1px solid var(--border); ${index === dayNames.length - 1 ? 'border-right: none;' : ''}">
            <div style="font-size: 13px; font-weight: 600;">${day}</div>
          </div>
        `).join('')}
      </div>

      <!-- Lane header row (outside of day columns) -->
      <div class="lanes-header" style="display: grid; grid-template-columns: 60px repeat(7, 1fr); background: var(--muted); border-bottom: 1px solid var(--border);">
        <div style="padding: 4px; border-right: 1px solid var(--border);"></div>
        ${dayIds.map((dayId, index) => `
          <div id="lanes-header-${dayId}" class="lanes-header-cell" style="padding: 4px; border-right: 1px solid var(--border); ${index === dayIds.length - 1 ? 'border-right: none;' : ''}"></div>
        `).join('')}
      </div>
      
      <!-- Timeline grid -->
      <div class="weekly-timeline" style="display: grid; grid-template-columns: 60px repeat(7, 1fr); height: 360px; position: relative;">
        <!-- Hour labels -->
        <div style="background: var(--muted); border-right: 1px solid var(--border); position: relative;">
          ${generateVerticalHourMarks()}
        </div>
        
        <!-- Day columns -->
        ${dayIds.map((dayId, index) => `
          <div id="timeline-${dayId}" class="day-timeline-vertical" 
               style="position: relative; background: white; border-right: 1px solid var(--border); cursor: crosshair; ${index === dayIds.length - 1 ? 'border-right: none;' : ''}"
               data-day="${dayId}">
            <!-- Blocks container -->
            <div id="blocks-${dayId}" style="position: absolute; top: 0; left: 0; right: 0; bottom: 0;">
              <!-- Drag created blocks will be added here -->
            </div>
          </div>
        `).join('')}
      </div>
      
      <!-- Instructions + Lane count -->
      <div style="padding: 8px 12px; background: var(--muted); border-top: 1px solid var(--border); font-size: 11px; color: var(--muted-foreground); display:flex; align-items:center; gap:12px;">
        <div style="display:flex; align-items:center; gap:8px;">
          <span style="font-weight:600; font-size:12px;">Vardiya Sayısı</span>
          <input id="lane-count-input" type="number" min="1" max="7" step="1" value="1" style="width:72px; height:28px; padding:2px 3px; border:1px solid var(--border); border-radius:6px;">
        </div>
        <span>Sürükleyerek zaman bloğu oluşturun • Blokları tıklayarak düzenleyin</span>
      </div>
    </div>
  `;
}

// Generate vertical hour marks (0-24) with compressed spacing
function generateVerticalHourMarks() {
  let marks = '';
  for (let i = 0; i <= 24; i += 2) {
    // Evenly distribute 0:00..24:00 across full height
    const percentage = (i / 24) * 100;
    const translate = (i === 0) ? 'translateY(0)' : (i === 24 ? 'translateY(-100%)' : 'translateY(-50%)');
    marks += `<div style="position: absolute; top: ${percentage}%; left: 0; right: 0; height: 1px; background: var(--border);"></div>`;
    marks += `<div style="position: absolute; top: ${percentage}%; transform: ${translate}; left: 4px; font-size: 10px; color: var(--muted-foreground); background: var(--muted); padding: 0 4px;">${i}:00</div>`;
  }
  return marks;
}

// Generate time grid lines for day columns with compressed spacing
function generateTimeGridLines() {
  let lines = '';
  for(let i = 0; i <= 24; i += 2) {
    // Compress the spacing by 25% (multiply by 0.75)
    const percentage = ((i / 24) * 100) * 0.75;
    lines += `<div style="position: absolute; top: ${percentage}%; left: 0; right: 0; height: 1px; background: var(--border); opacity: 0.3;"></div>`;
  }
  return lines;
}

export function generateWorkers() {
  return `
    <div style="margin-bottom: 24px;">
      <h1 style="font-size: 32px; font-weight: 700; margin-bottom: 8px;">Production Personnel Management</h1>
      <p style="margin: 0; font-size: 14px; color: #64748b; line-height: 1.5;">
        Manage production personnel, their skills, operations assignments, and work station capabilities. Add new personnel, define their expertise areas, and track their availability for production tasks.
      </p>
    </div>
    <div class="workers-filter-compact mes-filter-bar" style="margin-bottom: 24px;">
      <button onclick="openAddWorkerModal()" class="worker-add-button mes-primary-action is-compact">+ Add Production Personnel</button>
      <div class="mes-filter-controls">
        <input id="worker-filter-search" type="text" placeholder="Search production personnel..." class="worker-filter-input mes-filter-input is-compact">

        <div id="worker-filter-skills" class="mes-filter-group">
          <button id="worker-filter-skills-btn" type="button" class="worker-filter-button mes-filter-button is-compact">
            <span>Skills</span>
            <span id="worker-filter-skills-count" class="mes-filter-count"></span>
            <span class="mes-filter-caret">▾</span>
          </button>
          <div id="worker-filter-skills-panel" class="mes-filter-panel is-wide">
            <div class="mes-filter-panel-header">
              <input id="worker-filter-skills-search" type="text" placeholder="Search skills..." class="worker-filter-panel-input mes-filter-panel-input">
              <button id="worker-filter-skills-clear" type="button" class="worker-filter-panel-button mes-filter-panel-button">Clear</button>
              <button id="worker-filter-skills-hide" type="button" title="Kapat" class="worker-filter-panel-button mes-filter-panel-button">×</button>
            </div>
            <div id="worker-filter-skills-list" class="mes-filter-panel-content"></div>
          </div>
        </div>

        <div id="worker-filter-status" class="mes-filter-group">
          <button id="worker-filter-status-btn" type="button" class="worker-filter-button mes-filter-button is-compact">
            <span>Status</span>
            <span id="worker-filter-status-count" class="mes-filter-count"></span>
            <span class="mes-filter-caret">▾</span>
          </button>
          <div id="worker-filter-status-panel" class="mes-filter-panel is-narrow">
            <div class="mes-filter-panel-header" style="justify-content: flex-end;">
              <button id="worker-filter-status-clear" type="button" class="worker-filter-panel-button mes-filter-panel-button">Clear</button>
              <button id="worker-filter-status-hide" type="button" title="Kapat" class="worker-filter-panel-button mes-filter-panel-button">×</button>
            </div>
            <div id="worker-filter-status-list" class="mes-filter-panel-content"></div>
          </div>
        </div>

        <label class="worker-filter-conflict mes-filter-toggle is-compact">
          <input id="worker-filter-conflict" type="checkbox">
          <span>Has conflict</span>
        </label>

        <button id="worker-filter-clear-all" type="button" title="Tüm filtreleri temizle" class="worker-filter-button worker-clear-all-button mes-filter-clear is-compact" style="display: none;">
          Clear All
        </button>
      </div>
    </div>
    
    <section class="workers-table">
      <div style="padding: 0px;">
        <div class="workers-container" style="display: flex; gap: 20px; height: calc(-200px + 100vh); flex-direction: row;">
          <div class="workers-table-panel" style="flex: 1 1 0%; min-width: 300px; display: flex; flex-direction: column; height: auto;">
            <div class="workers-table">
              <div class="mes-table-container">
                  <table id="workers-table" class="mes-table">
                    <thead class="mes-table-header">
                      <tr>
                        <th class="worker-name-column" style="min-width: 160px;">
                          <button type="button" class="mes-sort-button">
                            Name <span class="mes-sort-icon">↕</span>
                          </button>
                        </th>
                        <th class="worker-skills-column" style="min-width: 140px;">
                          <button type="button" class="mes-sort-button">
                            Skills <span class="mes-sort-icon">↕</span>
                          </button>
                        </th>
                        <th class="worker-status-column text-center" style="min-width: 100px; text-align: center;">
                          <button type="button" class="mes-sort-button">
                            Status <span class="mes-sort-icon">↕</span>
                          </button>
                        </th>
                      </tr>
                    </thead>
                    <tbody id="workers-table-body" class="mes-table-body">
                      <tr class="mes-table-row is-empty">
                        <td colspan="3" class="mes-empty-cell text-center"><em>Loading workers...</em></td>
                      </tr>
                    </tbody>
                  </table>
              </div>
            </div>
          </div>
          
          <div class="worker-detail-panel" id="worker-detail-panel" style="flex: 1 1 0%; min-width: 400px; height: auto; display: none;">
            <div style="background: white; border-radius: 6px; border: 1px solid rgb(229, 231, 235); height: 100%; display: flex; flex-direction: column;">
              <div style="padding: 16px 20px; border-bottom: 1px solid rgb(229, 231, 235); display: flex; justify-content: space-between; align-items: center;">
                <div style="display: flex; align-items: center; gap: 12px;">
                  <button title="Detayları Kapat" onclick="closeWorkerDetail()" style="padding: 6px 12px; border: 1px solid rgb(209, 213, 219); border-radius: 4px; background: white; color: rgb(55, 65, 81); cursor: pointer; font-size: 12px;">←</button>
                  <h3 style="margin: 0px; font-size: 16px; font-weight: 600; color: rgb(17, 24, 39);">Çalışan Detayları</h3>
                </div>
                <div style="display: flex; gap: 8px; align-items: center;">
                  <button onclick="editWorkerFromDetail()" style="padding: 6px 12px; border: 1px solid rgb(209, 213, 219); border-radius: 4px; background: white; color: rgb(55, 65, 81); cursor: pointer; font-size: 12px;"><i class="fa-solid fa-edit"></i> Düzenle</button>
                  <button onclick="deleteWorkerFromDetail()" style="padding: 6px 12px; border: 1px solid rgb(220, 38, 38); border-radius: 4px; background: white; color: rgb(220, 38, 38); cursor: pointer; font-size: 12px;"><i class="fa-solid fa-trash"></i> Sil</button>
                </div>
              </div>
              <div style="flex: 1 1 0%; overflow: auto; padding: 20px;">
                <div id="worker-detail-content">
                  <!-- Worker details will be populated here -->
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <div id="worker-modal" style="display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); z-index: 1000;" onclick="closeWorkerModal(event)">
      <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); background: white; border-radius: 8px; padding: 0; width: 560px; max-height: 80vh; overflow: hidden;" onclick="event.stopPropagation()">
        <div style="padding: 16px 20px; border-bottom: 1px solid var(--border);">
          <h3 id="worker-modal-title" style="margin: 0; font-size: 18px;">Add New Worker</h3>
        </div>
        <div style="padding: 16px 20px; background: rgb(249, 250, 251); max-height: calc(80vh - 120px); overflow-y: auto;">
          <!-- Temel Bilgiler -->
          <div style="margin-bottom: 16px; padding: 12px; background: white; border-radius: 6px; border: 1px solid var(--border);">
            <h3 style="margin: 0 0 12px; font-size: 14px; font-weight: 600; color: rgb(17, 24, 39); border-bottom: 1px solid var(--border); padding-bottom: 6px;">Temel Bilgiler</h3>
            <div class="detail-item" style="display: flex; align-items: center; margin-bottom: 8px;">
              <span class="detail-label" style="font-weight: 600; font-size: 12px; color: rgb(55, 65, 81); min-width: 120px; margin-right: 8px;">İsim:</span>
              <input type="text" id="worker-name" placeholder="İsim" style="flex: 1 1 0%; padding: 6px 8px; border: 1px solid rgb(209, 213, 219); border-radius: 4px; font-size: 12px; background: white;" />
            </div>
            <div class="detail-item" style="display: flex; align-items: center; margin-bottom: 0;">
              <span class="detail-label" style="font-weight: 600; font-size: 12px; color: rgb(55, 65, 81); min-width: 120px; margin-right: 8px;">Email:</span>
              <input type="email" id="worker-email" placeholder="email@domain.com" style="flex: 1 1 0%; padding: 6px 8px; border: 1px solid rgb(209, 213, 219); border-radius: 4px; font-size: 12px; background: white;" />
            </div>
            <div class="detail-item" style="display: flex; align-items: center; margin-top: 8px;">
              <span class="detail-label" style="font-weight: 600; font-size: 12px; color: rgb(55, 65, 81); min-width: 120px; margin-right: 8px;">Telefon:</span>
              <input type="tel" id="worker-phone" placeholder="örn. +90 555 555 55 55" style="flex: 1 1 0%; padding: 6px 8px; border: 1px solid rgb(209, 213, 219); border-radius: 4px; font-size: 12px; background: white;" />
            </div>
          </div>

          <!-- Yetenekler -->
          <div style="margin-bottom: 16px; padding: 12px; background: white; border-radius: 6px; border: 1px solid var(--border);">
            <h3 style="margin: 0 0 12px; font-size: 14px; font-weight: 600; color: rgb(17, 24, 39); border-bottom: 1px solid var(--border); padding-bottom: 6px;">Yetenekler</h3>
            <div class="detail-item" style="display: block;">
              <select id="worker-skills" multiple></select>
            </div>
          </div>

          <!-- Çalışma Saatleri Ayarı -->
          <div style="margin-bottom: 0; padding: 12px; background: white; border-radius: 6px; border: 1px solid var(--border);">
            <h3 style="margin: 0 0 12px; font-size: 14px; font-weight: 600; color: rgb(17, 24, 39); border-bottom: 1px solid var(--border); padding-bottom: 6px;">Çalışma Saatleri</h3>
            <div class="detail-item" style="display: flex; align-items: center; margin-bottom: 0;">
              <span class="detail-label" style="font-weight: 600; font-size: 12px; color: rgb(55, 65, 81); min-width: 120px; margin-right: 8px;">Zaman Kaynağı:</span>
              <select id="worker-time-source" style="flex: 1 1 0%; padding: 6px 8px; border: 1px solid rgb(209, 213, 219); border-radius: 4px; font-size: 12px; background: white; max-width: 200px;">
                <option value="company" selected>Şirket Genel Ayarları</option>
                <option value="personal">Kişisel Ayar</option>
              </select>
            </div>
          </div>
        </div>
        <div style="padding: 12px 20px; border-top: 1px solid var(--border); display: flex; align-items: center; justify-content: space-between;">
          <div>
            <button id="worker-delete-btn" style="display: none; padding: 8px 16px; background: white; border: 1px solid #ef4444; color: #ef4444; border-radius: 4px; cursor: pointer;">Delete</button>
          </div>
          <div style="display: flex; gap: 8px;">
            <button onclick="closeWorkerModal()" style="padding: 8px 16px; background: white; border: 1px solid var(--border); border-radius: 4px; cursor: pointer;">Cancel</button>
            <button onclick="saveWorker()" style="padding: 8px 16px; background: var(--primary); color: white; border: none; border-radius: 4px; cursor: pointer;">Save</button>
          </div>
        </div>
      </div>
    </div>

    <!-- Worker Schedule Modal -->
    <div id="worker-schedule-modal" style="display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); z-index: 1000; align-items: center; justify-content: center;" onclick="closeWorkerScheduleModal(event)">
      <div style="position: relative; background: white; border-radius: 8px; padding: 0; width: 820px; max-width: 95vw; max-height: 86vh; overflow: hidden;" onclick="event.stopPropagation()">
        <div style="padding: 14px 18px; border-bottom: 1px solid var(--border); display: flex; align-items: center; justify-content: space-between;">
          <h3 style="margin: 0; font-size: 16px; font-weight: 600;">Çalışma Saatleri</h3>
          <button onclick="closeWorkerScheduleModal()" style="padding: 6px 10px; border: 1px solid var(--border); border-radius: 4px; background: white; cursor: pointer;">✕</button>
        </div>
        <div style="padding: 14px 18px; background: #f9fafb; max-height: calc(86vh - 102px); overflow-y: auto;">
          <!-- Mode selection -->
          <div style="margin-bottom: 12px;">
            <label style="display: block; font-weight: 600; margin-bottom: 8px; font-size: 14px;">Zaman Kaynağı</label>
            <div style="display: flex; gap: 16px; align-items: center;">
              <label style="display: flex; align-items: center; gap: 6px; cursor: pointer;">
                <input type="radio" name="worker-schedule-mode" value="company" checked onchange="handleWorkerScheduleModeChange('company')" />
                <span>Şirket Genel Ayarlarını Kullan</span>
              </label>
              <label style="display: flex; align-items: center; gap: 6px; cursor: pointer;">
                <input type="radio" name="worker-schedule-mode" value="personal" onchange="handleWorkerScheduleModeChange('personal')" />
                <span>Kişisel Ayar Kullan</span>
              </label>
            </div>
          </div>

          <!-- Company settings section -->
          <div id="worker-schedule-company" style="display: block; margin-bottom: 16px; padding: 12px; background: white; border: 1px solid var(--border); border-radius: 8px;">
            <div style="font-size: 12px; color: var(--muted-foreground); margin-bottom: 8px;">Bu çalışan için şirketin zaman yönetimi ayarları uygulanır.</div>
            <div class="detail-item" style="display: flex; align-items: center;">
              <span class="detail-label" style="font-weight: 600; font-size: 12px; color: rgb(55, 65, 81); min-width: 120px; margin-right: 8px;">Vardiya No:</span>
              <select id="worker-schedule-shift-no" style="flex: 0 0 160px; padding: 6px 8px; border: 1px solid var(--border); border-radius: 4px; font-size: 12px; background: white;">
                <option value="1">1</option>
                <option value="2">2</option>
                <option value="3">3</option>
                <option value="4">4</option>
                <option value="5">5</option>
                <option value="6">6</option>
                <option value="7">7</option>
              </select>
              <span style="margin-left: 8px; font-size: 11px; color: var(--muted-foreground);">Eğer vardiyalı çalışıyorsa seçiniz.</span>
            </div>
          </div>

          <!-- Personal settings section -->
          <div id="worker-schedule-personal" style="display: none;">
            <h3 style="font-size: 14px; font-weight: 600; margin: 0 0 10px; color: var(--foreground);">Kişisel Haftalık Çalışma Programı</h3>
            ${generateWeeklyTimeline('fixed', 'worker-')}
          </div>
        </div>
        <div style="padding: 10px 16px; border-top: 1px solid var(--border); display: flex; align-items: center; justify-content: flex-end; gap: 8px;">
          <button onclick="closeWorkerScheduleModal()" style="padding: 8px 14px; background: white; border: 1px solid var(--border); border-radius: 4px; cursor: pointer;">Vazgeç</button>
          <button onclick="saveWorkerSchedule()" style="padding: 8px 14px; background: var(--primary); color: var(--primary-foreground); border: none; border-radius: 4px; cursor: pointer;">Kaydet</button>
        </div>
      </div>
    </div>

    <!-- Block/Schedule Edit Modal (used inside schedule editors) -->
    <div id="schedule-edit-modal" style="display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); z-index: 9999; align-items: center; justify-content: center;">
      <div style="background: white; border-radius: 8px; padding: 20px; max-width: 400px; width: 90%;">
        <h3 style="margin-top: 0; margin-bottom: 16px;">Zaman Bloğu Düzenle</h3>
        
        <div style="margin-bottom: 12px;">
          <label style="display: block; margin-bottom: 4px; font-weight: 600;">Blok Tipi:</label>
          <select id="block-type" style="width: 100%; padding: 8px; border: 1px solid var(--border); border-radius: 4px;">
            <option value="work">Çalışma</option>
            <option value="break">Mola</option>
          </select>
        </div>
        
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px;">
          <div>
            <label style="display: block; margin-bottom: 4px; font-weight: 600;">Başlangıç:</label>
            <input type="time" id="block-start" style="width: 100%; padding: 8px; border: 1px solid var(--border); border-radius: 4px;">
          </div>
          <div>
            <label style="display: block; margin-bottom: 4px; font-weight: 600;">Bitiş:</label>
            <input type="time" id="block-end" style="width: 100%; padding: 8px; border: 1px solid var(--border); border-radius: 4px;">
          </div>
        </div>
        
        <div style="display: flex; justify-content: space-between; gap: 8px;">
          <button onclick="deleteScheduleBlock()" style="padding: 8px 16px; background: white; border: 1px solid #ef4444; color: #ef4444; border-radius: 4px; cursor: pointer;">Sil</button>
          <div style="display: flex; gap: 8px;">
            <button onclick="cancelScheduleEdit()" style="padding: 8px 16px; background: white; border: 1px solid var(--border); border-radius: 4px; cursor: pointer;">Vazgeç</button>
            <button onclick="saveScheduleBlock()" style="padding: 8px 16px; background: var(--primary); color: white; border: none; border-radius: 4px; cursor: pointer;">Kaydet</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

export function generateOperations() {
  return `
    <div style="margin-bottom: 24px;">
      <h1 style="font-size: 32px; font-weight: 700; margin-bottom: 8px;">Operations Management</h1>
      <p style="margin: 0; font-size: 14px; color: #64748b; line-height: 1.5;">
        Define and manage production operations including machining, welding, assembly, and quality control processes. Configure required skills, estimated time, and station requirements for each operation type.
      </p>
    </div>

    <div class="operations-filter-compact mes-filter-bar" style="margin-bottom: 24px;">
      <button onclick="openAddOperationModal()" class="operation-add-button mes-primary-action is-compact">+ Add Operation</button>
      <div class="mes-filter-controls">
        <input id="operation-filter-search" type="text" placeholder="Search operations..." class="operation-filter-input mes-filter-input is-compact">

        <div id="operation-filter-skills" class="mes-filter-group">
          <button id="operation-filter-skills-btn" type="button" class="operation-filter-button mes-filter-button is-compact">
            <span>Skills</span>
            <span id="operation-filter-skills-count" class="mes-filter-count"></span>
            <span class="mes-filter-caret">▾</span>
          </button>
          <div id="operation-filter-skills-panel" class="mes-filter-panel is-wide">
            <div class="mes-filter-panel-header">
              <input id="operation-filter-skills-search" type="text" placeholder="Search skills..." class="operation-filter-panel-input mes-filter-panel-input">
              <button id="operation-filter-skills-clear" type="button" class="operation-filter-panel-button mes-filter-panel-button">Clear</button>
              <button id="operation-filter-skills-hide" type="button" title="Kapat" class="operation-filter-panel-button mes-filter-panel-button">×</button>
            </div>
            <div id="operation-filter-skills-list" class="mes-filter-panel-content"></div>
          </div>
        </div>

        <button id="operation-filter-clear-all" type="button" title="Tüm filtreleri temizle" class="operation-filter-button operation-clear-all-button mes-filter-clear is-compact" style="display: none;">
          Clear All
        </button>
      </div>
    </div>

    <section class="workers-table">
      <div style="padding: 0px;">
        <div class="workers-container" style="display: flex; gap: 20px; height: auto; flex-direction: row;">
          <div class="workers-table-panel" style="flex: 1 1 0%; min-width: 300px; display: flex; flex-direction: column; height: auto;">
            <div class="workers-table">
              <div class="mes-table-container">
                <table id="operations-table" class="mes-table">
                  <thead class="mes-table-header">
                    <tr>
                      <th style="min-width: 200px;">
                        <button type="button" class="mes-sort-button">
                          Name <span class="mes-sort-icon">↕</span>
                        </button>
                      </th>
                      <th style="min-width: 160px;">
                        <div style="display: flex; align-items: center; gap: 8px;">
                          <button type="button" class="mes-sort-button">
                            Type <span class="mes-sort-icon">↕</span>
                          </button>
                          <button type="button" title="Manage Operation Types" onclick="openOperationTypesModal()" style="padding: 0px 3px; border: 1px solid var(--border); background: white; border-radius: 4px; cursor: pointer; font-size: 12px;">Manage</button>
                        </div>
                      </th>
                      <th style="min-width: 110px; text-align: center;">
                        <button type="button" class="mes-sort-button">
                          Output Code <span class="mes-sort-icon">↕</span>
                        </button>
                      </th>
                      <th style="min-width: 85px; text-align: center;" class="text-center">
                        <button type="button" class="mes-sort-button">
                          Fire (%) <span class="mes-sort-icon">↕</span>
                        </button>
                      </th>
                      <th style="min-width: 160px;">
                        <button type="button" class="mes-sort-button">
                          Skills <span class="mes-sort-icon">↕</span>
                        </button>
                      </th>
                    </tr>
                  </thead>
                  <tbody id="operations-table-body" class="mes-table-body">
                    <tr class="mes-table-row is-empty">
                      <td colspan="5" class="mes-empty-cell text-center"><em>Loading operations...</em></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
          <div class="worker-detail-panel" id="operation-detail-panel" style="flex: 1 1 0%; min-width: 400px; height: auto; display: none;">
            <div style="background: white; border-radius: 6px; border: 1px solid rgb(229, 231, 235); height: 100%; display: flex; flex-direction: column;">
              <div style="padding: 16px 20px; border-bottom: 1px solid rgb(229, 231, 235); display: flex; justify-content: space-between; align-items: center;">
                <div style="display: flex; align-items: center; gap: 12px;">
                  <button title="Detayları Kapat" onclick="closeOperationDetail()" style="padding: 6px 12px; border: 1px solid rgb(209, 213, 219); border-radius: 4px; background: white; color: rgb(55, 65, 81); cursor: pointer; font-size: 12px;">←</button>
                  <h3 style="margin: 0px; font-size: 16px; font-weight: 600; color: rgb(17, 24, 39);">Operasyon Detayları</h3>
                </div>
                <div style="display:flex; align-items:center; gap:8px;">
                  <button onclick="editOperationFromDetail()" style="padding: 6px 12px; border: 1px solid rgb(209, 213, 219); border-radius: 4px; background: white; color: rgb(55, 65, 81); cursor: pointer; font-size: 12px;"><i class="fa-solid fa-edit"></i> Düzenle</button>
                  <button onclick="deleteOperationFromDetail()" style="padding: 6px 12px; border: 1px solid rgb(220, 38, 38); border-radius: 4px; background: white; color: rgb(220, 38, 38); cursor: pointer; font-size: 12px;"><i class="fa-solid fa-trash"></i> Sil</button>
                </div>
              </div>
              <div style="flex: 1 1 0%; overflow: auto; padding: 20px;">
                <div id="operation-detail-content"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <div id=\"operation-modal\" style=\"display:none; position:fixed; inset:0; background:rgba(0,0,0,0.5); z-index:1000;\" onclick=\"closeOperationModal(event)\">
      <div style=\"position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); background: white; border-radius: 8px; padding: 0; width: 560px; max-height: 80vh; overflow: hidden;\" onclick=\"event.stopPropagation()\">
        <div style=\"padding: 16px 20px; border-bottom: 1px solid var(--border);\">
          <h3 id=\"operation-modal-title\" style=\"margin: 0; font-size: 18px;\">Add New Operation</h3>
        </div>
        <div style=\"padding: 16px 20px; background: rgb(249, 250, 251); max-height: calc(80vh - 120px); overflow-y: auto;\">
          <!-- Temel Bilgiler -->
          <div style=\"margin-bottom: 16px; padding: 12px; background: white; border-radius: 6px; border: 1px solid var(--border);\">
            <h3 style=\"margin: 0 0 12px; font-size: 14px; font-weight: 600; color: rgb(17, 24, 39); border-bottom: 1px solid var(--border); padding-bottom: 6px;\">Temel Bilgiler</h3>
            <div class=\"detail-item\" style=\"display: flex; align-items: center; margin-bottom: 8px;\">
              <span class=\"detail-label\" style=\"font-weight: 600; font-size: 12px; color: rgb(55, 65, 81); min-width: 120px; margin-right: 8px;\">İsim:</span>
              <input type=\"text\" id=\"operation-name\" placeholder=\"Operasyon adı\" style=\"flex: 1 1 0%; padding: 6px 8px; border: 1px solid rgb(209, 213, 219); border-radius: 4px; font-size: 12px; background: white;\">
            </div>
            <div class=\"detail-item\" style=\"display: flex; align-items: center; margin-bottom: 8px;\">
              <span class=\"detail-label\" style=\"font-weight: 600; font-size: 12px; color: rgb(55, 65, 81); min-width: 120px; margin-right: 8px;\">Type:</span>
              <div style=\"position: relative; flex: 1 1 0%;\">
                <input id=\"operation-type\" type=\"text\" placeholder=\"Select or type operation type...\" style=\"width: 100%; padding: 6px 28px 6px 8px; border: 1px solid rgb(209, 213, 219); border-radius: 4px; font-size: 12px; background: white;\" autocomplete=\"off\" />
                <button type=\"button\" onclick=\"toggleOperationTypeDropdown()\" style=\"position: absolute; right: 8px; top: 50%; transform: translateY(-50%); background: none; border: none; cursor: pointer; padding: 2px; font-size: 10px;\">▾</button>
                <div id=\"operation-type-dropdown\" style=\"display: none; position: absolute; top: 100%; left: 0; right: 0; background: white; border: 1px solid var(--border); border-top: none; border-radius: 0 0 6px 6px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); z-index: 1001; max-height: 200px; overflow-y: auto;\">
                  <div style=\"padding: 8px; color: var(--muted-foreground); font-size: 12px;\">Loading...</div>
                </div>
              </div>
            </div>
            <div class=\"detail-item\" style=\"display: flex; align-items: flex-start; margin-bottom: 8px;\">
              <span class=\"detail-label\" style=\"font-weight: 600; font-size: 12px; color: rgb(55, 65, 81); min-width: 120px; margin-right: 8px; margin-top: 6px;\">Çıktı Kodu:</span>
              <div style=\"flex: 1 1 0%;\">
                <input id=\"operation-output-code\" type=\"text\" placeholder=\"Örn. A, Qc (1-2 harf)\" style=\"width: 100%; padding: 6px 8px; border: 1px solid rgb(209, 213, 219); border-radius: 4px; font-size: 12px; background: white;\" />
                <div style=\"margin-top: 4px; font-size: 11px; color: var(--muted-foreground);\">1-2 harf: İlk büyük, ikinci küçük. 'M' tek başına kullanılamaz; örn. Mq.</div>
              </div>
            </div>
            <div class=\"detail-item\" style=\"display: flex; align-items: flex-start; margin-bottom: 8px;\">
              <span class=\"detail-label\" style=\"font-weight: 600; font-size: 12px; color: rgb(55, 65, 81); min-width: 120px; margin-right: 8px; margin-top: 6px;\">Fire Oranı (%):</span>
              <div style=\"flex: 1 1 0%;\">
                <input id=\"operation-defect-rate\" type=\"number\" min=\"0\" step=\"0.1\" placeholder=\"0\" style=\"width: 100%; padding: 6px 8px; border: 1px solid rgb(209, 213, 219); border-radius: 4px; font-size: 12px; background: white;\" />
                <div style=\"margin-top: 4px; font-size: 11px; color: var(--muted-foreground);\">Beklenen hata/fire oranı (örn: 1.5 = %1.5). Malzeme rezervasyonu hesaplamalarında kullanılır.</div>
              </div>
            </div>
            <div class=\"detail-item\" style=\"display: flex; align-items: flex-start; margin-bottom: 0;\">
              <span class=\"detail-label\" style=\"font-weight: 600; font-size: 12px; color: rgb(55, 65, 81); min-width: 120px; margin-right: 8px; margin-top: 6px;\">Varsayılan Verimlilik (%):</span>
              <div style=\"flex: 1 1 0%;\">
                <input id=\"operation-efficiency\" type=\"number\" min=\"1\" max=\"100\" step=\"1\" value=\"100\" placeholder=\"100\" style=\"width: 100%; padding: 6px 8px; border: 1px solid rgb(209, 213, 219); border-radius: 4px; font-size: 12px; background: white;\" />
                <div style=\"margin-top: 4px; font-size: 11px; color: var(--muted-foreground);\">Bu operasyonun varsayılan verimlilik oranı (100% = normal, 80% = daha yavaş)</div>
              </div>
            </div>
          </div>

          <!-- Yetenekler -->
          <div id=\"operation-skills-box\"></div>

          <!-- Kalite Kontrol -->
          <div style=\"display: none;\">
            <h3 style=\"margin: 0 0 12px; font-size: 14px; font-weight: 600; color: rgb(17, 24, 39); border-bottom: 1px solid var(--border); padding-bottom: 6px;\">Kalite Kontrol</h3>
            <div class=\"detail-item\" style=\"display: flex; align-items: center; margin-bottom: 0;\">
              <label style=\"display: flex; align-items: center; gap: 8px; font-size: 12px; color: rgb(55, 65, 81); cursor: pointer;\">
                <input id=\"operation-qc\" type=\"checkbox\" style=\"margin: 0;\">
                Quality Check Required
              </label>
            </div>
          </div>
        </div>
        <div style=\"padding: 12px 20px; border-top: 1px solid var(--border); display: flex; align-items: center; justify-content: space-between;\">
          <div>
            <button id=\"operation-delete-btn\" style=\"display: none; padding: 8px 16px; background: white; border: 1px solid #ef4444; color: #ef4444; border-radius: 4px; cursor: pointer;\">Delete</button>
          </div>
          <div style=\"display: flex; gap: 8px;\">
            <button onclick=\"closeOperationModal()\" style=\"padding: 8px 16px; background: white; border: 1px solid var(--border); border-radius: 4px; cursor: pointer;\">Cancel</button>
            <button onclick=\"saveOperation()\" style=\"padding: 8px 16px; background: var(--primary); color: white; border: none; border-radius: 4px; cursor: pointer;\">Save</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

export function generateStations() {
  return `
    <div style="margin-bottom: 24px;">
      <h1 style="font-size: 32px; font-weight: 700; margin-bottom: 8px;">Work Stations Management</h1>
      <p style="margin: 0; font-size: 14px; color: #64748b; line-height: 1.5;">
        Configure and manage production work stations including CNC machines, welding stations, and assembly areas. Define station capacity, operational status, and technical specifications for optimal resource planning.
      </p>
    </div>

    <div class="mes-filter-bar" style="margin-bottom: 24px;">
      <button onclick="openAddStationModal()" class="mes-primary-action is-compact">+ Add Work Station</button>
      <button onclick="resetAllStations()" class="mes-secondary-action is-compact" style="background: #f59e0b; color: white; margin-left: 8px;" title="TEST: Tüm alt istasyonların currentOperation'ını temizle">🔧 Reset Substations (TEST)</button>
      <div class="mes-filter-controls">
        <input id="station-filter-search" type="text" placeholder="Search work stations..." class="mes-filter-input is-compact">

        <div id="station-filter-status" class="mes-filter-group">
          <button id="station-filter-status-btn" type="button" class="mes-filter-button is-compact">
            <span>Status</span>
            <span id="station-filter-status-count" class="mes-filter-count"></span>
            <span class="mes-filter-caret">▾</span>
          </button>
          <div id="station-filter-status-panel" class="mes-filter-panel is-narrow">
            <div class="mes-filter-panel-header" style="justify-content: flex-end;">
              <button id="station-filter-status-clear" type="button" class="mes-filter-panel-button">Clear</button>
              <button id="station-filter-status-hide" type="button" title="Kapat" class="mes-filter-panel-button">×</button>
            </div>
            <div id="station-filter-status-list" class="mes-filter-panel-content"></div>
          </div>
        </div>

        <div id="station-filter-skills" class="mes-filter-group">
          <button id="station-filter-skills-btn" type="button" class="mes-filter-button is-compact">
            <span>Skills</span>
            <span id="station-filter-skills-count" class="mes-filter-count"></span>
            <span class="mes-filter-caret">▾</span>
          </button>
          <div id="station-filter-skills-panel" class="mes-filter-panel is-wide">
            <div class="mes-filter-panel-header">
              <input id="station-filter-skills-search" type="text" placeholder="Search skills..." class="mes-filter-panel-input">
              <button id="station-filter-skills-clear" type="button" class="mes-filter-panel-button">Clear</button>
              <button id="station-filter-skills-hide" type="button" title="Kapat" class="mes-filter-panel-button">×</button>
            </div>
            <div id="station-filter-skills-list" class="mes-filter-panel-content"></div>
          </div>
        </div>

        <div id="station-filter-operations" class="mes-filter-group">
          <button id="station-filter-operations-btn" type="button" class="mes-filter-button is-compact">
            <span>Operations</span>
            <span id="station-filter-operations-count" class="mes-filter-count"></span>
            <span class="mes-filter-caret">▾</span>
          </button>
          <div id="station-filter-operations-panel" class="mes-filter-panel is-wide">
            <div class="mes-filter-panel-header">
              <input id="station-filter-operations-search" type="text" placeholder="Search operations..." class="mes-filter-panel-input">
              <button id="station-filter-operations-clear" type="button" class="mes-filter-panel-button">Clear</button>
              <button id="station-filter-operations-hide" type="button" title="Kapat" class="mes-filter-panel-button">×</button>
            </div>
            <div id="station-filter-operations-list" class="mes-filter-panel-content"></div>
          </div>
        </div>

        <button id="station-filter-clear-all" type="button" title="Tüm filtreleri temizle" class="mes-filter-clear is-compact" style="display: none;">
          Clear All
        </button>
      </div>
    </div>
    
    <!-- Stations Table with Tabs -->
    <section class=\"workers-table\">
      <div style=\"padding: 0px;\">
        <div class=\"workers-container\" style=\"display: flex; gap: 20px; height: auto; flex-direction: row;\">
          <div class=\"workers-table-panel\" style=\"flex: 1 1 0%; min-width: 300px; display: flex; flex-direction: column; height: auto;\">
            <div class=\"workers-table\">
              <!-- Stations Table with integrated tabs -->
              <div class="mes-table-container">
                <div class="mes-table-tabs" id="stations-tabs">
                  <!-- Tabs will be populated by renderStations() -->
                </div>

                <table id="stations-table" class="mes-table">
                  <thead class="mes-table-header">
                    <tr>
                      <th style="min-width: 120px;">
                        <button type="button" class="mes-sort-button">
                          Station ID <span class="mes-sort-icon">↕</span>
                        </button>
                      </th>
                      <th style="min-width: 200px;">
                        <button type="button" class="mes-sort-button">
                          Station Name <span class="mes-sort-icon">↕</span>
                        </button>
                      </th>
                      <th style="min-width: 90px;" class="text-center">
                        <button type="button" class="mes-sort-button">
                          Amount <span class="mes-sort-icon">↕</span>
                        </button>
                      </th>
                      <th style="min-width: 160px;">
                        <button type="button" class="mes-sort-button">
                          Operations <span class="mes-sort-icon">↕</span>
                        </button>
                      </th>
                      <th style="min-width: 160px;">
                        <button type="button" class="mes-sort-button">
                          Skills <span class="mes-sort-icon">↕</span>
                        </button>
                      </th>
                    </tr>
                  </thead>
                  <tbody id="stations-list" class="mes-table-body">
                    <!-- Station rows will be populated by renderStations() -->
                  </tbody>
                </table>
              </div>
            </div>
          </div>
          <div class=\"worker-detail-panel\" id=\"station-detail-panel\" style=\"flex: 1 1 0%; min-width: 400px; height: auto; display: none;\">
            <div style=\"background: white; border-radius: 6px; border: 1px solid rgb(229, 231, 235); height: 100%; display: flex; flex-direction: column;\">
              <div style=\"padding: 16px 20px; border-bottom: 1px solid rgb(229, 231, 235); display: flex; justify-content: space-between; align-items: center;\">
                <div style=\"display: flex; align-items: center; gap: 12px;\">
                  <button title=\"Detayları Kapat\" onclick=\"closeStationDetail()\" style=\"padding: 6px 12px; border: 1px solid rgb(209, 213, 219); border-radius: 4px; background: white; color: rgb(55, 65, 81); cursor: pointer; font-size: 12px;\">←</button>
                  <h3 style=\"margin: 0px; font-size: 16px; font-weight: 600; color: rgb(17, 24, 39);\">Station Detayları</h3>
                </div>
                <div style=\"display:flex; align-items:center; gap:8px;\">
                  <button onclick=\"editStationFromDetail()\" style=\"padding: 6px 12px; border: 1px solid rgb(209, 213, 219); border-radius: 4px; background: white; color: rgb(55, 65, 81); cursor: pointer; font-size: 12px;\"><i class="fa-solid fa-edit"></i> Düzenle</button>
                  <button onclick=\"duplicateStationFromDetail()\" style=\"padding: 6px 12px; border: 1px solid rgb(34, 197, 94); border-radius: 4px; background: white; color: rgb(34, 197, 94); cursor: pointer; font-size: 12px;\"><i class="fa-solid fa-copy"></i> Kopyala</button>
                  <button onclick=\"deleteStationFromDetail()\" style=\"padding: 6px 12px; border: 1px solid rgb(220, 38, 38); border-radius: 4px; background: white; color: rgb(220, 38, 38); cursor: pointer; font-size: 12px;\"><i class="fa-solid fa-trash"></i> Sil</button>
                </div>
              </div>
              <div style=\"flex: 1 1 0%; overflow: auto; padding: 20px;\">
                <div id=\"station-detail-content\"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>\n\n    <div id=\"station-modal\" style=\"display:none; position:fixed; inset:0; background:rgba(0,0,0,0.5); z-index:1000;\" onclick=\"closeStationModal(event)\">
      <div style=\"position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); background: white; border-radius: 8px; padding: 0; width: 560px; max-height: 80vh; overflow: hidden;\" onclick=\"event.stopPropagation()\">
        <div style=\"padding: 16px 20px; border-bottom: 1px solid var(--border);\">
          <h3 id=\"station-modal-title\" style=\"margin: 0; font-size: 18px;\">Add New Station</h3>
        </div>
        <div style=\"padding: 16px 20px; background: rgb(249, 250, 251); max-height: calc(80vh - 120px); overflow-y: auto;\">
          <!-- Temel Bilgiler -->
          <div style=\"margin-bottom: 16px; padding: 12px; background: white; border-radius: 6px; border: 1px solid var(--border);\">
            <h3 style=\"margin: 0 0 12px; font-size: 14px; font-weight: 600; color: rgb(17, 24, 39); border-bottom: 1px solid var(--border); padding-bottom: 6px;\">Temel Bilgiler</h3>
            <div class=\"detail-item\" style=\"display: flex; align-items: center; margin-bottom: 8px;\">
              <span class=\"detail-label\" style=\"font-weight: 600; font-size: 12px; color: rgb(55, 65, 81); min-width: 120px; margin-right: 8px;\">İsim:</span>
              <input type=\"text\" id=\"station-name\" placeholder=\"Station name\" style=\"flex: 1 1 0%; padding: 6px 8px; border: 1px solid rgb(209, 213, 219); border-radius: 4px; font-size: 12px; background: white;\">
            </div>
            <div class=\"detail-item\" style=\"display: flex; align-items: center; margin-bottom: 8px;\">
              <span class=\"detail-label\" style=\"font-weight: 600; font-size: 12px; color: rgb(55, 65, 81); min-width: 120px; margin-right: 8px;\">Status:</span>
              <select id=\"station-status\" style=\"flex: 1 1 0%; padding: 6px 8px; border: 1px solid rgb(209, 213, 219); border-radius: 4px; font-size: 12px; background: white;\">
                <option value=\"active\">active</option>
                <option value=\"maintenance\">maintenance</option>
                <option value=\"inactive\">inactive</option>
              </select>
            </div>
            <div class=\"detail-item\" style=\"display: flex; align-items: center; margin-bottom: 8px;\">
              <span class=\"detail-label\" style=\"font-weight: 600; font-size: 12px; color: rgb(55, 65, 81); min-width: 120px; margin-right: 8px;\">Location:</span>
              <input type=\"text\" id=\"station-location\" placeholder=\"e.g. Line A\" style=\"flex: 1 1 0%; padding: 6px 8px; border: 1px solid rgb(209, 213, 219); border-radius: 4px; font-size: 12px; background: white;\">
            </div>
            <div class=\"detail-item\" style=\"display: flex; align-items: center; margin-bottom: 8px;\">
              <span class=\"detail-label\" style=\"font-weight: 600; font-size: 12px; color: rgb(55, 65, 81); min-width: 120px; margin-right: 8px;\">Alt İstasyon Sayısı:</span>
              <input type=\"number\" id=\"station-substation-count\" min=\"1\" max=\"50\" value=\"1\" style=\"flex: 1 1 0%; padding: 6px 8px; border: 1px solid rgb(209, 213, 219); border-radius: 4px; font-size: 12px; background: white;\">
            </div>
            <div class=\"detail-item\" style=\"display: flex; align-items: flex-start; margin-bottom: 0;\">
              <span class=\"detail-label\" style=\"font-weight: 600; font-size: 12px; color: rgb(55, 65, 81); min-width: 120px; margin-right: 8px; margin-top: 6px;\">Açıklama:</span>
              <textarea id=\"station-description\" placeholder=\"Description\" style=\"flex: 1 1 0%; padding: 6px 8px; border: 1px solid rgb(209, 213, 219); border-radius: 4px; font-size: 12px; background: white; min-height: 60px; resize: vertical;\"></textarea>
            </div>
          </div>

          <!-- Desteklenen Operasyonlar -->
          <div style=\"margin-bottom: 16px; padding: 12px; background: white; border-radius: 6px; border: 1px solid var(--border);\">
            <h3 style=\"margin: 0 0 12px; font-size: 14px; font-weight: 600; color: rgb(17, 24, 39); border-bottom: 1px solid var(--border); padding-bottom: 6px;\">Desteklenen Operasyonlar</h3>
            <div class=\"detail-item\" style=\"display: block;\">
              <div id=\"station-operations\" style=\"display: grid; grid-template-columns: repeat(2, minmax(0px, 1fr)); gap: 6px; max-height: 200px; overflow-y: auto;\">
                <!-- Operations will be populated by fillStationModal() -->
              </div>
            </div>
          </div>

          <!-- Yetenekler -->
          <div id=\"station-skills-box\">
            <div style=\"margin-bottom: 0; padding: 12px; background: white; border-radius: 6px; border: 1px solid var(--border);\">
              <h3 style=\"margin: 0 0 12px; font-size: 14px; font-weight: 600; color: rgb(17, 24, 39); border-bottom: 1px solid var(--border); padding-bottom: 6px;\">İstasyon Özel Yetenekleri</h3>
              <div class=\"detail-item\" style=\"display: block;\">
                <div id=\"station-subskills-box\" style=\"background: white;\">
                  <!-- Skills will be populated by renderStationSubskillsBox() -->
                </div>
              </div>
            </div>
          </div>
        </div>
        <div style=\"padding: 12px 20px; border-top: 1px solid var(--border); display: flex; align-items: center; justify-content: space-between;\">
          <div>
            <button id=\"station-delete-btn\" onclick=\"deleteStationFromModal()\" style=\"display: none; padding: 8px 16px; background: white; border: 1px solid #ef4444; color: #ef4444; border-radius: 4px; cursor: pointer;\">Delete</button>
          </div>
          <div style=\"display: flex; gap: 8px;\">
            <button onclick=\"closeStationModal()\" style=\"padding: 8px 16px; background: white; border: 1px solid var(--border); border-radius: 4px; cursor: pointer;\">Cancel</button>
            <button onclick=\"saveStation()\" style=\"padding: 8px 16px; background: var(--primary); color: white; border: none; border-radius: 4px; cursor: pointer;\">Save</button>
          </div>
        </div>
      </div>
    </div>\n  `;
}

export function generateStationDuplicateModal() {
  return `
    <div id="station-duplicate-modal" style="display:none; position:fixed; inset:0; background:rgba(0,0,0,0.5); z-index:1010;" onclick="closeStationDuplicateModal(event)">
      <div style="display:flex; align-items:center; justify-content:center; min-height:100%; padding:20px;">
        <div style="background:white; border-radius:8px; max-width:500px; width:100%; max-height:90vh; overflow:auto;" onclick="event.stopPropagation()">
          <div style="padding:20px 24px; border-bottom:1px solid var(--border); display:flex; justify-content:space-between; align-items:center;">
            <h3 style="margin:0; font-size:18px; font-weight:600; color:rgb(17,24,39);">İstasyon Kopyalama</h3>
            <div style="display:flex; gap:12px;">
              <button onclick="closeStationDuplicateModal()" style="padding:8px 16px; background:white; border:1px solid var(--border); border-radius:6px; cursor:pointer; font-size:14px;">
                İptal
              </button>
              <button onclick="confirmStationDuplicate()" style="padding:8px 16px; background:rgb(34,197,94); color:white; border:none; border-radius:6px; cursor:pointer; font-size:14px;">
                Kopyala
              </button>
            </div>
          </div>
          <div style="padding:24px;">
            <div style="margin-bottom:20px;">
              <p style="margin:0 0 16px; color:rgb(75,85,99); font-size:14px;">
                <span id="duplicate-station-name-display" style="font-weight:600;"></span> istasyonunu kopyalıyorsunuz.
              </p>
              <div>
                <label style="display:block; margin-bottom:6px; font-size:14px; font-weight:500; color:rgb(17,24,39);">
                  Yeni İstasyon Adı
                </label>
                <input 
                  type="text" 
                  id="duplicate-station-new-name" 
                  placeholder=""
                  style="width:100%; padding:8px 12px; border:1px solid var(--border); border-radius:6px; font-size:14px;"
                />
                <p style="margin:6px 0 0; color:rgb(107,114,128); font-size:12px;">
                  Boş bırakırsanız: "<span id="duplicate-default-name-preview"></span>"
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

export function generatePlanDesigner() {
  return `
    <div id="plans-header" style="margin-bottom: 24px;">
      <h1 id="plans-title" style="font-size: 32px; font-weight: 700; margin-bottom: 8px;">Production Route Management</h1>
      <p style="margin: 0; font-size: 14px; color: #64748b; line-height: 1.5;">
        Design production routes and operation sequences. Define workflow dependencies, resource requirements, and process rules. Create reusable templates for efficient production planning.
      </p>
      <button id="plans-back-btn" onclick="cancelPlanCreation()" title="Go back" style="display:none; padding: 6px 10px; font-size: 12px; border: 1px solid var(--border); background: white; border-radius: 6px; cursor: pointer;">← Back</button>
    </div>

    <div class="plans-filter-compact mes-filter-bar" id="plans-filter-compact" style="margin-bottom: 24px;">
      <button id="create-plan-button" onclick="openCreatePlan()" class="mes-primary-action is-compact">+ Create New Production Route</button>

      <div id="plans-header-controls" class="mes-filter-controls">
        <input id="plan-filter-search" type="text" placeholder="Search plans..." class="plan-filter-input mes-filter-input is-compact" oninput="filterProductionPlans()">

        <div id="plan-filter-status" class="mes-filter-group">
          <button id="plan-filter-status-btn" type="button" class="plan-filter-button mes-filter-button is-compact" onclick="togglePlanFilterPanel('status')">
            <span>Status</span>
            <span id="plan-filter-status-count" class="mes-filter-count"></span>
            <span class="mes-filter-caret">▾</span>
          </button>
          <div id="plan-filter-status-panel" class="mes-filter-panel is-narrow">
            <div class="mes-filter-panel-header">
              <button type="button" class="mes-filter-panel-button" onclick="clearPlanFilter('status')">Clear</button>
              <button type="button" title="Close" class="mes-filter-panel-button" onclick="hidePlanFilterPanel('status')">×</button>
            </div>
            <div class="mes-filter-panel-content">
              <label><input type="checkbox" onchange="onPlanFilterChange('status','planned',this.checked)"> <span>planned</span></label>
              <label><input type="checkbox" onchange="onPlanFilterChange('status','in-progress',this.checked)"> <span>in-progress</span></label>
              <label><input type="checkbox" onchange="onPlanFilterChange('status','completed',this.checked)"> <span>completed</span></label>
              <label><input type="checkbox" onchange="onPlanFilterChange('status','canceled',this.checked)"> <span>canceled</span></label>
            </div>
          </div>
        </div>

        <div id="plan-filter-priority" class="mes-filter-group">
          <button id="plan-filter-priority-btn" type="button" class="plan-filter-button mes-filter-button is-compact" onclick="togglePlanFilterPanel('priority')">
            <span>Priority</span>
            <span id="plan-filter-priority-count" class="mes-filter-count"></span>
            <span class="mes-filter-caret">▾</span>
          </button>
          <div id="plan-filter-priority-panel" class="mes-filter-panel is-narrow">
            <div class="mes-filter-panel-header">
              <button type="button" class="mes-filter-panel-button" onclick="clearPlanFilter('priority')">Clear</button>
              <button type="button" title="Close" class="mes-filter-panel-button" onclick="hidePlanFilterPanel('priority')">×</button>
            </div>
            <div class="mes-filter-panel-content">
              <label><input type="checkbox" onchange="onPlanFilterChange('priority','high',this.checked)"> <span>high</span></label>
              <label><input type="checkbox" onchange="onPlanFilterChange('priority','medium',this.checked)"> <span>medium</span></label>
              <label><input type="checkbox" onchange="onPlanFilterChange('priority','low',this.checked)"> <span>low</span></label>
            </div>
          </div>
        </div>

        <div id="plan-filter-type" class="mes-filter-group">
          <button id="plan-filter-type-btn" type="button" class="plan-filter-button mes-filter-button is-compact" onclick="togglePlanFilterPanel('type')">
            <span>Type</span>
            <span id="plan-filter-type-count" class="mes-filter-count"></span>
            <span class="mes-filter-caret">▾</span>
          </button>
          <div id="plan-filter-type-panel" class="mes-filter-panel is-narrow">
            <div class="mes-filter-panel-header">
              <button type="button" class="mes-filter-panel-button" onclick="clearPlanFilter('type')">Clear</button>
              <button type="button" title="Close" class="mes-filter-panel-button" onclick="hidePlanFilterPanel('type')">×</button>
            </div>
            <div class="mes-filter-panel-content">
              <label><input type="checkbox" onchange="onPlanFilterChange('type','one-time',this.checked)"> <span>one-time</span></label>
              <label><input type="checkbox" onchange="onPlanFilterChange('type','recurring',this.checked)"> <span>recurring</span></label>
            </div>
          </div>
        </div>

        <button id="plan-filter-clear-all" type="button" title="Clear all filters" class="mes-filter-clear is-compact" style="display: none;" onclick="clearAllPlanFilters()">
          Clear All
        </button>
      </div>
    </div>

    <div id="plans-panel-card" class="workers-table-panel" style="flex: 1 1 0%; min-width: 300px; display: flex; flex-direction: column; height: auto;">
      <div class="workers-table">
        <div class="mes-table-container">
          <div class="mes-table-tabs" id="plans-tabs">
            <button class="station-tab-button mes-tab-button active" data-tab="production" onclick="setActivePlanTab('production')">
              Production Plans
              <span id="production-count" class="mes-tab-count">(0)</span>
            </button>
            <button class="station-tab-button mes-tab-button" data-tab="templates" onclick="setActivePlanTab('templates')">
              Templates
              <span id="templates-count" class="mes-tab-count">(0)</span>
            </button>
          </div>

          <div id="production-table-panel" style="display: block;">
            <table class="mes-table">
              <thead class="mes-table-header">
                <tr>
                  <th style="min-width: 140px;">Plan ID</th>
                  <th style="min-width: 180px;">Plan Adı</th>
                  <th style="min-width: 120px;">Order</th>
                  <th style="min-width: 80px;">Steps</th>
                  <th style="min-width: 140px;">Throughput</th>
                  <th style="min-width: 160px;">Bottleneck</th>
                  <th class="metadata-column hidden" style="min-width: 140px;">Created At</th>
                  <th class="metadata-column hidden" style="min-width: 140px;">Created By</th>
                  <th class="metadata-column hidden" style="min-width: 140px;">Updated At</th>
                  <th class="metadata-column hidden" style="min-width: 140px;">Updated By</th>
                  <th style="text-align: right;">
                    <button class="metadata-toggle-btn" onclick="toggleMetadataColumns()">Show Details</button>
                  </th>
                </tr>
              </thead>
              <tbody id="production-table-body" class="mes-table-body">
                <tr class="mes-table-row is-empty">
                  <td colspan="11" class="mes-empty-cell text-center"><em>No production plans yet</em></td>
                </tr>
              </tbody>
            </table>
          </div>
          <div id="templates-table-panel" style="display: none;">
            <table class="mes-table">
              <thead class="mes-table-header">
                <tr>
                  <th style="min-width: 140px;">Plan ID</th>
                  <th style="min-width: 180px;">Template Adı</th>
                  <th style="min-width: 120px;">Order</th>
                  <th style="min-width: 80px;">Steps</th>
                  <th class="metadata-column hidden" style="min-width: 140px;">Created At</th>
                  <th class="metadata-column hidden" style="min-width: 140px;">Created By</th>
                  <th class="metadata-column hidden" style="min-width: 140px;">Updated At</th>
                  <th class="metadata-column hidden" style="min-width: 140px;">Updated By</th>
                  <th style="text-align: right;">
                    <button class="metadata-toggle-btn" onclick="toggleMetadataColumns()">Show Details</button>
                  </th>
                </tr>
              </thead>
              <tbody id="templates-table-body" class="mes-table-body">
                <tr class="mes-table-row is-empty">
                  <td colspan="9" class="mes-empty-cell text-center"><em>No templates yet</em></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>

    <div id="plan-designer-section" style="margin-top: 24px; display: none;">
      <div class="card" style="margin-bottom: 10px;">
        <div class="card-header" style="padding: 8px 10px;">
          <div class="card-title" style="font-size: 15px; display: flex; align-items: center; gap: 8px;">
            Plan Configuration
            <span id="plan-config-id" style="font-family: 'Monaco', 'Menlo', 'Consolas', monospace; font-size: 15px; font-weight: normal; opacity: 0.6; display: none;"></span>
          </div>
        </div>
        <div class="card-content" style="padding: 6px 10px;">
          <!-- Row 1: Plan name + short description -->
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; align-items: center;">
            <div style="display:flex; align-items:center; gap:8px;">
              <label style="font-weight: 500; font-size: 12px; margin: 0; min-width: 48px;">Plan</label>
              <input type="text" id="plan-name" placeholder="Plan name" style="flex:1; width: 100%; height: 32px; padding: 4px 6px; border: 1px solid var(--border); border-radius: 6px; font-size: 12px;" />
            </div>
            <div style="display:flex; align-items:center; gap:8px;">
              <label style="font-weight: 500; font-size: 12px; margin: 0; min-width: 80px;">Description</label>
              <input type="text" id="plan-description" placeholder="Plan description..." style="flex:1; width:100%; height:32px; padding:4px 6px; border:1px solid var(--border); border-radius:6px; font-size:12px;" />
            </div>
          </div>

          <!-- Row 2: Order + Schedule type + Buttons -->
          <div style="display: grid; grid-template-columns: 1fr 1fr auto; gap: 8px; align-items: end; margin-top: 8px;">
            <div style="display:flex; align-items:center; gap:8px;">
              <label style="font-weight: 500; font-size: 12px; margin: 0; min-width: 48px;">Order</label>
              <select id="order-select" style="display:none;" onchange="handleOrderChange()"><option value="">Select an order...</option></select>
              <div style="position: relative; flex:1;">
                <button id="plan-order-btn" type="button" class="plan-filter-button" style="height: 32px; padding: 4px 6px; border: 1px solid var(--border); background: white; border-radius: 6px; cursor: pointer; min-width: 200px; width: 100%; display: flex; align-items: center; gap: 8px;">
                  <span id="plan-order-label">Select an order...</span>
                  <span style="margin-left: auto; opacity: .6">▾</span>
                </button>
                <div id="plan-order-panel" style="display:none; position: absolute; right: 0; margin-top: 6px; background: white; border: 1px solid var(--border); border-radius: 8px; box-shadow: 0 8px 24px rgba(0,0,0,0.08); width: 360px; max-height: 320px; overflow: hidden; z-index: 9999;">
                  <div style="padding: 8px; border-bottom: 1px solid var(--border); display:flex; gap:6px; align-items:center; box-sizing: border-box;">
                    <input id="plan-order-search" type="text" placeholder="Search orders..." class="plan-filter-panel-input" style="flex:1; min-width:0; padding: 3px 4px; font-size:12px; border: 1px solid var(--border); border-radius: 6px;">
                    <button id="plan-order-clear" type="button" class="plan-filter-panel-button" style="flex:0 0 auto; white-space:nowrap; font-size:12px; padding:3px 4px; border:1px solid var(--border); background:white; border-radius:6px; cursor:pointer;">Clear</button>
                    <button id="plan-order-close" type="button" title="Close" class="plan-filter-panel-button" style="flex:0 0 auto; font-size:12px; padding:3px 4px; border:1px solid var(--border); background:white; border-radius:6px; cursor:pointer;">×</button>
                  </div>
                  <div id="plan-order-list" style="max-height: 240px; overflow: auto; padding: 8px; display: grid; gap: 6px;"></div>
                </div>
              </div>
            </div>
            <div style="display:flex; align-items:center; gap:8px;">
              <label style="font-weight:500; font-size:12px; margin:0; min-width:72px;">Plan Türü</label>
              <select id="schedule-type" style="display:none;" onchange="handleScheduleTypeChange()">
                <option value="one-time">Tek seferlik</option>
                <option value="recurring">Devirli</option>
              </select>
              <div style="position: relative; flex:1;">
                <button id="plan-type-btn" type="button" class="plan-filter-button" style="height: 32px; padding: 4px 6px; border: 1px solid var(--border); background: white; border-radius: 6px; cursor: pointer; min-width: 160px; width: 100%; display: flex; align-items: center; gap: 8px;">
                  <span id="plan-type-label">Tek seferlik</span>
                  <span style="margin-left: auto; opacity: .6">▾</span>
                </button>
                <div id="plan-type-panel" style="display:none; position: absolute; right: 0; margin-top: 6px; background: white; border: 1px solid var(--border); border-radius: 8px; box-shadow: 0 8px 24px rgba(0,0,0,0.08); width: 320px; min-height: fit-content; max-height: 80vh; overflow: hidden; z-index: 9999;">
                  <div style="padding: 8px; border-bottom: 1px solid var(--border); display:flex; gap:6px; align-items:center; box-sizing: border-box;">
                    <span id="plan-type-modal-title" style="font-weight: 500; font-size: 13px; color: var(--foreground);">Plan Türü Ayarları</span>
                    <div style="margin-left: auto; display: flex; gap: 6px;">
                      <button id="plan-type-clear" type="button" class="plan-filter-panel-button" style="flex:0 0 auto; white-space:nowrap; font-size:12px; padding:3px 4px; border:1px solid var(--border); background:white; border-radius:6px; cursor:pointer;" onclick="clearPlanType()">Clear</button>
                      <button id="modal-apply-btn" type="button" style="flex:0 0 auto; white-space:nowrap; font-size:12px; padding:3px 4px; border:1px solid black; background:black; color:white; border-radius:6px; cursor:pointer;" onclick="applyPlanTypeModal()">Apply</button>
                      <button id="plan-type-close" type="button" title="Close" class="plan-filter-panel-button" style="flex:0 0 auto; font-size:12px; padding:3px 4px; border:1px solid var(--border); background:white; border-radius:6px; cursor:pointer;" onclick="hidePlanTypePanel()">×</button>
                    </div>
                  </div>
                  <div style="max-height: 70vh; overflow-y: auto; padding: 8px; box-sizing: border-box;">
                    <!-- Plan Type Selection -->
                    <div style="display: grid; gap: 6px; margin-bottom: 12px;">
                      <label style="display:flex; align-items:center; gap:8px; padding:1.5px 2px; border:1px solid var(--border); border-radius:6px; cursor:pointer; font-size:12px;">
                        <input type="radio" name="plan-type-radio" value="one-time" onchange="if(this.checked) { selectPlanType('one-time', 'Tek seferlik'); handlePlanTypeModalChange('one-time'); }">
                        <span style="font-size:12px;">Tek seferlik</span>
                      </label>
                      <label style="display:flex; align-items:center; gap:8px; padding:1.5px 2px; border:1px solid var(--border); border-radius:6px; cursor:pointer; font-size:12px;">
                        <input type="radio" name="plan-type-radio" value="recurring" onchange="if(this.checked) { selectPlanType('recurring', 'Devirli'); handlePlanTypeModalChange('recurring'); }">
                        <span style="font-size:12px;">Devirli</span>
                      </label>
                    </div>
                    
                    <!-- Quantity Section -->
                    <div style="border-top: 1px solid var(--border); padding-top: 12px; margin-bottom: 12px;">
                      <label style="font-weight:500; font-size:12px; margin:0 0 4px 0; display:block;">Miktar</label>
                      <input type="number" id="modal-plan-quantity" min="1" value="1" style="width:100%; height:32px; padding:4px 6px; border:1px solid var(--border); border-radius:6px; font-size:12px;" onchange="handlePlanQuantityChange()" placeholder="1">
                    </div>
                    
                    <!-- Recurring Options (shown when recurring is selected) -->
                    <div id="modal-recurring-options" style="display:none; border-top: 1px solid var(--border); padding-top: 12px;">
                      <!-- Devirli Türü -->
                      <div style="margin-bottom: 12px;">
                        <label style="font-weight:500; font-size:12px; margin:0 0 4px 0; display:block;">Devirli Türü</label>
                        <select id="modal-recurring-type" style="width:100%; height:32px; padding:4px 6px; border:1px solid var(--border); border-radius:6px; font-size:12px;" onchange="handleModalRecurringTypeChange()">
                          <option value="periodic">Periyodik devirli</option>
                          <option value="indefinite">Süresiz devirli</option>
                        </select>
                      </div>
                      
                      <!-- Periyot (shown when periodic is selected) -->
                      <div id="modal-periodic-frequency-container" style="margin-bottom: 12px;">
                        <label style="font-weight:500; font-size:12px; margin:0 0 4px 0; display:block;">Periyot</label>
                        <select id="modal-periodic-frequency" style="width:100%; height:32px; padding:4px 6px; border:1px solid var(--border); border-radius:6px; font-size:12px;" onchange="handleModalPeriodicFrequencyChange()">
                          <option value="daily">Günlük</option>
                          <option value="weekly">Haftalık</option>
                          <option value="biweekly">2 haftalık</option>
                          <option value="monthly">Aylık</option>
                          <option value="custom">Custom</option>
                        </select>
                      </div>
                      
                      <!-- Custom Frequency (shown when custom is selected) -->
                      <div id="modal-custom-frequency-container" style="display:none; margin-bottom: 12px;">
                        <label style="font-weight:500; font-size:12px; margin:0 0 4px 0; display:block;">Custom Tanım</label>
                        <input type="text" id="modal-custom-frequency" placeholder="Örn: her 3 gün, cron vb." style="width:100%; height:32px; padding:4px 6px; border:1px solid var(--border); border-radius:6px; font-size:12px;">
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div style="display:flex; gap:6px; align-items:center; justify-content:flex-end;">
              <button id="plan-save-btn" onclick="savePlanDraft()" style="height: 32px; padding:0 10px; font-size:12px; border-radius:6px; border:1px solid var(--border); background: white;">Save</button>
              <button id="plan-save-as-template-btn" onclick="savePlanAsTemplate()" style="height: 32px; padding:0 10px; font-size:12px; border-radius:6px; border:1px solid var(--border); background: white;">Save As Template</button>
              <button id="plan-cancel-btn" onclick="cancelPlanCreation()" style="height: 32px; padding:0 12px; font-size:12px; border-radius:6px; background: #f3f4f6; color: #111827; border: 1px solid var(--border);">Cancel</button>
            </div>
          </div>
        </div>
      </div>
      <div id="plan-workspace-grid" style="display: grid; grid-template-columns: 240px 1fr; gap: 16px; align-items: start;">
        <div class="card" style="height: fit-content;">
          <div class="card-header" style="padding: 8px 12px;"><div class="card-title" style="font-size: 14px;">Operations</div><div class="card-description" style="font-size: 11px;">Drag to canvas</div></div>
          <div id="operations-panel" class="card-content" style="padding: 8px;"><div id="operations-list"></div></div>
        </div>
        <div class="card">
          <div class="card-header" style="padding: 8px 12px !important; display: flex !important; flex-direction: row !important; align-items: center !important; justify-content: space-between !important;">
            <div class="card-title" style="font-size: 14px;">Plan Canvas</div>
            <div style="display: flex; gap: 6px;">
              <button id="fullscreen-canvas-btn" onclick="toggleCanvasFullscreen()" style="padding: 3px 6px; background: white; border: 1px solid var(--border); border-radius: 3px; cursor: pointer; font-size: 11px;">⛶ Fullscreen</button>
              <button id="connect-mode-btn" onclick="toggleConnectMode()" style="padding: 3px 6px; background: white; border: 1px solid var(--border); border-radius: 3px; cursor: pointer; font-size: 11px;">🔗 Connect</button>
              <button onclick="clearCanvas()" style="padding: 3px 6px; background: white; border: 1px solid var(--border); border-radius: 3px; cursor: pointer; font-size: 11px;"><i class="fa-solid fa-trash"></i> Clear</button>
            </div>
          </div>
          <div class="card-content" style="padding: 0; max-height: 400px; position: relative; overflow: hidden;">
            <div id="plan-canvas" style="width: 100%; height: 400px; max-height: 400px; position: relative; background: var(--card); border: 1px solid var(--border);" ondrop="handleCanvasDrop(event)" ondragover="handleCanvasDragOver(event)" onclick="handleCanvasClick(event)"></div>
          </div>
        </div>
      </div>
      <!-- Malzeme Akışı Paneli -->
      <div class="card" style="margin-top: 12px;">
        <div class="card-header" style="padding: 8px 12px; display:flex; align-items:center; justify-content: space-between; gap: 8px;">
          <div class="card-title" style="font-size: 14px;">Malzeme Akışı</div>
        </div>
        <div class="card-content" style="padding: 8px 12px;">
          <div id="material-flow-container" style="width: 100%; min-height: 80px; position: relative; overflow-x: auto; overflow-y: hidden;"></div>
        </div>
      </div>
      <!-- Timing / Capacity Summary Paneli -->
      <div class="card" style="margin-top: 12px;">
        <div class="card-header" style="padding: 8px 12px;">
          <div class="card-title" style="font-size: 14px; display: flex; align-items: center;">
            <span style="margin-right: 8px;">⏱️</span> Timing / Capacity
          </div>
        </div>
        <div class="card-content" style="padding: 8px 12px;">
          <div id="timing-summary-container"></div>
        </div>
      </div>
      <div id="node-edit-modal" style="display: none; position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.3); z-index: 3000;" onclick="closeNodeEditModal(event)">
        <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); background: white; border-radius: 8px; padding: 0; width: 560px; max-height: 80vh; overflow: hidden;" onclick="event.stopPropagation()">
          <div style="padding: 16px 20px; border-bottom: 1px solid var(--border);">
            <h3 style="margin: 0; font-size: 18px;">Edit Production Step</h3>
          </div>
          <div style="padding: 16px 20px; background: rgb(249, 250, 251); max-height: calc(80vh - 120px); overflow-y: auto;">
            <div id="node-edit-form"></div>
          </div>
          <div style="padding: 12px 20px; border-top: 1px solid var(--border); display: flex; align-items: center; justify-content: space-between; gap: 8px;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <div id="node-output-code-label" style="font-size: 12px; color: var(--muted-foreground);">Output: —</div>
              <input id="edit-output-qty" type="number" min="0" step="0.01" placeholder="Qty" title="Output quantity" style="width: 90px; padding: 6px 8px; border: 1px solid var(--border); border-radius: 4px; font-size: 12px;" />
              <select id="edit-output-unit" title="Output unit" style="width: 110px; padding: 6px 8px; border: 1px solid var(--border); border-radius: 4px; font-size: 12px; background: white;">
                <option value="">Birim seçin</option>
              </select>
            </div>
            <div style="display: flex; align-items: center; gap: 8px;">
              <button onclick="closeNodeEditModal()" style="padding: 8px 16px; background: white; border: 1px solid var(--border); border-radius: 4px; cursor: pointer;">Cancel</button>
              <button onclick="saveNodeEdit()" style="padding: 8px 16px; background: var(--primary); color: var(--primary-foreground); border: none; border-radius: 4px; cursor: pointer;">Save</button>
            </div>
          </div>
        </div>
      </div>
      
      <!-- Fullscreen Canvas Modal -->
      <div id="canvas-fullscreen-modal" style="display: none; position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: white; z-index: 2000;">
        <div style="height: 100vh; display: flex; flex-direction: column;">
          <!-- Fullscreen Header -->
          <div style="padding: 12px 20px; border-bottom: 1px solid var(--border); display: flex; align-items: center; justify-content: center; background: white; position: relative;">
            <div style="position: absolute; left: 20px; display: flex; align-items: center;">
              <h3 style="margin: 0; font-size: 18px; font-weight: 600;">Plan Canvas - Fullscreen</h3>
            </div>
            <!-- Centered Controls -->
            <div style="display: flex; gap: 6px; align-items: center;">
              <!-- Zoom Controls (Left Side) -->
              <div style="display: flex; gap: 4px; align-items: center; margin-right: 12px;">
                <button id="zoom-out-btn" onclick="adjustCanvasZoom(-0.1)" style="padding: 6px 8px; background: white; border: 1px solid var(--border); border-radius: 4px; cursor: pointer; font-size: 14px; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center;"><i class="fa-solid fa-search-minus"></i></button>
                <input type="range" id="zoom-slider" min="30" max="150" value="100" step="10" oninput="setCanvasZoom(this.value)" style="width: 80px; height: 4px; background: #ddd; outline: none; border-radius: 2px; cursor: pointer;">
                <button id="zoom-in-btn" onclick="adjustCanvasZoom(0.1)" style="padding: 6px 8px; background: white; border: 1px solid var(--border); border-radius: 4px; cursor: pointer; font-size: 14px; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center;"><i class="fa-solid fa-search-plus"></i></button>
                <span id="zoom-percentage" style="font-size: 11px; color: var(--muted-foreground); min-width: 35px;">100%</span>
                <button onclick="resetCanvasPan()" title="Reset Pan" style="padding: 6px 8px; background: white; border: 1px solid var(--border); border-radius: 4px; cursor: pointer; font-size: 12px; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; margin-left: 8px;">⌂</button>
              </div>
              
              <!-- Main Controls -->
              <button id="fullscreen-connect-mode-btn" onclick="toggleConnectMode()" style="padding: 6px 12px; background: white; border: 1px solid var(--border); border-radius: 6px; cursor: pointer; font-size: 12px;">🔗 Connect</button>
              <button onclick="clearCanvas()" style="padding: 6px 12px; background: white; border: 1px solid var(--border); border-radius: 6px; cursor: pointer; font-size: 12px;"><i class="fa-solid fa-trash"></i> Clear</button>
              <button onclick="toggleCanvasFullscreen()" style="padding: 6px 12px; background: var(--muted); border: 1px solid var(--border); border-radius: 6px; cursor: pointer; font-size: 12px;">✕ Exit Fullscreen</button>
            </div>
          </div>
          
          <!-- Fullscreen Content -->
          <div style="flex: 1; display: flex; min-height: 0;">
            <!-- Operations Panel in Fullscreen -->
            <div id="fullscreen-operations-panel" style="width: 280px; background: var(--muted); border-right: 1px solid var(--border); display: flex; flex-direction: column;">
              <div style="padding: 16px; border-bottom: 1px solid var(--border);">
                <h4 style="margin: 0 0 4px; font-size: 16px; font-weight: 600;">Operations</h4>
                <p style="margin: 0; font-size: 12px; color: var(--muted-foreground);">Drag to canvas</p>
              </div>
              <div style="flex: 1; padding: 16px; overflow-y: auto;">
                <div id="fullscreen-operations-list">
                  <div draggable="true" ondragstart="handleOperationDragStart(event, 'op-225d1xh')" style="padding: 8px 12px; border: 1px solid var(--border); border-radius: 6px; cursor: grab; background: white; margin-bottom: 8px; font-size: 14px; font-weight: 500;" onmouseover="this.style.background='var(--muted)'" onmouseout="this.style.background='white'">Boyama</div>
                  <div draggable="true" ondragstart="handleOperationDragStart(event, 'op-25m0lvw')" style="padding: 8px 12px; border: 1px solid var(--border); border-radius: 6px; cursor: grab; background: white; margin-bottom: 8px; font-size: 14px; font-weight: 500;" onmouseover="this.style.background='var(--muted)'" onmouseout="this.style.background='white'">Montaj</div>
                  <div draggable="true" ondragstart="handleOperationDragStart(event, 'op-me5qd1y')" style="padding: 8px 12px; border: 1px solid var(--border); border-radius: 6px; cursor: grab; background: white; margin-bottom: 8px; font-size: 14px; font-weight: 500;" onmouseover="this.style.background='var(--muted)'" onmouseout="this.style.background='white'">Press Kalıp Şekillendirme</div>
                  <div draggable="true" ondragstart="handleOperationDragStart(event, 'op-rqjlcwf')" style="padding: 8px 12px; border: 1px solid var(--border); border-radius: 6px; cursor: grab; background: white; margin-bottom: 8px; font-size: 14px; font-weight: 500;" onmouseover="this.style.background='var(--muted)'" onmouseout="this.style.background='white'">Torna</div>
                </div>
              </div>
            </div>
            
            <!-- Fullscreen Canvas Area -->
            <div style="flex: 1; position: relative; background: var(--card); overflow: hidden;">
              <div id="fullscreen-plan-canvas" style="width: 100%; height: 100%; position: relative; background: var(--card); cursor: grab;" ondrop="handleCanvasDrop(event)" ondragover="handleCanvasDragOver(event)" onclick="handleCanvasClick(event)"></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

export function generateTemplates() {
  return `
    <div style="margin-bottom: 24px;">
      <h1 style="font-size: 32px; font-weight: 700; margin-bottom: 8px;">Production Templates</h1>
      <p style="color: var(--muted-foreground);">Reusable production plan templates</p>
    </div>
    <div style="margin-bottom: 24px;">
      <button onclick="createNewTemplate()" style="background: var(--primary); color: var(--primary-foreground); padding: 12px 24px; border: none; border-radius: 6px; font-weight: 500; cursor: pointer;">+ Create Template</button>
    </div>
    <div id="templates-container" class="grid grid-cols-3" style="gap: 16px;">
      <div class="card" style="border: 2px dashed var(--border); text-align: center; padding: 40px;">
        <div style="color: var(--muted-foreground); font-size: 14px;">
          <p>No templates found</p>
          <p style="font-size: 12px;">Create your first production template to get started</p>
        </div>
      </div>
    </div>
  `;
}

// Approved Quotes view (read-only list similar to workers/operations tables)
export function generateApprovedQuotes() {
  return `
    <div style="margin-bottom: 24px;">
      <h1 style="font-size: 32px; font-weight: 700; margin-bottom: 8px;">Work Orders</h1>
      <p style="margin: 0; font-size: 14px; color: #64748b; line-height: 1.5;">
        Monitor and manage approved work orders ready for production. Launch production processes, track status, and control production flow with pause, resume, and cancel operations.
      </p>
    </div>

    <div class="approved-filter-compact mes-filter-bar" style="margin-bottom: 24px;">
      <div class="mes-filter-controls">
        <input id="approved-quotes-search" type="text" placeholder="Ara: müşteri, firma, teklif #..." class="mes-filter-input is-compact">

        <!-- Plan Type Toggle: Tamamlanan / Taslak -->
        <div class="mes-filter-group" id="aq-filter-plan-type">
          <button id="aq-filter-plan-type-btn" type="button" class="mes-filter-button is-compact">
            <span id="aq-filter-plan-type-label">Tamamlanan Planlar</span>
            <span id="aq-filter-plan-type-count" class="mes-filter-count"></span>
            <span class="mes-filter-caret">⇆</span>
          </button>
        </div>

        <!-- Production State Filter -->
        <div class="mes-filter-group" id="aq-filter-state">
          <button id="aq-filter-state-btn" type="button" class="mes-filter-button is-compact">
            <span>Üretim Durumu</span>
            <span id="aq-filter-state-count" class="mes-filter-count"></span>
            <span class="mes-filter-caret">▾</span>
          </button>
          <div id="aq-filter-state-panel" class="mes-filter-panel is-narrow">
            <div class="mes-filter-panel-header" style="justify-content: flex-end;">
              <button type="button" class="mes-filter-panel-button">Clear</button>
              <button type="button" title="Close" class="mes-filter-panel-button">×</button>
            </div>
            <div class="mes-filter-panel-content">
              <label class="mes-filter-option"><input type="checkbox" data-state="Üretim Onayı Bekliyor"> Üretim Onayı Bekliyor</label>
              <label class="mes-filter-option"><input type="checkbox" data-state="Üretiliyor"> Üretiliyor</label>
              <label class="mes-filter-option"><input type="checkbox" data-state="Üretim Durduruldu"> Üretim Durduruldu</label>
              <label class="mes-filter-option"><input type="checkbox" data-state="Üretim Tamamlandı"> Üretim Tamamlandı</label>
              <label class="mes-filter-option"><input type="checkbox" data-state="İptal Edildi"> İptal Edildi</label>
            </div>
          </div>
        </div>

        <!-- Delivery Date Range Filter -->
        <div class="mes-filter-group" id="aq-filter-delivery">
          <button id="aq-filter-delivery-btn" type="button" class="mes-filter-button is-compact">
            <span>Teslim Tarihi</span>
            <span id="aq-filter-delivery-summary" class="mes-filter-count"></span>
            <span class="mes-filter-caret">▾</span>
          </button>
          <div id="aq-filter-delivery-panel" class="mes-filter-panel is-wide">
            <div class="mes-filter-panel-header" style="justify-content: flex-end;">
              <button type="button" class="mes-filter-panel-button">Clear</button>
              <button type="button" title="Close" class="mes-filter-panel-button">×</button>
            </div>
            <div style="padding: 8px; display: grid; gap: 8px;">
              <!-- Gecikmiş Workorderlar butonu -->
              <button type="button" id="aq-filter-delivery-overdue" style="width: 100%; height: 32px; padding: 4px 8px; border: 1px solid #ef4444; background: white; color: #ef4444; border-radius: 6px; cursor: pointer; font-size: 12px; font-weight: 500;">
                📅 Gecikmiş Workorderlar
              </button>
              
              <!-- Başlangıç ve Bitiş yan yana -->
              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; align-items: end;">
                <div>
                  <label style="font-size:12px; color: var(--muted-foreground); display: block; margin-bottom: 4px;">Başlangıç</label>
                  <input id="aq-filter-delivery-from" type="date" style="height: 28px; width: 100%; padding: 2px 4px; border: 1px solid var(--border); border-radius: 4px; font-size: 11px;">
                </div>
                <div>
                  <label style="font-size:12px; color: var(--muted-foreground); display: block; margin-bottom: 4px;">Bitiş</label>
                  <input id="aq-filter-delivery-to" type="date" style="height: 28px; width: 100%; padding: 2px 4px; border: 1px solid var(--border); border-radius: 4px; font-size: 11px;">
                </div>
              </div>
              
              <!-- Hızlı seçimler -->
              <div style="display: grid; gap: 4px;">
                <label style="font-size: 11px; color: var(--muted-foreground); margin-bottom: 2px;">Hızlı Seçimler:</label>
                <button type="button" class="quick-select-btn" data-days="1" style="width: 100%; height: 24px; padding: 2px 6px; border: 1px solid var(--border); background: white; border-radius: 4px; cursor: pointer; font-size: 10px; text-align: left;">
                  <i class="fa-solid fa-bolt" style="color: #f59e0b;"></i> 1 Gün Kaldı
                </button>
                <button type="button" class="quick-select-btn" data-days="3" style="width: 100%; height: 24px; padding: 2px 6px; border: 1px solid var(--border); background: white; border-radius: 4px; cursor: pointer; font-size: 10px; text-align: left;">
                  ⏰ 3 Gün Kaldı
                </button>
                <button type="button" class="quick-select-btn" data-days="5" style="width: 100%; height: 24px; padding: 2px 6px; border: 1px solid var(--border); background: white; border-radius: 4px; cursor: pointer; font-size: 10px; text-align: left;">
                  📅 5 Gün Kaldı
                </button>
              </div>
              
              <button type="button" class="mes-filter-panel-button" style="height: 32px; padding: 4px 6px; border: 1px solid black; background: black; color: white;">Apply</button>
            </div>
          </div>
        </div>

        <button id="aq-filter-clear-all" type="button" title="Tüm filtreleri temizle" class="mes-filter-clear is-compact" style="display: none;">
          Clear All
        </button>
      </div>
    </div>

    <section class="approved-quotes-table">
      <div style="padding: 0px;">
        <div class="workers-container" style="display: flex; gap: 20px; height: calc(-200px + 100vh); flex-direction: row;">
          <div class="workers-table-panel" style="flex: 1 1 0%; min-width: 300px; display: flex; flex-direction: column; height: auto;">
            <div class="workers-table">
              <div class="mes-table-container">
                <table id="approved-quotes-table" class="mes-table">
                  <thead class="mes-table-header">
                    <tr>
                      <th style="min-width: 80px;">
                        <button type="button" onclick="sortApprovedQuotes('woCode')" class="mes-sort-button">
                          WO Code <span class="mes-sort-icon">↕</span>
                        </button>
                      </th>
                      <th style="min-width: 160px;">
                        <button type="button" onclick="sortApprovedQuotes('customer')" class="mes-sort-button">
                          Customer <span class="mes-sort-icon">↕</span>
                        </button>
                      </th>
                      <th style="min-width: 160px;">
                        <button type="button" onclick="sortApprovedQuotes('company')" class="mes-sort-button">
                          Company <span class="mes-sort-icon">↕</span>
                        </button>
                      </th>
                      <th style="min-width: 140px;">
                        <button type="button" onclick="sortApprovedQuotes('deliveryDate')" class="mes-sort-button">
                          Delivery Date <span class="mes-sort-icon">↕</span>
                        </button>
                      </th>
                      <th style="min-width: 160px;">
                        <button type="button" onclick="sortApprovedQuotes('productionPlan')" class="mes-sort-button">
                          Production Plan <span class="mes-sort-icon">↕</span>
                        </button>
                      </th>
                      <th style="min-width: 180px;">
                        <button type="button" onclick="sortApprovedQuotes('productionState')" class="mes-sort-button">
                          Üretim Durumu <span class="mes-sort-icon">↕</span>
                        </button>
                      </th>
                      <th style="min-width: 200px;">Actions</th>
                    </tr>
                  </thead>
                  <tbody id="approved-quotes-table-body" class="mes-table-body">
                    <tr class="mes-table-row is-empty">
                      <td colspan="7" class="mes-empty-cell text-center"><em>Loading quotes...</em></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div class="worker-detail-panel" id="approved-quote-detail-panel" style="flex: 1 1 0%; min-width: 400px; height: auto; display: none;">
            <div style="background: white; border-radius: 6px; border: 1px solid rgb(229, 231, 235); height: 100%; display: flex; flex-direction: column;">
              <div style="padding: 16px 20px; border-bottom: 1px solid rgb(229, 231, 235); display: flex; justify-content: space-between; align-items: center;">
                <div style="display: flex; align-items: center; gap: 12px;">
                  <button title="Detayları Kapat" onclick="closeApprovedQuoteDetail()" style="padding: 6px 12px; border: 1px solid rgb(209, 213, 219); border-radius: 4px; background: white; color: rgb(55, 65, 81); cursor: pointer; font-size: 12px;">←</button>
                  <h3 style="margin: 0px; font-size: 16px; font-weight: 600; color: rgb(17, 24, 39);">Teklif Detayları</h3>
                </div>
              </div>
              <div style="flex: 1 1 0%; overflow: auto; padding: 20px;">
                <div id="approved-quote-detail-content"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  `;
}

// CSS for metadata column visibility
export function injectMetadataToggleStyles() {
  if (document.getElementById('metadata-toggle-styles')) return;
  
  const style = document.createElement('style');
  style.id = 'metadata-toggle-styles';
  style.textContent = `
    .metadata-column {
      transition: opacity 0.2s ease, width 0.2s ease;
    }
    
    .metadata-column.hidden {
      display: none !important;
    }
    
    .metadata-toggle-btn {
      background: none;
      border: 1px solid var(--border);
      border-radius: 4px;
      padding: 4px 8px;
      font-size: 11px;
      color: var(--muted-foreground);
      cursor: pointer;
      margin-left: 8px;
      transition: all 0.2s ease;
    }
    
    .metadata-toggle-btn:hover {
      background: var(--muted);
      color: var(--foreground);
    }
    
    .metadata-toggle-btn.active {
      background: var(--primary);
      color: white;
      border-color: var(--primary);
    }
  `;
  document.head.appendChild(style);
}

// Toggle metadata columns visibility
export function toggleMetadataColumns() {
  tableState.showMetadataColumns = !tableState.showMetadataColumns;
  
  const metadataColumns = document.querySelectorAll('.metadata-column');
  const toggleBtn = document.querySelector('.metadata-toggle-btn');
  
  metadataColumns.forEach(col => {
    if (tableState.showMetadataColumns) {
      col.classList.remove('hidden');
    } else {
      col.classList.add('hidden');
    }
  });
  
  if (toggleBtn) {
    toggleBtn.textContent = tableState.showMetadataColumns ? 'Hide Details' : 'Show Details';
    toggleBtn.classList.toggle('active', tableState.showMetadataColumns);
  }
}

// ============================================================================
// DASHBOARD WIDGET LOADERS
// ============================================================================

/**
 * Initialize Active Tasks widget on dashboard
 * Loads task counts from all workers
 */
export async function initActiveTasksWidget() {
  const container = document.getElementById('active-tasks-widget');
  if (!container) return;
  
  try {
    // Import API functions dynamically
    const { getWorkerPortalTasks, getWorkers } = await import('./mesApi.js');
    
    // Get real workers from Firestore (not hardcoded state.js mock data)
    const workers = await getWorkers();
    
    // If no workers exist yet, show empty state
    if (!workers || workers.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; padding: 24px; color: var(--muted-foreground);">
          <div style="font-size: 32px; margin-bottom: 8px;"><i class="fa-solid fa-hard-hat"></i></div>
          <div style="font-size: 14px;">Henüz işçi kaydı yok</div>
          <div style="font-size: 11px; color: #9ca3af; margin-top: 4px;">Workers sekmesinden işçi ekleyebilirsiniz</div>
        </div>
      `;
      return;
    }
    
    // Aggregate task counts across all workers
    let totalReady = 0;
    let totalInProgress = 0;
    let totalPaused = 0;
    let totalPending = 0;
    let failedWorkers = [];
    
    for (const worker of workers) {
      try {
        // Pass workerId explicitly so admin requests use query param
        const result = await getWorkerPortalTasks(worker.id);
        const tasks = result.tasks || [];
        
        totalReady += tasks.filter(t => t.status === 'ready').length;
        totalInProgress += tasks.filter(t => t.status === 'in_progress').length;
        totalPaused += tasks.filter(t => t.status === 'paused').length;
        totalPending += tasks.filter(t => t.status === 'pending').length;
      } catch (err) {
        console.warn(`Failed to load tasks for worker ${worker.id}:`, err);
        failedWorkers.push({ id: worker.id, name: worker.name, error: err.message });
      }
    }
    
    // Show warning if some workers failed
    const warningHtml = failedWorkers.length > 0 ? `
      <div style="margin-top: 12px; padding: 10px; background: #fef3c7; border-left: 3px solid #f59e0b; border-radius: 4px;">
        <div style="font-size: 12px; color: #92400e; font-weight: 600; margin-bottom: 4px;">
          <i class="fa-solid fa-exclamation-triangle" style="color: #f59e0b;"></i> ${failedWorkers.length} işçi için görevler yüklenemedi
        </div>
        <div style="font-size: 11px; color: #78350f;">
          ${failedWorkers.map(w => `${w.name || w.id}: ${w.error}`).join('<br>')}
        </div>
      </div>
    ` : '';
    
    // Render widget content
    container.innerHTML = `
      <div style="display: flex; flex-direction: column; gap: 12px;">
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px; background: #dbeafe; border-radius: 8px;">
          <div>
            <div style="font-size: 13px; color: #1e40af; font-weight: 500;">Devam Ediyor</div>
            <div style="font-size: 24px; font-weight: 700; color: #1e3a8a;">${totalInProgress}</div>
          </div>
          <div style="font-size: 32px;">▶️</div>
        </div>
        
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px; background: #d1fae5; border-radius: 8px;">
          <div>
            <div style="font-size: 13px; color: #065f46; font-weight: 500;">Hazır</div>
            <div style="font-size: 24px; font-weight: 700; color: #064e3b;">${totalReady}</div>
          </div>
          <div style="font-size: 32px;"><i class="fa-solid fa-check-circle" style="color: #10b981;"></i></div>
        </div>
        
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px; background: #fed7aa; border-radius: 8px;">
          <div>
            <div style="font-size: 13px; color: #92400e; font-weight: 500;">Duraklatıldı</div>
            <div style="font-size: 24px; font-weight: 700; color: #78350f;">${totalPaused}</div>
          </div>
          <div style="font-size: 32px;">⏸️</div>
        </div>
        
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px; background: #f3f4f6; border-radius: 8px;">
          <div>
            <div style="font-size: 13px; color: #6b7280; font-weight: 500;">Bekliyor</div>
            <div style="font-size: 24px; font-weight: 700; color: #374151;">${totalPending}</div>
          </div>
          <div style="font-size: 32px;"><i class="fa-solid fa-clock" style="color: #f59e0b;"></i></div>
        </div>
        ${warningHtml}
      </div>
    `;
  } catch (err) {
    console.error('Failed to load active tasks widget:', err);
    const errorMessage = err.message || 'Bilinmeyen hata';
    container.innerHTML = `
      <div style="padding: 16px; text-align: center; color: #ef4444; background: #fee; border-radius: 8px;">
        <div style="font-size: 32px; margin-bottom: 8px;"><i class="fa-solid fa-exclamation-triangle" style="color: #f59e0b;"></i></div>
        <div style="font-size: 14px; font-weight: 600; margin-bottom: 4px;">Görevler yüklenemedi</div>
        <div style="font-size: 12px; color: #991b1b;">${errorMessage}</div>
      </div>
    `;
  }
}

/**
 * Initialize Work Packages widget on dashboard
 * Loads all active assignments across all launched plans
 */
let workPackagesState = {
  allPackages: [],
  filteredPackages: [],
  workers: [],
  stations: [],
  searchTerm: '',
  statusFilters: [],
  workerFilters: [],
  stationFilters: [],
  hideCompleted: true, // Default: hide completed tasks
  isRefreshing: false,
  refreshDebounceTimer: null
};

export async function initWorkPackagesWidget() {
  const container = document.getElementById('work-packages-widget');
  if (!container) return;
  
  try {
    // Import API functions
    const { getWorkPackages, getWorkers, getStations } = await import('./mesApi.js');
    
    // Load data in parallel
    const [packagesData, workers, stations] = await Promise.all([
      getWorkPackages({ limit: 200 }),
      getWorkers(),
      getStations()
    ]);
    
    workPackagesState.allPackages = packagesData.workPackages || [];
    workPackagesState.workers = workers || [];
    workPackagesState.stations = stations || [];
    workPackagesState.filteredPackages = workPackagesState.allPackages;
    
    // Populate filter dropdowns
    populateWorkPackagesFilters();
    
    // Bind event listeners
    bindWorkPackagesEvents();
    
    // Setup auto-refresh listeners
    setupWorkPackagesAutoRefresh();
    
    // Render table
    renderWorkPackagesTable();
    
  } catch (err) {
    console.error('Failed to load work packages widget:', err);
    const errorMessage = err.message || 'Bilinmeyen hata';
    workPackagesState.allPackages = [];
    workPackagesState.filteredPackages = [];
    renderWorkPackagesTable();
    const errorCell = container.querySelector('.mes-empty-cell');
    if (errorCell) {
      errorCell.innerHTML = `
        <div class="mes-error-text">Work packages yüklenemedi</div>
        <div class="mes-muted-text">${errorMessage}</div>
      `;
    }
  }
}

/**
 * Setup auto-refresh for Work Packages widget
 * Listens to both window events and BroadcastChannel
 */
function setupWorkPackagesAutoRefresh() {
  // Debounced refresh function to avoid hammering the API
  const debouncedRefresh = () => {
    // Clear existing timer
    if (workPackagesState.refreshDebounceTimer) {
      clearTimeout(workPackagesState.refreshDebounceTimer);
    }
    
    // Set new timer (500ms debounce)
    workPackagesState.refreshDebounceTimer = setTimeout(async () => {
      await refreshWorkPackagesData(false); // false = silent refresh (no button state change)
    }, 500);
  };
  
  // Listen to window event (legacy support)
  window.addEventListener('assignments:updated', (e) => {
    console.log('Work Packages: Received window event assignments:updated', e.detail);
    debouncedRefresh();
  });
  
  // Listen to BroadcastChannel
  try {
    const assignmentsChannel = new BroadcastChannel('mes-assignments');
    assignmentsChannel.onmessage = (e) => {
      if (e.data && e.data.type === 'assignments:updated') {
        console.log('Work Packages: Received BroadcastChannel message', e.data);
        debouncedRefresh();
      }
    };
    
    // Store reference for cleanup if needed
    workPackagesState.broadcastChannel = assignmentsChannel;
  } catch (err) {
    console.warn('BroadcastChannel not supported, falling back to window events only:', err);
  }
}

/**
 * Refresh work packages data
 * @param {boolean} showButtonState - Whether to update refresh button state
 */
async function refreshWorkPackagesData(showButtonState = true) {
  // Prevent concurrent refreshes
  if (workPackagesState.isRefreshing) {
    console.log('Work Packages: Refresh already in progress, skipping');
    return;
  }
  
  workPackagesState.isRefreshing = true;
  
  const refreshBtn = document.getElementById('work-packages-refresh-btn');
  const container = document.getElementById('work-packages-widget');
  
  try {
    // Show refreshing state
    if (showButtonState && refreshBtn) {
      refreshBtn.disabled = true;
      refreshBtn.innerHTML = '<span><i class="fa-solid fa-spinner fa-spin"></i></span> Loading...';
    }
    
    // Import API functions
    const { getWorkPackages, clearWorkPackagesCache } = await import('./mesApi.js');
    
    // Clear cache and fetch fresh data
    clearWorkPackagesCache();
    const packagesData = await getWorkPackages({ limit: 200 }, true);
    
    // Update state
    workPackagesState.allPackages = packagesData.workPackages || [];
    
    // Reapply filters
    applyWorkPackagesFilters();
    
    // Re-render table
    renderWorkPackagesTable();
    
    console.log(`✓ Work Packages refreshed: ${workPackagesState.allPackages.length} packages loaded`);
    
  } catch (err) {
    console.error('Work Packages refresh failed:', err);
    if (showButtonState) {
      alert('Refresh failed: ' + err.message);
    }
  } finally {
    workPackagesState.isRefreshing = false;
    
    // Restore button state
    if (showButtonState && refreshBtn) {
      refreshBtn.disabled = false;
      refreshBtn.innerHTML = '<span>🔄</span> Refresh';
    }
    
    // Remove loading overlay
    const loadingOverlay = document.getElementById('wp-loading-overlay');
    if (loadingOverlay) {
      loadingOverlay.remove();
    }
  }
}

function populateWorkPackagesFilters() {
  const statusOptions = ['pending', 'ready', 'in-progress', 'paused', 'completed', 'cancelled'];
  
  // Status filter
  const statusList = document.getElementById('wp-filter-status-list');
  if (statusList) {
    statusList.innerHTML = statusOptions.map(status => `
      <label>
        <input type="checkbox" value="${status}" onchange="handleWPFilterChange('status', this)">
        <span>${status}</span>
      </label>
    `).join('');
  }

  // Workers filter
  const workersList = document.getElementById('wp-filter-workers-list');
  if (workersList && workPackagesState.workers.length > 0) {
    workersList.innerHTML = workPackagesState.workers.map(w => `
      <label>
        <input type="checkbox" value="${w.id}" onchange="handleWPFilterChange('workers', this)">
        <span>${w.name}</span>
      </label>
    `).join('');
  }
  
  // Stations filter
  const stationsList = document.getElementById('wp-filter-stations-list');
  if (stationsList && workPackagesState.stations.length > 0) {
    stationsList.innerHTML = workPackagesState.stations.map(s => `
      <label>
        <input type="checkbox" value="${s.id}" onchange="handleWPFilterChange('stations', this)">
        <span>${s.name}</span>
      </label>
    `).join('');
  }
}

// Work Packages Filter Panel Controls (Global - called from onclick)
window.toggleWPFilterPanel = function(type) {
  const panel = document.getElementById(`wp-filter-${type}-panel`);
  if (!panel) return;
  const isOpen = panel.style.display === 'block';
  // Close all panels first
  ['status', 'workers', 'stations'].forEach(n => {
    const p = document.getElementById(`wp-filter-${n}-panel`);
    if (p) p.style.display = 'none';
  });
  // Toggle current panel
  panel.style.display = isOpen ? 'none' : 'block';
};

window.hideWPFilterPanel = function(type) {
  const panel = document.getElementById(`wp-filter-${type}-panel`);
  if (panel) panel.style.display = 'none';
};

window.clearWPFilter = function(type) {
  const filterProp = getWPFilterProperty(type);
  if (!filterProp || !workPackagesState[filterProp]) {
    console.error(`Invalid filter type: ${type}`);
    return;
  }
  
  workPackagesState[filterProp] = [];
  const list = document.getElementById(`wp-filter-${type}-list`);
  if (list) {
    list.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = false);
  }
  updateWPFilterCount(type);
  applyWorkPackagesFilters();
  renderWorkPackagesTable();
  updateWPClearFiltersButton();
};

window.searchWPFilter = function(type, searchInput) {
  const searchTerm = searchInput.value.toLowerCase();
  const list = document.getElementById(`wp-filter-${type}-list`);
  if (!list) return;
  const labels = list.querySelectorAll('label');
  labels.forEach(label => {
    const text = label.textContent.toLowerCase();
    label.style.display = text.includes(searchTerm) ? '' : 'none';
  });
};

// Helper function to get correct filter property name
function getWPFilterProperty(type) {
  const mapping = {
    'status': 'statusFilters',
    'workers': 'workerFilters',
    'stations': 'stationFilters'
  };
  return mapping[type];
}

window.handleWPFilterChange = function(type, checkbox) {
  const filterProp = getWPFilterProperty(type);
  if (!filterProp || !workPackagesState[filterProp]) {
    console.error(`Invalid filter type: ${type}`);
    return;
  }
  
  const value = checkbox.value;
  if (checkbox.checked) {
    if (!workPackagesState[filterProp].includes(value)) {
      workPackagesState[filterProp].push(value);
    }
  } else {
    workPackagesState[filterProp] = workPackagesState[filterProp].filter(v => v !== value);
  }
  updateWPFilterCount(type);
  applyWorkPackagesFilters();
  renderWorkPackagesTable();
  updateWPClearFiltersButton();
};

window.clearAllWPFilters = function() {
  const searchInput = document.getElementById('wp-search-input');
  
  workPackagesState.searchTerm = '';
  workPackagesState.statusFilters = [];
  workPackagesState.workerFilters = [];
  workPackagesState.stationFilters = [];
  
  if (searchInput) searchInput.value = '';
  
  // Clear all checkboxes
  document.querySelectorAll('#wp-filter-status-list input[type="checkbox"]').forEach(cb => cb.checked = false);
  document.querySelectorAll('#wp-filter-workers-list input[type="checkbox"]').forEach(cb => cb.checked = false);
  document.querySelectorAll('#wp-filter-stations-list input[type="checkbox"]').forEach(cb => cb.checked = false);
  
  // Update counts
  updateWPFilterCount('status');
  updateWPFilterCount('workers');
  updateWPFilterCount('stations');
  
  applyWorkPackagesFilters();
  renderWorkPackagesTable();
  updateWPClearFiltersButton();
};

function updateWPFilterCount(type) {
  const countEl = document.getElementById(`wp-filter-${type}-count`);
  if (!countEl) return;
  const filterProp = getWPFilterProperty(type);
  if (!filterProp) return;
  const count = workPackagesState[filterProp]?.length || 0;
  countEl.textContent = count ? `(${count})` : '';
}

function updateWPClearFiltersButton() {
  const clearBtn = document.getElementById('wp-clear-filters-btn');
  if (!clearBtn) return;
  const hasFilters = Boolean(
    workPackagesState.searchTerm ||
    workPackagesState.statusFilters.length ||
    workPackagesState.workerFilters.length ||
    workPackagesState.stationFilters.length
  );
  clearBtn.style.display = hasFilters ? 'inline-flex' : 'none';
}

function bindWorkPackagesEvents() {
  // Refresh button
  const refreshBtn = document.getElementById('work-packages-refresh-btn');
  if (refreshBtn) {
    refreshBtn.onclick = async () => {
      await refreshWorkPackagesData(true); // true = show button state
    };
  }
  
  // Search input
  const searchInput = document.getElementById('wp-search-input');
  const clearBtn = document.getElementById('wp-clear-filters-btn');

  if (searchInput) {
    searchInput.oninput = (e) => {
      workPackagesState.searchTerm = e.target.value.toLowerCase();
      applyWorkPackagesFilters();
      renderWorkPackagesTable();
      updateWPClearFiltersButton();
    };
  }


  
  // Hide completed toggle
  const hideCompletedWrapper = document.getElementById('wp-hide-completed-wrapper');
  const hideCompletedToggle = document.getElementById('wp-hide-completed-toggle');
  const hideCompletedText = document.getElementById('wp-hide-completed-text');
  if (hideCompletedToggle) {
    hideCompletedToggle.checked = workPackagesState.hideCompleted;
    updateHideCompletedToggle();

    hideCompletedToggle.onchange = () => {
      workPackagesState.hideCompleted = hideCompletedToggle.checked;
      updateHideCompletedToggle();
      applyWorkPackagesFilters();
      renderWorkPackagesTable();
    };
  }

  function updateHideCompletedToggle() {
    if (!hideCompletedToggle) return;

    if (workPackagesState.hideCompleted) {
      if (hideCompletedText) hideCompletedText.textContent = 'Hide Completed';
      if (hideCompletedWrapper) hideCompletedWrapper.title = 'Click to show completed tasks';
    } else {
      if (hideCompletedText) hideCompletedText.textContent = 'Show Completed';
      if (hideCompletedWrapper) hideCompletedWrapper.title = 'Click to hide completed tasks';
    }
  }
  
  // Initialize clear filters button
  updateWPClearFiltersButton();
}



function applyWorkPackagesFilters() {
  let filtered = workPackagesState.allPackages;
  
  // Hide completed filter (applied first)
  if (workPackagesState.hideCompleted) {
    filtered = filtered.filter(pkg => pkg.status !== 'completed' && pkg.status !== 'cancelled');
  }
  
  // Search filter
  if (workPackagesState.searchTerm) {
    const term = workPackagesState.searchTerm;
    filtered = filtered.filter(pkg => {
      const searchFields = [
        pkg.workOrderCode,
        pkg.customer,
        pkg.company,
        pkg.planName,
        pkg.nodeName,
        pkg.workerName,
        pkg.stationName
      ].join(' ').toLowerCase();
      return searchFields.includes(term);
    });
  }
  
  // Status filter
  if (workPackagesState.statusFilters.length > 0) {
    filtered = filtered.filter(pkg => workPackagesState.statusFilters.includes(pkg.status));
  }
  
  // Worker filter
  if (workPackagesState.workerFilters.length > 0) {
    filtered = filtered.filter(pkg => workPackagesState.workerFilters.includes(pkg.workerId));
  }
  
  // Station filter
  if (workPackagesState.stationFilters.length > 0) {
    filtered = filtered.filter(pkg => workPackagesState.stationFilters.includes(pkg.stationId));
  }
  
  workPackagesState.filteredPackages = filtered;
}

function renderWorkPackagesTable() {
  const container = document.getElementById('work-packages-widget');
  if (!container) return;
  
  const packages = workPackagesState.filteredPackages;
  const esc = (str) => String(str ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
  
  const getStatusBadge = (status) => {
    const statusMap = {
      'pending': { label: 'Pending', className: 'badge badge-outline' },
      'ready': { label: 'Ready', className: 'badge badge-warning' },
      'in-progress': { label: 'In Progress', className: 'badge badge-success' },
      'paused': { label: 'Paused', className: 'badge badge-destructive' },
      'completed': { label: 'Completed', className: 'badge badge-success' },
      'cancelled': { label: 'Cancelled', className: 'badge badge-destructive' }
    };
    const s = statusMap[status] || { label: status, className: 'badge badge-outline' };
    return `<span class="${s.className}" style="padding: 1px 8px;">${s.label}</span>`;
  };
  
  const getMaterialBadge = (status) => {
    if (status === 'ok') return '<span class="badge badge-success" style="padding: 1px 8px; font-size: 0.75rem;">OK</span>';
    if (status === 'short') return '<span class="badge badge-destructive" style="padding: 1px 8px; font-size: 0.75rem;">Short</span>';
    return '<span class="badge badge-outline" style="padding: 1px 8px; font-size: 0.75rem;">Unknown</span>';
  };
  
  const formatTime = (iso) => {
    if (!iso) return '—';
    try {
      const date = new Date(iso);
      return date.toLocaleString('tr-TR', { 
        month: 'short', 
        day: 'numeric', 
        hour: '2-digit', 
        minute: '2-digit' 
      });
    } catch {
      return '—';
    }
  };
  
  const tableRows = packages.map(pkg => {
    const quoteUrl = `/pages/production.html?view=approved-quotes&highlight=${encodeURIComponent(pkg.workOrderCode)}`;
    const planUrl = `/pages/production.html?view=plan-designer&action=view&id=${encodeURIComponent(pkg.planId)}`;
    
    return `
      <tr class="mes-table-row" onclick="(async () => await showWorkPackageDetail('${esc(pkg.assignmentId || pkg.id)}'))()" style="cursor: pointer;">
        <td>
          <div class="mes-muted-text" style="font-size: 11px; font-family: monospace;">
            ${esc(pkg.assignmentId || pkg.id || '—')}
          </div>
        </td>
        <td>
          <div>
            <a href="${quoteUrl}" target="_blank" rel="noopener" class="mes-muted-text" style="font-size: 11px; font-family: monospace; text-decoration: none;">
              ${esc(pkg.workOrderCode)}
            </a>
          </div>
          <div class="mes-muted-text">${esc(pkg.customer || pkg.company)}</div>
        </td>
        <td>
          <div>${esc(pkg.nodeName)}</div>
        </td>
        <td>
          <div>${esc(pkg.workerName)}</div>
        </td>
        <td>
          <div>${esc(pkg.stationName)}</div>
        </td>
        <td class="text-center">
          <div>${getStatusBadge(pkg.status)}</div>
        </td>
        <td class="text-center">
          <span class="mes-muted-text" style="font-weight: 600;">#${pkg.priority || 0}</span>
        </td>
        <td class="text-center">
          ${getMaterialBadge(pkg.materialStatus)}
        </td>
        <td>
          <div class="mes-muted-text" style="font-size: 50%;">Start: ${formatTime(pkg.actualStart || pkg.plannedStart)}</div>
          <div class="mes-muted-text" style="font-size: 50%;">End: ${formatTime(pkg.actualEnd || pkg.plannedEnd)}</div>
        </td>
      </tr>
    `;
  }).join('');
  
  const headerRow = `
    <tr>
      <th style="width: 1%; white-space: nowrap;">Work Package ID</th>
      <th style="width: 1%; white-space: nowrap;">Work Order</th>
      <th>Operation</th>
      <th>Worker</th>
      <th>Station</th>
      <th class="text-center" style="text-align: center;">Status</th>
      <th class="text-center" style="text-align: center; width: 1%; white-space: nowrap;">Priority</th>
      <th class="text-center" style="text-align: center; width: 1%; white-space: nowrap;">Materials</th>
      <th>ETA</th>
    </tr>
  `;

  const emptyRow = `
    <tr class="mes-table-row is-empty">
      <td colspan="9" class="mes-empty-cell text-center"><em>No work packages found</em></td>
    </tr>
  `;

  container.innerHTML = `
    <table class="mes-table">
      <thead class="mes-table-header">
        ${headerRow}
      </thead>
      <tbody class="mes-table-body">
        ${packages.length > 0 ? tableRows : emptyRow}
      </tbody>
    </table>
    ${packages.length > 0 ? `<div class="mes-muted-text" style="margin-top: 12px; text-align: center;">Showing ${packages.length} work package(s)${workPackagesState.allPackages.length !== packages.length ? ` of ${workPackagesState.allPackages.length} total` : ''}</div>` : ''}
  `;
}

/**
 * Initialize Station Alerts widget on dashboard
 * Loads last 5 station errors from mes-alerts collection
 */
export async function initStationAlertsWidget() {
  const container = document.getElementById('station-alerts-widget');
  if (!container) return;
  
  try {
    // Import API dependencies
    const { API_BASE, withAuth } = await import('../../../shared/lib/api.js');
    
    // Fetch alerts from mes-alerts collection
    const res = await fetch(`${API_BASE}/api/mes/alerts?type=station_error&limit=5`, {
      headers: withAuth()
    });
    
    // Handle API errors gracefully
    if (!res.ok) {
      const errorData = await res.json().catch(() => ({ message: `HTTP ${res.status}` }));
      console.warn('Alerts API error:', errorData);
      
      // Show empty state instead of error for 500s (likely empty collection)
      container.innerHTML = `
        <div style="text-align: center; padding: 24px; color: var(--muted-foreground);">
          <div style="font-size: 32px; margin-bottom: 8px;">📭</div>
          <div style="font-size: 14px;">Uyarı sistemi henüz kullanılmadı</div>
          <div style="font-size: 11px; color: #9ca3af; margin-top: 4px;">İstasyon hataları burada görünecek</div>
        </div>
      `;
      return;
    }
    
    const data = await res.json();
    const alerts = data.alerts || [];
    
    if (alerts.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; padding: 24px; color: var(--muted-foreground);">
          <div style="font-size: 32px; margin-bottom: 8px;">✅</div>
          <div style="font-size: 14px;">Aktif uyarı bulunmuyor</div>
        </div>
      `;
      return;
    }
    
    // Render alerts list
    const alertsHtml = alerts.map(alert => {
      const createdAt = new Date(alert.createdAt);
      const timeAgo = getTimeAgo(createdAt);
      
      return `
        <div style="padding: 12px; border-left: 3px solid #ef4444; background: #fef2f2; border-radius: 4px; margin-bottom: 8px;">
          <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 4px;">
            <div style="font-size: 13px; font-weight: 600; color: #991b1b;">
              İstasyon: ${alert.stationId || 'Belirsiz'}
            </div>
            <div style="font-size: 11px; color: #6b7280;">${timeAgo}</div>
          </div>
          <div style="font-size: 12px; color: #7f1d1d; margin-bottom: 4px;">
            ${alert.note || 'Hata açıklaması yok'}
          </div>
          <div style="font-size: 11px; color: #9ca3af;">
            Plan: ${alert.planId ? (alert.planId.startsWith('PPL-') ? alert.planId : alert.planId.slice(-10)) : '-'} | İşçi: ${alert.workerId || '-'}
          </div>
        </div>
      `;
    }).join('');
    
    container.innerHTML = alertsHtml;
  } catch (err) {
    console.error('Failed to load station alerts widget:', err);
    container.innerHTML = `
      <div style="text-align: center; padding: 16px; color: #9ca3af;">
        <div style="font-size: 32px; margin-bottom: 8px;">📭</div>
        <div style="font-size: 13px;">Uyarı sistemi henüz kullanılmadı</div>
        <div style="font-size: 11px; margin-top: 4px;">İstasyon hataları burada görünecek</div>
      </div>
    `;
  }
}

/**
 * Helper: Get human-readable time ago string
 */
function getTimeAgo(date) {
  const seconds = Math.floor((new Date() - date) / 1000);
  
  if (seconds < 60) return 'Az önce';
  if (seconds < 3600) return `${Math.floor(seconds / 60)} dk önce`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} saat önce`;
  return `${Math.floor(seconds / 86400)} gün önce`;
}

/**
 * Initialize Production Plans widget on dashboard
 * Loads recent/active production plans
 */
export async function initProductionPlansWidget() {
  const container = document.getElementById('production-plans-widget');
  if (!container) return;

  try {
    const { getProductionPlans } = await import('./mesApi.js');
    const plans = await getProductionPlans();

    if (!plans || plans.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; padding: 24px; color: var(--muted-foreground);">
          <div style="font-size: 32px; margin-bottom: 8px;"><i class="fa-solid fa-clipboard-list"></i></div>
          <div style="font-size: 14px;">Henüz üretim planı oluşturulmamış</div>
          <div style="font-size: 11px; color: #9ca3af; margin-top: 4px;">Route Designer'dan yeni plan oluşturabilirsiniz</div>
        </div>
      `;
      return;
    }

    // Show most recent 5 plans
    const recentPlans = plans.slice(0, 5);
    
    const plansHtml = recentPlans.map(plan => {
      const createdAt = new Date(plan.createdAt);
      const statusColors = {
        draft: '#9ca3af',
        active: '#10b981',
        completed: '#3b82f6',
        cancelled: '#ef4444'
      };
      const statusColor = statusColors[plan.status] || '#6b7280';

      return `
        <div style="padding: 12px; border-left: 3px solid ${statusColor}; background: #f9fafb; border-radius: 4px; margin-bottom: 8px;">
          <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 4px;">
            <div style="font-size: 13px; font-weight: 600; color: #111827;">
              ${plan.planId || plan.id}
            </div>
            <div style="font-size: 11px; color: #6b7280;">${createdAt.toLocaleDateString('tr-TR')}</div>
          </div>
          <div style="font-size: 12px; color: #4b5563; margin-bottom: 4px;">
            ${plan.name || 'İsimsiz Plan'}
          </div>
          <div style="display: flex; gap: 8px; align-items: center;">
            <span style="font-size: 11px; padding: 2px 6px; background: ${statusColor}22; color: ${statusColor}; border-radius: 4px; font-weight: 500;">
              ${plan.status || 'draft'}
            </span>
            <span style="font-size: 11px; color: #9ca3af;">
              ${plan.blocks?.length || 0} blok
            </span>
          </div>
        </div>
      `;
    }).join('');

    container.innerHTML = plansHtml;

    // Update status bar
    const statusDiv = document.getElementById('status-plans');
    if (statusDiv) {
      statusDiv.innerHTML = `<strong>${plans.length}</strong> plan`;
    }
  } catch (err) {
    console.error('Failed to load production plans widget:', err);
    container.innerHTML = `
      <div style="text-align: center; padding: 16px; color: #9ca3af;">
        <div style="font-size: 32px; margin-bottom: 8px;">📭</div>
        <div style="font-size: 13px;">Planlar yüklenemedi</div>
        <div style="font-size: 11px; margin-top: 4px; color: #ef4444;">${err.message}</div>
      </div>
    `;
  }
}

/**
 * Initialize Operations Overview widget on dashboard
 */
export async function initOperationsOverviewWidget() {
  const container = document.getElementById('operations-overview-widget');
  if (!container) return;

  try {
    const { getOperations } = await import('./mesApi.js');
    const operations = await getOperations();

    const totalOps = operations.length;
    const withSkills = operations.filter(op => op.requiredSkills?.length > 0).length;
    const avgDuration = operations.length > 0
      ? Math.round(operations.reduce((sum, op) => sum + (op.standardTime || 0), 0) / operations.length)
      : 0;

    container.innerHTML = `
      <div style="display: flex; flex-direction: column; gap: 12px;">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <span style="font-size: 13px; color: #6b7280;">Toplam Operasyon</span>
          <span style="font-size: 20px; font-weight: 700; color: #111827;">${totalOps}</span>
        </div>
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <span style="font-size: 13px; color: #6b7280;">Beceri Gerektiren</span>
          <span style="font-size: 20px; font-weight: 700; color: #3b82f6;">${withSkills}</span>
        </div>
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <span style="font-size: 13px; color: #6b7280;">Ort. Süre</span>
          <span style="font-size: 20px; font-weight: 700; color: #10b981;">${avgDuration} dk</span>
        </div>
      </div>
    `;

    // Update status bar
    const statusDiv = document.getElementById('status-operations');
    if (statusDiv) {
      statusDiv.innerHTML = `<strong>${totalOps}</strong> operasyon`;
    }
  } catch (err) {
    console.error('Failed to load operations overview:', err);
    container.innerHTML = `
      <div style="text-align: center; padding: 16px; color: #ef4444;">
        <div style="font-size: 11px;">Yüklenemedi</div>
      </div>
    `;
  }
}

/**
 * Initialize Stations Overview widget on dashboard
 */
export async function initStationsOverviewWidget() {
  const container = document.getElementById('stations-overview-widget');
  if (!container) return;

  try {
    const { getStations } = await import('./mesApi.js');
    const stations = await getStations();

    const totalStations = stations.length;
    const multiOp = stations.filter(s => s.operationIds?.length > 1).length;
    const withSchedule = stations.filter(s => s.productionSchedule?.enabled).length;

    container.innerHTML = `
      <div style="display: flex; flex-direction: column; gap: 12px;">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <span style="font-size: 13px; color: #6b7280;">Toplam İstasyon</span>
          <span style="font-size: 20px; font-weight: 700; color: #111827;">${totalStations}</span>
        </div>
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <span style="font-size: 13px; color: #6b7280;">Çok Operasyonlu</span>
          <span style="font-size: 20px; font-weight: 700; color: #f59e0b;">${multiOp}</span>
        </div>
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <span style="font-size: 13px; color: #6b7280;">Zaman Planlı</span>
          <span style="font-size: 20px; font-weight: 700; color: #8b5cf6;">${withSchedule}</span>
        </div>
      </div>
    `;

    // Update status bar
    const statusDiv = document.getElementById('status-stations');
    if (statusDiv) {
      statusDiv.innerHTML = `<strong>${totalStations}</strong> istasyon`;
    }
  } catch (err) {
    console.error('Failed to load stations overview:', err);
    container.innerHTML = `
      <div style="text-align: center; padding: 16px; color: #ef4444;">
        <div style="font-size: 11px;">Yüklenemedi</div>
      </div>
    `;
  }
}

/**
 * Initialize Workers Overview widget on dashboard
 */
export async function initWorkersOverviewWidget() {
  const container = document.getElementById('workers-overview-widget');
  if (!container) return;

  try {
    const { getWorkers } = await import('./mesApi.js');
    const { aggregateWorkersByStatus, getStatusLabel } = await import('../../../shared/utils/workerStatus.js');
    
    const workers = await getWorkers();
    const statusCounts = aggregateWorkersByStatus(workers);
    
    const totalWorkers = workers.length;
    const activeWorkers = statusCounts.available + statusCounts.busy;
    const onLeaveWorkers = statusCounts.leaveSick + statusCounts.leaveVacation;

    container.innerHTML = `
      <div style="display: flex; flex-direction: column; gap: 12px;">
        <!-- Total and Active -->
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <span style="font-size: 13px; color: #6b7280;">Toplam İşçi</span>
          <span style="font-size: 20px; font-weight: 700; color: #111827;">${totalWorkers}</span>
        </div>
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <span style="font-size: 13px; color: #6b7280;">Çalışıyor</span>
          <span style="font-size: 20px; font-weight: 700; color: #10b981;">${statusCounts.available}</span>
        </div>
        
        <!-- Status breakdown -->
        <div style="padding-top: 8px; border-top: 1px solid #e5e7eb;">
          <div style="font-size: 11px; font-weight: 600; color: #9ca3af; margin-bottom: 8px; text-transform: uppercase;">Durum Dağılımı</div>
          ${statusCounts.busy > 0 ? `
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 4px 0;">
              <span style="font-size: 12px; color: #6b7280;">Meşgul</span>
              <span style="font-size: 14px; font-weight: 600; color: #f59e0b;">${statusCounts.busy}</span>
            </div>
          ` : ''}
          ${statusCounts.break > 0 ? `
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 4px 0;">
              <span style="font-size: 12px; color: #6b7280;">Mola</span>
              <span style="font-size: 14px; font-weight: 600; color: #3b82f6;">${statusCounts.break}</span>
            </div>
          ` : ''}
          ${statusCounts.leaveVacation > 0 ? `
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 4px 0;">
              <span style="font-size: 12px; color: #6b7280;">İzinli</span>
              <span style="font-size: 14px; font-weight: 600; color: #f97316;">${statusCounts.leaveVacation}</span>
            </div>
          ` : ''}
          ${statusCounts.leaveSick > 0 ? `
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 4px 0;">
              <span style="font-size: 12px; color: #6b7280;">Hasta</span>
              <span style="font-size: 14px; font-weight: 600; color: #ef4444;">${statusCounts.leaveSick}</span>
            </div>
          ` : ''}
          ${statusCounts.inactive > 0 ? `
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 4px 0;">
              <span style="font-size: 12px; color: #6b7280;">İşten ayrıldı</span>
              <span style="font-size: 14px; font-weight: 600; color: #6b7280;">${statusCounts.inactive}</span>
            </div>
          ` : ''}
        </div>
        
        <!-- Visual bar for available workers -->
        ${totalWorkers > 0 ? `
          <div style="padding-top: 8px; border-top: 1px solid #e5e7eb;">
            <div style="font-size: 11px; color: #9ca3af; margin-bottom: 4px;">Müsaitlik: ${Math.round((activeWorkers / totalWorkers) * 100)}%</div>
            <div style="background: #e5e7eb; height: 6px; border-radius: 3px; overflow: hidden;">
              <div style="background: linear-gradient(90deg, #10b981, #059669); height: 100%; width: ${(activeWorkers / totalWorkers) * 100}%;"></div>
            </div>
          </div>
        ` : ''}
      </div>
    `;

    // Update status bar
    const statusDiv = document.getElementById('status-workers');
    if (statusDiv) {
      statusDiv.innerHTML = `<strong>${activeWorkers}</strong> / ${totalWorkers} aktif`;
    }
  } catch (err) {
    console.error('Failed to load workers overview:', err);
    container.innerHTML = `
      <div style="text-align: center; padding: 16px; color: #ef4444;">
        <div style="font-size: 11px;">Yüklenemedi</div>
      </div>
    `;
  }
}

/**
 * Initialize all dashboard widgets
 */
export async function initDashboardWidgets() {
  await Promise.all([
    initProductionPlansWidget(),
    initOperationsOverviewWidget(),
    initStationsOverviewWidget(),
    initWorkersOverviewWidget(),
    initActiveTasksWidget(),
    initStationAlertsWidget(),
    initWorkPackagesWidget()
  ]);
}

/**
 * Show work package detail panel
 */
export async function showWorkPackageDetail(assignmentId) {
  const workPackage = workPackagesState.allPackages.find(pkg => pkg.assignmentId === assignmentId || pkg.id === assignmentId);
  if (!workPackage) return;

  // Debug: Log work package structure to see available fields
  console.log('Work Package Data:', workPackage);

  const detailPanel = document.getElementById('work-package-detail-panel');
  const detailContent = document.getElementById('work-package-detail-content');
  
  if (!detailPanel || !detailContent) return;

  // Show detail panel
  detailPanel.style.display = 'block';
  
  // Show loading state first
  detailContent.innerHTML = `
    <div style="padding: 20px; text-align: center;">
      <div style="font-size: 14px; color: rgb(107, 114, 128);">Yükleniyor...</div>
    </div>
  `;

  try {
    // Try to fetch additional details if we have workOrderCode or planId
    let additionalData = {};
    
    // Fetch work order details if available
    if (workPackage.workOrderCode) {
      try {
        const { getApprovedQuotes } = await import('./mesApi.js');
        const quotes = await getApprovedQuotes();
        const relatedQuote = quotes.find(q => q.workOrderCode === workPackage.workOrderCode);
        if (relatedQuote) {
          additionalData.quote = relatedQuote;
        }
      } catch (err) {
        console.warn('Failed to fetch work order details:', err);
      }
    }
    
    // Fetch plan details if available
    if (workPackage.planId) {
      try {
        const { getProductionPlans } = await import('./mesApi.js');
        const plans = await getProductionPlans();
        const relatedPlan = plans.find(p => p.id === workPackage.planId);
        if (relatedPlan) {
          additionalData.plan = relatedPlan;
        }
      } catch (err) {
        console.warn('Failed to fetch plan details:', err);
      }
    }
    
    // Generate work package detail content with additional data
    detailContent.innerHTML = generateWorkPackageDetailContent(workPackage, additionalData);
  } catch (err) {
    console.error('Failed to show work package detail:', err);
    detailContent.innerHTML = `
      <div style="padding: 20px; text-align: center; color: #ef4444;">
        <div style="font-size: 14px;">Detaylar yüklenemedi</div>
        <div style="font-size: 12px; margin-top: 4px;">${err.message || 'Bilinmeyen hata'}</div>
      </div>
    `;
  }
}

/**
 * Close work package detail panel
 */
export function closeWorkPackageDetail() {
  const detailPanel = document.getElementById('work-package-detail-panel');
  if (detailPanel) {
    detailPanel.style.display = 'none';
  }
}

/**
 * Generate work package detail content HTML
 */
function generateWorkPackageDetailContent(workPackage, additionalData = {}) {
  const esc = (str) => String(str ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
  
  const getStatusBadge = (status) => {
    const statusMap = {
      'pending': { label: 'Beklemede', className: 'badge badge-outline' },
      'ready': { label: 'Hazır', className: 'badge badge-warning' },
      'in-progress': { label: 'Devam Ediyor', className: 'badge badge-success' },
      'paused': { label: 'Duraklatıldı', className: 'badge badge-destructive' },
      'completed': { label: 'Tamamlandı', className: 'badge badge-success' },
      'cancelled': { label: 'İptal Edildi', className: 'badge badge-destructive' }
    };
    const s = statusMap[status] || { label: status, className: 'badge badge-outline' };
    return `<span class="${s.className}" style="padding: 1px 8px;">${s.label}</span>`;
  };
  
  const getMaterialBadge = (status) => {
    if (status === 'ok') return '<span class="badge badge-success" style="padding: 1px 8px; font-size: 0.75rem;">Hazır</span>';
    if (status === 'short') return '<span class="badge badge-destructive" style="padding: 1px 8px; font-size: 0.75rem;">Eksik</span>';
    return '<span class="badge badge-outline" style="padding: 1px 8px; font-size: 0.75rem;">Bilinmeyen</span>';
  };
  
  const formatTime = (iso) => {
    if (!iso) return '—';
    try {
      const date = new Date(iso);
      return date.toLocaleString('tr-TR', { 
        day: 'numeric',
        month: 'long', 
        year: 'numeric',
        hour: '2-digit', 
        minute: '2-digit' 
      });
    } catch {
      return '—';
    }
  };

  return `
    <div style="margin-bottom: 16px; padding: 12px; background: white; border-radius: 6px; border: 1px solid var(--border);">
      <h3 style="margin: 0 0 12px; font-size: 14px; font-weight: 600; color: rgb(17, 24, 39); border-bottom: 1px solid var(--border); padding-bottom: 6px;">Work Package Bilgileri</h3>
      <div class="detail-item" style="display: flex; align-items: flex-start; margin-bottom: 8px;">
        <span class="detail-label" style="font-weight: 600; font-size: 12px; color: rgb(55, 65, 81); min-width: 120px; margin-right: 8px;">Package ID:</span>
        <span style="flex: 1 1 0%; font-size: 12px; font-family: monospace;">${esc(workPackage.assignmentId || workPackage.id || '—')}</span>
      </div>
      <div class="detail-item" style="display: flex; align-items: flex-start; margin-bottom: 8px;">
        <span class="detail-label" style="font-weight: 600; font-size: 12px; color: rgb(55, 65, 81); min-width: 120px; margin-right: 8px;">Plan:</span>
        <span style="flex: 1 1 0%; font-size: 12px;">${esc(workPackage.planName || '—')}</span>
      </div>
      <div class="detail-item" style="display: flex; align-items: flex-start; margin-bottom: 0;">
        <span class="detail-label" style="font-weight: 600; font-size: 12px; color: rgb(55, 65, 81); min-width: 120px; margin-right: 8px;">Priority:</span>
        <span style="flex: 1 1 0%; font-size: 12px; font-weight: 600; color: var(--muted-foreground);">#${workPackage.priority || 0}</span>
      </div>
    </div>

    <div style="margin-bottom: 16px; padding: 12px; background: white; border-radius: 6px; border: 1px solid var(--border);">
      <h3 style="margin: 0 0 12px; font-size: 14px; font-weight: 600; color: rgb(17, 24, 39); border-bottom: 1px solid var(--border); padding-bottom: 6px;">Work Order Bilgileri</h3>
      <div class="detail-item" style="display: flex; align-items: flex-start; margin-bottom: 8px;">
        <span class="detail-label" style="font-weight: 600; font-size: 12px; color: rgb(55, 65, 81); min-width: 120px; margin-right: 8px;">Work Order:</span>
        <span style="flex: 1 1 0%; font-size: 12px; font-weight: 600;">${esc(workPackage.workOrderCode || '—')}</span>
      </div>
      <div class="detail-item" style="display: flex; align-items: flex-start; margin-bottom: 8px;">
        <span class="detail-label" style="font-weight: 600; font-size: 12px; color: rgb(55, 65, 81); min-width: 120px; margin-right: 8px;">Müşteri:</span>
        <span style="flex: 1 1 0%; font-size: 12px;">${esc((additionalData.quote && additionalData.quote.customer) || workPackage.customer || workPackage.company || '—')}</span>
      </div>
      ${(additionalData.quote && additionalData.quote.projectName) || workPackage.projectName ? `
      <div class="detail-item" style="display: flex; align-items: flex-start; margin-bottom: 8px;">
        <span class="detail-label" style="font-weight: 600; font-size: 12px; color: rgb(55, 65, 81); min-width: 120px; margin-right: 8px;">Proje:</span>
        <span style="flex: 1 1 0%; font-size: 12px;">${esc((additionalData.quote && additionalData.quote.projectName) || workPackage.projectName)}</span>
      </div>
      ` : ''}
      ${(additionalData.quote && additionalData.quote.description) || workPackage.description ? `
      <div class="detail-item" style="display: flex; align-items: flex-start; margin-bottom: 8px;">
        <span class="detail-label" style="font-weight: 600; font-size: 12px; color: rgb(55, 65, 81); min-width: 120px; margin-right: 8px;">Açıklama:</span>
        <span style="flex: 1 1 0%; font-size: 12px;">${esc((additionalData.quote && additionalData.quote.description) || workPackage.description)}</span>
      </div>
      ` : ''}
      ${(additionalData.quote && additionalData.quote.quantity) || workPackage.quantity ? `
      <div class="detail-item" style="display: flex; align-items: flex-start; margin-bottom: 8px;">
        <span class="detail-label" style="font-weight: 600; font-size: 12px; color: rgb(55, 65, 81); min-width: 120px; margin-right: 8px;">Miktar:</span>
        <span style="flex: 1 1 0%; font-size: 12px;">${esc((additionalData.quote && additionalData.quote.quantity) || workPackage.quantity)}${workPackage.unit ? ` ${esc(workPackage.unit)}` : ''}</span>
      </div>
      ` : ''}
      ${(additionalData.quote && additionalData.quote.deliveryDate) || workPackage.deliveryDate ? `
      <div class="detail-item" style="display: flex; align-items: flex-start; margin-bottom: 8px;">
        <span class="detail-label" style="font-weight: 600; font-size: 12px; color: rgb(55, 65, 81); min-width: 120px; margin-right: 8px;">Teslim Tarihi:</span>
        <span style="flex: 1 1 0%; font-size: 12px;">${formatTime((additionalData.quote && additionalData.quote.deliveryDate) || workPackage.deliveryDate)}</span>
      </div>
      ` : ''}
      ${(additionalData.quote && additionalData.quote.orderDate) || workPackage.orderDate ? `
      <div class="detail-item" style="display: flex; align-items: flex-start; margin-bottom: 8px;">
        <span class="detail-label" style="font-weight: 600; font-size: 12px; color: rgb(55, 65, 81); min-width: 120px; margin-right: 8px;">Sipariş Tarihi:</span>
        <span style="flex: 1 1 0%; font-size: 12px;">${formatTime((additionalData.quote && additionalData.quote.orderDate) || workPackage.orderDate)}</span>
      </div>
      ` : ''}
      ${(additionalData.quote && additionalData.quote.quoteNumber) || workPackage.quoteId ? `
      <div class="detail-item" style="display: flex; align-items: flex-start; margin-bottom: 8px;">
        <span class="detail-label" style="font-weight: 600; font-size: 12px; color: rgb(55, 65, 81); min-width: 120px; margin-right: 8px;">Teklif No:</span>
        <span style="flex: 1 1 0%; font-size: 12px; font-family: monospace;">${esc((additionalData.quote && additionalData.quote.quoteNumber) || workPackage.quoteId)}</span>
      </div>
      ` : ''}
      ${(additionalData.quote && additionalData.quote.totalValue) ? `
      <div class="detail-item" style="display: flex; align-items: flex-start; margin-bottom: 8px;">
        <span class="detail-label" style="font-weight: 600; font-size: 12px; color: rgb(55, 65, 81); min-width: 120px; margin-right: 8px;">Toplam Değer:</span>
        <span style="flex: 1 1 0%; font-size: 12px; font-weight: 600; color: rgb(34, 197, 94);">${additionalData.quote.totalValue} ₺</span>
      </div>
      ` : ''}
      ${workPackage.description ? `
      <div class="detail-item" style="display: flex; align-items: flex-start; margin-bottom: 8px;">
        <span class="detail-label" style="font-weight: 600; font-size: 12px; color: rgb(55, 65, 81); min-width: 120px; margin-right: 8px;">Açıklama:</span>
        <span style="flex: 1 1 0%; font-size: 12px;">${esc(workPackage.description)}</span>
      </div>
      ` : ''}
      ${workPackage.quantity ? `
      <div class="detail-item" style="display: flex; align-items: flex-start; margin-bottom: 8px;">
        <span class="detail-label" style="font-weight: 600; font-size: 12px; color: rgb(55, 65, 81); min-width: 120px; margin-right: 8px;">Miktar:</span>
        <span style="flex: 1 1 0%; font-size: 12px;">${esc(workPackage.quantity)}${workPackage.unit ? ` ${esc(workPackage.unit)}` : ''}</span>
      </div>
      ` : ''}
      ${workPackage.deliveryDate ? `
      <div class="detail-item" style="display: flex; align-items: flex-start; margin-bottom: 8px;">
        <span class="detail-label" style="font-weight: 600; font-size: 12px; color: rgb(55, 65, 81); min-width: 120px; margin-right: 8px;">Teslim Tarihi:</span>
        <span style="flex: 1 1 0%; font-size: 12px;">${formatTime(workPackage.deliveryDate)}</span>
      </div>
      ` : ''}
      ${workPackage.orderDate ? `
      <div class="detail-item" style="display: flex; align-items: flex-start; margin-bottom: 8px;">
        <span class="detail-label" style="font-weight: 600; font-size: 12px; color: rgb(55, 65, 81); min-width: 120px; margin-right: 8px;">Sipariş Tarihi:</span>
        <span style="flex: 1 1 0%; font-size: 12px;">${formatTime(workPackage.orderDate)}</span>
      </div>
      ` : ''}
      ${workPackage.quoteId ? `
      <div class="detail-item" style="display: flex; align-items: flex-start; margin-bottom: 8px;">
        <span class="detail-label" style="font-weight: 600; font-size: 12px; color: rgb(55, 65, 81); min-width: 120px; margin-right: 8px;">Teklif ID:</span>
        <span style="flex: 1 1 0%; font-size: 12px; font-family: monospace;">${esc(workPackage.quoteId)}</span>
      </div>
      ` : ''}
      ${workPackage.projectName ? `
      <div class="detail-item" style="display: flex; align-items: flex-start; margin-bottom: 8px;">
        <span class="detail-label" style="font-weight: 600; font-size: 12px; color: rgb(55, 65, 81); min-width: 120px; margin-right: 8px;">Proje:</span>
        <span style="flex: 1 1 0%; font-size: 12px;">${esc(workPackage.projectName)}</span>
      </div>
      ` : ''}
      ${workPackage.notes ? `
      <div class="detail-item" style="display: flex; align-items: flex-start; margin-bottom: 0;">
        <span class="detail-label" style="font-weight: 600; font-size: 12px; color: rgb(55, 65, 81); min-width: 120px; margin-right: 8px;">Notlar:</span>
        <span style="flex: 1 1 0%; font-size: 12px; white-space: pre-wrap;">${esc(workPackage.notes)}</span>
      </div>
      ` : ''}
    </div>

    ${workPackage.productName || workPackage.productCode || workPackage.drawingNumber ? `
    <div style="margin-bottom: 16px; padding: 12px; background: white; border-radius: 6px; border: 1px solid var(--border);">
      <h3 style="margin: 0 0 12px; font-size: 14px; font-weight: 600; color: rgb(17, 24, 39); border-bottom: 1px solid var(--border); padding-bottom: 6px;">Ürün Bilgileri</h3>
      ${workPackage.productName ? `
      <div class="detail-item" style="display: flex; align-items: flex-start; margin-bottom: 8px;">
        <span class="detail-label" style="font-weight: 600; font-size: 12px; color: rgb(55, 65, 81); min-width: 120px; margin-right: 8px;">Ürün Adı:</span>
        <span style="flex: 1 1 0%; font-size: 12px; font-weight: 500;">${esc(workPackage.productName)}</span>
      </div>
      ` : ''}
      ${workPackage.productCode ? `
      <div class="detail-item" style="display: flex; align-items: flex-start; margin-bottom: 8px;">
        <span class="detail-label" style="font-weight: 600; font-size: 12px; color: rgb(55, 65, 81); min-width: 120px; margin-right: 8px;">Ürün Kodu:</span>
        <span style="flex: 1 1 0%; font-size: 12px; font-family: monospace;">${esc(workPackage.productCode)}</span>
      </div>
      ` : ''}
      ${workPackage.drawingNumber ? `
      <div class="detail-item" style="display: flex; align-items: flex-start; margin-bottom: 8px;">
        <span class="detail-label" style="font-weight: 600; font-size: 12px; color: rgb(55, 65, 81); min-width: 120px; margin-right: 8px;">Teknik Resim:</span>
        <span style="flex: 1 1 0%; font-size: 12px; font-family: monospace;">${esc(workPackage.drawingNumber)}</span>
      </div>
      ` : ''}
      ${workPackage.material ? `
      <div class="detail-item" style="display: flex; align-items: flex-start; margin-bottom: 0;">
        <span class="detail-label" style="font-weight: 600; font-size: 12px; color: rgb(55, 65, 81); min-width: 120px; margin-right: 8px;">Malzeme:</span>
        <span style="flex: 1 1 0%; font-size: 12px;">${esc(workPackage.material)}</span>
      </div>
      ` : ''}
    </div>
    ` : ''}

    ${additionalData.plan || workPackage.planName ? `
    <div style="margin-bottom: 16px; padding: 12px; background: white; border-radius: 6px; border: 1px solid var(--border);">
      <h3 style="margin: 0 0 12px; font-size: 14px; font-weight: 600; color: rgb(17, 24, 39); border-bottom: 1px solid var(--border); padding-bottom: 6px;">Plan Bilgileri</h3>
      <div class="detail-item" style="display: flex; align-items: flex-start; margin-bottom: 8px;">
        <span class="detail-label" style="font-weight: 600; font-size: 12px; color: rgb(55, 65, 81); min-width: 120px; margin-right: 8px;">Plan Adı:</span>
        <span style="flex: 1 1 0%; font-size: 12px; font-weight: 500;">${esc((additionalData.plan && additionalData.plan.name) || workPackage.planName)}</span>
      </div>
      ${additionalData.plan && additionalData.plan.id ? `
      <div class="detail-item" style="display: flex; align-items: flex-start; margin-bottom: 8px;">
        <span class="detail-label" style="font-weight: 600; font-size: 12px; color: rgb(55, 65, 81); min-width: 120px; margin-right: 8px;">Plan ID:</span>
        <span style="flex: 1 1 0%; font-size: 12px; font-family: monospace;">${esc(additionalData.plan.id)}</span>
      </div>
      ` : ''}
      ${additionalData.plan && additionalData.plan.description ? `
      <div class="detail-item" style="display: flex; align-items: flex-start; margin-bottom: 8px;">
        <span class="detail-label" style="font-weight: 600; font-size: 12px; color: rgb(55, 65, 81); min-width: 120px; margin-right: 8px;">Plan Açıklaması:</span>
        <span style="flex: 1 1 0%; font-size: 12px;">${esc(additionalData.plan.description)}</span>
      </div>
      ` : ''}
      ${additionalData.plan && additionalData.plan.type ? `
      <div class="detail-item" style="display: flex; align-items: flex-start; margin-bottom: 8px;">
        <span class="detail-label" style="font-weight: 600; font-size: 12px; color: rgb(55, 65, 81); min-width: 120px; margin-right: 8px;">Plan Tipi:</span>
        <span style="flex: 1 1 0%; font-size: 12px;">${esc(additionalData.plan.type)}</span>
      </div>
      ` : ''}
      ${additionalData.plan && (additionalData.plan.nodes && additionalData.plan.nodes.length > 0) ? `
      <div class="detail-item" style="display: flex; align-items: flex-start; margin-bottom: 8px;">
        <span class="detail-label" style="font-weight: 600; font-size: 12px; color: rgb(55, 65, 81); min-width: 120px; margin-right: 8px;">Toplam Operasyon:</span>
        <span style="flex: 1 1 0%; font-size: 12px; font-weight: 600;">${additionalData.plan.nodes.length} operasyon</span>
      </div>
      ` : ''}
      ${additionalData.plan && additionalData.plan.estimatedDuration ? `
      <div class="detail-item" style="display: flex; align-items: flex-start; margin-bottom: 8px;">
        <span class="detail-label" style="font-weight: 600; font-size: 12px; color: rgb(55, 65, 81); min-width: 120px; margin-right: 8px;">Tahmini Süre:</span>
        <span style="flex: 1 1 0%; font-size: 12px;">${additionalData.plan.estimatedDuration} dakika</span>
      </div>
      ` : ''}
      ${additionalData.plan && additionalData.plan.createdAt ? `
      <div class="detail-item" style="display: flex; align-items: flex-start; margin-bottom: 0;">
        <span class="detail-label" style="font-weight: 600; font-size: 12px; color: rgb(55, 65, 81); min-width: 120px; margin-right: 8px;">Plan Tarihi:</span>
        <span style="flex: 1 1 0%; font-size: 12px;">${formatTime(additionalData.plan.createdAt)}</span>
      </div>
      ` : ''}
    </div>
    ` : ''}

    <div style="margin-bottom: 16px; padding: 12px; background: white; border-radius: 6px; border: 1px solid var(--border);">
      <h3 style="margin: 0 0 12px; font-size: 14px; font-weight: 600; color: rgb(17, 24, 39); border-bottom: 1px solid var(--border); padding-bottom: 6px;">Operasyon & Atama</h3>
      <div class="detail-item" style="display: flex; align-items: flex-start; margin-bottom: 8px;">
        <span class="detail-label" style="font-weight: 600; font-size: 12px; color: rgb(55, 65, 81); min-width: 120px; margin-right: 8px;">Operasyon:</span>
        <span style="flex: 1 1 0%; font-size: 12px;">${esc(workPackage.nodeName || workPackage.operationName || '—')}</span>
      </div>
      <div class="detail-item" style="display: flex; align-items: flex-start; margin-bottom: 8px;">
        <span class="detail-label" style="font-weight: 600; font-size: 12px; color: rgb(55, 65, 81); min-width: 120px; margin-right: 8px;">İşçi:</span>
        <span style="flex: 1 1 0%; font-size: 12px;">${esc(workPackage.workerName || '—')}</span>
      </div>
      <div class="detail-item" style="display: flex; align-items: flex-start; margin-bottom: 8px;">
        <span class="detail-label" style="font-weight: 600; font-size: 12px; color: rgb(55, 65, 81); min-width: 120px; margin-right: 8px;">İstasyon:</span>
        <span style="flex: 1 1 0%; font-size: 12px;">
          ${esc(workPackage.stationName || '—')}
          ${workPackage.subStationCode ? `<br><span style="font-size: 11px; color: var(--muted-foreground); font-family: monospace;">${esc(workPackage.subStationCode)}</span>` : ''}
        </span>
      </div>
    </div>

    <div style="margin-bottom: 16px; padding: 12px; background: white; border-radius: 6px; border: 1px solid var(--border);">
      <h3 style="margin: 0 0 12px; font-size: 14px; font-weight: 600; color: rgb(17, 24, 39); border-bottom: 1px solid var(--border); padding-bottom: 6px;">Durum & Malzemeler</h3>
      <div class="detail-item" style="display: flex; align-items: flex-start; margin-bottom: 8px;">
        <span class="detail-label" style="font-weight: 600; font-size: 12px; color: rgb(55, 65, 81); min-width: 120px; margin-right: 8px;">Status:</span>
        <span style="flex: 1 1 0%; font-size: 12px;">${getStatusBadge(workPackage.status)}</span>
      </div>
      <div class="detail-item" style="display: flex; align-items: flex-start; margin-bottom: 0;">
        <span class="detail-label" style="font-weight: 600; font-size: 12px; color: rgb(55, 65, 81); min-width: 120px; margin-right: 8px;">Malzemeler:</span>
        <span style="flex: 1 1 0%; font-size: 12px;">${getMaterialBadge(workPackage.materialStatus)}</span>
      </div>
    </div>

    <div style="margin-bottom: 0; padding: 12px; background: white; border-radius: 6px; border: 1px solid var(--border);">
      <h3 style="margin: 0 0 12px; font-size: 14px; font-weight: 600; color: rgb(17, 24, 39); border-bottom: 1px solid var(--border); padding-bottom: 6px;">Zaman Bilgileri</h3>
      <div class="detail-item" style="display: flex; align-items: flex-start; margin-bottom: 8px;">
        <span class="detail-label" style="font-weight: 600; font-size: 12px; color: rgb(55, 65, 81); min-width: 120px; margin-right: 8px;">Planlanan Başlangıç:</span>
        <span style="flex: 1 1 0%; font-size: 12px;">${formatTime(workPackage.plannedStart)}</span>
      </div>
      <div class="detail-item" style="display: flex; align-items: flex-start; margin-bottom: 8px;">
        <span class="detail-label" style="font-weight: 600; font-size: 12px; color: rgb(55, 65, 81); min-width: 120px; margin-right: 8px;">Planlanan Bitiş:</span>
        <span style="flex: 1 1 0%; font-size: 12px;">${formatTime(workPackage.plannedEnd)}</span>
      </div>
      ${workPackage.actualStart ? `
      <div class="detail-item" style="display: flex; align-items: flex-start; margin-bottom: 8px;">
        <span class="detail-label" style="font-weight: 600; font-size: 12px; color: rgb(55, 65, 81); min-width: 120px; margin-right: 8px;">Gerçek Başlangıç:</span>
        <span style="flex: 1 1 0%; font-size: 12px;">${formatTime(workPackage.actualStart)}</span>
      </div>
      ` : ''}
      ${workPackage.actualEnd ? `
      <div class="detail-item" style="display: flex; align-items: flex-start; margin-bottom: 0;">
        <span class="detail-label" style="font-weight: 600; font-size: 12px; color: rgb(55, 65, 81); min-width: 120px; margin-right: 8px;">Gerçek Bitiş:</span>
        <span style="flex: 1 1 0%; font-size: 12px;">${formatTime(workPackage.actualEnd)}</span>
      </div>
      ` : ''}
    </div>
  `;
}
