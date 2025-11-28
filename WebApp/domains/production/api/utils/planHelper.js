import db from '#db/connection';
import { createRequire } from 'module';

const requireModule = createRequire(import.meta.url);

/**
 * Validate production plan nodes for completeness and data integrity
 * Ensures all nodes have required fields before plan can be saved
 * 
 * @param {Array} nodes - Array of plan nodes (canonical schema)
 * @returns {Object} { valid: boolean, errors: Array<string> }
 */
export function validateProductionPlanNodes(nodes) {
  const errors = [];
  const nodesToValidate = nodes;
  
  if (!Array.isArray(nodesToValidate) || nodesToValidate.length === 0) {
    errors.push('Production plan must have at least one operation node');
    return { valid: false, errors };
  }
  
  // Build predecessor map for starting node detection
  const predecessorMap = new Map();
  nodesToValidate.forEach(node => {
    const nodeId = node.nodeId;
    const preds = node.predecessors || [];
    predecessorMap.set(nodeId, preds);
  });
  
  nodesToValidate.forEach((node, index) => {
    const nodeId = node.nodeId;
    const nodeLabel = `Node ${index + 1} (${nodeId || 'unknown'})`;
    
    // 1. Validate node ID (CANONICAL - required)
    if (!node.nodeId || typeof node.nodeId !== 'string' || node.nodeId.trim() === '') {
      errors.push(`${nodeLabel}: Node id is required and must be a non-empty string`);
    }
    
    // 2. Validate operation name
    if (!node.name || typeof node.name !== 'string' || node.name.trim() === '') {
      errors.push(`${nodeLabel}: Operation name is required`);
    }
    
    // 3. Validate nominalTime (CANONICAL - required)
    const nominalTime = node.nominalTime;
    if (!Number.isFinite(nominalTime) || nominalTime < 1) {
      errors.push(`${nodeLabel}: nominalTime must be a number >= 1 minute`);
    }
    
    // 4. Validate efficiency (CANONICAL - optional)
    if (node.efficiency !== undefined && node.efficiency !== null) {
      const eff = parseFloat(node.efficiency);
      if (!Number.isFinite(eff) || eff <= 0 || eff > 1) {
        errors.push(`${nodeLabel}: efficiency must be between 0.01 and 1.0`);
      }
    }
    
    // 5. Validate assignmentMode and assignedWorkerId (CANONICAL)
    if (node.assignmentMode === 'manual') {
      if (!node.assignedWorkerId || typeof node.assignedWorkerId !== 'string' || node.assignedWorkerId.trim() === '') {
        errors.push(`${nodeLabel}: assignmentMode='manual' requires assignedWorkerId to be present and non-empty`);
      }
    }
    
    // 6. Validate station assignments
    const stations = node.assignedStations || [];
    if (!Array.isArray(stations) || stations.length === 0) {
      errors.push(`${nodeLabel}: At least one work station must be assigned`);
    }
    
    // 7. Validate output quantity
    const outputQty = node.outputQty;
    if (!Number.isFinite(outputQty) || outputQty <= 0) {
      errors.push(`${nodeLabel}: Output quantity must be a number greater than 0`);
    }
    
    // 8. Validate material inputs
    const materials = node.materialInputs || [];
    const materialInputs = node.materialInputs || [];
    const allMaterials = materials.length > 0 ? materials : materialInputs;
    
    // Debug log for material validation
    if (allMaterials.length > 0) {
      console.log(`🔍 ${nodeLabel} materials:`, JSON.stringify(allMaterials, null, 2));
    }
    
    // Check each material has a valid quantity (CANONICAL: requiredQuantity)
    allMaterials.forEach((material, matIndex) => {
      const matQty = material.requiredQuantity;
      console.log(`   Material ${matIndex + 1}: requiredQuantity=${material.requiredQuantity}, resolved=${matQty}`);
      if (!Number.isFinite(matQty) || matQty < 0) {
        errors.push(`${nodeLabel}, Material ${matIndex + 1}: Quantity must be a valid number >= 0`);
      }
    });
    
    // Check starting nodes (no predecessors) have at least one material
    const predecessors = node.predecessors || [];
    const isStartingNode = !Array.isArray(predecessors) || predecessors.length === 0;
    
    if (isStartingNode) {
      // Starting nodes must have at least one non-derived material
      const nonDerivedMaterials = allMaterials.filter(m => !m.derivedFrom);
      
      if (nonDerivedMaterials.length === 0) {
        errors.push(`${nodeLabel}: Starting operations must have at least one material input`);
      }
    }
  });
  
  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Topological sort using Kahn's algorithm
 * ✅ FIXED: Uses node.nodeId (VARCHAR) instead of node.id (INTEGER)
 */
export function buildTopologicalOrder(nodes, predecessors) {
  const graph = new Map();
  const inDegree = new Map();
  
  // ✅ FIXED: Use node.nodeId (VARCHAR)
  nodes.forEach(n => {
    graph.set(n.nodeId, []);
    inDegree.set(n.nodeId, 0);
  });
  
  // Predecessors already use VARCHAR nodeId/predecessorNodeId
  predecessors.forEach(p => {
    graph.get(p.predecessorNodeId).push(p.nodeId);
    inDegree.set(p.nodeId, inDegree.get(p.nodeId) + 1);
  });
  
  // ✅ FIXED: Filter and map using node.nodeId
  const queue = nodes.filter(n => inDegree.get(n.nodeId) === 0).map(n => n.nodeId);
  const order = [];
  
  while (queue.length > 0) {
    const nodeId = queue.shift();
    order.push(nodeId);
    
    for (const neighbor of graph.get(nodeId)) {
      inDegree.set(neighbor, inDegree.get(neighbor) - 1);
      if (inDegree.get(neighbor) === 0) {
        queue.push(neighbor);
      }
    }
  }
  
  // ✅ CRITICAL: Detect dependency cycles
  if (order.length !== nodes.length) {
    const missingNodes = nodes.filter(n => !order.includes(n.nodeId)).map(n => n.name);
    return {
      error: 'Cycle detected in execution graph',
      details: { remainingNodes: missingNodes }
    };
  }
  
  return { order, success: true };
}

/**
 * Calculate earliest available slot in a schedule
 */
export function calculateEarliestSlot(schedule, afterTime) {
  if (schedule.length === 0) return afterTime;
  
  const sorted = schedule.sort((a, b) => b.end - a.end);
  const lastEnd = sorted[0].end;
  
  return lastEnd > afterTime ? lastEnd : afterTime;
}

/**
 * Find earliest available substation from station options
 * ✅ FAZ 3: Added currentExpectedEnd database field check
 */
export async function findEarliestSubstation(trx, stationOptions, scheduleMap, afterTime) {
  let bestSubstation = null;
  let earliestTime = null;
  
  for (const stOpt of stationOptions) {
    const substations = await trx('mes.substations')
      .where('stationId', stOpt.stationId)
      .where('isActive', true);
    
    for (const sub of substations) {
      // ✅ FAZ 3: Check database currentExpectedEnd field
      let dbEnd = afterTime;
      if (sub.currentExpectedEnd) {
        const dbEndTime = new Date(sub.currentExpectedEnd);
        if (dbEndTime > afterTime) {
          dbEnd = dbEndTime;
        }
      }
      
      // Check memory schedule
      const memSchedule = scheduleMap.get(sub.id) || [];
      const memEnd = calculateEarliestSlot(memSchedule, afterTime);
      
      // Use the latest of: afterTime, dbEnd, memEnd
      const availableAt = new Date(Math.max(
        afterTime.getTime(),
        dbEnd.getTime(),
        memEnd.getTime()
      ));
      
      if (!earliestTime || availableAt < earliestTime) {
        bestSubstation = sub;
        earliestTime = availableAt;
      }
    }
  }
  
  return { 
    substation: bestSubstation, 
    availableAt: earliestTime || afterTime 
  };
}

/**
 * Get shift blocks for specific day from personal_schedule
 */
export function getShiftBlocksForDay(schedule, dayOfWeek) {
  if (!schedule) return [];
  
  // Standard model: shifts: [{ id: '1', blocks: { monday: [...] } }]
  if (Array.isArray(schedule.shifts)) {
    const shift = schedule.shifts.find(s => s.id === '1');
    return shift?.blocks?.[dayOfWeek] || [];
  }
  
  // Aggregated model: shiftBlocks: { 'shift-monday': [...] }
  const aggregated = schedule.shiftBlocks?.[`shift-${dayOfWeek}`];
  if (Array.isArray(aggregated)) return aggregated;
  
  // Split-by-lane: shiftByLane: { '1': { monday: [...] } }
  const byLane = schedule.shiftByLane?.['1']?.[dayOfWeek];
  if (Array.isArray(byLane)) return byLane;
  
  return [];
}

/**
 * Check if time slot falls within shift blocks
 */
export function isWithinShiftBlocks(startTime, durationMinutes, shiftBlocks) {
  // ✅ CRITICAL: Empty schedule should NOT match (fall through to least-busy selection)
  // Previously returned true, which caused first worker to always be selected
  if (shiftBlocks.length === 0) return false;
  
  const startHour = startTime.getHours() + startTime.getMinutes() / 60;
  const endHour = startHour + durationMinutes / 60;
  
  for (const block of shiftBlocks) {
    if (!block.start || !block.end) continue;
    
    const [blockStartH, blockStartM] = block.start.split(':').map(Number);
    const [blockEndH, blockEndM] = block.end.split(':').map(Number);
    
    const blockStart = blockStartH + blockStartM / 60;
    const blockEnd = blockEndH + blockEndM / 60;
    
    // Task must fit entirely within one shift block
    if (startHour >= blockStart && endHour <= blockEnd) {
      return true;
    }
  }
  
  return false;
}

/**
 * Find worker with skill check and shift availability
 * ✅ FAZ 3: Added worker status filtering
 */
export async function findWorkerWithShiftCheck(trx, requiredSkills, stationId, startTime, duration, workerSchedule = new Map()) {
  const dayOfWeek = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][startTime.getDay()];
  
  // Get workers with matching skills (or all if no skills required)
  let query = trx('mes.workers').where('isActive', true);
  
  // ✅ FIXED: Worker must have ALL required skills (AND logic)
  if (requiredSkills && requiredSkills.length > 0) {
    // Check if worker.skills array contains ALL required skills
    requiredSkills.forEach(skill => {
      query = query.whereRaw(`skills::jsonb @> ?::jsonb`, [JSON.stringify([skill])]);
    });
  }
  
  const workers = await query;
  
  // ✅ FAZ 3: Filter by worker status (available/busy only, not break/inactive)
  // NOTE: Absence check is done later in the loop using actualStart
  const eligibleWorkers = workers.filter(w => {
    // Worker status filtering
    const status = normalizeWorkerStatus(w);
    if (status === 'inactive' || status === 'break') {
      return false;
    }
    
    return true;
  });
  
  if (eligibleWorkers.length === 0) {
    console.warn(`⚠️  No eligible workers found (${workers.length} filtered out by status)`);
    return null;
  }
  
  // Filter by shift availability AND current schedule conflicts
  let hasValidShiftConfig = false; // Track if ANY worker has valid shift blocks
  
  for (const worker of eligibleWorkers) {
    // ✅ CRITICAL: Calculate worker's actual availability
    const workerQueue = workerSchedule.get(worker.id) || [];
    const workerAvailableAt = workerQueue.length > 0
      ? new Date(workerQueue[workerQueue.length - 1].end.getTime() + 1000) // Last task end + 1 second
      : startTime; // If no queue, use requested start time
    
    // Use the later of worker availability or requested start time
    const actualStart = new Date(Math.max(workerAvailableAt.getTime(), startTime.getTime()));
    const proposedEnd = new Date(actualStart.getTime() + duration * 60000);
    
    // ✅ CRITICAL: Check absence on ACTUAL start date, not requested date
    const actualTaskDate = actualStart.toISOString().split('T')[0];
    const absences = typeof worker.absences === 'string' ? JSON.parse(worker.absences) : (worker.absences || []);
    const workerWithAbsences = { ...worker, absences };
    
    if (isWorkerAbsent(workerWithAbsences, actualStart)) {
      console.log(`⚠️  Worker ${worker.name} is absent on ${actualTaskDate} (actual start), skipping...`);
      continue; // Skip this worker, try next
    }
    
    // Check conflicts using worker's actual start time
    const hasConflict = workerQueue.some(task => {
      return (actualStart < task.end && proposedEnd > task.start);
    });
    
    if (hasConflict) {
      console.log(`⚠️  Worker ${worker.name} has schedule conflict at ${actualStart.toISOString()}, skipping...`);
      continue; // Skip this worker, try next
    }
    
    // Parse personalSchedule if it's a string (safety check)
    const schedule = typeof worker.personalSchedule === 'string' 
      ? JSON.parse(worker.personalSchedule) 
      : worker.personalSchedule;
    
    // ✅ CRITICAL: Check shift blocks using ACTUAL start time, not requested time
    const actualDayOfWeek = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][actualStart.getDay()];
    const shiftBlocks = getShiftBlocksForDay(schedule, actualDayOfWeek);
    
    // Track if shift config exists
    if (shiftBlocks.length > 0) {
      hasValidShiftConfig = true;
    }
    
    if (isWithinShiftBlocks(actualStart, duration, shiftBlocks)) {
      return worker;
    }
  }
  
  // ✅ FALLBACK: If no shift match OR no valid shift config, select least busy worker
  // Prevents always selecting first worker alphabetically when schedule is empty
  if (!hasValidShiftConfig) {
    console.warn(`⚠️  No shift configuration found for any worker on ${dayOfWeek}, selecting least busy worker`);
  } else {
    console.warn(`⚠️  No worker matches shift for ${dayOfWeek}, selecting least busy worker`);
  }
  
  const workerAvailability = eligibleWorkers.map(worker => {
    const workerQueue = workerSchedule.get(worker.id) || [];
    const availableAt = workerQueue.length > 0
      ? new Date(workerQueue[workerQueue.length - 1].end.getTime() + 1000)
      : startTime;
    return { worker, availableAt };
  });
  
  // Sort by earliest availability
  workerAvailability.sort((a, b) => a.availableAt.getTime() - b.availableAt.getTime());
  
  return workerAvailability[0]?.worker || null;
}

