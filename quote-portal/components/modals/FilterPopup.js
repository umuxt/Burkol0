export function FilterPopup({ type, filters, filterOptions, onClose, onUpdateFilter, t }) {
  if (!type) return null

  const [tempFilters, setTempFilters] = React.useState(() => {
    const result = {}
    if (type === 'dateRange') {
      result[type] = filters[type] || { from: '', to: '' }
    } else if (type === 'qtyRange') {
      result[type] = filters[type] || { min: '', max: '' }
    } else {
      // Eğer hiç seçim yoksa, tüm seçenekleri seç
      const currentSelection = filters[type] || []
      result[type] = currentSelection.length === 0 ? [...(filterOptions[type] || [])] : currentSelection
    }
    return result
  })

  function handleApply() {
    if (type === 'dateRange' || type === 'qtyRange') {
      onUpdateFilter(type, tempFilters[type], 'set')
    } else {
      onUpdateFilter(type, tempFilters[type], 'set')
    }
    onClose()
  }

  function handleClear() {
    if (type === 'dateRange') {
      setTempFilters(prev => ({ ...prev, dateRange: { from: '', to: '' } }))
    } else if (type === 'qtyRange') {
      setTempFilters(prev => ({ ...prev, qtyRange: { min: '', max: '' } }))
    } else {
      setTempFilters(prev => ({ ...prev, [type]: [] }))
    }
  }

  function toggleOption(option) {
    setTempFilters(prev => {
      const current = prev[type] || []
      const index = current.indexOf(option)
      const newArray = index > -1 
        ? current.filter(item => item !== option)
        : [...current, option]
      return { ...prev, [type]: newArray }
    })
  }

  function toggleAll() {
    const allOptions = filterOptions[type] || []
    const currentSelection = tempFilters[type] || []
    const allSelected = allOptions.length > 0 && currentSelection.length === allOptions.length
    
    setTempFilters(prev => ({
      ...prev,
      [type]: allSelected ? [] : [...allOptions]
    }))
  }

  function updateRange(field, value) {
    setTempFilters(prev => ({
      ...prev,
      [type]: { ...prev[type], [field]: value }
    }))
  }

  const popupStyle = {
    position: 'fixed',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    backgroundColor: 'white',
    border: '1px solid #ddd',
    borderRadius: '12px',
    boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
    padding: '20px',
    minWidth: '280px',
    maxWidth: '350px',
    maxHeight: '75vh',
    overflowY: 'auto',
    zIndex: 1001
  }

  const overlayStyle = {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.6)',
    backdropFilter: 'blur(4px)',
    zIndex: 1000
  }

  const getTitleByType = () => {
    switch(type) {
      case 'status': return 'Durum Filtresi'
      case 'material': return 'Malzeme Filtresi'
      case 'process': return 'İşlem Filtresi'
      case 'dateRange': return 'Tarih Aralığı Filtresi'
      case 'qtyRange': return 'Miktar Aralığı Filtresi'
      case 'country': return 'Ülke Filtresi'
      default: return 'Filtre'
    }
  }

  return React.createElement('div', null,
    React.createElement('div', { style: overlayStyle, onClick: onClose }),
    React.createElement('div', { style: popupStyle },
      React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' } },
        React.createElement('h3', { style: { margin: 0, fontSize: '18px', fontWeight: '600', color: '#1a1a1a' } }, getTitleByType()),
        React.createElement('button', { 
          onClick: onClose,
          style: { 
            background: 'none', 
            border: 'none', 
            fontSize: '24px', 
            cursor: 'pointer',
            padding: '4px 8px',
            lineHeight: '1',
            color: '#666',
            borderRadius: '4px'
          },
          onMouseOver: (e) => e.target.style.backgroundColor = '#f5f5f5',
          onMouseOut: (e) => e.target.style.backgroundColor = 'transparent'
        }, '×')
      ),

      // Options based on type
      type === 'dateRange' ? React.createElement('div', null,
        React.createElement('div', { style: { marginBottom: '12px' } },
          React.createElement('label', { style: { display: 'block', marginBottom: '4px', fontSize: '14px', fontWeight: '500' } }, 'Başlangıç Tarihi'),
          React.createElement('input', {
            type: 'date',
            value: tempFilters.dateRange.from || '',
            onChange: (e) => updateRange('from', e.target.value),
            style: { width: '100%', padding: '1.5px', border: '1px solid black', borderRadius: '4px', color: 'black', background: 'white' }
          })
        ),
        React.createElement('div', { style: { marginBottom: '16px' } },
          React.createElement('label', { style: { display: 'block', marginBottom: '4px', fontSize: '14px', fontWeight: '500' } }, 'Bitiş Tarihi'),
          React.createElement('input', {
            type: 'date',
            value: tempFilters.dateRange.to || '',
            onChange: (e) => updateRange('to', e.target.value),
            style: { width: '100%', padding: '1.5px', border: '1px solid black', borderRadius: '4px', color: 'black', background: 'white' }
          })
        )
      ) : type === 'qtyRange' ? React.createElement('div', null,
        React.createElement('div', { style: { marginBottom: '12px' } },
          React.createElement('label', { style: { display: 'block', marginBottom: '4px', fontSize: '14px', fontWeight: '500' } }, 'Minimum Miktar'),
          React.createElement('input', {
            type: 'number',
            value: tempFilters.qtyRange.min || '',
            onChange: (e) => updateRange('min', e.target.value),
            style: { width: '100%', padding: '1.5px', border: '1px solid black', borderRadius: '4px', color: 'black', background: 'white' },
            placeholder: '0'
          })
        ),
        React.createElement('div', { style: { marginBottom: '16px' } },
          React.createElement('label', { style: { display: 'block', marginBottom: '4px', fontSize: '14px', fontWeight: '500' } }, 'Maksimum Miktar'),
          React.createElement('input', {
            type: 'number',
            value: tempFilters.qtyRange.max || '',
            onChange: (e) => updateRange('max', e.target.value),
            style: { width: '100%', padding: '1.5px', border: '1px solid black', borderRadius: '4px', color: 'black', background: 'white' },
            placeholder: 'Sınırsız'
          })
        )
      ) : React.createElement('div', { style: { marginBottom: '16px' } },
        (filterOptions[type] || []).length === 0 ? 
          React.createElement('div', { style: { color: '#6c757d', fontStyle: 'italic', textAlign: 'center', padding: '20px' } }, 'Henüz seçenek bulunmuyor') :
          React.createElement('div', null,
            // Tümünü Seç butonu
            React.createElement('div', { style: { marginBottom: '12px', padding: '8px', backgroundColor: '#f8f9fa', borderRadius: '6px', border: '1px solid #e9ecef' } },
              React.createElement('label', { 
                style: { 
                  display: 'flex', 
                  alignItems: 'center', 
                  cursor: 'pointer',
                  fontWeight: '500',
                  fontSize: '14px',
                  color: '#495057'
                }
              },
                React.createElement('input', {
                  type: 'checkbox',
                  checked: (filterOptions[type] || []).length > 0 && (tempFilters[type] || []).length === (filterOptions[type] || []).length,
                  onChange: toggleAll,
                  style: { marginRight: '8px' }
                }),
                React.createElement('span', null, 'Tümünü Seç/Bırak')
              )
            ),
            // Seçenekler
            React.createElement('div', { style: { maxHeight: '200px', overflowY: 'auto', padding: '4px' } },
              (filterOptions[type] || []).map(option => 
                React.createElement('label', { 
                  key: option,
                  style: { 
                    display: 'flex', 
                    alignItems: 'center', 
                    marginBottom: '6px',
                    cursor: 'pointer',
                    padding: '6px 8px',
                    borderRadius: '4px',
                    transition: 'background-color 0.2s',
                    width: '100%'
                  },
                  onMouseOver: (e) => e.currentTarget.style.backgroundColor = '#f8f9fa',
                  onMouseOut: (e) => e.currentTarget.style.backgroundColor = 'transparent'
                },
                  React.createElement('input', {
                    type: 'checkbox',
                    checked: (tempFilters[type] || []).includes(option),
                    onChange: () => toggleOption(option),
                    style: { marginRight: '10px' }
                  }),
                  React.createElement('span', { 
                    style: { 
                      fontSize: '14px', 
                      flex: '1',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      minWidth: '0'
                    } 
                  }, option)
                )
              )
            )
          )
      ),

      // Buttons
      React.createElement('div', { style: { display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '20px', paddingTop: '16px', borderTop: '1px solid #e9ecef' } },
        React.createElement('button', {
          onClick: handleClear,
          style: { 
            padding: '10px 20px', 
            backgroundColor: '#6c757d', 
            color: 'white', 
            border: 'none', 
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: '500',
            transition: 'all 0.2s ease'
          },
          onMouseOver: (e) => e.target.style.backgroundColor = '#5a6268',
          onMouseOut: (e) => e.target.style.backgroundColor = '#6c757d'
        }, 'Temizle'),
        React.createElement('button', {
          onClick: handleApply,
          style: { 
            padding: '10px 20px', 
            backgroundColor: '#007bff', 
            color: 'white', 
            border: 'none', 
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: '500',
            transition: 'all 0.2s ease'
          },
          onMouseOver: (e) => e.target.style.backgroundColor = '#0056b3',
          onMouseOut: (e) => e.target.style.backgroundColor = '#007bff'
        }, 'Uygula')
      )
    )
  )
}