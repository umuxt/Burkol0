import React, { useState, useEffect, useMemo } from 'react'
import { useSuppliers } from '../../../hooks/useSuppliers.js'
import { useMaterials, useMaterialActions } from '../../../hooks/useMaterials.js'
import { categoriesService } from '../../../services/categories-service.js'
import { showToast } from '../../../../../shared/components/MESToast.js'

export default function AddSupplierModal({ isOpen, onClose, onSave }) {
  const { suppliers, loading: suppliersLoading } = useSuppliers()
  const { materials, loading: materialsLoading, loadMaterials } = useMaterials(false) // autoLoad false
  const { addMaterial } = useMaterialActions()
  
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

  // Material management state
  const [materialMode, setMaterialMode] = useState('existing') // 'existing' or 'new'
  const [selectedMaterials, setSelectedMaterials] = useState([])
  const [materialSearchTerm, setMaterialSearchTerm] = useState('')
  const [showMaterialPopup, setShowMaterialPopup] = useState(false) // Pop-up state
  const [materialCategories, setMaterialCategories] = useState([]) // Categories from Backend API
  const [allMaterials, setAllMaterials] = useState([]) // All materials including removed ones for code generation
  const [nextMaterialCode, setNextMaterialCode] = useState(() => {
    // Component mount'ta hesapla
    return 'M-001'; // Will be updated by useEffect
  }) // Dynamic next code
  const [materialTypes] = useState([
    { id: 'raw_material', label: 'Ham Madde' },
    { id: 'processed', label: 'İşlenmiş Ürün' },
    { id: 'scrap', label: 'Hurda' }
  ])
  const [showNewCategory, setShowNewCategory] = useState(false) // Show new category input
  const [newCategory, setNewCategory] = useState('') // New category name
  const [newMaterial, setNewMaterial] = useState({
    name: '',
    type: '',
    category: '',
    unit: '',
    description: '',
    code: '',
    // Add missing fields
    reorderPoint: '',
    stockLevel: '', // stock olarak da kullanılabilir
    costPrice: '',
    sellPrice: '',
    price: '', // backward compatibility için
    supplier: '',
    status: 'Aktif'
  })

  // Remove automatic material loading - will load only when popup opens

  // Modal açıldığında form'u sıfırla
  // Load all materials for code generation when modal opens
  const loadAllMaterials = async () => {
    try {
      const { materialsService } = await import('../../../services/materials-service.js');
      const allMaterialsList = await materialsService.getAllMaterials();
      console.log('🔢 AddSupplierModal: Kod oluşturma için tüm materyaller yüklendi:', allMaterialsList.length);
      setAllMaterials(allMaterialsList);
    } catch (error) {
      console.error('❌ AddSupplierModal: Tüm materyaller yüklenemedi:', error);
      // Fallback olarak mevcut materials'ı kullan
      setAllMaterials(materials || []);
    }
  };

  useEffect(() => {
    if (isOpen) {
      console.log('🔄 Modal açıldı, form sıfırlanıyor. nextCode:', nextCode)
      // Load all materials for code generation
      loadAllMaterials();
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
      // Reset material state
      setMaterialMode('existing')
      setSelectedMaterials([])
      setMaterialSearchTerm('')
      setShowMaterialPopup(false) // Reset popup state
      setShowNewCategory(false) // Reset new category state
      setNewCategory('') // Reset new category name
      setNewMaterial({
        name: '',
        type: '',
        category: '',
        unit: '',
        description: '',
        code: '',
        reorderPoint: '',
        stockLevel: '',
        costPrice: '',
        sellPrice: '',
        price: '',
        supplier: '',
        status: 'Aktif'
      })
    }
  }, [isOpen]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    
    // Sayısal alanlar için özel validasyon
    const numericFields = ['creditLimit', 'unitPrice', 'minOrderQuantity', 'leadTime', 'paymentTerms', 'minOrderAmount', 'deliveryFee', 'price', 'quantity', 'minOrder', 'leadTimeDays']
    if (numericFields.includes(name)) {
      let cleanValue = value.replace(/,/g, '.');
      if (!/^[0-9.]*$/.test(cleanValue)) return;
      if ((cleanValue.match(/\./g) || []).length > 1) return;
      setFormData(prev => ({
        ...prev,
        [name]: cleanValue
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        [name]: value
      }));
    }
  };

  const handleOpenMaterialPopup = async () => {
    setShowMaterialPopup(true)
    // Load materials only when popup opens
    if (!materials || materials.length === 0) {
      await loadMaterials()
    }
    // Extract unique categories from materials
    await extractMaterialCategories()
  }

  const extractMaterialCategories = async () => {
    try {
      // Get categories from categories service instead of extracting from materials
      const categoriesFromService = await categoriesService.getCategories()
      const materialCategories = categoriesFromService.filter(cat => 
        cat.type === 'material' || !cat.type // Include materials and general categories
      )
      setMaterialCategories(materialCategories)
    } catch (error) {
      console.error('Categories yüklenirken hata:', error)
      // Fallback: extract unique categories from materials
      if (materials && materials.length > 0) {
        const categories = [...new Set(materials
          .map(material => material.category)
          .filter(category => category && category.trim() !== '')
        )].sort().map(name => ({ id: name, name })) // Convert to object format
        setMaterialCategories(categories)
      }
    }
  }

  // Update next material code when allMaterials changes
  useEffect(() => {
    const materialsForCodeGen = allMaterials.length > 0 ? allMaterials : (materials || []);
    
    if (materialsForCodeGen.length === 0) {
      setNextMaterialCode('M-001');
      return;
    }
    
    const existingNumbers = materialsForCodeGen
      .map(material => {
        const code = material.code || '';
        const match = code.match(/^M-(\d+)$/);
        return match ? parseInt(match[1]) : null;
      })
      .filter(num => num !== null)
      .sort((a, b) => a - b);
    
    let nextNumber = 1;
    for (const num of existingNumbers) {
      if (num === nextNumber) {
        nextNumber++;
      } else if (num > nextNumber) {
        break;
      }
    }
    
    const newCode = `M-${String(nextNumber).padStart(3, '0')}`;
    console.log('🔢 AddSupplierModal nextMaterialCode güncellendi:', newCode);
    setNextMaterialCode(newCode);
  }, [allMaterials, materials]);

  // Helper function to get category name from ID
  const getCategoryName = (categoryId) => {
    const category = materialCategories.find(cat => cat.id === categoryId)
    return category ? (category.name || category.label || categoryId) : categoryId
  }

  const filteredMaterials = useMemo(() => {
    if (!materials || !Array.isArray(materials)) return []
    // Only include active materials (exclude 'Kaldırıldı')
    return materials
      .filter(material => material.status !== 'Kaldırıldı')
      .filter(material => 
        material.name?.toLowerCase().includes(materialSearchTerm.toLowerCase()) ||
        material.code?.toLowerCase().includes(materialSearchTerm.toLowerCase()) ||
        getCategoryName(material.category)?.toLowerCase().includes(materialSearchTerm.toLowerCase())
      )
  }, [materials, materialSearchTerm, materialCategories])

  const handleMaterialSelect = (material) => {
    const isAlreadySelected = selectedMaterials.find(m => m.id === material.id)
    
    if (isAlreadySelected) {
      // Deselect - remove from selected materials
      setSelectedMaterials(prev => prev.filter(m => m.id !== material.id))
    } else {
      // Select - add to selected materials
      setSelectedMaterials(prev => [...prev, material])
    }
  }

  const handleMaterialRemove = (materialId) => {
    setSelectedMaterials(prev => prev.filter(m => m.id !== materialId))
  }

  const handleNewMaterialChange = (e) => {
    const { name, value } = e.target
    setNewMaterial(prev => ({
      ...prev,
      [name]: value
    }))
  }

  const handleCategoryChange = (e) => {
    const value = e.target.value
    if (value === 'new-category') {
      setShowNewCategory(true)
      setNewMaterial(prev => ({ ...prev, category: '' }))
    } else {
      setShowNewCategory(false)
      setNewMaterial(prev => ({ ...prev, category: value }))
    }
  }

  const handleAddNewMaterial = async () => {
    const finalCategory = showNewCategory ? newCategory : newMaterial.category
    
    if (!newMaterial.name || !newMaterial.type || !finalCategory || !newMaterial.unit) {
      showToast('Lütfen malzeme adı, tip, kategori ve birim alanlarını doldurun!', 'warning')
      return
    }

    try {
      // If new category, add it to Backend API first
      let categoryToUse = finalCategory
      if (showNewCategory && newCategory.trim()) {
        try {
          const newCategoryData = await categoriesService.addCategory({
            name: newCategory.trim(),
            createdAt: new Date(),
            type: 'material'
          })
          console.log('✅ New category added:', newCategory, 'ID:', newCategoryData.id)
          // Use the category ID returned from backend
          categoryToUse = newCategoryData.id
        } catch (categoryError) {
          console.error('❌ Category creation failed:', categoryError)
          showToast('Kategori oluşturulamadı. Mevcut kategorilerden birini seçin.', 'error')
          return
        }
      }

      // Use provided code or generate automatic code
      const finalCode = newMaterial.code.trim() || nextMaterialCode
      
      const materialData = {
        ...newMaterial,
        category: categoryToUse, // Use category ID (integer)
        code: finalCode,
        createdAt: new Date(),
        suppliers: [], // Will be updated when supplier is saved
        reorderPoint: newMaterial.reorderPoint ? parseFloat(newMaterial.reorderPoint) : 0,
        stockLevel: newMaterial.stockLevel ? parseFloat(newMaterial.stockLevel) : 0,
        stock: newMaterial.stockLevel ? parseFloat(newMaterial.stockLevel) : 0, // stock alanı da ekle
        costPrice: newMaterial.costPrice ? parseFloat(newMaterial.costPrice) : 0,
        sellPrice: newMaterial.sellPrice ? parseFloat(newMaterial.sellPrice) : 0,
        price: newMaterial.sellPrice ? parseFloat(newMaterial.sellPrice) : 0 // backward compatibility
      }
      
      const addedMaterial = await addMaterial(materialData)
      
      // Add to selected materials
      setSelectedMaterials(prev => [...prev, addedMaterial])
      
      // Reset new material form
      setNewMaterial({
        name: '',
        type: '',
        category: '',
        unit: '',
        description: '',
        code: '',
        reorderPoint: '',
        stockLevel: '',
        costPrice: '',
        sellPrice: '',
        price: '',
        supplier: '',
        status: 'Aktif'
      })
      
      // Reset category states
      setShowNewCategory(false)
      setNewCategory('')
      
      // Switch back to existing mode to show the added material
      setMaterialMode('existing')
      
      showToast('Malzeme başarıyla eklendi!', 'success')
    } catch (error) {
      console.error('Malzeme eklenirken hata:', error)
      showToast('Malzeme eklenirken bir hata oluştu!', 'error')
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    const finalCode = formData.code.trim() || nextCode; // Boşsa otomatik kod kullan
    
    if (!finalCode || !formData.name || !formData.contactPerson || !formData.phone1 || !formData.email1) {
      showToast('Lütfen tüm zorunlu alanları doldurun! (Firma Adı, Yetkili Kişi, Telefon 1, E-posta 1)', 'warning')
      return;
    }

    try {
      const supplierData = {
        ...formData,
        code: finalCode, // Otomatik üretilen veya kullanıcının girdiği kodu kullan
        creditLimit: formData.creditLimit ? parseFloat(formData.creditLimit) : 0,
        suppliedMaterials: selectedMaterials.map(material => ({
          id: material.id,
          name: material.name,
          category: material.category,
          unit: material.unit,
          addedAt: new Date(),
          status: 'aktif' // Default status: aktif, pasif, değerlendirmede
        }))
      };

      console.log('🔢 Kullanılan tedarikçi kodu:', finalCode);
      console.log('🔗 Seçilen malzemeler:', selectedMaterials);
      onSave(supplierData);
    } catch (error) {
      console.error('Tedarikçi kaydedilirken hata:', error);
      showToast('Tedarikçi kaydedilirken bir hata oluştu!', 'error')
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
    <>
      <div className="modal-overlay" onClick={handleClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header-flex">
          <h2 className="modal-title">
            Yeni Tedarikçi Ekle
          </h2>
          <div className="flex-center-gap-8">
            <button 
              type="submit" 
              form="add-supplier-form" 
              className="btn-save-primary"
              title="Kaydet"
            >
              💾 Kaydet
            </button>
            <button 
              onClick={handleClose}
              className="btn-close-modal"
            >
              ×
            </button>
          </div>
        </div>
        
        <div className="modal-body-bg">
          <form id="add-supplier-form" onSubmit={handleSubmit}>
            {/* Temel Firma Bilgileri */}
            <div className="section-card-mb">
              <h3 className="section-header">
                Temel Firma Bilgileri
              </h3>
              
              <div className="detail-item supplier-detail-row">
                <span className="detail-label supplier-detail-label-120">
                  Tedarikçi Kodu:
                </span>
                <div className="flex-1">
                  <input
                    type="text"
                    name="code"
                    value={formData.code || ''}
                    onChange={handleInputChange}
                    placeholder={nextCode}
                    className="input-full"
                  />
                  <small className="text-hint-xs-block">
                    Boş bırakılırsa otomatik olarak {nextCode} atanacak
                  </small>
                </div>
              </div>
              
              <div className="detail-item supplier-detail-row">
                <span className="detail-label supplier-detail-label-120">
                  Firma Adı *:
                </span>
                <input
                  type="text"
                  name="name"
                  value={formData.name || ''}
                  onChange={handleInputChange}
                  placeholder="Firma adı"
                  required
                  className="modal-input"
                />
              </div>
              
              <div className="detail-item" className="supplier-detail-row">
                <span className="detail-label" className="supplier-detail-label-120">
                  Tedarikçi Tipi *:
                </span>
                <select
                  name="supplierType"
                  value={formData.supplierType || ''}
                  onChange={handleInputChange}
                  required
                  className="modal-input"
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
              
              <div className="detail-item" className="supplier-detail-row">
                <span className="detail-label" className="supplier-detail-label-120">
                  İş Kayıt No:
                </span>
                <input
                  type="text"
                  name="businessRegistrationNumber"
                  value={formData.businessRegistrationNumber || ''}
                  onChange={handleInputChange}
                  placeholder="İş kayıt numarası"
                  className="modal-input"
                />
              </div>
            </div>

            {/* İletişim Bilgileri */}
            <div className="section-card-mb">
              <h3 className="section-header">
                İletişim Bilgileri
              </h3>
              
              <div className="detail-item" className="supplier-detail-row">
                <span className="detail-label" className="supplier-detail-label-120">
                  Yetkili Kişi *:
                </span>
                <input
                  type="text"
                  name="contactPerson"
                  value={formData.contactPerson || ''}
                  onChange={handleInputChange}
                  placeholder="Yetkili kişi"
                  required
                  className="modal-input"
                />
              </div>
              
              <div className="detail-item" className="supplier-detail-row">
                <span className="detail-label" className="supplier-detail-label-120">
                  Acil Durum Kişi:
                </span>
                <input
                  type="text"
                  name="emergencyContact"
                  value={formData.emergencyContact || ''}
                  onChange={handleInputChange}
                  placeholder="Acil durum kişisi"
                  className="modal-input"
                />
              </div>
              
              <div className="detail-item" className="supplier-detail-row">
                <span className="detail-label" className="supplier-detail-label-120">
                  Telefon 1 *:
                </span>
                <input
                  type="tel"
                  name="phone1"
                  value={formData.phone1 || ''}
                  onChange={handleInputChange}
                  placeholder="Telefon numarası"
                  required
                  className="modal-input"
                />
              </div>
              
              <div className="detail-item" className="supplier-detail-row">
                <span className="detail-label" className="supplier-detail-label-120">
                  Telefon 2:
                </span>
                <input
                  type="tel"
                  name="phone2"
                  value={formData.phone2 || ''}
                  onChange={handleInputChange}
                  placeholder="İkinci telefon"
                  className="modal-input"
                />
              </div>
              
              <div className="detail-item" className="supplier-detail-row">
                <span className="detail-label" className="supplier-detail-label-120">
                  Acil Telefon:
                </span>
                <input
                  type="tel"
                  name="emergencyPhone"
                  value={formData.emergencyPhone || ''}
                  onChange={handleInputChange}
                  placeholder="Acil telefon"
                  className="modal-input"
                />
              </div>
              
              <div className="detail-item" className="supplier-detail-row">
                <span className="detail-label" className="supplier-detail-label-120">
                  Faks:
                </span>
                <input
                  type="tel"
                  name="fax"
                  value={formData.fax || ''}
                  onChange={handleInputChange}
                  placeholder="Faks numarası"
                  className="modal-input"
                />
              </div>
              
              <div className="detail-item" className="supplier-detail-row">
                <span className="detail-label" className="supplier-detail-label-120">
                  E-posta 1 *:
                </span>
                <input
                  type="email"
                  name="email1"
                  value={formData.email1 || ''}
                  onChange={handleInputChange}
                  placeholder="E-posta adresi"
                  required
                  className="modal-input"
                />
              </div>
              
              <div className="detail-item" className="supplier-detail-row">
                <span className="detail-label" className="supplier-detail-label-120">
                  E-posta 2:
                </span>
                <input
                  type="email"
                  name="email2"
                  value={formData.email2 || ''}
                  onChange={handleInputChange}
                  placeholder="İkinci e-posta"
                  className="modal-input"
                />
              </div>
              
              <div className="detail-item" className="supplier-detail-row">
                <span className="detail-label" className="supplier-detail-label-120">
                  Web Sitesi:
                </span>
                <input
                  type="url"
                  name="website"
                  value={formData.website || ''}
                  onChange={handleInputChange}
                  placeholder="Web sitesi"
                  className="modal-input"
                />
              </div>
              
              <div className="detail-item" className="supplier-detail-row">
                <span className="detail-label" className="supplier-detail-label-120">
                  Tercih İletişim:
                </span>
                <select
                  name="preferredCommunication"
                  value={formData.preferredCommunication || ''}
                  onChange={handleInputChange}
                  className="modal-input"
                >
                  <option value="email">E-posta</option>
                  <option value="phone">Telefon</option>
                  <option value="fax">Faks</option>
                  <option value="whatsapp">WhatsApp</option>
                </select>
              </div>
            </div>

            {/* Adres ve Mali Bilgiler - Üst Bölüm */}
            <div className="supplier-grid-2-mb">
              {/* Adres Bilgileri */}
              <div className="section-card-mb">
                <h3 className="section-header">
                  Adres Bilgileri
                </h3>
                
                <div className="detail-item" className="supplier-detail-row-start">
                  <span className="detail-label" className="supplier-detail-label-80-mt">
                    Adres:
                  </span>
                  <textarea
                    name="address"
                    value={formData.address || ''}
                    onChange={handleInputChange}
                    placeholder="Adres"
                    rows="2"
                    className="modal-input-textarea"
                  />
                </div>
                
                <div className="detail-item" className="supplier-detail-row">
                  <span className="detail-label" className="supplier-detail-label-80">
                    Şehir:
                  </span>
                  <input
                    type="text"
                    name="city"
                    value={formData.city || ''}
                    onChange={handleInputChange}
                    placeholder="Şehir"
                    className="modal-input"
                  />
                </div>
                
                <div className="detail-item" className="supplier-detail-row">
                  <span className="detail-label" className="supplier-detail-label-80">
                    İlçe:
                  </span>
                  <input
                    type="text"
                    name="state"
                    value={formData.state || ''}
                    onChange={handleInputChange}
                    placeholder="İlçe/Bölge"
                    className="modal-input"
                  />
                </div>
                
                <div className="detail-item" className="supplier-detail-row">
                  <span className="detail-label" className="supplier-detail-label-80">
                    Posta Kodu:
                  </span>
                  <input
                    type="text"
                    name="postalCode"
                    value={formData.postalCode || ''}
                    onChange={handleInputChange}
                    placeholder="Posta kodu"
                    className="modal-input"
                  />
                </div>
                
                <div className="detail-item" className="supplier-detail-row">
                  <span className="detail-label" className="supplier-detail-label-80">
                    Ülke:
                  </span>
                  <select
                    name="country"
                    value={formData.country || ''}
                    onChange={handleInputChange}
                    className="modal-input"
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
              <div className="section-card-mb">
                <h3 className="section-header">
                  Mali Bilgiler
                </h3>
                
                <div className="detail-item" className="supplier-detail-row">
                  <span className="detail-label" className="supplier-detail-label-80">
                    Vergi No:
                  </span>
                  <input
                    type="text"
                    name="taxNumber"
                    value={formData.taxNumber || ''}
                    onChange={handleInputChange}
                    placeholder="Vergi numarası"
                    className="modal-input"
                  />
                </div>
                
                <div className="detail-item" className="supplier-detail-row">
                  <span className="detail-label" className="supplier-detail-label-80">
                    Vergi Dairesi:
                  </span>
                  <input
                    type="text"
                    name="taxOffice"
                    value={formData.taxOffice || ''}
                    onChange={handleInputChange}
                    placeholder="Vergi dairesi"
                    className="modal-input"
                  />
                </div>
                
                <div className="detail-item" className="supplier-detail-row">
                  <span className="detail-label" className="supplier-detail-label-80">
                    Para Birimi:
                  </span>
                  <select
                    name="currency"
                    value={formData.currency || ''}
                    onChange={handleInputChange}
                    className="modal-input"
                  >
                    <option value="TRY">TRY</option>
                    <option value="USD">USD</option>
                    <option value="EUR">EUR</option>
                    <option value="GBP">GBP</option>
                  </select>
                </div>
                
                <div className="detail-item" className="supplier-detail-row">
                  <span className="detail-label" className="supplier-detail-label-80">
                    Kredi Limiti:
                  </span>
                  <input
                    type="text" inputMode="decimal" pattern="[0-9]*\.?[0-9]*"
                    name="creditLimit"
                    value={formData.creditLimit || ''}
                    onChange={handleInputChange}
                    placeholder="Kredi limiti"
                    min="0"
                    step="0.01"
                    className="modal-input"
                  />
                </div>
                
                <div className="detail-item" className="supplier-detail-row">
                  <span className="detail-label" className="supplier-detail-label-80">
                    Kredi Notu:
                  </span>
                  <select
                    name="creditRating"
                    value={formData.creditRating || ''}
                    onChange={handleInputChange}
                    className="modal-input"
                  >
                    <option value="">Seçin</option>
                    <option value="A">A - Mükemmel</option>
                    <option value="B">B - İyi</option>
                    <option value="C">C - Orta</option>
                    <option value="D">D - Zayıf</option>
                    <option value="F">F - Riskli</option>
                  </select>
                </div>
                
                <div className="detail-item" className="supplier-detail-row">
                  <span className="detail-label" className="supplier-detail-label-80">
                    Yıllık Ciro:
                  </span>
                  <input
                    type="text" inputMode="decimal" pattern="[0-9]*\.?[0-9]*"
                    name="annualRevenue"
                    value={formData.annualRevenue || ''}
                    onChange={handleInputChange}
                    placeholder="Yıllık ciro"
                    min="0"
                    className="modal-input"
                  />
                </div>
              </div>
            </div>

            {/* Ödeme ve Operasyonel Bilgiler - Orta Bölüm */}
            <div className="supplier-grid-2-mb">
              {/* Ödeme Bilgileri */}
              <div className="section-card-mb">
                <h3 className="section-header">
                  Ödeme Bilgileri
                </h3>
                
                <div className="detail-item" className="supplier-detail-row">
                  <span className="detail-label" className="supplier-detail-label-80">
                    Ödeme Koşul:
                  </span>
                  <select
                    name="paymentTerms"
                    value={formData.paymentTerms || ''}
                    onChange={handleInputChange}
                    className="modal-input"
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
                
                <div className="detail-item" className="supplier-detail-row">
                  <span className="detail-label" className="supplier-detail-label-80">
                    Ödeme Yöntem:
                  </span>
                  <select
                    name="paymentMethod"
                    value={formData.paymentMethod || ''}
                    onChange={handleInputChange}
                    className="modal-input"
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
                
                <div className="detail-item" className="supplier-detail-row">
                  <span className="detail-label" className="supplier-detail-label-80">
                    Banka:
                  </span>
                  <input
                    type="text"
                    name="bankName"
                    value={formData.bankName || ''}
                    onChange={handleInputChange}
                    placeholder="Banka adı"
                    className="modal-input"
                  />
                </div>
                
                <div className="detail-item" className="supplier-detail-row">
                  <span className="detail-label" className="supplier-detail-label-80">
                    Hesap No:
                  </span>
                  <input
                    type="text"
                    name="bankAccount"
                    value={formData.bankAccount || ''}
                    onChange={handleInputChange}
                    placeholder="Hesap numarası"
                    className="modal-input"
                  />
                </div>
                
                <div className="detail-item" className="supplier-detail-row">
                  <span className="detail-label" className="supplier-detail-label-80">
                    IBAN:
                  </span>
                  <input
                    type="text"
                    name="iban"
                    value={formData.iban || ''}
                    onChange={handleInputChange}
                    placeholder="IBAN"
                    className="modal-input"
                  />
                </div>
              </div>

              {/* Operasyonel Bilgiler */}
              <div className="section-card-mb">
                <h3 className="section-header">
                  Operasyonel Bilgiler
                </h3>
                
                <div className="detail-item" className="supplier-detail-row">
                  <span className="detail-label" className="supplier-detail-label-80">
                    Teslimat:
                  </span>
                  <input
                    type="text"
                    name="deliveryCapability"
                    value={formData.deliveryCapability || ''}
                    onChange={handleInputChange}
                    placeholder="Teslimat kapasitesi"
                    className="modal-input"
                  />
                </div>
                
                <div className="detail-item" className="supplier-detail-row">
                  <span className="detail-label" className="supplier-detail-label-80">
                    Tedarik Süresi:
                  </span>
                  <input
                    type="text" inputMode="decimal" pattern="[0-9]*\.?[0-9]*"
                    name="leadTime"
                    value={formData.leadTime || ''}
                    onChange={handleInputChange}
                    placeholder="Tedarik süresi (gün)"
                    min="0"
                    className="modal-input"
                  />
                </div>
                
                <div className="detail-item" className="supplier-detail-row">
                  <span className="detail-label" className="supplier-detail-label-80">
                    Min. Sipariş:
                  </span>
                  <input
                    type="text"
                    name="minimumOrderQuantity"
                    value={formData.minimumOrderQuantity || ''}
                    onChange={handleInputChange}
                    placeholder="Minimum sipariş miktarı"
                    className="modal-input"
                  />
                </div>
                
                <div className="detail-item" className="supplier-detail-row">
                  <span className="detail-label" className="supplier-detail-label-80">
                    Sertifika:
                  </span>
                  <select
                    name="qualityCertification"
                    value={formData.qualityCertification || ''}
                    onChange={handleInputChange}
                    className="modal-input"
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
            <div className="section-card-mb">
              <h3 className="section-header">
                Şirket Bilgileri
              </h3>
              
              <div className="grid-4">
                <div className="detail-item" className="supplier-detail-row">
                  <span className="detail-label" className="supplier-detail-label-100">
                    Kuruluş Yılı:
                  </span>
                  <input
                    type="text" inputMode="decimal" pattern="[0-9]*\.?[0-9]*"
                    name="yearEstablished"
                    value={formData.yearEstablished || ''}
                    onChange={handleInputChange}
                    placeholder="Kuruluş yılı"
                    min="1900"
                    max="2025"
                    className="modal-input"
                  />
                </div>
                
                <div className="detail-item" className="supplier-detail-row">
                  <span className="detail-label" className="supplier-detail-label-100">
                    Çalışan Sayısı:
                  </span>
                  <select
                    name="employeeCount"
                    value={formData.employeeCount || ''}
                    onChange={handleInputChange}
                    className="modal-input"
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
                
                <div className="detail-item" className="supplier-detail-row">
                  <span className="detail-label" className="supplier-detail-label-100">
                    Risk Seviyesi:
                  </span>
                  <select
                    name="riskLevel"
                    value={formData.riskLevel || ''}
                    onChange={handleInputChange}
                    className="modal-input"
                  >
                    <option value="low">Düşük Risk</option>
                    <option value="medium">Orta Risk</option>
                    <option value="high">Yüksek Risk</option>
                  </select>
                </div>
                
                <div className="detail-item" className="supplier-detail-row">
                  <span className="detail-label" className="supplier-detail-label-100">
                    Uyumluluk:
                  </span>
                  <select
                    name="complianceStatus"
                    value={formData.complianceStatus || ''}
                    onChange={handleInputChange}
                    className="modal-input"
                  >
                    <option value="pending">Beklemede</option>
                    <option value="approved">Onaylandı</option>
                    <option value="rejected">Reddedildi</option>
                    <option value="under_review">İnceleniyor</option>
                  </select>
                </div>
              </div>
              
              <div className="mt-8">
                <div className="detail-item" className="supplier-detail-row">
                  <span className="detail-label" className="supplier-detail-label-100">
                    Durum:
                  </span>
                  <select
                    name="status"
                    value={formData.status || ''}
                    onChange={handleInputChange}
                    className="modal-input-max200"
                  >
                    <option value="Aktif">Aktif</option>
                    <option value="Pasif">Pasif</option>
                    <option value="Onay Bekliyor">Onay Bekliyor</option>
                    <option value="Askıda">Askıda</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Tedarik Edilen Malzemeler */}
            <div className="section-card-mb">
              <h3 className="section-header">
                Tedarik Edilen Malzemeler
              </h3>

              {/* Material Mode Toggle */}
              <div className="mb-12">
                <div className="flex-gap-8-mb-8">
                  <button
                    type="button"
                    onClick={handleOpenMaterialPopup}
                    className="btn-outline-sm"
                  >
                    Mevcut Malzemelerden Ekle
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      setMaterialMode('new')
                      // Load materials to get categories if not loaded
                      if ((!materials || materials.length === 0) && !materialsLoading) {
                        await loadMaterials()
                        await extractMaterialCategories()
                      } else {
                        await extractMaterialCategories()
                      }
                    }}
                    style={{
                      padding: '6px 12px',
                      border: '1px solid #d1d5db',
                      borderRadius: '4px',
                      fontSize: '12px',
                      background: materialMode === 'new' ? '#3b82f6' : 'white',
                      color: materialMode === 'new' ? 'white' : '#374151',
                      cursor: 'pointer'
                    }}
                  >
                    Yeni Malzeme Ekle
                  </button>
                </div>
              </div>

              {/* Existing Materials Mode */}
              {/* Removed - will be handled by popup */}

              {/* New Material Mode */}
              {materialMode === 'new' && (
                <div>
                  <div className="detail-item" className="supplier-detail-row">
                    <span className="detail-label" className="supplier-detail-label-100">
                      Malzeme Adı:
                    </span>
                    <input
                      type="text"
                      name="name"
                      value={newMaterial.name}
                      onChange={handleNewMaterialChange}
                      placeholder="Malzeme adını girin"
                      className="modal-input"
                    />
                  </div>

                  <div className="detail-item" className="supplier-detail-row">
                    <span className="detail-label" className="supplier-detail-label-100">
                      Tip:
                    </span>
                    <select
                      name="type"
                      value={newMaterial.type}
                      onChange={handleNewMaterialChange}
                      className="modal-input"
                    >
                      <option value="">Tip seçin</option>
                      {materialTypes.map(type => (
                        <option key={type.id} value={type.id}>{type.label}</option>
                      ))}
                    </select>
                  </div>

                  <div className="detail-item" className="supplier-detail-row">
                    <span className="detail-label" className="supplier-detail-label-100">
                      Kategori:
                    </span>
                    <select
                      name="category"
                      value={showNewCategory ? 'new-category' : newMaterial.category}
                      onChange={handleCategoryChange}
                      className="modal-input"
                    >
                      <option value="">Kategori seçin</option>
                      {materialCategories.map(category => (
                        <option key={category.id} value={category.id}>
                          {category.name || category.label || category.id}
                        </option>
                      ))}
                      <option value="new-category">+ Yeni Kategori Ekle</option>
                    </select>
                  </div>

                  {/* Custom Category Input - Show when "new category" is selected */}
                  {showNewCategory && (
                    <div className="detail-item" className="supplier-detail-row">
                      <span className="detail-label" className="supplier-detail-label-100">
                        Yeni Kategori:
                      </span>
                      <input
                        type="text"
                        value={newCategory}
                        onChange={(e) => setNewCategory(e.target.value)}
                        placeholder="Yeni kategori adını girin"
                        className="modal-input"
                      />
                    </div>
                  )}

                  <div className="detail-item" className="supplier-detail-row">
                    <span className="detail-label" className="supplier-detail-label-100">
                      Birim:
                    </span>
                    <select
                      name="unit"
                      value={newMaterial.unit}
                      onChange={handleNewMaterialChange}
                      className="modal-input"
                    >
                      <option value="">Birim seçin</option>
                      <option value="kg">Kilogram (kg)</option>
                      <option value="g">Gram (g)</option>
                      <option value="lt">Litre (lt)</option>
                      <option value="ml">Mililitre (ml)</option>
                      <option value="m">Metre (m)</option>
                      <option value="cm">Santimetre (cm)</option>
                      <option value="m²">Metrekare (m²)</option>
                      <option value="adet">Adet</option>
                      <option value="paket">Paket</option>
                      <option value="kutu">Kutu</option>
                    </select>
                  </div>

                  <div className="detail-item" className="supplier-detail-row">
                    <span className="detail-label" className="supplier-detail-label-100">
                      Kod:
                    </span>
                    <input
                      type="text"
                      name="code"
                      value={newMaterial.code || nextMaterialCode}
                      onChange={handleNewMaterialChange}
                      placeholder={`Otomatik kod: ${nextMaterialCode}`}
                      className="modal-input"
                    />
                  </div>

                  <div className="detail-item" className="supplier-detail-row-start">
                    <span className="detail-label" className="supplier-detail-label-100-mt">
                      Açıklama:
                    </span>
                    <textarea
                      name="description"
                      value={newMaterial.description}
                      onChange={handleNewMaterialChange}
                      placeholder="Malzeme açıklaması (opsiyonel)"
                      rows="2"
                      className="modal-input-textarea"
                    />
                  </div>

                  <div className="detail-item" className="supplier-detail-row">
                    <span className="detail-label" className="supplier-detail-label-100">
                      Minimum Stok:
                    </span>
                    <input
                      type="text" inputMode="decimal" pattern="[0-9]*\.?[0-9]*"
                      name="reorderPoint"
                      value={newMaterial.reorderPoint}
                      onChange={handleNewMaterialChange}
                      placeholder="Minimum stok seviyesi"
                      className="modal-input"
                    />
                  </div>

                  <div className="detail-item" className="supplier-detail-row">
                    <span className="detail-label" className="supplier-detail-label-100">
                      Mevcut Stok:
                    </span>
                    <input
                      type="text" inputMode="decimal" pattern="[0-9]*\.?[0-9]*"
                      name="stockLevel"
                      value={newMaterial.stockLevel}
                      onChange={handleNewMaterialChange}
                      placeholder="Şu anki stok miktarı"
                      className="modal-input"
                    />
                  </div>

                  <div className="detail-item" className="supplier-detail-row">
                    <span className="detail-label" className="supplier-detail-label-100">
                      Maliyet Fiyatı:
                    </span>
                    <input
                      type="text" inputMode="decimal" pattern="[0-9]*\.?[0-9]*"
                      step="0.01"
                      name="costPrice"
                      value={newMaterial.costPrice}
                      onChange={handleNewMaterialChange}
                      placeholder="Maliyet fiyatı (TRY)"
                      className="modal-input"
                    />
                  </div>

                  <div className="detail-item" className="supplier-detail-row">
                    <span className="detail-label" className="supplier-detail-label-100">
                      Satış Fiyatı:
                    </span>
                    <input
                      type="text" inputMode="decimal" pattern="[0-9]*\.?[0-9]*"
                      step="0.01"
                      name="sellPrice"
                      value={newMaterial.sellPrice}
                      onChange={handleNewMaterialChange}
                      placeholder="Satış fiyatı (TRY)"
                      className="modal-input"
                    />
                  </div>

                  <div className="detail-item" className="supplier-detail-row">
                    <span className="detail-label" className="supplier-detail-label-100">
                      Durum:
                    </span>
                    <select
                      name="status"
                      value={newMaterial.status}
                      onChange={handleNewMaterialChange}
                      className="modal-input"
                    >
                      <option value="Aktif">Aktif</option>
                      <option value="Pasif">Pasif</option>
                    </select>
                  </div>

                  <div className="text-right-mt-8">
                    <button
                      type="button"
                      onClick={handleAddNewMaterial}
                      className="btn-success-sm"
                    >
                      Malzeme Ekle
                    </button>
                  </div>
                </div>
              )}

              {/* Selected Materials */}
              {selectedMaterials.length > 0 && (
                <div className="mt-12">
                  <h3 className="section-header">
                    Seçilen Malzemeler ({selectedMaterials.length})
                  </h3>
                  <div className="selected-materials-list">
                    {selectedMaterials.map(material => (
                      <div
                        key={material.id}
                        className="material-item-row"
                      >
                        <div>
                          <div className="font-semibold-dark">{material.name}</div>
                          <div className="text-muted-sm">
                            {getCategoryName(material.category)} • {material.unit}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleMaterialRemove(material.id)}
                          className="btn-remove-sm"
                        >
                          Kaldır
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Ek Bilgiler */}
            <div className="section-card-mb">
              <h3 className="section-header">
                Ek Bilgiler
              </h3>
              
              <div className="detail-item supplier-detail-row-start">
                <textarea
                  name="notes"
                  value={formData.notes || ''}
                  onChange={handleInputChange}
                  placeholder="Notlar ve açıklamalar"
                  rows="3"
                  className="modal-input-textarea"
                />
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>

    {/* Material Selection Popup */}
    {showMaterialPopup && (
      <div className="popup-overlay">
        <div className="popup-content">
          {/* Popup Header */}
          <div className="popup-header">
            <h3 className="section-header">
              Mevcut Malzemelerden Seç
            </h3>
            <button
              type="button"
              onClick={() => setShowMaterialPopup(false)}
              className="popup-close-btn"
            >
              ×
            </button>
          </div>

          {/* Search Input */}
          <div className="mb-12">
            <input
              type="text"
              value={materialSearchTerm}
              onChange={(e) => setMaterialSearchTerm(e.target.value)}
              placeholder="Malzeme adı, kodu veya kategorisi ile ara..."
              className="search-input-lg"
            />
          </div>

          {/* Materials List */}
          {materialsLoading ? (
            <div className="empty-state-content">
              Malzemeler yükleniyor...
            </div>
          ) : (
            <div className="scrollable-list">
              {filteredMaterials.length === 0 ? (
                <div className="empty-state-content">
                  {materialSearchTerm ? 'Arama kriterine uygun malzeme bulunamadı' : 'Henüz malzeme bulunmuyor'}
                </div>
              ) : (
                filteredMaterials.map(material => (
                  <div
                    key={material.id}
                    onClick={() => handleMaterialSelect(material)}
                    style={{
                      padding: '12px 16px',
                      borderBottom: '1px solid #f3f4f6',
                      cursor: 'pointer',
                      background: selectedMaterials.find(m => m.id === material.id) ? '#f0f9ff' : 'white',
                      fontSize: '14px',
                      transition: 'background-color 0.2s'
                    }}
                    onMouseEnter={(e) => {
                      if (!selectedMaterials.find(m => m.id === material.id)) {
                        e.target.style.backgroundColor = '#f9fafb'
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!selectedMaterials.find(m => m.id === material.id)) {
                        e.target.style.backgroundColor = 'white'
                      }
                    }}
                  >
                    <div className="label-bold-mb">
                      {material.name}
                      {selectedMaterials.find(m => m.id === material.id) && (
                        <span className="text-success-ml">✓ Seçildi</span>
                      )}
                    </div>
                    <div className="text-muted-xs">
                      {material.code && `Kod: ${material.code} • `}
                      {material.category && `Kategori: ${getCategoryName(material.category)} • `}
                      {material.unit && `Birim: ${material.unit}`}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* Selected Materials Summary */}
          {selectedMaterials.length > 0 && (
            <div className="selected-summary-box">
              <div className="text-blue-title">
                Seçilen Malzemeler ({selectedMaterials.length})
              </div>
              <div className="text-link-blue">
                {selectedMaterials.map(m => m.name).join(', ')}
              </div>
            </div>
          )}

          {/* Popup Footer */}
          <div className="popup-footer">
            <button
              type="button"
              onClick={() => setShowMaterialPopup(false)}
              className="btn-cancel-sm"
            >
              İptal
            </button>
            <button
              type="button"
              onClick={() => setShowMaterialPopup(false)}
              className="btn-primary-sm"
            >
              Seçimi Tamamla ({selectedMaterials.length})
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  )
}