// Skills and Operations master-data UI for Settings view
import { getMasterData, saveMasterData, addSkill, getOperations, saveOperations, getSkillsFromSQL, createSkillInSQL, updateSkillInSQL, deleteSkillFromSQL } from './mesApi.js'
import { showSuccessToast, showErrorToast, showWarningToast, showInfoToast } from '../../../shared/components/Toast.js';

let skillsState = []
let activeSkillId = null
let globalSkillsClickAttached = false
let skillsQuery = ''

// Operations state
let operationsState = []
let activeOperationId = null
let operationsQuery = ''

export async function initMasterDataUI() {
  // Initialize Skills (SQL-based)
  const skillsHost = document.getElementById('skills-management')
  if (skillsHost) {
    skillsHost.innerHTML = '<div style="color:#888;">Loading skills...</div>'
    try {
      // Load from SQL (mes.skills table)
      skillsState = await getSkillsFromSQL()
      renderSkills(skillsHost)
    } catch (e) {
      console.error('Skills load error', e)
      skillsHost.innerHTML = '<div style="color:#ef4444;">Skills yüklenemedi</div>'
    }
  }

  // Initialize Operations
  const operationsHost = document.getElementById('operations-management')
  if (operationsHost) {
    operationsHost.innerHTML = '<div style="color:#888;">Loading operations...</div>'
    try {
      operationsState = await getOperations()
      renderOperations(operationsHost)
    } catch (e) {
      console.error('Operations load error', e)
      operationsHost.innerHTML = '<div style="color:#ef4444;">Operations yüklenemedi</div>'
    }
  }
}

