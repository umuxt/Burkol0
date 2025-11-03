// Workers management backed by backend API (no direct Firebase client)
import { API_BASE, withAuth } from '../../shared/lib/api.js'
import { getMasterData } from './mesApi.js'
import { showToast } from './ui.js'

let workersState = []
let editingWorkerId = null
let selectedWorkerId = null
let workerFilters = { query: '', skills: [], statuses: [] }

export async function initializeWorkersUI() {
  initWorkerFilters()
  await loadWorkersAndRender()
}

// Worker detail functions
export function showWorkerDetail(id) {
  selectedWorkerId = id
  const worker = workersState.find(w => w.id === id)
  if (!worker) return
  
  const detailPanel = document.getElementById('worker-detail-panel')
  const detailContent = document.getElementById('worker-detail-content')
  
  if (!detailPanel || !detailContent) return
  
  // Show the detail panel
  detailPanel.style.display = 'block'
  
  // Hide the status column when details are open
  hideStatusColumn()
  
  // Highlight selected row
  const allRows = document.querySelectorAll('#workers-table-body tr')
  allRows.forEach(row => {
    row.style.backgroundColor = 'white'
  })
  const selectedRow = document.querySelector(`tr[data-worker-id="${id}"]`)
  if (selectedRow) {
    selectedRow.style.backgroundColor = 'rgb(239, 246, 255)'
  }
  
  // Populate detail content
  detailContent.innerHTML = generateWorkerDetailContent(worker)
}

export function closeWorkerDetail() {
  const detailPanel = document.getElementById('worker-detail-panel')
  if (detailPanel) {
    detailPanel.style.display = 'none'
  }
  
  // Show the status column when details are closed
  showStatusColumn()
  
  // Remove highlight from all rows
  const allRows = document.querySelectorAll('#workers-table-body tr')
  allRows.forEach(row => {
    row.style.backgroundColor = 'white'
  })
  
  selectedWorkerId = null
}

export function editWorkerFromDetail() {
  if (selectedWorkerId) {
    editWorker(selectedWorkerId)
  }
}

export function deleteWorkerFromDetail() {
  if (selectedWorkerId) {
    deleteWorker(selectedWorkerId)
  }
}

