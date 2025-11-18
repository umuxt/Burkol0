// Quotes Pricing Manager - Dynamic pricing configuration for quotes domain
import React from 'react';
import API from '../../../shared/lib/api.js'
import FormulaValidator from '../../../src/components/SimpleFormulaValidator.js'
import PricingUtils from '../lib/pricing-utils.js'
import EnhancedFormulaEditor from '../forms/EnhancedFormulaEditor.js'

const { useState, useEffect } = React;

function PricingManager({ t, showNotification, globalProcessing, setGlobalProcessing, checkAndProcessVersionUpdates, renderHeaderActions }) {
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
  
  // Add parameter form state
  const [isAddingParameter, setIsAddingParameter] = useState(false)
  
  // Custom dropdown state
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  
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
      console.warn('⚠️ Form fields API error:', e.message)
      // API bağlantısı yok - boş liste ile devam et
      setFormFields([])
      if (showNotification) {
        showNotification('API bağlantısı yok - Form alanları yüklenmedi', 'warning')
      }
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
    setIsAddingParameter(false) // Form'u kapat
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

  // Render header actions if callback provided
  useEffect(() => {
    if (renderHeaderActions) {
      const isDisabled = !isFormulaValid || parameters.length === 0 || !systemIntegrity.canSave
      const shouldShowGreen = !isDisabled || hasUnsavedChanges
      
      renderHeaderActions([
        React.createElement('button', {
          key: 'save',
          onClick: savePriceSettings,
          className: shouldShowGreen ? 'mes-btn mes-btn-lg mes-btn-success' : 'mes-btn mes-btn-lg',
          disabled: isDisabled,
          style: { 
            display: 'flex', 
            alignItems: 'center', 
            gap: '8px',
            ...(isDisabled && hasUnsavedChanges ? { opacity: 1 } : {})
          }
        }, 
          React.createElement('span', { 
            style: { display: 'flex', alignItems: 'center' },
            dangerouslySetInnerHTML: { 
              __html: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>'
            }
          }),
          systemIntegrity.canSave ? `Fiyat Ayarlarını Kaydet ${hasUnsavedChanges ? '●' : ''}` : 'Kaydetme Engellendi - Orphan Parametreler Mevcut'
        ),
        
        React.createElement('button', {
          key: 'version',
          onClick: toggleVersionHistory,
          className: 'mes-btn mes-btn-lg',
          style: { display: 'flex', alignItems: 'center', gap: '8px', background: '#000', color: '#fff' }
        },
          React.createElement('span', { 
            style: { display: 'flex', alignItems: 'center' },
            dangerouslySetInnerHTML: { 
              __html: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v5h5"/><path d="M3.05 13A9 9 0 1 0 6 5.3L3 8"/><path d="M12 7v5l4 2"/></svg>'
            }
          }),
          showVersionHistory ? 'Sürüm Geçmişini Gizle' : 'Sürüm Geçmişi'
        )
      ],
      // Version history content as second parameter
      showVersionHistory ? React.createElement('div', {
        style: {
          padding: '20px',
          border: '2px solid rgb(229, 231, 235)',
          borderRadius: '8px',
          backgroundColor: '#fff'
        }
      },
        React.createElement('h3', { 
          style: { 
            margin: '0 0 16px 0', 
            fontSize: '18px', 
            fontWeight: 'bold', 
            color: '#000',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          } 
        },
          React.createElement('span', {
            style: { display: 'flex', alignItems: 'center' },
            dangerouslySetInnerHTML: {
              __html: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v5h5"/><path d="M3.05 13A9 9 0 1 0 6 5.3L3 8"/><path d="M12 7v5l4 2"/></svg>'
            }
          }),
          'Sürüm Geçmişi'
        ),
        
        isLoadingVersions ? 
          React.createElement('div', { 
            style: { 
              display: 'flex', 
              alignItems: 'center', 
              gap: '8px',
              color: '#000',
              fontSize: '14px'
            } 
          },
            React.createElement('span', {
              style: { display: 'flex', alignItems: 'center' },
              dangerouslySetInnerHTML: {
                __html: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>'
              }
            }),
            'Yükleniyor...'
          ) :
          versions.length === 0 ? 
            React.createElement('div', { 
              style: { 
                display: 'flex', 
                alignItems: 'center', 
                gap: '8px',
                color: '#666',
                fontSize: '14px'
              } 
            },
              React.createElement('span', {
                style: { display: 'flex', alignItems: 'center' },
                dangerouslySetInnerHTML: {
                  __html: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/></svg>'
                }
              }),
              'Henüz kaydedilmiş sürüm bulunmuyor.'
            ) :
            React.createElement('div', { style: { maxHeight: '400px', overflowY: 'auto' } },
              ...versions.map((version, index) => 
                React.createElement('div', {
                  key: version.id,
                  style: {
                    padding: '16px',
                    margin: '12px 0',
                    border: '1px solid rgb(229, 231, 235)',
                    borderRadius: '6px',
                    backgroundColor: index === 0 ? '#f0f9ff' : '#fafafa'
                  }
                },
                  React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' } },
                    React.createElement('div', { style: { flex: 1 } },
                      React.createElement('h4', { style: { margin: '0 0 8px 0', fontSize: '16px', fontWeight: 'bold', color: '#000', display: 'flex', alignItems: 'center', gap: '8px' } },
                        React.createElement('span', {
                          style: { display: 'flex', alignItems: 'center' },
                          dangerouslySetInnerHTML: {
                            __html: '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>'
                          }
                        }),
                        `Sürüm ${version.version}`,
                        index === 0 && React.createElement('span', { style: { color: '#28a745', fontSize: '12px', fontWeight: 'normal' } }, '(Güncel)')
                      ),
                      React.createElement('p', { style: { margin: '4px 0', fontSize: '13px', color: '#666' } },
                        `Tarih: ${version.timestamp ? new Date(version.timestamp).toLocaleString('tr-TR') : 'Bilinmiyor'}`
                      ),
                      React.createElement('p', { style: { margin: '4px 0', fontSize: '13px', color: '#666' } },
                        `Versiyon Kodu: ${version.versionId || version.id}`
                      ),
                      version.userTag && React.createElement('p', { style: { margin: '4px 0', fontSize: '13px', color: '#666' } },
                        `Kullanıcı Etiketi: ${version.userTag}`
                      ),
                      version.dateKey && React.createElement('p', { style: { margin: '4px 0', fontSize: '13px', color: '#666' } },
                        `Tarih Kodu: ${version.dateKey}`
                      ),
                      version.dailyIndex && React.createElement('p', { style: { margin: '4px 0', fontSize: '13px', color: '#666' } },
                        `Günlük Sıra: ${String(version.dailyIndex).padStart(2, '0')}`
                      ),
                      version.savedBy && React.createElement('p', { style: { margin: '4px 0', fontSize: '13px', color: '#666' } },
                        `Kaydeden: ${version.savedBy}`
                      ),
                      version.changeSummary && React.createElement('p', { style: { margin: '4px 0', fontSize: '13px', color: '#000' } },
                        `Özet: ${version.changeSummary}`
                      ),
                      React.createElement('p', { style: { margin: '4px 0', fontSize: '13px', color: '#000' } },
                        `Parametre Sayısı: ${(version.parameters && version.parameters.length) || (version.data?.parameters?.length) || 0}`
                      ),
                      (version.formula || version.data?.formula) && React.createElement('p', { style: { margin: '4px 0', fontSize: '12px', color: '#666', fontFamily: 'monospace' } },
                        `Formül: ${(version.formula || version.data?.formula || '').substring(0, 80)}${(version.formula || version.data?.formula || '').length > 80 ? '...' : ''}`
                      )
                    ),

                    index !== 0 && React.createElement('button', {
                      onClick: () => restoreVersion(version.id),
                      className: 'mes-btn mes-btn-sm',
                      style: { fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px', background: '#f59e0b', color: '#fff', flexShrink: 0 }
                    },
                      React.createElement('span', {
                        style: { display: 'flex', alignItems: 'center' },
                        dangerouslySetInnerHTML: {
                          __html: '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/></svg>'
                        }
                      }),
                      'Geri Yükle'
                    )
                  )
                )
              )
            )
      ) : null
      )
    }
  }, [hasUnsavedChanges, systemIntegrity.canSave, isFormulaValid, parameters.length, showVersionHistory, isLoadingVersions, versions])

  return React.createElement(React.Fragment, null,
    // Two column layout
    React.createElement('div', { 
      style: { 
        display: 'grid', 
        gridTemplateColumns: '1fr 1fr', 
        gap: '24px',
        marginBottom: '24px'
      } 
    },
      // LEFT COLUMN - Parameters section
      React.createElement('div', { className: 'pricing-parameters-column' },
        React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: '16px' } },
        
        // Header with title and add button
        React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', position: 'relative' } },
          React.createElement('h3', { className: 'pricing-section-title', style: { margin: 0, display: 'flex', alignItems: 'center', gap: '8px' } }, 
            React.createElement('span', { 
              style: { display: 'flex', alignItems: 'center' },
              dangerouslySetInnerHTML: { 
                __html: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="16" height="20" x="4" y="2" rx="2"/><line x1="8" x2="16" y1="6" y2="6"/><line x1="16" x2="16" y1="14" y2="18"/><path d="M16 10h.01"/><path d="M12 10h.01"/><path d="M8 10h.01"/><path d="M12 14h.01"/><path d="M8 14h.01"/><path d="M12 18h.01"/><path d="M8 18h.01"/></svg>'
              }
            }),
            'Fiyat Parametreleri'
          ),
          
          // Add parameter button (shows when form is closed)
          !isLoadingFields && !isAddingParameter && React.createElement('button', {
            onClick: () => setIsAddingParameter(true),
            className: systemIntegrity.canEdit ? 'mes-primary-action is-compact' : 'mes-filter-button is-compact',
            disabled: !systemIntegrity.canEdit,
            style: { minWidth: 'fit-content', flexShrink: 0, display: 'flex', alignItems: 'center', gap: '6px' }
          },
            systemIntegrity.canEdit ? React.createElement(React.Fragment, null,
              React.createElement('span', { 
                style: { display: 'flex', alignItems: 'center' },
                dangerouslySetInnerHTML: { 
                  __html: '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M12 5v14"/></svg>'
                }
              }),
              React.createElement('span', null, 'Parametre Ekle')
            ) : React.createElement(React.Fragment, null,
              React.createElement('span', { 
                style: { display: 'flex', alignItems: 'center' },
                dangerouslySetInnerHTML: { 
                  __html: '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m4.9 4.9 14.2 14.2"/></svg>'
                }
              }),
              React.createElement('span', null, 'Orphan Parametreler Var - Ekleme Engellendi')
            )
          ),
          
          // Add parameter modal/dropdown (shows when isAddingParameter is true)
          !isLoadingFields && isAddingParameter && React.createElement('div', {
            style: {
              position: 'absolute',
              top: '100%',
              right: 0,
              marginTop: '8px',
              background: 'white',
              border: '1px solid rgb(209, 213, 219)',
              borderRadius: '8px',
              boxShadow: '0 10px 25px rgba(0, 0, 0, 0.1)',
              padding: '20px',
              minWidth: '400px',
              maxWidth: '500px',
              zIndex: 1000
            }
          },
            // Modal Header
            React.createElement('h4', { style: { margin: '0 0 16px 0', fontSize: '16px', fontWeight: 600, color: '#000' } }, 'Parametre Ekle'),
            
            // Add parameter form
            React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' } },
              React.createElement('label', { style: { fontSize: '13px', fontWeight: 500, whiteSpace: 'nowrap', color: '#000', width: '110px', lineHeight: '30px' } }, 'Parametre Türü'),
              
              // Custom dropdown button
              React.createElement('div', { style: { position: 'relative', flex: 1 } },
                React.createElement('button', {
                  type: 'button',
                  className: 'mes-filter-select',
                  onClick: () => setIsDropdownOpen(!isDropdownOpen),
                  style: { width: '100%', textAlign: 'left' }
                },
                  React.createElement('span', null, 
                    parameterType === 'fixed' ? (t.pricing_fixed_param || 'Sabit Değer') :
                    parameterType === 'form' ? (t.pricing_form_param || 'Form Alanı') :
                    (t.pricing_select || 'Seçiniz...')
                  )
                ),
                
                // Dropdown panel
                isDropdownOpen && React.createElement('div', {
                  className: 'mes-filter-panel-content',
                  style: {
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    right: 0,
                    marginTop: '4px',
                    background: 'white',
                    border: '1px solid rgb(229, 231, 235)',
                    borderRadius: '6px',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                    zIndex: 1001,
                    maxHeight: 'none',
                    padding: '4px'
                  }
                },
                  React.createElement('label', {
                    onClick: () => {
                      setParameterType('fixed');
                      setIsDropdownOpen(false);
                    },
                    style: { cursor: 'pointer' }
                  },
                    React.createElement('span', null, t.pricing_fixed_param || 'Sabit Değer')
                  ),
                  React.createElement('label', {
                    onClick: () => {
                      setParameterType('form');
                      setIsDropdownOpen(false);
                    },
                    style: { cursor: 'pointer' }
                  },
                    React.createElement('span', null, t.pricing_form_param || 'Form Alanı')
                  )
                )
              )
            ),

            parameterType === 'fixed' && React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' } },
          React.createElement('label', { style: { fontSize: '13px', fontWeight: 500, whiteSpace: 'nowrap', color: '#000', width: '110px', lineHeight: '30px' } }, t.pricing_param_name || 'Parametre Adı'),
          React.createElement('input', {
            type: 'text',
            value: parameterName,
            onChange: (e) => setParameterName(e.target.value),
            className: 'mes-filter-input is-compact',
            placeholder: 'Örn: materyalKatsayisi, islem..',
            style: { flex: 1 }
          })
        ),

        parameterType === 'fixed' && React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' } },
          React.createElement('label', { style: { fontSize: '13px', fontWeight: 500, whiteSpace: 'nowrap', color: '#000', width: '110px', lineHeight: '30px' } }, t.pricing_fixed_value || 'Sabit Değer'),
          React.createElement('input', {
            type: 'number',
            value: fixedValue,
            onChange: (e) => setFixedValue(e.target.value),
            className: 'mes-filter-input is-compact',
            placeholder: '0',
            step: '0.01',
            style: { flex: 1 }
          })
        ),

        parameterType === 'form' && React.createElement('div', null,
          React.createElement('div', { className: 'form-group' },
            React.createElement('label', null, t.pricing_form_field || 'Form Alanı'),
            formFields.length === 0 ? 
              React.createElement('div', { className: 'pricing-alert pricing-alert-warning' },
                React.createElement('strong', null, '⚠️ Form alanı bulunamadı'),
                React.createElement('br'),
                'Firebase\'de form konfigürasyonu bulunamadı. Önce Form Düzenleme menüsünden form alanları oluşturun.',
                React.createElement('br'),
                React.createElement('small', null, 'Debug: formFields.length = ', formFields.length)
              ) :
              React.createElement('div', null,
                React.createElement('div', { className: 'pricing-alert pricing-alert-info', style: { fontSize: '13px', padding: '8px', marginBottom: '8px' } },
                  `✅ ${formFields.length} form alanı Firebase'den başarıyla yüklendi`
                ),
                React.createElement('select', {
                  value: selectedFormField,
                  onChange: (e) => setSelectedFormField(e.target.value),
                  className: 'pricing-form-control'
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
          selectedFormField && React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' } },
            React.createElement('label', { style: { fontSize: '13px', fontWeight: 500, whiteSpace: 'nowrap', color: '#000', width: '110px', lineHeight: '30px' } }, t.pricing_param_name_auto || 'Parametre Adı (otomatik)'),
            React.createElement('input', {
              type: 'text',
              value: (formFields.find(f => f.value === selectedFormField)?.label || ''),
              readOnly: true,
              className: 'mes-filter-input is-compact',
              style: { flex: 1 }
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
                        className: 'mes-filter-input is-compact',
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

        // Save and Cancel buttons when adding parameter
        React.createElement('div', { style: { display: 'flex', gap: '8px', marginTop: '12px', justifyContent: 'flex-end' } },
          React.createElement('button', {
            onClick: addParameter,
            className: 'mes-primary-action is-compact',
            style: { background: '#000', display: 'flex', alignItems: 'center', gap: '6px' },
            disabled: !parameterType || (formFields.length === 0 && parameterType === 'form')
          },
            React.createElement('span', { 
              style: { display: 'flex', alignItems: 'center' },
              dangerouslySetInnerHTML: { 
                __html: '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>'
              }
            }),
            React.createElement('span', null, 'Parametreyi Kaydet')
          ),
          
          React.createElement('button', {
            onClick: resetParameterForm,
            className: 'mes-filter-button is-compact',
            style: { display: 'flex', alignItems: 'center', gap: '6px' }
          },
            React.createElement('span', { 
              style: { display: 'flex', alignItems: 'center' },
              dangerouslySetInnerHTML: { 
                __html: '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>'
              }
            }),
            React.createElement('span', null, 'İptal')
          )
        )
          ) // Close modal div
        ),
      
      isLoadingFields && React.createElement('div', { className: 'pricing-alert pricing-alert-info' },
        '📝 Form alanları yükleniyor... Firebase\'den form konfigürasyonu çekiliyor.'
      ),

      // Parameters list with user-friendly IDs
      React.createElement('div', { style: { marginTop: '20px' } },
        
        // Orphan parameter uyarı sistemi
        parameters.length > 0 && !systemIntegrity.isValid && React.createElement('div', { className: 'pricing-alert pricing-alert-danger', style: { marginBottom: '15px' } },
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
        
        parameters.length === 0 && React.createElement('div', { 
          style: { 
            textAlign: 'center', 
            padding: '60px 20px',
            background: '#ffffff',
            border: '1px solid rgb(229, 231, 235)',
            borderRadius: '8px',
            marginTop: '20px'
          }
        },
          React.createElement('div', { 
            className: 'lucide lucide-calculator',
            style: { 
              width: '48px', 
              height: '48px', 
              margin: '0 auto 16px',
              color: 'rgb(156, 163, 175)'
            },
            dangerouslySetInnerHTML: { 
              __html: '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect width="16" height="20" x="4" y="2" rx="2"/><line x1="8" x2="16" y1="6" y2="6"/><line x1="16" x2="16" y1="14" y2="18"/><path d="M16 10h.01"/><path d="M12 10h.01"/><path d="M8 10h.01"/><path d="M12 14h.01"/><path d="M8 14h.01"/><path d="M12 18h.01"/><path d="M8 18h.01"/></svg>'
            }
          }),
          React.createElement('p', { style: { margin: '0 0 8px 0', fontSize: '15px', fontWeight: 600, color: '#000' } }, 'Henüz Parametre Eklenmedi'),
          React.createElement('p', { style: { margin: 0, fontSize: '13px', color: 'rgb(107, 114, 128)' } }, 'Yukarıdaki "Parametre Ekle" butonunu kullanarak fiyat parametreleri ekleyin')
        ),
        
        parameters.length > 0 && React.createElement('table', { className: 'pricing-table' },
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
                        className: 'pricing-form-control',
                        placeholder: 'Parametre adı',
                        style: { padding: '1px 6px', fontSize: '0.8rem', lineHeight: '1.1', height: '24px', maxHeight: '24px' }
                      })
                    : param.name
                ),
                // Type col (read-only label)
                React.createElement('td', null, 
                  param.type === 'fixed' 
                    ? React.createElement('span', { style: { display: 'flex', alignItems: 'center', gap: '4px' } },
                        React.createElement('span', { 
                          dangerouslySetInnerHTML: { 
                            __html: '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" x2="20" y1="9" y2="9"/><line x1="4" x2="20" y1="15" y2="15"/><line x1="10" x2="8" y1="3" y2="21"/><line x1="16" x2="14" y1="3" y2="21"/></svg>'
                          }
                        }),
                        'Sabit'
                      )
                    : React.createElement('span', { style: { display: 'flex', alignItems: 'center', gap: '4px' } },
                        React.createElement('span', { 
                          dangerouslySetInnerHTML: { 
                            __html: '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>'
                          }
                        }),
                        'Form'
                      )
                ),
                // Value/Field col (editable by type)
                React.createElement('td', null,
                  editingParamId === param.id
                    ? (param.type === 'fixed'
                        ? React.createElement('input', {
                            type: 'number',
                            value: paramDraft.value,
                            onChange: (e) => setParamDraft({ ...paramDraft, value: e.target.value }),
                            className: 'pricing-form-control',
                            step: '0.01',
                            style: { width: '110px', padding: '1px 6px', fontSize: '0.8rem', lineHeight: '1.1', height: '24px', maxHeight: '24px' }
                          })
                        : React.createElement('select', {
                            className: 'pricing-form-control',
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
                          className: 'mes-btn mes-btn-sm mes-btn-success',
                          style: { marginRight: '6px' }
                        }, 'Kaydet'),
                        React.createElement('button', {
                          onClick: cancelEditParameter,
                          className: 'mes-btn mes-btn-sm mes-btn-secondary'
                        }, 'İptal')
                      )
                    }
                    return React.createElement(React.Fragment, null,
                      canEdit && !isOrphan && React.createElement('button', {
                        onClick: () => editParameter(param),
                        className: 'mes-btn mes-btn-sm mes-btn-primary',
                        style: { marginRight: '6px', marginTop: '2px', marginBottom: '2px' }
                      }, 'Düzenle'),
                      isOrphan ? React.createElement('button', {
                        onClick: () => removeOrphanParameter(param.id),
                        className: 'mes-btn mes-btn-sm mes-btn-warning',
                        style: { marginRight: '6px', marginTop: '2px', marginBottom: '2px' }
                      }, '🧹 Orphan Temizle') : React.createElement('button', {
                        onClick: () => deleteParameter(param.id),
                        className: 'mes-btn mes-btn-sm mes-btn-danger',
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
                                className: 'pricing-form-control',
                                step: '0.01',
                                style: { width: '120px' }
                              })
                            )
                          )
                        )
                      )
                    )
                  : React.createElement('div', { className: 'pricing-alert pricing-alert-warning' }, 'Eşleştirme tablosu boş')
                )
              )
            )
          })
        )
      ) // End of parameters list div
        ) // End of inner flex container
      ), // End of LEFT COLUMN wrapper

      // RIGHT COLUMN - Formula section with user-friendly interface
      React.createElement('div', { className: 'pricing-formula-column' },
        React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: '16px' } },
        React.createElement('h3', { className: 'pricing-section-title', style: { display: 'flex', alignItems: 'center', gap: '8px' } }, 
          React.createElement('span', { 
            dangerouslySetInnerHTML: { 
              __html: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="16" height="20" x="4" y="2" rx="2" ry="2"/><path d="M9 10h6"/><path d="M9 14h6"/><path d="M9 18h3"/></svg>'
            }
          }),
          'Fiyat Hesaplama Formülü'
        ),
      
      parameters.length > 0 && React.createElement('div', { className: 'pricing-alert pricing-alert-info', style: { fontSize: '0.9em' } },
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
            className: 'mes-btn mes-btn-link',
            style: { padding: '5px 0', display: 'flex', alignItems: 'center', gap: '4px' }
          }, 
            React.createElement('span', { 
              style: { display: 'flex', alignItems: 'center' },
              dangerouslySetInnerHTML: { 
                __html: showFormulaInfo 
                  ? '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>'
                  : '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/></svg>'
              }
            }),
            showFormulaInfo ? 'Yardımı Gizle' : 'Formül Yardımı'
          ),
          
          parameters.length > 0 && React.createElement('button', {
            onClick: () => setUserFormula('A * B'),
            className: 'mes-btn mes-btn-link',
            style: { padding: '5px 0', display: 'flex', alignItems: 'center', gap: '4px' }
          }, 
            React.createElement('span', { 
              style: { display: 'flex', alignItems: 'center' },
              dangerouslySetInnerHTML: { 
                __html: '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>'
              }
            }),
            'Örnek Formül Ekle'
          )
        )
      ),

      // Formula validation feedback
      formulaValidation && React.createElement('div', { 
        className: `alert ${formulaValidation.isValid ? 'alert-success' : 'alert-danger'}`,
        style: { marginTop: '8px' }
      },
        React.createElement('strong', { style: { display: 'flex', alignItems: 'center', gap: '6px' } }, 
          React.createElement('span', { 
            dangerouslySetInnerHTML: { 
              __html: formulaValidation.isValid
                ? '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>'
                : '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/></svg>'
            }
          }),
          formulaValidation.isValid ? 'Formül Geçerli' : 'Formül Hatası'
        ),
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
        className: 'pricing-alert pricing-alert-info',
        style: { marginTop: '8px', background: '#fff', borderColor: '#e5e7eb' }
      },
        // Başlık - İlk satır
        React.createElement('div', { style: { marginBottom: '12px' } },
          React.createElement('h5', { 
            style: { 
              margin: '0', 
              fontSize: '14px', 
              fontWeight: '600', 
              color: '#111827',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            } 
          },
            React.createElement('span', {
              dangerouslySetInnerHTML: {
                __html: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/></svg>'
              }
            }),
            'Kullanılabilir Fonksiyonlar'
          )
        ),
        // 3 kutu yan yana - İkinci satır
        React.createElement('div', { 
          style: { 
            display: 'grid', 
            gridTemplateColumns: '1fr 1fr 1fr', 
            gap: '10px'
          } 
        },
          // Sol kutu - Matematik ve Yuvarlama
          React.createElement('div', { 
            style: { 
              padding: '10px 12px', 
              background: '#f9fafb', 
              borderRadius: '6px',
              border: '1px solid #e5e7eb'
            } 
          },
            React.createElement('div', { style: { marginBottom: '8px' } },
              React.createElement('strong', { style: { color: '#111827', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: '4px' } }, 'Matematik:'),
              React.createElement('span', { style: { fontFamily: 'monospace', fontSize: '12px', color: '#374151' } }, 'SQRT, ROUND, MAX, MIN, ABS, POWER')
            ),
            React.createElement('div', null,
              React.createElement('strong', { style: { color: '#111827', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: '4px' } }, 'Yuvarlama:'),
              React.createElement('span', { style: { fontFamily: 'monospace', fontSize: '12px', color: '#374151' } }, 'CEIL, FLOOR, ROUNDUP, ROUNDDOWN')
            )
          ),
          // Orta kutu - Mantık ve Sabitler
          React.createElement('div', { 
            style: { 
              padding: '10px 12px', 
              background: '#f9fafb', 
              borderRadius: '6px',
              border: '1px solid #e5e7eb'
            } 
          },
            React.createElement('div', { style: { marginBottom: '8px' } },
              React.createElement('strong', { style: { color: '#111827', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: '4px' } }, 'Mantık:'),
              React.createElement('span', { style: { fontFamily: 'monospace', fontSize: '12px', color: '#374151' } }, 'IF, AND, OR, NOT')
            ),
            React.createElement('div', null,
              React.createElement('strong', { style: { color: '#111827', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: '4px' } }, 'Sabitler:'),
              React.createElement('span', { style: { fontFamily: 'monospace', fontSize: '12px', color: '#374151' } }, 'PI, E')
            )
          ),
          // Sağ kutu - Örnek Formüller
          React.createElement('div', { 
            style: { 
              padding: '10px 12px', 
              background: '#f9fafb', 
              borderRadius: '6px',
              border: '1px solid #e5e7eb'
            } 
          },
            React.createElement('strong', { 
              style: { 
                fontSize: '12px', 
                color: '#111827', 
                textTransform: 'uppercase', 
                letterSpacing: '0.5px',
                display: 'block',
                marginBottom: '6px'
              } 
            }, 'Örnek Formüller:'),
            React.createElement('ul', { 
              style: { 
                margin: '0', 
                paddingLeft: '18px',
                fontSize: '12px',
                color: '#374151',
                lineHeight: '1.6'
              } 
            },
              React.createElement('li', { style: { fontFamily: 'monospace', marginBottom: '2px' } }, 'A * B + C'),
              React.createElement('li', { style: { fontFamily: 'monospace', marginBottom: '2px' } }, 'A * SQRT(B) + IF(C > 10, 50, 0)'),
              React.createElement('li', { style: { fontFamily: 'monospace' } }, 'A * (1 + B/100)')
            )
          )
        )
      )
        ) // End of inner flex container
      ) // End of RIGHT COLUMN wrapper
    ) // End of grid - close the two-column layout div
  )
}

export default PricingManager
