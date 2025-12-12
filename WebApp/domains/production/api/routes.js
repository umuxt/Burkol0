import express from 'express';
import { getOperations, saveOperations } from './controllers/operationController.js';
import {
  getWorkers,
  saveWorkers,
  getWorkerAssignments,
  getWorkerStations,
  deleteWorker
} from './controllers/workerController.js';
import {
  getStations,
  saveStations,
  getStationWorkers,
  deleteStation
} from './controllers/stationController.js';
import * as skillController from './controllers/skillController.js';
import * as workOrderController from './controllers/workOrderController.js';
import * as approvedQuoteController from './controllers/approvedQuoteController.js';
import * as masterDataController from './controllers/masterDataController.js';
import * as templateController from './controllers/templateController.js';
import * as substationController from './controllers/substationController.js';
import * as alertController from './controllers/alertController.js';
import * as workPackageController from './controllers/workPackageController.js';
import * as productionPlanController from './controllers/productionPlanController.js';
import * as materialController from './controllers/materialController.js';
import * as assignmentController from './controllers/assignmentController.js';
import * as streamController from './controllers/streamController.js';
import * as analyticsController from './controllers/analyticsController.js';
import * as holidayController from './controllers/holidayController.js';
import * as nodeController from './controllers/nodeController.js';
import * as entityRelationController from './controllers/entityRelationController.js';
import * as scrapController from './controllers/scrapController.js';
import { getSession } from '#server/auth';

const router = express.Router();

async function withAuth(req, res, next) {
  // Basic token presence check (kopyalandı, authentication middleware olarak ayrılabilir)
  const token = req.headers.authorization?.replace('Bearer ', '') || ''
  if (!token && req.hostname !== 'localhost') {
    return res.status(401).json({ error: 'Unauthorized' })
  }
  // Attach session user when possible (for createdBy/updatedBy fields)
  try {
    if (token && token.startsWith('dev-')) {
      req.user = { email: 'dev@beeplan.com', userName: 'Dev User' }
    }
    else if (token) {
      const s = await getSession(token)
      if (s) req.user = s
    }
  } catch { }
  next()
}

// OPERATIONS
router.get('/operations', withAuth, getOperations);
router.post('/operations', withAuth, saveOperations);

// WORKERS
router.get('/workers', withAuth, getWorkers);
router.post('/workers', withAuth, saveWorkers);
router.get('/workers/:id/assignments', withAuth, getWorkerAssignments);
router.get('/workers/:id/stations', withAuth, getWorkerStations);
router.delete('/workers/:id', withAuth, deleteWorker);

// WORKER AUTH (P1.4.02 - no withAuth for login, worker portal uses PIN)
import * as workerAuthService from './services/workerAuthService.js';

router.post('/workers/:id/login', async (req, res) => {
  try {
    const { id } = req.params;
    const { pin } = req.body;
    const result = await workerAuthService.loginWorker(id, pin, req.ip);
    if (!result.success) {
      return res.status(401).json(result);
    }
    res.json(result);
  } catch (error) {
    console.error('Worker login error:', error);
    res.status(500).json({ success: false, error: 'Giriş başarısız' });
  }
});

router.post('/workers/:id/logout', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await workerAuthService.logoutWorker(id, req.ip);
    res.json(result);
  } catch (error) {
    console.error('Worker logout error:', error);
    res.status(500).json({ success: false, error: 'Çıkış başarısız' });
  }
});

router.post('/workers/:id/set-pin', withAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { pin } = req.body;
    const result = await workerAuthService.setPin(id, pin);
    if (!result.success) {
      return res.status(400).json(result);
    }
    res.json(result);
  } catch (error) {
    console.error('Set PIN error:', error);
    res.status(500).json({ success: false, error: 'PIN ayarlanamadı' });
  }
});

router.get('/workers/:id/verify-token', async (req, res) => {
  try {
    const { id } = req.params;
    const token = req.headers['x-worker-token'] || req.query.token;
    const result = await workerAuthService.verifyToken(id, token);
    res.json(result);
  } catch (error) {
    console.error('Token verify error:', error);
    res.status(500).json({ valid: false });
  }
});

