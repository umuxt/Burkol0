// Shared MES API helpers for Operations, Stations, Workers
// Uses backend endpoints implemented in server/mesRoutes.js
import { API_BASE, withAuth } from '../../../shared/lib/api.js'

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
  // Backend returns array directly, not { operations: [...] }
  _operationsCache = Array.isArray(data) ? data : []
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
  // Update cache with normalized operations
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
    defaultEfficiency: typeof op.defaultEfficiency === 'number' ? op.defaultEfficiency : 1.0,
    skills: Array.isArray(op.skills)
      ? op.skills
      : (typeof op.skills === 'string' ? op.skills.split(',').map(s=>s.trim()).filter(Boolean) : [])
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
  // Backend now returns array directly (not {stations: [...]})
  _stationsCache = Array.isArray(data) ? data.map(s => ({
    ...s,
    efficiency: typeof s.efficiency === 'number' ? s.efficiency : 1.0
  })) : []
  writeCache('mes_stations_cache', _stationsCache)
  if (isReload()) _reloadForcedStations = true
  return _stationsCache
}

export async function saveStations(stations) {
  const ops = await getOperations()
  
  // Stations are already normalized in state
  // Just ensure subStations are included in the payload
  const payload = { 
    stations: stations.map(s => ({
      ...s,
      // Ensure subStations array is present (backend expects it)
      subStations: Array.isArray(s.subStations) ? s.subStations : []
    }))
  }
  
  const res = await fetch(`${API_BASE}/api/mes/stations`, {
    method: 'POST',
    headers: withAuth({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload)
  })
  if (!res.ok) throw new Error(`stations_save_failed ${res.status}`)
  
  // Cache stations as-is
  _stationsCache = stations.map(s => ({ ...s }))
  writeCache('mes_stations_cache', _stationsCache)
  try { window.dispatchEvent(new CustomEvent(STATIONS_CHANGED_EVENT, { detail: { source: 'production' } })) } catch {}
  return true
}

export function normalizeStation(station, operations) {
  const stationId = station.id || genId('s-')
  
  // Process subStations for backend
  const subStations = Array.isArray(station.subStations)
    ? station.subStations.map(sub => {
        const code = String(sub?.code || '').trim()
        if (!code) return null
        const status = STATION_STATUS_VALUES.includes(sub?.status) ? sub.status : 'active'
        return { code, status }
      }).filter(Boolean)
    : []
  
  // Return fields for DB save + state management
  return {
    id: stationId,
    name: (station.name || '').trim(),
    type: (station.type || '').trim(),
    description: (station.description || '').trim(),
    location: (station.location || '').trim(),
    status: station.status || 'active',
    subStations,
    // Save to DB as JSONB
    operationIds: Array.isArray(station.operationIds) ? station.operationIds : [],
    subSkills: Array.isArray(station.subSkills) ? station.subSkills : [],
    // Computed fields (not saved to DB)
    effectiveSkills: station.effectiveSkills || [],
    subStationCount: Number.isFinite(station.subStationCount) ? Math.max(0, Number(station.subStationCount)) : subStations.length
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

// ============================================================================
// WORKERS NORMALIZATION
// ============================================================================

export function normalizeWorker(worker) {
  const workerId = worker.id || genId('WK-')
  
  // Normalize skills
  const skills = Array.isArray(worker.skills) 
    ? worker.skills 
    : (typeof worker.skills === 'string' ? worker.skills.split(',').map(s=>s.trim()).filter(Boolean) : [])
  
  // Normalize personalSchedule
  let personalSchedule = null
  if (worker.personalSchedule && typeof worker.personalSchedule === 'object') {
    const mode = (worker.personalSchedule.mode === 'personal' || worker.personalSchedule.mode === 'company') 
      ? worker.personalSchedule.mode 
      : 'company'
    personalSchedule = { mode }
    if (worker.personalSchedule.shiftNo) {
      personalSchedule.shiftNo = worker.personalSchedule.shiftNo
    }
    if (mode === 'personal' && worker.personalSchedule.blocks) {
      personalSchedule.blocks = worker.personalSchedule.blocks
    }
  }
  
  return {
    id: workerId,
    name: (worker.name || '').trim(),
    skills,
    personalSchedule,
    isActive: worker.isActive !== undefined ? worker.isActive : true,
    status: worker.status || 'available',
    // Optional fields
    email: worker.email || '',
    phone: worker.phone || '',
    currentTaskPlanId: worker.currentTaskPlanId || null,
    currentTaskNodeId: worker.currentTaskNodeId || null,
    currentTaskAssignmentId: worker.currentTaskAssignmentId || null,
    // Leave fields
    leaveStart: worker.leaveStart || null,
    leaveEnd: worker.leaveEnd || null,
    leaveReason: worker.leaveReason || null
  }
}

// ============================================================================
// WORKERS API
// ============================================================================

export async function getWorkers(force = false) {
  if (!force && Array.isArray(_workersCache)) return _workersCache
  const res = await fetch(`${API_BASE}/api/mes/workers`, { headers: withAuth() })
  if (!res.ok) throw new Error(`workers_load_failed ${res.status}`)
  const data = await res.json()
  _workersCache = Array.isArray(data) ? data : []
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
  // Backend may return empty array, normalize to expected structure
  if (Array.isArray(data)) {
    return {
      compatibleWorkers: data,
      requiredSkills: []
    }
  }
  return {
    compatibleWorkers: data.compatibleWorkers || [],
    requiredSkills: data.requiredSkills || []
  }
}

// Get stations where a specific worker can work
export async function getWorkerStations(workerId) {
  const res = await fetch(`${API_BASE}/api/mes/workers/${workerId}/stations`, { headers: withAuth() })
  if (!res.ok) throw new Error(`worker_stations_load_failed ${res.status}`)
  const data = await res.json()
  return data
}

// ============================================================================
// MATERIALS API
// ============================================================================

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

// Alias for getMaterials
export async function getGeneralMaterials(force = false) {
  return getMaterials(force);
}

// Check material availability for production plans
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

// ============================================================================
// PRODUCTION PLANS API
// ============================================================================

export async function createProductionPlan(plan) {
  const res = await fetch(`${API_BASE}/api/mes/production-plans`, {
    method: 'POST',
    headers: withAuth({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(plan)
  })
  if (!res.ok) throw new Error(`production_plan_create_failed ${res.status}`)
  return await res.json()
}

// Get production plan details with nodes and materials
export async function getProductionPlanDetails(planId) {
  const res = await fetch(`${API_BASE}/api/mes/production-plans/${encodeURIComponent(planId)}`, {
    headers: withAuth()
  })
  if (!res.ok) throw new Error(`production_plan_details_failed ${res.status}`)
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

// Fetch single production plan with full details (nodes, materials, stations)
export async function getProductionPlanById(planId) {
  const res = await fetch(`${API_BASE}/api/mes/production-plans/${planId}`, { headers: withAuth() })
  if (!res.ok) throw new Error(`production_plan_load_failed ${res.status}`)
  return await res.json()
}

// Fetch plan templates
export async function getPlanTemplates() {
  const res = await fetch(`${API_BASE}/api/mes/templates`, { headers: withAuth() })
  if (!res.ok) throw new Error(`templates_load_failed ${res.status}`)
  const data = await res.json()
  return Array.isArray(data?.templates) ? data.templates : []
}

// Generate next plan id: PPL-MMYY-XXX
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
    // Fallback: generate client-side unique id with new format PPL-MMYY-XXX
    const now = new Date()
    const month = String(now.getMonth() + 1).padStart(2, '0') // 01-12
    const yearShort = String(now.getFullYear()).slice(-2) // Last 2 digits
    const pad = (n) => String(n).padStart(3, '0') // XXX format
    const pseudo = Number(String(now.getTime()).slice(-3)) // last 3 digits
    return `PPL-${month}${yearShort}-${pad(pseudo)}`
  }
}

// Create or update a material
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

// Create or update WIP material from plan node
export async function upsertProducedWipFromNode(node, ops = [], stations = []) {
  const outputCode = node?.outputCode || node?.semiCode;
  if (!node || !outputCode) return null
  const station = Array.isArray(stations)
    ? stations.find(s => (s.id && s.id === node.assignedStation) || (s.name && s.name === node.assignedStation))
    : null
  const operation = Array.isArray(ops) ? ops.find(o => o.id === node.operationId) : null
  
  // Build input materials list with quantities for consumption tracking
  const inputs = Array.isArray(node.materialInputs) 
    ? node.materialInputs.map(m => ({ 
        id: m.materialCode, 
        code: m.materialCode,
        qty: m.requiredQuantity ?? null, 
        unit: m.unit || '' 
      })) 
    : []
  
  const body = {
    code: outputCode,
    name: node._outputName || outputCode,
    type: 'semi_finished',
    unit: node.outputUnit || '',
    stock: 0, // Initial stock is 0; updated during production
    category: 'SEMI_FINISHED',
    description: `Produced via Plan Canvas${station ? ` @ ${station.name || station.id}` : ''}`,
    status: 'Aktif',
    produced: true,
    productionHistory: [],
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

// ============================================================================
// WORKER ASSIGNMENTS API
// ============================================================================

export async function getWorkerAssignments(workerId, status = 'active') {
  const params = new URLSearchParams();
  if (status) params.append('status', status);
  
  const response = await authorizedFetch(`${API_BASE}/api/mes/workers/${workerId}/assignments?${params}`);
  if (!response.ok) throw new Error(`Failed to fetch worker assignments: ${response.statusText}`);
  
  const data = await response.json();
  return data.assignments || [];
}

// ============================================================================
// SUBSTATIONS API
// ============================================================================

export async function getSubstations(stationId = null) {
  const params = new URLSearchParams();
  if (stationId) params.append('stationId', stationId);
  
  const response = await authorizedFetch(`${API_BASE}/api/mes/substations?${params}`);
  if (!response.ok) throw new Error(`Failed to fetch substations: ${response.statusText}`);
  
  const data = await response.json();
  return data.substations || [];
}

export async function getSubstationDetails(substationId) {
  const response = await authorizedFetch(`${API_BASE}/api/mes/substations/${substationId}/details`);
  if (!response.ok) throw new Error(`Failed to fetch substation details: ${response.statusText}`);
  
  return await response.json();
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

// ============================================================================
// MASTER DATA API
// ============================================================================

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

// ========================================
// SQL-BASED SKILLS API (NEW)
// ========================================

// Get skills from SQL (mes.skills table)
export async function getSkillsFromSQL(force = false) {
  const res = await fetch(`${API_BASE}/api/mes/skills`, { headers: withAuth() })
  if (!res.ok) throw new Error(`skills_load_failed ${res.status}`)
  const data = await res.json()
  return Array.isArray(data) ? data : []
}

// Create skill in SQL with name and description
export async function createSkillInSQL(name, description = '') {
  const trimmedName = String(name || '').trim()
  if (!trimmedName) throw new Error('skill_name_required')
  
  const res = await fetch(`${API_BASE}/api/mes/skills`, {
    method: 'POST',
    headers: withAuth({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ name: trimmedName, description: String(description || '').trim() })
  })
  
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: 'skill_create_failed' }))
    throw new Error(error.error || `skill_create_failed ${res.status}`)
  }
  
  return await res.json()
}

// Update skill in SQL (name and/or description)
export async function updateSkillInSQL(skillId, name, description) {
  const res = await fetch(`${API_BASE}/api/mes/skills/${skillId}`, {
    method: 'PUT',
    headers: withAuth({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ name, description })
  })
  
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: 'skill_update_failed' }))
    throw new Error(error.error || `skill_update_failed ${res.status}`)
  }
  
  return await res.json()
}