function generateWorkerDetailContent(worker) {
  const skills = Array.isArray(worker.skills) ? worker.skills : (typeof worker.skills === 'string' ? worker.skills.split(',').map(s=>s.trim()).filter(Boolean) : [])
  
  return `
    <form id="worker-detail-form" class="worker-details-layout">
      <!-- Temel Bilgiler -->
      <div style="margin-bottom: 16px; padding: 12px; background: white; border-radius: 6px; border: 1px solid rgb(229, 231, 235);">
        <h3 style="margin: 0px 0px 12px; font-size: 14px; font-weight: 600; color: rgb(17, 24, 39); border-bottom: 1px solid rgb(229, 231, 235); padding-bottom: 6px;">Temel Bilgiler</h3>
        <div class="detail-item" style="display: flex; align-items: center; margin-bottom: 8px;">
          <span class="detail-label" style="font-weight: 600; font-size: 12px; color: rgb(55, 65, 81); min-width: 120px; margin-right: 8px;">Çalışan Adı:</span>
          <span class="detail-value" style="font-size: 12px; color: rgb(17, 24, 39);">${escapeHtml(worker.name || '')}</span>
        </div>
        <div class="detail-item" style="display: flex; align-items: center; margin-bottom: 8px;">
          <span class="detail-label" style="font-weight: 600; font-size: 12px; color: rgb(55, 65, 81); min-width: 120px; margin-right: 8px;">E-posta:</span>
          ${worker.email
            ? `<a class="detail-value" href="${mailtoHref(worker.email)}" style="font-size: 12px; color: rgb(37, 99, 235); text-decoration: none;">${escapeHtml(worker.email)}</a>`
            : '<span class="detail-value" style="font-size: 12px; color: rgb(107, 114, 128);">-</span>'}
        </div>
        <div class="detail-item" style="display: flex; align-items: center; margin-bottom: 8px;">
          <span class="detail-label" style="font-weight: 600; font-size: 12px; color: rgb(55, 65, 81); min-width: 120px; margin-right: 8px;">Telefon:</span>
          ${worker.phone
            ? `<a class="detail-value" href="${telHref(worker.phone)}" style="font-size: 12px; color: rgb(37, 99, 235); text-decoration: none;">${escapeHtml(worker.phone)}</a>`
            : '<span class="detail-value" style="font-size: 12px; color: rgb(107, 114, 128);">-</span>'}
        </div>
        <div class="detail-item" style="display: flex; align-items: center; margin-bottom: 8px;">
          <span class="detail-label" style="font-weight: 600; font-size: 12px; color: rgb(55, 65, 81); min-width: 120px; margin-right: 8px;">Durum:</span>
          <span class="detail-value" style="font-size: 12px; color: rgb(17, 24, 39);">${escapeHtml(capitalize(worker.status || 'available'))}</span>
        </div>
      </div>

      <!-- Çalışma Bilgileri -->
      <div style="margin-bottom: 16px; padding: 12px; background: white; border-radius: 6px; border: 1px solid rgb(229, 231, 235);">
        <h3 style="margin: 0px 0px 12px; font-size: 14px; font-weight: 600; color: rgb(17, 24, 39); border-bottom: 1px solid rgb(229, 231, 235); padding-bottom: 6px;">Çalışma Bilgileri</h3>
        <div class="detail-item" style="display: flex; align-items: center; margin-bottom: 8px;">
          <span class="detail-label" style="font-weight: 600; font-size: 12px; color: rgb(55, 65, 81); min-width: 120px; margin-right: 8px;">Vardiya:</span>
          <span class="detail-value" style="font-size: 12px; color: rgb(17, 24, 39);">${escapeHtml(worker.shift || 'Day')}</span>
        </div>
        <div class="detail-item" style="display: flex; align-items: center; margin-bottom: 8px;">
          <span class="detail-label" style="font-weight: 600; font-size: 12px; color: rgb(55, 65, 81); min-width: 120px; margin-right: 8px;">İstasyon:</span>
          <span class="detail-value" style="font-size: 12px; color: rgb(17, 24, 39);">${escapeHtml(worker.station || 'Atanmamış')}</span>
        </div>
        <div class="detail-item" style="display: flex; align-items: center; margin-bottom: 8px;">
          <span class="detail-label" style="font-weight: 600; font-size: 12px; color: rgb(55, 65, 81); min-width: 120px; margin-right: 8px;">Mevcut Görev:</span>
          <span class="detail-value" style="font-size: 12px; color: rgb(17, 24, 39);">${escapeHtml(worker.currentTask || 'Görev atanmamış')}</span>
        </div>
      </div>

      <!-- Yetenekler -->
      <div style="margin-bottom: 16px; padding: 12px; background: white; border-radius: 6px; border: 1px solid rgb(229, 231, 235);">
        <h3 style="margin: 0px 0px 12px; font-size: 14px; font-weight: 600; color: rgb(17, 24, 39); border-bottom: 1px solid rgb(229, 231, 235); padding-bottom: 6px;">Sahip Olunan Yetenekler</h3>
        <div style="display: flex; flex-wrap: wrap; gap: 4px;">
          ${skills.map(skill => `
            <span style="background-color: rgb(243, 244, 246); color: rgb(107, 114, 128); padding: 2px 6px; border-radius: 4px; font-size: 11px; font-weight: 500;">${escapeHtml(skill)}</span>
          `).join('')}
          ${skills.length === 0 ? '<span style="font-size: 12px; color: rgb(107, 114, 128);">Henüz yetenek atanmamış</span>' : ''}
        </div>
      </div>

      <!-- Performans Bilgileri -->
      <div style="margin-bottom: 16px; padding: 12px; background: white; border-radius: 6px; border: 1px solid rgb(229, 231, 235);">
        <h3 style="margin: 0px 0px 12px; font-size: 14px; font-weight: 600; color: rgb(17, 24, 39); border-bottom: 1px solid rgb(229, 231, 235); padding-bottom: 6px;">Performans Özeti</h3>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
          <div class="detail-item" style="display: flex; align-items: center; margin-bottom: 8px;">
            <span class="detail-label" style="font-weight: 600; font-size: 12px; color: rgb(55, 65, 81); min-width: 120px; margin-right: 8px;">Tamamlanan Görev:</span>
            <span class="detail-value" style="font-size: 12px; color: rgb(17, 24, 39);">-</span>
          </div>
          <div class="detail-item" style="display: flex; align-items: center; margin-bottom: 8px;">
            <span class="detail-label" style="font-weight: 600; font-size: 12px; color: rgb(55, 65, 81); min-width: 120px; margin-right: 8px;">Ortalama Süre:</span>
            <span class="detail-value" style="font-size: 12px; color: rgb(17, 24, 39);">-</span>
          </div>
        </div>
        <div class="detail-item" style="display: flex; align-items: center; margin-bottom: 8px;">
          <span class="detail-label" style="font-weight: 600; font-size: 12px; color: rgb(55, 65, 81); min-width: 120px; margin-right: 8px;">Verimlilik Skoru:</span>
          <span class="detail-value" style="font-size: 12px; color: rgb(17, 24, 39);">-</span>
        </div>
      </div>
    </form>
  `
}

