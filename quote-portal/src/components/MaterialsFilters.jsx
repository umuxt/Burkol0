import React, { useState, useEffect } from 'react'

export default function MaterialsFilters({ categories, types, onFilterChange }) {
  const [filters, setFilters] = useState({
    search: '',
    categories: [],
    types: [],
    status: '',
    lowStock: false
  });

  useEffect(() => {
    // Dropdown'ların dışına tıklandığında kapatma
    const handleClickOutside = (event) => {
      if (!event.target.closest('.multi-select-container')) {
        document.querySelectorAll('.multi-select-dropdown').forEach(dropdown => {
          dropdown.style.display = 'none';
        });
      }
    };

    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  const handleFilterChange = (key, value) => {
    const newFilters = { ...filters, [key]: value };
    setFilters(newFilters);
    if (onFilterChange) {
      onFilterChange(newFilters);
    }
  };

  const handleStatusToggle = () => {
    let nextStatus = '';
    if (filters.status === '') nextStatus = 'Aktif';
    else if (filters.status === 'Aktif') nextStatus = 'Pasif';
    else nextStatus = '';
    
    handleFilterChange('status', nextStatus);
  };

  const getStatusLabel = () => {
    if (filters.status === '') return 'Filtresiz';
    if (filters.status === 'Aktif') return 'Aktif';
    if (filters.status === 'Pasif') return 'Pasif';
    return 'Filtresiz';
  };

  const getStatusIcon = () => {
    if (filters.status === '') return '🔄';
    if (filters.status === 'Aktif') return '✅';
    if (filters.status === 'Pasif') return '❌';
    return '🔄';
  };

  const handleMultiSelectChange = (key, value) => {
    const currentValues = filters[key] || [];
    let newValues;
    
    if (currentValues.includes(value)) {
      // Remove if already selected
      newValues = currentValues.filter(item => item !== value);
    } else {
      // Add if not selected
      newValues = [...currentValues, value];
    }
    
    handleFilterChange(key, newValues);
  };

  const clearFilters = () => {
    const clearedFilters = {
      search: '',
      categories: [],
      types: [],
      status: '',
      lowStock: false
    };
    setFilters(clearedFilters);
    if (onFilterChange) {
      onFilterChange(clearedFilters);
    }
  };

  const hasActiveFilters = filters.search || filters.categories?.length > 0 || filters.types?.length > 0 || filters.status || filters.lowStock;

  return (
    <section className="materials-filters">
      <div className="filters-container">
        
        {/* Arama ve Hızlı Filtreler */}
        <div className="search-section">
          <div className="search-input-container">
            <input 
              type="text" 
              placeholder="Malzeme adı, kodu veya kategoriye göre ara..." 
              value={filters.search}
              onChange={(e) => handleFilterChange('search', e.target.value)}
              className="search-input"
            />
            <span className="search-icon">🔍</span>
          </div>
          
          <div className="quick-filters">
            <button 
              type="button"
              className={`quick-filter-btn ${filters.lowStock ? 'active' : ''}`}
              onClick={() => handleFilterChange('lowStock', !filters.lowStock)}
            >
              ⚠️ Düşük Stok
            </button>
            
            {hasActiveFilters && (
              <button 
                type="button"
                className="clear-filters-btn"
                onClick={clearFilters}
              >
                ✕ Filtreleri Temizle
              </button>
            )}
          </div>
        </div>

        {/* Dropdown Filtreler */}
        <div className="dropdown-filters">
          <div className="filter-group">
            <div className="multi-select-container">
              <div className="multi-select-header" onClick={() => {
                const dropdown = document.getElementById('types-dropdown');
                dropdown.style.display = dropdown.style.display === 'block' ? 'none' : 'block';
              }}>
                {filters.types?.length > 0 
                  ? `${filters.types.length} tip seçildi`
                  : 'Tip seçin...'
                }
                <span className="dropdown-arrow">▼</span>
              </div>
              <div id="types-dropdown" className="multi-select-dropdown">
                {types?.map(type => (
                  <label key={type.id} className="multi-select-option">
                    <input
                      type="checkbox"
                      checked={filters.types?.includes(type.id) || false}
                      onChange={() => handleMultiSelectChange('types', type.id)}
                    />
                    <span>{type.label}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          <div className="filter-group">
            <div className="multi-select-container">
              <div className="multi-select-header" onClick={() => {
                const dropdown = document.getElementById('categories-dropdown');
                dropdown.style.display = dropdown.style.display === 'block' ? 'none' : 'block';
              }}>
                {filters.categories?.length > 0 
                  ? `${filters.categories.length} kategori seçildi`
                  : 'Kategori seçin...'
                }
                <span className="dropdown-arrow">▼</span>
              </div>
              <div id="categories-dropdown" className="multi-select-dropdown">
                {categories?.map(category => (
                  <label key={category.id} className="multi-select-option">
                    <input
                      type="checkbox"
                      checked={filters.categories?.includes(category.label) || false}
                      onChange={() => handleMultiSelectChange('categories', category.label)}
                    />
                    <span>{category.label}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          <div className="filter-group">
            <div className="status-toggle-container">
              <div 
                className={`status-toggle-header ${filters.status ? 'active' : ''}`}
                onClick={handleStatusToggle}
              >
                <span className="status-icon">{getStatusIcon()}</span>
                <span>{getStatusLabel()}</span>
                <span className="toggle-arrow">🔄</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}