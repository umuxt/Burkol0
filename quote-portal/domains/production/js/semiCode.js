// Semi-finished product code generation and registry
// Code format: <prefix>-NNN where prefix comes primarily from the selected station's operations
// Registry: now stored in Firestore (mes-outputCodes collection) instead of localStorage

import { getSemiCodePreview } from './mesApi.js';

function pad3(n) { return String(n).padStart(3, '0'); }

export function getPrefixForNode(node, ops = [], stations = []) {
  // Prefer station-based combined operation codes (e.g., KAs) if station is selected
  const station = Array.isArray(stations)
    ? stations.find(s => (s.id && s.id === node.assignedStation) || (s.name && s.name === node.assignedStation))
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
    .filter(m => !!m && !!m.id)
    .map(m => ({ id: String(m.id), qty: (m.qty == null || m.qty === '') ? null : Number(m.qty), unit: m.unit || '' }))
    .sort((a,b) => a.id.localeCompare(b.id));
}

export function buildSignature(node, ops = [], stations = []) {
  const op = Array.isArray(ops) ? ops.find(o => o.id === node.operationId) : null;
  const opId = op ? op.id : (node.operationId || '');
  const opCode = op ? (op.semiOutputCode || '') : '';
  // Station identity by id if available, else by name
  const st = Array.isArray(stations) ? stations.find(s => s.name === node.assignedStation || s.id === node.assignedStation) : null;
  const stId = st ? (st.id || st.name || '') : (node.assignedStation || '');
  const mats = normalizeMaterials(node.rawMaterials);
  const matsStr = mats.map(m => `${m.id}:${m.qty != null ? m.qty : ''}${m.unit ? (m.unit) : ''}`).join(',');
  return `op:${opId}|code:${opCode}|st:${stId}|mats:${matsStr}`;
}

// Fetch semi code from API and assign to node
export async function computeAndAssignSemiCode(node, ops = [], stations = []) {
  if (!node) return null;
  
  // Require station and materials with quantities to generate definitive code
  const stPresent = !!(node.assignedStation);
  const mats = normalizeMaterials(node.rawMaterials);
  const allQtyKnown = mats.length > 0 && mats.every(m => m.qty != null && Number.isFinite(m.qty));
  
  if (!stPresent || !allQtyKnown) {
    node.semiCode = null;
    node._semiCodePending = false;
    return null;
  }
  
  try {
    const op = Array.isArray(ops) ? ops.find(o => o.id === node.operationId) : null;
    const st = Array.isArray(stations) ? stations.find(s => s.name === node.assignedStation || s.id === node.assignedStation) : null;
    
    const payload = {
      operationId: node.operationId || '',
      operationCode: op?.semiOutputCode || '',
      stationId: st ? (st.id || st.name || '') : (node.assignedStation || ''),
      materials: mats.map(m => ({ id: m.id, qty: m.qty, unit: m.unit }))
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
  
  const stPresent = !!(node.assignedStation);
  const mats = normalizeMaterials(node.rawMaterials);
  const allQtyKnown = mats.length > 0 && mats.every(m => m.qty != null && Number.isFinite(m.qty));
  
  if (!stPresent || !allQtyKnown) return null;
  
  try {
    const op = Array.isArray(ops) ? ops.find(o => o.id === node.operationId) : null;
    const st = Array.isArray(stations) ? stations.find(s => s.name === node.assignedStation || s.id === node.assignedStation) : null;
    
    const payload = {
      operationId: node.operationId || '',
      operationCode: op?.semiOutputCode || '',
      stationId: st ? (st.id || st.name || '') : (node.assignedStation || ''),
      materials: mats.map(m => ({ id: m.id, qty: m.qty, unit: m.unit }))
    };
    
    const result = await getSemiCodePreview(payload);
    return result.code || null;
  } catch (error) {
    console.error('Error fetching semi code preview:', error);
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
