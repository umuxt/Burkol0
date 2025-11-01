// Shared MES API helpers for Operations, Stations, Workers
// Uses backend endpoints implemented in server/mesRoutes.js
import { API_BASE, withAuth } from '../../src/lib/api.js'

let _operationsCache = null
let _stationsCache = null
let _workersCache = null

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
    skills: Array.isArray(op.skills)
      ? op.skills
      : (typeof op.skills === 'string' ? op.skills.split(',').map(s=>s.trim()).filter(Boolean) : []),
    defaultDuration: Number.isFinite(op.defaultDuration) ? op.defaultDuration : (Number(op.duration) || 30),
    qualityCheck: Boolean(op.qualityCheck),
    active: op.active !== false
  }
}

export async function getStations(force = false) {
  if (!force && Array.isArray(_stationsCache)) return _stationsCache
  const res = await fetch(`${API_BASE}/api/mes/stations`, { headers: withAuth() })
  if (!res.ok) throw new Error(`stations_load_failed ${res.status}`)
  const data = await res.json()
  _stationsCache = Array.isArray(data?.stations) ? data.stations : []
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
  return true
}

export function normalizeStation(station, operations) {
  const opIds = Array.isArray(station.operationIds) ? station.operationIds : []
  const subSkills = Array.isArray(station.subSkills)
    ? station.subSkills
    : (typeof station.subSkills === 'string' ? station.subSkills.split(',').map(s=>s.trim()).filter(Boolean) : [])
  const inherited = computeStationInheritedSkills(opIds, operations)
  const effectiveSkills = Array.from(new Set([ ...inherited, ...subSkills ]))
  return {
    id: station.id || genId('s-'),
    name: (station.name || '').trim(),
    description: (station.description || '').trim(),
    location: (station.location || '').trim(),
    status: station.status || 'active',
    operationIds: opIds,
    subSkills,
    effectiveSkills,
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
  // normalize skills
  _workersCache = _workersCache.map(w => ({
    ...w,
    skills: Array.isArray(w.skills) ? w.skills : (typeof w.skills === 'string' ? w.skills.split(',').map(s=>s.trim()).filter(Boolean) : [])
  }))
  return _workersCache
}

export function genId(prefix = '') { return `${prefix}${Math.random().toString(36).slice(2, 9)}` }

// Master Data (skills, operation types)
let _masterDataCache = null
export async function getMasterData(force = false) {
  if (!force && _masterDataCache) return _masterDataCache
  const res = await fetch(`${API_BASE}/api/mes/master-data`, { headers: withAuth() })
  if (!res.ok) throw new Error(`master_data_load_failed ${res.status}`)
  const data = await res.json()
  const normalized = normalizeMasterData(data)
  _masterDataCache = normalized
  return _masterDataCache
}

export async function saveMasterData({ skills, operationTypes }) {
  const body = {
    availableSkills: (skills || []).map(s => ({ id: s.id, name: s.name })),
    availableOperationTypes: Array.isArray(operationTypes) ? operationTypes : []
  }
  const res = await fetch(`${API_BASE}/api/mes/master-data`, {
    method: 'POST',
    headers: withAuth({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(body)
  })
  if (!res.ok) throw new Error(`master_data_save_failed ${res.status}`)
  _masterDataCache = normalizeMasterData(body)
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
  const operationTypes = Array.isArray(data?.availableOperationTypes) ? data.availableOperationTypes : []
  return { skills, operationTypes }
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
  const md = await getMasterData(true)
  const code = nextSkillCode(md.skills)
  const skill = { id: code, name: String(name||'').trim() }
  if (!skill.name) throw new Error('skill_name_required')
  const updated = { ...md, skills: [...md.skills, skill] }
  await saveMasterData(updated)
  return skill
}

