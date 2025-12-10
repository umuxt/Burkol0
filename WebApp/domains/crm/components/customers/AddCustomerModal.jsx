import React, { useState } from 'react';
import customersService from '../../services/customers-service.js';
import TurkeyAddressDropdown from '../../../../shared/components/TurkeyAddressDropdown.jsx';
import { FileText, User, Phone, MapPin, Wallet, FileEdit, FileCode } from '../../../../shared/components/Icons.jsx';

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
    // e-Belge Bilgileri
    isEInvoiceTaxpayer: false,
    isEDespatchTaxpayer: false,
    gibPkLabel: '',
    gibDespatchPkLabel: '',
    defaultInvoiceScenario: 'TICARI',
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

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '700px', width: '90%', maxHeight: '90vh', overflow: 'auto' }}
      >
        {/* Header */}
        <div className="modal-header">
          <h2>Yeni Müşteri Ekle</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        {/* Form */}
        <form className="modal-body" onSubmit={handleSubmit}>
          {/* ===== TEMEL BİLGİLER ===== */}
          <div className="form-section">
            <h3 style={{ marginBottom: '1rem', fontSize: '1rem', fontWeight: 600, color: '#1f2937', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <FileText size={16} />
              Temel Bilgiler
            </h3>

            <div className="form-group">
              <label>Cari Hesap Unvanı / Adı Soyadı *</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => handleInputChange('name', e.target.value)}
                className="form-control"
                placeholder="Ticari Unvan veya Ad Soyad"
                required
                autoFocus
              />
            </div>

            <div className="form-group">
              <label>Firma Kısa Adı / Marka (Opsiyonel)</label>
              <input
                type="text"
                value={form.company}
                onChange={(e) => handleInputChange('company', e.target.value)}
                className="form-control"
                placeholder="Örn: Trendyol, Hepsiburada vb."
              />
            </div>
          </div>

          {/* ===== YETKİLİ KİŞİ ===== */}
          <div className="form-section">
            <h3 style={{ marginBottom: '1rem', fontSize: '1rem', fontWeight: 600, color: '#1f2937', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <User size={16} />
              Yetkili Kişi
            </h3>

            <div className="form-row">
              <div className="form-group" style={{ flex: 1 }}>
                <label>Yetkili Kişi</label>
                <input
                  type="text"
                  value={form.contactPerson}
                  onChange={(e) => handleInputChange('contactPerson', e.target.value)}
                  className="form-control"
                  placeholder="Yetkili kişi adı"
                />
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label>Ünvan</label>
                <input
                  type="text"
                  value={form.contactTitle}
                  onChange={(e) => handleInputChange('contactTitle', e.target.value)}
                  className="form-control"
                  placeholder="Ünvan (örn: Satın Alma Müdürü)"
                />
              </div>
            </div>
          </div>

          {/* ===== İLETİŞİM BİLGİLERİ ===== */}
          <div className="form-section">
            <h3 style={{ marginBottom: '1rem', fontSize: '1rem', fontWeight: 600, color: '#1f2937', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Phone size={16} />
              İletişim Bilgileri
            </h3>

            <div className="form-row">
              <div className="form-group" style={{ flex: 1 }}>
                <label>E-posta</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => handleInputChange('email', e.target.value)}
                  className="form-control"
                  placeholder="ornek@email.com"
                />
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label>Telefon</label>
                <input
                  type="tel"
                  value={form.phone}
                  onChange={(e) => handleInputChange('phone', e.target.value)}
                  className="form-control"
                  placeholder="0555 555 55 55"
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group" style={{ flex: 1 }}>
                <label>Faks</label>
                <input
                  type="tel"
                  value={form.fax}
                  onChange={(e) => handleInputChange('fax', e.target.value)}
                  className="form-control"
                  placeholder="0212 555 55 55"
                />
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label>Web Sitesi</label>
                <input
                  type="text"
                  value={form.website}
                  onChange={(e) => handleInputChange('website', e.target.value)}
                  className="form-control"
                  placeholder="www.sirket.com"
                />
              </div>
            </div>
          </div>

          {/* ===== ADRES BİLGİLERİ ===== */}
          <div className="form-section">
            <h3 style={{ marginBottom: '1rem', fontSize: '1rem', fontWeight: 600, color: '#1f2937', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <MapPin size={16} />
              Adres Bilgileri
            </h3>

            <div className="form-group">
              <label>Adres</label>
              <textarea
                value={form.address}
                onChange={(e) => handleInputChange('address', e.target.value)}
                className="form-control"
                placeholder="Sokak, Mahalle, Cadde..."
                rows={2}
              />
            </div>

            <TurkeyAddressDropdown
              country={form.country}
              city={form.city}
              district={form.district || ''}
              neighbourhood={form.neighbourhood || ''}
              postalCode={form.postalCode}
              onChange={({ country, city, district, neighbourhood, postalCode }) => {
                setForm(prev => ({ ...prev, country, city, district, neighbourhood, postalCode }));
              }}
            />
          </div>

          {/* ===== FATURA BİLGİLERİ ===== */}
          <div className="form-section">
            <h3 style={{ marginBottom: '1rem', fontSize: '1rem', fontWeight: 600, color: '#1f2937', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Wallet size={16} />
              Fatura Bilgileri
            </h3>

            <div className="form-row">
              <div className="form-group" style={{ flex: 1 }}>
                <label>Vergi Dairesi</label>
                <input
                  type="text"
                  value={form.taxOffice}
                  onChange={(e) => handleInputChange('taxOffice', e.target.value)}
                  className="form-control"
                  placeholder="Vergi dairesi adı"
                />
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label>Vergi No</label>
                <input
                  type="text"
                  value={form.taxNumber}
                  onChange={(e) => handleInputChange('taxNumber', e.target.value)}
                  className="form-control"
                  placeholder="Vergi numarası"
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group" style={{ flex: 1 }}>
                <label>IBAN</label>
                <input
                  type="text"
                  value={form.iban}
                  onChange={(e) => handleInputChange('iban', e.target.value)}
                  className="form-control"
                  placeholder="TR00 0000 0000 0000 0000 0000 00"
                />
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label>Banka</label>
                <input
                  type="text"
                  value={form.bankName}
                  onChange={(e) => handleInputChange('bankName', e.target.value)}
                  className="form-control"
                  placeholder="Banka adı"
                />
              </div>
            </div>
          </div>

          {/* ===== E-BELGE BİLGİLERİ ===== */}
          <div className="form-section">
            <h3 style={{ marginBottom: '1rem', fontSize: '1rem', fontWeight: 600, color: '#1f2937', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <FileCode size={16} />
              e-Belge Bilgileri
            </h3>

            <div className="form-control mb-2">
              <label className="label cursor-pointer justify-start gap-3" style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  className="checkbox checkbox-primary"
                  checked={form.isEInvoiceTaxpayer}
                  onChange={(e) => handleInputChange('isEInvoiceTaxpayer', e.target.checked)}
                  style={{ width: '16px', height: '16px' }}
                />
                <span className="label-text">e-Fatura Mükellefi</span>
              </label>
            </div>

            <div className="form-control mb-3">
              <label className="label cursor-pointer justify-start gap-3" style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  className="checkbox checkbox-primary"
                  checked={form.isEDespatchTaxpayer}
                  onChange={(e) => handleInputChange('isEDespatchTaxpayer', e.target.checked)}
                  style={{ width: '16px', height: '16px' }}
                />
                <span className="label-text">e-İrsaliye Mükellefi</span>
              </label>
            </div>

            {(form.isEInvoiceTaxpayer || form.isEDespatchTaxpayer) && (
              <div className="form-group mt-3" style={{ background: '#f9fafb', padding: '10px', borderRadius: '4px' }}>
                {form.isEInvoiceTaxpayer && (
                  <div style={{ marginBottom: '10px' }}>
                    <label className="label" style={{ display: 'block', marginBottom: '4px' }}>
                      <span className="label-text">e-Fatura Posta Kutusu Etiketi (PK)</span>
                    </label>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="urn:mail:defaultpk@..."
                      value={form.gibPkLabel || ""}
                      onChange={(e) => handleInputChange('gibPkLabel', e.target.value)}
                    />
                  </div>
                )}

                {form.isEDespatchTaxpayer && (
                  <div style={{ marginBottom: '10px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                      <label className="label" style={{ display: 'block', marginBottom: '0' }}>
                        <span className="label-text">e-İrsaliye Posta Kutusu Etiketi (PK)</span>
                      </label>
                      {form.isEInvoiceTaxpayer && (
                        <button
                          type="button"
                          className="btn-xs btn-outline"
                          onClick={() => handleInputChange('gibDespatchPkLabel', form.gibPkLabel)}
                          style={{ fontSize: '10px', padding: '2px 6px', height: 'auto', minHeight: 'auto' }}
                        >
                          e-Fatura ile Aynı Yap
                        </button>
                      )}
                    </div>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="urn:mail:defaultgb@..."
                      value={form.gibDespatchPkLabel || ""}
                      onChange={(e) => handleInputChange('gibDespatchPkLabel', e.target.value)}
                    />
                  </div>
                )}

                {form.isEInvoiceTaxpayer && (
                  <div style={{ marginTop: '10px' }}>
                    <label className="label" style={{ display: 'block', marginBottom: '4px' }}>
                      <span className="label-text">Varsayılan Fatura Senaryosu</span>
                    </label>
                    <select
                      className="form-control"
                      value={form.defaultInvoiceScenario || 'TICARI'}
                      onChange={(e) => handleInputChange('defaultInvoiceScenario', e.target.value)}
                    >
                      <option value="TEMEL">TEMEL FATURA</option>
                      <option value="TICARI">TİCARİ FATURA</option>
                    </select>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ===== NOTLAR ===== */}
          <div className="form-section">
            <h3 style={{ marginBottom: '1rem', fontSize: '1rem', fontWeight: 600, color: '#1f2937', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <FileEdit size={16} />
              Notlar
            </h3>

            <div className="form-group">
              <textarea
                value={form.notes}
                onChange={(e) => handleInputChange('notes', e.target.value)}
                className="form-control"
                placeholder="Müşteri hakkında notlar..."
                rows={3}
              />
            </div>
          </div>
        </form>

        {/* Footer */}
        <div className="modal-footer">
          <button
            type="button"
            className="btn-secondary"
            onClick={onClose}
            disabled={saving}
          >
            İptal
          </button>
          <button
            type="submit"
            className="btn-primary"
            onClick={handleSubmit}
            disabled={saving}
          >
            {saving ? 'Kaydediliyor...' : 'Kaydet'}
          </button>
        </div>
      </div>
    </div>
  );
}