// STATIONS
router.get('/stations', withAuth, getStations);
router.post('/stations', withAuth, saveStations);
router.get('/stations/:id/workers', withAuth, getStationWorkers);
router.delete('/stations/:id', withAuth, deleteStation);

// SKILLS
router.get('/skills', withAuth, skillController.getSkills);
router.post('/skills', withAuth, skillController.createSkill);
router.put('/skills/:id', withAuth, skillController.updateSkill);
router.delete('/skills/:id', withAuth, skillController.deleteSkill);

// WORK ORDERS
router.get('/work-orders', withAuth, workOrderController.getWorkOrders);
router.post('/work-orders', withAuth, workOrderController.createWorkOrder);
router.put('/work-orders/:id', withAuth, workOrderController.updateWorkOrder);
router.delete('/work-orders/:id', withAuth, workOrderController.deleteWorkOrder);
router.post('/work-orders/next-id', withAuth, workOrderController.getNextWorkOrderCode);

// APPROVED QUOTES
router.get('/approved-quotes', withAuth, approvedQuoteController.getApprovedQuotes);
router.get('/approved-quotes/:workOrderCode', withAuth, approvedQuoteController.getWorkOrderDetails);
router.post('/approved-quotes/ensure', withAuth, approvedQuoteController.ensureApprovedQuote);
router.patch('/approved-quotes/:workOrderCode/production-state', withAuth, approvedQuoteController.updateProductionState);

// MASTER DATA
router.get('/master-data', withAuth, masterDataController.getMasterData);
router.post('/master-data', withAuth, masterDataController.updateMasterData);

// TEMPLATES
router.get('/templates', withAuth, templateController.getTemplates);
router.post('/templates', withAuth, templateController.saveTemplate);
router.delete('/templates/:id', withAuth, templateController.deleteTemplate);

// SUBSTATIONS
router.get('/substations', withAuth, substationController.getSubstations);
router.post('/substations', withAuth, substationController.createSubstation);
router.post('/substations/reset-all', withAuth, substationController.resetAllSubstations);
router.patch('/substations/:id', withAuth, substationController.updateSubstation);
router.put('/substations/:id/technical-status', withAuth, substationController.updateTechnicalStatus);
router.get('/substations/:id/details', withAuth, substationController.getSubstationDetails);

// ALERTS
router.get('/alerts', withAuth, alertController.getAlerts);
router.post('/alerts', withAuth, alertController.createAlert);
router.patch('/alerts/:id/read', withAuth, alertController.markAsRead);
router.patch('/alerts/:id/resolve', withAuth, alertController.resolveAlert);

// WORK PACKAGES
router.get('/work-packages', withAuth, workPackageController.getWorkPackages);
router.get('/workers/:workerId/tasks/queue', withAuth, workPackageController.getWorkerTaskQueue);

// PRODUCTION PLANS
router.get('/production-plans', withAuth, productionPlanController.getProductionPlans);
router.post('/production-plans', withAuth, productionPlanController.createProductionPlan);
router.get('/production-plans/:id', withAuth, productionPlanController.getProductionPlanById);
router.put('/production-plans/:id', withAuth, productionPlanController.updateProductionPlan);
router.delete('/production-plans/:id', withAuth, productionPlanController.deleteProductionPlan);
router.post('/production-plans/:id/pause', withAuth, productionPlanController.pauseProductionPlan);
router.post('/production-plans/:id/resume', withAuth, productionPlanController.resumeProductionPlan);
router.post('/production-plans/:id/launch', withAuth, productionPlanController.launchProductionPlan);

// PRODUCTION PLAN NODES
router.get('/production-plans/:planId/nodes', withAuth, nodeController.getNodes);
router.post('/production-plans/:planId/nodes', withAuth, nodeController.createNode);
router.get('/production-plans/:planId/nodes/:nodeId', withAuth, nodeController.getNode);
router.put('/production-plans/:planId/nodes/:nodeId', withAuth, nodeController.updateNode);
router.delete('/production-plans/:planId/nodes/:nodeId', withAuth, nodeController.deleteNode);

