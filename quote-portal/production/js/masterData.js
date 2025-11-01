// Skills master-data UI for Settings view
import { getMasterData, saveMasterData, addSkill } from './mesApi.js'
import { showToast } from './ui.js'

let skillsState = []

export async function initMasterDataUI() {
  const host = document.getElementById('skills-management')
  if (!host) return
  host.innerHTML = '<div style="color:#888;">Loading skills...</div>'
  try {
    const md = await getMasterData(true)
    skillsState = md.skills || []
    renderSkills(host)
  } catch (e) {
    console.error('Skills load error', e)
    host.innerHTML = '<div style="color:#ef4444;">Skills yüklenemedi</div>'
  }
}

function renderSkills(host) {
  host.innerHTML = `
    <div style="display:flex; gap:8px; margin-bottom:12px;">
      <input id="skill-new-name" type="text" placeholder="Yeni skill adı" style="flex:1; padding:8px 12px; border:1px solid var(--border); border-radius:6px;" />
      <button onclick="addSkillFromSettings()" style="padding:8px 12px; background: var(--primary); color: white; border:none; border-radius:6px;">+ Ekle</button>
    </div>
    <table class="table">
      <thead><tr><th>Kod</th><th>Ad</th><th>İşlem</th></tr></thead>
      <tbody>
        ${skillsState.map(s => `
          <tr>
            <td><code>${escapeHtml(s.id)}</code></td>
            <td><input data-skill-id="${escapeHtml(s.id)}" value="${escapeHtml(s.name)}" style="width:100%; padding:6px 8px; border:1px solid var(--border); border-radius:6px;" /></td>
            <td>
              <button onclick="renameSkill('${escapeHtml(s.id)}')" style="padding:4px 8px; border:1px solid var(--border); background:white; border-radius:4px; margin-right:6px;">Kaydet</button>
              <button onclick="deleteSkill('${escapeHtml(s.id)}')" style="padding:4px 8px; border:1px solid #ef4444; color:#ef4444; background:white; border-radius:4px;">Sil</button>
            </td>
          </tr>`).join('')}
      </tbody>
    </table>
  `
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

