import React, { useState } from 'react'
import StockBar from './StockBar.jsx'

export default function MaterialsTable({ materials, types, onEditMaterial, onCategoryManage }) {
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
      aValue = types.find(t => t.id === a.type)?.label || a.type;
      bValue = types.find(t => t.id === b.type)?.label || b.type;
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
            </tr>
          </thead>
          <tbody>
            {sortedMaterials.map((m, i) => (
              <tr 
                key={i} 
                className={`${m.status === 'Pasif' ? 'inactive' : ''} clickable-row`}
                onClick={() => onEditMaterial && onEditMaterial(m)}
                title="Düzenlemek için tıklayın"
              >
                <td>{m.code}</td>
                <td>{m.name}</td>
                <td>{types.find(t => t.id === m.type)?.label || m.type}</td>
                <td>{m.category}</td>
                <td>{m.unit}</td>
                <td className="stock-cell">
                  <StockBar stock={m.stock} reorderPoint={m.reorderPoint} />
                </td>
                <td>{m.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}