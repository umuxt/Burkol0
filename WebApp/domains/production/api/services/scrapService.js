/**
 * Scrap & Output Service
 * Handles scrap records and output code validation
 */

import db from '#db/connection';

/**
 * Record scrap for a work package
 */
export async function recordScrap(workPackageId, scrapData) {
  const { scrapType, materialCode, quantity, reason } = scrapData;
  
  if (!scrapType || !materialCode || !quantity) {
    return { error: 'scrapType, materialCode, and quantity are required' };
  }
  
  // Get assignment to verify it exists
  const assignment = await db('mes.worker_assignments')
    .where('id', workPackageId)
    .first();
  
  if (!assignment) {
    return { error: 'Work package not found' };
  }
  
  // Update scrap counters in assignment
  const field = scrapType === 'input' ? 'inputScrapCount' : 'productionScrapCount';
  const currentScrap = assignment[field] ? 
    (typeof assignment[field] === 'string' ? JSON.parse(assignment[field]) : assignment[field]) 
    : {};
  
  currentScrap[materialCode] = (currentScrap[materialCode] || 0) + parseFloat(quantity);
  
  await db('mes.worker_assignments')
    .where('id', workPackageId)
    .update({
      [field]: JSON.stringify(currentScrap),
      updatedAt: db.fn.now()
    });
  
  console.log(`📊 Recorded ${scrapType} scrap: ${quantity} ${materialCode} for WP ${workPackageId}`);
  
  return {
    success: true,
    workPackageId,
    scrapType,
    materialCode,
    quantity: parseFloat(quantity),
    totalScrap: currentScrap[materialCode]
  };
}

/**
 * Get scrap records for a work package
 */
export async function getScrapRecords(workPackageId) {
  const assignment = await db('mes.worker_assignments')
    .where('id', workPackageId)
    .select('id', 'inputScrapCount', 'productionScrapCount')
    .first();
  
  if (!assignment) {
    return { error: 'Work package not found' };
  }
  
  const parseScrap = (val) => {
    if (!val) return {};
    return typeof val === 'string' ? JSON.parse(val) : val;
  };
  
  return {
    workPackageId,
    inputScrap: parseScrap(assignment.inputScrapCount),
    productionScrap: parseScrap(assignment.productionScrapCount)
  };
}

/**
 * Remove/adjust scrap record
 */
export async function removeScrap(workPackageId, scrapType, materialCode, quantity) {
  const assignment = await db('mes.worker_assignments')
    .where('id', workPackageId)
    .first();
  
  if (!assignment) {
    return { error: 'Work package not found' };
  }
  
  const field = scrapType === 'input' ? 'inputScrapCount' : 'productionScrapCount';
  const currentScrap = assignment[field] ? 
    (typeof assignment[field] === 'string' ? JSON.parse(assignment[field]) : assignment[field]) 
    : {};
  
  if (!currentScrap[materialCode]) {
    return { error: 'No scrap record found for this material' };
  }
  
  const newQty = Math.max(0, currentScrap[materialCode] - parseFloat(quantity));
  
  if (newQty === 0) {
    delete currentScrap[materialCode];
  } else {
    currentScrap[materialCode] = newQty;
  }
  
  await db('mes.worker_assignments')
    .where('id', workPackageId)
    .update({
      [field]: Object.keys(currentScrap).length > 0 ? JSON.stringify(currentScrap) : null,
      updatedAt: db.fn.now()
    });
  
  console.log(`🗑️ Removed ${scrapType} scrap: ${quantity} ${materialCode} from WP ${workPackageId}`);
  
  return {
    success: true,
    workPackageId,
    scrapType,
    materialCode,
    removed: parseFloat(quantity),
    remaining: newQty
  };
}

/**
 * Validate output code format and uniqueness
 */
export async function validateOutputCode(code, excludePlanId = null) {
  if (!code) {
    return {
      valid: false,
      error: 'Output code is required'
    };
  }
  
  // Check format (alphanumeric with optional dashes)
  const formatValid = /^[A-Za-z0-9-]+$/.test(code);
  if (!formatValid) {
    return {
      valid: false,
      error: 'Output code can only contain letters, numbers, and dashes'
    };
  }
  
  // Check uniqueness in nodes (excluding specified plan)
  let query = db('mes.production_plan_nodes')
    .where('outputCode', code);
  
  if (excludePlanId) {
    query = query.whereNot('planId', excludePlanId);
  }
  
  const existing = await query.first();
  
  if (existing) {
    return {
      valid: false,
      error: 'Output code already in use',
      conflictingPlanId: existing.planId
    };
  }
  
  // Check if it matches a material code
  const material = await db('materials.materials')
    .where('code', code)
    .first();
  
  return {
    valid: true,
    code,
    existsAsMaterial: !!material,
    materialName: material?.name || null
  };
}

/**
 * Get existing output codes
 * @param {number|null} planId - Filter by specific plan
 * @param {string|null} prefix - Filter by output code prefix (e.g., "Cu" for Kesim)
 */
export async function getExistingOutputCodes(planId = null, prefix = null) {
  let query = db('mes.production_plan_nodes')
    .whereNotNull('outputCode')
    .select('outputCode', 'planId', 'name as nodeName')
    .distinct('outputCode');
  
  if (planId) {
    query = query.where('planId', planId);
  }
  
  // Filter by prefix if provided (e.g., "Cu" shows only codes starting with "Cu")
  if (prefix) {
    query = query.where('outputCode', 'like', `${prefix}%`);
  }
  
  const nodes = await query;
  
  // Get material info for each code (include id and unit)
  const codes = nodes.map(n => n.outputCode);
  
  // If no codes found, return empty array
  if (codes.length === 0) {
    return { outputCodes: [] };
  }
  
  const materials = await db('materials.materials')
    .whereIn('code', codes)
    .select('id', 'code', 'name', 'unit');
  
  const materialMap = materials.reduce((acc, m) => {
    acc[m.code] = { id: m.id, name: m.name, unit: m.unit };
    return acc;
  }, {});
  
  return {
    outputCodes: nodes.map(n => ({
      code: n.outputCode,
      name: materialMap[n.outputCode]?.name || n.nodeName || n.outputCode,
      unit: materialMap[n.outputCode]?.unit || 'adet',
      id: materialMap[n.outputCode]?.id || null,
      planId: n.planId,
      nodeName: n.nodeName,
      isMaterial: !!materialMap[n.outputCode]
    }))
  };
}
