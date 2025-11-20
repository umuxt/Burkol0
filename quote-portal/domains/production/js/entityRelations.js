/**
 * ============================================================================
 * STEP 10: ENTITY RELATIONS MODULE
 * ============================================================================
 * Polymorphic entity relations UI module
 * Replaces junction table queries with polymorphic API
 * 
 * Features:
 * - Node → Station assignment with priority
 * - Worker → Station assignment
 * - Station → Operation mapping
 * - Drag-drop priority management
 * - Visual priority indicators (green #1, gray #2+)
 */

const API_BASE = window.location.origin;

// ============================================================================
// API FUNCTIONS
// ============================================================================

/**
 * Fetch entity relations
 * @param {Object} params - Query parameters
 * @param {string} params.sourceType - 'worker' | 'station' | 'node'
 * @param {string} params.sourceId - ID of source entity
 * @param {string} params.relationType - 'station' | 'operation' | 'substation' | 'predecessor'
 * @param {string} [params.targetId] - Optional target filter
 * @returns {Promise<Array>} Relations array
 */
export async function fetchEntityRelations({ sourceType, sourceId, relationType, targetId }) {
  try {
    const params = new URLSearchParams({
      sourceType,
      sourceId,
      relationType
    });

    if (targetId) {
      params.append('targetId', targetId);
    }

    const response = await fetch(`${API_BASE}/api/mes/entity-relations?${params}`, {
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch relations: ${response.statusText}`);
    }

    const data = await response.json();
    return data.relations || [];

  } catch (err) {
    console.error('Failed to fetch entity relations:', err);
    throw err;
  }
}

/**
 * Create a new entity relation
 * @param {Object} relation - Relation data
 * @param {string} relation.sourceType
 * @param {string} relation.sourceId
 * @param {string} relation.relationType
 * @param {string} relation.targetId
 * @param {number} [relation.priority]
 * @returns {Promise<Object>} Created relation
 */
export async function createEntityRelation(relation) {
  try {
    const response = await fetch(`${API_BASE}/api/mes/entity-relations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      },
      body: JSON.stringify(relation)
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to create relation');
    }

    const data = await response.json();
    return data.relation;

  } catch (err) {
    console.error('Failed to create entity relation:', err);
    throw err;
  }
}

/**
 * Update entity relation (primarily for priority changes)
 * @param {number} id - Relation ID
 * @param {Object} updates - Updates
 * @param {number} [updates.priority]
 * @returns {Promise<Object>} Updated relation
 */
export async function updateEntityRelation(id, updates) {
  try {
    const response = await fetch(`${API_BASE}/api/mes/entity-relations/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      },
      body: JSON.stringify(updates)
    });

    if (!response.ok) {
      throw new Error('Failed to update relation');
    }

    const data = await response.json();
    return data.relation;

  } catch (err) {
    console.error('Failed to update entity relation:', err);
    throw err;
  }
}

/**
 * Delete entity relation
 * @param {number} id - Relation ID
 * @returns {Promise<boolean>} Success
 */
export async function deleteEntityRelation(id) {
  try {
    const response = await fetch(`${API_BASE}/api/mes/entity-relations/${id}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      }
    });

    if (!response.ok) {
      throw new Error('Failed to delete relation');
    }

    return true;

  } catch (err) {
    console.error('Failed to delete entity relation:', err);
    throw err;
  }
}

/**
 * Batch update relations (for drag-drop priority reordering)
 * @param {Array} relations - Array of {id, priority}
 * @returns {Promise<boolean>} Success
 */
