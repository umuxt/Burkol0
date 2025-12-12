/**
 * Worker Authentication Module
 * Handles PIN-based worker login, token management, and inactivity timeout
 * 
 * Features:
 * - PIN verification and daily token generation
 * - localStorage token persistence
 * - 30-second inactivity timeout
 * - Auto-redirect on timeout or logout
 */

// Default value, will be updated from settings
let INACTIVITY_TIMEOUT_MS = 30 * 1000;
const TOKEN_KEY = 'workerToken';
const WORKER_KEY = 'workerData';

let inactivityTimer = null;
let currentWorkerId = null;

/**
 * Login worker with PIN
 * @param {string} workerId - Worker ID
 * @param {string} pin - 4-digit PIN
 * @returns {Promise<{success: boolean, token?: string, worker?: object, error?: string}>}
 */
export async function loginWorker(workerId, pin) {
    try {
        const response = await fetch(`/api/mes/workers/${workerId}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pin })
        });

        const data = await response.json();

        if (!response.ok || !data.success) {
            return { success: false, error: data.error || 'Giriş başarısız' };
        }

        // Store token and worker data
        localStorage.setItem(TOKEN_KEY, data.token);
        localStorage.setItem(WORKER_KEY, JSON.stringify(data.worker));
        currentWorkerId = workerId;

        // Start inactivity timer
        startInactivityTimer();

        return { success: true, token: data.token, worker: data.worker };
    } catch (error) {
        console.error('Login error:', error);
        return { success: false, error: 'Bağlantı hatası' };
    }
}

/**
 * Logout worker
 */
export async function logoutWorker() {
    const token = getToken();
    const workerId = currentWorkerId || getCurrentWorker()?.id;

    if (workerId && token) {
        try {
            await fetch(`/api/mes/workers/${workerId}/logout`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                }
            });
        } catch (error) {
            console.error('Logout error:', error);
        }
    }

    // Clear stored data
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(WORKER_KEY);
    stopInactivityTimer();
    currentWorkerId = null;

    // Redirect to selection
    window.location.href = '/pages/worker-selection.html';
}

/**
 * Get current token from localStorage
 * @returns {string|null}
 */
export function getToken() {
    return localStorage.getItem(TOKEN_KEY);
}

/**
 * Get current worker data from localStorage
 * @returns {object|null}
 */
export function getCurrentWorker() {
    const data = localStorage.getItem(WORKER_KEY);
    return data ? JSON.parse(data) : null;
}

/**
 * Verify if current token is still valid
 * @returns {Promise<boolean>}
 */
export async function verifyToken() {
    const token = getToken();
    const worker = getCurrentWorker();

    if (!token || !worker) {
        return false;
    }

    try {
        const response = await fetch(`/api/mes/workers/${worker.id}/verify-token`, {
            headers: { 'x-worker-token': token }
        });

        const data = await response.json();
        return response.ok && data.valid;
    } catch (error) {
        console.error('Token verification error:', error);
        return false;
    }
}

/**
 * Start inactivity timer
 * Resets on user activity (mouse, keyboard, touch)
 */
function startInactivityTimer() {
    stopInactivityTimer(); // Clear existing timer

    const resetTimer = () => {
        stopInactivityTimer();
        inactivityTimer = setTimeout(() => {
            console.log('⏱️ Inactivity timeout - logging out');
            logoutWorker();
        }, INACTIVITY_TIMEOUT_MS);
    };

    // Initial timer
    resetTimer();

    // Reset on user activity
    const activityEvents = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart'];
    activityEvents.forEach(event => {
        document.addEventListener(event, resetTimer, { passive: true });
    });

    // Store event listeners for cleanup
    document._inactivityResetFn = resetTimer;
}

/**
 * Stop inactivity timer
 */
function stopInactivityTimer() {
    if (inactivityTimer) {
        clearTimeout(inactivityTimer);
        inactivityTimer = null;
    }

    // Remove event listeners
    if (document._inactivityResetFn) {
        const activityEvents = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart'];
        activityEvents.forEach(event => {
            document.removeEventListener(event, document._inactivityResetFn, { passive: true });
        });
        delete document._inactivityResetFn;
    }
}

/**
 * Check if worker is logged in (for page load)
 * If not logged in, redirect to selection
 */
export async function requireWorkerAuth() {
    const token = getToken();
    const worker = getCurrentWorker();

    if (!token || !worker) {
        console.log('❌ No worker session - redirecting to selection');
        window.location.href = '/pages/worker-selection.html';
        return false;
    }

    // Verify token is still valid
    const isValid = await verifyToken();
    if (!isValid) {
        console.log('❌ Invalid token - redirecting to selection');
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(WORKER_KEY);
        window.location.href = '/pages/worker-selection.html';
        return false;
    }

    // Start inactivity timer
    currentWorkerId = worker.id;
    startInactivityTimer();

    return true;
}

/**
 * Initialize auth module
 */
export function initializeAuth() {
    console.log('🔐 Worker Auth Module initialized');

    // Check if we're on worker-portal page
    if (window.location.pathname.includes('worker-portal')) {
        // Load settings to get dynamic timeout
        fetch('/api/settings/system')
            .then(res => res.json())
            .then(settings => {
                if (settings && settings.workerInactivityTimeoutSeconds) {
                    INACTIVITY_TIMEOUT_MS = settings.workerInactivityTimeoutSeconds * 1000;
                    console.log(`⏱️ Worker inactivity timeout updated to ${settings.workerInactivityTimeoutSeconds}s`);
                    // Restart timer with new duration if already running
                    if (inactivityTimer) {
                        startInactivityTimer();
                    }
                }
            })
            .catch(err => console.warn('Failed to load worker timeout settings:', err))
            .finally(() => requireWorkerAuth());
    }
}
