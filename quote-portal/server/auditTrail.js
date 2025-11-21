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

    const entry = {
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
      activityLog: [entry]
    })

    // Persist audit entry to PostgreSQL (audit_logs)
    try {
      await db('settings.audit_logs').insert(entry)
    } catch (err) {
      console.warn('[auditTrail] PostgreSQL write failed:', err?.message)
    }
  } catch (error) {
    console.error('Audit session activity error:', error)
  }
}

export default auditSessionActivity
