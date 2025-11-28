/**
 * Analytics Controller
 * HTTP handlers for dashboard and analytics endpoints
 */

import * as analyticsService from '../services/analyticsService.js';

/**
 * GET /api/mes/analytics/worker-utilization
 */
export async function getWorkerUtilization(req, res) {
  try {
    const result = await analyticsService.getWorkerUtilization();
    res.json(result);
  } catch (error) {
    console.error('❌ Worker utilization analytics error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch worker utilization',
      details: error.message 
    });
  }
}

/**
 * GET /api/mes/analytics/operation-bottlenecks
 */
export async function getOperationBottlenecks(req, res) {
  try {
    const result = await analyticsService.getOperationBottlenecks();
    res.json(result);
  } catch (error) {
    console.error('❌ Operation bottleneck analytics error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch operation bottlenecks',
      details: error.message 
    });
  }
}

/**
 * GET /api/mes/analytics/material-consumption
 */
export async function getMaterialConsumption(req, res) {
  try {
    const result = await analyticsService.getMaterialConsumption();
    res.json(result);
  } catch (error) {
    console.error('❌ Material consumption analytics error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch material consumption',
      details: error.message 
    });
  }
}

/**
 * GET /api/mes/analytics/production-velocity
 */
export async function getProductionVelocity(req, res) {
  try {
    const result = await analyticsService.getProductionVelocity();
    res.json(result);
  } catch (error) {
    console.error('❌ Production velocity analytics error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch production velocity',
      details: error.message 
    });
  }
}

/**
 * GET /api/mes/analytics/master-timeline
 */
export async function getMasterTimeline(req, res) {
  try {
    const { startDate, endDate } = req.query;
    const result = await analyticsService.getMasterTimeline(startDate, endDate);
    res.json(result);
  } catch (error) {
    console.error('❌ Master timeline analytics error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch master timeline',
      details: error.message 
    });
  }
}

/**
 * GET /api/mes/metrics
 */
export async function getMetrics(req, res) {
  try {
    const metrics = analyticsService.getMetrics();
    res.json({
      success: true,
      metrics,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Metrics retrieval error:', error);
    res.status(500).json({ error: 'metrics_retrieval_failed', message: error.message });
  }
}

/**
 * POST /api/mes/metrics/reset
 */
export async function resetMetrics(req, res) {
  try {
    const metrics = analyticsService.resetMetrics();
    res.json({
      success: true,
      message: 'Metrics reset successfully',
      metrics
    });
  } catch (error) {
    console.error('Metrics reset error:', error);
    res.status(500).json({ error: 'metrics_reset_failed', message: error.message });
  }
}
