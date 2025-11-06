// View generators (HTML strings)
import { MESData } from './state.js';

// Global state for table column visibility
export const tableState = {
  showMetadataColumns: false
};

export function updateKPIs() {
  const activeOrders = MESData.workOrders.filter(wo => wo.status !== 'completed').length;
  const completedToday = MESData.workOrders.filter(wo => wo.status === 'completed').length;
  const activeWorkers = MESData.workers.filter(w => w.status === 'active').length;
  const totalWorkers = MESData.workers.length;
  return {
    activeOrders,
    completedToday,
    efficiency: Math.round((completedToday / MESData.workOrders.length) * 100),
    onTimeDelivery: 96,
    activeWorkers,
    totalWorkers
  };
}

export function generateModernDashboard() {
  const kpis = updateKPIs();
  return `
    <div style="margin-bottom: 24px;">
      <h1 style="font-size: 32px; font-weight: 700; margin-bottom: 8px;">Production Dashboard</h1>
      <p style="color: var(--muted-foreground);">Üretim takibi ve KPI izleme - Last updated: ${new Date().toLocaleTimeString()}</p>
    </div>

    <!-- KPI Cards -->
    <div class="grid grid-cols-4" style="margin-bottom: 32px;">
      <div class="card kpi-card kpi-card-info">
        <div class="kpi-icon">📋</div>
        <div class="card-content">
          <div class="card-title">Active Orders</div>
          <div class="kpi-value">${kpis.activeOrders}</div>
          <div class="kpi-change"><span>↗</span> +2 new today</div>
        </div>
      </div>
      <div class="card kpi-card kpi-card-danger">
        <div class="kpi-icon">✅</div>
        <div class="card-content">
          <div class="card-title">Completed Today</div>
          <div class="kpi-value">${kpis.completedToday}</div>
          <div class="kpi-change"><span>↗</span> +5% vs yesterday</div>
        </div>
      </div>
      <div class="card kpi-card kpi-card-warning">
        <div class="kpi-icon">⚡</div>
        <div class="card-content">
          <div class="card-title">Active Workers</div>
          <div class="kpi-value">${kpis.activeWorkers}/${kpis.totalWorkers}</div>
          <div class="kpi-change"><span>•</span> realtime</div>
        </div>
      </div>
      <div class="card kpi-card kpi-card-success">
        <div class="kpi-icon">🎯</div>
        <div class="card-content">
          <div class="card-title">On-Time Delivery</div>
          <div class="kpi-value">${kpis.onTimeDelivery}%</div>
          <div class="kpi-change"><span>•</span> SLA</div>
        </div>
      </div>
    </div>

    <div class="card" style="margin-bottom: 24px;">
      <div class="card-content" style="padding: 16px 24px;">
        <div style="display: flex; align-items: center; gap: 16px;">
          <div class="status-indicator"><div class="status-dot status-online"></div><span>System Healthy</span></div>
          <div class="status-indicator"><div class="status-dot status-busy"></div><span>Network OK</span></div>
          <div class="status-indicator"><div class="status-dot status-online"></div><span>Stations: ${MESData.stations.filter(s => s.status === 'active').length}/${MESData.stations.length} Active</span></div>
          <div class="status-indicator"><div class="status-dot status-online"></div><span>Workers: ${kpis.activeWorkers}/${kpis.totalWorkers} Available</span></div>
          <div class="status-indicator"><div class="status-dot status-online"></div><span>Quality: All Systems OK</span></div>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-header">
        <div class="card-title">Active Work Orders</div>
        <div class="card-description">Current production orders in the system</div>
      </div>
      <div class="card-content">
        <table class="table">
          <thead>
            <tr>
              <th>Order ID</th>
              <th>Product</th>
              <th>Quantity</th>
              <th>Progress</th>
              <th>Status</th>
              <th>Due Date</th>
            </tr>
          </thead>
          <tbody>
            ${MESData.workOrders.map(order => `
              <tr>
                <td><strong>${order.id}</strong></td>
                <td>${order.product}</td>
                <td>${order.quantity} pcs</td>
                <td>
                  <div style="display: flex; align-items: center; gap: 8px;">
                    <div class="progress-enhanced" style="width: 120px;">
                      <div class="progress-indicator" style="width: ${order.progress}%; background: ${
                        order.progress === 100 ? 'linear-gradient(90deg, #10b981, #34d399)' :
                        order.progress >= 50 ? 'linear-gradient(90deg, #f59e0b, #fbbf24)' :
                        'linear-gradient(90deg, #6b7280, #9ca3af)'
                      };"></div>
                    </div>
                    <span style="font-size: 12px; color: var(--muted-foreground); font-weight: 500;">${order.progress}%</span>
                  </div>
                </td>
                <td><span class="badge badge-${
                  order.status === 'completed' ? 'success' :
                  order.status === 'in-progress' ? 'secondary' :
                  order.status === 'on-hold' ? 'warning' : 'default'
                }">${order.status.replace('-', ' ')}</span></td>
                <td>${new Date(order.dueDate).toLocaleDateString()}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

export function generateWorkerPanel() {
  return `
    <div style="margin-bottom: 24px;">
      <h1 style="font-size: 32px; font-weight: 700; margin-bottom: 8px;">Worker Panel</h1>
      <p style="color: var(--muted-foreground);">İşçi atama ve takip sistemi</p>
    </div>

    <div class="grid grid-cols-3" style="margin-bottom: 32px;">
      <div class="card"><div class="card-content"><div class="card-title">Active Workers</div><div class="kpi-value" style="color: #10b981;">8</div><div style="font-size: 14px; color: var(--muted-foreground);">Currently working</div></div></div>
      <div class="card"><div class="card-content"><div class="card-title">On Break</div><div class="kpi-value" style="color: #f59e0b;">2</div><div style="font-size: 14px; color: var(--muted-foreground);">Break time</div></div></div>
      <div class="card"><div class="card-content"><div class="card-title">Efficiency</div><div class="kpi-value" style="color: #3b82f6;">94%</div><div style="font-size: 14px; color: var(--muted-foreground);">Today's average</div></div></div>
    </div>

    <div class="card">
      <div class="card-header">
        <div class="card-title">Worker Status</div>
        <div class="card-description">Real-time worker availability and task assignments</div>
      </div>
      <div class="card-content">
        <table class="table">
          <thead><tr><th>Worker</th><th>Station</th><th>Current Task</th><th>Status</th><th>Completion</th></tr></thead>
          <tbody>
            <tr><td><strong>Ali Kaya</strong></td><td>Station A</td><td>Welding - WO-001</td><td><span class="badge badge-success">Active</span></td><td><div style="display:flex;align-items:center;gap:8px;"><div class="progress" style="width: 100px;"><div class="progress-indicator" style="width: 80%;"></div></div><span style="font-size: 12px;">80%</span></div></td></tr>
            <tr><td><strong>Mehmet Yılmaz</strong></td><td>Station B</td><td>Cutting - WO-002</td><td><span class="badge badge-success">Active</span></td><td><div style="display:flex;align-items:center;gap:8px;"><div class="progress" style="width: 100px;"><div class="progress-indicator" style="width: 45%;"></div></div><span style="font-size: 12px;">45%</span></div></td></tr>
            <tr><td><strong>Fatma Şahin</strong></td><td>Station C</td><td>Assembly - WO-003</td><td><span class="badge badge-warning">Break</span></td><td><div style="display:flex;align-items:center;gap:8px;"><div class="progress" style="width: 100px;"><div class="progress-indicator" style="width: 60%;"></div></div><span style="font-size: 12px;">60%</span></div></td></tr>
          </tbody>
        </table>
      </div>
    </div>
  `;
}

export function generateSettings() {
  return `
    <div style="margin-bottom: 16px;">
      <h1 style="font-size: 32px; font-weight: 700; margin-bottom: 8px;">Master Data</h1>
    </div>
    <div class="grid grid-cols-2">
      <div class="card"><div class="card-header" style="padding: 8px 12px;"><div class="card-title" style="font-size: 1.1em;">Skills Management</div></div><div class="card-content" style="padding: 8px 12px;">
        <div id="skills-management"></div>
      </div></div>
      <div class="card"><div class="card-header" style="padding: 8px 12px;"><div class="card-title" style="font-size: 1.1em;">Production settings</div></div><div class="card-content" style="padding: 8px 12px;"></div></div>
    </div>
  `;
}

