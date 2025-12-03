import React, { useState } from 'react';
import customersService from '../../services/customers-service.js';
import TurkeyAddressDropdown from '../../../../shared/components/TurkeyAddressDropdown.jsx';

export default function AddCustomerModal({ onClose, onSaved }) {
  const [form, setForm] = useState({
    // Temel Bilgiler
    name: '',
    company: '',
    // Yetkili Kişi
    contactPerson: '',
    contactTitle: '',
    // İletişim Bilgileri
    email: '',
    phone: '',
    fax: '',
    website: '',
    // Adres Bilgileri
    address: '',
    city: '',
    district: '',
    neighbourhood: '',
    country: 'Türkiye',
    postalCode: '',
    // Fatura Bilgileri
    taxOffice: '',
    taxNumber: '',
    iban: '',
    bankName: '',
    // Notlar
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
      style: { maxWidth: '700px', width: '90%', maxHeight: '90vh', overflow: 'auto' }
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
        // ===== TEMEL BİLGİLER =====
        React.createElement('div', { className: 'form-section' },
          React.createElement('h3', { style: { marginBottom: '1rem', fontSize: '1rem', fontWeight: 600, color: '#1f2937' } }, 
            '📋 Temel Bilgiler'
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

        // ===== YETKİLİ KİŞİ =====
        React.createElement('div', { className: 'form-section' },
          React.createElement('h3', { style: { marginBottom: '1rem', fontSize: '1rem', fontWeight: 600, color: '#1f2937' } }, 
            '👤 Yetkili Kişi'
          ),
          
          React.createElement('div', { className: 'form-row' },
            React.createElement('div', { className: 'form-group', style: { flex: 1 } },
              React.createElement('label', null, 'Yetkili Adı'),
              React.createElement('input', {
                type: 'text',
                value: form.contactPerson,
                onChange: (e) => handleInputChange('contactPerson', e.target.value),
                className: 'form-control',
                placeholder: 'İletişim kurulacak kişi'
              })
            ),
            React.createElement('div', { className: 'form-group', style: { flex: 1 } },
              React.createElement('label', null, 'Unvan'),
              React.createElement('input', {
                type: 'text',
                value: form.contactTitle,
                onChange: (e) => handleInputChange('contactTitle', e.target.value),
                className: 'form-control',
                placeholder: 'Örn: Satın Alma Müdürü'
              })
            )
          )
        ),

        // ===== İLETİŞİM BİLGİLERİ =====
        React.createElement('div', { className: 'form-section' },
          React.createElement('h3', { style: { marginBottom: '1rem', fontSize: '1rem', fontWeight: 600, color: '#1f2937' } }, 
            '📞 İletişim Bilgileri'
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

          React.createElement('div', { className: 'form-row' },
            React.createElement('div', { className: 'form-group', style: { flex: 1 } },
              React.createElement('label', null, 'Faks'),
              React.createElement('input', {
                type: 'tel',
                value: form.fax,
                onChange: (e) => handleInputChange('fax', e.target.value),
                className: 'form-control',
                placeholder: '0212 555 55 55'
              })
            ),
            React.createElement('div', { className: 'form-group', style: { flex: 1 } },
              React.createElement('label', null, 'Website'),
              React.createElement('input', {
                type: 'text',
                value: form.website,
                onChange: (e) => handleInputChange('website', e.target.value),
                className: 'form-control',
                placeholder: 'www.sirket.com'
              })
            )
          )
        ),

        // ===== ADRES BİLGİLERİ =====
        React.createElement('div', { className: 'form-section' },
          React.createElement('h3', { style: { marginBottom: '1rem', fontSize: '1rem', fontWeight: 600, color: '#1f2937' } }, 
            '📍 Adres Bilgileri'
          ),

          React.createElement('div', { className: 'form-group' },
            React.createElement('label', null, 'Adres'),
            React.createElement('textarea', {
              value: form.address,
              onChange: (e) => handleInputChange('address', e.target.value),
              className: 'form-control',
              placeholder: 'Sokak, Mahalle, Cadde...',
              rows: 2
            })
          ),

          // Türkiye Adres Dropdown
          React.createElement(TurkeyAddressDropdown, {
            country: form.country,
            city: form.city,
            district: form.district || '',
            neighbourhood: form.neighbourhood || '',
            postalCode: form.postalCode,
            onChange: ({ country, city, district, neighbourhood, postalCode }) => {
              setForm(prev => ({ ...prev, country, city, district, neighbourhood, postalCode }));
            }
          })
        ),

        // ===== FATURA BİLGİLERİ =====
        React.createElement('div', { className: 'form-section' },
          React.createElement('h3', { style: { marginBottom: '1rem', fontSize: '1rem', fontWeight: 600, color: '#1f2937' } }, 
            '💰 Fatura Bilgileri'
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
          ),

          React.createElement('div', { className: 'form-row' },
            React.createElement('div', { className: 'form-group', style: { flex: 1 } },
              React.createElement('label', null, 'IBAN'),
              React.createElement('input', {
                type: 'text',
                value: form.iban,
                onChange: (e) => handleInputChange('iban', e.target.value),
                className: 'form-control',
                placeholder: 'TR00 0000 0000 0000 0000 0000 00'
              })
            ),
            React.createElement('div', { className: 'form-group', style: { flex: 1 } },
              React.createElement('label', null, 'Banka Adı'),
              React.createElement('input', {
                type: 'text',
                value: form.bankName,
                onChange: (e) => handleInputChange('bankName', e.target.value),
                className: 'form-control',
                placeholder: 'Banka adı'
              })
            )
          )
        ),

        // ===== NOTLAR =====
        React.createElement('div', { className: 'form-section' },
          React.createElement('h3', { style: { marginBottom: '1rem', fontSize: '1rem', fontWeight: 600, color: '#1f2937' } }, 
            '📝 Notlar'
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
