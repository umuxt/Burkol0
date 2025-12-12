/**
 * Worker Activity Log Service
 * Logging and querying worker activities (login, logout, task operations)
 */

import db from '#db/connection';

/**
 * Log a worker activity
 * @param {object} options - Activity details
 * @param {string} options.workerId - Worker ID
 * @param {string} options.workerName - Worker name
 * @param {string} options.action - Action type: login, logout, task_start, task_complete, task_pause, task_resume
 * @param {string} [options.entityType] - Entity type: session, assignment
 * @param {string} [options.entityId] - Entity ID (e.g., assignment ID)
 * @param {number} [options.quantityProduced] - Quantity produced (for task_complete)
 * @param {number} [options.defectQuantity] - Defect quantity (for task_complete)
 * @param {object} [options.scrapData] - Scrap data (for task_complete)
 * @param {object} [options.details] - Additional details
 * @param {string} [options.ipAddress] - Client IP address
 * @param {string} [options.userAgent] - User agent string
 * @returns {Promise<{success: boolean, logId?: number}>}
 */
export async function logWorkerActivity(options) {
    const {
        workerId,
        workerName,
        action,
        entityType = null,
        entityId = null,
        quantityProduced = null,
        defectQuantity = null,
        scrapData = null,
        details = null,
        ipAddress = null,
        userAgent = null
    } = options;

    if (!workerId || !action) {
        console.warn('[WorkerActivityLog] Missing required fields: workerId or action');
        return { success: false, error: 'Missing required fields' };
    }

    try {
        const [result] = await db('mes.worker_activity_logs')
            .insert({
                workerId,
                workerName,
                action,
                entityType,
                entityId,
                quantityProduced,
                defectQuantity,
                scrapData: scrapData ? JSON.stringify(scrapData) : null,
                details: details ? JSON.stringify(details) : null,
                ipAddress,
                userAgent,
                createdAt: new Date()
            })
            .returning('id');

        return { success: true, logId: result.id || result };
    } catch (error) {
        console.error('[WorkerActivityLog] Error logging activity:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Get worker activity history
 * @param {string} workerId - Worker ID
 * @param {object} [options] - Query options
 * @param {number} [options.limit=50] - Maximum number of records
 * @param {number} [options.offset=0] - Offset for pagination
 * @param {string} [options.action] - Filter by action type
 * @param {Date} [options.startDate] - Filter by start date
 * @param {Date} [options.endDate] - Filter by end date
 * @returns {Promise<{success: boolean, logs?: Array, total?: number}>}
 */
export async function getWorkerActivityHistory(workerId, options = {}) {
    const {
        limit = 50,
        offset = 0,
        action = null,
        startDate = null,
        endDate = null
    } = options;

    try {
        // Build base where conditions
        let baseQuery = db('mes.worker_activity_logs')
            .where('workerId', workerId);

        if (action) {
            baseQuery = baseQuery.where('action', action);
        }

        if (startDate) {
            baseQuery = baseQuery.where('createdAt', '>=', startDate);
        }

        if (endDate) {
            baseQuery = baseQuery.where('createdAt', '<=', endDate);
        }

        // Get total count (separate query without orderBy)
        const [{ count }] = await baseQuery.clone().count('* as count');

        // Get paginated results with orderBy
        const logs = await baseQuery.clone()
            .select(
                'id',
                'workerId',
                'workerName',
                'action',
                'entityType',
                'entityId',
                'quantityProduced',
                'defectQuantity',
                'scrapData',
                'details',
                'ipAddress',
                'createdAt'
            )
            .orderBy('createdAt', 'desc')
            .limit(limit)
            .offset(offset);

        return {
            success: true,
            logs: logs.map(log => ({
                ...log,
                scrapData: typeof log.scrapData === 'string' ? JSON.parse(log.scrapData) : log.scrapData,
                details: typeof log.details === 'string' ? JSON.parse(log.details) : log.details
            })),
            total: parseInt(count),
            limit,
            offset
        };
    } catch (error) {
        console.error('[WorkerActivityLog] Error fetching history:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Get activity summary for a worker
 * @param {string} workerId - Worker ID
 * @param {string} [period='today'] - Period: today, week, month
 * @returns {Promise<{success: boolean, summary?: object}>}
 */
export async function getWorkerActivitySummary(workerId, period = 'today') {
    try {
        let startDate;
        const now = new Date();

        switch (period) {
            case 'today':
                startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                break;
            case 'week':
                startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                break;
            case 'month':
                startDate = new Date(now.getFullYear(), now.getMonth(), 1);
                break;
            default:
                startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        }

        const stats = await db('mes.worker_activity_logs')
            .where('workerId', workerId)
            .where('createdAt', '>=', startDate)
            .select(
                db.raw('COUNT(*) FILTER (WHERE action = \'login\') as "loginCount"'),
                db.raw('COUNT(*) FILTER (WHERE action = \'task_start\') as "taskStartCount"'),
                db.raw('COUNT(*) FILTER (WHERE action = \'task_complete\') as "taskCompleteCount"'),
                db.raw('COALESCE(SUM("quantityProduced"), 0) as "totalQuantityProduced"'),
                db.raw('COALESCE(SUM("defectQuantity"), 0) as "totalDefectQuantity"')
            )
            .first();

        return {
            success: true,
            summary: {
                period,
                startDate,
                loginCount: parseInt(stats.loginCount) || 0,
                taskStartCount: parseInt(stats.taskStartCount) || 0,
                taskCompleteCount: parseInt(stats.taskCompleteCount) || 0,
                totalQuantityProduced: parseInt(stats.totalQuantityProduced) || 0,
                totalDefectQuantity: parseInt(stats.totalDefectQuantity) || 0
            }
        };
    } catch (error) {
        console.error('[WorkerActivityLog] Error fetching summary:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Cleanup old logs based on retention period
 * @param {number} retentionDays - Number of days to keep logs
 * @returns {Promise<{success: boolean, deletedCount?: number}>}
 */
export async function cleanupOldLogs(retentionDays) {
    if (!retentionDays || retentionDays < 1) {
        return { success: false, error: 'Invalid retention days' };
    }

    try {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

        const deletedCount = await db('mes.worker_activity_logs')
            .where('createdAt', '<', cutoffDate)
            .delete();

        console.log(`[WorkerActivityLog] Cleaned up ${deletedCount} logs older than ${retentionDays} days`);

        return { success: true, deletedCount };
    } catch (error) {
        console.error('[WorkerActivityLog] Error cleaning up logs:', error);
        return { success: false, error: error.message };
    }
}
