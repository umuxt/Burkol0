// MES Production Dashboard - Analytics & Metrics
import { API_BASE, withAuth } from '../../../shared/lib/api.js';

let charts = {
  workerUtilization: null,
  bottleneck: null,
  material: null
};

// Initialize dashboard on load
document.addEventListener('DOMContentLoaded', async () => {
  console.log('Dashboard DOM loaded, starting data load...');
  console.log('Canvas elements check:', {
    worker: document.getElementById('worker-utilization-chart'),
    bottleneck: document.getElementById('bottleneck-chart'),
    material: document.getElementById('material-chart')
  });
  await loadDashboardData();
  
  // Auto-refresh every 30 seconds
  setInterval(loadDashboardData, 30000);
});

// Refresh button handler
window.refreshDashboard = async () => {
  await loadDashboardData();
};

// Main data loader
async function loadDashboardData() {
  try {
    // Fetch all analytics data in parallel
    const [utilization, bottlenecks, materials, velocity, timeline] = await Promise.all([
      fetchAnalytics('/analytics/worker-utilization'),
      fetchAnalytics('/analytics/operation-bottlenecks'),
      fetchAnalytics('/analytics/material-consumption'),
      fetchAnalytics('/analytics/production-velocity'),
      fetchAnalytics('/analytics/master-timeline')
    ]);

    // Update KPI cards
    updateKPICards(utilization, velocity);
    
    // Render charts
    renderWorkerUtilizationChart(utilization);
    renderBottleneckChart(bottlenecks);
    renderMaterialChart(materials);
    renderMasterGantt(timeline);
    
    // Update last updated timestamp
    document.getElementById('last-updated').textContent = new Date().toLocaleString('tr-TR');
    
  } catch (error) {
    console.error('Dashboard load error:', error);
    showError('Failed to load dashboard data. Please refresh the page.');
  }
}

// Fetch helper
async function fetchAnalytics(endpoint) {
  const res = await fetch(`${API_BASE}/api/mes${endpoint}`, {
    headers: withAuth()
  });
  
  if (!res.ok) {
    throw new Error(`Analytics fetch failed: ${endpoint} (${res.status})`);
  }
  
  return await res.json();
}

// Update KPI Cards
function updateKPICards(utilization, velocity) {
  document.getElementById('kpi-active-wo').textContent = velocity.overall.active;
  document.getElementById('kpi-worker-util').textContent = `${utilization.utilizationRate}%`;
  
  // Calculate average efficiency from active workers
  const activeWorkers = utilization.perWorker.filter(w => w.isActive);
  const avgEfficiency = activeWorkers.length > 0
    ? (activeWorkers.reduce((sum, w) => sum + w.efficiency, 0) / activeWorkers.length * 100)
    : 0;
  document.getElementById('kpi-efficiency').textContent = `${avgEfficiency.toFixed(0)}%`;
  
  document.getElementById('kpi-velocity').textContent = velocity.today.launched;
}

// Worker Utilization Pie Chart
function renderWorkerUtilizationChart(data) {
  const ctx = document.getElementById('worker-utilization-chart');
  
  if (!ctx) {
    console.warn('Worker utilization chart canvas not found');
    return;
  }
  
  // Destroy existing chart
  if (charts.workerUtilization) {
    charts.workerUtilization.destroy();
  }
  
  charts.workerUtilization = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Active', 'Idle', 'On Break'],
      datasets: [{
        data: [data.active, data.idle, data.onBreak],
        backgroundColor: [
          '#10b981', // green
          '#6b7280', // gray
          '#f59e0b'  // amber
        ],
        borderWidth: 0
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            padding: 15,
            font: {
              size: 12
            }
          }
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              const label = context.label || '';
              const value = context.parsed || 0;
              const total = data.total;
              const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : 0;
              return `${label}: ${value} (${percentage}%)`;
            }
          }
        }
      }
    }
  });
}

