// Semi-finished product code generation and registry
// 
// CODE UNIQUENESS FACTORS (What makes a product unique):
// 1. Station (stationId) - Where it's made
// 2. Operation (operationId + operationCode) - What process is applied
// 3. Material Types (materialCode) - What raw materials are used
// 4. Material Ratios (requiredQuantity normalized) - Ratio between materials
// 5. Output Ratio (outputQty normalized) - Input:Output ratio
//
// RATIO NORMALIZATION (GCD-based):
// Instead of absolute quantities, we use ratios to identify same products at different scales
//
// EXAMPLES:
// Case 1: 40kg Steel → 80 pcs
//   GCD(40, 80) = 40
//   Normalized: 1.000:2.000 → Signature: ...mats:M-STEEL:1.000kg|out:2.000adet
//
// Case 2: 30kg Steel → 60 pcs  
//   GCD(30, 60) = 30
//   Normalized: 1.000:2.000 → Signature: ...mats:M-STEEL:1.000kg|out:2.000adet
//   SAME SIGNATURE = SAME CODE! ✓
//
// Case 3: 40kg Steel → 90 pcs (different ratio!)
//   GCD(40, 90) = 10
//   Normalized: 4.000:9.000 → Signature: ...mats:M-STEEL:4.000kg|out:9.000adet
//   DIFFERENT SIGNATURE = DIFFERENT CODE! ✓
//
// Multiple materials example:
// 10kg Steel + 5kg Aluminum → 30 pcs
//   GCD(10, 5, 30) = 5
//   Normalized: 2.000:1.000:6.000
//   Signature: ...mats:M-ALU:1.000kg,M-STEEL:2.000kg|out:6.000adet
//
// SIGNATURE FORMAT:
// op:{operationId}|code:{operationCode}|st:{stationId}|mats:{materialCode}:{ratio}{unit},...|out:{ratio}{unit}
//
// Registry: Stored in Firestore (mes-outputCodes collection)
// Format: <prefix>-NNN where prefix comes from station's operations

import { getSemiCodePreview } from './mesApi.js';

function pad3(n) { return String(n).padStart(3, '0'); }

export function getPrefixForNode(node, ops = [], stations = []) {
  // Prefer station-based combined operation codes (e.g., KAs) if station is selected
  // ✅ Get first assigned station from assignedStations array (priority-aware)
  let firstStationId = null;
  
  if (Array.isArray(node.assignedStations) && node.assignedStations.length > 0) {
    // ✅ Sort by priority (lowest number = highest priority)
    const sortedStations = [...node.assignedStations].sort((a, b) => 
      (a.priority || 999) - (b.priority || 999)
    );
    
    const firstStation = sortedStations[0];
    firstStationId = firstStation.stationId || firstStation.id;
    
    console.log(`📝 Semi-code for ${node.operationName || node.name || 'node'}: Using station ${firstStationId} (priority: ${firstStation.priority || 'N/A'})`);
  } else if (node.stationId) {
    // ✅ Backward compatibility: single stationId field
    firstStationId = node.stationId;
  }
  
  const station = firstStationId && Array.isArray(stations)
    ? stations.find(s => s.id === firstStationId)
    : null;
  if (station && Array.isArray(station.operationIds)) {
    const opMap = new Map((Array.isArray(ops) ? ops : []).map(o => [o.id, o]));
    const codes = station.operationIds
      .map(id => opMap.get(id)?.semiOutputCode)
      .filter(code => code && String(code).trim() !== '')
      .map(code => String(code).trim())
      .sort();
    if (codes.length) {
      // Remove duplicates while preserving sort
      const uniq = Array.from(new Set(codes));
      return uniq.join('');
    }
  }
  // Fallback to the node's operation semiOutputCode if available
  const op = Array.isArray(ops) ? ops.find(o => o.id === node.operationId) : null;
  const semi = (op && op.semiOutputCode) ? String(op.semiOutputCode).trim() : '';
  if (semi) return semi;
  // Last resort: infer from node name/type
  if (node.name && node.name.length) return node.name[0].toUpperCase();
  if (node.type && node.type.length) return node.type[0].toUpperCase();
  return 'S';
}

