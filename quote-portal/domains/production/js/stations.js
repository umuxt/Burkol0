// Station management backed by backend API using mesApi
import { getStations, saveStations, getOperations, normalizeStation, computeStationInheritedSkills, getMasterData, addSkill, invalidateStationsCache, getStationWorkers, getSubstationDetails, getSkillsFromSQL } from './mesApi.js'
import { showSuccessToast, showErrorToast, showWarningToast, showInfoToast } from '../../../shared/components/MESToast.js';
import { API_BASE, withAuth } from '../../../shared/lib/api.js';

let stationsState = []
let operationsCache = []
let skillsCache = [] // Cache for SQL skills
export let editingStationId = null
let activeOperationTypeTab = 'all' // Add active tab tracking
let wasDetailPanelOpen = false // Track if detail panel was open before modal

// Helper: Convert skill ID to name
function getSkillName(skillId) {
  if (!skillId) return skillId
  const skill = skillsCache.find(s => s.id === skillId)
  return skill ? skill.name : skillId
}

const SUB_STATION_STATUSES = ['active', 'maintenance', 'inactive']

// Filter state
let stationFilters = {
  search: '',
  status: new Set(),
  skills: new Set(),
  operations: new Set()
}

// Sorting state
let stationSortConfig = {
  field: null, // 'id', 'name', 'amount', 'operations', 'skills'
  direction: 'asc' // 'asc' or 'desc'
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
    skillsCache = await getSkillsFromSQL() // Load skills for ID→name mapping
    stationsState = (await getStations()).map(station => normalizeStationForState(station))
    renderStations()
  } catch (e) {
    console.error('Stations load error:', e)
    if (list) list.innerHTML = '<div style="padding:12px;color:#ef4444;">Stations yüklenemedi.</div>'
    showErrorToast('Stations yüklenemedi')
  }
}