// Operation Bottleneck Bar Chart
function renderBottleneckChart(data) {
  const ctx = document.getElementById('bottleneck-chart');
  
  if (!ctx) {
    console.warn('Bottleneck chart canvas not found');
    return;
  }
  
  if (charts.bottleneck) {
    charts.bottleneck.destroy();
  }
  
  const topOps = data.topBottlenecks || [];
  
  if (topOps.length === 0) {
    const container = ctx.closest('.chart-canvas');
    if (container) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon"><i data-lucide="bar-chart" style="width: 48px; height: 48px; opacity: 0.5;"></i></div>
          <div>No completed operations yet</div>
        </div>
      `;
      // Re-initialize lucide icons
      if (typeof lucide !== 'undefined') lucide.createIcons();
    }
    return;
  }
  
  charts.bottleneck = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: topOps.map(op => op.operationName),
      datasets: [{
        label: 'Average Time (minutes)',
        data: topOps.map(op => op.avgTime),
        backgroundColor: '#3b82f6',
        borderRadius: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      indexAxis: 'y',
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              const value = context.parsed.x;
              return `${value.toFixed(1)} minutes`;
            }
          }
        }
      },
      scales: {
        x: {
          beginAtZero: true,
          title: {
            display: true,
            text: 'Minutes'
          }
        }
      }
    }
  });
}

// Material Stock Levels Chart
function renderMaterialChart(data) {
  const ctx = document.getElementById('material-chart');
  
  if (!ctx) {
    console.warn('Material chart canvas not found');
    return;
  }
  
  if (charts.material) {
    charts.material.destroy();
  }
  
  // Show top 10 materials by stock level
  const topMaterials = data.materials
    .sort((a, b) => b.stock - a.stock)
    .slice(0, 10);
  
  if (topMaterials.length === 0) {
    const container = ctx.closest('.chart-canvas');
    if (container) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon"><i data-lucide="package" style="width: 48px; height: 48px; opacity: 0.5;"></i></div>
          <div>No materials found</div>
        </div>
      `;
      // Re-initialize lucide icons
      if (typeof lucide !== 'undefined') lucide.createIcons();
    }
    return;
  }
  
  charts.material = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: topMaterials.map(m => m.code),
      datasets: [
        {
          label: 'Available',
          data: topMaterials.map(m => m.available),
          backgroundColor: '#10b981',
          stack: 'stack0'
        },
        {
          label: 'Reserved',
          data: topMaterials.map(m => m.reserved),
          backgroundColor: '#f59e0b',
          stack: 'stack0'
        },
        {
          label: 'WIP Reserved',
          data: topMaterials.map(m => m.wipReserved),
          backgroundColor: '#ef4444',
          stack: 'stack0'
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: {
          position: 'top'
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              return `${context.dataset.label}: ${context.parsed.y} ${topMaterials[context.dataIndex].unit}`;
            }
          }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          stacked: true,
          title: {
            display: true,
            text: 'Quantity'
          }
        },
        x: {
          stacked: true
        }
      }
    }
  });
}

