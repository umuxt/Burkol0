// Pricing Tab Component - Price parameter and formula management
import React from 'react';
import API from '../../../shared/lib/api.js'
import FormulaValidator from '../SimpleFormulaValidator.js'

const { useState, useEffect } = React;

function PricingTab({ t, showNotification }) {
  const [parameters, setParameters] = useState([])
  const [formula, setFormula] = useState('')
  const [parameterType, setParameterType] = useState('')
  const [parameterName, setParameterName] = useState('')
  const [fixedValue, setFixedValue] = useState('')
  const [selectedFormField, setSelectedFormField] = useState('')
  const [selectedFormValue, setSelectedFormValue] = useState('')
  const [lookupTable, setLookupTable] = useState([])
  const [newLookupOption, setNewLookupOption] = useState('')
  const [newLookupValue, setNewLookupValue] = useState('')
  const [editingParams, setEditingParams] = useState({})
  const [editingValues, setEditingValues] = useState({})
  const [formulaValidation, setFormulaValidation] = useState(null)
  const [isFormulaValid, setIsFormulaValid] = useState(true)
  const [showFormulaInfo, setShowFormulaInfo] = useState(false)

  // Form fields available for selection
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
    { value: 'product', label: 'Ürün Tipi', hasOptions: true }
  ]

  useEffect(() => {
    loadPriceSettings()
  }, [])

  async function loadPriceSettings() {
    try {
      const settings = await API.getPriceSettings()
      setParameters(settings.parameters || [])
      setFormula(settings.formula || '')
    } catch (e) {
      console.error('Price settings load error:', e)
    }
  }

  async function savePriceSettings() {
    try {
      await API.savePriceSettings({ parameters, formula })
      showNotification('Fiyat ayarları kaydedildi!', 'success')
    } catch (e) {
      console.error('Price settings save error:', e)
      showNotification('Fiyat ayarları kaydedilemedi!', 'error')
    }
  }

  function addParameter() {
    if (!parameterName.trim()) {
      showNotification('Parametre adı gerekli!', 'error')
      return
    }

    const newParam = {
      id: parameterName.toLowerCase().replace(/[^a-z0-9]/g, '_'),
      name: parameterName,
      type: parameterType
    }

    if (parameterType === 'fixed') {
      newParam.value = parseFloat(fixedValue) || 0
    } else if (parameterType === 'form') {
      newParam.formField = selectedFormField
      if (lookupTable.length > 0) {
        newParam.lookupTable = [...lookupTable]
      }
    }

    setParameters([...parameters, newParam])
    
    // Reset form
    setParameterName('')
    setFixedValue('')
    setSelectedFormField('')
    setSelectedFormValue('')
    setLookupTable([])
    setParameterType('')
  }

  function deleteParameter(paramId) {
    setParameters(parameters.filter(p => p.id !== paramId))
  }

  function addLookupEntry() {
    if (!newLookupOption.trim() || !newLookupValue.trim()) {
      showNotification('Seçenek ve değer gerekli!', 'error')
      return
    }

    setLookupTable([...lookupTable, {
      option: newLookupOption,
      value: parseFloat(newLookupValue) || 0
    }])

    setNewLookupOption('')
    setNewLookupValue('')
  }

  function removeLookupEntry(index) {
    setLookupTable(lookupTable.filter((_, i) => i !== index))
  }

  async function validateFormula() {
    if (!formula) {
      setFormulaValidation(null)
      setIsFormulaValid(true)
      return
    }

    const validator = FormulaValidator
    const result = await validator.validateFormula(formula, parameters)
    
    setFormulaValidation(result)
    setIsFormulaValid(result.isValid)
  }

  useEffect(() => {
    validateFormula()
  }, [formula, parameters])

  return React.createElement(React.Fragment, null,
    // Parameters section
    React.createElement('div', { className: 'card', style: { marginBottom: '20px' } },
      React.createElement('h3', null, 'Fiyat Parametreleri'),
      
      // Add parameter form
      React.createElement('div', { className: 'form-group' },
        React.createElement('label', null, 'Parametre Türü'),
        React.createElement('select', {
          value: parameterType,
          onChange: (e) => setParameterType(e.target.value),
          className: 'form-control'
        },
          React.createElement('option', { value: '' }, 'Seçiniz...'),
          React.createElement('option', { value: 'fixed' }, 'Sabit Değer'),
          React.createElement('option', { value: 'form' }, 'Form Alanından')
        )
      ),

      parameterType && React.createElement('div', { className: 'form-group' },
        React.createElement('label', null, 'Parametre Adı'),
        React.createElement('input', {
          type: 'text',
          value: parameterName,
          onChange: (e) => setParameterName(e.target.value),
          className: 'form-control',
          placeholder: 'Örn: materyalKatsayisi'
        })
      ),

      parameterType === 'fixed' && React.createElement('div', { className: 'form-group' },
        React.createElement('label', null, 'Sabit Değer'),
        React.createElement('input', {
          type: 'number',
          value: fixedValue,
          onChange: (e) => setFixedValue(e.target.value),
          className: 'form-control',
          placeholder: '0'
        })
      ),

      parameterType === 'form' && React.createElement('div', null,
        React.createElement('div', { className: 'form-group' },
          React.createElement('label', null, 'Form Alanı'),
          React.createElement('select', {
            value: selectedFormField,
            onChange: (e) => setSelectedFormField(e.target.value),
            className: 'form-control'
          },
            React.createElement('option', { value: '' }, 'Seçiniz...'),
            ...formFields.map(field =>
              React.createElement('option', { key: field.value, value: field.value }, field.label)
            )
          )
        ),

        // Lookup table for fields with options
        selectedFormField && formFields.find(f => f.value === selectedFormField)?.hasOptions && 
        React.createElement('div', { className: 'form-group' },
          React.createElement('label', null, 'Değer Eşleştirme Tablosu'),
          React.createElement('div', { style: { display: 'flex', gap: '8px', marginBottom: '8px' } },
            React.createElement('input', {
              type: 'text',
              value: newLookupOption,
              onChange: (e) => setNewLookupOption(e.target.value),
              placeholder: 'Seçenek',
              className: 'form-control',
              style: { flex: 1 }
            }),
            React.createElement('input', {
              type: 'number',
              value: newLookupValue,
              onChange: (e) => setNewLookupValue(e.target.value),
              placeholder: 'Değer',
              className: 'form-control',
              style: { flex: 1 }
            }),
            React.createElement('button', {
              type: 'button',
              onClick: addLookupEntry,
              className: 'btn btn-primary'
            }, 'Ekle')
          ),
          
          lookupTable.length > 0 && React.createElement('table', { className: 'table' },
            React.createElement('thead', null,
              React.createElement('tr', null,
                React.createElement('th', null, 'Seçenek'),
                React.createElement('th', null, 'Değer'),
                React.createElement('th', null, 'İşlem')
              )
            ),
            React.createElement('tbody', null,
              ...lookupTable.map((entry, index) =>
                React.createElement('tr', { key: index },
                  React.createElement('td', null, entry.option),
                  React.createElement('td', null, entry.value),
                  React.createElement('td', null,
                    React.createElement('button', {
                      onClick: () => removeLookupEntry(index),
                      className: 'btn btn-sm btn-danger'
                    }, 'Sil')
                  )
                )
              )
            )
          )
        )
      ),

      parameterType && React.createElement('button', {
        onClick: addParameter,
        className: 'btn btn-primary',
        style: { marginTop: '10px' }
      }, 'Parametre Ekle'),

      // Parameters list
      parameters.length > 0 && React.createElement('div', { style: { marginTop: '20px' } },
        React.createElement('h4', null, 'Mevcut Parametreler'),
        React.createElement('table', { className: 'table' },
          React.createElement('thead', null,
            React.createElement('tr', null,
              React.createElement('th', null, 'ID'),
              React.createElement('th', null, 'Ad'),
              React.createElement('th', null, 'Tür'),
              React.createElement('th', null, 'Değer/Alan'),
              React.createElement('th', null, 'İşlem')
            )
          ),
          React.createElement('tbody', null,
            ...parameters.map(param =>
              React.createElement('tr', { key: param.id },
                React.createElement('td', null, param.id),
                React.createElement('td', null, param.name),
                React.createElement('td', null, param.type === 'fixed' ? 'Sabit' : 'Form'),
                React.createElement('td', null, 
                  param.type === 'fixed' ? param.value : param.formField
                ),
                React.createElement('td', null,
                  React.createElement('button', {
                    onClick: () => deleteParameter(param.id),
                    className: 'btn btn-sm btn-danger'
                  }, 'Sil')
                )
              )
            )
          )
        )
      )
    ),

    // Formula section
    React.createElement('div', { className: 'card' },
      React.createElement('h3', null, 'Fiyat Hesaplama Formülü'),
      
      React.createElement('div', { className: 'form-group' },
        React.createElement('label', null, 'Formül'),
        React.createElement('textarea', {
          value: formula,
          onChange: (e) => setFormula(e.target.value),
          className: `form-control ${!isFormulaValid ? 'error' : ''}`,
          rows: 3,
          placeholder: 'Örn: materyalKatsayisi * qty * SQRT(thickness) + islemFiyati'
        }),
        
        React.createElement('button', {
          onClick: () => setShowFormulaInfo(!showFormulaInfo),
          className: 'btn btn-link',
          style: { padding: '5px 0' }
        }, showFormulaInfo ? 'Yardımı Gizle' : 'Formül Yardımı Göster')
      ),

      // Formula validation feedback
      formulaValidation && React.createElement('div', { 
        className: `alert ${formulaValidation.isValid ? 'alert-success' : 'alert-danger'}`,
        style: { marginTop: '10px' }
      },
        React.createElement('strong', null, formulaValidation.isValid ? 'Formül Geçerli' : 'Formül Hatası'),
        formulaValidation.message && React.createElement('div', null, formulaValidation.message),
        formulaValidation.suggestions && formulaValidation.suggestions.length > 0 && 
        React.createElement('ul', { style: { marginTop: '5px', marginBottom: 0 } },
          ...formulaValidation.suggestions.map((suggestion, index) =>
            React.createElement('li', { key: index }, suggestion)
          )
        )
      ),

      // Formula info panel
      showFormulaInfo && React.createElement('div', { 
        className: 'alert alert-info',
        style: { marginTop: '10px' }
      },
        React.createElement('h5', null, 'Kullanılabilir Fonksiyonlar:'),
        React.createElement('ul', null,
          React.createElement('li', null, 'Matematik: SQRT, ROUND, MAX, MIN, ABS, POWER'),
          React.createElement('li', null, 'Trigonometri: SIN, COS, TAN'),
          React.createElement('li', null, 'Yuvarlama: CEIL, FLOOR, ROUNDUP, ROUNDDOWN'),
          React.createElement('li', null, 'İstatistik: AVERAGE, SUM, COUNT'),
          React.createElement('li', null, 'Mantık: IF, AND, OR, NOT'),
          React.createElement('li', null, 'İş Mantığı: MARGIN, DISCOUNT, VAT'),
          React.createElement('li', null, 'Sabitler: PI, E')
        )
      ),

      React.createElement('button', {
        onClick: savePriceSettings,
        className: 'btn btn-success',
        style: { marginTop: '15px' },
        disabled: !isFormulaValid
      }, 'Fiyat Ayarlarını Kaydet')
    )
  )
}

export default PricingTab