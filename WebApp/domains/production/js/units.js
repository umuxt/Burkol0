// Central unit definitions and helpers

export const UNITS = [
  { value: '', label: 'Birim seçin' },
  { value: 'kg', label: 'kg' },
  { value: 'adet', label: 'adet' },
  { value: 'm', label: 'm' },
  { value: 'm²', label: 'm²' },
  { value: 'm³', label: 'm³' },
  { value: 'litre', label: 'litre' }
];

export function populateUnitSelect(selectEl, selectedValue = '') {
  if (!selectEl) return;
  selectEl.innerHTML = UNITS.map(u => `<option value="${u.value}">${u.label}</option>`).join('');
  if (selectedValue != null) selectEl.value = selectedValue;
}

