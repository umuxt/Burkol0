import jsondb from '../src/lib/jsondb.js'

export function auditSessionActivity(req, activity = {}) {
  try {
    if (!activity || typeof activity !== 'object') return

    const sessionId = req?.user?.sessionId
    if (!sessionId || typeof jsondb.appendSessionActivity !== 'function') return

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

    jsondb.appendSessionActivity(sessionId, entry)
  } catch (error) {
    console.error('Audit session activity error:', error)
  }
}

export default auditSessionActivity