// Delete skill from SQL (soft delete with protection)
export async function deleteSkillFromSQL(skillId) {
  const res = await fetch(`${API_BASE}/api/mes/skills/${skillId}`, {
    method: 'DELETE',
    headers: withAuth()
  })
  
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: 'skill_delete_failed' }))
    throw new Error(error.error || `skill_delete_failed ${res.status}`)
  }
  
  return await res.json()
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

// ============================================================================
// APPROVED QUOTES (WORK ORDERS) API
// ============================================================================

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
/**
 * Update a work package (assignment) with actions: start, pause, station_error, complete
 * PATCH /api/mes/work-packages/:id
 * 
 * @param {string} workPackageId - The assignment/work package ID
 * @param {Object} payload - Action payload { action, scrapQty?, stationNote?, actualOutputQuantity?, defectQuantity? }
 * @returns {Promise<Object>} Result with success, action, status, etc.
 * @throws {Error} With status, code, message, and details properties on failure
 */
export async function updateWorkPackage(workPackageId, payload) {
  if (!workPackageId) throw new Error('work_package_id_required');
  if (!payload || !payload.action) throw new Error('action_required');
  
  const res = await fetch(`${API_BASE}/api/mes/work-packages/${encodeURIComponent(workPackageId)}`, {
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
    const error = new Error(errorData.message || `work_package_update_failed ${res.status}`);
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
        assignmentId: workPackageId,
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
 * Cancel a production plan with progress tracking and material accounting
 * POST /api/mes/cancel-with-progress
 * 
 * @param {string} planId - The production plan ID to cancel
 * @param {Object} progressData - Production progress data
 * @param {number} progressData.actualOutputQuantity - Total output produced before cancellation
 * @param {number} progressData.defectQuantity - Total defects produced before cancellation
 * @returns {Promise<Object>} Result with cancelled counts and material adjustments
 * @throws {Error} With status, code, and message properties on failure
 */
export async function cancelProductionPlanWithProgress(planId, progressData) {
  const res = await fetch(`${API_BASE}/api/mes/cancel-with-progress`, {
    method: 'POST',
    headers: withAuth({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({
      planId,
      actualOutputQuantity: progressData.actualOutputQuantity,
      defectQuantity: progressData.defectQuantity
    })
  });
  
  if (!res.ok) {
    let errorData;
    try {
      errorData = await res.json();
    } catch {
      errorData = { error: 'unknown_error', message: `HTTP ${res.status}` };
    }
    
    const error = new Error(errorData.message || `cancel_with_progress_failed ${res.status}`);
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
// OUTPUT MATERIAL CREATION API
// ============================================================================

/**
 * Create output materials from production plan nodes
 * Called when saving template or production plan (NOT draft)
 * 
 * @param {Array} nodes - Nodes with _isNewOutput flag
 * @returns {Promise<Object>} - { created, failed, materials, errors }
 */
export async function createOutputMaterials(nodes) {
  const materialsToCreate = [];
  
  for (const node of nodes) {
    if (!node._isNewOutput || !node._outputNeedsCreation) continue;
    
    // Determine category and type based on final node flag
    const isFinalNode = node._isFinalNode || false;
    const category = isFinalNode ? 'cat_finished_product' : 'cat_semi_finished';
    const type = isFinalNode ? 'finished_product' : 'semi_finished';
    
    materialsToCreate.push({
      code: node.outputCode,
      name: node._outputName,
      unit: node.outputUnit,
      category: category,
      type: type,
      status: 'Aktif',
      stock: 0,
      reserved: 0,
      wipReserved: 0,
      reorderPoint: 0,
      description: `Auto-created from production plan${isFinalNode ? ' (Final Product)' : ''}`
    });
  }
  
  if (materialsToCreate.length === 0) {
    return { created: 0, failed: 0, materials: [], errors: [] };
  }
  
  // Batch create materials
  const res = await fetch(`${API_BASE}/api/materials/batch`, {
    method: 'POST',
    headers: withAuth({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ materials: materialsToCreate })
  });
  
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.message || 'Failed to create materials');
  }
  
  const result = await res.json();
  console.log(`✅ Created ${result.created} output materials`);
  
  // Check if any materials failed to create
  if (result.failed > 0) {
    const errorDetails = result.errors.map(e => `${e.code}: ${e.error}`).join(', ');
    throw new Error(`Failed to create ${result.failed} material(s): ${errorDetails}`);
  }
  
  return result;
}