/**
 * Check if worker is absent on a given date
 * ✅ FAZ 1A-3: Worker absence management
 * 
 * Worker absences structure:
 * worker.absences = [
 *   {
 *     id: "abs-001",
 *     type: "vacation" | "sick" | "training" | "meeting" | "other",
 *     startDate: "2025-12-20",
 *     endDate: "2025-12-27",
 *     reason: "Yıllık izin",
 *     createdAt: "2025-11-20T10:00:00Z",
 *     createdBy: "admin-id"
 *   }
 * ]
 * 
 * @param {Object} worker - Worker object with absences array
 * @param {Date} date - Date to check
 * @returns {Object|null} Absence record if found, null otherwise
 */
export function isWorkerAbsent(worker, date) {
  if (!worker || !worker.absences || !Array.isArray(worker.absences)) {
    return null; // No absences configured
  }
  
  const checkDate = date.getTime ? date.getTime() : new Date(date).getTime();
  
  for (const absence of worker.absences) {
    if (!absence.startDate || !absence.endDate) {
      continue; // Skip invalid absence records
    }
    
    const start = new Date(absence.startDate).setHours(0, 0, 0, 0);
    const end = new Date(absence.endDate).setHours(23, 59, 59, 999);
    
    // Check if date falls within absence period (inclusive)
    if (checkDate >= start && checkDate <= end) {
      return absence;
    }
  }
  
  return null; // Not absent
}

