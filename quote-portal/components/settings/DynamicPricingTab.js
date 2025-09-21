// Dynamic Pricing Tab Component - Completely redesigned dynamic pricing system
import API from '../../lib/api.js'
import FormulaValidator from '../SimpleFormulaValidator.js'
import PricingUtils from '../../lib/pricing-utils.js'
import EnhancedFormulaEditor from '../forms/EnhancedFormulaEditor.js'

const ReactGlobal = typeof React !== 'undefined' ? React : (typeof window !== 'undefined' ? window.React : undefined)
const { useState, useEffect } = ReactGlobal

function DynamicPricingTab({ t, showNotification }) {
  const [parameters, setParameters] = useState([])
  const [formula, setFormula] = useState('')
  const [userFormula, setUserFormula] = useState('') // Kullanıcı dostu formül (A, B, C...)
  const [parameterType, setParameterType] = useState('')
  const [parameterName, setParameterName] = useState('')
  const [fixedValue, setFixedValue] = useState('')
  const [selectedFormField, setSelectedFormField] = useState('')
  const [lookupTable, setLookupTable] = useState([])
  const [newLookupOption, setNewLookupOption] = useState('')
  const [newLookupValue, setNewLookupValue] = useState('')
  const [formulaValidation, setFormulaValidation] = useState(null)
  const [isFormulaValid, setIsFormulaValid] = useState(true)
  const [showFormulaInfo, setShowFormulaInfo] = useState(false)
  const [idMapping, setIdMapping] = useState({ backendToUser: {}, userToBackend: {} })
  
  // Dinamik form alanları
  const [formFields, setFormFields] = useState([])
  const [isLoadingFields, setIsLoadingFields] = useState(true)

  useEffect(() => {
    loadDynamicFormFields()
    loadPriceSettings()
  }, [])

  // Form alanlarını dinamik olarak yükle
  async function loadDynamicFormFields() {
    setIsLoadingFields(true)
    try {
      const response = await API.getFormFields()
      const dynamicFields = PricingUtils.extractFieldInfoFromFormConfig(response.fields)
      setFormFields(dynamicFields)
    } catch (e) {
      console.error('Form fields load error:', e)
      showNotification('Form alanları yüklenemedi!', 'error')
      // Fallback olarak boş liste
      setFormFields([])
    } finally {
      setIsLoadingFields(false)
    }
  }

  async function loadPriceSettings() {
    try {
      const settings = await API.getPriceSettings()
      const loadedParameters = settings.parameters || []
      setParameters(loadedParameters)
      setFormula(settings.formula || '')
      
      // ID mapping'i güncelle ve kullanıcı dostu formülü ayarla
      const mapping = PricingUtils.createUserFriendlyIdMapping(loadedParameters)
      setIdMapping(mapping)
      const userFriendlyFormula = PricingUtils.convertFormulaToUserFriendly(settings.formula || '', mapping)
      setUserFormula(userFriendlyFormula)
    } catch (e) {
      console.error('Price settings load error:', e)
    }
  }

  async function savePriceSettings() {
    try {
      // Kullanıcı formülünü backend formatına çevir
      const backendFormula = PricingUtils.convertFormulaToBackend(userFormula, idMapping)
      
      await API.savePriceSettings({ parameters, formula: backendFormula })
      showNotification('Fiyat ayarları kaydedildi!', 'success')
    } catch (e) {
      console.error('Price settings save error:', e)
      showNotification('Fiyat ayarları kaydedilemedi!', 'error')
    }
  }

  function addParameter() {
    const validationErrors = PricingUtils.validateParameter({
      name: parameterName,
      type: parameterType,
      value: parameterType === 'fixed' ? parseFloat(fixedValue) : undefined,
      formField: parameterType === 'form' ? selectedFormField : undefined
    }, formFields)

    if (validationErrors.length > 0) {
      showNotification(validationErrors[0], 'error')
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

    const updatedParameters = [...parameters, newParam]
    setParameters(updatedParameters)
    
    // ID mapping'i güncelle
    const newMapping = PricingUtils.createUserFriendlyIdMapping(updatedParameters)
    setIdMapping(newMapping)
    
    // Kullanıcı formülünü güncelle
    const currentBackendFormula = PricingUtils.convertFormulaToBackend(userFormula, idMapping)
    const updatedUserFormula = PricingUtils.convertFormulaToUserFriendly(currentBackendFormula, newMapping)
    setUserFormula(updatedUserFormula)
    
    // Form'u sıfırla
    resetParameterForm()
  }

  function deleteParameter(paramId) {
    const updatedParameters = parameters.filter(p => p.id !== paramId)
    setParameters(updatedParameters)
    
    // ID mapping'i güncelle
    const newMapping = PricingUtils.createUserFriendlyIdMapping(updatedParameters)
    setIdMapping(newMapping)
    
    // Kullanıcı formülünü güncelle
    const currentBackendFormula = PricingUtils.convertFormulaToBackend(userFormula, idMapping)
    const updatedUserFormula = PricingUtils.convertFormulaToUserFriendly(currentBackendFormula, newMapping)
    setUserFormula(updatedUserFormula)
  }

  function resetParameterForm() {
    setParameterName('')
    setFixedValue('')
    setSelectedFormField('')
    setLookupTable([])
    setParameterType('')
    setNewLookupOption('')
    setNewLookupValue('')
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

  function handleUserFormulaChange(newUserFormula) {
    setUserFormula(newUserFormula)
    
    // Backend formülünü güncelle
    const backendFormula = PricingUtils.convertFormulaToBackend(newUserFormula, idMapping)
    setFormula(backendFormula)
  }

  async function validateFormula() {
    if (!userFormula) {
      setFormulaValidation(null)
      setIsFormulaValid(true)
      return
    }

    // Önce kullanıcı dostu formülü validate et
    const userValidation = PricingUtils.validateUserFriendlyFormula(userFormula, parameters)
    
    if (!userValidation.isValid) {
      setFormulaValidation({
        isValid: false,
        message: userValidation.errors.join(', '),
        suggestions: [`Kullanılabilir parametreler: ${userValidation.availableLetters.join(', ')}`]
      })
      setIsFormulaValid(false)
      return
    }

    // Backend formülünü validate et
    const backendFormula = PricingUtils.convertFormulaToBackend(userFormula, idMapping)
    const validator = FormulaValidator
    const result = await validator.validateFormula(backendFormula, parameters)
    
    setFormulaValidation(result)
    setIsFormulaValid(result.isValid)
  }

  useEffect(() => {
    validateFormula()
  }, [userFormula, parameters])

  // Parametre tablosundaki kullanıcı dostu ID'leri göster
  function getParameterDisplayId(param, index) {
    return idMapping.backendToUser[param.id] || String.fromCharCode(65 + index)
  }

  return ReactGlobal.createElement(ReactGlobal.Fragment, null,
    // Başlık ve açıklama
    ReactGlobal.createElement('div', { className: 'card', style: { marginBottom: '20px', backgroundColor: '#f8f9fa' } },
      ReactGlobal.createElement('h2', null, '🔧 Dinamik Fiyatlandırma Sistemi'),
      ReactGlobal.createElement('p', { style: { margin: '10px 0', color: '#666' } },
        'Form verilerinize dayalı dinamik fiyatlandırma parametreleri oluşturun. Parametreler otomatik olarak A, B, C... harfleriyle etiketlenir.'
      )
    ),

    // Parameters section
    ReactGlobal.createElement('div', { className: 'card', style: { marginBottom: '20px' } },
      ReactGlobal.createElement('h3', null, '📊 Fiyat Parametreleri'),
      
      isLoadingFields && ReactGlobal.createElement('div', { className: 'alert alert-info' },
        'Form alanları yükleniyor...'
      ),
      
      !isLoadingFields && ReactGlobal.createElement(ReactGlobal.Fragment, null,
        // Add parameter form
        ReactGlobal.createElement('div', { className: 'form-group' },
          ReactGlobal.createElement('label', null, 'Parametre Türü'),
          ReactGlobal.createElement('select', {
            value: parameterType,
            onChange: (e) => setParameterType(e.target.value),
            className: 'form-control'
          },
            ReactGlobal.createElement('option', { value: '' }, 'Seçiniz...'),
            ReactGlobal.createElement('option', { value: 'fixed' }, '🔢 Sabit Değer'),
            ReactGlobal.createElement('option', { value: 'form' }, '📝 Form Verisinden')
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
            placeholder: '0',
            step: '0.01'
          })
        ),

        parameterType === 'form' && ReactGlobal.createElement('div', null,
          ReactGlobal.createElement('div', { className: 'form-group' },
            ReactGlobal.createElement('label', null, 'Form Alanı'),
            formFields.length === 0 ? 
              ReactGlobal.createElement('div', { className: 'alert alert-warning' },
                'Henüz form alanı bulunmuyor. Önce Form Düzenleme menüsünden form alanları oluşturun.'
              ) :
              ReactGlobal.createElement('select', {
                value: selectedFormField,
                onChange: (e) => setSelectedFormField(e.target.value),
                className: 'form-control'
              },
                ReactGlobal.createElement('option', { value: '' }, 'Seçiniz...'),
                ...formFields.map(field =>
                  ReactGlobal.createElement('option', { key: field.value, value: field.value }, 
                    `${field.label} (${field.type})`
                  )
                )
              )
          ),

          // Lookup table for fields with options
          selectedFormField && formFields.find(f => f.value === selectedFormField)?.hasOptions && 
          ReactGlobal.createElement('div', { className: 'form-group' },
            ReactGlobal.createElement('label', null, '🔗 Değer Eşleştirme Tablosu'),
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
                style: { flex: 1 },
                step: '0.01'
              }),
              ReactGlobal.createElement('button', {
                type: 'button',
                onClick: addLookupEntry,
                className: 'btn btn-primary'
              }, 'Ekle')
            ),
            
            lookupTable.length > 0 && ReactGlobal.createElement('table', { className: 'table table-sm' },
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
          style: { marginTop: '10px' },
          disabled: formFields.length === 0 && parameterType === 'form'
        }, '➕ Parametre Ekle')
      ),

      // Parameters list with user-friendly IDs
      parameters.length > 0 && ReactGlobal.createElement('div', { style: { marginTop: '20px' } },
        ReactGlobal.createElement('h4', null, '📋 Mevcut Parametreler'),
        ReactGlobal.createElement('div', { className: 'alert alert-info', style: { fontSize: '0.9em' } },
          'Parametreler formülde A, B, C... harfleri ile kullanılır'
        ),
        ReactGlobal.createElement('table', { className: 'table' },
          ReactGlobal.createElement('thead', null,
            ReactGlobal.createElement('tr', null,
              ReactGlobal.createElement('th', null, 'Formül ID'),
              ReactGlobal.createElement('th', null, 'Ad'),
              ReactGlobal.createElement('th', null, 'Tür'),
              ReactGlobal.createElement('th', null, 'Değer/Alan'),
              ReactGlobal.createElement('th', null, 'İşlem')
            )
          ),
          ReactGlobal.createElement('tbody', null,
            ...parameters.map((param, index) =>
              ReactGlobal.createElement('tr', { key: param.id },
                ReactGlobal.createElement('td', null, 
                  ReactGlobal.createElement('strong', { style: { color: '#007bff', fontSize: '1.1em' } },
                    getParameterDisplayId(param, index)
                  )
                ),
                ReactGlobal.createElement('td', null, param.name),
                ReactGlobal.createElement('td', null, param.type === 'fixed' ? '🔢 Sabit' : '📝 Form'),
                ReactGlobal.createElement('td', null, 
                  param.type === 'fixed' ? param.value : 
                  formFields.find(f => f.value === param.formField)?.label || param.formField
                ),
                ReactGlobal.createElement('td', null,
                  ReactGlobal.createElement('button', {
                    onClick: () => deleteParameter(param.id),
                    className: 'btn btn-sm btn-danger'
                  }, '🗑️ Sil')
                )
              )
            )
          )
        )
      )
    ),

    // Formula section with user-friendly interface
    ReactGlobal.createElement('div', { className: 'card' },
      ReactGlobal.createElement('h3', null, '🧮 Fiyat Hesaplama Formülü'),
      
      parameters.length > 0 && ReactGlobal.createElement('div', { className: 'alert alert-success', style: { fontSize: '0.9em' } },
        ReactGlobal.createElement('strong', null, 'Kullanılabilir Parametreler: '),
        Object.values(idMapping.backendToUser).join(', ')
      ),
      
      ReactGlobal.createElement('div', { className: 'form-group' },
        ReactGlobal.createElement('label', null, 'Formül (A, B, C... kullanın)'),
        ReactGlobal.createElement(EnhancedFormulaEditor, {
          value: userFormula,
          onChange: handleUserFormulaChange,
          parameters: parameters,
          placeholder: 'Örn: A * B * SQRT(C) + 100',
          disabled: false
        }),
        
        ReactGlobal.createElement('div', { style: { display: 'flex', gap: '10px', marginTop: '5px' } },
          ReactGlobal.createElement('button', {
            onClick: () => setShowFormulaInfo(!showFormulaInfo),
            className: 'btn btn-link',
            style: { padding: '5px 0' }
          }, showFormulaInfo ? '❌ Yardımı Gizle' : '❓ Formül Yardımı'),
          
          parameters.length > 0 && ReactGlobal.createElement('button', {
            onClick: () => setUserFormula('A * B'),
            className: 'btn btn-link',
            style: { padding: '5px 0' }
          }, '📝 Örnek Formül Ekle')
        )
      ),

      // Formula validation feedback
      formulaValidation && ReactGlobal.createElement('div', { 
        className: `alert ${formulaValidation.isValid ? 'alert-success' : 'alert-danger'}`,
        style: { marginTop: '10px' }
      },
        ReactGlobal.createElement('strong', null, formulaValidation.isValid ? '✅ Formül Geçerli' : '❌ Formül Hatası'),
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
        ReactGlobal.createElement('h5', null, '📚 Kullanılabilir Fonksiyonlar:'),
        ReactGlobal.createElement('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px' } },
          ReactGlobal.createElement('div', null,
            ReactGlobal.createElement('strong', null, 'Matematik:'),
            ReactGlobal.createElement('br', null), 'SQRT, ROUND, MAX, MIN, ABS, POWER'
          ),
          ReactGlobal.createElement('div', null,
            ReactGlobal.createElement('strong', null, 'Yuvarlama:'),
            ReactGlobal.createElement('br', null), 'CEIL, FLOOR, ROUNDUP, ROUNDDOWN'
          ),
          ReactGlobal.createElement('div', null,
            ReactGlobal.createElement('strong', null, 'Mantık:'),
            ReactGlobal.createElement('br', null), 'IF, AND, OR, NOT'
          ),
          ReactGlobal.createElement('div', null,
            ReactGlobal.createElement('strong', null, 'Sabitler:'),
            ReactGlobal.createElement('br', null), 'PI, E'
          )
        ),
        ReactGlobal.createElement('div', { style: { marginTop: '10px', padding: '10px', backgroundColor: '#e9ecef', borderRadius: '4px' } },
          ReactGlobal.createElement('strong', null, 'Örnek Formüller:'),
          ReactGlobal.createElement('ul', { style: { marginBottom: 0, marginTop: '5px' } },
            ReactGlobal.createElement('li', null, 'Basit: A * B + C'),
            ReactGlobal.createElement('li', null, 'Karmaşık: A * SQRT(B) + IF(C > 10, 50, 0)'),
            ReactGlobal.createElement('li', null, 'Yüzde: A * (1 + B/100)')
          )
        )
      ),

      ReactGlobal.createElement('button', {
        onClick: savePriceSettings,
        className: 'btn btn-success btn-lg',
        style: { marginTop: '15px', width: '100%' },
        disabled: !isFormulaValid || parameters.length === 0
      }, '💾 Fiyat Ayarlarını Kaydet')
    )
  )
}

export default DynamicPricingTab