function hideStatusColumn() {
  // Hide status column header
  const statusHeader = document.querySelector('.workers-table th:nth-child(3)')
  if (statusHeader) {
    statusHeader.style.display = 'none'
  }
  
  // Hide status column in all rows
  const statusCells = document.querySelectorAll('#workers-table-body td:nth-child(3)')
  statusCells.forEach(cell => {
    cell.style.display = 'none'
  })
}

function showStatusColumn() {
  // Show status column header
  const statusHeader = document.querySelector('.workers-table th:nth-child(3)')
  if (statusHeader) {
    statusHeader.style.display = ''
  }
  
  // Show status column in all rows
  const statusCells = document.querySelectorAll('#workers-table-body td:nth-child(3)')
  statusCells.forEach(cell => {
    cell.style.display = ''
  })
}

async function loadWorkersAndRender() {
  const tbody = document.getElementById('workers-table-body')
  if (tbody) tbody.innerHTML = `<tr><td colspan="4"><em>Loading workers...</em></td></tr>`
  try {
    const res = await fetch(`${API_BASE}/api/mes/workers`, { headers: withAuth() })
    if (!res.ok) throw new Error(`Load failed: ${res.status}`)
    const data = await res.json()
    workersState = Array.isArray(data?.workers) ? data.workers : []
    renderWorkersTable()
  } catch (e) {
    console.error('Workers load error:', e)
    if (tbody) tbody.innerHTML = `<tr><td colspan="4"><span style="color:#ef4444">Workers yüklenemedi.</span></td></tr>`
    showToast('Workers yüklenemedi', 'error')
  }
}

function renderWorkersTable() {
  const tbody = document.getElementById('workers-table-body')
  if (!tbody) return

  const filtered = applyWorkersFilter(workersState)

  if (workersState.length === 0) {
    tbody.innerHTML = `<tr><td colspan=\"3\"><em>Hiç worker yok. Yeni ekleyin.</em></td></tr>`
    return
  }
  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan=\"3\"><em>Filtrelere uyan worker bulunamadı.</em></td></tr>`
    return
  }

  tbody.innerHTML = filtered.map(w => {
    const skills = Array.isArray(w.skills) ? w.skills : (typeof w.skills === 'string' ? w.skills.split(',').map(s=>s.trim()).filter(Boolean) : [])
    const status = (w.status || 'available').toLowerCase()
    const badgeClass = status === 'available' || status === 'active' ? 'success' : status === 'busy' ? 'warning' : 'default'
    
    return `
      <tr onclick="showWorkerDetail('${w.id}')" data-worker-id="${w.id}" style="cursor: pointer; background-color: white; border-bottom-width: 1px; border-bottom-style: solid; border-bottom-color: rgb(243, 244, 246);">
        <td style="padding: 4px 8px;"><strong>${escapeHtml(w.name || '')}</strong></td>
        <td style="padding: 4px 8px;">
          <div style="display: flex; flex-wrap: wrap; gap: 4px;">
            ${skills.map(skill => `<span style="background-color: rgb(243, 244, 246); color: rgb(107, 114, 128); padding: 2px 6px; border-radius: 4px; font-size: 11px; font-weight: 500;">${escapeHtml(skill)}</span>`).join('')}
          </div>
        </td>
        <td style="padding: 4px 8px;"><span class="badge badge-${badgeClass}">${escapeHtml(capitalize(status))}</span></td>
      </tr>`
  }).join('')
  
  // If details panel is open, hide status column
  const detailPanel = document.getElementById('worker-detail-panel')
  if (detailPanel && detailPanel.style.display === 'block') {
    hideStatusColumn()
    
    // Re-highlight selected row
    if (selectedWorkerId) {
      const selectedRow = document.querySelector(`tr[data-worker-id="${selectedWorkerId}"]`)
      if (selectedRow) {
        selectedRow.style.backgroundColor = 'rgb(239, 246, 255)'
      }
    }
  }
  
  // Update Clear All button visibility
  updateClearAllButton()
}

