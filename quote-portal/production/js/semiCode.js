// Semi-finished product code generation and registry
// Code format: <prefix>-NNN where prefix comes primarily from the selected station's operations
// Registry: stores signature -> code mapping and per-prefix counters in localStorage

const LS_KEY = 'semiCodeRegistry.v1';

function loadRegistry() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return { map: {}, counters: {} };
    const parsed = JSON.parse(raw);
    return {
      map: parsed.map || {},
      counters: parsed.counters || {}
    };
  } catch {
    return { map: {}, counters: {} };
  }
}

function saveRegistry(reg) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(reg)); } catch {}
}

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

function buildSignature(node, ops = [], stations = []) {
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

export function computeAndAssignSemiCode(node, ops = [], stations = []) {
  if (!node) return null;
  // Require station and materials with quantities to generate definitive code
  const stPresent = !!(node.assignedStation);
  const mats = normalizeMaterials(node.rawMaterials);
  const allQtyKnown = mats.length > 0 && mats.every(m => m.qty != null && Number.isFinite(m.qty));
  if (!stPresent || !allQtyKnown) {
    node.semiCode = null;
    return null;
  }
  const reg = loadRegistry();
  const prefix = getPrefixForNode(node, ops, stations);
  const sig = buildSignature(node, ops, stations);

  let code = reg.map[sig];
  if (!code) {
    const current = reg.counters[prefix] || 1;
    code = `${prefix}-${pad3(current)}`;
    reg.counters[prefix] = current + 1;
    reg.map[sig] = code;
    saveRegistry(reg);
  }
  node.semiCode = code;
  return code;
}

export function getSemiCodePreview(node, ops = [], stations = []) {
  if (!node) return null;
  const stPresent = !!(node.assignedStation);
  const mats = normalizeMaterials(node.rawMaterials);
  const allQtyKnown = mats.length > 0 && mats.every(m => m.qty != null && Number.isFinite(m.qty));
  if (!stPresent || !allQtyKnown) return null;
  const reg = loadRegistry();
  const prefix = getPrefixForNode(node, ops, stations);
  const sig = buildSignature(node, ops, stations);
  // Return existing mapping or hypothetical next code (without reserving)
  const existing = reg.map[sig];
  if (existing) return existing;
  const next = reg.counters[prefix] || 1;
  return `${prefix}-${pad3(next)}`;
}

export function clearSemiRegistry() {
  try { localStorage.removeItem(LS_KEY); } catch {}
}