export function generateWorkers() {
  return `
    <div style="margin-bottom: 24px;">
      <h1 style="font-size: 32px; font-weight: 700; margin-bottom: 8px;">Workers Management</h1>
      
    </div>
    <div class="workers-filter-compact" style="margin-bottom: 24px; display: flex; gap: 12px; align-items: center; justify-content: space-between;">
      <button onclick="openAddWorkerModal()" class="worker-add-button" style="background: var(--primary); color: var(--primary-foreground); height: 44px; padding: 0px 12px; border: none; border-radius: 6px; font-weight: 500; cursor: pointer;">+ Add Worker</button>
      <div style="display: flex; align-items: center; gap: 8px; flex: 1;">
        <input id="worker-filter-search" type="text" placeholder="Search workers..." class="worker-filter-input"
          style="height: 44px; padding: 6px 12px; border: 1px solid var(--border); border-radius: 6px; min-width: 200px; max-width: 500px; width: 100%; flex: 1 1 auto;">
        
        <div id="worker-filter-skills" style="position: relative;">
          <button id="worker-filter-skills-btn" type="button" class="worker-filter-button" style="height: 44px; padding: 6px 6px; border: 1px solid var(--border); background: white; border-radius: 6px; cursor: pointer; min-width: 160px; display: flex; align-items: center; gap: 8px;">
            <span>Skills</span>
            <span id="worker-filter-skills-count" style="color: var(--muted-foreground); font-size: 12px;"></span>
            <span style="margin-left: auto; opacity: .6">▾</span>
          </button>
          <div id="worker-filter-skills-panel" style="display:none; position: absolute; right: 0; margin-top: 6px; background: white; border: 1px solid var(--border); border-radius: 8px; box-shadow: 0 8px 24px rgba(0,0,0,0.08); width: 320px; max-height: 320px; overflow: hidden; z-index: 1000;">
            <div style="padding: 8px; border-bottom: 1px solid var(--border); display:flex; gap:6px; align-items:center; box-sizing: border-box;">
              <input id="worker-filter-skills-search" type="text" placeholder="Search skills..." class="worker-filter-panel-input"
                style="flex:1; min-width:0; padding: 3px 4px; font-size:12px; border: 1px solid var(--border); border-radius: 6px;">
              <button id="worker-filter-skills-clear" type="button" class="worker-filter-panel-button" style="flex:0 0 auto; white-space:nowrap; font-size:12px; padding:3px 4px; border:1px solid var(--border); background:white; border-radius:6px; cursor:pointer;">Clear</button>
              <button id="worker-filter-skills-hide" type="button" title="Kapat" class="worker-filter-panel-button" style="flex:0 0 auto; font-size:12px; padding:3px 4px; border:1px solid var(--border); background:white; border-radius:6px; cursor:pointer;">×</button>
            </div>
            <div id="worker-filter-skills-list" style="max-height: 240px; overflow: auto; padding: 8px; display: grid; gap: 6px;"></div>
          </div>
        </div>

        <div id="worker-filter-status" style="position: relative;">
          <button id="worker-filter-status-btn" type="button" class="worker-filter-button" style="height: 44px; padding: 6px 6px; border: 1px solid var(--border); background: white; border-radius: 6px; cursor: pointer; min-width: 160px; display: flex; align-items: center; gap: 8px;">
            <span>Status</span>
            <span id="worker-filter-status-count" style="color: var(--muted-foreground); font-size: 12px;"></span>
            <span style="margin-left: auto; opacity: .6">▾</span>
          </button>
          <div id="worker-filter-status-panel" style="display:none; position: absolute; right: 0; margin-top: 6px; background: white; border: 1px solid var(--border); border-radius: 8px; box-shadow: 0 8px 24px rgba(0,0,0,0.08); width: 220px; max-height: 260px; overflow: hidden; z-index: 1000;">
            <div style="padding: 8px; border-bottom: 1px solid var(--border); display:flex; gap:6px; align-items:center; justify-content:flex-end; box-sizing: border-box;">
              <button id="worker-filter-status-clear" type="button" class="worker-filter-panel-button" style="flex:0 0 auto; white-space:nowrap; font-size:12px; padding:3px 4px; border:1px solid var(--border); background:white; border-radius:6px; cursor:pointer;">Clear</button>
              <button id="worker-filter-status-hide" type="button" title="Kapat" class="worker-filter-panel-button" style="flex:0 0 auto; font-size:12px; padding:3px 4px; border:1px solid var(--border); background:white; border-radius:6px; cursor:pointer;">×</button>
            </div>
            <div id="worker-filter-status-list" style="max-height: 200px; overflow: auto; padding: 8px; display: grid; gap: 6px;"></div>
          </div>
        </div>
        
        <button id="worker-filter-clear-all" type="button" title="Tüm filtreleri temizle" class="worker-filter-button"
          style="display: none; height: 44px; padding: 0px 8px; border: 1px solid #ef4444; background: white; color: #ef4444; border-radius: 6px; cursor: pointer; font-size: 12px; font-weight: 500; margin-left: 8px;">
          Clear All
        </button>
      </div>
    </div>
    
    <section class="workers-table">
      <div style="padding: 0px;">
        <div class="workers-container" style="display: flex; gap: 20px; height: calc(-200px + 100vh); flex-direction: row;">
          <div class="workers-table-panel" style="flex: 1 1 0%; min-width: 300px; display: flex; flex-direction: column; height: auto;">
            <div class="workers-table">
              <div class="table-container" style="overflow-y: auto; border: 1px solid rgb(229, 231, 235); border-radius: 6px; background: white;">
                <table style="width: 100%; border-collapse: collapse;">
                  <thead style="background: rgb(248, 249, 250); position: sticky; top: 0px; z-index: 1;">
                    <tr>
                      <th class="worker-name-column" style="min-width: 160px; white-space: nowrap; padding: 8px; text-align: left;">
                        <button type="button" style="display: inline-flex; align-items: center; gap: 6px; background: none; border: medium; cursor: pointer; padding: 0px; color: inherit; font: inherit;">
                          Name <span style="font-size: 12px; opacity: 0.6;">↕</span>
                        </button>
                      </th>
                      <th class="worker-skills-column" style="min-width: 140px; white-space: nowrap; padding: 8px; text-align: left;">
                        <button type="button" style="display: inline-flex; align-items: center; gap: 6px; background: none; border: medium; cursor: pointer; padding: 0px; color: inherit; font: inherit;">
                          Skills <span style="font-size: 12px; opacity: 0.6;">↕</span>
                        </button>
                      </th>
                      <th class="worker-status-column" style="min-width: 100px; white-space: nowrap; padding: 8px; text-align: left;">
                        <button type="button" style="display: inline-flex; align-items: center; gap: 6px; background: none; border: medium; cursor: pointer; padding: 0px; color: inherit; font: inherit;">
                          Status <span style="font-size: 12px; opacity: 0.6;">↕</span>
                        </button>
                      </th>
                    </tr>
                  </thead>
                  <tbody id="workers-table-body">
                    <tr><td colspan="3"><em>Loading workers...</em></td></tr>
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
                  <button onclick="editWorkerFromDetail()" style="padding: 6px 12px; border: 1px solid rgb(209, 213, 219); border-radius: 4px; background: white; color: rgb(55, 65, 81); cursor: pointer; font-size: 12px;">✏️ Düzenle</button>
                  <button onclick="deleteWorkerFromDetail()" style="padding: 6px 12px; border: 1px solid rgb(220, 38, 38); border-radius: 4px; background: white; color: rgb(220, 38, 38); cursor: pointer; font-size: 12px;">🗑️ Sil</button>
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

          <!-- Çalışma Bilgileri -->
          <div style="margin-bottom: 0; padding: 12px; background: white; border-radius: 6px; border: 1px solid var(--border);">
            <h3 style="margin: 0 0 12px; font-size: 14px; font-weight: 600; color: rgb(17, 24, 39); border-bottom: 1px solid var(--border); padding-bottom: 6px;">Çalışma Bilgileri</h3>
            <div class="detail-item" style="display: flex; align-items: center; margin-bottom: 8px;">
              <span class="detail-label" style="font-weight: 600; font-size: 12px; color: rgb(55, 65, 81); min-width: 120px; margin-right: 8px;">Shift:</span>
              <select id="worker-shift" style="flex: 1 1 0%; padding: 6px 8px; border: 1px solid rgb(209, 213, 219); border-radius: 4px; font-size: 12px; background: white; max-width: 200px;">
                <option value="Day">Day</option>
                <option value="Night">Night</option>
              </select>
            </div>
            <div class="detail-item" style="display: flex; align-items: center; margin-bottom: 0;">
              <span class="detail-label" style="font-weight: 600; font-size: 12px; color: rgb(55, 65, 81); min-width: 120px; margin-right: 8px;">Status:</span>
              <select id="worker-status" style="flex: 1 1 0%; padding: 6px 8px; border: 1px solid rgb(209, 213, 219); border-radius: 4px; font-size: 12px; background: white; max-width: 200px;">
                <option value="available">Available</option>
                <option value="busy">Busy</option>
                <option value="break">Break</option>
                <option value="inactive">Inactive</option>
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
  `;
}

