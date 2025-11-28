/**
 * Analytics Service
 * Dashboard metrics, worker utilization, and production analytics
 */

import db from '#db/connection';

/**
 * Get worker utilization metrics
 */
export async function getWorkerUtilization() {
  // Get all workers
  const workers = await db('mes.workers')
    .where('isActive', true)
    .select('id', 'name');
  
  // Get current assignments (in-progress)
  const activeAssignments = await db('mes.worker_assignments as wa')
    .join('mes.workers as w', 'w.id', 'wa.workerId')
    .whereIn('wa.status', ['in_progress', 'ready'])
    .select('wa.workerId', 'w.name as workerName')
    .groupBy('wa.workerId', 'w.name');
  
  const activeWorkerIds = new Set(activeAssignments.map(a => a.workerId));
  
  const active = activeWorkerIds.size;
  const total = workers.length;
  const idle = total - active;
  const utilizationRate = total > 0 ? (active / total) * 100 : 0;
  
  // Per-worker details
  const perWorker = workers.map(w => ({
    workerId: w.id,
    name: w.name,
    isActive: activeWorkerIds.has(w.id),
    efficiency: 1.0
  }));
  
  return {
    active,
    idle,
    onBreak: 0,
    total,
    utilizationRate: parseFloat(utilizationRate.toFixed(1)),
    perWorker
  };
}

/**
 * Get operation bottleneck analysis
 */
export async function getOperationBottlenecks() {
  // Get completed assignments with timing
  const completedAssignments = await db('mes.worker_assignments as wa')
    .join('mes.operations as op', 'op.id', 'wa.operationId')
    .join('mes.production_plan_nodes as n', 'n.id', 'wa.nodeId')
    .where('wa.status', 'completed')
    .whereNotNull('wa.startedAt')
    .whereNotNull('wa.completedAt')
    .select(
      'op.id as operationId',
      'op.name as operationName',
      'n.effectiveTime',
      db.raw(`EXTRACT(EPOCH FROM (wa."completedAt" - wa."startedAt")) / 60 as "actualMinutes"`)
    );
  
  // Aggregate by operation
  const operationStats = {};
  
  completedAssignments.forEach(a => {
    const opId = a.operationId;
    if (!operationStats[opId]) {
      operationStats[opId] = {
        operationId: opId,
        operationName: a.operationName,
        totalTime: 0,
        instances: 0,
        estimatedTime: 0
      };
    }
    
    operationStats[opId].totalTime += parseFloat(a.actualMinutes) || 0;
    operationStats[opId].estimatedTime += parseFloat(a.effectiveTime) || 0;
    operationStats[opId].instances += 1;
  });
  
  // Calculate averages and sort by average time
  const operations = Object.values(operationStats)
    .map(op => ({
      ...op,
      avgTime: op.instances > 0 ? op.totalTime / op.instances : 0,
      avgEstimated: op.instances > 0 ? op.estimatedTime / op.instances : 0,
      variance: op.instances > 0 ? ((op.totalTime / op.instances) - (op.estimatedTime / op.instances)) : 0
    }))
    .sort((a, b) => b.avgTime - a.avgTime);
  
  const topBottlenecks = operations.slice(0, 5);
  
  return {
    operations,
    topBottlenecks,
    totalOperations: operations.length
  };
}

/**
 * Get material consumption analytics
 */
export async function getMaterialConsumption() {
  const materials = await db('materials.materials')
    .select(
      'code',
      'name',
      'stock',
      'reserved',
      'wip_reserved',
      'unit',
      'reorder_point',
      'max_stock'
    )
    .where('isActive', true);
  
  const materialsWithStatus = materials.map(m => {
    const stock = parseFloat(m.stock) || 0;
    const reserved = parseFloat(m.reserved) || 0;
    const wipReserved = parseFloat(m.wip_reserved) || 0;
    const available = stock - reserved - wipReserved;
    const reorderPoint = parseFloat(m.reorder_point) || 0;
    const maxStock = parseFloat(m.max_stock) || 0;
    
    return {
      code: m.code,
      name: m.name,
      stock,
      reserved,
      wipReserved,
      available,
      unit: m.unit || 'pcs',
      reorderPoint,
      maxStock,
      isLowStock: available < reorderPoint,
      stockLevel: reorderPoint > 0 ? (available / reorderPoint) * 100 : 100
    };
  });
  
  const lowStockWarnings = materialsWithStatus
    .filter(m => m.isLowStock)
    .sort((a, b) => a.stockLevel - b.stockLevel);
  
  return {
    materials: materialsWithStatus,
    lowStockWarnings,
    totalMaterials: materialsWithStatus.length,
    lowStockCount: lowStockWarnings.length
  };
}

