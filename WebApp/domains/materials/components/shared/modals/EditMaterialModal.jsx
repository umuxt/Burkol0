import React, { useState, useEffect, useMemo } from 'react'
import useMaterialProcurementHistory from '../../../hooks/useMaterialProcurementHistory.js'
import useMaterialProductionHistory from '../../../hooks/useMaterialProductionHistory.js'
import useMaterialLots from '../../../hooks/useMaterialLots.js'
import { useSuppliers } from '../../../hooks/useSuppliers.js'
import { 
  getEffectiveMaterialStatus, 
  createStatusBadgeProps,
  SUPPLIER_STATUSES,
  MATERIAL_STATUSES 
} from '../../../utils/material-status-utils.js'
import { showToast } from '../../../../../shared/components/MESToast.js'

export default function EditMaterialModal({ 
  isOpen, 
  onClose, 
  onSave, 
  onDelete, 
  categories, 
  types, 
  material, 
  loading = false, 
  onRefreshMaterial, // Yeni prop - material refresh için
  isRemoved = false 
}) {
  // Lazy loading suppliers when modal opens
  const { 
    suppliers = [], 
    loading: suppliersLoading = false, 
    refetch: refetchSuppliers 
  } = useSuppliers(isOpen)
  // Loading timeout için timer
  const [loadingTimeout, setLoadingTimeout] = useState(false)
  
  // Suppliers artık lazy loading ile yönetiliyor
  
  // Loading state 15 saniyeden fazla sürerse timeout yap
  useEffect(() => {
    if (loading && isOpen) {
      const timer = setTimeout(() => {
        setLoadingTimeout(true)
      }, 15000)
      
      return () => clearTimeout(timer)
    } else {
      setLoadingTimeout(false)
    }
  }, [loading, isOpen])

  // Suppliers artık modal açıldığında lazy loading ile useSuppliers hook'u tarafından yükleniyor

  // Suppliers prop'u değiştiğinde debug
  useEffect(() => {
    console.log('📦 EditMaterialModal: Suppliers prop updated:', {
      suppliersCount: suppliers?.length || 0,
      suppliersTimestamp: Date.now(),
      supplierIds: suppliers?.map(s => s.id) || []
    })
  }, [suppliers])

  // Güvenli değer render fonksiyonu
  const safeRender = (value, fallback = '') => {
    if (value === null || value === undefined || value === '' || Number.isNaN(value)) {
      return fallback;
    }
    // Eğer number ise ve NaN ise fallback dön
    if (typeof value === 'number' && Number.isNaN(value)) {
      console.warn('🚨 NaN detected in safeRender:', value);
      return fallback;
    }
    return value.toString();
  };

  const [formData, setFormData] = useState({
    code: '',
    name: '',
    type: '',
    category: '',
    unit: '',
    stock: '',
    reorderPoint: '',
    costPrice: '',
    sellPrice: '',
    supplier: '',
    description: '',
    status: 'Aktif'
  });
  
  const [originalData, setOriginalData] = useState(null); // Orijinal veriyi sakla
  const [showNewCategory, setShowNewCategory] = useState(false);
  const [newCategory, setNewCategory] = useState('');
  const [isEditing, setIsEditing] = useState(false); // Düzenleme modu kontrolü

  // Get suppliers that supply this material - sadece prop suppliers kullan
  const materialSuppliers = useMemo(() => {
    const suppliersToUse = suppliers || []
    
    console.log('🔄 materialSuppliers recalculating:', {
      material: material?.id,
      suppliersCount: suppliersToUse?.length || 0
    })
    
    if (!material || !suppliersToUse || suppliersToUse.length === 0) {
      console.log('⚠️ materialSuppliers: No material or suppliers data')
      return [];
    }
    
    const filtered = suppliersToUse
      .filter(supplier => {
        if (!supplier.suppliedMaterials || supplier.suppliedMaterials.length === 0) {
          return false;
        }
        
        return supplier.suppliedMaterials.some(suppliedMaterial => 
          suppliedMaterial.id === material.id || 
          suppliedMaterial.code === material.code ||
          suppliedMaterial.name === material.name
        );
      })
      .map(supplier => {
        // Find the specific supplied material for this material
        const suppliedMaterial = supplier.suppliedMaterials.find(sm => 
          sm.id === material.id || 
          sm.code === material.code ||
          sm.name === material.name
        );
        
        // Return supplier with the specific supplied material data
        return {
          ...supplier,
          currentSuppliedMaterial: suppliedMaterial
        };
      });
    
    console.log('✅ materialSuppliers filtered result:', filtered)
    return filtered;
  }, [material, suppliers]);

  // Material değiştiğinde form'u doldur
  useEffect(() => {
    if (material) {
      console.log('🔍 EditMaterialModal - Material data:', material);
      console.log('🔍 EditMaterialModal - Categories:', categories);
      console.log('🔍 EditMaterialModal - Material category:', material.category);
      
      // Her property'yi ayrı ayrı kontrol et
      Object.keys(material).forEach(key => {
        const value = material[key];
        if (Number.isNaN(value)) {
          console.warn(`🚨 NaN detected in material.${key}:`, value);
        }
      });
      
      // NaN değerlerini kontrol et ve temizle
      const safeNumber = (value) => {
        console.log('🔍 Processing value:', value, 'Type:', typeof value, 'isNaN:', Number.isNaN(value));
        
        if (value === null || value === undefined || value === '' || Number.isNaN(value)) {
          return '0';
        }
        
        // String'i number'a çevirmeye çalış
        const numValue = Number(value);
        if (Number.isNaN(numValue)) {
          console.warn('🚨 Failed to convert to number:', value);
          return '0';
        }
        
        return numValue.toString();
      };
      
      const materialFormData = {
        code: material.code || '',
        name: material.name || '',
        type: material.type || '',
        category: material.category || '',
        unit: material.unit || '',
        stock: safeNumber(material.stock),
        reorderPoint: safeNumber(material.reorderPoint),
        costPrice: safeNumber(material.costPrice),
        sellPrice: safeNumber(material.sellPrice),
        supplier: material.supplier || '',
        description: material.description || '',
        status: material.status || 'Aktif'
      };
      
      console.log('📝 Processed form data:', materialFormData);
      
      // FormData'daki her değeri kontrol et
      Object.keys(materialFormData).forEach(key => {
        const value = materialFormData[key];
        if (Number.isNaN(value) || (typeof value === 'number' && Number.isNaN(value))) {
          console.error(`🚨 NaN in formData.${key}:`, value);
        }
      });
      
      setFormData(materialFormData);
      setOriginalData(materialFormData); // Orijinal veriyi sakla
      setShowNewCategory(false);
      setNewCategory('');
      setIsEditing(false); // Modal açıldığında kilitli mod
    }
  }, [material, categories]);

  // Real-time stok güncellemesi için material.stock'ı dinle
  useEffect(() => {
    if (material && material.stock !== undefined && formData.stock !== undefined) {
      const currentStock = Number(formData.stock);
      const newStock = Number(material.stock);
      
      if (!isNaN(newStock) && currentStock !== newStock) {
        console.log('🔧 EditMaterialModal: Stok güncellemesi tespit edildi:', {
          oldStock: currentStock,
          newStock: newStock,
          materialCode: material.code,
          materialName: material.name
        });
        
        setFormData(prev => ({
          ...prev,
          stock: newStock.toString()
        }));
        
        // Orijinal data'yı da güncelle ki değişiklik olarak algılanmasın
        setOriginalData(prev => ({
          ...prev,
          stock: newStock.toString()
        }));
      }
    }
  }, [material?.stock, material?.code, material?.name]);

  // Procurement history: load on modal open
  // Lazy-load via backend orders API; show independent from other content
  const { items: procurementItems, loading: procurementLoading, error: procurementError, loadHistory, isLoadedForMaterial } = useMaterialProcurementHistory(material)

  // Production history: load on demand for all materials
  const { items: productionItems, loading: productionLoading, error: productionError, loadHistory: loadProductionHistory, isLoadedForMaterial: isProductionLoaded } = useMaterialProductionHistory(material)

  // Debug: productionItems değişikliklerini logla
  useEffect(() => {
    console.log('🔍 EditMaterialModal: productionItems updated:', {
      count: productionItems?.length || 0,
      loading: productionLoading,
      error: productionError,
      items: productionItems
    })
  }, [productionItems, productionLoading, productionError])

  // Lot inventory: load on demand (lazy-loading pattern)
  const { lots, loading: lotsLoading, error: lotsError, loadLots, hasLoaded: lotsHasLoaded } = useMaterialLots(material)

  // useEffect kaldırıldı - tedarik geçmişi sadece butona tıklandığında yüklenecek

  // Global stock update event listener
  useEffect(() => {
    if (!isOpen || !material) return;

    const handleStockUpdate = (event) => {
      const { materialCode, newStock, quantity, operation, context } = event.detail;
      
      // Sadece bu material ile ilgili update'leri işle
      if (materialCode === material.code) {
        console.log('🔔 EditMaterialModal: Global stock update event received:', {
          materialCode,
          newStock,
          quantity,
          operation,
          context,
          currentFormStock: formData.stock
        });
        
        if (newStock !== undefined && !isNaN(newStock)) {
          setFormData(prev => ({
            ...prev,
            stock: newStock.toString()
          }));
          
          setOriginalData(prev => ({
            ...prev,
            stock: newStock.toString()
          }));
          
          // Material refresh callback'ini çağır - eğer varsa
          if (onRefreshMaterial && typeof onRefreshMaterial === 'function') {
            console.log('🔄 EditMaterialModal: Calling onRefreshMaterial callback');
            onRefreshMaterial();
          }
        }
      }
    };

    // Event listener'ı ekle
    window.addEventListener('materialStockUpdated', handleStockUpdate);
    
    // Cleanup
    return () => {
      window.removeEventListener('materialStockUpdated', handleStockUpdate);
    };
  }, [isOpen, material?.code, formData.stock, onRefreshMaterial]);

  const handleInputChange = (e) => {
    // Sadece editing mode'dayken input değişikliğine izin ver
    if (!isEditing) {
      return;
    }
    
    const { name, value } = e.target;
    
    // Sayısal alanlar için özel validasyon
    if (['stock', 'reorderPoint', 'costPrice', 'sellPrice'].includes(name)) {
      // 1. Virgülleri noktaya çevir
      let cleanValue = value.replace(/,/g, '.');
      
      // 2. Sadece sayı ve nokta girişine izin ver
      if (!/^[0-9.]*$/.test(cleanValue)) {
        return; // Sayı ve nokta dışındaki karakterleri reddet
      }
      
      // 3. Birden fazla nokta girişini engelle
      if ((cleanValue.match(/\./g) || []).length > 1) {
        return;
      }

      console.log('📝 Input change:', name, '=', cleanValue, typeof cleanValue);
      
      setFormData(prev => ({
        ...prev,
        [name]: cleanValue
      }));
    } else {
      // Diğer alanlar (text) için normal işlem
      console.log('📝 Input change:', name, '=', value, typeof value);
      
      setFormData(prev => ({
        ...prev,
        [name]: value
      }));
    }
  };

  const handleUnlock = () => {
    // Kaldırılan malzemeler düzenlenemez
    if (isRemoved) {
      console.log('❌ Kaldırılan malzemeler düzenlenemez')
      return;
    }
    setIsEditing(true);
  };

  const handleCategoryChange = (e) => {
    // Sadece editing mode'dayken kategori değişikliğine izin ver
    if (!isEditing) {
      return;
    }
    
    const value = e.target.value;
    if (value === 'new-category') {
      setShowNewCategory(true);
      setFormData(prev => ({ ...prev, category: '' }));
    } else {
      setShowNewCategory(false);
      setFormData(prev => ({ ...prev, category: value }));
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    
    // Sadece editing mode'dayken submit et
    if (!isEditing) {
      return;
    }
    
    const finalCategory = showNewCategory ? newCategory : formData.category;
    
    // Validate required fields - stock and reorderPoint can be 0
    const stockValue = formData.stock === '' ? null : formData.stock;
    const reorderValue = formData.reorderPoint === '' ? null : formData.reorderPoint;
    
    if (!formData.name || !formData.type || !finalCategory || stockValue === null || reorderValue === null) {
      showToast('Lütfen tüm zorunlu alanları doldurun!', 'warning')
      return;
    }

    // Değişiklik kontrolü - orijinal veri ile karşılaştır
    if (originalData) {
      const currentData = {
        ...formData,
        category: finalCategory
      };
      
      const hasChanges = Object.keys(currentData).some(key => {
        return currentData[key] !== originalData[key];
      });
      
      // Yeni kategori eklenmişse değişiklik sayılır
      const hasNewCategory = showNewCategory && newCategory.trim() !== '';
      
      if (!hasChanges && !hasNewCategory) {
        showToast('Herhangi bir değişiklik yapılmadı!', 'info')
        setIsEditing(false); // Editing mode'dan çık
        return;
      }
      
      console.log('📝 Değişiklik tespit edildi, kayıt işlemi başlatılıyor...');
    }

    const materialData = {
      ...formData,
      category: finalCategory,
      stock: parseFloat(formData.stock) || 0,
      reorderPoint: parseFloat(formData.reorderPoint) || 0,
      costPrice: parseFloat(formData.costPrice) || 0,
      sellPrice: parseFloat(formData.sellPrice) || 0
    };

    // ✅ Supplier name'i ID'ye çevir (backend primary_supplier_id integer bekliyor)
    if (formData.supplier) {
      // Eğer formData.supplier zaten number ise direkt kullan
      if (typeof formData.supplier === 'number') {
        materialData.primarySupplierId = formData.supplier;
      } else {
        // String ise supplier listesinden ID'yi bul
        const supplierObj = suppliers?.find(s => 
          s.name === formData.supplier || 
          s.id === parseInt(formData.supplier)
        );
        if (supplierObj) {
          materialData.primarySupplierId = supplierObj.id;
        }
      }
      // supplier field'ını kaldır (backend primary_supplier_id kullanıyor)
      delete materialData.supplier;
    }

    onSave(materialData, showNewCategory ? newCategory : null);
    
    // Kaydet işleminden sonra kilitli moda dön
    setIsEditing(false);
    setShowNewCategory(false);
    setNewCategory('');
  };

  const handleClose = () => {
    // Form'u sıfırla
    setFormData({
      code: '',
      name: '',
      type: '',
      category: '',
      unit: '',
      stock: '0',
      reorderPoint: '0',
      costPrice: '0',
      sellPrice: '0',
      supplier: '',
      description: '',
      status: 'Aktif'
    });
    setOriginalData(null); // Orijinal veriyi de temizle
    setShowNewCategory(false);
    setNewCategory('');
    setIsEditing(false); // Editing mode'u resetle
    onClose();
  };

  if (!isOpen) return null;

  // Loading state göster (material henüz yüklenmemişse)
  if (loading || (!material && isOpen)) {
    return (
      <div className="modal-overlay" onClick={handleClose}>
        <div className="modal-content" onClick={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <h2>Malzeme Detayları</h2>
            <button className="modal-close" onClick={handleClose}>×</button>
          </div>
          <div className="modal-form empty-state-simple">
            {!loadingTimeout ? (
              <>
                <div className="icon-lg-mb">⏳</div>
                <p className="loading-text-title">Malzeme detayları yükleniyor...</p>
                <p className="text-sm-light">Lütfen bekleyin</p>
              </>
            ) : (
              <>
                <div className="icon-lg-mb">⚠️</div>
                <p className="loading-text-error">Yükleme çok uzun sürüyor</p>
                <p className="loading-text-subtitle">Bağlantı problemi olabilir</p>
                <button 
                  onClick={handleClose}
                  className="btn-timeout-close"
                >
                  Kapat ve Tekrar Dene
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Material verisi yoksa ve loading de yapılmıyorsa hata göster
  if (!material && !loading) {
    return (
      <div className="modal-overlay" onClick={handleClose}>
        <div className="modal-content" onClick={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <h2>Malzeme Detayları</h2>
            <button className="modal-close" onClick={handleClose}>×</button>
          </div>
          <div className="modal-form empty-state-simple">
            <div className="icon-search-lg">🔍</div>
            <p className="loading-text-gray">Malzeme bulunamadı</p>
            <p className="text-sm-light">Bu malzeme silinmiş olabilir veya erişim yetkiniz bulunmuyor</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      {console.log('🎯 EditMaterialModal RENDER:', { 
        isOpen, 
        materialId: material?.id, 
        materialName: material?.name,
        suppliersCount: suppliers?.length,
        loading,
        suppliersLoading
      })}
      {!isOpen && console.log('❌ Modal kapalı - isOpen false')}
      {isOpen && (
        <>
          <style>
            {`
              @keyframes pulse {
                0%, 100% {
                  opacity: 1;
                }
                50% {
                  opacity: 0.5;
                }
              }
            `}
          </style>
          <div className="modal-overlay" onClick={handleClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Malzeme Detayları {isRemoved && <span className="text-error-sm">(Kaldırılmış)</span>}</h2>
          <div className="header-actions">
            {!isRemoved && !isEditing && (
              <button type="button" onClick={(e) => { e.preventDefault(); handleUnlock(); }} className="btn-edit" title="Düzenle">
                🔒 Düzenle
              </button>
            )}
            {!isRemoved && isEditing && (
              <button type="submit" form="edit-material-form" className="btn-save" title="Kaydet">
                🔓 Kaydet
              </button>
            )}
            {!isRemoved && onDelete && (
              <button 
                type="button" 
                onClick={() => {
                  onDelete(material.id);
                  onClose();
                }} 
                className="btn-delete"
                title="Sil"
              >
                🗑️
              </button>
            )}
            <button className="modal-close" onClick={handleClose}>×</button>
          </div>
        </div>
        
        <form id="edit-material-form" onSubmit={handleSubmit} className="modal-form material-details-layout">
          {/* Üst kısım - 2 kolon */}
          <div className="details-top-section">
            {/* Sol kolon - Ana bilgiler */}
            <div className="details-left-section">
              <h3>Malzeme Bilgileri</h3>
              
              <div className="details-content">
                <div className="detail-item">
                  <span className="detail-label">Malzeme Kodu:</span>
                  <span className="detail-value">{safeRender(formData.code)}</span>
                </div>
                
                <div className="detail-item">
                  <span className="detail-label">Malzeme Adı:</span>
                  {!isEditing ? (
                    <span className="detail-value">{safeRender(formData.name)}</span>
                  ) : (
                    <input
                      type="text"
                      name="name"
                      value={safeRender(formData.name)}
                      onChange={handleInputChange}
                      className="detail-input"
                      required
                    />
                  )}
                </div>
                
                <div className="detail-item">
                  <span className="detail-label">Malzeme Tipi:</span>
                  {!isEditing ? (
                    <span className="detail-value">{types.find(type => type.id === formData.type)?.label || safeRender(formData.type, 'Tip seçilmemiş')}</span>
                  ) : (
                    <select
                      name="type"
                      value={safeRender(formData.type)}
                      onChange={handleInputChange}
                      className="detail-input"
                      required
                    >
                      <option value="">Tip seçin</option>
                      {types.map(type => (
                        <option key={type.id} value={type.id}>{type.label}</option>
                      ))}
                    </select>
                  )}
                </div>
                
                <div className="detail-item">
                  <span className="detail-label">Kategori:</span>
                  {!isEditing ? (
                    <span className="detail-value">{
                      (() => {
                        // Eğer kategori boşsa veya null ise
                        if (!formData.category) return 'Kategori seçilmemiş';
                        
                        // Önce ID ile bul
                        const categoryById = categories.find(cat => cat.id === formData.category);
                        if (categoryById) return categoryById.name;
                        
                        // Sonra name ile bul
                        const categoryByName = categories.find(cat => cat.name === formData.category);
                        if (categoryByName) return categoryByName.name;
                        
                        // Hiçbiri bulunamazsa - bu kategori silinmiş olabilir
                        console.warn('🗑️ Kategori bulunamadı, büyük ihtimalle silinmiş:', formData.category);
                        return 'Kategori artık mevcut değil';
                      })()
                    }</span>
                  ) : (
                    <>
                      {!showNewCategory ? (
                        <select
                          value={safeRender(formData.category)}
                          onChange={handleCategoryChange}
                          className="detail-input"
                          required={!['processed', 'scrap'].includes(formData.type)}
                        >
                          <option value="">Kategori seçin</option>
                          {categories.map(cat => (
                            <option key={cat.id} value={cat.id}>{cat.name || cat.label}</option>
                          ))}
                          <option value="new-category">+ Yeni Kategori Ekle</option>
                        </select>
                      ) : (
                        <input
                          type="text"
                          value={newCategory}
                          onChange={(e) => setNewCategory(e.target.value)}
                          placeholder="Yeni kategori adı"
                          className="detail-input"
                          required
                        />
                      )}
                    </>
                  )}
                </div>
                
                <div className="detail-item">
                  <span className="detail-label">Açıklama:</span>
                  {!isEditing ? (
                    <span className="detail-value description">{safeRender(formData.description, 'Açıklama girilmemiş')}</span>
                  ) : (
                    <textarea
                      name="description"
                      value={safeRender(formData.description)}
                      onChange={handleInputChange}
                      placeholder="Malzeme açıklaması"
                      className="detail-input"
                      rows="2"
                    />
                  )}
                </div>
              </div>
            </div>
            
            {/* Sağ kolon - Tedarikçiler */}
            <div className="details-right-section">
              <div className="suppliers-section suppliers-section-full">
                <h3 className="suppliers-section-title">
                  Tedarikçiler
                </h3>
                
                {/* Kaydırılabilir Tedarikçiler Listesi */}
                <div className="suppliers-list suppliers-list-scroll">
                  {/* Loading State için Tedarikçiler */}
                  {suppliersLoading ? (
                    <div className="supplier-skeleton">
                      {[1, 2, 3].map((_, index) => (
                        <div 
                          key={index}
                          className="supplier-skeleton-item"
                        >
                          <div className="supplier-skeleton-row">
                            <div className="supplier-skeleton-left">
                              <div className="supplier-skeleton-bar"></div>
                              <div className="supplier-skeleton-badge"></div>
                            </div>
                            <div className="supplier-skeleton-buttons">
                              {[1, 2, 3].map((_, btnIndex) => (
                                <div 
                                  key={btnIndex}
                                  className="supplier-skeleton-btn"
                                ></div>
                              ))}
                            </div>
                          </div>
                        </div>
                      ))}
                      <div className="supplier-loading-text">
                        🔄 Tedarikçiler yükleniyor...
                      </div>
                    </div>
                  ) : (
                    <>
                      {/* Gerçek tedarikçiler listesi */}
                      {materialSuppliers.map((supplier, index) => (
                    <div 
                      key={supplier.id || index}
                      className="supplier-card supplier-card-compact"
                    >
                      {/* Tek Satır - Tüm İçerik */}
                      <div className="supplier-card-row">
                        {/* Sol Taraf - Tedarikçi Adı ve Durum */}
                        <div className="supplier-card-left">
                          <div className="supplier-card-name">
                            {supplier.name || supplier.companyName}
                          </div>
                          {(() => {
                            // Calculate effective material status for this supplier
                            const effectiveStatus = getEffectiveMaterialStatus(
                              material, 
                              supplier, 
                              supplier.currentSuppliedMaterial
                            )
                            
                            // Debug log
                            console.log('🔍 EditMaterialModal Status:', {
                              materialName: material?.name,
                              supplierName: supplier?.name || supplier?.companyName,
                              supplierStatus: supplier?.status,
                              materialStatus: material?.status,
                              suppliedMaterialStatus: supplier.currentSuppliedMaterial?.status,
                              effectiveStatus: effectiveStatus.status,
                              source: effectiveStatus.source
                            })
                            
                            const badgeProps = createStatusBadgeProps(effectiveStatus, { 
                              size: 'small', 
                              showTooltip: true 
                            })
                            
                            // Küçük boyut için stil ayarları
                            const smallBadgeStyle = {
                              ...badgeProps.style,
                              fontSize: '7px',
                              padding: '1px 3px',
                              flexShrink: 0
                            }
                            
                            return (
                              <span 
                                {...badgeProps}
                                style={smallBadgeStyle}
                              />
                            )
                          })()}
                        </div>
                        
                        {/* Sağ Taraf - Butonlar */}
                        <div className="supplier-card-buttons">
                          {/* Info Butonu */}
                          {/* Tedarikçi Info Butonu - Yeni pencerede tedarikçi detaylarını aç */}
                          <button
                            className="btn-supplier-info"
                            onClick={(e) => {
                              e.stopPropagation();
                              console.log('Tedarikçi detayı açılacak:', supplier.name || supplier.companyName);
                              
                              // Yeni pencerede materials.html'de suppliers sekmesinde tedarikçi detaylarını aç
                              const supplierDetailsUrl = `/materials.html#suppliers-tab&supplier-${supplier.id}`;
                              window.open(supplierDetailsUrl, '_blank');
                            }}
                            title={`${supplier.name || supplier.companyName} detaylarını görüntüle`}
                          >
                            ℹ️
                          </button>
                          
                          {/* İletişim Butonları */}
                          {(supplier.phone1 || supplier.phone) && (
                            <button
                              className="btn-supplier-contact"
                              onClick={(e) => {
                                e.stopPropagation();
                                window.open(`tel:${supplier.phone1 || supplier.phone}`);
                              }}
                              title={`Telefon: ${supplier.phone1 || supplier.phone}`}
                            >
                              📞
                            </button>
                          )}
                          {(supplier.email1 || supplier.email) && (
                            <button
                              className="btn-supplier-contact email"
                              onClick={(e) => {
                                e.stopPropagation();
                                window.open(`mailto:${supplier.email1 || supplier.email}`);
                              }}
                              title={`Email: ${supplier.email1 || supplier.email}`}
                            >
                              ✉️
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                  
                  {/* Boş Durum */}
                  {materialSuppliers.length === 0 && (
                    <div className="supplier-empty-compact">
                      <div className="text-md-mb">🏢</div>
                      <div className="font-medium-mb-2">Tedarikçi yok</div>
                      <div className="text-xxs-light">Bu malzemeyi tedarik eden firma bulunmuyor</div>
                    </div>
                  )}
                  </>
                  )}
                </div>
              </div>
            </div>
          </div>
          
          {/* Alt kısım - Stok bilgileri (2x2 Grid) */}
          <div className="details-bottom-section">
            <h3>Stok Bilgileri</h3>
            
            <div className="details-content">
              <div className="stock-info-grid">
                <div className="detail-item">
                  <span className="detail-label">Birim:</span>
                  <span className="detail-value">{safeRender(formData.unit)}</span>
                </div>
                
                <div className="detail-item">
                  <span className="detail-label">Mevcut Stok:</span>
                  {!isEditing ? (
                    <span className="detail-value">{safeRender(formData.stock, '0')}</span>
                  ) : (
                    <input
                      type="text"
                      name="stock"
                      value={safeRender(formData.stock, '0')}
                      onChange={handleInputChange}
                      className="detail-input"
                      inputMode="decimal"
                      pattern="[0-9]*\.?[0-9]*"
                      required
                    />
                  )}
                </div>
                
                <div className="detail-item">
                  <span className="detail-label">Reorder Point:</span>
                  {!isEditing ? (
                    <span className="detail-value">{safeRender(formData.reorderPoint, '0')}</span>
                  ) : (
                    <input
                      type="text"
                      name="reorderPoint"
                      value={safeRender(formData.reorderPoint, '0')}
                      onChange={handleInputChange}
                      className="detail-input"
                      inputMode="decimal"
                      pattern="[0-9]*\.?[0-9]*"
                      required
                    />
                  )}
                </div>
                
                <div className="detail-item">
                  <span className="detail-label">Durum:</span>
                  {!isEditing ? (
                    <span className="detail-value">{safeRender(formData.status, 'Aktif')}</span>
                  ) : (
                    <select
                      name="status"
                      value={safeRender(formData.status, 'Aktif')}
                      onChange={handleInputChange}
                      className="detail-input"
                    >
                      <option value="Aktif">Aktif</option>
                      {/* Removed Pasif option - materials only have 'Aktif' or 'Kaldırıldı' status */}
                    </select>
                  )}
                </div>
              </div>
            </div>
          </div>
          
          {/* Lot Envanteri - Lot tracking inventory section */}
          <div className="lot-inventory-section section-card-mb">
            <div className="supplier-header-flex">
              <h3 className="m-0">📦 Lot Envanteri</h3>
              <button
                type="button"
                onClick={() => {
                  if (material?.code) {
                    console.log('🔄 Lot envanteri yükleniyor...', material.code);
                    loadLots();
                  }
                }}
                disabled={lotsLoading || !material?.code}
                className="section-button"
              >
                {lotsLoading ? '⏳ Yükleniyor...' : '🔄 Lot Bilgilerini Yükle'}
              </button>
            </div>
            
            {lotsError && (
              <div className="alert alert-danger mb-12">
                ❌ Hata: {lotsError}
              </div>
            )}
            
            <div className="mes-table-container table-scroll-400">
              <table className="custom-table">
                <thead>
                  <tr>
                    <th>FIFO Sıra</th>
                    <th>Lot Numarası</th>
                    <th>Lot Tarihi</th>
                    <th>Tedarikçi Lot Kodu</th>
                    <th>Üretim Tarihi</th>
                    <th>Son Kullanma</th>
                    <th>Bakiye</th>
                    <th>Durum</th>
                  </tr>
                </thead>
                <tbody>
                  {lotsLoading && !lotsHasLoaded ? (
                    <tr>
                      <td colSpan="8" className="no-data">Lot envanteri yükleniyor...</td>
                    </tr>
                  ) : lotsError ? (
                    <tr>
                      <td colSpan="8" className="no-data text-danger">
                        Lot bilgileri yüklenemedi
                      </td>
                    </tr>
                  ) : lots && lots.length > 0 ? (
                    lots.map((lot, index) => {
                      const lotDate = lot.lotDate ? new Date(lot.lotDate) : null;
                      const mfgDate = lot.manufacturingDate ? new Date(lot.manufacturingDate) : null;
                      const expDate = lot.expiryDate ? new Date(lot.expiryDate) : null;
                      
                      return (
                        <tr key={lot.lotNumber || index}>
                          <td className="td-center-bold">
                            #{lot.fifoOrder}
                          </td>
                          <td className="td-monospace">
                            {lot.lotNumber || '-'}
                          </td>
                          <td>
                            {lotDate ? lotDate.toLocaleDateString('tr-TR') : '-'}
                          </td>
                          <td>
                            {lot.supplierLotCode || '-'}
                          </td>
                          <td>
                            {mfgDate ? mfgDate.toLocaleDateString('tr-TR') : '-'}
                          </td>
                          <td>
                            {expDate ? expDate.toLocaleDateString('tr-TR') : '-'}
                          </td>
                          <td className="td-right-bold">
                            {Number(lot.balance).toLocaleString('tr-TR', { 
                              minimumFractionDigits: 2, 
                              maximumFractionDigits: 2 
                            })}
                          </td>
                          <td>
                            {lot.status === 'active' ? (
                              <span className="badge badge-success mes-status-active">
                                Aktif
                              </span>
                            ) : lot.status === 'expiring_soon' ? (
                              <span className="badge badge-warning mes-status-warning">
                                Yakında Sona Erecek
                              </span>
                            ) : lot.status === 'expired' ? (
                              <span className="badge badge-danger mes-status-error">
                                Süresi Dolmuş
                              </span>
                            ) : (
                              <span className="badge badge-secondary">
                                {lot.status || '-'}
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan="8" className="no-data">
                        {lotsHasLoaded ? 'Henüz lot kaydı bulunmuyor' : 'Lot bilgilerini yüklemek için butona tıklayın'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
          
          {/* Üretim geçmişi tablosu */}
          <div className="production-history-section mb-24">
            <div className="supplier-header-flex">
              <h3 className="m-0">Üretim Geçmişi</h3>
              <button 
                type="button"
                onClick={() => {
                  if (!isProductionLoaded) {
                    console.log('🔄 Üretim geçmişi yükleniyor...', material.code);
                    loadProductionHistory();
                  } else {
                    console.log('✅ Üretim geçmişi zaten yüklü, yeniden yükleniyor...');
                    loadProductionHistory();
                  }
                }}
                disabled={productionLoading}
                className="section-button"
              >
                {productionLoading ? '⏳ Yükleniyor...' : '🔄 Üretim Geçmişini Yükle'}
              </button>
            </div>
            
            <div className="production-history-table">
              <table>
                <thead>
                  <tr>
                    <th>Tarih</th>
                    <th>Work Order</th>
                    <th>Operasyon</th>
                    <th>Tip</th>
                    <th>Miktar</th>
                    <th>İşlem Yapan</th>
                  </tr>
                </thead>
                <tbody>
                  {productionLoading ? (
                    <tr>
                      <td colSpan="6" className="no-data">Üretim geçmişi yükleniyor...</td>
                    </tr>
                  ) : productionError ? (
                    <tr>
                      <td colSpan="6" className="error">Hata: {productionError}</td>
                    </tr>
                  ) : productionItems.length === 0 ? (
                    <tr>
                      <td colSpan="6" className="no-data">Henüz üretim geçmişi bulunmuyor</td>
                    </tr>
                  ) : (
                    productionItems.slice(0, 10).map((item, index) => {
                      const date = new Date(item.timestamp);
                      const formattedDate = date.toLocaleDateString('tr-TR');
                      const formattedTime = date.toLocaleTimeString('tr-TR');
                      
                      const typeLabel = item.type === 'consumption' ? 'Sarf' : 
                                       item.type === 'production' ? 'Üretim' : 'WIP';
                      const typeColor = item.type === 'consumption' ? '#ef4444' : 
                                       item.type === 'production' ? '#10b981' : '#3b82f6';
                      
                      // Show adjustment info if available
                      const quantityDisplay = item.type === 'consumption' && item.adjustedQuantity !== undefined
                        ? `${item.quantity} (Rez: ${item.reservedQuantity}, ${item.adjustedQuantity > 0 ? '+' : ''}${item.adjustedQuantity})`
                        : item.quantity;
                      
                      return (
                        <tr key={item.id || index}>
                          <td>{formattedDate} {formattedTime}</td>
                          <td>{item.workOrderCode}</td>
                          <td>{item.nodeId}</td>
                          <td>
                            <span className={`badge-type ${item.type}`}>
                              {typeLabel}
                            </span>
                          </td>
                          <td>{quantityDisplay}</td>
                          <td>{item.producedBy}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
          
          {/* Tedarik geçmişi tablosu */}
          <div className="supply-history-section">
            <div className="supplier-header-flex">
              <h3 className="m-0">Tedarik Geçmişi</h3>
              <button 
                type="button"
                onClick={() => {
                  if (material?.id && loadHistory) {
                    console.log('🔄 Tedarik geçmişi yeniden yükleniyor...', material.id);
                    loadHistory();
                  }
                }}
                className="section-button"
                disabled={!material?.id || procurementLoading}
              >
                {procurementLoading ? '⏳ Yükleniyor...' : '🔄 Tedarik Geçmişini Yükle'}
              </button>
            </div>
            <div className="supply-history-table">
              <table>
                <thead>
                  <tr>
                    <th>Tarih</th>
                    <th>Tedarikçi</th>
                    <th>Miktar</th>
                    <th>Birim Fiyat</th>
                    <th>Toplam</th>
                    <th>Durum</th>
                  </tr>
                </thead>
                <tbody>
                  {procurementLoading ? (
                    <tr>
                      <td colSpan="6" className="no-data">Tedarik geçmişi yükleniyor...</td>
                    </tr>
                  ) : procurementError ? (
                    <tr>
                      <td colSpan="6" className="no-data">{procurementError}</td>
                    </tr>
                  ) : (procurementItems && procurementItems.length > 0) ? (
                    procurementItems.map((row, idx) => {
                      // Görüntülenen tarih, sıralama tarihi ile aynı olmalı
                      const dateObj = row._sortDate || row.actualDeliveryDate || row.expectedDeliveryDate || row.orderDate || null;
                      const dateStr = dateObj ? new Date(dateObj).toLocaleDateString('tr-TR') : '-';
                      const qty = Number(row.quantity || 0);
                      const unit = material?.unit || '';
                      const unitPrice = Number(row.unitPrice || 0);
                      const total = !isNaN(qty) && !isNaN(unitPrice) ? (qty * unitPrice) : 0;
                      return (
                        <tr key={`${row.orderId}-${row.itemSequence}-${idx}`}>
                          <td>{dateStr}</td>
                          <td>{row.supplierName || '-'}</td>
                          <td>{!isNaN(qty) ? `${qty} ${unit}`.trim() : '-'}</td>
                          <td>{!isNaN(unitPrice) ? `${unitPrice.toLocaleString('tr-TR')} ${row.currency || 'TRY'}` : '-'}</td>
                          <td>{!isNaN(total) ? `${total.toLocaleString('tr-TR')} ${row.currency || 'TRY'}` : '-'}</td>
                          <td>{row.itemStatus || '-'}</td>
                        </tr>
                      )
                    })
                  ) : (
                    <tr>
                      <td colSpan="6" className="no-data">Henüz tedarik geçmişi bulunmuyor</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="flex-end-mt-8">
              <button
                type="button"
                onClick={() => {
                  try {
                    // Yeni sekmede Orders tab'ını aç
                    // LocalStorage ile tab'ı garantiye al
                    try { localStorage.setItem('bk_active_tab', 'orders'); } catch {}
                    window.open('materials.html#orders-tab', '_blank');
                  } catch (e) {
                    console.error('Order panelini açma hatası:', e)
                  }
                }}
                className="section-button"
              >
                Tüm tedarik geçmişini gör
              </button>
            </div>
          </div>

        </form>
      </div>
    </div>
        </>
      )}
    </>
  )
}
