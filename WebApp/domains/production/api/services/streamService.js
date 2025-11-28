/**
 * SSE Stream Service
 * Handles real-time Server-Sent Events for production monitoring
 */

import {
  createSSEStream,
  createWorkerFilter,
  createPlanFilter
} from '#server/utils/sseStream';

/**
 * Create assignment stream for real-time updates
 */
export function streamAssignments(res, workerId = null) {
  console.log(`🌊 [SSE] New assignment stream connection${workerId ? ` for worker ${workerId}` : ''}`);

  // Create filter if workerId provided
  const filter = workerId ? createWorkerFilter(workerId) : null;

  // Create SSE stream
  const stream = createSSEStream(res, 'mes_assignment_updates', { filter });

  // Start streaming
  stream.start();
  
  return stream;
}

/**
 * Create plan stream for real-time updates
 */
export function streamPlans(res, planId = null) {
  console.log(`🌊 [SSE] New plan stream connection${planId ? ` for plan ${planId}` : ''}`);

  // Create filter if planId provided
  const filter = planId ? createPlanFilter(planId) : null;

  // Create SSE stream
  const stream = createSSEStream(res, 'mes_plan_updates', { filter });

  // Start streaming
  stream.start();
  
  return stream;
}

/**
 * Create worker stream for real-time updates
 */
export function streamWorkers(res, workerId = null) {
  console.log(`🌊 [SSE] New worker stream connection${workerId ? ` for worker ${workerId}` : ''}`);

  // Create filter if workerId provided
  const filter = workerId ? createWorkerFilter(workerId) : null;

  // Create SSE stream
  const stream = createSSEStream(res, 'mes_worker_updates', { filter });

  // Start streaming
  stream.start();
  
  return stream;
}

/**
 * Create test stream for development
 */
export function streamTest(res) {
  console.log('🧪 [SSE] Test stream connection');

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  let counter = 0;
  const interval = setInterval(() => {
    res.write(`data: ${JSON.stringify({ 
      counter: ++counter, 
      timestamp: Date.now(),
      message: 'Test event from SSE stream'
    })}\n\n`);
  }, 5000);

  res.on('close', () => {
    clearInterval(interval);
    console.log('🧪 [SSE] Test stream closed');
  });
  
  return { interval };
}
