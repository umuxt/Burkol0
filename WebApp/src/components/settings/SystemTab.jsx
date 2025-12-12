import React, { useState, useEffect } from 'react';
import { showToast } from '../../../shared/components/MESToast.js';
import { Icon } from '../../../shared/components/Icons.jsx';
import '../../../domains/materials/styles/materials.css';



export default function SystemTab({ t }) {
  const [loading, setLoading] = useState(true);
  const [editMode, setEditMode] = useState(false);
  const [tempSettings, setTempSettings] = useState({});
  const [hasLocalChanges, setHasLocalChanges] = useState(false);
  const [settings, setSettings] = useState({
    lotTracking: true, // Default
    currency: 'TRY',
    dateFormat: 'DD.MM.YYYY',
    workerLogRetentionDays: 30, // Default 30 days
    workerInactivityTimeoutSeconds: 30 // Default 30 seconds
  });

  // Load settings on mount
  useEffect(() => {
    loadSettings();
  }, []);

  async function loadSettings() {
    try {
      setLoading(true);
      const token = localStorage.getItem('authToken');
      const res = await fetch('/api/settings/system', {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (res.ok) {
        const data = await res.json();
        setSettings(data);
      } else {
        console.error('Failed to load system settings');
      }
    } catch (error) {
      console.error('Error loading settings:', error);
    } finally {
      setLoading(false);
    }
  }

  async function saveSettings(newSettings) {
    try {
      const token = localStorage.getItem('authToken');
      const res = await fetch('/api/settings/system', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(newSettings)
      });

      if (res.ok) {
        const updated = await res.json();
        setSettings(updated);
        showToast('Sistem ayarları güncellendi', 'success');
      } else {
        showToast('Ayarlar kaydedilemedi', 'error');
      }
    } catch (error) {
      console.error('Error saving settings:', error);
      showToast('Bağlantı hatası', 'error');
    }
  }

  const startEditMode = () => {
    setTempSettings({ ...settings });
    setHasLocalChanges(false);
    setEditMode(true);
  };

  const handleCancelEdit = () => {
    setEditMode(false);
    setTempSettings({});
    setHasLocalChanges(false);
  };

  const normalizeNumber = (value, fallback) => {
    const parsed = parseInt(value, 10);
    return Number.isNaN(parsed) ? fallback : parsed;
  };

  const handleSave = () => {
    const payload = {
      ...settings,
      ...tempSettings,
      workerLogRetentionDays: normalizeNumber(
        tempSettings.workerLogRetentionDays,
        settings.workerLogRetentionDays || 30
      ),
      workerInactivityTimeoutSeconds: normalizeNumber(
        tempSettings.workerInactivityTimeoutSeconds,
        settings.workerInactivityTimeoutSeconds || 30
      ),
      currency: (tempSettings.currency || settings.currency || 'TRY').trim()
    };

    setSettings(payload);
    saveSettings(payload);
    setEditMode(false);
    setTempSettings({});
    setHasLocalChanges(false);
  };

  const handleToggleLotTracking = (e) => {
    const newValue = e.target.checked;
    if (editMode) {
      setTempSettings(prev => ({ ...prev, lotTracking: newValue }));
      setHasLocalChanges(true);
    } else {
      const newSettings = { ...settings, lotTracking: newValue };
      setSettings(newSettings); // Optimistic update
      saveSettings(newSettings);
    }
  };

  const handleNumberChange = (key, value, min, max) => {
    const parsed = parseInt(value, 10);
    let finalValue;

    if (Number.isNaN(parsed)) {
      finalValue = min;
    } else {
      finalValue = Math.min(Math.max(parsed, min), max);
    }

    setTempSettings(prev => ({ ...prev, [key]: finalValue }));
    setHasLocalChanges(true);
  };

  if (loading) {
    return React.createElement('div', { className: 'p-4 text-center' },
      React.createElement('div', { className: 'spinner' }),
      ' Ayarlar yükleniyor...'
    );
  }

  // Check for changes
  const hasChanges = editMode && (hasLocalChanges || JSON.stringify(tempSettings) !== JSON.stringify(settings));
  const displaySettings = editMode ? { ...settings, ...tempSettings } : settings;
  const currencySymbolMap = { TRY: '₺', USD: '$', EUR: '€', GBP: '£' };
  const currencySymbol = currencySymbolMap[displaySettings.currency] || displaySettings.currency || '$';

  return React.createElement('div', { className: 'materials-tab-content p-3' },

    /* --- CARD 1: ÜRETİM AYARLARI --- */
    React.createElement('div', { className: 'section-card-mb' },
      /* Level 1 Header */
      React.createElement('div', { className: 'section-header-with-action' },
        React.createElement('div', {
          className: 'd-flex align-items-center',
          style: { gap: '10px', flexWrap: 'nowrap', display: 'flex', alignItems: 'center' }
        },
          React.createElement(Icon, { name: 'Factory', size: 24, style: { display: 'block', color: '#111827' } }),
          React.createElement('h1', { className: 'm-0', style: { lineHeight: '1.2', display: 'flex', alignItems: 'center' } }, 'Üretim Ayarları')
        )
      ),

      /* Level 2: Worker Ayarları */
      React.createElement('div', { className: 'mt-3' },
        /* Level 2 Header */
        React.createElement('div', { className: 'section-header-with-action border-0 pb-0 mb-2' },
          React.createElement('div', {
            className: 'shipment-section-header m-0 d-flex align-items-center',
            style: { gap: '8px', flexWrap: 'nowrap', display: 'flex', alignItems: 'center' }
          },
            React.createElement(Icon, { name: 'Users', size: 16, style: { display: 'block', color: '#111827' } }),
            'Worker Ayarları'
          ),
          !editMode && React.createElement('button', {
            className: 'btn-secondary-sm d-inline-flex align-items-center',
            style: { gap: '8px', display: 'inline-flex', alignItems: 'center' },
            onClick: startEditMode
          }, React.createElement(Icon, { name: 'Edit', size: 14, style: { display: 'block', color: '#111827' } }), 'Düzenle')
        ),

        /* Details */
        React.createElement('div', { className: 'pl-3' },
          /* Log Retention */
          React.createElement('div', { className: 'detail-row' },
            React.createElement('span', { className: 'detail-label' }, 'Log Saklama (Gün):'),
            editMode ? (
              React.createElement('div', { className: 'd-flex align-items-center', style: { gap: '8px' } },
                React.createElement('input', {
                  type: 'number',
                  className: 'modal-input discount-input mr-2',
                  min: '1',
                  max: '365',
                  value: displaySettings.workerLogRetentionDays || 30,
                  onChange: (e) => handleNumberChange('workerLogRetentionDays', e.target.value, 1, 365)
                }),
                React.createElement('span', { className: 'text-sm text-gray-500' }, 'Gün')
              )
            ) : (
              React.createElement('span', { className: 'detail-value' }, `${settings.workerLogRetentionDays || 30} Gün`)
            )
          ),

          /* Timeout */
          React.createElement('div', { className: 'detail-row' },
            React.createElement('span', { className: 'detail-label' }, 'Oto. Çıkış (Sn):'),
            editMode ? (
              React.createElement('div', { className: 'd-flex align-items-center', style: { gap: '8px' } },
                React.createElement('input', {
                  type: 'number',
                  className: 'modal-input discount-input mr-2',
                  min: '10',
                  max: '3600',
                  value: displaySettings.workerInactivityTimeoutSeconds || 30,
                  onChange: (e) => handleNumberChange('workerInactivityTimeoutSeconds', e.target.value, 10, 3600)
                }),
                React.createElement('span', { className: 'text-sm text-gray-500' }, 'Saniye')
              )
            ) : (
              React.createElement('span', { className: 'detail-value' }, `${settings.workerInactivityTimeoutSeconds || 30} Saniye`)
            )
          ),

          /* Edit Actions - Only show if changed */
          editMode && hasChanges && React.createElement('div', {
            className: 'd-flex justify-content-end mt-3 gap-2',
            style: { flexWrap: 'nowrap' }
          },
            React.createElement('button', {
              className: 'btn-icon-cancel mr-2 d-flex align-items-center',
              style: { gap: '6px' },
              onClick: handleCancelEdit
            }, React.createElement(Icon, { name: 'X', size: 14, className: 'mr-1', style: { display: 'block' } }), 'İptal'),
            React.createElement('button', {
              className: 'btn-icon-save d-flex align-items-center',
              style: { gap: '6px' },
              onClick: handleSave
            }, React.createElement(Icon, { name: 'Save', size: 14, className: 'mr-1', style: { display: 'block' } }), 'Kaydet')
          ),

          /* Cancel button (always show if no changes but in edit mode) */
          editMode && !hasChanges && React.createElement('div', { className: 'd-flex justify-content-end mt-3' },
            React.createElement('button', {
              className: 'btn-icon-cancel d-flex align-items-center',
              onClick: handleCancelEdit
            }, 'Düzenlemeyi Bitir')
          )
        )
      )
    ),

    /* --- CARD 2: GENEL AYARLAR --- */
    React.createElement('div', { className: 'section-card-mb' },
      /* Level 1 Header */
        React.createElement('div', { className: 'section-header-with-action' },
        React.createElement('div', {
          className: 'd-flex align-items-center',
          style: { gap: '10px', flexWrap: 'nowrap', display: 'flex', alignItems: 'center' }
        },
          React.createElement(Icon, { name: 'Settings', size: 24, style: { display: 'block', color: '#111827' } }),
          React.createElement('h1', { className: 'm-0', style: { lineHeight: '1.2', display: 'flex', alignItems: 'center' } }, 'Genel Ayarlar')
        )
      ),

      /* Para Birimi */
      React.createElement('div', { className: 'detail-row' },
        React.createElement('span', { className: 'detail-label' }, 'Para Birimi:'),
        React.createElement('div', {
          className: 'd-flex align-items-center',
          style: { gap: '8px', display: 'flex', alignItems: 'center', flex: '0 0 auto' }
        },
          React.createElement('span', { style: { fontSize: '14px', fontWeight: 600, color: '#111827', minWidth: '18px', textAlign: 'center' } }, currencySymbol),
          React.createElement('select', {
            className: 'modal-input',
            value: displaySettings.currency || 'TRY',
            disabled: false,
            onChange: (e) => {
              const newCurrency = e.target.value;
              if (editMode) {
                setTempSettings(prev => ({ ...prev, currency: newCurrency }));
                setHasLocalChanges(true);
              } else {
                const newSettings = { ...settings, currency: newCurrency };
                setSettings(newSettings);
                saveSettings(newSettings);
              }
            },
            style: { width: '120px' }
          },
            ['TRY', 'USD', 'EUR', 'GBP'].map(code =>
              React.createElement('option', { key: code, value: code }, code)
            )
          )
        )
      ),

      /* Lot Takibi */
      React.createElement('div', { className: 'detail-row' },
        React.createElement('span', { className: 'detail-label' }, 'Lot Takibi:'),
        React.createElement('div', {
          className: 'd-flex align-items-center justify-content-between flex-grow-1',
          style: { gap: '12px', flexWrap: 'nowrap', display: 'flex', alignItems: 'center' }
        },
          React.createElement('span', {
            className: 'detail-value m-0',
            style: { color: displaySettings.lotTracking ? '#16a34a' : '#dc2626' }
          }, displaySettings.lotTracking ? 'Aktif' : 'Pasif'),
          React.createElement('div', { className: 'custom-control custom-switch' },
            React.createElement('input', {
              type: 'checkbox',
              className: 'custom-control-input',
              id: 'lotTrackingSwitch',
              checked: displaySettings.lotTracking,
              onChange: handleToggleLotTracking,
              style: { cursor: 'pointer' }
            }),
            React.createElement('label', { className: 'custom-control-label', htmlFor: 'lotTrackingSwitch' })
          )
        )
      )
    )
  );
}
