import jsondb from '../src/lib/jsondb.js'

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

    if (!sessionId || typeof jsondb.appendSessionActivity !== 'function') {
      console.log('DEBUG: Skipping audit - no sessionId or appendSessionActivity function not available')
      return
    }

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

    jsondb.appendSessionActivity(sessionId, entry)
  } catch (error) {
    console.error('Audit session activity error:', error)
  }
}

export default auditSessionActivity
