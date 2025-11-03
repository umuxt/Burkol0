// View generators (HTML strings)
import { MESData } from './state.js';

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
      <h1 style="font-size: 24px; font-weight: 700; margin-bottom: 4px;">Master Data</h1>
      <p style="color: var(--muted-foreground); font-size: 0.9em;">System configuration and setup</p>
    </div>
    <div class="grid grid-cols-2">
      <div class="card"><div class="card-header" style="padding: 8px 12px;"><div class="card-title" style="font-size: 1.1em;">Skills Management</div><div class="card-description" style="font-size: 0.9em;">Add, rename, or remove skills (stored in Firebase)</div></div><div class="card-content" style="padding: 8px 12px;">
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

export function generatePlanDesigner() {
  return `
    <div style="margin-bottom: 24px;">
      <h1 style="font-size: 32px; font-weight: 700; margin-bottom: 8px;">Production Plan Designer</h1>
    </div>
    <div class="card" style="margin-bottom: 12px;">
      <div class="card-header" style="padding: 10px 12px;"><div class="card-title" style="font-size: 16px;">Plan Configuration</div><div class="card-description" style="font-size: 12px;">Set up your production plan</div></div>
      <div class="card-content" style="padding: 8px 12px;">
        <div style="display: flex; gap: 8px; align-items: flex-end;">
          <div style="flex: 1; min-width: 140px;"><label style="display: block; font-weight: 500; font-size: 13px; margin-bottom: 4px;">Plan</label><input type="text" id="plan-name" placeholder="Plan name" style="width: 100%; padding: 6px 8px; border: 1px solid var(--border); border-radius: 6px; font-size: 13px;" /></div>
          <div style="flex: 1; min-width: 180px;"><label style="display: block; font-weight: 500; font-size: 13px; margin-bottom: 4px;">Order</label><select id="order-select" style="width: 100%; padding: 6px 8px; border: 1px solid var(--border); border-radius: 6px; font-size: 13px;" onchange="handleOrderChange()"><option value="">Select an order...</option></select></div>
          <div style="display:flex; gap:8px; align-items:center;"><button onclick="savePlanAsTemplate()" style="padding:6px 10px; font-size:13px; border-radius:6px; border:1px solid var(--border); background: white;">Save</button><button onclick="deployWorkOrder()" style="padding:6px 10px; font-size:13px; border-radius:6px; background: var(--primary); color: var(--primary-foreground); border: none;">Deploy</button></div>
        </div>
        <div style="margin-top:8px;"><label style="display:block; font-weight:500; font-size:13px; margin-bottom:4px;">Description</label><textarea id="plan-description" placeholder="Plan description..." style="width:100%; padding:6px 8px; border:1px solid var(--border); border-radius:6px; min-height:42px; font-size:13px; resize:vertical;"></textarea></div>
      </div>
    </div>
    <div style="display: grid; grid-template-columns: 240px 1fr; gap: 16px; height: 500px;">
      <div class="card" style="height: fit-content;">
        <div class="card-header" style="padding: 8px 12px;"><div class="card-title" style="font-size: 14px;">Operations</div><div class="card-description" style="font-size: 11px;">Drag to canvas</div></div>
        <div class="card-content" style="padding: 8px;"><div id="operations-list"></div></div>
      </div>
      <div class="card">
        <div class="card-header" style="padding: 8px 12px;"><div class="card-title" style="font-size: 14px;">Plan Canvas</div><div class="card-description"><div style="display: flex; justify-content: space-between; align-items: center;"><span style="font-size: 11px;">Design your production flow</span><div style="display: flex; gap: 6px;"><button id="connect-mode-btn" onclick="toggleConnectMode()" style="padding: 3px 6px; background: white; border: 1px solid var(--border); border-radius: 3px; cursor: pointer; font-size: 11px;">🔗 Connect</button><button onclick="clearCanvas()" style="padding: 3px 6px; background: white; border: 1px solid var(--border); border-radius: 3px; cursor: pointer; font-size: 11px;">🗑️ Clear</button></div></div></div></div>
        <div class="card-content" style="padding: 0; height: 420px; position: relative; overflow: hidden;">
          <div id="plan-canvas" style="width: 100%; height: 100%; position: relative; background: var(--card); border: 1px solid var(--border);" ondrop="handleCanvasDrop(event)" ondragover="handleCanvasDragOver(event)" onclick="handleCanvasClick(event)"></div>
        </div>
      </div>
    </div>
    <div id="node-edit-modal" style="display: none; position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.3); z-index: 1000;" onclick="closeNodeEditModal(event)">
      <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 520px; background: var(--card); border-radius: 12px; overflow: hidden;">
        <div style="padding: 12px 16px; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center;">
          <div style="font-weight: 600;">Edit Operation</div>
          <button onclick="closeNodeEditModal()" style="border: none; background: transparent; font-size: 18px; cursor: pointer;">×</button>
        </div>
        <div id="node-edit-form" style="padding: 16px;"></div>
        <div style="display: flex; justify-content: flex-end; gap: 8px; padding: 12px 16px; border-top: 1px solid var(--border);">
          <button onclick="closeNodeEditModal()" style="padding: 6px 12px; border: 1px solid var(--border); background: white; border-radius: 6px; cursor: pointer;">Cancel</button>
          <button onclick="saveNodeEdit()" style="padding: 6px 12px; background: var(--primary); color: var(--primary-foreground); border: none; border-radius: 6px; cursor: pointer;">Save</button>
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
      <h1 style="font-size: 28px; font-weight: 700; margin-bottom: 6px;">Approved Quotes</h1>
      <p style="color: var(--muted-foreground);">Status'ı onaylandı/approved olan tekliflerin listesi</p>
    </div>

    <div class="workers-filter-compact" style="margin-bottom: 16px; display: flex; gap: 12px; align-items: center; justify-content: space-between;">
      <div style="display: flex; align-items: center; gap: 8px; flex: 1;">
        <input id="approved-quotes-search" type="text" placeholder="Ara: müşteri, firma, teklif #..." class="worker-filter-input"
          style="height: 40px; padding: 6px 12px; border: 1px solid var(--border); border-radius: 6px; min-width: 200px; max-width: 500px; width: 100%; flex: 1 1 auto;">
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
                      <th style="min-width: 120px; white-space: nowrap; padding: 8px; text-align: left;">WO Code</th>
                      <th style="min-width: 160px; white-space: nowrap; padding: 8px; text-align: left;">Customer</th>
                      <th style="min-width: 160px; white-space: nowrap; padding: 8px; text-align: left;">Company</th>
                      <th style="min-width: 120px; white-space: nowrap; padding: 8px; text-align: left;">Status</th>
                      <th style="min-width: 160px; white-space: nowrap; padding: 8px; text-align: left;">Created</th>
                    </tr>
                  </thead>
                  <tbody id="approved-quotes-table-body">
                    <tr><td colspan="5"><em>Loading quotes...</em></td></tr>
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
