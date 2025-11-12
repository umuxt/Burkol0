// Operations management UI backed by backend API
import { getOperations, saveOperations, normalizeOperation, genId, getMasterData, addSkill, addOperationType, updateOperationType, deleteOperationType, getWorkers } from './mesApi.js'
import { showToast } from './ui.js'

let operationsState = []
let editingOperationId = null
let selectedOperationId = null
let operationFilters = { query: '', skills: [] }

function computeFilteredOperations(list = operationsState, filters = operationFilters) {
  const source = Array.isArray(list) ? list : []
  const q = (filters.query || '').toLowerCase().trim()
  const selectedSkills = new Set(filters.skills || [])
  return source.filter(op => {
    const name = (op.name || '').toLowerCase()
    const type = (op.type || '').toLowerCase()
    const code = (op.semiOutputCode || '').toLowerCase()
    const matchesQuery = !q || name.includes(q) || type.includes(q) || code.includes(q)
    const skills = Array.isArray(op.skills)
      ? op.skills
      : (typeof op.skills === 'string' ? op.skills.split(',').map(s => s.trim()).filter(Boolean) : [])
    const matchesSkills = selectedSkills.size === 0 || Array.from(selectedSkills).every(skill => skills.includes(skill))
    return matchesQuery && matchesSkills
  })
}

export async function initializeOperationsUI() {
  initOperationFilters()
  await loadOperationsAndRender()
}

async function loadOperationsAndRender() {
  const container = document.getElementById('operations-list-container')
  if (container) container.innerHTML = `<div style="padding:12px; color:#888;">Loading operations...</div>`
  const body = document.getElementById('operations-table-body')
  if (body) {
    body.innerHTML = buildOperationsRows([], 'Loading operations...')
  }
  try {
    operationsState = await getOperations(true)
    renderOperations()
  } catch (e) {
    console.error('Operations load error:', e)
    if (container) container.innerHTML = `<div style="padding:12px; color:#ef4444;">Operations yüklenemedi.</div>`
    showToast('Operations yüklenemedi', 'error')
  }
}

function renderOperations() {
  const body = document.getElementById('operations-table-body')
  if (body) {
    const filtered = computeFilteredOperations()
    const hasFilters = Boolean((operationFilters.query || '').trim()) || (operationFilters.skills || []).length > 0
    const hasAnyOperations = (operationsState || []).length > 0
    const emptyMessage = hasFilters && hasAnyOperations
      ? 'No operations match the current filters.'
      : 'No operations yet. Add your first operation.'
    body.innerHTML = buildOperationsRows(filtered, emptyMessage)
    highlightSelectedOperationRow()
    return
  }
  // Legacy container fallback
  const container = document.getElementById('operations-list-container')
  if (!container) return
  if (!operationsState.length) {
    container.innerHTML = `<div style="padding:12px; color:#666;">No operations yet. Add your first operation.</div>`
    return
  }
  container.innerHTML = `
    <table class="table">
      <thead>
        <tr><th>Name</th><th>Type</th><th>Output Code</th><th>Fire (%)</th><th>Skills</th><th>Actions</th></tr>
      </thead>
      <tbody>
        ${buildOperationsRows(operationsState, 'No operations yet. Add your first operation.', { legacy: true })}
      </tbody>
    </table>`
}

function buildOperationsRows(list, emptyText, options = {}) {
  const items = Array.isArray(list) ? list : []
  const { legacy = false } = options
  const columnCount = legacy ? 6 : 5
  if (!items.length) {
    if (legacy) {
      return `<tr><td colspan="${columnCount}" style="padding:8px; color:#666;">${escapeHtml(emptyText)}</td></tr>`
    }
    return `
      <tr class="mes-table-row is-empty">
        <td colspan="${columnCount}" class="mes-empty-cell text-center"><em>${escapeHtml(emptyText)}</em></td>
      </tr>`
  }

  return items.map(op => {
    const typeName = (op.type || '').toString().trim()
    const typeMarkup = typeName
      ? (legacy
        ? escapeHtml(typeName)
        : `<span class="mes-tag">${escapeHtml(typeName)}</span>`)
      : (legacy
        ? 'General'
        : '<span class="mes-muted-text">General</span>')

    const outputCode = (op.semiOutputCode || '').toString().trim()
    const outputMarkup = outputCode
      ? (legacy
        ? escapeHtml(outputCode)
        : `<span class="mes-code-text">${escapeHtml(outputCode)}</span>`)
      : (legacy
        ? '-'
        : '<span class="mes-muted-text">-</span>')

    const skills = Array.isArray(op.skills)
      ? op.skills
      : (typeof op.skills === 'string'
        ? op.skills.split(',').map(skill => skill.trim()).filter(Boolean)
        : [])
    const skillsMarkup = skills.length
      ? (legacy
        ? skills.map(s => `<span class="badge badge-outline" style="margin-right:4px;">${escapeHtml(s)}</span>`).join('')
        : `<div class="mes-tag-group">${skills.map(skill => `<span class="mes-tag">${escapeHtml(skill)}</span>`).join('')}</div>`)
      : (legacy
        ? '-'
        : '<span class="mes-muted-text">-</span>')

    const defectValue = formatDefectRate(op.expectedDefectRate)
    const defectMarkup = legacy
      ? escapeHtml(defectValue)
      : escapeHtml(defectValue)
    const actionMarkup = legacy
      ? `
        <td>
          <button onclick="editOperation('${op.id}')" style="padding:4px 8px; margin-right:4px; border:1px solid var(--border); background:white; border-radius:4px; cursor:pointer;">Edit</button>
          <button onclick="deleteOperation('${op.id}')" style="padding:4px 8px; border:1px solid #ef4444; background:white; color:#ef4444; border-radius:4px; cursor:pointer;">Delete</button>
        </td>`
      : ''

    const rowAttrs = legacy
      ? ''
      : ` class="mes-table-row" data-operation-id="${op.id}" onclick="(async () => await showOperationDetail('${op.id}'))()"`

    return `
      <tr${rowAttrs}>
        <td>${escapeHtml(op.name || 'Unnamed Operation')}</td>
        <td>${typeMarkup}</td>
  <td class="text-center">${outputMarkup}</td>
        <td class="text-center">${defectMarkup}</td>
        <td>${skillsMarkup}</td>
        ${actionMarkup}
      </tr>`
  }).join('')
}