// Master Gantt Timeline
function renderMasterGantt(data) {
  const container = document.getElementById('master-gantt-chart');
  
  if (!data.workOrders || data.workOrders.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon"><i data-lucide="calendar-x" style="width: 48px; height: 48px; opacity: 0.5;"></i></div>
        <div>No active work orders</div>
      </div>
    `;
    // Re-initialize lucide icons
    if (typeof lucide !== 'undefined') lucide.createIcons();
    return;
  }
  
  // Simple timeline visualization (can be replaced with ApexCharts or similar)
  let html = '<div style="font-family: monospace; font-size: 12px;">';
  
  data.workOrders.forEach(wo => {
    html += `<div style="margin-bottom: 16px; padding: 12px; background: #f9fafb; border-radius: 6px; border-left: 4px solid #3b82f6;">`;
    html += `<div style="font-weight: 600; margin-bottom: 8px; color: #111827;">📋 ${wo.workOrderCode}</div>`;
    
    if (wo.assignments.length === 0) {
      html += `<div style="color: #6b7280; font-size: 11px;">No assignments</div>`;
    } else {
      wo.assignments.forEach(a => {
        const start = new Date(a.start);
        const end = new Date(a.end);
        const duration = ((end - start) / 3600000).toFixed(1);
        const statusColor = {
          'pending': '#6b7280',
          'ready': '#f59e0b',
          'in_progress': '#10b981',
          'completed': '#3b82f6',
          'paused': '#ef4444'
        }[a.status] || '#6b7280';
        
        html += `
          <div style="display: flex; align-items: center; gap: 8px; margin-top: 6px; padding: 4px; background: white; border-radius: 4px;">
            <span style="width: 8px; height: 8px; border-radius: 50%; background: ${statusColor};"></span>
            <span style="flex: 1; font-size: 11px;">${a.nodeName}</span>
            <span style="color: #6b7280; font-size: 10px;">👷 ${a.workerName}</span>
            <span style="color: #6b7280; font-size: 10px;">⏱️ ${duration}h</span>
            <span style="font-size: 10px; padding: 2px 6px; background: ${statusColor}20; color: ${statusColor}; border-radius: 3px; font-weight: 500;">${a.status}</span>
          </div>
        `;
      });
    }
    
    html += '</div>';
  });
  
  html += '</div>';
  container.innerHTML = html;
}

// Error display
function showError(message) {
  const container = document.querySelector('.dashboard-container');
  const errorDiv = document.createElement('div');
  errorDiv.style.cssText = 'position: fixed; top: 20px; right: 20px; background: #fee2e2; color: #dc2626; padding: 12px 20px; border-radius: 6px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); z-index: 9999;';
  errorDiv.textContent = message;
  container.appendChild(errorDiv);
  
  setTimeout(() => errorDiv.remove(), 5000);
}

// Export handlers
window.exportDashboardPDF = async () => {
  alert('PDF export functionality will be implemented with jsPDF library');
};

window.exportDashboardCSV = async () => {
  try {
    // Fetch all analytics data
    const [utilization, bottlenecks, materials, velocity] = await Promise.all([
      fetchAnalytics('/analytics/worker-utilization'),
      fetchAnalytics('/analytics/operation-bottlenecks'),
      fetchAnalytics('/analytics/material-consumption'),
      fetchAnalytics('/analytics/production-velocity')
    ]);

    // Prepare CSV content
    let csv = 'Production Analytics Dashboard Export\n';
    csv += `Generated: ${new Date().toLocaleString()}\n\n`;
    
    // Worker Utilization
    csv += 'WORKER UTILIZATION\n';
    csv += 'Worker Name,Status,Efficiency\n';
    utilization.perWorker.forEach(w => {
      csv += `${w.name},${w.status},${(w.efficiency * 100).toFixed(1)}%\n`;
    });
    csv += '\n';
    
    // Operation Bottlenecks
    csv += 'OPERATION BOTTLENECKS\n';
    csv += 'Operation,Avg Duration (min),Count\n';
    bottlenecks.topBottlenecks.forEach(op => {
      csv += `${op.name},${op.avgDuration.toFixed(1)},${op.count}\n`;
    });
    csv += '\n';
    
    // Material Consumption
    csv += 'MATERIAL STOCK LEVELS\n';
    csv += 'Material Name,Current Stock,Reorder Point,Max Stock,Status\n';
    materials.materials.forEach(m => {
      const status = m.stock_level <= m.reorder_point ? 'Low Stock' : 'OK';
      csv += `${m.material_name},${m.stock_level},${m.reorder_point},${m.max_stock},${status}\n`;
    });
    csv += '\n';
    
    // Production Velocity
    csv += 'PRODUCTION VELOCITY\n';
    csv += `Today: ${velocity.today} launches\n`;
    csv += `This Week: ${velocity.week} launches\n`;
    csv += `This Month: ${velocity.month} launches\n`;

    // Download CSV
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `production-analytics-${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } catch (error) {
    console.error('CSV export failed:', error);
    showError('Failed to export CSV');
  }
};

