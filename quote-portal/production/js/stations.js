// Station management backed by backend API using mesApi
import { getStations, saveStations, getOperations, normalizeStation, computeStationInheritedSkills, getMasterData, addSkill, invalidateStationsCache } from './mesApi.js'
import { showToast } from './ui.js'

let stationsState = []
let operationsCache = []
export let editingStationId = null
let activeOperationTypeTab = 'all' // Add active tab tracking

// Filter state
let stationFilters = {
  search: '',
  status: new Set(),
  skills: new Set(),
  operations: new Set()
}

export async function initializeStationsUI() {
  await loadStationsAndRender()
  setupStationFilters()
}

// Helper function to generate combined operation codes in alphabetical order
function generateCombinedOperationCode(operationIds) {
  if (!operationIds || operationIds.length === 0) return ''
  
  const opMap = new Map(operationsCache.map(o => [o.id, o]))
  const codes = operationIds
    .map(id => opMap.get(id)?.semiOutputCode)
    .filter(code => code && code.trim() !== '')
    .sort() // Alphabetical order
  
  return Array.from(new Set(codes)).join('') // Remove duplicates and join
}

// Helper function to generate next station ID based on operation codes
async function generateStationId(operationIds) {
  const combinedCode = generateCombinedOperationCode(operationIds)
  if (!combinedCode) {
    throw new Error('At least one operation with valid semiOutputCode is required')
  }
  
  // Find existing stations with same operation code pattern
  const sameCodeStations = stationsState.filter(station => {
    const stationCode = generateCombinedOperationCode(station.operationIds || [])
    return stationCode === combinedCode
  })
  
  // Generate next index (pad with zeros to 3 digits)
  const nextIndex = sameCodeStations.length + 1
  const paddedIndex = nextIndex.toString().padStart(3, '0')
  
  return `ST-${combinedCode}-${paddedIndex}`
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
  let filteredStations = activeOperationTypeTab === 'all' 
    ? stationsState 
    : stationsState.filter(station => {
        const stationOperationTypes = (station.operationIds || [])
          .map(opId => opMap.get(opId)?.type)
          .filter(Boolean)
        return stationOperationTypes.includes(activeOperationTypeTab)
      })

  // Apply additional filters
  filteredStations = applyStationFilters(filteredStations)
  
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
  
  // Render tabs as integrated part of table
  tabsContainer.innerHTML = tabs.map(tab => `
    <button 
      class="station-tab-button ${activeOperationTypeTab === tab.id ? 'active' : ''}"
      onclick="setActiveStationTab('${tab.id}')"
      style="padding: 6px 12px; font-size: 12px; border: none; background: ${activeOperationTypeTab === tab.id ? 'white' : 'transparent'}; border-radius: 4px; cursor: pointer; margin-right: 6px; font-weight: ${activeOperationTypeTab === tab.id ? '600' : '400'}; color: ${activeOperationTypeTab === tab.id ? 'rgb(17, 24, 39)' : 'rgb(75, 85, 99)'}; box-shadow: ${activeOperationTypeTab === tab.id ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'}; transition: all 0.2s ease;"
    >
      ${escapeHtml(tab.label)}
      <span style="color: var(--muted-foreground); font-size: 11px; margin-left: 4px;">(${tab.count})</span>
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
      <tr onclick="showStationDetail('${station.id}')" style="cursor:pointer; background-color: white; border-bottom: 1px solid rgb(243, 244, 246);" title="${escapeHtml(description)}" data-tooltip="${escapeHtml(description)}">
        <td style="padding: 4px 8px;">
          <span style="font-family: monospace; font-size: 11px; color: rgb(107, 114, 128);">${escapeHtml(station.id || '')}</span>
        </td>
        <td style="padding: 4px 8px;">
          <strong>${escapeHtml(station.name || '')}</strong>
        </td>
        <td style="padding: 4px 8px;">
          <div style="display: flex; flex-wrap: wrap; gap: 4px;">
            ${opsLabels.slice(0, 3).map(name => 
              `<span style="background-color: rgb(243, 244, 246); color: rgb(107, 114, 128); padding: 2px 6px; border-radius: 4px; font-size: 11px; font-weight: 500;">${escapeHtml(name)}</span>`
            ).join('')}
            ${opsLabels.length > 3 ? `<span style="background-color: rgb(243, 244, 246); color: rgb(107, 114, 128); padding: 2px 6px; border-radius: 4px; font-size: 11px; font-weight: 500;">+${opsLabels.length - 3}</span>` : ''}
          </div>
        </td>
        <td style="padding: 4px 8px;">
          <div style="display: flex; flex-wrap: wrap; gap: 4px;">
            ${effective.slice(0, 3).map(skill => 
              `<span style="background-color: rgb(243, 244, 246); color: rgb(107, 114, 128); padding: 2px 6px; border-radius: 4px; font-size: 11px; font-weight: 500;">${escapeHtml(skill)}</span>`
            ).join('')}
            ${effective.length > 3 ? `<span style="background-color: rgb(243, 244, 246); color: rgb(107, 114, 128); padding: 2px 6px; border-radius: 4px; font-size: 11px; font-weight: 500;">+${effective.length - 3}</span>` : ''}
          </div>
        </td>
        <td style="padding: 4px 8px;">
          <span class="badge badge-${statusBadge}" onclick="event.stopPropagation(); toggleStationStatus('${station.id}')" style="cursor: pointer;">${escapeHtml((station.status||'').toString())}</span>
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

  // Update filter counts after rendering
  updateFilterCounts()
}

// Filter setup and functionality
function setupStationFilters() {
  const searchInput = document.getElementById('station-filter-search')
  const statusBtn = document.getElementById('station-filter-status-btn')
  const skillsBtn = document.getElementById('station-filter-skills-btn')
  const operationsBtn = document.getElementById('station-filter-operations-btn')
  const clearAllBtn = document.getElementById('station-filter-clear-all')

  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      stationFilters.search = e.target.value.toLowerCase()
      renderStations()
    })
  }

  if (statusBtn) {
    statusBtn.addEventListener('click', () => toggleFilterPanel('status'))
  }

  if (skillsBtn) {
    skillsBtn.addEventListener('click', () => toggleFilterPanel('skills'))
  }

  if (operationsBtn) {
    operationsBtn.addEventListener('click', () => toggleFilterPanel('operations'))
  }

  if (clearAllBtn) {
    clearAllBtn.addEventListener('click', clearAllFilters)
  }

  // Setup filter panels
  setupFilterPanel('status')
  setupFilterPanel('skills') 
  setupFilterPanel('operations')

  // Close panels when clicking outside
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#station-filter-status') && !e.target.closest('#station-filter-skills') && !e.target.closest('#station-filter-operations')) {
      closeAllFilterPanels()
    }
  })
}

function toggleFilterPanel(filterType) {
  const panelId = `station-filter-${filterType}-panel`
  const panel = document.getElementById(panelId)
  
  if (!panel) return

  // Close other panels first
  closeAllFilterPanels()
  
  // Toggle current panel
  const isHidden = panel.style.display === 'none' || !panel.style.display
  panel.style.display = isHidden ? 'block' : 'none'
  
  if (isHidden) {
    populateFilterPanel(filterType)
  }
}

function closeAllFilterPanels() {
  const panels = ['status', 'skills', 'operations']
  panels.forEach(type => {
    const panel = document.getElementById(`station-filter-${type}-panel`)
    if (panel) panel.style.display = 'none'
  })
}

function setupFilterPanel(filterType) {
  const clearBtn = document.getElementById(`station-filter-${filterType}-clear`)
  const hideBtn = document.getElementById(`station-filter-${filterType}-hide`)
  
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      stationFilters[filterType].clear()
      renderStations()
      populateFilterPanel(filterType)
    })
  }
  
  if (hideBtn) {
    hideBtn.addEventListener('click', () => {
      document.getElementById(`station-filter-${filterType}-panel`).style.display = 'none'
    })
  }

  if (filterType === 'skills') {
    const searchInput = document.getElementById('station-filter-skills-search')
    if (searchInput) {
      searchInput.addEventListener('input', () => populateFilterPanel('skills'))
    }
  }

  if (filterType === 'operations') {
    const searchInput = document.getElementById('station-filter-operations-search')
    if (searchInput) {
      searchInput.addEventListener('input', () => populateFilterPanel('operations'))
    }
  }
}

function populateFilterPanel(filterType) {
  const listContainer = document.getElementById(`station-filter-${filterType}-list`)
  if (!listContainer) return

  let items = []
  
  if (filterType === 'status') {
    const statuses = ['active', 'maintenance', 'inactive']
    items = statuses.map(status => ({
      value: status,
      label: status,
      count: stationsState.filter(s => s.status === status).length
    }))
  } else if (filterType === 'skills') {
    const searchTerm = document.getElementById('station-filter-skills-search')?.value?.toLowerCase() || ''
    const skillSet = new Set()
    stationsState.forEach(station => {
      const inherited = computeStationInheritedSkills(station.operationIds || [], operationsCache)
      const effective = Array.from(new Set([...(station.subSkills||[]), ...inherited]))
      effective.forEach(skill => skillSet.add(skill))
    })
    items = Array.from(skillSet)
      .filter(skill => skill.toLowerCase().includes(searchTerm))
      .sort()
      .map(skill => ({
        value: skill,
        label: skill,
        count: stationsState.filter(station => {
          const inherited = computeStationInheritedSkills(station.operationIds || [], operationsCache)
          const effective = Array.from(new Set([...(station.subSkills||[]), ...inherited]))
          return effective.includes(skill)
        }).length
      }))
  } else if (filterType === 'operations') {
    const searchTerm = document.getElementById('station-filter-operations-search')?.value?.toLowerCase() || ''
    const opMap = new Map(operationsCache.map(o => [o.id, o]))
    const operationSet = new Set()
    stationsState.forEach(station => {
      (station.operationIds || []).forEach(opId => {
        const operation = opMap.get(opId)
        if (operation) operationSet.add(operation.name)
      })
    })
    items = Array.from(operationSet)
      .filter(op => op.toLowerCase().includes(searchTerm))
      .sort()
      .map(operation => ({
        value: operation,
        label: operation,
        count: stationsState.filter(station => {
          const stationOps = (station.operationIds || []).map(opId => opMap.get(opId)?.name).filter(Boolean)
          return stationOps.includes(operation)
        }).length
      }))
  }

  listContainer.innerHTML = items.map(item => `
    <label style="display: flex; align-items: center; gap: 8px; padding: 4px; cursor: pointer; font-size: 12px;">
      <input type="checkbox" 
             value="${escapeHtml(item.value)}" 
             ${stationFilters[filterType].has(item.value) ? 'checked' : ''}
             onchange="handleFilterChange('${filterType}', '${escapeHtml(item.value)}', this.checked)">
      <span style="flex: 1;">${escapeHtml(item.label)}</span>
      <span style="color: var(--muted-foreground); font-size: 11px;">(${item.count})</span>
    </label>
  `).join('')

  updateFilterCounts()
}

function handleFilterChange(filterType, value, checked) {
  if (checked) {
    stationFilters[filterType].add(value)
  } else {
    stationFilters[filterType].delete(value)
  }
  renderStations()
  updateFilterCounts()
}

function updateFilterCounts() {
  const statusCount = document.getElementById('station-filter-status-count')
  const skillsCount = document.getElementById('station-filter-skills-count')
  const operationsCount = document.getElementById('station-filter-operations-count')
  const clearAllBtn = document.getElementById('station-filter-clear-all')

  if (statusCount) {
    statusCount.textContent = stationFilters.status.size > 0 ? `(${stationFilters.status.size})` : ''
  }
  if (skillsCount) {
    skillsCount.textContent = stationFilters.skills.size > 0 ? `(${stationFilters.skills.size})` : ''
  }
  if (operationsCount) {
    operationsCount.textContent = stationFilters.operations.size > 0 ? `(${stationFilters.operations.size})` : ''
  }

  // Show/hide clear all button
  const hasActiveFilters = stationFilters.search || 
                          stationFilters.status.size > 0 || 
                          stationFilters.skills.size > 0 || 
                          stationFilters.operations.size > 0
  if (clearAllBtn) {
    clearAllBtn.style.display = hasActiveFilters ? 'block' : 'none'
  }
}

function clearAllFilters() {
  stationFilters.search = ''
  stationFilters.status.clear()
  stationFilters.skills.clear()
  stationFilters.operations.clear()
  
  const searchInput = document.getElementById('station-filter-search')
  if (searchInput) searchInput.value = ''
  
  renderStations()
  updateFilterCounts()
  closeAllFilterPanels()
}

function applyStationFilters(stations) {
  return stations.filter(station => {
    // Search filter
    if (stationFilters.search) {
      const searchable = [
        station.id,
        station.name,
        station.description
      ].join(' ').toLowerCase()
      if (!searchable.includes(stationFilters.search)) return false
    }

    // Status filter
    if (stationFilters.status.size > 0) {
      if (!stationFilters.status.has(station.status)) return false
    }

    // Skills filter
    if (stationFilters.skills.size > 0) {
      const inherited = computeStationInheritedSkills(station.operationIds || [], operationsCache)
      const effective = Array.from(new Set([...(station.subSkills||[]), ...inherited]))
      const hasMatchingSkill = Array.from(stationFilters.skills).some(skill => effective.includes(skill))
      if (!hasMatchingSkill) return false
    }

    // Operations filter
    if (stationFilters.operations.size > 0) {
      const opMap = new Map(operationsCache.map(o => [o.id, o]))
      const stationOps = (station.operationIds || []).map(opId => opMap.get(opId)?.name).filter(Boolean)
      const hasMatchingOperation = Array.from(stationFilters.operations).some(op => stationOps.includes(op))
      if (!hasMatchingOperation) return false
    }

    return true
  })
}

// Add global handler function for filter checkboxes
window.handleFilterChange = handleFilterChange

export function openAddStationModal() {
  editingStationId = null
  fillStationModal({})
  document.getElementById('station-modal-title').textContent = 'Add New Station'
  document.getElementById('station-delete-btn').style.display = 'none'
  document.getElementById('station-modal').style.display = 'block'
}

export function showStationDetail(stationId) {
  const station = stationsState.find(s => s.id === stationId)
  if (!station) return
  
  const detailPanel = document.getElementById('station-detail-panel')
  const detailContent = document.getElementById('station-detail-content')
  
  if (!detailPanel || !detailContent) return
  
  // Show detail panel
  detailPanel.style.display = 'block'
  
  // Generate station detail content
  const inherited = computeStationInheritedSkills(station.operationIds || [], operationsCache)
  const effective = Array.from(new Set([...(station.subSkills||[]), ...inherited]))
  const opsLabels = (station.operationIds || []).map(id => {
    const op = operationsCache.find(o => o.id === id)
    return op ? op.name : id
  })
  
  detailContent.innerHTML = `
    <div style="margin-bottom: 16px; padding: 12px; background: white; border-radius: 6px; border: 1px solid var(--border);">
      <h3 style="margin: 0 0 12px; font-size: 14px; font-weight: 600; color: rgb(17, 24, 39); border-bottom: 1px solid var(--border); padding-bottom: 6px;">Temel Bilgiler</h3>
      <div class="detail-item" style="display: flex; align-items: flex-start; margin-bottom: 8px;">
        <span class="detail-label" style="font-weight: 600; font-size: 12px; color: rgb(55, 65, 81); min-width: 120px; margin-right: 8px;">İsim:</span>
        <span style="flex: 1 1 0%; font-size: 12px;">${escapeHtml(station.name || '')}</span>
      </div>
      <div class="detail-item" style="display: flex; align-items: flex-start; margin-bottom: 8px;">
        <span class="detail-label" style="font-weight: 600; font-size: 12px; color: rgb(55, 65, 81); min-width: 120px; margin-right: 8px;">Status:</span>
        <span style="flex: 1 1 0%; font-size: 12px;">
          <span class="badge badge-${station.status === 'active' ? 'success' : (station.status === 'maintenance' ? 'warning' : 'default')}">${escapeHtml(station.status || '')}</span>
        </span>
      </div>
      <div class="detail-item" style="display: flex; align-items: flex-start; margin-bottom: 8px;">
        <span class="detail-label" style="font-weight: 600; font-size: 12px; color: rgb(55, 65, 81); min-width: 120px; margin-right: 8px;">Location:</span>
        <span style="flex: 1 1 0%; font-size: 12px;">${escapeHtml(station.location || '-')}</span>
      </div>
      <div class="detail-item" style="display: flex; align-items: flex-start; margin-bottom: 0;">
        <span class="detail-label" style="font-weight: 600; font-size: 12px; color: rgb(55, 65, 81); min-width: 120px; margin-right: 8px;">Açıklama:</span>
        <span style="flex: 1 1 0%; font-size: 12px;">${escapeHtml(station.description || '-')}</span>
      </div>
    </div>
    
    <div style="margin-bottom: 16px; padding: 12px; background: white; border-radius: 6px; border: 1px solid var(--border);">
      <h3 style="margin: 0 0 12px; font-size: 14px; font-weight: 600; color: rgb(17, 24, 39); border-bottom: 1px solid var(--border); padding-bottom: 6px;">Desteklenen Operasyonlar</h3>
      <div style="display: flex; flex-wrap: wrap; gap: 6px;">
        ${opsLabels.length > 0 ? opsLabels.map(name => 
          `<span style="background-color: rgb(243, 244, 246); color: rgb(107, 114, 128); padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: 500;">${escapeHtml(name)}</span>`
        ).join('') : '<span style="color: var(--muted-foreground); font-style: italic;">Operasyon tanımlanmamış</span>'}
      </div>
    </div>
    
    <div style="margin-bottom: 0; padding: 12px; background: white; border-radius: 6px; border: 1px solid var(--border);">
      <h3 style="margin: 0 0 12px; font-size: 14px; font-weight: 600; color: rgb(17, 24, 39); border-bottom: 1px solid var(--border); padding-bottom: 6px;">Yetenekler</h3>
      <div style="display: flex; flex-wrap: wrap; gap: 6px;">
        ${effective.length > 0 ? effective.map(skill => 
          `<span style="background-color: rgb(243, 244, 246); color: rgb(107, 114, 128); padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: 500;">${escapeHtml(skill)}</span>`
        ).join('') : '<span style="color: var(--muted-foreground); font-style: italic;">Yetenek tanımlanmamış</span>'}
      </div>
      ${(station.subSkills || []).length > 0 ? `
        <div style="margin-top: 12px; padding-top: 8px; border-top: 1px solid var(--border);">
          <div style="font-size: 11px; color: var(--muted-foreground); margin-bottom: 4px;">İstasyon Özel Yetenekleri:</div>
          <div style="display: flex; flex-wrap: wrap; gap: 4px;">
            ${(station.subSkills || []).map(skill => 
              `<span style="background-color: rgb(252, 165, 165); color: rgb(127, 29, 29); padding: 2px 6px; border-radius: 4px; font-size: 11px; font-weight: 500;">${escapeHtml(skill)}</span>`
            ).join('')}
          </div>
        </div>
      ` : ''}
    </div>
  `
  
  // Store current station ID for detail panel actions
  editingStationId = stationId
}

export function closeStationDetail() {
  const detailPanel = document.getElementById('station-detail-panel')
  if (detailPanel) {
    detailPanel.style.display = 'none'
  }
  editingStationId = null
}

export function editStationFromDetail() {
  if (!editingStationId) return
  closeStationDetail()
  editStation(editingStationId)
}

export function deleteStationFromDetail() {
  if (!editingStationId) return
  const stationId = editingStationId
  closeStationDetail()
  deleteStation(stationId)
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
  
  // operations checkboxes with new styling and change handler
  const opsContainer = document.getElementById('station-operations')
  const selected = new Set(station.operationIds || [])
  opsContainer.innerHTML = (operationsCache||[]).map(op => {
    const checked = selected.has(op.id) ? 'checked' : ''
    return `<label style="display: flex; align-items: center; gap: 8px; padding: 4px; cursor: pointer; font-size: 12px;">
      <input type="checkbox" value="${op.id}" ${checked} onchange="handleOperationChange()" style="margin: 0;">
      <span style="flex: 1;">${escapeHtml(op.name)}</span>
    </label>`
  }).join('')
  
  // Store station data for later use in handleOperationChange
  window._currentStationData = station
  
  // Initial check for operations selection - this will show warning or skills interface
  handleOperationChange()
}

// Handle operation selection changes
function handleOperationChange() {
  const selectedOperations = Array.from(document.querySelectorAll('#station-operations input[type="checkbox"]:checked')).map(cb => cb.value)
  const skillsContainer = document.getElementById('station-subskills-box')
  
  if (!skillsContainer) return
  
  if (selectedOperations.length === 0) {
    // No operations selected - show warning
    skillsContainer.innerHTML = `
      <div style="padding: 12px; background: rgb(254, 242, 242); border: 1px solid rgb(252, 165, 165); border-radius: 6px; color: rgb(127, 29, 29); font-size: 12px; text-align: center;">
        İstasyon Özel Yetenekleri belirlemeden önce operasyon seçmek zorundasınız
      </div>
    `
  } else {
    // Operations selected - render skills interface with inherited skills pre-selected
    // Get current station data and preserve manually selected skills
    const stationData = window._currentStationData || { subSkills: [] }
    const currentSkills = Array.from(document.querySelectorAll('#station-skills-grid input[type="checkbox"]:checked')).map(cb => cb.value)
    
    // Calculate inherited skills from selected operations
    const inheritedSkills = computeStationInheritedSkills(selectedOperations, operationsCache)
    
    // Combine: original station skills + current manually selected skills + inherited skills from operations
    const originalSkills = stationData.subSkills || []
    const allSkills = new Set([...originalSkills, ...currentSkills, ...inheritedSkills])
    
    renderStationSubskillsBox({ 
      subSkills: Array.from(allSkills), 
      operationIds: selectedOperations 
    })
  }
}

// Expose function globally for inline handlers
window.handleOperationChange = handleOperationChange

async function renderStationSubskillsBox(station) {
  const container = document.getElementById('station-subskills-box')
  if (!container) return
  
  container.innerHTML = '<div style="color:#888;">Loading skills...</div>'
  try {
    const md = await getMasterData()
    const selected = new Set(Array.isArray(station.subSkills) ? station.subSkills : [])
    
    // Get inherited skills from operations
    const inheritedSkills = computeStationInheritedSkills(station.operationIds || [], operationsCache)
    const inheritedSet = new Set(inheritedSkills)
    
    // Auto-select inherited skills
    inheritedSkills.forEach(skill => selected.add(skill))
    
    container.innerHTML = `
      <div class="modern-skills-interface" style="background: white; border: 1px solid var(--border); border-radius: 6px; overflow: hidden;">
        <div class="selected-skills-header" style="padding: 8px 12px; background: rgb(248, 249, 250); border-bottom: 1px solid var(--border); font-weight: 500; font-size: 13px; color: var(--foreground);">
          ${selected.size > 0 ? `Seçili ${selected.size} Skill` : 'Seçili Skill Yok'}
        </div>
        <div class="selected-skills-display" style="padding: 8px 12px; background: white; border-bottom: 1px solid var(--border); min-height: 20px; font-size: 12px;">
          ${selected.size > 0 ? 
            Array.from(selected).map(skill => {
              const isInherited = inheritedSet.has(skill)
              const bgColor = isInherited ? 'rgb(219, 234, 254)' : 'rgb(252, 165, 165)'
              const textColor = isInherited ? 'rgb(30, 64, 175)' : 'rgb(127, 29, 29)'
              const title = isInherited ? 'Operasyondan miras alınan yetenek' : 'İstasyon özel yetenek'
              return `<span style="background-color: ${bgColor}; color: ${textColor}; padding: 2px 6px; border-radius: 4px; font-size: 11px; font-weight: 500; margin-right: 4px; margin-bottom: 4px; display: inline-block;" title="${title}">${escapeHtml(skill)}</span>`
            }).join('') : 
            '<span style="color: var(--muted-foreground); font-style: italic;">Henüz skill seçilmedi</span>'
          }
        </div>
        <div style="padding: 8px 12px; border-bottom: 1px solid var(--border); display: flex; gap: 6px;">
          <input id="station-skill-new" type="text" placeholder="Yeni skill ekle..." style="flex: 1; padding: 6px 8px; border: 1px solid var(--border); border-radius: 4px; font-size: 12px;">
          <button id="station-skill-add" style="padding: 6px 8px; border: 1px solid var(--border); background: white; border-radius: 4px; cursor: pointer; font-size: 12px;">+ Ekle</button>
        </div>
        <div class="skills-grid" style="max-height: 200px; overflow-y: auto; padding: 8px; display: grid; grid-template-columns: repeat(2, minmax(0px, 1fr)); gap: 6px;" id="station-skills-grid">
          ${md.skills.map(s => {
            const checked = selected.has(s.name) ? 'checked' : ''
            const isInherited = inheritedSet.has(s.name)
            const disabled = isInherited ? 'disabled' : ''
            const opacity = isInherited ? 'opacity: 0.6;' : ''
            const title = isInherited ? 'Bu yetenek operasyondan miras alınmıştır ve değiştirilemez' : ''
            return `<label style="display: flex; align-items: center; gap: 8px; padding: 4px; cursor: ${isInherited ? 'not-allowed' : 'pointer'}; font-size: 12px; ${opacity}" title="${title}">
              <input type="checkbox" value="${escapeHtml(s.name)}" ${checked} ${disabled} onchange="updateStationSkillsDisplay()" style="margin: 0;">
              <span style="flex: 1;">${escapeHtml(s.name)}</span>
              ${isInherited ? '<span style="font-size: 10px; color: rgb(107, 114, 128);">(miras)</span>' : ''}
            </label>`
          }).join('')}
        </div>
      </div>
    `
    
    const addButton = container.querySelector('#station-skill-add')
    if (addButton) {
      addButton.onclick = async () => {
        const inp = document.getElementById('station-skill-new')
        const name = inp?.value?.trim()
        if (!name) return
        try {
          const created = await addSkill(name)
          // Auto-check the newly added skill by updating selected set
          station.subSkills = Array.from(new Set([...(station.subSkills||[]), created.name]))
          await renderStationSubskillsBox(station)
          inp.value = ''
        } catch {}
      }
    }
  } catch (e) {
    console.error('renderStationSubskillsBox error', e)
    container.innerHTML = '<div style="color:#ef4444;">Skills yüklenemedi</div>'
  }
}

// Helper function to update skills display
function updateStationSkillsDisplay() {
  const container = document.getElementById('station-subskills-box')
  if (!container) return
  
  const selected = Array.from(container.querySelectorAll('input[type="checkbox"]:checked')).map(cb => cb.value)
  const header = container.querySelector('.selected-skills-header')
  const display = container.querySelector('.selected-skills-display')
  
  if (header) {
    header.textContent = selected.length > 0 ? `Seçili ${selected.length} Skill` : 'Seçili Skill Yok'
  }
  
  if (display) {
    display.innerHTML = selected.length > 0 ? 
      selected.map(skill => 
        `<span style="background-color: rgb(252, 165, 165); color: rgb(127, 29, 29); padding: 2px 6px; border-radius: 4px; font-size: 11px; font-weight: 500; margin-right: 4px; margin-bottom: 4px; display: inline-block;">${escapeHtml(skill)}</span>`
      ).join('') : 
      '<span style="color: var(--muted-foreground); font-style: italic;">Henüz skill seçilmedi</span>'
  }
}

// Expose function globally for inline handlers
window.updateStationSkillsDisplay = updateStationSkillsDisplay

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

  try {
    let stationId = editingStationId
    
    // Generate new ID for new stations using the new format
    if (!editingStationId) {
      stationId = await generateStationId(operationIds)
    }

    const payload = normalizeStation({
      id: stationId,
      name, description, location, status, operationIds, subSkills
    }, operationsCache)

    const idx = stationsState.findIndex(s => s.id === payload.id)
    if (idx >= 0) stationsState[idx] = { ...stationsState[idx], ...payload }
    else stationsState.push(payload)

    await saveStations(stationsState)
    document.getElementById('station-modal').style.display = 'none'
    renderStations()
    showToast(editingStationId ? 'Station updated' : 'Station added', 'success')
  } catch (e) {
    console.error('Station save error:', e)
    showToast(e.message || 'Station could not be saved', 'error')
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
    const { API_BASE, withAuth } = await import('../../shared/lib/api.js')
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
