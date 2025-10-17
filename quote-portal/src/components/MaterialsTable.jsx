import React, { useState } from 'react'
import StockBar from './StockBar.jsx'

export default function MaterialsTable({ 
  materials, 
  types, 
  categories,
  onMaterialSelect,
  onEditMaterial, 
  onDeleteMaterial,
  onCategoryManage,
  selectedMaterials = new Set(),
  onSelectedMaterialsChange
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
    const category = categories.find(cat => cat.id === categoryId);
    return category ? category.name : categoryId;
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
                ({materials.filter(m => m.type === tab.id).length})
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
              <th style={{ whiteSpace: 'nowrap' }}>
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
                    color: sortField === 'code' ? '#007bff' : 'inherit'
                  }}
                >
                  Kod{getSortIcon('code')}
                </button>
              </th>
              <th style={{ whiteSpace: 'nowrap' }}>
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
                    color: sortField === 'name' ? '#007bff' : 'inherit'
                  }}
                >
                  Ad{getSortIcon('name')}
                </button>
              </th>
              <th style={{ whiteSpace: 'nowrap' }}>
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
                    color: sortField === 'type' ? '#007bff' : 'inherit'
                  }}
                >
                  Tip{getSortIcon('type')}
                </button>
              </th>
              <th style={{ whiteSpace: 'nowrap' }}>
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
                    color: sortField === 'category' ? '#007bff' : 'inherit'
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
              <th style={{ whiteSpace: 'nowrap' }}>
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
                    color: sortField === 'unit' ? '#007bff' : 'inherit'
                  }}
                >
                  Birim{getSortIcon('unit')}
                </button>
              </th>
              <th style={{ whiteSpace: 'nowrap' }}>
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
                    color: sortField === 'stock' ? '#007bff' : 'inherit'
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
                className={`${material.stock <= material.reorderPoint ? 'low-stock' : ''}`}
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
                    <strong>{material.name}</strong>
                  </div>
                </td>
                <td>{getTypeLabel(material.type)}</td>
                <td>{getCategoryName(material.category)}</td>
                <td>{material.unit}</td>
                <td className="stock-cell">
                  <StockBar 
                    stock={material.stock} 
                    reorderPoint={material.reorderPoint} 
                    reserved={material.reserved || 0}
                    available={material.available || material.stock}
                  />
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