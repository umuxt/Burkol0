/**
 * Launch Service
 * Handles production plan launch with FIFO scheduling algorithm
 * 
 * Launch Algorithm Steps:
 * 1. Validate plan exists and is ready
 * 2. Load nodes and build dependency graph
 * 3. Topological sort for execution order
 * 4. For each node: Find worker + substation + calculate timing
 * 5. Create worker assignments
 * 6. Reserve substations
 * 7. Update plan status
 */

import db from '#db/connection';
import {
  calculatePreProductionReservedAmount,
  calculatePlannedOutput
} from './materialService.js';

// Helper: Calculate earliest available slot in a schedule
function calculateEarliestSlot(schedule, afterTime) {
  if (schedule.length === 0) return afterTime;
  
  const sorted = schedule.sort((a, b) => b.end - a.end);
  const lastEnd = sorted[0].end;
  
  return lastEnd > afterTime ? lastEnd : afterTime;
}

// Helper: Find earliest available substation from station options
async function findEarliestSubstation(trx, stationOptions, scheduleMap, afterTime) {
  let bestSubstation = null;
  let earliestTime = null;
  
  for (const stOpt of stationOptions) {
    const substations = await trx('mes.substations')
      .where('stationId', stOpt.stationId)
      .where('isActive', true);
    
    for (const sub of substations) {
      let dbEnd = afterTime;
      if (sub.currentExpectedEnd) {
        const dbEndTime = new Date(sub.currentExpectedEnd);
        if (dbEndTime > afterTime) {
          dbEnd = dbEndTime;
        }
      }
      
      const memSchedule = scheduleMap.get(sub.id) || [];
      const memEnd = calculateEarliestSlot(memSchedule, afterTime);
      
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

// Helper: Get shift blocks for specific day
function getShiftBlocksForDay(schedule, dayOfWeek) {
  if (!schedule) return [];
  
  if (Array.isArray(schedule.shifts)) {
    const shift = schedule.shifts.find(s => s.id === '1');
    return shift?.blocks?.[dayOfWeek] || [];
  }
  
  const aggregated = schedule.shiftBlocks?.[`shift-${dayOfWeek}`];
  if (Array.isArray(aggregated)) return aggregated;
  
  const byLane = schedule.shiftByLane?.['1']?.[dayOfWeek];
  if (Array.isArray(byLane)) return byLane;
  
  return [];
}

// Helper: Get default work schedule from database
async function getDefaultWorkSchedule(trx, dayName, shiftNo = '1') {
  try {
    const result = await trx('mes.settings')
      .where('key', 'master-data')
      .first();
    
    if (!result || !result.value) {
      return [];
    }
    
    const masterData = typeof result.value === 'string' 
      ? JSON.parse(result.value) 
      : result.value;
    
    const timeSettings = masterData.timeSettings;
    if (!timeSettings) {
      return [];
    }
    
    if (timeSettings.workType === 'fixed') {
      return timeSettings.fixedBlocks?.[dayName] || [];
    } else if (timeSettings.workType === 'shift') {
      if (timeSettings.shiftByLane && timeSettings.shiftByLane[shiftNo]) {
        return timeSettings.shiftByLane[shiftNo][dayName] || [];
      }
      const key = `shift-${dayName}`;
      const allBlocks = timeSettings.shiftBlocks?.[key] || [];
      const laneIndex = parseInt(shiftNo, 10) - 1;
      return allBlocks.filter(b => 
        typeof b.laneIndex === 'number' ? b.laneIndex === laneIndex : true
      );
    }
    
    return [];
  } catch (error) {
    console.error('❌ Error fetching default work schedule:', error);
    return [];
  }
}

// Helper: Check if date is a holiday
async function isHoliday(trx, date) {
  try {
    const checkDate = new Date(date);
    const checkYear = checkDate.getUTCFullYear();
    const checkMonth = checkDate.getUTCMonth();
    const checkDay = checkDate.getUTCDate();
    
    const result = await trx('mes.settings')
      .where('key', 'company-holidays')
      .first();
    
    if (!result || !result.value) {
      return null;
    }
    
    const data = typeof result.value === 'string' 
      ? JSON.parse(result.value) 
      : result.value;
    
    const holidays = data.holidays || [];
    
    const holiday = holidays.find(h => {
      const start = new Date(h.startDate);
      const end = new Date(h.endDate);
      
      const checkDateNum = checkYear * 10000 + checkMonth * 100 + checkDay;
      const startDateNum = start.getUTCFullYear() * 10000 + start.getUTCMonth() * 100 + start.getUTCDate();
      const endDateNum = end.getUTCFullYear() * 10000 + end.getUTCMonth() * 100 + end.getUTCDate();
      
      return checkDateNum >= startDateNum && checkDateNum <= endDateNum;
    });
    
    return holiday || null;
  } catch (error) {
    console.error('❌ Error checking holiday:', error);
    return null;
  }
}

// Helper: Get work schedule for a specific date
async function getWorkScheduleForDate(trx, date, worker = null) {
  const dayOfWeek = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][date.getDay()];
  
  const holiday = await isHoliday(trx, date);
  
  if (holiday) {
    if (!holiday.isWorkingDay) {
      return [];
    }
    if (holiday.workHours && Array.isArray(holiday.workHours)) {
      return holiday.workHours;
    }
  }
  
  if (worker?.personalSchedule) {
    const personalSchedule = typeof worker.personalSchedule === 'string'
      ? JSON.parse(worker.personalSchedule)
      : worker.personalSchedule;
    
    if (personalSchedule.mode === 'personal' && personalSchedule.blocks) {
      return personalSchedule.blocks[dayOfWeek] || [];
    }
    
    if (personalSchedule.mode === 'company') {
      const shiftNo = personalSchedule.shiftNo || '1';
      return await getDefaultWorkSchedule(trx, dayOfWeek, shiftNo);
    }
  }
  
  return await getDefaultWorkSchedule(trx, dayOfWeek, '1');
}

// Helper: Find next working day
async function findNextWorkingDay(trx, startDate, worker = null, maxDaysToCheck = 30) {
  let currentDate = new Date(startDate);
  currentDate.setDate(currentDate.getDate() + 1);
  
  for (let i = 0; i < maxDaysToCheck; i++) {
    const schedule = await getWorkScheduleForDate(trx, currentDate, worker);
    
    if (schedule.length > 0) {
      return new Date(currentDate);
    }
    
    currentDate.setDate(currentDate.getDate() + 1);
  }
  
  return null;
}

// Helper: Adjust start time for schedule
function adjustStartTimeForSchedule(startTime, scheduleBlocks) {
  if (!scheduleBlocks || scheduleBlocks.length === 0) {
    return startTime;
  }
  
  const hour = startTime.getHours();
  const minute = startTime.getMinutes();
  const timeInMinutes = hour * 60 + minute;
  
  for (const block of scheduleBlocks) {
    const startStr = block.start || block.startTime;
    const endStr = block.end || block.endTime;
    if (block.type !== 'work' || !startStr || !endStr) continue;
    
    const [startHour, startMin] = startStr.split(':').map(Number);
    const [endHour, endMin] = endStr.split(':').map(Number);
    const blockStart = startHour * 60 + startMin;
    const blockEnd = endHour * 60 + endMin;
    
    if (timeInMinutes >= blockStart && timeInMinutes < blockEnd) {
      return startTime;
    }
  }
  
  const workBlocks = scheduleBlocks
    .filter(b => b.type === 'work' && (b.start || b.startTime) && (b.end || b.endTime))
    .map(b => {
      const startStr = b.start || b.startTime;
      const [startHour, startMin] = startStr.split(':').map(Number);
      return {
        startMinutes: startHour * 60 + startMin,
        startHour,
        startMin
      };
    })
    .sort((a, b) => a.startMinutes - b.startMinutes);
  
  for (const wb of workBlocks) {
    if (wb.startMinutes > timeInMinutes) {
      const adjusted = new Date(startTime);
      adjusted.setHours(wb.startHour, wb.startMin, 0, 0);
      return adjusted;
    }
  }
  
  if (workBlocks.length > 0) {
    const nextDay = new Date(startTime);
    nextDay.setDate(nextDay.getDate() + 1);
    nextDay.setHours(workBlocks[0].startHour, workBlocks[0].startMin, 0, 0);
    return nextDay;
  }
  
  return startTime;
}

// Helper: Calculate end time with breaks
async function calculateEndTimeWithBreaks(trx, startTime, durationInMinutes, worker) {
  let remainingDuration = durationInMinutes;
  let currentTime = new Date(startTime);
  
  const maxIterations = 365;
  let iterations = 0;
  
  while (remainingDuration > 0 && iterations < maxIterations) {
    iterations++;
    
    const scheduleBlocks = await getWorkScheduleForDate(trx, currentTime, worker);
    
    if (!scheduleBlocks || scheduleBlocks.length === 0) {
      const nextWorkingDay = await findNextWorkingDay(trx, currentTime, worker);
      
      if (!nextWorkingDay) {
        return new Date(currentTime.getTime() + remainingDuration * 60000);
      }
      
      currentTime = nextWorkingDay;
      continue;
    }
    
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
      const blockEndMinutes = currentBlock.endMinutes;
      const workableMinutes = blockEndMinutes - currentMinutes;
      
      if (remainingDuration <= workableMinutes) {
        currentTime = new Date(currentTime.getTime() + remainingDuration * 60000);
        remainingDuration = 0;
      } else {
        remainingDuration -= workableMinutes;
        currentTime.setHours(currentBlock.endHour, currentBlock.endMin, 0, 0);
        
        const nextBlockIndex = workBlocks.findIndex(wb => wb.startMinutes > currentBlock.endMinutes);
        if (nextBlockIndex === -1) {
          currentTime.setDate(currentTime.getDate() + 1);
          currentTime.setHours(0, 0, 0, 0);
        } else {
          const nextWb = workBlocks[nextBlockIndex];
          currentTime.setHours(nextWb.startHour, nextWb.startMin, 0, 0);
        }
      }
    } else if (nextBlock) {
      currentTime.setHours(nextBlock.startHour, nextBlock.startMin, 0, 0);
    } else {
      currentTime.setDate(currentTime.getDate() + 1);
      currentTime.setHours(0, 0, 0, 0);
    }
  }
  
  return currentTime;
}

// Helper: Check if worker is absent
function isWorkerAbsent(worker, date) {
  if (!worker || !worker.absences || !Array.isArray(worker.absences)) {
    return null;
  }
  
  const checkDate = date.getTime ? date.getTime() : new Date(date).getTime();
  
  for (const absence of worker.absences) {
    if (!absence.startDate || !absence.endDate) {
      continue;
    }
    
    const start = new Date(absence.startDate).setHours(0, 0, 0, 0);
    const end = new Date(absence.endDate).setHours(23, 59, 59, 999);
    
    if (checkDate >= start && checkDate <= end) {
      return absence;
    }
  }
  
  return null;
}

// Helper: Check if time is within shift blocks
function isWithinShiftBlocks(startTime, durationMinutes, shiftBlocks) {
  if (shiftBlocks.length === 0) return false;
  
  const startHour = startTime.getHours() + startTime.getMinutes() / 60;
  const endHour = startHour + durationMinutes / 60;
  
  for (const block of shiftBlocks) {
    if (!block.start || !block.end) continue;
    
    const [blockStartH, blockStartM] = block.start.split(':').map(Number);
    const [blockEndH, blockEndM] = block.end.split(':').map(Number);
    
    const blockStart = blockStartH + blockStartM / 60;
    const blockEnd = blockEndH + blockEndM / 60;
    
    if (startHour >= blockStart && endHour <= blockEnd) {
      return true;
    }
  }
  
  return false;
}

// Helper: Find worker with shift check
async function findWorkerWithShiftCheck(trx, requiredSkills, stationId, startTime, duration, workerSchedule = new Map()) {
  const dayOfWeek = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][startTime.getDay()];
  
  let query = trx('mes.workers').where('isActive', true);
  
  if (requiredSkills && requiredSkills.length > 0) {
    requiredSkills.forEach(skill => {
      query = query.whereRaw(`skills::jsonb @> ?::jsonb`, [JSON.stringify([skill])]);
    });
  }
  
  const workers = await query;
  
  const eligibleWorkers = workers.filter(w => {
    const status = w.status || 'available';
    return status !== 'inactive' && status !== 'break';
  });
  
  if (eligibleWorkers.length === 0) {
    return null;
  }
  
  let hasValidShiftConfig = false;
  
  for (const worker of eligibleWorkers) {
    const workerQueue = workerSchedule.get(worker.id) || [];
    const workerAvailableAt = workerQueue.length > 0
      ? new Date(workerQueue[workerQueue.length - 1].end.getTime() + 1000)
      : startTime;
    
    const actualStart = new Date(Math.max(workerAvailableAt.getTime(), startTime.getTime()));
    const proposedEnd = new Date(actualStart.getTime() + duration * 60000);
    
    const absences = typeof worker.absences === 'string' ? JSON.parse(worker.absences) : (worker.absences || []);
    const workerWithAbsences = { ...worker, absences };
    
    if (isWorkerAbsent(workerWithAbsences, actualStart)) {
      continue;
    }
    
    const hasConflict = workerQueue.some(task => {
      return (actualStart < task.end && proposedEnd > task.start);
    });
    
    if (hasConflict) {
      continue;
    }
    
    const schedule = typeof worker.personalSchedule === 'string' 
      ? JSON.parse(worker.personalSchedule) 
      : worker.personalSchedule;
    
    const actualDayOfWeek = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][actualStart.getDay()];
    const shiftBlocks = getShiftBlocksForDay(schedule, actualDayOfWeek);
    
    if (shiftBlocks.length > 0) {
      hasValidShiftConfig = true;
    }
    
    if (isWithinShiftBlocks(actualStart, duration, shiftBlocks)) {
      return worker;
    }
  }
  
  // Fallback: select least busy worker
  const workerAvailability = eligibleWorkers.map(worker => {
    const workerQueue = workerSchedule.get(worker.id) || [];
    const availableAt = workerQueue.length > 0
      ? new Date(workerQueue[workerQueue.length - 1].end.getTime() + 1000)
      : startTime;
    return { worker, availableAt };
  });
  
  workerAvailability.sort((a, b) => a.availableAt.getTime() - b.availableAt.getTime());
  
  return workerAvailability[0]?.worker || null;
}

