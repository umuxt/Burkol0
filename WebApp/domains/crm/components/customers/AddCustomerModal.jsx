import React, { useState } from 'react';
import customersService from '../../services/customers-service.js';

export default function AddCustomerModal({ onClose, onSaved }) {
  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    company: '',
    taxOffice: '',
    taxNumber: '',
    address: '',
    notes: ''
  });
  const [saving, setSaving] = useState(false);

  function handleInputChange(field, value) {
    setForm(prev => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    
    if (!form.name?.trim()) {
      alert('Müşteri adı gereklidir');
      return;
    }

    try {
      setSaving(true);
      await customersService.createCustomer(form);
      onSaved();
      onClose();
    } catch (error) {
      console.error('Failed to create customer:', error);
      alert('Müşteri oluşturulamadı');
    } finally {
      setSaving(false);
    }
  }

  return React.createElement('div', { 
    className: 'modal-overlay',
    onClick: onClose 
  },
    React.createElement('div', {
      className: 'modal-content',
      onClick: (e) => e.stopPropagation(),
      style: { maxWidth: '600px', width: '90%' }
    },
      // Header
      React.createElement('div', { className: 'modal-header' },
        React.createElement('h2', null, 'Yeni Müşteri Ekle'),
        React.createElement('button', {
          className: 'modal-close',
          onClick: onClose
        }, '×')
      ),

      // Form
      React.createElement('form', { 
        className: 'modal-body',
        onSubmit: handleSubmit
      },
        // Basic Info
        React.createElement('div', { className: 'form-section' },
          React.createElement('h3', { style: { marginBottom: '1rem', fontSize: '1rem', fontWeight: 600 } }, 
            'Temel Bilgiler'
          ),
          
          React.createElement('div', { className: 'form-group' },
            React.createElement('label', null, 'Müşteri Adı *'),
            React.createElement('input', {
              type: 'text',
              value: form.name,
              onChange: (e) => handleInputChange('name', e.target.value),
              className: 'form-control',
              placeholder: 'Ad Soyad',
              required: true,
              autoFocus: true
            })
          ),

          React.createElement('div', { className: 'form-group' },
            React.createElement('label', null, 'Şirket'),
            React.createElement('input', {
              type: 'text',
              value: form.company,
              onChange: (e) => handleInputChange('company', e.target.value),
              className: 'form-control',
              placeholder: 'Şirket Adı'
            })
          )
        ),

        // Contact Info
        React.createElement('div', { className: 'form-section' },
          React.createElement('h3', { style: { marginBottom: '1rem', fontSize: '1rem', fontWeight: 600 } }, 
            'İletişim Bilgileri'
          ),
          
          React.createElement('div', { className: 'form-row' },
            React.createElement('div', { className: 'form-group', style: { flex: 1 } },
              React.createElement('label', null, 'E-posta'),
              React.createElement('input', {
                type: 'email',
                value: form.email,
                onChange: (e) => handleInputChange('email', e.target.value),
                className: 'form-control',
                placeholder: 'ornek@email.com'
              })
            ),
            React.createElement('div', { className: 'form-group', style: { flex: 1 } },
              React.createElement('label', null, 'Telefon'),
              React.createElement('input', {
                type: 'tel',
                value: form.phone,
                onChange: (e) => handleInputChange('phone', e.target.value),
                className: 'form-control',
                placeholder: '0555 555 55 55'
              })
            )
          ),

          React.createElement('div', { className: 'form-group' },
            React.createElement('label', null, 'Adres'),
            React.createElement('textarea', {
              value: form.address,
              onChange: (e) => handleInputChange('address', e.target.value),
              className: 'form-control',
              placeholder: 'Adres bilgisi',
              rows: 2
            })
          )
        ),

        // Tax Info
        React.createElement('div', { className: 'form-section' },
          React.createElement('h3', { style: { marginBottom: '1rem', fontSize: '1rem', fontWeight: 600 } }, 
            'Fatura Bilgileri (Opsiyonel)'
          ),
          
          React.createElement('div', { className: 'form-row' },
            React.createElement('div', { className: 'form-group', style: { flex: 1 } },
              React.createElement('label', null, 'Vergi Dairesi'),
              React.createElement('input', {
                type: 'text',
                value: form.taxOffice,
                onChange: (e) => handleInputChange('taxOffice', e.target.value),
                className: 'form-control',
                placeholder: 'Vergi Dairesi'
              })
            ),
            React.createElement('div', { className: 'form-group', style: { flex: 1 } },
              React.createElement('label', null, 'Vergi No'),
              React.createElement('input', {
                type: 'text',
                value: form.taxNumber,
                onChange: (e) => handleInputChange('taxNumber', e.target.value),
                className: 'form-control',
                placeholder: 'Vergi Numarası'
              })
            )
          )
        ),

        // Notes
        React.createElement('div', { className: 'form-section' },
          React.createElement('h3', { style: { marginBottom: '1rem', fontSize: '1rem', fontWeight: 600 } }, 
            'Notlar'
          ),
          
          React.createElement('div', { className: 'form-group' },
            React.createElement('textarea', {
              value: form.notes,
              onChange: (e) => handleInputChange('notes', e.target.value),
              className: 'form-control',
              placeholder: 'Müşteri hakkında notlar...',
              rows: 3
            })
          )
        )
      ),

      // Footer
      React.createElement('div', { className: 'modal-footer' },
        React.createElement('button', {
          type: 'button',
          className: 'btn-secondary',
          onClick: onClose,
          disabled: saving
        }, 'İptal'),
        React.createElement('button', {
          type: 'submit',
          className: 'btn-primary',
          onClick: handleSubmit,
          disabled: saving
        }, saving ? 'Kaydediliyor...' : 'Kaydet')
      )
    )
  );
}