function normalizeMaterials(mats = []) {
  const arr = Array.isArray(mats) ? mats : [];
  return arr
    .filter(m => !!m && m.materialCode)
    .map(m => ({ 
      id: String(m.materialCode),  // Backend API expects 'id'
      qty: m.requiredQuantity != null ? m.requiredQuantity : null,  // Backend API expects 'qty'
      unit: m.unit || '' 
    }))
    .sort((a,b) => a.id.localeCompare(b.id));
}

export function buildSignature(node, ops = [], stations = []) {
  const op = Array.isArray(ops) ? ops.find(o => o.id === node.operationId) : null;
  const opId = op ? op.id : (node.operationId || '');
  const opCode = op ? (op.semiOutputCode || '') : '';
  // Get first assigned station from assignedStations array
  const firstStationId = Array.isArray(node.assignedStations) && node.assignedStations.length > 0
    ? (node.assignedStations[0].stationId || node.assignedStations[0].id)  // SCHEMA: stationId with fallback
    : null;
  const st = firstStationId && Array.isArray(stations)
    ? stations.find(s => s.id === firstStationId)
    : null;
  const stId = st ? st.id : '';
  const mats = normalizeMaterials(node.materialInputs);
  
  // CRITICAL: Normalize to ratios instead of absolute quantities
  // Example: 40kg→80pcs and 30kg→60pcs should produce same signature (ratio 1:2)
  const quantities = mats.map(m => m.qty).filter(q => q != null && q > 0);
  const outputQty = node.outputQty != null && node.outputQty > 0 ? node.outputQty : null;
  
  if (quantities.length > 0 && outputQty != null) {
    // Find GCD (Greatest Common Divisor) to normalize ratios
    const gcd = (a, b) => b === 0 ? a : gcd(b, a % b);
    const allValues = [...quantities, outputQty];
    let commonDivisor = allValues[0];
    for (let i = 1; i < allValues.length; i++) {
      commonDivisor = gcd(commonDivisor, allValues[i]);
    }
    
    // Normalize materials and output to ratios
    const matsRatio = mats.map(m => {
      const normalizedQty = m.qty != null && m.qty > 0 ? (m.qty / commonDivisor).toFixed(3) : '';
      return `${m.id}:${normalizedQty}${m.unit || ''}`;
    }).join(',');
    
    const outRatio = (outputQty / commonDivisor).toFixed(3);
    const outUnit = node.outputUnit || '';
    
    return `op:${opId}|code:${opCode}|st:${stId}|mats:${matsRatio}|out:${outRatio}${outUnit}`;
  } else {
    // Fallback to absolute values if normalization not possible
    const matsStr = mats.map(m => `${m.id}:${m.qty != null ? m.qty : ''}${m.unit || ''}`).join(',');
    const outQty = node.outputQty != null ? node.outputQty : '';
    const outUnit = node.outputUnit || '';
    return `op:${opId}|code:${opCode}|st:${stId}|mats:${matsStr}|out:${outQty}${outUnit}`;
  }
}

