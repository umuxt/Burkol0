/**
 * Production Monitoring UI Enhancement
 * Real-time monitoring of production plans with SSE integration
 */

import { API_BASE, withAuth } from '../../../shared/lib/api.js';
import { getWorkPackages } from './mesApi.js';

// SSE connections map for cleanup
const sseConnections = new Map();

/**
 * Enhanced production monitoring panel with real-time updates
 * Replaces basic work packages list in showApprovedQuoteDetail
 */
export async function showEnhancedProductionMonitoring(workOrderCode, plan, containerId) {
  const container = document.getElementById(containerId);
  if (!container) {
    console.error(`Container ${containerId} not found`);
    return;
  }

  // Show loading state
  container.innerHTML = `
    <div class="pm-title-12">
      🎯 Üretim İzleme
    </div>
    <div class="pm-empty">
      <i class="fa-solid fa-spinner fa-spin"></i> Yükleniyor...
    </div>
  `;

  try {
    // Fetch work packages
    const { workPackages } = await getWorkPackages({ limit: 1000 });
    const relatedAssignments = workPackages.filter(pkg => pkg.workOrderCode === workOrderCode);

    // Fetch production plan details if available
    let planDetails = null;
    if (plan?.id) {
      try {
        const planRes = await fetch(`${API_BASE}/api/mes/production-plans/${encodeURIComponent(plan.id)}`, {
          headers: withAuth()
        });
        if (planRes.ok) {
          planDetails = await planRes.json();
        }
      } catch (e) {
        console.warn('Failed to fetch plan details:', e);
      }
    }

    // Render enhanced monitoring UI
    container.innerHTML = renderEnhancedMonitoringUI(
      workOrderCode, 
      plan, 
      planDetails, 
      relatedAssignments
    );

    // Setup real-time updates if plan is active
    if (plan?.id && plan.status === 'production') {
      setupRealTimeUpdates(plan.id, workOrderCode, containerId);
    }

  } catch (error) {
    console.error('Failed to load production monitoring:', error);
    container.innerHTML = `
      <div class="pm-title">🎯 Üretim İzleme</div>
      <div class="pm-error">
        <i class="fa-solid fa-exclamation-triangle"></i> Yüklenemedi: ${escapeHtml(error.message)}
      </div>
    `;
  }
}

/**
 * Render enhanced monitoring UI with metrics and progress tracking
 */
