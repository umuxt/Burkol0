import React, { useState, useEffect, useMemo } from 'react'
import { ArrowLeft, Edit, Download, Trash2, Info, Phone, Mail, RotateCw, Package, Factory, ShoppingCart } from '../../../../shared/components/Icons.jsx'
import useMaterialProcurementHistory from '../../hooks/useMaterialProcurementHistory.js'
import useMaterialProductionHistory from '../../hooks/useMaterialProductionHistory.js'
import useMaterialLots from '../../hooks/useMaterialLots.js'
import { useSuppliers } from '../../hooks/useSuppliers.js'
import { showToast } from '../../../../shared/components/MESToast.js'
import { 
  getEffectiveMaterialStatus, 
  createStatusBadgeProps,
  SUPPLIER_STATUSES,
  MATERIAL_STATUSES 
} from '../../utils/material-status-utils.js'

export default function MaterialDetailsPanel({ 
  material,
  onClose, 
  onSave, 
  onDelete, 
  categories, 
  types, 
  loading = false, 
  onRefreshMaterial,
  isRemoved = false 
}) {
  // Lazy loading suppliers when panel opens
  const { 
    suppliers = [], 
    loading: suppliersLoading = false, 
    refetch: refetchSuppliers 
  } = useSuppliers(!!material)

  // Güvenli değer render fonksiyonu
  const safeRender = (value, fallback = '') => {
    if (value === null || value === undefined || value === '' || Number.isNaN(value)) {
      return fallback;
    }
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
  
  const [originalData, setOriginalData] = useState(null);
  const [showNewCategory, setShowNewCategory] = useState(false);
  const [newCategory, setNewCategory] = useState('');
  const [isEditing, setIsEditing] = useState(false);

  // Get suppliers that supply this material
  const materialSuppliers = useMemo(() => {
    const suppliersToUse = suppliers || []
    
    if (!material || !suppliersToUse || suppliersToUse.length === 0) {
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
        const suppliedMaterial = supplier.suppliedMaterials.find(sm => 
          sm.id === material.id || 
          sm.code === material.code ||
          sm.name === material.name
        );
        
        return {
          ...supplier,
          currentSuppliedMaterial: suppliedMaterial
        };
      });
    
    return filtered;
  }, [material, suppliers]);

  // Material değiştiğinde form'u doldur
  useEffect(() => {
    if (material) {
      const safeNumber = (value) => {
        if (value === null || value === undefined || value === '' || Number.isNaN(value)) {
          return '0';
        }
        
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
      
      setFormData(materialFormData);
      setOriginalData(materialFormData);
      setShowNewCategory(false);
      setNewCategory('');
      setIsEditing(false);
    }
  }, [material, categories]);

  // Real-time stok güncellemesi için material.stock'ı dinle
  useEffect(() => {
    if (material && material.stock !== undefined && formData.stock !== undefined) {
      const currentStock = Number(formData.stock);
      const newStock = Number(material.stock);
      
      if (!isNaN(newStock) && currentStock !== newStock) {
        setFormData(prev => ({
          ...prev,
          stock: newStock.toString()
        }));
        
        setOriginalData(prev => ({
          ...prev,
          stock: newStock.toString()
        }));
      }
    }
  }, [material?.stock, material?.code, material?.name]);

  // Procurement history
  const { items: procurementItems, loading: procurementLoading, error: procurementError, loadHistory, isLoadedForMaterial } = useMaterialProcurementHistory(material)

  // Production history
  const { items: productionItems, loading: productionLoading, error: productionError, loadHistory: loadProductionHistory, isLoadedForMaterial: isProductionLoaded } = useMaterialProductionHistory(material)

  // Lot inventory
  const { lots, loading: lotsLoading, error: lotsError, loadLots, hasLoaded: lotsHasLoaded } = useMaterialLots(material)

  // System settings for lot tracking toggle
  const [systemSettings, setSystemSettings] = useState({ lotTracking: true })
  
  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const res = await fetch('/api/settings/system')
        if (res.ok) {
          const data = await res.json()
          setSystemSettings(data || { lotTracking: true })
        }
      } catch (error) {
        console.error('Failed to load system settings:', error)
      }
    }
    fetchSettings()
  }, [])

  // Global stock update event listener
  useEffect(() => {
    if (!material) return;

    const handleStockUpdate = (event) => {
      const { materialCode, newStock, quantity, operation, context } = event.detail;
      
      if (materialCode === material.code) {
        if (newStock !== undefined && !isNaN(newStock)) {
          setFormData(prev => ({
            ...prev,
            stock: newStock.toString()
          }));
          
          setOriginalData(prev => ({
            ...prev,
            stock: newStock.toString()
          }));
          
          if (onRefreshMaterial && typeof onRefreshMaterial === 'function') {
            onRefreshMaterial();
          }
        }
      }
    };

    window.addEventListener('materialStockUpdated', handleStockUpdate);
    
    return () => {
      window.removeEventListener('materialStockUpdated', handleStockUpdate);
    };
  }, [material?.code, formData.stock, onRefreshMaterial]);

  const handleInputChange = (e) => {
    if (!isEditing) return;
    
    const { name, value } = e.target;
    
    // Text input olduğu için validasyon yapıyoruz
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

    setFormData(prev => ({
      ...prev,
      [name]: cleanValue
    }));
  };

  const handleUnlock = () => {
    if (isRemoved) {
      console.log('❌ Kaldırılan malzemeler düzenlenemez')
      return;
    }
    setIsEditing(true);
  };

  const handleCategoryChange = (e) => {
    if (!isEditing) return;
    
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
    
    if (!isEditing) return;
    
    const finalCategory = showNewCategory ? newCategory : formData.category;
    
    // Validate required fields - stock and reorderPoint can be 0
    const stockValue = formData.stock === '' ? null : formData.stock;
    const reorderValue = formData.reorderPoint === '' ? null : formData.reorderPoint;
    
    if (!formData.name || !formData.type || !finalCategory || stockValue === null || reorderValue === null) {
      showToast('Lütfen tüm zorunlu alanları doldurun!', 'warning');
      return;
    }

    // Değişiklik kontrolü
    if (originalData) {
      const currentData = {
        ...formData,
        category: finalCategory
      };
      
      const hasChanges = Object.keys(currentData).some(key => {
        return currentData[key] !== originalData[key];
      });
      
      const hasNewCategory = showNewCategory && newCategory.trim() !== '';
      
      if (!hasChanges && !hasNewCategory) {
        showToast('Herhangi bir değişiklik yapılmadı!', 'info');
        setIsEditing(false);
        return;
      }
    }

    const materialData = {
      ...formData,
      category: finalCategory,
      stock: parseFloat(formData.stock) || 0,
      reorderPoint: parseFloat(formData.reorderPoint) || 0,
      costPrice: parseFloat(formData.costPrice) || 0,
      sellPrice: parseFloat(formData.sellPrice) || 0
    };

    // Supplier name'i ID'ye çevir
    if (formData.supplier) {
      if (typeof formData.supplier === 'number') {
        materialData.primarySupplierId = formData.supplier;
      } else {
        const supplierObj = suppliers?.find(s => 
          s.name === formData.supplier || 
          s.id === parseInt(formData.supplier)
        );
        if (supplierObj) {
          materialData.primarySupplierId = supplierObj.id;
        }
      }
      delete materialData.supplier;
    }

    onSave(materialData, showNewCategory ? newCategory : null);
    
    setIsEditing(false);
    setShowNewCategory(false);
    setNewCategory('');
  };

  const handleClose = () => {
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
    setOriginalData(null);
    setShowNewCategory(false);
    setNewCategory('');
    setIsEditing(false);
    onClose();
  };

  if (!material) return null;

  // Helper functions
  const getCategoryName = (categoryId) => {
    if (!categoryId) return 'Kategori seçilmemiş';
    const categoryById = categories.find(cat => cat.id === categoryId);
    if (categoryById) return categoryById.name;
    const categoryByName = categories.find(cat => cat.name === categoryId);
    if (categoryByName) return categoryByName.name;
    return 'Kategori artık mevcut değil';
  };

  const getTypeLabel = (typeId) => {
    const type = types.find(t => t.id === typeId || t.value === typeId);
    return type?.label || typeId || 'Tip seçilmemiş';
  };

  return (
    <div className="material-detail-panel">
      <div className="detail-panel-card">
        {/* Header */}
        <div className="detail-panel-header">
          <div className="flex-center-gap-12">
            <button
              onClick={handleClose}
              className="btn-icon-back"
              title="Detayları Kapat"
            >
              <ArrowLeft size={14} />
            </button>
            <h3 className="supplier-section-title-lg">
              Malzeme Detayları {isRemoved && <span className="text-error-sm">(Kaldırılmış)</span>}
            </h3>
          </div>
          <div className="flex-gap-8-center">
            {!isRemoved && !isEditing ? (
              <button
                onClick={handleUnlock}
                className="btn-icon-edit"
              >
                <Edit size={14} /> Düzenle
              </button>
            ) : null}
            {!isRemoved && isEditing ? (
              <>
                <button
                  type="submit"
                  form="material-detail-form"
                  className="btn-icon-save"
                >
                  <Download size={14} /> Kaydet
                </button>
                <button
                  onClick={() => setIsEditing(false)}
                  className="btn-icon-cancel"
                >
                  <ArrowLeft size={14} /> İptal
                </button>
              </>
            ) : null}
            {!isRemoved && onDelete && (
              <button
                onClick={() => {
                  if (confirm(`${material.name} malzemesini silmek istediğinizden emin misiniz?`)) {
                    onDelete(material.id);
                    onClose();
                  }
                }}
                className="btn-icon-delete"
              >
                <Trash2 size={14} /> Sil
              </button>
            )}
          </div>
        </div>

        {/* Content - Scrollable */}
        <div className="panel-content">
          <form id="material-detail-form" onSubmit={handleSubmit}>
            {/* Temel Bilgiler */}
            <div className="section-card">
              <h3 className="supplier-section-header">
                Temel Bilgiler
              </h3>
              
              <div className="supplier-detail-row">
                <span className="supplier-detail-label-120">
                  Malzeme Kodu:
                </span>
                <span className="supplier-detail-value">
                  {safeRender(formData.code)}
                </span>
              </div>

              <div className="supplier-detail-row">
                <span className="supplier-detail-label-120">
                  Malzeme Adı:
                </span>
                {isEditing ? (
                  <input
                    type="text"
                    name="name"
                    value={safeRender(formData.name)}
                    onChange={handleInputChange}
                    className="input-edit-field"
                  />
                ) : (
                  <span className="supplier-detail-value">
                    {safeRender(formData.name)}
                  </span>
                )}
              </div>

              <div className="supplier-detail-row">
                <span className="supplier-detail-label-120">
                  Tip:
                </span>
                {isEditing ? (
                  <select
                    name="type"
                    value={safeRender(formData.type)}
                    onChange={handleInputChange}
                    className="select-edit-field"
                  >
                    {types.map(type => (
                      <option key={type.value || type.id} value={type.value || type.id}>{type.label}</option>
                    ))}
                  </select>
                ) : (
                  <span className="supplier-detail-value">
                    {getTypeLabel(formData.type)}
                  </span>
                )}
              </div>

              <div className="supplier-detail-row">
                <span className="supplier-detail-label-120">
                  Kategori:
                </span>
                {isEditing ? (
                  <>
                    {!showNewCategory ? (
                      <select
                        value={safeRender(formData.category)}
                        onChange={handleCategoryChange}
                        className="select-edit-field"
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
                        className="input-edit-field"
                        required
                      />
                    )}
                  </>
                ) : (
                  <span className="supplier-detail-value">
                    {getCategoryName(formData.category)}
                  </span>
                )}
              </div>

              <div className="supplier-detail-row">
                <span className="supplier-detail-label-120">
                  Birim:
                </span>
                {isEditing ? (
                  <input
                    type="text"
                    name="unit"
                    value={safeRender(formData.unit)}
                    onChange={handleInputChange}
                    className="input-edit-field"
                  />
                ) : (
                  <span className="supplier-detail-value">
                    {safeRender(formData.unit)}
                  </span>
                )}
              </div>
            </div>

            {/* Stok Bilgileri */}
            <div className="section-card">
              <h3 className="supplier-section-header">
                Stok Bilgileri
              </h3>
              
              <div className="supplier-detail-row">
                <span className="supplier-detail-label-120">
                  Mevcut Stok:
                </span>
                {isEditing ? (
                  <input
                    type="text"
                    name="stock"
                    value={safeRender(formData.stock, '0')}
                    onChange={handleInputChange}
                    inputMode="decimal"
                    pattern="[0-9]*\.?[0-9]*"
                    className="input-edit-field"
                  />
                ) : (
                  <span className="text-12-dark">
                    {safeRender(formData.stock, '0')} {material.unit}
                  </span>
                )}
              </div>

              <div className="supplier-detail-row">
                <span className="supplier-detail-label-120">
                  Minimum Stok:
                </span>
                {isEditing ? (
                  <input
                    type="text"
                    name="reorderPoint"
                    value={safeRender(formData.reorderPoint, '0')}
                    onChange={handleInputChange}
                    inputMode="decimal"
                    pattern="[0-9]*\.?[0-9]*"
                    className="input-edit-field"
                  />
                ) : (
                  <span className="supplier-detail-value">
                    {safeRender(formData.reorderPoint, '0')} {material.unit}
                  </span>
                )}
              </div>

              <div className="supplier-detail-row">
                <span className="supplier-detail-label-120">
                  Durum:
                </span>
                {isEditing ? (
                  <select
                    name="status"
                    value={safeRender(formData.status, 'Aktif')}
                    onChange={handleInputChange}
                    className="select-edit-field"
                  >
                    <option value="Aktif">Aktif</option>
                  </select>
                ) : (
                  <span className="supplier-detail-value">
                    {safeRender(formData.status, 'Aktif')}
                  </span>
                )}
              </div>
            </div>

            {/* Tedarikçiler */}
            <div className="section-card">
              <h3 className="suppliers-section-title">
                Tedarikçiler
              </h3>
              
              <div className="suppliers-list-scroll">
                {suppliersLoading ? (
                  <div className="empty-suppliers-panel">
                    🔄 Tedarikçiler yükleniyor...
                  </div>
                ) : materialSuppliers.length === 0 ? (
                  <div className="supplier-empty-compact">
                    <div className="text-md-mb">🏢</div>
                    <div className="font-medium-mb-2">Tedarikçi yok</div>
                    <div className="text-xxs-light">Bu malzemeyi tedarik eden firma bulunmuyor</div>
                  </div>
                ) : (
                  materialSuppliers.map((supplier, index) => (
                    <div 
                      key={supplier.id || index}
                      className="supplier-card-compact"
                    >
                      <div className="supplier-card-row">
                        <div className="supplier-card-left">
                          <div className="supplier-card-name">
                            {supplier.name || supplier.companyName}
                          </div>
                          {(() => {
                            const effectiveStatus = getEffectiveMaterialStatus(
                              material, 
                              supplier, 
                              supplier.currentSuppliedMaterial
                            )
                            
                            const badgeProps = createStatusBadgeProps(effectiveStatus, { 
                              size: 'small', 
                              showTooltip: true 
                            })
                            
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
                        
                        <div className="supplier-card-buttons">
                          <button
                            type="button"
                            className="btn-supplier-contact"
                            onClick={(e) => {
                              e.stopPropagation();
                              const supplierDetailsUrl = `/materials.html#suppliers-tab&supplier-${supplier.id}`;
                              window.open(supplierDetailsUrl, '_blank');
                            }}
                            title={`${supplier.name || supplier.companyName} detaylarını görüntüle`}
                          >
                            <Info size={14} />
                          </button>
                          
                          {(supplier.phone1 || supplier.phone) && (
                            <button
                              type="button"
                              className="btn-supplier-contact"
                              onClick={(e) => {
                                e.stopPropagation();
                                window.open(`tel:${supplier.phone1 || supplier.phone}`);
                              }}
                              title={`Telefon: ${supplier.phone1 || supplier.phone}`}
                            >
                              <Phone size={14} />
                            </button>
                          )}
                          {(supplier.email1 || supplier.email) && (
                            <button
                              type="button"
                              className="btn-supplier-contact email"
                              onClick={(e) => {
                                e.stopPropagation();
                                window.open(`mailto:${supplier.email1 || supplier.email}`);
                              }}
                              title={`Email: ${supplier.email1 || supplier.email}`}
                            >
                              <Mail size={14} />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Lot Envanteri - Only show when lot tracking is enabled */}
            {systemSettings.lotTracking && (
            <div className="section-card">
              <div className="supplier-header-flex">
                <h3 className="title-with-icon">
                  <Package size={16} />
                  Lot Envanteri
                </h3>
                <button 
                  type="button"
                  onClick={() => {
                    if (material?.id && loadLots) {
                      loadLots();
                    }
                  }}
                  className="btn-load-sm"
                  disabled={!material?.id || lotsLoading}
                >
                  <RotateCw size={12} className="mr-4" />
                  {lotsLoading ? 'Yükleniyor...' : 'Yükle'}
                </button>
              </div>
              
              <div className="scroll-container">
                <table className="table-xs">
                  <thead>
                    <tr className="border-bottom-medium">
                      <th className="supplier-th-left">Lot No</th>
                      <th className="supplier-th-left">Tedarikçi Lot</th>
                      <th className="supplier-th-right">Miktar</th>
                      <th className="supplier-th-left">Üretim</th>
                      <th className="supplier-th-left">SKT</th>
                      <th className="supplier-th-left">Durum</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lotsLoading ? (
                      <tr>
                        <td colSpan="6" className="cell-center-gray">
                          Lot envanteri yükleniyor...
                        </td>
                      </tr>
                    ) : lotsError ? (
                      <tr>
                        <td colSpan="6" className="cell-center-error">
                          {lotsError}
                        </td>
                      </tr>
                    ) : lots && lots.length > 0 ? (
                      lots.map((lot, idx) => {
                        const mfgDate = lot.manufacturingDate ? new Date(lot.manufacturingDate).toLocaleDateString('tr-TR') : '-';
                        const expDate = lot.expiryDate ? new Date(lot.expiryDate).toLocaleDateString('tr-TR') : '-';
                        const qty = Number(lot.balance || 0);
                        const unit = material?.unit || '';
                        
                        return (
                          <tr key={lot.lotNumber || idx} className="border-bottom-light">
                            <td className="supplier-td-bold-blue">{lot.lotNumber || '-'}</td>
                            <td className="supplier-td">{lot.supplierLotCode || '-'}</td>
                            <td className="supplier-td-right-bold">
                              {!isNaN(qty) ? `${qty} ${unit}`.trim() : '-'}
                            </td>
                            <td className="supplier-td">{mfgDate}</td>
                            <td className="supplier-td">{expDate}</td>
                            <td className="supplier-td-simple">
                              <span className={`badge-status-sm ${lot.status === 'active' ? 'active' : 'inactive'}`}>
                                {lot.status === 'active' ? 'Aktif' : lot.status === 'depleted' ? 'Tükendi' : lot.status || '-'}
                              </span>
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan="6" className="cell-center-muted">
                          Henüz lot kaydı bulunmuyor
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
            )}

            {/* Üretim Geçmişi */}
            <div className="section-card">
              <div className="supplier-header-flex">
                <h3 className="title-with-icon">
                  <Factory size={16} />
                  Üretim Geçmişi
                </h3>
                <button 
                  type="button"
                  onClick={() => {
                    if (material?.id && loadProductionHistory) {
                      loadProductionHistory();
                    }
                  }}
                  className="btn-load-sm"
                  disabled={!material?.id || productionLoading}
                >
                  <RotateCw size={12} className="mr-4" />
                  {productionLoading ? 'Yükleniyor...' : 'Yükle'}
                </button>
              </div>
              
              <div className="scroll-container">
                <table className="table-xs">
                  <thead>
                    <tr className="border-bottom-medium">
                      <th className="supplier-th-left">Tarih</th>
                      <th className="supplier-th-left">İş Emri</th>
                      <th className="supplier-th-left">Operasyon</th>
                      <th className="supplier-th-right">Miktar</th>
                      <th className="supplier-th-left">Tip</th>
                    </tr>
                  </thead>
                  <tbody>
                    {productionLoading ? (
                      <tr>
                        <td colSpan="5" className="cell-center-gray">
                          Üretim geçmişi yükleniyor...
                        </td>
                      </tr>
                    ) : productionError ? (
                      <tr>
                        <td colSpan="5" className="cell-center-error">
                          {productionError}
                        </td>
                      </tr>
                    ) : productionItems && productionItems.length > 0 ? (
                      productionItems.map((item, idx) => {
                        const dateStr = item.timestamp ? new Date(item.timestamp).toLocaleDateString('tr-TR') : '-';
                        const timeStr = item.timestamp ? new Date(item.timestamp).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : '';
                        const qty = Number(item.quantity || 0);
                        const unit = material?.unit || '';
                        
                        // Type badge with comprehensive mapping
                        let typeLabel = 'Diğer';
                        let typeColor = '#6b7280';
                        
                        switch(item.type) {
                          case 'consumption':
                            typeLabel = 'Sarf';
                            typeColor = '#ef4444';
                            break;
                          case 'production':
                            typeLabel = 'Üretim';
                            typeColor = '#10b981';
                            break;
                          case 'scrap':
                            typeLabel = 'Hurda';
                            typeColor = '#f59e0b';
                            break;
                          case 'wip':
                            typeLabel = 'WIP';
                            typeColor = '#3b82f6';
                            break;
                          case 'realized_consumption':
                            typeLabel = 'Sarf';
                            typeColor = '#1e293b';
                            break;
                          case 'adjustment_in':
                            typeLabel = 'Ayarlama (+)';
                            typeColor = '#8b5cf6';
                            break;
                          case 'adjustment_out':
                            typeLabel = 'Ayarlama (-)';
                            typeColor = '#ec4899';
                            break;
                          case 'order':
                            typeLabel = 'Sipariş';
                            typeColor = '#06b6d4';
                            break;
                          case 'stock_in':
                            typeLabel = 'Giriş';
                            typeColor = '#84cc16';
                            break;
                          case 'stock_out':
                            typeLabel = 'Çıkış';
                            typeColor = '#f97316';
                            break;
                        }
                        
                        return (
                          <tr key={item.id || idx} className="border-bottom-light">
                            <td className="supplier-td">{dateStr} {timeStr}</td>
                            <td className="supplier-td-bold-blue">{item.workOrderCode || '-'}</td>
                            <td className="supplier-td">{item.nodeId || '-'}</td>
                            <td className="supplier-td-right-bold">
                              {!isNaN(qty) ? `${qty} ${unit}`.trim() : '0 ' + unit}
                            </td>
                            <td className="supplier-td-simple">
                              <span className={`badge-type ${item.type}`}>
                                {typeLabel}
                              </span>
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan="5" className="cell-center-muted">
                          Henüz üretim geçmişi bulunmuyor
                        </td>
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
                      localStorage.setItem('bk_active_tab', 'production');
                      window.open('production.html', '_blank');
                    } catch (e) {
                      console.error('Üretim panelini açma hatası:', e);
                    }
                  }}
                  className="btn-load-sm"
                >
                  Tüm üretim geçmişini gör
                </button>
              </div>
            </div>

            {/* Tedarik Geçmişi */}
            <div className="section-card">
              <div className="supplier-header-flex">
                <h3 className="title-with-icon">
                  <ShoppingCart size={16} />
                  Tedarik Geçmişi
                </h3>
                <button 
                  type="button"
                  onClick={() => {
                    if (material?.id && loadHistory) {
                      loadHistory();
                    }
                  }}
                  className="btn-load-sm"
                  disabled={!material?.id || procurementLoading}
                >
                  <RotateCw size={12} className="mr-4" />
                  {procurementLoading ? 'Yükleniyor...' : 'Yükle'}
                </button>
              </div>
              
              <div className="scroll-container">
                <table className="table-xs">
                  <thead>
                    <tr className="border-bottom-medium">
                      <th className="supplier-th-left">Tarih</th>
                      <th className="supplier-th-left">Tedarikçi</th>
                      <th className="supplier-th-right">Miktar</th>
                      <th className="supplier-th-right">Birim Fiyat</th>
                      <th className="supplier-th-right">Toplam</th>
                      <th className="supplier-th-left">Durum</th>
                    </tr>
                  </thead>
                  <tbody>
                    {procurementLoading ? (
                      <tr>
                        <td colSpan="6" className="cell-center-gray">
                          Tedarik geçmişi yükleniyor...
                        </td>
                      </tr>
                    ) : procurementError ? (
                      <tr>
                        <td colSpan="6" className="cell-center-error">
                          {procurementError}
                        </td>
                      </tr>
                    ) : procurementItems && procurementItems.length > 0 ? (
                      procurementItems.map((row, idx) => {
                        const dateObj = row._sortDate || row.actualDeliveryDate || row.expectedDeliveryDate || row.orderDate || null;
                        const dateStr = dateObj ? new Date(dateObj).toLocaleDateString('tr-TR') : '-';
                        const qty = Number(row.quantity || 0);
                        const unit = material?.unit || '';
                        const unitPrice = Number(row.unitPrice || 0);
                        const total = !isNaN(qty) && !isNaN(unitPrice) ? (qty * unitPrice) : 0;
                        return (
                          <tr key={`${row.orderId}-${row.itemSequence}-${idx}`} className="border-bottom-light">
                            <td className="supplier-td">{dateStr}</td>
                            <td className="supplier-td">{row.supplierName || '-'}</td>
                            <td className="supplier-td-right">
                              {!isNaN(qty) ? `${qty} ${unit}`.trim() : '-'}
                            </td>
                            <td className="supplier-td-right">
                              {!isNaN(unitPrice) ? `${unitPrice.toLocaleString('tr-TR')} ${row.currency || 'TRY'}` : '-'}
                            </td>
                            <td className="supplier-td-right">
                              {!isNaN(total) ? `${total.toLocaleString('tr-TR')} ${row.currency || 'TRY'}` : '-'}
                            </td>
                            <td className="supplier-td">{row.itemStatus || '-'}</td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan="6" className="cell-center-muted">
                          Henüz tedarik geçmişi bulunmuyor
                        </td>
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
                      localStorage.setItem('bk_active_tab', 'orders');
                      window.open('materials.html#orders-tab', '_blank');
                    } catch (e) {
                      console.error('Order panelini açma hatası:', e);
                    }
                  }}
                  className="btn-load-sm"
                >
                  Tüm tedarik geçmişini gör
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
