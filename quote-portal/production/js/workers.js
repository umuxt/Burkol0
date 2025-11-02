// Workers management backed by backend API (no direct Firebase client)
import { API_BASE, withAuth } from '../../src/lib/api.js'
import { getMasterData } from './mesApi.js'
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
  const shiftI = document.getElementById('worker-shift')
  const statusI = document.getElementById('worker-status')

  if (!overlay) return
  title.textContent = worker ? 'Edit Worker' : 'Add New Worker'
  nameI.value = worker?.name || ''
  emailI.value = worker?.email || ''
  shiftI.value = worker?.shift || 'Day'
  statusI.value = (worker?.status || 'available').toLowerCase()

  overlay.style.display = 'block'
  
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
    grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
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
    const filteredSkills = allSkills.filter(skill => 
      skill.name.toLowerCase().includes(filter.toLowerCase())
    );
    
    // Sort: selected first, then alphabetical
    const sortedSkills = filteredSkills.sort((a, b) => {
      const aSelected = currentSelected.includes(a.name);
      const bSelected = currentSelected.includes(b.name);
      
      if (aSelected && !bSelected) return -1;
      if (!aSelected && bSelected) return 1;
      return a.name.localeCompare(b.name, 'tr');
    });
    
    skillsGrid.innerHTML = '';
    sortedSkills.forEach(skill => {
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

function capitalize(s) { s = String(s||''); return s.charAt(0).toUpperCase() + s.slice(1) }
function genId() { return 'w-' + Math.random().toString(36).slice(2, 9) }

// No default export; named exports only