function renderSkills(host) {
  const q = (skillsQuery || '').toLowerCase()
  const filtered = q ? skillsState.filter(s => String(s.name || '').toLowerCase().includes(q)) : skillsState
  const rowsMarkup = filtered.length === 0
    ? `<tr class="mes-table-row is-empty"><td class="mes-empty-cell text-center" colspan="2"><em>Skill bulunamadı</em></td></tr>`
    : filtered.map(s => `
      <tr class="mes-table-row" data-skill-row="${escapeHtml(s.id)}" onclick="activateSkillRow('${escapeHtml(s.id)}')">
        <td>
          <div class="skill-row" style="display:inline-flex; align-items:center; gap:8px;">
            <span data-skill-label="${escapeHtml(s.id)}" style="display:inline-block; font-weight: 500;">${escapeHtml(s.name)}</span>
            <input data-skill-id="${escapeHtml(s.id)}" value="${escapeHtml(s.name)}"
                   oninput="onSkillNameInput('${escapeHtml(s.id)}')"
                   style="display:none; width:auto; flex:0 0 220px; padding:6px 8px; border:1px solid var(--border); border-radius:4px; font-size:0.9em;" />
            <div data-skill-actions="${escapeHtml(s.id)}" style="display:none; gap:6px; align-items:center;">
              <button data-skill-save="${escapeHtml(s.id)}" onclick="event.stopPropagation(); renameSkill('${escapeHtml(s.id)}')"
                      style="display:none; padding:2px 8px; border:1px solid var(--border); background:white; border-radius:4px; font-size:12px;">Kaydet</button>
              <button data-skill-cancel="${escapeHtml(s.id)}" onclick="event.stopPropagation(); cancelSkillEdit('${escapeHtml(s.id)}')"
                      style="display:inline-block; padding:2px 8px; border:1px solid var(--border); color:#6b7280; background:white; border-radius:4px; font-size:12px;">İptal</button>
              <button data-skill-delete="${escapeHtml(s.id)}" onclick="event.stopPropagation(); deleteSkill('${escapeHtml(s.id)}')"
                      style="display:inline-block; padding:2px 8px; border:1px solid #ef4444; color:#ef4444; background:white; border-radius:4px; font-size:12px;">Sil</button>
            </div>
          </div>
        </td>
        <td style="color:#6b7280; font-size:0.85em;">${escapeHtml(s.description || '')}</td>
      </tr>`).join('')

  host.innerHTML = `
    <div class="skills-input-row" style="display:flex; gap:4px; margin-bottom:8px;">
      <input id="skill-new-name" type="text" placeholder="Yeni skill adı veya ara" value="${escapeHtml(skillsQuery)}" oninput="onSkillsSearchInput()" style="flex:1 1 auto; padding:4px 8px; border:1px solid var(--border); border-radius:4px; font-size: 0.9em; max-width:600px;" />
      <button id="skill-add-btn" onclick="addSkillFromSettings()" disabled style="padding:4px 8px; background:#e5e7eb; color:#9ca3af; border:none; border-radius:4px; font-size: 0.9em; cursor:not-allowed;">+ Ekle</button>
    </div>
    <div class="skills-scroll mes-table-container" style="position: relative; min-width:300px;">
      <table class="mes-table">
        <thead class="mes-table-header">
          <tr>
            <th style="min-width: 200px;">
              <button type="button" class="mes-sort-button" style="cursor: default;">
                Ad <span class="mes-sort-icon">↕</span>
              </button>
            </th>
            <th style="min-width: 300px;">
              <button type="button" class="mes-sort-button" style="cursor: default;">
                Açıklama <span class="mes-sort-icon">↕</span>
              </button>
            </th>
          </tr>
        </thead>
        <tbody class="mes-table-body">
          ${rowsMarkup}
        </tbody>
      </table>
    </div>
    <!-- Skill Create Modal -->
    <div id="skill-create-modal" style="display:none; position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.4); z-index:9999; align-items:center; justify-content:center;" onclick="if(event.target.id==='skill-create-modal') closeSkillModal()">
      <div style="background:white; border-radius:8px; box-shadow:0 10px 25px rgba(0,0,0,0.1); padding:20px; min-width:400px; max-width:500px;" onclick="event.stopPropagation()">
        <h4 style="margin:0 0 16px; font-size:16px; font-weight:600; color:#000;">Yeni Skill Ekle</h4>
        
        <div style="margin-bottom:12px;">
          <label style="display:block; font-size:13px; font-weight:500; margin-bottom:4px; color:#000;">Skill Adı *</label>
          <input id="skill-modal-name" type="text" placeholder="Örn: TIG Kaynağı" style="width:100%; padding:8px; border:1px solid #d1d5db; border-radius:4px; font-size:14px;" />
        </div>
        
        <div style="margin-bottom:16px;">
          <label style="display:block; font-size:13px; font-weight:500; margin-bottom:4px; color:#000;">Açıklama (opsiyonel)</label>
          <textarea id="skill-modal-description" placeholder="Skill hakkında detaylı açıklama..." rows="3" style="width:100%; padding:8px; border:1px solid #d1d5db; border-radius:4px; font-size:14px; resize:vertical;"></textarea>
        </div>
        
        <div style="display:flex; gap:8px; justify-content:flex-end;">
          <button onclick="saveNewSkillFromModal()" style="display:flex; align-items:center; gap:6px; padding:8px 16px; background:#000; color:#fff; border:none; border-radius:4px; font-size:14px; cursor:pointer;">
            <span style="display:flex; align-items:center;">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg>
            </span>
            <span>Skill Kaydet</span>
          </button>
          <button onclick="closeSkillModal()" style="display:flex; align-items:center; gap:6px; padding:8px 16px; background:#f3f4f6; color:#374151; border:1px solid #d1d5db; border-radius:4px; font-size:14px; cursor:pointer;">
            <span style="display:flex; align-items:center;">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"></path><path d="m6 6 12 12"></path></svg>
            </span>
            <span>İptal</span>
          </button>
        </div>
      </div>
    </div>
  `

  // Görünen satır sayısını 5 ile sınırla ve kaydırılabilir yap
  try {
    const scroll = host.querySelector('.skills-scroll')
    if (scroll) {
      const thead = scroll.querySelector('thead')
      const firstRow = scroll.querySelector('tbody tr')
      let headerH = thead ? thead.getBoundingClientRect().height : 32
      let rowH = firstRow ? firstRow.getBoundingClientRect().height : 36
      if (headerH < 24) headerH = 24
      if (rowH < 24) rowH = 24
      const rowsToShow = 5
      const fixedH = Math.round(headerH + rowH * rowsToShow + 2)
      scroll.style.maxHeight = `${fixedH}px`
      scroll.style.minHeight = `${fixedH}px`
      scroll.style.height = `${fixedH}px`
      // Üstteki input genişliğini tabloya göre sınırla
      const newInput = host.querySelector('#skill-new-name')
      const inputRow = host.querySelector('.skills-input-row')
      const w = scroll.getBoundingClientRect().width
      if (newInput && w) {
        const maxW = Math.max(240, Math.min(600, Math.round(w - 90)))
        newInput.style.maxWidth = `${maxW}px`
        if (inputRow) inputRow.style.maxWidth = `${Math.round(w)}px`
      }

      // Add button enable/disable based on filter
      try {
        const addBtn = host.querySelector('#skill-add-btn')
        const query = (host.querySelector('#skill-new-name')?.value || '').trim()
        if (addBtn) {
          const hasText = query.length > 0
          const filteredCount = filtered.length
          const enable = hasText && filteredCount === 0
          if (enable) {
            addBtn.removeAttribute('disabled')
            addBtn.style.background = 'var(--primary)'
            addBtn.style.color = 'var(--primary-foreground, white)'
            addBtn.style.cursor = 'pointer'
          } else {
            addBtn.setAttribute('disabled', 'true')
            addBtn.style.background = '#e5e7eb'
            addBtn.style.color = '#9ca3af'
            addBtn.style.cursor = 'not-allowed'
          }
        }
      } catch {}
    }
  } catch (_) { /* ignore measurement issues */ }

  // Global click ile satır dışına tıklamada iptal
  if (!globalSkillsClickAttached) {
    globalSkillsClickAttached = true
    document.addEventListener('click', (e) => {
      if (!activeSkillId) return
      const row = document.querySelector(`[data-skill-row="${CSS.escape(activeSkillId)}"]`)
      if (row && !row.contains(e.target)) {
        cancelSkillEdit(activeSkillId)
      }
    })
  }
}

