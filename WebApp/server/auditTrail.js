import { updateSession } from './auth.js'
import db from '../db/connection.js'
import { logAudit, logError } from './utils/logger.js'

/**
 * Generic audit log helper for all domains
 * Use this for CRM, MES, Materials audit logging
 * 
 * @param {object} options
 * @param {string} options.entityType - Entity type: quote, shipment, material, user, session, plan, etc.
 * @param {string|number} options.entityId - Record ID
 * @param {string} options.action - Action: create, update, delete, approve, launch, etc.
 * @param {object} options.changes - Change details (before/after values)
 * @param {object} options.performer - { email, userName, sessionId }
 * @param {string} options.ipAddress - Client IP address
 */
export async function logAuditEvent(options) {
  const {
    entityType,
    entityId,
    action,
    changes = {},
    performer = {},
    ipAddress = null
  } = options;

  // Validation
  if (!entityType || !action) {
    console.warn('[auditTrail] Missing required fields: entityType or action');
    return;
  }

  try {
    await db('settings.audit_logs').insert({
      entityType,
      entityId: String(entityId || 'N/A'),
      action,
      changes: JSON.stringify(changes),
      userId: performer.userName || performer.email || 'system',
      userEmail: performer.email || null,
      sessionId: performer.sessionId || null, // P1.7: Link to session
      createdAt: new Date(),
      ipAddress
    });

    // Console log kaldırıldı - logOperation kullanıldığında oradan yapılıyor
    // Sadece DB'ye yazılıyor
  } catch (err) {
    logError('Audit', `Failed to log ${entityType}.${action}: ${err?.message}`);
  }
}

/**
 * Session activity audit helper (for login/logout)
 * @param {object} req - Express request object
 * @param {object} activity - Activity details
 */
export async function auditSessionActivity(req, activity = {}) {
  try {
    if (!activity || typeof activity !== 'object') return

    const sessionId = req?.user?.sessionId

    if (!sessionId) return

    const performer = {
      email: req.user?.email || null,
      userName: req.user?.userName || req.user?.name || null,
      sessionId
    }

    // Safely get user-agent
    const userAgent = req?.get ? req.get('user-agent') : (req?.headers?.['user-agent'] || null)

    // Entry for session activity log (in-memory)
    const memoryEntry = {
      performedBy: performer,
      timestamp: activity.timestamp || new Date().toISOString(),
      action: activity.action || null,
      details: activity.details || null,
      ipAddress: req?.ip || null,
      userAgent
    }

    // Update session activity log in memory (append)
    await updateSession({
      sessionId,
      activityLog: [memoryEntry]
    })

    // Persist audit entry to PostgreSQL (audit_logs)
    try {
      const dbEntry = {
        entityType: activity.type || activity.scope || 'session',
        entityId: sessionId,
        action: activity.action || 'activity',
        changes: JSON.stringify({
          title: activity.title || null,
          description: activity.description || null,
          details: activity.details || null,
          metadata: activity.metadata || null,
          userAgent
        }),
        userId: performer.userName || performer.email,
        userEmail: performer.email,
        sessionId: sessionId, // P1.7: Link to session
        createdAt: new Date(),
        ipAddress: req?.ip || null
      }
      await db('settings.audit_logs').insert(dbEntry)
    } catch (err) {
      // Sessiz - logAuditEvent kullan
    }
  } catch (error) {
    logError('Audit', `Session activity error: ${error?.message}`)
  }
}

// Default export (backward compatibility)
export default auditSessionActivity