// Filtering logic
function normalizeSkills(skills) {
  return Array.isArray(skills)
    ? skills
    : (typeof skills === 'string' ? skills.split(',').map(s=>s.trim()).filter(Boolean) : [])
}

function applyWorkersFilter(list) {
  const q = String(workerFilters.query || '').toLowerCase()
  const selSkills = Array.isArray(workerFilters.skills) ? workerFilters.skills : []
  const statuses = Array.isArray(workerFilters.statuses) ? workerFilters.statuses : []

  return (list || []).filter(w => {
    // status
    const wStatus = String(w.status || 'available').toLowerCase()
    if (statuses.length > 0 && !statuses.includes(wStatus)) return false

    // skills: require all selected skills to be present
    const wSkills = normalizeSkills(w.skills)
    if (selSkills.length > 0) {
      const hasAll = selSkills.every(s => wSkills.includes(s))
      if (!hasAll) return false
    }

    // query: match name, email, phone, shift, status, skills
    if (q) {
      const hay = [w.name, w.email, w.phone, w.shift, wStatus, ...wSkills]
        .map(x => String(x || '').toLowerCase())
        .join(' ')
      if (!hay.includes(q)) return false
    }
    return true
  })
}

function initWorkerFilters() {
  // Search
  const search = document.getElementById('worker-filter-search')
  if (search) {
    search.value = workerFilters.query
    search.addEventListener('input', (e) => {
      workerFilters.query = e.target.value || ''
      updateClearAllButton()
      renderWorkersTable()
    })
  }

  // Skills dropdown
  setupSkillsFilter()
  // Status dropdown
  setupStatusFilter()

  // Clear All button
  const clearAllBtn = document.getElementById('worker-filter-clear-all')
  if (clearAllBtn) {
    clearAllBtn.addEventListener('click', () => {
      clearAllFilters()
    })
  }

  // Update Clear All button visibility
  updateClearAllButton()

  // Close panels on outside click
  document.addEventListener('click', (ev) => {
    const closeIfOutside = (panelId, wrapId) => {
      const panel = document.getElementById(panelId)
      const wrap = document.getElementById(wrapId)
      if (!panel || !wrap) return
      if (panel.style.display === 'none') return
      if (!wrap.contains(ev.target)) panel.style.display = 'none'
    }
    closeIfOutside('worker-filter-skills-panel', 'worker-filter-skills')
    closeIfOutside('worker-filter-status-panel', 'worker-filter-status')
  })
}

async function setupSkillsFilter() {
  const btn = document.getElementById('worker-filter-skills-btn')
  const panel = document.getElementById('worker-filter-skills-panel')
  const list = document.getElementById('worker-filter-skills-list')
  const search = document.getElementById('worker-filter-skills-search')
  const clearBtn = document.getElementById('worker-filter-skills-clear')
  const hideBtn = document.getElementById('worker-filter-skills-hide')
  const countEl = document.getElementById('worker-filter-skills-count')

  if (!btn || !panel || !list) return

  function updateCount() {
    if (!countEl) return
    countEl.textContent = workerFilters.skills.length ? `(${workerFilters.skills.length})` : ''
  }

  function renderSkillsList(filterText = '') {
    const normalized = String(filterText || '').toLowerCase()
    const items = (setupSkillsFilter._skills || []).filter(s => s.name.toLowerCase().includes(normalized))
    list.innerHTML = items.map(s => {
      const checked = workerFilters.skills.includes(s.name) ? 'checked' : ''
      return `
        <label style="display:flex; align-items:center; gap:8px; padding:1.5px 2px; border:1px solid var(--border); border-radius:6px; cursor:pointer; font-size:12px;">
          <input type="checkbox" value="${escapeHtml(s.name)}" ${checked} />
          <span style="font-size:12px;">${escapeHtml(s.name)}</span>
        </label>`
    }).join('')

    // attach events
    list.querySelectorAll('input[type="checkbox"]').forEach(cb => {
      cb.addEventListener('change', (e) => {
        const val = e.target.value
        if (e.target.checked) {
          if (!workerFilters.skills.includes(val)) workerFilters.skills.push(val)
        } else {
          workerFilters.skills = workerFilters.skills.filter(x => x !== val)
        }
        updateCount()
        renderWorkersTable()
      })
    })
  }

  // Load available skills from master data
  try {
    const md = await getMasterData()
    setupSkillsFilter._skills = Array.isArray(md?.skills) ? md.skills : []
  } catch {
    setupSkillsFilter._skills = []
  }

  updateCount()
  renderSkillsList()

  // Ensure default hidden
  if (!panel.style.display) panel.style.display = 'none'

  const toggle = (e) => {
    if (e) e.stopPropagation()
    const willOpen = panel.style.display === 'none'
    // Close the other panel before opening this one
    if (willOpen) {
      const other = document.getElementById('worker-filter-status-panel')
      if (other) other.style.display = 'none'
    }
    panel.style.display = willOpen ? 'block' : 'none'
  }
  btn.addEventListener('click', toggle)
  if (search) search.addEventListener('input', (e) => renderSkillsList(e.target.value))
  if (clearBtn) clearBtn.addEventListener('click', () => {
    workerFilters.skills = []
    updateCount()
    renderSkillsList()
    renderWorkersTable()
  })
  if (hideBtn) hideBtn.addEventListener('click', () => { panel.style.display = 'none' })
}

