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
      return <span className="sort-icon-inactive">↕</span>;
    }
    return sortDirection === 'asc' 
      ? <span className="text-xs-full">↑</span>
      : <span className="text-xs-full">↓</span>;
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
              <th className="col-w-40-center">
                <input
                  type="checkbox"
                  checked={sortedMaterials.length > 0 && selectedMaterials.size === sortedMaterials.length}
                  onChange={(e) => handleSelectAll(e.target.checked)}
                  title="Tümünü seç"
                />
              </th>
              <th className="col-w-120-nowrap-only">
                <button 
                  type="button"
                  onClick={() => handleSort('code')}
                  className="mes-sort-button"
                >
                  Malzeme Kodu<span className="mes-sort-icon">{getSortIcon('code')}</span>
                </button>
              </th>
              <th className="col-min-160">
                <button 
                  type="button"
                  onClick={() => handleSort('name')}
                  className="mes-sort-button"
                >
                  Ad<span className="mes-sort-icon">{getSortIcon('name')}</span>
                </button>
              </th>
              <th className="col-w-120-nowrap-only">
                <button 
                  type="button"
                  onClick={() => handleSort('type')}
                  className="mes-sort-button"
                >
                  Tip<span className="mes-sort-icon">{getSortIcon('type')}</span>
                </button>
              </th>
              <th className="col-min-160">
                <div className="flex-center-gap-8">
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
                    className="btn-manage-sm"
                  >
                    Manage
                  </button>
                </div>
              </th>
              <th className="col-w-90-nowrap">
                <button 
                  type="button"
                  onClick={() => handleSort('unit')}
                  className="mes-sort-button"
                >
                  Birim<span className="mes-sort-icon">{getSortIcon('unit')}</span>
                </button>
              </th>
              <th className="col-min-120-nowrap">
                <button 
                  type="button"
                  onClick={() => handleSort('stock')}
                  className="mes-sort-button"
                >
                  Stok Durumu<span className="mes-sort-icon">{getSortIcon('stock')}</span>
                </button>
              </th>
              <th className="col-w-80-center"></th>
            </tr>
          </thead>
          <tbody>
            {/* Loading state */}
            {loading && materials.length === 0 && (
              <tr>
                <td colSpan="8" className="table-state-cell">
                  <div className="table-state-container">
                    <div className="spinner"></div>
                    <p className="text-subtitle">Malzemeler yükleniyor...</p>
                  </div>
                </td>
              </tr>
            )}
            
            {/* Error state */}
            {!loading && error && materials.length === 0 && (
              <tr>
                <td colSpan="8" className="table-state-cell">
                  <div className="table-state-container error">
                    <div className="empty-state-icon">⚠️</div>
                    <h3 className="title-lg">
                      Veriler yüklenemedi
                    </h3>
                    <p className="text-sm-muted">
                      {error}
                    </p>
                    {onAddMaterial && (
                      <button 
                        className="mes-primary-action btn-add-first"
                        onClick={() => onAddMaterial()}
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
                <td className="text-center" onClick={(e) => e.stopPropagation()}>
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
                <td className="td-actions-center">
                  <button
                    className="btn-table-icon"
                    onClick={(e) => {
                      e.stopPropagation();
                      onOrderClick && onOrderClick(material);
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
                    className="btn-table-icon ml-5"
                    onClick={(e) => {
                      e.stopPropagation();
                      console.log('Shipment button clicked for material:', material.name);
                      onShipmentClick && onShipmentClick(material, e);
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
                <td colSpan="8" className="table-state-cell">
                  <div className="table-state-container">
                    <div className="empty-state-icon">📦</div>
                    <h3 className="title-lg-gray">
                      {activeTab === 'all' 
                        ? 'Henüz malzeme bulunmuyor' 
                        : `Bu tipte malzeme bulunmuyor`
                      }
                    </h3>
                    <p className="text-subtitle">
                      {activeTab === 'all' 
                        ? 'İlk malzemenizi eklemek için "Yeni Malzeme" butonunu kullanın.' 
                        : `${tabs.find(t => t.id === activeTab)?.label} tipinde henüz malzeme yok.`
                      }
                    </p>
                    {activeTab === 'all' && onAddMaterial && (
                      <button 
                        className="mes-primary-action btn-add-first"
                        onClick={() => onAddMaterial()}
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
