import * as productionPlanService from '../services/productionPlanService.js';
import { logAuditEvent } from '../../../../server/auditTrail.js';
import { logOperation } from '../../../../server/utils/logger.js';

export const getProductionPlans = async (req, res) => {
  try {
    const plans = await productionPlanService.getProductionPlans();
    res.json({ productionPlans: plans });
  } catch (error) {
    console.error('❌ Error fetching production plans:', error);
    res.status(500).json({
      error: 'Failed to fetch production plans',
      details: error.message
    });
  }
};

export const getProductionPlanById = async (req, res) => {
  try {
    const plan = await productionPlanService.getProductionPlanById(req.params.id);

    if (!plan) {
      return res.status(404).json({ error: 'Plan not found' });
    }

    res.json(plan);
  } catch (error) {
    console.error('❌ Error fetching plan:', error);
    res.status(500).json({
      error: 'Failed to fetch plan',
      details: error.message
    });
  }
};

export const createProductionPlan = async (req, res) => {
  try {
    const plan = await productionPlanService.createProductionPlan(req.body);

    // Birleşik log: success + audit
    logOperation({
      type: 'success',
      action: 'PLAN CREATE',
      details: {
        planId: plan.id,
        orderCode: plan.orderCode || 'N/A',
        nodes: plan.nodes?.length || 0
      },
      audit: {
        entityType: 'plan',
        entityId: plan.id,
        action: 'create',
        changes: {
          orderCode: plan.orderCode,
          status: plan.status,
          nodesCount: plan.nodes?.length || 0
        },
        performer: { email: req.user?.email, sessionId: req.user?.sessionId },
        ipAddress: req.ip
      },
      auditFn: logAuditEvent
    });

    res.json(plan);
  } catch (error) {
    if (error.code === 'MISSING_ORDER_CODE') {
      return res.status(400).json({ error: error.message });
    }
    if (error.code === 'MISSING_NODES') {
      return res.status(400).json({ error: error.message });
    }
    console.error('❌ Error creating production plan:', error);
    res.status(500).json({
      error: 'Failed to create production plan',
      details: error.message
    });
  }
};

export const updateProductionPlan = async (req, res) => {
  try {
    const plan = await productionPlanService.updateProductionPlan(req.params.id, req.body);

    // Birleşik log: success + audit
    logOperation({
      type: 'success',
      action: 'PLAN UPDATE',
      details: {
        planId: plan.id,
        orderCode: plan.orderCode || 'N/A'
      },
      audit: {
        entityType: 'plan',
        entityId: plan.id,
        action: 'update',
        changes: { orderCode: plan.orderCode, status: plan.status },
        performer: { email: req.user?.email, sessionId: req.user?.sessionId },
        ipAddress: req.ip
      },
      auditFn: logAuditEvent
    });

    res.json(plan);
  } catch (error) {
    if (error.code === 'NOT_FOUND') {
      return res.status(404).json({ error: 'Plan not found' });
    }
    console.error('❌ Error updating plan:', error);
    res.status(500).json({
      error: 'Failed to update plan',
      details: error.message
    });
  }
};

export const deleteProductionPlan = async (req, res) => {
  try {
    const planId = req.params.id;
    await productionPlanService.deleteProductionPlan(planId);

    // Birleşik log: success + audit
    logOperation({
      type: 'success',
      action: 'PLAN DELETE',
      details: {
        planId: planId,
        deletedBy: req.user?.email || 'system'
      },
      audit: {
        entityType: 'plan',
        entityId: planId,
        action: 'delete',
        changes: { deletedAt: new Date().toISOString() },
        performer: { email: req.user?.email, sessionId: req.user?.sessionId },
        ipAddress: req.ip
      },
      auditFn: logAuditEvent
    });

    res.json({ success: true, message: 'Plan deleted successfully' });
  } catch (error) {
    if (error.code === 'NOT_FOUND') {
      return res.status(404).json({ error: 'Plan not found' });
    }
    if (error.code === 'HAS_ACTIVE_ASSIGNMENTS') {
      return res.status(400).json({ error: error.message });
    }
    console.error('❌ Error deleting plan:', error);
    res.status(500).json({
      error: 'Failed to delete plan',
      details: error.message
    });
  }
};

