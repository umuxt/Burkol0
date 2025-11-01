// Station management backed by backend API using mesApi
import { getStations, saveStations, getOperations, normalizeStation, computeStationInheritedSkills, getMasterData, addSkill } from './mesApi.js'
import { showToast } from './ui.js'

let stationsState = []
let operationsCache = []
export let editingStationId = null

export async function initializeStationsUI() {
  await loadStationsAndRender()
}

async function loadStationsAndRender() {
  const list = document.getElementById('stations-list')
  if (list) list.innerHTML = '<div style="padding:12px;color:#888;">Loading stations...</div>'
  try {
    operationsCache = await getOperations(true)
    stationsState = await getStations(true)
    renderStations()
  } catch (e) {
    console.error('Stations load error:', e)
    if (list) list.innerHTML = '<div style="padding:12px;color:#ef4444;">Stations yüklenemedi.</div>'
    showToast('Stations yüklenemedi', 'error')
  }
}

function renderStations() {
  const list = document.getElementById('stations-list')
  if (!list) return
  if (!stationsState.length) {
    list.innerHTML = '<div style="padding:12px;color:#666;">No stations yet. Add a station.</div>'
    return
  }
  const opMap = new Map(operationsCache.map(o => [o.id, o]))
  list.innerHTML = stationsState.map(station => {
    const statusBadge = station.status === 'active' ? 'success' : (station.status === 'maintenance' ? 'warning' : 'default')
    const inherited = computeStationInheritedSkills(station.operationIds || [], operationsCache)
    const effective = Array.from(new Set([...(station.subSkills||[]), ...inherited]))
    const opsLabels = (station.operationIds || []).map(id => opMap.get(id)?.name || id)
    return `
      <div class="card">
        <div class="card-header"><div class="card-title">${escapeHtml(station.name || '')}</div><div class="card-description">${escapeHtml(station.description || '')}</div></div>
        <div class="card-content">
          <div style="margin-bottom: 8px;"><strong>Status:</strong> <span class="badge badge-${statusBadge}">${escapeHtml((station.status||'').toString())}</span></div>
          <div style="margin-bottom: 8px;"><strong>Operations:</strong> ${opsLabels.map(n=>`<span class="badge badge-outline" style="margin-right:4px;">${escapeHtml(n)}</span>`).join('')}</div>
          <div style="margin-bottom: 8px;"><strong>Skills (heritable + sub):</strong> ${effective.map(s=>`<span class="badge badge-outline" style="margin-right:4px;">${escapeHtml(s)}</span>`).join('')}</div>
          <div style="display:flex; gap:8px;">
            <button onclick="editStation('${station.id}')" style="padding:6px 12px; background:white; border:1px solid var(--border); border-radius:6px; cursor:pointer;">Edit</button>
            <button onclick="toggleStationStatus('${station.id}')" style="padding:6px 12px; background:white; border:1px solid var(--border); border-radius:6px; cursor:pointer;">${station.status==='active'?'Set Maintenance':'Set Active'}</button>
            <button onclick="deleteStation('${station.id}')" style="padding:6px 12px; background:white; border:1px solid #ef4444; color:#ef4444; border-radius:6px; cursor:pointer;">Delete</button>
          </div>
        </div>
      </div>`
  }).join('')
}

export function openAddStationModal() {
  editingStationId = null
  fillStationModal({})
  document.getElementById('station-modal-title').textContent = 'Add New Station'
  document.getElementById('station-modal').style.display = 'block'
}

export function editStation(stationId) {
  editingStationId = stationId
  const station = stationsState.find(s => s.id === stationId)
  if (!station) return
  fillStationModal(station)
  document.getElementById('station-modal-title').textContent = 'Edit Station'
  document.getElementById('station-modal').style.display = 'block'
}

function fillStationModal(station) {
  document.getElementById('station-name').value = station.name || ''
  document.getElementById('station-description').value = station.description || ''
  document.getElementById('station-location').value = station.location || ''
  document.getElementById('station-status').value = station.status || 'active'
  // operations checkboxes
  const opsContainer = document.getElementById('station-operations')
  const selected = new Set(station.operationIds || [])
  opsContainer.innerHTML = (operationsCache||[]).map(op => {
    const checked = selected.has(op.id) ? 'checked' : ''
    return `<div style="margin-bottom: 8px;"><label style="display: flex; align-items: center; gap: 8px;"><input type="checkbox" value="${op.id}" ${checked}> ${escapeHtml(op.name)}</label></div>`
  }).join('')
  // sub-skills checkboxes from master-data with inline add
  renderStationSubskillsBox(station)
}