export function generateOperations() {
  return `
    <div style="margin-bottom: 24px;">
      <h1 style="font-size: 32px; font-weight: 700; margin-bottom: 8px;">Operations Management</h1>
    </div>
    <div class=\"operations-filter-compact\" style=\"margin-bottom: 24px; display: flex; gap: 12px; align-items: center; justify-content: space-between;\">\n      <button onclick=\"openAddOperationModal()\" class=\"operation-add-button\" style=\"background: var(--primary); color: var(--primary-foreground); height: 44px; padding: 0px 12px; border: none; border-radius: 6px; font-weight: 500; cursor: pointer;\">+ Add Operation</button>\n      <div style=\"display: flex; align-items: center; gap: 8px; flex: 1;\">\n        <input id=\"operation-filter-search\" type=\"text\" placeholder=\"Search operations...\" class=\"operation-filter-input\" style=\"height: 44px; padding: 6px 12px; border: 1px solid var(--border); border-radius: 6px; min-width: 200px; max-width: 500px; width: 100%; flex: 1 1 auto !important;\">\n\n        <div id=\"operation-filter-skills\" style=\"position: relative;\">\n          <button id=\"operation-filter-skills-btn\" type=\"button\" class=\"operation-filter-button\" style=\"height: 44px; padding: 6px 6px; border: 1px solid var(--border); background: white; border-radius: 6px; cursor: pointer; min-width: 160px; display: flex; align-items: center; gap: 8px;\">\n            <span>Skills</span>\n            <span id=\"operation-filter-skills-count\" style=\"color: var(--muted-foreground); font-size: 12px;\"></span>\n            <span style=\"margin-left: auto; opacity: .6\">▾</span>\n          </button>\n          <div id=\"operation-filter-skills-panel\" style=\"display:none; position: absolute; right: 0; margin-top: 6px; background: white; border: 1px solid var(--border); border-radius: 8px; box-shadow: 0 8px 24px rgba(0,0,0,0.08); width: 320px; max-height: 320px; overflow: hidden; z-index: 1000;\">\n            <div style=\"padding: 8px; border-bottom: 1px solid var(--border); display:flex; gap:6px; align-items:center; box-sizing: border-box;\">\n              <input id=\"operation-filter-skills-search\" type=\"text\" placeholder=\"Search skills...\" class=\"operation-filter-panel-input\" style=\"flex:1; min-width:0; padding: 3px 4px; font-size:12px; border: 1px solid var(--border); border-radius: 6px;\">\n              <button id=\"operation-filter-skills-clear\" type=\"button\" class=\"operation-filter-panel-button\" style=\"flex:0 0 auto; white-space:nowrap; font-size:12px; padding:3px 4px; border:1px solid var(--border); background:white; border-radius:6px; cursor:pointer;\">Clear</button>\n              <button id=\"operation-filter-skills-hide\" type=\"button\" title=\"Kapat\" class=\"operation-filter-panel-button\" style=\"flex:0 0 auto; font-size:12px; padding:3px 4px; border:1px solid var(--border); background:white; border-radius:6px; cursor:pointer;\">×</button>\n            </div>\n            <div id=\"operation-filter-skills-list\" style=\"max-height: 240px; overflow: auto; padding: 8px; display: grid; gap: 6px;\"></div>\n          </div>\n        </div>\n\n        <button id=\"operation-filter-clear-all\" type=\"button\" title=\"Tüm filtreleri temizle\" class=\"operation-filter-button\" style=\"display: none; height: 44px; padding: 0px 8px; border: 1px solid #ef4444; background: white; color: #ef4444; border-radius: 6px; cursor: pointer; font-size: 12px; font-weight: 500; margin-left: 8px;\">\n          Clear All\n        </button>\n      </div>\n    </div>
    <section class=\"workers-table\">\n      <div style=\"padding: 0px;\">\n        <div class=\"workers-container\" style=\"display: flex; gap: 20px; height: auto; flex-direction: row;\">\n          <div class=\"workers-table-panel\" style=\"flex: 1 1 0%; min-width: 300px; display: flex; flex-direction: column; height: auto;\">\n            <div class=\"workers-table\">\n              <div class=\"table-container\" style=\"overflow-y: auto; border: 1px solid rgb(229, 231, 235); border-radius: 6px; background: white;\">\n                <table style=\"width: 100%; border-collapse: collapse;\">\n                  <thead style=\"background: rgb(248, 249, 250); position: sticky; top: 0px; z-index: 1;\">\n                    <tr>\n                      <th style=\"min-width: 200px; white-space: nowrap; padding: 8px;\">\n                        <button type=\"button\" style=\"display: inline-flex; align-items: center; gap: 6px; background: none; border: medium; cursor: pointer; padding: 0px; color: inherit; font: inherit;\">\n                          Name <span style=\"font-size: 12px; opacity: 0.6;\">↕</span>\n                        </button>\n                      </th>\n                      <th style=\"min-width: 160px; white-space: nowrap; padding: 8px;\">\n                        <button type=\"button\" style=\"display: inline-flex; align-items: center; gap: 6px; background: none; border: medium; cursor: pointer; padding: 0px; color: inherit; font: inherit;\">\n                          Type <span style=\"font-size: 12px; opacity: 0.6;\">↕</span>\n                          </button>\n                          <button type=\"button\" title=\"Manage Operation Types\" onclick=\"openOperationTypesModal()\" style=\"padding:2px 6px; border:1px solid var(--border); background:white; border-radius:4px; cursor:pointer; font-size:12px;\">i</button>\n                        </th>\n                      <th style=\"min-width: 120px; white-space: nowrap; padding: 8px;\">\n                        <button type=\"button\" style=\"display: inline-flex; align-items: center; gap: 6px; background: none; border: medium; cursor: pointer; padding: 0px; color: inherit; font: inherit;\">\n                          Output Code <span style=\"font-size: 12px; opacity: 0.6;\">↕</span>\n                        </button>\n                      </th>\n                      <th style=\"min-width: 160px; white-space: nowrap; padding: 8px;\">\n                        <button type=\"button\" style=\"display: inline-flex; align-items: center; gap: 6px; background: none; border: medium; cursor: pointer; padding: 0px; color: inherit; font: inherit;\">\n                          Skills <span style=\"font-size: 12px; opacity: 0.6;\">↕</span>\n                        </button>\n                      </th>\n                    </tr>\n                  </thead>\n                  <tbody id=\"operations-table-body\"></tbody>\n                </table>\n              </div>\n            </div>\n          </div>\n          <div class=\"worker-detail-panel\" id=\"operation-detail-panel\" style=\"flex: 1 1 0%; min-width: 400px; height: auto; display: none;\">\n            <div style=\"background: white; border-radius: 6px; border: 1px solid rgb(229, 231, 235); height: 100%; display: flex; flex-direction: column;\">\n              <div style=\"padding: 16px 20px; border-bottom: 1px solid rgb(229, 231, 235); display: flex; justify-content: space-between; align-items: center;\">\n                <div style=\"display: flex; align-items: center; gap: 12px;\">\n                  <button title=\"Detayları Kapat\" onclick=\"closeOperationDetail()\" style=\"padding: 6px 12px; border: 1px solid rgb(209, 213, 219); border-radius: 4px; background: white; color: rgb(55, 65, 81); cursor: pointer; font-size: 12px;\">←</button>\n                  <h3 style=\"margin: 0px; font-size: 16px; font-weight: 600; color: rgb(17, 24, 39);\">Operasyon Detayları</h3>\n                </div>\n                <div style=\"display:flex; align-items:center; gap:8px;\">\n                  <button onclick=\"editOperationFromDetail()\" style=\"padding: 6px 12px; border: 1px solid rgb(209, 213, 219); border-radius: 4px; background: white; color: rgb(55, 65, 81); cursor: pointer; font-size: 12px;\">✏️ Düzenle</button>\n                  <button onclick=\"deleteOperationFromDetail()\" style=\"padding: 6px 12px; border: 1px solid rgb(220, 38, 38); border-radius: 4px; background: white; color: rgb(220, 38, 38); cursor: pointer; font-size: 12px;\">🗑️ Sil</button>\n                </div>\n              </div>\n              <div style=\"flex: 1 1 0%; overflow: auto; padding: 20px;\">\n                <div id=\"operation-detail-content\"></div>\n              </div>\n            </div>\n          </div>\n        </div>\n      </div>\n    </section>
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
            <div class=\"detail-item\" style=\"display: flex; align-items: flex-start; margin-bottom: 0;\">
              <span class=\"detail-label\" style=\"font-weight: 600; font-size: 12px; color: rgb(55, 65, 81); min-width: 120px; margin-right: 8px; margin-top: 6px;\">Çıktı Kodu:</span>
              <div style=\"flex: 1 1 0%;\">
                <input id=\"operation-output-code\" type=\"text\" placeholder=\"Örn. A, Qc (1-2 harf)\" style=\"width: 100%; padding: 6px 8px; border: 1px solid rgb(209, 213, 219); border-radius: 4px; font-size: 12px; background: white;\" />
                <div style=\"margin-top: 4px; font-size: 11px; color: var(--muted-foreground);\">1-2 harf: İlk büyük, ikinci küçük. 'M' tek başına kullanılamaz; örn. Mq.</div>
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
    <div style=\"margin-bottom: 24px;\">\n      <h1 style=\"font-size: 32px; font-weight: 700; margin-bottom: 8px;\">Stations Management</h1>\n      </div>\n    <div class=\"stations-filter-compact\" style=\"margin-bottom: 24px; display: flex; gap: 12px; align-items: center; justify-content: space-between;\">\n      <button onclick=\"openAddStationModal()\" class=\"station-add-button\" style=\"background: var(--primary); color: var(--primary-foreground); height: 44px; padding: 0px 12px; border: none; border-radius: 6px; font-weight: 500; cursor: pointer;\">+ Add Station</button>\n      <div style=\"display: flex; align-items: center; gap: 8px; flex: 1;\">\n        <input id=\"station-filter-search\" type=\"text\" placeholder=\"Search stations...\" class=\"station-filter-input\" style=\"height: 44px; padding: 6px 12px; border: 1px solid var(--border); border-radius: 6px; min-width: 200px; max-width: 500px; width: 100%; flex: 1 1 auto !important;\">\n\n        <div id=\"station-filter-status\" style=\"position: relative;\">\n          <button id=\"station-filter-status-btn\" type=\"button\" class=\"station-filter-button\" style=\"height: 44px; padding: 6px 6px; border: 1px solid var(--border); background: white; border-radius: 6px; cursor: pointer; min-width: 120px; display: flex; align-items: center; gap: 8px;\">\n            <span>Status</span>\n            <span id=\"station-filter-status-count\" style=\"color: var(--muted-foreground); font-size: 12px;\"></span>\n            <span style=\"margin-left: auto; opacity: .6\">▾</span>\n          </button>\n          <div id=\"station-filter-status-panel\" style=\"display:none; position: absolute; right: 0; margin-top: 6px; background: white; border: 1px solid var(--border); border-radius: 8px; box-shadow: 0 8px 24px rgba(0,0,0,0.08); width: 240px; max-height: 320px; overflow: hidden; z-index: 1000;\">\n            <div style=\"padding: 8px; border-bottom: 1px solid var(--border); display:flex; gap:6px; align-items:center; box-sizing: border-box;\">\n              <button id=\"station-filter-status-clear\" type=\"button\" class=\"station-filter-panel-button\" style=\"flex:0 0 auto; white-space:nowrap; font-size:12px; padding:3px 4px; border:1px solid var(--border); background:white; border-radius:6px; cursor:pointer;\">Clear</button>\n              <button id=\"station-filter-status-hide\" type=\"button\" title=\"Kapat\" class=\"station-filter-panel-button\" style=\"flex:0 0 auto; font-size:12px; padding:3px 4px; border:1px solid var(--border); background:white; border-radius:6px; cursor:pointer;\">×</button>\n            </div>\n            <div id=\"station-filter-status-list\" style=\"max-height: 240px; overflow: auto; padding: 8px; display: grid; gap: 6px;\"></div>\n          </div>\n        </div>\n\n        <div id=\"station-filter-skills\" style=\"position: relative;\">\n          <button id=\"station-filter-skills-btn\" type=\"button\" class=\"station-filter-button\" style=\"height: 44px; padding: 6px 6px; border: 1px solid var(--border); background: white; border-radius: 6px; cursor: pointer; min-width: 160px; display: flex; align-items: center; gap: 8px;\">\n            <span>Skills</span>\n            <span id=\"station-filter-skills-count\" style=\"color: var(--muted-foreground); font-size: 12px;\"></span>\n            <span style=\"margin-left: auto; opacity: .6\">▾</span>\n          </button>\n          <div id=\"station-filter-skills-panel\" style=\"display:none; position: absolute; right: 0; margin-top: 6px; background: white; border: 1px solid var(--border); border-radius: 8px; box-shadow: 0 8px 24px rgba(0,0,0,0.08); width: 320px; max-height: 320px; overflow: hidden; z-index: 1000;\">\n            <div style=\"padding: 8px; border-bottom: 1px solid var(--border); display:flex; gap:6px; align-items:center; box-sizing: border-box;\">\n              <input id=\"station-filter-skills-search\" type=\"text\" placeholder=\"Search skills...\" class=\"station-filter-panel-input\" style=\"flex:1; min-width:0; padding: 3px 4px; font-size:12px; border: 1px solid var(--border); border-radius: 6px;\">\n              <button id=\"station-filter-skills-clear\" type=\"button\" class=\"station-filter-panel-button\" style=\"flex:0 0 auto; white-space:nowrap; font-size:12px; padding:3px 4px; border:1px solid var(--border); background:white; border-radius:6px; cursor:pointer;\">Clear</button>\n              <button id=\"station-filter-skills-hide\" type=\"button\" title=\"Kapat\" class=\"station-filter-panel-button\" style=\"flex:0 0 auto; font-size:12px; padding:3px 4px; border:1px solid var(--border); background:white; border-radius:6px; cursor:pointer;\">×</button>\n            </div>\n            <div id=\"station-filter-skills-list\" style=\"max-height: 240px; overflow: auto; padding: 8px; display: grid; gap: 6px;\"></div>\n          </div>\n        </div>\n\n        <div id=\"station-filter-operations\" style=\"position: relative;\">\n          <button id=\"station-filter-operations-btn\" type=\"button\" class=\"station-filter-button\" style=\"height: 44px; padding: 6px 6px; border: 1px solid var(--border); background: white; border-radius: 6px; cursor: pointer; min-width: 160px; display: flex; align-items: center; gap: 8px;\">\n            <span>Operations</span>\n            <span id=\"station-filter-operations-count\" style=\"color: var(--muted-foreground); font-size: 12px;\"></span>\n            <span style=\"margin-left: auto; opacity: .6\">▾</span>\n          </button>\n          <div id=\"station-filter-operations-panel\" style=\"display:none; position: absolute; right: 0; margin-top: 6px; background: white; border: 1px solid var(--border); border-radius: 8px; box-shadow: 0 8px 24px rgba(0,0,0,0.08); width: 320px; max-height: 320px; overflow: hidden; z-index: 1000;\">\n            <div style=\"padding: 8px; border-bottom: 1px solid var(--border); display:flex; gap:6px; align-items:center; box-sizing: border-box;\">\n              <input id=\"station-filter-operations-search\" type=\"text\" placeholder=\"Search operations...\" class=\"station-filter-panel-input\" style=\"flex:1; min-width:0; padding: 3px 4px; font-size:12px; border: 1px solid var(--border); border-radius: 6px;\">\n              <button id=\"station-filter-operations-clear\" type=\"button\" class=\"station-filter-panel-button\" style=\"flex:0 0 auto; white-space:nowrap; font-size:12px; padding:3px 4px; border:1px solid var(--border); background:white; border-radius:6px; cursor:pointer;\">Clear</button>\n              <button id=\"station-filter-operations-hide\" type=\"button\" title=\"Kapat\" class=\"station-filter-panel-button\" style=\"flex:0 0 auto; font-size:12px; padding:3px 4px; border:1px solid var(--border); background:white; border-radius:6px; cursor:pointer;\">×</button>\n            </div>\n            <div id=\"station-filter-operations-list\" style=\"max-height: 240px; overflow: auto; padding: 8px; display: grid; gap: 6px;\"></div>\n          </div>\n        </div>\n\n        <button id=\"station-filter-clear-all\" type=\"button\" title=\"Tüm filtreleri temizle\" class=\"station-filter-button\" style=\"display: none; height: 44px; padding: 0px 8px; border: 1px solid #ef4444; background: white; color: #ef4444; border-radius: 6px; cursor: pointer; font-size: 12px; font-weight: 500; margin-left: 8px;\">\n          Clear All\n        </button>\n      </div>\n    </div>\n    
    <!-- Stations Table with Tabs -->
    <section class=\"workers-table\">
      <div style=\"padding: 0px;\">
        <div class=\"workers-container\" style=\"display: flex; gap: 20px; height: auto; flex-direction: row;\">
          <div class=\"workers-table-panel\" style=\"flex: 1 1 0%; min-width: 300px; display: flex; flex-direction: column; height: auto;\">
            <div class=\"workers-table\">
              <!-- Stations Table with integrated tabs -->
              <div class=\"table-container\" style=\"overflow-y: auto; border: 1px solid rgb(229, 231, 235); border-radius: 6px; background: white;\">
                <!-- Station Type Tabs - integrated as part of table -->
                <div class=\"stations-tabs\" id=\"stations-tabs\" style=\"padding: 8px; background: rgb(248, 249, 250); border-bottom: 1px solid rgb(229, 231, 235); border-radius: 6px 6px 0 0;\">
                  <!-- Tabs will be populated by renderStations() -->
                </div>
                
                <table id=\"stations-table\" style=\"width: 100%; border-collapse: collapse;\">
                  <thead style=\"background: rgb(248, 249, 250); position: sticky; top: 0px; z-index: 1;\">
                    <tr>
                      <th style=\"min-width: 120px; white-space: nowrap; padding: 8px;\">
                        <button type=\"button\" style=\"display: inline-flex; align-items: center; gap: 6px; background: none; border: medium; cursor: pointer; padding: 0px; color: inherit; font: inherit;\">
                          Station ID <span style=\"font-size: 12px; opacity: 0.6;\">↕</span>
                        </button>
                      </th>
                      <th style=\"min-width: 200px; white-space: nowrap; padding: 8px;\">
                        <button type=\"button\" style=\"display: inline-flex; align-items: center; gap: 6px; background: none; border: medium; cursor: pointer; padding: 0px; color: inherit; font: inherit;\">
                          Station Name <span style=\"font-size: 12px; opacity: 0.6;\">↕</span>
                        </button>
                      </th>
                      <th style=\"min-width: 160px; white-space: nowrap; padding: 8px;\">
                        <button type=\"button\" style=\"display: inline-flex; align-items: center; gap: 6px; background: none; border: medium; cursor: pointer; padding: 0px; color: inherit; font: inherit;\">
                          Operations <span style=\"font-size: 12px; opacity: 0.6;\">↕</span>
                        </button>
                      </th>
                      <th style=\"min-width: 160px; white-space: nowrap; padding: 8px;\">
                        <button type=\"button\" style=\"display: inline-flex; align-items: center; gap: 6px; background: none; border: medium; cursor: pointer; padding: 0px; color: inherit; font: inherit;\">
                          Skills <span style=\"font-size: 12px; opacity: 0.6;\">↕</span>
                        </button>
                      </th>

                    </tr>
                  </thead>
                  <tbody id=\"stations-list\">
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
                  <button onclick=\"editStationFromDetail()\" style=\"padding: 6px 12px; border: 1px solid rgb(209, 213, 219); border-radius: 4px; background: white; color: rgb(55, 65, 81); cursor: pointer; font-size: 12px;\">✏️ Düzenle</button>
                  <button onclick=\"duplicateStationFromDetail()\" style=\"padding: 6px 12px; border: 1px solid rgb(34, 197, 94); border-radius: 4px; background: white; color: rgb(34, 197, 94); cursor: pointer; font-size: 12px;\">📋 Kopyala</button>
                  <button onclick=\"deleteStationFromDetail()\" style=\"padding: 6px 12px; border: 1px solid rgb(220, 38, 38); border-radius: 4px; background: white; color: rgb(220, 38, 38); cursor: pointer; font-size: 12px;\">🗑️ Sil</button>
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
            <div class=\"detail-item\" style=\"display: flex; align-items: flex-start; margin-bottom: 8px;\">
              <span class=\"detail-label\" style=\"font-weight: 600; font-size: 12px; color: rgb(55, 65, 81); min-width: 120px; margin-right: 8px; margin-top: 6px;\">Açıklama:</span>
              <textarea id=\"station-description\" placeholder=\"Description\" style=\"flex: 1 1 0%; padding: 6px 8px; border: 1px solid rgb(209, 213, 219); border-radius: 4px; font-size: 12px; background: white; min-height: 60px; resize: vertical;\"></textarea>
            </div>
            <div class=\"detail-item\" style=\"display: flex; align-items: center; margin-bottom: 0;\">
              <span class=\"detail-label\" style=\"font-weight: 600; font-size: 12px; color: rgb(55, 65, 81); min-width: 120px; margin-right: 8px;\">İstasyon Sayısı:</span>
              <input type=\"number\" id=\"station-substation-count\" min=\"1\" value=\"1\" style=\"flex: 1 1 0%; padding: 6px 8px; border: 1px solid rgb(209, 213, 219); border-radius: 4px; font-size: 12px; background: white;\">
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
    <div id="plans-header" style="margin-bottom: 8px;">
      <div style="display:flex; align-items:center; justify-content: space-between; gap: 8px; margin-bottom: 8px;">
        <h1 id="plans-title" style="font-size: 32px; font-weight: 700; margin: 0;">Production Planning</h1>
        <button id="plans-back-btn" onclick="cancelPlanCreation()" title="Go back" style="display:none; padding: 6px 10px; font-size: 12px; border: 1px solid var(--border); background: white; border-radius: 6px; cursor: pointer;">← Back</button>
      </div>
    </div>

    <div class="plans-filter-compact" id="plans-filter-compact" style="margin-bottom: 16px; display: flex; gap: 12px; align-items: center; justify-content: space-between;">
      <button id="create-plan-button" onclick="openCreatePlan()" style="background: var(--primary); color: var(--primary-foreground); height: 44px; padding: 0px 12px; border: none; border-radius: 6px; font-weight: 500; cursor: pointer;">+ Create New Production Plan</button>

      <div id="plans-header-controls" style="display: flex; align-items: center; gap: 8px; flex: 1 1 0%;">
        <input id="plan-filter-search" type="text" placeholder="Search plans..." class="plan-filter-input" style="height: 44px; padding: 6px 12px; border: 1px solid var(--border); border-radius: 6px; min-width: 200px; max-width: 500px; width: 100%; flex: 1 1 auto;" oninput="filterProductionPlans()">

        <div id="plan-filter-status" style="position: relative;">
          <button id="plan-filter-status-btn" type="button" class="plan-filter-button" style="height: 44px; padding: 6px 6px; border: 1px solid var(--border); background: white; border-radius: 6px; cursor: pointer; min-width: 120px; display: flex; align-items: center; gap: 8px;" onclick="togglePlanFilterPanel('status')">
            <span>Status</span>
            <span id="plan-filter-status-count" style="color: var(--muted-foreground); font-size: 12px;"></span>
            <span style="margin-left: auto; opacity: .6">▾</span>
          </button>
          <div id="plan-filter-status-panel" style="display:none; position: absolute; right: 0; margin-top: 6px; background: white; border: 1px solid var(--border); border-radius: 8px; box-shadow: 0 8px 24px rgba(0,0,0,0.08); width: 240px; overflow: hidden; z-index: 1000;">
            <div style="padding: 8px; border-bottom: 1px solid var(--border); display:flex; gap:6px; align-items:center; box-sizing: border-box;">
              <button type="button" style="flex:0 0 auto; white-space:nowrap; font-size:12px; padding:3px 4px; border:1px solid var(--border); background:white; border-radius:6px; cursor:pointer;" onclick="clearPlanFilter('status')">Clear</button>
              <button type="button" title="Close" style="flex:0 0 auto; font-size:12px; padding:3px 4px; border:1px solid var(--border); background:white; border-radius:6px; cursor:pointer;" onclick="hidePlanFilterPanel('status')">×</button>
            </div>
            <div style="max-height: 240px; overflow: auto; padding: 8px; display: grid; gap: 6px;">
              <label style="display:flex; align-items:center; gap:8px; font-size: 12px;"><input type="checkbox" onchange="onPlanFilterChange('status','planned',this.checked)"> planned</label>
              <label style="display:flex; align-items:center; gap:8px; font-size: 12px;"><input type="checkbox" onchange="onPlanFilterChange('status','in-progress',this.checked)"> in-progress</label>
              <label style="display:flex; align-items:center; gap:8px; font-size: 12px;"><input type="checkbox" onchange="onPlanFilterChange('status','completed',this.checked)"> completed</label>
              <label style="display:flex; align-items:center; gap:8px; font-size: 12px;"><input type="checkbox" onchange="onPlanFilterChange('status','canceled',this.checked)"> canceled</label>
            </div>
          </div>
        </div>

        <div id="plan-filter-priority" style="position: relative;">
          <button id="plan-filter-priority-btn" type="button" class="plan-filter-button" style="height: 44px; padding: 6px 6px; border: 1px solid var(--border); background: white; border-radius: 6px; cursor: pointer; min-width: 120px; display: flex; align-items: center; gap: 8px;" onclick="togglePlanFilterPanel('priority')">
            <span>Priority</span>
            <span id="plan-filter-priority-count" style="color: var(--muted-foreground); font-size: 12px;"></span>
            <span style="margin-left: auto; opacity: .6">▾</span>
          </button>
          <div id="plan-filter-priority-panel" style="display:none; position: absolute; right: 0; margin-top: 6px; background: white; border: 1px solid var(--border); border-radius: 8px; box-shadow: 0 8px 24px rgba(0,0,0,0.08); width: 240px; overflow: hidden; z-index: 1000;">
            <div style="padding: 8px; border-bottom: 1px solid var(--border); display:flex; gap:6px; align-items:center; box-sizing: border-box;">
              <button type="button" style="flex:0 0 auto; white-space:nowrap; font-size:12px; padding:3px 4px; border:1px solid var(--border); background:white; border-radius:6px; cursor:pointer;" onclick="clearPlanFilter('priority')">Clear</button>
              <button type="button" title="Close" style="flex:0 0 auto; font-size:12px; padding:3px 4px; border:1px solid var(--border); background:white; border-radius:6px; cursor:pointer;" onclick="hidePlanFilterPanel('priority')">×</button>
            </div>
            <div style="max-height: 240px; overflow: auto; padding: 8px; display: grid; gap: 6px;">
              <label style="display:flex; align-items:center; gap:8px; font-size: 12px;"><input type="checkbox" onchange="onPlanFilterChange('priority','high',this.checked)"> high</label>
              <label style="display:flex; align-items:center; gap:8px; font-size: 12px;"><input type="checkbox" onchange="onPlanFilterChange('priority','medium',this.checked)"> medium</label>
              <label style="display:flex; align-items:center; gap:8px; font-size: 12px;"><input type="checkbox" onchange="onPlanFilterChange('priority','low',this.checked)"> low</label>
            </div>
          </div>
        </div>

        <div id="plan-filter-type" style="position: relative;">
          <button id="plan-filter-type-btn" type="button" class="plan-filter-button" style="height: 44px; padding: 6px 6px; border: 1px solid var(--border); background: white; border-radius: 6px; cursor: pointer; min-width: 140px; display: flex; align-items: center; gap: 8px;" onclick="togglePlanFilterPanel('type')">
            <span>Type</span>
            <span id="plan-filter-type-count" style="color: var(--muted-foreground); font-size: 12px;"></span>
            <span style="margin-left: auto; opacity: .6">▾</span>
          </button>
          <div id="plan-filter-type-panel" style="display:none; position: absolute; right: 0; margin-top: 6px; background: white; border: 1px solid var(--border); border-radius: 8px; box-shadow: 0 8px 24px rgba(0,0,0,0.08); width: 240px; overflow: hidden; z-index: 1000;">
            <div style="padding: 8px; border-bottom: 1px solid var(--border); display:flex; gap:6px; align-items:center; box-sizing: border-box;">
              <button type="button" style="flex:0 0 auto; white-space:nowrap; font-size:12px; padding:3px 4px; border:1px solid var(--border); background:white; border-radius:6px; cursor:pointer;" onclick="clearPlanFilter('type')">Clear</button>
              <button type="button" title="Close" style="flex:0 0 auto; font-size:12px; padding:3px 4px; border:1px solid var(--border); background:white; border-radius:6px; cursor:pointer;" onclick="hidePlanFilterPanel('type')">×</button>
            </div>
            <div style="max-height: 240px; overflow: auto; padding: 8px; display: grid; gap: 6px;">
              <label style="display:flex; align-items:center; gap:8px; font-size: 12px;"><input type="checkbox" onchange="onPlanFilterChange('type','one-time',this.checked)"> one-time</label>
              <label style="display:flex; align-items:center; gap:8px; font-size: 12px;"><input type="checkbox" onchange="onPlanFilterChange('type','recurring',this.checked)"> recurring</label>
            </div>
          </div>
        </div>

        <button id="plan-filter-clear-all" type="button" title="Clear all filters" class="plan-filter-button" style="display: none; height: 44px; padding: 0px 8px; border: 1px solid #ef4444; background: white; color: #ef4444; border-radius: 6px; cursor: pointer; font-size: 12px; font-weight: 500; margin-left: 8px;" onclick="clearAllPlanFilters()">
          Clear All
        </button>
      </div>
    </div>

    <div class="stations-tabs" id="plans-tabs" style="padding: 8px; background: rgb(248, 249, 250); border-bottom: 1px solid rgb(229, 231, 235); border-radius: 6px 6px 0 0;">
      <button class="station-tab-button active" onclick="setActivePlanTab('production')" style="padding: 6px 12px; font-size: 12px; border: none; background: white; border-radius: 4px; cursor: pointer; margin-right: 6px; font-weight: 600; color: rgb(17, 24, 39); box-shadow: 0 1px 3px rgba(0,0,0,0.1); transition: all 0.2s ease;">
        Production Plans
        <span id="production-count" style="color: var(--muted-foreground); font-size: 11px; margin-left: 4px;">(0)</span>
      </button>
      <button class="station-tab-button" onclick="setActivePlanTab('templates')" style="padding: 6px 12px; font-size: 12px; border: none; background: transparent; border-radius: 4px; cursor: pointer; margin-right: 6px; font-weight: 400; color: rgb(75, 85, 99); box-shadow: none; transition: all 0.2s ease;">
        Templates
        <span id="templates-count" style="color: var(--muted-foreground); font-size: 11px; margin-left: 4px;">(0)</span>
      </button>
    </div>

    <div id="plans-panel-card" class="card" style="border-radius: 0 0 6px 6px;">
      <div class="card-content" style="padding: 0;">
        <div id="production-table-panel" style="display: block;">
          <table style="width: 100%; border-collapse: collapse;">
            <thead>
              <tr style="background: var(--muted); text-align: left;">
                <th style="padding: 10px 12px; font-size: 12px; color: var(--muted-foreground);">Plan ID</th>
                <th style="padding: 10px 12px; font-size: 12px; color: var(--muted-foreground);">Plan Adı</th>
                <th style="padding: 10px 12px; font-size: 12px; color: var(--muted-foreground);">Order</th>
                <th style="padding: 10px 12px; font-size: 12px; color: var(--muted-foreground);">Steps</th>
                <th class="metadata-column hidden" style="padding: 10px 12px; font-size: 12px; color: var(--muted-foreground);">Created At</th>
                <th class="metadata-column hidden" style="padding: 10px 12px; font-size: 12px; color: var(--muted-foreground);">Created By</th>
                <th class="metadata-column hidden" style="padding: 10px 12px; font-size: 12px; color: var(--muted-foreground);">Updated At</th>
                <th class="metadata-column hidden" style="padding: 10px 12px; font-size: 12px; color: var(--muted-foreground);">Updated By</th>
                <th style="padding: 10px 12px; font-size: 12px; color: var(--muted-foreground); text-align: right;">
                  <button class="metadata-toggle-btn" onclick="toggleMetadataColumns()">Show Details</button>
                </th>
              </tr>
            </thead>
            <tbody id="production-table-body">
              <tr>
                <td colspan="9" style="padding: 16px 12px; color: var(--muted-foreground); font-size: 12px; text-align: center;">No production plans yet</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div id="templates-table-panel" style="display: none;">
          <table style="width: 100%; border-collapse: collapse;">
            <thead>
              <tr style="background: var(--muted); text-align: left;">
                <th style="padding: 10px 12px; font-size: 12px; color: var(--muted-foreground);">Plan ID</th>
                <th style="padding: 10px 12px; font-size: 12px; color: var(--muted-foreground);">Template Adı</th>
                <th style="padding: 10px 12px; font-size: 12px; color: var(--muted-foreground);">Order</th>
                <th style="padding: 10px 12px; font-size: 12px; color: var(--muted-foreground);">Steps</th>
                <th class="metadata-column hidden" style="padding: 10px 12px; font-size: 12px; color: var(--muted-foreground);">Created At</th>
                <th class="metadata-column hidden" style="padding: 10px 12px; font-size: 12px; color: var(--muted-foreground);">Created By</th>
                <th class="metadata-column hidden" style="padding: 10px 12px; font-size: 12px; color: var(--muted-foreground);">Updated At</th>
                <th class="metadata-column hidden" style="padding: 10px 12px; font-size: 12px; color: var(--muted-foreground);">Updated By</th>
                <th style="padding: 10px 12px; font-size: 12px; color: var(--muted-foreground); text-align: right;">
                  <button class="metadata-toggle-btn" onclick="toggleMetadataColumns()">Show Details</button>
                </th>
              </tr>
            </thead>
            <tbody id="templates-table-body">
              <tr>
                <td colspan="9" style="padding: 16px 12px; color: var(--muted-foreground); font-size: 12px; text-align: center;">No templates yet</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <div id="plan-designer-section" style="margin-top: 16px; display: none;">
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
                    <button id="plan-type-clear" type="button" class="plan-filter-panel-button" style="flex:0 0 auto; white-space:nowrap; font-size:12px; padding:3px 4px; border:1px solid var(--border); background:white; border-radius:6px; cursor:pointer;" onclick="clearPlanType()">Clear</button>
                    <button id="modal-apply-btn" type="button" style="flex:0 0 auto; white-space:nowrap; font-size:12px; padding:3px 4px; border:1px solid black; background:black; color:white; border-radius:6px; cursor:pointer;" onclick="applyPlanTypeModal()">Apply</button>
                    <button id="plan-type-close" type="button" title="Close" class="plan-filter-panel-button" style="flex:0 0 auto; font-size:12px; padding:3px 4px; border:1px solid var(--border); background:white; border-radius:6px; cursor:pointer; margin-left:auto;" onclick="hidePlanTypePanel()">×</button>
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
              <button onclick="clearCanvas()" style="padding: 3px 6px; background: white; border: 1px solid var(--border); border-radius: 3px; cursor: pointer; font-size: 11px;">🗑️ Clear</button>
            </div>
          </div>
          <div class="card-content" style="padding: 0; max-height: 400px; position: relative; overflow: hidden;">
            <div id="plan-canvas" style="width: 100%; height: 400px; max-height: 400px; position: relative; background: var(--card); border: 1px solid var(--border);" ondrop="handleCanvasDrop(event)" ondragover="handleCanvasDragOver(event)" onclick="handleCanvasClick(event)"></div>
          </div>
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
                <button id="zoom-out-btn" onclick="adjustCanvasZoom(-0.1)" style="padding: 6px 8px; background: white; border: 1px solid var(--border); border-radius: 4px; cursor: pointer; font-size: 14px; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center;">🔍<span style="font-size: 10px; margin-left: -2px;">-</span></button>
                <input type="range" id="zoom-slider" min="30" max="150" value="100" step="10" oninput="setCanvasZoom(this.value)" style="width: 80px; height: 4px; background: #ddd; outline: none; border-radius: 2px; cursor: pointer;">
                <button id="zoom-in-btn" onclick="adjustCanvasZoom(0.1)" style="padding: 6px 8px; background: white; border: 1px solid var(--border); border-radius: 4px; cursor: pointer; font-size: 14px; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center;">🔍<span style="font-size: 10px; margin-left: -2px;">+</span></button>
                <span id="zoom-percentage" style="font-size: 11px; color: var(--muted-foreground); min-width: 35px;">100%</span>
                <button onclick="resetCanvasPan()" title="Reset Pan" style="padding: 6px 8px; background: white; border: 1px solid var(--border); border-radius: 4px; cursor: pointer; font-size: 12px; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; margin-left: 8px;">⌂</button>
              </div>
              
              <!-- Main Controls -->
              <button id="fullscreen-connect-mode-btn" onclick="toggleConnectMode()" style="padding: 6px 12px; background: white; border: 1px solid var(--border); border-radius: 6px; cursor: pointer; font-size: 12px;">🔗 Connect</button>
              <button onclick="clearCanvas()" style="padding: 6px 12px; background: white; border: 1px solid var(--border); border-radius: 6px; cursor: pointer; font-size: 12px;">🗑️ Clear</button>
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
      <h1 style="font-size: 32px; font-weight: 700; margin-bottom: 8px;">Approved Quotes</h1>
    </div>

    <div class="approved-filter-compact" style="margin-bottom: 24px; display: flex; gap: 12px; align-items: center; justify-content: space-between;">
      <div style="display: flex; align-items: center; gap: 8px; flex: 1;">
        <input id="approved-quotes-search" type="text" placeholder="Ara: müşteri, firma, teklif #..." class="worker-filter-input"
          style="height: 44px; padding: 6px 12px; border: 1px solid var(--border); border-radius: 6px; min-width: 200px; max-width: 100%; width: 100%; flex: 1 1 auto;">

        <!-- Plan Type Filter -->
        <div id="aq-filter-plan-type" style="position: relative;">
          <button id="aq-filter-plan-type-btn" type="button" class="station-filter-button" style="height: 44px; padding: 6px 6px; border: 1px solid var(--border); background: white; border-radius: 6px; cursor: pointer; min-width: 160px; display: flex; align-items: center; gap: 8px;" onclick="toggleAQFilterPanel('planType')">
            <span>Plan</span>
            <span id="aq-filter-plan-type-count" style="color: var(--muted-foreground); font-size: 12px;"></span>
            <span style="margin-left: auto; opacity: .6">▾</span>
          </button>
          <div id="aq-filter-plan-type-panel" style="display:none; position: absolute; right: 0; margin-top: 6px; background: white; border: 1px solid var(--border); border-radius: 8px; box-shadow: 0 8px 24px rgba(0,0,0,0.08); width: 240px; overflow: hidden; z-index: 3000;">
            <div style="padding: 8px; border-bottom: 1px solid var(--border); display:flex; gap:6px; align-items:center; box-sizing: border-box;">
              <button type="button" style="flex:0 0 auto; white-space:nowrap; font-size:12px; padding:3px 4px; border:1px solid var(--border); background:white; border-radius:6px; cursor:pointer;" onclick="clearAQFilter('planType')">Clear</button>
              <button type="button" title="Close" style="flex:0 0 auto; font-size:12px; padding:3px 4px; border:1px solid var(--border); background:white; border-radius:6px; cursor:pointer;" onclick="hideAQFilterPanel('planType')">×</button>
            </div>
            <div style="max-height: 240px; overflow: auto; padding: 8px; display: grid; gap: 6px;">
              <label style="display:flex; align-items:center; gap:8px; font-size: 12px;"><input type="checkbox" onchange="onAQFilterChange('planType','production',this.checked)"> Tamamlandı (production)</label>
              <label style="display:flex; align-items:center; gap:8px; font-size: 12px;"><input type="checkbox" onchange="onAQFilterChange('planType','template',this.checked)"> Taslak (template)</label>
            </div>
          </div>
        </div>

        <!-- Production State Filter -->
        <div id="aq-filter-state" style="position: relative;">
          <button id="aq-filter-state-btn" type="button" class="station-filter-button" style="height: 44px; padding: 6px 6px; border: 1px solid var(--border); background: white; border-radius: 6px; cursor: pointer; min-width: 160px; display: flex; align-items: center; gap: 8px;" onclick="toggleAQFilterPanel('state')">
            <span>Üretim Durumu</span>
            <span id="aq-filter-state-count" style="color: var(--muted-foreground); font-size: 12px;"></span>
            <span style="margin-left: auto; opacity: .6">▾</span>
          </button>
          <div id="aq-filter-state-panel" style="display:none; position: absolute; right: 0; margin-top: 6px; background: white; border: 1px solid var(--border); border-radius: 8px; box-shadow: 0 8px 24px rgba(0,0,0,0.08); width: 280px; overflow: hidden; z-index: 3000;">
            <div style="padding: 8px; border-bottom: 1px solid var(--border); display:flex; gap:6px; align-items:center; box-sizing: border-box;">
              <button type="button" style="flex:0 0 auto; white-space:nowrap; font-size:12px; padding:3px 4px; border:1px solid var(--border); background:white; border-radius:6px; cursor:pointer;" onclick="clearAQFilter('state')">Clear</button>
              <button type="button" title="Close" style="flex:0 0 auto; font-size:12px; padding:3px 4px; border:1px solid var(--border); background:white; border-radius:6px; cursor:pointer;" onclick="hideAQFilterPanel('state')">×</button>
            </div>
            <div style="max-height: 260px; overflow: auto; padding: 8px; display: grid; gap: 6px;">
              <label style="display:flex; align-items:center; gap:8px; font-size: 12px;"><input type="checkbox" onchange="onAQFilterChange('state','Üretim Onayı Bekliyor',this.checked)"> Üretim Onayı Bekliyor</label>
              <label style="display:flex; align-items:center; gap:8px; font-size: 12px;"><input type="checkbox" onchange="onAQFilterChange('state','Üretiliyor',this.checked)"> Üretiliyor</label>
              <label style="display:flex; align-items:center; gap:8px; font-size: 12px;"><input type="checkbox" onchange="onAQFilterChange('state','Üretim Durduruldu',this.checked)"> Üretim Durduruldu</label>
              <label style="display:flex; align-items:center; gap:8px; font-size: 12px;"><input type="checkbox" onchange="onAQFilterChange('state','Üretim Tamamlandı',this.checked)"> Üretim Tamamlandı</label>
              <label style="display:flex; align-items:center; gap:8px; font-size: 12px;"><input type="checkbox" onchange="onAQFilterChange('state','İptal Edildi',this.checked)"> İptal Edildi</label>
            </div>
          </div>
        </div>

        <!-- Delivery Date Range Filter -->
        <div id="aq-filter-delivery" style="position: relative;">
          <button id="aq-filter-delivery-btn" type="button" class="station-filter-button" style="height: 44px; padding: 6px 6px; border: 1px solid var(--border); background: white; border-radius: 6px; cursor: pointer; min-width: 160px; display: flex; align-items: center; gap: 8px;" onclick="toggleAQFilterPanel('delivery')">
            <span>Teslim Tarihi</span>
            <span id="aq-filter-delivery-summary" style="color: var(--muted-foreground); font-size: 12px;"></span>
            <span style="margin-left: auto; opacity: .6">▾</span>
          </button>
          <div id="aq-filter-delivery-panel" style="display:none; position: absolute; right: 0; margin-top: 6px; background: white; border: 1px solid var(--border); border-radius: 8px; box-shadow: 0 8px 24px rgba(0,0,0,0.08); width: 320px; overflow: hidden; z-index: 3000;">
            <div style="padding: 8px; border-bottom: 1px solid var(--border); display:flex; gap:6px; align-items:center; box-sizing: border-box;">
              <button type="button" style="flex:0 0 auto; white-space:nowrap; font-size:12px; padding:3px 4px; border:1px solid var(--border); background:white; border-radius:6px; cursor:pointer;" onclick="clearAQFilter('delivery')">Clear</button>
              <button type="button" title="Close" style="flex:0 0 auto; font-size:12px; padding:3px 4px; border:1px solid var(--border); background:white; border-radius:6px; cursor:pointer;" onclick="hideAQFilterPanel('delivery')">×</button>
            </div>
            <div style="padding: 8px; display: grid; gap: 8px;">
              <label style="font-size:12px; color: var(--muted-foreground);">Başlangıç</label>
              <input id="aq-filter-delivery-from" type="date" style="height: 32px; padding: 4px 6px; border: 1px solid var(--border); border-radius: 6px;">
              <label style="font-size:12px; color: var(--muted-foreground);">Bitiş</label>
              <input id="aq-filter-delivery-to" type="date" style="height: 32px; padding: 4px 6px; border: 1px solid var(--border); border-radius: 6px;">
              <button type="button" class="station-filter-button" style="height: 32px; padding: 4px 6px; border: 1px solid black; background: black; color: white; border-radius: 6px; cursor: pointer; font-size: 12px;" onclick="applyAQDeliveryFilter()">Apply</button>
            </div>
          </div>
        </div>

        <button id="aq-filter-clear-all" type="button" title="Tüm filtreleri temizle" class="station-filter-button" style="display: none; height: 44px; padding: 0px 8px; border: 1px solid #ef4444; background: white; color: #ef4444; border-radius: 6px; cursor: pointer; font-size: 12px; font-weight: 500; margin-left: 8px;" onclick="clearAllAQFilters()">
          Clear All
        </button>
      </div>
    </div>

    <section class="approved-quotes-table">
      <div style="padding: 0px;">
        <div class="workers-container" style="display: flex; gap: 20px; height: calc(-200px + 100vh); flex-direction: row;">
          <div class="workers-table-panel" style="flex: 1 1 0%; min-width: 300px; display: flex; flex-direction: column; height: auto;">
            <div class="workers-table">
              <div class="table-container" style="overflow-y: auto; border: 1px solid rgb(229, 231, 235); border-radius: 6px; background: white;">
                <table style="width: 100%; border-collapse: collapse;">
                  <thead style="background: rgb(248, 249, 250); position: sticky; top: 0px; z-index: 1;">
                    <tr>
                      <th style="min-width: 80px; white-space: normal; padding: 8px; text-align: left;">WO Code</th>
                      <th style="min-width: 160px; white-space: nowrap; padding: 8px; text-align: left;">Customer</th>
                      <th style="min-width: 160px; white-space: nowrap; padding: 8px; text-align: left;">Company</th>
                      <th style="min-width: 140px; white-space: nowrap; padding: 8px; text-align: left;">Delivery Date</th>
                      <th style="min-width: 160px; white-space: nowrap; padding: 8px; text-align: left;">Production Plan</th>
                      <th style="min-width: 180px; white-space: nowrap; padding: 8px; text-align: left;">Üretim Durumu</th>
                      <th style="min-width: 200px; white-space: nowrap; padding: 8px; text-align: left;">Actions</th>
                    </tr>
                  </thead>
                  <tbody id="approved-quotes-table-body">
                    <tr><td colspan="7"><em>Loading quotes...</em></td></tr>
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