function renderEnhancedMonitoringUI(workOrderCode, plan, planDetails, assignments) {
  const esc = escapeHtml;

  // Calculate metrics
  const totalNodes = planDetails?.nodes?.length || 0;
  const completedNodes = assignments.filter(a => a.status === 'completed').length;
  const inProgressNodes = assignments.filter(a => a.status === 'in-progress').length;
  const pendingNodes = assignments.filter(a => a.status === 'pending' || a.status === 'ready').length;
  const queuedNodes = assignments.filter(a => a.status === 'queued').length;
  const cancelledNodes = assignments.filter(a => a.status === 'cancelled').length;
  
  const progressPercent = totalNodes > 0 ? Math.round((completedNodes / totalNodes) * 100) : 0;
  
  // Calculate time estimates
  const now = new Date();
  const allStarts = assignments
    .filter(a => a.estimatedStartTime)
    .map(a => new Date(a.estimatedStartTime));
  const allEnds = assignments
    .filter(a => a.estimatedEndTime)
    .map(a => new Date(a.estimatedEndTime));
  
  const minStart = allStarts.length > 0 ? new Date(Math.min(...allStarts.map(d => d.getTime()))) : null;
  const maxEnd = allEnds.length > 0 ? new Date(Math.max(...allEnds.map(d => d.getTime()))) : null;
  
  let timeRemaining = null;
  if (maxEnd) {
    const remainingMs = maxEnd.getTime() - now.getTime();
    if (remainingMs > 0) {
      timeRemaining = Math.ceil(remainingMs / 60000); // minutes
    }
  }

  // Aggregate materials (inputs and outputs)
  const materialInputs = {};
  const materialOutputs = {};
  
  assignments.forEach(assignment => {
    const inputs = assignment.preProductionReservedAmount || assignment.materialInputs || {};
    Object.entries(inputs).forEach(([code, qty]) => {
      materialInputs[code] = (materialInputs[code] || 0) + Number(qty || 0);
    });
    
    const outputs = assignment.plannedOutput || {};
    Object.entries(outputs).forEach(([code, qty]) => {
      materialOutputs[code] = (materialOutputs[code] || 0) + Number(qty || 0);
    });
  });

  // Build UI
  return `
    <div class="pm-title-flex">
      <span>🎯 Üretim İzleme</span>
      ${plan?.status === 'production' ? '<span class="pm-badge-success">CANLI</span>' : ''}
    </div>

    <!-- Progress Overview -->
    <div class="pm-card">
      <div class="pm-section-title">📊 İlerleme Durumu</div>
      
      <!-- Progress Bar -->
      <div class="pm-mb-12">
        <div class="pm-flex-between">
          <span class="pm-label">Tamamlanan Operasyonlar</span>
          <span class="pm-value-bold">${completedNodes}/${totalNodes} (${progressPercent}%)</span>
        </div>
        <div class="pm-progress">
          <div style="width: ${progressPercent}%; height: 100%; background: linear-gradient(90deg, #10b981, #059669); transition: width 0.3s ease;"></div>
        </div>
      </div>

      <!-- Status Breakdown -->
      <div class="pm-grid-stats">
        ${inProgressNodes > 0 ? `
          <div class="pm-status-cell-blue">
            <div class="pm-text-bold-blue">${inProgressNodes}</div>
            <div class="pm-text-blue">Devam Eden</div>
          </div>
        ` : ''}
        ${pendingNodes > 0 ? `
          <div class="pm-status-cell-amber">
            <div class="pm-text-bold-amber">${pendingNodes}</div>
            <div class="pm-text-amber">Bekleyen</div>
          </div>
        ` : ''}
        ${queuedNodes > 0 ? `
          <div class="pm-status-cell-gray">
            <div class="pm-text-bold-gray">${queuedNodes}</div>
            <div class="pm-text-gray">Sırada</div>
          </div>
        ` : ''}
        ${cancelledNodes > 0 ? `
          <div class="pm-status-cell-red">
            <div class="pm-text-bold-red">${cancelledNodes}</div>
            <div class="pm-text-red">İptal</div>
          </div>
        ` : ''}
      </div>

      <!-- Time Estimates -->
      ${timeRemaining !== null ? `
        <div class="pm-info-blue">
          <div class="pm-text-blue-bold">
            ⏱️ Tahmini Kalan Süre: ${formatDuration(timeRemaining)}
          </div>
          ${maxEnd ? `
            <div class="pm-value-sm">
              Tahmini Bitiş: ${maxEnd.toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' })}
            </div>
          ` : ''}
        </div>
      ` : ''}
    </div>

    <!-- Material Summary -->
    ${Object.keys(materialInputs).length > 0 || Object.keys(materialOutputs).length > 0 ? `
      <div class="pm-card-sm">
        <div class="pm-section-title">📦 Malzeme Özeti</div>
        <div class="pm-grid-2col">
          <div>
            <div class="pm-label">Giriş Malzemeleri:</div>
            <div class="pm-value">
              ${Object.entries(materialInputs).length > 0 
                ? Object.entries(materialInputs).map(([code, qty]) => 
                    `<div>• ${esc(code)}: <strong>${qty}</strong></div>`
                  ).join('')
                : '<span class="pm-text-muted">Yok</span>'}
            </div>
          </div>
          <div>
            <div class="pm-label">Çıkış Ürünleri:</div>
            <div class="pm-value">
              ${Object.entries(materialOutputs).length > 0
                ? Object.entries(materialOutputs).map(([code, qty]) => 
                    `<div>• ${esc(code)}: <strong>${qty}</strong></div>`
                  ).join('')
                : '<span class="pm-text-muted">Yok</span>'}
            </div>
          </div>
        </div>
      </div>
    ` : ''}

    <!-- Assignments Table -->
    <div class="pm-mb-16">
      <div class="pm-section-title">
        📋 Work Packages (${assignments.length})
      </div>
      ${assignments.length === 0 ? `
        <div class="pm-empty-box">
          <i class="fa-solid fa-info-circle"></i> Bu work order için henüz assignment oluşturulmamış
        </div>
      ` : `
        <div class="pm-scroll-x">
          <table class="pm-table">
            <thead>
              <tr class="pm-tr-header">
                <th class="pm-th">Operasyon</th>
                <th class="pm-th">İşçi</th>
                <th class="pm-th">İstasyon</th>
                <th class="pm-th">Durum</th>
                <th class="pm-th">Sıra</th>
                <th class="pm-th">Zaman</th>
              </tr>
            </thead>
            <tbody id="monitoring-assignments-tbody">
              ${renderAssignmentRows(assignments, esc)}
            </tbody>
          </table>
        </div>
      `}
    </div>

    <!-- Bottleneck Detection -->
    ${detectBottlenecks(assignments)}
  `;
}