function renderStations() {
  const tabsContainer = document.getElementById('stations-tabs')
  const tableBody = document.getElementById('stations-list')
  const detailPanel = document.getElementById('station-detail-panel')
  const compact = Boolean(detailPanel && detailPanel.style.display !== 'none')
  
  if (!tabsContainer || !tableBody) return
  
  if (!stationsState.length) {
    tableBody.innerHTML = `
      <tr class="mes-table-row is-empty">
        <td colspan="${compact ? 2 : 5}" class="mes-empty-cell text-center">No stations yet. Add a station.</td>
      </tr>
    `
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
  
  // Apply sorting
  filteredStations = applySorting(filteredStations)
  
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
      class="station-tab-button mes-tab-button ${activeOperationTypeTab === tab.id ? 'active' : ''}"
      onclick="setActiveStationTab('${tab.id}')"
    >
      ${escapeHtml(tab.label)}
      <span class="mes-tab-count">(${tab.count})</span>
    </button>
  `).join('')

  // Update table header based on detail panel visibility
  try {
    const thead = document.querySelector('#stations-table thead')
    if (thead) {
      if (compact) {
        thead.innerHTML = `
          <tr>
            <th style="min-width: 70px;">
              <button type="button" class="mes-sort-button" onclick="sortStations('id')">
                Station ID <span class="mes-sort-icon">${getSortIcon('id')}</span>
              </button>
            </th>
            <th style="min-width: 200px;">
              <button type="button" class="mes-sort-button" onclick="sortStations('name')">
                Station Name <span class="mes-sort-icon">${getSortIcon('name')}</span>
              </button>
            </th>
          </tr>
        `
      } else {
        thead.innerHTML = `
          <tr>
            <th style="min-width: 70px;">
              <button type="button" class="mes-sort-button" onclick="sortStations('id')">
                Station ID <span class="mes-sort-icon">${getSortIcon('id')}</span>
              </button>
            </th>
            <th style="min-width: 200px;">
              <button type="button" class="mes-sort-button" onclick="sortStations('name')">
                Station Name <span class="mes-sort-icon">${getSortIcon('name')}</span>
              </button>
            </th>
            <th style="min-width: 1%; white-space: nowrap; text-align: center;" class="text-center">
              <button type="button" class="mes-sort-button" onclick="sortStations('amount')">
                Amount <span class="mes-sort-icon">${getSortIcon('amount')}</span>
              </button>
            </th>
            <th style="min-width: 160px;">
              <button type="button" class="mes-sort-button" onclick="sortStations('operations')">
                Operations <span class="mes-sort-icon">${getSortIcon('operations')}</span>
              </button>
            </th>
            <th style="min-width: 160px;">
              <button type="button" class="mes-sort-button" onclick="sortStations('skills')">
                Skills <span class="mes-sort-icon">${getSortIcon('skills')}</span>
              </button>
            </th>
          </tr>
        `
      }
    }
  } catch {}
  
  // Render table rows
  const rowsMarkup = filteredStations.map(station => {
    const rowClasses = ['mes-table-row']
    if (station.status === 'inactive') {
      rowClasses.push('station-row-inactive')
    } else if (station.status === 'maintenance') {
      rowClasses.push('station-row-maintenance')
    }

    const inherited = computeStationInheritedSkills(station.operationIds || [], operationsCache)
    const effective = Array.from(new Set([...(station.subSkills || []), ...inherited]))
    const opsLabels = (station.operationIds || []).map(id => opMap.get(id)?.name || id)
    const subStationCount = Array.isArray(station.subStations)
      ? station.subStations.length
      : Number.isFinite(Number(station.subStationCount))
        ? Number(station.subStationCount)
        : 0

    const description = station.description || ''

    if (compact) {
      return `
        <tr class="${rowClasses.join(' ')}" onclick="(async () => await showStationDetail('${station.id}'))()" title="${escapeHtml(description)}" data-tooltip="${escapeHtml(description)}">
          <td>
            <span class="mes-code-text">${escapeHtml(station.id || '')}</span>
          </td>
          <td>
            ${escapeHtml(station.name || '')}
          </td>
        </tr>
      `
    }

    const operationsMarkup = opsLabels.slice(0, 3).map(name => `
      <span class="mes-tag">${escapeHtml(name)}</span>
    `).join('')

    const operationsExtra = opsLabels.length > 3
      ? `<span class="mes-tag">+${opsLabels.length - 3}</span>`
      : ''

    const skillsMarkup = effective.slice(0, 3).map(skill => {
      const skillName = getSkillName(skill) // Convert ID to name
      return `<span class="mes-tag">${escapeHtml(skillName)}</span>`
    }).join('')

    const skillsExtra = effective.length > 3
      ? `<span class="mes-tag">+${effective.length - 3}</span>`
      : ''

    return `
      <tr class="${rowClasses.join(' ')}" onclick="(async () => await showStationDetail('${station.id}'))()" title="${escapeHtml(description)}" data-tooltip="${escapeHtml(description)}">
        <td>
          <span class="mes-code-text">${escapeHtml(station.id || '')}</span>
        </td>
        <td>
          ${escapeHtml(station.name || '')}
        </td>
        <td class="text-center">
          ${subStationCount}
        </td>
        <td>
          <div class="mes-tag-group">
            ${operationsMarkup}${operationsExtra}
          </div>
        </td>
        <td>
          <div class="mes-tag-group">
            ${skillsMarkup}${skillsExtra}
          </div>
        </td>
      </tr>
    `
  }).join('')

  if (!filteredStations.length) {
    tableBody.innerHTML = `
      <tr class="mes-table-row is-empty">
        <td colspan="${compact ? 2 : 5}" class="mes-empty-cell text-center">No stations match your filters.</td>
      </tr>
    `
  } else {
    tableBody.innerHTML = rowsMarkup
  }
  
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
    <label>
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

// Sorting functions
export function sortStations(field) {
  // Toggle direction if same field, otherwise default to asc
  if (stationSortConfig.field === field) {
    stationSortConfig.direction = stationSortConfig.direction === 'asc' ? 'desc' : 'asc'
  } else {
    stationSortConfig.field = field
    stationSortConfig.direction = 'asc'
  }
  
  renderStations()
}

function applySorting(stations) {
  if (!stationSortConfig.field) return stations
  
  const sorted = [...stations].sort((a, b) => {
    let valueA, valueB
    
    switch (stationSortConfig.field) {
      case 'id':
        valueA = a.id || ''
        valueB = b.id || ''
        break
      case 'name':
        valueA = a.name || ''
        valueB = b.name || ''
        break
      case 'amount':
        valueA = a.subStationCount || 0
        valueB = b.subStationCount || 0
        break
      case 'operations':
        // Sort by number of operations, then by operation names
        valueA = (a.operationIds || []).length
        valueB = (b.operationIds || []).length
        if (valueA === valueB) {
          const opsA = (a.operationIds || []).map(id => {
            const op = operationsCache.find(o => o.id === id)
            return op?.name || ''
          }).sort().join(', ')
          const opsB = (b.operationIds || []).map(id => {
            const op = operationsCache.find(o => o.id === id)
            return op?.name || ''
          }).sort().join(', ')
          valueA = opsA
          valueB = opsB
        }
        break
      case 'skills':
        // Sort by number of skills, then by skill names
        const skillsA = computeStationInheritedSkills(a, operationsCache)
        const skillsB = computeStationInheritedSkills(b, operationsCache)
        valueA = skillsA.length
        valueB = skillsB.length
        if (valueA === valueB) {
          valueA = skillsA.sort().join(', ')
          valueB = skillsB.sort().join(', ')
        }
        break
      default:
        return 0
    }
    
    // Handle numeric vs string comparison
    if (typeof valueA === 'number' && typeof valueB === 'number') {
      return stationSortConfig.direction === 'asc' ? valueA - valueB : valueB - valueA
    } else {
      // Convert to strings for comparison
      const strA = String(valueA).toLowerCase()
      const strB = String(valueB).toLowerCase()
      if (stationSortConfig.direction === 'asc') {
        return strA.localeCompare(strB)
      } else {
        return strB.localeCompare(strA)
      }
    }
  })
  
  return sorted
}

function getSortIcon(field) {
  if (stationSortConfig.field !== field) {
    return '↕'
  }
  return stationSortConfig.direction === 'asc' ? '↑' : '↓'
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

// TEST ONLY: Reset all substation currentOperation fields
export async function showStationDetail(stationId) {
  const station = stationsState.find(s => s.id === stationId)
  if (!station) return
  
  // Set the editing station ID so edit button knows which station to edit
  editingStationId = stationId
  
  const detailPanel = document.getElementById('station-detail-panel')
  const detailContent = document.getElementById('station-detail-content')
  
  if (!detailPanel || !detailContent) return
  
  // Show detail panel and hide table
  detailPanel.style.display = 'block'
  const tableContainer = document.querySelector('.mes-table-container')
  if (tableContainer && tableContainer.closest('.mes-card-content')) {
    tableContainer.closest('.mes-card-content').style.display = 'none'
  }
  try { renderStations() } catch {}
  
  // Show loading state first
  detailContent.innerHTML = `
    <div style="padding: 20px; text-align: center;">
      <div style="font-size: 14px; color: rgb(107, 114, 128);">Yükleniyor...</div>
    </div>
  `
  
  try {
    // Load compatible workers
    const stationWorkersData = await getStationWorkers(stationId)
    
    // Generate station detail content
    const inherited = computeStationInheritedSkills(station.operationIds || [], operationsCache)
    const effective = Array.from(new Set([...(station.subSkills||[]), ...inherited]))
    // Filter out inherited skills from subSkills to show only station-specific skills
    const stationSpecificSkills = (station.subSkills || []).filter(skill => !inherited.includes(skill))
    const opsLabels = (station.operationIds || []).map(id => {
      const op = operationsCache.find(o => o.id === id)
      return op ? op.name : id
    })
    const subStationsSection = buildSubStationsSection(station)
    
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
      
      <div style="margin-bottom: 16px; padding: 12px; background: white; border-radius: 6px; border: 1px solid var(--border);">
        <h3 style="margin: 0 0 12px; font-size: 14px; font-weight: 600; color: rgb(17, 24, 39); border-bottom: 1px solid var(--border); padding-bottom: 6px;">Yetenekler</h3>
        <div style="display: flex; flex-wrap: wrap; gap: 6px;">
          ${effective.length > 0 ? effective.map(skill => {
            const skillName = getSkillName(skill) // Convert ID to name
            return `<span style="background-color: rgb(243, 244, 246); color: rgb(107, 114, 128); padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: 500;">${escapeHtml(skillName)}</span>`
          }).join('') : '<span style="color: var(--muted-foreground); font-style: italic;">Yetenek tanımlanmamış</span>'}
        </div>
        ${stationSpecificSkills.length > 0 ? `
          <div style="margin-top: 12px; padding-top: 8px; border-top: 1px solid var(--border);">
            <div style="font-size: 11px; color: var(--muted-foreground); margin-bottom: 4px;">İstasyon Özel Yetenekleri:</div>
            <div style="display: flex; flex-wrap: wrap; gap: 4px;">
              ${stationSpecificSkills.map(skill => {
                const skillName = getSkillName(skill) // Convert ID to name
                return `<span style="background-color: rgb(252, 165, 165); color: rgb(127, 29, 29); padding: 2px 6px; border-radius: 4px; font-size: 11px; font-weight: 500;">${escapeHtml(skillName)}</span>`
              }).join('')}
            </div>
          </div>
        ` : ''}
      </div>
      ${subStationsSection}
      
      <div style="margin-bottom: 0; padding: 12px; background: white; border-radius: 6px; border: 1px solid var(--border);">
        <h3 style="margin: 0 0 12px; font-size: 14px; font-weight: 600; color: rgb(17, 24, 39); border-bottom: 1px solid var(--border); padding-bottom: 6px;">Çalışabilecek Personel (${stationWorkersData.compatibleWorkers.length})</h3>
        ${stationWorkersData.requiredSkills.length > 0 ? `
          <div style="margin-bottom: 12px; padding: 8px; background: rgb(249, 250, 251); border-radius: 4px; border: 1px solid rgb(229, 231, 235);">
            <div style="font-size: 11px; color: rgb(107, 114, 128); margin-bottom: 4px;">Gerekli Yetenekler:</div>
            <div style="display: flex; flex-wrap: wrap; gap: 4px;">
              ${stationWorkersData.requiredSkills.map(skill => {
                const skillName = getSkillName(skill) // Convert ID to name
                return `<span style="background-color: rgb(219, 234, 254); color: rgb(30, 64, 175); padding: 2px 6px; border-radius: 4px; font-size: 11px; font-weight: 500;">${escapeHtml(skillName)}</span>`
              }).join('')}
            </div>
          </div>
        ` : ''}
        ${stationWorkersData.compatibleWorkers.length > 0 ? `
          <div style="display: grid; gap: 8px;">
            ${stationWorkersData.compatibleWorkers.map(worker => `
              <div style="padding: 8px; background: rgb(249, 250, 251); border-radius: 4px; border: 1px solid rgb(229, 231, 235);">
                <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px;">
                  <span style="font-weight: 600; font-size: 12px; color: rgb(17, 24, 39);">${escapeHtml(worker.name || '')}</span>
                  <span style="font-size: 10px; color: rgb(107, 114, 128);">${escapeHtml(worker.status || 'available')}</span>
                </div>
                <div style="display: flex; flex-wrap: wrap; gap: 3px;">
                  ${(worker.skills || []).map(skill => {
                    const skillName = getSkillName(skill) // Convert ID to name
                    return `<span style="background-color: rgb(243, 244, 246); color: rgb(107, 114, 128); padding: 1px 4px; border-radius: 3px; font-size: 10px; font-weight: 500;">${escapeHtml(skillName)}</span>`
                  }).join('')}
                </div>
                ${worker.station ? `
                  <div style="margin-top: 4px; font-size: 10px; color: rgb(107, 114, 128);">
                    Mevcut İstasyon: ${escapeHtml(worker.station)}
                  </div>
                ` : ''}
              </div>
            `).join('')}
          </div>
        ` : `
          <div style="text-align: center; padding: 16px; color: rgb(107, 114, 128); font-style: italic; font-size: 12px;">
            Bu istasyonda çalışabilecek uygun personel bulunamadı.
            ${stationWorkersData.requiredSkills.length > 0 ? 
              `<br><span style="font-size: 11px;">Tüm gerekli yeteneklere sahip personel gerekiyor.</span>` : 
              ''
            }
          </div>
        `}
      </div>
    `

    initializeSubStationAddSection(station.id)
  } catch (error) {
    console.error('Error loading station workers:', error)
    
    // Fallback to original view if workers loading fails
    const inherited = computeStationInheritedSkills(station.operationIds || [], operationsCache)
    const effective = Array.from(new Set([...(station.subSkills||[]), ...inherited]))
    const opsLabels = (station.operationIds || []).map(id => {
      const op = operationsCache.find(o => o.id === id)
      return op ? op.name : id
    })
    const subStationsSection = buildSubStationsSection(station)
    
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
      
      <div style="margin-bottom: 16px; padding: 12px; background: white; border-radius: 6px; border: 1px solid var(--border);">
        <h3 style="margin: 0 0 12px; font-size: 14px; font-weight: 600; color: rgb(17, 24, 39); border-bottom: 1px solid var(--border); padding-bottom: 6px;">Yetenekler</h3>
        <div style="display: flex; flex-wrap: wrap; gap: 6px;">
          ${effective.length > 0 ? effective.map(skill => {
            const skillName = getSkillName(skill) // Convert ID to name
            return `<span style="background-color: rgb(243, 244, 246); color: rgb(107, 114, 128); padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: 500;">${escapeHtml(skillName)}</span>`
          }).join('') : '<span style="color: var(--muted-foreground); font-style: italic;">Yetenek tanımlanmamış</span>'}
        </div>
        ${(station.subSkills || []).length > 0 ? `
          <div style="margin-top: 12px; padding-top: 8px; border-top: 1px solid var(--border);">
            <div style="font-size: 11px; color: var(--muted-foreground); margin-bottom: 4px;">İstasyon Özel Yetenekleri:</div>
            <div style="display: flex; flex-wrap: wrap; gap: 4px;">
              ${(station.subSkills || []).map(skill => {
                const skillName = getSkillName(skill) // Convert ID to name
                return `<span style="background-color: rgb(252, 165, 165); color: rgb(127, 29, 29); padding: 2px 6px; border-radius: 4px; font-size: 11px; font-weight: 500;">${escapeHtml(skillName)}</span>`
              }).join('')}
            </div>
          </div>
        ` : ''}
      </div>
      ${subStationsSection}
      
      <div style="margin-bottom: 0; padding: 12px; background: white; border-radius: 6px; border: 1px solid var(--border);">
        <h3 style="margin: 0 0 12px; font-size: 14px; font-weight: 600; color: rgb(17, 24, 39); border-bottom: 1px solid var(--border); padding-bottom: 6px;">Çalışabilecek Personel</h3>
        <div style="text-align: center; padding: 16px; color: rgb(220, 38, 38); font-size: 12px;">
          Personel bilgileri yüklenirken hata oluştu.
        </div>
      </div>
    `

    initializeSubStationAddSection(station.id)
  }
  
  // Store current station ID for detail panel actions
  editingStationId = stationId
}

export function closeStationDetail() {
  const detailPanel = document.getElementById('station-detail-panel')
  if (detailPanel) {
    detailPanel.style.display = 'none'
  }
  // Also close substation detail if open
  closeSubStationDetail()
  // Show table again
  const tableContainer = document.querySelector('.mes-table-container')
  if (tableContainer && tableContainer.closest('.mes-card-content')) {
    tableContainer.closest('.mes-card-content').style.display = 'block'
  }
  editingStationId = null
  try { renderStations() } catch {}
}

export function closeSubStationDetail() {
  const substationPanel = document.getElementById('substation-detail-panel')
  if (substationPanel) {
    substationPanel.style.display = 'none'
  }
}

// Show substation detail panel
export async function showSubStationDetail(substationId) {
  const detailPanel = document.getElementById('substation-detail-panel')
  const detailContent = document.getElementById('substation-detail-content')
  
  if (!detailPanel || !detailContent) return
  
  // Show substation detail panel (station detail stays visible)
  detailPanel.style.display = 'block'
  
  // Show loading state
  detailContent.innerHTML = `
    <div style="padding: 20px; text-align: center;">
      <div style="font-size: 14px; color: rgb(107, 114, 128);">Alt istasyon detayları yükleniyor...</div>
    </div>
  `
  
  try {
    // Fetch substation details from API
    const data = await getSubstationDetails(substationId)
    const { substation, currentTask, upcomingTasks, performance } = data
    
    // Helper function to format time
    const formatTime = (isoString) => {
      if (!isoString) return '-'
      try {
        return new Date(isoString).toLocaleString('tr-TR', { 
          day: '2-digit', 
          month: '2-digit', 
          hour: '2-digit', 
          minute: '2-digit' 
        })
      } catch {
        return '-'
      }
    }
    
    // Helper function to format duration
    const formatDuration = (minutes) => {
      if (!minutes) return '-'
      const hours = Math.floor(minutes / 60)
      const mins = minutes % 60
      return hours > 0 ? `${hours}s ${mins}dk` : `${mins}dk`
    }
    
    // Helper function to format materials
    const formatMaterials = (materialsObj) => {
      if (!materialsObj || Object.keys(materialsObj).length === 0) return '-'
      return Object.entries(materialsObj).map(([code, qty]) => `${code} (${qty})`).join(', ')
    }
    
    // Get substation status badge
    const getStatusBadge = (status) => {
      const badges = {
        active: '<span class="badge badge-success">Aktif</span>',
        passive: '<span class="badge badge-default">Pasif</span>',
        maintenance: '<span class="badge badge-warning">Bakımda</span>'
      }
      return badges[status] || badges.passive
    }
    
    // Render detail panel
    detailContent.innerHTML = `
      <!-- Temel Bilgiler -->
      <div style="margin-bottom: 16px; padding: 12px; background: white; border-radius: 6px; border: 1px solid rgb(229, 231, 235);">
        <h3 style="margin: 0px 0px 12px; font-size: 14px; font-weight: 600; color: rgb(17, 24, 39); border-bottom: 1px solid rgb(229, 231, 235); padding-bottom: 6px;">Alt İstasyon Bilgileri</h3>
        <div class="detail-item" style="display: flex; align-items: center; margin-bottom: 8px;">
          <span class="detail-label" style="font-weight: 600; font-size: 12px; color: rgb(55, 65, 81); min-width: 120px; margin-right: 8px;">Kod:</span>
          <span class="detail-value" style="font-size: 12px; color: rgb(17, 24, 39); font-family: monospace;">${escapeHtml(substation.code)}</span>
        </div>
        <div class="detail-item" style="display: flex; align-items: center; margin-bottom: 8px;">
          <span class="detail-label" style="font-weight: 600; font-size: 12px; color: rgb(55, 65, 81); min-width: 120px; margin-right: 8px;">Ana İstasyon:</span>
          <span class="detail-value" style="font-size: 12px; color: rgb(17, 24, 39);">${escapeHtml(substation.stationId)}</span>
        </div>
        <div class="detail-item" style="display: flex; align-items: center; margin-bottom: 0;">
          <span class="detail-label" style="font-weight: 600; font-size: 12px; color: rgb(55, 65, 81); min-width: 120px; margin-right: 8px;">Teknik Durum:</span>
          <select id="technical-status-select" style="font-size: 12px; padding: 4px 8px; border: 1px solid rgb(209, 213, 219); border-radius: 4px; background: white; cursor: pointer;" onchange="updateTechnicalStatus('${escapeHtml(substationId)}', this.value)">
            <option value="active" ${substation.technicalStatus === 'active' ? 'selected' : ''}>🟢 Aktif</option>
            <option value="passive" ${substation.technicalStatus === 'passive' ? 'selected' : ''}>⚪ Pasif</option>
            <option value="maintenance" ${substation.technicalStatus === 'maintenance' ? 'selected' : ''}>🟡 Bakımda</option>
          </select>
        </div>
      </div>
      
      <!-- Mevcut Görev -->
      <div style="margin-bottom: 16px; padding: 12px; background: white; border-radius: 6px; border: 1px solid rgb(229, 231, 235);">
        <h3 style="margin: 0px 0px 12px; font-size: 14px; font-weight: 600; color: rgb(17, 24, 39); border-bottom: 1px solid rgb(229, 231, 235); padding-bottom: 6px;">Mevcut Görev</h3>
        ${currentTask ? `
          <div style="padding: 12px; background: rgb(254, 249, 195); border-left: 3px solid rgb(245, 158, 11); border-radius: 4px;">
            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
              <div style="font-weight: 600; font-size: 13px; color: rgb(17, 24, 39);">
                🏭 ${escapeHtml(currentTask.operationName)}
              </div>
              ${currentTask.timeRemaining ? `
                <div style="background: rgb(254, 226, 226); color: rgb(153, 27, 27); padding: 2px 8px; border-radius: 3px; font-size: 11px; font-weight: 600;">
                  ⏱️ ${formatDuration(currentTask.timeRemaining)} kaldı
                </div>
              ` : ''}
            </div>
            <div style="font-size: 11px; color: rgb(107, 114, 128); margin-bottom: 6px;">
              <div style="margin-bottom: 3px;">
                <span style="font-weight: 500;">İş Paketi:</span> ${escapeHtml(currentTask.workPackageId)}
              </div>
              <div style="margin-bottom: 3px;">
                <span style="font-weight: 500;">İşçi:</span> ${escapeHtml(currentTask.workerName)}
              </div>
              <div style="margin-bottom: 3px;">
                <span style="font-weight: 500;">Başlangıç:</span> ${formatTime(currentTask.startedAt)}
              </div>
              ${currentTask.estimatedEndTime ? `
                <div style="margin-bottom: 3px;">
                  <span style="font-weight: 500;">Tahmini Bitiş:</span> ${formatTime(currentTask.estimatedEndTime)}
                </div>
              ` : ''}
            </div>
            ${Object.keys(currentTask.materialInputs || {}).length > 0 ? `
              <div style="margin-top: 8px; padding: 8px; background: white; border-radius: 4px;">
                <div style="font-size: 11px; font-weight: 600; color: rgb(17, 24, 39); margin-bottom: 4px;">📦 Girdi Malzemeler:</div>
                <div style="font-size: 11px; color: rgb(55, 65, 81);">${formatMaterials(currentTask.materialInputs)}</div>
              </div>
            ` : ''}
            ${Object.keys(currentTask.materialOutputs || {}).length > 0 ? `
              <div style="margin-top: 6px; padding: 8px; background: white; border-radius: 4px;">
                <div style="font-size: 11px; font-weight: 600; color: rgb(17, 24, 39); margin-bottom: 4px;">📦 Çıktı Malzemeler:</div>
                <div style="font-size: 11px; color: rgb(55, 65, 81);">${formatMaterials(currentTask.materialOutputs)}</div>
              </div>
            ` : ''}
          </div>
        ` : `
          <div style="text-align: center; padding: 20px; color: rgb(107, 114, 128); font-style: italic; font-size: 12px;">
            💤 Şu anda atanmış bir görev bulunmuyor
          </div>
        `}
      </div>
      
      <!-- Yaklaşan Görevler -->
      <div style="margin-bottom: 16px; padding: 12px; background: white; border-radius: 6px; border: 1px solid rgb(229, 231, 235);">
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;">
          <h3 style="margin: 0; font-size: 14px; font-weight: 600; color: rgb(17, 24, 39);">Yaklaşan Görevler (${upcomingTasks.length})</h3>
          <button type="button" onclick="showSubStationDetail('${escapeHtml(substationId)}')" style="padding: 4px 8px; border: 1px solid rgb(209, 213, 219); border-radius: 4px; background: white; cursor: pointer; font-size: 11px;">🔄 Yenile</button>
        </div>
        ${upcomingTasks.length > 0 ? `
          <div style="display: grid; gap: 8px;">
            ${upcomingTasks.map(task => `
              <div style="padding: 10px; background: rgb(249, 250, 251); border-left: 3px solid rgb(59, 130, 246); border-radius: 4px;">
                <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px;">
                  <div style="font-weight: 600; font-size: 12px; color: rgb(17, 24, 39);">
                    ${escapeHtml(task.operationName)}
                  </div>
                  <span style="background: rgb(219, 234, 254); color: rgb(30, 64, 175); padding: 1px 6px; border-radius: 3px; font-size: 10px; font-weight: 600;">
                    ${escapeHtml(task.status)}
                  </span>
                </div>
                <div style="font-size: 10px; color: rgb(107, 114, 128); margin-bottom: 3px;">
                  <span style="font-weight: 500;">İş Paketi:</span> ${escapeHtml(task.workPackageId)} | 
                  <span style="font-weight: 500;">İşçi:</span> ${escapeHtml(task.workerName)}
                </div>
                <div style="font-size: 10px; color: rgb(107, 114, 128);">
                  <span style="font-weight: 500;">Tahmini Başlangıç:</span> ${formatTime(task.estimatedStartTime)}
                  ${task.estimatedTime ? ` | <span style="font-weight: 500;">Süre:</span> ${formatDuration(task.estimatedTime)}` : ''}
                </div>
              </div>
            `).join('')}
          </div>
        ` : `
          <div style="text-align: center; padding: 20px; color: rgb(107, 114, 128); font-style: italic; font-size: 12px;">
            Yaklaşan görev bulunmuyor
          </div>
        `}
      </div>
      
      <!-- Performans Bilgileri -->
      <div style="margin-bottom: 16px; padding: 12px; background: white; border-radius: 6px; border: 1px solid rgb(229, 231, 235);">
        <h3 style="margin: 0px 0px 12px; font-size: 14px; font-weight: 600; color: rgb(17, 24, 39); border-bottom: 1px solid rgb(229, 231, 235); padding-bottom: 6px;">
          Performans Özeti
          <span style="font-size: 11px; font-weight: 400; color: rgb(107, 114, 128); margin-left: 8px;">(${performance.period})</span>
        </h3>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 12px;">
          <div class="detail-item" style="display: flex; align-items: center; margin-bottom: 8px;">
            <span class="detail-label" style="font-weight: 600; font-size: 12px; color: rgb(55, 65, 81); min-width: 120px; margin-right: 8px;">Tamamlanan Görev:</span>
            <span class="detail-value" style="font-size: 12px; color: rgb(17, 24, 39);">${performance.totalCompleted || 0}</span>
          </div>
          <div class="detail-item" style="display: flex; align-items: center; margin-bottom: 8px;">
            <span class="detail-label" style="font-weight: 600; font-size: 12px; color: rgb(55, 65, 81); min-width: 120px; margin-right: 8px;">Ortalama Süre:</span>
            <span class="detail-value" style="font-size: 12px; color: rgb(17, 24, 39);">${formatDuration(performance.avgDuration)}</span>
          </div>
        </div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
          <div class="detail-item" style="display: flex; align-items: center; margin-bottom: 8px;">
            <span class="detail-label" style="font-weight: 600; font-size: 12px; color: rgb(55, 65, 81); min-width: 120px; margin-right: 8px;">Toplam Üretim:</span>
            <span class="detail-value" style="font-size: 12px; color: rgb(17, 24, 39);">${performance.totalOutputQuantity || 0}</span>
          </div>
          <div class="detail-item" style="display: flex; align-items: center; margin-bottom: 8px;">
            <span class="detail-label" style="font-weight: 600; font-size: 12px; color: rgb(55, 65, 81); min-width: 120px; margin-right: 8px;">Kalite Oranı:</span>
            <span class="detail-value" style="font-size: 12px; color: rgb(17, 24, 39);">
              ${performance.qualityRate ? `<span style="color: ${parseFloat(performance.qualityRate) >= 95 ? 'rgb(22, 163, 74)' : parseFloat(performance.qualityRate) >= 90 ? 'rgb(202, 138, 4)' : 'rgb(220, 38, 38)'}; font-weight: 600;">%${performance.qualityRate}</span>` : '-'}
            </span>
          </div>
        </div>
        ${performance.totalDefects > 0 ? `
          <div style="margin-top: 12px; padding: 8px; background: rgb(254, 226, 226); border-left: 3px solid rgb(220, 38, 38); border-radius: 4px;">
            <div style="font-size: 11px; color: rgb(127, 29, 29);">
              <span style="font-weight: 600;">⚠️ Toplam Kusur:</span> ${performance.totalDefects}
            </div>
          </div>
        ` : ''}
      </div>
    `
  } catch (error) {
    console.error('Error loading substation details:', error)
    detailContent.innerHTML = `
      <div style="padding: 20px; text-align: center;">
        <div style="font-size: 14px; color: rgb(220, 38, 38); margin-bottom: 8px;">⚠️ Detaylar yüklenirken hata oluştu</div>
        <div style="font-size: 12px; color: rgb(107, 114, 128);">${escapeHtml(error.message)}</div>
        <button onclick="closeStationDetail()" style="margin-top: 12px; padding: 6px 16px; border: 1px solid rgb(209, 213, 219); background: white; border-radius: 4px; cursor: pointer; font-size: 12px;">Kapat</button>
      </div>
    `
  }
}

export function editStationFromDetail() {
  if (!editingStationId) return
  const stationId = editingStationId // Store the ID before closing detail
  
  // Check if detail panel is currently open
  const detailPanel = document.getElementById('station-detail-panel')
  wasDetailPanelOpen = detailPanel && detailPanel.style.display !== 'none'
  
  closeStationDetail()
  editStation(stationId)
}

export async function duplicateStationFromDetail() {
  if (!editingStationId) return
  
  const originalStation = stationsState.find(s => s.id === editingStationId)
  if (!originalStation) {
    showErrorToast('Station not found')
    return
  }
  
  // Show confirmation modal
  showStationDuplicateModal(originalStation)
}

// Station duplication modal functions
let stationToDuplicate = null

export function showStationDuplicateModal(station) {
  stationToDuplicate = station
  const defaultName = `${station.name} (Kopya)`
  
  document.getElementById('duplicate-station-name-display').textContent = station.name
  document.getElementById('duplicate-default-name-preview').textContent = defaultName
  document.getElementById('duplicate-station-new-name').value = ''
  document.getElementById('station-duplicate-modal').style.display = 'block'
}

export function closeStationDuplicateModal(event) {
  if (event && event.target !== event.currentTarget) return
  document.getElementById('station-duplicate-modal').style.display = 'none'
  stationToDuplicate = null
}

export async function confirmStationDuplicate() {
  if (!stationToDuplicate) return
  
  const customName = document.getElementById('duplicate-station-new-name').value.trim()
  const newName = customName || `${stationToDuplicate.name} (Kopya)`
  
  try {
    // Generate new station ID based on the same operations
    const newStationId = await generateStationId(stationToDuplicate.operationIds)
    
    // Create duplicated station with new ID and updated name
    const duplicatedStation = {
      ...stationToDuplicate,
      id: newStationId,
      name: newName,
      // Generate new sub-stations with the new parent station ID
      subStations: stationToDuplicate.subStations ? 
        generateInitialSubStations(newStationId, stationToDuplicate.subStations.length, stationToDuplicate.status) :
        generateInitialSubStations(newStationId, 1, stationToDuplicate.status)
    }
    
    // Normalize the station data
    const normalizedForState = normalizeStationForState(duplicatedStation)
    
    // Add to stations state
    stationsState.push(normalizedForState)
    
    // Save to backend
    await saveStations(stationsState)
    
    // Re-render stations
    renderStations()
    
    // Close modal and detail panel
    closeStationDuplicateModal()
    closeStationDetail()
    
    // Show success message
    showSuccessToast(`İstasyon başarıyla "${newName}" adıyla kopyalandı`)
    
  } catch (e) {
    console.error('Station duplication error:', e)
    showErrorToast(e.message || 'İstasyon kopyalanamadı')
  }
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
  
  // Set substation count
  const subStationCountInput = document.getElementById('station-substation-count')
  if (subStationCountInput) {
    if (editingStationId) {
      // Editing: show current count, make it read-only (can't change existing substations here)
      const existingCount = Array.isArray(station.subStations) ? station.subStations.length : 1
      subStationCountInput.value = existingCount
      subStationCountInput.disabled = true
      subStationCountInput.style.opacity = '0.5'
      subStationCountInput.style.cursor = 'not-allowed'
    } else {
      // New station: allow editing
      subStationCountInput.value = 1
      subStationCountInput.disabled = false
      subStationCountInput.style.opacity = '1'
      subStationCountInput.style.cursor = 'text'
    }
  }
  
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
    // Load skills from SQL database
    const skills = await getSkillsFromSQL()
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
            Array.from(selected).map(skillId => {
              const isInherited = inheritedSet.has(skillId)
              const bgColor = isInherited ? 'rgb(219, 234, 254)' : 'rgb(252, 165, 165)'
              const textColor = isInherited ? 'rgb(30, 64, 175)' : 'rgb(127, 29, 29)'
              const title = isInherited ? 'Operasyondan miras alınan yetenek' : 'İstasyon özel yetenek'
              const skillName = getSkillName(skillId) // Convert ID to name
              return `<span style="background-color: ${bgColor}; color: ${textColor}; padding: 2px 6px; border-radius: 4px; font-size: 11px; font-weight: 500; margin-right: 4px; margin-bottom: 4px; display: inline-block;" title="${title}">${escapeHtml(skillName)}</span>`
            }).join('') : 
            '<span style="color: var(--muted-foreground); font-style: italic;">Henüz skill seçilmedi</span>'
          }
        </div>
        <div style="padding: 8px 12px; border-bottom: 1px solid var(--border); display: flex; gap: 6px;">
          <input id="station-skill-new" type="text" placeholder="Yeni skill ekle..." style="flex: 1; padding: 6px 8px; border: 1px solid var(--border); border-radius: 4px; font-size: 12px;">
          <button id="station-skill-add" style="padding: 6px 8px; border: 1px solid var(--border); background: white; border-radius: 4px; cursor: pointer; font-size: 12px;">+ Ekle</button>
        </div>
        <div class="skills-grid" style="max-height: 200px; overflow-y: auto; padding: 8px; display: grid; grid-template-columns: repeat(2, minmax(0px, 1fr)); gap: 6px;" id="station-skills-grid">
          ${skills.map(s => {
            const checked = selected.has(s.id) ? 'checked' : ''
            const isInherited = inheritedSet.has(s.id)
            const disabled = isInherited ? 'disabled' : ''
            const opacity = isInherited ? 'opacity: 0.6;' : ''
            const title = isInherited ? 'Bu yetenek operasyondan miras alınmıştır ve değiştirilemez' : ''
            return `<label style="display: flex; align-items: center; gap: 8px; padding: 4px; cursor: ${isInherited ? 'not-allowed' : 'pointer'}; font-size: 12px; ${opacity}" title="${title}">
              <input type="checkbox" value="${escapeHtml(s.id)}" ${checked} ${disabled} onchange="updateStationSkillsDisplay()" style="margin: 0;">
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
          // Auto-check the newly added skill by updating selected set with skill ID
          station.subSkills = Array.from(new Set([...(station.subSkills||[]), created.id]))
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
      selected.map(skillId => {
        const skillName = getSkillName(skillId) // Convert ID to name
        return `<span style="background-color: rgb(252, 165, 165); color: rgb(127, 29, 29); padding: 2px 6px; border-radius: 4px; font-size: 11px; font-weight: 500; margin-right: 4px; margin-bottom: 4px; display: inline-block;">${escapeHtml(skillName)}</span>`
      }).join('') : 
      '<span style="color: var(--muted-foreground); font-style: italic;">Henüz skill seçilmedi</span>'
  }
}