// Satıra tıklanınca: input düzenlenebilir olsun, Sil butonu görünsün
export function activateSkillRow(skillId) {
  try {
    if (activeSkillId && activeSkillId !== skillId) {
      cancelSkillEdit(activeSkillId)
    }
    const row = document.querySelector(`[data-skill-row="${CSS.escape(skillId)}"]`)
    if (!row) return
    const label = row.querySelector(`[data-skill-label="${CSS.escape(skillId)}"]`)
    const input = row.querySelector(`input[data-skill-id="${CSS.escape(skillId)}"]`)
    const actions = row.querySelector(`[data-skill-actions="${CSS.escape(skillId)}"]`)
    const btnSave = row.querySelector(`[data-skill-save="${CSS.escape(skillId)}"]`)
    if (label) label.style.display = 'none'
    if (input) {
      input.style.display = 'inline-block'
      input.dataset.dirty = input.dataset.dirty === 'true' ? 'true' : 'false'
      input.focus()
      const val = input.value; input.value = ''; input.value = val
    }
    if (actions) actions.style.display = 'flex'
    if (btnSave) btnSave.style.display = input && input.dataset.dirty === 'true' ? 'inline-block' : 'none'
    activeSkillId = skillId
  } catch (e) { /* ignore */ }
}

// Input'ta değişiklik olunca: Kaydet butonu görünsün
export function onSkillNameInput(skillId) {
  try {
    const input = document.querySelector(`input[data-skill-id="${CSS.escape(skillId)}"]`)
    if (!input) return
    input.dataset.dirty = 'true'
    const btnSave = document.querySelector(`[data-skill-save="${CSS.escape(skillId)}"]`)
    if (btnSave) btnSave.style.display = 'inline-block'
  } catch (e) { /* ignore */ }
}

export function cancelSkillEdit(skillId) {
  try {
    const row = document.querySelector(`[data-skill-row="${CSS.escape(skillId)}"]`)
    if (!row) return
    const label = row.querySelector(`[data-skill-label="${CSS.escape(skillId)}"]`)
    const input = row.querySelector(`input[data-skill-id="${CSS.escape(skillId)}"]`)
    const actions = row.querySelector(`[data-skill-actions="${CSS.escape(skillId)}"]`)
    if (input && label) {
      input.value = label.textContent || ''
    }
    if (label) label.style.display = 'inline-block'
    if (input) { input.style.display = 'none'; input.dataset.dirty = 'false' }
    if (actions) actions.style.display = 'none'
    if (activeSkillId === skillId) activeSkillId = null
  } catch (e) { /* ignore */ }
}