function formatDefectRate(value) {
  const num = Number(value)
  if (!Number.isFinite(num) || num < 0 || num === 0) return '—'
  const normalized = Math.max(0, num)
  const formatted = normalized.toFixed(2).replace(/\.00$/, '').replace(/0$/, '')
  return `${formatted}%`
}

function highlightSelectedOperationRow() {
  const rows = document.querySelectorAll('#operations-table-body tr')
  rows.forEach(row => {
    row.style.backgroundColor = ''
  })
  if (!selectedOperationId) return
  const selectedRow = document.querySelector(`#operations-table-body tr[data-operation-id="${selectedOperationId}"]`)
  if (selectedRow) {
    selectedRow.style.backgroundColor = 'rgb(239, 246, 255)'
  }
}

export function openAddOperationModal() {
  editingOperationId = null
  openOperationModal()
}

export function editOperation(id) {
  editingOperationId = id
  const op = operationsState.find(x => x.id === id)
  openOperationModal(op)
}

// Detail panel helpers (safe no-ops if panel not present)
export async function showOperationDetail(id) {
  selectedOperationId = id
  const op = operationsState.find(o => o.id === id)
  if (!op) return
  const panel = document.getElementById('operation-detail-panel')
  const content = document.getElementById('operation-detail-content')
  if (!panel || !content) return
  panel.style.display = 'block'
  highlightSelectedOperationRow()
  const defectRate = formatDefectRate(op.expectedDefectRate)
  let supervisorHtml = ''
  try {
    if (op.supervisorId) {
      const workers = await getWorkers()
      const w = workers.find(x => x.id === op.supervisorId)
      if (w) {
        supervisorHtml = `
          <div style="display:flex; gap:8px; align-items:center; margin-bottom:8px;"><span style="min-width:120px; font-weight:600; font-size:12px; color: rgb(55,65,81);">Şef:</span><span style="font-size:12px; color: rgb(17,24,39);">${escapeHtml(w.name || '')}</span></div>
          <div style="display:flex; gap:8px; align-items:center; margin-bottom:8px;"><span style="min-width:120px; font-weight:600; font-size:12px; color: rgb(55,65,81);">E-posta:</span><span style="font-size:12px; color: rgb(17,24,39);">${escapeHtml(w.email || '-')}</span></div>
          <div style="display:flex; gap:8px; align-items:center; margin-bottom:8px;"><span style="min-width:120px; font-weight:600; font-size:12px; color: rgb(55,65,81);">Telefon:</span><span style="font-size:12px; color: rgb(17,24,39);">${escapeHtml(w.phone || '-')}</span></div>`
      } else {
        supervisorHtml = `<div style="display:flex; gap:8px; align-items:center; margin-bottom:8px;"><span style="min-width:120px; font-weight:600; font-size:12px; color: rgb(55,65,81);">Şef:</span><span style="font-size:12px; color: rgb(107,114,128);">-</span></div>`
      }
    } else {
      supervisorHtml = `<div style="display:flex; gap:8px; align-items:center; margin-bottom:8px;"><span style="min-width:120px; font-weight:600; font-size:12px; color: rgb(55,65,81);">Şef:</span><span style="font-size:12px; color: rgb(107,114,128);">-</span></div>`
    }
  } catch {
    supervisorHtml = `<div style="display:flex; gap:8px; align-items:center; margin-bottom:8px;"><span style="min-width:120px; font-weight:600; font-size:12px; color: rgb(55,65,81);">Şef:</span><span style="font-size:12px; color: rgb(107,114,128);">-</span></div>`
  }

  content.innerHTML = `
    <div style="margin-bottom: 16px; padding: 12px; background: white; border-radius: 6px; border: 1px solid rgb(229, 231, 235);">
      <h3 style="margin: 0 0 12px; font-size: 14px; font-weight: 600; color: rgb(17, 24, 39); border-bottom: 1px solid rgb(229, 231, 235); padding-bottom: 6px;">Temel Bilgiler</h3>
      <div style="display:flex; gap:8px; align-items:center; margin-bottom:8px;"><span style="min-width:120px; font-weight:600; font-size:12px; color: rgb(55,65,81);">Operasyon Adı:</span><span style="font-size:12px; color: rgb(17,24,39);">${escapeHtml(op.name||'')}</span></div>
      <div style="display:flex; gap:8px; align-items:center; margin-bottom:8px;"><span style="min-width:120px; font-weight:600; font-size:12px; color: rgb(55,65,81);">Tür:</span><span style="font-size:12px; color: rgb(17,24,39);">${escapeHtml(op.type||'General')}</span></div>
      <div style="display:flex; gap:8px; align-items:center; margin-bottom:8px;"><span style="min-width:120px; font-weight:600; font-size:12px; color: rgb(55,65,81);">Yarı Mamül Kodu:</span><span style="font-size:12px; color: rgb(17,24,39);">${escapeHtml(op.semiOutputCode || '-')}</span></div>
  <div style="display:flex; gap:8px; align-items:center; margin-bottom:8px;"><span style="min-width:120px; font-weight:600; font-size:12px; color: rgb(55,65,81);">Yüzdelik Fire Oranı:</span><span style="font-size:12px; color: rgb(17,24,39);">${defectRate}</span></div>
      ${supervisorHtml}
      
    </div>
    <div style="margin-bottom: 0; padding: 12px; background: white; border-radius: 6px; border: 1px solid rgb(229, 231, 235);">
      <h3 style="margin: 0 0 12px; font-size: 14px; font-weight: 600; color: rgb(17, 24, 39); border-bottom: 1px solid rgb(229, 231, 235); padding-bottom: 6px;">Gerekli Yetenekler</h3>
      <div style="display:flex; flex-wrap:wrap; gap:6px;">${(Array.isArray(op.skills)?op.skills:[]).map(s => `<span style=\"background-color: rgb(243, 244, 246); color: rgb(107, 114, 128); padding: 2px 6px; border-radius: 4px; font-size: 11px; font-weight: 500;\">${escapeHtml(s)}</span>`).join('') || '<span style="font-size:12px; color: rgb(107,114,128);">-</span>'}</div>
    </div>
  `
}

export function closeOperationDetail() {
  const panel = document.getElementById('operation-detail-panel')
  if (panel) panel.style.display = 'none'
  selectedOperationId = null
  highlightSelectedOperationRow()
}

// Actions from detail panel
export function editOperationFromDetail() {
  if (selectedOperationId) editOperation(selectedOperationId)
}

export function deleteOperationFromDetail() {
  if (selectedOperationId) deleteOperation(selectedOperationId)
}

export function closeOperationModal(ev) {
  const overlay = document.getElementById('operation-modal')
  if (!overlay) return
  if (!ev || ev.target === overlay || ev === true) overlay.style.display = 'none'
}

export async function saveOperation() {
  const name = document.getElementById('operation-name')?.value?.trim()
  const type = document.getElementById('operation-type')?.value?.trim() || 'General'
  const rawCode = document.getElementById('operation-output-code')?.value || ''
  const rawDefectRate = document.getElementById('operation-defect-rate')?.value || ''
  const letters = rawCode.replace(/[^A-Za-z]/g, '')
  const semiCode = letters ? (letters[0].toUpperCase() + (letters[1] ? letters[1].toLowerCase() : '')).slice(0,2) : ''
  // Parse defect rate
  let expectedDefectRate = 0
  if (rawDefectRate) {
    const parsed = parseFloat(rawDefectRate)
    if (isNaN(parsed) || parsed < 0) {
      showToast('Fire oranı geçerli bir pozitif sayı olmalıdır', 'warning')
      return
    }
    expectedDefectRate = parsed
  }
  const supervisorId = document.getElementById('operation-supervisor')?.value || ''
  // Read skills from modern UI hidden field; fallback to any legacy checkboxes
  let skills = (document.getElementById('operation-skills-selected')?.value || '')
    .split('|')
    .filter(Boolean)
  if (skills.length === 0) {
    skills = Array.from(document.querySelectorAll('#operation-skills-box input[type="checkbox"]:checked')).map(cb => cb.value)
  }
  
  if (!name) { showToast('Operation name required', 'warning'); return }
  if (!semiCode) { showToast('Yarı mamül çıktı kodu gerekli (örn. A, Qc)', 'warning'); return }
  if (!/^[A-Z]([a-z])?$/.test(semiCode)) { showToast('Kod 1-2 harf olmalı: İlk büyük, ikinci küçük (örn. A, Qc)', 'warning'); return }
  if (semiCode === 'M') { showToast("'M' tek başına kullanılamaz. İki harfli kullanın (örn. Mq) veya farklı bir kod girin.", 'warning'); return }
  const exists = operationsState.some(o => {
    if (editingOperationId && o.id === editingOperationId) return false
    const c = (o.semiOutputCode || '').toString()
    const l = c.replace(/[^A-Za-z]/g, '')
    const n = l ? (l[0].toUpperCase() + (l[1] ? l[1].toLowerCase() : '')).slice(0,2) : ''
    return n && n === semiCode
  })
  if (exists) { showToast('Bu çıktı kodu başka bir operasyonda kullanılıyor', 'warning'); return }
  if (skills.length === 0) { showToast('Select at least one skill', 'warning'); return }

  const op = normalizeOperation({
    id: editingOperationId || genId('op-'),
    name,
    type,
    supervisorId: supervisorId || null,
    semiOutputCode: semiCode,
    expectedDefectRate,
    skills,
    
    active: true
  })
  const idx = operationsState.findIndex(o => o.id === op.id)
  if (idx >= 0) operationsState[idx] = { ...operationsState[idx], ...op }
  else operationsState.push(op)

  try {
    await saveOperations(operationsState)
    closeOperationModal(true)
    renderOperations()
    showToast('Operation saved', 'success')
  } catch (e) {
    console.error('Operation save error:', e)
    showToast('Operation could not be saved', 'error')
  }
}

export async function deleteOperation(id) {
  if (!confirm('Delete this operation?')) return
  operationsState = operationsState.filter(o => o.id !== id)
  try {
    await saveOperations(operationsState)
    renderOperations()
    showToast('Operation deleted', 'success')
  } catch (e) {
    console.error('Operation delete error:', e)
    showToast('Operation could not be deleted', 'error')
  }
}

function openOperationModal(op = null) {
  const overlay = document.getElementById('operation-modal')
  if (!overlay) return
  document.getElementById('operation-modal-title').textContent = op ? 'Edit Operation' : 'Add New Operation'
  document.getElementById('operation-name').value = op?.name || ''
  document.getElementById('operation-type').value = op?.type || ''
  const codeEl = document.getElementById('operation-output-code')
  if (codeEl) {
    const c = (op?.semiOutputCode || '').toString()
    const l = c.replace(/[^A-Za-z]/g, '')
    codeEl.value = l ? (l[0].toUpperCase() + (l[1] ? l[1].toLowerCase() : '')).slice(0,2) : ''
  }
  const defectRateEl = document.getElementById('operation-defect-rate')
  if (defectRateEl) {
    defectRateEl.value = op?.expectedDefectRate || 0
  }
  // Removed time input - duration will be station-specific
  
  overlay.style.display = 'block'
  // for skill selection, store selected internally and render
  const hidden = document.getElementById('operation-skills-selected') || (function(){ const h = document.createElement('input'); h.type='hidden'; h.id='operation-skills-selected'; document.getElementById('operation-modal').appendChild(h); return h })()
  hidden.value = Array.isArray(op?.skills) ? op.skills.join('|') : ''
  setTimeout(populateOperationSkillsBox, 0)
  setTimeout(initializeOperationTypeDropdown, 0)
  // Inject supervisor select block dynamically (keeps views.js unchanged)
  try {
    const existingSupervisor = document.getElementById('operation-supervisor')
    if (!existingSupervisor) {
      const outputCodeEl = document.getElementById('operation-output-code')
      const outputDetail = outputCodeEl && outputCodeEl.closest('.detail-item')
      if (outputDetail && outputDetail.parentElement) {
        const supervisorBlock = `
          <div class="detail-item" style="display: flex; align-items: center; margin-bottom: 8px;">
            <span class="detail-label" style="font-weight: 600; font-size: 12px; color: rgb(55, 65, 81); min-width: 120px; margin-right: 8px;">Şef (Opsiyonel):</span>
            <select id="operation-supervisor" style="flex: 1 1 0%; padding: 6px 8px; border: 1px solid rgb(209, 213, 219); border-radius: 4px; font-size: 12px; background: white; min-width: 200px;">
              <option value="">— Şef seçilmedi —</option>
            </select>
          </div>`
        outputDetail.insertAdjacentHTML('beforebegin', supervisorBlock)
      }
    }
  } catch {}
  setTimeout(() => populateOperationSupervisorSelect(op?.supervisorId || ''), 0)
}

async function populateOperationSkillsBox() {
  const box = document.getElementById('operation-skills-box')
  if (!box) return
  box.innerHTML = '<div style="color:#888;">Loading skills...</div>'
  try {
    const md = await getMasterData()
    const selected = new Set(
      (document.getElementById('operation-skills-selected')?.value || '')
        .split('|').filter(Boolean)
    )
    
    // Create modern skills interface similar to worker skills
    box.innerHTML = `
      <div style="margin-bottom: 16px; padding: 12px; background: white; border-radius: 6px; border: 1px solid var(--border);">
        <h3 style="margin: 0 0 12px; font-size: 14px; font-weight: 600; color: rgb(17, 24, 39); border-bottom: 1px solid var(--border); padding-bottom: 6px;">Yetenekler</h3>
        <div class="detail-item" style="display: block;">
          <select id="operation-skills" multiple style="display: none;"></select>
          <div class="modern-skills-interface" style="background: white; border: 1px solid var(--border); border-radius: 6px; overflow: hidden;">
            <div class="selected-skills-header" style="padding: 8px 12px; background: rgb(248, 249, 250); border-bottom: 1px solid var(--border); font-weight: 500; font-size: 13px; color: var(--foreground);">
              ${selected.size > 0 ? `${selected.size} Skill Seçili` : 'Seçili Skill Yok'}
            </div>
            <div class="selected-skills-display" style="padding: 8px 12px; background: white; border-bottom: 1px solid var(--border); min-height: 20px; font-size: 12px;">
              ${selected.size > 0 ? 
                Array.from(selected).map(skill => `<span style="display: inline-block; padding: 2px 6px; margin: 2px; background: rgb(248, 249, 250); border: 1px solid var(--border); border-radius: 4px; font-size: 11px;">${escapeHtml(skill)}</span>`).join('') :
                '<span style="color: var(--muted-foreground); font-style: italic;">Henüz skill seçilmedi</span>'
              }
            </div>
            <input type="text" placeholder="Skill arayın..." class="skills-search" id="operation-skills-search" style="width: 100%; padding: 8px 12px; border: none; border-bottom: 1px solid var(--border); outline: none; font-size: 14px; box-sizing: border-box;">
            <div class="skills-grid" style="max-height: 200px; overflow-y: auto; padding: 8px; display: grid; grid-template-columns: repeat(2, minmax(0px, 1fr)); gap: 6px;" id="operation-skills-grid"></div>
          </div>
        </div>
      </div>`
    
    // Populate skills grid
    const grid = box.querySelector('#operation-skills-grid')
    const searchInput = box.querySelector('#operation-skills-search')
    
    function renderSkills(filteredSkills = md.skills) {
      grid.innerHTML = filteredSkills.map(s => {
        const isSelected = selected.has(s.name)
        return `
          <div class="skill-card" data-skill="${escapeHtml(s.name)}" style="
            padding: 4px 6px; 
            border: 1px solid ${isSelected ? 'var(--primary)' : 'var(--border)'}; 
            border-radius: 4px; 
            cursor: pointer; 
            transition: 0.2s; 
            background: ${isSelected ? 'rgb(248, 249, 250)' : 'white'}; 
            color: var(--foreground); 
            font-weight: 400; 
            font-size: 12px; 
            text-align: center;
          ">
            <div style="display: flex; align-items: center; justify-content: space-between;">
              <span>${escapeHtml(s.name)}</span>
            </div>
          </div>`
      }).join('')
      
      // Add click handlers
      grid.querySelectorAll('.skill-card').forEach(card => {
        card.onclick = () => {
          const skillName = card.dataset.skill
          const hidden = document.getElementById('operation-skills-selected')
          const parts = (hidden?.value || '').split('|').filter(Boolean)
          
          if (selected.has(skillName)) {
            selected.delete(skillName)
            const index = parts.indexOf(skillName)
            if (index > -1) parts.splice(index, 1)
          } else {
            selected.add(skillName)
            parts.push(skillName)
          }
          
          hidden.value = Array.from(new Set(parts)).join('|')
          populateOperationSkillsBox() // Re-render
        }
      })
    }
    
    // Search functionality
    searchInput.oninput = (e) => {
      const query = e.target.value.toLowerCase()
      const filtered = md.skills.filter(s => s.name.toLowerCase().includes(query))
      renderSkills(filtered)
    }
    
    renderSkills()
    
    // Add new skill functionality via search
    searchInput.onkeydown = async (e) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        const name = searchInput.value.trim()
        if (!name) return
        
        // Check if skill already exists
        const existingSkill = md.skills.find(s => s.name.toLowerCase() === name.toLowerCase())
        if (existingSkill) {
          // Select existing skill
          const hidden = document.getElementById('operation-skills-selected')
          const parts = (hidden?.value || '').split('|').filter(Boolean)
          if (!selected.has(existingSkill.name)) {
            selected.add(existingSkill.name)
            parts.push(existingSkill.name)
            hidden.value = Array.from(new Set(parts)).join('|')
          }
          searchInput.value = ''
          populateOperationSkillsBox()
        } else {
          // Create new skill
          try {
            const created = await addSkill(name)
            const hidden = document.getElementById('operation-skills-selected')
            const parts = (hidden?.value || '').split('|').filter(Boolean)
            parts.push(created.name)
            hidden.value = Array.from(new Set(parts)).join('|')
            searchInput.value = ''
            await populateOperationSkillsBox()
          } catch (error) {
            console.error('Error adding skill:', error)
          }
        }
      }
    }
    
  } catch (e) {
    console.error('populateOperationSkillsBox error', e)
    box.innerHTML = '<div style="color:#ef4444;">Skills yüklenemedi</div>'
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

// Initialize Operations filters (search + skills)
function initOperationFilters() {
  const searchEl = document.getElementById('operation-filter-search')
  const clearAllBtn = document.getElementById('operation-filter-clear-all')
  const skillsBtn = document.getElementById('operation-filter-skills-btn')
  const skillsPanel = document.getElementById('operation-filter-skills-panel')
  const skillsList = document.getElementById('operation-filter-skills-list')
  const skillsSearch = document.getElementById('operation-filter-skills-search')
  const skillsClear = document.getElementById('operation-filter-skills-clear')
  const skillsHide = document.getElementById('operation-filter-skills-hide')
  const skillsCount = document.getElementById('operation-filter-skills-count')

  const applyFilters = () => {
    const body = document.getElementById('operations-table-body')
    if (!body) { renderOperations(); return }
    const filtered = computeFilteredOperations()
    const hasFilters = Boolean((operationFilters.query || '').trim()) || (operationFilters.skills || []).length > 0
    const hasAnyOperations = (operationsState || []).length > 0
    const emptyMessage = hasFilters && hasAnyOperations
      ? 'No operations match the current filters.'
      : 'No operations yet. Add your first operation.'
    body.innerHTML = buildOperationsRows(filtered, emptyMessage)
    highlightSelectedOperationRow()
  }

  const updateClearAllVisibility = () => {
    const hasAny = Boolean((operationFilters.query||'').trim()) || (operationFilters.skills||[]).length > 0
    if (clearAllBtn) clearAllBtn.style.display = hasAny ? 'inline-block' : 'none'
  }
  const updateSkillsUI = () => {
    if (skillsCount) skillsCount.textContent = operationFilters.skills.length ? `(${operationFilters.skills.length})` : ''
  }

  if (searchEl) {
    searchEl.addEventListener('input', () => {
      operationFilters.query = searchEl.value || ''
      applyFilters()
      updateClearAllVisibility()
    })
  }
  if (skillsBtn && skillsPanel) {
    skillsBtn.addEventListener('click', () => {
      const visible = skillsPanel.style.display === 'block'
      skillsPanel.style.display = visible ? 'none' : 'block'
    })
  }
  if (skillsHide && skillsPanel) skillsHide.addEventListener('click', () => skillsPanel.style.display = 'none')
  if (skillsClear) skillsClear.addEventListener('click', () => {
    operationFilters.skills = []
    updateSkillsUI()
    applyFilters()
    updateClearAllVisibility()
  })

  // Populate skills list from master data
  getMasterData().then(md => {
    if (!skillsList) return
    const allSkills = (md.skills || []).map(s => s.name)
    const renderList = (query = '') => {
      const q = (query||'').toLowerCase()
      skillsList.innerHTML = allSkills.filter(s => !q || s.toLowerCase().includes(q)).map(s => {
        const checked = operationFilters.skills.includes(s) ? 'checked' : ''
        return `<label><input type=\"checkbox\" value=\"${escapeHtml(s)}\" ${checked}> <span>${escapeHtml(s)}</span></label>`
      }).join('')
      skillsList.querySelectorAll('input[type=\"checkbox\"]').forEach(cb => {
        cb.addEventListener('change', () => {
          const val = cb.value
          if (cb.checked) {
            if (!operationFilters.skills.includes(val)) operationFilters.skills.push(val)
          } else {
            operationFilters.skills = operationFilters.skills.filter(x => x !== val)
          }
          updateSkillsUI()
          applyFilters()
          updateClearAllVisibility()
        })
      })
    }
    renderList()
    if (skillsSearch) skillsSearch.addEventListener('input', () => renderList(skillsSearch.value))
  }).catch(() => {})

  if (clearAllBtn) clearAllBtn.addEventListener('click', () => {
    operationFilters = { query: '', skills: [] }
    if (searchEl) searchEl.value = ''
    updateSkillsUI()
    applyFilters()
    updateClearAllVisibility()
  })
}

