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
  if (list) list.innerHTML = '<div class="station-loading"><span class="station-loading-text">Loading stations...</span></div>'
  try {
    operationsCache = await getOperations(true)
    skillsCache = await getSkillsFromSQL() // Load skills for ID→name mapping
    stationsState = (await getStations()).map(station => normalizeStationForState(station))
    renderStations()
  } catch (e) {
    console.error('Stations load error:', e)
    if (list) list.innerHTML = '<div class="station-loading"><span class="text-danger">Stations yüklenemedi.</span></div>'
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
            <th class="min-w-70">
              <button type="button" class="mes-sort-button" onclick="sortStations('id')">
                Station ID <span class="mes-sort-icon">${getSortIcon('id')}</span>
              </button>
            </th>
            <th class="min-w-200">
              <button type="button" class="mes-sort-button" onclick="sortStations('name')">
                Station Name <span class="mes-sort-icon">${getSortIcon('name')}</span>
              </button>
            </th>
          </tr>
        `
      } else {
        thead.innerHTML = `
          <tr>
            <th class="min-w-70">
              <button type="button" class="mes-sort-button" onclick="sortStations('id')">
                Station ID <span class="mes-sort-icon">${getSortIcon('id')}</span>
              </button>
            </th>
            <th class="min-w-200">
              <button type="button" class="mes-sort-button" onclick="sortStations('name')">
                Station Name <span class="mes-sort-icon">${getSortIcon('name')}</span>
              </button>
            </th>
            <th class="th-amount text-center">
              <button type="button" class="mes-sort-button" onclick="sortStations('amount')">
                Amount <span class="mes-sort-icon">${getSortIcon('amount')}</span>
              </button>
            </th>
            <th class="min-w-160">
              <button type="button" class="mes-sort-button" onclick="sortStations('operations')">
                Operations <span class="mes-sort-icon">${getSortIcon('operations')}</span>
              </button>
            </th>
            <th class="min-w-160">
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
      <span class="flex-1">${escapeHtml(item.label)}</span>
<span class="filter-count">(${item.count})</span>
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
    <div class="station-loading">
      <div class="station-loading-text">Yükleniyor...</div>
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
      <div class="station-detail-section">
        <h3 class="station-detail-title">Temel Bilgiler</h3>
        <div class="station-detail-row">
          <span class="station-detail-label">İsim:</span>
          <span class="station-detail-value">${escapeHtml(station.name || '')}</span>
        </div>
        <div class="station-detail-row">
          <span class="station-detail-label">Status:</span>
          <span class="station-detail-value">
            <span class="badge badge-${station.status === 'active' ? 'success' : (station.status === 'maintenance' ? 'warning' : 'default')}">${escapeHtml(station.status || '')}</span>
          </span>
        </div>
        <div class="station-detail-row">
          <span class="station-detail-label">Location:</span>
          <span class="station-detail-value">${escapeHtml(station.location || '-')}</span>
        </div>
        <div class="station-detail-row no-margin-bottom">
          <span class="station-detail-label">Açıklama:</span>
          <span class="station-detail-value">${escapeHtml(station.description || '-')}</span>
        </div>
      </div>
      
      <div class="station-detail-section">
        <h3 class="station-detail-title">Desteklenen Operasyonlar</h3>
        <div class="flex-wrap-gap">
          ${opsLabels.length > 0 ? opsLabels.map(name => 
            `<span class="badge-muted">${escapeHtml(name)}</span>`
          ).join('') : '<span class="text-muted text-italic">Operasyon tanımlanmamış</span>'}
        </div>
      </div>
      
      <div class="station-detail-section">
        <h3 class="station-detail-title">Yetenekler</h3>
        <div class="flex-wrap-gap">
          ${effective.length > 0 ? effective.map(skill => {
            const skillName = getSkillName(skill) // Convert ID to name
            return `<span class="badge-muted">${escapeHtml(skillName)}</span>`
          }).join('') : '<span class="text-muted text-italic">Yetenek tanımlanmamış</span>'}
        </div>
        ${stationSpecificSkills.length > 0 ? `
          <div class="sub-info-section">
            <div class="sub-info-label">İstasyon Özel Yetenekleri:</div>
            <div class="flex-wrap-gap-xs">
              ${stationSpecificSkills.map(skill => {
                const skillName = getSkillName(skill) // Convert ID to name
                return `<span class="badge-error">${escapeHtml(skillName)}</span>`
              }).join('')}
            </div>
          </div>
        ` : ''}
      </div>
      ${subStationsSection}
      
      <div class="station-detail-section no-margin-bottom">
        <h3 class="station-detail-title">Çalışabilecek Personel (${stationWorkersData.compatibleWorkers.length})</h3>
        ${stationWorkersData.requiredSkills.length > 0 ? `
          <div class="skill-info-box">
            <div class="skill-info-label">Gerekli Yetenekler:</div>
            <div class="flex-wrap-gap-xs">
              ${stationWorkersData.requiredSkills.map(skill => {
                const skillName = getSkillName(skill) // Convert ID to name
                return `<span class="badge-primary">${escapeHtml(skillName)}</span>`
              }).join('')}
            </div>
          </div>
        ` : ''}
        ${stationWorkersData.compatibleWorkers.length > 0 ? `
          <div class="grid-gap-8">
            ${stationWorkersData.compatibleWorkers.map(worker => `
              <div class="worker-card">
                <div class="worker-card-header">
                  <span class="worker-card-name">${escapeHtml(worker.name || '')}</span>
                  <span class="item-subtitle">${escapeHtml(worker.status || 'available')}</span>
                </div>
                <div class="flex-wrap-gap-3">
                  ${(worker.skills || []).map(skill => {
                    const skillName = getSkillName(skill) // Convert ID to name
                    return `<span class="badge-skill-xs">${escapeHtml(skillName)}</span>`
                  }).join('')}
                </div>
                ${worker.station ? `
                  <div class="worker-card-station">
                    Mevcut İstasyon: ${escapeHtml(worker.station)}
                  </div>
                ` : ''}
              </div>
            `).join('')}
          </div>
        ` : `
          <div class="empty-state-center">
            Bu istasyonda çalışabilecek uygun personel bulunamadı.
            ${stationWorkersData.requiredSkills.length > 0 ? 
              `<br><span class="text-11">Tüm gerekli yeteneklere sahip personel gerekiyor.</span>` : 
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
      <div class="station-detail-section">
        <h3 class="station-detail-title">Temel Bilgiler</h3>
        <div class="detail-item" class="station-detail-row">
          <span class="detail-label" class="station-detail-label">İsim:</span>
          <span class="station-detail-value">${escapeHtml(station.name || '')}</span>
        </div>
        <div class="detail-item" class="station-detail-row">
          <span class="detail-label" class="station-detail-label">Status:</span>
          <span class="station-detail-value">
            <span class="badge badge-${station.status === 'active' ? 'success' : (station.status === 'maintenance' ? 'warning' : 'default')}">${escapeHtml(station.status || '')}</span>
          </span>
        </div>
        <div class="detail-item" class="station-detail-row">
          <span class="detail-label" class="station-detail-label">Location:</span>
          <span class="station-detail-value">${escapeHtml(station.location || '-')}</span>
        </div>
        <div class="detail-item" class="station-detail-row no-margin-bottom">
          <span class="detail-label" class="station-detail-label">Açıklama:</span>
          <span class="station-detail-value">${escapeHtml(station.description || '-')}</span>
        </div>
      </div>
      
      <div class="station-detail-section">
        <h3 class="station-detail-title">Desteklenen Operasyonlar</h3>
        <div class="flex-wrap-gap">
          ${opsLabels.length > 0 ? opsLabels.map(name => 
            `<span class="badge-muted">${escapeHtml(name)}</span>`
          ).join('') : '<span class="text-muted text-italic">Operasyon tanımlanmamış</span>'}
        </div>
      </div>
      
      <div class="station-detail-section">
        <h3 class="station-detail-title">Yetenekler</h3>
        <div class="flex-wrap-gap">
          ${effective.length > 0 ? effective.map(skill => {
            const skillName = getSkillName(skill) // Convert ID to name
            return `<span class="badge-muted">${escapeHtml(skillName)}</span>`
          }).join('') : '<span class="text-muted text-italic">Yetenek tanımlanmamış</span>'}
        </div>
        ${(station.subSkills || []).length > 0 ? `
          <div class="sub-info-section">
            <div class="sub-info-label">İstasyon Özel Yetenekleri:</div>
            <div class="flex-wrap-gap-xs">
              ${(station.subSkills || []).map(skill => {
                const skillName = getSkillName(skill) // Convert ID to name
                return `<span class="badge-error">${escapeHtml(skillName)}</span>`
              }).join('')}
            </div>
          </div>
        ` : ''}
      </div>
      ${subStationsSection}
      
      <div class="station-detail-section no-margin-bottom">
        <h3 class="station-detail-title">Çalışabilecek Personel</h3>
        <div class="empty-state-error">
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
    <div class="station-loading">
      <div class="loading-text-muted">Alt istasyon detayları yükleniyor...</div>
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
      <div class="mes-section" class="station-detail-section">
        <div class="mes-section-header" class="station-detail-title with-icon">
          <i data-lucide="info" class="icon-16 icon-blue"></i>
          Alt İstasyon Bilgileri
        </div>
        <div class="detail-item" class="flex-center-gap mb-8">
          <span class="detail-label" class="station-detail-label">Kod:</span>
          <span class="detail-value detail-value-mono">${escapeHtml(substation.code)}</span>
        </div>
        <div class="detail-item" class="flex-center-gap mb-8">
          <span class="detail-label" class="station-detail-label">Ana İstasyon:</span>
          <span class="detail-value detail-value-text">${escapeHtml(substation.stationName || substation.stationId)}</span>
        </div>
        <div class="detail-item station-detail-row no-margin-bottom">
          <span class="detail-label station-detail-label">Teknik Durum:</span>
          <select id="technical-status-select" class="form-select-technical" onchange="updateTechnicalStatus('${escapeHtml(substationId)}', this.value)">
            <option value="active" ${substation.technicalStatus === 'active' ? 'selected' : ''}>🟢 Aktif</option>
            <option value="passive" ${substation.technicalStatus === 'passive' ? 'selected' : ''}>⚪ Pasif</option>
            <option value="maintenance" ${substation.technicalStatus === 'maintenance' ? 'selected' : ''}>🟡 Bakımda</option>
          </select>
        </div>
      </div>
      
      <!-- Mevcut Görev -->
      <div class="mes-section" class="station-detail-section">
        <div class="mes-section-header" class="station-detail-title with-icon">
          <i data-lucide="play-circle" class="icon-16 icon-blue"></i>
          Mevcut Görev
        </div>
        ${currentTask ? `
          <div class="current-task-card">
            <div class="current-task-header">
              <div class="current-task-title">
                <i data-lucide="factory" class="icon-14-muted"></i>
                ${escapeHtml(currentTask.operationName)}
              </div>
              ${currentTask.timeRemaining !== null ? `
                <div class="current-task-timer">
                  <i data-lucide="clock" class="icon-12"></i>
                  ${formatDuration(currentTask.timeRemaining)} kaldı
                </div>
              ` : ''}
            </div>
            <div class="current-task-details">
              ${currentTask.planName ? `
              <div class="item-row">
                <i data-lucide="clipboard-list" class="icon-11"></i>
                <span class="font-500">Plan:</span> ${escapeHtml(currentTask.planName)}
              </div>
              ` : ''}
              <div class="item-row">
                <i data-lucide="package" class="icon-11"></i>
                <span class="font-500">İş Paketi:</span> ${escapeHtml(currentTask.workPackageId || '-')}
              </div>
              <div class="item-row">
                <i data-lucide="user" class="icon-11"></i>
                <span class="font-500">İşçi:</span> ${escapeHtml(currentTask.workerName)}
              </div>
              <div class="item-row">
                <i data-lucide="play" class="icon-11"></i>
                <span class="font-500">Başlangıç:</span> ${formatTime(currentTask.startTime)}
              </div>
              ${currentTask.expectedEnd ? `
                <div class="item-row">
                  <i data-lucide="flag" class="icon-11"></i>
                  <span class="font-500">Tahmini Bitiş:</span> ${formatTime(currentTask.expectedEnd)}
                </div>
              ` : ''}
              ${currentTask.estimatedDuration ? `
                <div class="flex-center-gap-sm">
                  <i data-lucide="timer" class="icon-11"></i>
                  <span class="font-500">Süre:</span> ${formatDuration(currentTask.estimatedDuration)}
                </div>
              ` : ''}
            </div>
          </div>
        ` : `
          <div class="empty-state-center">
            <i data-lucide="coffee" class="worker-card-placeholder"></i>
            <div>Şu anda atanmış bir görev bulunmuyor</div>
          </div>
        `}
      </div>
      
      <!-- Yaklaşan Görevler -->
      <div class="mes-section station-detail-section">
        <div class="section-header-split">
          <div class="section-header-title">
            <i data-lucide="list-todo" class="icon-16 icon-blue"></i>
            Yaklaşan Görevler
            <span class="count-badge">${upcomingTasks.length}</span>
          </div>
          <button type="button" onclick="showSubStationDetail('${escapeHtml(substationId)}')" class="btn-refresh-sm">
            <i data-lucide="refresh-cw" class="icon-12"></i>
            Yenile
          </button>
        </div>
        ${upcomingTasks.length > 0 ? `
          <div class="tasks-grid-scroll">
            ${upcomingTasks.map((task, index) => `
              <div class="${task.status === 'pending' ? 'task-card-pending' : 'task-card-queued'}">
                <div class="upcoming-task-header">
                  <div class="upcoming-task-title">
                    <span class="count-badge-sm">#${index + 1}</span>
                    <i data-lucide="factory" class="icon-12-muted"></i>
                    ${escapeHtml(task.operationName)}
                  </div>
                  <span class="${task.status === 'pending' ? 'status-badge-pending' : 'status-badge-queued'}">
                    ${task.status === 'pending' ? 'Bekliyor' : 'Kuyrukta'}
                  </span>
                </div>
                <div class="item-subtitle">
                  ${task.planName ? `
                  <div class="item-row">
                    <i data-lucide="clipboard-list" class="icon-10"></i>
                    <span class="font-500">Plan:</span> ${escapeHtml(task.planName)}
                  </div>
                  ` : ''}
                  <div class="item-row">
                    <i data-lucide="package" class="icon-10"></i>
                    <span class="font-500">İş Paketi:</span> ${escapeHtml(task.workPackageId || '-')}
                  </div>
                  <div class="item-row">
                    <i data-lucide="user" class="icon-10"></i>
                    <span class="font-500">İşçi:</span> ${escapeHtml(task.workerName)}
                  </div>
                  <div class="flex-center-gap-sm">
                    <i data-lucide="calendar" class="icon-10"></i>
                    <span class="font-500">Tahmini Başlangıç:</span> ${formatTime(task.estimatedStartTime)}
                    ${task.estimatedDuration ? ` <span class="ml-8"><i data-lucide="timer" class="icon-inline"></i> ${formatDuration(task.estimatedDuration)}</span>` : ''}
                  </div>
                </div>
              </div>
            `).join('')}
          </div>
        ` : `
          <div class="empty-state-center">
            <i data-lucide="inbox" class="worker-card-placeholder"></i>
            <div>Yaklaşan görev bulunmuyor</div>
          </div>
        `}
      </div>
      
      <!-- Performans Bilgileri -->
      <div class="mes-section station-detail-section">
        <div class="mes-section-header station-detail-title with-icon">
          <i data-lucide="bar-chart-2" class="icon-16 icon-blue"></i>
          Performans Özeti
        </div>
        <div class="performance-grid">
          <div class="sub-list-item">
            <div class="item-header-row">
              <i data-lucide="check-circle" class="icon-12"></i>
              Tamamlanan
            </div>
            <div class="stat-value-large">${performance.totalCompleted || 0}</div>
          </div>
          <div class="sub-list-item">
            <div class="item-header-row">
              <i data-lucide="clock" class="icon-12"></i>
              Ort. Süre
            </div>
            <div class="stat-value-large">${formatDuration(performance.avgCompletionTime) || '-'}</div>
          </div>
        </div>
        ${performance.totalDefects > 0 ? `
          <div class="defect-warning">
            <div class="defect-warning-content">
              <i data-lucide="alert-triangle" class="icon-12"></i>
              <span class="font-600">Toplam Kusur:</span> ${performance.totalDefects}
            </div>
          </div>
        ` : ''}
      </div>
    `
    
    // Initialize Lucide icons in the detail panel
    if (window.lucide) {
      setTimeout(() => {
        try {
          window.lucide.createIcons({ attrs: { 'stroke-width': 2 } })
        } catch (e) {
          console.warn('Lucide icons initialization failed:', e)
        }
      }, 0)
    }
  } catch (error) {
    console.error('Error loading substation details:', error)
    detailContent.innerHTML = `
      <div class="station-loading">
        <div class="error-message">⚠️ Detaylar yüklenirken hata oluştu</div>
        <div class="text-muted-sm">${escapeHtml(error.message)}</div>
        <button onclick="closeStationDetail()" class="btn-close-modal">Kapat</button>
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
    return `<label class="checkbox-label-row">
      <input type="checkbox" value="${op.id}" ${checked} onchange="handleOperationChange()" class="m-0">
      <span class="flex-1">${escapeHtml(op.name)}</span>
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
      <div class="warning-message-box">
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
  
  container.innerHTML = '<div class="loading-text">Loading skills...</div>'
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
      <div class="modern-skills-interface">
        <div class="selected-skills-header">
          ${selected.size > 0 ? `Seçili ${selected.size} Skill` : 'Seçili Skill Yok'}
        </div>
        <div class="selected-skills-display">
          ${selected.size > 0 ? 
            Array.from(selected).map(skillId => {
              const isInherited = inheritedSet.has(skillId)
              const title = isInherited ? 'Operasyondan miras alınan yetenek' : 'İstasyon özel yetenek'
              const skillName = getSkillName(skillId) // Convert ID to name
              return `<span class="${isInherited ? 'skill-tag-inherited' : 'skill-tag-custom'}" title="${title}">${escapeHtml(skillName)}</span>`
            }).join('') : 
            '<span class="text-muted text-italic">Henüz skill seçilmedi</span>'
          }
        </div>
        <div class="skills-input-row">
          <input id="station-skill-new" type="text" placeholder="Yeni skill ekle..." class="skill-input-text">
          <button id="station-skill-add" class="btn-add-skill">+ Ekle</button>
        </div>
        <div class="skills-grid" id="station-skills-grid">
          ${skills.map(s => {
            const checked = selected.has(s.id) ? 'checked' : ''
            const isInherited = inheritedSet.has(s.id)
            const disabled = isInherited ? 'disabled' : ''
            const title = isInherited ? 'Bu yetenek operasyondan miras alınmıştır ve değiştirilemez' : ''
            return `<label class="${isInherited ? 'checkbox-label-disabled' : 'checkbox-label-row'}" title="${title}">
              <input type="checkbox" value="${escapeHtml(s.id)}" ${checked} ${disabled} onchange="updateStationSkillsDisplay()" class="m-0">
              <span class="flex-1">${escapeHtml(s.name)}</span>
              ${isInherited ? '<span class="item-subtitle">(miras)</span>' : ''}
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
    container.innerHTML = '<div class="error-text">Skills yüklenemedi</div>'
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
        return `<span class="skill-tag-custom">${escapeHtml(skillName)}</span>`
      }).join('') : 
      '<span class="text-muted text-italic">Henüz skill seçilmedi</span>'
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
      <div class="substation-item-row" data-substation-code="${subCode}" onclick="showSubStationDetail('${substationIdJs}')" title="Detayları görmek için tıklayın">
        <div class="substation-item-content">
          <span class="substation-code">${subCode}</span>
          <span class="substation-hint">Detayları görmek için tıkla</span>
        </div>
        <div class="substation-actions">
          <button type="button" data-role="status-toggle" class="btn-status-toggle" style="border: 1px solid ${border}; background: ${bg}; color: ${color};" onclick="event.stopPropagation(); toggleSubStationStatus('${stationIdJs}', '${subCodeJs}')">${escapeHtml(status)}</button>
          <button type="button" class="btn-delete-substation" onclick="event.stopPropagation(); deleteSubStation('${stationIdJs}', '${subCodeJs}')">Sil</button>
        </div>
      </div>
    `
  }).join('') : `
    <div class="empty-substation-message">
      Henüz sub istasyon eklenmemiş.
    </div>
  `

  return `
    <div class="substation-section-container">
      <div class="substation-section-header">
        <div class="substation-title-row">
          <h3 class="substation-title">İstasyonlar</h3>
          <span data-role="substation-total" data-station-id="${escapeHtml(station.id || '')}" class="text-muted-sm">(${total})</span>
        </div>
        <button type="button" data-role="button" onclick="handleSubStationAdd('${stationIdJs}')" class="btn-add-substation">İstasyon Ekle</button>
      </div>
      <div class="substation-list substation-list-grid">
        ${listHtml}
      </div>
      <div class="substation-add substation-add-section" data-station-id="${escapeHtml(station.id || '')}" data-mode="idle">
        <input type="number" min="1" value="1" data-role="input" oninput="handleSubStationAddInputChange('${stationIdJs}')" class="substation-add-input" style="display: none;" />
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
