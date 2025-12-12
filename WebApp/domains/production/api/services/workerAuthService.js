/**
 * Worker Authentication Service
 * PIN verification, daily token management, login/logout
 */

import db from '#db/connection';
import crypto from 'crypto';

/**
 * Generate a secure random token
 */
function generateToken() {
    return crypto.randomBytes(32).toString('hex');
}

/**
 * Check if today's token is still valid (same day)
 */
function isSameDay(date1, date2) {
    if (!date1 || !date2) return false;
    const d1 = new Date(date1);
    const d2 = new Date(date2);
    return d1.toDateString() === d2.toDateString();
}

/**
 * Verify worker PIN
 * @param {string} workerId - Worker ID (e.g., WK-001)
 * @param {string} pin - 4-digit PIN
 * @returns {Promise<{success: boolean, worker?: object, error?: string}>}
 */
export async function verifyPin(workerId, pin) {
    const worker = await db('mes.workers')
        .select('id', 'name', 'pinCode', 'isActive')
        .where('id', workerId)
        .first();

    if (!worker) {
        return { success: false, error: 'İşçi bulunamadı' };
    }

    if (!worker.isActive) {
        return { success: false, error: 'İşçi hesabı devre dışı' };
    }

    if (!worker.pinCode) {
        return { success: false, error: 'PIN tanımlanmamış. Yöneticinize başvurun.' };
    }

    if (worker.pinCode !== pin) {
        return { success: false, error: 'Yanlış PIN' };
    }

    return {
        success: true,
        worker: { id: worker.id, name: worker.name }
    };
}

/**
 * Set worker PIN (Admin only)
 * @param {string} workerId - Worker ID
 * @param {string} pin - 4-digit PIN
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function setPin(workerId, pin) {
    // Validate PIN format
    if (!pin || !/^\d{4}$/.test(pin)) {
        return { success: false, error: 'PIN 4 haneli sayı olmalı' };
    }

    const worker = await db('mes.workers')
        .where('id', workerId)
        .first();

    if (!worker) {
        return { success: false, error: 'İşçi bulunamadı' };
    }

    await db('mes.workers')
        .where('id', workerId)
        .update({
            pinCode: pin,
            pinUpdatedAt: db.fn.now(),
            updatedAt: db.fn.now()
        });

    return { success: true };
}

/**
 * Login worker with PIN
 * Returns existing daily token or generates new one
 * @param {string} workerId - Worker ID
 * @param {string} pin - 4-digit PIN
 * @param {string} ipAddress - Client IP address
 * @returns {Promise<{success: boolean, token?: string, worker?: object, error?: string}>}
 */
export async function loginWorker(workerId, pin, ipAddress = null) {
    // Verify PIN first
    const verification = await verifyPin(workerId, pin);
    if (!verification.success) {
        return verification;
    }

    // Get worker with token info
    const worker = await db('mes.workers')
        .select('id', 'name', 'email', 'dailyToken', 'tokenGeneratedAt')
        .where('id', workerId)
        .first();

    const now = new Date();
    let token = worker.dailyToken;

    // Check if we need a new token (no token or different day)
    if (!token || !isSameDay(worker.tokenGeneratedAt, now)) {
        token = generateToken();

        await db('mes.workers')
            .where('id', workerId)
            .update({
                dailyToken: token,
                tokenGeneratedAt: now,
                lastLoginAt: now,
                updatedAt: db.fn.now()
            });
    } else {
        // Same day, just update lastLoginAt
        await db('mes.workers')
            .where('id', workerId)
            .update({
                lastLoginAt: now,
                updatedAt: db.fn.now()
            });
    }

    // Log login activity
    await db('mes.worker_activity_logs').insert({
        workerId: worker.id,
        workerName: worker.name,
        action: 'login',
        entityType: 'session',
        ipAddress,
        createdAt: now
    });

    return {
        success: true,
        token,
        worker: {
            id: worker.id,
            name: worker.name,
            email: worker.email
        }
    };
}

/**
 * Logout worker (clear localStorage on client, log activity)
 * Token stays valid for the day
 * @param {string} workerId - Worker ID
 * @param {string} ipAddress - Client IP address
 * @returns {Promise<{success: boolean}>}
 */
export async function logoutWorker(workerId, ipAddress = null) {
    const worker = await db('mes.workers')
        .select('id', 'name')
        .where('id', workerId)
        .first();

    if (!worker) {
        return { success: false, error: 'İşçi bulunamadı' };
    }

    // Log logout activity
    await db('mes.worker_activity_logs').insert({
        workerId: worker.id,
        workerName: worker.name,
        action: 'logout',
        entityType: 'session',
        ipAddress,
        createdAt: new Date()
    });

    return { success: true };
}

/**
 * Verify worker token
 * @param {string} workerId - Worker ID
 * @param {string} token - Token to verify
 * @returns {Promise<{valid: boolean, worker?: object}>}
 */
export async function verifyToken(workerId, token) {
    if (!workerId || !token) {
        return { valid: false };
    }

    const worker = await db('mes.workers')
        .select('id', 'name', 'email', 'dailyToken', 'tokenGeneratedAt', 'isActive')
        .where('id', workerId)
        .first();

    if (!worker || !worker.isActive) {
        return { valid: false };
    }

    // Check token matches and is from today
    if (worker.dailyToken !== token) {
        return { valid: false };
    }

    if (!isSameDay(worker.tokenGeneratedAt, new Date())) {
        return { valid: false, expired: true };
    }

    return {
        valid: true,
        worker: {
            id: worker.id,
            name: worker.name,
            email: worker.email
        }
    };
}

/**
 * Get worker by ID (for token verification responses)
 */
export async function getWorkerById(workerId) {
    return await db('mes.workers')
        .select('id', 'name', 'email', 'isActive')
        .where('id', workerId)
        .first();
}