async function populateOperationSupervisorSelect(currentId = '') {
  const select = document.getElementById('operation-supervisor')
  if (!select) return
  select.disabled = true
  select.innerHTML = '<option value="">Loading...</option>'
  try {
    const workers = await getWorkers(true)
    const options = [
      '<option value="">— Şef seçilmedi —</option>',
      ...workers.map(w => `<option value="${escapeHtml(w.id)}">${escapeHtml(w.name || w.id)}</option>`)
    ].join('')
    select.innerHTML = options
    if (currentId) select.value = currentId
  } catch (e) {
    console.error('load workers failed', e)
    select.innerHTML = '<option value="">— Şef seçilmedi —</option>'
  } finally {
    select.disabled = false
  }
}

// Operation Types Modal Management
export function openOperationTypesModal() {
  // Create modal HTML
  const modalHTML = `
    <div id="operation-types-modal" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); z-index: 10000; display: flex; align-items: center; justify-content: center;">
      <div style="background: white; border-radius: 8px; width: 90%; max-width: 600px; max-height: 80vh; overflow: hidden; box-shadow: 0 20px 40px rgba(0,0,0,0.15);">
        <div style="padding: 20px; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center;">
          <h2 style="margin: 0; font-size: 18px; font-weight: 600;">Operasyon Tipleri Yönetimi</h2>
          <button onclick="closeOperationTypesModal()" style="background: none; border: none; font-size: 24px; cursor: pointer; padding: 0; color: var(--muted-foreground);">×</button>
        </div>
        <div style="padding: 20px; max-height: 50vh; overflow-y: auto;">
          <div style="margin-bottom: 16px;">
            <div style="display: flex; gap: 8px; align-items: stretch;">
              <input id="new-operation-type-input" type="text" placeholder="Yeni operasyon tipi adı..." style="flex: 1; padding: 8px 12px; border: 1px solid var(--border); border-radius: 6px;">
              <button onclick="addOperationTypeFromModal()" style="padding: 8px 16px; background: var(--primary); color: var(--primary-foreground); border: none; border-radius: 6px; cursor: pointer; font-weight: 500;">Ekle</button>
            </div>
          </div>
          <div id="operation-types-list" style="border: 1px solid var(--border); border-radius: 6px; background: white;">
            <div style="padding: 12px; color: var(--muted-foreground);">Yükleniyor...</div>
          </div>
        </div>
      </div>
    </div>
  `
  
  // Remove existing modal if any
  const existingModal = document.getElementById('operation-types-modal')
  if (existingModal) existingModal.remove()
  
  // Add modal to body
  document.body.insertAdjacentHTML('beforeend', modalHTML)
  
  // Load and render operation types
  loadOperationTypes()
  
  // Focus on input
  setTimeout(() => {
    const input = document.getElementById('new-operation-type-input')
    if (input) input.focus()
  }, 100)
  
  // Handle Enter key in input
  const input = document.getElementById('new-operation-type-input')
  if (input) {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        addOperationTypeFromModal()
      }
    })
  }
}

