/**
 * Assignment Status History Utility
 * 
 * Records all status changes for worker assignments
 * Provides pause/resume tracking and analytics
 */

import db from '../../db/connection.js';

/**
 * Record a status change in history
 * 
 * @param {string} assignmentId - Assignment ID
 * @param {string} fromStatus - Previous status (can be null for initial)
 * @param {string} toStatus - New status
 * @param {string} changedBy - Worker ID who made the change
 * @param {Object} options - Optional metadata
 * @param {string} [options.reason] - Reason for change
 * @param {Object} [options.metadata] - Extra data
 * @param {Object} [options.trx] - Existing transaction
 * @returns {Promise<Object>} Created history record
 */
export async function recordStatusChange(assignmentId, fromStatus, toStatus, changedBy, options = {}) {
  const { reason, metadata, trx } = options;
  const dbConn = trx || db;
  
  const [record] = await dbConn('mes.assignment_status_history')
    .insert({
      assignmentId,
      fromStatus,
      toStatus,
      changedBy,
      reason: reason || null,
      metadata: metadata ? JSON.stringify(metadata) : null
    })
    .returning('*');
  
  console.log(`📝 Status change recorded: ${assignmentId} (${fromStatus} → ${toStatus})`);
  
  return record;
}

/**
 * Get status history for an assignment
 * 
 * @param {string} assignmentId - Assignment ID
 * @returns {Promise<Array>} Status history records
 */
export async function getStatusHistory(assignmentId) {
  const history = await db('mes.assignment_status_history')
    .where('assignmentId', assignmentId)
    .orderBy('changedAt', 'asc')
    .select('*');
  
  return history;
}

/**
 * Calculate total pause duration for an assignment
 * 
 * @param {string} assignmentId - Assignment ID
 * @returns {Promise<number>} Total pause duration in minutes
 */
export async function calculateTotalPauseTime(assignmentId) {
  const history = await getStatusHistory(assignmentId);
  
  let totalPauseMinutes = 0;
  let lastPauseStart = null;
  
  for (const record of history) {
    if (record.toStatus === 'paused') {
      lastPauseStart = new Date(record.changedAt);
    } else if (record.fromStatus === 'paused' && lastPauseStart) {
      const resumeTime = new Date(record.changedAt);
      const pauseDuration = (resumeTime - lastPauseStart) / 1000 / 60; // minutes
      totalPauseMinutes += pauseDuration;
      lastPauseStart = null;
    }
  }
  
  // If currently paused, calculate duration until now
  if (lastPauseStart) {
    const now = new Date();
    const pauseDuration = (now - lastPauseStart) / 1000 / 60;
    totalPauseMinutes += pauseDuration;
  }
  
  return Math.round(totalPauseMinutes);
}

/**
 * Get pause/resume count for an assignment
 * 
 * @param {string} assignmentId - Assignment ID
 * @returns {Promise<Object>} Pause statistics
 */
export async function getPauseStatistics(assignmentId) {
  const history = await getStatusHistory(assignmentId);
  
  const pauseCount = history.filter(h => h.toStatus === 'paused').length;
  const resumeCount = history.filter(h => h.fromStatus === 'paused').length;
  const totalPauseMinutes = await calculateTotalPauseTime(assignmentId);
  
  return {
    pauseCount,
    resumeCount,
    totalPauseMinutes,
    isPaused: pauseCount > resumeCount
  };
}

/**
 * Get all status changes within a time period
 * 
 * @param {Date} startDate - Start date
 * @param {Date} endDate - End date
 * @returns {Promise<Array>} Status changes in period
 */
export async function getStatusChangesInPeriod(startDate, endDate) {
  const changes = await db('mes.assignment_status_history')
    .whereBetween('changedAt', [startDate, endDate])
    .orderBy('changedAt', 'desc')
    .select('*');
  
  return changes;
}

export default {
  recordStatusChange,
  getStatusHistory,
  calculateTotalPauseTime,
  getPauseStatistics,
  getStatusChangesInPeriod
};
