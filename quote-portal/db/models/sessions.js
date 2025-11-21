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
        sessionId: sessionData.sessionId,
        token: sessionData.token,
        email: sessionData.email,
        userName: sessionData.userName,
        workerId: sessionData.workerId,
        loginTime: sessionData.loginTime || db.fn.now(),
        loginDate: sessionData.loginDate || db.raw('CURRENT_DATE'),
        expires: sessionData.expires,
        lastActivityAt: sessionData.lastActivityAt || db.fn.now(),
        logoutTime: sessionData.logoutTime || null,
        isActive: sessionData.isActive !== false,
        activityLog: JSON.stringify(sessionData.activityLog || [])
      })
      .returning('*');
    
    console.log('✅ Session created:', session.sessionId);
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
      .where({ sessionId: sessionId })
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
      .orderBy('loginTime', 'desc');
    
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
      lastActivityAt: updates.lastActivityAt,
      isActive: updates.isActive !== undefined ? updates.isActive : undefined,
      logoutTime: updates.logoutTime,
    };
    
    // Handle activity log append
    if (updates.activityLog) {
      const existing = await getSessionById(sessionId);
      const existingLog = existing?.activityLog || [];
      const newLog = Array.isArray(updates.activityLog) ? updates.activityLog : [updates.activityLog];
      updateData.activityLog = JSON.stringify([...existingLog, ...newLog]);
    }
    
    // Remove undefined values
    Object.keys(updateData).forEach(key => {
      if (updateData[key] === undefined) delete updateData[key];
    });
    
    const [session] = await db('sessions')
      .where({ sessionId: sessionId })
      .update(updateData)
      .returning('*');
    
    if (!session) {
      throw new Error('Session not found');
    }
    
    console.log('✅ Session updated:', session.sessionId);
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
        isActive: false,
        logoutTime: db.fn.now()
      })
      .returning('*');
    
    if (session) {
      console.log('✅ Session deleted:', session.sessionId);
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
      .where({ sessionId: sessionId })
      .update({
        isActive: false,
        logoutTime: db.fn.now()
      })
      .returning('*');
    
    if (session) {
      console.log('✅ Session deleted by ID:', session.sessionId);
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
      .andWhere({ isActive: true })
      .update({
        isActive: false,
        logoutTime: db.fn.now()
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
    sessionId: session.sessionId,
    token: session.token,
    email: session.email,
    userName: session.userName,
    workerId: session.workerId,
    loginTime: session.loginTime,
    loginDate: session.loginDate,
    expires: session.expires,
    lastActivityAt: session.lastActivityAt,
    logoutTime: session.logoutTime,
    isActive: session.isActive,
    activityLog: typeof session.activityLog === 'string' 
      ? JSON.parse(session.activityLog) 
      : (session.activityLog || [])
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
