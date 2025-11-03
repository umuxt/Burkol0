// Plan Overview UI: tabs, filter, and create action

export function initPlanOverviewUI() {
  // Default active tab
  setActivePlanTab('production');
  updatePlanFilterCounts();
}

export function setActivePlanTab(tabId) {
  const buttons = document.querySelectorAll('.plan-tab-button');
  buttons.forEach(btn => {
    const isActive = (tabId === 'production' && btn.textContent.trim().startsWith('Production')) || (tabId === 'templates' && btn.textContent.trim().startsWith('Templates'));
    if (isActive) {
      btn.classList.add('active');
      btn.style.background = 'white';
      btn.style.color = 'rgb(17, 24, 39)';
      btn.style.fontWeight = '600';
      btn.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)';
    } else {
      btn.classList.remove('active');
      btn.style.background = 'transparent';
      btn.style.color = 'rgb(75, 85, 99)';
      btn.style.fontWeight = '400';
      btn.style.boxShadow = 'none';
    }
  });

  const prodPanel = document.getElementById('production-table-panel');
  const templPanel = document.getElementById('templates-table-panel');
  if (prodPanel && templPanel) {
    prodPanel.style.display = tabId === 'production' ? 'block' : 'none';
    templPanel.style.display = tabId === 'templates' ? 'block' : 'none';
  }
}

export function filterProductionPlans() {
  const input = document.getElementById('plan-filter-search');
  const term = (input?.value || '').toLowerCase();
  const rows = document.querySelectorAll('#production-table-body tr');
  rows.forEach(row => {
    // Skip empty state row which has a single td[colspan]
    const tds = row.querySelectorAll('td');
    if (!tds || tds.length <= 1) return;
    const text = Array.from(tds).slice(0, tds.length - 1).map(td => td.textContent?.toLowerCase() || '').join(' ');
    // Basic search filter; advanced filters can be added via data attributes
    const matchSearch = text.includes(term);
    // If we add data attributes like data-status, data-priority, data-type in the future:
    const f = planFilters;
    const statusOk = f.status.size === 0 || (row.dataset.status && f.status.has(row.dataset.status));
    const priorityOk = f.priority.size === 0 || (row.dataset.priority && f.priority.has(row.dataset.priority));
    const typeOk = f.type.size === 0 || (row.dataset.type && f.type.has(row.dataset.type));
    row.style.display = matchSearch && statusOk && priorityOk && typeOk ? '' : 'none';
  });
}

export function openCreatePlan() {
  const section = document.getElementById('plan-designer-section');
  if (!section) return;
  // Hide list-related UI
  const tabs = document.getElementById('plans-tabs');
  const panelCard = document.getElementById('plans-panel-card');
  const headerControls = document.getElementById('plans-header-controls');
  const createButton = document.getElementById('create-plan-button');
  const filterBar = document.getElementById('plans-filter-compact');
  const title = document.getElementById('plans-title');
  if (tabs) tabs.style.display = 'none';
  if (panelCard) panelCard.style.display = 'none';
  if (headerControls) headerControls.style.display = 'none';
  if (createButton) createButton.style.display = 'none';
  if (filterBar) filterBar.style.display = 'none';
  if (title) title.textContent = 'Production Planning / New Plan Creation';

  // Show designer
  section.style.display = 'block';
}

export function cancelPlanCreation() {
  const section = document.getElementById('plan-designer-section');
  const tabs = document.getElementById('plans-tabs');
  const panelCard = document.getElementById('plans-panel-card');
  const headerControls = document.getElementById('plans-header-controls');
  const createButton = document.getElementById('create-plan-button');
  const filterBar = document.getElementById('plans-filter-compact');
  const title = document.getElementById('plans-title');
  if (section) section.style.display = 'none';
  if (tabs) tabs.style.display = '';
  if (panelCard) panelCard.style.display = '';
  if (headerControls) headerControls.style.display = '';
  if (createButton) createButton.style.display = '';
  if (filterBar) filterBar.style.display = '';
  if (title) title.textContent = 'Production Planning';
  // Optionally scroll back to top
  setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 0);
}

// --- Rich Filters (Status / Priority / Type) ---

export const planFilters = {
  status: new Set(),
  priority: new Set(),
  type: new Set(),
};

export function togglePlanFilterPanel(name) {
  const panel = document.getElementById(`plan-filter-${name}-panel`);
  if (!panel) return;
  const isOpen = panel.style.display !== 'none';
  // Close all panels first
  ['status','priority','type'].forEach(n => { const p = document.getElementById(`plan-filter-${n}-panel`); if (p) p.style.display = 'none'; });
  panel.style.display = isOpen ? 'none' : 'block';
}

export function hidePlanFilterPanel(name) {
  const panel = document.getElementById(`plan-filter-${name}-panel`);
  if (panel) panel.style.display = 'none';
}

export function onPlanFilterChange(group, value, checked) {
  const set = planFilters[group];
  if (!set) return;
  if (checked) set.add(value); else set.delete(value);
  updatePlanFilterCounts();
  filterProductionPlans();
}

export function clearPlanFilter(group) {
  const set = planFilters[group];
  if (!set) return;
  set.clear();
  // Uncheck all checkboxes in that panel
  const panel = document.getElementById(`plan-filter-${group}-panel`);
  if (panel) panel.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = false);
  updatePlanFilterCounts();
  filterProductionPlans();
}

export function clearAllPlanFilters() {
  ['status','priority','type'].forEach(g => clearPlanFilter(g));
  updatePlanFilterCounts();
  filterProductionPlans();
}

export function updatePlanFilterCounts() {
  const setText = (id, count) => { const el = document.getElementById(id); if (el) el.textContent = count ? `(${count})` : ''; };
  setText('plan-filter-status-count', planFilters.status.size);
  setText('plan-filter-priority-count', planFilters.priority.size);
  setText('plan-filter-type-count', planFilters.type.size);
  const clearAllBtn = document.getElementById('plan-filter-clear-all');
  if (clearAllBtn) clearAllBtn.style.display = (planFilters.status.size || planFilters.priority.size || planFilters.type.size) ? '' : 'none';
}
