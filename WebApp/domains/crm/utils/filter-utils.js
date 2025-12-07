/**
 * Quotes Filter Utils - Dinamik Filtreleme Sistemi (QT-6)
 * 
 * Bu modül formConfig'den showInFilter: true olan alanları dinamik olarak 
 * filtre seçeneklerine dönüştürür ve quotes listesine uygular.
 * 
 * Desteklenen Filtre Tipleri:
 * - select/radio: Multi-select checkbox listesi
 * - number: Min-Max aralık
 * - text/textarea: Contains araması
 * - date: Tarih aralığı
 * - checkbox: Boolean toggle (Evet/Hayır/Tümü)
 */

// Not: Bu utility fonksiyonlardır, hook kullanmaz.
// Memoization ihtiyacı varsa component içinde useMemo ile sarılmalı.

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * formConfig'den fields array'ini çıkarır (farklı formatları destekler)
 */
function getFieldsFromConfig(formConfig) {
  if (!formConfig) return [];
  
  // Yeni format: formConfig.formStructure.fields
  if (formConfig.formStructure?.fields) {
    return formConfig.formStructure.fields;
  }
  
  // Alternatif format: formConfig.fields
  if (formConfig.fields) {
    return formConfig.fields;
  }
  
  // Eski format: formConfig.steps[].fields[]
  if (formConfig.steps) {
    return formConfig.steps.flatMap(step => step.fields || []);
  }
  
  return [];
}

/**
 * Field'ın showInFilter durumunu kontrol eder (hem nested hem direct property)
 */
function isFilterableField(field) {
  // Direct property: field.showInFilter
  if (field.showInFilter === true) return true;
  
  // Nested property: field.display.showInFilter
  if (field.display?.showInFilter === true) return true;
  
  // Eski format: field.filterable
  if (field.filterable === true) return true;
  
  return false;
}

/**
 * Field'ın filterOrder değerini alır
 */
function getFilterOrder(field) {
  return field.display?.filterOrder ?? field.filterOrder ?? 999;
}

/**
 * Option code'u label'a çevirir (FFOC lookup)
 */
function getOptionLabel(optionCode, field) {
  if (!optionCode || !field?.options) return optionCode;
  
  const option = field.options.find(opt => 
    opt.optionCode === optionCode || 
    opt.id === optionCode ||
    opt.value === optionCode
  );
  
  return option?.optionLabel || option?.label || optionCode;
}

/**
 * Filtre field type'ına göre filtre tipi belirler
 */
function getFilterType(fieldType) {
  const typeMap = {
    'select': 'multiselect',
    'radio': 'multiselect', 
    'multiselect': 'multiselect',
    'number': 'range',
    'date': 'dateRange',
    'text': 'contains',
    'textarea': 'contains',
    'checkbox': 'boolean',
    'email': 'contains',
    'phone': 'contains'
  };
  return typeMap[fieldType] || 'multiselect';
}

// ============================================================================
// MAIN EXPORTS
// ============================================================================

/**
 * Filtre seçeneklerini formConfig ve quotes listesinden oluşturur
 * @param {Array} list - Quotes listesi
 * @param {Object} formConfig - Form template configuration
 * @returns {Object} Filter options object
 */
export function getFilterOptions(list, formConfig) {
  // Sabit filtreler (her zaman mevcut)
  const options = {
      // Status her zaman gösterilir
      status: {
        id: 'status',
        label: 'Durum',
        type: 'multiselect',
        filterType: 'multiselect',
        isFixed: true,
        order: -1,
        values: [...new Set(list.map(q => q.status).filter(Boolean))]
      }
    };
    
    // Dinamik filtreler - formConfig'den showInFilter: true olanlar
    const fields = getFieldsFromConfig(formConfig);
    
    fields
      .filter(isFilterableField)
      .sort((a, b) => getFilterOrder(a) - getFilterOrder(b))
      .forEach(field => {
        const fieldId = field.fieldCode || field.id;
        const fieldType = field.fieldType || field.type;
        const filterType = getFilterType(fieldType);
        
        const filterDef = {
          id: fieldId,
          label: field.fieldName || field.label || fieldId,
          type: fieldType,
          filterType: filterType,
          isFixed: false,
          order: getFilterOrder(field),
          field: field // Original field reference for option lookup
        };
        
        // select/radio için field'ın tanımlı options'larını kullan
        // Alternatif A: Form'da tanımlı TÜM seçenekleri göster (eski versiyonlardan kalanlar gözükmez)
        if (filterType === 'multiselect') {
          // Field'da tanımlı options varsa, hepsini göster
          if (field.options && Array.isArray(field.options) && field.options.length > 0) {
            filterDef.values = field.options.map(opt => ({
              code: opt.optionCode || opt.id || opt.value,
              label: opt.optionLabel || opt.label || opt.optionCode || opt.id
            }));
          } else {
            // Options tanımlanmamış, quote'lardaki unique değerleri kullan (fallback)
            const usedCodes = new Set();
            list.forEach(quote => {
              const value = quote.formData?.[fieldId];
              if (value) usedCodes.add(value);
            });
            filterDef.values = [...usedCodes].map(code => ({
              code: code,
              label: code
            }));
          }
        }
        
        // number için min/max değerlerini hesapla (opsiyonel - UI'da gösterilebilir)
        if (filterType === 'range') {
          const numValues = list
            .map(q => parseFloat(q.formData?.[fieldId]))
            .filter(v => !isNaN(v));
          
          if (numValues.length > 0) {
            filterDef.minValue = Math.min(...numValues);
            filterDef.maxValue = Math.max(...numValues);
          }
        }
        
        options[fieldId] = filterDef;
      });
    
  return options;
}

