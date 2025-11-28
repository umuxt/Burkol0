// Workers management backed by backend API with PostgreSQL
import { API_BASE, withAuth } from '../../../shared/lib/api.js'
import { getMasterData, getWorkerStations, getWorkerAssignments, getSkillsFromSQL } from './mesApi.js'
import { showSuccessToast, showErrorToast, showWarningToast, showInfoToast } from '../../../shared/components/MESToast.js';
import { generateWeeklyTimeline } from './views.js'

let workersState = []
let editingWorkerId = null
let selectedWorkerId = null
let workerFilters = { query: '', skills: [], statuses: [], hasConflict: false }

// Skills cache for ID to name mapping
let skillsCache = []

// Helper to get skill name from ID
function getSkillName(skillId) {
  const skill = skillsCache.find(s => s.id === skillId)
  return skill ? skill.name : skillId
}

export async function initializeWorkersUI() {
  initWorkerFilters()
  await loadWorkersAndRender()
  
  // Listen for master data changes to auto-update company settings users
  window.addEventListener('master-data:changed', handleMasterDataChanged)
  
  // Listen for assignment updates to refresh worker detail panels
  window.addEventListener('assignments:updated', handleAssignmentsUpdated)
}

// Auto-update workers using company settings when company time settings change
function handleMasterDataChanged(event) {
  if (!event.detail || event.detail.source === 'production') return // avoid self-loops
  
  // Refresh worker detail if open (to show updated company schedule)
  if (selectedWorkerId) {
    showWorkerDetail(selectedWorkerId).catch(() => {})
  }
}

