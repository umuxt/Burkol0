import React, { useState, useEffect } from 'react';
import { ArrowLeft } from '../../../../shared/components/Icons.jsx';

export default function CustomerDetailsPanel({ 
  customer,
  onClose, 
  onSave,
  onDelete
}) {
  const [editing, setEditing] = useState(false);
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

  // Initialize form when customer changes
  useEffect(() => {
    if (customer) {
      setForm({
        name: customer.name || '',
        email: customer.email || '',
        phone: customer.phone || '',
        company: customer.company || '',
        taxOffice: customer.taxOffice || '',
        taxNumber: customer.taxNumber || '',
        address: customer.address || '',
        notes: customer.notes || ''
      });
      setEditing(false);
    }
  }, [customer?.id]);

  function handleInputChange(field, value) {
    setForm(prev => ({ ...prev, [field]: value }));
  }

  async function handleSave() {
    if (!form.name?.trim()) {
      alert('Müşteri adı gereklidir');
      return;
    }

    try {
      await onSave(customer.id, form);
      setEditing(false);
    } catch (error) {
      console.error('Save failed:', error);
      alert('Kaydetme başarısız oldu');
    }
  }

  function handleCancel() {
    // Reset form
    setForm({
      name: customer.name || '',
      email: customer.email || '',
      phone: customer.phone || '',
      company: customer.company || '',
      taxOffice: customer.taxOffice || '',
      taxNumber: customer.taxNumber || '',
      address: customer.address || '',
      notes: customer.notes || ''
    });
    setEditing(false);
  }

  async function handleDelete() {
    if (confirm('Bu müşteriyi silmek istediğinizden emin misiniz?')) {
      await onDelete(customer.id);
      onClose();
    }
  }

  return React.createElement('div', { className: 'quote-detail-panel' },
    // Header
    React.createElement('div', { 
      style: {
        padding: '16px 20px',
        borderBottom: '1px solid #e5e7eb',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }
    },
      React.createElement('div', { 
        style: { display: 'flex', alignItems: 'center', gap: '12px' } 
      },
        React.createElement('button', {
          title: 'Detayları Kapat',
          style: {
            padding: '6px 12px',
            border: '1px solid #d1d5db',
            borderRadius: '4px',
            background: 'white',
            color: '#374151',
            cursor: 'pointer',
            fontSize: '12px'
          },
          onClick: onClose
        },
          React.createElement(ArrowLeft, { size: 14 })
        ),
        React.createElement('h3', { 
          style: { margin: 0, fontSize: '16px', fontWeight: 600, color: '#111827' } 
        }, 'Müşteri Detayları')
      ),
      React.createElement('div', { 
        style: { display: 'flex', gap: '8px', alignItems: 'center' } 
      },
        editing ? (
          React.createElement(React.Fragment, null,
            React.createElement('button', {
              style: {
                padding: '6px 12px',
                border: '1px solid #d1d5db',
                borderRadius: '4px',
                background: 'white',
                color: '#374151',
                cursor: 'pointer',
                fontSize: '12px',
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
              },
              onClick: handleCancel
            }, 'İptal'),
            React.createElement('button', {
              style: {
                padding: '6px 12px',
                border: 'none',
                borderRadius: '4px',
                background: '#3b82f6',
                color: 'white',
                cursor: 'pointer',
                fontSize: '12px',
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
              },
              onClick: handleSave
            }, 'Kaydet')
          )
        ) : (
          React.createElement(React.Fragment, null,
            React.createElement('button', {
              style: {
                padding: '6px 12px',
                border: '1px solid #d1d5db',
                borderRadius: '4px',
                background: 'white',
                color: '#374151',
                cursor: 'pointer',
                fontSize: '12px',
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
              },
              onClick: () => setEditing(true)
            }, '✏️ Düzenle'),
            React.createElement('button', {
              style: {
                padding: '6px 12px',
                border: '1px solid #dc2626',
                borderRadius: '4px',
                background: 'white',
                color: '#dc2626',
                cursor: 'pointer',
                fontSize: '12px',
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
              },
              onClick: handleDelete
            }, '🗑️ Sil')
          )
        )
      )
    ),

    // Content
    React.createElement('div', { 
      style: { flex: '1 1 0%', overflow: 'auto', padding: '20px' } 
    },
      React.createElement('form', { id: 'customer-detail-form' },
        // Basic Info Section
        React.createElement('div', { 
          style: { 
            marginBottom: '16px', 
            padding: '12px', 
            background: 'white', 
            borderRadius: '6px', 
            border: '1px solid #e5e7eb' 
          } 
        },
          React.createElement('h3', { 
            style: { 
              margin: '0 0 12px', 
              fontSize: '14px', 
              fontWeight: 600, 
              color: '#111827', 
              borderBottom: '1px solid #e5e7eb', 
              paddingBottom: '6px' 
            } 
          }, 'Temel Bilgiler'),
          
          // Name
          React.createElement('div', { 
            className: 'detail-item',
            style: { display: 'flex', alignItems: 'center', marginBottom: '8px' } 
          },
            React.createElement('span', { 
              className: 'detail-label',
              style: { fontWeight: 600, fontSize: '12px', color: '#374151', minWidth: '120px', marginRight: '8px' } 
            }, 'Müşteri Adı:'),
            editing ? (
              React.createElement('input', {
                type: 'text',
                value: form.name,
                onChange: (e) => handleInputChange('name', e.target.value),
                style: { 
                  flex: 1, 
                  padding: '6px 8px', 
                  border: '1px solid #d1d5db', 
                  borderRadius: '4px', 
                  fontSize: '12px' 
                },
                placeholder: 'Ad Soyad'
              })
            ) : (
              React.createElement('span', { style: { fontSize: '12px', color: '#111827' } }, form.name || '-')
            )
          ),

          // Company
          React.createElement('div', { 
            className: 'detail-item',
            style: { display: 'flex', alignItems: 'center', marginBottom: '8px' } 
          },
            React.createElement('span', { 
              className: 'detail-label',
              style: { fontWeight: 600, fontSize: '12px', color: '#374151', minWidth: '120px', marginRight: '8px' } 
            }, 'Şirket:'),
            editing ? (
              React.createElement('input', {
                type: 'text',
                value: form.company,
                onChange: (e) => handleInputChange('company', e.target.value),
                style: { 
                  flex: 1, 
                  padding: '6px 8px', 
                  border: '1px solid #d1d5db', 
                  borderRadius: '4px', 
                  fontSize: '12px' 
                },
                placeholder: 'Şirket Adı'
              })
            ) : (
              React.createElement('span', { style: { fontSize: '12px', color: '#111827' } }, form.company || '-')
            )
          )
        ),

        // Contact Info Section
        React.createElement('div', { 
          style: { 
            marginBottom: '16px', 
            padding: '12px', 
            background: 'white', 
            borderRadius: '6px', 
            border: '1px solid #e5e7eb' 
          } 
        },
          React.createElement('h3', { 
            style: { 
              margin: '0 0 12px', 
              fontSize: '14px', 
              fontWeight: 600, 
              color: '#111827', 
              borderBottom: '1px solid #e5e7eb', 
              paddingBottom: '6px' 
            } 
          }, 'İletişim Bilgileri'),
          
          // Email
          React.createElement('div', { 
            className: 'detail-item',
            style: { display: 'flex', alignItems: 'center', marginBottom: '8px' } 
          },
            React.createElement('span', { 
              className: 'detail-label',
              style: { fontWeight: 600, fontSize: '12px', color: '#374151', minWidth: '120px', marginRight: '8px' } 
            }, 'E-posta:'),
            editing ? (
              React.createElement('input', {
                type: 'email',
                value: form.email,
                onChange: (e) => handleInputChange('email', e.target.value),
                style: { 
                  flex: 1, 
                  padding: '6px 8px', 
                  border: '1px solid #d1d5db', 
                  borderRadius: '4px', 
                  fontSize: '12px' 
                },
                placeholder: 'ornek@email.com'
              })
            ) : (
              React.createElement('span', { style: { fontSize: '12px', color: '#111827' } }, form.email || '-')
            )
          ),

          // Phone
          React.createElement('div', { 
            className: 'detail-item',
            style: { display: 'flex', alignItems: 'center', marginBottom: '8px' } 
          },
            React.createElement('span', { 
              className: 'detail-label',
              style: { fontWeight: 600, fontSize: '12px', color: '#374151', minWidth: '120px', marginRight: '8px' } 
            }, 'Telefon:'),
            editing ? (
              React.createElement('input', {
                type: 'tel',
                value: form.phone,
                onChange: (e) => handleInputChange('phone', e.target.value),
                style: { 
                  flex: 1, 
                  padding: '6px 8px', 
                  border: '1px solid #d1d5db', 
                  borderRadius: '4px', 
                  fontSize: '12px' 
                },
                placeholder: '0555 555 55 55'
              })
            ) : (
              React.createElement('span', { style: { fontSize: '12px', color: '#111827' } }, form.phone || '-')
            )
          ),

          // Address
          React.createElement('div', { 
            className: 'detail-item',
            style: { display: 'flex', alignItems: 'flex-start', marginBottom: '8px' } 
          },
            React.createElement('span', { 
              className: 'detail-label',
              style: { fontWeight: 600, fontSize: '12px', color: '#374151', minWidth: '120px', marginRight: '8px', paddingTop: '6px' } 
            }, 'Adres:'),
            editing ? (
              React.createElement('textarea', {
                value: form.address,
                onChange: (e) => handleInputChange('address', e.target.value),
                style: { 
                  flex: 1, 
                  padding: '6px 8px', 
                  border: '1px solid #d1d5db', 
                  borderRadius: '4px', 
                  fontSize: '12px',
                  minHeight: '60px',
                  resize: 'vertical'
                },
                placeholder: 'Adres bilgisi'
              })
            ) : (
              React.createElement('span', { style: { fontSize: '12px', color: '#111827', flex: 1 } }, form.address || '-')
            )
          )
        ),

        // Tax Info Section
        React.createElement('div', { 
          style: { 
            marginBottom: '16px', 
            padding: '12px', 
            background: 'white', 
            borderRadius: '6px', 
            border: '1px solid #e5e7eb' 
          } 
        },
          React.createElement('h3', { 
            style: { 
              margin: '0 0 12px', 
              fontSize: '14px', 
              fontWeight: 600, 
              color: '#111827', 
              borderBottom: '1px solid #e5e7eb', 
              paddingBottom: '6px' 
            } 
          }, 'Fatura Bilgileri'),
          
          // Tax Office
          React.createElement('div', { 
            className: 'detail-item',
            style: { display: 'flex', alignItems: 'center', marginBottom: '8px' } 
          },
            React.createElement('span', { 
              className: 'detail-label',
              style: { fontWeight: 600, fontSize: '12px', color: '#374151', minWidth: '120px', marginRight: '8px' } 
            }, 'Vergi Dairesi:'),
            editing ? (
              React.createElement('input', {
                type: 'text',
                value: form.taxOffice,
                onChange: (e) => handleInputChange('taxOffice', e.target.value),
                style: { 
                  flex: 1, 
                  padding: '6px 8px', 
                  border: '1px solid #d1d5db', 
                  borderRadius: '4px', 
                  fontSize: '12px' 
                },
                placeholder: 'Vergi Dairesi'
              })
            ) : (
              React.createElement('span', { style: { fontSize: '12px', color: '#111827' } }, form.taxOffice || '-')
            )
          ),

          // Tax Number
          React.createElement('div', { 
            className: 'detail-item',
            style: { display: 'flex', alignItems: 'center', marginBottom: '8px' } 
          },
            React.createElement('span', { 
              className: 'detail-label',
              style: { fontWeight: 600, fontSize: '12px', color: '#374151', minWidth: '120px', marginRight: '8px' } 
            }, 'Vergi Numarası:'),
            editing ? (
              React.createElement('input', {
                type: 'text',
                value: form.taxNumber,
                onChange: (e) => handleInputChange('taxNumber', e.target.value),
                style: { 
                  flex: 1, 
                  padding: '6px 8px', 
                  border: '1px solid #d1d5db', 
                  borderRadius: '4px', 
                  fontSize: '12px' 
                },
                placeholder: 'Vergi No'
              })
            ) : (
              React.createElement('span', { style: { fontSize: '12px', color: '#111827' } }, form.taxNumber || '-')
            )
          )
        ),

        // Notes Section
        React.createElement('div', { 
          style: { 
            marginBottom: '16px', 
            padding: '12px', 
            background: 'white', 
            borderRadius: '6px', 
            border: '1px solid #e5e7eb' 
          } 
        },
          React.createElement('h3', { 
            style: { 
              margin: '0 0 12px', 
              fontSize: '14px', 
              fontWeight: 600, 
              color: '#111827', 
              borderBottom: '1px solid #e5e7eb', 
              paddingBottom: '6px' 
            } 
          }, 'Notlar'),
          
          editing ? (
            React.createElement('textarea', {
              value: form.notes,
              onChange: (e) => handleInputChange('notes', e.target.value),
              style: { 
                width: '100%', 
                padding: '8px', 
                border: '1px solid #d1d5db', 
                borderRadius: '4px', 
                fontSize: '12px',
                minHeight: '80px',
                resize: 'vertical'
              },
              placeholder: 'Müşteri hakkında notlar...'
            })
          ) : (
            React.createElement('p', { 
              style: { fontSize: '12px', color: '#6b7280', margin: 0 } 
            }, form.notes || 'Not yok')
          )
        )
      )
    )
  );
}