export function closeOperationTypesModal() {
  const modal = document.getElementById('operation-types-modal')
  if (modal) modal.remove()
}

async function loadOperationTypes() {
  const listContainer = document.getElementById('operation-types-list')
  if (!listContainer) return
  
  try {
    const masterData = await getMasterData(true) // Force refresh
    const operationTypes = masterData.operationTypes || []
    
    if (operationTypes.length === 0) {
      listContainer.innerHTML = `
        <div style="padding: 20px; text-align: center; color: var(--muted-foreground);">
          Henüz operasyon tipi eklenmemiş.
        </div>
      `
      return
    }
    
    listContainer.innerHTML = operationTypes.map(ot => `
      <div style="display: flex; align-items: center; padding: 12px; border-bottom: 1px solid var(--border); background: white;">
        <div style="flex: 1; font-weight: 500;">${escapeHtml(ot.name)}</div>
        <div style="display: flex; gap: 8px;">
          <button onclick="editOperationType('${ot.id}', '${escapeHtml(ot.name)}')" style="padding: 4px 8px; border: 1px solid var(--border); background: white; border-radius: 4px; cursor: pointer; font-size: 12px;"><i class="fa-solid fa-edit"></i> Düzenle</button>
          <button onclick="deleteOperationTypeConfirm('${ot.id}', '${escapeHtml(ot.name)}')" style="padding: 4px 8px; border: 1px solid #ef4444; background: white; color: #ef4444; border-radius: 4px; cursor: pointer; font-size: 12px;"><i class="fa-solid fa-trash"></i> Sil</button>
        </div>
      </div>
    `).join('')
  } catch (error) {
    console.error('Error loading operation types:', error)
    listContainer.innerHTML = `
      <div style="padding: 20px; text-align: center; color: #ef4444;">
        Operasyon tipleri yüklenirken hata oluştu.
      </div>
    `
  }
}

