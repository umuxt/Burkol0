import { updateSession } from './auth.js'
import db from '../db/connection.js'

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

    // Entry for session activity log (in-memory)
    const memoryEntry = {
      performedBy: performer,
      timestamp: activity.timestamp || new Date().toISOString(),
      action: activity.action || null,
      details: activity.details || null,
      ipAddress: req.ip || null,
      userAgent: req.get('user-agent') || null
    }

    // Update session activity log in memory (append)
    await updateSession({
      sessionId,
      activityLog: [memoryEntry]
    })

    // Persist audit entry to PostgreSQL (audit_logs)
    // Map to actual table columns: entityType, entityId, action, changes (jsonb), userId, userEmail, createdAt, ipAddress
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
          userAgent: req.get('user-agent') || null
        }),
        userId: performer.userName || performer.email,
        userEmail: performer.email,
        createdAt: new Date(),
        ipAddress: req.ip || null
      }
      await db('settings.audit_logs').insert(dbEntry)
    } catch (err) {
      console.warn('[auditTrail] PostgreSQL write failed:', err?.message)
    }
  } catch (error) {
    console.error('Audit session activity error:', error)
  }
}

export default auditSessionActivity