function setupStatusFilter() {
  const btn = document.getElementById('worker-filter-status-btn')
  const panel = document.getElementById('worker-filter-status-panel')
  const list = document.getElementById('worker-filter-status-list')
  const clearBtn = document.getElementById('worker-filter-status-clear')
  const hideBtn = document.getElementById('worker-filter-status-hide')
  const countEl = document.getElementById('worker-filter-status-count')

  if (!btn || !panel || !list) return

  const OPTIONS = [
    { value: 'available', label: 'Available' },
    { value: 'active', label: 'Active' },
    { value: 'busy', label: 'Busy' },
    { value: 'offline', label: 'Offline' }
  ]

  function updateCount() {
    if (!countEl) return
    countEl.textContent = workerFilters.statuses.length ? `(${workerFilters.statuses.length})` : ''
  }

  function renderStatusList() {
    list.innerHTML = OPTIONS.map(opt => {
      const checked = workerFilters.statuses.includes(opt.value) ? 'checked' : ''
      return `
        <label style=\"display:flex; align-items:center; gap:8px; padding:1.5px 2px; border:1px solid var(--border); border-radius:6px; cursor:pointer; font-size:12px;\">
          <input type=\"checkbox\" value=\"${opt.value}\" ${checked} />
          <span style=\"font-size:12px;\">${opt.label}</span>
        </label>`
    }).join('')

    list.querySelectorAll('input[type="checkbox"]').forEach(cb => {
      cb.addEventListener('change', (e) => {
        const val = e.target.value
        if (e.target.checked) {
          if (!workerFilters.statuses.includes(val)) workerFilters.statuses.push(val)
        } else {
          workerFilters.statuses = workerFilters.statuses.filter(x => x !== val)
        }
        updateCount()
        renderWorkersTable()
      })
    })
  }

  updateCount()
  renderStatusList()

  // Ensure default hidden
  if (!panel.style.display) panel.style.display = 'none'

  const toggle = (e) => {
    if (e) e.stopPropagation()
    const willOpen = panel.style.display === 'none'
    if (willOpen) {
      const other = document.getElementById('worker-filter-skills-panel')
      if (other) other.style.display = 'none'
    }
    panel.style.display = willOpen ? 'block' : 'none'
  }
  // Use click only to avoid double-toggling (pointerdown + click)
  btn.addEventListener('click', toggle)
  // Prevent outside click handler from closing when interacting inside
  panel.addEventListener('click', (e) => e.stopPropagation())
  panel.addEventListener('pointerdown', (e) => e.stopPropagation())
  if (clearBtn) clearBtn.addEventListener('click', () => {
    workerFilters.statuses = []
    updateCount()
    renderStatusList()
    renderWorkersTable()
  })
  if (hideBtn) hideBtn.addEventListener('click', () => { panel.style.display = 'none' })
}

export function openAddWorkerModal() {
  editingWorkerId = null
  openWorkerModal()
}

export function editWorker(id) {
  editingWorkerId = id
  const w = workersState.find(x => x.id === id)
  openWorkerModal(w)
}

export function closeWorkerModal(ev) {
  const overlay = document.getElementById('worker-modal')
  if (!overlay) return
  if (!ev || ev.target === overlay || ev === true) {
    overlay.style.display = 'none'
    
    // Clean up modern skills interface
    const skillsInterface = document.querySelector('.modern-skills-interface');
    if (skillsInterface) {
      skillsInterface.remove();
    }
    
    // Show original select
    const skillsSelect = document.getElementById('worker-skills');
    if (skillsSelect) {
      skillsSelect.style.display = 'block';
    }
    
    // Clean up global function
    if (window.removeSkill) {
      delete window.removeSkill;
    }
  }
}