export async function addOperationTypeFromModal() {
  const input = document.getElementById('new-operation-type-input')
  if (!input) return
  
  const name = input.value.trim()
  if (!name) {
    showToast('Operasyon tipi adı gerekli', 'error')
    return
  }
  
  try {
    await addOperationType(name)
    input.value = ''
    showToast('Operasyon tipi eklendi', 'success')
    loadOperationTypes() // Reload the list
  } catch (error) {
    console.error('Error adding operation type:', error)
    showToast('Operasyon tipi eklenirken hata oluştu', 'error')
  }
}

export function editOperationType(id, currentName) {
  const newName = prompt('Yeni operasyon tipi adı:', currentName)
  if (newName === null || newName.trim() === '' || newName.trim() === currentName) return
  
  updateOperationType(id, newName.trim())
    .then(() => {
      showToast('Operasyon tipi güncellendi', 'success')
      loadOperationTypes()
    })
    .catch(error => {
      console.error('Error updating operation type:', error)
      showToast('Operasyon tipi güncellenirken hata oluştu', 'error')
    })
}

export function deleteOperationTypeConfirm(id, name) {
  if (!confirm(`"${name}" operasyon tipini silmek istediğinizden emin misiniz?`)) return
  
  deleteOperationType(id)
    .then(() => {
      showToast('Operasyon tipi silindi', 'success')
      loadOperationTypes()
    })
    .catch(error => {
      console.error('Error deleting operation type:', error)
      showToast('Operasyon tipi silinirken hata oluştu', 'error')
    })
}

