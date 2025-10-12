import React, { useState } from 'react'
import StockBar from './StockBar.jsx'

export default function MaterialsTable({ 
  materials, 
  types, 
  categories,
  onEditMaterial, 
  onDeleteMaterial,
  onCategoryManage 
}) {
  const [activeTab, setActiveTab] = useState('all');
  const [sortField, setSortField] = useState('');
  const [sortDirection, setSortDirection] = useState('asc');

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
              <th style={{ whiteSpace: 'nowrap' }}>
                <button 
                  type="button"
                  onClick={() => handleSort('costPrice')}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: 0,
                    font: 'inherit',
                    color: sortField === 'costPrice' ? '#007bff' : 'inherit'
                  }}
                >
                  Fiyat{getSortIcon('costPrice')}
                </button>
              </th>
              <th style={{ whiteSpace: 'nowrap' }}>
                <button 
                  type="button"
                  onClick={() => handleSort('status')}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: 0,
                    font: 'inherit',
                    color: sortField === 'status' ? '#007bff' : 'inherit'
                  }}
                >
                  Durum{getSortIcon('status')}
                </button>
              </th>
              <th style={{ width: '120px' }}>İşlemler</th>
            </tr>
          </thead>
          <tbody>
            {sortedMaterials.map((material) => (
              <tr 
                key={material.id || material.code} 
                className={`${material.status === 'Pasif' ? 'inactive' : ''} ${material.stock <= material.reorderPoint ? 'low-stock' : ''}`}
              >
                <td>{material.code}</td>
                <td>
                  <div className="material-name-cell">
                    <strong>{material.name}</strong>
                    {material.description && (
                      <small className="material-description">{material.description}</small>
                    )}
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
                <td className="price-cell">
                  <div className="price-details">
                    {material.costPrice && (
                      <span className="cost-price">
                        {new Intl.NumberFormat('tr-TR', { 
                          style: 'currency', 
                          currency: 'TRY' 
                        }).format(material.costPrice)}
                      </span>
                    )}
                    {material.sellPrice && (
                      <span className="sell-price">
                        Satış: {new Intl.NumberFormat('tr-TR', { 
                          style: 'currency', 
                          currency: 'TRY' 
                        }).format(material.sellPrice)}
                      </span>
                    )}
                    {!material.costPrice && !material.sellPrice && (
                      <span className="no-price">-</span>
                    )}
                  </div>
                </td>
                <td>
                  <span className={`status-badge ${material.status.toLowerCase()}`}>
                    {material.status}
                  </span>
                </td>
                <td className="actions-cell">
                  <button
                    type="button"
                    className="edit-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      onEditMaterial && onEditMaterial(material);
                    }}
                    title="Düzenle"
                  >
                    ✏️
                  </button>
                  {onDeleteMaterial && (
                    <button
                      type="button"
                      className="delete-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm(`"${material.name}" malzemesini silmek istediğinizden emin misiniz?`)) {
                          onDeleteMaterial(material.id);
                        }
                      }}
                      title="Sil"
                    >
                      🗑️
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {sortedMaterials.length === 0 && (
              <tr>
                <td colSpan="8" className="no-data">
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