export async function saveWorker() {
  const name = document.getElementById('worker-name')?.value?.trim()
  const email = document.getElementById('worker-email')?.value?.trim()
  const phone = document.getElementById('worker-phone')?.value?.trim()
  const shift = document.getElementById('worker-shift')?.value || 'Day'
  const status = document.getElementById('worker-status')?.value || 'available'

  if (!name) { showToast('İsim gerekli', 'warning'); return }
  if (!email) { showToast('Email gerekli', 'warning'); return }

    // Get skills from modern interface
  const skills = getSelectedSkills();
  
  if (skills.length === 0) { 
    showToast('En az bir skill giriniz', 'warning'); 
    return;
  }

  const payload = { id: editingWorkerId || genId(), name, email, phone, skills, shift, status }
  const idx = workersState.findIndex(w => w.id === payload.id)
  if (idx >= 0) workersState[idx] = { ...workersState[idx], ...payload }
  else workersState.push(payload)

  try {
    await persistWorkers()
    closeWorkerModal(true)
    renderWorkersTable()
    // If a detail panel is open for this worker, refresh it
    try {
      if (selectedWorkerId && selectedWorkerId === payload.id) {
        showWorkerDetail(payload.id)
      }
    } catch {}
    showToast('Worker kaydedildi', 'success')
  } catch (e) {
    console.error('Worker save error:', e)
    showToast('Worker kaydedilemedi', 'error')
  }
}

export async function deleteWorker(id) {
  if (!confirm('Bu worker silinsin mi?')) return
  workersState = workersState.filter(w => w.id !== id)
  try {
    await persistWorkers()
    closeWorkerModal(true)
    renderWorkersTable()
    showToast('Worker silindi', 'success')
  } catch (e) {
    console.error('Worker delete error:', e)
    showToast('Worker silinemedi', 'error')
  }
}

async function persistWorkers() {
  const safeWorkers = workersState.map(sanitizeWorker)
  const res = await fetch(`${API_BASE}/api/mes/workers`, {
    method: 'POST',
    headers: withAuth({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ workers: safeWorkers })
  })
  if (!res.ok) {
    const msg = await res.text().catch(()=>'')
    throw new Error(`Persist failed: ${res.status} ${msg}`)
  }
}

function sanitizeWorker(w) {
  return {
    id: w.id || genId(),
    name: (w.name || '').trim(),
    email: (w.email || '').trim(),
    phone: (w.phone || '').trim(),
    skills: Array.isArray(w.skills) ? w.skills : (typeof w.skills === 'string' ? w.skills.split(',').map(s=>s.trim()).filter(Boolean) : []),
    shift: w.shift || 'Day',
    status: (w.status || 'available').toLowerCase(),
    station: w.station || '',
    currentTask: w.currentTask || ''
  }
}

function openWorkerModal(worker = null) {
  const overlay = document.getElementById('worker-modal')
  const title = document.getElementById('worker-modal-title')
  const nameI = document.getElementById('worker-name')
  const emailI = document.getElementById('worker-email')
  const phoneI = document.getElementById('worker-phone')
  const shiftI = document.getElementById('worker-shift')
  const statusI = document.getElementById('worker-status')
  const deleteBtn = document.getElementById('worker-delete-btn')

  if (!overlay) return
  title.textContent = worker ? 'Edit Worker' : 'Add New Worker'
  nameI.value = worker?.name || ''
  emailI.value = worker?.email || ''
  if (phoneI) phoneI.value = worker?.phone || ''
  shiftI.value = worker?.shift || 'Day'
  statusI.value = (worker?.status || 'available').toLowerCase()

  overlay.style.display = 'block'
  
  // Configure delete button visibility and action
  if (deleteBtn) {
    if (worker && worker.id) {
      deleteBtn.style.display = 'inline-block'
      deleteBtn.onclick = () => deleteWorker(worker.id)
    } else {
      deleteBtn.style.display = 'none'
      deleteBtn.onclick = null
    }
  }
  
  // Initialize skills interface
  initializeSkillsInterface(worker?.skills || [])
}

