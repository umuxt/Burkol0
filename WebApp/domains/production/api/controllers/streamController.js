/**
 * SSE Stream Controller
 * HTTP handlers for real-time Server-Sent Events endpoints
 */

import * as streamService from '../services/streamService.js';

/**
 * GET /api/mes/stream/assignments
 * Real-time stream of worker assignment changes
 */
export function streamAssignments(req, res) {
  const { workerId } = req.query;
  streamService.streamAssignments(res, workerId);
}

/**
 * GET /api/mes/stream/plans
 * Real-time stream of production plan changes
 */
export function streamPlans(req, res) {
  const { planId } = req.query;
  streamService.streamPlans(res, planId);
}

/**
 * GET /api/mes/stream/workers
 * Real-time stream of worker status changes
 */
export function streamWorkers(req, res) {
  const { workerId } = req.query;
  streamService.streamWorkers(res, workerId);
}

/**
 * GET /api/mes/stream/test
 * Test SSE endpoint for development
 */
export function streamTest(req, res) {
  streamService.streamTest(res);
}