/**
 * Normalize worker status to standard enum
 * ✅ FAZ 3: Worker status normalization
 * 
 * @param {Object} worker - Worker object
 * @returns {string} - 'available' | 'busy' | 'break' | 'inactive'
 */
export function normalizeWorkerStatus(worker) {
  if (!worker) return 'inactive';
  
  let status = worker.status || worker.availability || 'available';
  status = status.toString().toLowerCase();
  
  // Legacy value normalization
  if (/active|enabled|on|available/i.test(status)) return 'available';
  if (/inactive|off|removed|disabled/i.test(status)) return 'inactive';
  if (/break|paused|rest|lunch/i.test(status)) return 'break';
  if (/busy|working|occupied/i.test(status)) return 'busy';
  
  // Default to available if unclear
  return 'available';
}

/**
 * Validate materials for launch (non-blocking warnings)
 * ✅ FAZ 3: Material validation for start nodes + M-00 materials
 * 
 * @param {Object} trx - Knex transaction
 * @param {string} planId - Production plan ID
 * @param {Array} nodes - Plan nodes (with materialInputs already attached)
 * @param {Array} predecessors - Node predecessors
 * @returns {Promise<Array>} - Array of material warnings
 */
export async function validateMaterialsForLaunch(trx, planId, nodes, predecessors) {
  const warnings = [];
  
  // 1. Identify start nodes (no predecessors)
  const startNodeIds = new Set(
    nodes
      .filter(n => {
        const hasPred = predecessors.some(p => p.nodeId === n.nodeId);
        return !hasPred;
      })
      .map(n => n.nodeId)
  );
  
  console.log(`🔍 Material validation: ${startNodeIds.size} start nodes`);
  
  // 2. Collect materials to check (start nodes + M-00 raw materials)
  const materialsToCheck = new Map();
  
  for (const node of nodes) {
    const shouldCheckNode = startNodeIds.has(node.nodeId);
    
    // Use pre-loaded materialInputs from node
    const inputs = node.materialInputs || [];
    
    for (const mat of inputs) {
      const isRawMaterial = mat.materialCode && mat.materialCode.startsWith('M-00');
      const shouldCheck = shouldCheckNode || isRawMaterial;
      
      if (shouldCheck && !mat.isDerived) {
        const key = mat.materialCode;
        const existing = materialsToCheck.get(key) || {
          materialCode: key,
          requiredQuantity: 0,
          unit: mat.unit || 'adet',
          nodeNames: new Set()
        };
        
        existing.requiredQuantity += parseFloat(mat.requiredQuantity || 0);
        existing.nodeNames.add(node.name || node.nodeId);
        materialsToCheck.set(key, existing);
      }
    }
  }
  
  console.log(`📊 Checking ${materialsToCheck.size} materials`);
  
  // 3. Check stock availability
  for (const [code, mat] of materialsToCheck) {
    try {
      const stock = await trx('materials.materials')
        .where('code', code)
        .first();
      
      const available = parseFloat(stock?.stock || stock?.available || 0);
      const required = mat.requiredQuantity;
      
      if (available < required) {
        warnings.push({
          nodeName: Array.from(mat.nodeNames).join(', '),
          materialCode: code,
          required: Math.round(required * 100) / 100,
          available: Math.round(available * 100) / 100,
          shortage: Math.round((required - available) * 100) / 100,
          unit: mat.unit
        });
      }
    } catch (error) {
      console.warn(`⚠️  Material ${code} not found in stock table`);
      warnings.push({
        nodeName: Array.from(mat.nodeNames).join(', '),
        materialCode: code,
        required: Math.round(mat.requiredQuantity * 100) / 100,
        available: 0,
        shortage: Math.round(mat.requiredQuantity * 100) / 100,
        unit: mat.unit,
        error: 'Material not found in stock'
      });
    }
  }
  
  if (warnings.length > 0) {
    console.warn(`⚠️  ${warnings.length} material shortage(s) detected (non-blocking)`);
  }
  
  return warnings;
}

