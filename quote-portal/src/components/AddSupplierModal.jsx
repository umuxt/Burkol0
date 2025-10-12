import React, { useState, useEffect } from 'react'
import { useSupplierCategories, useSupplierCategoryActions } from '../hooks/useSupplierCategories'
import { useMaterials } from '../hooks/useFirebaseMaterials'

export default function AddSupplierModal({ isOpen, onClose, onSave, onAddNewMaterial }) {
  // Tedarikçi kategorilerini yükle
  const { categories: supplierCategories, loading: categoriesLoading } = useSupplierCategories(true)
  const { addCategory } = useSupplierCategoryActions()
  
  // Malzemeleri yükle
  const { materials, loading: materialsLoading } = useMaterials(true)
  
  // Malzeme yönetimi için state'ler
  const [selectedMaterials, setSelectedMaterials] = useState([])
  const [showMaterialSelector, setShowMaterialSelector] = useState(false)
  const [materialSearchTerm, setMaterialSearchTerm] = useState('')
  const [formData, setFormData] = useState({
    code: '',
    name: '',
    category: '',
    contactPerson: '',
    phone1: '',
    phone2: '',
    fax: '',
    email1: '',
    email2: '',
    website: '',
    address: '',
    city: '',
    state: '',
    postalCode: '',
    country: 'Türkiye',
    taxNumber: '',
    taxOffice: '',
    paymentTerms: '',
    paymentMethod: '',
    currency: 'TRY',
    bankName: '',
    bankAccount: '',
    iban: '',
    status: 'Aktif',
    creditLimit: '',
    creditRating: '',
    qualityCertification: '',
    deliveryCapability: '',
    leadTime: '',
    minimumOrderQuantity: '',
    supplierType: '',
    businessRegistrationNumber: '',
    yearEstablished: '',
    employeeCount: '',
    annualRevenue: '',
    notes: '',
    emergencyContact: '',
    emergencyPhone: '',
    preferredCommunication: 'email',
    complianceStatus: 'pending',
    riskLevel: 'medium'
  });

  const [showNewCategory, setShowNewCategory] = useState(false);
  const [newCategory, setNewCategory] = useState('');

  // Modal açıldığında form'u sıfırla
  useEffect(() => {
    if (isOpen) {
      setFormData({
        code: '',
        name: '',
        category: '',
        contactPerson: '',
        phone1: '',
        phone2: '',
        fax: '',
        email1: '',
        email2: '',
        website: '',
        address: '',
        city: '',
        state: '',
        postalCode: '',
        country: 'Türkiye',
        taxNumber: '',
        taxOffice: '',
        paymentTerms: '',
        paymentMethod: '',
        currency: 'TRY',
        bankName: '',
        bankAccount: '',
        iban: '',
        status: 'Aktif',
        creditLimit: '',
        creditRating: '',
        qualityCertification: '',
        deliveryCapability: '',
        leadTime: '',
        minimumOrderQuantity: '',
        supplierType: '',
        businessRegistrationNumber: '',
        yearEstablished: '',
        employeeCount: '',
        annualRevenue: '',
        notes: '',
        emergencyContact: '',
        emergencyPhone: '',
        preferredCommunication: 'email',
        complianceStatus: 'pending',
        riskLevel: 'medium'
      });
      setShowNewCategory(false);
      setNewCategory('');
      setSelectedMaterials([]);
      setShowMaterialSelector(false);
      setMaterialSearchTerm('');
    }
  }, [isOpen]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleCategoryChange = (e) => {
    const value = e.target.value;
    if (value === 'new-category') {
      setShowNewCategory(true);
      setFormData(prev => ({ ...prev, category: '' }));
    } else {
      setShowNewCategory(false);
      setFormData(prev => ({ ...prev, category: value }));
    }
  };

  // Malzeme yönetimi fonksiyonları
  const handleAddMaterial = (material) => {
    if (!selectedMaterials.find(m => m.id === material.id)) {
      setSelectedMaterials(prev => [...prev, material]);
    }
    setShowMaterialSelector(false);
    setMaterialSearchTerm('');
  };

  const handleRemoveMaterial = (materialId) => {
    setSelectedMaterials(prev => prev.filter(m => m.id !== materialId));
  };

  const filteredMaterials = materials.filter(material =>
    material.name.toLowerCase().includes(materialSearchTerm.toLowerCase()) ||
    material.code.toLowerCase().includes(materialSearchTerm.toLowerCase())
  ).filter(material => !selectedMaterials.find(m => m.id === material.id));

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    const finalCategory = showNewCategory ? newCategory : formData.category;
    
    if (!formData.name || !finalCategory || !formData.contactPerson || !formData.phone1 || !formData.email1) {
      alert('Lütfen tüm zorunlu alanları doldurun! (Firma Adı, Kategori, Yetkili Kişi, Telefon 1, E-posta 1)');
      return;
    }

    try {
      let categoryToUse = finalCategory;
      
      // Yeni kategori eklenmişse önce kategorini kaydet
      if (showNewCategory && newCategory.trim()) {
        const newCategoryData = {
          name: newCategory.trim(),
          description: `${newCategory} tedarikçi kategorisi`,
          color: '#6b7280',
          status: 'active'
        };
        
        const savedCategory = await addCategory(newCategoryData);
        categoryToUse = savedCategory.id;
      }

      const supplierData = {
        ...formData,
        category: categoryToUse,
        creditLimit: formData.creditLimit ? parseFloat(formData.creditLimit) : 0,
        suppliedMaterials: selectedMaterials.map(m => ({
          materialId: m.id,
          materialCode: m.code,
          materialName: m.name,
          addedAt: new Date().toISOString()
        }))
      };

      onSave(supplierData, showNewCategory ? newCategory : null);
    } catch (error) {
      console.error('Tedarikçi kaydedilirken hata:', error);
      alert('Tedarikçi kaydedilirken bir hata oluştu!');
    }
  };

  const handleClose = () => {
    setFormData({
      code: '',
      name: '',
      category: '',
      contactPerson: '',
      phone1: '',
      phone2: '',
      email1: '',
      email2: '',
      address: '',
      taxNumber: '',
      paymentTerms: '',
      status: 'Aktif',
      fax1: '',
      creditLimit: ''
    });
    setShowNewCategory(false);
    setNewCategory('');
    setSelectedMaterials([]);
    setShowMaterialSelector(false);
    setMaterialSearchTerm('');
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Yeni Tedarikçi Ekle</h2>
          <div className="header-actions">
            <button type="submit" form="add-supplier-form" className="btn-save" title="Kaydet">
              💾 Kaydet
            </button>
            <button className="modal-close" onClick={handleClose}>×</button>
          </div>
        </div>
        
        <form id="add-supplier-form" onSubmit={handleSubmit} className="modal-form">
          {/* Temel Firma Bilgileri */}
          <div className="form-section">
            <h3 className="form-section-title">Temel Firma Bilgileri</h3>
            <div className="form-row">
              <div className="form-group">
                <label>Tedarikçi Kodu <span className="optional">(opsiyonel)</span></label>
                <input
                  type="text"
                  name="code"
                  value={formData.code}
                  onChange={handleInputChange}
                  placeholder="TED-001"
                />
                <small className="form-help">Boş bırakılırsa otomatik olarak TED-001 atanacak</small>
              </div>
              
              <div className="form-group">
                <label>Firma Adı *</label>
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleInputChange}
                  placeholder="Firma adını girin"
                  required
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Tedarikçi Tipi *</label>
                <select
                  name="supplierType"
                  value={formData.supplierType}
                  onChange={handleInputChange}
                  required
                >
                  <option value="">Tedarikçi tipi seçin</option>
                  <option value="manufacturer">Üretici</option>
                  <option value="distributor">Distribütör</option>
                  <option value="wholesaler">Toptancı</option>
                  <option value="service_provider">Hizmet Sağlayıcı</option>
                  <option value="contractor">Yüklenici</option>
                  <option value="consultant">Danışman</option>
                </select>
              </div>
              
              <div className="form-group">
                <label>Kategori *</label>
                {!showNewCategory ? (
                  <select
                    name="category"
                    value={formData.category}
                    onChange={handleCategoryChange}
                    required
                    disabled={categoriesLoading}
                  >
                    <option value="">
                      {categoriesLoading ? 'Kategoriler yükleniyor...' : 'Kategori seçin'}
                    </option>
                    {supplierCategories.map(cat => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name}
                      </option>
                    ))}
                    <option value="new-category">+ Yeni Kategori Ekle</option>
                  </select>
                ) : (
                  <input
                    type="text"
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value)}
                    placeholder="Yeni kategori adı"
                    required
                  />
                )}
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>İş Kayıt Numarası</label>
                <input
                  type="text"
                  name="businessRegistrationNumber"
                  value={formData.businessRegistrationNumber}
                  onChange={handleInputChange}
                  placeholder="Ticaret sicil numarası"
                />
              </div>
            </div>
          </div>

          {/* İletişim Bilgileri */}
          <div className="form-section">
            <h3 className="form-section-title">İletişim Bilgileri</h3>
            <div className="form-row">
              <div className="form-group">
                <label>Yetkili Kişi *</label>
                <input
                  type="text"
                  name="contactPerson"
                  value={formData.contactPerson}
                  onChange={handleInputChange}
                  placeholder="Yetkili kişi adı"
                  required
                />
              </div>
              
              <div className="form-group">
                <label>Acil Durum İletişim</label>
                <input
                  type="text"
                  name="emergencyContact"
                  value={formData.emergencyContact}
                  onChange={handleInputChange}
                  placeholder="Acil durum yetkili kişi"
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Telefon 1 *</label>
                <input
                  type="tel"
                  name="phone1"
                  value={formData.phone1}
                  onChange={handleInputChange}
                  placeholder="+90 555 123 4567"
                  required
                />
              </div>
              
              <div className="form-group">
                <label>Telefon 2</label>
                <input
                  type="tel"
                  name="phone2"
                  value={formData.phone2}
                  onChange={handleInputChange}
                  placeholder="+90 555 123 4568"
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Acil Durum Telefon</label>
                <input
                  type="tel"
                  name="emergencyPhone"
                  value={formData.emergencyPhone}
                  onChange={handleInputChange}
                  placeholder="+90 555 123 4569"
                />
              </div>
              
              <div className="form-group">
                <label>Faks</label>
                <input
                  type="tel"
                  name="fax"
                  value={formData.fax}
                  onChange={handleInputChange}
                  placeholder="+90 555 123 4570"
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>E-posta 1 *</label>
                <input
                  type="email"
                  name="email1"
                  value={formData.email1}
                  onChange={handleInputChange}
                  placeholder="info@firma.com"
                  required
                />
              </div>
              
              <div className="form-group">
                <label>E-posta 2</label>
                <input
                  type="email"
                  name="email2"
                  value={formData.email2}
                  onChange={handleInputChange}
                  placeholder="muhasebe@firma.com"
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Web Sitesi</label>
                <input
                  type="url"
                  name="website"
                  value={formData.website}
                  onChange={handleInputChange}
                  placeholder="https://www.firma.com"
                />
              </div>
              
              <div className="form-group">
                <label>Tercih Edilen İletişim</label>
                <select
                  name="preferredCommunication"
                  value={formData.preferredCommunication}
                  onChange={handleInputChange}
                >
                  <option value="email">E-posta</option>
                  <option value="phone">Telefon</option>
                  <option value="fax">Faks</option>
                  <option value="whatsapp">WhatsApp</option>
                </select>
              </div>
            </div>
          </div>

          {/* Adres Bilgileri */}
          <div className="form-section">
            <h3 className="form-section-title">Adres Bilgileri</h3>
            <div className="form-row">
              <div className="form-group">
                <label>Adres</label>
                <textarea
                  name="address"
                  value={formData.address}
                  onChange={handleInputChange}
                  placeholder="Sokak, cadde, mahalle"
                  rows="2"
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Şehir</label>
                <input
                  type="text"
                  name="city"
                  value={formData.city}
                  onChange={handleInputChange}
                  placeholder="İstanbul"
                />
              </div>
              
              <div className="form-group">
                <label>İlçe/Bölge</label>
                <input
                  type="text"
                  name="state"
                  value={formData.state}
                  onChange={handleInputChange}
                  placeholder="Kadıköy"
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Posta Kodu</label>
                <input
                  type="text"
                  name="postalCode"
                  value={formData.postalCode}
                  onChange={handleInputChange}
                  placeholder="34000"
                />
              </div>
              
              <div className="form-group">
                <label>Ülke</label>
                <select
                  name="country"
                  value={formData.country}
                  onChange={handleInputChange}
                >
                  <option value="Türkiye">Türkiye</option>
                  <option value="Almanya">Almanya</option>
                  <option value="Fransa">Fransa</option>
                  <option value="İtalya">İtalya</option>
                  <option value="İngiltere">İngiltere</option>
                  <option value="ABD">ABD</option>
                  <option value="Çin">Çin</option>
                  <option value="Japonya">Japonya</option>
                  <option value="Other">Diğer</option>
                </select>
              </div>
            </div>
          </div>

          {/* Mali Bilgiler */}
          <div className="form-section">
            <h3 className="form-section-title">Mali Bilgiler</h3>
            <div className="form-row">
              <div className="form-group">
                <label>Vergi Numarası</label>
                <input
                  type="text"
                  name="taxNumber"
                  value={formData.taxNumber}
                  onChange={handleInputChange}
                  placeholder="1234567890"
                />
              </div>
              
              <div className="form-group">
                <label>Vergi Dairesi</label>
                <input
                  type="text"
                  name="taxOffice"
                  value={formData.taxOffice}
                  onChange={handleInputChange}
                  placeholder="Kadıköy Vergi Dairesi"
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Para Birimi</label>
                <select
                  name="currency"
                  value={formData.currency}
                  onChange={handleInputChange}
                >
                  <option value="TRY">TRY - Türk Lirası</option>
                  <option value="USD">USD - Amerikan Doları</option>
                  <option value="EUR">EUR - Euro</option>
                  <option value="GBP">GBP - İngiliz Sterlini</option>
                </select>
              </div>
              
              <div className="form-group">
                <label>Kredi Limiti</label>
                <input
                  type="number"
                  name="creditLimit"
                  value={formData.creditLimit}
                  onChange={handleInputChange}
                  placeholder="0.00"
                  min="0"
                  step="0.01"
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Kredi Notu</label>
                <select
                  name="creditRating"
                  value={formData.creditRating}
                  onChange={handleInputChange}
                >
                  <option value="">Kredi notu seçin</option>
                  <option value="A">A - Mükemmel</option>
                  <option value="B">B - İyi</option>
                  <option value="C">C - Orta</option>
                  <option value="D">D - Zayıf</option>
                  <option value="F">F - Riskli</option>
                </select>
              </div>
              
              <div className="form-group">
                <label>Yıllık Ciro</label>
                <input
                  type="number"
                  name="annualRevenue"
                  value={formData.annualRevenue}
                  onChange={handleInputChange}
                  placeholder="0"
                  min="0"
                />
              </div>
            </div>
          </div>

          {/* Ödeme Bilgileri */}
          <div className="form-section">
            <h3 className="form-section-title">Ödeme Bilgileri</h3>
            <div className="form-row">
              <div className="form-group">
                <label>Ödeme Koşulları</label>
                <select
                  name="paymentTerms"
                  value={formData.paymentTerms}
                  onChange={handleInputChange}
                >
                  <option value="">Ödeme koşulu seçin</option>
                  <option value="Peşin">Peşin</option>
                  <option value="15 gün vade">15 gün vade</option>
                  <option value="30 gün vade">30 gün vade</option>
                  <option value="45 gün vade">45 gün vade</option>
                  <option value="60 gün vade">60 gün vade</option>
                  <option value="90 gün vade">90 gün vade</option>
                  <option value="120 gün vade">120 gün vade</option>
                </select>
              </div>
              
              <div className="form-group">
                <label>Ödeme Yöntemi</label>
                <select
                  name="paymentMethod"
                  value={formData.paymentMethod}
                  onChange={handleInputChange}
                >
                  <option value="">Ödeme yöntemi seçin</option>
                  <option value="bank_transfer">Havale/EFT</option>
                  <option value="check">Çek</option>
                  <option value="cash">Nakit</option>
                  <option value="credit_card">Kredi Kartı</option>
                  <option value="letter_of_credit">Akreditif</option>
                  <option value="promissory_note">Senet</option>
                </select>
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Banka Adı</label>
                <input
                  type="text"
                  name="bankName"
                  value={formData.bankName}
                  onChange={handleInputChange}
                  placeholder="İş Bankası"
                />
              </div>
              
              <div className="form-group">
                <label>Hesap Numarası</label>
                <input
                  type="text"
                  name="bankAccount"
                  value={formData.bankAccount}
                  onChange={handleInputChange}
                  placeholder="123456789"
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>IBAN</label>
                <input
                  type="text"
                  name="iban"
                  value={formData.iban}
                  onChange={handleInputChange}
                  placeholder="TR00 0000 0000 0000 0000 0000 00"
                />
              </div>
            </div>
          </div>

          {/* Operasyonel Bilgiler */}
          <div className="form-section">
            <h3 className="form-section-title">Operasyonel Bilgiler</h3>
            <div className="form-row">
              <div className="form-group">
                <label>Teslimat Kapasitesi</label>
                <input
                  type="text"
                  name="deliveryCapability"
                  value={formData.deliveryCapability}
                  onChange={handleInputChange}
                  placeholder="Günlük/Haftalık/Aylık kapasite"
                />
              </div>
              
              <div className="form-group">
                <label>Tedarik Süresi (gün)</label>
                <input
                  type="number"
                  name="leadTime"
                  value={formData.leadTime}
                  onChange={handleInputChange}
                  placeholder="7"
                  min="0"
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Minimum Sipariş Miktarı</label>
                <input
                  type="text"
                  name="minimumOrderQuantity"
                  value={formData.minimumOrderQuantity}
                  onChange={handleInputChange}
                  placeholder="100 adet, 1 ton vb."
                />
              </div>
              
              <div className="form-group">
                <label>Kalite Sertifikası</label>
                <select
                  name="qualityCertification"
                  value={formData.qualityCertification}
                  onChange={handleInputChange}
                >
                  <option value="">Sertifika seçin</option>
                  <option value="ISO_9001">ISO 9001</option>
                  <option value="ISO_14001">ISO 14001</option>
                  <option value="TS_EN_ISO">TS EN ISO</option>
                  <option value="CE">CE İşareti</option>
                  <option value="TSE">TSE</option>
                  <option value="OHSAS_18001">OHSAS 18001</option>
                  <option value="other">Diğer</option>
                </select>
              </div>
            </div>
          </div>

          {/* Tedarik Edilen Malzemeler */}
          <div className="form-section">
            <h3 className="form-section-title">Tedarik Edilen Malzemeler</h3>
            
            {/* Malzeme Ekleme Butonları */}
            <div className="form-row">
              <div className="form-group" style={{ width: '60%' }}>
                <button
                  type="button"
                  onClick={() => setShowMaterialSelector(true)}
                  className="btn btn-secondary"
                  style={{
                    padding: '12px 24px',
                    border: '2px dashed #d1d5db',
                    borderRadius: '8px',
                    background: '#f9fafb',
                    color: '#374151',
                    cursor: 'pointer',
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    fontSize: '14px',
                    fontWeight: '500'
                  }}
                >
                  <span style={{ fontSize: '18px' }}>📋</span>
                  Mevcut Malzeme Seç
                </button>
              </div>
              <div className="form-group" style={{ width: '40%' }}>
                <button
                  type="button"
                  onClick={() => {
                    if (onAddNewMaterial) {
                      onAddNewMaterial();
                    }
                  }}
                  className="btn btn-primary"
                  style={{
                    padding: '12px 16px',
                    border: 'none',
                    borderRadius: '8px',
                    background: '#3b82f6',
                    color: 'white',
                    cursor: 'pointer',
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    fontSize: '14px',
                    fontWeight: '500'
                  }}
                >
                  <span style={{ fontSize: '18px' }}>➕</span>
                  Yeni Malzeme Ekle
                </button>
              </div>
            </div>

            {/* Seçilen Malzemeler Listesi */}
            {selectedMaterials.length > 0 && (
              <div className="form-row">
                <div className="form-group full-width">
                  <label>Seçilen Malzemeler ({selectedMaterials.length})</label>
                  <div style={{
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    padding: '12px',
                    background: '#f8f9fa',
                    maxHeight: '200px',
                    overflowY: 'auto'
                  }}>
                    {selectedMaterials.map(material => (
                      <div
                        key={material.id}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          padding: '8px 12px',
                          background: 'white',
                          border: '1px solid #e5e7eb',
                          borderRadius: '4px',
                          marginBottom: '6px'
                        }}
                      >
                        <div>
                          <strong>{material.code}</strong> - {material.name}
                          <div style={{ fontSize: '12px', color: '#6b7280' }}>
                            {material.category} • {material.unit}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveMaterial(material.id)}
                          style={{
                            background: '#ef4444',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            padding: '4px 8px',
                            cursor: 'pointer',
                            fontSize: '12px'
                          }}
                        >
                          Kaldır
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Malzeme Seçici Modal */}
            {showMaterialSelector && (
              <div
                style={{
                  position: 'fixed',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  background: 'rgba(0, 0, 0, 0.5)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  zIndex: 2000
                }}
                onClick={() => setShowMaterialSelector(false)}
              >
                <div
                  style={{
                    background: 'white',
                    borderRadius: '8px',
                    padding: '20px',
                    maxWidth: '600px',
                    width: '90%',
                    maxHeight: '70vh',
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: 'column'
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '20px',
                    paddingBottom: '15px',
                    borderBottom: '2px solid #e5e7eb'
                  }}>
                    <h3 style={{ margin: 0, fontSize: '18px', color: '#374151' }}>
                      Malzeme Seç
                    </h3>
                    <button
                      onClick={() => setShowMaterialSelector(false)}
                      style={{
                        background: 'none',
                        border: 'none',
                        fontSize: '24px',
                        cursor: 'pointer',
                        color: '#6b7280'
                      }}
                    >
                      ×
                    </button>
                  </div>

                  <div style={{ marginBottom: '15px' }}>
                    <input
                      type="text"
                      placeholder="Malzeme ara... (kod veya isim)"
                      value={materialSearchTerm}
                      onChange={(e) => setMaterialSearchTerm(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '10px',
                        border: '1px solid #d1d5db',
                        borderRadius: '6px',
                        fontSize: '14px'
                      }}
                    />
                  </div>

                  <div style={{
                    flex: 1,
                    overflowY: 'auto',
                    border: '1px solid #e5e7eb',
                    borderRadius: '6px',
                    padding: '10px'
                  }}>
                    {materialsLoading ? (
                      <div style={{ textAlign: 'center', padding: '20px', color: '#6b7280' }}>
                        Malzemeler yükleniyor...
                      </div>
                    ) : filteredMaterials.length === 0 ? (
                      <div style={{ textAlign: 'center', padding: '20px', color: '#6b7280' }}>
                        {materialSearchTerm ? 'Arama kriterine uygun malzeme bulunamadı' : 'Tüm malzemeler zaten seçilmiş'}
                      </div>
                    ) : (
                      filteredMaterials.map(material => (
                        <div
                          key={material.id}
                          onClick={() => handleAddMaterial(material)}
                          style={{
                            padding: '12px',
                            border: '1px solid #e5e7eb',
                            borderRadius: '6px',
                            marginBottom: '8px',
                            cursor: 'pointer',
                            background: 'white',
                            transition: 'background-color 0.2s'
                          }}
                          onMouseEnter={(e) => e.target.style.backgroundColor = '#f8f9fa'}
                          onMouseLeave={(e) => e.target.style.backgroundColor = 'white'}
                        >
                          <div style={{ fontWeight: '600', marginBottom: '4px' }}>
                            {material.code} - {material.name}
                          </div>
                          <div style={{ fontSize: '12px', color: '#6b7280' }}>
                            Kategori: {material.category} • Birim: {material.unit} • Stok: {material.stock}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Şirket Bilgileri */}
          <div className="form-section">
            <h3 className="form-section-title">Şirket Bilgileri</h3>
            <div className="form-row">
              <div className="form-group">
                <label>Kuruluş Yılı</label>
                <input
                  type="number"
                  name="yearEstablished"
                  value={formData.yearEstablished}
                  onChange={handleInputChange}
                  placeholder="1995"
                  min="1900"
                  max="2025"
                />
              </div>
              
              <div className="form-group">
                <label>Çalışan Sayısı</label>
                <select
                  name="employeeCount"
                  value={formData.employeeCount}
                  onChange={handleInputChange}
                >
                  <option value="">Çalışan sayısı seçin</option>
                  <option value="1-10">1-10 kişi</option>
                  <option value="11-50">11-50 kişi</option>
                  <option value="51-100">51-100 kişi</option>
                  <option value="101-500">101-500 kişi</option>
                  <option value="501-1000">501-1000 kişi</option>
                  <option value="1000+">1000+ kişi</option>
                </select>
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Risk Seviyesi</label>
                <select
                  name="riskLevel"
                  value={formData.riskLevel}
                  onChange={handleInputChange}
                >
                  <option value="low">Düşük Risk</option>
                  <option value="medium">Orta Risk</option>
                  <option value="high">Yüksek Risk</option>
                </select>
              </div>
              
              <div className="form-group">
                <label>Uyumluluk Durumu</label>
                <select
                  name="complianceStatus"
                  value={formData.complianceStatus}
                  onChange={handleInputChange}
                >
                  <option value="pending">Beklemede</option>
                  <option value="approved">Onaylandı</option>
                  <option value="rejected">Reddedildi</option>
                  <option value="under_review">İnceleniyor</option>
                </select>
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Durum</label>
                <select
                  name="status"
                  value={formData.status}
                  onChange={handleInputChange}
                >
                  <option value="Aktif">Aktif</option>
                  <option value="Pasif">Pasif</option>
                  <option value="Onay Bekliyor">Onay Bekliyor</option>
                  <option value="Askıda">Askıda</option>
                </select>
              </div>
            </div>
          </div>

          {/* Notlar */}
          <div className="form-section">
            <h3 className="form-section-title">Ek Bilgiler</h3>
            <div className="form-row">
              <div className="form-group full-width">
                <label>Notlar ve Açıklamalar</label>
                <textarea
                  name="notes"
                  value={formData.notes}
                  onChange={handleInputChange}
                  placeholder="Tedarikçi hakkında ek notlar, özel koşullar, geçmiş deneyimler..."
                  rows="3"
                />
              </div>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}