// Search/filter input handler; also toggles add button availability
export function onSkillsSearchInput() {
  const input = document.getElementById('skill-new-name')
  const val = input ? input.value : ''
  // Caret positions to restore after re-render
  const selStart = input && typeof input.selectionStart === 'number' ? input.selectionStart : val.length
  const selEnd = input && typeof input.selectionEnd === 'number' ? input.selectionEnd : val.length
  // Update query (do not trim to avoid caret jumps while typing)
  skillsQuery = val
  // Re-render to apply filter and button state, then restore focus + caret
  const host = document.getElementById('skills-management')
  if (host) {
    renderSkills(host)
    const i2 = document.getElementById('skill-new-name')
    if (i2) {
      i2.focus()
      try { i2.setSelectionRange(selStart, selEnd) } catch {}
    }
  }
}

export async function addSkillFromSettings() {
  // Open modal with prefilled name from search input
  const input = document.getElementById('skill-new-name')
  const searchValue = input?.value?.trim() || ''
  openSkillModal(searchValue)
}

// Open skill creation modal
export function openSkillModal(prefillName = '') {
  const modal = document.getElementById('skill-create-modal')
  const nameInput = document.getElementById('skill-modal-name')
  const descInput = document.getElementById('skill-modal-description')
  
  if (!modal || !nameInput || !descInput) return
  
  // Prefill name, clear description
  nameInput.value = prefillName
  descInput.value = ''
  
  // Show modal
  modal.style.display = 'flex'
  
  // Focus name input
  setTimeout(() => {
    nameInput.focus()
    if (prefillName) {
      // Select all if prefilled
      nameInput.select()
    }
  }, 100)
}

// Close skill creation modal
export function closeSkillModal() {
  const modal = document.getElementById('skill-create-modal')
  if (modal) modal.style.display = 'none'
}

// Save new skill from modal (SQL backend)
export async function saveNewSkillFromModal() {
  const nameInput = document.getElementById('skill-modal-name')
  const descInput = document.getElementById('skill-modal-description')
  const searchInput = document.getElementById('skill-new-name')
  
  const name = nameInput?.value?.trim()
  const description = descInput?.value?.trim() || ''
  
  if (!name) {
    showWarningToast('Skill adı gerekli')
    nameInput?.focus()
    return
  }
  
  try {
    // Create skill in SQL
    const created = await createSkillInSQL(name, description)
    
    // Add to local state
    skillsState.push(created)
    
    // Clear search input and query
    if (searchInput) searchInput.value = ''
    skillsQuery = ''
    
    // Close modal
    closeSkillModal()
    
    // Re-render skills list
    const host = document.getElementById('skills-management')
    if (host) renderSkills(host)
    
    showSuccessToast(`Skill "${created.name}" eklendi`)
  } catch (e) {
    console.error('createSkill error', e)
    showErrorToast(e.message === 'skill_name_required' ? 'Skill adı gerekli' : 'Skill eklenemedi')
  }
}

export async function renameSkill(skillId) {
  const input = document.querySelector(`input[data-skill-id="${CSS.escape(skillId)}"]`)
  if (!input) return
  const name = input.value.trim()
  if (!name) { showWarningToast('Skill adı gerekli'); return }
  
  try {
    const idx = skillsState.findIndex(s => s.id === skillId)
    if (idx < 0) return
    
    const currentSkill = skillsState[idx]
    
    // Update skill in SQL (keep existing description)
    const updated = await updateSkillInSQL(skillId, name, currentSkill.description || '')
    
    // Update local state
    skillsState[idx] = updated
    activeSkillId = null
    
    renderSkills(document.getElementById('skills-management'))
    showSuccessToast('Skill güncellendi')
  } catch (e) {
    console.error('rename skill error', e)
    showErrorToast('Skill güncellenemedi')
  }
}

export async function deleteSkill(skillId) {
  const skill = skillsState.find(s => s.id === skillId)
  const skillName = skill?.name || skillId
  
  if (!confirm(`"${skillName}" skill'i silmek istediğinizden emin misiniz?`)) return
  
  try {
    // Delete from SQL (has usage protection)
    await deleteSkillFromSQL(skillId)
    
    // Remove from local state
    skillsState = skillsState.filter(s => s.id !== skillId)
    activeSkillId = null
    
    renderSkills(document.getElementById('skills-management'))
    showSuccessToast('Skill silindi')
  } catch (e) {
    console.error('delete skill error', e)
    
    // Check if it's a usage protection error
    if (e.message.includes('Cannot delete skill in use')) {
      showErrorToast('Bu skill kullanımda olduğu için silinemez')
    } else {
      showErrorToast('Skill silinemedi')
    }
  }
}

