// Pricing Tab Component - Price parameter and formula management
import API from '../../lib/api.js'
import FormulaValidator from '../SimpleFormulaValidator.js'

const ReactGlobal = typeof React !== 'undefined' ? React : (typeof window !== 'undefined' ? window.React : undefined)
const { useState, useEffect } = ReactGlobal

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

  function validateFormula() {
    if (!formula) {
      setFormulaValidation(null)
      setIsFormulaValid(true)
      return
    }

    const validator = FormulaValidator
    const result = validator.validateFormula(formula, parameters)
    
    setFormulaValidation(result)
    setIsFormulaValid(result.isValid)
  }

  useEffect(() => {
    validateFormula()
  }, [formula, parameters])

  return ReactGlobal.createElement('div', { className: 'pricing-tab' },
    // Parameters section
    ReactGlobal.createElement('div', { className: 'card', style: { marginBottom: '20px' } },
      ReactGlobal.createElement('h3', null, 'Fiyat Parametreleri'),
      
      // Add parameter form
      ReactGlobal.createElement('div', { className: 'form-group' },
        ReactGlobal.createElement('label', null, 'Parametre Türü'),
        ReactGlobal.createElement('select', {
          value: parameterType,
          onChange: (e) => setParameterType(e.target.value),
          className: 'form-control'
        },
          ReactGlobal.createElement('option', { value: '' }, 'Seçiniz...'),
          ReactGlobal.createElement('option', { value: 'fixed' }, 'Sabit Değer'),
          ReactGlobal.createElement('option', { value: 'form' }, 'Form Alanından')
        )
      ),

      parameterType && ReactGlobal.createElement('div', { className: 'form-group' },
        ReactGlobal.createElement('label', null, 'Parametre Adı'),
        ReactGlobal.createElement('input', {
          type: 'text',
          value: parameterName,
          onChange: (e) => setParameterName(e.target.value),
          className: 'form-control',
          placeholder: 'Örn: materyalKatsayisi, islemFiyati'
        })
      ),

      parameterType === 'fixed' && ReactGlobal.createElement('div', { className: 'form-group' },
        ReactGlobal.createElement('label', null, 'Sabit Değer'),
        ReactGlobal.createElement('input', {
          type: 'number',
          value: fixedValue,
          onChange: (e) => setFixedValue(e.target.value),
          className: 'form-control',
          placeholder: '0'
        })
      ),

      parameterType === 'form' && ReactGlobal.createElement('div', null,
        ReactGlobal.createElement('div', { className: 'form-group' },
          ReactGlobal.createElement('label', null, 'Form Alanı'),
          ReactGlobal.createElement('select', {
            value: selectedFormField,
            onChange: (e) => setSelectedFormField(e.target.value),
            className: 'form-control'
          },
            ReactGlobal.createElement('option', { value: '' }, 'Seçiniz...'),
            ...formFields.map(field =>
              ReactGlobal.createElement('option', { key: field.value, value: field.value }, field.label)
            )
          )
        ),

        // Lookup table for fields with options
        selectedFormField && formFields.find(f => f.value === selectedFormField)?.hasOptions && 
        ReactGlobal.createElement('div', { className: 'form-group' },
          ReactGlobal.createElement('label', null, 'Değer Eşleştirme Tablosu'),
          ReactGlobal.createElement('div', { style: { display: 'flex', gap: '8px', marginBottom: '8px' } },
            ReactGlobal.createElement('input', {
              type: 'text',
              value: newLookupOption,
              onChange: (e) => setNewLookupOption(e.target.value),
              placeholder: 'Seçenek',
              className: 'form-control',
              style: { flex: 1 }
            }),
            ReactGlobal.createElement('input', {
              type: 'number',
              value: newLookupValue,
              onChange: (e) => setNewLookupValue(e.target.value),
              placeholder: 'Değer',
              className: 'form-control',
              style: { flex: 1 }
            }),
            ReactGlobal.createElement('button', {
              type: 'button',
              onClick: addLookupEntry,
              className: 'btn btn-primary'
            }, 'Ekle')
          ),
          
          lookupTable.length > 0 && ReactGlobal.createElement('table', { className: 'table' },
            ReactGlobal.createElement('thead', null,
              ReactGlobal.createElement('tr', null,
                ReactGlobal.createElement('th', null, 'Seçenek'),
                ReactGlobal.createElement('th', null, 'Değer'),
                ReactGlobal.createElement('th', null, 'İşlem')
              )
            ),
            ReactGlobal.createElement('tbody', null,
              ...lookupTable.map((entry, index) =>
                ReactGlobal.createElement('tr', { key: index },
                  ReactGlobal.createElement('td', null, entry.option),
                  ReactGlobal.createElement('td', null, entry.value),
                  ReactGlobal.createElement('td', null,
                    ReactGlobal.createElement('button', {
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

      parameterType && ReactGlobal.createElement('button', {
        onClick: addParameter,
        className: 'btn btn-primary',
        style: { marginTop: '10px' }
      }, 'Parametre Ekle'),

      // Parameters list
      parameters.length > 0 && ReactGlobal.createElement('div', { style: { marginTop: '20px' } },
        ReactGlobal.createElement('h4', null, 'Mevcut Parametreler'),
        ReactGlobal.createElement('table', { className: 'table' },
          ReactGlobal.createElement('thead', null,
            ReactGlobal.createElement('tr', null,
              ReactGlobal.createElement('th', null, 'ID'),
              ReactGlobal.createElement('th', null, 'Ad'),
              ReactGlobal.createElement('th', null, 'Tür'),
              ReactGlobal.createElement('th', null, 'Değer/Alan'),
              ReactGlobal.createElement('th', null, 'İşlem')
            )
          ),
          ReactGlobal.createElement('tbody', null,
            ...parameters.map(param =>
              ReactGlobal.createElement('tr', { key: param.id },
                ReactGlobal.createElement('td', null, param.id),
                ReactGlobal.createElement('td', null, param.name),
                ReactGlobal.createElement('td', null, param.type === 'fixed' ? 'Sabit' : 'Form'),
                ReactGlobal.createElement('td', null, 
                  param.type === 'fixed' ? param.value : param.formField
                ),
                ReactGlobal.createElement('td', null,
                  ReactGlobal.createElement('button', {
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
    ReactGlobal.createElement('div', { className: 'card' },
      ReactGlobal.createElement('h3', null, 'Fiyat Hesaplama Formülü'),
      
      ReactGlobal.createElement('div', { className: 'form-group' },
        ReactGlobal.createElement('label', null, 'Formül'),
        ReactGlobal.createElement('textarea', {
          value: formula,
          onChange: (e) => setFormula(e.target.value),
          className: `form-control ${!isFormulaValid ? 'error' : ''}`,
          rows: 3,
          placeholder: 'Örn: materyalKatsayisi * qty * SQRT(thickness) + islemFiyati'
        }),
        
        ReactGlobal.createElement('button', {
          onClick: () => setShowFormulaInfo(!showFormulaInfo),
          className: 'btn btn-link',
          style: { padding: '5px 0' }
        }, showFormulaInfo ? 'Yardımı Gizle' : 'Formül Yardımı Göster')
      ),

      // Formula validation feedback
      formulaValidation && ReactGlobal.createElement('div', { 
        className: `alert ${formulaValidation.isValid ? 'alert-success' : 'alert-danger'}`,
        style: { marginTop: '10px' }
      },
        ReactGlobal.createElement('strong', null, formulaValidation.isValid ? 'Formül Geçerli' : 'Formül Hatası'),
        formulaValidation.message && ReactGlobal.createElement('div', null, formulaValidation.message),
        formulaValidation.suggestions && formulaValidation.suggestions.length > 0 && 
        ReactGlobal.createElement('ul', { style: { marginTop: '5px', marginBottom: 0 } },
          ...formulaValidation.suggestions.map((suggestion, index) =>
            ReactGlobal.createElement('li', { key: index }, suggestion)
          )
        )
      ),

      // Formula info panel
      showFormulaInfo && ReactGlobal.createElement('div', { 
        className: 'alert alert-info',
        style: { marginTop: '10px' }
      },
        ReactGlobal.createElement('h5', null, 'Kullanılabilir Fonksiyonlar:'),
        ReactGlobal.createElement('ul', null,
          ReactGlobal.createElement('li', null, 'Matematik: SQRT, ROUND, MAX, MIN, ABS, POWER'),
          ReactGlobal.createElement('li', null, 'Trigonometri: SIN, COS, TAN'),
          ReactGlobal.createElement('li', null, 'Yuvarlama: CEIL, FLOOR, ROUNDUP, ROUNDDOWN'),
          ReactGlobal.createElement('li', null, 'İstatistik: AVERAGE, SUM, COUNT'),
          ReactGlobal.createElement('li', null, 'Mantık: IF, AND, OR, NOT'),
          ReactGlobal.createElement('li', null, 'İş Mantığı: MARGIN, DISCOUNT, VAT'),
          ReactGlobal.createElement('li', null, 'Sabitler: PI, E')
        )
      ),

      ReactGlobal.createElement('button', {
        onClick: savePriceSettings,
        className: 'btn btn-success',
        style: { marginTop: '15px' },
        disabled: !isFormulaValid
      }, 'Fiyat Ayarlarını Kaydet')
    )
  )
}

export default PricingTab