/**
 * Get default work schedule from master-data (database)
 * ✅ FAZ 1A-1: Removed hardcoded schedules, now fetches from mes.settings
 * 
 * @param {Object} trx - Database transaction
 * @param {string} dayName - Day name (monday, tuesday, etc.)
 * @param {string} shiftNo - Shift number for shift-based schedules (default: '1')
 * @returns {Promise<Array>} Schedule blocks [{ type: 'work'|'break', start: 'HH:MM', end: 'HH:MM' }]
 */
export async function getDefaultWorkSchedule(trx, dayName, shiftNo = '1') {
  try {
    // Fetch master-data from database
    const result = await trx('mes.settings')
      .where('key', 'master-data')
      .first();
    
    if (!result || !result.value) {
      console.warn('⚠️  No master-data found in mes.settings, returning empty schedule');
      return [];
    }
    
    // Parse master-data (handle both JSON string and object)
    const masterData = typeof result.value === 'string' 
      ? JSON.parse(result.value) 
      : result.value;
    
    const timeSettings = masterData.timeSettings;
    if (!timeSettings) {
      console.warn('⚠️  No timeSettings in master-data');
      return [];
    }
    
    // Return schedule based on workType
    if (timeSettings.workType === 'fixed') {
      // Fixed schedule: same for all workers
      const blocks = timeSettings.fixedBlocks?.[dayName] || [];
      console.log(`🔍 DEBUG: dayName="${dayName}", available days:`, Object.keys(timeSettings.fixedBlocks || {}));
      console.log(`📅 Fixed schedule for ${dayName}: ${blocks.length} blocks`);
      return blocks;
    } else if (timeSettings.workType === 'shift') {
      // Shift-based schedule: different per shift/lane
      
      // Preferred structure: shiftByLane (most granular)
      if (timeSettings.shiftByLane && timeSettings.shiftByLane[shiftNo]) {
        const blocks = timeSettings.shiftByLane[shiftNo][dayName] || [];
        console.log(`📅 Shift ${shiftNo} schedule for ${dayName}: ${blocks.length} blocks (shiftByLane)`);
        return blocks;
      }
      
      // Fallback: shiftBlocks (legacy structure)
      const key = `shift-${dayName}`;
      const allBlocks = timeSettings.shiftBlocks?.[key] || [];
      
      // Filter by lane index (shiftNo - 1)
      const laneIndex = parseInt(shiftNo, 10) - 1;
      const blocks = allBlocks.filter(b => 
        typeof b.laneIndex === 'number' ? b.laneIndex === laneIndex : true
      );
      console.log(`📅 Shift ${shiftNo} schedule for ${dayName}: ${blocks.length} blocks (legacy shiftBlocks)`);
      return blocks;
    }
    
    console.warn('⚠️  Unknown workType in timeSettings:', timeSettings.workType);
    return [];
  } catch (error) {
    console.error('❌ Error fetching default work schedule:', error);
    return [];
  }
}