export async function batchUpdateRelations(relations) {
  try {
    const response = await fetch(`${API_BASE}/api/mes/entity-relations/batch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      },
      body: JSON.stringify({ relations })
    });

    if (!response.ok) {
      throw new Error('Failed to batch update relations');
    }

    return true;

  } catch (err) {
    console.error('Failed to batch update relations:', err);
    throw err;
  }
}

// ============================================================================
// UI RENDERING FUNCTIONS
// ============================================================================

/**
 * Render entity relations list with priority badges
 * @param {Array} relations - Relations from API
 * @param {Object} options - Rendering options
 * @param {boolean} [options.showPriority=true] - Show priority badges
 * @param {boolean} [options.editable=true] - Enable drag-drop
 * @param {Function} [options.onDelete] - Delete callback
 * @param {Function} [options.onReorder] - Reorder callback
 * @returns {string} HTML string
 */
export function renderRelationsList(relations, options = {}) {
  const {
    showPriority = true,
    editable = true,
    onDelete,
    onReorder
  } = options;

  if (!relations || relations.length === 0) {
    return `
      <div class="empty-state">
        <div class="empty-icon">🔗</div>
        <p>Henüz ilişki tanımlanmamış</p>
      </div>
    `;
  }

  // Sort by priority
  const sortedRelations = [...relations].sort((a, b) => {
    if (a.priority === null && b.priority === null) return 0;
    if (a.priority === null) return 1;
    if (b.priority === null) return -1;
    return a.priority - b.priority;
  });

  const rows = sortedRelations.map((relation, index) => {
    const isPrimary = relation.priority === 1;
    const priorityClass = isPrimary ? 'priority-primary' : 'priority-fallback';
    const priorityBadge = showPriority && relation.priority
      ? `<span class="priority-badge ${priorityClass}">#${relation.priority}</span>`
      : '';

    const dragHandle = editable 
      ? `<div class="drag-handle" draggable="true">⋮⋮</div>`
      : '';

    const deleteButton = editable && onDelete
      ? `<button class="btn-icon btn-delete" onclick="window.${onDelete.name}(${relation.id})">
           ❌
         </button>`
      : '';

    return `
      <div class="relation-row ${priorityClass}" data-relation-id="${relation.id}" data-priority="${relation.priority || 999}">
        ${dragHandle}
        <div class="relation-info">
          ${priorityBadge}
          <div class="relation-name">${relation.targetName || relation.targetId}</div>
          <div class="relation-details">
            ${relation.targetDetails?.code || ''}
            ${relation.targetDetails?.type ? `• ${relation.targetDetails.type}` : ''}
          </div>
        </div>
        ${deleteButton}
      </div>
    `;
  }).join('');

  return `
    <div class="relations-list ${editable ? 'editable' : ''}" data-reorder-callback="${onReorder?.name || ''}">
      ${rows}
    </div>
  `;
}

/**
 * Render node → station assignment UI
 * @param {string} nodeId - Node ID
 * @param {Array} assignedStations - Current assigned stations
 * @param {Array} availableStations - All available stations
 * @returns {string} HTML string
 */
export function renderNodeStationAssignment(nodeId, assignedStations, availableStations) {
  return `
    <div class="entity-relation-section">
      <div class="section-header">
        <h3>İstasyon Atamaları</h3>
        <button class="btn-primary" onclick="window.showAddStationModal('${nodeId}')">
          + İstasyon Ekle
        </button>
      </div>

      <div class="section-description">
        <p><strong>Primary (#1):</strong> Ana istasyon (yeşil) - öncelikli olarak kullanılır</p>
        <p><strong>Fallback (#2+):</strong> Yedek istasyonlar (gri) - ana meşgulse kullanılır</p>
        <p><em>Sürükle-bırak ile öncelik sıralamasını değiştirebilirsiniz</em></p>
      </div>

      ${renderRelationsList(assignedStations, {
        showPriority: true,
        editable: true,
        onDelete: handleDeleteStationRelation,
        onReorder: handleReorderStations
      })}
    </div>

    <!-- Add Station Modal -->
    <div id="addStationModal" class="modal" style="display: none;">
      <div class="modal-content">
        <div class="modal-header">
          <h2>İstasyon Ekle</h2>
          <button class="modal-close" onclick="window.closeAddStationModal()">×</button>
        </div>
        <div class="modal-body">
          <label>İstasyon Seçin:</label>
          <select id="stationSelect" class="form-control">
            <option value="">-- Seçiniz --</option>
            ${availableStations.map(station => `
              <option value="${station.id}">
                ${station.name} (${station.code}) - ${station.type}
              </option>
            `).join('')}
          </select>

          <label>Öncelik:</label>
          <select id="prioritySelect" class="form-control">
            <option value="1">1 - Primary (Ana İstasyon)</option>
            <option value="2">2 - Fallback (Yedek)</option>
            <option value="3">3 - Fallback (Yedek)</option>
            <option value="4">4 - Fallback (Yedek)</option>
          </select>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" onclick="window.closeAddStationModal()">İptal</button>
          <button class="btn-primary" onclick="window.saveStationRelation('${nodeId}')">Kaydet</button>
        </div>
      </div>
    </div>
  `;
}