// Expose function globally for inline handlers
window.updateStationSkillsDisplay = updateStationSkillsDisplay

function normalizeSubStationEntry(entry) {
  if (!entry) return null
  const code = String(entry.code || '').trim()
  if (!code) return null
  const status = SUB_STATION_STATUSES.includes(entry.status) ? entry.status : 'active'
  return { code, status }
}

function getSubStationNumericSuffix(code) {
  const match = /-(\d+)$/.exec(String(code || ''))
  return match ? parseInt(match[1], 10) : Number.MAX_SAFE_INTEGER
}

function sortSubStations(subStations = []) {
  return [...subStations].sort((a, b) => getSubStationNumericSuffix(a.code) - getSubStationNumericSuffix(b.code))
}

function normalizeStationForState(station) {
  const normalizedSubStations = Array.isArray(station?.subStations)
    ? sortSubStations(station.subStations.map(normalizeSubStationEntry).filter(Boolean))
    : []
  const normalizedCount = Number.isFinite(station?.subStationCount)
    ? Math.max(0, station.subStationCount)
    : normalizedSubStations.length
  return {
    ...station,
    subStations: normalizedSubStations,
    subStationCount: normalizedCount
  }
}

function generateInitialSubStations(stationId, count, status) {
  const safeCount = Math.max(1, count || 1)
  const safeStatus = SUB_STATION_STATUSES.includes(status) ? status : 'active'
  const list = []
  for (let i = 1; i <= safeCount; i++) {
    list.push({ code: `${stationId}-${i}`, status: safeStatus })
  }
  return list
}