/**
 * Check if a given date is a holiday
 * ✅ FAZ 1A-2: Holiday system integration
 * 
 * @param {Object} trx - Database transaction
 * @param {Date} date - Date to check
 * @returns {Promise<Object|null>} Holiday object if found, null otherwise
 */
export async function isHoliday(trx, date) {
  try {
    // Get company timezone
    const tzResult = await trx('mes.settings')
      .where('key', 'company-timezone')
      .first();
    
    const timezone = tzResult && tzResult.value 
      ? (typeof tzResult.value === 'string' ? JSON.parse(tzResult.value).timezone : tzResult.value.timezone)
      : 'Europe/Istanbul';
    
    // Convert date to company timezone for comparison
    const checkDate = new Date(date);
    // For now, use UTC comparison (timezone conversion would require moment-timezone or date-fns-tz)
    // TODO: Implement proper timezone conversion
    const checkYear = checkDate.getUTCFullYear();
    const checkMonth = checkDate.getUTCMonth();
    const checkDay = checkDate.getUTCDate();
    
    // Fetch company-holidays from database
    const result = await trx('mes.settings')
      .where('key', 'company-holidays')
      .first();
    
    if (!result || !result.value) {
      return null; // No holidays configured
    }
    
    // Parse holidays data (handle both JSON string and object)
    const data = typeof result.value === 'string' 
      ? JSON.parse(result.value) 
      : result.value;
    
    const holidays = data.holidays || [];
    
    // Check if date falls within any holiday period
    const holiday = holidays.find(h => {
      const start = new Date(h.startDate);
      const end = new Date(h.endDate);
      
      // Get UTC date components for comparison
      const startYear = start.getUTCFullYear();
      const startMonth = start.getUTCMonth();
      const startDay = start.getUTCDate();
      
      const endYear = end.getUTCFullYear();
      const endMonth = end.getUTCMonth();
      const endDay = end.getUTCDate();
      
      // Compare dates using UTC components
      const checkDateNum = checkYear * 10000 + checkMonth * 100 + checkDay;
      const startDateNum = startYear * 10000 + startMonth * 100 + startDay;
      const endDateNum = endYear * 10000 + endMonth * 100 + endDay;
      
      return checkDateNum >= startDateNum && checkDateNum <= endDateNum;
    });
    
    return holiday || null;
  } catch (error) {
    console.error('❌ Error checking holiday:', error);
    return null;
  }
}

/**
 * Get work schedule for a specific date (considers holidays and worker personal schedule)
 * ✅ FAZ 1A-2: Combines holiday system with worker schedules
 * 
 * Worker Schedule Logic:
 * - mode='personal' → Worker'ın kendi blocks'ları kullanılır
 * - mode='company' → Master-data'dan shiftNo ile schedule çekilir (getDefaultWorkSchedule)
 * 
 * @param {Object} trx - Database transaction
 * @param {Date} date - Date to get schedule for
 * @param {Object} worker - Worker object (optional, for personal schedule)
 * @returns {Promise<Array>} Schedule blocks for the day
 */