/**
 * Render worker → station assignment dropdown
 * @param {string} workerId - Worker ID
 * @param {Array} assignedStations - Assigned stations
 * @returns {string} HTML string
 */
export function renderWorkerStationDropdown(workerId, assignedStations) {
  return `
    <select class="form-control" id="workerStationSelect">
      <option value="">-- İstasyon Seçiniz --</option>
      ${assignedStations.map(relation => `
        <option value="${relation.targetId}">
          ${relation.targetName} ${relation.priority === 1 ? '⭐' : ''}
        </option>
      `).join('')}
    </select>
  `;
}

/**
 * Render station → operation mapping
 * @param {string} stationId - Station ID
 * @param {Array} assignedOperations - Assigned operations
 * @returns {string} HTML string
 */
export function renderStationOperations(stationId, assignedOperations) {
  return `
    <div class="entity-relation-section">
      <div class="section-header">
        <h3>Operasyonlar</h3>
        <button class="btn-primary" onclick="window.showAddOperationModal('${stationId}')">
          + Operasyon Ekle
        </button>
      </div>

      ${renderRelationsList(assignedOperations, {
        showPriority: false,
        editable: true,
        onDelete: handleDeleteOperationRelation
      })}
    </div>
  `;
}

// ============================================================================
// DRAG-DROP PRIORITY MANAGEMENT
// ============================================================================

let draggedElement = null;
let draggedRelationId = null;

/**
 * Initialize drag-drop for relations list
 * @param {HTMLElement} container - Container element
 */
export function initializeDragDrop(container) {
  const rows = container.querySelectorAll('.relation-row');

  rows.forEach(row => {
    const dragHandle = row.querySelector('.drag-handle');
    if (!dragHandle) return;

    dragHandle.addEventListener('dragstart', (e) => {
      draggedElement = row;
      draggedRelationId = row.dataset.relationId;
      row.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    });

    row.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';

      if (draggedElement && draggedElement !== row) {
        const rect = row.getBoundingClientRect();
        const midpoint = rect.top + rect.height / 2;
        
        if (e.clientY < midpoint) {
          row.parentNode.insertBefore(draggedElement, row);
        } else {
          row.parentNode.insertBefore(draggedElement, row.nextSibling);
        }
      }
    });

    dragHandle.addEventListener('dragend', (e) => {
      row.classList.remove('dragging');
      draggedElement = null;
      draggedRelationId = null;

      // Update priorities based on new order
      updatePrioritiesFromDOM(container);
    });
  });
}

/**
 * Update priorities based on current DOM order
 * @param {HTMLElement} container - Container element
 */
