import React, { useState, useEffect, useMemo } from 'react'
import StockBar from '../../../shared/components/StockBar.jsx'

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
  onOrderClick
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
    : (activeTab === 'wip' 
        ? materials.filter(material => material.type === 'wip' || material.type === 'wip_produced')
        : materials.filter(material => material.type === activeTab));

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
                ({tab.id === 'wip' 
                  ? materials.filter(m => m.type === 'wip' || m.type === 'wip_produced').length
                  : materials.filter(m => m.type === tab.id).length})
              </span>
            )}
            {tab.id === 'all' && (
              <span className="tab-count">({materials.length})</span>
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
              <th style={{ minWidth: '120px', whiteSpace: 'nowrap' }}>
                <button 
                  type="button"
                  onClick={() => handleSort('code')}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: 0,
                    font: 'inherit',
                    color: 'inherit'
                  }}
                >
                  Malzeme Kodu{getSortIcon('code')}
                </button>
              </th>
              <th style={{ minWidth: '160px', whiteSpace: 'nowrap' }}>
                <button 
                  type="button"
                  onClick={() => handleSort('name')}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: 0,
                    font: 'inherit',
                    color: 'inherit'
                  }}
                >
                  Ad{getSortIcon('name')}
                </button>
              </th>
              <th style={{ minWidth: '140px', whiteSpace: 'nowrap' }}>
                <button 
                  type="button"
                  onClick={() => handleSort('type')}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: 0,
                    font: 'inherit',
                    color: 'inherit'
                  }}
                >
                  Tip{getSortIcon('type')}
                </button>
              </th>
              <th style={{ minWidth: '160px', whiteSpace: 'nowrap' }}>
                <button 
                  type="button"
                  onClick={() => handleSort('category')}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: 0,
                    font: 'inherit',
                    color: 'inherit'
                  }}
                >
                  Kategori{getSortIcon('category')}
                </button>
                <button 
                  className="category-info-btn"
                  onClick={() => onCategoryManage && onCategoryManage()}
                  title="Kategori yönetimi"
                >
                  ℹ️
                </button>
              </th>
              <th style={{ minWidth: '120px', whiteSpace: 'nowrap' }}>
                <button 
                  type="button"
                  onClick={() => handleSort('unit')}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: 0,
                    font: 'inherit',
                    color: 'inherit'
                  }}
                >
                  Birim{getSortIcon('unit')}
                </button>
              </th>
              <th style={{ minWidth: '140px', whiteSpace: 'nowrap' }}>
                <button 
                  type="button"
                  onClick={() => handleSort('stock')}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: 0,
                    font: 'inherit',
                    color: 'inherit'
                  }}
                >
                  Stok Durumu{getSortIcon('stock')}
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {sortedMaterials.map((material) => (
              <tr 
                key={material.id || material.code} 
                className={`
                  ${material.stock <= material.reorderPoint ? 'low-stock' : ''} 
                  ${material.status === 'Kaldırıldı' ? 'removed-material' : ''}
                `.trim()}
                onClick={(e) => {
                  // Checkbox tıklamasında satır seçimini engelle
                  if (e.target.type !== 'checkbox') {
                    onMaterialSelect && onMaterialSelect(material)
                  }
                }}
                style={{ cursor: 'pointer' }}
              >
                <td style={{ textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={selectedMaterials.has(material.id)}
                    onChange={(e) => handleSelectMaterial(material.id, e.target.checked)}
                    onClick={(e) => e.stopPropagation()}
                  />
                </td>
                <td>{material.code}</td>
                <td>
                  <div className="material-name-cell">
                    {material.name}
                  </div>
                </td>
                <td>{getTypeLabel(material.type)}</td>
                <td>{getCategoryName(material.category)}</td>
                <td>{material.unit}</td>
                <td className="stock-cell">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <StockBar 
                      stock={material.stock} 
                      reorderPoint={material.reorderPoint} 
                      reserved={material.reserved || 0}
                      available={material.available || material.stock}
                    />
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onOrderClick && onOrderClick(material);
                      }}
                      style={{
                        padding: '2px',
                        border: 'medium',
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
                      🛒
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {sortedMaterials.length === 0 && (
              <tr>
                <td colSpan="5" className="no-data">
                  {activeTab === 'all' 
                    ? 'Henüz malzeme bulunmuyor.' 
                    : `Bu tipte malzeme bulunmuyor: ${tabs.find(t => t.id === activeTab)?.label}`
                  }
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}
