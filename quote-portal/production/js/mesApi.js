// Shared MES API helpers for Operations, Stations, Workers
// Uses backend endpoints implemented in server/mesRoutes.js
import { API_BASE, withAuth } from '../../shared/lib/api.js'

// Centralized authorized fetch helper
async function authorizedFetch(url, options = {}) {
  const headers = withAuth(options.headers || {});
  return fetch(url, { ...options, headers });
}

// Simple persistent cache helpers (sessionStorage)
function readCache(key) {
  try { const raw = sessionStorage.getItem(key); return raw ? JSON.parse(raw) : null } catch { return null }
}
function writeCache(key, value) {
  try { sessionStorage.setItem(key, JSON.stringify(value)) } catch {}
}
function clearCache(key) { try { sessionStorage.removeItem(key) } catch {} }

// Detect full page reload (F5)
function isReload() {
  try {
    const nav = performance.getEntriesByType && performance.getEntriesByType('navigation')[0]
    if (nav) return nav.type === 'reload'
    // Legacy fallback
    const legacy = performance.navigation && performance.navigation.type
    return legacy === 1
  } catch { return false }
}

let _operationsCache = null
let _stationsCache = null
let _workersCache = null
let _materialsCache = null
let _reloadForcedStations = false
let _reloadForcedMaster = false

const STATION_STATUS_VALUES = ['active', 'maintenance', 'inactive']

export async function getOperations(force = false) {
  if (!force && Array.isArray(_operationsCache)) return _operationsCache
  const res = await fetch(`${API_BASE}/api/mes/operations`, { headers: withAuth() })
  if (!res.ok) throw new Error(`operations_load_failed ${res.status}`)
  const data = await res.json()
  _operationsCache = Array.isArray(data?.operations) ? data.operations : []
  return _operationsCache
}

