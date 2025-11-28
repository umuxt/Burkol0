import db from '#db/connection';

/**
 * Get alerts with optional filters
 * @param {Object} filters - Query filters
 * @param {string} filters.type - Alert type filter
 * @param {string} filters.status - Alert status filter (active, resolved)
 * @param {number} filters.limit - Maximum number of results
 * @returns {Promise<Array>} List of alerts
 */
export const getAlerts = async ({ type, status, limit } = {}) => {
  let query = db('mes.alerts')
    .select(
      'id',
      'type',
      'severity',
      'title',
      'message',
      'metadata',
      'isRead',
      'isResolved',
      'createdAt',
      'resolvedAt',
      'resolvedBy'
    );
  
  // Apply filters
  if (type) {
    query = query.where('type', type);
  }
  
  if (status) {
    if (status === 'active') {
      query = query.where('isResolved', false);
    } else if (status === 'resolved') {
      query = query.where('isResolved', true);
    }
  }
  
  // Order by most recent
  query = query.orderBy('createdAt', 'desc');
  
  // Apply limit
  if (limit) {
    const limitNum = parseInt(limit, 10);
    if (!isNaN(limitNum) && limitNum > 0) {
      query = query.limit(limitNum);
    }
  }
  
  const alerts = await query;
  console.log(`📢 Alerts: Found ${alerts.length} alerts`);
  
  return alerts;
};

/**
 * Create a new alert
 * @param {Object} alertData - Alert data
 * @returns {Promise<Object>} Created alert
 */
export const createAlert = async ({ type, severity, title, message, metadata }) => {
  const result = await db('mes.alerts')
    .insert({
      type,
      severity: severity || 'info',
      title,
      message,
      metadata: metadata ? JSON.stringify(metadata) : null,
      isRead: false,
      isResolved: false,
      createdAt: db.fn.now()
    })
    .returning('*');
  
  return result[0];
};

/**
 * Mark alert as read
 * @param {string} id - Alert ID
 * @returns {Promise<Object>} Updated alert
 */
export const markAsRead = async (id) => {
  const result = await db('mes.alerts')
    .where({ id })
    .update({
      isRead: true
    })
    .returning('*');
  
  return result[0];
};

/**
 * Resolve an alert
 * @param {string} id - Alert ID
 * @param {string} resolvedBy - User who resolved the alert
 * @returns {Promise<Object>} Updated alert
 */
export const resolveAlert = async (id, resolvedBy) => {
  const result = await db('mes.alerts')
    .where({ id })
    .update({
      isResolved: true,
      resolvedAt: db.fn.now(),
      resolvedBy
    })
    .returning('*');
  
  return result[0];
};