/**
 * Render assignment table rows
 */
function renderAssignmentRows(assignments, esc) {
  const getStatusBadge = (status) => {
    const statusMap = {
      'pending': { label: 'Beklemede', bg: '#f3f4f6', color: '#374151' },
      'ready': { label: 'Hazır', bg: '#fef3c7', color: '#92400e' },
      'in-progress': { label: 'Devam Ediyor', bg: '#dbeafe', color: '#1e40af' },
      'paused': { label: 'Duraklatıldı', bg: '#fee2e2', color: '#991b1b' },
      'completed': { label: 'Tamamlandı', bg: '#d1fae5', color: '#065f46' },
      'cancelled': { label: 'İptal', bg: '#f3f4f6', color: '#6b7280' },
      'queued': { label: 'Sırada', bg: '#f3f4f6', color: '#6b7280' }
    };
    const s = statusMap[status] || { label: status, bg: '#f3f4f6', color: '#374151' };
    return `<span style="display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 500; background: ${s.bg}; color: ${s.color};">${s.label}</span>`;
  };

  return assignments.map(a => {
    const estimatedStart = a.estimatedStartTime ? new Date(a.estimatedStartTime) : null;
    const estimatedEnd = a.estimatedEndTime ? new Date(a.estimatedEndTime) : null;
    const actualStart = a.startedAt ? new Date(a.startedAt) : null;
    const actualEnd = a.completedAt ? new Date(a.completedAt) : null;

    let timeDisplay = '-';
    if (actualStart && actualEnd) {
      const duration = Math.ceil((actualEnd - actualStart) / 60000);
      timeDisplay = `✅ ${formatDuration(duration)}`;
    } else if (actualStart) {
      const elapsed = Math.ceil((new Date() - actualStart) / 60000);
      timeDisplay = `⏱️ ${formatDuration(elapsed)} (devam ediyor)`;
    } else if (estimatedStart && estimatedEnd) {
      const duration = Math.ceil((estimatedEnd - estimatedStart) / 60000);
      timeDisplay = `~${formatDuration(duration)}`;
    }

    return `
      <tr class="pm-tr-row" data-assignment-id="${esc(a.assignmentId || a.id)}">
        <td class="pm-td">${esc(a.operationName || a.nodeName || '-')}</td>
        <td class="pm-td">${esc(a.workerName || '-')}</td>
        <td class="pm-td">
          ${esc(a.stationName || '-')}
          ${(a.substationCode || a.subStationCode) ? `<br><span class="pm-value-sm">🔧 ${esc(a.substationCode || a.subStationCode)}</span>` : ''}
        </td>
        <td class="pm-td">${getStatusBadge(a.status)}</td>
        <td class="pm-th-center">${a.sequenceNumber || '-'}</td>
        <td class="pm-td">${timeDisplay}</td>
      </tr>
    `;
  }).join('');
}