// Operations Management Functions
function renderOperations(host) {
  const q = (operationsQuery || '').toLowerCase()
  const filtered = q ? operationsState.filter(op => String(op.name || '').toLowerCase().includes(q)) : operationsState

  const rowsMarkup = filtered.length === 0
    ? `<tr class="mes-table-row is-empty"><td colspan="3" class="mes-empty-cell text-center"><em>Operasyon bulunamadı</em></td></tr>`
    : filtered.map(op => {
        const rawRate = Number(op.expectedDefectRate)
        const safeRate = Number.isFinite(rawRate) ? rawRate : 0
        const normalizedRate = Math.max(0, safeRate)
        let formattedRate = normalizedRate.toFixed(2)
        if (formattedRate.includes('.')) {
          formattedRate = formattedRate.replace(/0+$/, '')
          if (formattedRate.endsWith('.')) {
            formattedRate = formattedRate.slice(0, -1)
          }
        }
        const defectLabel = `${formattedRate}%`
        return `
          <tr class="mes-table-row" data-operation-row="${escapeHtml(op.id)}" onclick="activateOperationRow('${escapeHtml(op.id)}')">
            <td>
              <span style="font-size: 0.9em; color: rgb(75, 85, 99);">${escapeHtml(op.name)}</span>
            </td>
            <td class="text-center">
              <span class="mes-code-text">${escapeHtml(op.semiOutputCode || '-')}</span>
            </td>
            <td class="text-center">
              <div class="operation-row" style="display:inline-flex; align-items:center; justify-content:center; gap:8px;">
                <span data-operation-defect-label="${escapeHtml(op.id)}" style="display:inline-block; font-size: 0.9em;">${escapeHtml(defectLabel)}</span>
                <input data-operation-defect-id="${escapeHtml(op.id)}" type="number" min="0" step="0.1" value="${escapeHtml(String(normalizedRate))}"
                       oninput="onOperationDefectRateInput('${escapeHtml(op.id)}')"
                       style="display:none; width:60px; padding:4px 6px; border:1px solid var(--border); border-radius:4px; font-size:0.8em; text-align:center;" />
                <button data-operation-save="${escapeHtml(op.id)}" onclick="event.stopPropagation(); saveOperationEdit('${escapeHtml(op.id)}')" style="display:none; font-size:0.75em; padding:2px 6px; border:1px solid var(--border); background:white; border-radius:4px; cursor:pointer;">✓</button>
                <button data-operation-cancel="${escapeHtml(op.id)}" onclick="event.stopPropagation(); cancelOperationEdit('${escapeHtml(op.id)}')" style="display:none; font-size:0.75em; padding:2px 6px; border:1px solid var(--border); background:white; border-radius:4px; cursor:pointer;">✗</button>
              </div>
            </td>
          </tr>`
      }).join('')

  host.innerHTML = `
    <div class="operations-input-row" style="display:flex; gap:4px; margin-bottom:8px;">
      <input id="operation-search" type="text" placeholder="Operasyon ara..." value="${escapeHtml(operationsQuery)}" oninput="onOperationsSearchInput()" style="flex:1 1 auto; padding:4px 8px; border:1px solid var(--border); border-radius:4px; font-size: 0.9em; max-width:600px;" />
    </div>
    <div class="operations-scroll mes-table-container" style="position: relative; min-width:300px; max-height: 200px;">
      <table class="mes-table">
        <thead class="mes-table-header">
          <tr>
            <th style="min-width: 150px; text-align:left; font-size: 0.85em;">Operasyon Adı</th>
            <th style="min-width: 80px; text-align:center; font-size: 0.85em;">Çıktı Kodu</th>
            <th style="min-width: 80px; text-align:center; font-size: 0.85em;">Fire Oranı (%)</th>
          </tr>
        </thead>
        <tbody class="mes-table-body">
          ${rowsMarkup}
        </tbody>
      </table>
    </div>
  `
}

