// Skills master-data UI for Settings view
import { getMasterData, saveMasterData, addSkill } from './mesApi.js'
import { showToast } from './ui.js'

let skillsState = []
let activeSkillId = null
let globalSkillsClickAttached = false

export async function initMasterDataUI() {
  const host = document.getElementById('skills-management')
  if (!host) return
  host.innerHTML = '<div style="color:#888;">Loading skills...</div>'
  try {
    const md = await getMasterData()
    skillsState = md.skills || []
    renderSkills(host)
  } catch (e) {
    console.error('Skills load error', e)
    host.innerHTML = '<div style="color:#ef4444;">Skills yüklenemedi</div>'
  }
}

function renderSkills(host) {
  host.innerHTML = `
    <div class="skills-input-row" style="display:flex; gap:4px; margin-bottom:8px;">
      <input id="skill-new-name" type="text" placeholder="Yeni skill adı" style="flex:1 1 auto; padding:4px 8px; border:1px solid var(--border); border-radius:4px; font-size: 0.9em; max-width:600px;" />
      <button onclick="addSkillFromSettings()" style="padding:4px 8px; background: var(--primary); color: white; border:none; border-radius:4px; font-size: 0.9em;">+ Ekle</button>
    </div>
    <div class="skills-scroll" style="overflow-y:auto; border:1px solid var(--border); border-radius:6px; position: relative; min-width:300px;">
      <table style="width: 100%; border-collapse: collapse;">
        <thead style="background: rgb(248, 249, 250); position: sticky; top: 0px; z-index: 1;">
          <tr>
            <th style="min-width: 200px; white-space: nowrap; padding: 8px; text-align:left;">
              <button type="button" style="display: inline-flex; align-items: center; gap: 6px; background: none; border: 0; cursor: default; padding: 0; color: inherit; font: inherit;">Ad <span style="font-size: 12px; opacity: 0.6;">↕</span></button>
            </th>
          </tr>
        </thead>
        <tbody>
          ${skillsState.map(s => `
            <tr data-skill-row="${escapeHtml(s.id)}" onclick="activateSkillRow('${escapeHtml(s.id)}')" style="cursor:pointer; background-color: white; border-bottom: 1px solid rgb(243, 244, 246);">
              <td style="padding: 6px 8px;">
                <div class="skill-row" style="display:inline-flex; align-items:center; gap:8px;">
                  <span data-skill-label="${escapeHtml(s.id)}" style="display:inline-block;">${escapeHtml(s.name)}</span>
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
            </tr>`).join('')}
        </tbody>
      </table>
    </div>
  `

  // Görünen satır sayısını 10 ile sınırla ve kaydırılabilir yap
  try {
    const scroll = host.querySelector('.skills-scroll')
    if (scroll) {
      const thead = scroll.querySelector('thead')
      const firstRow = scroll.querySelector('tbody tr')
      let headerH = thead ? thead.getBoundingClientRect().height : 32
      let rowH = firstRow ? firstRow.getBoundingClientRect().height : 36
      if (headerH < 24) headerH = 24
      if (rowH < 24) rowH = 24
      const rowsToShow = 10
      scroll.style.maxHeight = `${Math.round(headerH + rowH * rowsToShow + 2)}px`
      // Üstteki input genişliğini tabloya göre sınırla
      const newInput = host.querySelector('#skill-new-name')
      const inputRow = host.querySelector('.skills-input-row')
      const w = scroll.getBoundingClientRect().width
      if (newInput && w) {
        const maxW = Math.max(240, Math.min(600, Math.round(w - 90)))
        newInput.style.maxWidth = `${maxW}px`
        if (inputRow) inputRow.style.maxWidth = `${Math.round(w)}px`
      }
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

export async function addSkillFromSettings() {
  const input = document.getElementById('skill-new-name')
  const name = input?.value?.trim()
  if (!name) { showToast('Skill adı gerekli', 'warning'); return }
  try {
    const created = await addSkill(name)
    skillsState.push(created)
    input.value = ''
    renderSkills(document.getElementById('skills-management'))
    showToast('Skill eklendi', 'success')
  } catch (e) {
    console.error('addSkill error', e)
    showToast('Skill eklenemedi', 'error')
  }
}

export async function renameSkill(skillId) {
  const input = document.querySelector(`input[data-skill-id="${CSS.escape(skillId)}"]`)
  if (!input) return
  const name = input.value.trim()
  if (!name) { showToast('Skill adı gerekli', 'warning'); return }
  try {
    const idx = skillsState.findIndex(s => s.id === skillId)
    if (idx < 0) return
    skillsState[idx] = { ...skillsState[idx], name }
    await saveMasterData({ skills: skillsState, operationTypes: [] })
    activeSkillId = null
    renderSkills(document.getElementById('skills-management'))
    showToast('Skill güncellendi', 'success')
  } catch (e) {
    console.error('rename skill error', e)
    showToast('Skill güncellenemedi', 'error')
  }
}

export async function deleteSkill(skillId) {
  if (!confirm('Bu skill silinsin mi?')) return
  try {
    skillsState = skillsState.filter(s => s.id !== skillId)
    await saveMasterData({ skills: skillsState, operationTypes: [] })
    activeSkillId = null
    renderSkills(document.getElementById('skills-management'))
    showToast('Skill silindi', 'success')
  } catch (e) {
    console.error('delete skill error', e)
    showToast('Skill silinemedi', 'error')
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
