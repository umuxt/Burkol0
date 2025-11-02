// Station management backed by backend API using mesApi
import { getStations, saveStations, getOperations, normalizeStation, computeStationInheritedSkills, getMasterData, addSkill, invalidateStationsCache } from './mesApi.js'
import { showToast } from './ui.js'

let stationsState = []
let operationsCache = []
export let editingStationId = null
let activeOperationTypeTab = 'all' // Add active tab tracking

export async function initializeStationsUI() {
  await loadStationsAndRender()
}

async function loadStationsAndRender() {
  const list = document.getElementById('stations-list')
  if (list) list.innerHTML = '<div style="padding:12px;color:#888;">Loading stations...</div>'
  try {
    operationsCache = await getOperations(true)
    stationsState = await getStations()
    renderStations()
  } catch (e) {
    console.error('Stations load error:', e)
    if (list) list.innerHTML = '<div style="padding:12px;color:#ef4444;">Stations yüklenemedi.</div>'
    showToast('Stations yüklenemedi', 'error')
  }
}

function renderStations() {
  const tabsContainer = document.getElementById('stations-tabs')
  const tableBody = document.getElementById('stations-list')
  
  if (!tabsContainer || !tableBody) return
  
  if (!stationsState.length) {
    tableBody.innerHTML = '<tr><td colspan="5" style="padding:20px;color:#666;text-align:center;">No stations yet. Add a station.</td></tr>'
    tabsContainer.innerHTML = ''
    return
  }
  
  // Create operation map for quick lookup
  const opMap = new Map(operationsCache.map(o => [o.id, o]))
  
  // Get all unique operation types from stations' operations
  const allOperationTypes = new Set()
  stationsState.forEach(station => {
    (station.operationIds || []).forEach(opId => {
      const operation = opMap.get(opId)
      if (operation && operation.type) {
        allOperationTypes.add(operation.type)
      }
    })
  })
  
  // Convert to sorted array for consistent ordering
  const operationTypesArray = Array.from(allOperationTypes).sort()
  
  // Filter stations based on active tab
  const filteredStations = activeOperationTypeTab === 'all' 
    ? stationsState 
    : stationsState.filter(station => {
        const stationOperationTypes = (station.operationIds || [])
          .map(opId => opMap.get(opId)?.type)
          .filter(Boolean)
        return stationOperationTypes.includes(activeOperationTypeTab)
      })
  
  // Create tabs
  const tabs = [
    { id: 'all', label: 'Tümünü Göster', count: stationsState.length },
    ...operationTypesArray.map(type => ({
      id: type,
      label: type,
      count: stationsState.filter(station => {
        const stationOperationTypes = (station.operationIds || [])
          .map(opId => opMap.get(opId)?.type)
          .filter(Boolean)
        return stationOperationTypes.includes(type)
      }).length
    }))
  ]
  
  // Render tabs
  tabsContainer.innerHTML = tabs.map(tab => `
    <button 
      class="tab-button ${activeOperationTypeTab === tab.id ? 'active' : ''}"
      onclick="setActiveStationTab('${tab.id}')"
    >
      ${escapeHtml(tab.label)}
      <span class="tab-count">(${tab.count})</span>
    </button>
  `).join('')
  
  // Render table rows
  tableBody.innerHTML = filteredStations.map(station => {
    const statusBadge = station.status === 'active' ? 'success' : (station.status === 'maintenance' ? 'warning' : 'default')
    const inherited = computeStationInheritedSkills(station.operationIds || [], operationsCache)
    const effective = Array.from(new Set([...(station.subSkills||[]), ...inherited]))
    const opsLabels = (station.operationIds || []).map(id => opMap.get(id)?.name || id)
    
    // Use description as tooltip for the entire row
    const description = station.description || ''
    
    return `
      <tr onclick="editStation('${station.id}')" style="cursor: pointer;" title="${escapeHtml(description)}" data-tooltip="${escapeHtml(description)}">
        <td>
          <div style="font-weight: 500;">${escapeHtml(station.name || '')}</div>
        </td>
        <td>
          <span class="badge badge-${statusBadge}" onclick="event.stopPropagation(); toggleStationStatus('${station.id}')" style="cursor: pointer;">${escapeHtml((station.status||'').toString())}</span>
        </td>
        <td>
          ${escapeHtml(station.location || '-')}
        </td>
        <td>
          <div style="display: flex; flex-wrap: wrap; gap: 4px;">
            ${opsLabels.slice(0, 3).map(name => 
              `<span class="badge badge-outline" style="font-size: 0.75rem;">${escapeHtml(name)}</span>`
            ).join('')}
            ${opsLabels.length > 3 ? `<span class="badge badge-outline" style="font-size: 0.75rem;">+${opsLabels.length - 3}</span>` : ''}
          </div>
        </td>
        <td>
          <div style="display: flex; flex-wrap: wrap; gap: 4px;">
            ${effective.slice(0, 3).map(skill => 
              `<span class="badge badge-outline" style="font-size: 0.75rem;">${escapeHtml(skill)}</span>`
            ).join('')}
            ${effective.length > 3 ? `<span class="badge badge-outline" style="font-size: 0.75rem;">+${effective.length - 3}</span>` : ''}
          </div>
        </td>
      </tr>`
  }).join('')
  
  // Setup fast tooltips by disabling browser default and using our CSS tooltip
  setTimeout(() => {
    const stationRows = document.querySelectorAll('#stations-table tbody tr[data-tooltip]')
    stationRows.forEach(row => {
      let originalTitle = row.getAttribute('title')
      
      row.addEventListener('mouseenter', () => {
        // Remove title to prevent browser tooltip, our CSS tooltip will show
        row.removeAttribute('title')
      })
      
      row.addEventListener('mouseleave', () => {
        // Restore title for accessibility
        if (originalTitle) {
          row.setAttribute('title', originalTitle)
        }
      })
    })
  }, 0)
}

export function openAddStationModal() {
  editingStationId = null
  fillStationModal({})
  document.getElementById('station-modal-title').textContent = 'Add New Station'
  document.getElementById('station-delete-btn').style.display = 'none'
  document.getElementById('station-modal').style.display = 'block'
}

export function editStation(stationId) {
  editingStationId = stationId
  const station = stationsState.find(s => s.id === stationId)
  if (!station) return
  fillStationModal(station)
  document.getElementById('station-modal-title').textContent = 'Edit Station'
  document.getElementById('station-delete-btn').style.display = 'block'
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
    const md = await getMasterData()
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
    // Invalidate stations cache and refetch fresh list post-change
    invalidateStationsCache()
    stationsState = await getStations()
    renderStations()
    showToast('Station deleted', 'success')
  } catch (e) {
    console.error('Station delete error:', e)
    showToast('Station could not be deleted', 'error')
  }
}

// Tab filtering function
export function setActiveStationTab(tabId) {
  activeOperationTypeTab = tabId
  renderStations()
}

// Delete station from modal
export function deleteStationFromModal() {
  if (!editingStationId) return
  deleteStation(editingStationId)
  document.getElementById('station-modal').style.display = 'none'
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}