export const pauseProductionPlan = async (req, res) => {
  try {
    const plan = await productionPlanService.pauseProductionPlan(req.params.id);

    // Birleşik log: success + audit
    logOperation({
      type: 'success',
      action: 'PLAN PAUSE',
      details: {
        planId: plan.id,
        orderCode: plan.workOrderCode || 'N/A'
      },
      audit: {
        entityType: 'plan',
        entityId: plan.id,
        action: 'pause',
        changes: { pausedAt: new Date().toISOString() },
        performer: { email: req.user?.email, sessionId: req.user?.sessionId },
        ipAddress: req.ip
      },
      auditFn: logAuditEvent
    });

    res.json({
      success: true,
      plan: plan,
      pausedCount: plan.pausedCount,
      pausedAssignments: plan.pausedAssignments,
      workersCleared: plan.workersCleared,
      stationsCleared: plan.stationsCleared
    });
  } catch (error) {
    if (error.code === 'NOT_FOUND') {
      return res.status(404).json({ error: 'Plan not found' });
    }
    if (error.code === 'INVALID_STATUS') {
      return res.status(400).json({ error: error.message });
    }
    if (error.code === 'HAS_IN_PROGRESS_TASKS') {
      return res.status(400).json({
        error: error.code,
        message: error.message
      });
    }
    console.error('❌ Error pausing plan:', error);
    res.status(500).json({
      error: 'Failed to pause plan',
      details: error.message
    });
  }
};

export const resumeProductionPlan = async (req, res) => {
  try {
    const plan = await productionPlanService.resumeProductionPlan(req.params.id);

    // Birleşik log: success + audit
    logOperation({
      type: 'success',
      action: 'PLAN RESUME',
      details: {
        planId: plan.id,
        orderCode: plan.workOrderCode || 'N/A'
      },
      audit: {
        entityType: 'plan',
        entityId: plan.id,
        action: 'resume',
        changes: { resumedAt: new Date().toISOString() },
        performer: { email: req.user?.email, sessionId: req.user?.sessionId },
        ipAddress: req.ip
      },
      auditFn: logAuditEvent
    });

    res.json({
      success: true,
      plan,
      resumedCount: plan.resumedCount
    });
  } catch (error) {
    if (error.code === 'NOT_FOUND') {
      return res.status(404).json({ error: 'Plan not found' });
    }
    if (error.code === 'INVALID_STATUS') {
      return res.status(400).json({ error: error.message });
    }
    console.error('❌ Error resuming plan:', error);
    res.status(500).json({
      error: 'Failed to resume plan',
      details: error.message
    });
  }
};

export const launchProductionPlan = async (req, res) => {
  try {
    const result = await productionPlanService.launchProductionPlan(req.params.id);

    if (result.error) {
      return res.status(400).json({ error: result.error, details: result.details });
    }

    // Birleşik log: success + audit
    logOperation({
      type: 'success',
      action: 'PLAN LAUNCH',
      details: {
        planId: req.params.id,
        assignments: result.assignmentsCreated || 0
      },
      audit: {
        entityType: 'plan',
        entityId: req.params.id,
        action: 'launch',
        changes: {
          launchedAt: new Date().toISOString(),
          assignmentsCreated: result.assignmentsCreated
        },
        performer: { email: req.user?.email, sessionId: req.user?.sessionId },
        ipAddress: req.ip
      },
      auditFn: logAuditEvent
    });

    res.json(result);
  } catch (error) {
    console.error('❌ Error launching plan:', error);
    res.status(500).json({
      error: 'Failed to launch plan',
      details: error.message
    });
  }
};
