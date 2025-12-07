/**
 * FilterPopup - Dinamik Filtre Modalı (QT-6)
 * 
 * Tek panel yaklaşımı ile tüm filtre kategorilerini accordion/section formatında gösterir.
 * formConfig'den showInFilter: true olan alanları dinamik olarak render eder.
 * 
 * Desteklenen Filtre Tipleri:
 * - multiselect (select/radio): Checkbox listesi
 * - range (number): Min-Max input
 * - dateRange (date): Tarih aralığı picker
 * - contains (text/textarea): Arama input
 * - boolean (checkbox): Evet/Hayır/Tümü toggle
 */

import React from 'react';
import { X, Filter, ChevronDown, ChevronRight, RotateCcw, Check, Calendar, Hash, Type, ToggleLeft } from 'lucide-react';
import { clearSpecificFilter } from '../../../domains/crm/utils/filter-utils.js';

export function FilterPopup({ 
  filters, 
  filterOptions, 
  onFilterChange, 
  onClose, 
  onClearAll,
  formConfig 
}) {
  const [expandedSections, setExpandedSections] = React.useState(['status']);
  
  // Section'ı aç/kapa
  function toggleSection(sectionId) {
    setExpandedSections(prev => {
      if (prev.includes(sectionId)) {
        return prev.filter(id => id !== sectionId);
      }
      return [...prev, sectionId];
    });
  }
  
  // Filtre kategorileri için aktif sayı hesapla
  function getActiveCount(category) {
    const value = filters[category];
    if (!value) return 0;
    if (Array.isArray(value)) return value.length;
    if (typeof value === 'object') {
      if (value.from || value.to) return 1;
      if (value.min || value.max) return 1;
    }
    if (typeof value === 'string' && value !== '' && value !== 'all') return 1;
    return 0;
  }
  
  // Checkbox değişikliği
  function handleCheckboxChange(category, optionCode, checked) {
    if (checked) {
      onFilterChange(category, optionCode, 'add');
    } else {
      onFilterChange(category, optionCode, 'remove');
    }
  }
  
  // Range/dateRange değişikliği
  function handleRangeChange(category, field, value) {
    const currentRange = filters[category] || {};
    const newRange = { ...currentRange, [field]: value };
    onFilterChange(category, newRange, 'set');
  }
  
  // Contains (text) değişikliği
  function handleContainsChange(category, value) {
    onFilterChange(category, value, 'set');
  }
  
  // Boolean değişikliği
  function handleBooleanChange(category, value) {
    onFilterChange(category, value, 'set');
  }
  
  // Kategori temizle
  function handleClearCategory(category, filterType) {
    clearSpecificFilter(
      (fn) => { 
        // setFilters wrapper
        const newFilters = fn(filters);
        onFilterChange(category, newFilters[category], 'set');
      }, 
      category, 
      filterType
    );
  }
  
  // Tümünü seç/kaldır (multiselect için)
  function handleSelectAll(category, values, isAllSelected) {
    if (isAllSelected) {
      onFilterChange(category, [], 'set');
    } else {
      // values array of {code, label} veya string[]
      const codes = values.map(v => typeof v === 'object' ? v.code : v);
      onFilterChange(category, codes, 'set');
    }
  }
  
  // Filtre seçeneklerini sırala (status önce, sonra order'a göre)
  function getSortedFilterOptions() {
    if (!filterOptions) return [];
    
    return Object.entries(filterOptions)
      .sort(([, a], [, b]) => {
        // Status her zaman en üstte
        if (a.isFixed && a.id === 'status') return -1;
        if (b.isFixed && b.id === 'status') return 1;
        return (a.order || 999) - (b.order || 999);
      });
  }
  
  // ========== RENDER FUNCTIONS ==========
  
  // Multiselect filtresi render
  function renderMultiselectFilter(option) {
    const { id, label, values } = option;
    const selectedValues = filters[id] || [];
    const isAllSelected = values && values.length > 0 && selectedValues.length === values.length;
    
    if (!values || values.length === 0) {
      return React.createElement('p', { 
        key: 'empty',
        style: { color: '#9ca3af', fontStyle: 'italic', fontSize: '13px', margin: '8px 0' } 
      }, 'Filtre seçeneği bulunmuyor');
    }
    
    return React.createElement('div', { key: id },
      // Tümünü seç/kaldır butonu
      React.createElement('div', { style: { marginBottom: '10px' } },
        React.createElement('button', {
          onClick: () => handleSelectAll(id, values, isAllSelected),
          style: {
            padding: '4px 10px',
            backgroundColor: isAllSelected ? '#ef4444' : '#3b82f6',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '11px',
            fontWeight: '500'
          }
        }, isAllSelected ? 'Tümünü Kaldır' : 'Tümünü Seç')
      ),
      // Checkbox listesi
      React.createElement('div', { 
        style: { 
          maxHeight: '180px', 
          overflowY: 'auto',
          border: '1px solid #e5e7eb',
          borderRadius: '6px',
          padding: '4px'
        } 
      },
        values.map((item, idx) => {
          const code = typeof item === 'object' ? item.code : item;
          const itemLabel = typeof item === 'object' ? item.label : item;
          const isChecked = selectedValues.includes(code);
          
          return React.createElement('label', {
            key: code || idx,
            style: {
              display: 'flex',
              alignItems: 'center',
              padding: '6px 8px',
              cursor: 'pointer',
              borderRadius: '4px',
              backgroundColor: isChecked ? '#eff6ff' : 'transparent',
              transition: 'background-color 0.15s'
            }
          },
            React.createElement('input', {
              type: 'checkbox',
              checked: isChecked,
              onChange: (e) => handleCheckboxChange(id, code, e.target.checked),
              style: { marginRight: '8px', accentColor: '#3b82f6' }
            }),
            React.createElement('span', { 
              style: { fontSize: '13px', color: isChecked ? '#1d4ed8' : '#374151' }
            }, itemLabel || 'Belirtilmemiş')
          );
        })
      )
    );
  }
  
  // Range (number) filtresi render
  function renderRangeFilter(option) {
    const { id, label, minValue, maxValue } = option;
    const range = filters[id] || { min: '', max: '' };
    
    return React.createElement('div', { 
      key: id,
      style: { display: 'flex', gap: '12px', alignItems: 'center' }
    },
      React.createElement('div', { style: { flex: 1 } },
        React.createElement('label', { 
          style: { display: 'block', fontSize: '11px', color: '#6b7280', marginBottom: '4px' }
        }, 'Min'),
        React.createElement('input', {
          type: 'number',
          placeholder: minValue !== undefined ? `Min: ${minValue}` : 'Min',
          value: range.min || '',
          onChange: (e) => handleRangeChange(id, 'min', e.target.value),
          style: {
            width: '100%',
            padding: '8px 10px',
            borderRadius: '6px',
            border: '1px solid #d1d5db',
            fontSize: '13px'
          }
        })
      ),
      React.createElement('span', { 
        style: { color: '#9ca3af', marginTop: '20px' }
      }, '—'),
      React.createElement('div', { style: { flex: 1 } },
        React.createElement('label', { 
          style: { display: 'block', fontSize: '11px', color: '#6b7280', marginBottom: '4px' }
        }, 'Max'),
        React.createElement('input', {
          type: 'number',
          placeholder: maxValue !== undefined ? `Max: ${maxValue}` : 'Max',
          value: range.max || '',
          onChange: (e) => handleRangeChange(id, 'max', e.target.value),
          style: {
            width: '100%',
            padding: '8px 10px',
            borderRadius: '6px',
            border: '1px solid #d1d5db',
            fontSize: '13px'
          }
        })
      )
    );
  }
  
  // DateRange filtresi render
  function renderDateRangeFilter(option) {
    const { id, label } = option;
    const range = filters[id] || { from: '', to: '' };
    
    return React.createElement('div', { 
      key: id,
      style: { display: 'flex', gap: '12px', alignItems: 'center' }
    },
      React.createElement('div', { style: { flex: 1 } },
        React.createElement('label', { 
          style: { display: 'block', fontSize: '11px', color: '#6b7280', marginBottom: '4px' }
        }, 'Başlangıç'),
        React.createElement('input', {
          type: 'date',
          value: range.from || '',
          onChange: (e) => handleRangeChange(id, 'from', e.target.value),
          style: {
            width: '100%',
            padding: '8px 10px',
            borderRadius: '6px',
            border: '1px solid #d1d5db',
            fontSize: '13px'
          }
        })
      ),
      React.createElement('span', { 
        style: { color: '#9ca3af', marginTop: '20px' }
      }, '—'),
      React.createElement('div', { style: { flex: 1 } },
        React.createElement('label', { 
          style: { display: 'block', fontSize: '11px', color: '#6b7280', marginBottom: '4px' }
        }, 'Bitiş'),
        React.createElement('input', {
          type: 'date',
          value: range.to || '',
          onChange: (e) => handleRangeChange(id, 'to', e.target.value),
          style: {
            width: '100%',
            padding: '8px 10px',
            borderRadius: '6px',
            border: '1px solid #d1d5db',
            fontSize: '13px'
          }
        })
      )
    );
  }
  
  // Contains (text search) filtresi render
  function renderContainsFilter(option) {
    const { id, label } = option;
    const value = filters[id] || '';
    
    return React.createElement('div', { key: id },
      React.createElement('input', {
        type: 'text',
        placeholder: `${label} içinde ara...`,
        value: value,
        onChange: (e) => handleContainsChange(id, e.target.value),
        style: {
          width: '100%',
          padding: '8px 10px',
          borderRadius: '6px',
          border: '1px solid #d1d5db',
          fontSize: '13px'
        }
      })
    );
  }
  
  // Boolean filtresi render
  function renderBooleanFilter(option) {
    const { id, label } = option;
    const value = filters[id] || 'all';
    
    const options = [
      { value: 'all', label: 'Tümü' },
      { value: 'yes', label: 'Evet' },
      { value: 'no', label: 'Hayır' }
    ];
    
    return React.createElement('div', { 
      key: id,
      style: { display: 'flex', gap: '8px' }
    },
      options.map(opt => 
        React.createElement('button', {
          key: opt.value,
          onClick: () => handleBooleanChange(id, opt.value),
          style: {
            flex: 1,
            padding: '8px 12px',
            backgroundColor: value === opt.value ? '#3b82f6' : '#f3f4f6',
            color: value === opt.value ? 'white' : '#374151',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '13px',
            fontWeight: value === opt.value ? '500' : '400',
            transition: 'all 0.15s'
          }
        }, opt.label)
      )
    );
  }
  
  // Section render
  function renderFilterSection(optionKey, option) {
    const { id, label, filterType } = option;
    const isExpanded = expandedSections.includes(id);
    const activeCount = getActiveCount(id);
    
    // Icon seçimi
    let Icon = Filter;
    if (filterType === 'dateRange') Icon = Calendar;
    else if (filterType === 'range') Icon = Hash;
    else if (filterType === 'contains') Icon = Type;
    else if (filterType === 'boolean') Icon = ToggleLeft;
    
    return React.createElement('div', {
      key: id,
      style: {
        border: '1px solid #e5e7eb',
        borderRadius: '8px',
        marginBottom: '10px',
        overflow: 'hidden',
        backgroundColor: '#fff'
      }
    },
      // Header
      React.createElement('div', {
        onClick: () => toggleSection(id),
        style: {
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 14px',
          backgroundColor: isExpanded ? '#f9fafb' : '#fff',
          cursor: 'pointer',
          transition: 'background-color 0.15s'
        }
      },
        React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '10px' } },
          React.createElement(Icon, { size: 16, color: '#6b7280' }),
          React.createElement('span', { 
            style: { fontWeight: '500', fontSize: '14px', color: '#374151' }
          }, label),
          activeCount > 0 && React.createElement('span', {
            style: {
              backgroundColor: '#3b82f6',
              color: 'white',
              fontSize: '11px',
              padding: '2px 6px',
              borderRadius: '10px',
              fontWeight: '600'
            }
          }, activeCount)
        ),
        React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
          activeCount > 0 && React.createElement('button', {
            onClick: (e) => {
              e.stopPropagation();
              handleClearCategory(id, filterType);
            },
            style: {
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '4px',
              display: 'flex',
              alignItems: 'center',
              color: '#9ca3af'
            },
            title: 'Temizle'
          }, React.createElement(RotateCcw, { size: 14 })),
          React.createElement(isExpanded ? ChevronDown : ChevronRight, { size: 18, color: '#9ca3af' })
        )
      ),
      // Content
      isExpanded && React.createElement('div', {
        style: { padding: '12px 14px', borderTop: '1px solid #e5e7eb' }
      },
        filterType === 'multiselect' && renderMultiselectFilter(option),
        filterType === 'range' && renderRangeFilter(option),
        filterType === 'dateRange' && renderDateRangeFilter(option),
        filterType === 'contains' && renderContainsFilter(option),
        filterType === 'boolean' && renderBooleanFilter(option)
      )
    );
  }
  
  // ========== MAIN RENDER ==========
  
  const sortedOptions = getSortedFilterOptions();
  const totalActiveFilters = Object.keys(filters).reduce((sum, key) => sum + getActiveCount(key), 0);
  
  return React.createElement('div', { 
    className: 'filter-popup-overlay',
    onClick: onClose,
    style: {
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.4)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      backdropFilter: 'blur(2px)'
    }
  },
    React.createElement('div', {
      className: 'filter-popup-content',
      onClick: (e) => e.stopPropagation(),
      style: { 
        backgroundColor: 'white',
        borderRadius: '12px',
        maxWidth: '480px',
        width: '95%',
        maxHeight: '85vh',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
      }
    },
      // Header
      React.createElement('div', {
        style: {
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '16px 20px',
          borderBottom: '1px solid #e5e7eb'
        }
      },
        React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '10px' } },
          React.createElement(Filter, { size: 20, color: '#3b82f6' }),
          React.createElement('h3', { style: { margin: 0, fontSize: '16px', fontWeight: '600', color: '#111827' } }, 
            'Filtreler'
          ),
          totalActiveFilters > 0 && React.createElement('span', {
            style: {
              backgroundColor: '#3b82f6',
              color: 'white',
              fontSize: '12px',
              padding: '2px 8px',
              borderRadius: '12px',
              fontWeight: '600'
            }
          }, totalActiveFilters)
        ),
        React.createElement('button', {
          onClick: onClose,
          style: {
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: '4px',
            display: 'flex',
            alignItems: 'center',
            color: '#6b7280'
          }
        }, React.createElement(X, { size: 20 }))
      ),
      
      // Body - Scrollable
      React.createElement('div', {
        style: {
          flex: 1,
          overflowY: 'auto',
          padding: '16px 20px'
        }
      },
        sortedOptions.length === 0 
          ? React.createElement('p', { 
              style: { color: '#9ca3af', textAlign: 'center', margin: '20px 0' }
            }, 'Filtre seçeneği bulunmuyor')
          : sortedOptions.map(([key, option]) => renderFilterSection(key, option))
      ),
      
      // Footer
      React.createElement('div', {
        style: {
          display: 'flex',
          justifyContent: 'space-between',
          padding: '12px 20px',
          borderTop: '1px solid #e5e7eb',
          backgroundColor: '#f9fafb',
          borderRadius: '0 0 12px 12px'
        }
      },
        React.createElement('button', {
          onClick: onClearAll,
          disabled: totalActiveFilters === 0,
          style: {
            padding: '8px 16px',
            backgroundColor: totalActiveFilters > 0 ? '#fee2e2' : '#f3f4f6',
            color: totalActiveFilters > 0 ? '#dc2626' : '#9ca3af',
            border: 'none',
            borderRadius: '6px',
            cursor: totalActiveFilters > 0 ? 'pointer' : 'default',
            fontSize: '13px',
            fontWeight: '500',
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }
        }, 
          React.createElement(RotateCcw, { size: 14 }),
          'Tümünü Temizle'
        ),
        React.createElement('button', {
          onClick: onClose,
          style: {
            padding: '8px 20px',
            backgroundColor: '#3b82f6',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '13px',
            fontWeight: '500',
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }
        }, 
          React.createElement(Check, { size: 14 }),
          'Uygula'
        )
      )
    )
  );
}

export default FilterPopup;
