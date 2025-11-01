// Workers management backed by backend API (no direct Firebase client)
import { API_BASE, withAuth } from '../../src/lib/api.js'
import { showToast } from './ui.js'

let workersState = []
let editingWorkerId = null

export async function initializeWorkersUI() {
  await loadWorkersAndRender()
}

async function loadWorkersAndRender() {
  const tbody = document.getElementById('workers-table-body')
  if (tbody) tbody.innerHTML = `<tr><td colspan="5"><em>Loading workers...</em></td></tr>`
  try {
    const res = await fetch(`${API_BASE}/api/mes/workers`, { headers: withAuth() })
    if (!res.ok) throw new Error(`Load failed: ${res.status}`)
    const data = await res.json()
    workersState = Array.isArray(data?.workers) ? data.workers : []
    renderWorkersTable()
  } catch (e) {
    console.error('Workers load error:', e)
    if (tbody) tbody.innerHTML = `<tr><td colspan="5"><span style="color:#ef4444">Workers yüklenemedi.</span></td></tr>`
    showToast('Workers yüklenemedi', 'error')
  }
}

function renderWorkersTable() {
  const tbody = document.getElementById('workers-table-body')
  if (!tbody) return

  if (workersState.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5"><em>Hiç worker yok. Yeni ekleyin.</em></td></tr>`
    return
  }

  tbody.innerHTML = workersState.map(w => {
    const skills = Array.isArray(w.skills) ? w.skills : (typeof w.skills === 'string' ? w.skills.split(',').map(s=>s.trim()).filter(Boolean) : [])
    const status = (w.status || 'available').toLowerCase()
    const badgeClass = status === 'available' || status === 'active' ? 'success' : status === 'busy' ? 'warning' : 'default'
    const shiftLabel = w.shift || 'Day'
    return `
      <tr>
        <td><strong>${escapeHtml(w.name || '')}</strong><br><small>${escapeHtml(w.email || '')}</small></td>
        <td>${skills.map(s => `<span class="badge badge-outline" style="margin-right:4px;">${escapeHtml(s)}</span>`).join('')}</td>
        <td>${escapeHtml(shiftLabel)} Shift</td>
        <td><span class="badge badge-${badgeClass}">${escapeHtml(capitalize(status))}</span></td>
        <td>
          <button onclick="editWorker('${w.id}')" style="padding:4px 8px; margin-right:4px; border:1px solid var(--border); background:white; border-radius:4px; cursor:pointer;">Edit</button>
          <button onclick="deleteWorker('${w.id}')" style="padding:4px 8px; border:1px solid #ef4444; background:white; color:#ef4444; border-radius:4px; cursor:pointer;">Delete</button>
        </td>
      </tr>`
  }).join('')
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
  }
}

export async function saveWorker() {
  const name = document.getElementById('worker-name')?.value?.trim()
  const email = document.getElementById('worker-email')?.value?.trim()
  const skillsStr = document.getElementById('worker-skills')?.value || ''
  const shift = document.getElementById('worker-shift')?.value || 'Day'
  const status = document.getElementById('worker-status')?.value || 'available'

  if (!name) { showToast('İsim gerekli', 'warning'); return }
  if (!email) { showToast('Email gerekli', 'warning'); return }

  const skills = skillsStr.split(',').map(s => s.trim()).filter(Boolean)

  const payload = { id: editingWorkerId || genId(), name, email, skills, shift, status }
  const idx = workersState.findIndex(w => w.id === payload.id)
  if (idx >= 0) workersState[idx] = { ...workersState[idx], ...payload }
  else workersState.push(payload)

  try {
    await persistWorkers()
    closeWorkerModal(true)
    renderWorkersTable()
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
  const skillsI = document.getElementById('worker-skills')
  const shiftI = document.getElementById('worker-shift')
  const statusI = document.getElementById('worker-status')

  if (!overlay) return
  title.textContent = worker ? 'Edit Worker' : 'Add New Worker'
  nameI.value = worker?.name || ''
  emailI.value = worker?.email || ''
  skillsI.value = Array.isArray(worker?.skills) ? worker.skills.join(', ') : (worker?.skills || '')
  shiftI.value = worker?.shift || 'Day'
  statusI.value = (worker?.status || 'available').toLowerCase()

  overlay.style.display = 'block'
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function capitalize(s) { s = String(s||''); return s.charAt(0).toUpperCase() + s.slice(1) }
function genId() { return 'w-' + Math.random().toString(36).slice(2, 9) }

// No default export; named exports only

