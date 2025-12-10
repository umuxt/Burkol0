import React, { useState, useEffect } from 'react';
import { ArrowLeft, FileText, User, Phone, MapPin, Wallet, FileEdit, Pencil, Trash2, FileCode } from '../../../../shared/components/Icons.jsx';

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
    // e-Belge Bilgileri
    isEInvoiceTaxpayer: false,
    isEDespatchTaxpayer: false,
    gibPkLabel: '',
    gibDespatchPkLabel: '',
    defaultInvoiceScenario: 'TICARI',
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
        isEInvoiceTaxpayer: customer.isEInvoiceTaxpayer || false,
        isEDespatchTaxpayer: customer.isEDespatchTaxpayer || false,
        gibPkLabel: customer.gibPkLabel || '',
        gibDespatchPkLabel: customer.gibDespatchPkLabel || '',
        defaultInvoiceScenario: customer.defaultInvoiceScenario || 'TICARI',
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
      isEInvoiceTaxpayer: customer.isEInvoiceTaxpayer || false,
      isEDespatchTaxpayer: customer.isEDespatchTaxpayer || false,
      gibPkLabel: customer.gibPkLabel || '',
      gibDespatchPkLabel: customer.gibDespatchPkLabel || '',
      defaultInvoiceScenario: customer.defaultInvoiceScenario || 'TICARI',
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

  return (
    <div className="quote-detail-panel">
      {/* Header */}
      <div style={{
        padding: '16px 20px',
        borderBottom: '1px solid #e5e7eb',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button
            title="Detayları Kapat"
            style={{
              padding: '6px 12px',
              border: '1px solid #d1d5db',
              borderRadius: '4px',
              background: 'white',
              color: '#374151',
              cursor: 'pointer',
              fontSize: '12px'
            }}
            onClick={onClose}
          >
            <ArrowLeft size={14} />
          </button>
          <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: '#111827' }}>Müşteri Detayları</h3>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {editing ? (
            <>
              <button
                style={{
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
                }}
                onClick={handleCancel}
              >
                İptal
              </button>
              <button
                style={{
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
                }}
                onClick={handleSave}
              >
                Kaydet
              </button>
            </>
          ) : (
            <>
              <button
                style={{
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
                }}
                onClick={() => setEditing(true)}
              >
                <Pencil size={12} style={{ marginRight: '4px' }} />
                Düzenle
              </button>
              <button
                style={{
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
                }}
                onClick={handleDelete}
              >
                <Trash2 size={12} style={{ marginRight: '4px' }} />
                Sil
              </button>
            </>
          )}
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: '1 1 0%', overflow: 'auto', padding: '20px' }}>
        <form id="customer-detail-form" onSubmit={(e) => e.preventDefault()}>
          {/* Basic Info Section */}
          <div style={{
            marginBottom: '16px',
            padding: '12px',
            background: 'white',
            borderRadius: '6px',
            border: '1px solid #e5e7eb'
          }}>
            <h3 style={{
              margin: '0 0 12px',
              fontSize: '14px',
              fontWeight: 600,
              color: '#111827',
              borderBottom: '1px solid #e5e7eb',
              paddingBottom: '6px'
            }}>
              <FileText size={14} style={{ marginRight: '6px' }} />
              Temel Bilgiler
            </h3>

            {/* Name */}
            <div className="detail-item" style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
              <span className="detail-label" style={{ fontWeight: 600, fontSize: '12px', color: '#374151', minWidth: '120px', marginRight: '8px' }}>
                Cari Hesap Unvanı:
              </span>
              {editing ? (
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => handleInputChange('name', e.target.value)}
                  style={{
                    flex: 1,
                    padding: '6px 8px',
                    border: '1px solid #d1d5db',
                    borderRadius: '4px',
                    fontSize: '12px'
                  }}
                  placeholder="Cari Hesap Unvanı / Adı Soyadı"
                />
              ) : (
                <span style={{ fontSize: '12px', color: '#111827' }}>{form.name || '-'}</span>
              )}
            </div>

            {/* Company */}
            <div className="detail-item" style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
              <span className="detail-label" style={{ fontWeight: 600, fontSize: '12px', color: '#374151', minWidth: '120px', marginRight: '8px' }}>
                Firma Kısa Adı:
              </span>
              {editing ? (
                <input
                  type="text"
                  value={form.company}
                  onChange={(e) => handleInputChange('company', e.target.value)}
                  style={{
                    flex: 1,
                    padding: '6px 8px',
                    border: '1px solid #d1d5db',
                    borderRadius: '4px',
                    fontSize: '12px'
                  }}
                  placeholder="Marka veya Kısa Ad (Opsiyonel)"
                />
              ) : (
                <span style={{ fontSize: '12px', color: '#111827' }}>{form.company || '-'}</span>
              )}
            </div>
          </div>

          {/* Yetkili Kişi Section */}
          <div style={{
            marginBottom: '16px',
            padding: '12px',
            background: 'white',
            borderRadius: '6px',
            border: '1px solid #e5e7eb'
          }}>
            <h3 style={{
              margin: '0 0 12px',
              fontSize: '14px',
              fontWeight: 600,
              color: '#111827',
              borderBottom: '1px solid #e5e7eb',
              paddingBottom: '6px'
            }}>
              <User size={14} style={{ marginRight: '6px' }} />
              Yetkili Kişi
            </h3>

            {/* Contact Person */}
            <div className="detail-item" style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
              <span className="detail-label" style={{ fontWeight: 600, fontSize: '12px', color: '#374151', minWidth: '120px', marginRight: '8px' }}>
                Yetkili Kişi:
              </span>
              {editing ? (
                <input
                  type="text"
                  value={form.contactPerson}
                  onChange={(e) => handleInputChange('contactPerson', e.target.value)}
                  style={{
                    flex: 1,
                    padding: '6px 8px',
                    border: '1px solid #d1d5db',
                    borderRadius: '4px',
                    fontSize: '12px'
                  }}
                  placeholder="Yetkili kişi adı"
                />
              ) : (
                <span style={{ fontSize: '12px', color: '#111827' }}>{form.contactPerson || '-'}</span>
              )}
            </div>

            {/* Contact Title */}
            <div className="detail-item" style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
              <span className="detail-label" style={{ fontWeight: 600, fontSize: '12px', color: '#374151', minWidth: '120px', marginRight: '8px' }}>
                Ünvan:
              </span>
              {editing ? (
                <input
                  type="text"
                  value={form.contactTitle}
                  onChange={(e) => handleInputChange('contactTitle', e.target.value)}
                  style={{
                    flex: 1,
                    padding: '6px 8px',
                    border: '1px solid #d1d5db',
                    borderRadius: '4px',
                    fontSize: '12px'
                  }}
                  placeholder="Ünvan (örn: Satın Alma Müdürü)"
                />
              ) : (
                <span style={{ fontSize: '12px', color: '#111827' }}>{form.contactTitle || '-'}</span>
              )}
            </div>
          </div>

          {/* Contact Info Section */}
          <div style={{
            marginBottom: '16px',
            padding: '12px',
            background: 'white',
            borderRadius: '6px',
            border: '1px solid #e5e7eb'
          }}>
            <h3 style={{
              margin: '0 0 12px',
              fontSize: '14px',
              fontWeight: 600,
              color: '#111827',
              borderBottom: '1px solid #e5e7eb',
              paddingBottom: '6px'
            }}>
              <Phone size={14} style={{ marginRight: '6px' }} />
              İletişim Bilgileri
            </h3>

            {/* Email */}
            <div className="detail-item" style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
              <span className="detail-label" style={{ fontWeight: 600, fontSize: '12px', color: '#374151', minWidth: '120px', marginRight: '8px' }}>
                E-posta:
              </span>
              {editing ? (
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => handleInputChange('email', e.target.value)}
                  style={{
                    flex: 1,
                    padding: '6px 8px',
                    border: '1px solid #d1d5db',
                    borderRadius: '4px',
                    fontSize: '12px'
                  }}
                  placeholder="ornek@email.com"
                />
              ) : (
                <span style={{ fontSize: '12px', color: '#111827' }}>{form.email || '-'}</span>
              )}
            </div>

            {/* Phone */}
            <div className="detail-item" style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
              <span className="detail-label" style={{ fontWeight: 600, fontSize: '12px', color: '#374151', minWidth: '120px', marginRight: '8px' }}>
                Telefon:
              </span>
              {editing ? (
                <input
                  type="tel"
                  value={form.phone}
                  onChange={(e) => handleInputChange('phone', e.target.value)}
                  style={{
                    flex: 1,
                    padding: '6px 8px',
                    border: '1px solid #d1d5db',
                    borderRadius: '4px',
                    fontSize: '12px'
                  }}
                  placeholder="0555 555 55 55"
                />
              ) : (
                <span style={{ fontSize: '12px', color: '#111827' }}>{form.phone || '-'}</span>
              )}
            </div>

            {/* Fax */}
            <div className="detail-item" style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
              <span className="detail-label" style={{ fontWeight: 600, fontSize: '12px', color: '#374151', minWidth: '120px', marginRight: '8px' }}>
                Faks:
              </span>
              {editing ? (
                <input
                  type="tel"
                  value={form.fax}
                  onChange={(e) => handleInputChange('fax', e.target.value)}
                  style={{
                    flex: 1,
                    padding: '6px 8px',
                    border: '1px solid #d1d5db',
                    borderRadius: '4px',
                    fontSize: '12px'
                  }}
                  placeholder="0212 555 55 55"
                />
              ) : (
                <span style={{ fontSize: '12px', color: '#111827' }}>{form.fax || '-'}</span>
              )}
            </div>

            {/* Website */}
            <div className="detail-item" style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
              <span className="detail-label" style={{ fontWeight: 600, fontSize: '12px', color: '#374151', minWidth: '120px', marginRight: '8px' }}>
                Web Sitesi:
              </span>
              {editing ? (
                <input
                  type="text"
                  value={form.website}
                  onChange={(e) => handleInputChange('website', e.target.value)}
                  style={{
                    flex: 1,
                    padding: '6px 8px',
                    border: '1px solid #d1d5db',
                    borderRadius: '4px',
                    fontSize: '12px'
                  }}
                  placeholder="www.sirket.com"
                />
              ) : (
                <span style={{ fontSize: '12px', color: '#111827' }}>{form.website || '-'}</span>
              )}
            </div>
          </div>

          {/* Address Info Section */}
          <div style={{
            marginBottom: '16px',
            padding: '12px',
            background: 'white',
            borderRadius: '6px',
            border: '1px solid #e5e7eb'
          }}>
            <h3 style={{
              margin: '0 0 12px',
              fontSize: '14px',
              fontWeight: 600,
              color: '#111827',
              borderBottom: '1px solid #e5e7eb',
              paddingBottom: '6px'
            }}>
              <MapPin size={14} style={{ marginRight: '6px' }} />
              Adres Bilgileri
            </h3>

            {/* Address */}
            <div className="detail-item" style={{ display: 'flex', alignItems: 'flex-start', marginBottom: '8px' }}>
              <span className="detail-label" style={{ fontWeight: 600, fontSize: '12px', color: '#374151', minWidth: '120px', marginRight: '8px', paddingTop: '6px' }}>
                Adres:
              </span>
              {editing ? (
                <textarea
                  value={form.address}
                  onChange={(e) => handleInputChange('address', e.target.value)}
                  style={{
                    flex: 1,
                    padding: '6px 8px',
                    border: '1px solid #d1d5db',
                    borderRadius: '4px',
                    fontSize: '12px',
                    minHeight: '60px',
                    resize: 'vertical'
                  }}
                  placeholder="Sokak, Mahalle, Cadde..."
                />
              ) : (
                <span style={{ fontSize: '12px', color: '#111827', flex: 1 }}>{form.address || '-'}</span>
              )}
            </div>

            {/* City/District/Neighbourhood/PostalCode details remain simplified for brevity in this rewrite, but would ideally use similar structure */}
            <div style={{ display: 'flex', gap: '12px', marginBottom: '8px', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: '100px' }}>
                <span style={{ fontWeight: 600, fontSize: '11px', color: '#6b7280', display: 'block', marginBottom: '2px' }}>Ülke</span>
                {editing ? <input type="text" value={form.country} onChange={e => handleInputChange('country', e.target.value)} style={{ width: '100%', fontSize: '12px', padding: '4px' }} /> : <span style={{ fontSize: '12px', color: '#111827' }}>{form.country || '-'}</span>}
              </div>
              <div style={{ flex: 1, minWidth: '100px' }}>
                <span style={{ fontWeight: 600, fontSize: '11px', color: '#6b7280', display: 'block', marginBottom: '2px' }}>İl</span>
                {editing ? <input type="text" value={form.city} onChange={e => handleInputChange('city', e.target.value)} style={{ width: '100%', fontSize: '12px', padding: '4px' }} /> : <span style={{ fontSize: '12px', color: '#111827' }}>{form.city || '-'}</span>}
              </div>
              <div style={{ flex: 1, minWidth: '100px' }}>
                <span style={{ fontWeight: 600, fontSize: '11px', color: '#6b7280', display: 'block', marginBottom: '2px' }}>İlçe</span>
                {editing ? <input type="text" value={form.district} onChange={e => handleInputChange('district', e.target.value)} style={{ width: '100%', fontSize: '12px', padding: '4px' }} /> : <span style={{ fontSize: '12px', color: '#111827' }}>{form.district || '-'}</span>}
              </div>
            </div>
            <div style={{ display: 'flex', gap: '12px', marginBottom: '8px', flexWrap: 'wrap' }}>
              <div style={{ flex: 2, minWidth: '150px' }}>
                <span style={{ fontWeight: 600, fontSize: '11px', color: '#6b7280', display: 'block', marginBottom: '2px' }}>Mahalle</span>
                {editing ? <input type="text" value={form.neighbourhood} onChange={e => handleInputChange('neighbourhood', e.target.value)} style={{ width: '100%', fontSize: '12px', padding: '4px' }} /> : <span style={{ fontSize: '12px', color: '#111827' }}>{form.neighbourhood || '-'}</span>}
              </div>
              <div style={{ flex: 1, minWidth: '80px' }}>
                <span style={{ fontWeight: 600, fontSize: '11px', color: '#6b7280', display: 'block', marginBottom: '2px' }}>Posta Kodu</span>
                {editing ? <input type="text" value={form.postalCode} onChange={e => handleInputChange('postalCode', e.target.value)} style={{ width: '100%', fontSize: '12px', padding: '4px' }} /> : <span style={{ fontSize: '12px', color: '#111827' }}>{form.postalCode || '-'}</span>}
              </div>
            </div>

          </div>

          {/* Tax Info Section */}
          <div style={{
            marginBottom: '16px',
            padding: '12px',
            background: 'white',
            borderRadius: '6px',
            border: '1px solid #e5e7eb'
          }}>
            <h3 style={{
              margin: '0 0 12px',
              fontSize: '14px',
              fontWeight: 600,
              color: '#111827',
              borderBottom: '1px solid #e5e7eb',
              paddingBottom: '6px'
            }}>
              <Wallet size={14} style={{ marginRight: '6px' }} />
              Fatura Bilgileri
            </h3>

            {/* Tax Office */}
            <div className="detail-item" style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
              <span className="detail-label" style={{ fontWeight: 600, fontSize: '12px', color: '#374151', minWidth: '120px', marginRight: '8px' }}>
                Vergi Dairesi:
              </span>
              {editing ? (
                <input
                  type="text"
                  value={form.taxOffice}
                  onChange={(e) => handleInputChange('taxOffice', e.target.value)}
                  style={{
                    flex: 1,
                    padding: '6px 8px',
                    border: '1px solid #d1d5db',
                    borderRadius: '4px',
                    fontSize: '12px'
                  }}
                  placeholder="Vergi Dairesi"
                />
              ) : (
                <span style={{ fontSize: '12px', color: '#111827' }}>{form.taxOffice || '-'}</span>
              )}
            </div>

            {/* Tax Number */}
            <div className="detail-item" style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
              <span className="detail-label" style={{ fontWeight: 600, fontSize: '12px', color: '#374151', minWidth: '120px', marginRight: '8px' }}>
                Vergi No:
              </span>
              {editing ? (
                <input
                  type="text"
                  value={form.taxNumber}
                  onChange={(e) => handleInputChange('taxNumber', e.target.value)}
                  style={{
                    flex: 1,
                    padding: '6px 8px',
                    border: '1px solid #d1d5db',
                    borderRadius: '4px',
                    fontSize: '12px'
                  }}
                  placeholder="Vergi numarası"
                />
              ) : (
                <span style={{ fontSize: '12px', color: '#111827' }}>{form.taxNumber || '-'}</span>
              )}
            </div>

            {/* IBAN */}
            <div className="detail-item" style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
              <span className="detail-label" style={{ fontWeight: 600, fontSize: '12px', color: '#374151', minWidth: '120px', marginRight: '8px' }}>
                IBAN:
              </span>
              {editing ? (
                <input
                  type="text"
                  value={form.iban}
                  onChange={(e) => handleInputChange('iban', e.target.value)}
                  style={{
                    flex: 1,
                    padding: '6px 8px',
                    border: '1px solid #d1d5db',
                    borderRadius: '4px',
                    fontSize: '12px'
                  }}
                  placeholder="TR00 0000 0000 0000 0000 0000 00"
                />
              ) : (
                <span style={{ fontSize: '12px', color: '#111827' }}>{form.iban || '-'}</span>
              )}
            </div>

            {/* Bank Name */}
            <div className="detail-item" style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
              <span className="detail-label" style={{ fontWeight: 600, fontSize: '12px', color: '#374151', minWidth: '120px', marginRight: '8px' }}>
                Banka:
              </span>
              {editing ? (
                <input
                  type="text"
                  value={form.bankName}
                  onChange={(e) => handleInputChange('bankName', e.target.value)}
                  style={{
                    flex: 1,
                    padding: '6px 8px',
                    border: '1px solid #d1d5db',
                    borderRadius: '4px',
                    fontSize: '12px'
                  }}
                  placeholder="Banka adı"
                />
              ) : (
                <span style={{ fontSize: '12px', color: '#111827' }}>{form.bankName || '-'}</span>
              )}
            </div>
          </div>

          {/* e-Belge Info Section (NEW) */}
          <div style={{
            marginBottom: '16px',
            padding: '12px',
            background: 'white',
            borderRadius: '6px',
            border: '1px solid #e5e7eb'
          }}>
            <h3 style={{
              margin: '0 0 12px',
              fontSize: '14px',
              fontWeight: 600,
              color: '#111827',
              borderBottom: '1px solid #e5e7eb',
              paddingBottom: '6px'
            }}>
              <FileCode size={14} style={{ marginRight: '6px' }} />
              e-Belge Bilgileri
            </h3>

            {/* e-Fatura */}
            <div className="detail-item" style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
              <span className="detail-label" style={{ fontWeight: 600, fontSize: '12px', color: '#374151', minWidth: '120px', marginRight: '8px' }}>
                e-Fatura Mükellefi:
              </span>
              {editing ? (
                <input
                  type="checkbox"
                  checked={form.isEInvoiceTaxpayer}
                  onChange={(e) => handleInputChange('isEInvoiceTaxpayer', e.target.checked)}
                  style={{ width: '16px', height: '16px' }}
                />
              ) : (
                <span style={{ fontSize: '12px', color: '#111827' }}>{form.isEInvoiceTaxpayer ? 'Evet' : 'Hayır'}</span>
              )}
            </div>

            {/* e-İrsaliye */}
            <div className="detail-item" style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
              <span className="detail-label" style={{ fontWeight: 600, fontSize: '12px', color: '#374151', minWidth: '120px', marginRight: '8px' }}>
                e-İrsaliye Mükellefi:
              </span>
              {editing ? (
                <input
                  type="checkbox"
                  checked={form.isEDespatchTaxpayer}
                  onChange={(e) => handleInputChange('isEDespatchTaxpayer', e.target.checked)}
                  style={{ width: '16px', height: '16px' }}
                />
              ) : (
                <span style={{ fontSize: '12px', color: '#111827' }}>{form.isEDespatchTaxpayer ? 'Evet' : 'Hayır'}</span>
              )}
            </div>

            {(form.isEInvoiceTaxpayer || form.isEDespatchTaxpayer) && (
              <>
                {/* PK Label e-Invoice */}
                {form.isEInvoiceTaxpayer && (
                  <div className="detail-item" style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                    <span className="detail-label" style={{ fontWeight: 600, fontSize: '12px', color: '#374151', minWidth: '120px', marginRight: '8px' }}>
                      e-Fatura PK:
                    </span>
                    {editing ? (
                      <input
                        type="text"
                        value={form.gibPkLabel}
                        onChange={(e) => handleInputChange('gibPkLabel', e.target.value)}
                        style={{
                          flex: 1,
                          padding: '6px 8px',
                          border: '1px solid #d1d5db',
                          borderRadius: '4px',
                          fontSize: '12px'
                        }}
                        placeholder="urn:mail:defaultpk@..."
                      />
                    ) : (
                      <span style={{ fontSize: '12px', color: '#111827' }}>{form.gibPkLabel || '-'}</span>
                    )}
                  </div>
                )}

                {/* PK Label e-Despatch */}
                {form.isEDespatchTaxpayer && (
                  <div className="detail-item" style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                    <div className="detail-label" style={{ fontWeight: 600, fontSize: '12px', color: '#374151', minWidth: '120px', marginRight: '8px' }}>
                      <span style={{ display: 'block' }}>e-İrsaliye PK:</span>
                      {editing && form.isEInvoiceTaxpayer && (
                        <button
                          type="button"
                          onClick={() => handleInputChange('gibDespatchPkLabel', form.gibPkLabel)}
                          style={{
                            fontSize: '9px',
                            padding: '1px 4px',
                            border: '1px solid #d1d5db',
                            borderRadius: '2px',
                            background: '#f3f4f6',
                            cursor: 'pointer',
                            marginTop: '2px'
                          }}
                        >
                          e-Fat. ile Aynı
                        </button>
                      )}
                    </div>
                    {editing ? (
                      <input
                        type="text"
                        value={form.gibDespatchPkLabel}
                        onChange={(e) => handleInputChange('gibDespatchPkLabel', e.target.value)}
                        style={{
                          flex: 1,
                          padding: '6px 8px',
                          border: '1px solid #d1d5db',
                          borderRadius: '4px',
                          fontSize: '12px'
                        }}
                        placeholder="urn:mail:defaultgb@..."
                      />
                    ) : (
                      <span style={{ fontSize: '12px', color: '#111827' }}>{form.gibDespatchPkLabel || '-'}</span>
                    )}
                  </div>
                )}

                {/* Default Scenario */}
                {form.isEInvoiceTaxpayer && (
                  <div className="detail-item" style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                    <span className="detail-label" style={{ fontWeight: 600, fontSize: '12px', color: '#374151', minWidth: '120px', marginRight: '8px' }}>
                      Senaryo:
                    </span>
                    {editing ? (
                      <select
                        value={form.defaultInvoiceScenario || 'TICARI'}
                        onChange={(e) => handleInputChange('defaultInvoiceScenario', e.target.value)}
                        style={{
                          flex: 1,
                          padding: '6px 8px',
                          border: '1px solid #d1d5db',
                          borderRadius: '4px',
                          fontSize: '12px'
                        }}
                      >
                        <option value="TEMEL">TEMEL FATURA</option>
                        <option value="TICARI">TİCARİ FATURA</option>
                      </select>
                    ) : (
                      <span style={{ fontSize: '12px', color: '#111827' }}>{form.defaultInvoiceScenario || '-'}</span>
                    )}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Notes Section */}
          <div style={{
            marginBottom: '16px',
            padding: '12px',
            background: 'white',
            borderRadius: '6px',
            border: '1px solid #e5e7eb'
          }}>
            <h3 style={{
              margin: '0 0 12px',
              fontSize: '14px',
              fontWeight: 600,
              color: '#111827',
              borderBottom: '1px solid #e5e7eb',
              paddingBottom: '6px'
            }}>
              <FileEdit size={14} style={{ marginRight: '6px' }} />
              Notlar
            </h3>

            {editing ? (
              <textarea
                value={form.notes}
                onChange={(e) => handleInputChange('notes', e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px',
                  border: '1px solid #d1d5db',
                  borderRadius: '4px',
                  fontSize: '12px',
                  minHeight: '80px',
                  resize: 'vertical'
                }}
                placeholder="Müşteri hakkında notlar..."
              />
            ) : (
              <p style={{ fontSize: '12px', color: '#6b7280', margin: 0 }}>{form.notes || 'Not yok'}</p>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
