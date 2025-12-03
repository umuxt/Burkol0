import React, { useState, useEffect } from 'react';
import { ArrowLeft, FileText, User, Phone, MapPin, Wallet, FileEdit, Pencil, Trash2 } from '../../../../shared/components/Icons.jsx';

export default function CustomerDetailsPanel({ 
  customer,
  onClose, 
  onSave,
  onDelete
}) {
  const [editing, setEditing] = useState(false);
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
    country: '',
    postalCode: '',
    // Fatura Bilgileri
    taxOffice: '',
    taxNumber: '',
    iban: '',
    bankName: '',
    // Notlar
    notes: ''
  });

  // Initialize form when customer changes
  useEffect(() => {
    if (customer) {
      setForm({
        name: customer.name || '',
        company: customer.company || '',
        contactPerson: customer.contactPerson || '',
        contactTitle: customer.contactTitle || '',
        email: customer.email || '',
        phone: customer.phone || '',
        fax: customer.fax || '',
        website: customer.website || '',
        address: customer.address || '',
        city: customer.city || '',
        district: customer.district || '',
        neighbourhood: customer.neighbourhood || '',
        country: customer.country || '',
        postalCode: customer.postalCode || '',
        taxOffice: customer.taxOffice || '',
        taxNumber: customer.taxNumber || '',
        iban: customer.iban || '',
        bankName: customer.bankName || '',
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
      company: customer.company || '',
      contactPerson: customer.contactPerson || '',
      contactTitle: customer.contactTitle || '',
      email: customer.email || '',
      phone: customer.phone || '',
      fax: customer.fax || '',
      website: customer.website || '',
      address: customer.address || '',
      city: customer.city || '',
      district: customer.district || '',
      neighbourhood: customer.neighbourhood || '',
      country: customer.country || '',
      postalCode: customer.postalCode || '',
      taxOffice: customer.taxOffice || '',
      taxNumber: customer.taxNumber || '',
      iban: customer.iban || '',
      bankName: customer.bankName || '',
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
            }, React.createElement(Pencil, { size: 12, style: { marginRight: '4px' } }), 'Düzenle'),
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
            }, React.createElement(Trash2, { size: 12, style: { marginRight: '4px' } }), 'Sil')
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
          }, React.createElement(FileText, { size: 14, style: { marginRight: '6px' } }), 'Temel Bilgiler'),
          
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

        // ===== YETKİLİ KİŞİ =====
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
          }, React.createElement(User, { size: 14, style: { marginRight: '6px' } }), 'Yetkili Kişi'),
          
          // Contact Person
          React.createElement('div', { 
            className: 'detail-item',
            style: { display: 'flex', alignItems: 'center', marginBottom: '8px' } 
          },
            React.createElement('span', { 
              className: 'detail-label',
              style: { fontWeight: 600, fontSize: '12px', color: '#374151', minWidth: '120px', marginRight: '8px' } 
            }, 'Yetkili Kişi:'),
            editing ? (
              React.createElement('input', {
                type: 'text',
                value: form.contactPerson,
                onChange: (e) => handleInputChange('contactPerson', e.target.value),
                style: { 
                  flex: 1, 
                  padding: '6px 8px', 
                  border: '1px solid #d1d5db', 
                  borderRadius: '4px', 
                  fontSize: '12px' 
                },
                placeholder: 'Yetkili kişi adı'
              })
            ) : (
              React.createElement('span', { style: { fontSize: '12px', color: '#111827' } }, form.contactPerson || '-')
            )
          ),

          // Contact Title
          React.createElement('div', { 
            className: 'detail-item',
            style: { display: 'flex', alignItems: 'center', marginBottom: '8px' } 
          },
            React.createElement('span', { 
              className: 'detail-label',
              style: { fontWeight: 600, fontSize: '12px', color: '#374151', minWidth: '120px', marginRight: '8px' } 
            }, 'Ünvan:'),
            editing ? (
              React.createElement('input', {
                type: 'text',
                value: form.contactTitle,
                onChange: (e) => handleInputChange('contactTitle', e.target.value),
                style: { 
                  flex: 1, 
                  padding: '6px 8px', 
                  border: '1px solid #d1d5db', 
                  borderRadius: '4px', 
                  fontSize: '12px' 
                },
                placeholder: 'Ünvan (örn: Satın Alma Müdürü)'
              })
            ) : (
              React.createElement('span', { style: { fontSize: '12px', color: '#111827' } }, form.contactTitle || '-')
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
          }, React.createElement(Phone, { size: 14, style: { marginRight: '6px' } }), 'İletişim Bilgileri'),
          
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

          // Fax
          React.createElement('div', { 
            className: 'detail-item',
            style: { display: 'flex', alignItems: 'center', marginBottom: '8px' } 
          },
            React.createElement('span', { 
              className: 'detail-label',
              style: { fontWeight: 600, fontSize: '12px', color: '#374151', minWidth: '120px', marginRight: '8px' } 
            }, 'Faks:'),
            editing ? (
              React.createElement('input', {
                type: 'tel',
                value: form.fax,
                onChange: (e) => handleInputChange('fax', e.target.value),
                style: { 
                  flex: 1, 
                  padding: '6px 8px', 
                  border: '1px solid #d1d5db', 
                  borderRadius: '4px', 
                  fontSize: '12px' 
                },
                placeholder: '0212 555 55 55'
              })
            ) : (
              React.createElement('span', { style: { fontSize: '12px', color: '#111827' } }, form.fax || '-')
            )
          ),

          // Website
          React.createElement('div', { 
            className: 'detail-item',
            style: { display: 'flex', alignItems: 'center', marginBottom: '8px' } 
          },
            React.createElement('span', { 
              className: 'detail-label',
              style: { fontWeight: 600, fontSize: '12px', color: '#374151', minWidth: '120px', marginRight: '8px' } 
            }, 'Web Sitesi:'),
            editing ? (
              React.createElement('input', {
                type: 'text',
                value: form.website,
                onChange: (e) => handleInputChange('website', e.target.value),
                style: { 
                  flex: 1, 
                  padding: '6px 8px', 
                  border: '1px solid #d1d5db', 
                  borderRadius: '4px', 
                  fontSize: '12px' 
                },
                placeholder: 'www.sirket.com'
              })
            ) : (
              React.createElement('span', { style: { fontSize: '12px', color: '#111827' } }, form.website || '-')
            )
          )
        ),

        // ===== ADRES BİLGİLERİ =====
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
          }, React.createElement(MapPin, { size: 14, style: { marginRight: '6px' } }), 'Adres Bilgileri'),

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
                placeholder: 'Sokak, Mahalle, Cadde...'
              })
            ) : (
              React.createElement('span', { style: { fontSize: '12px', color: '#111827', flex: 1 } }, form.address || '-')
            )
          ),

          // Ülke / İl / İlçe - Compact Row
          React.createElement('div', { 
            style: { display: 'flex', gap: '12px', marginBottom: '8px', flexWrap: 'wrap' } 
          },
            // Ülke
            React.createElement('div', { style: { flex: 1, minWidth: '100px' } },
              React.createElement('span', { 
                style: { fontWeight: 600, fontSize: '11px', color: '#6b7280', display: 'block', marginBottom: '2px' } 
              }, 'Ülke'),
              React.createElement('span', { style: { fontSize: '12px', color: '#111827' } }, form.country || '-')
            ),
            // İl
            React.createElement('div', { style: { flex: 1, minWidth: '100px' } },
              React.createElement('span', { 
                style: { fontWeight: 600, fontSize: '11px', color: '#6b7280', display: 'block', marginBottom: '2px' } 
              }, 'İl'),
              React.createElement('span', { style: { fontSize: '12px', color: '#111827' } }, form.city || '-')
            ),
            // İlçe
            React.createElement('div', { style: { flex: 1, minWidth: '100px' } },
              React.createElement('span', { 
                style: { fontWeight: 600, fontSize: '11px', color: '#6b7280', display: 'block', marginBottom: '2px' } 
              }, 'İlçe'),
              React.createElement('span', { style: { fontSize: '12px', color: '#111827' } }, form.district || '-')
            )
          ),

          // Mahalle / Posta Kodu - Compact Row
          React.createElement('div', { 
            style: { display: 'flex', gap: '12px', marginBottom: '8px', flexWrap: 'wrap' } 
          },
            // Mahalle
            React.createElement('div', { style: { flex: 2, minWidth: '150px' } },
              React.createElement('span', { 
                style: { fontWeight: 600, fontSize: '11px', color: '#6b7280', display: 'block', marginBottom: '2px' } 
              }, 'Mahalle'),
              React.createElement('span', { style: { fontSize: '12px', color: '#111827' } }, form.neighbourhood || '-')
            ),
            // Posta Kodu
            React.createElement('div', { style: { flex: 1, minWidth: '80px' } },
              React.createElement('span', { 
                style: { fontWeight: 600, fontSize: '11px', color: '#6b7280', display: 'block', marginBottom: '2px' } 
              }, 'Posta Kodu'),
              React.createElement('span', { style: { fontSize: '12px', color: '#111827' } }, form.postalCode || '-')
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
          }, React.createElement(Wallet, { size: 14, style: { marginRight: '6px' } }), 'Fatura Bilgileri'),
          
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
            }, 'Vergi No:'),
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
                placeholder: 'Vergi numarası'
              })
            ) : (
              React.createElement('span', { style: { fontSize: '12px', color: '#111827' } }, form.taxNumber || '-')
            )
          ),

          // IBAN
          React.createElement('div', { 
            className: 'detail-item',
            style: { display: 'flex', alignItems: 'center', marginBottom: '8px' } 
          },
            React.createElement('span', { 
              className: 'detail-label',
              style: { fontWeight: 600, fontSize: '12px', color: '#374151', minWidth: '120px', marginRight: '8px' } 
            }, 'IBAN:'),
            editing ? (
              React.createElement('input', {
                type: 'text',
                value: form.iban,
                onChange: (e) => handleInputChange('iban', e.target.value),
                style: { 
                  flex: 1, 
                  padding: '6px 8px', 
                  border: '1px solid #d1d5db', 
                  borderRadius: '4px', 
                  fontSize: '12px' 
                },
                placeholder: 'TR00 0000 0000 0000 0000 0000 00'
              })
            ) : (
              React.createElement('span', { style: { fontSize: '12px', color: '#111827' } }, form.iban || '-')
            )
          ),

          // Bank Name
          React.createElement('div', { 
            className: 'detail-item',
            style: { display: 'flex', alignItems: 'center', marginBottom: '8px' } 
          },
            React.createElement('span', { 
              className: 'detail-label',
              style: { fontWeight: 600, fontSize: '12px', color: '#374151', minWidth: '120px', marginRight: '8px' } 
            }, 'Banka:'),
            editing ? (
              React.createElement('input', {
                type: 'text',
                value: form.bankName,
                onChange: (e) => handleInputChange('bankName', e.target.value),
                style: { 
                  flex: 1, 
                  padding: '6px 8px', 
                  border: '1px solid #d1d5db', 
                  borderRadius: '4px', 
                  fontSize: '12px' 
                },
                placeholder: 'Banka adı'
              })
            ) : (
              React.createElement('span', { style: { fontSize: '12px', color: '#111827' } }, form.bankName || '-')
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
          }, React.createElement(FileEdit, { size: 14, style: { marginRight: '6px' } }), 'Notlar'),
          
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