export async function saveOperations(operations) {
  const payload = { operations: operations.map(normalizeOperation) }
  const res = await fetch(`${API_BASE}/api/mes/operations`, {
    method: 'POST',
    headers: withAuth({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload)
  })
  if (!res.ok) throw new Error(`operations_save_failed ${res.status}`)
  _operationsCache = payload.operations
  return true
}

export function normalizeOperation(op) {
  return {
    id: op.id || genId('op-'),
    name: (op.name || '').trim(),
    type: (op.type || 'General'),
    // Optional supervisor user id (selected from workers list)
    supervisorId: op.supervisorId || null,
    semiOutputCode: (function(){
      const raw = (op.semiOutputCode || '').toString()
      const letters = raw.replace(/[^A-Za-z]/g, '')
      if (!letters) return ''
      return (letters[0].toUpperCase() + (letters[1] ? letters[1].toLowerCase() : '')).slice(0,2)
    })(),
    expectedDefectRate: parseFloat(op.expectedDefectRate) || 0,
    skills: Array.isArray(op.skills)
      ? op.skills
      : (typeof op.skills === 'string' ? op.skills.split(',').map(s=>s.trim()).filter(Boolean) : []),
    active: op.active !== false
  }
}

const STATIONS_CHANGED_EVENT = 'stations:changed'
const STATIONS_INVALIDATED_EVENT = 'stations:invalidated'

export async function getStations(force = false) {
  const shouldForce = force || (isReload() && !_reloadForcedStations)
  if (!shouldForce && Array.isArray(_stationsCache)) return _stationsCache
  if (!shouldForce && !_stationsCache) {
    const persisted = readCache('mes_stations_cache')
    if (Array.isArray(persisted)) { _stationsCache = persisted; return _stationsCache }
  }
  const res = await fetch(`${API_BASE}/api/mes/stations`, { headers: withAuth() })
  if (!res.ok) throw new Error(`stations_load_failed ${res.status}`)
  const data = await res.json()
  _stationsCache = Array.isArray(data?.stations) ? data.stations.map(s => ({
    ...s,
    efficiency: typeof s.efficiency === 'number' ? s.efficiency : 1.0
  })) : []
  writeCache('mes_stations_cache', _stationsCache)
  if (isReload()) _reloadForcedStations = true
  return _stationsCache
}

export async function saveStations(stations) {
  const ops = await getOperations()
  const payload = { stations: stations.map(s => normalizeStation(s, ops)) }
  const res = await fetch(`${API_BASE}/api/mes/stations`, {
    method: 'POST',
    headers: withAuth({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload)
  })
  if (!res.ok) throw new Error(`stations_save_failed ${res.status}`)
  _stationsCache = payload.stations
  writeCache('mes_stations_cache', _stationsCache)
  try { window.dispatchEvent(new CustomEvent(STATIONS_CHANGED_EVENT, { detail: { source: 'production' } })) } catch {}
  return true
}

export function normalizeStation(station, operations) {
  const opIds = Array.isArray(station.operationIds) ? station.operationIds : []
  const subSkills = Array.isArray(station.subSkills)
    ? station.subSkills
    : (typeof station.subSkills === 'string' ? station.subSkills.split(',').map(s=>s.trim()).filter(Boolean) : [])
  const inherited = computeStationInheritedSkills(opIds, operations)
  const effectiveSkills = Array.from(new Set([ ...inherited, ...subSkills ]))
  const subStations = Array.isArray(station.subStations)
    ? station.subStations.map(sub => {
        const code = String(sub?.code || '').trim()
        if (!code) return null
        const status = STATION_STATUS_VALUES.includes(sub?.status) ? sub.status : 'active'
        return { code, status }
      }).filter(Boolean)
    : []
  const subStationCount = Number.isFinite(station.subStationCount)
    ? Math.max(0, Number(station.subStationCount))
    : subStations.length
  return {
    id: station.id || genId('s-'),
    name: (station.name || '').trim(),
    description: (station.description || '').trim(),
    location: (station.location || '').trim(),
    status: station.status || 'active',
    operationIds: opIds,
    subSkills,
    effectiveSkills,
    subStations,
    subStationCount,
    currentWorker: station.currentWorker || null,
    currentOperation: station.currentOperation || null
  }
}

export function computeStationInheritedSkills(opIds, operations) {
  const opMap = new Map((operations||[]).map(o => [o.id, o]))
  const skills = []
  for (const id of (opIds||[])) {
    const op = opMap.get(id)
    if (op && Array.isArray(op.skills)) skills.push(...op.skills)
  }
  return Array.from(new Set(skills))
}

export async function getWorkers(force = false) {
  if (!force && Array.isArray(_workersCache)) return _workersCache
  const res = await fetch(`${API_BASE}/api/mes/workers`, { headers: withAuth() })
  if (!res.ok) throw new Error(`workers_load_failed ${res.status}`)
  const data = await res.json()
  _workersCache = Array.isArray(data?.workers) ? data.workers : []
  // normalize skills and efficiency
  _workersCache = _workersCache.map(w => ({
    ...w,
    skills: Array.isArray(w.skills) ? w.skills : (typeof w.skills === 'string' ? w.skills.split(',').map(s=>s.trim()).filter(Boolean) : []),
    efficiency: typeof w.efficiency === 'number' ? w.efficiency : 1.0
  }))
  return _workersCache
}

// Get workers that can work at a specific station
export async function getStationWorkers(stationId) {
  const res = await fetch(`${API_BASE}/api/mes/stations/${stationId}/workers`, { headers: withAuth() })
  if (!res.ok) throw new Error(`station_workers_load_failed ${res.status}`)
  const data = await res.json()
  return data
}

// Get stations where a specific worker can work
export async function getWorkerStations(workerId) {
  const res = await fetch(`${API_BASE}/api/mes/workers/${workerId}/stations`, { headers: withAuth() })
  if (!res.ok) throw new Error(`worker_stations_load_failed ${res.status}`)
  const data = await res.json()
  return data
}

// Materials API
// NOTE: All materials are now stored in the unified 'materials' collection.
// The 'mes-materials' collection has been removed from the codebase.
// This function fetches materials from the single source of truth: 'materials'
export async function getMaterials(force = false) {
  if (!force && Array.isArray(_materialsCache)) return _materialsCache
  // Use shared Materials API (Firestore 'materials' collection)
  const res = await fetch(`${API_BASE}/api/materials?_t=${Date.now()}`, { headers: withAuth() })
  if (!res.ok) throw new Error(`materials_load_failed ${res.status}`)
  const data = await res.json()
  // API returns raw array of materials
  _materialsCache = Array.isArray(data) ? data : []
  return _materialsCache
}

// Get general materials list (alias for getMaterials for consistency)
// NOTE: This is now identical to getMaterials since we use a single 'materials' collection
export async function getGeneralMaterials(force = false) {
  return getMaterials(force);
}

// Check material availability via MES API
// NOTE: This endpoint queries the unified 'materials' collection only
export async function checkMesMaterialAvailability(requiredMaterials) {
  try {
    // requiredMaterials format: [{code, name, required, unit}]
    const res = await fetch(`${API_BASE}/api/mes/materials/check-availability`, {
      method: 'POST',
      headers: withAuth({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ materials: requiredMaterials })
    });
    
    if (!res.ok) {
      console.warn('Material availability check failed:', res.status);
      return {
        allAvailable: false,
        materials: [],
        shortages: requiredMaterials.map(m => ({
          ...m,
          available: 0,
          shortage: m.required,
          status: 'unavailable'
        })),
        error: `API returned ${res.status}`
      };
    }
    
    const data = await res.json();
    return data;
  } catch (error) {
    console.error('Material availability check error:', error);
    return {
      allAvailable: false,
      materials: [],
      shortages: requiredMaterials.map(m => ({
        ...m,
        available: 0,
        shortage: m.required,
        status: 'error'
      })),
      error: error.message
    };
  }
}

// Production Plans API
export async function createProductionPlan(plan) {
  const res = await fetch(`${API_BASE}/api/mes/production-plans`, {
    method: 'POST',
    headers: withAuth({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(plan)
  })
  if (!res.ok) throw new Error(`production_plan_create_failed ${res.status}`)
  return await res.json()
}

export async function createTemplate(template) {
  // Use dedicated templates endpoint; server records createdBy/owner and lastModifiedBy
  const payload = { ...template, status: 'template' }
  const res = await fetch(`${API_BASE}/api/mes/templates`, {
    method: 'POST',
    headers: withAuth({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload)
  })
  if (!res.ok) throw new Error(`template_create_failed ${res.status}`)
  return await res.json()
}

// Update an existing production plan (or template doc) by id
export async function updateProductionPlan(id, updates) {
  const res = await fetch(`${API_BASE}/api/mes/production-plans/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: withAuth({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(updates)
  })
  if (!res.ok) throw new Error(`production_plan_update_failed ${res.status}`)
  return await res.json()
}

// Delete a production plan (or template) by id
export async function deleteProductionPlan(id) {
  const res = await fetch(`${API_BASE}/api/mes/production-plans/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: withAuth()
  })
  if (!res.ok) throw new Error(`production_plan_delete_failed ${res.status}`)
  return await res.json()
}

// Fetch production plans
export async function getProductionPlans() {
  const res = await fetch(`${API_BASE}/api/mes/production-plans`, { headers: withAuth() })
  if (!res.ok) throw new Error(`production_plans_load_failed ${res.status}`)
  const data = await res.json()
  return Array.isArray(data?.productionPlans) ? data.productionPlans : []
}

// Fetch plan templates
export async function getPlanTemplates() {
  const res = await fetch(`${API_BASE}/api/mes/templates`, { headers: withAuth() })
  if (!res.ok) throw new Error(`templates_load_failed ${res.status}`)
  const data = await res.json()
  return Array.isArray(data?.templates) ? data.templates : []
}

// Generate next plan id: prod-plan-YYYY-xxxxx
export async function getNextProductionPlanId(year) {
  try {
    const res = await fetch(`${API_BASE}/api/mes/production-plans/next-id`, {
      method: 'POST',
      headers: withAuth({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ year })
    })
    if (!res.ok) throw new Error(`next_plan_id_failed ${res.status}`)
    const data = await res.json()
    if (data?.id) return data.id
    throw new Error('no_id')
  } catch (e) {
    // Fallback: generate client-side unique id with same format
    const now = new Date()
    const y = (year || now.getFullYear())
    const pad = (n) => String(n).padStart(5, '0')
    const pseudo = Number(String(now.getTime()).slice(-5)) // last 5 digits
    return `prod-plan-${y}-${pad(pseudo)}`
  }
}

// Generate next template id: tpl-plan-YYYY-xxxxx
// (No separate template id; we use production plan next-id for all)

// Create or update a material
// NOTE: Materials are stored in the unified 'materials' collection.
// The 'mes-materials' collection has been removed.
export async function createOrUpdateMaterial(material) {
  const res = await fetch(`${API_BASE}/api/materials`, {
    method: 'POST',
    headers: withAuth({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(material)
  })
  if (!res.ok) throw new Error(`material_upsert_failed ${res.status}`)
  const data = await res.json()
  // Invalidate local cache
  _materialsCache = null
  return data
}

// Upsert a produced WIP material from a plan node
// NOTE: This creates/updates the WIP material definition. Actual stock movements
// happen during plan release via the stock adjustment system.
export async function upsertProducedWipFromNode(node, ops = [], stations = []) {
  if (!node || !node.semiCode) return null
  const station = Array.isArray(stations)
    ? stations.find(s => (s.id && s.id === node.assignedStation) || (s.name && s.name === node.assignedStation))
    : null
  const operation = Array.isArray(ops) ? ops.find(o => o.id === node.operationId) : null
  
  // Build input materials list with quantities for consumption tracking
  const inputs = Array.isArray(node.rawMaterials) 
    ? node.rawMaterials.map(m => ({ 
        id: m.id, 
        code: m.code || m.id,
        qty: m.qty ?? null, 
        unit: m.unit || '' 
      })) 
    : []
  
  const body = {
    code: node.semiCode,
    name: node.semiCode,
    type: 'wip_produced',
    unit: node.outputUnit || '',
    stock: 0, // Initial stock is 0; updated during production
    category: 'WIP',
    description: `Produced via Plan Canvas${station ? ` @ ${station.name || station.id}` : ''}`,
    status: 'Aktif',
    produced: true,
    producedInfo: {
      nodeId: node.id,
      operationId: node.operationId,
      operationName: operation?.name || '',
      stationId: station?.id || '',
      stationName: station?.name || (typeof node.assignedStation === 'string' ? node.assignedStation : ''),
      outputQty: node.outputQty ?? null,
      outputUnit: node.outputUnit || '',
      inputs, // Raw materials consumed to produce this WIP
      producedQty: node.outputQty ?? 1, // Quantity produced per operation
      consumeInputs: true // Flag indicating inputs should be consumed during production
    }
  }
  return await createOrUpdateMaterial(body)
}

export function genId(prefix = '') { return `${prefix}${Math.random().toString(36).slice(2, 9)}` }

// Worker assignments API
export async function getWorkerAssignments(workerId, status = 'active') {
  const params = new URLSearchParams();
  if (status) params.append('status', status);
  
  const response = await authorizedFetch(`${API_BASE}/api/mes/workers/${workerId}/assignments?${params}`);
  if (!response.ok) throw new Error(`Failed to fetch worker assignments: ${response.statusText}`);
  
  const data = await response.json();
  return data.assignments || [];
}

// Substations API
export async function getSubstations(stationId = null) {
  const params = new URLSearchParams();
  if (stationId) params.append('stationId', stationId);
  
  const response = await authorizedFetch(`${API_BASE}/api/mes/substations?${params}`);
  if (!response.ok) throw new Error(`Failed to fetch substations: ${response.statusText}`);
  
  const data = await response.json();
  return data.substations || [];
}

// Batch worker assignments API
export async function batchWorkerAssignments(planId, assignments) {
  const response = await authorizedFetch(`${API_BASE}/api/mes/worker-assignments/batch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ planId, assignments })
  });
  
  if (!response.ok) throw new Error(`Failed to batch assignments: ${response.statusText}`);
  return await response.json();
}

// Activate worker assignments (set currentTask on workers, currentOperation on stations)
export async function activateWorkerAssignments(planId, status = 'active') {
  const response = await authorizedFetch(`${API_BASE}/api/mes/worker-assignments/activate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ planId, status })
  });
  
  if (!response.ok) throw new Error(`Failed to activate assignments: ${response.statusText}`);
  return await response.json();
}

// Master Data (skills, operation types)
let _masterDataCache = null
const MD_CHANGED_EVENT = 'master-data:changed'
const MD_INVALIDATED_EVENT = 'master-data:invalidated'

export async function getMasterData(force = false) {
  const shouldForce = force || (isReload() && !_reloadForcedMaster)
  if (!shouldForce && _masterDataCache) return _masterDataCache
  if (!shouldForce && !_masterDataCache) {
    const persisted = readCache('mes_master_data_cache')
    if (persisted && typeof persisted === 'object') { _masterDataCache = persisted; return _masterDataCache }
  }
  const res = await fetch(`${API_BASE}/api/mes/master-data`, { headers: withAuth() })
  if (!res.ok) throw new Error(`master_data_load_failed ${res.status}`)
  const data = await res.json()
  const normalized = normalizeMasterData(data)
  _masterDataCache = normalized
  writeCache('mes_master_data_cache', _masterDataCache)
  if (isReload()) _reloadForcedMaster = true
  return _masterDataCache
}

export async function saveMasterData({ skills, operationTypes, timeSettings }) {
  // Merge with existing cache to avoid dropping fields when only one section is saved
  const current = _masterDataCache || (await getMasterData().catch(() => null)) || {}
  const merged = {
    availableSkills: (skills ? skills.map(s => ({ id: s.id, name: s.name })) : current.skills || []).map(s => ({ id: s.id, name: s.name })),
    availableOperationTypes: (operationTypes ? operationTypes.map(ot => ({ id: ot.id, name: ot.name })) : current.operationTypes || []).map(ot => ({ id: ot.id, name: ot.name })),
    ...(timeSettings ? { timeSettings } : (current.timeSettings ? { timeSettings: current.timeSettings } : {}))
  }
  const res = await fetch(`${API_BASE}/api/mes/master-data`, {
    method: 'POST',
    headers: withAuth({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(merged)
  })
  if (!res.ok) throw new Error(`master_data_save_failed ${res.status}`)
  _masterDataCache = normalizeMasterData({ ...merged })
  writeCache('mes_master_data_cache', _masterDataCache)
  try { window.dispatchEvent(new CustomEvent(MD_CHANGED_EVENT, { detail: { source: 'production' } })) } catch {}
  return _masterDataCache
}

export function normalizeMasterData(data) {
  const rawSkills = data?.availableSkills || []
  let skills
  if (rawSkills.length && typeof rawSkills[0] === 'string') {
    // Migrate strings to {id,name}
    skills = rawSkills.map((name, i) => ({ id: `skill-${String(i+1).padStart(4,'0')}`, name }))
  } else {
    skills = rawSkills.map(s => ({ id: s.id || `skill-${Math.random().toString(36).slice(2,7)}`, name: s.name || '' }))
  }
  
  const rawOperationTypes = data?.availableOperationTypes || []
  let operationTypes
  if (rawOperationTypes.length && typeof rawOperationTypes[0] === 'string') {
    // Migrate strings to {id,name}
    operationTypes = rawOperationTypes.map((name, i) => ({ id: `optype-${String(i+1).padStart(4,'0')}`, name }))
  } else {
    operationTypes = rawOperationTypes.map(ot => ({ id: ot.id || `optype-${Math.random().toString(36).slice(2,7)}`, name: ot.name || '' }))
  }
  
  const timeSettings = data?.timeSettings || null
  return { skills, operationTypes, ...(timeSettings ? { timeSettings } : {}) }
}

export function nextSkillCode(skills) {
  let max = 0
  for (const s of (skills||[])) {
    const m = /^skill-(\d+)$/.exec(s.id || '')
    if (m) max = Math.max(max, parseInt(m[1], 10))
  }
  return `skill-${String(max+1).padStart(4,'0')}`
}

export async function addSkill(name) {
  const md = await getMasterData()
  const code = nextSkillCode(md.skills)
  const skill = { id: code, name: String(name||'').trim() }
  if (!skill.name) throw new Error('skill_name_required')
  const updated = { ...md, skills: [...md.skills, skill] }
  await saveMasterData(updated)
  return skill
}

// Operation Types CRUD
export function nextOperationTypeCode(operationTypes) {
  let max = 0
  for (const ot of (operationTypes||[])) {
    const m = /^optype-(\d+)$/.exec(ot.id || '')
    if (m) max = Math.max(max, parseInt(m[1], 10))
  }
  return `optype-${String(max+1).padStart(4,'0')}`
}

export async function addOperationType(name) {
  const md = await getMasterData()
  const code = nextOperationTypeCode(md.operationTypes)
  const operationType = { id: code, name: String(name||'').trim() }
  if (!operationType.name) throw new Error('operation_type_name_required')
  const updated = { ...md, operationTypes: [...md.operationTypes, operationType] }
  await saveMasterData(updated)
  return operationType
}

export async function updateOperationType(id, name) {
  const md = await getMasterData()
  const index = md.operationTypes.findIndex(ot => ot.id === id)
  if (index === -1) throw new Error('operation_type_not_found')
  const trimmedName = String(name||'').trim()
  if (!trimmedName) throw new Error('operation_type_name_required')
  const updated = { ...md }
  updated.operationTypes = [...md.operationTypes]
  updated.operationTypes[index] = { ...updated.operationTypes[index], name: trimmedName }
  await saveMasterData(updated)
  return updated.operationTypes[index]
}

export async function deleteOperationType(id) {
  const md = await getMasterData()
  const index = md.operationTypes.findIndex(ot => ot.id === id)
  if (index === -1) throw new Error('operation_type_not_found')
  const updated = { ...md, operationTypes: md.operationTypes.filter(ot => ot.id !== id) }
  await saveMasterData(updated)
  return true
}

export function invalidateMasterDataCache() {
  _masterDataCache = null
  clearCache('mes_master_data_cache')
  try { window.dispatchEvent(new CustomEvent(MD_INVALIDATED_EVENT, { detail: { source: 'production' } })) } catch {}
}

export function invalidateStationsCache() {
  _stationsCache = null
  clearCache('mes_stations_cache')
  try { window.dispatchEvent(new CustomEvent(STATIONS_INVALIDATED_EVENT, { detail: { source: 'production' } })) } catch {}
}

// Approved Quotes (Work Orders) API
export async function getApprovedQuotes() {
  const res = await fetch(`${API_BASE}/api/mes/approved-quotes?_t=${Date.now()}`, { headers: withAuth() })
  if (!res.ok) throw new Error(`approved_quotes_load_failed ${res.status}`)
  const payload = await res.json().catch(() => ({}))
  return Array.isArray(payload?.approvedQuotes) ? payload.approvedQuotes : []
}

// Clear template reference from approved quotes
export async function clearTemplateFromApprovedQuotes(templateId) {
  if (!templateId) return;
  
  try {
    // Get all approved quotes
    const quotes = await getApprovedQuotes();
    
    // Find quotes that reference this template
    const affectedQuotes = quotes.filter(quote => quote.productionPlanId === templateId);
    
    console.log(`Found ${affectedQuotes.length} quotes linked to template ${templateId}`);
    
    // Update each affected quote to clear the production plan reference
    for (const quote of affectedQuotes) {
      await updateApprovedQuoteProductionPlan(quote.code || quote.id, null);
      console.log(`Cleared production plan reference from quote: ${quote.code || quote.id}`);
    }
    
  } catch (error) {
    console.error('Error clearing template from approved quotes:', error);
    throw error;
  }
}

// Update production plan reference for approved quote
export async function updateApprovedQuoteProductionPlan(quoteCode, productionPlanId) {
  const res = await fetch(`${API_BASE}/api/mes/approved-quotes/${encodeURIComponent(quoteCode)}/production-plan`, {
    method: 'PATCH',
    headers: withAuth({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ productionPlanId })
  })
  if (!res.ok) throw new Error(`approved_quote_production_plan_update_failed ${res.status}`)
  return await res.json()
}

// Update production state for work order
export async function updateProductionState(workOrderCode, productionState) {
  const res = await fetch(`${API_BASE}/api/mes/approved-quotes/${encodeURIComponent(workOrderCode)}/production-state`, {
    method: 'PATCH',
    headers: withAuth({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ productionState })
  })
  if (!res.ok) throw new Error(`production_state_update_failed ${res.status}`)
  return await res.json()
}

// ============================================================================
// WORKER PORTAL API
// ============================================================================

/**
 * Get active tasks for worker portal
 * @param {string} workerId - Optional worker ID (uses authenticated user's workerId if not provided)
 * @returns {Promise<{tasks: Array, nextTaskId: string|null}>}
 */
export async function getWorkerPortalTasks(workerId = null) {
  // Build URL with workerId query param if provided (for admin requests)
  const url = workerId 
    ? `${API_BASE}/api/mes/worker-portal/tasks?workerId=${encodeURIComponent(workerId)}`
    : `${API_BASE}/api/mes/worker-portal/tasks`;
    
  const res = await fetch(url, { 
    headers: withAuth(),
    credentials: 'include'
  });
  
  if (!res.ok) {
    // Parse error response to extract code and message
    let errorData;
    try {
      errorData = await res.json();
    } catch {
      errorData = { code: 'unknown_error', message: `HTTP ${res.status}` };
    }
    
    // Throw structured error with code and message
    const error = new Error(errorData.message || `worker_portal_tasks_load_failed ${res.status}`);
    error.code = errorData.code || 'unknown_error';
    error.status = res.status;
    throw error;
  }
  
  return await res.json();
}

/**
 * Update worker portal task status
 * @param {string} assignmentId - Assignment ID
 * @param {Object} payload - Action payload
 * @param {string} payload.action - Action: 'start', 'pause', 'station_error', 'complete'
 * @param {number} [payload.scrapQty] - Scrap quantity (for complete action)
 * @param {string} [payload.stationNote] - Station error note (for station_error action)
 * @returns {Promise<Object>}
 */
export async function updateWorkerPortalTask(assignmentId, payload) {
  if (!assignmentId) throw new Error('assignment_id_required');
  if (!payload || !payload.action) throw new Error('action_required');
  
  const res = await fetch(`${API_BASE}/api/mes/worker-portal/tasks/${encodeURIComponent(assignmentId)}`, {
    method: 'PATCH',
    headers: withAuth({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload),
    credentials: 'include'
  });
  
  if (!res.ok) {
    // Parse error response to extract code and message
    let errorData;
    try {
      errorData = await res.json();
    } catch {
      errorData = { code: 'unknown_error', message: `HTTP ${res.status}` };
    }
    
    // Throw structured error with code, message, and details
    const error = new Error(errorData.message || `worker_portal_task_update_failed ${res.status}`);
    error.code = errorData.code || 'unknown_error';
    error.status = res.status;
    error.details = errorData.details || null;
    error.shortages = errorData.shortages || null;
    throw error;
  }
  
  const result = await res.json();
  
  // Emit event to notify other tabs/widgets (for start/pause/complete actions)
  if (['start', 'pause', 'complete'].includes(payload.action)) {
    try {
      const channel = new BroadcastChannel('mes-assignments');
      channel.postMessage({ 
        type: 'assignments:updated', 
        assignmentId,
        action: payload.action,
        timestamp: Date.now() 
      });
      channel.close();
    } catch (error) {
      console.warn('Failed to emit assignments:updated:', error);
    }
  }
  
  return result;
}

/**
 * Emit assignments:updated event via BroadcastChannel
 * This notifies all open tabs/windows to refresh their assignment data
 */
function emitAssignmentsUpdated(planId = null) {
  try {
    const channel = new BroadcastChannel('mes-assignments');
    channel.postMessage({ 
      type: 'assignments:updated', 
      planId,
      timestamp: Date.now() 
    });
    channel.close();
  } catch (error) {
    console.warn('Failed to emit assignments:updated:', error);
  }
}

/**
 * Launch a production plan with auto-assignment engine
 * POST /api/mes/production-plans/:planId/launch
 * 
 * @param {string} planId - The production plan ID to launch
 * @param {string} workOrderCode - The approved quote work order code
 * @returns {Promise<Object>} Launch result with assignment details
 * @throws {Error} With status, code, and message properties on failure
 */
export async function launchProductionPlan(planId, workOrderCode) {
  const res = await fetch(`${API_BASE}/api/mes/production-plans/${encodeURIComponent(planId)}/launch`, {
    method: 'POST',
    headers: withAuth({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ workOrderCode })
  });
  
  if (!res.ok) {
    // Parse error response for detailed feedback
    let errorData;
    try {
      errorData = await res.json();
    } catch {
      errorData = { error: 'unknown_error', message: `HTTP ${res.status}` };
    }
    
    // Throw structured error with code, message, and details
    const error = new Error(errorData.message || `production_plan_launch_failed ${res.status}`);
    error.code = errorData.error || 'unknown_error';
    error.status = res.status;
    error.details = errorData.details || null;
    error.shortages = errorData.shortages || null;
    error.errors = errorData.errors || null;
    error.warnings = errorData.warnings || null;
    throw error;
  }
  
  const result = await res.json();
  
  // Emit event to notify other tabs/widgets
  emitAssignmentsUpdated(planId);
  
  return result;
}

/**
 * Pause a production plan - stops all assignments
 * POST /api/mes/production-plans/:planId/pause
 * 
 * @param {string} planId - The production plan ID to pause
 * @returns {Promise<Object>} Pause result with summary counts
 * @throws {Error} With status, code, and message properties on failure
 */
export async function pauseProductionPlan(planId) {
  const res = await fetch(`${API_BASE}/api/mes/production-plans/${encodeURIComponent(planId)}/pause`, {
    method: 'POST',
    headers: withAuth({ 'Content-Type': 'application/json' })
  });
  
  if (!res.ok) {
    let errorData;
    try {
      errorData = await res.json();
    } catch {
      errorData = { error: 'unknown_error', message: `HTTP ${res.status}` };
    }
    
    const error = new Error(errorData.message || `production_plan_pause_failed ${res.status}`);
    error.code = errorData.error || 'unknown_error';
    error.status = res.status;
    error.details = errorData.details || null;
    throw error;
  }
  
  const result = await res.json();
  
  // Emit event to notify other tabs/widgets
  emitAssignmentsUpdated(planId);
  
  return result;
}

/**
 * Resume a paused production plan
 * POST /api/mes/production-plans/:planId/resume
 * 
 * @param {string} planId - The production plan ID to resume
 * @returns {Promise<Object>} Resume result with summary counts
 * @throws {Error} With status, code, and message properties on failure
 */
export async function resumeProductionPlan(planId) {
  const res = await fetch(`${API_BASE}/api/mes/production-plans/${encodeURIComponent(planId)}/resume`, {
    method: 'POST',
    headers: withAuth({ 'Content-Type': 'application/json' })
  });
  
  if (!res.ok) {
    let errorData;
    try {
      errorData = await res.json();
    } catch {
      errorData = { error: 'unknown_error', message: `HTTP ${res.status}` };
    }
    
    const error = new Error(errorData.message || `production_plan_resume_failed ${res.status}`);
    error.code = errorData.error || 'unknown_error';
    error.status = res.status;
    error.details = errorData.details || null;
    throw error;
  }
  
  const result = await res.json();
  
  // Emit event to notify other tabs/widgets
  emitAssignmentsUpdated(planId);
  
  return result;
}

/**
 * Cancel a production plan - cancels all assignments permanently
 * POST /api/mes/production-plans/:planId/cancel
 * 
 * @param {string} planId - The production plan ID to cancel
 * @returns {Promise<Object>} Cancel result with summary counts
 * @throws {Error} With status, code, and message properties on failure
 */
export async function cancelProductionPlan(planId) {
  const res = await fetch(`${API_BASE}/api/mes/production-plans/${encodeURIComponent(planId)}/cancel`, {
    method: 'POST',
    headers: withAuth({ 'Content-Type': 'application/json' })
  });
  
  if (!res.ok) {
    let errorData;
    try {
      errorData = await res.json();
    } catch {
      errorData = { error: 'unknown_error', message: `HTTP ${res.status}` };
    }
    
    const error = new Error(errorData.message || `production_plan_cancel_failed ${res.status}`);
    error.code = errorData.error || 'unknown_error';
    error.status = res.status;
    error.details = errorData.details || null;
    throw error;
  }
  
  const result = await res.json();
  
  // Emit event to notify other tabs/widgets
  emitAssignmentsUpdated(planId);
  
  return result;
}

/**
 * Fetch all active work packages (assignments) across all launched plans
 * GET /api/mes/work-packages
 * 
 * @param {Object} filters - Optional filters: status, workerId, stationId, limit
 * @returns {Promise<Object>} Work packages with related data (plans, quotes, workers, stations)
 * @throws {Error} With status, code, and message properties on failure
 */
let _workPackagesCache = null;
let _workPackagesCacheTime = 0;
const WORK_PACKAGES_CACHE_TTL = 30000; // 30 seconds

export async function getWorkPackages(filters = {}, force = false) {
  const now = Date.now();
  
  // Return cached data if recent and not forced
  if (!force && _workPackagesCache && (now - _workPackagesCacheTime < WORK_PACKAGES_CACHE_TTL)) {
    return _workPackagesCache;
  }
  
  const queryParams = new URLSearchParams();
  if (filters.status) queryParams.append('status', filters.status);
  if (filters.workerId) queryParams.append('workerId', filters.workerId);
  if (filters.stationId) queryParams.append('stationId', filters.stationId);
  if (filters.limit) queryParams.append('limit', filters.limit);
  
  const url = `${API_BASE}/api/mes/work-packages${queryParams.toString() ? '?' + queryParams.toString() : ''}`;
  
  const res = await fetch(url, {
    headers: withAuth()
  });
  
  if (!res.ok) {
    let errorData;
    try {
      errorData = await res.json();
    } catch {
      errorData = { error: 'unknown_error', message: `HTTP ${res.status}` };
    }
    
    const error = new Error(errorData.message || `work_packages_fetch_failed ${res.status}`);
    error.code = errorData.error || 'unknown_error';
    error.status = res.status;
    error.details = errorData.details || null;
    throw error;
  }
  
  const data = await res.json();
  
  // Cache the result
  _workPackagesCache = data;
  _workPackagesCacheTime = now;
  
  return data;
}

/**
 * Clear work packages cache (call after assignments are updated)
 */
export function clearWorkPackagesCache() {
  _workPackagesCache = null;
  _workPackagesCacheTime = 0;
}

// Listen for assignments:updated events to clear cache
if (typeof window !== 'undefined') {
  try {
    const assignmentsChannel = new BroadcastChannel('mes-assignments');
    assignmentsChannel.onmessage = (e) => {
      if (e.data && e.data.type === 'assignments:updated') {
        clearWorkPackagesCache();
      }
    };
  } catch {}
}

// ============================================================================
// SEMI-FINISHED CODE REGISTRY API
// ============================================================================

/**
 * Get preview of semi-finished product code without committing
 * @param {Object} payload - { operationId, operationCode, stationId, materials: [{ id, qty, unit }] }
 * @returns {Promise<Object>} - { code, reserved, message? }
 */
export async function getSemiCodePreview(payload) {
  const res = await fetch(`${API_BASE}/api/mes/output-codes/preview`, {
    method: 'POST',
    headers: withAuth({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload)
  });
  
  if (!res.ok) {
    throw new Error(`semi_code_preview_failed ${res.status}`);
  }
  
  return await res.json();
}

/**
 * Commit semi-finished product codes when plan/template is saved
 * @param {Array} assignments - [{ prefix, signature, code, operationId, stationId, materialsHash }]
 * @returns {Promise<Object>} - { committed, skipped, errors? }
 */
export async function commitSemiCodes(assignments) {
  const res = await fetch(`${API_BASE}/api/mes/output-codes/commit`, {
    method: 'POST',
    headers: withAuth({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ assignments })
  });
  
  if (!res.ok) {
    throw new Error(`semi_code_commit_failed ${res.status}`);
  }
  
  return await res.json();
}
