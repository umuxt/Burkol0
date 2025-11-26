import React, { useState, useEffect } from 'react';
import { showToast } from '../../../shared/components/MESToast.js';

export default function SystemTab({ t }) {
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState({
    lotTracking: true, // Default
    currency: 'TRY',
    dateFormat: 'DD.MM.YYYY'
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

  const handleToggleLotTracking = (e) => {
    const newValue = e.target.checked;
    const newSettings = { ...settings, lotTracking: newValue };
    setSettings(newSettings); // Optimistic update
    saveSettings(newSettings);
  };

  if (loading) {
    return React.createElement('div', { className: 'p-4 text-center' }, 
      React.createElement('div', { className: 'spinner' }),
      ' Ayarlar yükleniyor...'
    );
  }

  return React.createElement('div', { className: 'system-settings' },
    React.createElement('div', { className: 'card mb-4' },
      React.createElement('h3', null, 
        React.createElement('i', { className: 'fas fa-microchip mr-2' }), 
        'Üretim Ayarları'
      ),
      
      // Lot Tracking Toggle
      React.createElement('div', { className: 'form-group', style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem 0', borderBottom: '1px solid #eee' } },
        React.createElement('div', null,
          React.createElement('label', { className: 'mb-1 d-block' }, 'Lot Takibi'),
          React.createElement('small', { className: 'text-muted' }, 
            settings.lotTracking 
              ? 'Lot takibi aktif. Stok hareketleri ve üretim işlemleri lot numarası ile izlenir.'
              : 'Lot takibi kapalı. Stok hareketleri sadece miktar bazlı takip edilir.'
          )
        ),
        React.createElement('div', { className: 'custom-control custom-switch' },
          React.createElement('input', {
            type: 'checkbox',
            className: 'custom-control-input',
            id: 'lotTrackingSwitch',
            checked: settings.lotTracking,
            onChange: handleToggleLotTracking,
            style: { transform: 'scale(1.5)', cursor: 'pointer' }
          })
        )
      )
    ),

    React.createElement('div', { className: 'card' },
      React.createElement('h3', null, 
        React.createElement('i', { className: 'fas fa-globe mr-2' }), 
        'Genel Ayarlar'
      ),
      
      // Currency (Read-only for now)
      React.createElement('div', { className: 'form-group mb-3' },
        React.createElement('label', null, 'Para Birimi'),
        React.createElement('input', { 
          type: 'text', 
          className: 'form-control', 
          value: settings.currency || 'TRY', 
          disabled: true 
        }),
        React.createElement('small', { className: 'text-muted' }, 'Sistem genelinde kullanılan para birimi.')
      )
    )
  );
}
