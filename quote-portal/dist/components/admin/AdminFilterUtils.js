// Admin Filter Utils - Filtering and search functionality

const ReactGlobal = typeof React !== 'undefined' ? React : (typeof window !== 'undefined' ? window.React : undefined)
const { useMemo } = ReactGlobal

export function createFilteredList(list, filters, globalSearch, fieldSearch) {
  return useMemo(() => {
    return list.filter(item => {
      // Global search
      if (globalSearch) {
        const searchTerm = globalSearch.toLowerCase()
        const searchableText = [
          item.name, item.company, item.proj, item.email, item.phone,
          item.material, item.finish, item.status,
          ...(Array.isArray(item.process) ? item.process : [item.process].filter(Boolean))
        ].join(' ').toLowerCase()
        
        if (!searchableText.includes(searchTerm)) {
          return false
        }
      }

      // Field-specific search
      if (fieldSearch) {
        const fieldTerm = fieldSearch.toLowerCase()
        let found = false
        
        // Search in main fields
        const mainFields = ['name', 'company', 'proj', 'email', 'phone', 'material', 'finish', 'status']
        for (const field of mainFields) {
          if (item[field] && item[field].toLowerCase().includes(fieldTerm)) {
            found = true
            break
          }
        }
        
        // Search in process array
        if (!found && Array.isArray(item.process)) {
          found = item.process.some(p => p && p.toLowerCase().includes(fieldTerm))
        }
        
        // Search in custom fields
        if (!found && item.customFields) {
          for (const [key, value] of Object.entries(item.customFields)) {
            if (value && String(value).toLowerCase().includes(fieldTerm)) {
              found = true
              break
            }
          }
        }
        
        if (!found) return false
      }

      // Status filter
      if (filters.status.length > 0 && !filters.status.includes(item.status)) {
        return false
      }

      // Material filter
      if (filters.material.length > 0 && !filters.material.includes(item.material)) {
        return false
      }

      // Process filter
      if (filters.process.length > 0) {
        const itemProcesses = Array.isArray(item.process) ? item.process : [item.process].filter(Boolean)
        if (!filters.process.some(filterProcess => itemProcesses.includes(filterProcess))) {
          return false
        }
      }

      // Country filter
      if (filters.country.length > 0 && !filters.country.includes(item.country)) {
        return false
      }

      // Date range filter
      if (filters.dateRange.from || filters.dateRange.to) {
        const itemDate = item.createdAt || item.date || ''
        const itemDateOnly = itemDate.slice(0, 10) // YYYY-MM-DD format
        
        if (filters.dateRange.from && itemDateOnly < filters.dateRange.from) {
          return false
        }
        if (filters.dateRange.to && itemDateOnly > filters.dateRange.to) {
          return false
        }
      }

      // Quantity range filter
      if (filters.qtyRange.min || filters.qtyRange.max) {
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
  }, [list, filters, globalSearch, fieldSearch])
}

export function getFilterOptions(list) {
  return useMemo(() => {
    const options = {
      status: [...new Set(list.map(item => item.status).filter(Boolean))],
      material: [...new Set(list.map(item => item.material).filter(Boolean))],
      process: [...new Set(list.flatMap(item => Array.isArray(item.process) ? item.process : []).filter(Boolean))],
      country: [...new Set(list.map(item => item.country).filter(Boolean))]
    }
    return options
  }, [list])
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

export function clearFilters(setFilters, setGlobalSearch, setFieldSearch) {
  setFilters({
    status: [],
    material: [],
    process: [],
    dateRange: { from: '', to: '' },
    qtyRange: { min: '', max: '' },
    country: []
  })
  setGlobalSearch('')
  setFieldSearch('')
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