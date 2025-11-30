// Skills and Operations master-data UI for Settings view
import { getMasterData, saveMasterData, addSkill, getOperations, saveOperations, getSkillsFromSQL, createSkillInSQL, updateSkillInSQL, deleteSkillFromSQL } from './mesApi.js'
import { showSuccessToast, showErrorToast, showWarningToast, showInfoToast } from '../../../shared/components/MESToast.js';

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
    skillsHost.innerHTML = '<div class="loading-text">Loading skills...</div>'
    try {
      // Load from SQL (mes.skills table)
      skillsState = await getSkillsFromSQL()
      renderSkills(skillsHost)
    } catch (e) {
      console.error('Skills load error', e)
      skillsHost.innerHTML = '<div class="error-text">Skills yüklenemedi</div>'
    }
  }

  // Initialize Operations
  const operationsHost = document.getElementById('operations-management')
  if (operationsHost) {
    operationsHost.innerHTML = '<div class="loading-text">Loading operations...</div>'
    try {
      operationsState = await getOperations()
      renderOperations(operationsHost)
    } catch (e) {
      console.error('Operations load error', e)
      operationsHost.innerHTML = '<div class="error-text">Operations yüklenemedi</div>'
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
          <div class="skill-row skill-row-container">
            <span data-skill-label="${escapeHtml(s.id)}" class="skill-name-label">${escapeHtml(s.name)}</span>
            <input data-skill-id="${escapeHtml(s.id)}" value="${escapeHtml(s.name)}"
                   oninput="onSkillNameInput('${escapeHtml(s.id)}')"
                   class="skill-name-input" />
            <div data-skill-actions="${escapeHtml(s.id)}" class="skill-actions">
              <button data-skill-save="${escapeHtml(s.id)}" onclick="event.stopPropagation(); renameSkill('${escapeHtml(s.id)}')"
                      class="skill-btn-save">Kaydet</button>
              <button data-skill-cancel="${escapeHtml(s.id)}" onclick="event.stopPropagation(); cancelSkillEdit('${escapeHtml(s.id)}')"
                      class="skill-btn-cancel">İptal</button>
              <button data-skill-delete="${escapeHtml(s.id)}" onclick="event.stopPropagation(); deleteSkill('${escapeHtml(s.id)}')"
                      class="skill-btn-delete">Sil</button>
            </div>
          </div>
        </td>
        <td class="skill-description">${escapeHtml(s.description || '')}</td>
      </tr>`).join('')

  host.innerHTML = `
    <div class="skills-input-row">
      <input id="skill-new-name" type="text" placeholder="Yeni skill adı veya ara" value="${escapeHtml(skillsQuery)}" oninput="onSkillsSearchInput()" class="skill-search-input" />
      <button id="skill-add-btn" onclick="addSkillFromSettings()" disabled class="skill-add-btn">+ Ekle</button>
    </div>
    <div class="skills-scroll mes-table-container skills-table-container">
      <table class="mes-table">
        <thead class="mes-table-header">
          <tr>
            <th class="th-min-200">
              <button type="button" class="mes-sort-button sort-button-static">
                Ad <span class="mes-sort-icon">↕</span>
              </button>
            </th>
            <th class="th-min-300">
              <button type="button" class="mes-sort-button sort-button-static">
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
    <div id="skill-create-modal" class="skill-modal-overlay" onclick="if(event.target.id==='skill-create-modal') closeSkillModal()">
      <div class="skill-modal-container" onclick="event.stopPropagation()">
        <h4 class="skill-modal-title">Yeni Skill Ekle</h4>
        
        <div class="skill-form-group">
          <label class="skill-form-label">Skill Adı *</label>
          <input id="skill-modal-name" type="text" placeholder="Örn: TIG Kaynağı" class="skill-form-input" />
        </div>
        
        <div class="skill-form-group-lg">
          <label class="skill-form-label">Açıklama (opsiyonel)</label>
          <textarea id="skill-modal-description" placeholder="Skill hakkında detaylı açıklama..." rows="3" class="skill-form-textarea"></textarea>
        </div>
        
        <div class="skill-modal-footer">
          <button onclick="saveNewSkillFromModal()" class="skill-btn-primary">
            <span class="btn-icon">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg>
            </span>
            <span>Skill Kaydet</span>
          </button>
          <button onclick="closeSkillModal()" class="skill-btn-secondary">
            <span class="btn-icon">
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
    ? `<tr class="mes-table-row is-empty"><td colspan="4" class="mes-empty-cell text-center"><em>Operasyon bulunamadı</em></td></tr>`
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
        
        // Format efficiency as percentage (0-200%)
        const rawEfficiency = Number(op.defaultEfficiency)
        const safeEfficiency = Number.isFinite(rawEfficiency) && rawEfficiency > 0 ? rawEfficiency : 1.0
        const normalizedEfficiency = Math.max(0.1, Math.min(2.0, safeEfficiency)) // Between 0.1 and 2.0
        const efficiencyPercentage = normalizedEfficiency * 100 // Convert to percentage
        const efficiencyLabel = efficiencyPercentage.toFixed(0) + '%'
        
        return `
          <tr class="mes-table-row" data-operation-row="${escapeHtml(op.id)}" onclick="activateOperationRow('${escapeHtml(op.id)}')">
            <td>
              <span class="operation-name-sm">${escapeHtml(op.name)}</span>
            </td>
            <td class="text-center">
              <span class="mes-code-text">${escapeHtml(op.semiOutputCode || '-')}</span>
            </td>
            <td class="text-center">
              <div class="operation-row operation-row-container">
                <span data-operation-defect-label="${escapeHtml(op.id)}" class="operation-defect-label">${escapeHtml(defectLabel)}</span>
                <input data-operation-defect-id="${escapeHtml(op.id)}" type="number" min="0" step="0.1" value="${escapeHtml(String(normalizedRate))}"
                       oninput="onOperationDefectRateInput('${escapeHtml(op.id)}')"
                       class="operation-defect-input" />
              </div>
            </td>
            <td class="text-center">
              <div class="operation-row operation-row-container">
                <span data-operation-efficiency-label="${escapeHtml(op.id)}" class="operation-defect-label">${escapeHtml(efficiencyLabel)}</span>
                <input data-operation-efficiency-id="${escapeHtml(op.id)}" type="number" min="10" max="200" step="1" value="${escapeHtml(String(efficiencyPercentage))}"
                       oninput="onOperationEfficiencyInput('${escapeHtml(op.id)}')"
                       class="operation-defect-input" />
                <button data-operation-save="${escapeHtml(op.id)}" onclick="event.stopPropagation(); saveOperationEdit('${escapeHtml(op.id)}')" class="operation-btn-sm">✓</button>
                <button data-operation-cancel="${escapeHtml(op.id)}" onclick="event.stopPropagation(); cancelOperationEdit('${escapeHtml(op.id)}')" class="operation-btn-sm">✗</button>
              </div>
            </td>
          </tr>`
      }).join('')

  host.innerHTML = `
    <div class="operations-input-row">
      <input id="operation-search" type="text" placeholder="Operasyon ara..." value="${escapeHtml(operationsQuery)}" oninput="onOperationsSearchInput()" class="operation-search-input" />
    </div>
    <div class="operations-scroll mes-table-container operations-table-container">
      <table class="mes-table">
        <thead class="mes-table-header">
          <tr>
            <th class="th-op-name">Operasyon Adı</th>
            <th class="th-op-code">Çıktı Kodu</th>
            <th class="th-op-rate">Fire Oranı (%)</th>
            <th class="th-op-rate">Verimlilik %</th>
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
  
  // Show input fields and buttons for both defect rate and efficiency
  const defectLabel = document.querySelector(`span[data-operation-defect-label="${CSS.escape(operationId)}"]`)
  const defectInput = document.querySelector(`input[data-operation-defect-id="${CSS.escape(operationId)}"]`)
  const efficiencyLabel = document.querySelector(`span[data-operation-efficiency-label="${CSS.escape(operationId)}"]`)
  const efficiencyInput = document.querySelector(`input[data-operation-efficiency-id="${CSS.escape(operationId)}"]`)
  const saveBtn = document.querySelector(`button[data-operation-save="${CSS.escape(operationId)}"]`)
  const cancelBtn = document.querySelector(`button[data-operation-cancel="${CSS.escape(operationId)}"]`)

  if (defectLabel) defectLabel.style.display = 'none'
  if (defectInput) defectInput.style.display = 'inline-block'
  if (efficiencyLabel) efficiencyLabel.style.display = 'none'
  if (efficiencyInput) efficiencyInput.style.display = 'inline-block'
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

export function onOperationEfficiencyInput(operationId) {
  // Enable/disable save button based on input (10-200%)
  const efficiencyInput = document.querySelector(`input[data-operation-efficiency-id="${CSS.escape(operationId)}"]`)
  const saveBtn = document.querySelector(`button[data-operation-save="${CSS.escape(operationId)}"]`)
  if (saveBtn) {
    const value = efficiencyInput?.value
    const isValid = value !== '' && !isNaN(parseFloat(value)) && parseFloat(value) >= 10 && parseFloat(value) <= 200
    saveBtn.disabled = !isValid
    saveBtn.style.opacity = isValid ? '1' : '0.5'
    saveBtn.style.cursor = isValid ? 'pointer' : 'not-allowed'
  }
}

export function cancelOperationEdit(operationId) {
  activeOperationId = null
  
  // Hide input fields, show labels for both defect rate and efficiency
  const defectLabel = document.querySelector(`span[data-operation-defect-label="${CSS.escape(operationId)}"]`)
  const defectInput = document.querySelector(`input[data-operation-defect-id="${CSS.escape(operationId)}"]`)
  const efficiencyLabel = document.querySelector(`span[data-operation-efficiency-label="${CSS.escape(operationId)}"]`)
  const efficiencyInput = document.querySelector(`input[data-operation-efficiency-id="${CSS.escape(operationId)}"]`)
  const saveBtn = document.querySelector(`button[data-operation-save="${CSS.escape(operationId)}"]`)
  const cancelBtn = document.querySelector(`button[data-operation-cancel="${CSS.escape(operationId)}"]`)

  if (defectLabel) defectLabel.style.display = 'inline-block'
  if (defectInput) defectInput.style.display = 'none'
  if (efficiencyLabel) efficiencyLabel.style.display = 'inline-block'
  if (efficiencyInput) efficiencyInput.style.display = 'none'
  if (saveBtn) saveBtn.style.display = 'none'
  if (cancelBtn) cancelBtn.style.display = 'none'
}

export async function saveOperationEdit(operationId) {
  const defectInput = document.querySelector(`input[data-operation-defect-id="${CSS.escape(operationId)}"]`)
  const efficiencyInput = document.querySelector(`input[data-operation-efficiency-id="${CSS.escape(operationId)}"]`)
  const defectRateStr = defectInput?.value || '0'
  const efficiencyStr = efficiencyInput?.value || '100'
  
  let expectedDefectRate = 0
  if (defectRateStr) {
    const parsed = parseFloat(defectRateStr)
    if (isNaN(parsed) || parsed < 0) {
      showWarningToast('Fire oranı geçerli bir pozitif sayı olmalıdır')
      return
    }
    expectedDefectRate = parsed
  }
  
  let defaultEfficiency = 1.0
  if (efficiencyStr) {
    const parsed = parseFloat(efficiencyStr)
    if (isNaN(parsed) || parsed < 10 || parsed > 200) {
      showWarningToast('Verimlilik 10% ile 200% arasında olmalıdır')
      return
    }
    // Convert percentage to decimal (100% = 1.0)
    defaultEfficiency = parsed / 100
  }
  
  try {
    const idx = operationsState.findIndex(op => op.id === operationId)
    if (idx < 0) return
    
    // Update both defect rate and efficiency
    operationsState[idx] = { 
      ...operationsState[idx], 
      expectedDefectRate,
      defaultEfficiency
    }
    
    await saveOperations(operationsState)
    activeOperationId = null
    renderOperations(document.getElementById('operations-management'))
    showSuccessToast('Operasyon güncellendi')
  } catch (e) {
    console.error('save operation error', e)
    showErrorToast('Operasyon güncellenemedi')
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
