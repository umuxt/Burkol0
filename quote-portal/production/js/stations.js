// Station management (modal & actions)
import { MESData, saveData } from './state.js';
import { showToast } from './ui.js';

export let editingStationId = null;

export function openAddStationModal() {
  editingStationId = null;
  document.getElementById('station-modal-title').textContent = 'Add New Station';
  document.getElementById('station-name').value = '';
  document.getElementById('station-description').value = '';
  document.getElementById('station-location').value = '';
  document.getElementById('station-status').value = 'active';
  document.querySelectorAll('#station-capabilities input[type="checkbox"]').forEach(cb => { cb.checked = false; });
  document.getElementById('station-modal').style.display = 'block';
}

export function editStation(stationId) {
  editingStationId = stationId;
  const station = MESData.stations.find(s => s.id === stationId);
  if (!station) return;
  document.getElementById('station-modal-title').textContent = 'Edit Station';
  document.getElementById('station-name').value = station.name || '';
  document.getElementById('station-description').value = station.description || '';
  document.getElementById('station-location').value = station.location || '';
  document.getElementById('station-status').value = station.status || 'active';
  const caps = new Set((station.capabilities || []));
  document.querySelectorAll('#station-capabilities input[type="checkbox"]').forEach(cb => { cb.checked = caps.has(cb.value); });
  document.getElementById('station-modal').style.display = 'block';
}

export function closeStationModal(event) {
  if (event && event.target !== event.currentTarget) return;
  document.getElementById('station-modal').style.display = 'none';
}

export function saveStation() {
  const name = document.getElementById('station-name').value.trim();
  const description = document.getElementById('station-description').value.trim();
  const location = document.getElementById('station-location').value.trim();
  const status = document.getElementById('station-status').value;
  const capabilities = Array.from(document.querySelectorAll('#station-capabilities input[type="checkbox"]:checked')).map(cb => cb.value);

  if (!name) { showToast('Please enter a station name', 'error'); return; }

  if (editingStationId) {
    const stationIndex = MESData.stations.findIndex(s => s.id === editingStationId);
    if (stationIndex !== -1) {
      MESData.stations[stationIndex] = { ...MESData.stations[stationIndex], name, description, location, status, capabilities };
    }
  } else {
    const newStation = { id: 's-' + String(Date.now()).slice(-6), name, description, location, status, capabilities, currentWorker: null, currentOperation: null };
    MESData.stations.push(newStation);
  }
  saveData();
  document.getElementById('station-modal').style.display = 'none';
  // navigation refresh will be handled by caller (navigateToView)
  showToast((editingStationId ? 'Station updated' : 'Station added') + ' successfully', 'success');
}

export function toggleStationStatus(stationId) {
  const station = MESData.stations.find(s => s.id === stationId);
  if (!station) return;
  station.status = station.status === 'active' ? 'maintenance' : 'active';
  if (station.status === 'maintenance') { station.currentWorker = null; station.currentOperation = null; }
  saveData();
  showToast('Station status updated', 'success');
}

export function deleteStation(stationId) {
  if (!confirm('Are you sure you want to delete this station? This action cannot be undone.')) return;
  const stationIndex = MESData.stations.findIndex(s => s.id === stationId);
  if (stationIndex !== -1) {
    MESData.stations.splice(stationIndex, 1);
    saveData();
    showToast('Station deleted successfully', 'success');
  }
}

