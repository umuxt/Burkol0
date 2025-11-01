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
    <div style="margin-bottom: 24px;">
      <h1 style="font-size: 32px; font-weight: 700; margin-bottom: 8px;">Master Data</h1>
      <p style="color: var(--muted-foreground);">System configuration and setup</p>
    </div>
    <div class="grid grid-cols-2">
      <div class="card"><div class="card-header"><div class="card-title">System Configuration</div><div class="card-description">Basic system settings</div></div><div class="card-content">
        <div style="margin-bottom: 16px;"><label style="display: block; margin-bottom: 8px; font-weight: 500;">Company Name</label><input type="text" value="Burkol Metal" style="width: 100%; padding: 8px 12px; border: 1px solid var(--border); border-radius: 6px;" /></div>
        <div style="margin-bottom: 16px;"><label style="display: block; margin-bottom: 8px; font-weight: 500;">Working Hours</label><input type="text" value="08:00 - 17:00" style="width: 100%; padding: 8px 12px; border: 1px solid var(--border); border-radius: 6px;" /></div>
        <div style="margin-bottom: 16px;"><label style="display: block; margin-bottom: 8px; font-weight: 500;">Time Zone</label><select style="width: 100%; padding: 8px 12px; border: 1px solid var(--border); border-radius: 6px;"><option>Europe/Istanbul</option></select></div>
      </div></div>
      <div class="card"><div class="card-header"><div class="card-title">Production Settings</div><div class="card-description">Configure production parameters</div></div><div class="card-content">
        <div style="margin-bottom: 16px;">
          <label style="display: block; margin-bottom: 8px; font-weight: 500;">Default Batch Size</label>
          <input type="number" value="100" style="width: 100%; padding: 8px 12px; border: 1px solid var(--border); border-radius: 6px;" />
        </div>
        <div style="margin-bottom: 16px;">
          <label style="display: block; margin-bottom: 8px; font-weight: 500;">Auto-Assignment</label>
          <div style="display: flex; align-items: center; gap: 8px;"><input type="checkbox" checked /><span>Enable automatic worker assignment</span></div>
        </div>
        <div style="margin-bottom: 16px;">
          <label style="display: block; margin-bottom: 8px; font-weight: 500;">Quality Check</label>
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
    <div style="margin-bottom: 24px;"><button onclick="alert('Add Worker functionality will be implemented')" style="background: var(--primary); color: var(--primary-foreground); padding: 12px 24px; border: none; border-radius: 6px; font-weight: 500; cursor: pointer;">+ Add Worker</button></div>
    <div class="card">
      <div class="card-header"><div class="card-title">Worker List</div><div class="card-description">Manage your workforce</div></div>
      <div class="card-content">
        <table class="table"><thead><tr><th>Name</th><th>Skills</th><th>Shift</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody>
          <tr><td><strong>Ali Kaya</strong><br><small>ali@burkol.com</small></td><td><span class="badge badge-outline">Welding</span><span class="badge badge-outline">Cutting</span></td><td>Day Shift</td><td><span class="badge badge-success">Available</span></td><td><button style="padding: 4px 8px; margin-right: 4px; border: 1px solid var(--border); background: white; border-radius: 4px; cursor: pointer;">Edit</button><button style="padding: 4px 8px; border: 1px solid #ef4444; background: white; color: #ef4444; border-radius: 4px; cursor: pointer;">Delete</button></td></tr>
          <tr><td><strong>Mehmet Yılmaz</strong><br><small>mehmet@burkol.com</small></td><td><span class="badge badge-outline">Assembly</span><span class="badge badge-outline">Quality Control</span></td><td>Day Shift</td><td><span class="badge badge-warning">Busy</span></td><td><button style="padding: 4px 8px; margin-right: 4px; border: 1px solid var(--border); background: white; border-radius: 4px; cursor: pointer;">Edit</button><button style="padding: 4px 8px; border: 1px solid #ef4444; background: white; color: #ef4444; border-radius: 4px; cursor: pointer;">Delete</button></td></tr>
        </tbody></table>
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
    <div style="margin-bottom: 24px;"><button onclick="alert('Add Operation functionality will be implemented')" style="background: var(--primary); color: var(--primary-foreground); padding: 12px 24px; border: none; border-radius: 6px; font-weight: 500; cursor: pointer;">+ Add Operation</button></div>
    <div class="grid grid-cols-3">
      <div class="card"><div class="card-header"><div class="card-title">Welding</div><div class="card-description">Metal joining operations</div></div><div class="card-content"><div style="margin-bottom: 12px;"><strong>Duration:</strong> 30 min</div><div style="margin-bottom: 12px;"><strong>Required Skills:</strong><div><span class="badge badge-outline">Welding</span></div></div><div style="margin-bottom: 12px;"><strong>Quality Check:</strong> Required</div></div></div>
      <div class="card"><div class="card-header"><div class="card-title">Cutting</div><div class="card-description">Material cutting operations</div></div><div class="card-content"><div style="margin-bottom: 12px;"><strong>Duration:</strong> 15 min</div><div style="margin-bottom: 12px;"><strong>Required Skills:</strong><div><span class="badge badge-outline">Cutting</span></div></div><div style="margin-bottom: 12px;"><strong>Quality Check:</strong> Optional</div></div></div>
      <div class="card"><div class="card-header"><div class="card-title">Assembly</div><div class="card-description">Part assembly operations</div></div><div class="card-content"><div style="margin-bottom: 12px;"><strong>Duration:</strong> 45 min</div><div style="margin-bottom: 12px;"><strong>Required Skills:</strong><div><span class="badge badge-outline">Assembly</span></div></div><div style="margin-bottom: 12px;"><strong>Quality Check:</strong> Required</div></div></div>
    </div>
  `;
}

export function generateStations() {
  return '<div style="margin-bottom: 24px;">' +
    '<h1 style="font-size: 32px; font-weight: 700; margin-bottom: 8px;">Stations Management</h1>' +
    '<p style="color: var(--muted-foreground);">Configure production stations and equipment</p>' +
  '</div>' +
  '<div style="margin-bottom: 24px;"><button onclick="openAddStationModal()" style="background: var(--primary); color: var(--primary-foreground); padding: 12px 24px; border: none; border-radius: 6px; font-weight: 500; cursor: pointer;">+ Add Station</button></div>' +
  '<div class="grid grid-cols-2 gap-6">' +
    MESData.stations.map(station =>
      '<div class="card">' +
        '<div class="card-header"><div class="card-title">' + station.name + '</div><div class="card-description">' + (station.description || '') + '</div></div>' +
        '<div class="card-content">' +
          '<div style="margin-bottom: 12px;"><strong>Status:</strong> <span class="badge badge-' + (station.status === 'active' ? 'success' : station.status === 'maintenance' ? 'warning' : 'default') + '">' + station.status.charAt(0).toUpperCase() + station.status.slice(1) + '</span></div>' +
          '<div style="margin-bottom: 12px;"><strong>Current Worker:</strong> ' + (station.currentWorker || 'Not assigned') + '</div>' +
          '<div style="margin-bottom: 12px;"><strong>Current Operation:</strong> ' + (station.currentOperation || 'None') + '</div>' +
          '<div style="margin-bottom: 12px;"><strong>Capabilities:</strong><div>' + (station.capabilities || []).map(cap => '<span class="badge badge-outline" style="margin-right: 4px;">' + cap + '</span>').join('') + '</div></div>' +
          '<div style="margin-top: 16px; display: flex; gap: 8px;">' +
            '<button onclick="editStation(\'' + station.id + '\')" style="padding: 6px 12px; background: white; border: 1px solid var(--border); border-radius: 4px; cursor: pointer;">Edit</button>' +
            '<button onclick="toggleStationStatus(\'' + station.id + '\')" style="padding: 6px 12px; background: ' + (station.status === 'active' ? '#f59e0b' : '#10b981') + '; color: white; border: none; border-radius: 4px; cursor: pointer;">' + (station.status === 'active' ? 'Maintenance' : 'Activate') + '</button>' +
            '<button onclick="deleteStation(\'' + station.id + '\')" style="padding: 6px 12px; background: #ef4444; color: white; border: none; border-radius: 4px; cursor: pointer;">Delete</button>' +
          '</div>' +
        '</div>' +
      '</div>'
    ).join('') +
  '</div>' +
  '<div id="station-modal" style="display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); z-index: 1000;" onclick="closeStationModal(event)">' +
    '<div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); background: white; border-radius: 8px; padding: 24px; width: 500px; max-height: 80vh; overflow-y: auto;">' +
      '<h3 id="station-modal-title" style="margin: 0 0 20px 0;">Add New Station</h3>' +
      '<div>' +
        '<div style="margin-bottom: 16px;"><label style="display: block; margin-bottom: 8px; font-weight: 500;">Station Name</label><input type="text" id="station-name" placeholder="Enter station name" style="width: 100%; padding: 8px 12px; border: 1px solid var(--border); border-radius: 6px;" /></div>' +
        '<div style="margin-bottom: 16px;"><label style="display: block; margin-bottom: 8px; font-weight: 500;">Description</label><input type="text" id="station-description" placeholder="Enter description" style="width: 100%; padding: 8px 12px; border: 1px solid var(--border); border-radius: 6px;" /></div>' +
        '<div style="margin-bottom: 16px;"><label style="display: block; margin-bottom: 8px; font-weight: 500;">Location</label><input type="text" id="station-location" placeholder="Enter location" style="width: 100%; padding: 8px 12px; border: 1px solid var(--border); border-radius: 6px;" /></div>' +
        '<div style="margin-bottom: 16px;"><label style="display: block; margin-bottom: 8px; font-weight: 500;">Status</label><select id="station-status" style="width: 100%; padding: 8px 12px; border: 1px solid var(--border); border-radius: 6px;"><option value="active">Active</option><option value="maintenance">Maintenance</option><option value="inactive">Inactive</option></select></div>' +
        '<div style="margin-bottom: 16px;"><label style="display: block; margin-bottom: 8px; font-weight: 500;">Capabilities</label><div id="station-capabilities" style="border: 1px solid var(--border); border-radius: 6px; padding: 12px;">' +
          '<div style="margin-bottom: 8px;"><label style="display: flex; align-items: center; gap: 8px;"><input type="checkbox" value="Welding"> Welding</label></div>' +
          '<div style="margin-bottom: 8px;"><label style="display: flex; align-items: center; gap: 8px;"><input type="checkbox" value="Cutting"> Cutting</label></div>' +
          '<div style="margin-bottom: 8px;"><label style="display: flex; align-items: center; gap: 8px;"><input type="checkbox" value="Assembly"> Assembly</label></div>' +
          '<div style="margin-bottom: 8px;"><label style="display: flex; align-items: center; gap: 8px;"><input type="checkbox" value="Quality Control"> Quality Control</label></div>' +
          '<div style="margin-bottom: 8px;"><label style="display: flex; align-items: center; gap: 8px;"><input type="checkbox" value="Packaging"> Packaging</label></div>' +
          '<div style="margin-bottom: 8px;"><label style="display: flex; align-items: center; gap: 8px;"><input type="checkbox" value="Surface Treatment"> Surface Treatment</label></div>' +
          '<div style="margin-bottom: 8px;"><label style="display: flex; align-items: center; gap: 8px;"><input type="checkbox" value="Painting"> Painting</label></div>' +
          '<div><label style="display: flex; align-items: center; gap: 8px;"><input type="checkbox" value="Drilling"> Drilling</label></div>' +
        '</div></div>' +
      '</div>' +
      '<div style="margin-top: 20px; display: flex; gap: 8px; justify-content: flex-end;"><button onclick="closeStationModal()" style="padding: 8px 16px; background: white; border: 1px solid var(--border); border-radius: 4px; cursor: pointer;">Cancel</button><button onclick="saveStation()" style="padding: 8px 16px; background: var(--primary); color: white; border: none; border-radius: 4px; cursor: pointer;">Save</button></div>' +
    '</div>' +
  '</div>';
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
      <div class="card"><div class="card-header"><div class="card-title">Standard Bracket Production</div><div class="card-description">Standard metal bracket manufacturing</div></div><div class="card-content"><div style="margin-bottom: 12px;"><strong>Operations:</strong> 3</div><div style="margin-bottom: 12px;"><strong>Duration:</strong> 90 min</div><div style="margin-bottom: 12px;"><strong>Skills Required:</strong><div><span class="badge badge-outline">Cutting</span><span class="badge badge-outline">Welding</span></div></div><div style="margin-top: 16px;"><button style="padding: 8px 16px; background: white; border: 1px solid var(--border); border-radius: 4px; margin-right: 8px; cursor: pointer;">Use Template</button><button style="padding: 8px 16px; background: white; border: 1px solid var(--border); border-radius: 4px; cursor: pointer;">Edit</button></div></div></div>
      <div class="card"><div class="card-header"><div class="card-title">Custom Assembly Process</div><div class="card-description">Multi-component assembly workflow</div></div><div class="card-content"><div style="margin-bottom: 12px;"><strong>Operations:</strong> 5</div><div style="margin-bottom: 12px;"><strong>Duration:</strong> 150 min</div><div style="margin-bottom: 12px;"><strong>Skills Required:</strong><div><span class="badge badge-outline">Assembly</span><span class="badge badge-outline">Quality Control</span></div></div><div style="margin-top: 16px;"><button style="padding: 8px 16px; background: white; border: 1px solid var(--border); border-radius: 4px; margin-right: 8px; cursor: pointer;">Use Template</button><button style="padding: 8px 16px; background: white; border: 1px solid var(--border); border-radius: 4px; cursor: pointer;">Edit</button></div></div></div>
      <div class="card"><div class="card-header"><div class="card-title">Quality Inspection</div><div class="card-description">Comprehensive quality check process</div></div><div class="card-content"><div style="margin-bottom: 12px;"><strong>Operations:</strong> 2</div><div style="margin-bottom: 12px;"><strong>Duration:</strong> 30 min</div><div style="margin-bottom: 12px;"><strong>Skills Required:</strong><div><span class="badge badge-outline">Quality Control</span></div></div><div style="margin-top: 16px;"><button style="padding: 8px 16px; background: white; border: 1px solid var(--border); border-radius: 4px; margin-right: 8px; cursor: pointer;">Use Template</button><button style="padding: 8px 16px; background: white; border: 1px solid var(--border); border-radius: 4px; cursor: pointer;">Edit</button></div></div></div>
    </div>
  `;
}

