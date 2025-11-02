// Dynamic Pricing Tab Component - Completely redesigned dynamic pricing system
import React from 'react';
import API from '../../../shared/lib/api.js'
import FormulaValidator from '../SimpleFormulaValidator.js'
import PricingUtils from '../../lib/pricing-utils.js'
import EnhancedFormulaEditor from '../forms/EnhancedFormulaEditor.js'

const { useState, useEffect } = React;

function DynamicPricingTab({ t, showNotification, globalProcessing, setGlobalProcessing, checkAndProcessVersionUpdates }) {
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
  
  // Version management states
  const [versions, setVersions] = useState([])
  const [showVersionHistory, setShowVersionHistory] = useState(false)
  const [isLoadingVersions, setIsLoadingVersions] = useState(false)
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [originalData, setOriginalData] = useState({ parameters: [], formula: '' })
  
  // Dinamik form alanları
  const [formFields, setFormFields] = useState([])
  const [isLoadingFields, setIsLoadingFields] = useState(true)
  
  // Orphan parameter kontrolü
  const [systemIntegrity, setSystemIntegrity] = useState({
    isValid: true,
    canSave: true,
    canEdit: true,
    orphanParameters: [],
    orphansInFormula: [],
    warnings: [],
    errors: []
  })
  
  // Inline edit states (not used in add flow anymore)
  const [editingParamId, setEditingParamId] = useState(null)
  const [paramDraft, setParamDraft] = useState({ name: '', value: '', formField: '' })
  const [paramLookupTable, setParamLookupTable] = useState([])
  const [paramLookupEditIndex, setParamLookupEditIndex] = useState(null)
  const [paramLookupDraft, setParamLookupDraft] = useState({ value: '' })
  // Inline lookup editor simplified: direct edit inputs; no per-row edit state needed

  useEffect(() => {
    loadDynamicFormFields()
    loadPriceSettings()
  }, [])

  // Track changes for unsaved indicator
  useEffect(() => {
    const currentData = { parameters, formula: userFormula }
    const hasChanged = JSON.stringify(currentData) !== JSON.stringify(originalData)
    setHasUnsavedChanges(hasChanged)
  }, [parameters, userFormula, originalData])

  // Sistem bütünlüğü kontrolü - form alanları ve parametreler değiştiğinde
  useEffect(() => {
    if (formFields.length > 0 && parameters.length > 0) {
      const integrity = PricingUtils.validateSystemIntegrity(parameters, formFields, userFormula)
      setSystemIntegrity(integrity)
      
      if (!integrity.isValid) {
        console.warn('🚨 Sistem bütünlüğü hatası:', integrity)
      }
    }
  }, [formFields, parameters, userFormula])

  // Form alanlarını dinamik olarak yükle
  async function loadDynamicFormFields() {
    setIsLoadingFields(true)
    try {
      console.log('🔧 DEBUG: Loading form fields...')
      const response = await API.getFormFields()
      console.log('🔧 DEBUG: Raw response:', response)
      const dynamicFields = PricingUtils.extractFieldInfoFromFormConfig(response.fields)
      console.log('🔧 DEBUG: Processed fields:', dynamicFields)
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

  // selectedFormField değiştiğinde o field'ın options'larını otomatik populate et
  useEffect(() => {
    if (!selectedFormField) return

    const field = formFields.find(f => f.value === selectedFormField)
    if (!field || !field.hasOptions || !field.options) return

    // Field'ın options'larını lookup table'a otomatik ekle
    const existingOptions = lookupTable.map(item => item.option)
    const fieldOptions = field.options

    // Yeni options'ları ekle (mevcut olanları koruyarak)
    const newLookupItems = [...lookupTable]
    
    fieldOptions.forEach(option => {
      if (!existingOptions.includes(option)) {
        // Varsayılan değeri boş bırak (0 yazma)
        newLookupItems.push({ option: option, value: '' })
      }
    })

    // Sadece değişiklik varsa güncelle
    if (newLookupItems.length !== lookupTable.length) {
      setLookupTable(newLookupItems)
    }
  }, [selectedFormField, formFields, lookupTable])

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
      
      // Set original data for change tracking
      setOriginalData({ parameters: loadedParameters, formula: userFriendlyFormula })
      
      // Check system integrity
      checkSystemIntegrity(loadedParameters)
    } catch (e) {
      console.error('Price settings load error:', e)
    }
  }

  async function savePriceSettings() {
    try {
      // Önce sistem bütünlüğü kontrolü yap
      if (!systemIntegrity.canSave) {
        showNotification('Kaydetme işlemi engellenmiştir! Orphan parametreleri temizleyin.', 'error')
        return
      }
      
      // Lookup tablolarında boş veya geçersiz değer var mı kontrol et
      const hasInvalidLookup = parameters.some(p => Array.isArray(p.lookupTable) && p.lookupTable.some(it => it.value === '' || Number.isNaN(Number(it.value))))
      if (hasInvalidLookup) {
        showNotification('Eşleştirme tablosunda boş veya geçersiz değerler var. Lütfen tüm değerleri doldurun.', 'error')
        return
      }
      // Kullanıcı formülünü backend formatına çevir
      const backendFormula = PricingUtils.convertFormulaToBackend(userFormula, idMapping)
      
      // Save with versioning
      const result = await API.savePriceSettings({ parameters, formula: backendFormula })
      
      // Reset change tracking after successful save
      setOriginalData({ parameters, formula: userFormula })
      setHasUnsavedChanges(false)
      
      showNotification(`Fiyat ayarları kaydedildi! (Version ${result.version})`, 'success')
      
      // Refresh version history if visible
      if (showVersionHistory) {
        loadVersionHistory()
      }

      // Check for version updates after price settings save
      if (checkAndProcessVersionUpdates && setGlobalProcessing) {
        await checkAndProcessVersionUpdates()
      }
    } catch (e) {
      console.error('Price settings save error:', e)
      showNotification('Fiyat ayarları kaydedilemedi!', 'error')
    }
  }

  // VERSION MANAGEMENT FUNCTIONS

  async function loadVersionHistory() {
    setIsLoadingVersions(true)
    try {
      const result = await API.getPriceSettingsVersions()
      setVersions(result.versions || [])
    } catch (e) {
      console.error('Failed to load version history:', e)
      showNotification('Sürüm geçmişi yüklenemedi!', 'error')
    } finally {
      setIsLoadingVersions(false)
    }
  }

  async function restoreVersion(versionId) {
    if (!window.confirm('Bu sürümü geri yüklemek istediğinizden emin misiniz? Bu işlem yeni bir sürüm oluşturacak.')) {
      return
    }

    try {
      const result = await API.restorePriceSettingsVersion(versionId)
      showNotification(`Sürüm başarıyla geri yüklendi! (Yeni Version ${result.restoredVersion})`, 'success')
      
      // Reload current settings
      loadPriceSettings()
      
      // Refresh version history
      if (showVersionHistory) {
        loadVersionHistory()
      }
    } catch (e) {
      console.error('Version restore failed:', e)
      showNotification('Sürüm geri yüklenemedi!', 'error')
    }
  }

  function toggleVersionHistory() {
    setShowVersionHistory(!showVersionHistory)
    if (!showVersionHistory && versions.length === 0) {
      loadVersionHistory()
    }
  }

  // System integrity check
  function checkSystemIntegrity(parametersToCheck = parameters) {
    const orphans = PricingUtils.findOrphanParameters(parametersToCheck, userFormula)
    const integrity = {
      isValid: orphans.length === 0,
      canSave: orphans.length === 0,
      canEdit: orphans.length === 0,
      orphanParameters: orphans,
      orphansInFormula: [],
      warnings: orphans.length > 0 ? [`${orphans.length} orphan parametre tespit edildi`] : [],
      errors: []
    }
    setSystemIntegrity(integrity)
    return integrity
  }

  function addParameter() {
    // Orphan parametreler varsa yeni parametre eklemeyi engelle
    if (!systemIntegrity.canEdit) {
      showNotification('Orphan parametreler mevcut! Önce mevcut sorunları çözün.', 'error')
      return
    }
    
    const selectedField = formFields.find(f => f.value === selectedFormField)
    const autoNameForForm = selectedField ? (selectedField.label || selectedField.value) : ''
    const effectiveName = parameterType === 'form' ? autoNameForForm : parameterName

    const validationErrors = PricingUtils.validateParameter({
      name: effectiveName,
      type: parameterType,
      value: parameterType === 'fixed' ? parseFloat(fixedValue) : undefined,
      formField: parameterType === 'form' ? selectedFormField : undefined
    }, formFields)

    if (validationErrors.length > 0) {
      showNotification(validationErrors[0], 'error')
      return
    }

    const newParam = {
      id: parameterType === 'form'
        ? (selectedField ? selectedField.value : (effectiveName.toLowerCase().replace(/[^a-z0-9]/g, '_')))
        : (effectiveName.toLowerCase().replace(/[^a-z0-9]/g, '_')),
      name: effectiveName,
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

  // Orphan parametreleri temizleme fonksiyonu
  function removeOrphanParameter(paramId) {
    const param = parameters.find(p => p.id === paramId)
    if (!param) return
    
    // Önce formülden parametreyi kaldır
    const mapping = PricingUtils.createUserFriendlyIdMapping(parameters)
    const userLetter = mapping.backendToUser[paramId]
    
    if (userLetter && userFormula.includes(userLetter)) {
      // Kullanıcıya formül temizleme onayı iste
      const confirmRemoval = window.confirm(
        `"${param.name}" parametresi (${userLetter}) formülde kullanılıyor.\n\n` +
        `Mevcut formül: ${userFormula}\n\n` +
        `Parametreyi silmek için önce formülden "${userLetter}" harfini kaldırmanız gerekiyor.\n\n` +
        `Formülü otomatik temizlemek ister misiniz?\n` +
        `(${userLetter} → 0 ile değiştirilecek)`
      )
      
      if (confirmRemoval) {
        // Formülden parametreyi otomatik kaldır
        const cleanedFormula = userFormula.replace(new RegExp(`\\b${userLetter}\\b`, 'g'), '0')
        setUserFormula(cleanedFormula)
        showNotification(`Formül güncellendi: ${userLetter} → 0`, 'info')
      } else {
        showNotification('Önce formülden parametreyi manuel olarak kaldırın', 'warning')
        return
      }
    }
    
    // Parametreyi sil
    deleteParameter(paramId)
    showNotification(`"${param.name}" orphan parametresi temizlendi`, 'success')
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

  function updateLookupValue(index, newValue) {
    const updatedTable = [...lookupTable]
    const parsed = newValue === '' ? '' : (isNaN(parseFloat(newValue)) ? '' : parseFloat(newValue))
    updatedTable[index] = { ...updatedTable[index], value: parsed }
    setLookupTable(updatedTable)
  }

  function handleUserFormulaChange(newUserFormula) {
    setUserFormula(newUserFormula)
    
    // Backend formülünü güncelle
    const backendFormula = PricingUtils.convertFormulaToBackend(newUserFormula, idMapping)
    setFormula(backendFormula)
  }

  // Row-level edit helpers removed (direct input editing used)

  // Parameter row editing helpers
  function editParameter(param) {
    setEditingParamId(param.id)
    setParamDraft({
      name: param.name || '',
      value: param.type === 'fixed' ? (param.value ?? '') : '',
      formField: param.type === 'form' ? (param.formField || '') : ''
    })
    // For form params with options, load lookup table for editing
    const field = formFields.find(f => f.value === param.formField)
    if (param.type === 'form' && field && field.hasOptions) {
      setParamLookupTable([...(param.lookupTable || [])])
    } else {
      setParamLookupTable([])
    }
  }

  function cancelEditParameter() {
    setEditingParamId(null)
    setParamDraft({ name: '', value: '', formField: '' })
    setParamLookupTable([])
    setParamLookupEditIndex(null)
    setParamLookupDraft({ value: '' })
  }

  function saveEditParameter(param) {
    const updated = parameters.map(p => {
      if (p.id !== param.id) return p
      const patch = { ...p, name: paramDraft.name }
      if (p.type === 'fixed') {
        patch.value = paramDraft.value === '' ? 0 : (parseFloat(paramDraft.value) || 0)
      } else if (p.type === 'form') {
        // formField değişimini UI'dan kaldırıyoruz; sadece lookup değerlerini güncelleriz
        patch.formField = p.formField
        patch.lookupTable = paramLookupTable
      }
      return patch
    })
    setParameters(updated)
    cancelEditParameter()
  }

  // Helpers to edit param lookup values inline
  function paramUpdateLookupValue(index, newValue) {
    const updated = [...paramLookupTable]
    const parsed = newValue === '' ? '' : (isNaN(parseFloat(newValue)) ? '' : parseFloat(newValue))
    updated[index] = { ...updated[index], value: parsed }
    setParamLookupTable(updated)
  }

  // Removed row-level edit toggles; direct edit is active

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
        suggestions: [`${t.formula_validate_params || 'Kullanılabilir parametreler:'} ${userValidation.availableLetters.join(', ')}`]
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

  return React.createElement(React.Fragment, null,
    // Parameters section
    React.createElement('div', { className: 'card' },
      React.createElement('h3', null, '📊 Fiyat Parametreleri'),
      
      isLoadingFields && React.createElement('div', { className: 'alert alert-info' },
        '📝 Form alanları yükleniyor... Firebase\'den form konfigürasyonu çekiliyor.'
      ),
      
      !isLoadingFields && React.createElement(React.Fragment, null,
        // Add parameter form
        React.createElement('div', { className: 'form-group inline' },
          React.createElement('label', null, 'Eklenecek Parametre Türü'),
          React.createElement('select', {
            value: parameterType,
            onChange: (e) => setParameterType(e.target.value),
            className: 'form-control',
            style: { width: 'auto', minWidth: '180px', maxWidth: '200px' }
          },
            React.createElement('option', { value: '' }, t.pricing_select || 'Seçiniz...'),
            React.createElement('option', { value: 'fixed' }, '🔢 ' + (t.pricing_fixed_param || 'Sabit Değer')),
            React.createElement('option', { value: 'form' }, '📝 ' + (t.pricing_form_param || 'Form Verisinden'))
          )
        ),

        parameterType === 'fixed' && React.createElement('div', { className: 'form-group' },
          React.createElement('label', null, t.pricing_param_name || 'Parametre Adı'),
          React.createElement('input', {
            type: 'text',
            value: parameterName,
            onChange: (e) => setParameterName(e.target.value),
            className: 'form-control',
            placeholder: 'Örn: materyalKatsayisi, islemFiyati'
          })
        ),

        parameterType === 'fixed' && React.createElement('div', { className: 'form-group' },
          React.createElement('label', null, t.pricing_fixed_value || 'Sabit Değer'),
          React.createElement('input', {
            type: 'number',
            value: fixedValue,
            onChange: (e) => setFixedValue(e.target.value),
            className: 'form-control',
            placeholder: '0',
            step: '0.01'
          })
        ),

        parameterType === 'form' && React.createElement('div', null,
          React.createElement('div', { className: 'form-group' },
            React.createElement('label', null, t.pricing_form_field || 'Form Alanı'),
            formFields.length === 0 ? 
              React.createElement('div', { className: 'alert alert-warning' },
                React.createElement('strong', null, '⚠️ Form alanı bulunamadı'),
                React.createElement('br'),
                'Firebase\'de form konfigürasyonu bulunamadı. Önce Form Düzenleme menüsünden form alanları oluşturun.',
                React.createElement('br'),
                React.createElement('small', null, 'Debug: formFields.length = ', formFields.length)
              ) :
              React.createElement('div', null,
                React.createElement('div', { className: 'alert alert-success', style: { fontSize: '13px', padding: '8px', marginBottom: '8px' } },
                  `✅ ${formFields.length} form alanı Firebase'den başarıyla yüklendi`
                ),
                React.createElement('select', {
                  value: selectedFormField,
                  onChange: (e) => setSelectedFormField(e.target.value),
                  className: 'form-control'
                },
                  React.createElement('option', { value: '' }, t.pricing_select || 'Seçiniz...'),
                  ...formFields.map(field =>
                    React.createElement('option', { key: field.value, value: field.value }, 
                      `${field.label} (${field.type})`
                    )
                  )
                )
              )
          ),

          // Show auto parameter name for clarity (read-only)
          selectedFormField && React.createElement('div', { className: 'form-group' },
            React.createElement('label', null, t.pricing_param_name_auto || 'Parametre Adı (otomatik)'),
            React.createElement('input', {
              type: 'text',
              value: (formFields.find(f => f.value === selectedFormField)?.label || ''),
              readOnly: true,
              className: 'form-control'
            })
          ),

          // Lookup table for fields with options
          selectedFormField && formFields.find(f => f.value === selectedFormField)?.hasOptions && 
          React.createElement('div', { className: 'form-group' },
            React.createElement('label', null, '🔗 Değer Eşleştirme Tablosu'),
            React.createElement('div', { style: { marginBottom: '8px', fontSize: '13px', color: '#666' } },
              'Form alanındaki seçenekler otomatik olarak listelenmiştir. Sadece değerlerini güncelleyin.'
            ),
            
            lookupTable.length > 0 && React.createElement('table', { className: 'table table-sm' },
              React.createElement('thead', null,
                React.createElement('tr', null,
                  React.createElement('th', null, 'Seçenek'),
                  React.createElement('th', null, 'Değer')
                )
              ),
              React.createElement('tbody', null,
                ...lookupTable.map((entry, index) =>
                  React.createElement('tr', { key: index },
                    React.createElement('td', null, entry.option),
                    React.createElement('td', null,
                      React.createElement('input', {
                        type: 'number',
                        value: entry.value === 0 ? '' : (entry.value ?? ''),
                        onChange: (e) => updateLookupValue(index, e.target.value),
                        className: 'form-control',
                        step: '0.01',
                        style: { width: '100px' }
                      })
                    )
                  )
                )
              )
            )
          )
        ),

        parameterType && React.createElement('button', {
          onClick: addParameter,
          className: systemIntegrity.canEdit ? 'btn btn-primary' : 'btn btn-secondary',
          style: { marginTop: '6px' },
          disabled: (formFields.length === 0 && parameterType === 'form') || !systemIntegrity.canEdit
        }, systemIntegrity.canEdit ? '➕ Parametre Ekle' : '🚫 Orphan Parametreler Var - Ekleme Engellendi')
      ),

      // Parameters list with user-friendly IDs
      parameters.length > 0 && React.createElement('div', { style: { marginTop: '5px' } },
        React.createElement('h4', null, '📋 Mevcut Parametreler'),
        
        // Orphan parameter uyarı sistemi
        !systemIntegrity.isValid && React.createElement('div', { className: 'alert alert-danger', style: { marginBottom: '15px' } },
          React.createElement('h5', { style: { margin: '0 0 10px 0' } }, '🚨 SİSTEM BÜTÜNLÜK HATASI'),
          React.createElement('div', { style: { marginBottom: '10px' } },
            React.createElement('strong', null, 'Aşağıdaki parametreler artık form alanında bulunmuyor:')
          ),
          React.createElement('ul', { style: { marginBottom: '10px' } },
            ...systemIntegrity.orphanParameters.map(param => 
              React.createElement('li', { key: param.id },
                React.createElement('strong', null, param.name),
                ` → "${param.formField}" alanı mevcut değil`
              )
            )
          ),
          systemIntegrity.orphansInFormula.length > 0 && React.createElement('div', { style: { marginTop: '3px', padding: '8px', backgroundColor: '#dc3545', color: 'white', borderRadius: '4px' } },
            React.createElement('strong', null, '⚠️ Bu parametreler hala formülde kullanılıyor!'),
            React.createElement('br'),
            'Önce formülden kaldırın, sonra parametreyi silin.'
          ),
          React.createElement('div', { style: { marginTop: '3px', fontSize: '0.9em' } },
            React.createElement('strong', null, '🔒 Bloke Edilen İşlemler:'),
            React.createElement('br'),
            '• Form kaydetme engellenmiştir',
            React.createElement('br'),
            '• Yeni parametre ekleme engellenmiştir',
            React.createElement('br'),
            '• Mevcut parametreler düzenlenemez'
          )
        ),
        
        React.createElement('table', { className: 'table' },
          React.createElement('thead', null,
            React.createElement('tr', null,
              React.createElement('th', null, 'Formül ID'),
              React.createElement('th', null, 'Ad'),
              React.createElement('th', null, 'Tür'),
              React.createElement('th', null, 'Değer/Alan'),
              React.createElement('th', null, 'İşlem')
            )
          ),
          React.createElement('tbody', null,
            ...parameters.map((param, index) => {
              const isOrphan = systemIntegrity.orphanParameters.some(op => op.id === param.id)
              const rowStyle = isOrphan ? { backgroundColor: '#ffebee', border: '2px solid #f44336' } : {}
              
              return React.createElement('tr', { key: param.id, style: rowStyle },
                React.createElement('td', null, 
                  React.createElement('strong', { style: { color: '#007bff', fontSize: '1.1em' } },
                    getParameterDisplayId(param, index)
                  )
                ),
                // Name col (editable)
                React.createElement('td', null,
                  editingParamId === param.id
                    ? React.createElement('input', {
                        type: 'text',
                        value: paramDraft.name,
                        onChange: (e) => setParamDraft({ ...paramDraft, name: e.target.value }),
                        className: 'form-control',
                        placeholder: 'Parametre adı',
                        style: { padding: '1px 6px', fontSize: '0.8rem', lineHeight: '1.1', height: '24px', maxHeight: '24px' }
                      })
                    : param.name
                ),
                // Type col (read-only label)
                React.createElement('td', null, param.type === 'fixed' ? '🔢 Sabit' : '📝 Form'),
                // Value/Field col (editable by type)
                React.createElement('td', null,
                  editingParamId === param.id
                    ? (param.type === 'fixed'
                        ? React.createElement('input', {
                            type: 'number',
                            value: paramDraft.value,
                            onChange: (e) => setParamDraft({ ...paramDraft, value: e.target.value }),
                            className: 'form-control',
                            step: '0.01',
                            style: { width: '110px', padding: '1px 6px', fontSize: '0.8rem', lineHeight: '1.1', height: '24px', maxHeight: '24px' }
                          })
                        : React.createElement('select', {
                            className: 'form-control',
                            value: paramDraft.formField,
                            onChange: (e) => setParamDraft({ ...paramDraft, formField: e.target.value }),
                            style: { padding: '1px 6px', fontSize: '0.8rem', lineHeight: '1.1', height: '24px', maxHeight: '24px' }
                          },
                            React.createElement('option', { value: '' }, 'Seçiniz...'),
                            ...formFields.map(f => React.createElement('option', { key: f.value, value: f.value }, `${f.label} (${f.type})`))
                          )
                      )
                    : (param.type === 'fixed' ? param.value : 
                        (isOrphan ? React.createElement('span', { style: { color: '#f44336', fontWeight: 'bold' } },
                          '❌ ', param.formField, ' (ALAN MEVCUT DEĞİL)'
                        ) : (formFields.find(f => f.value === param.formField)?.label || param.formField))
                    )
                ),
                // Actions (Edit only for fixed or form-with-options)
                React.createElement('td', null,
                  (() => {
                    const field = formFields.find(f => f.value === param.formField)
                    const canEdit = param.type === 'fixed' || (param.type === 'form' && field && field.hasOptions)
                    if (editingParamId === param.id) {
                      return React.createElement(React.Fragment, null,
                        React.createElement('button', {
                          onClick: () => saveEditParameter(param),
                          className: 'btn btn-sm btn-success',
                          style: { marginRight: '6px' }
                        }, 'Kaydet'),
                        React.createElement('button', {
                          onClick: cancelEditParameter,
                          className: 'btn btn-sm btn-secondary'
                        }, 'İptal')
                      )
                    }
                    return React.createElement(React.Fragment, null,
                      canEdit && !isOrphan && React.createElement('button', {
                        onClick: () => editParameter(param),
                        className: 'btn btn-sm btn-primary',
                        style: { marginRight: '6px', marginTop: '2px', marginBottom: '2px' }
                      }, 'Düzenle'),
                      isOrphan ? React.createElement('button', {
                        onClick: () => removeOrphanParameter(param.id),
                        className: 'btn btn-sm btn-warning',
                        style: { marginRight: '6px', marginTop: '2px', marginBottom: '2px' }
                      }, '🧹 Orphan Temizle') : React.createElement('button', {
                        onClick: () => deleteParameter(param.id),
                        className: 'btn btn-sm btn-danger',
                        style: { marginTop: '2px', marginBottom: '2px' }
                      }, 'Sil')
                    )
                  })()
                )
              )
            })
          ),
          // Inline lookup editor for form parameters with options
          ...parameters.map((param) => {
            const field = formFields.find(f => f.value === param.formField)
            const canEdit = editingParamId === param.id && param.type === 'form' && field && field.hasOptions
            if (!canEdit) return null
            return React.createElement('tr', { key: param.id + '-lookup' },
              React.createElement('td', { colSpan: 5 },
                React.createElement('div', { className: 'card', style: { marginTop: '8px' } },
                  React.createElement('h4', null, '🔗 Değer Eşleştirme (Düzenleme)'),
                  paramLookupTable && paramLookupTable.length > 0 ?
                    React.createElement('table', { className: 'table table-sm' },
                      React.createElement('thead', null,
                        React.createElement('tr', null,
                          React.createElement('th', null, 'Seçenek'),
                          React.createElement('th', null, 'Değer')
                        )
                      ),
                      React.createElement('tbody', null,
                        ...paramLookupTable.map((it, idx) =>
                          React.createElement('tr', { key: idx },
                            React.createElement('td', null, it.option),
                            React.createElement('td', null,
                              React.createElement('input', {
                                type: 'number',
                                value: (it.value === 0 ? '' : (it.value ?? '')),
                                onChange: (e) => paramUpdateLookupValue(idx, e.target.value),
                                className: 'form-control',
                                step: '0.01',
                                style: { width: '120px' }
                              })
                            )
                          )
                        )
                      )
                    )
                  : React.createElement('div', { className: 'alert alert-warning' }, 'Eşleştirme tablosu boş')
                )
              )
            )
          })
        )
      )
    ),

    // Formula section with user-friendly interface
    React.createElement('div', { className: 'card' },
      React.createElement('h3', null, '🧮 Fiyat Hesaplama Formülü'),
      
      parameters.length > 0 && React.createElement('div', { className: 'alert alert-success', style: { fontSize: '0.9em' } },
        React.createElement('strong', null, 'Kullanılabilir Parametreler: '),
        Object.values(idMapping.backendToUser).join(', ')
      ),
      
      React.createElement('div', { className: 'form-group' },
        React.createElement('label', null, 'Formül (A, B, C... kullanın)'),
        React.createElement(EnhancedFormulaEditor, {
          value: userFormula,
          onChange: handleUserFormulaChange,
          parameters: parameters,
          placeholder: 'Örn: A * B * SQRT(C) + 100',
          disabled: !systemIntegrity.canEdit
        }),
        
        React.createElement('div', { style: { display: 'flex', gap: '6px', marginTop: '4px' } },
          React.createElement('button', {
            onClick: () => setShowFormulaInfo(!showFormulaInfo),
            className: 'btn btn-link',
            style: { padding: '5px 0' }
          }, showFormulaInfo ? '❌ Yardımı Gizle' : '❓ Formül Yardımı'),
          
          parameters.length > 0 && React.createElement('button', {
            onClick: () => setUserFormula('A * B'),
            className: 'btn btn-link',
            style: { padding: '5px 0' }
          }, '📝 Örnek Formül Ekle')
        )
      ),

      // Formula validation feedback
      formulaValidation && React.createElement('div', { 
        className: `alert ${formulaValidation.isValid ? 'alert-success' : 'alert-danger'}`,
        style: { marginTop: '8px' }
      },
        React.createElement('strong', null, formulaValidation.isValid ? '✅ Formül Geçerli' : '❌ Formül Hatası'),
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
        style: { marginTop: '8px' }
      },
        React.createElement('h5', null, '📚 Kullanılabilir Fonksiyonlar:'),
        React.createElement('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '8px' } },
          React.createElement('div', null,
            React.createElement('strong', null, 'Matematik:'),
            React.createElement('br', null), 'SQRT, ROUND, MAX, MIN, ABS, POWER'
          ),
          React.createElement('div', null,
            React.createElement('strong', null, 'Yuvarlama:'),
            React.createElement('br', null), 'CEIL, FLOOR, ROUNDUP, ROUNDDOWN'
          ),
          React.createElement('div', null,
            React.createElement('strong', null, 'Mantık:'),
            React.createElement('br', null), 'IF, AND, OR, NOT'
          ),
          React.createElement('div', null,
            React.createElement('strong', null, 'Sabitler:'),
            React.createElement('br', null), 'PI, E'
          )
        ),
        React.createElement('div', { style: { marginTop: '8px', padding: '8px', backgroundColor: '#e9ecef', borderRadius: '4px' } },
          React.createElement('strong', null, 'Örnek Formüller:'),
          React.createElement('ul', { style: { marginBottom: 0, marginTop: '4px' } },
            React.createElement('li', null, 'Basit: A * B + C'),
            React.createElement('li', null, 'Karmaşık: A * SQRT(B) + IF(C > 10, 50, 0)'),
            React.createElement('li', null, 'Yüzde: A * (1 + B/100)')
          )
        )
      ),

      React.createElement('div', { style: { marginTop: '8px' } },
        React.createElement('button', {
          onClick: savePriceSettings,
          className: systemIntegrity.canSave ? 'btn btn-success btn-lg' : 'btn btn-danger btn-lg',
          style: { 
            marginRight: '10px',
            backgroundColor: hasUnsavedChanges ? '#FF4444' : (systemIntegrity.canSave ? '#28a745' : '#dc3545'),
            borderColor: hasUnsavedChanges ? '#FF4444' : (systemIntegrity.canSave ? '#28a745' : '#dc3545')
          },
          disabled: !isFormulaValid || parameters.length === 0 || !systemIntegrity.canSave
        }, systemIntegrity.canSave ? `💾 Fiyat Ayarlarını Kaydet ${hasUnsavedChanges ? '●' : ''}` : '🚫 Kaydetme Engellendi - Orphan Parametreler Mevcut'),
        
        React.createElement('button', {
          onClick: toggleVersionHistory,
          className: 'btn btn-info btn-lg',
          style: { marginLeft: '10px' }
        }, showVersionHistory ? '📋 Sürüm Geçmişini Gizle' : '📋 Sürüm Geçmişi')
      ),

      // Version History Modal
      showVersionHistory && React.createElement('div', {
        style: {
          marginTop: '20px',
          padding: '20px',
          border: '1px solid #ddd',
          borderRadius: '8px',
          backgroundColor: '#f9f9f9'
        }
      },
        React.createElement('h3', null, '📋 Sürüm Geçmişi'),
        
        isLoadingVersions ? 
          React.createElement('p', null, '⏳ Yükleniyor...') :
          versions.length === 0 ? 
            React.createElement('p', null, 'Henüz kaydedilmiş sürüm bulunmuyor.') :
            React.createElement('div', { style: { maxHeight: '400px', overflowY: 'auto' } },
              ...versions.map((version, index) => 
                React.createElement('div', {
                  key: version.id,
                  style: {
                    padding: '15px',
                    margin: '10px 0',
                    border: '1px solid #ccc',
                    borderRadius: '5px',
                    backgroundColor: index === 0 ? '#e8f5e8' : 'white'
                  }
                },
                  React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
                    React.createElement('div', null,
                      React.createElement('h4', { style: { margin: '0 0 5px 0' } },
                        `Sürüm ${version.version}`,
                        index === 0 && React.createElement('span', { style: { color: '#28a745', fontSize: '14px', marginLeft: '10px' } }, '(Güncel)')
                      ),
                      React.createElement('p', { style: { margin: '5px 0', fontSize: '14px', color: '#666' } },
                        `Tarih: ${version.timestamp ? new Date(version.timestamp).toLocaleString('tr-TR') : 'Bilinmiyor'}`
                      ),
                      React.createElement('p', { style: { margin: '5px 0', fontSize: '14px', color: '#666' } },
                        `Versiyon Kodu: ${version.versionId || version.id}`
                      ),
                      version.userTag && React.createElement('p', { style: { margin: '5px 0', fontSize: '14px', color: '#666' } },
                        `Kullanıcı Etiketi: ${version.userTag}`
                      ),
                      version.dateKey && React.createElement('p', { style: { margin: '5px 0', fontSize: '14px', color: '#666' } },
                        `Tarih Kodu: ${version.dateKey}`
                      ),
                      version.dailyIndex && React.createElement('p', { style: { margin: '5px 0', fontSize: '14px', color: '#666' } },
                        `Günlük Sıra: ${String(version.dailyIndex).padStart(2, '0')}`
                      ),
                      version.savedBy && React.createElement('p', { style: { margin: '5px 0', fontSize: '14px', color: '#666' } },
                        `Kaydeden: ${version.savedBy}`
                      ),
                      version.changeSummary && React.createElement('p', { style: { margin: '5px 0', fontSize: '13px', color: '#555' } },
                        `Özet: ${version.changeSummary}`
                      ),
                      React.createElement('p', { style: { margin: '5px 0', fontSize: '14px' } },
                        `Parametre Sayısı: ${(version.parameters && version.parameters.length) || (version.data?.parameters?.length) || 0}`
                      ),
                      (version.formula || version.data?.formula) && React.createElement('p', { style: { margin: '5px 0', fontSize: '12px', color: '#888' } },
                        `Formül: ${(version.formula || version.data?.formula || '').substring(0, 80)}${(version.formula || version.data?.formula || '').length > 80 ? '...' : ''}`
                      )
                    ),

                    index !== 0 && React.createElement('button', {
                      onClick: () => restoreVersion(version.id),
                      className: 'btn btn-warning',
                      style: { fontSize: '14px' }
                    }, '🔄 Geri Yükle')
                  )
                )
              )
            )
      )
    )
  )
}

export default DynamicPricingTab
