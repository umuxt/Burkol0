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
      <div class="card"><div class="card-header" style="padding: 8px 12px;"><div class="card-title" style="font-size: 1.1em;">Production Settings</div><div class="card-description" style="font-size: 0.9em;">Configure production parameters</div></div><div class="card-content" style="padding: 8px 12px;">
        <div style="margin-bottom: 12px;">
          <label style="display: block; margin-bottom: 4px; font-weight: 500; font-size: 0.9em;">Default Batch Size</label>
          <input type="number" value="100" style="width: 100%; padding: 4px 8px; border: 1px solid var(--border); border-radius: 4px; font-size: 0.9em;" />
        </div>
        <div style="margin-bottom: 12px;">
          <label style="display: block; margin-bottom: 4px; font-weight: 500; font-size: 0.9em;">Auto-Assignment</label>
          <div style="display: flex; align-items: center; gap: 8px;"><input type="checkbox" checked /><span>Enable automatic worker assignment</span></div>
        </div>
        <div style="margin-bottom: 12px;">
          <label style="display: block; margin-bottom: 4px; font-weight: 500; font-size: 0.9em;">Quality Check</label>
          <div style="display: flex; align-items: center; gap: 8px;"><input type="checkbox" checked /><span>Require quality checks for all operations</span></div>
        </div>
      </div></div>
    </div>
  `;
}

export function generateWorkers() {
  return `
    <div style="margin-bottom: 24px;">
      <h1 style="font-size: 32px; font-weight: 700; margin-bottom: 8px;">Workers Management</h1>
      <p style="color: var(--muted-foreground);">Manage workers, skills and assignments</p>
    </div>
    <div style="margin-bottom: 24px;">
      <button onclick="openAddWorkerModal()" style="background: var(--primary); color: var(--primary-foreground); padding: 12px 24px; border: none; border-radius: 6px; font-weight: 500; cursor: pointer;">+ Add Worker</button>
    </div>
    <div class="card">
      <div class="card-header"><div class="card-title">Worker List</div><div class="card-description">Manage your workforce</div></div>
      <div class="card-content">
        <table class="table">
          <thead><tr><th>Name</th><th>Skills</th><th>Shift</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody id="workers-table-body">
            <tr><td colspan="5"><em>Loading workers...</em></td></tr>
          </tbody>
        </table>
      </div>
    </div>

    <div id="worker-modal" style="display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); z-index: 1000;" onclick="closeWorkerModal(event)">
      <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); background: white; border-radius: 8px; padding: 24px; width: 520px; max-height: 80vh; overflow-y: auto;" onclick="event.stopPropagation()">
        <h3 id="worker-modal-title" style="margin: 0 0 20px 0;">Add New Worker</h3>
        <div>
          <div style="margin-bottom: 16px;">
            <label style="display: block; margin-bottom: 8px; font-weight: 500;">Name</label>
            <input type="text" id="worker-name" placeholder="Enter worker name" style="width: 100%; padding: 8px 12px; border: 1px solid var(--border); border-radius: 6px;" />
          </div>
          <div style="margin-bottom: 16px;">
            <label style="display: block; margin-bottom: 8px; font-weight: 500;">Email</label>
            <input type="email" id="worker-email" placeholder="email@domain.com" style="width: 100%; padding: 8px 12px; border: 1px solid var(--border); border-radius: 6px;" />
          </div>
          <div style="margin-bottom: 16px;">
            <label style="display: block; margin-bottom: 8px; font-weight: 500;">Skills</label>
            <select id="worker-skills" multiple></select>
          </div>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
            <div style="margin-bottom: 16px;">
              <label style="display: block; margin-bottom: 8px; font-weight: 500;">Shift</label>
              <select id="worker-shift" style="width: 100%; padding: 8px 12px; border: 1px solid var(--border); border-radius: 6px;">
                <option value="Day">Day</option>
                <option value="Night">Night</option>
              </select>
            </div>
            <div style="margin-bottom: 16px;">
              <label style="display: block; margin-bottom: 8px; font-weight: 500;">Status</label>
              <select id="worker-status" style="width: 100%; padding: 8px 12px; border: 1px solid var(--border); border-radius: 6px;">
                <option value="available">Available</option>
                <option value="busy">Busy</option>
                <option value="break">Break</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
          </div>
        </div>
        <div style="margin-top: 20px; display: flex; gap: 8px; justify-content: flex-end;">
          <button onclick="closeWorkerModal()" style="padding: 8px 16px; background: white; border: 1px solid var(--border); border-radius: 4px; cursor: pointer;">Cancel</button>
          <button onclick="saveWorker()" style="padding: 8px 16px; background: var(--primary); color: white; border: none; border-radius: 4px; cursor: pointer;">Save</button>
        </div>
      </div>
    </div>
  `;
}

export function generateOperations() {
  return `
    <div style="margin-bottom: 24px;">
      <h1 style="font-size: 32px; font-weight: 700; margin-bottom: 8px;">Operations Management</h1>
      <p style="color: var(--muted-foreground);">Define and manage production operations</p>
    </div>
    <div style="margin-bottom: 24px;">
      <button onclick=\"openAddOperationModal()\" style=\"background: var(--primary); color: var(--primary-foreground); padding: 12px 24px; border: none; border-radius: 6px; font-weight: 500; cursor: pointer;\">+ Add Operation</button>
    </div>
    <div class=\"card\">
      <div class=\"card-header\"><div class=\"card-title\">Operations</div><div class=\"card-description\">Manage MES Operations fetched from Firebase</div></div>
      <div class=\"card-content\">
        <div id=\"operations-list-container\"></div>
      </div>
    </div>

    <div id=\"operation-modal\" style=\"display:none; position:fixed; inset:0; background:rgba(0,0,0,0.5); z-index:1000;\" onclick=\"closeOperationModal(event)\">
      <div style=\"position:absolute; top:50%; left:50%; transform:translate(-50%,-50%); background:white; border-radius:8px; width:520px; max-height:80vh; overflow:auto; padding:24px;\" onclick=\"event.stopPropagation()\">
        <h3 id=\"operation-modal-title\" style=\"margin:0 0 20px 0;\">Add New Operation</h3>
        <div style=\"display:grid; gap:12px;\">
          <div>
            <label style=\"display:block; margin-bottom:6px; font-weight:500;\">Name</label>
            <input id=\"operation-name\" type=\"text\" style=\"width:100%; padding:8px 12px; border:1px solid var(--border); border-radius:6px;\" />
          </div>
          <div>
            <label style=\"display:block; margin-bottom:6px; font-weight:500;\">Type</label>
            <input id=\"operation-type\" type=\"text\" placeholder=\"e.g. Welding, Machining\" style=\"width:100%; padding:8px 12px; border:1px solid var(--border); border-radius:6px;\" />
          </div>
          <div>
            <label style=\"display:block; margin-bottom:6px; font-weight:500;\">Skills</label>
            <div id=\"operation-skills-box\"></div>
          </div>
          <div style=\"display:flex; align-items:center; gap:8px;\">
            <input id=\"operation-qc\" type=\"checkbox\" />
            <label for=\"operation-qc\">Quality Check Required</label>
          </div>
        </div>
        <div style=\"margin-top: 20px; display: flex; gap: 8px; justify-content: flex-end;\">
          <button onclick=\"closeOperationModal()\" style=\"padding: 8px 16px; background: white; border: 1px solid var(--border); border-radius: 4px; cursor: pointer;\">Cancel</button>
          <button onclick=\"saveOperation()\" style=\"padding: 8px 16px; background: var(--primary); color: white; border: none; border-radius: 4px; cursor: pointer;\">Save</button>
        </div>
      </div>
    </div>
  `;
}

export function generateStations() {
  return `
    <div style=\"margin-bottom: 24px;\">\n      <h1 style=\"font-size: 32px; font-weight: 700; margin-bottom: 8px;\">Stations Management</h1>\n      <p style=\"color: var(--muted-foreground);\">Configure production stations and equipment</p>\n    </div>\n    <div style=\"margin-bottom: 24px;\">\n      <button onclick=\"openAddStationModal()\" style=\"background: var(--primary); color: var(--primary-foreground); padding: 12px 24px; border: none; border-radius: 6px; font-weight: 500; cursor: pointer;\">+ Add Station</button>\n    </div>\n    
    <!-- Stations Table with Tabs -->
    <section class=\"materials-table\">
      <!-- Operation Type Tabs -->
      <div class=\"materials-tabs\" id=\"stations-tabs\">
        <!-- Tabs will be populated by renderStations() -->
      </div>
      
      <!-- Stations Table -->
      <div class=\"table-container\">
        <table id=\"stations-table\">
          <thead>
            <tr>
              <th>Station Name</th>
              <th>Status</th>
              <th>Location</th>
              <th>Operations</th>
              <th>Skills</th>
            </tr>
          </thead>
          <tbody id=\"stations-list\">
            <!-- Station rows will be populated by renderStations() -->
          </tbody>
        </table>
      </div>
    </section>\n\n    <div id=\"station-modal\" style=\"display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); z-index: 1000;\" onclick=\"closeStationModal(event)\">\n      <div style=\"position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); background: white; border-radius: 8px; padding: 24px; width: 640px; max-height: 80vh; overflow-y: auto;\" onclick=\"event.stopPropagation()\">\n        <h3 id=\"station-modal-title\" style=\"margin: 0 0 20px 0;\">Add New Station</h3>\n        <div class=\"grid grid-cols-2\" style=\"display:grid; grid-template-columns: 1fr 1fr; gap: 12px;\">\n          <div>\n            <label style=\"display:block; margin-bottom:6px; font-weight:500;\">Name</label>\n            <input type=\"text\" id=\"station-name\" placeholder=\"Station name\" style=\"width: 100%; padding: 8px 12px; border: 1px solid var(--border); border-radius: 6px;\" />\n          </div>\n          <div>\n            <label style=\"display:block; margin-bottom:6px; font-weight:500;\">Status</label>\n            <select id=\"station-status\" style=\"width: 100%; padding: 8px 12px; border: 1px solid var(--border); border-radius: 6px;\">\n              <option value=\"active\">active</option>\n              <option value=\"maintenance\">maintenance</option>\n              <option value=\"inactive\">inactive</option>\n            </select>\n          </div>\n          <div style=\"grid-column: 1 / span 2;\">\n            <label style=\"display:block; margin-bottom:6px; font-weight:500;\">Description</label>\n            <textarea id=\"station-description\" placeholder=\"Description\" style=\"width:100%; padding:8px 12px; border:1px solid var(--border); border-radius:6px; min-height:60px;\"></textarea>\n          </div>\n          <div>\n            <label style=\"display:block; margin-bottom:6px; font-weight:500;\">Location</label>\n            <input type=\"text\" id=\"station-location\" placeholder=\"e.g. Line A\" style=\"width: 100%; padding: 8px 12px; border: 1px solid var(--border); border-radius: 6px;\" />\n          </div>\n          <div>\n            <label style=\"display:block; margin-bottom:6px; font-weight:500;\">Sub-skills (station specific)</label>\n            <input type=\"text\" id=\"station-subskills\" placeholder=\"Comma separated\" style=\"width: 100%; padding: 8px 12px; border: 1px solid var(--border); border-radius: 6px;\" />\n          </div>\n          <div style=\"grid-column: 1 / span 2;\">\n            <label style=\"display:block; margin-bottom:6px; font-weight:500;\">Supported Operations</label>\n            <div id=\"station-operations\" style=\"display:grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; padding:8px; border:1px solid var(--border); border-radius:6px; background:#fff;\"></div>\n          </div>\n        </div>\n        <div style=\"margin-top: 20px; display: flex; gap: 8px; justify-content: space-between;\">\n          <div>\n            <button id=\"station-delete-btn\" onclick=\"deleteStationFromModal()\" style=\"padding: 8px 16px; background: white; border: 1px solid #ef4444; color: #ef4444; border-radius: 4px; cursor: pointer; display: none;\">Delete Station</button>\n          </div>\n          <div style=\"display: flex; gap: 8px;\">\n            <button onclick=\"closeStationModal()\" style=\"padding: 8px 16px; background: white; border: 1px solid var(--border); border-radius: 4px; cursor: pointer;\">Cancel</button>\n            <button onclick=\"saveStation()\" style=\"padding: 8px 16px; background: var(--primary); color: white; border: none; border-radius: 4px; cursor: pointer;\">Save</button>\n          </div>\n        </div>\n      </div>\n    </div>\n  `;
}