/**
 * Get production velocity metrics
 */
export async function getProductionVelocity() {
  const now = new Date();
  const todayStart = new Date(now).setHours(0, 0, 0, 0);
  const weekStart = new Date(now);
  weekStart.setDate(weekStart.getDate() - 7);
  
  // Today's metrics
  const todayPlans = await db('mes.production_plans')
    .where('launchedAt', '>=', new Date(todayStart))
    .select('status')
    .count('* as count')
    .groupBy('status');
  
  const todayStats = {
    launched: 0,
    active: 0,
    completed: 0
  };
  
  todayPlans.forEach(p => {
    const count = parseInt(p.count) || 0;
    if (p.status === 'active') todayStats.active += count;
    if (p.status === 'completed') todayStats.completed += count;
    todayStats.launched += count;
  });
  
  // Active work orders (all time)
  const activeCount = await db('mes.production_plans')
    .where('status', 'active')
    .count('* as count')
    .first();
  
  const completedCount = await db('mes.production_plans')
    .where('status', 'completed')
    .count('* as count')
    .first();
  
  return {
    today: todayStats,
    overall: {
      active: parseInt(activeCount?.count) || 0,
      completed: parseInt(completedCount?.count) || 0
    }
  };
}

/**
 * Get master timeline data for Gantt chart
 */
export async function getMasterTimeline(startDate, endDate) {
  // Get active production plans
  let plansQuery = db('mes.production_plans')
    .whereIn('status', ['active', 'paused']);
  
  if (startDate) {
    plansQuery = plansQuery.where('launchedAt', '>=', startDate);
  }
  if (endDate) {
    plansQuery = plansQuery.where('launchedAt', '<=', endDate);
  }
  
  const plans = await plansQuery.select('*');
  
  // Get assignments for each plan
  const planIds = plans.map(p => p.id);
  
  const assignments = planIds.length > 0
    ? await db('mes.worker_assignments as wa')
        .join('mes.workers as w', 'w.id', 'wa.workerId')
        .join('mes.substations as sub', 'sub.id', 'wa.substationId')
        .whereIn('wa.planId', planIds)
        .select(
          'wa.*',
          'w.name as workerName',
          'sub.name as substationName'
        )
        .orderBy('wa.estimatedStartTime')
    : [];
  
  // Group assignments by plan
  const assignmentsByPlan = assignments.reduce((acc, a) => {
    if (!acc[a.planId]) acc[a.planId] = [];
    acc[a.planId].push(a);
    return acc;
  }, {});
  
  // Build timeline data
  const timeline = plans.map(plan => {
    const planAssignments = assignmentsByPlan[plan.id] || [];
    
    return {
      planId: plan.id,
      planName: plan.planName,
      workOrderCode: plan.workOrderCode,
      status: plan.status,
      launchedAt: plan.launchedAt,
      assignments: planAssignments.map(a => ({
        assignmentId: a.id,
        workerId: a.workerId,
        workerName: a.workerName,
        substationId: a.substationId,
        substationName: a.substationName,
        status: a.status,
        estimatedStartTime: a.estimatedStartTime,
        estimatedEndTime: a.estimatedEndTime,
        startedAt: a.startedAt,
        completedAt: a.completedAt
      }))
    };
  });
  
  return {
    plans: timeline,
    totalPlans: plans.length,
    totalAssignments: assignments.length
  };
}

/**
 * Get system metrics (in-memory counters)
 */
const metrics = {
  reservationMismatchCount: 0,
  consumptionCappedCount: 0,
  validationErrorCount: 0,
  
  increment(metricName) {
    if (this.hasOwnProperty(metricName)) {
      this[metricName]++;
      console.log(`📊 METRIC: ${metricName} = ${this[metricName]}`);
    }
  },
  
  reset() {
    this.reservationMismatchCount = 0;
    this.consumptionCappedCount = 0;
    this.validationErrorCount = 0;
  },
  
  getAll() {
    return {
      reservationMismatchCount: this.reservationMismatchCount,
      consumptionCappedCount: this.consumptionCappedCount,
      validationErrorCount: this.validationErrorCount
    };
  }
};

export function getMetrics() {
  return metrics.getAll();
}

export function resetMetrics() {
  metrics.reset();
  return metrics.getAll();
}

export function incrementMetric(metricName) {
  metrics.increment(metricName);
}