export async function getWorkScheduleForDate(trx, date, worker = null) {
  const dayOfWeek = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][date.getDay()];
  
  // 1. Check if it's a holiday
  const holiday = await isHoliday(trx, date);
  
  if (holiday) {
    if (!holiday.isWorkingDay) {
      console.log(`🎉 Holiday: ${holiday.name} (${holiday.date}) - No work scheduled`);
      return []; // No work on this holiday
    }
    
    if (holiday.workHours && Array.isArray(holiday.workHours)) {
      console.log(`🎉 Holiday: ${holiday.name} (${holiday.date}) - Custom hours`);
      return holiday.workHours; // Custom holiday hours (e.g., half-day)
    }
  }
  
  // 2. Get worker's schedule based on mode
  if (worker?.personalSchedule) {
    const personalSchedule = typeof worker.personalSchedule === 'string'
      ? JSON.parse(worker.personalSchedule)
      : worker.personalSchedule;
    
    // Mode 'personal': Use worker's personal blocks
    if (personalSchedule.mode === 'personal' && personalSchedule.blocks) {
      const blocks = personalSchedule.blocks[dayOfWeek] || [];
      console.log(`👤 Using worker personal schedule for ${dayOfWeek}: ${blocks.length} blocks`);
      return blocks;
    }
    
    // Mode 'company': Use master-data with shiftNo
    if (personalSchedule.mode === 'company') {
      const shiftNo = personalSchedule.shiftNo || '1';
      const blocks = await getDefaultWorkSchedule(trx, dayOfWeek, shiftNo);
      console.log(`🏢 Using company schedule for ${dayOfWeek}, shift ${shiftNo}: ${blocks.length} blocks`);
      return blocks;
    }
  }
  
  // 3. Fallback: No worker schedule, use company default (shift 1)
  const blocks = await getDefaultWorkSchedule(trx, dayOfWeek, '1');
  console.log(`🏢 Using company default schedule for ${dayOfWeek}: ${blocks.length} blocks`);
  return blocks;
}

/**
 * Find next working day (skip holidays and weekends)
 * ✅ FAZ 1A-2: Smart date navigation with holiday awareness
 * 
 * @param {Object} trx - Database transaction
 * @param {Date} startDate - Starting date (will check from next day)
 * @param {Object} worker - Worker object (for schedule check)
 * @param {number} maxDaysToCheck - Maximum days to search (default: 30)
 * @returns {Promise<Date|null>} Next working day or null if not found
 */
export async function findNextWorkingDay(trx, startDate, worker = null, maxDaysToCheck = 30) {
  let currentDate = new Date(startDate);
  currentDate.setDate(currentDate.getDate() + 1); // Start from next day
  
  for (let i = 0; i < maxDaysToCheck; i++) {
    const schedule = await getWorkScheduleForDate(trx, currentDate, worker);
    
    if (schedule.length > 0) {
      // Found a day with work schedule
      console.log(`✅ Next working day found: ${currentDate.toISOString().split('T')[0]}`);
      return new Date(currentDate); // Return a copy
    }
    
    // Move to next day
    currentDate.setDate(currentDate.getDate() + 1);
  }
  
  console.warn(`⚠️  No working day found in next ${maxDaysToCheck} days from ${startDate.toISOString().split('T')[0]}`);
  return null;
}

/**
 * Helper function: Calculate end time considering breaks and work schedule
 * ✅ FAZ 1B: Async version with multi-day support, holiday/absence checking
 * 
 * Skips break periods, non-work hours, holidays, and worker absences
 * Automatically moves to next working day when needed
 * 
 * @param {Object} trx - Database transaction
 * @param {Date} startTime - Task start time
 * @param {number} durationInMinutes - Task duration in minutes
 * @param {Object} worker - Worker object with personalSchedule and absences
 * @returns {Promise<Date>} Calculated end time
 */