// Fetch semi code from API and assign to node
export async function computeAndAssignSemiCode(node, ops = [], stations = []) {
  if (!node) return null;
  
  // Require station and materials with quantities to generate definitive code
  const firstStationId = Array.isArray(node.assignedStations) && node.assignedStations.length > 0
    ? (node.assignedStations[0].stationId || node.assignedStations[0].id)  // SCHEMA: stationId with fallback
    : null;
  const stPresent = !!firstStationId;
  const mats = normalizeMaterials(node.materialInputs);
  const allQtyKnown = mats.length > 0 && mats.every(m => m.qty != null && Number.isFinite(m.qty));
  
  if (!stPresent || !allQtyKnown) {
    node.semiCode = null;
    node._semiCodePending = false;
    return null;
  }
  
  try {
    const op = Array.isArray(ops) ? ops.find(o => o.id === node.operationId) : null;
    const st = Array.isArray(stations) ? stations.find(s => s.id === firstStationId) : null;
    
    const payload = {
      operationId: node.operationId || '',
      operationCode: op?.semiOutputCode || '',
      stationId: st ? st.id : firstStationId,
      materials: mats.map(m => ({ id: m.id, qty: m.qty, unit: m.unit })),
      outputQty: node.outputQty != null ? node.outputQty : 0,
      outputUnit: node.outputUnit || 'adet'
    };
    
    const result = await getSemiCodePreview(payload);
    
    if (result.code) {
      node.semiCode = result.code;
      node._semiCodePending = !result.reserved; // Mark as pending if not yet committed
      
      // Store metadata for commit later
      node._semiCodeMeta = {
        prefix: getPrefixForNode(node, ops, stations),
        signature: buildSignature(node, ops, stations),
        code: result.code,
        operationId: payload.operationId,
        stationId: payload.stationId,
        materialsHash: mats.map(m => `${m.id}:${m.qty}${m.unit}`).join(',')
      };
      
      return result.code;
    } else {
      node.semiCode = null;
      node._semiCodePending = false;
      node._semiCodeMeta = null;
      return null;
    }
  } catch (error) {
    console.error('Error fetching semi code preview:', error);
    node.semiCode = null;
    node._semiCodePending = false;
    node._semiCodeMeta = null;
    return null;
  }
}

// Get preview without mutating node (for display purposes)
export async function getSemiCodePreviewForNode(node, ops = [], stations = []) {
  if (!node) return null;
  
  const firstStationId = Array.isArray(node.assignedStations) && node.assignedStations.length > 0
    ? (node.assignedStations[0].stationId || node.assignedStations[0].id)  // SCHEMA: stationId with fallback
    : null;
  const stPresent = !!firstStationId;
  const mats = normalizeMaterials(node.materialInputs);
  const allQtyKnown = mats.length > 0 && mats.every(m => m.qty != null && Number.isFinite(m.qty));
  
  console.log('🔍 getSemiCodePreviewForNode debug:', {
    nodeId: node.id,
    operationId: node.operationId,
    assignedStations: node.assignedStations,
    firstStationId,
    stPresent,
    materialInputs: node.materialInputs,
    normalizedMats: mats,
    allQtyKnown,
    opsLength: ops.length,
    stationsLength: stations.length
  });
  
  if (!stPresent || !allQtyKnown) {
    console.warn('⚠️ Output code preview skipped:', { stPresent, allQtyKnown });
    return null;
  }
  
  try {
    const op = Array.isArray(ops) ? ops.find(o => o.id === node.operationId) : null;
    const st = Array.isArray(stations) ? stations.find(s => s.id === firstStationId) : null;
    
    console.log('🔍 Operation and station lookup:', {
      foundOp: !!op,
      opCode: op?.semiOutputCode,
      foundStation: !!st,
      stationId: st?.id
    });
    
    const payload = {
      operationId: node.operationId || '',
      operationCode: op?.semiOutputCode || '',
      stationId: st ? st.id : firstStationId,
      materials: mats.map(m => ({ id: m.id, qty: m.qty, unit: m.unit })),
      outputQty: node.outputQty != null ? node.outputQty : 0,
      outputUnit: node.outputUnit || 'adet'
    };
    
    console.log('📤 Sending preview request:', payload);
    
    const result = await getSemiCodePreview(payload);
    console.log('📥 Preview result:', result);
    return result.code || null;
  } catch (error) {
    console.error('❌ Error fetching semi code preview:', error);
    return null;
  }
}

// Gather all pending semi codes for commit
export function collectPendingSemiCodes(nodes) {
  const assignments = [];
  
  for (const node of nodes) {
    if (node._semiCodePending && node._semiCodeMeta) {
      assignments.push(node._semiCodeMeta);
    }
  }
  
  return assignments;
}

// No longer needed - registry is in Firestore
export function clearSemiRegistry() {
  console.warn('clearSemiRegistry is deprecated - registry is now in Firestore');
}
