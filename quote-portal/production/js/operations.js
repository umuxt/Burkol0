// Operations management UI backed by backend API
import { getOperations, saveOperations, normalizeOperation, genId, getMasterData, addSkill } from './mesApi.js'
import { showToast } from './ui.js'

let operationsState = []
let editingOperationId = null

export async function initializeOperationsUI() {
  await loadOperationsAndRender()
}

async function loadOperationsAndRender() {
  const container = document.getElementById('operations-list-container')
  if (container) container.innerHTML = `<div style="padding:12px; color:#888;">Loading operations...</div>`
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
  const container = document.getElementById('operations-list-container')
  if (!container) return
  if (!operationsState.length) {
    container.innerHTML = `<div style="padding:12px; color:#666;">No operations yet. Add your first operation.</div>`
    return
  }
  container.innerHTML = `
    <table class="table">
      <thead>
        <tr><th>Name</th><th>Type</th><th>Skills</th><th>QC</th><th>Actions</th></tr>
      </thead>
      <tbody>
        ${operationsState.map(op => `
          <tr>
            <td><strong>${escapeHtml(op.name || '')}</strong></td>
            <td>${escapeHtml(op.type || 'General')}</td>
            <td>${(Array.isArray(op.skills)?op.skills:[]).map(s => `<span class="badge badge-outline" style="margin-right:4px;">${escapeHtml(s)}</span>`).join('')}</td>
            <td>${op.qualityCheck ? '<span class="badge badge-success">Yes</span>' : '<span class="badge badge-secondary">No</span>'}</td>
            <td>
              <button onclick="editOperation('${op.id}')" style="padding:4px 8px; margin-right:4px; border:1px solid var(--border); background:white; border-radius:4px; cursor:pointer;">Edit</button>
              <button onclick="deleteOperation('${op.id}')" style="padding:4px 8px; border:1px solid #ef4444; background:white; color:#ef4444; border-radius:4px; cursor:pointer;">Delete</button>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>`
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

export function closeOperationModal(ev) {
  const overlay = document.getElementById('operation-modal')
  if (!overlay) return
  if (!ev || ev.target === overlay || ev === true) overlay.style.display = 'none'
}

export async function saveOperation() {
  const name = document.getElementById('operation-name')?.value?.trim()
  const type = document.getElementById('operation-type')?.value?.trim() || 'General'
  const skills = Array.from(document.querySelectorAll('#operation-skills-box input[type="checkbox"]:checked')).map(cb => cb.value)
  const qc = Boolean(document.getElementById('operation-qc')?.checked)
  if (!name) { showToast('Operation name required', 'warning'); return }
  if (skills.length === 0) { showToast('Select at least one skill', 'warning'); return }

  const op = normalizeOperation({
    id: editingOperationId || genId('op-'),
    name,
    type,
    skills,
    qualityCheck: qc,
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
  document.getElementById('operation-type').value = op?.type || 'General'
  // Removed time input - duration will be station-specific
  document.getElementById('operation-qc').checked = Boolean(op?.qualityCheck)
  overlay.style.display = 'block'
  // for skill selection, store selected internally and render
  const hidden = document.getElementById('operation-skills-selected') || (function(){ const h = document.createElement('input'); h.type='hidden'; h.id='operation-skills-selected'; document.getElementById('operation-modal').appendChild(h); return h })()
  hidden.value = Array.isArray(op?.skills) ? op.skills.join('|') : ''
  setTimeout(populateOperationSkillsBox, 0)
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
    box.innerHTML = `
      <div style="display:flex; gap:8px; margin-bottom:8px;">
        <input id="op-skill-new" type="text" placeholder="Yeni skill" style="flex:1; padding:6px 8px; border:1px solid var(--border); border-radius:6px;">
        <button id="op-skill-add" style="padding:6px 8px; border:1px solid var(--border); background:white; border-radius:6px;">+ Ekle</button>
      </div>
      <div id="op-skills-list" style="display:grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap:6px;"></div>`
    const list = box.querySelector('#op-skills-list')
    list.innerHTML = md.skills.map(s => {
      const checked = selected.has(s.name) ? 'checked' : ''
      return `<label style=\"display:flex; align-items:center; gap:8px;\"><input type=\"checkbox\" value=\"${escapeHtml(s.name)}\" ${checked}> ${escapeHtml(s.name)}</label>`
    }).join('')
    box.querySelector('#op-skill-add').onclick = async () => {
      const inp = document.getElementById('op-skill-new')
      const name = inp?.value?.trim()
      if (!name) return
      try {
        const created = await addSkill(name)
        const hidden = document.getElementById('operation-skills-selected')
        const parts = (hidden?.value || '').split('|').filter(Boolean)
        parts.push(created.name)
        hidden.value = Array.from(new Set(parts)).join('|')
        await populateOperationSkillsBox()
        inp.value = ''
      } catch { }
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
