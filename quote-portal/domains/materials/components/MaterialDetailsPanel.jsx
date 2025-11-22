import React, { useState, useEffect, useMemo } from 'react'
import { ArrowLeft, Edit, Download, Trash2, Info, Phone, Mail, RotateCw, Package, Factory, ShoppingCart } from '../../../shared/components/Icons.jsx'
import useMaterialProcurementHistory from '../hooks/useMaterialProcurementHistory.js'
import useMaterialProductionHistory from '../hooks/useMaterialProductionHistory.js'
import useMaterialLots from '../hooks/useMaterialLots.js'
import { useSuppliers } from '../hooks/useSuppliers'
import { 
  getEffectiveMaterialStatus, 
  createStatusBadgeProps,
  SUPPLIER_STATUSES,
  MATERIAL_STATUSES 
} from '../utils/material-status-utils'

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
        reorderPoint: safeNumber(material.reorder_point),
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
    
    if (Number.isNaN(value)) {
      console.warn('🚨 NaN value detected in input change:', name, value);
      return;
    }
    
    setFormData(prev => ({
      ...prev,
      [name]: value
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
    
    if (!formData.name || !formData.type || !finalCategory || !formData.stock || !formData.reorderPoint) {
      alert('Lütfen tüm zorunlu alanları doldurun!');
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
        alert('Herhangi bir değişiklik yapılmadı!');
        setIsEditing(false);
        return;
      }
    }

    const materialData = {
      ...formData,
      category: finalCategory,
      stock: parseInt(formData.stock) || 0,
      reorderPoint: parseInt(formData.reorderPoint) || 0,
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
      <div style={{ 
        background: 'white', 
        borderRadius: '6px', 
        border: '1px solid #e5e7eb',
        height: '100%',
        display: 'flex',
        flexDirection: 'column'
      }}>
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
              onClick={handleClose}
              style={{
                padding: '6px 12px',
                border: '1px solid #d1d5db',
                borderRadius: '4px',
                background: 'white',
                color: '#374151',
                cursor: 'pointer',
                fontSize: '12px'
              }}
              title="Detayları Kapat"
            >
              <ArrowLeft size={14} />
            </button>
            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '600', color: '#111827' }}>
              Malzeme Detayları {isRemoved && <span style={{ color: '#dc2626', fontSize: '14px' }}>(Kaldırılmış)</span>}
            </h3>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            {!isRemoved && !isEditing ? (
              <button
                onClick={handleUnlock}
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
              >
                <Edit size={14} /> Düzenle
              </button>
            ) : null}
            {!isRemoved && isEditing ? (
              <>
                <button
                  type="submit"
                  form="material-detail-form"
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
                >
                  <Download size={14} /> Kaydet
                </button>
                <button
                  onClick={() => setIsEditing(false)}
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
              >
                <Trash2 size={14} /> Sil
              </button>
            )}
          </div>
        </div>

        {/* Content - Scrollable */}
        <div style={{ flex: 1, overflow: 'auto', padding: '20px' }}>
          <form id="material-detail-form" onSubmit={handleSubmit}>
            {/* Temel Bilgiler */}
            <div style={{ 
              marginBottom: '16px', 
              padding: '12px', 
              background: 'white', 
              borderRadius: '6px',
              border: '1px solid #e5e7eb'
            }}>
              <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: '600', color: '#111827', borderBottom: '1px solid #e5e7eb', paddingBottom: '6px' }}>
                Temel Bilgiler
              </h3>
              
              <div className="detail-item" style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                <span className="detail-label" style={{ fontWeight: '600', fontSize: '12px', color: '#374151', minWidth: '120px', marginRight: '8px' }}>
                  Malzeme Kodu:
                </span>
                <span style={{ fontSize: '12px', color: '#111827' }}>
                  {safeRender(formData.code)}
                </span>
              </div>

              <div className="detail-item" style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                <span className="detail-label" style={{ fontWeight: '600', fontSize: '12px', color: '#374151', minWidth: '120px', marginRight: '8px' }}>
                  Malzeme Adı:
                </span>
                {isEditing ? (
                  <input
                    type="text"
                    name="name"
                    value={safeRender(formData.name)}
                    onChange={handleInputChange}
                    style={{
                      padding: '8px 12px',
                      border: '1px solid #3b82f6',
                      borderRadius: '4px',
                      background: 'white',
                      width: '100%',
                      fontSize: '14px'
                    }}
                  />
                ) : (
                  <span style={{ fontSize: '12px', color: '#111827' }}>
                    {safeRender(formData.name)}
                  </span>
                )}
              </div>

              <div className="detail-item" style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                <span className="detail-label" style={{ fontWeight: '600', fontSize: '12px', color: '#374151', minWidth: '120px', marginRight: '8px' }}>
                  Tip:
                </span>
                {isEditing ? (
                  <select
                    name="type"
                    value={safeRender(formData.type)}
                    onChange={handleInputChange}
                    style={{
                      padding: '8px 12px',
                      border: '1px solid #3b82f6',
                      borderRadius: '4px',
                      background: 'white',
                      width: '100%',
                      fontSize: '14px'
                    }}
                  >
                    {types.map(type => (
                      <option key={type.value || type.id} value={type.value || type.id}>{type.label}</option>
                    ))}
                  </select>
                ) : (
                  <span style={{ fontSize: '12px', color: '#111827' }}>
                    {getTypeLabel(formData.type)}
                  </span>
                )}
              </div>

              <div className="detail-item" style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                <span className="detail-label" style={{ fontWeight: '600', fontSize: '12px', color: '#374151', minWidth: '120px', marginRight: '8px' }}>
                  Kategori:
                </span>
                {isEditing ? (
                  <>
                    {!showNewCategory ? (
                      <select
                        value={safeRender(formData.category)}
                        onChange={handleCategoryChange}
                        style={{
                          padding: '8px 12px',
                          border: '1px solid #3b82f6',
                          borderRadius: '4px',
                          background: 'white',
                          width: '100%',
                          fontSize: '14px'
                        }}
                        required
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
                        style={{
                          padding: '8px 12px',
                          border: '1px solid #3b82f6',
                          borderRadius: '4px',
                          background: 'white',
                          width: '100%',
                          fontSize: '14px'
                        }}
                        required
                      />
                    )}
                  </>
                ) : (
                  <span style={{ fontSize: '12px', color: '#111827' }}>
                    {getCategoryName(formData.category)}
                  </span>
                )}
              </div>

              <div className="detail-item" style={{ display: 'flex', alignItems: 'center', marginBottom: '0' }}>
                <span className="detail-label" style={{ fontWeight: '600', fontSize: '12px', color: '#374151', minWidth: '120px', marginRight: '8px' }}>
                  Birim:
                </span>
                {isEditing ? (
                  <input
                    type="text"
                    name="unit"
                    value={safeRender(formData.unit)}
                    onChange={handleInputChange}
                    style={{
                      padding: '8px 12px',
                      border: '1px solid #3b82f6',
                      borderRadius: '4px',
                      background: 'white',
                      width: '100%',
                      fontSize: '14px'
                    }}
                  />
                ) : (
                  <span style={{ fontSize: '12px', color: '#111827' }}>
                    {safeRender(formData.unit)}
                  </span>
                )}
              </div>
            </div>

            {/* Stok Bilgileri */}
            <div style={{ 
              marginBottom: '16px', 
              padding: '12px', 
              background: 'white', 
              borderRadius: '6px',
              border: '1px solid #e5e7eb'
            }}>
              <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: '600', color: '#111827', borderBottom: '1px solid #e5e7eb', paddingBottom: '6px' }}>
                Stok Bilgileri
              </h3>
              
              <div className="detail-item" style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                <span className="detail-label" style={{ fontWeight: '600', fontSize: '12px', color: '#374151', minWidth: '120px', marginRight: '8px' }}>
                  Mevcut Stok:
                </span>
                {isEditing ? (
                  <input
                    type="number"
                    name="stock"
                    value={safeRender(formData.stock, '0')}
                    onChange={handleInputChange}
                    style={{
                      padding: '8px 12px',
                      border: '1px solid #3b82f6',
                      borderRadius: '4px',
                      background: 'white',
                      width: '100%',
                      fontSize: '14px'
                    }}
                  />
                ) : (
                  <span style={{ fontSize: '12px', color: '#111827', fontWeight: '600' }}>
                    {safeRender(formData.stock, '0')} {material.unit}
                  </span>
                )}
              </div>

              <div className="detail-item" style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                <span className="detail-label" style={{ fontWeight: '600', fontSize: '12px', color: '#374151', minWidth: '120px', marginRight: '8px' }}>
                  Minimum Stok:
                </span>
                {isEditing ? (
                  <input
                    type="number"
                    name="reorderPoint"
                    value={safeRender(formData.reorderPoint, '0')}
                    onChange={handleInputChange}
                    style={{
                      padding: '8px 12px',
                      border: '1px solid #3b82f6',
                      borderRadius: '4px',
                      background: 'white',
                      width: '100%',
                      fontSize: '14px'
                    }}
                  />
                ) : (
                  <span style={{ fontSize: '12px', color: '#111827' }}>
                    {safeRender(formData.reorderPoint, '0')} {material.unit}
                  </span>
                )}
              </div>

              <div className="detail-item" style={{ display: 'flex', alignItems: 'center', marginBottom: '0' }}>
                <span className="detail-label" style={{ fontWeight: '600', fontSize: '12px', color: '#374151', minWidth: '120px', marginRight: '8px' }}>
                  Durum:
                </span>
                {isEditing ? (
                  <select
                    name="status"
                    value={safeRender(formData.status, 'Aktif')}
                    onChange={handleInputChange}
                    style={{
                      padding: '8px 12px',
                      border: '1px solid #3b82f6',
                      borderRadius: '4px',
                      background: 'white',
                      width: '100%',
                      fontSize: '14px'
                    }}
                  >
                    <option value="Aktif">Aktif</option>
                  </select>
                ) : (
                  <span style={{ fontSize: '12px', color: '#111827' }}>
                    {safeRender(formData.status, 'Aktif')}
                  </span>
                )}
              </div>
            </div>

            {/* Tedarikçiler */}
            <div style={{ 
              marginBottom: '16px', 
              padding: '12px', 
              background: 'white', 
              borderRadius: '6px',
              border: '1px solid #e5e7eb'
            }}>
              <h3 style={{ 
                fontSize: '14px', 
                fontWeight: '600', 
                marginBottom: '12px',
                color: '#374151',
                borderBottom: '1px solid #e5e7eb',
                paddingBottom: '6px'
              }}>
                Tedarikçiler
              </h3>
              
              <div style={{ 
                maxHeight: '200px',
                overflowY: 'auto',
                paddingRight: '4px'
              }}>
                {suppliersLoading ? (
                  <div style={{ textAlign: 'center', color: '#6b7280', fontSize: '11px', padding: '12px' }}>
                    🔄 Tedarikçiler yükleniyor...
                  </div>
                ) : materialSuppliers.length === 0 ? (
                  <div style={{ 
                    textAlign: 'center', 
                    padding: '16px 8px', 
                    color: '#6b7280', 
                    fontSize: '11px',
                    border: '1px dashed #e5e7eb',
                    borderRadius: '6px',
                    backgroundColor: '#f9fafb'
                  }}>
                    <div style={{ fontSize: '16px', marginBottom: '4px' }}>🏢</div>
                    <div style={{ fontWeight: '500', marginBottom: '2px' }}>Tedarikçi yok</div>
                    <div style={{ fontSize: '9px', color: '#9ca3af' }}>Bu malzemeyi tedarik eden firma bulunmuyor</div>
                  </div>
                ) : (
                  materialSuppliers.map((supplier, index) => (
                    <div 
                      key={supplier.id || index}
                      style={{
                        padding: '6px',
                        border: '1px solid #e5e7eb',
                        borderRadius: '6px',
                        marginBottom: '4px',
                        backgroundColor: '#ffffff'
                      }}
                    >
                      <div style={{ 
                        display: 'flex', 
                        justifyContent: 'space-between', 
                        alignItems: 'center',
                        gap: '8px'
                      }}>
                        <div style={{ 
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          flex: 1,
                          minWidth: 0
                        }}>
                          <div style={{ 
                            fontWeight: '600', 
                            fontSize: '11px',
                            color: '#111827',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            flex: 1
                          }}>
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
                        
                        <div style={{ 
                          display: 'flex', 
                          alignItems: 'center',
                          gap: '4px',
                          flexShrink: 0
                        }}>
                          <button
                            type="button"
                            style={{
                              background: 'none',
                              border: 'none',
                              cursor: 'pointer',
                              padding: '2px',
                              borderRadius: '3px',
                              color: '#6b7280',
                              display: 'flex',
                              alignItems: 'center'
                            }}
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
                              style={{
                                background: 'none',
                                border: 'none',
                                cursor: 'pointer',
                                padding: '2px',
                                borderRadius: '3px',
                                color: '#6b7280',
                                display: 'flex',
                                alignItems: 'center'
                              }}
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
                              style={{
                                background: 'none',
                                border: 'none',
                                cursor: 'pointer',
                                padding: '2px',
                                borderRadius: '3px',
                                color: '#6b7280',
                                display: 'flex',
                                alignItems: 'center'
                              }}
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

            {/* Lot Envanteri */}
            <div style={{ 
              marginBottom: '16px', 
              padding: '12px', 
              background: 'white', 
              borderRadius: '6px',
              border: '1px solid #e5e7eb'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <h3 style={{ margin: 0, fontSize: '14px', fontWeight: '600', color: '#111827', display: 'flex', alignItems: 'center', gap: '6px' }}>
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
                  style={{
                    padding: '4px 8px',
                    borderRadius: '4px',
                    border: '1px solid #d1d5db',
                    background: lotsLoading ? '#e5e7eb' : '#f9fafb',
                    cursor: lotsLoading ? 'not-allowed' : 'pointer',
                    fontSize: '10px',
                    fontWeight: '600',
                    color: lotsLoading ? '#9ca3af' : '#374151'
                  }}
                  disabled={!material?.id || lotsLoading}
                >
                  <RotateCw size={12} style={{ marginRight: '4px' }} />
                  {lotsLoading ? 'Yükleniyor...' : 'Yükle'}
                </button>
              </div>
              
              <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                <table style={{ width: '100%', fontSize: '11px', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #e5e7eb', background: '#f9fafb' }}>
                      <th style={{ padding: '6px 8px', textAlign: 'left', fontWeight: '600', color: '#374151' }}>Lot No</th>
                      <th style={{ padding: '6px 8px', textAlign: 'left', fontWeight: '600', color: '#374151' }}>Tedarikçi Lot</th>
                      <th style={{ padding: '6px 8px', textAlign: 'right', fontWeight: '600', color: '#374151' }}>Miktar</th>
                      <th style={{ padding: '6px 8px', textAlign: 'left', fontWeight: '600', color: '#374151' }}>Üretim</th>
                      <th style={{ padding: '6px 8px', textAlign: 'left', fontWeight: '600', color: '#374151' }}>SKT</th>
                      <th style={{ padding: '6px 8px', textAlign: 'left', fontWeight: '600', color: '#374151' }}>Durum</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lotsLoading ? (
                      <tr>
                        <td colSpan="6" style={{ padding: '12px', textAlign: 'center', color: '#6b7280' }}>
                          Lot envanteri yükleniyor...
                        </td>
                      </tr>
                    ) : lotsError ? (
                      <tr>
                        <td colSpan="6" style={{ padding: '12px', textAlign: 'center', color: '#dc2626' }}>
                          {lotsError}
                        </td>
                      </tr>
                    ) : lots && lots.length > 0 ? (
                      lots.map((lot, idx) => {
                        const mfgDate = lot.manufacturingDate ? new Date(lot.manufacturingDate).toLocaleDateString('tr-TR') : '-';
                        const expDate = lot.expiryDate ? new Date(lot.expiryDate).toLocaleDateString('tr-TR') : '-';
                        const qty = Number(lot.currentQuantity || 0);
                        const unit = material?.unit || '';
                        
                        return (
                          <tr key={lot.lotNumber || idx} style={{ borderBottom: '1px solid #f3f4f6' }}>
                            <td style={{ padding: '6px 8px', fontWeight: '600', color: '#1d4ed8' }}>{lot.lotNumber || '-'}</td>
                            <td style={{ padding: '6px 8px', color: '#111827' }}>{lot.supplierLotCode || '-'}</td>
                            <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: '600', color: '#111827' }}>
                              {!isNaN(qty) ? `${qty} ${unit}`.trim() : '-'}
                            </td>
                            <td style={{ padding: '6px 8px', color: '#111827' }}>{mfgDate}</td>
                            <td style={{ padding: '6px 8px', color: '#111827' }}>{expDate}</td>
                            <td style={{ padding: '6px 8px' }}>
                              <span style={{
                                padding: '2px 6px',
                                borderRadius: '4px',
                                fontSize: '10px',
                                fontWeight: '600',
                                background: lot.status === 'active' ? '#dcfce7' : '#f3f4f6',
                                color: lot.status === 'active' ? '#16a34a' : '#6b7280'
                              }}>
                                {lot.status === 'active' ? 'Aktif' : lot.status === 'depleted' ? 'Tükendi' : lot.status || '-'}
                              </span>
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan="6" style={{ padding: '12px', textAlign: 'center', color: '#9ca3af' }}>
                          Henüz lot kaydı bulunmuyor
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Üretim Geçmişi */}
            <div style={{ 
              marginBottom: '16px', 
              padding: '12px', 
              background: 'white', 
              borderRadius: '6px',
              border: '1px solid #e5e7eb'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <h3 style={{ margin: 0, fontSize: '14px', fontWeight: '600', color: '#111827', display: 'flex', alignItems: 'center', gap: '6px' }}>
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
                  style={{
                    padding: '4px 8px',
                    borderRadius: '4px',
                    border: '1px solid #d1d5db',
                    background: productionLoading ? '#e5e7eb' : '#f9fafb',
                    cursor: productionLoading ? 'not-allowed' : 'pointer',
                    fontSize: '10px',
                    fontWeight: '600',
                    color: productionLoading ? '#9ca3af' : '#374151'
                  }}
                  disabled={!material?.id || productionLoading}
                >
                  <RotateCw size={12} style={{ marginRight: '4px' }} />
                  {productionLoading ? 'Yükleniyor...' : 'Yükle'}
                </button>
              </div>
              
              <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                <table style={{ width: '100%', fontSize: '11px', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #e5e7eb', background: '#f9fafb' }}>
                      <th style={{ padding: '6px 8px', textAlign: 'left', fontWeight: '600', color: '#374151' }}>Tarih</th>
                      <th style={{ padding: '6px 8px', textAlign: 'left', fontWeight: '600', color: '#374151' }}>İş Emri</th>
                      <th style={{ padding: '6px 8px', textAlign: 'left', fontWeight: '600', color: '#374151' }}>Ürün</th>
                      <th style={{ padding: '6px 8px', textAlign: 'right', fontWeight: '600', color: '#374151' }}>Kullanılan</th>
                      <th style={{ padding: '6px 8px', textAlign: 'left', fontWeight: '600', color: '#374151' }}>Durum</th>
                    </tr>
                  </thead>
                  <tbody>
                    {productionLoading ? (
                      <tr>
                        <td colSpan="5" style={{ padding: '12px', textAlign: 'center', color: '#6b7280' }}>
                          Üretim geçmişi yükleniyor...
                        </td>
                      </tr>
                    ) : productionError ? (
                      <tr>
                        <td colSpan="5" style={{ padding: '12px', textAlign: 'center', color: '#dc2626' }}>
                          {productionError}
                        </td>
                      </tr>
                    ) : productionItems && productionItems.length > 0 ? (
                      productionItems.map((item, idx) => {
                        const dateStr = item.usageDate ? new Date(item.usageDate).toLocaleDateString('tr-TR') : '-';
                        const qty = Number(item.quantityUsed || 0);
                        const unit = material?.unit || '';
                        
                        return (
                          <tr key={`${item.workOrderId}-${idx}`} style={{ borderBottom: '1px solid #f3f4f6' }}>
                            <td style={{ padding: '6px 8px', color: '#111827' }}>{dateStr}</td>
                            <td style={{ padding: '6px 8px', fontWeight: '600', color: '#1d4ed8' }}>{item.workOrderCode || '-'}</td>
                            <td style={{ padding: '6px 8px', color: '#111827' }}>{item.productName || '-'}</td>
                            <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: '600', color: '#111827' }}>
                              {!isNaN(qty) ? `${qty} ${unit}`.trim() : '-'}
                            </td>
                            <td style={{ padding: '6px 8px' }}>
                              <span style={{
                                padding: '2px 6px',
                                borderRadius: '4px',
                                fontSize: '10px',
                                fontWeight: '600',
                                background: item.status === 'completed' ? '#dcfce7' : '#dbeafe',
                                color: item.status === 'completed' ? '#16a34a' : '#2563eb'
                              }}>
                                {item.status === 'completed' ? 'Tamamlandı' : item.status || '-'}
                              </span>
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan="5" style={{ padding: '12px', textAlign: 'center', color: '#9ca3af' }}>
                          Henüz üretim geçmişi bulunmuyor
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px' }}>
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
                  style={{
                    padding: '6px 10px',
                    borderRadius: '4px',
                    border: '1px solid #e5e7eb',
                    background: '#f9fafb',
                    cursor: 'pointer',
                    fontSize: '10px',
                    fontWeight: 600,
                    color: '#374151'
                  }}
                >
                  Tüm üretim geçmişini gör
                </button>
              </div>
            </div>

            {/* Tedarik Geçmişi */}
            <div style={{ 
              marginBottom: '16px', 
              padding: '12px', 
              background: 'white', 
              borderRadius: '6px',
              border: '1px solid #e5e7eb'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <h3 style={{ margin: 0, fontSize: '14px', fontWeight: '600', color: '#111827', display: 'flex', alignItems: 'center', gap: '6px' }}>
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
                  style={{
                    padding: '4px 8px',
                    borderRadius: '4px',
                    border: '1px solid #d1d5db',
                    background: procurementLoading ? '#e5e7eb' : '#f9fafb',
                    cursor: procurementLoading ? 'not-allowed' : 'pointer',
                    fontSize: '10px',
                    fontWeight: '600',
                    color: procurementLoading ? '#9ca3af' : '#374151'
                  }}
                  disabled={!material?.id || procurementLoading}
                >
                  <RotateCw size={12} style={{ marginRight: '4px' }} />
                  {procurementLoading ? 'Yükleniyor...' : 'Yükle'}
                </button>
              </div>
              
              <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                <table style={{ width: '100%', fontSize: '11px', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #e5e7eb', background: '#f9fafb' }}>
                      <th style={{ padding: '6px 8px', textAlign: 'left', fontWeight: '600', color: '#374151' }}>Tarih</th>
                      <th style={{ padding: '6px 8px', textAlign: 'left', fontWeight: '600', color: '#374151' }}>Tedarikçi</th>
                      <th style={{ padding: '6px 8px', textAlign: 'right', fontWeight: '600', color: '#374151' }}>Miktar</th>
                      <th style={{ padding: '6px 8px', textAlign: 'right', fontWeight: '600', color: '#374151' }}>Birim Fiyat</th>
                      <th style={{ padding: '6px 8px', textAlign: 'right', fontWeight: '600', color: '#374151' }}>Toplam</th>
                      <th style={{ padding: '6px 8px', textAlign: 'left', fontWeight: '600', color: '#374151' }}>Durum</th>
                    </tr>
                  </thead>
                  <tbody>
                    {procurementLoading ? (
                      <tr>
                        <td colSpan="6" style={{ padding: '12px', textAlign: 'center', color: '#6b7280' }}>
                          Tedarik geçmişi yükleniyor...
                        </td>
                      </tr>
                    ) : procurementError ? (
                      <tr>
                        <td colSpan="6" style={{ padding: '12px', textAlign: 'center', color: '#dc2626' }}>
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
                          <tr key={`${row.orderId}-${row.itemSequence}-${idx}`} style={{ borderBottom: '1px solid #f3f4f6' }}>
                            <td style={{ padding: '6px 8px', color: '#111827' }}>{dateStr}</td>
                            <td style={{ padding: '6px 8px', color: '#111827' }}>{row.supplierName || '-'}</td>
                            <td style={{ padding: '6px 8px', textAlign: 'right', color: '#111827' }}>
                              {!isNaN(qty) ? `${qty} ${unit}`.trim() : '-'}
                            </td>
                            <td style={{ padding: '6px 8px', textAlign: 'right', color: '#111827' }}>
                              {!isNaN(unitPrice) ? `${unitPrice.toLocaleString('tr-TR')} ${row.currency || 'TRY'}` : '-'}
                            </td>
                            <td style={{ padding: '6px 8px', textAlign: 'right', color: '#111827' }}>
                              {!isNaN(total) ? `${total.toLocaleString('tr-TR')} ${row.currency || 'TRY'}` : '-'}
                            </td>
                            <td style={{ padding: '6px 8px', color: '#111827' }}>{row.itemStatus || '-'}</td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan="6" style={{ padding: '12px', textAlign: 'center', color: '#9ca3af' }}>
                          Henüz tedarik geçmişi bulunmuyor
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px' }}>
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
                  style={{
                    padding: '6px 10px',
                    borderRadius: '4px',
                    border: '1px solid #e5e7eb',
                    background: '#f9fafb',
                    cursor: 'pointer',
                    fontSize: '10px',
                    fontWeight: 600,
                    color: '#374151'
                  }}
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
