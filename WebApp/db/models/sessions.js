/**
 * Sessions Data Access Layer for PostgreSQL
 */

import db from '../connection.js';

/**
 * Create new session (upsert - update if sessionId exists)
 */
export async function createSession(sessionData) {
  try {
    const insertData = {
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
    };

    // Use upsert: ON CONFLICT (sessionId) DO UPDATE
    const [session] = await db('sessions')
      .insert(insertData)
      .onConflict('sessionId')
      .merge({
        token: insertData.token,
        email: insertData.email,
        userName: insertData.userName,
        workerId: insertData.workerId,
        loginTime: insertData.loginTime,
        expires: insertData.expires,
        lastActivityAt: insertData.lastActivityAt,
        isActive: insertData.isActive,
        logoutTime: null,
        activityLog: insertData.activityLog
      })
      .returning('*');

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
 * @param {string} sessionId - Session ID (required, must be string)
 * @param {object} updates - Fields to update (lastActivityAt, isActive, logoutTime, activityLog)
 */
export async function updateSession(sessionId, updates) {
  // Parametre validasyonu
  if (!sessionId || typeof sessionId !== 'string') {
    console.error('[sessions] Invalid sessionId:', sessionId, 'Type:', typeof sessionId);
    throw new Error('Invalid sessionId: must be a non-empty string');
  }

  if (!updates || typeof updates !== 'object') {
    console.error('[sessions] Invalid updates:', updates);
    throw new Error('Invalid updates: must be an object');
  }

  try {
    // Sadece geçerli alanları al
    const updateData = {};

    if (updates.lastActivityAt !== undefined) {
      updateData.lastActivityAt = updates.lastActivityAt;
    }

    if (updates.isActive !== undefined) {
      updateData.isActive = updates.isActive;
    }

    if (updates.logoutTime !== undefined) {
      updateData.logoutTime = updates.logoutTime;
    }

    // Handle activity log append
    if (updates.activityLog) {
      const existing = await getSessionById(sessionId);
      const existingLog = Array.isArray(existing?.activityLog) ? existing.activityLog : [];
      const newLog = Array.isArray(updates.activityLog) ? updates.activityLog : [updates.activityLog];
      updateData.activityLog = JSON.stringify([...existingLog, ...newLog]);
    }

    // Güncellenecek alan yoksa erken çık
    if (Object.keys(updateData).length === 0) {
      const existing = await getSessionById(sessionId);
      return existing;
    }

    const [session] = await db('sessions')
      .where({ sessionId: sessionId })
      .update(updateData)
      .returning('*');

    if (!session) {
      throw new Error('Session not found: ' + sessionId);
    }

    return normalizeSession(session);
  } catch (error) {
    console.error('❌ Error updating session:', sessionId, error?.message);
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
