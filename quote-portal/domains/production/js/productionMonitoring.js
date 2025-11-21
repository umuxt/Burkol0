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
    <div style="font-weight:600; font-size:14px; margin-bottom:12px;">
      🎯 Üretim İzleme
    </div>
    <div style="text-align: center; padding: 20px; color: #6b7280;">
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
      <div style="font-weight:600; font-size:14px; margin-bottom:8px;">🎯 Üretim İzleme</div>
      <div style="text-align: center; padding: 20px; color: #ef4444;">
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
    <div style="font-weight:600; font-size:14px; margin-bottom:12px; display: flex; align-items: center; gap: 8px;">
      <span>🎯 Üretim İzleme</span>
      ${plan?.status === 'production' ? '<span style="font-size:10px; background:#dcfce7; color:#166534; padding:2px 6px; border-radius:8px; font-weight:600;">CANLI</span>' : ''}
    </div>

    <!-- Progress Overview -->
    <div style="margin-bottom: 16px; padding: 12px; background: white; border-radius: 6px; border: 1px solid #e5e7eb;">
      <div style="font-weight: 600; font-size: 12px; margin-bottom: 8px; color: #374151;">📊 İlerleme Durumu</div>
      
      <!-- Progress Bar -->
      <div style="margin-bottom: 12px;">
        <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
          <span style="font-size: 11px; color: #6b7280;">Tamamlanan Operasyonlar</span>
          <span style="font-size: 11px; font-weight: 600; color: #374151;">${completedNodes}/${totalNodes} (${progressPercent}%)</span>
        </div>
        <div style="width: 100%; height: 8px; background: #f3f4f6; border-radius: 4px; overflow: hidden;">
          <div style="width: ${progressPercent}%; height: 100%; background: linear-gradient(90deg, #10b981, #059669); transition: width 0.3s ease;"></div>
        </div>
      </div>

      <!-- Status Breakdown -->
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(100px, 1fr)); gap: 8px; font-size: 11px;">
        ${inProgressNodes > 0 ? `
          <div style="padding: 6px; background: #dbeafe; border-radius: 4px; text-align: center;">
            <div style="font-weight: 600; color: #1e40af;">${inProgressNodes}</div>
            <div style="color: #3b82f6;">Devam Eden</div>
          </div>
        ` : ''}
        ${pendingNodes > 0 ? `
          <div style="padding: 6px; background: #fef3c7; border-radius: 4px; text-align: center;">
            <div style="font-weight: 600; color: #92400e;">${pendingNodes}</div>
            <div style="color: #f59e0b;">Bekleyen</div>
          </div>
        ` : ''}
        ${queuedNodes > 0 ? `
          <div style="padding: 6px; background: #f3f4f6; border-radius: 4px; text-align: center;">
            <div style="font-weight: 600; color: #374151;">${queuedNodes}</div>
            <div style="color: #6b7280;">Sırada</div>
          </div>
        ` : ''}
        ${cancelledNodes > 0 ? `
          <div style="padding: 6px; background: #fee2e2; border-radius: 4px; text-align: center;">
            <div style="font-weight: 600; color: #991b1b;">${cancelledNodes}</div>
            <div style="color: #dc2626;">İptal</div>
          </div>
        ` : ''}
      </div>

      <!-- Time Estimates -->
      ${timeRemaining !== null ? `
        <div style="margin-top: 12px; padding: 8px; background: #eff6ff; border-radius: 4px; border-left: 3px solid #3b82f6;">
          <div style="font-size: 11px; color: #1e40af; font-weight: 600;">
            ⏱️ Tahmini Kalan Süre: ${formatDuration(timeRemaining)}
          </div>
          ${maxEnd ? `
            <div style="font-size: 10px; color: #6b7280; margin-top: 2px;">
              Tahmini Bitiş: ${maxEnd.toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' })}
            </div>
          ` : ''}
        </div>
      ` : ''}
    </div>

    <!-- Material Summary -->
    ${Object.keys(materialInputs).length > 0 || Object.keys(materialOutputs).length > 0 ? `
      <div style="margin-bottom: 16px; padding: 10px; background: white; border-radius: 4px; border: 1px solid #e5e7eb;">
        <div style="font-weight: 600; font-size: 12px; margin-bottom: 8px; color: #374151;">📦 Malzeme Özeti</div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
          <div>
            <div style="font-size: 11px; color: #6b7280; margin-bottom: 4px;">Giriş Malzemeleri:</div>
            <div style="font-size: 11px; color: #111827;">
              ${Object.entries(materialInputs).length > 0 
                ? Object.entries(materialInputs).map(([code, qty]) => 
                    `<div>• ${esc(code)}: <strong>${qty}</strong></div>`
                  ).join('')
                : '<span style="color: #9ca3af;">Yok</span>'}
            </div>
          </div>
          <div>
            <div style="font-size: 11px; color: #6b7280; margin-bottom: 4px;">Çıkış Ürünleri:</div>
            <div style="font-size: 11px; color: #111827;">
              ${Object.entries(materialOutputs).length > 0
                ? Object.entries(materialOutputs).map(([code, qty]) => 
                    `<div>• ${esc(code)}: <strong>${qty}</strong></div>`
                  ).join('')
                : '<span style="color: #9ca3af;">Yok</span>'}
            </div>
          </div>
        </div>
      </div>
    ` : ''}

    <!-- Assignments Table -->
    <div style="margin-bottom: 16px;">
      <div style="font-weight: 600; font-size: 12px; margin-bottom: 8px; color: #374151;">
        📋 Work Packages (${assignments.length})
      </div>
      ${assignments.length === 0 ? `
        <div style="text-align: center; padding: 20px; color: #6b7280; background: #f9fafb; border-radius: 4px;">
          <i class="fa-solid fa-info-circle"></i> Bu work order için henüz assignment oluşturulmamış
        </div>
      ` : `
        <div style="overflow-x: auto;">
          <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
            <thead>
              <tr style="background: #f9fafb; border-bottom: 1px solid #e5e7eb;">
                <th style="padding: 6px 8px; text-align: left; font-weight: 600; color: #374151;">Operasyon</th>
                <th style="padding: 6px 8px; text-align: left; font-weight: 600; color: #374151;">İşçi</th>
                <th style="padding: 6px 8px; text-align: left; font-weight: 600; color: #374151;">İstasyon</th>
                <th style="padding: 6px 8px; text-align: left; font-weight: 600; color: #374151;">Durum</th>
                <th style="padding: 6px 8px; text-align: left; font-weight: 600; color: #374151;">Sıra</th>
                <th style="padding: 6px 8px; text-align: left; font-weight: 600; color: #374151;">Zaman</th>
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
    const actualStart = a.actualStartTime ? new Date(a.actualStartTime) : null;
    const actualEnd = a.actualEndTime ? new Date(a.actualEndTime) : null;

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
      <tr style="border-bottom: 1px solid #f3f4f6;" data-assignment-id="${esc(a.assignmentId || a.id)}">
        <td style="padding: 6px 8px;">${esc(a.operationName || a.nodeName || '-')}</td>
        <td style="padding: 6px 8px;">${esc(a.workerName || '-')}</td>
        <td style="padding: 6px 8px;">
          ${esc(a.stationName || '-')}
          ${(a.substationCode || a.subStationCode) ? `<br><span style="font-size: 10px; color: #6b7280; font-weight: 500;">🔧 ${esc(a.substationCode || a.subStationCode)}</span>` : ''}
        </td>
        <td style="padding: 6px 8px;">${getStatusBadge(a.status)}</td>
        <td style="padding: 6px 8px; text-align: center;">${a.sequenceNumber || '-'}</td>
        <td style="padding: 6px 8px;">${timeDisplay}</td>
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
    if (a.status === 'in-progress' && a.actualStartTime && a.estimatedEndTime) {
      const actualStart = new Date(a.actualStartTime);
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
    <div style="margin-bottom: 16px; padding: 10px; background: #fef3c7; border-radius: 4px; border-left: 3px solid #f59e0b;">
      <div style="font-weight: 600; font-size: 12px; margin-bottom: 6px; color: #92400e;">
        ⚠️ Potansiyel Sorunlar Tespit Edildi
      </div>
      ${warnings.map(w => `
        <div style="font-size: 11px; color: #78350f; margin-bottom: 4px;">
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
