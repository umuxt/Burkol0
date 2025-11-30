import React, { useState, useEffect } from 'react'
import { Check, Trash2, RotateCw, AlertCircle } from '../../../shared/components/Icons'

export default function MaterialsFilters({ categories, types, onFilterChange, materials = [] }) {
  const [filters, setFilters] = useState({
    search: '',
    categories: [],
    types: [],
    status: 'Aktif', // Default olarak aktif materyaller gösteriliyor
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

    // Scroll olduğunda dropdown'ları kapat
    const handleScroll = () => {
      document.querySelectorAll('.multi-select-dropdown').forEach(dropdown => {
        if (dropdown.style.display === 'block') {
          dropdown.style.display = 'none';
        }
      });
    };

    document.addEventListener('click', handleClickOutside);
    window.addEventListener('scroll', handleScroll, true);
    return () => {
      document.removeEventListener('click', handleClickOutside);
      window.removeEventListener('scroll', handleScroll, true);
    };
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
    if (filters.status === '' || filters.status === 'Tümü') {
      nextStatus = 'Aktif'; // Tümü -> Aktif
    } else if (filters.status === 'Aktif') {
      nextStatus = 'Removed'; // Aktif -> Removed  
    } else if (filters.status === 'Removed') {
      nextStatus = 'Tümü'; // Removed -> Tümü
    } else {
      nextStatus = 'Aktif'; // Fallback
    }
    
    handleFilterChange('status', nextStatus);
  };

  const getStatusLabel = () => {
    if (filters.status === '' || filters.status === 'Tümü') return 'Tümü';
    if (filters.status === 'Aktif') return 'Aktif';
    if (filters.status === 'Removed') return 'Removed';
    return 'Tümü'; // Fallback
  };

  const getStatusIcon = () => {
    if (filters.status === '' || filters.status === 'Tümü') return <RotateCw size={14} />;
    if (filters.status === 'Aktif') return <Check size={14} />;
    if (filters.status === 'Removed') return <Trash2 size={14} />;
    return <RotateCw size={14} />; // Fallback
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
      status: 'Aktif', // Default olarak aktif materyaller
      lowStock: false
    };
    setFilters(clearedFilters);
    if (onFilterChange) {
      onFilterChange(clearedFilters);
    }
  };

  const hasActiveFilters = filters.search || filters.categories?.length > 0 || filters.types?.length > 0 || (filters.status && filters.status !== 'Aktif') || filters.lowStock;

  // Toggle dropdown with screen edge detection
  const toggleDropdown = (dropdownId, event) => {
    event.stopPropagation();
    const dropdown = document.getElementById(dropdownId);
    const header = event.currentTarget;
    if (dropdown) {
      const isVisible = dropdown.style.display === 'block';
      // Close all other dropdowns first
      document.querySelectorAll('.multi-select-dropdown').forEach(d => {
        d.style.display = 'none';
      });
      // Toggle this dropdown
      if (!isVisible) {
        // Position dropdown below the button
        const rect = header.getBoundingClientRect();
        dropdown.style.position = 'fixed';
        dropdown.style.top = `${rect.bottom + 6}px`;
        
        // Check if dropdown would go off right edge of screen
        const dropdownWidth = 240;
        const spaceOnRight = window.innerWidth - rect.left;
        
        if (spaceOnRight < dropdownWidth) {
          dropdown.style.left = 'auto';
          dropdown.style.right = `${window.innerWidth - rect.right}px`;
        } else {
          dropdown.style.left = `${rect.left}px`;
          dropdown.style.right = 'auto';
        }
        
        dropdown.style.display = 'block';
      } else {
        dropdown.style.display = 'none';
      }
    }
  };

  return (
    <div className="mes-filter-controls">
      {/* Search Input */}
      <input 
        type="text" 
        placeholder="Malzeme adı, kodu veya kategoriye göre ara..." 
        value={filters.search}
        onChange={(e) => handleFilterChange('search', e.target.value)}
        className="mes-filter-input is-compact"
      />
      
      {/* Tip Filter */}
      <div className="mes-filter-group">
        <div className="multi-select-container">
          <div 
            className="multi-select-header is-compact" 
            onClick={(e) => toggleDropdown('types-dropdown', e)}
          >
            <span>Tip</span>
            {filters.types?.length > 0 && (
              <span className="mes-filter-count">{filters.types.length}</span>
            )}
            <span className="mes-filter-caret">▾</span>
          </div>
          <div id="types-dropdown" className="multi-select-dropdown" className="d-none">
            <div className="mes-filter-panel-header">
              <button 
                type="button" 
                className="mes-filter-panel-button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleFilterChange('types', []);
                }}
              >
                Clear
              </button>
              <button 
                type="button" 
                className="mes-filter-panel-button"
                onClick={(e) => {
                  e.stopPropagation();
                  document.getElementById('types-dropdown').style.display = 'none';
                }}
                title="Close"
              >
                ×
              </button>
            </div>
            <div className="mes-filter-panel-content">
              {types?.map(type => {
                const count = materials.filter(m => m.type === type.id).length
                return (
                  <label key={type.id}>
                    <input
                      type="checkbox"
                      checked={filters.types?.includes(type.id) || false}
                      onChange={() => handleMultiSelectChange('types', type.id)}
                    />
                    <span className="flex-1-0">{type.label}</span>
                    <span className="text-muted-var">({count})</span>
                  </label>
                )
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Kategori Filter */}
      <div className="mes-filter-group">
        <div className="multi-select-container">
          <div 
            className="multi-select-header is-compact" 
            onClick={(e) => toggleDropdown('categories-dropdown', e)}
          >
            <span>Kategori</span>
            {filters.categories?.length > 0 && (
              <span className="mes-filter-count">{filters.categories.length}</span>
            )}
            <span className="mes-filter-caret">▾</span>
          </div>
          <div id="categories-dropdown" className="multi-select-dropdown" className="d-none">
            <div className="mes-filter-panel-header">
              <button 
                type="button" 
                className="mes-filter-panel-button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleFilterChange('categories', []);
                }}
              >
                Clear
              </button>
              <button 
                type="button" 
                className="mes-filter-panel-button"
                onClick={(e) => {
                  e.stopPropagation();
                  document.getElementById('categories-dropdown').style.display = 'none';
                }}
                title="Close"
              >
                ×
              </button>
            </div>
            <div className="mes-filter-panel-content">
              {categories?.map(category => {
                const count = materials.filter(m => m.category === category.id || m.category === category.name).length
                return (
                  <label key={category.id}>
                    <input
                      type="checkbox"
                      checked={filters.categories?.includes(category.id) || false}
                      onChange={() => handleMultiSelectChange('categories', category.id)}
                    />
                    <span className="flex-1-0">{category.name || category.label}</span>
                    <span className="text-muted-var">({count})</span>
                  </label>
                )
              })}
              {(!categories || categories.length === 0) && (
                <div className="no-options">Kategori bulunamadı</div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Status Toggle */}
      <button 
        type="button"
        className={`mes-filter-button is-compact ${
          filters.status === 'Aktif' ? 'status-aktif' : 
          filters.status === 'Removed' ? 'status-removed' : 
          'status-tumü'
        }`}
        onClick={handleStatusToggle}
      >
        {getStatusIcon()}
        <span>{getStatusLabel()}</span>
      </button>

      {/* Düşük Stok Filter */}
      <button 
        type="button"
        className={`mes-filter-button is-compact ${filters.lowStock ? 'active' : ''}`}
        onClick={() => handleFilterChange('lowStock', !filters.lowStock)}
      >
        <AlertCircle size={14} />
        <span>Düşük Stok</span>
      </button>
      
      {/* Clear Filters */}
      {hasActiveFilters && (
        <button 
          type="button"
          className="mes-filter-clear is-compact"
          onClick={clearFilters}
          title="Clear all filters"
        >
          <span>Filtreleri Temizle</span>
        </button>
      )}
    </div>
  )
}