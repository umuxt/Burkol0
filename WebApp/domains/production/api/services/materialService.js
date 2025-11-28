/**
 * Material Service
 * Handles material availability checks and related operations
 */

import db from '#db/connection';

/**
 * Get all materials
 */
export async function getAllMaterials() {
  return db('materials.materials')
    .select('*')
    .orderBy('name');
}

/**
 * Check material availability for a production plan
 * @param {Array} requiredMaterials - Array of { materialCode, requiredQuantity }
 */
export async function checkMaterialAvailability(requiredMaterials) {
  if (!Array.isArray(requiredMaterials)) {
    throw new Error('Required materials must be an array');
  }

  // Fetch all materials from PostgreSQL
  const allMaterials = await db('materials.materials').select('*');
  
  // Build lookup map by code, id (auto-increment), and name
  const materialStockMap = new Map();
  
  allMaterials.forEach(mat => {
    const stock = parseFloat(mat.stock) || 0;
    const reserved = parseFloat(mat.reserved) || 0;
    const wipReserved = parseFloat(mat.wip_reserved) || 0;
    const available = stock - reserved - wipReserved;
    
    // Map by code (primary)
    if (mat.code) {
      materialStockMap.set(mat.code, {
        stock,
        reserved,
        wipReserved,
        available,
        unit: mat.unit || 'adet',
        name: mat.name
      });
    }
    // Map by id (fallback for legacy references)
    if (mat.id) {
      materialStockMap.set(String(mat.id), {
        stock,
        reserved,
        wipReserved,
        available,
        unit: mat.unit || 'adet',
        name: mat.name
      });
    }
    // Map by name (last resort)
    if (mat.name) {
      materialStockMap.set(mat.name, {
        stock,
        reserved,
        wipReserved,
        available,
        unit: mat.unit || 'adet',
        name: mat.name
      });
    }
  });

  const results = requiredMaterials.map(req => {
    const materialCode = req.materialCode || req.code;
    const requiredQty = parseFloat(req.requiredQuantity || req.qty || 0);
    
    const stockInfo = materialStockMap.get(materialCode);
    
    if (!stockInfo) {
      return {
        materialCode,
        name: materialCode,
        required: requiredQty,
        available: 0,
        sufficient: false,
        shortage: requiredQty,
        error: 'Material not found'
      };
    }
    
    const sufficient = stockInfo.available >= requiredQty;
    
    return {
      materialCode,
      name: stockInfo.name,
      required: requiredQty,
      stock: stockInfo.stock,
      reserved: stockInfo.reserved,
      wipReserved: stockInfo.wipReserved,
      available: stockInfo.available,
      unit: stockInfo.unit,
      sufficient,
      shortage: sufficient ? 0 : requiredQty - stockInfo.available
    };
  });

  const allSufficient = results.every(r => r.sufficient);
  const shortages = results.filter(r => !r.sufficient);

  return {
    materials: results,
    allSufficient,
    shortageCount: shortages.length,
    shortages
  };
}

/**
 * Calculate pre-production reserved amounts for a work package
 * Takes into account expected defect rate and input/output ratio
 */
export function calculatePreProductionReservedAmount(node, expectedDefectRate = 0, planQuantity = 1) {
  const preProductionReservedAmount = {};
  
  if (!node || !node.materialInputs || !Array.isArray(node.materialInputs)) {
    console.warn(`⚠️ calculatePreProductionReservedAmount: node ${node?.id} has no materialInputs!`);
    return preProductionReservedAmount;
  }
  
  const outputQty = parseFloat(node.outputQty) || 0;
  
  if (outputQty <= 0) {
    // Fallback: use input quantities directly
    node.materialInputs.forEach(material => {
      const materialCode = material.materialCode || material.code;
      const requiredQty = (material.requiredQuantity || material.qty || material.required || 0) * planQuantity;
      if (materialCode && requiredQty > 0) {
        preProductionReservedAmount[materialCode] = 
          (preProductionReservedAmount[materialCode] || 0) + requiredQty;
      }
    });
    return preProductionReservedAmount;
  }
  
  const scaledOutputQty = outputQty * planQuantity;
  const defectRate = Math.max(0, Math.min(100, parseFloat(expectedDefectRate) || 0));
  const expectedDefectsInOutput = scaledOutputQty * (defectRate / 100);
  
  node.materialInputs.forEach(material => {
    const materialCode = material.materialCode || material.code;
    const inputQtyPerOperation = material.requiredQuantity || material.qty || material.required || 0;
    
    if (!materialCode || inputQtyPerOperation <= 0) return;
    
    const inputOutputRatio = inputQtyPerOperation / outputQty;
    const requiredInputForGoodOutput = scaledOutputQty * inputOutputRatio;
    const additionalInputForDefects = expectedDefectsInOutput * inputOutputRatio;
    const totalReserved = requiredInputForGoodOutput + additionalInputForDefects;
    const reservedQty = Math.ceil(totalReserved);
    
    preProductionReservedAmount[materialCode] = 
      (preProductionReservedAmount[materialCode] || 0) + reservedQty;
  });
  
  return preProductionReservedAmount;
}

/**
 * Calculate planned output for a work package
 */
export function calculatePlannedOutput(node, planQuantity = 1) {
  const plannedOutput = {};
  
  if (!node) return plannedOutput;
  
  if (node.outputCode && node.outputQty) {
    const outputQty = parseFloat(node.outputQty) || 0;
    if (outputQty > 0) {
      plannedOutput[node.outputCode] = outputQty * planQuantity;
    }
  }
  
  return plannedOutput;
}
