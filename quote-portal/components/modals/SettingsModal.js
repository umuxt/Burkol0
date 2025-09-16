import API from '../../lib/api.js'
import FormulaValidator from '../SimpleFormulaValidator.js'

const ReactGlobal = typeof React !== 'undefined' ? React : (typeof window !== 'undefined' ? window.React : undefined)
if (!ReactGlobal) {
  throw new Error('React global not found. Ensure React CDN script loads before settings modal module.')
}
const { useState, useEffect } = ReactGlobal

function SettingsModal({ onClose, onSettingsUpdated, t, showNotification }) {
  const [parameters, setParameters] = useState([])
  const [formula, setFormula] = useState('')
  const [parameterType, setParameterType] = useState('') // '' | 'fixed' | 'form'
  const [parameterName, setParameterName] = useState('')
  const [fixedValue, setFixedValue] = useState('')
  const [selectedFormField, setSelectedFormField] = useState('')
  const [lookupTable, setLookupTable] = useState([]) // For dropdown fields with lookup values
  const [newLookupOption, setNewLookupOption] = useState('')
  const [newLookupValue, setNewLookupValue] = useState('')
  
  // Editing states for each parameter
  const [editingParams, setEditingParams] = useState({}) // { paramId: true/false }
  const [editingValues, setEditingValues] = useState({}) // { paramId: { name, value, lookupTable } }
  
  // Formula validation state
  const [formulaValidation, setFormulaValidation] = useState(null)
  const [isFormulaValid, setIsFormulaValid] = useState(true)
  
  // Form fields available for selection (from user form)
  const formFields = [
    { value: 'qty', label: 'Adet', hasOptions: false },
    { value: 'thickness', label: 'Kalınlık (mm)', hasOptions: false },
    { value: 'dimensions', label: 'Boyutlar', hasOptions: false },
    { value: 'material', label: 'Malzeme', hasOptions: true },
    { value: 'process', label: 'İşlem Türü', hasOptions: true },
    { value: 'finish', label: 'Yüzey İşlemi', hasOptions: true },
    { value: 'toleranceStd', label: 'Tolerans Standardı', hasOptions: true },
    { value: 'weldMethod', label: 'Kaynak Yöntemi', hasOptions: true },
    { value: 'surfaceRa', label: 'Yüzey Pürüzlülüğü', hasOptions: true },
    { value: 'repeat', label: 'Tekrar Durumu', hasOptions: true },
    { value: 'budgetCurrency', label: 'Para Birimi', hasOptions: true },
    { value: 'country', label: 'Ülke', hasOptions: true }
  ]
  
  // Get dropdown options for each field
  const getFieldOptions = (fieldValue) => {
    switch(fieldValue) {
      case 'material':
        return ['Mild Steel (S235/S355)', 'Stainless Steel (304/316)', 'Aluminum (5052/6061/6082)', 'Galvanized Steel', 'Copper/Brass', 'Other']
      case 'process':
        return ['Lazer Kesim', 'Abkant Büküm', 'Kaynak', 'CNC İşleme', 'Montaj', 'Toz Boya', 'Galvaniz', 'Anodize']
      case 'finish':
        return ['Ham', 'Zımpara', 'Toz Boya', 'Galvaniz', 'Anodize', 'Diğer']
      case 'weldMethod':
        return ['MIG', 'TIG']
      case 'surfaceRa':
        return ['Ra 3.2', 'Ra 1.6', 'Ra 0.8']
      case 'repeat':
        return ['one', 'recurrent']
      case 'budgetCurrency':
        return ['TRY', 'USD', 'EUR', 'GBP']
      case 'country':
        return ['TR', 'US', 'DE', 'GB', 'FR', 'NL'] // simplified
      default:
        return []
    }
  }
  
  // Material types for material selection
  const materialTypes = [
    'Alüminyum', 'Çelik', 'Paslanmaz Çelik', 'Bakır', 'Pirinç', 'Titanyum'
  ]

  useEffect(() => {
    // Load settings from API
    loadSettings()
  }, [])

  async function loadSettings() {
    try {
      const settings = await API.getSettings()
      setParameters(settings.parameters || [])
      setFormula(settings.formula || '')
    } catch (e) {
      console.log('Settings not found, using defaults')
    }
  }

  // Parameter editing functions
  function startEditingParameter(param) {
    setEditingParams(prev => ({ ...prev, [param.id]: true }))
    setEditingValues(prev => ({
      ...prev,
      [param.id]: {
        name: param.name,
        value: param.value || '',
        formField: param.formField || '',
        lookupTable: param.lookupTable ? [...param.lookupTable] : []
      }
    }))
  }

  function handleFormulaValidation(validation) {
    setFormulaValidation(validation)
    setIsFormulaValid(validation ? validation.isValid : true)
  }

  function cancelEditingParameter(paramId) {
    setEditingParams(prev => ({ ...prev, [paramId]: false }))
    setEditingValues(prev => {
      const newValues = { ...prev }
      delete newValues[paramId]
      return newValues
    })
  }

  async function saveEditingParameter(paramId) {
    try {
      const editValues = editingValues[paramId]
      if (!editValues) return

      const updatedParameters = parameters.map(param => {
        if (param.id === paramId) {
          return {
            ...param,
            name: editValues.name,
            ...(param.type === 'fixed' ? { value: editValues.value } : {}),
            ...(param.type === 'form' ? { formField: editValues.formField } : {}),
            ...(param.lookupTable ? { lookupTable: editValues.lookupTable } : {})
          }
        }
        return param
      })

      // FIXED: Save to backend as well!
      const settings = {
        parameters: updatedParameters,
        formula: formula,
        lastUpdated: Date.now()
      }
      
      console.log('Saving parameter settings:', settings)
      await API.saveSettings(settings)

      setParameters(updatedParameters)
      setEditingParams(prev => ({ ...prev, [paramId]: false }))
      setEditingValues(prev => {
        const newValues = { ...prev }
        delete newValues[paramId]
        return newValues
      })

      showNotification('Parametre güncellendi!', 'success')
    } catch (e) {
      console.error('Save parameter error:', e)
      showNotification('Parametre güncellenemedi: ' + e.message, 'error')
    }
  }

  function updateEditingValue(paramId, field, value) {
    setEditingValues(prev => ({
      ...prev,
      [paramId]: {
        ...prev[paramId],
        [field]: value
      }
    }))
  }

  function updateLookupItem(paramId, index, field, value) {
    setEditingValues(prev => {
      const newValues = { ...prev }
      const newLookupTable = [...newValues[paramId].lookupTable]
      newLookupTable[index] = { ...newLookupTable[index], [field]: value }
      newValues[paramId] = { ...newValues[paramId], lookupTable: newLookupTable }
      return newValues
    })
  }

  function addParameter() {
    if (!parameterType) return
    
    // For fixed parameters, need name and value
    if (parameterType === 'fixed' && (!parameterName || !fixedValue)) return
    
    // For form parameters, need field selection
    if (parameterType === 'form' && !selectedFormField) return
    
    const newId = String.fromCharCode(65 + parameters.length) // A,B,C,D...
    const param = { 
      id: newId,
      type: parameterType
    }
    
    if (parameterType === 'fixed') {
      param.name = parameterName
      param.value = parseFloat(fixedValue)
    } else if (parameterType === 'form') {
      const field = formFields.find(f => f.value === selectedFormField)
      param.name = field.label
      param.formField = selectedFormField
      
      // If field has options and lookup table is configured
      if (field.hasOptions && lookupTable.length > 0) {
        param.lookupTable = [...lookupTable]
      }
    }
    
    setParameters(prev => [...prev, param])
    
    // Reset form  
    setParameterType('')
    setParameterName('')
    setFixedValue('')
    setSelectedFormField('')
    setLookupTable([])
    setNewLookupOption('')
    setNewLookupValue('')
  }

  function addLookupRow() {
    const options = getFieldOptions(selectedFormField)
    if (options.length > 0) {
      // Add row with first unused option
      const usedOptions = lookupTable.map(row => row.option)
      const availableOption = options.find(opt => !usedOptions.includes(opt))
      if (availableOption) {
        setLookupTable(prev => [...prev, { option: availableOption, value: '' }])
      }
    }
  }

  function updateLookupRow(index, field, value) {
    setLookupTable(prev => prev.map((row, i) => 
      i === index ? { ...row, [field]: value } : row
    ))
  }

  function removeLookupRow(index) {
    setLookupTable(prev => prev.filter((_, i) => i !== index))
  }

  function removeParameter(id) {
    setParameters(prev => prev.filter(p => p.id !== id))
  }

  async function saveSettings() {
    try {
      // Validate formula before saving
      if (formula && !isFormulaValid) {
        showNotification('Formül hatası mevcut! Lütfen düzeltin.', 'error')
        return
      }

      const settings = { parameters, formula }
      console.log('Saving settings:', settings)
      await API.saveSettings(settings)
      showNotification('Fiyat hesaplama ayarları kaydedildi!', 'success')
      if (onSettingsUpdated) onSettingsUpdated()
      onClose()
    } catch (e) {
      console.error('Save settings error:', e)
      showNotification('Ayarlar kaydedilemedi: ' + e.message, 'error')
    }
  }

  const overlayStyle = {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.6)',
    backdropFilter: 'blur(4px)',
    zIndex: 1002
  }

  const modalStyle = {
    position: 'fixed',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    backgroundColor: 'white',
    border: '1px solid #ddd',
    borderRadius: '12px',
    boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
    padding: '24px',
    minWidth: '600px',
    maxWidth: '800px',
    maxHeight: '80vh',
    overflowY: 'auto',
    zIndex: 1003
  }

  return React.createElement('div', null,
    React.createElement('div', { style: overlayStyle, onClick: onClose }),
    React.createElement('div', { style: modalStyle },
      React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' } },
        React.createElement('h2', { style: { margin: 0, fontSize: '20px', fontWeight: '600', color: '#1a1a1a' } }, 'Fiyat Hesaplama Ayarları'),
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

      // Parameters section
      React.createElement('div', { style: { marginBottom: '24px' } },
        React.createElement('h3', { style: { marginBottom: '16px', fontSize: '16px', color: '#333' } }, 'Parametreler'),
        React.createElement('div', { style: { overflowX: 'auto' } },
          React.createElement('table', { style: { width: '100%', borderCollapse: 'collapse' } },
            React.createElement('thead', null,
              React.createElement('tr', null,
                React.createElement('th', { style: { border: '1px solid #ddd', padding: '8px', backgroundColor: '#f8f9fa', color: '#333' } }, 'ID'),
                React.createElement('th', { style: { border: '1px solid #ddd', padding: '8px', backgroundColor: '#f8f9fa', color: '#333' } }, 'Parametre Adı'),
                React.createElement('th', { style: { border: '1px solid #ddd', padding: '8px', backgroundColor: '#f8f9fa', color: '#333' } }, 'Değer/Tip'),
                React.createElement('th', { style: { border: '1px solid #ddd', padding: '8px', backgroundColor: '#f8f9fa', color: '#333' } }, 'İşlemler')
              )
            ),
            React.createElement('tbody', null,
              parameters.map(param => {
                const isEditing = editingParams[param.id]
                const editValues = editingValues[param.id] || {}
                
                return React.createElement('tr', { key: param.id },
                  React.createElement('td', { style: { border: '1px solid #ddd', padding: '8px', textAlign: 'center', fontWeight: 'bold', color: '#333' } }, param.id),
                  
                  // Parameter Name (editable for all types)
                  React.createElement('td', { style: { border: '1px solid #ddd', padding: '8px', color: '#333' } },
                    isEditing 
                      ? React.createElement('input', {
                          type: 'text',
                          value: editValues.name || '',
                          onChange: (e) => updateEditingValue(param.id, 'name', e.target.value),
                          style: { 
                            width: '100%', 
                            padding: '4px', 
                            border: '1px solid #ccc', 
                            borderRadius: '3px',
                            fontSize: '13px'
                          }
                        })
                      : param.name
                  ),
                  
                  // Parameter Value/Type (different editing based on type)
                  React.createElement('td', { style: { border: '1px solid #ddd', padding: '8px', color: '#333' } },
                    (() => {
                      if (param.type === 'fixed') {
                        return isEditing 
                          ? React.createElement('input', {
                              type: 'number',
                              step: '0.01',
                              value: editValues.value || '',
                              onChange: (e) => updateEditingValue(param.id, 'value', e.target.value),
                              style: { 
                                width: '100%', 
                                padding: '4px', 
                                border: '1px solid #ccc', 
                                borderRadius: '3px',
                                fontSize: '13px'
                              }
                            })
                          : `${param.value}`
                      } else if (param.lookupTable && param.lookupTable.length > 0) {
                        return isEditing 
                          ? React.createElement('div', null,
                              (editValues.lookupTable || []).map((item, idx) => 
                                React.createElement('div', { 
                                  key: idx, 
                                  style: { 
                                    display: 'flex', 
                                    gap: '4px', 
                                    marginBottom: '4px',
                                    alignItems: 'center'
                                  } 
                                },
                                  React.createElement('span', { 
                                    style: { 
                                      fontSize: '11px', 
                                      minWidth: '80px',
                                      color: '#333',
                                      fontWeight: '500'
                                    } 
                                  }, `${item.option}:`),
                                  React.createElement('input', {
                                    type: 'number',
                                    step: '0.01',
                                    value: item.value || '',
                                    onChange: (e) => updateLookupItem(param.id, idx, 'value', e.target.value),
                                    style: { 
                                      width: '60px', 
                                      padding: '2px 4px', 
                                      border: '1px solid #ccc', 
                                      borderRadius: '2px',
                                      fontSize: '11px'
                                    }
                                  })
                                )
                              )
                            )
                          : React.createElement('div', null,
                              param.lookupTable.map((item, idx) => 
                                React.createElement('div', { 
                                  key: idx, 
                                  style: { 
                                    fontSize: '11px',
                                    color: '#333',
                                    backgroundColor: 'transparent',
                                    padding: '2px 0',
                                    borderBottom: '1px solid #f0f0f0'
                                  } 
                                }, `${item.option}: ${item.value}`)
                              )
                            )
                      } else {
                        // Form field parameter (no lookup table)
                        return isEditing 
                          ? React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: '4px' } },
                              React.createElement('span', { 
                                style: { fontSize: '11px', color: '#666' } 
                              }, 'Form Alanı:'),
                              React.createElement('select', {
                                value: editValues.formField || '',
                                onChange: (e) => updateEditingValue(param.id, 'formField', e.target.value),
                                style: { 
                                  width: '100%', 
                                  padding: '4px', 
                                  border: '1px solid #ccc', 
                                  borderRadius: '3px',
                                  fontSize: '12px',
                                  backgroundColor: 'white'
                                }
                              },
                                React.createElement('option', { value: '' }, '-- Alan Seçin --'),
                                formFields.map(field => 
                                  React.createElement('option', { 
                                    key: field.value, 
                                    value: field.value 
                                  }, field.label)
                                )
                              )
                            )
                          : React.createElement('div', null,
                              React.createElement('div', { 
                                style: { fontSize: '11px', color: '#333' } 
                              }, 'Form Değeri'),
                              param.formField && React.createElement('div', { 
                                style: { fontSize: '10px', color: '#666' } 
                              }, `Alan: ${param.formField}`)
                            )
                      }
                    })()
                  ),
                  
                  // Actions (Edit/Save/Cancel/Delete)
                  React.createElement('td', { style: { border: '1px solid #ddd', padding: '8px', textAlign: 'center' } },
                    React.createElement('div', { style: { display: 'flex', gap: '4px', justifyContent: 'center' } },
                      isEditing 
                        ? [
                            React.createElement('button', {
                              key: 'save',
                              onClick: () => saveEditingParameter(param.id),
                              style: { 
                                padding: '4px 8px', 
                                backgroundColor: '#28a745', 
                                color: 'white', 
                                border: 'none', 
                                borderRadius: '3px', 
                                cursor: 'pointer',
                                fontSize: '12px'
                              }
                            }, 'Kaydet'),
                            React.createElement('button', {
                              key: 'cancel',
                              onClick: () => cancelEditingParameter(param.id),
                              style: { 
                                padding: '4px 8px', 
                                backgroundColor: '#6c757d', 
                                color: 'white', 
                                border: 'none', 
                                borderRadius: '3px', 
                                cursor: 'pointer',
                                fontSize: '12px'
                              }
                            }, 'İptal')
                          ]
                        : [
                            React.createElement('button', {
                              key: 'edit',
                              onClick: () => startEditingParameter(param),
                              style: { 
                                padding: '4px 8px', 
                                backgroundColor: '#007bff', 
                                color: 'white', 
                                border: 'none', 
                                borderRadius: '3px', 
                                cursor: 'pointer',
                                fontSize: '12px'
                              }
                            }, 'Düzenle'),
                            React.createElement('button', {
                              key: 'delete',
                              onClick: () => removeParameter(param.id),
                              style: { 
                                padding: '4px 8px', 
                                backgroundColor: '#dc3545', 
                                color: 'white', 
                                border: 'none', 
                                borderRadius: '3px', 
                                cursor: 'pointer',
                                fontSize: '12px'
                              }
                            }, 'Sil')
                          ]
                    )
                  )
                )
              })
            )
          )
        ),
        
        // Add new parameter
        React.createElement('div', { style: { marginTop: '16px', padding: '16px', backgroundColor: '#f8f9fa', borderRadius: '8px' } },
          React.createElement('h4', { style: { margin: '0 0 12px 0', fontSize: '14px', color: '#333' } }, 'Yeni Parametre Ekle'),
          
          // Step 1: Parameter Type Selection
          !parameterType && React.createElement('div', { style: { marginBottom: '12px' } },
            React.createElement('p', { style: { margin: '0 0 8px 0', fontSize: '13px', color: '#333' } }, 'Parametre tipi seçin:'),
            React.createElement('div', { style: { display: 'flex', gap: '8px' } },
              React.createElement('button', {
                onClick: () => setParameterType('fixed'),
                style: { 
                  padding: '8px 16px', 
                  backgroundColor: '#007bff', 
                  color: 'white', 
                  border: 'none', 
                  borderRadius: '4px', 
                  cursor: 'pointer' 
                }
              }, 'Sabit Değer'),
              React.createElement('button', {
                onClick: () => setParameterType('form'),
                style: { 
                  padding: '8px 16px', 
                  backgroundColor: '#28a745', 
                  color: 'white', 
                  border: 'none', 
                  borderRadius: '4px', 
                  cursor: 'pointer' 
                }
              }, 'Form Verisi')
            )
          ),
          
          // Step 2: Parameter Configuration
          parameterType && React.createElement('div', null,
            React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' } },
              React.createElement('span', { style: { fontSize: '13px', color: '#666' } }, `Tip: ${parameterType === 'fixed' ? 'Sabit Değer' : 'Form Verisi'}`),
              React.createElement('button', {
                onClick: () => {
                  setParameterType('')
                  setParameterName('')
                  setFixedValue('')
                  setSelectedFormField('')
                  setLookupTable([])
                  setNewLookupOption('')
                  setNewLookupValue('')
                },
                style: { 
                  padding: '2px 6px', 
                  backgroundColor: '#6c757d', 
                  color: 'white', 
                  border: 'none', 
                  borderRadius: '3px', 
                  cursor: 'pointer',
                  fontSize: '11px'
                }
              }, 'Değiştir')
            ),
            
            React.createElement('div', { style: { display: 'grid', gridTemplateColumns: '1fr', gap: '8px' } },
              // Parameter Name (only for fixed type)
              parameterType === 'fixed' && React.createElement('div', null,
                React.createElement('label', { style: { display: 'block', marginBottom: '4px', fontSize: '12px', color: '#333' } }, 'Parametre Adı:'),
                React.createElement('input', {
                  type: 'text',
                  value: parameterName,
                  onChange: (e) => setParameterName(e.target.value),
                  placeholder: 'örn: Malzeme Katsayısı',
                  style: { width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px', color: '#333' }
                })
              ),
              
              // Fixed Value Input
              parameterType === 'fixed' && React.createElement('div', null,
                React.createElement('label', { style: { display: 'block', marginBottom: '4px', fontSize: '12px', color: '#333' } }, 'Sabit Değer:'),
                React.createElement('input', {
                  type: 'text',
                  value: fixedValue,
                  onChange: (e) => setFixedValue(e.target.value),
                  placeholder: '1.5',
                  style: { width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px', color: '#333' }
                })
              ),
              
              // Form Field Selection
              parameterType === 'form' && React.createElement('div', null,
                React.createElement('label', { style: { display: 'block', marginBottom: '4px', fontSize: '12px', color: '#333' } }, 'Form Alanı:'),
                React.createElement('select', {
                  value: selectedFormField,
                  onChange: (e) => {
                    setSelectedFormField(e.target.value)
                    setSelectedFormValue('')
                  },
                  style: { width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px', color: '#333' }
                },
                  React.createElement('option', { value: '' }, 'Alan seçiniz...'),
                  formFields.map(field => 
                    React.createElement('option', { key: field.value, value: field.value }, field.label)
                  )
                )
              ),
              
              // Lookup Table for fields with options
              parameterType === 'form' && selectedFormField && formFields.find(f => f.value === selectedFormField)?.hasOptions && React.createElement('div', { style: { marginTop: '15px', border: '1px solid #ddd', borderRadius: '5px', padding: '15px', backgroundColor: '#f9f9f9' } },
                React.createElement('h4', { style: { color: '#333', marginBottom: '10px', fontSize: '14px' } }, 'Değer Eşleştirmeleri'),
                React.createElement('div', { style: { border: '1px solid #ddd', borderRadius: '3px', backgroundColor: '#fff' } },
                  React.createElement('table', { style: { width: '100%', borderCollapse: 'collapse' } },
                    React.createElement('thead', null,
                      React.createElement('tr', null,
                        React.createElement('th', { style: { border: '1px solid #ddd', padding: '8px', backgroundColor: '#f8f9fa', fontSize: '12px', textAlign: 'left', color: '#333' } }, 'Seçenek'),
                        React.createElement('th', { style: { border: '1px solid #ddd', padding: '8px', backgroundColor: '#f8f9fa', fontSize: '12px', textAlign: 'left', color: '#333' } }, 'Değer')
                      )
                    ),
                    React.createElement('tbody', null,
                      getFieldOptions(selectedFormField).map(option => {
                        const existingValue = lookupTable.find(item => item.option === option)?.value || ''
                        return React.createElement('tr', { key: option },
                          React.createElement('td', { style: { border: '1px solid #ddd', padding: '8px', fontSize: '12px', color: '#333' } }, option),
                          React.createElement('td', { style: { border: '1px solid #ddd', padding: '4px' } },
                            React.createElement('input', {
                              type: 'number',
                              step: 'any',
                              value: existingValue,
                              onChange: (e) => {
                                const value = e.target.value
                                setLookupTable(prev => {
                                  const filtered = prev.filter(item => item.option !== option)
                                  if (value !== '') {
                                    return [...filtered, { option, value: parseFloat(value) || 0 }]
                                  }
                                  return filtered
                                })
                              },
                              style: { width: '100%', padding: '4px', border: '1px solid #ccc', borderRadius: '3px', fontSize: '12px', color: '#333' }
                            })
                          )
                        )
                      })
                    )
                  )
                )
              ),
              
              // Add Parameter Button
              React.createElement('div', { style: { marginTop: '8px' } },
                React.createElement('button', {
                  onClick: addParameter,
                  disabled: (parameterType === 'fixed' && (!parameterName || !fixedValue)) || 
                    (parameterType === 'form' && !selectedFormField),
                  style: { 
                    padding: '8px 16px', 
                    backgroundColor: '#28a745', 
                    color: 'white', 
                    border: 'none', 
                    borderRadius: '4px', 
                    cursor: 'pointer',
                    opacity: ((parameterType === 'fixed' && (!parameterName || !fixedValue)) || 
                      (parameterType === 'form' && !selectedFormField)) ? 0.5 : 1
                  }
                }, '+ Parametre Ekle')
              )
            )
          )
        )
      ),

      // Formula section
      React.createElement('div', { style: { marginBottom: '24px' } },
        React.createElement('h3', { style: { marginBottom: '16px', fontSize: '16px', color: '#333' } }, 'Fiyat Hesaplama Formülü'),
        React.createElement('div', { style: { marginBottom: '12px' } },
          React.createElement('textarea', {
            value: formula,
            onChange: (e) => {
              let value = e.target.value
              // Ensure formula starts with =
              if (value && !value.startsWith('=')) {
                value = '=' + value
              }
              setFormula(value)
            },
            placeholder: 'Excel formülü yazın (örn: =A*B*C+D)',
            style: { 
              width: '100%', 
              padding: '12px', 
              border: '1px solid #ddd', 
              borderRadius: '4px', 
              minHeight: '80px',
              fontFamily: 'monospace',
              fontSize: '14px',
              color: '#333'
            }
          })
        ),
        React.createElement('div', { style: { fontSize: '12px', color: '#666', marginBottom: '8px' } },
          'Excel formül formatında yazın. Parametreleri A, B, C... şeklinde kullanın. Örnek: =A*B*SQRT(C)+D^2'
        ),
        // Formula Validator Component
        React.createElement(FormulaValidator, {
          formula: formula,
          parameters: parameters,
          onValidation: handleFormulaValidation
        })
      ),

      // Action buttons
      React.createElement('div', { style: { display: 'flex', gap: '12px', justifyContent: 'flex-end' } },
        React.createElement('button', {
          onClick: onClose,
          style: { 
            padding: '10px 20px', 
            backgroundColor: '#6c757d', 
            color: 'white', 
            border: 'none', 
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '14px'
          }
        }, 'İptal'),
        React.createElement('button', {
          onClick: saveSettings,
          style: { 
            padding: '10px 20px', 
            backgroundColor: '#007bff', 
            color: 'white', 
            border: 'none', 
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '14px'
          }
        }, 'Kaydet')
      )
    )
  )
}

export default SettingsModal