export function onOperationsSearchInput() {
  const input = document.getElementById('operation-search')
  operationsQuery = input?.value || ''
  renderOperations(document.getElementById('operations-management'))
}

export function activateOperationRow(operationId) {
  if (activeOperationId === operationId) return
  
  // Cancel any existing edit
  if (activeOperationId) cancelOperationEdit(activeOperationId)
  
  activeOperationId = operationId
  
  // Only show input field and buttons for defect rate (read-only for name and output code)
  const defectLabel = document.querySelector(`span[data-operation-defect-label="${CSS.escape(operationId)}"]`)
  const defectInput = document.querySelector(`input[data-operation-defect-id="${CSS.escape(operationId)}"]`)
  const saveBtn = document.querySelector(`button[data-operation-save="${CSS.escape(operationId)}"]`)
  const cancelBtn = document.querySelector(`button[data-operation-cancel="${CSS.escape(operationId)}"]`)

  if (defectLabel) defectLabel.style.display = 'none'
  if (defectInput) defectInput.style.display = 'inline-block'
  if (saveBtn) saveBtn.style.display = 'inline-block'
  if (cancelBtn) cancelBtn.style.display = 'inline-block'
}

export function onOperationDefectRateInput(operationId) {
  // Enable/disable save button based on input
  const defectInput = document.querySelector(`input[data-operation-defect-id="${CSS.escape(operationId)}"]`)
  const saveBtn = document.querySelector(`button[data-operation-save="${CSS.escape(operationId)}"]`)
  if (saveBtn) {
    const value = defectInput?.value
    const isValid = value !== '' && !isNaN(parseFloat(value)) && parseFloat(value) >= 0
    saveBtn.disabled = !isValid
    saveBtn.style.opacity = isValid ? '1' : '0.5'
    saveBtn.style.cursor = isValid ? 'pointer' : 'not-allowed'
  }
}

export function cancelOperationEdit(operationId) {
  activeOperationId = null
  
  // Hide input field, show label (only for defect rate)
  const defectLabel = document.querySelector(`span[data-operation-defect-label="${CSS.escape(operationId)}"]`)
  const defectInput = document.querySelector(`input[data-operation-defect-id="${CSS.escape(operationId)}"]`)
  const saveBtn = document.querySelector(`button[data-operation-save="${CSS.escape(operationId)}"]`)
  const cancelBtn = document.querySelector(`button[data-operation-cancel="${CSS.escape(operationId)}"]`)

  if (defectLabel) defectLabel.style.display = 'inline-block'
  if (defectInput) defectInput.style.display = 'none'
  if (saveBtn) saveBtn.style.display = 'none'
  if (cancelBtn) cancelBtn.style.display = 'none'
}

export async function saveOperationEdit(operationId) {
  const defectInput = document.querySelector(`input[data-operation-defect-id="${CSS.escape(operationId)}"]`)
  const defectRateStr = defectInput?.value || '0'
  
  let expectedDefectRate = 0
  if (defectRateStr) {
    const parsed = parseFloat(defectRateStr)
    if (isNaN(parsed) || parsed < 0) {
      showWarningToast('Fire oranı geçerli bir pozitif sayı olmalıdır')
      return
    }
    expectedDefectRate = parsed
  }
  
  try {
    const idx = operationsState.findIndex(op => op.id === operationId)
    if (idx < 0) return
    
    // Only update defect rate, keep other fields unchanged
    operationsState[idx] = { 
      ...operationsState[idx], 
      expectedDefectRate
    }
    
    await saveOperations(operationsState)
    activeOperationId = null
    renderOperations(document.getElementById('operations-management'))
    showSuccessToast('Fire oranı güncellendi')
  } catch (e) {
    console.error('save operation error', e)
    showErrorToast('Fire oranı güncellenemedi')
  }
}

export async function deleteOperationFromMaster(operationId) {
  if (!confirm('Bu operasyon silinsin mi?')) return
  
  try {
    operationsState = operationsState.filter(op => op.id !== operationId)
    await saveOperations(operationsState)
    activeOperationId = null
    renderOperations(document.getElementById('operations-management'))
    showSuccessToast('Operasyon silindi')
  } catch (e) {
    console.error('delete operation error', e)
    showErrorToast('Operasyon silinemedi')
  }
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
    .replace(/'/g, '&#039;')
}