export async function calculateEndTimeWithBreaks(trx, startTime, durationInMinutes, worker) {
  let remainingDuration = durationInMinutes;
  let currentTime = new Date(startTime);
  
  // Safety check: max 365 days to prevent infinite loops
  const maxIterations = 365;
  let iterations = 0;
  
  while (remainingDuration > 0 && iterations < maxIterations) {
    iterations++;
    
    // ✅ FAZ 1B-1: Get work schedule for current date
    const scheduleBlocks = await getWorkScheduleForDate(trx, currentTime, worker);
    
    if (!scheduleBlocks || scheduleBlocks.length === 0) {
      // No work blocks for this day (holiday or no schedule)
      // ✅ FAZ 1B-2: Find next working day
      const nextWorkingDay = await findNextWorkingDay(trx, currentTime, worker);
      
      if (!nextWorkingDay) {
        console.error('❌ No working day found within 365 days!');
        // Fallback: just add remaining time
        return new Date(currentTime.getTime() + remainingDuration * 60000);
      }
      
      currentTime = nextWorkingDay;
      continue; // Re-check schedule for new day
    }
    
    // Get work blocks sorted by start time
    // ✅ FIX: Handle both 'start'/'end' and 'startTime'/'endTime' formats
    const workBlocks = scheduleBlocks
      .filter(b => b.type === 'work' && (b.start || b.startTime) && (b.end || b.endTime))
      .map(b => {
        const startStr = b.start || b.startTime;
        const endStr = b.end || b.endTime;
        const [startHour, startMin] = startStr.split(':').map(Number);
        const [endHour, endMin] = endStr.split(':').map(Number);
        return {
          startHour,
          startMin,
          endHour,
          endMin,
          startMinutes: startHour * 60 + startMin,
          endMinutes: endHour * 60 + endMin
        };
      })
      .sort((a, b) => a.startMinutes - b.startMinutes);
    
    if (workBlocks.length === 0) {
      // No work blocks today - move to next day
      const nextWorkingDay = await findNextWorkingDay(trx, currentTime, worker);
      if (!nextWorkingDay) {
        return new Date(currentTime.getTime() + remainingDuration * 60000);
      }
      currentTime = nextWorkingDay;
      continue;
    }
    
    const hour = currentTime.getHours();
    const minute = currentTime.getMinutes();
    const currentMinutes = hour * 60 + minute;
    
    // Find current or next work block
    let currentBlock = null;
    let nextBlock = null;
    
    for (const wb of workBlocks) {
      if (currentMinutes >= wb.startMinutes && currentMinutes < wb.endMinutes) {
        currentBlock = wb;
        break;
      } else if (currentMinutes < wb.startMinutes) {
        nextBlock = wb;
        break;
      }
    }
    
    if (currentBlock) {
      // We're in a work block - calculate how much time we can work here
      const blockEndMinutes = currentBlock.endMinutes;
      const workableMinutes = blockEndMinutes - currentMinutes;
      
      if (remainingDuration <= workableMinutes) {
        // Task finishes in this block
        currentTime = new Date(currentTime.getTime() + remainingDuration * 60000);
        remainingDuration = 0;
      } else {
        // Task continues beyond this block
        remainingDuration -= workableMinutes;
        // Move to end of this block
        currentTime.setHours(currentBlock.endHour, currentBlock.endMin, 0, 0);
        
        // Find next work block
        const nextBlockIndex = workBlocks.findIndex(wb => wb.startMinutes > currentBlock.endMinutes);
        if (nextBlockIndex === -1) {
          // No more work blocks today - move to next working day
          currentTime.setDate(currentTime.getDate() + 1);
          currentTime.setHours(0, 0, 0, 0); // Reset to midnight, will find first block in next iteration
        } else {
          // Move to next work block
          const nextWb = workBlocks[nextBlockIndex];
          currentTime.setHours(nextWb.startHour, nextWb.startMin, 0, 0);
        }
      }
    } else if (nextBlock) {
      // We're in a break or before schedule - jump to next work block
      currentTime.setHours(nextBlock.startHour, nextBlock.startMin, 0, 0);
    } else {
      // Past all work blocks today - move to next working day
      currentTime.setDate(currentTime.getDate() + 1);
      currentTime.setHours(0, 0, 0, 0); // Will find first block in next iteration
    }
  }
  
  if (iterations >= maxIterations) {
    console.error('⚠️  calculateEndTimeWithBreaks: Maximum iterations reached!');
  }
  
  return currentTime;
}

/**
 * Helper: Get plan with all nodes and related data
 */
export async function getPlanWithNodes(planId) {
  const plan = await db('mes.production_plans')
    .where('id', planId)
    .first();
  
  if (!plan) return null;
  
  // Get nodes
  const nodes = await db('mes.production_plan_nodes as n')
    .select('n.*')  // This includes x and y columns
    .where('n.planId', planId)
    .orderBy('n.sequenceOrder');
  
  // For each node, fetch materials, stations, and predecessors
  for (const node of nodes) {
    // Get material inputs (use VARCHAR nodeId, not INTEGER id)
    const materialInputs = await db('mes.node_material_inputs')
      .where('nodeId', node.nodeId)
      .select('materialCode', 'requiredQuantity', 'unitRatio', 'isDerived');
    
    // Enrich derived materials with source node info
    for (const mat of materialInputs) {
      if (mat.isDerived) {
        // Find which predecessor produces this material
        const predecessorNodeIds = await db('mes.node_predecessors')
          .where('nodeId', node.nodeId)
          .pluck('predecessorNodeId');
        
        for (const predNodeId of predecessorNodeIds) {
          const predNode = await db('mes.production_plan_nodes')
            .where('nodeId', predNodeId)
            .first();
          
          if (predNode && predNode.outputCode === mat.materialCode) {
            mat.derivedFrom = predNodeId;
            break;
          }
        }
      }
    }
    
    node.materialInputs = materialInputs;
    
    // Get assigned stations
    const stations = await db('mes.node_stations')
      .where('nodeId', node.nodeId)
      .select('stationId', 'priority')
      .orderBy('priority');
    
    node.assignedStations = stations;
    
    // Get predecessors
    const predecessors = await db('mes.node_predecessors')
      .where('nodeId', node.nodeId)
      .pluck('predecessorNodeId');
    
    node.predecessors = predecessors;
    
    // Enrich output code with material info if it exists in materials table
    if (node.outputCode) {
      const material = await db('materials.materials')
        .where('code', node.outputCode)
        .first();
      
      if (material) {
        node._outputMaterialId = material.id;
        node._outputName = material.name;
        node._outputSelectionMode = 'existing';
      } else {
        // Code exists but not in materials table (new output not yet created)
        node._outputSelectionMode = 'new';
        node._isNewOutput = true;
      }
    }
  }
  
  // Return plan with frontend-compatible field names
  return { 
    ...plan, 
    name: plan.planName,  // Alias for frontend compatibility
    nodes 
  };
}