// Operation Type Dropdown Management
export function toggleOperationTypeDropdown() {
  const dropdown = document.getElementById('operation-type-dropdown')
  if (!dropdown) return
  
  if (dropdown.style.display === 'none' || !dropdown.style.display) {
    loadOperationTypeDropdown()
    dropdown.style.display = 'block'
  } else {
    dropdown.style.display = 'none'
  }
}

async function loadOperationTypeDropdown() {
  const dropdown = document.getElementById('operation-type-dropdown')
  if (!dropdown) return
  
  try {
    const masterData = await getMasterData()
    const operationTypes = masterData.operationTypes || []
    const input = document.getElementById('operation-type')
    const currentValue = input ? input.value.toLowerCase() : ''
    
    // Filter based on current input
    const filtered = operationTypes.filter(ot => 
      ot.name.toLowerCase().includes(currentValue)
    )
    
    if (filtered.length === 0) {
      dropdown.innerHTML = `
        <div style="padding: 8px 12px; color: var(--muted-foreground); font-size: 12px;">
          No matching operation types
        </div>
        <div onclick="addNewOperationTypeFromInput()" style="padding: 8px 12px; cursor: pointer; background: var(--primary); color: var(--primary-foreground); font-size: 12px;">
          + Add "${input?.value || 'New Type'}" as new type
        </div>
      `
    } else {
      dropdown.innerHTML = [
        ...filtered.map(ot => `
          <div onclick="selectOperationTypeFromDropdown('${escapeHtml(ot.name)}')" style="padding: 8px 12px; cursor: pointer; font-size: 14px; border-bottom: 1px solid var(--border);" onmouseover="this.style.background='var(--accent)'" onmouseout="this.style.background='white'">
            ${escapeHtml(ot.name)}
          </div>
        `),
        input?.value && !operationTypes.some(ot => ot.name.toLowerCase() === input.value.toLowerCase()) ? 
          `<div onclick="addNewOperationTypeFromInput()" style="padding: 8px 12px; cursor: pointer; background: var(--primary); color: var(--primary-foreground); font-size: 12px; border-top: 1px solid var(--border);">
            + Add "${escapeHtml(input.value)}" as new type
          </div>` : ''
      ].filter(Boolean).join('')
    }
  } catch (error) {
    console.error('Error loading operation types:', error)
    dropdown.innerHTML = `
      <div style="padding: 8px 12px; color: #ef4444; font-size: 12px;">
        Error loading operation types
      </div>
    `
  }
}