/**
 * Filtrelenmiş quote listesini oluşturur
 * @param {Array} list - Tüm quotes listesi  
 * @param {Object} filters - Aktif filtreler
 * @param {string} globalSearch - Genel arama terimi
 * @param {Object} formConfig - Form template configuration
 * @returns {Array} Filtrelenmiş liste
 */
export function createFilteredList(list, filters, globalSearch, formConfig) {
  const fields = getFieldsFromConfig(formConfig);
  
  return list.filter(quote => {
      
      // ========== GLOBAL SEARCH ==========
      if (globalSearch?.trim()) {
        const searchTerm = globalSearch.toLowerCase();
        
        // Sabit alanlar
        const fixedFields = [
          quote.customerCompany,
          quote.projectName,
          quote.customerName,
          quote.customerEmail,
          quote.customerPhone,
          quote.status,
          quote.id
        ];
        
        // formData alanları
        const formDataValues = quote.formData ? Object.values(quote.formData) : [];
        
        // Tüm aranabilir metinler
        const allText = [...fixedFields, ...formDataValues]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        
        if (!allText.includes(searchTerm)) {
          return false;
        }
      }
      
      // ========== STATUS FİLTRE (SABİT) ==========
      if (filters.status?.length > 0) {
        if (!filters.status.includes(quote.status)) {
          return false;
        }
      }
      
      // ========== DİNAMİK FİLTRELER ==========
      // formConfig'den gelen showInFilter alanlarını kontrol et
      for (const field of fields.filter(isFilterableField)) {
        const fieldId = field.fieldCode || field.id;
        const fieldType = field.fieldType || field.type;
        const filterValue = filters[fieldId];
        
        // Bu alan için filtre yok
        if (filterValue === undefined || filterValue === null) continue;
        
        // Boş array veya boş string ise skip
        if (Array.isArray(filterValue) && filterValue.length === 0) continue;
        if (filterValue === '') continue;
        
        const quoteValue = quote.formData?.[fieldId];
        
        // ---- MULTISELECT (select, radio) ----
        if (getFilterType(fieldType) === 'multiselect') {
          if (Array.isArray(filterValue) && filterValue.length > 0) {
            // filterValue option code'larını içerir
            if (!filterValue.includes(quoteValue)) {
              return false;
            }
          }
        }
        
        // ---- RANGE (number) ----
        else if (getFilterType(fieldType) === 'range') {
          if (typeof filterValue === 'object') {
            const numValue = parseFloat(quoteValue) || 0;
            
            if (filterValue.min !== undefined && filterValue.min !== '' && filterValue.min !== null) {
              if (numValue < parseFloat(filterValue.min)) return false;
            }
            if (filterValue.max !== undefined && filterValue.max !== '' && filterValue.max !== null) {
              if (numValue > parseFloat(filterValue.max)) return false;
            }
          }
        }
        
        // ---- DATE RANGE ----
        else if (getFilterType(fieldType) === 'dateRange') {
          if (typeof filterValue === 'object') {
            const dateValue = new Date(quoteValue);
            
            if (filterValue.from) {
              const fromDate = new Date(filterValue.from);
              if (dateValue < fromDate) return false;
            }
            if (filterValue.to) {
              const toDate = new Date(filterValue.to);
              toDate.setHours(23, 59, 59, 999);
              if (dateValue > toDate) return false;
            }
          }
        }
        
        // ---- CONTAINS (text, textarea) ----
        else if (getFilterType(fieldType) === 'contains') {
          if (typeof filterValue === 'string' && filterValue.trim()) {
            const textValue = (quoteValue || '').toString().toLowerCase();
            if (!textValue.includes(filterValue.toLowerCase())) {
              return false;
            }
          }
        }
        
        // ---- BOOLEAN (checkbox) ----
        else if (getFilterType(fieldType) === 'boolean') {
          // filterValue: 'all' | 'yes' | 'no'
          if (filterValue === 'yes') {
            if (quoteValue !== true && quoteValue !== 'true' && quoteValue !== 1) {
              return false;
            }
          } else if (filterValue === 'no') {
            if (quoteValue === true || quoteValue === 'true' || quoteValue === 1) {
              return false;
            }
          }
          // 'all' durumunda filtre uygulanmaz
        }
      }
      
      // ========== TARİH ARALIĞI (SABİT - createdAt) ==========
      if (filters.dateRange && (filters.dateRange.from || filters.dateRange.to)) {
        const itemDate = new Date(quote.createdAt);
        
        if (filters.dateRange.from) {
          const fromDate = new Date(filters.dateRange.from);
          if (itemDate < fromDate) return false;
        }
        
        if (filters.dateRange.to) {
          const toDate = new Date(filters.dateRange.to);
          toDate.setHours(23, 59, 59, 999);
          if (itemDate > toDate) return false;
        }
      }
      
    return true;
  });
}

