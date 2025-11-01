import { updateSession, getDb } from './auth.js'

export async function auditSessionActivity(req, activity = {}) {
  try {
    if (!activity || typeof activity !== 'object') return

    const sessionId = req?.user?.sessionId
    console.log('DEBUG auditSessionActivity:', {
      hasReq: !!req,
      hasUser: !!req?.user,
      sessionId: sessionId,
      activityType: activity.type,
      activityTitle: activity.title
    })

    if (!sessionId) return

    const performer = {
      email: req.user?.email || null,
      userName: req.user?.userName || req.user?.name || null,
      sessionId
    }

    const entry = {
      performedBy: performer,
      timestamp: activity.timestamp || new Date().toISOString(),
      ...activity
    }

    console.log('DEBUG: About to append session activity:', {
      sessionId,
      entryType: entry.type,
      entryTitle: entry.title
    })

    // Update session activity log in memory (append)
    await updateSession({
      sessionId,
      activityLog: [entry]
    })

    // Best-effort: persist audit entry to Firestore (audit_logs)
    try {
      const db = getDb()
      // Prefer snake_case collection; keep compatibility with camelCase by also mirroring
      await db.collection('audit_logs').add(entry)
      // Optional mirror write for legacy readers
      try { await db.collection('auditLogs').add(entry) } catch {}
    } catch (err) {
      console.warn('[auditTrail] Firestore write failed:', err?.message)
    }
  } catch (error) {
    console.error('Audit session activity error:', error)
  }
}

export default auditSessionActivity
