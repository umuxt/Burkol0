export function FilterPopup({ filters, filterOptions, onFilterChange, onClose, t, formConfig }) {
  const [activeTab, setActiveTab] = React.useState('status')
  
  function getTabLabel(tab, t) {
    const labels = {
      status: 'Durum',
      dateRange: 'Tarih Aralığı',
      qtyRange: 'Miktar Aralığı'
    }
    
    // Add dynamic labels from formConfig
    if (formConfig && formConfig.steps) {
      formConfig.steps.forEach(step => {
        step.fields.forEach(field => {
          if (field.filterable) {
            labels[field.id] = field.label || field.id
          }
        })
      })
    }
    
    return labels[tab] || tab
  }

  function getAvailableTabs() {
    const tabs = ['status']
    
    // Add dynamic tabs from formConfig
    if (formConfig && formConfig.steps) {
      formConfig.steps.forEach(step => {
        step.fields.forEach(field => {
          if (field.filterable && field.type !== 'textarea' && field.type !== 'date' && field.type !== 'number') {
            tabs.push(field.id)
          }
        })
      })
    }
    
    tabs.push('dateRange', 'qtyRange')
    return tabs
  }

  function handleCheckboxChange(category, option, checked) {
    if (checked) {
      onFilterChange(category, option, 'add')
    } else {
      onFilterChange(category, option, 'remove')
    }
  }

  function handleRangeChange(category, field, value) {
    const currentRange = filters[category] || {}
    const newRange = { ...currentRange, [field]: value }
    onFilterChange(category, newRange, 'set')
  }

  function clearCategory(category) {
    if (category === 'dateRange') {
      onFilterChange(category, { from: '', to: '' }, 'set')
    } else if (category === 'qtyRange') {
      onFilterChange(category, { min: '', max: '' }, 'set')
    } else {
      onFilterChange(category, [], 'set')
    }
  }

  function renderTabContent() {
    const category = activeTab
    
    if (category === 'dateRange') {
      const range = filters.dateRange || { from: '', to: '' }
      return React.createElement('div', null,
        React.createElement('div', { style: { marginBottom: '15px' } },
          React.createElement('label', { style: { display: 'block', marginBottom: '5px' } }, 'Başlangıç Tarihi:'),
          React.createElement('input', {
            type: 'date',
            value: range.from || '',
            onChange: (e) => handleRangeChange('dateRange', 'from', e.target.value),
            style: { width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ddd' }
          })
        ),
        React.createElement('div', { style: { marginBottom: '15px' } },
          React.createElement('label', { style: { display: 'block', marginBottom: '5px' } }, 'Bitiş Tarihi:'),
          React.createElement('input', {
            type: 'date',
            value: range.to || '',
            onChange: (e) => handleRangeChange('dateRange', 'to', e.target.value),
            style: { width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ddd' }
          })
        )
      )
    }
    
    if (category === 'qtyRange') {
      const range = filters.qtyRange || { min: '', max: '' }
      return React.createElement('div', null,
        React.createElement('div', { style: { marginBottom: '15px' } },
          React.createElement('label', { style: { display: 'block', marginBottom: '5px' } }, 'Minimum Miktar:'),
          React.createElement('input', {
            type: 'number',
            value: range.min || '',
            onChange: (e) => handleRangeChange('qtyRange', 'min', e.target.value),
            style: { width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ddd' }
          })
        ),
        React.createElement('div', { style: { marginBottom: '15px' } },
          React.createElement('label', { style: { display: 'block', marginBottom: '5px' } }, 'Maksimum Miktar:'),
          React.createElement('input', {
            type: 'number',
            value: range.max || '',
            onChange: (e) => handleRangeChange('qtyRange', 'max', e.target.value),
            style: { width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ddd' }
          })
        )
      )
    }

    const options = filterOptions[category] || []
    const selectedOptions = filters[category] || []
    
    if (options.length === 0) {
      return React.createElement('p', { style: { color: '#666', fontStyle: 'italic' } }, 
        'Bu kategori için filtre seçeneği bulunmuyor.')
    }

    return React.createElement('div', null,
      React.createElement('div', { style: { marginBottom: '15px' } },
        React.createElement('button', {
          onClick: () => {
            if (selectedOptions.length === options.length) {
              onFilterChange(category, [], 'set')
            } else {
              onFilterChange(category, options, 'set')
            }
          },
          style: {
            padding: '6px 12px',
            backgroundColor: selectedOptions.length === options.length ? '#dc3545' : '#007bff',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '12px'
          }
        }, selectedOptions.length === options.length ? 'Tümünü Kaldır' : 'Tümünü Seç')
      ),
      React.createElement('div', { style: { maxHeight: '300px', overflowY: 'auto' } },
        options.map(option => 
          React.createElement('label', {
            key: option,
            style: {
              display: 'flex',
              alignItems: 'center',
              padding: '8px 0',
              cursor: 'pointer',
              borderBottom: '1px solid #f0f0f0'
            }
          },
            React.createElement('input', {
              type: 'checkbox',
              checked: selectedOptions.includes(option),
              onChange: (e) => handleCheckboxChange(category, option, e.target.checked),
              style: { marginRight: '10px' }
            }),
            React.createElement('span', null, option || 'Belirtilmemiş')
          )
        )
      )
    )
  }

  return React.createElement('div', { 
    className: 'modal-overlay',
    onClick: onClose,
    style: {
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000
    }
  },
    React.createElement('div', {
      className: 'modal-content',
      onClick: (e) => e.stopPropagation(),
      style: { 
        backgroundColor: 'white',
        borderRadius: '8px',
        padding: '20px',
        maxWidth: '600px',
        width: '90%',
        maxHeight: '80vh',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column'
      }
    },
      React.createElement('h3', { style: { margin: '0 0 20px 0' } }, '🔍 Filtreler'),
      
      React.createElement('div', { 
        style: { 
          display: 'flex', 
          borderBottom: '1px solid #ddd', 
          marginBottom: '20px',
          flexWrap: 'wrap',
          gap: '2px'
        } 
      },
        getAvailableTabs().map(tab =>
          React.createElement('button', {
            key: tab,
            onClick: () => setActiveTab(tab),
            style: {
              padding: '8px 12px',
              border: 'none',
              background: activeTab === tab ? '#007bff' : '#f8f9fa',
              color: activeTab === tab ? 'white' : '#333',
              cursor: 'pointer',
              borderRadius: '4px 4px 0 0',
              fontSize: '12px',
              transition: 'all 0.2s ease'
            }
          }, getTabLabel(tab, t))
        )
      ),

      React.createElement('div', { 
        style: { 
          flex: 1, 
          overflowY: 'auto',
          marginBottom: '20px'
        } 
      },
        renderTabContent()
      ),

      React.createElement('div', { 
        style: { 
          display: 'flex', 
          justifyContent: 'space-between', 
          gap: '10px',
          borderTop: '1px solid #ddd',
          paddingTop: '15px'
        } 
      },
        React.createElement('button', {
          onClick: () => clearCategory(activeTab),
          style: {
            padding: '8px 16px',
            backgroundColor: '#6c757d',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer'
          }
        }, getTabLabel(activeTab, t) + ' Temizle'),
        React.createElement('button', {
          onClick: onClose,
          style: {
            padding: '8px 16px',
            backgroundColor: '#007bff',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer'
          }
        }, 'Kapat')
      )
    )
  )
}
