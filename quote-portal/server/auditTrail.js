import { updateSession } from './auth.js'

export function auditSessionActivity(req, activity = {}) {
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
    updateSession({
      sessionId,
      activityLog: [entry]
    })
  } catch (error) {
    console.error('Audit session activity error:', error)
  }
}

export default auditSessionActivity