// Modern Skills Interface - Clean Implementation
async function initializeSkillsInterface(selectedSkills = []) {
  const skillsContainer = document.getElementById('worker-skills').parentNode;
  const originalSelect = document.getElementById('worker-skills');
  
  // Clear any existing custom interface
  const existingInterface = skillsContainer.querySelector('.modern-skills-interface');
  if (existingInterface) {
    existingInterface.remove();
  }
  
  // Hide original select
  originalSelect.style.display = 'none';
  
  try {
    const masterData = await getMasterData();
    if (!masterData?.skills) {
      showToast('Skills verisi yüklenemedi', 'error');
      return;
    }
    
    // Create modern interface
    const skillsInterface = createModernSkillsInterface(masterData.skills, selectedSkills);
    skillsContainer.appendChild(skillsInterface);
    
    console.log('✅ Modern skills interface created');
  } catch (error) {
    console.error('❌ Skills interface error:', error);
    showToast('Skills arayüzü oluşturulamadı', 'error');
  }
}

function createModernSkillsInterface(allSkills, selectedSkills) {
  // Main container
  const container = document.createElement('div');
  container.className = 'modern-skills-interface';
  container.style.cssText = `
    background: white;
    border: 1px solid var(--border);
    border-radius: 6px;
    overflow: hidden;
  `;
  
  // Selected skills header
  const selectedHeader = document.createElement('div');
  selectedHeader.className = 'selected-skills-header';
  selectedHeader.style.cssText = `
    padding: 8px 12px;
    background: #f8f9fa;
    border-bottom: 1px solid var(--border);
    font-weight: 500;
    font-size: 13px;
    color: var(--foreground);
  `;
  
  const selectedDisplay = document.createElement('div');
  selectedDisplay.className = 'selected-skills-display';
  selectedDisplay.style.cssText = `
    padding: 8px 12px;
    background: white;
    border-bottom: 1px solid var(--border);
    min-height: 20px;
    font-size: 12px;
  `;
  
  // Search input
  const searchInput = document.createElement('input');
  searchInput.type = 'text';
  searchInput.placeholder = 'Skill arayın...';
  searchInput.className = 'skills-search';
  searchInput.style.cssText = `
    width: 100%;
    padding: 8px 12px;
    border: none;
    border-bottom: 1px solid var(--border);
    outline: none;
    font-size: 14px;
    box-sizing: border-box;
  `;
  
  // Skills grid
  const skillsGrid = document.createElement('div');
  skillsGrid.className = 'skills-grid';
  skillsGrid.style.cssText = `
    max-height: 200px;
    overflow-y: auto;
    padding: 8px;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 6px;
  `;
  
  // State management
  let currentSelected = [...selectedSkills];
  
  function updateSelectedDisplay() {
    selectedHeader.textContent = currentSelected.length === 0 
      ? 'Seçili Skill Yok' 
      : `${currentSelected.length} Skill Seçildi`;
      
    if (currentSelected.length === 0) {
      selectedDisplay.innerHTML = '<span style="color: var(--muted-foreground); font-style: italic;">Henüz skill seçilmedi</span>';
    } else {
      selectedDisplay.innerHTML = currentSelected.map(skill => `
        <span style="
          display: inline-block;
          background: var(--primary);
          color: var(--primary-foreground);
          padding: 2px 6px;
          border-radius: 4px;
          font-size: 11px;
          font-weight: 500;
          margin: 2px 4px 2px 0;
          cursor: pointer;
        " onclick="removeSkill('${skill}')" title="Kaldırmak için tıklayın">
          ${escapeHtml(skill)} ×
        </span>
      `).join('');
    }
    
    // Update original select for form submission
    updateOriginalSelect();
  }
  
  function updateOriginalSelect() {
    const originalSelect = document.getElementById('worker-skills');
    originalSelect.innerHTML = allSkills.map(skill => 
      `<option value="${escapeHtml(skill.name)}" ${currentSelected.includes(skill.name) ? 'selected' : ''}>
        ${escapeHtml(skill.name)}
      </option>`
    ).join('');
  }
  
  function createSkillCard(skill) {
    const isSelected = currentSelected.includes(skill.name);
    
    const card = document.createElement('div');
    card.className = 'skill-card';
    card.style.cssText = `
      padding: 4px 6px;
      border: 1px solid ${isSelected ? 'var(--primary)' : 'var(--border)'};
      border-radius: 4px;
      cursor: pointer;
      transition: all 0.2s ease;
      background: ${isSelected ? 'var(--primary)' : 'white'};
      color: ${isSelected ? 'var(--primary-foreground)' : 'var(--foreground)'};
      font-weight: ${isSelected ? '500' : '400'};
      font-size: 12px;
      user-select: none;
      text-align: center;
    `;
    
    card.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: space-between;">
        <span>${escapeHtml(skill.name)}</span>
        ${isSelected ? '<span style="font-weight: bold; margin-left: 4px;">✓</span>' : ''}
      </div>
    `;
    
    card.addEventListener('mouseenter', () => {
      if (!isSelected) {
        card.style.borderColor = 'var(--primary)';
        card.style.background = '#f8f9fa';
      }
    });
    
    card.addEventListener('mouseleave', () => {
      if (!isSelected) {
        card.style.borderColor = 'var(--border)';
        card.style.background = 'white';
      }
    });
    
    card.addEventListener('click', () => {
      toggleSkill(skill.name);
    });
    
    return card;
  }
  
  function toggleSkill(skillName) {
    if (currentSelected.includes(skillName)) {
      currentSelected = currentSelected.filter(s => s !== skillName);
    } else {
      currentSelected.push(skillName);
    }
    renderSkills();
    updateSelectedDisplay();
  }
  
  function renderSkills(filter = '') {
    // Only show NOT selected skills in the list below
    const normalized = String(filter || '').toLowerCase();
    const filteredSkills = allSkills
      .filter(skill => !currentSelected.includes(skill.name))
      .filter(skill => skill.name.toLowerCase().includes(normalized));

    // Sort alphabetically for easier scan
    filteredSkills.sort((a, b) => a.name.localeCompare(b.name, 'tr'));

    skillsGrid.innerHTML = '';
    filteredSkills.forEach(skill => {
      skillsGrid.appendChild(createSkillCard(skill));
    });
  }
  
  // Search functionality
  searchInput.addEventListener('input', (e) => {
    renderSkills(e.target.value);
  });
  
  // Global function for removing skills
  window.removeSkill = (skillName) => {
    currentSelected = currentSelected.filter(s => s !== skillName);
    renderSkills();
    updateSelectedDisplay();
  };
  
  // Build interface
  container.appendChild(selectedHeader);
  container.appendChild(selectedDisplay);
  container.appendChild(searchInput);
  container.appendChild(skillsGrid);
  
  // Initial render
  renderSkills();
  updateSelectedDisplay();
  
  return container;
}

// Get selected skills for form submission
function getSelectedSkills() {
  const originalSelect = document.getElementById('worker-skills');
  return Array.from(originalSelect.selectedOptions).map(option => option.value);
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function mailtoHref(email) {
  const e = String(email || '').trim()
  if (!e) return '#'
  return `mailto:${e}`
}

function telHref(phone) {
  const p = String(phone || '').trim()
  if (!p) return '#'
  // Keep digits and leading + only
  const normalized = p.replace(/[^0-9+]/g, '')
  return `tel:${normalized}`
}

function capitalize(s) { s = String(s||''); return s.charAt(0).toUpperCase() + s.slice(1) }
function genId() { return 'w-' + Math.random().toString(36).slice(2, 9) }

// Clear All Filters functionality
function clearAllFilters() {
  // Clear search
  workerFilters.query = ''
  const searchInput = document.getElementById('worker-filter-search')
  if (searchInput) {
    searchInput.value = ''
  }

  // Clear skills filter
  workerFilters.skills = []
  const skillsCheckboxes = document.querySelectorAll('#worker-filter-skills-list input[type="checkbox"]')
  skillsCheckboxes.forEach(checkbox => {
    checkbox.checked = false
  })

  // Clear status filter
  workerFilters.statuses = []
  const statusCheckboxes = document.querySelectorAll('#worker-filter-status-list input[type="checkbox"]')
  statusCheckboxes.forEach(checkbox => {
    checkbox.checked = false
  })

  // Update UI
  updateFilterCounts()
  updateClearAllButton()
  renderWorkersTable()
}

function updateClearAllButton() {
  const clearAllBtn = document.getElementById('worker-filter-clear-all')
  if (!clearAllBtn) return

  // Show button if any filter is active
  const hasActiveFilters = workerFilters.query.trim() !== '' || 
                          workerFilters.skills.length > 0 || 
                          workerFilters.statuses.length > 0

  clearAllBtn.style.display = hasActiveFilters ? 'block' : 'none'
}

function updateFilterCounts() {
  // Update skills count
  const skillsCount = document.getElementById('worker-filter-skills-count')
  if (skillsCount) {
    skillsCount.textContent = workerFilters.skills.length > 0 ? `(${workerFilters.skills.length})` : ''
  }

  // Update status count
  const statusCount = document.getElementById('worker-filter-status-count')
  if (statusCount) {
    statusCount.textContent = workerFilters.statuses.length > 0 ? `(${workerFilters.statuses.length})` : ''
  }
}

// No default export; named exports only
