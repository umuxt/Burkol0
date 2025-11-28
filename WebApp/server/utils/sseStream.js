/**
 * Server-Sent Events (SSE) Utility for Real-time Notifications
 * 
 * Purpose: Stream PostgreSQL LISTEN/NOTIFY events to frontend via SSE
 * 
 * Features:
 * - Real-time database change notifications
 * - Auto-reconnect on connection loss
 * - Heartbeat / keep-alive (every 30 seconds)
 * - Per-user/worker event filtering
 * - Clean connection cleanup
 * 
 * Usage:
 * ```javascript
 * router.get('/stream/assignments', (req, res) => {
 *   const stream = createSSEStream(res, 'mes_assignment_updates');
 *   stream.start();
 * });
 * ```
 * 
 * Created: 2025-11-20
 */

import pg from 'pg';
const { Client } = pg;

// Database configuration
const DB_CONFIG = {
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'beeplan_dev',
  user: process.env.DB_USER || 'umutyalcin',
  password: process.env.DB_PASSWORD || ''
};

/**
 * Create an SSE stream for PostgreSQL notifications
 * 
 * @param {Response} res - Express response object
 * @param {string} channel - PostgreSQL notification channel name
 * @param {Object} options - Configuration options
 * @param {Function} options.filter - Filter function for events (optional)
 * @param {number} options.heartbeatInterval - Heartbeat interval in ms (default: 30000)
 * @returns {Object} Stream control object
 */
export function createSSEStream(res, channel, options = {}) {
  const {
    filter = null,
    heartbeatInterval = 30000
  } = options;

  let pgClient = null;
  let heartbeatTimer = null;
  let isActive = true;

  /**
   * Initialize SSE headers
   */
  const initializeHeaders = () => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering
    res.flushHeaders();
  };

  /**
   * Send SSE event to client
   * 
   * @param {string} event - Event type
   * @param {Object} data - Event data
   */
  const sendEvent = (event, data) => {
    if (!isActive) return;

    try {
      const payload = JSON.stringify(data);
      res.write(`event: ${event}\n`);
      res.write(`data: ${payload}\n\n`);
    } catch (error) {
      console.error(`❌ [SSE] Error sending event:`, error);
    }
  };

  /**
   * Send heartbeat to keep connection alive
   */
  const sendHeartbeat = () => {
    if (!isActive) return;

    try {
      res.write(`:heartbeat ${Date.now()}\n\n`);
    } catch (error) {
      console.error(`❌ [SSE] Heartbeat failed:`, error);
      cleanup();
    }
  };

  /**
   * Setup heartbeat timer
   */
  const startHeartbeat = () => {
    heartbeatTimer = setInterval(sendHeartbeat, heartbeatInterval);
  };

  /**
   * Connect to PostgreSQL and start listening
   */
  const connectAndListen = async () => {
    try {
      pgClient = new Client(DB_CONFIG);
      
      await pgClient.connect();
      console.log(`✅ [SSE] PostgreSQL connected for channel: ${channel}`);

      // Listen to channel
      await pgClient.query(`LISTEN ${channel}`);
      console.log(`👂 [SSE] Listening to channel: ${channel}`);

      // Handle notifications
      pgClient.on('notification', (msg) => {
        if (!isActive) return;

        try {
          const payload = JSON.parse(msg.payload);

          // Apply filter if provided
          if (filter && !filter(payload)) {
            return; // Skip this event
          }

          // Send to client
          sendEvent('message', payload);

        } catch (error) {
          console.error(`❌ [SSE] Error processing notification:`, error);
        }
      });

      // Handle PostgreSQL errors
      pgClient.on('error', (err) => {
        console.error(`❌ [SSE] PostgreSQL error on channel ${channel}:`, err);
        cleanup();
      });

      // Send initial connection success event
      sendEvent('connected', {
        channel,
        timestamp: Date.now(),
        message: 'SSE connection established'
      });

      // Start heartbeat
      startHeartbeat();

    } catch (error) {
      console.error(`❌ [SSE] Failed to connect to PostgreSQL:`, error);
      
      // Send error event
      sendEvent('error', {
        message: 'Failed to establish database connection',
        error: error.message
      });

      cleanup();
    }
  };

  /**
   * Cleanup resources
   */
  const cleanup = async () => {
    if (!isActive) return;
    
    isActive = false;

    // Clear heartbeat
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }

    // Close PostgreSQL connection
    if (pgClient) {
      try {
        await pgClient.query(`UNLISTEN ${channel}`);
        await pgClient.end();
        console.log(`🔌 [SSE] Disconnected from channel: ${channel}`);
      } catch (error) {
        console.error(`❌ [SSE] Error during cleanup:`, error);
      }
      pgClient = null;
    }

    // End response
    try {
      res.end();
    } catch (error) {
      // Response already ended
    }
  };

  /**
   * Start the SSE stream
   */
  const start = () => {
    initializeHeaders();
    connectAndListen();

    // Handle client disconnect
    res.on('close', () => {
      console.log(`👋 [SSE] Client disconnected from channel: ${channel}`);
      cleanup();
    });
  };

  // Return control object
  return {
    start,
    cleanup,
    sendEvent
  };
}

/**
 * Create filter function for worker-specific events
 * 
 * @param {string} workerId - Worker ID to filter by
 * @returns {Function} Filter function
 */
export function createWorkerFilter(workerId) {
  return (payload) => {
    // Filter by workerId field in payload
    return payload.workerId === workerId;
  };
}

/**
 * Create filter function for plan-specific events
 * 
 * @param {string} planId - Plan ID to filter by
 * @returns {Function} Filter function
 */
export function createPlanFilter(planId) {
  return (payload) => {
    // Filter by planId field in payload
    return payload.planId === planId;
  };
}

/**
 * Test SSE endpoint (for development)
 * 
 * Example:
 * GET /api/test/sse
 * 
 * Sends a test event every 5 seconds
 */
export function createTestSSE(res) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  let counter = 0;
  const interval = setInterval(() => {
    res.write(`data: ${JSON.stringify({ counter: ++counter, timestamp: Date.now() })}\n\n`);
  }, 5000);

  res.on('close', () => {
    clearInterval(interval);
    console.log('Test SSE connection closed');
  });
}

export default {
  createSSEStream,
  createWorkerFilter,
  createPlanFilter,
  createTestSSE
};