/**
 * Detect potential bottlenecks
 */
function detectBottlenecks(assignments) {
  const warnings = [];

  // Check for workers with high queue counts
  const workerQueues = new Map();
  assignments.forEach(a => {
    const workerId = a.workerId;
    if (!workerId) return;
    
    const queue = workerQueues.get(workerId) || { name: a.workerName, count: 0, tasks: [] };
    if (a.status === 'queued' || a.sequenceNumber > 1) {
      queue.count++;
      queue.tasks.push(a.operationName || a.nodeName);
    }
    workerQueues.set(workerId, queue);
  });

  workerQueues.forEach((queue, workerId) => {
    if (queue.count >= 3) {
      warnings.push({
        type: 'worker-overload',
        message: `${queue.name} işçisinde ${queue.count} operasyon sırada bekliyor`,
        severity: 'warning'
      });
    }
  });

  // Check for long-running tasks
  const now = new Date();
  assignments.forEach(a => {
    if (a.status === 'in-progress' && a.startedAt && a.estimatedEndTime) {
      const actualStart = new Date(a.startedAt);
      const estimatedEnd = new Date(a.estimatedEndTime);
      const expectedDuration = estimatedEnd - actualStart;
      const actualDuration = now - actualStart;
      
      if (actualDuration > expectedDuration * 1.5) {
        warnings.push({
          type: 'task-delayed',
          message: `${a.operationName || a.nodeName} beklenenin %50 üzerinde sürüyor`,
          severity: 'danger'
        });
      }
    }
  });

  if (warnings.length === 0) return '';

  return `
    <div class="pm-card-warning">
      <div class="pm-section-title-warning">
        ⚠️ Potansiyel Sorunlar Tespit Edildi
      </div>
      ${warnings.map(w => `
        <div class="pm-label-warning">
          • ${escapeHtml(w.message)}
        </div>
      `).join('')}
    </div>
  `;
}

/**
 * Setup real-time SSE updates for production plan
 */
function setupRealTimeUpdates(planId, workOrderCode, containerId) {
  // Close existing connection if any
  const existingKey = `${planId}:${containerId}`;
  const existingConnection = sseConnections.get(existingKey);
  if (existingConnection) {
    existingConnection.close();
    sseConnections.delete(existingKey);
  }

  // Create new SSE connection for assignments
  const assignmentStream = new EventSource(
    `${API_BASE}/api/mes/stream/assignments?workOrderCode=${encodeURIComponent(workOrderCode)}`
  );

  assignmentStream.addEventListener('message', async (event) => {
    console.log('🔄 Assignment update received:', event.data);
    try {
      const data = JSON.parse(event.data);
      
      // Refresh monitoring UI
      const container = document.getElementById(containerId);
      if (container) {
        // Re-fetch and re-render
        const { workPackages } = await getWorkPackages({ limit: 1000 });
        const relatedAssignments = workPackages.filter(pkg => pkg.workOrderCode === workOrderCode);
        
        // Update only the assignments tbody to preserve scroll position
        const tbody = document.getElementById('monitoring-assignments-tbody');
        if (tbody) {
          tbody.innerHTML = renderAssignmentRows(relatedAssignments, escapeHtml);
        }
      }
    } catch (error) {
      console.error('Failed to process SSE update:', error);
    }
  });

  assignmentStream.addEventListener('error', (error) => {
    console.error('SSE connection error:', error);
    // Browser will auto-reconnect
  });

  // Store connection for cleanup
  sseConnections.set(existingKey, assignmentStream);
}

/**
 * Cleanup all SSE connections
 */
export function cleanupSSEConnections() {
  sseConnections.forEach((connection, key) => {
    console.log(`Closing SSE connection: ${key}`);
    connection.close();
  });
  sseConnections.clear();
}

/**
 * Format duration in minutes to human-readable string
 */
function formatDuration(minutes) {
  if (minutes < 60) {
    return `${minutes}dk`;
  }
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hours}s ${mins}dk` : `${hours}s`;
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[c]));
}