// NODE MATERIALS & STATIONS
router.post('/nodes/:nodeId/materials', withAuth, nodeController.addMaterial);
router.delete('/nodes/:nodeId/materials/:materialCode', withAuth, nodeController.removeMaterial);
router.post('/nodes/:nodeId/stations', withAuth, nodeController.addStation);
router.delete('/nodes/:nodeId/stations/:stationId', withAuth, nodeController.removeStation);

// MATERIALS
router.get('/materials', withAuth, materialController.getMaterials);
router.post('/materials/check-availability', withAuth, materialController.checkAvailability);

// WORKER ASSIGNMENTS
router.get('/worker-assignments', withAuth, assignmentController.getWorkerAssignments);
router.get('/worker-assignments/:workerId', withAuth, assignmentController.getAssignmentsByWorkerId);

// ASSIGNMENT LIFECYCLE
router.get('/assignments/:assignmentId/lot-preview', assignmentController.getLotPreview);
router.post('/assignments/:assignmentId/start', assignmentController.startAssignment);
router.post('/assignments/:assignmentId/complete', assignmentController.completeAssignment);
router.post('/assignments/:assignmentId/pause', assignmentController.pauseAssignment);
router.post('/assignments/:assignmentId/resume', assignmentController.resumeAssignment);

// FIFO TASK SCHEDULING
router.get('/workers/:workerId/tasks/next', assignmentController.getNextTask);
router.get('/workers/:workerId/tasks/stats', assignmentController.getTaskStats);
router.get('/workers/:workerId/has-tasks', assignmentController.hasWorkerTasks);

// SSE STREAMS
router.get('/stream/assignments', streamController.streamAssignments);
router.get('/stream/plans', streamController.streamPlans);
router.get('/stream/workers', streamController.streamWorkers);
router.get('/stream/test', streamController.streamTest);

// ANALYTICS
router.get('/analytics/worker-utilization', withAuth, analyticsController.getWorkerUtilization);
router.get('/analytics/operation-bottlenecks', withAuth, analyticsController.getOperationBottlenecks);
router.get('/analytics/material-consumption', withAuth, analyticsController.getMaterialConsumption);
router.get('/analytics/production-velocity', withAuth, analyticsController.getProductionVelocity);
router.get('/analytics/master-timeline', withAuth, analyticsController.getMasterTimeline);

// METRICS
router.get('/metrics', withAuth, analyticsController.getMetrics);
router.post('/metrics/reset', withAuth, analyticsController.resetMetrics);

// HOLIDAYS & TIMEZONE
router.get('/holidays', holidayController.getHolidays);
router.post('/holidays', withAuth, holidayController.createHoliday);
router.put('/holidays/:id', withAuth, holidayController.updateHoliday);
router.delete('/holidays/:id', withAuth, holidayController.deleteHoliday);
router.get('/timezone', holidayController.getTimezone);
router.put('/timezone', withAuth, holidayController.updateTimezone);

// ENTITY RELATIONS
router.get('/entity-relations', withAuth, entityRelationController.getEntityRelations);
router.post('/entity-relations', withAuth, entityRelationController.createEntityRelation);
router.put('/entity-relations/:id', withAuth, entityRelationController.updateEntityRelation);
router.delete('/entity-relations/:id', withAuth, entityRelationController.deleteEntityRelation);
router.post('/entity-relations/batch', withAuth, entityRelationController.batchUpdateRelations);

// SCRAP & OUTPUT CODES
router.post('/work-packages/:id/scrap', withAuth, scrapController.recordScrap);
router.get('/work-packages/:id/scrap', withAuth, scrapController.getScrapRecords);
router.delete('/work-packages/:id/scrap/:scrapType/:materialCode/:quantity', withAuth, scrapController.removeScrap);
router.get('/output-codes/validate', withAuth, scrapController.validateOutputCode);
router.get('/output-codes/existing', withAuth, scrapController.getExistingOutputCodes);

export default router;