// Worker detail functions
export async function showWorkerDetail(id) {
  selectedWorkerId = id
  const worker = workersState.find(w => w.id === id)
  if (!worker) return
  
  // Force refresh master data cache to get latest time settings
  try {
    const { getMasterData } = await import('./mesApi.js')
    await getMasterData(true)
  } catch (e) {
    console.warn('Failed to refresh master data cache:', e)
  }
  
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
  
  // Show loading state first
  detailContent.innerHTML = `
    <div style="padding: 20px; text-align: center;">
      <div style="font-size: 14px; color: rgb(107, 114, 128);">Yükleniyor...</div>
    </div>
  `
  
  try {
    // Load worker stations (this endpoint exists)
    const workerStationsData = await getWorkerStations(id)
    
    // Try to load assignments, but don't fail if endpoint doesn't exist
    let assignments = []
    
    try {
      assignments = await getWorkerAssignments(id)
    } catch (err) {
      console.warn('Worker assignments endpoint not available:', err.message)
    }
    
    // Populate detail content
    detailContent.innerHTML = generateWorkerDetailContentWithStations(worker, workerStationsData, assignments)
    
    // Update schedule status (Mesai Durumu) after content is rendered
    updateWorkerScheduleStatus(worker)
  } catch (error) {
    console.error('Error loading worker data:', error)
    
    // Fallback to original view if loading fails
    detailContent.innerHTML = generateWorkerDetailContent(worker)
  }
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

// Worker schedule modal handlers
export function openWorkerScheduleModal() {
  const modal = document.getElementById('worker-schedule-modal')
  if (!modal) return
  // Ensure a clean timeline (avoid previous worker's personal blocks sticking around)
  try {
    const blockContainers = modal.querySelectorAll('[id^="blocks-worker-"]')
    blockContainers.forEach(cnt => {
      // Remove only created blocks, keep grid/lines intact
      const blocks = cnt.querySelectorAll('[data-block-info]')
      blocks.forEach(el => el.remove())
    })
  } catch {}
  // Determine current worker state
  const worker = workersState.find(w => w.id === selectedWorkerId) || {}
  const savedMode = (worker.personalSchedule && worker.personalSchedule.mode) ? worker.personalSchedule.mode : 'company'
  // Preselect radio
  const radioCompany = modal.querySelector('input[name="worker-schedule-mode"][value="company"]')
  const radioPersonal = modal.querySelector('input[name="worker-schedule-mode"][value="personal"]')
  if (savedMode === 'personal' && radioPersonal) radioPersonal.checked = true
  else if (radioCompany) radioCompany.checked = true

  // Populate shift-no options from master-data lane count
  const select = document.getElementById('worker-schedule-shift-no')
  const loadShiftOptions = async () => {
    try {
      const md = await getMasterData().catch(() => null)
      const ts = md && md.timeSettings ? md.timeSettings : null
      const laneCount = Math.max(1, Math.min(7, Number(ts?.laneCount || 1)))
      if (!select) return
      let opts = ''
      for (let i = 1; i <= laneCount; i++) opts += `<option value="${i}">${i}</option>`
      select.innerHTML = opts
      if (ts && ts.workType !== 'shift') {
        select.disabled = true
        select.title = 'Genel ayarlar sabit modda; vardiya seçimi devre dışı'
      } else {
        select.disabled = false
        select.title = ''
      }
      const savedShift = (worker.personalSchedule && worker.personalSchedule.shiftNo) ? parseInt(worker.personalSchedule.shiftNo, 10) : null
      const selectedVal = (savedShift && savedShift >= 1 && savedShift <= laneCount) ? String(savedShift) : '1'
      select.value = selectedVal
    } catch {}
  }
  loadShiftOptions()

  handleWorkerScheduleModeChange(savedMode)

  // Prefill personal schedule blocks if this worker already uses personal mode
  try {
    if (savedMode === 'personal' && worker.personalSchedule && worker.personalSchedule.blocks) {
      const blocksByDay = worker.personalSchedule.blocks
      const days = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday']
      const toHour = (t) => {
        if (!t || typeof t !== 'string') return 0
        const parts = t.split(':')
        const h = parseInt(parts[0] || '0', 10) || 0
        const m = parseInt(parts[1] || '0', 10) || 0
        return h + (m/60)
      }
      days.forEach(d => {
        const list = Array.isArray(blocksByDay[d]) ? blocksByDay[d] : []
        list.forEach(b => {
          const type = b.type || 'work'
          const startHour = typeof b.startHour === 'number' ? b.startHour : toHour(b.startTime)
          const endHour = typeof b.endHour === 'number' ? b.endHour : toHour(b.endTime)
          const startTime = b.startTime || (Number.isFinite(startHour) ? `${String(Math.floor(startHour)).padStart(2,'0')}:${String(Math.round((startHour-Math.floor(startHour))*60)).padStart(2,'0')}` : '00:00')
          const endTime = b.endTime || (Number.isFinite(endHour) ? `${String(Math.floor(endHour)).padStart(2,'0')}:${String(Math.round((endHour-Math.floor(endHour))*60)).padStart(2,'0')}` : '00:00')
          const laneIdx = Number.isFinite(b.laneIndex) ? b.laneIndex : 0
          try { createScheduleBlock(`worker-${d}`, type, startHour, endHour, startTime, endTime, laneIdx) } catch {}
        })
      })
    }
  } catch {}
  // Show modal
  modal.style.display = 'flex'
  // Initialize timeline if personal area is visible later
  setTimeout(() => {
    if (typeof initializeTimeline === 'function') {
      try { initializeTimeline() } catch {}
    }
    // Prefill again after timeline init to ensure blocks render if earlier call happened before any wiring
    try {
      if (savedMode === 'personal' && worker.personalSchedule && worker.personalSchedule.blocks) {
        const blocksByDay = worker.personalSchedule.blocks
        const days = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday']
        const toHour = (t) => {
          if (!t || typeof t !== 'string') return 0
          const parts = t.split(':')
          const h = parseInt(parts[0] || '0', 10) || 0
          const m = parseInt(parts[1] || '0', 10) || 0
          return h + (m/60)
        }
        days.forEach(d => {
          const list = Array.isArray(blocksByDay[d]) ? blocksByDay[d] : []
          list.forEach(b => {
            const type = b.type || 'work'
            const startHour = typeof b.startHour === 'number' ? b.startHour : toHour(b.startTime)
            const endHour = typeof b.endHour === 'number' ? b.endHour : toHour(b.endTime)
            const startTime = b.startTime || (Number.isFinite(startHour) ? `${String(Math.floor(startHour)).padStart(2,'0')}:${String(Math.round((startHour-Math.floor(startHour))*60)).padStart(2,'0')}` : '00:00')
            const endTime = b.endTime || (Number.isFinite(endHour) ? `${String(Math.floor(endHour)).padStart(2,'0')}:${String(Math.round((endHour-Math.floor(endHour))*60)).padStart(2,'0')}` : '00:00')
            const laneIdx = Number.isFinite(b.laneIndex) ? b.laneIndex : 0
            try { createScheduleBlock(`worker-${d}`, type, startHour, endHour, startTime, endTime, laneIdx) } catch {}
          })
        })
      }
    } catch {}
  }, 0)
}

export function closeWorkerScheduleModal(ev) {
  // Support clicking overlay or close button
  const modal = document.getElementById('worker-schedule-modal')
  if (!modal) return
  modal.style.display = 'none'
}

export function handleWorkerScheduleModeChange(mode) {
  const company = document.getElementById('worker-schedule-company')
  const personal = document.getElementById('worker-schedule-personal')
  if (!company || !personal) return
  if (mode === 'personal') {
    company.style.display = 'none'
    personal.style.display = 'block'
    // Ensure personal timeline starts empty when switching
    try {
      const modal = document.getElementById('worker-schedule-modal')
      const blockContainers = modal ? modal.querySelectorAll('[id^="blocks-worker-"]') : []
      blockContainers.forEach(cnt => {
        const blocks = cnt.querySelectorAll('[data-block-info]')
        blocks.forEach(el => el.remove())
      })
    } catch {}
    // Ensure timeline is wired
    if (typeof initializeTimeline === 'function') {
      setTimeout(() => { try { initializeTimeline() } catch {} }, 0)
    }
  } else {
    company.style.display = 'block'
    personal.style.display = 'none'
  }
}

export function saveWorkerSchedule() {
  if (!selectedWorkerId) { closeWorkerScheduleModal(); return }
  const modal = document.getElementById('worker-schedule-modal')
  if (!modal) return
  const selectedMode = modal.querySelector('input[name="worker-schedule-mode"]:checked')?.value || 'company' // default to company mode
  const shiftNo = (document.getElementById('worker-schedule-shift-no')?.value) || null

  // Validate when company settings are shift-based
  const company = safeLoadCompanyTimeSettings()
  if (selectedMode === 'company' && company && company.workType === 'shift') {
    if (!shiftNo) { showWarningToast('Vardiyalı modda vardiya no seçiniz'); return }
  }

  const schedule = { mode: selectedMode }
  if (selectedMode === 'company') {
    if (shiftNo) schedule.shiftNo = shiftNo
    // AUTO-POPULATE: Resolve and attach day-by-day blocks from company master data
    const ts = safeLoadCompanyTimeSettings()
    if (ts) {
      const days = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday']
      const blocksByDay = {}
      days.forEach(d => {
        const list = getShiftBlocksForDay(ts, d, shiftNo)
        blocksByDay[d] = Array.isArray(list) ? list : []
      })
      // Important: Auto-populate blocks so schedule is determined by company settings
      schedule.blocks = blocksByDay
    } else {
      // No company settings available, clear blocks
      schedule.blocks = {}
    }
  } else {
    // Collect blocks from worker-prefixed timeline columns
    const cols = modal.querySelectorAll('.day-timeline-vertical')
    const blocksByDay = {}
    const standardDays = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday']
    
    cols.forEach(col => {
      const dayId = col.dataset.day
      let blocks = Array.from(col.querySelectorAll('[data-block-info]')).map(el => {
        try { return JSON.parse(el.dataset.blockInfo) } catch { return null }
      }).filter(Boolean)
      
      // Remove duplicates within same day based on startHour, endHour, type
      const uniqueBlocks = []
      blocks.forEach(block => {
        const isDuplicate = uniqueBlocks.some(existing => 
          Math.abs(existing.startHour - block.startHour) < 0.01 &&
          Math.abs(existing.endHour - block.endHour) < 0.01 &&
          existing.type === block.type
        )
        if (!isDuplicate) {
          uniqueBlocks.push(block)
        }
      })
      
      // Convert worker-prefixed keys to standard day names for clean storage
      if (dayId && dayId.startsWith('worker-')) {
        const standardDay = dayId.replace('worker-', '')
        if (standardDays.includes(standardDay)) {
          blocksByDay[standardDay] = uniqueBlocks
        }
      } else {
        blocksByDay[dayId] = uniqueBlocks
      }
    })
    
    // Ensure all standard days exist (empty arrays for unused days)
    standardDays.forEach(day => {
      if (!blocksByDay[day]) {
        blocksByDay[day] = []
      }
    })
    
    schedule.blocks = blocksByDay
  }
  // Store on worker object in memory and persist
  const idx = workersState.findIndex(w => w.id === selectedWorkerId)
  if (idx >= 0) {
    workersState[idx].personalSchedule = schedule
  }
  (async () => {
    try {
      await persistWorkers()
      showSuccessToast('Çalışma saatleri kaydedildi')
      
      // Refresh details if open to show updated schedule
      if (selectedWorkerId) {
        await showWorkerDetail(selectedWorkerId)
      }
      
      // Re-render the schedule grid immediately if the modal has it
      const modal = document.getElementById('worker-schedule-modal')
      if (modal && modal.style.display !== 'none') {
        // Re-populate the grid with fresh data
        const worker = workersState.find(w => w.id === selectedWorkerId)
        if (worker && worker.personalSchedule && worker.personalSchedule.blocks) {
          const blocksByDay = worker.personalSchedule.blocks
          const days = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday']
          
          days.forEach((d, idx) => {
            const dayKey = `worker-${d}`
            const col = modal.querySelector(`.day-timeline-vertical[data-day="${dayKey}"]`)
            if (!col) return
            
            // Clear existing blocks
            col.querySelectorAll('[data-block-info]').forEach(el => el.remove())
            
            // Re-render blocks
            const blocks = blocksByDay[d] || []
            blocks.forEach((b, laneIdx) => {
              try { 
                createScheduleBlock(dayKey, b.type, b.startHour, b.endHour, b.start, b.end, laneIdx) 
              } catch {}
            })
          })
        }
      }
    } catch (e) {
      console.error('saveWorkerSchedule persist error', e)
      showErrorToast('Çalışma saatleri kaydedilemedi')
    } finally {
      closeWorkerScheduleModal()
    }
  })()
}

// Normalize schedule blocks to remove worker- prefixes and old duplicates
function normalizeScheduleBlocks(blocks) {
  if (!blocks || typeof blocks !== 'object') return {}
  
  const standardDays = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday']
  const normalized = {}
  
  // Initialize all days as empty arrays
  standardDays.forEach(day => {
    normalized[day] = []
  })
  
  // Process each key in blocks
  Object.keys(blocks).forEach(key => {
    let targetDay = key
    
    // Convert worker-prefixed keys to standard day names
    if (key.startsWith('worker-')) {
      targetDay = key.replace('worker-', '')
    }
    
    // Only accept standard day names
    if (standardDays.includes(targetDay) && Array.isArray(blocks[key])) {
      // If we already have blocks for this day, merge them (prefer worker- prefixed version)
      if (key.startsWith('worker-') || normalized[targetDay].length === 0) {
        normalized[targetDay] = blocks[key]
      }
    }
  })
  
  return normalized
}

// --- Helpers: generate schedule summary section in details ---
function normalizeDayKey(key) {
  if (!key) return ''
  // strip known prefixes
  return String(key)
    .replace(/^worker-/, '')
    .replace(/^fixed-/, '')
    .replace(/^shift-/, '')
}

function dayLabel(trKey) {
  const map = { monday: 'Pzt', tuesday: 'Sal', wednesday: 'Çar', thursday: 'Per', friday: 'Cum', saturday: 'Cmt', sunday: 'Paz' }
  return map[trKey] || trKey
}

function generateWorkerScheduleSummary(worker) {
  // This function is deprecated - schedule info now shown in new worker detail UI
  return ''
}

function safeLoadCompanyTimeSettings() {
  try {
    // Prefer cached master-data from sessionStorage (written by mesApi)
    try {
      const cached = sessionStorage.getItem('mes_master_data_cache')
      if (cached) {
        const md = JSON.parse(cached)
        if (md && md.timeSettings) {
          console.log('✅ Loaded timeSettings from sessionStorage cache');
          return md.timeSettings;
        }
      }
    } catch {}
    // Fallback to local persisted companyTimeSettings
    const raw = localStorage.getItem('companyTimeSettings')
    if (raw) {
      const data = JSON.parse(raw)
      if (data && typeof data === 'object') {
        console.log('✅ Loaded timeSettings from localStorage');
        return data;
      }
    }
    console.warn('⚠️ No timeSettings found in cache or localStorage');
    return null
  } catch { 
    console.error('❌ Error loading company time settings');
    return null 
  }
}

// Backward-compat name retained; used as core builder
function renderCompanyScheduleGrid(company, shiftNo) {
  const days = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday']
  const chipsStyle = {
    work: 'background: rgba(34,197,94,.15); color:#065f46; border:1px solid #22c55e;',
    break: 'background: rgba(251,191,36,.15); color:#92400e; border:1px solid #fbbf24;',
    rest: 'background: rgba(156,163,175,.2); color:#1f2937; border:1px solid #9ca3af;'
  }
  let buf = ''
  
  // Build blocks per day and render compact static weekly timeline
  const blocksByDay = {}
  for (const d of days) {
    // ALWAYS use getShiftBlocksForDay - it handles all formats (fixed, shift, shiftByLane, etc.)
    const list = getShiftBlocksForDay(company, d, shiftNo) || []
    blocksByDay[d] = list
  }
  
  buf += renderStaticWeeklyTimeline(blocksByDay)
  return buf
}

function getShiftBlocksForDay(ts, day, shiftNo) {
  // 0) Standard shifts array model: shifts: [{ id: '1', blocks: { monday: [...] } }]
  if (Array.isArray(ts?.shifts)) {
    const shift = ts.shifts.find(s => s.id === String(shiftNo || '1'));
    if (shift && shift.blocks && Array.isArray(shift.blocks[day])) {
      return shift.blocks[day];
    }
  }
  
  // 0.5) FIXED SCHEDULE: workType='fixed' should use shiftByLane (not fixedBlocks)
  // This handles the case where workType is 'fixed' but data is stored in shiftByLane
  if (ts?.workType === 'fixed' && ts?.shiftByLane) {
    const lane = shiftNo || '1';
    const blocks = ts.shiftByLane[String(lane)]?.[day];
    if (Array.isArray(blocks) && blocks.length > 0) {
      console.log(`📌 Using shiftByLane for fixed schedule (${day}, lane ${lane}):`, blocks);
      return blocks;
    }
  }
  
  // 0.6) FIXED SCHEDULE FALLBACK: If workType is 'fixed', use fixedBlocks
  if (ts?.workType === 'fixed' && ts?.fixedBlocks) {
    const blocks = ts.fixedBlocks[day];
    if (Array.isArray(blocks) && blocks.length > 0) {
      console.log(`📌 Using fixed schedule blocks for ${day}:`, blocks);
      return blocks;
    }
  }
  
  // 1) Aggregated model with laneIndex under `shift-${day}`
  const agg = ts?.shiftBlocks?.[`shift-${day}`]
  if (Array.isArray(agg)) {
    if (!shiftNo) return agg
    const idx = (parseInt(shiftNo, 10) || 1) - 1
    return agg.filter(b => (b && typeof b.laneIndex === 'number') ? b.laneIndex === idx : false)
  }
  // 2) Split‑by‑lane model: shiftByLane: { '1': { day: [...] }, '2': { day: [...] } }
  const byLane = ts?.shiftByLane
  if (byLane && typeof byLane === 'object') {
    if (shiftNo) {
      return Array.isArray(byLane[String(parseInt(shiftNo, 10) || 1)]?.[day])
        ? byLane[String(parseInt(shiftNo, 10) || 1)][day]
        : []
    }
    // No specific shift requested: combine all lanes for display
    let combined = []
    Object.keys(byLane).forEach(k => { if (Array.isArray(byLane[k]?.[day])) combined = combined.concat(byLane[k][day]) })
    return combined
  }
  // 3) Named keys like `${day}-1`, `${day}_1`, `shift-1-${day}`, `shift-${day}-1`
  const keys = Object.keys(ts || {})
  if (keys.length) {
    const collect = (n) => {
      const patterns = [
        new RegExp(`^${day}[-_]${n}$`, 'i'),
        new RegExp(`^shift[-_]${day}[-_]${n}$`, 'i'),
        new RegExp(`^shift[-_]${n}[-_]${day}$`, 'i')
      ]
      const matchKey = keys.find(k => patterns.some(p => p.test(k)))
      const arr = matchKey && Array.isArray(ts[matchKey]) ? ts[matchKey] : []
      return arr
    }
    if (shiftNo) return collect(parseInt(shiftNo, 10) || 1)
    // else combine all lanes 1..7
    let combined = []
    for (let n = 1; n <= 7; n++) { const arr = collect(n); if (arr.length) combined = combined.concat(arr) }
    return combined
  }
  
  console.warn(`⚠️ No blocks found for ${day} in time settings:`, ts);
  return []
}

// Preferred name used by details renderer
function renderCompanyScheduleTimeline(company, shiftNo) {
  return renderCompanyScheduleGrid(company, shiftNo)
}

// Render read-only compact weekly timeline (hour labels + day columns)
function renderStaticWeeklyTimeline(blocksByDay) {
  const dayOrder = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday']
  const dayLabels = { monday:'Pzt', tuesday:'Sal', wednesday:'Çar', thursday:'Per', friday:'Cum', saturday:'Cmt', sunday:'Paz' }
  const colors = {
    work: { bg: 'rgba(34, 197, 94, 0.8)', border: '#22c55e', text: 'white' },
    break: { bg: 'rgba(251, 191, 36, 0.8)', border: '#fbbf24', text: 'black' },
    rest: { bg: 'rgba(156, 163, 175, 0.8)', border: '#9ca3af', text: 'white' }
  }
  const hourMarks = generateStaticHourMarks()
  let html = ''
  html += `
    <div style="border: 1px solid var(--border); border-radius: 8px; background: var(--card); overflow: hidden;">
      <div style="display: grid; grid-template-columns: 50px repeat(7, 1fr); background: var(--muted); border-bottom: 1px solid var(--border);">
        <div style="padding: 6px; font-size: 11px; font-weight: 600; border-right: 1px solid var(--border); display: flex; align-items: center; justify-content: center;">Saat</div>
        ${dayOrder.map((d, i) => `
          <div style="padding: 6px; text-align: center; border-right: 1px solid var(--border); ${i === dayOrder.length - 1 ? 'border-right: none;' : ''}">
            <div style="font-size: 12px; font-weight: 600;">${dayLabels[d]}</div>
          </div>
        `).join('')}
      </div>
      <div style="display: grid; grid-template-columns: 50px repeat(7, 1fr); height: 220px; position: relative;">
        <div style="background: var(--muted); border-right: 1px solid var(--border); position: relative;">${hourMarks}</div>
        ${dayOrder.map((d, i) => {
          const blocks = Array.isArray(blocksByDay[d]) ? blocksByDay[d] : []
          const blocksHtml = blocks.map(b => {
            if (!b) return '';
            // Handle both start/end and startTime/endTime formats
            const startTime = b.startTime || b.start;
            const endTime = b.endTime || b.end;
            if (!startTime || !endTime) return '';
            
            const sh = typeof b.startHour === 'number' ? b.startHour : timeToHourLocal(startTime)
            const eh = typeof b.endHour === 'number' ? b.endHour : timeToHourLocal(endTime)
            const top = Math.max(0, Math.min(100, (sh / 24) * 100))
            const height = Math.max(1, Math.min(100, ((eh - sh) / 24) * 100))
            const c = colors[b.type] || colors.work
            const label = b.type === 'break' ? 'Mola' : (b.type === 'rest' ? 'Dinlenme' : 'Çalışma')
            const time = `${escapeHtml(startTime)}-${escapeHtml(endTime)}`
            return `
              <div style="position:absolute; left:2px; right:2px; top:${top}%; height:${height}%; background:${c.bg}; border:1px solid ${c.border}; color:${c.text}; border-radius:3px; display:flex; align-items:center; justify-content:center; font-size:10px; pointer-events:none;">
                <span style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${label} ${time}</span>
              </div>`
          }).join('')
          return `
            <div style="position: relative; background: white; border-right: 1px solid var(--border); ${i === dayOrder.length - 1 ? 'border-right: none;' : ''}; pointer-events: none;">
              ${blocksHtml}
            </div>`
        }).join('')}
      </div>
    </div>`
  return html
}

function generateStaticHourMarks() {
  let marks = ''
  for (let i = 0; i <= 24; i += 2) {
    const percentage = (i / 24) * 100
    const translate = (i === 0) ? 'translateY(0)' : (i === 24 ? 'translateY(-100%)' : 'translateY(-50%)')
    marks += `<div style=\"position: absolute; top: ${percentage}%; left: 0; right: 0; height: 1px; background: var(--border);\"></div>`
    marks += `<div style=\"position: absolute; top: ${percentage}%; transform: ${translate}; left: 4px; font-size: 10px; color: var(--muted-foreground); background: var(--muted); padding: 0 2px;\">${i}:00</div>`
  }
  return marks
}

function timeToHourLocal(timeString) {
  if (!timeString) return 0
  const [h, m] = String(timeString).split(':').map(Number)
  const hh = isNaN(h) ? 0 : h
  const mm = isNaN(m) ? 0 : m
  return hh + (mm / 60)
}

function generateWorkerDetailContent(worker) {
  // MAIN WORKER DETAIL FUNCTION
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

      <!-- Çalışma Zaman Bilgileri -->
      <div style="margin-bottom: 16px; padding: 12px; background: white; border-radius: 6px; border: 1px solid rgb(229, 231, 235);">
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;">
          <h3 style="margin: 0; font-size: 14px; font-weight: 600; color: rgb(17, 24, 39);">Çalışma Zaman Bilgileri</h3>
          <button type="button" onclick="openWorkerScheduleModal()" style="padding:6px 10px; border:1px solid var(--border); border-radius:4px; background:white; cursor:pointer;">Detaylı Düzenle</button>
        </div>
        
        ${(() => {
          const savedMode = (worker.personalSchedule && worker.personalSchedule.mode) ? worker.personalSchedule.mode : 'company'
          const shiftNo = (worker.personalSchedule && worker.personalSchedule.shiftNo) ? worker.personalSchedule.shiftNo : '1'
          const company = safeLoadCompanyTimeSettings()
          
          if (savedMode === 'company') {
            return `
              <div style="display:flex; align-items:center; gap:8px; margin-bottom:10px;">
                <span style="display:inline-block; font-size:11px; padding:2px 6px; border-radius:4px; background:#eef2ff; color:#4338ca; font-weight:600;">Genel Ayarlar</span>
                <span style="font-size:12px; color: rgb(55,65,81);">Vardiya No: <strong>${escapeHtml(String(shiftNo))}</strong></span>
              </div>
              <div>
                ${company ? renderCompanyScheduleTimeline(company, shiftNo) : '<div style="font-size:12px;color:var(--muted-foreground);">Genel ayarlar bulunamadı</div>'}
              </div>
            `
          } else {
            // Personal schedule - show saved blocks (normalize to remove duplicates)
            const rawBlocks = worker.personalSchedule?.blocks || {}
            const normalizedBlocks = normalizeScheduleBlocks(rawBlocks)
            return `
              <div style="display:flex; align-items:center; gap:8px; margin-bottom:10px;">
                <span style="display:inline-block; font-size:11px; padding:2px 6px; border-radius:4px; background:#fef2e2; color:#d97706; font-weight:600;">Kişisel Ayar</span>
              </div>
              <div>
                ${renderStaticWeeklyTimeline(normalizedBlocks)}
              </div>
            `
          }
        })()}
      </div>

      <!-- Yetenekler -->
      <div style="margin-bottom: 16px; padding: 12px; background: white; border-radius: 6px; border: 1px solid rgb(229, 231, 235);">
        <h3 style="margin: 0px 0px 12px; font-size: 14px; font-weight: 600; color: rgb(17, 24, 39); border-bottom: 1px solid rgb(229, 231, 235); padding-bottom: 6px;">Sahip Olunan Yetenekler</h3>
        <div style="display: flex; flex-wrap: wrap; gap: 4px;">
          ${skills.map(skill => `
            <span style="background-color: rgb(243, 244, 246); color: rgb(107, 114, 128); padding: 2px 6px; border-radius: 4px; font-size: 11px; font-weight: 500;">${escapeHtml(getSkillName(skill))}</span>
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

// Generate current task section for worker detail panel
function generateCurrentTaskSection(worker) {
  const currentTask = worker.currentTask;
  
  if (!currentTask || !currentTask.planId) {
    return `
      <div style="margin-bottom: 16px; padding: 12px; background: white; border-radius: 6px; border: 1px solid rgb(229, 231, 235);">
        <h3 style="margin: 0px 0px 12px; font-size: 14px; font-weight: 600; color: rgb(17, 24, 39); border-bottom: 1px solid rgb(229, 231, 235); padding-bottom: 6px;">Mevcut Görev</h3>
        <div style="text-align: center; padding: 20px; color: rgb(107, 114, 128); font-style: italic; font-size: 12px;">
          Şu anda atanmış bir görev bulunmuyor
        </div>
      </div>
    `;
  }
  
  const { planId, stationId, stationName, nodeId, status } = currentTask;
  const statusColors = {
    'active': { bg: '#ecfdf5', text: '#059669', label: 'Aktif' },
    'paused': { bg: '#fef3c7', text: '#d97706', label: 'Duraklatıldı' },
    'completed': { bg: '#f3f4f6', text: '#6b7280', label: 'Tamamlandı' }
  };
  const statusConfig = statusColors[status] || { bg: '#f3f4f6', text: '#6b7280', label: status || 'Unknown' };
  
  return `
    <div style="margin-bottom: 16px; padding: 12px; background: white; border-radius: 6px; border: 1px solid rgb(229, 231, 235);">
      <h3 style="margin: 0px 0px 12px; font-size: 14px; font-weight: 600; color: rgb(17, 24, 39); border-bottom: 1px solid rgb(229, 231, 235); padding-bottom: 6px;">Mevcut Görev</h3>
      <div style="padding: 12px; background: ${statusConfig.bg}; border-radius: 4px; border-left: 3px solid ${statusConfig.text};">
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
          <span style="font-weight: 600; font-size: 13px; color: rgb(17, 24, 39);">Üretim Planı</span>
          <span style="font-size: 11px; padding: 2px 8px; background: ${statusConfig.text}; color: white; border-radius: 12px; font-weight: 500;">${escapeHtml(statusConfig.label)}</span>
        </div>
        <div style="font-size: 11px; color: rgb(75, 85, 99); margin-bottom: 4px;">
          Plan ID: <span style="font-family: monospace; background: white; padding: 2px 4px; border-radius: 2px;">${escapeHtml(planId.startsWith('PPL-') ? planId : planId.slice(-10))}</span>
        </div>
        ${stationName ? `
          <div style="font-size: 11px; color: rgb(75, 85, 99); margin-bottom: 4px;">
            İstasyon: <strong>${escapeHtml(stationName)}</strong>
          </div>
        ` : ''}
        ${nodeId ? `
          <div style="font-size: 11px; color: rgb(75, 85, 99);">
            Operasyon ID: <span style="font-family: monospace; background: white; padding: 2px 4px; border-radius: 2px;">${escapeHtml(nodeId.slice(-8))}</span>
          </div>
        ` : ''}
      </div>
    </div>
  `;
}

function generateWorkerDetailContentWithStations(worker, workerStationsData, assignments = []) {
  const skills = Array.isArray(worker.skills) ? worker.skills : (typeof worker.skills === 'string' ? worker.skills.split(',').map(s=>s.trim()).filter(Boolean) : [])
  
  // Check if worker has active absence today
  const now = new Date().toISOString().split('T')[0];
  const currentAbsence = worker.absences?.find(abs => abs.startDate <= now && abs.endDate >= now);
  
  // Determine current status badge
  let statusBadge = '';
  if (!worker.isActive) {
    statusBadge = '<span style="background: rgb(156, 163, 175); color: white; padding: 4px 8px; border-radius: 4px; font-size: 11px; font-weight: 600;">❌ İşten Ayrılmış</span>';
  } else if (currentAbsence) {
    const typeEmoji = currentAbsence.type === 'sick' ? '🤒' : currentAbsence.type === 'vacation' ? '🏖️' : currentAbsence.type === 'training' ? '📚' : currentAbsence.type === 'meeting' ? '📅' : '📝';
    const typeText = currentAbsence.type === 'sick' ? 'Hasta' : currentAbsence.type === 'vacation' ? 'İzinli' : currentAbsence.type === 'training' ? 'Eğitimde' : currentAbsence.type === 'meeting' ? 'Toplantıda' : 'Devamsız';
    statusBadge = `<span style="background: rgb(220, 38, 38); color: white; padding: 4px 8px; border-radius: 4px; font-size: 11px; font-weight: 600;">${typeEmoji} ${typeText} (${currentAbsence.startDate} - ${currentAbsence.endDate})</span>`;
  } else {
    statusBadge = '<span style="background: rgb(34, 197, 94); color: white; padding: 4px 8px; border-radius: 4px; font-size: 11px; font-weight: 600;">✅ Çalışıyor</span>';
  }
  
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
        
        <!-- Bugünkü Durum (Otomatik - Absences'den hesaplanan) -->
        <div class="detail-item" style="display: flex; align-items: center; margin-bottom: 12px; padding-top: 8px; border-top: 1px solid rgb(229, 231, 235);">
          <span class="detail-label" style="font-weight: 600; font-size: 12px; color: rgb(55, 65, 81); min-width: 120px; margin-right: 8px;">Bugünkü Durum:</span>
          ${statusBadge}
        </div>
        
        <!-- Çalışma Durumu (Manuel - Sadece İşten Ayrılma) -->
        <div class="detail-item" style="display: flex; align-items: center; margin-bottom: 8px;">
          <span class="detail-label" style="font-weight: 600; font-size: 12px; color: rgb(55, 65, 81); min-width: 120px; margin-right: 8px;">Çalışma Durumu:</span>
          <select id="worker-employment-status" onchange="handleEmploymentStatusChange()" style="flex: 1; padding: 6px 8px; border: 1px solid rgb(209, 213, 219); border-radius: 4px; font-size: 12px; background: white;">
            <option value="active" ${worker.isActive ? 'selected' : ''}>✅ Aktif Çalışan</option>
            <option value="inactive" ${!worker.isActive ? 'selected' : ''}>❌ İşten Ayrılmış</option>
          </select>
        </div>
        
        <!-- Mesai Durumu (Otomatik - Çalışma Programından) -->
        <div class="detail-item" style="display: flex; align-items: center; margin-bottom: 8px;">
          <span class="detail-label" style="font-weight: 600; font-size: 12px; color: rgb(55, 65, 81); min-width: 120px; margin-right: 8px;">Mesai Durumu:</span>
          <span id="worker-schedule-status" style="display: inline-flex; align-items: center; gap: 4px; padding: 4px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; background: rgb(243, 244, 246); color: rgb(107, 114, 128);">
            <i class="fa-solid fa-spinner fa-spin"></i> Hesaplanıyor...
          </span>
        </div>
        
        <!-- İzin Yönetimi -->
        <div style="margin-top: 16px; padding-top: 12px; border-top: 1px solid rgb(229, 231, 235);">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
            <h4 style="margin: 0; font-size: 13px; font-weight: 600; color: rgb(17, 24, 39);">
              <i class="fa-solid fa-calendar-days"></i> İzin Kayıtları
            </h4>
            <button type="button" onclick="openAddAbsenceForm()" style="padding: 6px 12px; background: rgb(37, 99, 235); color: white; border: none; border-radius: 4px; font-size: 11px; font-weight: 600; cursor: pointer;">
              <i class="fa-solid fa-plus"></i> Yeni İzin Ekle
            </button>
          </div>
          
          <!-- Add Absence Form (Initially Hidden) -->
          <div id="add-absence-form" style="display: none; margin-bottom: 12px; padding: 12px; background: rgb(239, 246, 255); border: 1px solid rgb(191, 219, 254); border-radius: 6px;">
            <div style="margin-bottom: 8px; font-size: 11px; font-weight: 600; color: rgb(30, 64, 175);">
              <i class="fa-solid fa-calendar-plus"></i> Yeni İzin Kaydı Oluştur
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 8px;">
              <div>
                <label style="display: block; font-size: 10px; font-weight: 600; color: rgb(55, 65, 81); margin-bottom: 4px;">Başlangıç Tarihi:</label>
                <input type="date" id="new-absence-start" style="width: 100%; padding: 6px 8px; border: 1px solid rgb(209, 213, 219); border-radius: 4px; font-size: 11px;">
              </div>
              <div>
                <label style="display: block; font-size: 10px; font-weight: 600; color: rgb(55, 65, 81); margin-bottom: 4px;">Bitiş Tarihi:</label>
                <input type="date" id="new-absence-end" style="width: 100%; padding: 6px 8px; border: 1px solid rgb(209, 213, 219); border-radius: 4px; font-size: 11px;">
              </div>
            </div>
            <div style="margin-bottom: 8px;">
              <label style="display: block; font-size: 10px; font-weight: 600; color: rgb(55, 65, 81); margin-bottom: 4px;">İzin Tipi:</label>
              <select id="new-absence-type" style="width: 100%; padding: 6px 8px; border: 1px solid rgb(209, 213, 219); border-radius: 4px; font-size: 11px;">
                <option value="vacation">🏖️ Yıllık İzin</option>
                <option value="sick">🤒 Hastalık İzni</option>
                <option value="training">📚 Eğitim</option>
                <option value="meeting">📅 Toplantı</option>
                <option value="other">📝 Diğer</option>
              </select>
            </div>
            <div style="margin-bottom: 8px;">
              <label style="display: block; font-size: 10px; font-weight: 600; color: rgb(55, 65, 81); margin-bottom: 4px;">Sebep/Açıklama:</label>
              <input type="text" id="new-absence-reason" placeholder="Örn: Yıllık izin, grip, eğitim semineri..." style="width: 100%; padding: 6px 8px; border: 1px solid rgb(209, 213, 219); border-radius: 4px; font-size: 11px;">
            </div>
            <div style="display: flex; gap: 8px;">
              <button type="button" onclick="saveNewAbsence()" style="flex: 1; padding: 6px; background: rgb(34, 197, 94); color: white; border: none; border-radius: 4px; font-size: 11px; font-weight: 600; cursor: pointer;">
                <i class="fa-solid fa-check"></i> Kaydet
              </button>
              <button type="button" onclick="closeAddAbsenceForm()" style="flex: 1; padding: 6px; background: rgb(156, 163, 175); color: white; border: none; border-radius: 4px; font-size: 11px; font-weight: 600; cursor: pointer;">
                <i class="fa-solid fa-times"></i> İptal
              </button>
            </div>
          </div>
          
          <!-- Absences List -->
          ${worker.absences && worker.absences.length > 0 ? `
            <div style="max-height: 250px; overflow-y: auto;">
              ${worker.absences.sort((a, b) => new Date(b.startDate) - new Date(a.startDate)).map(abs => {
                const isPast = abs.endDate < now;
                const isCurrent = abs.startDate <= now && abs.endDate >= now;
                const typeEmoji = abs.type === 'sick' ? '🤒' : abs.type === 'vacation' ? '🏖️' : abs.type === 'training' ? '📚' : abs.type === 'meeting' ? '📅' : '📝';
                const statusBadge = isCurrent 
                  ? '<span style="background: rgb(220, 38, 38); color: white; padding: 2px 6px; border-radius: 3px; font-size: 10px; margin-left: 4px;">AKTİF</span>' 
                  : isPast 
                  ? '<span style="background: rgb(156, 163, 175); color: white; padding: 2px 6px; border-radius: 3px; font-size: 10px; margin-left: 4px;">GEÇMİŞ</span>' 
                  : '<span style="background: rgb(59, 130, 246); color: white; padding: 2px 6px; border-radius: 3px; font-size: 10px; margin-left: 4px;">GELECEK</span>';
                
                return `
                  <div style="padding: 8px; margin-bottom: 6px; background: white; border: 1px solid rgb(229, 231, 235); border-radius: 4px; ${isCurrent ? 'border-left: 3px solid rgb(220, 38, 38);' : ''}">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                      <span style="font-size: 11px; font-weight: 600; color: rgb(17, 24, 39);">
                        ${typeEmoji} ${escapeHtml(abs.reason || abs.type)}
                        ${statusBadge}
                      </span>
                      ${!isPast ? `
                        <button type="button" onclick="deleteAbsence('${abs.id}')" style="padding: 2px 6px; background: rgb(239, 68, 68); color: white; border: none; border-radius: 3px; font-size: 10px; cursor: pointer;">
                          <i class="fa-solid fa-trash"></i>
                        </button>
                      ` : ''}
                    </div>
                    <div style="font-size: 10px; color: rgb(107, 114, 128);">
                      ${abs.startDate} → ${abs.endDate}
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          ` : `
            <div style="padding: 16px; text-align: center; color: rgb(107, 114, 128); font-size: 11px;">
              <i class="fa-solid fa-inbox"></i> Henüz izin kaydı yok
            </div>
          `}
        </div>
      </div>

      <!-- Çalışma Zaman Bilgileri -->
      <div style="margin-bottom: 16px; padding: 12px; background: white; border-radius: 6px; border: 1px solid rgb(229, 231, 235);">
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;">
          <h3 style="margin: 0; font-size: 14px; font-weight: 600; color: rgb(17, 24, 39);">Çalışma Zaman Bilgileri</h3>
          <button type="button" onclick="openWorkerScheduleModal()" style="padding:6px 10px; border:1px solid var(--border); border-radius:4px; background:white; cursor:pointer;">Detaylı Düzenle</button>
        </div>
        
        ${(() => {
          const savedMode = (worker.personalSchedule && worker.personalSchedule.mode) ? worker.personalSchedule.mode : 'company'
          const shiftNo = (worker.personalSchedule && worker.personalSchedule.shiftNo) ? worker.personalSchedule.shiftNo : '1'
          const company = safeLoadCompanyTimeSettings()
          
          if (savedMode === 'company') {
            return `
              <div style="display:flex; align-items:center; gap:8px; margin-bottom:10px;">
                <span style="display:inline-block; font-size:11px; padding:2px 6px; border-radius:4px; background:#eef2ff; color:#4338ca; font-weight:600;">Genel Ayarlar</span>
                <span style="font-size:12px; color: rgb(55,65,81);">Vardiya No: <strong>${escapeHtml(String(shiftNo))}</strong></span>
              </div>
              <div>
                ${company ? renderCompanyScheduleTimeline(company, shiftNo) : '<div style="font-size:12px;color:var(--muted-foreground);">Genel ayarlar bulunamadı</div>'}
              </div>
            `
          } else {
            // Personal schedule - show saved blocks (normalize to remove duplicates)
            const rawBlocks = worker.personalSchedule?.blocks || {}
            const normalizedBlocks = normalizeScheduleBlocks(rawBlocks)
            return `
              <div style="display:flex; align-items:center; gap:8px; margin-bottom:10px;">
                <span style="display:inline-block; font-size:11px; padding:2px 6px; border-radius:4px; background:#fef2e2; color:#d97706; font-weight:600;">Kişisel Ayar</span>
              </div>
              <div>
                ${renderStaticWeeklyTimeline(normalizedBlocks)}
              </div>
            `
          }
        })()}
      </div>

      <!-- Yetenekler -->
      <div style="margin-bottom: 16px; padding: 12px; background: white; border-radius: 6px; border: 1px solid rgb(229, 231, 235);">
        <h3 style="margin: 0px 0px 12px; font-size: 14px; font-weight: 600; color: rgb(17, 24, 39); border-bottom: 1px solid rgb(229, 231, 235); padding-bottom: 6px;">Sahip Olunan Yetenekler</h3>
        <div style="display: flex; flex-wrap: wrap; gap: 4px;">
          ${skills.map(skill => `
            <span style="background-color: rgb(243, 244, 246); color: rgb(107, 114, 128); padding: 2px 6px; border-radius: 4px; font-size: 11px; font-weight: 500;">${escapeHtml(getSkillName(skill))}</span>
          `).join('')}
          ${skills.length === 0 ? '<span style="font-size: 12px; color: rgb(107, 114, 128);">Henüz yetenek atanmamış</span>' : ''}
        </div>
      </div>

      <!-- Çalışabileceği İstasyonlar -->
      <div style="margin-bottom: 16px; padding: 12px; background: white; border-radius: 6px; border: 1px solid rgb(229, 231, 235);">
        <h3 style="margin: 0px 0px 12px; font-size: 14px; font-weight: 600; color: rgb(17, 24, 39); border-bottom: 1px solid rgb(229, 231, 235); padding-bottom: 6px;">Çalışabileceği İstasyonlar (${workerStationsData.compatibleStations.length})</h3>

        ${workerStationsData.compatibleStations.length > 0 ? `
          <div style="display: grid; gap: 8px;">
            ${workerStationsData.compatibleStations.map(station => `
              <div style="padding: 8px; background: rgb(249, 250, 251); border-radius: 4px; border: 1px solid rgb(229, 231, 235);">
                <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px;">
                  <span style="font-weight: 600; font-size: 12px; color: rgb(17, 24, 39);">${escapeHtml(station.name || '')}</span>
                  <span style="font-size: 10px; color: rgb(107, 114, 128);">${escapeHtml(station.status || 'active')}</span>
                </div>
                ${station.location ? `
                  <div style="margin-bottom: 4px; font-size: 10px; color: rgb(107, 114, 128);">
                    Lokasyon: ${escapeHtml(station.location)}
                  </div>
                ` : ''}
                <div style="display: flex; flex-wrap: wrap; gap: 3px;">
                  ${(station.requiredSkills || []).map(skill => 
                    `<span style="background-color: rgb(243, 244, 246); color: rgb(107, 114, 128); padding: 1px 4px; border-radius: 3px; font-size: 10px; font-weight: 500;">${escapeHtml(getSkillName(skill))}</span>`
                  ).join('')}
                </div>
              </div>
            `).join('')}
          </div>
        ` : `
          <div style="text-align: center; padding: 16px; color: rgb(107, 114, 128); font-style: italic; font-size: 12px;">
            Bu çalışan için uygun istasyon bulunamadı.
            ${workerStationsData.workerSkills.length > 0 ? 
              `<br><span style="font-size: 11px;">Mevcut yetenekleri ile tam eşleşen istasyon yok.</span>` : 
              `<br><span style="font-size: 11px;">Önce yetenek tanımlaması yapılması gerekiyor.</span>`
            }
          </div>
        `}
      </div>

      <!-- Mevcut Görev -->
      ${generateCurrentTaskSection(worker)}

      <!-- Yaklaşan Görevler -->
      <div style="margin-bottom: 16px; padding: 12px; background: white; border-radius: 6px; border: 1px solid rgb(229, 231, 235);">
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;">
          <h3 style="margin: 0; font-size: 14px; font-weight: 600; color: rgb(17, 24, 39);">Yaklaşan Görevler (${assignments.length})</h3>
          <button type="button" onclick="refreshWorkerAssignments('${worker.id}')" style="padding: 4px 8px; border: 1px solid rgb(209, 213, 219); border-radius: 4px; background: white; cursor: pointer; font-size: 11px;">🔄 Yenile</button>
        </div>
        <div class="assignments-timeline">${generateAssignmentsTimeline(assignments)}</div>
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
  const statusHeader = document.querySelector('.worker-status-column')
  if (statusHeader) {
    statusHeader.style.display = 'none'
  }
  
  // Hide status column in all rows
  const statusCells = document.querySelectorAll('#workers-table-body .worker-status-cell')
  statusCells.forEach(cell => {
    cell.style.display = 'none'
  })
}

function showStatusColumn() {
  // Show status column header
  const statusHeader = document.querySelector('.worker-status-column')
  if (statusHeader) {
    statusHeader.style.display = ''
  }
  
  // Show status column in all rows
  const statusCells = document.querySelectorAll('#workers-table-body .worker-status-cell')
  statusCells.forEach(cell => {
    cell.style.display = ''
  })
}

// Generate assignments timeline for worker detail panel
function generateAssignmentsTimeline(assignments) {
  if (!assignments || assignments.length === 0) {
    return `
      <div style="text-align: center; padding: 20px; color: rgb(107, 114, 128); font-style: italic; font-size: 12px;">
        Yaklaşan görev bulunmuyor
      </div>
    `;
  }

  // Sort assignments by start time
  const sortedAssignments = assignments.sort((a, b) => 
    new Date(a.start).getTime() - new Date(b.start).getTime()
  );

  // Check for conflicts (overlapping assignments)
  const conflictMap = new Map();
  for (let i = 0; i < sortedAssignments.length; i++) {
    const current = sortedAssignments[i];
    const currentStart = new Date(current.start);
    const currentEnd = new Date(current.end);
    
    for (let j = i + 1; j < sortedAssignments.length; j++) {
      const next = sortedAssignments[j];
      const nextStart = new Date(next.start);
      const nextEnd = new Date(next.end);
      
      // Check for overlap
      if (currentStart < nextEnd && currentEnd > nextStart) {
        conflictMap.set(current.id, true);
        conflictMap.set(next.id, true);
      }
    }
  }

  return `
    <div style="max-height: 300px; overflow-y: auto;">
      ${sortedAssignments.map(assignment => {
        const start = new Date(assignment.start);
        const end = new Date(assignment.end);
        const hasConflict = conflictMap.has(assignment.id);
        const duration = Math.round((end.getTime() - start.getTime()) / (1000 * 60)); // minutes
        
        return `
          <div style="padding: 8px; margin-bottom: 6px; border-radius: 4px; border: 1px solid ${hasConflict ? '#fecaca' : '#e5e7eb'}; background: ${hasConflict ? '#fef2f2' : '#f9fafb'};">
            ${hasConflict ? '<div style="font-size: 10px; color: #dc2626; margin-bottom: 4px; font-weight: 600;"><i class="fa-solid fa-exclamation-triangle"></i> ÇAKIŞMA</div>' : ''}
            
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 4px;">
              <div style="font-weight: 600; font-size: 12px; color: rgb(17, 24, 39);">
                ${assignment.planName || 'Plan #' + (assignment.planId || '').slice(-6)}
              </div>
              <span style="font-size: 10px; color: rgb(107, 114, 128); background: rgb(243, 244, 246); padding: 1px 4px; border-radius: 3px;">
                ${duration}dk
              </span>
            </div>
            
            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px; font-size: 11px; color: rgb(55, 65, 81);">
              <span>🕒 ${start.toLocaleString('tr-TR', { 
                month: 'short', 
                day: 'numeric', 
                hour: '2-digit', 
                minute: '2-digit' 
              })} - ${end.toLocaleString('tr-TR', { 
                hour: '2-digit', 
                minute: '2-digit' 
              })}</span>
            </div>
            
            <div style="display: flex; align-items: center; gap: 8px; font-size: 10px; color: rgb(107, 114, 128);">
              ${assignment.stationId ? `<span><i class="fa-solid fa-industry"></i> ${assignment.stationId}</span>` : ''}
              ${assignment.subStationCode ? `<span>📍 ${assignment.subStationCode}</span>` : ''}
              <span style="margin-left: auto; background: ${getStatusColor(assignment.status)}; color: white; padding: 1px 4px; border-radius: 3px;">
                ${getStatusLabel(assignment.status)}
              </span>
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

// Helper functions for assignment status
function getStatusColor(status) {
  switch (status) {
    case 'pending': return '#f59e0b';
    case 'in-progress': return '#3b82f6';
    case 'completed': return '#10b981';
    case 'cancelled': return '#ef4444';
    default: return '#6b7280';
  }
}

function getStatusLabel(status) {
  switch (status) {
    case 'pending': return 'Bekliyor';
    case 'in-progress': return 'Devam Eden';
    case 'completed': return 'Tamamlandı';
    case 'cancelled': return 'İptal';
    default: return status || 'Bilinmiyor';
  }
}

// Refresh worker assignments
async function refreshWorkerAssignments(workerId) {
  if (!workerId) return;
  
  try {
    const assignments = await getWorkerAssignments(workerId);
    
    // Find the assignments timeline container and update it
    const timelineContainer = document.querySelector('.assignments-timeline');
    if (timelineContainer) {
      timelineContainer.innerHTML = generateAssignmentsTimeline(assignments);
    } else {
      // If no timeline container, refresh the entire detail panel
      await showWorkerDetail(workerId);
    }
    
    showSuccessToast('Görevler güncellendi');
  } catch (error) {
    console.error('Failed to refresh assignments:', error);
    showErrorToast('Görevler güncellenirken hata oluştu');
  }
}

// Make refreshWorkerAssignments globally available
window.refreshWorkerAssignments = refreshWorkerAssignments;

// Handle assignment updates event
async function handleAssignmentsUpdated(event) {
  // If a worker detail panel is currently open, refresh it
  if (selectedWorkerId) {
    try {
      await refreshWorkerAssignments(selectedWorkerId);
    } catch (error) {
      console.error('Failed to refresh assignments on update:', error);
    }
  }
  
  // Refresh the workers table to update any conflict indicators
  await loadWorkersAndRender();
}

async function loadWorkersAndRender() {
  const tbody = document.getElementById('workers-table-body')
  if (tbody) tbody.innerHTML = `<tr><td colspan="4"><em>Loading workers...</em></td></tr>`
  try {
    // Load skills for ID to name mapping
    skillsCache = await getSkillsFromSQL()
    
    const res = await fetch(`${API_BASE}/api/mes/workers`, { headers: withAuth() })
    if (!res.ok) throw new Error(`Load failed: ${res.status}`)
    const data = await res.json()
    workersState = Array.isArray(data) ? data : []
    await renderWorkersTable()
  } catch (e) {
    console.error('Workers load error:', e)
    if (tbody) {
      tbody.innerHTML = `
        <tr class="mes-table-row is-empty">
          <td colspan="3" class="mes-empty-cell text-center"><span class="mes-error-text">Workers yüklenemedi.</span></td>
        </tr>`
    }
    showErrorToast('Workers yüklenemedi')
  }
}

async function renderWorkersTable() {
  const tbody = document.getElementById('workers-table-body')
  if (!tbody) return

  // Show loading state if conflict filter is active
  if (workerFilters.hasConflict) {
    tbody.innerHTML = `
      <tr class="mes-table-row is-empty">
        <td colspan="3" class="mes-empty-cell text-center"><em>Çakışmalar kontrol ediliyor...</em></td>
      </tr>`
  }

  const filtered = await applyWorkersFilter(workersState)

  if (workersState.length === 0) {
    tbody.innerHTML = `
      <tr class="mes-table-row is-empty">
        <td colspan="3" class="mes-empty-cell text-center"><em>Hiç worker yok. Yeni ekleyin.</em></td>
      </tr>`
    return
  }
  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr class="mes-table-row is-empty">
        <td colspan="3" class="mes-empty-cell text-center"><em>Filtrelere uyan worker bulunamadı.</em></td>
      </tr>`
    return
  }

  tbody.innerHTML = filtered.map(w => {
    const skills = Array.isArray(w.skills) ? w.skills : (typeof w.skills === 'string' ? w.skills.split(',').map(s=>s.trim()).filter(Boolean) : [])
    const status = (w.status || 'available').toLowerCase()
    const onLeave = w.onLeave === true
    
    // Determine status display text and badge style
    let statusText = capitalize(status)
    let badgeClass = 'default'
    
    if (onLeave && w.leaveReason) {
      statusText = w.leaveReason
      badgeClass = 'warning'
    } else if (status === 'available' || status === 'active') {
      statusText = 'Çalışıyor'
      badgeClass = 'success'
    } else if (status === 'inactive') {
      statusText = 'İşten ayrıldı'
      badgeClass = 'default'
    } else if (status === 'break') {
      statusText = 'Mola'
      badgeClass = 'warning'
    } else if (status === 'busy') {
      statusText = 'Meşgul'
      badgeClass = 'warning'
    }
    
    const skillsMarkup = skills.length
      ? `<div class="mes-tag-group">${skills.map(skill => `<span class="mes-tag">${escapeHtml(getSkillName(skill))}</span>`).join('')}</div>`
      : `<span class="mes-muted-text">-</span>`

    return `
      <tr class="mes-table-row" data-worker-id="${w.id}" onclick="(async () => await showWorkerDetail('${w.id}'))()">
        <td>${escapeHtml(w.name || '')}</td>
        <td>${skillsMarkup}</td>
  <td class="worker-status-cell text-center"><span class="badge badge-${badgeClass}">${escapeHtml(statusText)}</span></td>
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

// Cache for worker conflicts to avoid repeated API calls
let workerConflictsCache = new Map();
let conflictsCacheTimestamp = 0;
const CONFLICTS_CACHE_DURATION = 2 * 60 * 1000; // 2 minutes

async function checkWorkerHasConflicts(workerId) {
  // Check cache first
  if (workerConflictsCache.has(workerId) && 
      (Date.now() - conflictsCacheTimestamp) < CONFLICTS_CACHE_DURATION) {
    return workerConflictsCache.get(workerId);
  }
  
  try {
    const assignments = await getWorkerAssignments(workerId, 'active');
    
    // Check for overlapping assignments
    let hasConflict = false;
    for (let i = 0; i < assignments.length && !hasConflict; i++) {
      const current = assignments[i];
      const currentStart = new Date(current.start);
      const currentEnd = new Date(current.end);
      
      for (let j = i + 1; j < assignments.length; j++) {
        const next = assignments[j];
        const nextStart = new Date(next.start);
        const nextEnd = new Date(next.end);
        
        // Check for overlap
        if (currentStart < nextEnd && currentEnd > nextStart) {
          hasConflict = true;
          break;
        }
      }
    }
    
    // Cache the result
    workerConflictsCache.set(workerId, hasConflict);
    conflictsCacheTimestamp = Date.now();
    
    return hasConflict;
  } catch (error) {
    console.error('Error checking worker conflicts:', error);
    return false; // Assume no conflicts on error
  }
}

async function applyWorkersFilter(list) {
  const q = String(workerFilters.query || '').toLowerCase()
  const selSkills = Array.isArray(workerFilters.skills) ? workerFilters.skills : []
  const statuses = Array.isArray(workerFilters.statuses) ? workerFilters.statuses : []
  const needsConflictFilter = workerFilters.hasConflict

  // First apply non-async filters
  let filtered = (list || []).filter(w => {
    // Determine UI status (might be different from backend status if worker has leave dates)
    let uiStatus = (w.status || 'available').toLowerCase()
    if (w.onLeave || (w.leaveStart && w.leaveEnd && w.leaveReason)) {
      // Worker is on leave - map to appropriate leave status
      uiStatus = (w.leaveReason === 'Hasta') ? 'leave-sick' : 'leave-vacation'
    }
    
    // status filter
    if (statuses.length > 0 && !statuses.includes(uiStatus)) return false

    // skills: require all selected skills to be present
    const wSkills = normalizeSkills(w.skills)
    if (selSkills.length > 0) {
      const hasAll = selSkills.every(s => wSkills.includes(s))
      if (!hasAll) return false
    }

    // query: match name, email, phone, status, skills
    if (q) {
      const hay = [w.name, w.email, w.phone, uiStatus, ...wSkills]
        .map(x => String(x || '').toLowerCase())
        .join(' ')
      if (!hay.includes(q)) return false
    }
    return true
  })

  // Apply conflict filter if needed (async)
  if (needsConflictFilter) {
    const conflictResults = await Promise.all(
      filtered.map(w => checkWorkerHasConflicts(w.id))
    );
    filtered = filtered.filter((w, index) => conflictResults[index]);
  }

  return filtered;
}

function initWorkerFilters() {
  // Search
  const search = document.getElementById('worker-filter-search')
  if (search) {
    search.value = workerFilters.query
    search.addEventListener('input', async (e) => {
      workerFilters.query = e.target.value || ''
      updateClearAllButton()
      await renderWorkersTable()
    })
  }

  // Skills dropdown
  setupSkillsFilter()
  // Status dropdown
  setupStatusFilter()
  // Conflict filter
  setupConflictFilter()

  // Clear All button
  const clearAllBtn = document.getElementById('worker-filter-clear-all')
  if (clearAllBtn) {
    clearAllBtn.addEventListener('click', async () => {
      await clearAllFilters()
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
        <label>
          <input type="checkbox" value="${escapeHtml(s.name)}" ${checked} />
          <span>${escapeHtml(s.name)}</span>
        </label>`
    }).join('')

    // attach events
    list.querySelectorAll('input[type="checkbox"]').forEach(cb => {
      cb.addEventListener('change', async (e) => {
        const val = e.target.value
        if (e.target.checked) {
          if (!workerFilters.skills.includes(val)) workerFilters.skills.push(val)
        } else {
          workerFilters.skills = workerFilters.skills.filter(x => x !== val)
        }
        updateCount()
        await renderWorkersTable()
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
  if (clearBtn) clearBtn.addEventListener('click', async () => {
    workerFilters.skills = []
    updateCount()
    renderSkillsList()
    await renderWorkersTable()
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
    { value: 'available', label: 'Çalışıyor' },
    { value: 'busy', label: 'Meşgul' },
    { value: 'break', label: 'Mola' },
    { value: 'inactive', label: 'İşten ayrıldı' },
    { value: 'leave-vacation', label: 'İzinli' },
    { value: 'leave-sick', label: 'Hasta' }
  ]

  function updateCount() {
    if (!countEl) return
    countEl.textContent = workerFilters.statuses.length ? `(${workerFilters.statuses.length})` : ''
  }

  function renderStatusList() {
    list.innerHTML = OPTIONS.map(opt => {
      const checked = workerFilters.statuses.includes(opt.value) ? 'checked' : ''
      return `
        <label>
          <input type=\"checkbox\" value=\"${opt.value}\" ${checked} />
          <span>${opt.label}</span>
        </label>`
    }).join('')

    list.querySelectorAll('input[type="checkbox"]').forEach(cb => {
      cb.addEventListener('change', async (e) => {
        const val = e.target.value
        if (e.target.checked) {
          if (!workerFilters.statuses.includes(val)) workerFilters.statuses.push(val)
        } else {
          workerFilters.statuses = workerFilters.statuses.filter(x => x !== val)
        }
        updateCount()
        await renderWorkersTable()
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
  if (clearBtn) clearBtn.addEventListener('click', async () => {
    workerFilters.statuses = []
    updateCount()
    renderStatusList()
    await renderWorkersTable()
  })
  if (hideBtn) hideBtn.addEventListener('click', () => { panel.style.display = 'none' })
}

function setupConflictFilter() {
  const conflictCheckbox = document.getElementById('worker-filter-conflict');
  if (conflictCheckbox) {
    conflictCheckbox.checked = workerFilters.hasConflict;
    conflictCheckbox.addEventListener('change', async (e) => {
      workerFilters.hasConflict = e.target.checked;
      updateClearAllButton();
      await renderWorkersTable();
    });
  }
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
  const timeSource = document.getElementById('worker-time-source')?.value || 'company'
  
  // New workers default to 'available' status
  // Status and leave are managed from detail view, not at creation
  const status = 'available'

  if (!name) { showWarningToast('İsim gerekli'); return }
  if (!email) { showWarningToast('Email gerekli'); return }

    // Get skills from modern interface
  const skills = getSelectedSkills();
  
  if (skills.length === 0) { 
    showWarningToast('En az bir skill giriniz'); 
    return;
  }

  // Set up default personal schedule based on time source
  let personalSchedule = null
  if (timeSource === 'company') {
    // AUTO-SET: Default to company settings with auto-populated blocks
    const company = safeLoadCompanyTimeSettings()
    if (company) {
      const days = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday']
      const shiftNo = '1' // default shift
      const blocksByDay = {}
      days.forEach(d => {
        const list = getShiftBlocksForDay(company, d, shiftNo)
        blocksByDay[d] = Array.isArray(list) ? list : []
      })
      personalSchedule = { mode: 'company', shiftNo, blocks: blocksByDay }
    } else {
      personalSchedule = { mode: 'company', blocks: {} }
    }
  }
  // If personal, it will be set up later in worker schedule modal

  const payload = { 
    id: editingWorkerId || genId(), 
    name, email, phone, skills, status,
    personalSchedule
  }
  const idx = workersState.findIndex(w => w.id === payload.id)
  if (idx >= 0) workersState[idx] = { ...workersState[idx], ...payload }
  else workersState.push(payload)

  try {
    await persistWorkers()
    closeWorkerModal(true)
    await renderWorkersTable()
    // If a detail panel is open for this worker, refresh it
    try {
      if (selectedWorkerId && selectedWorkerId === payload.id) {
        showWorkerDetail(payload.id)
      }
    } catch {}
    showSuccessToast('Worker kaydedildi')
  } catch (e) {
    console.error('Worker save error:', e)
    showErrorToast('Worker kaydedilemedi')
  }
}

export async function deleteWorker(id) {
  if (!confirm('Bu worker silinsin mi?')) return
  workersState = workersState.filter(w => w.id !== id)
  try {
    await persistWorkers()
    closeWorkerModal(true)
    await renderWorkersTable()
    showSuccessToast('Worker silindi')
  } catch (e) {
    console.error('Worker delete error:', e)
    showErrorToast('Worker silinemedi')
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
  const sanitized = {
    id: w.id || genId(),
    name: (w.name || '').trim(),
    email: (w.email || '').trim(),
    phone: (w.phone || '').trim(),
    skills: Array.isArray(w.skills) ? w.skills : (typeof w.skills === 'string' ? w.skills.split(',').map(s=>s.trim()).filter(Boolean) : []),
    status: (w.status || 'available').toLowerCase(),
    station: w.station || '',
    currentTask: w.currentTask || '',
    // Schedule fields
    personalSchedule: (function(){
      const ps = w.personalSchedule
      if (!ps || typeof ps !== 'object') return null
      const mode = (ps.mode === 'personal' || ps.mode === 'company') ? ps.mode : 'company'
      const out = { mode }
      if (ps.shiftNo) out.shiftNo = ps.shiftNo
      // Only save blocks for 'personal' mode - 'company' mode reads from master-data
      if (mode === 'personal' && ps.blocks && typeof ps.blocks === 'object') {
        out.blocks = ps.blocks
      }
      return out
    })()
  }
  
  // Leave fields (optional)
  if (w.leaveStart) sanitized.leaveStart = w.leaveStart
  if (w.leaveEnd) sanitized.leaveEnd = w.leaveEnd
  if (w.leaveReason) sanitized.leaveReason = w.leaveReason
  
  return sanitized
}

function openWorkerModal(worker = null) {
  const overlay = document.getElementById('worker-modal')
  const title = document.getElementById('worker-modal-title')
  const nameI = document.getElementById('worker-name')
  const emailI = document.getElementById('worker-email')
  const phoneI = document.getElementById('worker-phone')
  const deleteBtn = document.getElementById('worker-delete-btn')

  if (!overlay) return
  title.textContent = worker ? 'Edit Worker' : 'Add New Worker'
  nameI.value = worker?.name || ''
  emailI.value = worker?.email || ''
  if (phoneI) phoneI.value = worker?.phone || ''
  // Status no longer set here - managed from detail view

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
    // Load skills from SQL database
    const skills = await getSkillsFromSQL();
    if (!skills || skills.length === 0) {
      showErrorToast('Skills verisi yüklenemedi');
      return;
    }
    
    // Create modern interface
    const skillsInterface = createModernSkillsInterface(skills, selectedSkills);
    skillsContainer.appendChild(skillsInterface);
    
    console.log('✅ Modern skills interface created with', skills.length, 'skills');
  } catch (error) {
    console.error('❌ Skills interface error:', error);
    showErrorToast('Skills arayüzü oluşturulamadı');
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
      selectedDisplay.innerHTML = currentSelected.map(skillId => {
        const skill = allSkills.find(s => s.id === skillId);
        const skillName = skill ? skill.name : skillId;
        return `
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
          " onclick="removeSkill('${skillId}')" title="Kaldırmak için tıklayın">
            ${escapeHtml(skillName)} ×
          </span>
        `;
      }).join('');
    }
    
    // Update original select for form submission
    updateOriginalSelect();
  }
  
  function updateOriginalSelect() {
    const originalSelect = document.getElementById('worker-skills');
    originalSelect.innerHTML = allSkills.map(skill => 
      `<option value="${escapeHtml(skill.id)}" ${currentSelected.includes(skill.id) ? 'selected' : ''}>
        ${escapeHtml(skill.name)}
      </option>`
    ).join('');
  }
  
  function createSkillCard(skill) {
    const isSelected = currentSelected.includes(skill.id);
    
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
      toggleSkill(skill.id);
    });
    
    return card;
  }
  
  function toggleSkill(skillId) {
    if (currentSelected.includes(skillId)) {
      currentSelected = currentSelected.filter(s => s !== skillId);
    } else {
      currentSelected.push(skillId);
    }
    renderSkills();
    updateSelectedDisplay();
  }
  
  function renderSkills(filter = '') {
    // Only show NOT selected skills in the list below
    const normalized = String(filter || '').toLowerCase();
    const filteredSkills = allSkills
      .filter(skill => !currentSelected.includes(skill.id))
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
  
  // Global function for removing skills (uses skill ID)
  window.removeSkill = (skillId) => {
    currentSelected = currentSelected.filter(s => s !== skillId);
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
async function clearAllFilters() {
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

  // Clear conflict filter
  workerFilters.hasConflict = false
  const conflictCheckbox = document.getElementById('worker-filter-conflict')
  if (conflictCheckbox) {
    conflictCheckbox.checked = false
  }

  // Update UI
  updateFilterCounts()
  updateClearAllButton()
  await renderWorkersTable()
}

function updateClearAllButton() {
  const clearAllBtn = document.getElementById('worker-filter-clear-all')
  if (!clearAllBtn) return

  // Show button if any filter is active
  const hasActiveFilters = workerFilters.query.trim() !== '' || 
                          workerFilters.skills.length > 0 || 
                          workerFilters.statuses.length > 0 ||
                          workerFilters.hasConflict

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

// ============================================================================
// ACTIVE TASKS SECTION FOR WORKER DETAIL
// ============================================================================

/**
 * Load and render active tasks for a worker
 * @param {string} workerId - Worker ID
 * @returns {Promise<string>} HTML string for active tasks section
 */
async function loadWorkerActiveTasks(workerId) {
  try {
    const { getWorkerPortalTasks } = await import('./mesApi.js');
    const result = await getWorkerPortalTasks(workerId);
    const tasks = result.tasks || [];
    
    if (tasks.length === 0) {
      return `
        <div style="text-align: center; padding: 20px; color: rgb(107, 114, 128); font-style: italic; font-size: 12px;">
          Aktif görev bulunmuyor
        </div>
      `;
    }
    
    // Group tasks by status
    const inProgress = tasks.filter(t => t.status === 'in_progress');
    const ready = tasks.filter(t => t.status === 'ready');
    const paused = tasks.filter(t => t.status === 'paused');
    const pending = tasks.filter(t => t.status === 'pending');
    
    const taskRows = tasks.map(task => {
      const statusBadge = getTaskStatusBadge(task.status);
      const prerequisitesHtml = generatePrerequisitesIcons(task.prerequisites);
      
      return `
        <tr style="border-bottom: 1px solid rgb(229, 231, 235);">
          <td style="padding: 8px; font-size: 12px;">${statusBadge}</td>
          <td style="padding: 8px; font-size: 12px; font-weight: 500;">${escapeHtml(task.planId || '-')}</td>
          <td style="padding: 8px; font-size: 12px;">${escapeHtml(task.name || task.operationName || '-')}</td>
          <td style="padding: 8px; font-size: 12px;">${escapeHtml(task.stationName || '-')}</td>
          <td style="padding: 8px; font-size: 11px;">${prerequisitesHtml}</td>
        </tr>
      `;
    }).join('');
    
    return `
      <div style="margin-bottom: 12px; display: flex; gap: 8px;">
        <div style="padding: 6px 10px; background: #dbeafe; border-radius: 4px; font-size: 11px; color: #1e40af; font-weight: 600;">
          Devam Eden: ${inProgress.length}
        </div>
        <div style="padding: 6px 10px; background: #d1fae5; border-radius: 4px; font-size: 11px; color: #065f46; font-weight: 600;">
          Hazır: ${ready.length}
        </div>
        <div style="padding: 6px 10px; background: #fed7aa; border-radius: 4px; font-size: 11px; color: #92400e; font-weight: 600;">
          Duraklatıldı: ${paused.length}
        </div>
        <div style="padding: 6px 10px; background: #f3f4f6; border-radius: 4px; font-size: 11px; color: #6b7280; font-weight: 600;">
          Bekliyor: ${pending.length}
        </div>
      </div>
      <div style="overflow-x: auto;">
        <table style="width: 100%; border-collapse: collapse;">
          <thead>
            <tr style="background: rgb(249, 250, 251); border-bottom: 2px solid rgb(229, 231, 235);">
              <th style="padding: 8px; text-align: left; font-size: 11px; font-weight: 600; color: rgb(107, 114, 128);">DURUM</th>
              <th style="padding: 8px; text-align: left; font-size: 11px; font-weight: 600; color: rgb(107, 114, 128);">PLAN</th>
              <th style="padding: 8px; text-align: left; font-size: 11px; font-weight: 600; color: rgb(107, 114, 128);">GÖREV</th>
              <th style="padding: 8px; text-align: left; font-size: 11px; font-weight: 600; color: rgb(107, 114, 128);">İSTASYON</th>
              <th style="padding: 8px; text-align: left; font-size: 11px; font-weight: 600; color: rgb(107, 114, 128);">ÖN KOŞULLAR</th>
            </tr>
          </thead>
          <tbody>
            ${taskRows}
          </tbody>
        </table>
      </div>
    `;
  } catch (err) {
    console.error('Failed to load active tasks:', err);
    return `
      <div style="text-align: center; padding: 20px; color: #ef4444; font-size: 12px;">
        Görevler yüklenemedi: ${err.message}
      </div>
    `;
  }
}

/**
 * Get status badge HTML for a task
 */
function getTaskStatusBadge(status) {
  const statusMap = {
    'pending': { label: 'Bekliyor', color: '#6b7280', bg: '#f3f4f6' },
    'ready': { label: 'Hazır', color: '#065f46', bg: '#d1fae5' },
    'blocked': { label: 'Bloke', color: '#991b1b', bg: '#fee2e2' },
    'in_progress': { label: 'Devam Ediyor', color: '#1e40af', bg: '#dbeafe' },
    'paused': { label: 'Duraklatıldı', color: '#92400e', bg: '#fed7aa' },
    'completed': { label: 'Tamamlandı', color: '#065f46', bg: '#d1fae5' }
  };
  
  const info = statusMap[status] || { label: status, color: '#6b7280', bg: '#f3f4f6' };
  
  return `<span style="padding: 2px 6px; background: ${info.bg}; color: ${info.color}; border-radius: 4px; font-size: 10px; font-weight: 600; white-space: nowrap;">${info.label}</span>`;
}

/**
 * Generate prerequisites icons
 */
function generatePrerequisitesIcons(prerequisites) {
  if (!prerequisites) return '-';
  
  const icons = [];
  
  if (prerequisites.predecessorsDone === false) {
    icons.push('<i class="fa-solid fa-clock" style="font-size: 14px; color: #f59e0b;" title="Önceki görevler bitmedi"></i>');
  }
  
  if (prerequisites.workerAvailable === false) {
    icons.push('<i class="fa-solid fa-hard-hat" style="font-size: 14px; color: #ef4444;" title="İşçi meşgul"></i>');
  }
  
  if (prerequisites.stationAvailable === false) {
    icons.push('<i class="fa-solid fa-industry" style="font-size: 14px; color: #ef4444;" title="İstasyon meşgul"></i>');
  }
  
  if (prerequisites.materialsReady === false) {
    icons.push('<i class="fa-solid fa-boxes-stacked" style="font-size: 14px; color: #ef4444;" title="Malzeme eksik"></i>');
  }
  
  if (icons.length === 0) {
    return '<i class="fa-solid fa-check-circle" style="color: #10b981; font-size: 14px;" title="Hazır"></i>';
  }
  
  return icons.join(' ');
}

// ============================================================================
// WORKER STATUS & ABSENCE HANDLERS (FAZ 1A-3)
// ============================================================================

/**
 * Handle employment status change (Active/Inactive only)
 */
window.handleEmploymentStatusChange = async function() {
  if (!selectedWorkerId) return;
  
  const statusSelect = document.getElementById('worker-employment-status');
  if (!statusSelect) return;
  
  const isActive = statusSelect.value === 'active';
  
  // Find worker in state
  const workerIndex = workersState.findIndex(w => w.id === selectedWorkerId);
  if (workerIndex === -1) {
    showErrorToast('İşçi bulunamadı');
    return;
  }
  
  // Update worker state
  const updatedWorker = { ...workersState[workerIndex] };
  updatedWorker.isActive = isActive;
  
  // If worker is being marked inactive, remove future absences (keep history)
  if (!isActive && updatedWorker.absences) {
    const now = new Date().toISOString().split('T')[0];
    updatedWorker.absences = updatedWorker.absences.filter(abs => abs.endDate < now);
  }
  
  workersState[workerIndex] = updatedWorker;
  
  try {
    await persistWorkers();
    showSuccessToast(isActive ? 'İşçi aktif olarak işaretlendi' : 'İşçi işten ayrılmış olarak işaretlendi');
    
    // Refresh UI
    await showWorkerDetail(selectedWorkerId);
    await renderWorkersTable();
  } catch (error) {
    console.error('Failed to update employment status:', error);
    showErrorToast('Durum güncellenemedi: ' + (error.message || 'Bilinmeyen hata'));
  }
};

/**
 * Open add absence form
 */
window.openAddAbsenceForm = function() {
  const form = document.getElementById('add-absence-form');
  if (form) {
    form.style.display = 'block';
    // Set default start date to today
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('new-absence-start').value = today;
  }
};

/**
 * Close add absence form
 */
window.closeAddAbsenceForm = function() {
  const form = document.getElementById('add-absence-form');
  if (form) {
    form.style.display = 'none';
    // Clear form
    document.getElementById('new-absence-start').value = '';
    document.getElementById('new-absence-end').value = '';
    document.getElementById('new-absence-type').value = 'vacation';
    document.getElementById('new-absence-reason').value = '';
  }
};

/**
 * Save new absence
 */
window.saveNewAbsence = async function() {
  if (!selectedWorkerId) {
    showWarningToast('İşçi seçili değil');
    return;
  }
  
  const startDate = document.getElementById('new-absence-start').value;
  const endDate = document.getElementById('new-absence-end').value;
  const type = document.getElementById('new-absence-type').value;
  const reason = document.getElementById('new-absence-reason').value;
  
  // Validation
  if (!startDate || !endDate) {
    showWarningToast('Başlangıç ve bitiş tarihleri gerekli');
    return;
  }
  
  if (new Date(endDate) < new Date(startDate)) {
    showWarningToast('Bitiş tarihi başlangıç tarihinden önce olamaz');
    return;
  }
  
  if (!reason.trim()) {
    showWarningToast('Lütfen bir sebep/açıklama girin');
    return;
  }
  
  // Find worker in state
  const workerIndex = workersState.findIndex(w => w.id === selectedWorkerId);
  if (workerIndex === -1) {
    showErrorToast('İşçi bulunamadı');
    return;
  }
  
  // Create new absence
  const updatedWorker = { ...workersState[workerIndex] };
  if (!updatedWorker.absences) {
    updatedWorker.absences = [];
  }
  
  const absenceId = `abs-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const newAbsence = {
    id: absenceId,
    type: type,
    startDate: startDate,
    endDate: endDate,
    reason: reason.trim(),
    createdAt: new Date().toISOString(),
    createdBy: 'current-user' // TODO: Replace with actual user ID
  };
  
  updatedWorker.absences.push(newAbsence);
  workersState[workerIndex] = updatedWorker;
  
  try {
    await persistWorkers();
    showSuccessToast('İzin kaydı eklendi');
    
    // Close form and refresh
    closeAddAbsenceForm();
    await showWorkerDetail(selectedWorkerId);
    await renderWorkersTable();
  } catch (error) {
    console.error('Failed to add absence:', error);
    showErrorToast('İzin kaydı eklenemedi: ' + (error.message || 'Bilinmeyen hata'));
  }
};

/**
 * Delete an absence record from worker
 */
window.deleteAbsence = async function(absenceId) {
  if (!selectedWorkerId) {
    showWarningToast('İşçi seçili değil');
    return;
  }
  
  if (!confirm('Bu izin kaydını silmek istediğinizden emin misiniz?')) {
    return;
  }
  
  try {
    // Find worker in state
    const workerIndex = workersState.findIndex(w => w.id === selectedWorkerId);
    if (workerIndex === -1) {
      showErrorToast('İşçi bulunamadı');
      return;
    }
    
    // Update worker state - remove absence
    const updatedWorker = { ...workersState[workerIndex] };
    updatedWorker.absences = (updatedWorker.absences || []).filter(abs => abs.id !== absenceId);
    
    workersState[workerIndex] = updatedWorker;
    
    // Persist to backend
    await persistWorkers();
    
    showSuccessToast('İzin kaydı silindi');
    
    // Refresh worker detail panel
    await showWorkerDetail(selectedWorkerId);
    
    // Refresh table
    await renderWorkersTable();
  } catch (error) {
    console.error('Failed to delete absence:', error);
    showErrorToast('İzin kaydı silinemedi: ' + (error.message || 'Bilinmeyen hata'));
  }
};

// Update worker schedule status badge (Mesai Durumu) based on current time
function updateWorkerScheduleStatus(worker) {
  const statusElement = document.getElementById('worker-schedule-status');
  if (!statusElement) return;
  
  // Get worker's schedule
  const schedule = worker.personalSchedule;
  if (!schedule) {
    statusElement.innerHTML = '❓ Program tanımlanmamış';
    statusElement.style.background = 'rgb(254, 243, 199)';
    statusElement.style.color = 'rgb(146, 64, 14)';
    return;
  }
  
  console.log('🔍 Worker Schedule Debug:', {
    workerId: worker.id,
    workerName: worker.name,
    scheduleMode: schedule.mode,
    shiftNo: schedule.shiftNo,
    hasBlocks: !!schedule.blocks
  });
  
  // Determine blocks for current day
  let blocks = [];
  const now = new Date();
  const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const currentDay = dayNames[now.getDay()];
  
  if (schedule.mode === 'company') {
    // Load from company settings
    const companySettings = safeLoadCompanyTimeSettings();
    console.log('🏢 Company Settings:', companySettings ? 'Loaded' : 'NULL', {
      hasShifts: companySettings?.shifts ? `${companySettings.shifts.length} shifts` : 'No shifts',
      workType: companySettings?.workType
    });
    
    if (companySettings) {
      const shiftNo = schedule.shiftNo || '1';
      blocks = getShiftBlocksForDay(companySettings, currentDay, shiftNo) || [];
      console.log(`📅 Shift ${shiftNo} blocks for ${currentDay}:`, blocks);
    } else {
      console.warn('⚠️ Company settings not found in sessionStorage or localStorage');
    }
  } else if (schedule.mode === 'personal') {
    // Load from personal blocks
    blocks = schedule.blocks?.[currentDay] || [];
    console.log(`👤 Personal blocks for ${currentDay}:`, blocks);
  }
  
  // Filter only work/break blocks (ignore rest)
  blocks = blocks.filter(b => b && (b.type === 'work' || b.type === 'break'));
  
  if (blocks.length === 0) {
    console.log('🏠 No work blocks today');
    statusElement.innerHTML = '🏠 Bugün mesai yok';
    statusElement.style.background = 'rgb(243, 244, 246)';
    statusElement.style.color = 'rgb(107, 114, 128)';
    return;
  }
  
  // Check current time against blocks
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  console.log(`🕐 Current time: ${now.getHours()}:${now.getMinutes()} (${currentMinutes} minutes)`);
  
  for (const block of blocks) {
    // Handle different block formats (start/end vs startTime/endTime)
    if (!block) continue;
    
    const startStr = block.start || block.startTime;
    const endStr = block.end || block.endTime;
    
    if (!startStr || !endStr) continue;
    
    const [startHour, startMin] = startStr.split(':').map(Number);
    const [endHour, endMin] = endStr.split(':').map(Number);
    const blockStart = startHour * 60 + startMin;
    const blockEnd = endHour * 60 + endMin;
    
    console.log(`⏰ Checking block: ${startStr}-${endStr} (${blockStart}-${blockEnd} min) type=${block.type}`);
    
    if (currentMinutes >= blockStart && currentMinutes < blockEnd) {
      // Currently in this block
      if (block.type === 'work') {
        console.log('✅ Currently working');
        statusElement.innerHTML = '🕒 Şu an mesaide';
        statusElement.style.background = 'rgba(34, 197, 94, 0.15)';
        statusElement.style.color = 'rgb(6, 95, 70)';
      } else if (block.type === 'break') {
        console.log('☕ Currently on break');
        statusElement.innerHTML = '☕ Şu an mola saatinde';
        statusElement.style.background = 'rgba(251, 191, 36, 0.15)';
        statusElement.style.color = 'rgb(146, 64, 14)';
      }
      return;
    }
  }
  
  // Not currently in any block
  console.log('🌙 Outside work hours');
  statusElement.innerHTML = '🏠 Mesai dışında';
  statusElement.style.background = 'rgb(243, 244, 246)';
  statusElement.style.color = 'rgb(107, 114, 128)';
}

// No default export; named exports only