// Helper: Topological sort using Kahn's algorithm
function topologicalSort(nodes, predecessors) {
  const graph = new Map();
  const inDegree = new Map();
  
  nodes.forEach(n => {
    graph.set(n.nodeId, []);
    inDegree.set(n.nodeId, 0);
  });
  
  predecessors.forEach(p => {
    graph.get(p.predecessorNodeId).push(p.nodeId);
    inDegree.set(p.nodeId, inDegree.get(p.nodeId) + 1);
  });
  
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
  
  if (order.length !== nodes.length) {
    const missingNodes = nodes.filter(n => !order.includes(n.nodeId)).map(n => n.name);
    throw new Error(`Dependency cycle detected! Cannot process nodes: ${missingNodes.join(', ')}`);
  }
  
  return order;
}

// Helper: Validate materials for launch
async function validateMaterialsForLaunch(trx, planId, nodes, predecessors) {
  const warnings = [];
  
  // Aggregate material requirements
  const materialRequirements = new Map();
  
  for (const node of nodes) {
    if (!node.materialInputs || node.materialInputs.length === 0) continue;
    
    for (const mat of node.materialInputs) {
      if (mat.isDerived) continue;
      
      const existing = materialRequirements.get(mat.materialCode) || {
        requiredQuantity: 0,
        unit: mat.unit || 'adet',
        nodeNames: new Set()
      };
      
      existing.requiredQuantity += parseFloat(mat.requiredQuantity) || 0;
      existing.nodeNames.add(node.name);
      materialRequirements.set(mat.materialCode, existing);
    }
  }
  
  // Check stock for each material
  for (const [code, mat] of materialRequirements.entries()) {
    try {
      const stock = await trx('materials.materials')
        .where('code', code)
        .first();
      
      if (!stock) {
        warnings.push({
          nodeName: Array.from(mat.nodeNames).join(', '),
          materialCode: code,
          required: Math.round(mat.requiredQuantity * 100) / 100,
          available: 0,
          shortage: Math.round(mat.requiredQuantity * 100) / 100,
          unit: mat.unit,
          error: 'Material not found in stock'
        });
        continue;
      }
      
      const available = parseFloat(stock.stock) || 0;
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
  
  return warnings;
}

/**
 * Launch a production plan
 * @param {string} planId - Plan ID to launch
 * @returns {Promise<Object>} Launch result with assignments
 */
export async function launchProductionPlan(planId) {
  const trx = await db.transaction();
  
  try {
    // Lock tables to prevent concurrent launches
    await trx.raw('LOCK TABLE mes.worker_assignments IN EXCLUSIVE MODE');
    await trx.raw('LOCK TABLE mes.substations IN EXCLUSIVE MODE');
    
    console.log(`🔒 Acquired exclusive locks for launch of ${planId}`);
    
    // 1. Validate plan
    const plan = await trx('mes.production_plans')
      .where('id', planId)
      .where('status', 'production')
      .first();
    
    if (!plan) {
      await trx.rollback();
      return { error: 'Plan not found or already launched' };
    }
    
    console.log(`🚀 Launching production plan: ${planId}`);
    
    // 2. Load nodes and dependency graph
    const nodes = await trx('mes.production_plan_nodes')
      .where('planId', planId)
      .orderBy('sequenceOrder');
    
    // 2a. Load material inputs for each node
    const allMaterialInputs = await trx('mes.node_material_inputs')
      .whereIn('nodeId', nodes.map(n => n.nodeId));
    
    const uniqueMaterialCodes = [...new Set(allMaterialInputs.map(mi => mi.materialCode))];
    const materialsWithUnits = await trx('materials.materials')
      .select('code', 'unit')
      .whereIn('code', uniqueMaterialCodes);
    
    const materialUnitMap = new Map(materialsWithUnits.map(m => [m.code, m.unit]));
    
    // Calculate and update unitRatio for each material input
    const nodeOutputMap = new Map(nodes.map(n => [n.nodeId, parseFloat(n.outputQty) || 1]));
    
    for (const mi of allMaterialInputs) {
      const outputQty = nodeOutputMap.get(mi.nodeId) || 1;
      const reqQty = parseFloat(mi.requiredQuantity) || 0;
      const correctRatio = outputQty > 0 ? reqQty / outputQty : 1.0;
      
      if (Math.abs((mi.unitRatio || 1.0) - correctRatio) > 0.0001) {
        await trx('mes.node_material_inputs')
          .where('nodeId', mi.nodeId)
          .where('materialCode', mi.materialCode)
          .update({ unitRatio: correctRatio });
      }
      mi.unitRatio = correctRatio;
    }
    
    // Attach materialInputs to nodes
    nodes.forEach(node => {
      node.materialInputs = allMaterialInputs
        .filter(mi => mi.nodeId === node.nodeId)
        .map(mi => ({
          materialCode: mi.materialCode,
          requiredQuantity: parseFloat(mi.requiredQuantity) || 0,
          unitRatio: mi.unitRatio,
          unit: materialUnitMap.get(mi.materialCode) || node.outputUnit || 'adet',
          isDerived: mi.isDerived || false
        }));
    });
    
    const predecessors = await trx('mes.node_predecessors')
      .whereIn('nodeId', nodes.map(n => n.nodeId));
    
    // 3. Topological sort for execution order
    const executionOrder = topologicalSort(nodes, predecessors);
    
    // 4. Material validation (non-blocking warnings)
    const materialWarnings = await validateMaterialsForLaunch(trx, planId, nodes, predecessors);
    
    // 5. Initialize tracking maps
    const workerSchedule = new Map();
    const substationSchedule = new Map();
    const nodeCompletionTimes = new Map();
    const assignments = [];
    let queuedCount = 0;
    
    // Load existing worker assignments to prevent conflicts
    const existingAssignments = await trx('mes.worker_assignments')
      .select('workerId', 'substationId', 'estimatedStartTime', 'estimatedEndTime', 'sequenceNumber')
      .whereIn('status', ['pending', 'queued', 'in_progress', 'paused'])
      .orderBy('estimatedStartTime');
    
    existingAssignments.forEach(a => {
      const workerQueue = workerSchedule.get(a.workerId) || [];
      workerQueue.push({ 
        start: new Date(a.estimatedStartTime), 
        end: new Date(a.estimatedEndTime), 
        sequenceNumber: a.sequenceNumber 
      });
      workerSchedule.set(a.workerId, workerQueue);
      
      const subSchedule = substationSchedule.get(a.substationId) || [];
      subSchedule.push({ 
        start: new Date(a.estimatedStartTime), 
        end: new Date(a.estimatedEndTime) 
      });
      substationSchedule.set(a.substationId, subSchedule);
    });
    
    console.log(`📋 Loaded ${existingAssignments.length} existing assignments into schedule maps`);
    
    // 6. Process nodes in topological order
    for (const nodeId of executionOrder) {
      const node = nodes.find(n => n.nodeId === nodeId);
      
      // Calculate earliest start (wait for predecessors)
      const predecessorIds = predecessors
        .filter(p => p.nodeId === nodeId)
        .map(p => p.predecessorNodeId);
      
      let earliestStart = new Date();
      for (const predId of predecessorIds) {
        const predEnd = nodeCompletionTimes.get(predId);
        if (predEnd && predEnd > earliestStart) {
          earliestStart = predEnd;
        }
      }
      
      // Get station options
      const stationOptions = await trx('mes.node_stations')
        .where('nodeId', node.nodeId)
        .orderBy('priority');
      
      // Find earliest available substation
      const { substation, availableAt } = await findEarliestSubstation(
        trx,
        stationOptions,
        substationSchedule,
        earliestStart
      );
      
      if (!substation) {
        await trx.rollback();
        return { error: `No substation for node ${node.name}` };
      }
      
      // Get operation skills and defect rate
      const operation = await trx('mes.operations')
        .where('id', node.operationId)
        .first();
      
      const station = await trx('mes.stations')
        .where('id', substation.stationId)
        .first();
      
      const operationSkills = operation?.skills || [];
      const stationSkills = station?.subSkills || [];
      const requiredSkills = [...new Set([...operationSkills, ...stationSkills])];
      const expectedDefectRate = operation?.expectedDefectRate || 0;
      
      // Find worker with shift check
      const effectiveDuration = parseFloat(node.effectiveTime) || 0;
      
      const worker = await findWorkerWithShiftCheck(
        trx,
        requiredSkills,
        substation.stationId,
        availableAt,
        effectiveDuration,
        workerSchedule
      );
      
      if (!worker) {
        let skillNames = 'genel';
        if (requiredSkills.length > 0) {
          const skills = await trx('mes.skills')
            .whereIn('id', requiredSkills)
            .select('name');
          skillNames = skills.map(s => s.name).join(', ');
        }
        await trx.rollback();
        return { 
          error: `"${node.name}" işi için yetenek uyuşması sağlanan personel bulunamadı\n\nGerekli yetenekler: ${skillNames}` 
        };
      }
      
      // Calculate worker queue position
      const workerQueue = workerSchedule.get(worker.id) || [];
      const sequenceNumber = workerQueue.length + 1;
      
      // Determine actual start
      let workerAvailableAt = workerQueue.length > 0
        ? new Date(workerQueue[workerQueue.length - 1].end.getTime() + 1000)
        : availableAt;
      
      let earliestPossibleStart = new Date(Math.max(
        workerAvailableAt.getTime(),
        availableAt.getTime()
      ));
      
      const dayOfWeek = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][earliestPossibleStart.getDay()];
      
      const personalSchedule = typeof worker.personalSchedule === 'string'
        ? JSON.parse(worker.personalSchedule)
        : worker.personalSchedule;
      
      const scheduleBlocks = getShiftBlocksForDay(personalSchedule, dayOfWeek);
      
      let actualStart;
      if (scheduleBlocks.length === 0) {
        const shiftNo = personalSchedule?.shiftNo || '1';
        const defaultBlocks = await getDefaultWorkSchedule(trx, dayOfWeek, shiftNo);
        if (defaultBlocks.length > 0) {
          actualStart = adjustStartTimeForSchedule(earliestPossibleStart, defaultBlocks);
        } else {
          actualStart = earliestPossibleStart;
        }
      } else {
        actualStart = adjustStartTimeForSchedule(earliestPossibleStart, scheduleBlocks);
      }
      
      if (actualStart < workerAvailableAt) {
        actualStart = new Date(workerAvailableAt);
      }
      
      // Check if actualStart is a holiday
      if (await isHoliday(trx, actualStart)) {
        const nextWorkingDay = await findNextWorkingDay(trx, actualStart, worker);
        if (nextWorkingDay) {
          actualStart = nextWorkingDay;
        }
      }
      
      // Calculate end time with breaks
      const effectiveTimeMinutes = parseFloat(node.effectiveTime) || 0;
      const actualEnd = await calculateEndTimeWithBreaks(trx, actualStart, effectiveTimeMinutes, worker);
      
      const isQueued = sequenceNumber > 1;
      if (isQueued) queuedCount++;
      
      // Calculate pre-production reserved amount and planned output
      const planQuantity = plan.quantity || 1;
      const preProductionReservedAmount = calculatePreProductionReservedAmount(
        node,
        expectedDefectRate,
        planQuantity
      );
      const plannedOutput = calculatePlannedOutput(node, planQuantity);
      
      // Create worker assignment
      const [createdAssignment] = await trx('mes.worker_assignments')
        .insert({
          planId: planId,
          workOrderCode: plan.workOrderCode,
          nodeId: node.id,
          workerId: worker.id,
          substationId: substation.id,
          operationId: node.operationId,
          status: isQueued ? 'queued' : 'pending',
          nominalTime: parseInt(node.nominalTime) || null,
          effectiveTime: parseInt(node.effectiveTime) || null,
          estimatedStartTime: actualStart,
          estimatedEndTime: actualEnd,
          sequenceNumber: sequenceNumber,
          preProductionReservedAmount: Object.keys(preProductionReservedAmount).length > 0 
            ? JSON.stringify(preProductionReservedAmount) 
            : null,
          plannedOutput: Object.keys(plannedOutput).length > 0 
            ? JSON.stringify(plannedOutput) 
            : null,
          materialReservationStatus: 'pending',
          createdAt: trx.fn.now()
        })
        .returning('id');
      
      // Update node
      await trx('mes.production_plan_nodes')
        .where('id', node.id)
        .update({
          assignedWorkerId: worker.id,
          estimatedStartTime: actualStart,
          estimatedEndTime: actualEnd,
          updatedAt: trx.fn.now()
        });
      
      // Update schedules
      workerQueue.push({ start: actualStart, end: actualEnd, sequenceNumber });
      workerSchedule.set(worker.id, workerQueue);
      
      const subSchedule = substationSchedule.get(substation.id) || [];
      subSchedule.push({ start: actualStart, end: actualEnd });
      substationSchedule.set(substation.id, subSchedule);
      
      nodeCompletionTimes.set(node.nodeId, actualEnd);
      
      // Reserve substation for pending tasks
      if (!isQueued) {
        await trx('mes.substations')
          .where('id', substation.id)
          .update({
            status: 'reserved',
            currentAssignmentId: createdAssignment.id,
            assignedWorkerId: worker.id,
            currentOperation: node.operationId,
            reservedAt: trx.fn.now(),
            currentExpectedEnd: actualEnd,
            updatedAt: trx.fn.now()
          });
      }
      
      // Track for response
      assignments.push({
        nodeId: node.nodeId,
        nodeName: node.name,
        workerId: worker.id,
        workerName: worker.name,
        substationId: substation.id,
        substationName: substation.name,
        estimatedStart: actualStart,
        estimatedEnd: actualEnd,
        sequenceNumber,
        isQueued,
        preProductionReservedAmount: Object.keys(preProductionReservedAmount).length > 0 
          ? preProductionReservedAmount 
          : null,
        plannedOutput: Object.keys(plannedOutput).length > 0 
          ? plannedOutput 
          : null,
        materialReservationStatus: 'pending'
      });
      
      console.log(`   ✓ ${node.name}: ${worker.name} @ ${substation.name} (seq ${sequenceNumber})`);
    }
    
    // 7. Update plan status
    await trx('mes.production_plans')
      .where('id', planId)
      .update({
        status: 'active',
        launchedAt: trx.fn.now()
      });
    
    await trx.commit();
    
    console.log(`✅ Plan launched: ${planId} with ${nodes.length} nodes`);
    
    // Build summary response
    const allStarts = assignments.map(a => a.estimatedStart);
    const allEnds = assignments.map(a => a.estimatedEnd);
    const minStart = new Date(Math.min(...allStarts.map(d => d.getTime())));
    const maxEnd = new Date(Math.max(...allEnds.map(d => d.getTime())));
    
    return {
      success: true,
      planId: planId,
      status: 'active',
      launchedAt: new Date(),
      summary: {
        totalNodes: nodes.length,
        assignedNodes: assignments.length,
        totalWorkers: workerSchedule.size,
        totalSubstations: substationSchedule.size,
        estimatedStartTime: minStart,
        estimatedEndTime: maxEnd,
        estimatedDuration: Math.ceil((maxEnd - minStart) / 60000)
      },
      assignments,
      queuedTasks: queuedCount,
      warnings: materialWarnings.length > 0 ? { materials: materialWarnings } : undefined
    };
    
  } catch (error) {
    await trx.rollback();
    console.error('❌ Error launching plan:', error);
    return { 
      error: 'Failed to launch plan',
      message: error.message,
      details: error.message 
    };
  }
}