export function generatePlanDesigner() {
  return `
    <div style="margin-bottom: 24px;">
      <h1 style="font-size: 32px; font-weight: 700; margin-bottom: 8px;">Production Plan Designer</h1>
      <p style="color: var(--muted-foreground);">Create and manage production plans with drag & drop interface</p>
    </div>
    <div class="card" style="margin-bottom: 12px;">
      <div class="card-header" style="padding: 10px 12px;"><div class="card-title" style="font-size: 16px;">Plan Configuration</div><div class="card-description" style="font-size: 12px;">Set up your production plan</div></div>
      <div class="card-content" style="padding: 8px 12px;">
        <div style="display: flex; gap: 8px; align-items: flex-end;">
          <div style="flex: 1; min-width: 140px;"><label style="display: block; font-weight: 500; font-size: 13px; margin-bottom: 4px;">Plan</label><input type="text" id="plan-name" placeholder="Plan name" style="width: 100%; padding: 6px 8px; border: 1px solid var(--border); border-radius: 6px; font-size: 13px;" /></div>
          <div style="flex: 1; min-width: 180px;"><label style="display: block; font-weight: 500; font-size: 13px; margin-bottom: 4px;">Order</label><select id="order-select" style="width: 100%; padding: 6px 8px; border: 1px solid var(--border); border-radius: 6px; font-size: 13px;" onchange="handleOrderChange()"><option value="">Select an order...</option><option value="WO-2401">WO-2401 - Engine Block (500 units)</option><option value="WO-2402">WO-2402 - Gear Assembly (800 units)</option><option value="WO-2403">WO-2403 - Control Panel (300 units)</option></select></div>
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
    <div style="margin-bottom: 24px;"><button onclick="alert('Create Template functionality will be implemented')" style="background: var(--primary); color: var(--primary-foreground); padding: 12px 24px; border: none; border-radius: 6px; font-weight: 500; cursor: pointer;">+ Create Template</button></div>
    <div class="grid grid-cols-3">
      <div class="card"><div class="card-header"><div class="card-title">Standard Bracket Production</div><div class="card-description">Standard metal bracket manufacturing</div></div><div class="card-content"><div style="margin-bottom: 12px;"><strong>Operations:</strong> 3</div><div style="margin-bottom: 12px;"><strong>Duration:</strong> Station'a bağlı</div><div style="margin-bottom: 12px;"><strong>Skills Required:</strong><div><span class="badge badge-outline">Cutting</span><span class="badge badge-outline">Welding</span></div></div><div style="margin-top: 16px;"><button style="padding: 8px 16px; background: white; border: 1px solid var(--border); border-radius: 4px; margin-right: 8px; cursor: pointer;">Use Template</button><button style="padding: 8px 16px; background: white; border: 1px solid var(--border); border-radius: 4px; cursor: pointer;">Edit</button></div></div></div>
      <div class="card"><div class="card-header"><div class="card-title">Custom Assembly Process</div><div class="card-description">Multi-component assembly workflow</div></div><div class="card-content"><div style="margin-bottom: 12px;"><strong>Operations:</strong> 5</div><div style="margin-bottom: 12px;"><strong>Duration:</strong> Station'a bağlı</div><div style="margin-bottom: 12px;"><strong>Skills Required:</strong><div><span class="badge badge-outline">Assembly</span><span class="badge badge-outline">Quality Control</span></div></div><div style="margin-top: 16px;"><button style="padding: 8px 16px; background: white; border: 1px solid var(--border); border-radius: 4px; margin-right: 8px; cursor: pointer;">Use Template</button><button style="padding: 8px 16px; background: white; border: 1px solid var(--border); border-radius: 4px; cursor: pointer;">Edit</button></div></div></div>
      <div class="card"><div class="card-header"><div class="card-title">Quality Inspection</div><div class="card-description">Comprehensive quality check process</div></div><div class="card-content"><div style="margin-bottom: 12px;"><strong>Operations:</strong> 2</div><div style="margin-bottom: 12px;"><strong>Duration:</strong> Station'a bağlı</div><div style="margin-bottom: 12px;"><strong>Skills Required:</strong><div><span class="badge badge-outline">Quality Control</span></div></div><div style="margin-top: 16px;"><button style="padding: 8px 16px; background: white; border: 1px solid var(--border); border-radius: 4px; margin-right: 8px; cursor: pointer;">Use Template</button><button style="padding: 8px 16px; background: white; border: 1px solid var(--border); border-radius: 4px; cursor: pointer;">Edit</button></div></div></div>
    </div>
  `;
}