async function renderStationSubskillsBox(station) {
  const inputHost = document.getElementById('station-subskills')
  const container = document.createElement('div')
  container.id = 'station-subskills-box'
  inputHost.replaceWith(container)
  container.innerHTML = '<div style="color:#888;">Loading skills...</div>'
  try {
    const md = await getMasterData(true)
    const selected = new Set(Array.isArray(station.subSkills) ? station.subSkills : [])
    container.innerHTML = `
      <div style="display:flex; gap:8px; margin-bottom:8px;">
        <input id="station-skill-new" type="text" placeholder="Yeni skill" style="flex:1; padding:6px 8px; border:1px solid var(--border); border-radius:6px;">
        <button id="station-skill-add" style="padding:6px 8px; border:1px solid var(--border); background:white; border-radius:6px;">+ Ekle</button>
      </div>
      <div id="station-skills-list" style="display:grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap:6px;"></div>`
    const list = container.querySelector('#station-skills-list')
    list.innerHTML = md.skills.map(s => {
      const checked = selected.has(s.name) ? 'checked' : ''
      return `<label style=\"display:flex; align-items:center; gap:8px;\"><input type=\"checkbox\" value=\"${escapeHtml(s.name)}\" ${checked}> ${escapeHtml(s.name)}</label>`
    }).join('')
    container.querySelector('#station-skill-add').onclick = async () => {
      const inp = document.getElementById('station-skill-new')
      const name = inp?.value?.trim()
      if (!name) return
      try {
        const created = await addSkill(name)
        // Auto-check the newly added skill by updating selected set
        station.subSkills = Array.from(new Set([...(station.subSkills||[]), created.name]))
        await renderStationSubskillsBox(station)
        inp.value=''
      } catch {}
    }
  } catch (e) {
    console.error('renderStationSubskillsBox error', e)
    container.innerHTML = '<div style="color:#ef4444;">Skills yüklenemedi</div>'
  }
}

export function closeStationModal(event) {
  if (event && event.target !== event.currentTarget) return
  document.getElementById('station-modal').style.display = 'none'
}

export async function saveStation() {
  const name = document.getElementById('station-name').value.trim()
  const description = document.getElementById('station-description').value.trim()
  const location = document.getElementById('station-location').value.trim()
  const status = document.getElementById('station-status').value
  const operationIds = Array.from(document.querySelectorAll('#station-operations input[type="checkbox"]:checked')).map(cb => cb.value)
  const subSkills = Array.from(document.querySelectorAll('#station-subskills-box input[type="checkbox"]:checked')).map(cb => cb.value)

  if (!name) { showToast('Please enter a station name', 'error'); return }
  if (operationIds.length < 1) { showToast('Select at least one operation for this station', 'warning'); return }

  const payload = normalizeStation({
    id: editingStationId,
    name, description, location, status, operationIds, subSkills
  }, operationsCache)

  const idx = stationsState.findIndex(s => s.id === payload.id)
  if (idx >= 0) stationsState[idx] = { ...stationsState[idx], ...payload }
  else stationsState.push(payload)

  try {
    await saveStations(stationsState)
    document.getElementById('station-modal').style.display = 'none'
    renderStations()
    showToast(editingStationId ? 'Station updated' : 'Station added', 'success')
  } catch (e) {
    console.error('Station save error:', e)
    showToast('Station could not be saved', 'error')
  }
}

export async function toggleStationStatus(stationId) {
  const idx = stationsState.findIndex(s => s.id === stationId)
  if (idx < 0) return
  const station = stationsState[idx]
  const next = { ...station, status: station.status === 'active' ? 'maintenance' : 'active' }
  stationsState[idx] = next
  try {
    await saveStations(stationsState)
    renderStations()
    showToast('Station status updated', 'success')
  } catch (e) {
    console.error('Station status save error:', e)
    showToast('Station status update failed', 'error')
  }
}

export async function deleteStation(stationId) {
  if (!confirm('Are you sure you want to delete this station?')) return
  try {
    // Prefer backend delete to avoid failing batch validations
    const { API_BASE, withAuth } = await import('../../src/lib/api.js')
    const res = await fetch(`${API_BASE}/api/mes/stations/${encodeURIComponent(stationId)}`, { method: 'DELETE', headers: withAuth() })
    if (!res.ok) throw new Error(`delete_failed ${res.status}`)
    // Refresh from backend to ensure consistency
    stationsState = await getStations(true)
    renderStations()
    showToast('Station deleted', 'success')
  } catch (e) {
    console.error('Station delete error:', e)
    showToast('Station could not be deleted', 'error')
  }
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}