function getSubStationStatusStyles(status) {
  switch (status) {
    case 'active':
      return { bg: 'rgb(220, 252, 231)', color: 'rgb(22, 101, 52)', border: 'rgba(22, 101, 52, 0.4)' }
    case 'maintenance':
      return { bg: 'rgb(254, 249, 195)', color: 'rgb(161, 98, 7)', border: 'rgba(161, 98, 7, 0.4)' }
    case 'inactive':
    default:
      return { bg: 'rgb(254, 226, 226)', color: 'rgb(153, 27, 27)', border: 'rgba(153, 27, 27, 0.4)' }
  }
}

function escapeJsString(value) {
  return String(value || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'")
}

function buildSubStationsSection(station) {
  const subStations = sortSubStations(Array.isArray(station.subStations) ? station.subStations : [])
  const total = subStations.length
  const stationIdJs = escapeJsString(station.id || '')
  const listHtml = subStations.length ? subStations.map(sub => {
    const status = SUB_STATION_STATUSES.includes(sub.status) ? sub.status : 'active'
    const { bg, color, border } = getSubStationStatusStyles(status)
    const subCode = escapeHtml(sub.code)
    const subCodeJs = escapeJsString(sub.code)
    // Use subCode as substationId since they are the same
    const substationIdJs = escapeJsString(sub.code)
    return `
      <div style="display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 4px; border: 1px solid var(--border); border-radius: 6px; background: white; cursor: pointer;" data-substation-code="${subCode}" onclick="showSubStationDetail('${substationIdJs}')" title="Detayları görmek için tıklayın">
        <div style="display: flex; align-items: center; gap: 8px; flex: 1;">
          <span style="font-family: monospace; font-size: 12px; font-weight: 500;">${subCode}</span>
          <span style="font-size: 10px; color: rgb(156, 163, 175); font-style: italic;">Detayları görmek için tıkla</span>
        </div>
        <div style="display: flex; gap: 8px;">
          <button type="button" data-role="status-toggle" style="padding: 1px 2px; border: 1px solid ${border}; background: ${bg}; color: ${color}; border-radius: 4px; font-size: 11px; cursor: pointer; font-weight: 500;" onclick="event.stopPropagation(); toggleSubStationStatus('${stationIdJs}', '${subCodeJs}')">${escapeHtml(status)}</button>
          <button type="button" style="padding: 1px 2px; border: 1px solid #ef4444; background: white; color: #ef4444; border-radius: 4px; font-size: 11px; cursor: pointer;" onclick="event.stopPropagation(); deleteSubStation('${stationIdJs}', '${subCodeJs}')">Sil</button>
        </div>
      </div>
    `
  }).join('') : `
    <div style="padding: 12px; border: 1px dashed var(--border); border-radius: 6px; font-size: 12px; color: var(--muted-foreground); text-align: center;">
      Henüz sub istasyon eklenmemiş.
    </div>
  `

  return `
    <div style="margin-bottom: 4px; padding: 12px; background: white; border-radius: 6px; border: 1px solid var(--border);">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 3px; padding-bottom: 6px; border-bottom: 1px solid var(--border);">
        <div style="display: flex; align-items: center; gap: 8px;">
          <h3 style="margin: 0; font-size: 14px; font-weight: 600; color: rgb(17, 24, 39);">İstasyonlar</h3>
          <span data-role="substation-total" data-station-id="${escapeHtml(station.id || '')}" style="font-size: 12px; color: rgb(107, 114, 128);">(${total})</span>
        </div>
        <button type="button" data-role="button" onclick="handleSubStationAdd('${stationIdJs}')" style="padding: 6px 12px; border: 1px solid var(--border); background: white; border-radius: 4px; font-size: 12px; cursor: pointer;">İstasyon Ekle</button>
      </div>
      <div class="substation-list" style="display: grid; gap: 4px;">
        ${listHtml}
      </div>
      <div class="substation-add" data-station-id="${escapeHtml(station.id || '')}" data-mode="idle" style="margin-top: 3px; display: flex; gap: 8px; align-items: center;">
        <input type="number" min="1" value="1" data-role="input" oninput="handleSubStationAddInputChange('${stationIdJs}')" style="display: none; width: 80px; padding: 6px 8px; border: 1px solid var(--border); border-radius: 4px; font-size: 12px;" />
      </div>
    </div>
  `
}

function initializeSubStationAddSection(stationId) {
  const container = findSubStationAddContainer(stationId)
  if (!container) return
  container.dataset.mode = 'idle'
  const input = container.querySelector('input[data-role="input"]')
  if (input) {
    input.value = '1'
    input.style.display = 'none'
  }
  const button = container.querySelector('button[data-role="button"]')
  if (button) {
    button.textContent = 'İstasyon Ekle'
  }
}

function findSubStationAddContainer(stationId) {
  const containers = document.querySelectorAll('.substation-add')
  return Array.from(containers).find(el => el.dataset.stationId === stationId) || null
}

function updateSubStationAddButtonLabel(container) {
  if (!container) return
  const input = container.querySelector('input[data-role="input"]')
  const button = container.querySelector('button[data-role="button"]')
  if (!input || !button) return
  const value = Math.max(1, parseInt(input.value || '1', 10) || 1)
  button.innerHTML = `<strong>${value}</strong> istasyon ekle`
}

function findStationIndexById(stationId) {
  return stationsState.findIndex(s => s.id === stationId)
}

function updateSubStationDomElements(subStationCode, status) {
  const row = document.querySelector(`.substation-list [data-substation-code="${subStationCode}"]`)
  if (!row) return
  const toggle = row.querySelector('[data-role="status-toggle"]')
  const { bg, color, border } = getSubStationStatusStyles(status)
  if (toggle) {
    toggle.textContent = status
    toggle.style.background = bg
    toggle.style.color = color
    toggle.style.border = `1px solid ${border}`
  }
}

function removeSubStationDomElement(subStationCode) {
  const row = document.querySelector(`.substation-list [data-substation-code="${subStationCode}"]`)
  if (row?.parentElement) {
    row.parentElement.removeChild(row)
  }
}

function updateSubStationTotalCount(stationId, total) {
  const target = document.querySelector(`[data-role="substation-total"][data-station-id="${stationId}"]`)
  if (target) {
    target.textContent = `Toplam: ${total}`
  }
}

async function addSubStationsToStation(stationId, count) {
  const idx = findStationIndexById(stationId)
  if (idx < 0) {
    showErrorToast('Station not found')
    return
  }

  const normalizedStation = normalizeStationForState(stationsState[idx])
  stationsState[idx] = normalizedStation

  const sanitizedCount = Math.max(1, count || 1)
  const usedNumbers = new Set((normalizedStation.subStations || []).map(sub => getSubStationNumericSuffix(sub.code)))
  const newEntries = []
  let candidate = 1
  while (newEntries.length < sanitizedCount) {
    if (!usedNumbers.has(candidate)) {
      const baseStatus = SUB_STATION_STATUSES.includes(normalizedStation.status) ? normalizedStation.status : 'active'
      newEntries.push({ code: `${normalizedStation.id}-${candidate}`, status: baseStatus })
      usedNumbers.add(candidate)
    }
    candidate += 1
    if (candidate > 10000) break
  }

  if (!newEntries.length) {
    showWarningToast('Yeni sub istasyon için uygun numara bulunamadı')
    return
  }

  const previousStation = stationsState[idx]
  const updatedStation = normalizeStationForState({
    ...normalizedStation,
    subStations: sortSubStations([...(normalizedStation.subStations || []), ...newEntries]),
    subStationCount: (normalizedStation.subStations?.length || 0) + newEntries.length
  })

  stationsState[idx] = updatedStation

  try {
    await saveStations(stationsState)
    showSuccessToast(`${newEntries.length} sub istasyon eklendi`)
    renderStations()
    await showStationDetail(stationId)
  } catch (error) {
    console.error('Sub station add error:', error)
    stationsState[idx] = previousStation
    showErrorToast('Sub istasyon eklenemedi')
  }
}

export function handleSubStationAdd(stationId) {
  const container = findSubStationAddContainer(stationId)
  if (!container) return
  const input = container.querySelector('input[data-role="input"]')
  const mode = container.dataset.mode || 'idle'

  if (mode === 'idle') {
    container.dataset.mode = 'input'
    if (input) {
      input.style.display = 'block'
      input.focus()
      input.select()
    }
    updateSubStationAddButtonLabel(container)
    return
  }

  if (!input) return
  const count = Math.max(1, parseInt(input.value || '1', 10) || 1)
  addSubStationsToStation(stationId, count).catch(() => {})
}

export function handleSubStationAddInputChange(stationId) {
  const container = findSubStationAddContainer(stationId)
  if (!container) return
  updateSubStationAddButtonLabel(container)
}

export async function toggleSubStationStatus(stationId, subStationCode) {
  const idx = findStationIndexById(stationId)
  if (idx < 0) {
    showErrorToast('Station not found')
    return
  }

  const normalizedStation = normalizeStationForState(stationsState[idx])
  stationsState[idx] = normalizedStation

  const subStations = [...(normalizedStation.subStations || [])]
  const targetIndex = subStations.findIndex(sub => sub.code === subStationCode)
  if (targetIndex < 0) {
    showWarningToast('Sub istasyon bulunamadı')
    return
  }

  const row = document.querySelector(`.substation-list [data-substation-code="${subStationCode}"]`)
  const toggleButton = row?.querySelector('[data-role="status-toggle"]')
  if (toggleButton) toggleButton.disabled = true

  const currentStatus = subStations[targetIndex].status
  const currentIdx = SUB_STATION_STATUSES.indexOf(currentStatus)
  const nextStatus = SUB_STATION_STATUSES[(currentIdx + 1) % SUB_STATION_STATUSES.length]

  const previousStation = stationsState[idx]
  subStations[targetIndex] = { ...subStations[targetIndex], status: nextStatus }

  const updatedStation = normalizeStationForState({
    ...normalizedStation,
    subStations,
    subStationCount: subStations.length
  })
  stationsState[idx] = updatedStation

  try {
    await saveStations(stationsState)
    showSuccessToast('Sub istasyon durumu güncellendi')
    updateSubStationDomElements(subStationCode, nextStatus)
  } catch (error) {
    console.error('Sub station status update error:', error)
    stationsState[idx] = previousStation
    showErrorToast('Sub istasyon durumu güncellenemedi')
    updateSubStationDomElements(subStationCode, currentStatus)
  } finally {
    if (toggleButton) toggleButton.disabled = false
  }
}

export async function deleteSubStation(stationId, subStationCode) {
  const idx = findStationIndexById(stationId)
  if (idx < 0) {
    showErrorToast('Station not found')
    return
  }

  const normalizedStation = normalizeStationForState(stationsState[idx])
  stationsState[idx] = normalizedStation

  if ((normalizedStation.subStations || []).length <= 1) {
    showWarningToast('Bir istasyonun en az 1 sub istasyonu olmalı')
    return
  }

  if (!confirm('Bu sub istasyonu silmek istediğinize emin misiniz?')) return

  if (!(normalizedStation.subStations || []).some(sub => sub.code === subStationCode)) {
    showWarningToast('Sub istasyon bulunamadı')
    return
  }

  const remaining = (normalizedStation.subStations || []).filter(sub => sub.code !== subStationCode)
  const previousStation = stationsState[idx]

  const updatedStation = normalizeStationForState({
    ...normalizedStation,
    subStations: remaining,
    subStationCount: remaining.length
  })

  stationsState[idx] = updatedStation

  try {
    await saveStations(stationsState)
    showSuccessToast('Sub istasyon silindi')
    removeSubStationDomElement(subStationCode)
    updateSubStationTotalCount(stationId, remaining.length)
  } catch (error) {
    console.error('Sub station delete error:', error)
    stationsState[idx] = previousStation
    showErrorToast('Sub istasyon silinemedi')
  }
}

export function closeStationModal(event) {
  if (event && event.target !== event.currentTarget) return
  document.getElementById('station-modal').style.display = 'none'
  
  // If detail panel was open before modal, reopen it
  if (wasDetailPanelOpen && editingStationId) {
    showStationDetail(editingStationId).catch(console.error)
  }
  
  // Reset the flag
  wasDetailPanelOpen = false
}

export async function saveStation() {
  const name = document.getElementById('station-name').value.trim()
  const description = document.getElementById('station-description').value.trim()
  const location = document.getElementById('station-location').value.trim()
  const status = document.getElementById('station-status').value
  const operationIds = Array.from(document.querySelectorAll('#station-operations input[type="checkbox"]:checked')).map(cb => cb.value)
  const subSkills = Array.from(document.querySelectorAll('#station-subskills-box input[type="checkbox"]:checked')).map(cb => cb.value)
  
  // Get substation count from input
  const subStationCountInput = document.getElementById('station-substation-count')
  const requestedSubStationCount = subStationCountInput ? Math.max(1, Math.min(50, parseInt(subStationCountInput.value) || 1)) : 1

  if (!name) { showErrorToast('Please enter a station name'); return }
  if (operationIds.length < 1) { showWarningToast('Select at least one operation for this station'); return }

  try {
    let stationId = editingStationId
    
    // Generate new ID for new stations using the new format
    if (!editingStationId) {
      stationId = await generateStationId(operationIds)
    }

    // Determine substations
    let subStations = []
    if (!editingStationId) {
      // For new stations, create the requested number of substations
      subStations = generateInitialSubStations(stationId, requestedSubStationCount, status)
    } else {
      // For existing stations, keep existing substations unchanged
      const existingStation = stationsState.find(s => s.id === editingStationId)
      subStations = existingStation?.subStations || []
    }
    
    const subStationCount = subStations.length

    // normalizeStation now returns a regular station object
    const payload = normalizeStation({
      id: stationId,
      name, description, location, status, operationIds, subSkills,
      subStations,
      subStationCount
    }, operationsCache)

    const normalizedForState = normalizeStationForState(payload)
    const idx = stationsState.findIndex(s => s.id === payload.id)
    if (idx >= 0) stationsState[idx] = { ...stationsState[idx], ...normalizedForState }
    else stationsState.push(normalizedForState)

    await saveStations(stationsState)
    document.getElementById('station-modal').style.display = 'none'
    renderStations()
    showSuccessToast(editingStationId ? 'Station updated' : 'Station added')
    
    // If detail panel was open before modal, reopen it
    if (wasDetailPanelOpen && editingStationId) {
      showStationDetail(editingStationId).catch(console.error)
    }
    
    // Reset the flag
    wasDetailPanelOpen = false
  } catch (e) {
    console.error('Station save error:', e)
    showErrorToast(e.message || 'Station could not be saved')
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
    showSuccessToast('Station status updated')
  } catch (e) {
    console.error('Station status save error:', e)
    showErrorToast('Station status update failed')
  }
}

export async function deleteStation(stationId) {
  if (!confirm('Are you sure you want to delete this station?')) return
  try {
    // Prefer backend delete to avoid failing batch validations
    const { API_BASE, withAuth } = await import('../../../shared/lib/api.js')
    const res = await fetch(`${API_BASE}/api/mes/stations/${encodeURIComponent(stationId)}`, { method: 'DELETE', headers: withAuth() })
    if (!res.ok) throw new Error(`delete_failed ${res.status}`)
    // Invalidate stations cache and refetch fresh list post-change
    invalidateStationsCache()
    stationsState = (await getStations()).map(station => normalizeStationForState(station))
    renderStations()
    showSuccessToast('Station deleted')
  } catch (e) {
    console.error('Station delete error:', e)
    showErrorToast('Station could not be deleted')
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

// Update technical status of substation
export async function updateTechnicalStatus(substationId, newStatus) {
  try {
    const response = await fetch(`/api/mes/substations/${substationId}/technical-status`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ technicalStatus: newStatus })
    })
    
    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || 'Teknik durum güncellenemedi')
    }
    
    const result = await response.json()
    
    // Başarılı mesajı göster
    const statusNames = {
      active: 'Aktif',
      passive: 'Pasif',
      maintenance: 'Bakımda'
    }
    showSuccessToast(`Teknik durum güncellendi: ${statusNames[newStatus]}`)
    
    // Eğer detail panel açıksa, yenile
    const detailPanel = document.getElementById('substation-detail-panel')
    if (detailPanel && detailPanel.style.display !== 'none') {
      showSubStationDetail(substationId)
    }
    
    // Ana station listesini de güncelle
    renderStations()
    
  } catch (error) {
    console.error('Technical status update error:', error)
    showErrorToast(error.message || 'Teknik durum güncellenemedi')
    
    // Hata durumunda dropdown'u eski haline döndür
    const select = document.getElementById('technical-status-select')
    if (select) {
      // API'den mevcut durumu tekrar çek
      showSubStationDetail(substationId)
    }
  }
}

// Make function globally available
window.updateTechnicalStatus = updateTechnicalStatus

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}