/**
 * Calculate pre-production reserved amounts for a work package
 * Takes into account expected defect rate and input/output ratio
 * 
 * Example:
 * - Output: 100 units, Defect Rate: 1%
 * - Expected defects: 100 * 0.01 = 1 unit (in output)
 * - Material M-008: 2 units input → 1 unit output (ratio = 2)
 * - Required input for 100 output: 100 * 2 = 200 units
 * - Defect input: 1 * 2 = 2 units
 * - Total reserved: 200 + 2 = 202 units
 * 
 * @param {Object} node - Execution graph node with materialInputs and outputQty
 * @param {number} expectedDefectRate - Expected defect rate from operation (percentage)
 * @param {number} planQuantity - Production plan quantity multiplier
 * @returns {Object} Object with materialCode as key and reserved quantity as value
 */
export function calculatePreProductionReservedAmount(node, expectedDefectRate = 0, planQuantity = 1) {
  const preProductionReservedAmount = {};
  
  if (!node || !node.materialInputs || !Array.isArray(node.materialInputs)) {
    console.warn(`⚠️ calculatePreProductionReservedAmount: node ${node?.id} has no materialInputs!`);
    console.warn(`   node.materialInputs:`, node?.materialInputs);
    return preProductionReservedAmount;
  }
  
  // Get output quantity (planned output for this operation)
  const outputQty = parseFloat(node.outputQty) || 0;
  
  if (outputQty <= 0) {
    console.warn(`Node ${node.nodeId} has no outputQty, cannot calculate input/output ratio. Using direct input quantities.`);
    // Fallback: use input quantities directly
    node.materialInputs.forEach(material => {
      // Material schema: materialCode, requiredQuantity (legacy code/qty still supported for materials)
      const materialCode = material.materialCode || material.code;
      const requiredQty = (material.requiredQuantity || material.qty || material.required || 0) * planQuantity;
      if (materialCode && requiredQty > 0) {
        preProductionReservedAmount[materialCode] = 
          (preProductionReservedAmount[materialCode] || 0) + requiredQty;
      }
    });
    return preProductionReservedAmount;
  }
  
  // Calculate scaled output based on plan quantity
  const scaledOutputQty = outputQty * planQuantity;
  
  // Ensure defect rate is a valid number between 0 and 100
  const defectRate = Math.max(0, Math.min(100, parseFloat(expectedDefectRate) || 0));
  
  // Calculate expected defects in OUTPUT units
  const expectedDefectsInOutput = scaledOutputQty * (defectRate / 100);
  
  console.log(`📊 Rehin Calculation for node ${node.nodeId}:`);
  console.log(`   Output: ${scaledOutputQty}, Defect Rate: ${defectRate}%, Expected Defects: ${expectedDefectsInOutput}`);
  
  // Process each input material
  node.materialInputs.forEach(material => {
    // Material schema: materialCode, requiredQuantity (legacy code/qty still supported)
    const materialCode = material.materialCode || material.code;
    const inputQtyPerOperation = material.requiredQuantity || material.qty || material.required || 0;
    
    if (!materialCode || inputQtyPerOperation <= 0) return;
    
    // Calculate input/output ratio for THIS material
    // Example: If 2 units of M-008 produces 1 unit of output, ratio = 2
    const inputOutputRatio = inputQtyPerOperation / outputQty;
    
    // Required input for planned good output
    const requiredInputForGoodOutput = scaledOutputQty * inputOutputRatio;
    
    // Additional input needed for expected defects
    const additionalInputForDefects = expectedDefectsInOutput * inputOutputRatio;
    
    // Total reserved = normal requirement + defect buffer
    const totalReserved = requiredInputForGoodOutput + additionalInputForDefects;
    
    // Round up to avoid fractional units
    const reservedQty = Math.ceil(totalReserved);
    
    console.log(`   Material ${materialCode}:`);
    console.log(`      Input/Output Ratio: ${inputOutputRatio.toFixed(4)} (${inputQtyPerOperation}/${outputQty})`);
    console.log(`      Required for good output: ${requiredInputForGoodOutput.toFixed(2)}`);
    console.log(`      Additional for defects: ${additionalInputForDefects.toFixed(2)}`);
    console.log(`      Total reserved: ${reservedQty}`);
    
    // Accumulate if material appears multiple times
    preProductionReservedAmount[materialCode] = 
      (preProductionReservedAmount[materialCode] || 0) + reservedQty;
  });
  
  return preProductionReservedAmount;
}

/**
 * Calculate planned output for a work package
 * 
 * @param {Object} node - Execution graph node with output information
 * @param {number} planQuantity - Production plan quantity multiplier
 * @returns {Object} Object with materialCode as key and planned quantity as value
 */
export function calculatePlannedOutput(node, planQuantity = 1) {
  const plannedOutput = {};
  
  if (!node) return plannedOutput;
  
  // Check if node has output material (semi-finished product or final product)
  if (node.outputCode && node.outputQty) {
    const outputQty = parseFloat(node.outputQty) || 0;
    if (outputQty > 0) {
      plannedOutput[node.outputCode] = outputQty * planQuantity;
    }
  }
  
  return plannedOutput;
}