export function selectOperationTypeFromDropdown(typeName) {
  const input = document.getElementById('operation-type')
  const dropdown = document.getElementById('operation-type-dropdown')
  
  if (input) input.value = typeName
  if (dropdown) dropdown.style.display = 'none'
}

export async function addNewOperationTypeFromInput() {
  const input = document.getElementById('operation-type')
  if (!input || !input.value.trim()) return
  
  try {
    await addOperationType(input.value.trim())
    showToast('New operation type added', 'success')
    const dropdown = document.getElementById('operation-type-dropdown')
    if (dropdown) dropdown.style.display = 'none'
  } catch (error) {
    console.error('Error adding operation type:', error)
    showToast('Error adding operation type', 'error')
  }
}

function initializeOperationTypeDropdown() {
  const input = document.getElementById('operation-type')
  const dropdown = document.getElementById('operation-type-dropdown')
  
  if (!input || !dropdown) return
  
  // Handle input changes
  input.addEventListener('input', () => {
    if (dropdown.style.display === 'block') {
      loadOperationTypeDropdown()
    }
  })
  
  // Handle focus
  input.addEventListener('focus', () => {
    loadOperationTypeDropdown()
    dropdown.style.display = 'block'
  })
  
  // Handle click outside
  document.addEventListener('click', (e) => {
    if (!input.contains(e.target) && !dropdown.contains(e.target)) {
      dropdown.style.display = 'none'
    }
  })
  
  // Handle keyboard navigation
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      dropdown.style.display = 'none'
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      const firstOption = dropdown.querySelector('div[onclick*="selectOperationTypeFromDropdown"]')
      if (firstOption) firstOption.click()
    }
  })
}
