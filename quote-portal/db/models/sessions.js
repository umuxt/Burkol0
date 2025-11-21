/**
 * Sessions Data Access Layer for PostgreSQL
 */

import db from '../connection.js';

/**
 * Create new session
 */
export async function createSession(sessionData) {
  try {
    const [session] = await db('sessions')
      .insert({
        session_id: sessionData.sessionId,
        token: sessionData.token,
        email: sessionData.email,
        user_name: sessionData.userName || sessionData.user_name,
        worker_id: sessionData.workerId || sessionData.worker_id,
        login_time: sessionData.loginTime || db.fn.now(),
        login_date: sessionData.loginDate || db.raw('CURRENT_DATE'),
        expires: sessionData.expires,
        last_activity_at: sessionData.lastActivityAt || sessionData.last_activity_at || db.fn.now(),
        logout_time: sessionData.logoutTime || null,
        is_active: sessionData.isActive !== false,
        activity_log: JSON.stringify(sessionData.activityLog || [])
      })
      .returning('*');
    
    console.log('✅ Session created:', session.session_id);
    return normalizeSession(session);
  } catch (error) {
    console.error('❌ Error creating session:', error);
    throw error;
  }
}

/**
 * Get session by token
 */
export async function getSessionByToken(token) {
  try {
    const session = await db('sessions')
      .where({ token })
      .first();
    
    return session ? normalizeSession(session) : null;
  } catch (error) {
    console.error('❌ Error getting session by token:', error);
    throw error;
  }
}

/**
 * Get session by session ID
 */
export async function getSessionById(sessionId) {
  try {
    const session = await db('sessions')
      .where({ session_id: sessionId })
      .first();
    
    return session ? normalizeSession(session) : null;
  } catch (error) {
    console.error('❌ Error getting session by ID:', error);
    throw error;
  }
}

/**
 * Get all active sessions
 */
export async function getAllSessions() {
  try {
    const sessions = await db('sessions')
      .orderBy('login_time', 'desc');
    
    return sessions.map(normalizeSession);
  } catch (error) {
    console.error('❌ Error getting all sessions:', error);
    throw error;
  }
}

/**
 * Update session
 */
export async function updateSession(sessionId, updates) {
  try {
    const updateData = {
      last_activity_at: updates.lastActivityAt || updates.last_activity_at,
      is_active: updates.isActive !== undefined ? updates.isActive : undefined,
      logout_time: updates.logoutTime || updates.logout_time,
    };
    
    // Handle activity log append
    if (updates.activityLog) {
      const existing = await getSessionById(sessionId);
      const existingLog = existing?.activityLog || [];
      const newLog = Array.isArray(updates.activityLog) ? updates.activityLog : [updates.activityLog];
      updateData.activity_log = JSON.stringify([...existingLog, ...newLog]);
    }
    
    // Remove undefined values
    Object.keys(updateData).forEach(key => {
      if (updateData[key] === undefined) delete updateData[key];
    });
    
    const [session] = await db('sessions')
      .where({ session_id: sessionId })
      .update(updateData)
      .returning('*');
    
    if (!session) {
      throw new Error('Session not found');
    }
    
    console.log('✅ Session updated:', session.session_id);
    return normalizeSession(session);
  } catch (error) {
    console.error('❌ Error updating session:', error);
    throw error;
  }
}

/**
 * Delete session
 */
export async function deleteSession(token) {
  try {
    // Soft delete - mark as inactive
    const [session] = await db('sessions')
      .where({ token })
      .update({
        is_active: false,
        logout_time: db.fn.now()
      })
      .returning('*');
    
    if (session) {
      console.log('✅ Session deleted:', session.session_id);
    }
    
    return session ? normalizeSession(session) : null;
  } catch (error) {
    console.error('❌ Error deleting session:', error);
    throw error;
  }
}

/**
 * Delete session by session ID
 */
export async function deleteSessionById(sessionId) {
  try {
    const [session] = await db('sessions')
      .where({ session_id: sessionId })
      .update({
        is_active: false,
        logout_time: db.fn.now()
      })
      .returning('*');
    
    if (session) {
      console.log('✅ Session deleted by ID:', session.session_id);
    }
    
    return session ? normalizeSession(session) : null;
  } catch (error) {
    console.error('❌ Error deleting session by ID:', error);
    throw error;
  }
}

/**
 * Clean up expired sessions
 */
export async function cleanupExpiredSessions() {
  try {
    const deleted = await db('sessions')
      .where('expires', '<', db.fn.now())
      .andWhere({ is_active: true })
      .update({
        is_active: false,
        logout_time: db.fn.now()
      });
    
    if (deleted > 0) {
      console.log(`✅ Cleaned up ${deleted} expired sessions`);
    }
    
    return deleted;
  } catch (error) {
    console.error('❌ Error cleaning up expired sessions:', error);
    throw error;
  }
}

/**
 * Normalize session data (convert snake_case to camelCase)
 */
function normalizeSession(session) {
  if (!session) return null;
  
  return {
    sessionId: session.session_id,
    token: session.token,
    email: session.email,
    userName: session.user_name,
    workerId: session.worker_id,
    loginTime: session.login_time,
    loginDate: session.login_date,
    expires: session.expires,
    lastActivityAt: session.last_activity_at,
    logoutTime: session.logout_time,
    isActive: session.is_active,
    activityLog: typeof session.activity_log === 'string' 
      ? JSON.parse(session.activity_log) 
      : (session.activity_log || [])
  };
}

export default {
  createSession,
  getSessionByToken,
  getSessionById,
  getAllSessions,
  updateSession,
  deleteSession,
  deleteSessionById,
  cleanupExpiredSessions
};
