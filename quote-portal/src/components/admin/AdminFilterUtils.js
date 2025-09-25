// Admin Filter Utils - Filtering and search functionality
import React from 'react';

const { useMemo } = React;

export function createFilteredList(list, filters, globalSearch, formConfig) {
  return useMemo(() => {
    return list.filter(item => {
      // Enhanced global search - searches in ALL fields including hidden ones
      if (globalSearch) {
        const searchTerm = globalSearch.toLowerCase()
        
        // Main fields
        const mainFields = [
          item.name, item.company, item.proj, item.email, item.phone,
          item.material, item.finish, item.status, item.country,
          item.dims, item.dimsL, item.dimsW, item.thickness, item.qty,
          item.notes, item.createdBy, item.price, item.calculatedPrice
        ]
        
        // Process array
        const processes = Array.isArray(item.process) ? item.process : [item.process].filter(Boolean)
        
        // Custom fields
        const customFieldValues = item.customFields ? Object.values(item.customFields) : []
        
        // File names
        const fileNames = item.files ? item.files.map(f => f.name || f.originalName || '') : []
        
        // Combine all searchable text
        const allSearchableText = [
          ...mainFields,
          ...processes,
          ...customFieldValues,
          ...fileNames
        ].filter(Boolean).join(' ').toLowerCase()
        
        if (!allSearchableText.includes(searchTerm)) {
          return false
        }
      }

      // Status filter (always available)
      if (filters.status && filters.status.length > 0 && !filters.status.includes(item.status)) {
        return false
      }

      // Dynamic filters based on formConfig
      if (formConfig && formConfig.steps) {
        for (const step of formConfig.steps) {
          for (const field of step.fields) {
            if (field.filterable && filters[field.id] && filters[field.id].length > 0) {
              const itemValue = item[field.id]
              
              if (field.type === 'multiselect') {
                // For multiselect, check if any of the item's values match the filter
                const itemValues = Array.isArray(itemValue) ? itemValue : 
                  typeof itemValue === 'string' ? itemValue.split(',').map(s => s.trim()) : []
                
                const hasMatch = filters[field.id].some(filterValue => 
                  itemValues.includes(filterValue)
                )
                if (!hasMatch) return false
              } else {
                // For single value fields
                if (!filters[field.id].includes(itemValue)) {
                  return false
                }
              }
            }
          }
        }
      }

      // Date range filter
      if (filters.dateRange && (filters.dateRange.from || filters.dateRange.to)) {
        const itemDate = new Date(item.createdAt)
        
        if (filters.dateRange.from) {
          const fromDate = new Date(filters.dateRange.from)
          if (itemDate < fromDate) return false
        }
        
        if (filters.dateRange.to) {
          const toDate = new Date(filters.dateRange.to)
          toDate.setHours(23, 59, 59, 999) // End of day
          if (itemDate > toDate) return false
        }
      }

      // Quantity range filter
      if (filters.qtyRange && (filters.qtyRange.min || filters.qtyRange.max)) {
        const qty = parseFloat(item.qty) || 0
        
        if (filters.qtyRange.min && qty < parseFloat(filters.qtyRange.min)) {
          return false
        }
        if (filters.qtyRange.max && qty > parseFloat(filters.qtyRange.max)) {
          return false
        }
      }

      return true
    })
  }, [list, filters, globalSearch])
}

export function getFilterOptions(list, formConfig) {
  return useMemo(() => {
    const options = {
      status: [...new Set(list.map(item => item.status).filter(Boolean))]
    }
    
    // Add dynamic filter options based on formConfig
    if (formConfig && formConfig.steps) {
      formConfig.steps.forEach(step => {
        step.fields.forEach(field => {
          if (field.filterable && field.type !== 'textarea' && field.type !== 'date' && field.type !== 'number') {
            if (field.type === 'multiselect') {
              // For multiselect fields, collect all individual values
              options[field.id] = [...new Set(list.flatMap(item => 
                Array.isArray(item[field.id]) ? item[field.id] : 
                typeof item[field.id] === 'string' ? item[field.id].split(',').map(s => s.trim()) : 
                []
              ).filter(Boolean))]
            } else if (field.type === 'radio' && field.options) {
              // For radio fields, use the defined options
              options[field.id] = [...new Set(list.map(item => item[field.id]).filter(Boolean))]
            } else {
              // For other text fields
              options[field.id] = [...new Set(list.map(item => item[field.id]).filter(Boolean))]
            }
          }
        })
      })
    }
    
    return options
  }, [list, formConfig])
}

export function updateFilter(filters, setFilters, category, value, action = 'toggle') {
  setFilters(prev => {
    const newFilters = { ...prev }
    
    if (category === 'dateRange' || category === 'qtyRange') {
      newFilters[category] = { ...prev[category], ...value }
    } else {
      const currentValues = prev[category] || []
      
      if (action === 'toggle') {
        if (currentValues.includes(value)) {
          newFilters[category] = currentValues.filter(v => v !== value)
        } else {
          newFilters[category] = [...currentValues, value]
        }
      } else if (action === 'add') {
        if (!currentValues.includes(value)) {
          newFilters[category] = [...currentValues, value]
        }
      } else if (action === 'remove') {
        newFilters[category] = currentValues.filter(v => v !== value)
      }
    }
    
    return newFilters
  })
}

export function clearFilters(setFilters, setGlobalSearch) {
  setFilters({
    status: [],
    material: [],
    process: [],
    dateRange: { from: '', to: '' },
    qtyRange: { min: '', max: '' },
    country: []
  })
  setGlobalSearch('')
}

export function clearSpecificFilter(setFilters, category) {
  setFilters(prev => {
    const newFilters = { ...prev }
    if (category === 'dateRange') {
      newFilters[category] = { from: '', to: '' }
    } else if (category === 'qtyRange') {
      newFilters[category] = { min: '', max: '' }
    } else {
      newFilters[category] = []
    }
    return newFilters
  })
}

export function getActiveFilterCount(filters) {
  let count = 0
  
  // Count array filters
  Object.keys(filters).forEach(key => {
    if (Array.isArray(filters[key]) && filters[key].length > 0) {
      count++
    } else if (key === 'dateRange' && (filters[key].from || filters[key].to)) {
      count++
    } else if (key === 'qtyRange' && (filters[key].min || filters[key].max)) {
      count++
    }
  })
  
  return count
}