/**
 * Filtre state'ini günceller
 */
export function updateFilter(filters, setFilters, category, value, action = 'toggle') {
  setFilters(prev => {
    const newFilters = { ...prev };
    
    // Range veya dateRange için object merge
    if (action === 'set') {
      newFilters[category] = value;
    }
    // Toggle checkbox
    else if (action === 'toggle') {
      const currentValues = prev[category] || [];
      if (currentValues.includes(value)) {
        newFilters[category] = currentValues.filter(v => v !== value);
      } else {
        newFilters[category] = [...currentValues, value];
      }
    }
    // Add to array
    else if (action === 'add') {
      const currentValues = prev[category] || [];
      if (!currentValues.includes(value)) {
        newFilters[category] = [...currentValues, value];
      }
    }
    // Remove from array
    else if (action === 'remove') {
      const currentValues = prev[category] || [];
      newFilters[category] = currentValues.filter(v => v !== value);
    }
    
    return newFilters;
  });
}

/**
 * Tüm filtreleri temizler
 */
export function clearFilters(setFilters, setGlobalSearch) {
  setFilters({
    status: [],
    dateRange: { from: '', to: '' }
  });
  if (setGlobalSearch) {
    setGlobalSearch('');
  }
}

/**
 * Belirli bir kategoriyi temizler
 */
export function clearSpecificFilter(setFilters, category, filterType) {
  setFilters(prev => {
    const newFilters = { ...prev };
    
    if (filterType === 'dateRange' || category === 'dateRange') {
      newFilters[category] = { from: '', to: '' };
    } else if (filterType === 'range') {
      newFilters[category] = { min: '', max: '' };
    } else if (filterType === 'boolean') {
      newFilters[category] = 'all';
    } else if (filterType === 'contains') {
      newFilters[category] = '';
    } else {
      newFilters[category] = [];
    }
    
    return newFilters;
  });
}

/**
 * Aktif filtre sayısını döner
 */
export function getActiveFilterCount(filters) {
  let count = 0;
  
  Object.entries(filters).forEach(([key, value]) => {
    // Array filtreler
    if (Array.isArray(value) && value.length > 0) {
      count++;
    }
    // Range filtreler
    else if (typeof value === 'object' && value !== null) {
      if ((value.from || value.to) || (value.min || value.max)) {
        count++;
      }
    }
    // Boolean filtreler (all hariç)
    else if (typeof value === 'string' && value !== '' && value !== 'all') {
      count++;
    }
  });
  
  return count;
}

/**
 * Başlangıç filter state'ini oluşturur (formConfig'e göre)
 */
export function createInitialFilterState(formConfig) {
  const state = {
    status: [],
    dateRange: { from: '', to: '' }
  };
  
  const fields = getFieldsFromConfig(formConfig);
  
  fields
    .filter(isFilterableField)
    .forEach(field => {
      const fieldId = field.fieldCode || field.id;
      const fieldType = field.fieldType || field.type;
      const filterType = getFilterType(fieldType);
      
      switch (filterType) {
        case 'multiselect':
          state[fieldId] = [];
          break;
        case 'range':
          state[fieldId] = { min: '', max: '' };
          break;
        case 'dateRange':
          state[fieldId] = { from: '', to: '' };
          break;
        case 'contains':
          state[fieldId] = '';
          break;
        case 'boolean':
          state[fieldId] = 'all';
          break;
        default:
          state[fieldId] = [];
      }
    });
  
  return state;
}
