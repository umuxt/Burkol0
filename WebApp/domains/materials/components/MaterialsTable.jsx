import React, { useState, useEffect, useMemo } from 'react'
import StockBar from '../../../shared/components/StockBar.jsx'
import { Truck } from '../../../shared/components/Icons.jsx' // Import Truck icon

export default function MaterialsTable({
  materials,
  types,
  categories,
  onMaterialSelect,
  onEditMaterial,
  onDeleteMaterial,
  onCategoryManage,
  selectedMaterials = new Set(),
  onSelectedMaterialsChange,
  onOrderClick,
  onShipmentClick,
  loading = false,
  error = null,
  onAddMaterial
}) {
  const [activeTab, setActiveTab] = useState('all');
  const [sortField, setSortField] = useState('');
  const [sortDirection, setSortDirection] = useState('asc');

  // Tümünü seç/bırak
  const handleSelectAll = (checked) => {
    if (!onSelectedMaterialsChange) return;
    
    if (checked) {
      const allIds = sortedMaterials.map(m => m.id).filter(Boolean);
      onSelectedMaterialsChange(new Set(allIds));
    } else {
      onSelectedMaterialsChange(new Set());
    }
  };

  // Tekil seçim
  const handleSelectMaterial = (materialId, checked) => {
    if (!onSelectedMaterialsChange) return;
    
    const newSelected = new Set(selectedMaterials);
    if (checked) {
      newSelected.add(materialId);
    } else {
      newSelected.delete(materialId);
    }
    onSelectedMaterialsChange(newSelected);
  };

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const getSortIcon = (field) => {
    if (sortField !== field) {
      return <span style={{ fontSize: '12px', opacity: 0.6 }}>↕</span>;
    }
    return sortDirection === 'asc' 
      ? <span style={{ fontSize: '12px', opacity: 1 }}>↑</span>
      : <span style={{ fontSize: '12px', opacity: 1 }}>↓</span>;
  };

  // Helper function to get category name
  const getCategoryName = (categoryId) => {
    // Kategori boşsa veya null ise
    if (!categoryId) return 'Kategori seçilmemiş';
    
    // Debug: categories array'ini logla
    if (!categories || categories.length === 0) {
      console.warn('⚠️ Categories array boş veya undefined!', { categories, categoryId });
      return 'Kategoriler yüklenmedi';
    }
    
    // Kategoriler listesinde ara
    const category = categories.find(cat => cat.id === categoryId);
    if (category) return category.name;
    
    // Kategori bulunamazsa - büyük ihtimalle silinmiş
    console.warn('🗑️ Kategori bulunamadı, büyük ihtimalle silinmiş:', categoryId);
    return 'Kategori artık mevcut değil';
  };

  // Helper function to get type label
  const getTypeLabel = (typeId) => {
    const type = types.find(t => t.id === typeId);
    return type ? type.label : typeId;
  };

  const tabs = [
    { id: 'all', label: 'Tümünü Göster' },
    ...types.map(type => ({
      id: type.id,
      label: type.label
    }))
  ];

  const filteredMaterials = activeTab === 'all' 
    ? materials 
    : materials.filter(material => material.type === activeTab);

  // Sıralama işlemi
  const sortedMaterials = [...filteredMaterials].sort((a, b) => {
    if (!sortField) return 0;
    
    let aValue = a[sortField];
    let bValue = b[sortField];

    // Tip alanı için özel işlem
    if (sortField === 'type') {
      aValue = getTypeLabel(a.type);
      bValue = getTypeLabel(b.type);
    }

    // Kategori alanı için özel işlem  
    if (sortField === 'category') {
      aValue = getCategoryName(a.category);
      bValue = getCategoryName(b.category);
    }

    // Stok alanı için sayısal karşılaştırma
    if (sortField === 'stock' || sortField === 'reorderPoint') {
      aValue = Number(aValue);
      bValue = Number(bValue);
    }

    if (typeof aValue === 'string') {
      aValue = aValue.toLowerCase();
      bValue = bValue.toLowerCase();
    }

    if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
    if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
    return 0;
  });

  return (
    <section className="materials-table">
      <div className="materials-tabs">
        {tabs.map(tab => (
          <button
            key={tab.id}
            className={`tab-button ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
            {tab.id !== 'all' && (
              <span className="tab-count">
                {materials.filter(m => m.type === tab.id).length}
              </span>
            )}
            {tab.id === 'all' && (
              <span className="tab-count">{materials.length}</span>
            )}
          </button>
        ))}
      </div>
      
      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th style={{ width: '40px', textAlign: 'center' }}>
                <input
                  type="checkbox"
                  checked={sortedMaterials.length > 0 && selectedMaterials.size === sortedMaterials.length}
                  onChange={(e) => handleSelectAll(e.target.checked)}
                  title="Tümünü seç"
                />
              </th>
              <th style={{ width: '120px', whiteSpace: 'nowrap' }}>
                <button 
                  type="button"
                  onClick={() => handleSort('code')}
                  className="mes-sort-button"
                >
                  Malzeme Kodu<span className="mes-sort-icon">{getSortIcon('code')}</span>
                </button>
              </th>
              <th style={{ minWidth: '160px', whiteSpace: 'nowrap' }}>
                <button 
                  type="button"
                  onClick={() => handleSort('name')}
                  className="mes-sort-button"
                >
                  Ad<span className="mes-sort-icon">{getSortIcon('name')}</span>
                </button>
              </th>
              <th style={{ width: '120px', whiteSpace: 'nowrap' }}>
                <button 
                  type="button"
                  onClick={() => handleSort('type')}
                  className="mes-sort-button"
                >
                  Tip<span className="mes-sort-icon">{getSortIcon('type')}</span>
                </button>
              </th>
              <th style={{ minWidth: '160px', whiteSpace: 'nowrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <button 
                    type="button"
                    onClick={() => handleSort('category')}
                    className="mes-sort-button"
                  >
                    Kategori<span className="mes-sort-icon">{getSortIcon('category')}</span>
                  </button>
                  <button 
                    type="button"
                    onClick={() => onCategoryManage && onCategoryManage()}
                    title="Kategori yönetimi"
                    style={{
                      padding: '0px 3px',
                      border: '1px solid var(--border)',
                      background: 'white',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '12px'
                    }}
                  >
                    Manage
                  </button>
                </div>
              </th>
              <th style={{ width: '90px', whiteSpace: 'nowrap' }}>
                <button 
                  type="button"
                  onClick={() => handleSort('unit')}
                  className="mes-sort-button"
                >
                  Birim<span className="mes-sort-icon">{getSortIcon('unit')}</span>
                </button>
              </th>
              <th style={{ minWidth: '120px', whiteSpace: 'nowrap' }}>
                <button 
                  type="button"
                  onClick={() => handleSort('stock')}
                  className="mes-sort-button"
                >
                  Stok Durumu<span className="mes-sort-icon">{getSortIcon('stock')}</span>
                </button>
              </th>
              <th style={{ minWidth: '80px', textAlign: 'center' }}></th>
            </tr>
          </thead>
          <tbody>
            {/* Loading state */}
            {loading && materials.length === 0 && (
              <tr>
                <td colSpan="8" style={{ 
                  textAlign: 'center', 
                  padding: '40px 20px',
                  color: '#6b7280'
                }}>
                  <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '12px'
                  }}>
                    <div className="spinner"></div>
                    <p style={{ margin: 0, fontSize: '14px' }}>Malzemeler yükleniyor...</p>
                  </div>
                </td>
              </tr>
            )}
            
            {/* Error state */}
            {!loading && error && materials.length === 0 && (
              <tr>
                <td colSpan="8" style={{ 
                  textAlign: 'center', 
                  padding: '40px 20px'
                }}>
                  <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '12px',
                    color: '#dc2626'
                  }}>
                    <div style={{ fontSize: '48px', opacity: 0.5 }}>⚠️</div>
                    <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '600' }}>
                      Veriler yüklenemedi
                    </h3>
                    <p style={{ margin: 0, fontSize: '14px', color: '#6b7280' }}>
                      {error}
                    </p>
                    {onAddMaterial && (
                      <button 
                        className="mes-primary-action"
                        onClick={() => onAddMaterial()}
                        style={{
                          marginTop: '8px',
                          padding: '8px 16px',
                          fontSize: '14px'
                        }}
                      >
                        Yine de Yeni Malzeme Ekle
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            )}
            
            {/* Data rows */}
            {!loading && !error && sortedMaterials.map((material) => (
              <tr 
                key={material.id || material.code} 
                className={`mes-table-row ${material.stock <= material.reorderPoint ? 'low-stock' : ''} ${material.status === 'Kaldırıldı' ? 'removed-material' : ''}`.trim()}
                onClick={(e) => {
                  // Checkbox tıklamasında satır seçimini engelle
                  if (e.target.type !== 'checkbox') {
                    onMaterialSelect && onMaterialSelect(material)
                  }
                }}
              >
                <td style={{ textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={selectedMaterials.has(material.id)}
                    onChange={(e) => handleSelectMaterial(material.id, e.target.checked)}
                    onClick={(e) => e.stopPropagation()}
                  />
                </td>
                <td>
                  <span className="mes-code-text">{material.code}</span>
                </td>
                <td>
                  {material.name}
                </td>
                <td>{getTypeLabel(material.type)}</td>
                <td>
                  <span className="mes-tag">{getCategoryName(material.category)}</span>
                </td>
                <td>{material.unit}</td>
                <td className="stock-cell">
                  <StockBar 
                    stock={material.stock} 
                    reorderPoint={material.reorderPoint} 
                    reserved={material.reserved || 0}
                    available={material.available || material.stock}
                  />
                </td>
                <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onOrderClick && onOrderClick(material);
                    }}
                    style={{
                      padding: '2px',
                      border: 'none',
                      borderRadius: '3px',
                      background: 'transparent',
                      color: '#374151',
                      fontSize: '10px',
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: '16px',
                      height: '16px',
                      lineHeight: 1,
                      transition: 'all 0.2s ease',
                      flexShrink: 0
                    }}
                    onMouseEnter={(e) => {
                      e.target.style.transform = 'scale(1.1)';
                      e.target.style.background = '#f3f4f6';
                    }}
                    onMouseLeave={(e) => {
                      e.target.style.transform = 'scale(1)';
                      e.target.style.background = 'transparent';
                    }}
                    title={`${material.name} için sipariş ver`}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="8" cy="21" r="1"></circle>
                      <circle cx="19" cy="21" r="1"></circle>
                      <path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"></path>
                    </svg>
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      console.log('Shipment button clicked for material:', material.name);
                      onShipmentClick && onShipmentClick(material, e);
                    }}
                    style={{
                      padding: '2px',
                      border: 'none',
                      borderRadius: '3px',
                      background: 'transparent',
                      color: '#374151',
                      fontSize: '10px',
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: '16px',
                      height: '16px',
                      lineHeight: 1,
                      transition: 'all 0.2s ease',
                      flexShrink: 0,
                      marginLeft: '5px' // Add some spacing
                    }}
                    onMouseEnter={(e) => {
                      e.target.style.transform = 'scale(1.1)';
                      e.target.style.background = '#f3f4f6';
                    }}
                    onMouseLeave={(e) => {
                      e.target.style.transform = 'scale(1)';
                      e.target.style.background = 'transparent';
                    }}
                    title={`${material.name} için sevkiyat oluştur`}
                  >
                    <Truck size={14} />
                  </button>
                </td>
              </tr>
            ))}
            
            {/* Empty state */}
            {!loading && !error && sortedMaterials.length === 0 && (
              <tr>
                <td colSpan="8" style={{ 
                  textAlign: 'center', 
                  padding: '40px 20px'
                }}>
                  <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '12px',
                    color: '#6b7280'
                  }}>
                    <div style={{ fontSize: '48px', opacity: 0.5 }}>📦</div>
                    <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '600', color: '#374151' }}>
                      {activeTab === 'all' 
                        ? 'Henüz malzeme bulunmuyor' 
                        : `Bu tipte malzeme bulunmuyor`
                      }
                    </h3>
                    <p style={{ margin: 0, fontSize: '14px' }}>
                      {activeTab === 'all' 
                        ? 'İlk malzemenizi eklemek için "Yeni Malzeme" butonunu kullanın.' 
                        : `${tabs.find(t => t.id === activeTab)?.label} tipinde henüz malzeme yok.`
                      }
                    </p>
                    {activeTab === 'all' && onAddMaterial && (
                      <button 
                        className="mes-primary-action"
                        onClick={() => onAddMaterial()}
                        style={{
                          marginTop: '8px',
                          padding: '8px 16px',
                          fontSize: '14px'
                        }}
                      >
                        + İlk Malzemeyi Ekle
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}