async function updatePrioritiesFromDOM(container) {
  const rows = container.querySelectorAll('.relation-row');
  const updates = [];

  rows.forEach((row, index) => {
    const relationId = parseInt(row.dataset.relationId);
    const newPriority = index + 1;
    updates.push({ id: relationId, priority: newPriority });

    // Update UI
    row.dataset.priority = newPriority;
    const badge = row.querySelector('.priority-badge');
    if (badge) {
      badge.textContent = `#${newPriority}`;
      badge.className = newPriority === 1 ? 'priority-badge priority-primary' : 'priority-badge priority-fallback';
    }

    row.className = newPriority === 1 ? 'relation-row priority-primary' : 'relation-row priority-fallback';
  });

  // Batch update to backend
  try {
    await batchUpdateRelations(updates);
    console.log('✅ Priorities updated successfully');
    
    // Call callback if specified
    const callbackName = container.dataset.reorderCallback;
    if (callbackName && window[callbackName]) {
      window[callbackName](updates);
    }
  } catch (err) {
    console.error('Failed to update priorities:', err);
    alert('Öncelik güncellemesi başarısız oldu. Lütfen tekrar deneyin.');
  }
}

// ============================================================================
// MODAL HANDLERS
// ============================================================================

window.showAddStationModal = function(nodeId) {
  const modal = document.getElementById('addStationModal');
  if (modal) {
    modal.style.display = 'block';
    modal.dataset.nodeId = nodeId;
  }
};

window.closeAddStationModal = function() {
  const modal = document.getElementById('addStationModal');
  if (modal) {
    modal.style.display = 'none';
    document.getElementById('stationSelect').value = '';
    document.getElementById('prioritySelect').value = '1';
  }
};

window.saveStationRelation = async function(nodeId) {
  const stationId = document.getElementById('stationSelect').value;
  const priority = parseInt(document.getElementById('prioritySelect').value);

  if (!stationId) {
    alert('Lütfen bir istasyon seçin');
    return;
  }

  try {
    await createEntityRelation({
      sourceType: 'node',
      sourceId: nodeId,
      relationType: 'station',
      targetId: stationId,
      priority: priority
    });

    window.closeAddStationModal();
    
    // Refresh UI
    if (window.refreshNodeStations) {
      window.refreshNodeStations(nodeId);
    }

    console.log('✅ Station relation created');
  } catch (err) {
    console.error('Failed to create station relation:', err);
    alert('İstasyon ataması başarısız oldu: ' + err.message);
  }
};

window.handleDeleteStationRelation = async function(relationId) {
  if (!confirm('Bu istasyon atamasını silmek istediğinizden emin misiniz?')) {
    return;
  }

  try {
    await deleteEntityRelation(relationId);
    
    // Remove from UI
    const row = document.querySelector(`[data-relation-id="${relationId}"]`);
    if (row) {
      row.remove();
    }

    console.log('✅ Station relation deleted');
  } catch (err) {
    console.error('Failed to delete station relation:', err);
    alert('Silme işlemi başarısız oldu: ' + err.message);
  }
};

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize entity relations module
 */
export function initEntityRelations() {
  console.log('🔗 Entity Relations module initialized');

  // Initialize drag-drop for all relations lists
  document.querySelectorAll('.relations-list.editable').forEach(container => {
    initializeDragDrop(container);
  });

  // Auto-initialize when new content is added
  const observer = new MutationObserver((mutations) => {
    mutations.forEach(mutation => {
      mutation.addedNodes.forEach(node => {
        if (node.nodeType === 1) { // Element node
          const lists = node.classList?.contains('relations-list')
            ? [node]
            : node.querySelectorAll?.('.relations-list.editable') || [];
          
          lists.forEach(list => initializeDragDrop(list));
        }
      });
    });
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
}

// Auto-initialize on DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initEntityRelations);
} else {
  initEntityRelations();
}

export default {
  fetchEntityRelations,
  createEntityRelation,
  updateEntityRelation,
  deleteEntityRelation,
  batchUpdateRelations,
  renderRelationsList,
  renderNodeStationAssignment,
  renderWorkerStationDropdown,
  renderStationOperations,
  initializeDragDrop,
  initEntityRelations
};
