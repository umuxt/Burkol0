import React, { useState, useEffect, useMemo } from 'react'
import { useSuppliers } from '../hooks/useSuppliers'

export default function AddSupplierModal({ isOpen, onClose, onSave, categories = [] }) {
  const { suppliers, loading: suppliersLoading } = useSuppliers()
  
  // Debug: Suppliers verisi
  useEffect(() => {
    console.log('🔍 AddSupplierModal: Suppliers listesi güncellendi:', {
      count: suppliers?.length || 0,
      loading: suppliersLoading,
      suppliers: suppliers?.map(s => ({ id: s.id, code: s.code, name: s.name || s.companyName }))
    })
  }, [suppliers, suppliersLoading])
  
  // Malzeme yönetimi kaldırıldı - sadece tedarikçi bilgileri
  
  // Otomatik tedarikçi kodu üretimi - minimum unique değer bulma
  const generateNextCode = () => {
    console.log('🔍 generateNextCode çağrıldı - suppliers:', suppliers)
    
    if (!suppliers || suppliers.length === 0) {
      console.log('🏷️ AddSupplierModal: Henüz tedarikçi yok, T-0001 kullanılıyor')
      return 'T-0001';
    }
    
    // Tüm supplier verilerini detaylı logla
    console.log('🔍 Tüm suppliers detaylı:', suppliers.map(s => ({
      id: s.id,
      code: s.code,
      name: s.name || s.companyName || 'İsimsiz',
      rawData: s
    })))
    
    // Mevcut tüm kodlardan sayıları çıkar ve sırala
    const existingNumbers = suppliers
      .map(supplier => {
        const code = supplier.code || '';
        console.log(`🔍 Supplier ${supplier.id}: code="${code}"`)
        const match = code.match(/^T-(\d+)$/);
        const number = match ? parseInt(match[1]) : null;
        console.log(`🔍 Code "${code}" -> number: ${number}`)
        return number;
      })
      .filter(num => num !== null)
      .sort((a, b) => a - b);
    
    console.log('🏷️ AddSupplierModal: Mevcut tedarikçi numaraları:', existingNumbers)
    
    // Minimum boş değeri bul
    let nextNumber = 1;
    for (const num of existingNumbers) {
      if (num === nextNumber) {
        nextNumber++;
      } else if (num > nextNumber) {
        // Arada boş bir numara bulundu
        break;
      }
    }
    
    const newCode = `T-${String(nextNumber).padStart(4, '0')}`;
    console.log('🏷️ AddSupplierModal: Yeni tedarikçi kodu oluşturuldu:', newCode)
    return newCode;
  };

  // nextCode'u suppliers değiştiğinde yeniden hesapla
  const nextCode = useMemo(() => {
    console.log('🔄 useMemo: nextCode hesaplanıyor, suppliers.length:', suppliers?.length || 0)
    const code = generateNextCode()
    console.log('🔄 useMemo: Hesaplanan nextCode:', code)
    return code
  }, [suppliers]);
  
  const [formData, setFormData] = useState({
    code: '',
    name: '',
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

  // Modal açıldığında form'u sıfırla
  useEffect(() => {
    if (isOpen) {
      console.log('🔄 Modal açıldı, form sıfırlanıyor. nextCode:', nextCode)
      setFormData({
        code: '',
        name: '',
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
      // Malzeme yönetimi kaldırıldı
    }
  }, [isOpen]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  // Malzeme yönetimi fonksiyonları kaldırıldı

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    const finalCode = formData.code.trim() || nextCode; // Boşsa otomatik kod kullan
    
    if (!finalCode || !formData.name || !formData.contactPerson || !formData.phone1 || !formData.email1) {
      alert('Lütfen tüm zorunlu alanları doldurun! (Firma Adı, Yetkili Kişi, Telefon 1, E-posta 1)');
      return;
    }

    try {
      const supplierData = {
        ...formData,
        code: finalCode, // Otomatik üretilen veya kullanıcının girdiği kodu kullan
        creditLimit: formData.creditLimit ? parseFloat(formData.creditLimit) : 0
      };

      console.log('🔢 Kullanılan tedarikçi kodu:', finalCode);
      onSave(supplierData);
    } catch (error) {
      console.error('Tedarikçi kaydedilirken hata:', error);
      alert('Tedarikçi kaydedilirken bir hata oluştu!');
    }
  };

  const handleClose = () => {
    setFormData({
      code: '',
      name: '',
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
    // Malzeme yönetimi kaldırıldı
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center', 
          padding: '16px 20px', 
          borderBottom: '1px solid #e5e7eb',
          background: 'white'
        }}>
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '600', color: '#111827' }}>
            Yeni Tedarikçi Ekle
          </h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button 
              type="submit" 
              form="add-supplier-form" 
              style={{
                padding: '8px 16px',
                background: '#3b82f6',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                fontSize: '14px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
              }}
              title="Kaydet"
            >
              💾 Kaydet
            </button>
            <button 
              onClick={handleClose}
              style={{
                padding: '8px',
                background: 'transparent',
                border: 'none',
                fontSize: '18px',
                cursor: 'pointer',
                color: '#6b7280'
              }}
            >
              ×
            </button>
          </div>
        </div>
        
        <div style={{ 
          padding: '16px 20px', 
          background: '#f9fafb',
          maxHeight: '80vh',
          overflowY: 'auto'
        }}>
          <form id="add-supplier-form" onSubmit={handleSubmit}>
            {/* Temel Firma Bilgileri */}
            <div style={{ 
              marginBottom: '16px', 
              padding: '12px', 
              background: 'white', 
              borderRadius: '6px',
              border: '1px solid #e5e7eb'
            }}>
              <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: '600', color: '#111827', borderBottom: '1px solid #e5e7eb', paddingBottom: '6px' }}>
                Temel Firma Bilgileri
              </h3>
              
              <div className="detail-item" style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                <span className="detail-label" style={{ fontWeight: '600', fontSize: '12px', color: '#374151', minWidth: '120px', marginRight: '8px' }}>
                  Tedarikçi Kodu:
                </span>
                <div style={{ flex: 1 }}>
                  <input
                    type="text"
                    name="code"
                    value={formData.code || ''}
                    onChange={handleInputChange}
                    placeholder={nextCode}
                    style={{
                      width: '100%',
                      padding: '6px 8px',
                      border: '1px solid #d1d5db',
                      borderRadius: '4px',
                      fontSize: '12px',
                      background: 'white'
                    }}
                  />
                  <small style={{ fontSize: '10px', color: '#6b7280', display: 'block', marginTop: '2px' }}>
                    Boş bırakılırsa otomatik olarak {nextCode} atanacak
                  </small>
                </div>
              </div>
              
              <div className="detail-item" style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                <span className="detail-label" style={{ fontWeight: '600', fontSize: '12px', color: '#374151', minWidth: '120px', marginRight: '8px' }}>
                  Firma Adı *:
                </span>
                <input
                  type="text"
                  name="name"
                  value={formData.name || ''}
                  onChange={handleInputChange}
                  placeholder="Firma adı"
                  required
                  style={{
                    flex: 1,
                    padding: '6px 8px',
                    border: '1px solid #d1d5db',
                    borderRadius: '4px',
                    fontSize: '12px',
                    background: 'white'
                  }}
                />
              </div>
              
              <div className="detail-item" style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                <span className="detail-label" style={{ fontWeight: '600', fontSize: '12px', color: '#374151', minWidth: '120px', marginRight: '8px' }}>
                  Tedarikçi Tipi *:
                </span>
                <select
                  name="supplierType"
                  value={formData.supplierType || ''}
                  onChange={handleInputChange}
                  required
                  style={{
                    flex: 1,
                    padding: '6px 8px',
                    border: '1px solid #d1d5db',
                    borderRadius: '4px',
                    fontSize: '12px',
                    background: 'white'
                  }}
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
              
              <div className="detail-item" style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                <span className="detail-label" style={{ fontWeight: '600', fontSize: '12px', color: '#374151', minWidth: '120px', marginRight: '8px' }}>
                  İş Kayıt No:
                </span>
                <input
                  type="text"
                  name="businessRegistrationNumber"
                  value={formData.businessRegistrationNumber || ''}
                  onChange={handleInputChange}
                  placeholder="İş kayıt numarası"
                  style={{
                    flex: 1,
                    padding: '6px 8px',
                    border: '1px solid #d1d5db',
                    borderRadius: '4px',
                    fontSize: '12px',
                    background: 'white'
                  }}
                />
              </div>
            </div>

            {/* İletişim Bilgileri */}
            <div style={{ 
              marginBottom: '16px', 
              padding: '12px', 
              background: 'white', 
              borderRadius: '6px',
              border: '1px solid #e5e7eb'
            }}>
              <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: '600', color: '#111827', borderBottom: '1px solid #e5e7eb', paddingBottom: '6px' }}>
                İletişim Bilgileri
              </h3>
              
              <div className="detail-item" style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                <span className="detail-label" style={{ fontWeight: '600', fontSize: '12px', color: '#374151', minWidth: '120px', marginRight: '8px' }}>
                  Yetkili Kişi *:
                </span>
                <input
                  type="text"
                  name="contactPerson"
                  value={formData.contactPerson || ''}
                  onChange={handleInputChange}
                  placeholder="Yetkili kişi"
                  required
                  style={{
                    flex: 1,
                    padding: '6px 8px',
                    border: '1px solid #d1d5db',
                    borderRadius: '4px',
                    fontSize: '12px',
                    background: 'white'
                  }}
                />
              </div>
              
              <div className="detail-item" style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                <span className="detail-label" style={{ fontWeight: '600', fontSize: '12px', color: '#374151', minWidth: '120px', marginRight: '8px' }}>
                  Acil Durum Kişi:
                </span>
                <input
                  type="text"
                  name="emergencyContact"
                  value={formData.emergencyContact || ''}
                  onChange={handleInputChange}
                  placeholder="Acil durum kişisi"
                  style={{
                    flex: 1,
                    padding: '6px 8px',
                    border: '1px solid #d1d5db',
                    borderRadius: '4px',
                    fontSize: '12px',
                    background: 'white'
                  }}
                />
              </div>
              
              <div className="detail-item" style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                <span className="detail-label" style={{ fontWeight: '600', fontSize: '12px', color: '#374151', minWidth: '120px', marginRight: '8px' }}>
                  Telefon 1 *:
                </span>
                <input
                  type="tel"
                  name="phone1"
                  value={formData.phone1 || ''}
                  onChange={handleInputChange}
                  placeholder="Telefon numarası"
                  required
                  style={{
                    flex: 1,
                    padding: '6px 8px',
                    border: '1px solid #d1d5db',
                    borderRadius: '4px',
                    fontSize: '12px',
                    background: 'white'
                  }}
                />
              </div>
              
              <div className="detail-item" style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                <span className="detail-label" style={{ fontWeight: '600', fontSize: '12px', color: '#374151', minWidth: '120px', marginRight: '8px' }}>
                  Telefon 2:
                </span>
                <input
                  type="tel"
                  name="phone2"
                  value={formData.phone2 || ''}
                  onChange={handleInputChange}
                  placeholder="İkinci telefon"
                  style={{
                    flex: 1,
                    padding: '6px 8px',
                    border: '1px solid #d1d5db',
                    borderRadius: '4px',
                    fontSize: '12px',
                    background: 'white'
                  }}
                />
              </div>
              
              <div className="detail-item" style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                <span className="detail-label" style={{ fontWeight: '600', fontSize: '12px', color: '#374151', minWidth: '120px', marginRight: '8px' }}>
                  Acil Telefon:
                </span>
                <input
                  type="tel"
                  name="emergencyPhone"
                  value={formData.emergencyPhone || ''}
                  onChange={handleInputChange}
                  placeholder="Acil telefon"
                  style={{
                    flex: 1,
                    padding: '6px 8px',
                    border: '1px solid #d1d5db',
                    borderRadius: '4px',
                    fontSize: '12px',
                    background: 'white'
                  }}
                />
              </div>
              
              <div className="detail-item" style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                <span className="detail-label" style={{ fontWeight: '600', fontSize: '12px', color: '#374151', minWidth: '120px', marginRight: '8px' }}>
                  Faks:
                </span>
                <input
                  type="tel"
                  name="fax"
                  value={formData.fax || ''}
                  onChange={handleInputChange}
                  placeholder="Faks numarası"
                  style={{
                    flex: 1,
                    padding: '6px 8px',
                    border: '1px solid #d1d5db',
                    borderRadius: '4px',
                    fontSize: '12px',
                    background: 'white'
                  }}
                />
              </div>
              
              <div className="detail-item" style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                <span className="detail-label" style={{ fontWeight: '600', fontSize: '12px', color: '#374151', minWidth: '120px', marginRight: '8px' }}>
                  E-posta 1 *:
                </span>
                <input
                  type="email"
                  name="email1"
                  value={formData.email1 || ''}
                  onChange={handleInputChange}
                  placeholder="E-posta adresi"
                  required
                  style={{
                    flex: 1,
                    padding: '6px 8px',
                    border: '1px solid #d1d5db',
                    borderRadius: '4px',
                    fontSize: '12px',
                    background: 'white'
                  }}
                />
              </div>
              
              <div className="detail-item" style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                <span className="detail-label" style={{ fontWeight: '600', fontSize: '12px', color: '#374151', minWidth: '120px', marginRight: '8px' }}>
                  E-posta 2:
                </span>
                <input
                  type="email"
                  name="email2"
                  value={formData.email2 || ''}
                  onChange={handleInputChange}
                  placeholder="İkinci e-posta"
                  style={{
                    flex: 1,
                    padding: '6px 8px',
                    border: '1px solid #d1d5db',
                    borderRadius: '4px',
                    fontSize: '12px',
                    background: 'white'
                  }}
                />
              </div>
              
              <div className="detail-item" style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                <span className="detail-label" style={{ fontWeight: '600', fontSize: '12px', color: '#374151', minWidth: '120px', marginRight: '8px' }}>
                  Web Sitesi:
                </span>
                <input
                  type="url"
                  name="website"
                  value={formData.website || ''}
                  onChange={handleInputChange}
                  placeholder="Web sitesi"
                  style={{
                    flex: 1,
                    padding: '6px 8px',
                    border: '1px solid #d1d5db',
                    borderRadius: '4px',
                    fontSize: '12px',
                    background: 'white'
                  }}
                />
              </div>
              
              <div className="detail-item" style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                <span className="detail-label" style={{ fontWeight: '600', fontSize: '12px', color: '#374151', minWidth: '120px', marginRight: '8px' }}>
                  Tercih İletişim:
                </span>
                <select
                  name="preferredCommunication"
                  value={formData.preferredCommunication || ''}
                  onChange={handleInputChange}
                  style={{
                    flex: 1,
                    padding: '6px 8px',
                    border: '1px solid #d1d5db',
                    borderRadius: '4px',
                    fontSize: '12px',
                    background: 'white'
                  }}
                >
                  <option value="email">E-posta</option>
                  <option value="phone">Telefon</option>
                  <option value="fax">Faks</option>
                  <option value="whatsapp">WhatsApp</option>
                </select>
              </div>
            </div>

            {/* Adres ve Mali Bilgiler - Üst Bölüm */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
              {/* Adres Bilgileri */}
              <div style={{ 
                padding: '12px', 
                background: 'white', 
                borderRadius: '6px',
                border: '1px solid #e5e7eb'
              }}>
                <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: '600', color: '#111827', borderBottom: '1px solid #e5e7eb', paddingBottom: '6px' }}>
                  Adres Bilgileri
                </h3>
                
                <div className="detail-item" style={{ display: 'flex', alignItems: 'flex-start', marginBottom: '8px' }}>
                  <span className="detail-label" style={{ fontWeight: '600', fontSize: '12px', color: '#374151', minWidth: '80px', marginRight: '8px', marginTop: '2px' }}>
                    Adres:
                  </span>
                  <textarea
                    name="address"
                    value={formData.address || ''}
                    onChange={handleInputChange}
                    placeholder="Adres"
                    rows="2"
                    style={{
                      flex: 1,
                      padding: '6px 8px',
                      border: '1px solid #d1d5db',
                      borderRadius: '4px',
                      fontSize: '12px',
                      background: 'white',
                      resize: 'vertical'
                    }}
                  />
                </div>
                
                <div className="detail-item" style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                  <span className="detail-label" style={{ fontWeight: '600', fontSize: '12px', color: '#374151', minWidth: '80px', marginRight: '8px' }}>
                    Şehir:
                  </span>
                  <input
                    type="text"
                    name="city"
                    value={formData.city || ''}
                    onChange={handleInputChange}
                    placeholder="Şehir"
                    style={{
                      flex: 1,
                      padding: '6px 8px',
                      border: '1px solid #d1d5db',
                      borderRadius: '4px',
                      fontSize: '12px',
                      background: 'white'
                    }}
                  />
                </div>
                
                <div className="detail-item" style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                  <span className="detail-label" style={{ fontWeight: '600', fontSize: '12px', color: '#374151', minWidth: '80px', marginRight: '8px' }}>
                    İlçe:
                  </span>
                  <input
                    type="text"
                    name="state"
                    value={formData.state || ''}
                    onChange={handleInputChange}
                    placeholder="İlçe/Bölge"
                    style={{
                      flex: 1,
                      padding: '6px 8px',
                      border: '1px solid #d1d5db',
                      borderRadius: '4px',
                      fontSize: '12px',
                      background: 'white'
                    }}
                  />
                </div>
                
                <div className="detail-item" style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                  <span className="detail-label" style={{ fontWeight: '600', fontSize: '12px', color: '#374151', minWidth: '80px', marginRight: '8px' }}>
                    Posta Kodu:
                  </span>
                  <input
                    type="text"
                    name="postalCode"
                    value={formData.postalCode || ''}
                    onChange={handleInputChange}
                    placeholder="Posta kodu"
                    style={{
                      flex: 1,
                      padding: '6px 8px',
                      border: '1px solid #d1d5db',
                      borderRadius: '4px',
                      fontSize: '12px',
                      background: 'white'
                    }}
                  />
                </div>
                
                <div className="detail-item" style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                  <span className="detail-label" style={{ fontWeight: '600', fontSize: '12px', color: '#374151', minWidth: '80px', marginRight: '8px' }}>
                    Ülke:
                  </span>
                  <select
                    name="country"
                    value={formData.country || ''}
                    onChange={handleInputChange}
                    style={{
                      flex: 1,
                      padding: '6px 8px',
                      border: '1px solid #d1d5db',
                      borderRadius: '4px',
                      fontSize: '12px',
                      background: 'white'
                    }}
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

              {/* Mali Bilgiler */}
              <div style={{ 
                padding: '12px', 
                background: 'white', 
                borderRadius: '6px',
                border: '1px solid #e5e7eb'
              }}>
                <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: '600', color: '#111827', borderBottom: '1px solid #e5e7eb', paddingBottom: '6px' }}>
                  Mali Bilgiler
                </h3>
                
                <div className="detail-item" style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                  <span className="detail-label" style={{ fontWeight: '600', fontSize: '12px', color: '#374151', minWidth: '80px', marginRight: '8px' }}>
                    Vergi No:
                  </span>
                  <input
                    type="text"
                    name="taxNumber"
                    value={formData.taxNumber || ''}
                    onChange={handleInputChange}
                    placeholder="Vergi numarası"
                    style={{
                      flex: 1,
                      padding: '6px 8px',
                      border: '1px solid #d1d5db',
                      borderRadius: '4px',
                      fontSize: '12px',
                      background: 'white'
                    }}
                  />
                </div>
                
                <div className="detail-item" style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                  <span className="detail-label" style={{ fontWeight: '600', fontSize: '12px', color: '#374151', minWidth: '80px', marginRight: '8px' }}>
                    Vergi Dairesi:
                  </span>
                  <input
                    type="text"
                    name="taxOffice"
                    value={formData.taxOffice || ''}
                    onChange={handleInputChange}
                    placeholder="Vergi dairesi"
                    style={{
                      flex: 1,
                      padding: '6px 8px',
                      border: '1px solid #d1d5db',
                      borderRadius: '4px',
                      fontSize: '12px',
                      background: 'white'
                    }}
                  />
                </div>
                
                <div className="detail-item" style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                  <span className="detail-label" style={{ fontWeight: '600', fontSize: '12px', color: '#374151', minWidth: '80px', marginRight: '8px' }}>
                    Para Birimi:
                  </span>
                  <select
                    name="currency"
                    value={formData.currency || ''}
                    onChange={handleInputChange}
                    style={{
                      flex: 1,
                      padding: '6px 8px',
                      border: '1px solid #d1d5db',
                      borderRadius: '4px',
                      fontSize: '12px',
                      background: 'white'
                    }}
                  >
                    <option value="TRY">TRY</option>
                    <option value="USD">USD</option>
                    <option value="EUR">EUR</option>
                    <option value="GBP">GBP</option>
                  </select>
                </div>
                
                <div className="detail-item" style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                  <span className="detail-label" style={{ fontWeight: '600', fontSize: '12px', color: '#374151', minWidth: '80px', marginRight: '8px' }}>
                    Kredi Limiti:
                  </span>
                  <input
                    type="number"
                    name="creditLimit"
                    value={formData.creditLimit || ''}
                    onChange={handleInputChange}
                    placeholder="Kredi limiti"
                    min="0"
                    step="0.01"
                    style={{
                      flex: 1,
                      padding: '6px 8px',
                      border: '1px solid #d1d5db',
                      borderRadius: '4px',
                      fontSize: '12px',
                      background: 'white'
                    }}
                  />
                </div>
                
                <div className="detail-item" style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                  <span className="detail-label" style={{ fontWeight: '600', fontSize: '12px', color: '#374151', minWidth: '80px', marginRight: '8px' }}>
                    Kredi Notu:
                  </span>
                  <select
                    name="creditRating"
                    value={formData.creditRating || ''}
                    onChange={handleInputChange}
                    style={{
                      flex: 1,
                      padding: '6px 8px',
                      border: '1px solid #d1d5db',
                      borderRadius: '4px',
                      fontSize: '12px',
                      background: 'white'
                    }}
                  >
                    <option value="">Seçin</option>
                    <option value="A">A - Mükemmel</option>
                    <option value="B">B - İyi</option>
                    <option value="C">C - Orta</option>
                    <option value="D">D - Zayıf</option>
                    <option value="F">F - Riskli</option>
                  </select>
                </div>
                
                <div className="detail-item" style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                  <span className="detail-label" style={{ fontWeight: '600', fontSize: '12px', color: '#374151', minWidth: '80px', marginRight: '8px' }}>
                    Yıllık Ciro:
                  </span>
                  <input
                    type="number"
                    name="annualRevenue"
                    value={formData.annualRevenue || ''}
                    onChange={handleInputChange}
                    placeholder="Yıllık ciro"
                    min="0"
                    style={{
                      flex: 1,
                      padding: '6px 8px',
                      border: '1px solid #d1d5db',
                      borderRadius: '4px',
                      fontSize: '12px',
                      background: 'white'
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Ödeme ve Operasyonel Bilgiler - Orta Bölüm */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
              {/* Ödeme Bilgileri */}
              <div style={{ 
                padding: '12px', 
                background: 'white', 
                borderRadius: '6px',
                border: '1px solid #e5e7eb'
              }}>
                <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: '600', color: '#111827', borderBottom: '1px solid #e5e7eb', paddingBottom: '6px' }}>
                  Ödeme Bilgileri
                </h3>
                
                <div className="detail-item" style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                  <span className="detail-label" style={{ fontWeight: '600', fontSize: '12px', color: '#374151', minWidth: '80px', marginRight: '8px' }}>
                    Ödeme Koşul:
                  </span>
                  <select
                    name="paymentTerms"
                    value={formData.paymentTerms || ''}
                    onChange={handleInputChange}
                    style={{
                      flex: 1,
                      padding: '6px 8px',
                      border: '1px solid #d1d5db',
                      borderRadius: '4px',
                      fontSize: '12px',
                      background: 'white'
                    }}
                  >
                    <option value="">Seçin</option>
                    <option value="Peşin">Peşin</option>
                    <option value="15 gün vade">15 gün</option>
                    <option value="30 gün vade">30 gün</option>
                    <option value="45 gün vade">45 gün</option>
                    <option value="60 gün vade">60 gün</option>
                    <option value="90 gün vade">90 gün</option>
                    <option value="120 gün vade">120 gün</option>
                  </select>
                </div>
                
                <div className="detail-item" style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                  <span className="detail-label" style={{ fontWeight: '600', fontSize: '12px', color: '#374151', minWidth: '80px', marginRight: '8px' }}>
                    Ödeme Yöntem:
                  </span>
                  <select
                    name="paymentMethod"
                    value={formData.paymentMethod || ''}
                    onChange={handleInputChange}
                    style={{
                      flex: 1,
                      padding: '6px 8px',
                      border: '1px solid #d1d5db',
                      borderRadius: '4px',
                      fontSize: '12px',
                      background: 'white'
                    }}
                  >
                    <option value="">Seçin</option>
                    <option value="bank_transfer">Havale/EFT</option>
                    <option value="check">Çek</option>
                    <option value="cash">Nakit</option>
                    <option value="credit_card">Kredi Kartı</option>
                    <option value="letter_of_credit">Akreditif</option>
                    <option value="promissory_note">Senet</option>
                  </select>
                </div>
                
                <div className="detail-item" style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                  <span className="detail-label" style={{ fontWeight: '600', fontSize: '12px', color: '#374151', minWidth: '80px', marginRight: '8px' }}>
                    Banka:
                  </span>
                  <input
                    type="text"
                    name="bankName"
                    value={formData.bankName || ''}
                    onChange={handleInputChange}
                    placeholder="Banka adı"
                    style={{
                      flex: 1,
                      padding: '6px 8px',
                      border: '1px solid #d1d5db',
                      borderRadius: '4px',
                      fontSize: '12px',
                      background: 'white'
                    }}
                  />
                </div>
                
                <div className="detail-item" style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                  <span className="detail-label" style={{ fontWeight: '600', fontSize: '12px', color: '#374151', minWidth: '80px', marginRight: '8px' }}>
                    Hesap No:
                  </span>
                  <input
                    type="text"
                    name="bankAccount"
                    value={formData.bankAccount || ''}
                    onChange={handleInputChange}
                    placeholder="Hesap numarası"
                    style={{
                      flex: 1,
                      padding: '6px 8px',
                      border: '1px solid #d1d5db',
                      borderRadius: '4px',
                      fontSize: '12px',
                      background: 'white'
                    }}
                  />
                </div>
                
                <div className="detail-item" style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                  <span className="detail-label" style={{ fontWeight: '600', fontSize: '12px', color: '#374151', minWidth: '80px', marginRight: '8px' }}>
                    IBAN:
                  </span>
                  <input
                    type="text"
                    name="iban"
                    value={formData.iban || ''}
                    onChange={handleInputChange}
                    placeholder="IBAN"
                    style={{
                      flex: 1,
                      padding: '6px 8px',
                      border: '1px solid #d1d5db',
                      borderRadius: '4px',
                      fontSize: '12px',
                      background: 'white'
                    }}
                  />
                </div>
              </div>

              {/* Operasyonel Bilgiler */}
              <div style={{ 
                padding: '12px', 
                background: 'white', 
                borderRadius: '6px',
                border: '1px solid #e5e7eb'
              }}>
                <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: '600', color: '#111827', borderBottom: '1px solid #e5e7eb', paddingBottom: '6px' }}>
                  Operasyonel Bilgiler
                </h3>
                
                <div className="detail-item" style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                  <span className="detail-label" style={{ fontWeight: '600', fontSize: '12px', color: '#374151', minWidth: '80px', marginRight: '8px' }}>
                    Teslimat:
                  </span>
                  <input
                    type="text"
                    name="deliveryCapability"
                    value={formData.deliveryCapability || ''}
                    onChange={handleInputChange}
                    placeholder="Teslimat kapasitesi"
                    style={{
                      flex: 1,
                      padding: '6px 8px',
                      border: '1px solid #d1d5db',
                      borderRadius: '4px',
                      fontSize: '12px',
                      background: 'white'
                    }}
                  />
                </div>
                
                <div className="detail-item" style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                  <span className="detail-label" style={{ fontWeight: '600', fontSize: '12px', color: '#374151', minWidth: '80px', marginRight: '8px' }}>
                    Tedarik Süresi:
                  </span>
                  <input
                    type="number"
                    name="leadTime"
                    value={formData.leadTime || ''}
                    onChange={handleInputChange}
                    placeholder="Tedarik süresi (gün)"
                    min="0"
                    style={{
                      flex: 1,
                      padding: '6px 8px',
                      border: '1px solid #d1d5db',
                      borderRadius: '4px',
                      fontSize: '12px',
                      background: 'white'
                    }}
                  />
                </div>
                
                <div className="detail-item" style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                  <span className="detail-label" style={{ fontWeight: '600', fontSize: '12px', color: '#374151', minWidth: '80px', marginRight: '8px' }}>
                    Min. Sipariş:
                  </span>
                  <input
                    type="text"
                    name="minimumOrderQuantity"
                    value={formData.minimumOrderQuantity || ''}
                    onChange={handleInputChange}
                    placeholder="Minimum sipariş miktarı"
                    style={{
                      flex: 1,
                      padding: '6px 8px',
                      border: '1px solid #d1d5db',
                      borderRadius: '4px',
                      fontSize: '12px',
                      background: 'white'
                    }}
                  />
                </div>
                
                <div className="detail-item" style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                  <span className="detail-label" style={{ fontWeight: '600', fontSize: '12px', color: '#374151', minWidth: '80px', marginRight: '8px' }}>
                    Sertifika:
                  </span>
                  <select
                    name="qualityCertification"
                    value={formData.qualityCertification || ''}
                    onChange={handleInputChange}
                    style={{
                      flex: 1,
                      padding: '6px 8px',
                      border: '1px solid #d1d5db',
                      borderRadius: '4px',
                      fontSize: '12px',
                      background: 'white'
                    }}
                  >
                    <option value="">Seçin</option>
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

            {/* Şirket Bilgileri - Alt Bölüm */}
            <div style={{ 
              marginBottom: '16px', 
              padding: '12px', 
              background: 'white', 
              borderRadius: '6px',
              border: '1px solid #e5e7eb'
            }}>
              <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: '600', color: '#111827', borderBottom: '1px solid #e5e7eb', paddingBottom: '6px' }}>
                Şirket Bilgileri
              </h3>
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '16px' }}>
                <div className="detail-item" style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                  <span className="detail-label" style={{ fontWeight: '600', fontSize: '12px', color: '#374151', minWidth: '100px', marginRight: '8px' }}>
                    Kuruluş Yılı:
                  </span>
                  <input
                    type="number"
                    name="yearEstablished"
                    value={formData.yearEstablished || ''}
                    onChange={handleInputChange}
                    placeholder="Kuruluş yılı"
                    min="1900"
                    max="2025"
                    style={{
                      flex: 1,
                      padding: '6px 8px',
                      border: '1px solid #d1d5db',
                      borderRadius: '4px',
                      fontSize: '12px',
                      background: 'white'
                    }}
                  />
                </div>
                
                <div className="detail-item" style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                  <span className="detail-label" style={{ fontWeight: '600', fontSize: '12px', color: '#374151', minWidth: '100px', marginRight: '8px' }}>
                    Çalışan Sayısı:
                  </span>
                  <select
                    name="employeeCount"
                    value={formData.employeeCount || ''}
                    onChange={handleInputChange}
                    style={{
                      flex: 1,
                      padding: '6px 8px',
                      border: '1px solid #d1d5db',
                      borderRadius: '4px',
                      fontSize: '12px',
                      background: 'white'
                    }}
                  >
                    <option value="">Seçin</option>
                    <option value="1-10">1-10 kişi</option>
                    <option value="11-50">11-50 kişi</option>
                    <option value="51-100">51-100 kişi</option>
                    <option value="101-500">101-500 kişi</option>
                    <option value="501-1000">501-1000 kişi</option>
                    <option value="1000+">1000+ kişi</option>
                  </select>
                </div>
                
                <div className="detail-item" style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                  <span className="detail-label" style={{ fontWeight: '600', fontSize: '12px', color: '#374151', minWidth: '100px', marginRight: '8px' }}>
                    Risk Seviyesi:
                  </span>
                  <select
                    name="riskLevel"
                    value={formData.riskLevel || ''}
                    onChange={handleInputChange}
                    style={{
                      flex: 1,
                      padding: '6px 8px',
                      border: '1px solid #d1d5db',
                      borderRadius: '4px',
                      fontSize: '12px',
                      background: 'white'
                    }}
                  >
                    <option value="low">Düşük Risk</option>
                    <option value="medium">Orta Risk</option>
                    <option value="high">Yüksek Risk</option>
                  </select>
                </div>
                
                <div className="detail-item" style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                  <span className="detail-label" style={{ fontWeight: '600', fontSize: '12px', color: '#374151', minWidth: '100px', marginRight: '8px' }}>
                    Uyumluluk:
                  </span>
                  <select
                    name="complianceStatus"
                    value={formData.complianceStatus || ''}
                    onChange={handleInputChange}
                    style={{
                      flex: 1,
                      padding: '6px 8px',
                      border: '1px solid #d1d5db',
                      borderRadius: '4px',
                      fontSize: '12px',
                      background: 'white'
                    }}
                  >
                    <option value="pending">Beklemede</option>
                    <option value="approved">Onaylandı</option>
                    <option value="rejected">Reddedildi</option>
                    <option value="under_review">İnceleniyor</option>
                  </select>
                </div>
              </div>
              
              <div style={{ marginTop: '8px' }}>
                <div className="detail-item" style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                  <span className="detail-label" style={{ fontWeight: '600', fontSize: '12px', color: '#374151', minWidth: '100px', marginRight: '8px' }}>
                    Durum:
                  </span>
                  <select
                    name="status"
                    value={formData.status || ''}
                    onChange={handleInputChange}
                    style={{
                      flex: 1,
                      padding: '6px 8px',
                      border: '1px solid #d1d5db',
                      borderRadius: '4px',
                      fontSize: '12px',
                      background: 'white',
                      maxWidth: '200px'
                    }}
                  >
                    <option value="Aktif">Aktif</option>
                    <option value="Pasif">Pasif</option>
                    <option value="Onay Bekliyor">Onay Bekliyor</option>
                    <option value="Askıda">Askıda</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Ek Bilgiler */}
            <div style={{ 
              marginBottom: '16px', 
              padding: '12px', 
              background: 'white', 
              borderRadius: '6px',
              border: '1px solid #e5e7eb'
            }}>
              <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: '600', color: '#111827', borderBottom: '1px solid #e5e7eb', paddingBottom: '6px' }}>
                Ek Bilgiler
              </h3>
              
              <div className="detail-item" style={{ display: 'flex', alignItems: 'flex-start', marginBottom: '8px' }}>
                <textarea
                  name="notes"
                  value={formData.notes || ''}
                  onChange={handleInputChange}
                  placeholder="Notlar ve açıklamalar"
                  rows="3"
                  style={{
                    flex: 1,
                    padding: '6px 8px',
                    border: '1px solid #d1d5db',
                    borderRadius: '4px',
                    fontSize: '12px',
                    background: 'white',
                    resize: 'vertical'
                  }}
                />
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}