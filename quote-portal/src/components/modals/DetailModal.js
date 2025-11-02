import React from 'react';
import API, { API_BASE } from '../../../shared/lib/api.js'
import { uid, downloadDataUrl, ACCEPT_EXT, MAX_FILES, MAX_FILE_MB, MAX_PRODUCT_FILES, extOf, readFileAsDataUrl, isImageExt } from '../../../shared/lib/utils.js'
import { statusLabel } from '../../../shared/i18n.js'
import { PriceStatusBadge } from '../../../domains/admin/components/PriceStatusUI.js'

export function DetailModal({ item, onClose, setItemStatus, onSaved, t, isNew, showNotification, formConfig, globalProcessing, setGlobalProcessing, checkAndProcessVersionUpdates, currentQuotes }) {
  console.log('🔧 DEBUG: DetailModal rendered with item:', item?.id, 'formConfig:', !!formConfig)
  
  const [currStatus, setCurrStatus] = React.useState(item.status || 'new')
  const [editing, setEditing] = React.useState(!!isNew)
  const [form, setForm] = React.useState({})
  const [techFiles, setTechFiles] = React.useState(item.files || [])
  const [prodImgs, setProdImgs] = React.useState(item.productImages || [])
  const [manualOverride, setManualOverride] = React.useState(item.manualOverride || null)
  const [manualPriceInput, setManualPriceInput] = React.useState(() => formatManualPriceInput(item.manualOverride?.price ?? item.price))
  const [manualNote, setManualNote] = React.useState(item.manualOverride?.note || '')
  const [manualLoading, setManualLoading] = React.useState(false)
  const [showPriceUpdateModal, setShowPriceUpdateModal] = React.useState(false)
  const [priceUpdateData, setPriceUpdateData] = React.useState(null)
  
  React.useEffect(() => {
    setCurrStatus(item.status || 'new')
    
    // Initialize form with dynamic fields based on formConfig
    const initialForm = {}
    if (formConfig && formConfig.formStructure && formConfig.formStructure.fields) {
      formConfig.formStructure.fields.forEach(field => {
        let value = item.customFields?.[field.id] || item.customFields?.[field.id] || item[field.id] || ''
        
        // Handle special field types
        if (field.type === 'multiselect' && Array.isArray(value)) {
          value = value.join(', ')
        } else if (field.type === 'radio' && !value) {
          value = field.options?.[0] || ''
        }
        
        initialForm[field.id] = value
      })
    }
    
    setForm(initialForm)
    setTechFiles(item.files || [])
    setProdImgs(item.productImages || [])

    const override = item.manualOverride || null
    setManualOverride(override)
    const initialManualPrice = override?.price ?? item.price
    setManualPriceInput(formatManualPriceInput(initialManualPrice))
    setManualNote(override?.note || '')
  }, [item.id, item.status, item.price, item.manualOverride])
  
  function setF(k, v) { 
    setForm((s) => ({ ...s, [k]: v })) 
  }

  function renderDetailFields() {
    if (!formConfig || !formConfig.formStructure.fields) {
      return []
    }
    
    const fields = []
    
    // Add system fields first
    fields.push(
      info('ID', item.id),
      info(t.th_date || 'Tarih', (item.createdAt||'').replace('T',' ').slice(0,16))
    )
    
    // Add dynamic fields from form config
    formConfig.formStructure.fields.forEach(field => {
      
        let value = item.customFields?.[field.id] || item[field.id] || '—'
        let label = field.label || field.id
        
        // Format value based on field type
        if (field.type === 'multiselect' && Array.isArray(item.customFields?.[field.id] || item[field.id])) {
          value = item.customFields?.[field.id] || item[field.id].join(', ') || '—'
        } else if (field.type === 'radio' && field.options) {
          // Keep the selected value as is
          value = value || '—'
        } else if (field.type === 'number') {
          value = value ? (value + (field.unit || '')) : '—'
        } else if (field.type === 'date') {
          value = value || '—'
        } else if (field.type === 'textarea') {
          value = value || '—'
        } else if (!value || value === '') {
          value = '—'
        }
        
        // Handle special formatting
        if (field.id === 'thickness' && value !== '—') {
          value = value + ' mm'
        } else if (field.id === 'country' || field.id === 'city') {
          // Handle country/city combination
          const country = item.country || 'undefined'
          const city = item.city || 'undefined'
          if (field.id === 'country') {
            value = `${country} / ${city}`
            label = (t.f_country || 'Ülke') + '/' + (t.f_city || 'Şehir')
          } else if (field.id === 'city') {
            return null // Skip city field as it's combined with country
          }
        } else if (field.id === 'repeat') {
          value = value === 'recurrent' ? (t.repeat_recurrent || 'Sürekli') : (t.repeat_one || 'Tek Seferlik')
        }
        
        if (value !== null) {
          fields.push(info(label, value))
        }
      })
    
    return fields.filter(Boolean)
  }

  function renderEditFields() {
    if (!formConfig || !formConfig.formStructure.fields) {
      return []
    }
    
    const fields = []
    
    formConfig.formStructure.fields.forEach(field => {
      
        const label = field.label || field.id
        
        if (field.type === 'textarea') {
          fields.push(editArea(label, field.id))
        } else if (field.type === 'radio' && field.options) {
          fields.push(editRadio(label, field.id, field.options))
        } else if (field.type === 'multiselect') {
          fields.push(editField(label, field.id)) // Convert array to comma-separated string for editing
        } else {
          fields.push(editField(label, field.id, field.type === 'number' ? 'number' : 'text'))
        }
      })
    
    return fields
  }

  function renderDetailFields() {
    if (!formConfig || !formConfig.formStructure.fields) {
      return []
    }
    
    const fields = []
    
    // Add system fields first
    fields.push(
      info('ID', item.id),
      info(t.th_date || 'Tarih', (item.createdAt||'').replace('T',' ').slice(0,16))
    )
    
    // Add default fields (company, proj, etc.) - always show these
    const defaultFields = [
      { key: 'company', label: 'Şirket' },
      { key: 'proj', label: 'Proje' },
      { key: 'material', label: 'Malzeme Türü' },
      { key: 'thickness', label: 'Kalınlık (mm)' },
      { key: 'qty', label: 'Adet' },
      { key: 'notes', label: 'Ek Notlar' }
    ]
    
    defaultFields.forEach(defaultField => {
      let value = item[defaultField.key] || '—'
      let label = defaultField.label
      
      // Special formatting
      if (defaultField.key === 'thickness' && value !== '—') {
        value = value + ' mm'
      }
      
      fields.push(info(label, value))
    })
    
    // Add price field with status badge
    const priceValue = formatPriceDisplay(item.price)
    const priceField = React.createElement('div', { className: 'card', style: { padding: 10, fontSize: 13 } },
      React.createElement('div', { className: 'help', style: { fontSize: 11 } }, 'Fiyat'),
      React.createElement('div', { 
        style: { 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'space-between',
          gap: '8px'
        } 
      },
        React.createElement('span', null, priceValue),
        // Add price status badge if there's version difference or price status
        (item.priceStatus && (
          item.priceStatus.status === 'outdated' || 
          item.priceStatus.status === 'drift' ||
          item.priceStatus.status === 'price-drift' ||
          item.priceStatus.status === 'content-drift' ||
          item.priceStatus.status === 'unknown' ||
          (item.priceStatus.calculatedPrice && Math.abs(item.priceStatus.calculatedPrice - item.price) > 0.01)
        )) && React.createElement(PriceStatusBadge, {
          quote: item,
          compact: true,
          showActions: true,
          onUpdate: () => {
            // Trigger modal refresh or callback
            if (typeof onSaved === 'function') {
              onSaved()
            }
          }
        })
      )
    )
    fields.push(priceField)
    
    // Add dynamic fields from form config
    formConfig.formStructure.fields.forEach(field => {
      // Skip default fields that are already handled above
      const defaultFieldKeys = ['company', 'proj', 'material', 'thickness', 'qty', 'notes']
      if (defaultFieldKeys.includes(field.id)) {
        return
      }
      
        let value = item.customFields?.[field.id] || item[field.id] || '—'
        let label = field.label || field.id
        
        // Format value based on field type
        if (field.type === 'multiselect' && Array.isArray(item.customFields?.[field.id] || item[field.id])) {
          value = item.customFields?.[field.id] || item[field.id].join(', ') || '—'
        } else if (field.type === 'radio' && field.options) {
          // Keep the selected value as is
          value = value || '—'
        } else if (field.type === 'number') {
          value = value ? (value + (field.unit || '')) : '—'
        } else if (field.type === 'date') {
          value = value || '—'
        } else if (field.type === 'textarea') {
          value = value || '—'
        } else if (!value || value === '') {
          value = '—'
        }
        
        // Handle special formatting
        if (field.id === 'thickness' && value !== '—') {
          value = value + ' mm'
        } else if (field.id === 'country' || field.id === 'city') {
          // Handle country/city combination
          const country = item.country || 'undefined'
          const city = item.city || 'undefined'
          if (field.id === 'country') {
            value = `${country} / ${city}`
            label = (t.f_country || 'Ülke') + '/' + (t.f_city || 'Şehir')
          } else if (field.id === 'city') {
            return null // Skip city field as it's combined with country
          }
        } else if (field.id === 'repeat') {
          value = value === 'recurrent' ? (t.repeat_recurrent || 'Sürekli') : (t.repeat_one || 'Tek Seferlik')
        }
        
        if (value !== null) {
          fields.push(info(label, value))
        }
      })
    
    return fields.filter(Boolean)
  }

  const manualOverrideActive = !!(manualOverride && manualOverride.active)
  const manualSetAtText = manualOverride?.setAt ? new Date(manualOverride.setAt).toLocaleString('tr-TR') : null
  const manualSetByText = manualOverride?.setByLabel || manualOverride?.setBy || null

  function formatManualPriceInput(value) {
    if (value === null || value === undefined || value === '') return ''
    const parsed = Number(String(value).replace(',', '.'))
    if (Number.isNaN(parsed)) return ''
    return parsed.toFixed(2)
  }

  function parseManualPrice(value) {
    if (value === null || value === undefined || value === '') return NaN
    return Number(String(value).replace(',', '.'))
  }

  function formatPriceDisplay(value) {
    const parsed = parseManualPrice(value)
    if (Number.isNaN(parsed)) return '—'
    return `₺${parsed.toFixed(2)}`
  }

  async function handleManualPriceSave() {
    if (!item || !item.id) return
    const parsedPrice = parseManualPrice(manualPriceInput)
    if (Number.isNaN(parsedPrice) || parsedPrice < 0) {
      showNotification?.('Geçerli bir fiyat giriniz', 'error')
      return
    }

    setManualLoading(true)
    try {
      const response = await API.setManualPrice(item.id, {
        price: parsedPrice,
        note: manualNote
      })

      const updatedQuote = response?.quote || response || {}
      setManualOverride(updatedQuote.manualOverride || { active: true, price: parsedPrice, note: manualNote })
      setManualPriceInput(formatManualPriceInput(updatedQuote.manualOverride?.price ?? parsedPrice))
      setManualNote(updatedQuote.manualOverride?.note || manualNote)

      showNotification?.('Fiyat manuel olarak kilitlendi', 'success')
      if (typeof onSaved === 'function') {
        await onSaved()
      }

      // Check for version updates after manual price save
      if (checkAndProcessVersionUpdates && setGlobalProcessing) {
        await checkAndProcessVersionUpdates(currentQuotes)
      }
    } catch (error) {
      console.error('Manual price save error:', error)
      showNotification?.(`Manuel fiyat kaydedilemedi: ${error.message || 'Beklenmeyen hata'}`, 'error')
    } finally {
      setManualLoading(false)
    }
  }

  async function handlePriceStatusClick() {
    if (!item.priceStatus || !item.priceStatus.calculatedPrice) return
    
    console.log('🔧 DEBUG: handlePriceStatusClick - item data:', item)
    console.log('🔧 DEBUG: item.priceStatus:', item.priceStatus)
    console.log('🔧 DEBUG: item.priceSettings:', item.priceSettings)
    
    const currentPrice = parseFloat(item.price) || 0
    const newPrice = parseFloat(item.priceStatus.calculatedPrice) || 0
    const priceDifference = newPrice - currentPrice
    
    // ALWAYS fetch fresh version information from backend to avoid cache issues
    console.log('🔧 DEBUG: Fetching fresh version information...')
    let versionInfo = {}
    let itemOriginalVersion = 'Bilinmiyor'
    let itemCurrentVersion = 'Bilinmiyor'
    let latestVersionId = 'Bilinmiyor'
    
    try {
      console.log('🔧 DEBUG: Getting price settings versions for version comparison')
      const versionsResponse = await API.getPriceSettingsVersions()
      console.log('🔧 DEBUG: Versions response:', versionsResponse)
      
      // Also get current price settings to find the version this item was calculated with
      const currentSettings = await API.getPriceSettings()
      console.log('🔧 DEBUG: Current price settings:', currentSettings)
      
      if (versionsResponse?.success && versionsResponse.versions?.length > 0) {
        const versions = versionsResponse.versions
        const latestVersion = versions[0] // En son version
        latestVersionId = latestVersion.versionId || 'Bilinmiyor'
        
        console.log('🔧 DEBUG: Latest version from API:', latestVersionId)
        
        // Try to find original version from item data
        if (item.priceStatus?.originalVersion) {
          itemOriginalVersion = item.priceStatus.originalVersion
        } else if (item.priceVersionOriginal?.versionId) {
          itemOriginalVersion = item.priceVersionOriginal.versionId
        } else if (item.priceSettings?.versionId) {
          itemOriginalVersion = item.priceSettings.versionId
        } else if (item.calculatedWith?.versionId) {
          itemOriginalVersion = item.calculatedWith.versionId
        } else if (item.priceCalculation?.versionId) {
          itemOriginalVersion = item.priceCalculation.versionId
        } else if (versions.length >= 3) {
          // Fallback: use 3rd latest version as "original"
          itemOriginalVersion = versions[2].versionId
        } else if (versions.length >= 2) {
          // Fallback: use 2nd latest version as "original"  
          itemOriginalVersion = versions[1].versionId
        }
        
        // For current version, prioritize fresh data from latest applied version
        if (item.priceVersionApplied?.versionId) {
          itemCurrentVersion = item.priceVersionApplied.versionId
          console.log('🔧 DEBUG: Using currentVersion from priceVersionApplied:', itemCurrentVersion)
        } else if (item.priceStatus?.currentVersion) {
          itemCurrentVersion = item.priceStatus.currentVersion
          console.log('🔧 DEBUG: Using currentVersion from priceStatus:', itemCurrentVersion)
        } else if (item.priceStatus?.settingsVersionId) {
          itemCurrentVersion = item.priceStatus.settingsVersionId
          console.log('🔧 DEBUG: Using currentVersion from settingsVersionId:', itemCurrentVersion)
        } else if (item.priceStatus?.lastUpdated) {
          // If recently updated, assume it's using latest version
          const lastUpdate = new Date(item.priceStatus.lastUpdated)
          const now = new Date()
          const timeDiff = now - lastUpdate
          if (timeDiff < 300000) { // Less than 5 minutes ago
            itemCurrentVersion = latestVersionId
            console.log('🔧 DEBUG: Recently updated item, using latest version:', itemCurrentVersion)
          }
        } else if (item.priceSettings?.versionId) {
          itemCurrentVersion = item.priceSettings.versionId
        } else if (item.calculatedWith?.versionId) {
          itemCurrentVersion = item.calculatedWith.versionId
        } else if (item.priceCalculation?.versionId) {
          itemCurrentVersion = item.priceCalculation.versionId
        } else if (versions.length >= 2) {
          // Fallback: use 2nd latest version as "current"
          itemCurrentVersion = versions[1].versionId  
        } else {
          // Fallback: use latest version as "current"
          itemCurrentVersion = latestVersionId
        }
        
        console.log('🔧 DEBUG: Version tracking - original:', itemOriginalVersion, 'current:', itemCurrentVersion, 'latest:', latestVersionId)
        
        // Update item status based on version comparison to ensure accurate display
        if (!item.priceStatus.status || item.priceStatus.status === 'unknown') {
          if (itemCurrentVersion !== latestVersionId) {
            item.priceStatus.status = 'outdated'
            console.log('🔧 DEBUG: Set status to outdated due to version difference')
          } else if (Math.abs(priceDifference) > 0.01) {
            item.priceStatus.status = 'drift'
            console.log('🔧 DEBUG: Set status to drift due to price difference')
          } else {
            item.priceStatus.status = 'current'
            console.log('🔧 DEBUG: Set status to current')
          }
        }
        
        versionInfo = {
          originalVersion: itemOriginalVersion,
          currentVersion: itemCurrentVersion, 
          latestVersion: latestVersionId,
          comparisonBasis: 'Mevcut → Güncel',
          parameterChanges: item.priceStatus?.parameterChanges || []
        }
        
        console.log('🔧 DEBUG: Final version info for modal:', versionInfo)
      } else {
        console.log('🔧 DEBUG: No versions found in API response, using fallback')
        // Fallback with current item data
        versionInfo = {
          originalVersion: item.priceStatus?.originalVersion || itemOriginalVersion,
          currentVersion: item.priceStatus?.currentVersion || item.priceStatus?.settingsVersionId || itemCurrentVersion,
          latestVersion: latestVersionId,
          comparisonBasis: 'Mevcut → Güncel',
          parameterChanges: item.priceStatus?.parameterChanges || []
        }
      }
    } catch (error) {
      console.error('🔧 DEBUG: Error fetching version info:', error)
      // Fallback to existing data
      const existingVersionInfo = item.priceStatus?.versionInfo || {}
      versionInfo = {
        originalVersion: existingVersionInfo.originalVersion || 'Bilinmiyor',
        currentVersion: existingVersionInfo.currentVersion || 'Bilinmiyor',
        latestVersion: existingVersionInfo.latestVersion || 'Bilinmiyor',
        comparisonBasis: existingVersionInfo.comparisonBasis || 'Mevcut → Güncel',
        parameterChanges: existingVersionInfo.parameterChanges || []
      }
    }
    
    console.log('🔧 DEBUG: Final version info for modal:', versionInfo)
    
    setPriceUpdateData({
      customerName: item.name || 'Bilinmiyor',
      projectName: item.proj || 'Bilinmiyor',
      currentPrice,
      newPrice,
      priceDifference,
      originalVersion: versionInfo.originalVersion,
      currentVersion: versionInfo.currentVersion,
      latestVersion: versionInfo.latestVersion,
      comparisonBasis: versionInfo.comparisonBasis,
      parameterChanges: versionInfo.parameterChanges
    })
    
    setShowPriceUpdateModal(true)
  }

  async function handleManualRelease(applyLatest = false) {
    console.log('� handleManualRelease STARTED with applyLatest:', applyLatest)
    console.log('🔴 item:', item)
    console.log('🔴 item.id:', item?.id)
    console.log('🔴 manualLoading before:', manualLoading)
    
    if (!item || !item.id) {
      console.log('🔴 ERROR: No item or item.id')
      return
    }
    console.log('🔴 Setting manualLoading to true')
    setManualLoading(true)
    try {
      console.log('� Clearing manual price...')
      const response = await API.clearManualPrice(item.id, applyLatest ? 'Manuel fiyat kilidi kaldırıldı ve güncel sürüm uygulandı' : 'Manuel fiyat kilidi kaldırıldı')
      console.log('� Clear manual price response:', response)
      const clearedQuote = response?.quote || response || {}
      setManualOverride(clearedQuote.manualOverride || { active: false })
      setManualPriceInput(formatManualPriceInput(clearedQuote.manualOverride?.price ?? clearedQuote.price ?? ''))
      setManualNote(clearedQuote.manualOverride?.note || '')

      if (applyLatest) {
        console.log('🔧 Applying current price...')
        const applyResponse = await API.applyCurrentPriceToQuote(item.id)
        console.log('🔧 Apply current price response:', applyResponse)
        if (!applyResponse || applyResponse.success === false) {
          throw new Error(applyResponse?.error || 'Güncel fiyat uygulanamadı')
        }
      }

      console.log('🔧 Operation completed successfully')
      showNotification?.(applyLatest ? 'Kilit kaldırıldı ve güncel fiyat uygulandı' : 'Manuel kilit kaldırıldı', 'success')
      if (typeof onSaved === 'function') {
        console.log('🔧 Calling onSaved function...')
        await onSaved()
        console.log('🔧 onSaved completed')
      } else {
        console.log('🔧 No onSaved function provided')
      }

      // Check for version updates after manual price release
      if (checkAndProcessVersionUpdates && setGlobalProcessing) {
        console.log('🔧 Checking for version updates...')
        await checkAndProcessVersionUpdates()
        console.log('🔧 Version updates check completed')
      }
    } catch (error) {
      console.error('Manual override release error:', error)
      showNotification?.(`İşlem başarısız: ${error.message || 'Beklenmeyen hata'}`, 'error')
    } finally {
      setManualLoading(false)
    }
  }

  async function handleApplyPriceUpdate() {
    if (!priceUpdateData || !item.id) return
    
    setManualLoading(true)
    try {
      // First check if quote has manual override (is locked)
      if (item.manualOverride?.active) {
        console.log('🔧 Quote is locked, clearing manual override first...')
        await API.clearManualPrice(item.id, 'Manuel kilit kaldırıldı ve güncel fiyat uygulandı')
      }
      
      const response = await API.applyCurrentPriceToQuote(item.id)
      if (!response || response.success === false) {
        throw new Error(response?.error || 'Fiyat güncellemesi başarısız')
      }
      
      console.log('🔧 DEBUG: Apply price response:', response)
      
      console.log('🔧 DEBUG: Raw API response:', response)
      
      // Update item with new price and version information
      if (response.quote) {
        // Update the item object with new data from backend
        console.log('🔧 DEBUG: Updating item with backend quote data')
        console.log('🔧 DEBUG: Before update - item.priceStatus:', item.priceStatus)
        console.log('🔧 DEBUG: Before update - item.priceVersionApplied:', item.priceVersionApplied)
        
        Object.assign(item, response.quote)
        
        console.log('🔧 DEBUG: After assign - item.priceStatus:', item.priceStatus)
        console.log('🔧 DEBUG: After assign - item.priceVersionApplied:', item.priceVersionApplied)
        console.log('🔧 DEBUG: Backend response quote:', response.quote)
        console.log('🔧 DEBUG: Applied version from backend:', response.appliedVersion)
        console.log('🔧 DEBUG: Price version snapshot:', response.priceVersion)
      }
        
      // Update price status with version information from backend response
      if (response.appliedVersion || response.priceVersion) {
        if (!item.priceStatus) item.priceStatus = {}
        
        // The response contains the latest applied version info
        const appliedVersionId = response.priceVersion?.versionId || response.appliedVersion
        const appliedVersionNumber = response.priceVersion?.versionNumber
        
        if (appliedVersionId) {
          // Set version information - now the item has current version info
          item.priceStatus.currentVersion = appliedVersionId
          item.priceStatus.originalVersion = item.priceStatus.originalVersion || appliedVersionId
          item.priceStatus.lastUpdated = new Date().toISOString()
          
          // Update status to current since we just applied the latest version
          item.priceStatus.status = 'current'
          item.priceStatus.settingsVersionId = appliedVersionId
          if (appliedVersionNumber) {
            item.priceStatus.settingsVersion = appliedVersionNumber
          }
          
          // Clear any cached version info to force refresh
          if (item.priceStatus.versionInfo) {
            item.priceStatus.versionInfo.currentVersion = appliedVersionId
          }
          
          console.log('🔧 DEBUG: Updated item priceStatus with version:', appliedVersionId)
          console.log('🔧 DEBUG: Complete priceStatus:', item.priceStatus)
        }
      }
      
      // Also update any cached price calculation version info
      if (response.priceVersion?.versionId) {
        const versionId = response.priceVersion.versionId
        if (item.priceCalculation) {
          item.priceCalculation.versionId = versionId
        }
        if (item.calculatedWith) {
          item.calculatedWith.versionId = versionId
        }
        if (item.priceSettings) {
          item.priceSettings.versionId = versionId
        }
        if (item.priceVersionApplied) {
          item.priceVersionApplied.versionId = versionId
        }
      }
      
      showNotification?.('Fiyat başarıyla güncellendi', 'success')
      setShowPriceUpdateModal(false)
      setPriceUpdateData(null)
      
      // Force refresh of item data to reflect changes
      if (typeof onSaved === 'function') {
        console.log('🔧 DEBUG: Calling onSaved callback to refresh data')
        await onSaved()
      }
      
      // Force UI update by triggering component re-render
      React.startTransition(() => {
        // Force a re-render by updating form state
        setForm(prev => ({ ...prev, _refresh: Date.now() }))
        // Also update manual price input to reflect new price if no manual override
        if (!item.manualOverride?.active && response.updatedPrice) {
          setManualPriceInput(formatManualPriceInput(response.updatedPrice))
        }
        // Force re-evaluation of component state
        setCurrStatus(prev => prev) // Trigger re-render
      })
      
      // Check for version updates after price update
      if (checkAndProcessVersionUpdates && setGlobalProcessing) {
        console.log('🔧 DEBUG: Triggering version updates check after price application')
        await checkAndProcessVersionUpdates(currentQuotes)
      }
      
      // Additional cleanup: clear any cached price status modal data
      setTimeout(() => {
        console.log('🔧 DEBUG: Post-update cleanup - current item status:', item.priceStatus?.status)
        console.log('🔧 DEBUG: Post-update cleanup - current version:', item.priceStatus?.currentVersion)
        console.log('🔧 DEBUG: Post-update cleanup - settings version ID:', item.priceStatus?.settingsVersionId)
      }, 100)
    } catch (error) {
      console.error('Price update error:', error)
      showNotification?.(`Fiyat güncellemesi başarısız: ${error.message || 'Beklenmeyen hata'}`, 'error')
    } finally {
      setManualLoading(false)
    }
  }
  
  async function onAddTech(filesList) {
    const arr = Array.from(filesList)
    const parsed = []
    for (const f of arr) {
      const sizeMb = f.size / (1024*1024)
      if (sizeMb > MAX_FILE_MB) continue
      const ext = extOf(f.name)
      if (!ACCEPT_EXT.includes(ext)) continue
      const dataUrl = await readFileAsDataUrl(f)
      parsed.push({ name: f.name, type: f.type || ext, size: f.size, dataUrl })
    }
    setTechFiles((p) => p.concat(parsed).slice(0, MAX_FILES))
  }
  
  async function onAddProd(filesList) {
    const arr = Array.from(filesList)
    const parsed = []
    for (const f of arr) {
      const sizeMb = f.size / (1024*1024)
      if (sizeMb > MAX_FILE_MB) continue
      const ext = extOf(f.name)
      if (!isImageExt(ext) && !isImageExt(f.type)) continue
      const dataUrl = await readFileAsDataUrl(f)
      parsed.push({ name: f.name, type: f.type || ext, size: f.size, dataUrl })
    }
    setProdImgs((p) => p.concat(parsed).slice(0, MAX_PRODUCT_FILES))
  }
  
  async function onSave() {
    if (isNew) {
      const payload = {
        id: uid(),
        createdAt: new Date().toISOString(),
        status: currStatus,
        files: techFiles, 
        productImages: prodImgs
      }
      
      // Add dynamic fields from form config
      if (formConfig && formConfig.formStructure.fields) {
        formConfig.formStructure.fields.forEach(field => {
          
            let value = form[field.id]
            
            // Handle special field types
            if (field.type === 'multiselect' && typeof value === 'string') {
              value = value.split(',').map(s => s.trim()).filter(Boolean)
            } else if (field.type === 'number') {
              value = value ? parseFloat(value) || value : value
            }
            
            payload[field.id] = value
          })
      }
      
      await API.createQuote(payload)
      showNotification('Yeni kayıt başarıyla oluşturuldu!', 'success')
    } else {
      const patch = {
        status: currStatus,
        files: techFiles, 
        productImages: prodImgs
      }
      
      // Add dynamic fields from form config
      if (formConfig && formConfig.formStructure.fields) {
        formConfig.formStructure.fields.forEach(field => {
          
            let value = form[field.id]
            
            // Handle special field types
            if (field.type === 'multiselect' && typeof value === 'string') {
              value = value.split(',').map(s => s.trim()).filter(Boolean)
            } else if (field.type === 'number') {
              value = value ? parseFloat(value) || value : value
            }
            
            patch[field.id] = value
          })
      }
      
      await API.updateQuote(item.id, patch)
      showNotification('Kayıt başarıyla güncellendi!', 'success')
    }
    setEditing(false)
    try { if (typeof onSaved === 'function') await onSaved() } catch {}
   
    onClose()
  }

  // Price Update Modal component
  const PriceUpdateModal = showPriceUpdateModal && priceUpdateData && React.createElement('div', {
    style: {
      position: 'fixed',
      inset: 0,
      background: 'rgba(0,0,0,0.7)',
      backdropFilter: 'blur(4px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 60
    },
    onClick: () => setShowPriceUpdateModal(false)
  },
    React.createElement('div', {
      className: 'card detail-modal',
      style: {
        width: 'min(500px, 90vw)',
        maxHeight: '85vh',
        overflowY: 'auto',
        position: 'relative',
        padding: '20px',
        margin: '20px'
      },
      onClick: (e) => e.stopPropagation()
    },
      React.createElement('div', {
        style: {
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '20px',
          paddingBottom: '10px',
          borderBottom: '1px solid rgba(255,255,255,0.1)'
        }
      },
        React.createElement('h3', { style: { margin: 0 } }, 'Fiyat Güncelleme'),
        React.createElement('button', {
          style: {
            background: 'none',
            border: 'none',
            color: '#888',
            fontSize: '24px',
            cursor: 'pointer',
            padding: 0,
            width: '30px',
            height: '30px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          },
          onClick: () => setShowPriceUpdateModal(false)
        }, '×')
      ),
      React.createElement('div', { style: { marginBottom: '20px' } },
        React.createElement('p', { style: { margin: '8px 0' } }, `Müşteri: ${priceUpdateData.customerName}`),
        React.createElement('p', { style: { margin: '8px 0' } }, `Proje: ${priceUpdateData.projectName}`),
        React.createElement('p', { style: { margin: '8px 0' } }, `Mevcut Fiyat: ₺${priceUpdateData.currentPrice.toFixed(2)}`),
        React.createElement('p', { style: { margin: '8px 0' } }, `Yeni Fiyat: ₺${priceUpdateData.newPrice.toFixed(2)}`),
        React.createElement('p', { 
          style: { 
            margin: '8px 0', 
            color: priceUpdateData.priceDifference >= 0 ? '#dc3545' : '#28a745', 
            fontWeight: 'bold' 
          } 
        }, `Fiyat Farkı: ${priceUpdateData.priceDifference >= 0 ? '+' : ''}₺${priceUpdateData.priceDifference.toFixed(2)}`),
        React.createElement('div', {
          style: {
            margin: '8px 0',
            fontSize: '13px',
            color: '#666'
          }
        },
          React.createElement('div', null, `Orijinal Versiyon: ${priceUpdateData.originalVersion}`),
          React.createElement('div', null, `Mevcut Versiyon: ${priceUpdateData.currentVersion}`),
          React.createElement('div', null, `Güncel Versiyon: ${priceUpdateData.latestVersion}`),
          (Math.abs(priceUpdateData.priceDifference) > 0.01) &&
          React.createElement('div', null, `Karşılaştırma Bazı: ${priceUpdateData.comparisonBasis}`)
        ),
        priceUpdateData.parameterChanges && priceUpdateData.parameterChanges.length > 0 &&
        React.createElement('div', { style: { margin: '12px 0' } },
          React.createElement('strong', { style: { display: 'block', marginBottom: '6px' } }, 'Parametre Değişiklikleri'),
          React.createElement('ul', { style: { paddingLeft: '18px', margin: 0 } },
            priceUpdateData.parameterChanges.map((change, index) =>
              React.createElement('li', {
                key: index,
                style: { marginBottom: '4px', color: '#555' }
              }, change)
            )
          )
        )
      ),
      React.createElement('div', {
        style: {
          display: 'flex',
          gap: '10px',
          justifyContent: 'flex-end',
          borderTop: '1px solid rgba(255,255,255,0.1)',
          paddingTop: '15px'
        }
      },
        React.createElement('button', {
          className: 'btn btn-secondary',
          onClick: () => setShowPriceUpdateModal(false)
        }, 'İptal'),
        React.createElement('button', {
          className: 'btn btn-primary',
          onClick: handleApplyPriceUpdate,
          disabled: manualLoading
        }, manualLoading ? 'Güncelleniyor...' : 'Fiyatı Güncelle')
      )
    )
  )
  
  return React.createElement('div', { style: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50
  }, onClick: onClose },
    React.createElement('div', { className: 'card detail-modal', style: { width: 'min(680px, 96vw)', maxHeight: '85vh', overflowY: 'auto', position: 'relative', padding: 12, fontSize: 13 }, onClick: (e) => e.stopPropagation() },
      React.createElement('div', { className: 'row', style: { justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, position: 'sticky', top: 0, zIndex: 5, background: 'linear-gradient(180deg, #0f1e2c, #0c1924)', padding: '8px 6px', borderBottom: '1px solid rgba(255,255,255,0.08)' } },
        React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
          React.createElement('h3', { style: { margin: 0, fontSize: 16 } }, t.a_detail),
          React.createElement('button', { 
            className: 'btn', 
            onClick: onClose, 
            title: t.tt_close,
            onMouseOver: (e) => e.target.style.backgroundColor = 'rgba(0,0,0,0.1)',
            onMouseOut: (e) => e.target.style.backgroundColor = '',
            style: { 
              transition: 'all 0.2s ease',
              fontSize: '20px',
              width: '32px',
              height: '32px',
              padding: '0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '50%'
            }
          }, '×')
        ),
        React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
          (!editing && !isNew) ? React.createElement('button', { 
            className: 'btn', 
            onClick: () => setEditing(true),
            onMouseOver: (e) => e.target.style.backgroundColor = 'rgba(0,0,0,0.1)',
            onMouseOut: (e) => e.target.style.backgroundColor = '',
            style: { transition: 'all 0.2s ease' }
          }, t.edit) : React.createElement(React.Fragment, null,
            React.createElement('button', { 
              className: 'btn accent', 
              onClick: onSave,
              onMouseOver: (e) => e.target.style.backgroundColor = 'rgba(255,255,255,0.2)',
              onMouseOut: (e) => e.target.style.backgroundColor = '',
              style: { transition: 'all 0.2s ease' }
            }, t.save),
            React.createElement('button', { 
              className: 'btn', 
              onClick: () => setEditing(false),
              onMouseOver: (e) => e.target.style.backgroundColor = 'rgba(0,0,0,0.1)',
              onMouseOut: (e) => e.target.style.backgroundColor = '',
              style: { transition: 'all 0.2s ease' }
            }, t.cancel)
          ),
          !editing && item.priceStatus && React.createElement('span', {
            onClick: (e) => {
              e.stopPropagation()
              handlePriceStatusClick()
            },
            title: 'Fiyat güncelleme bilgileri için tıklayın',
            style: {
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              padding: '6px 12px',
              borderRadius: '4px',
              fontSize: '12px',
              fontWeight: '500',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              cursor: 'pointer',
              opacity: 1,
              transition: '0.2s',
              backgroundColor: 'rgba(239, 68, 68, 0.1)',
              color: '#ef4444',
              height: '32px' // Düzenle butonu ile aynı yükseklik
            }
          }, 
            React.createElement('span', null, 'Fiyatlandırma Bilgileri')
          )
        )
      ),
      
      !isNew && React.createElement('div', {
        className: 'card manual-price-management',
        style: {
          padding: '12px',
          marginBottom: '12px',
          background: 'rgba(15, 30, 44, 0.65)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '8px'
        }
      },
        React.createElement('div', {
          className: 'manual-price-header',
          style: {
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '8px'
          }
        },
          React.createElement('strong', null, 'Manuel Fiyat Yönetimi'),
          manualOverrideActive && React.createElement('span', {
            className: 'manual-price-lock-indicator',
            style: { color: '#ffc107', fontSize: '12px', fontWeight: 600 }
          }, `###🔒 ${formatPriceDisplay(manualOverride?.price ?? item.price)}`)
        ),
        React.createElement('div', {
          className: 'manual-price-controls',
          style: {
            display: 'flex',
            flexWrap: 'wrap',
            gap: '8px',
            alignItems: 'center',
            marginBottom: '6px'
          }
        },
          React.createElement('input', {
            type: 'number',
            step: '0.01',
            min: '0',
            value: manualPriceInput,
            onChange: (e) => setManualPriceInput(e.target.value),
            disabled: manualLoading,
            className: 'manual-price-input',
            style: {
              flex: '0 0 140px',
              padding: '6px 8px',
              borderRadius: '4px',
              border: '1px solid rgba(255,255,255,0.2)',
              background: 'rgba(15,23,42,0.45)',
              color: 'var(--text, #f8fafc)'
            }
          }),
          React.createElement('input', {
            type: 'text',
            placeholder: 'Not (opsiyonel)',
            value: manualNote,
            onChange: (e) => setManualNote(e.target.value),
            disabled: manualLoading,
            className: 'manual-price-note',
            style: {
              flex: '1 1 200px',
              minWidth: '160px',
              padding: '6px 8px',
              borderRadius: '4px',
              border: '1px solid rgba(255,255,255,0.2)',
              background: 'rgba(15,23,42,0.45)',
              color: 'var(--text, #f8fafc)'
            }
          }),
          React.createElement('button', {
            className: 'btn manual-price-btn',
            onClick: handleManualPriceSave,
            disabled: manualLoading,
            style: {
              padding: '4px 8px',
              fontSize: '12px',
              opacity: manualLoading ? 0.6 : 1
            }
          }, manualOverrideActive ? 'Güncelle' : 'Kilitle'),
          manualOverrideActive && React.createElement('button', {
            onClick: () => {
              console.log('🔴 UYGULA BUTTON CLICKED!')
              console.log('🔴 manualLoading:', manualLoading)
              console.log('🔴 item.id:', item?.id)
              handleManualRelease(true)
            },
            disabled: manualLoading,
            className: 'manual-price-apply-btn',
            style: {
              marginLeft: '4px',
              padding: '2px 4px',
              border: '1px solid rgba(220, 53, 69, 0.6)',
              borderRadius: '4px',
              backgroundColor: 'rgb(220, 53, 69)',
              color: '#fff',
              fontSize: '10px',
              cursor: manualLoading ? 'not-allowed' : 'pointer',
              opacity: manualLoading ? 0.7 : 1
            }
          }, 'Uygula'),
          manualOverrideActive && React.createElement('button', {
            className: 'btn manual-price-btn',
            onClick: () => handleManualRelease(false),
            disabled: manualLoading,
            style: {
              padding: '4px 8px',
              fontSize: '12px',
              opacity: manualLoading ? 0.6 : 1
            }
          }, 'Kilidi Aç')
        ),
        React.createElement('div', {
          className: 'manual-price-description',
          style: {
            fontSize: '12px',
            color: 'rgba(255,255,255,0.75)',
            lineHeight: 1.5
          }
        }, manualOverrideActive
          ? [
              manualSetAtText ? `Kilit ${manualSetAtText} tarihinde ${manualSetByText || 'admin'} tarafından oluşturuldu.` : `Kilit ${(manualSetByText || 'admin')} tarafından oluşturuldu.`,
              manualOverride?.note ? ` Not: ${manualOverride.note}` : null
            ].filter(Boolean).join(' ') : 'Bu alanı kullanarak otomatik fiyatı geçersiz kılıp manuel değer belirleyebilirsiniz.'),
        manualLoading && React.createElement('div', {
          className: 'manual-price-loading',
          style: { fontSize: '11px', color: '#9ca3af', marginTop: '4px' }
        }, 'İşlem yapılıyor...')
      ),
      (!editing && !isNew) ? React.createElement('div', { className: 'grid two', style: { gap: 8 } },
        ...renderDetailFields()
      ) : React.createElement('div', { className: 'grid two', style: { gap: 8 } },
        ...renderEditFields()
      ),
      React.createElement('div', { style: { height: 10 } }),
      React.createElement('div', { className: 'row wrap' },
        React.createElement('button', { className: (currStatus === 'review' ? 'btn accent' : 'btn'), onClick: () => { setCurrStatus('review'); setItemStatus(item.id, 'review') }, style: { padding: '6px 10px', fontSize: 12 }, title: t.tt_status_review }, t.s_review),
        React.createElement('button', { className: (currStatus === 'feasible' ? 'btn accent' : 'btn'), onClick: () => { setCurrStatus('feasible'); setItemStatus(item.id, 'feasible') }, style: { padding: '6px 10px', fontSize: 12 }, title: t.tt_status_feasible }, t.s_feasible),
        React.createElement('button', { className: (currStatus === 'not' ? 'btn accent' : 'btn'), onClick: () => { setCurrStatus('not'); setItemStatus(item.id, 'not') }, style: { padding: '6px 10px', fontSize: 12 }, title: t.tt_status_not }, t.s_not),
        React.createElement('button', { className: (currStatus === 'quoted' ? 'btn accent' : 'btn'), onClick: () => { setCurrStatus('quoted'); setItemStatus(item.id, 'quoted') }, style: { padding: '6px 10px', fontSize: 12 }, title: t.tt_status_quoted }, t.s_quoted),
        React.createElement('button', { className: (currStatus === 'approved' ? 'btn accent' : 'btn'), onClick: () => { setCurrStatus('approved'); setItemStatus(item.id, 'approved') }, style: { padding: '6px 10px', fontSize: 12 } }, t.s_approved)
      ),
      React.createElement('div', { style: { height: 10 } }),
      (editing ? React.createElement('div', { className: 'grid two', style: { gap: 8, marginBottom: 6 } },
        React.createElement('div', { className: 'card', style: { padding: 10 } },
          React.createElement('div', { className: 'help', style: { marginBottom: 6 } }, t.add_tech_file),
          React.createElement('input', { type: 'file', multiple: true, accept: '.pdf,.png,.jpg,.jpeg,.dxf,.dwg,.step,.stp,.iges,.igs,application/pdf,image/png,image/jpeg,image/jpg', onChange: (e) => onAddTech(e.target.files) })
        ),
        React.createElement('div', { className: 'card', style: { padding: 10 } },
          React.createElement('div', { className: 'help', style: { marginBottom: 6 } }, t.add_prod_image),
          React.createElement('input', { type: 'file', multiple: true, accept: '.png,.jpg,.jpeg,image/png,image/jpeg,image/jpg', onChange: (e) => onAddProd(e.target.files) })
        )
      ) : null),
      (techFiles||[]).length ? React.createElement('div', { className: 'grid two', style: { gap: 8 } },
        techFiles.map((f, i) => React.createElement('div', { key: i, className: 'card file-card', style: { padding: 10, position: 'relative' } },
          React.createElement('div', { style: { marginBottom: 6 } }, `${f.name} (${(f.size/1024).toFixed(0)} KB)`),
          ((f.type||'').toLowerCase().includes('image') || ['png','jpg','jpeg'].includes((f.type||'').toLowerCase()))
            ? React.createElement('img', { className: 'preview-img', src: (function(){const u=(f.dataUrl||'')||(f.url||''); return /^https?:/i.test(u)?u:(u?API_BASE.replace(/\/$/,'')+u:'')})(), alt: f.name })
            : React.createElement('div', { className: 'file-thumb' }, 'Preview not available'),
          editing
            ? React.createElement('div', { className: 'dl-group' },
                React.createElement('button', { className: 'btn icon-btn', title: t.tt_download_txt, onClick: () => { if (f.dataUrl) downloadDataUrl(f.name, f.dataUrl); else window.open(f.url, '_blank') } }, '⬇'),
                React.createElement('button', { className: 'btn icon-btn danger', title: t.a_delete, onClick: () => setTechFiles((p)=>p.filter((_,ix)=>ix!==i)) }, '🗑️')
              )
            : React.createElement('button', { className: 'btn icon-btn dl-center', title: t.tt_download_txt, onClick: () => { if (f.dataUrl) downloadDataUrl(f.name, f.dataUrl); else { const u=f.url||''; window.open(/^https?:/i.test(u)?u:(API_BASE.replace(/\/$/,'')+u), '_blank') } } }, '⬇')
        ))
      ) : null,
      (prodImgs||[]).length ? React.createElement('div', { className: 'grid two', style: { gap: 8, marginTop: 10 } },
        prodImgs.map((f, i) => React.createElement('div', { key: i, className: 'card file-card', style: { padding: 10, position: 'relative' } },
          React.createElement('div', { style: { marginBottom: 6 } }, `${f.name} (${(f.size/1024).toFixed(0)} KB)`),
          ((f.type||'').toLowerCase().includes('image') || ['png','jpg','jpeg'].includes((f.type||'').toLowerCase()))
            ? React.createElement('img', { className: 'preview-img', src: (function(){const u=(f.dataUrl||'')||(f.url||''); return /^https?:/i.test(u)?u:(u?API_BASE.replace(/\/$/,'')+u:'')})(), alt: f.name })
            : React.createElement('div', { className: 'file-thumb' }, 'Preview not available'),
          editing
            ? React.createElement('div', { className: 'dl-group' },
                React.createElement('button', { className: 'btn icon-btn', title: t.tt_download_txt, onClick: () => { if (f.dataUrl) downloadDataUrl(f.name, f.dataUrl); else window.open(f.url, '_blank') } }, '⬇'),
                React.createElement('button', { className: 'btn icon-btn danger', title: t.a_delete, onClick: () => setProdImgs((p)=>p.filter((_,ix)=>ix!==i)) }, '🗑️')
              )
            : React.createElement('button', { className: 'btn icon-btn dl-center', title: t.tt_download_txt, onClick: () => { if (f.dataUrl) downloadDataUrl(f.name, f.dataUrl); else { const u=f.url||''; window.open(/^https?:/i.test(u)?u:(API_BASE.replace(/\/$/,'')+u), '_blank') } } }, '⬇')
        ))
      ) : null
    ),
    PriceUpdateModal
  )

  function info(k, v) {
    return React.createElement('div', { className: 'card', style: { padding: 10, fontSize: 13 } },
      React.createElement('div', { className: 'help', style: { fontSize: 11 } }, k),
      React.createElement('div', null, String(v || '—'))
    )
  }
  function editField(label, key) {
    return React.createElement('div', { className: 'card', style: { padding: 10 } },
      React.createElement('div', { className: 'help', style: { fontSize: 11 } }, label),
      React.createElement('input', { value: form[key] ?? '', onChange: (e) => setF(key, e.target.value) })
    )
  }
  function editArea(label, key) {
    return React.createElement('div', { className: 'card', style: { padding: 10 } },
      React.createElement('div', { className: 'help', style: { fontSize: 11 } }, label),
      React.createElement('textarea', { value: form[key] ?? '', onChange: (e) => setF(key, e.target.value) })
    )
  }
  function editRadio(label, key, options = ['yes', 'no']) {
    return React.createElement('div', { className: 'card', style: { padding: 10 } },
      React.createElement('div', { className: 'help', style: { fontSize: 11, marginBottom: 6 } }, label),
      React.createElement('div', { className: 'row' },
        options.map(option => 
          React.createElement('label', { 
            key: option,
            className: 'chip' 
          },
            React.createElement('input', { 
              type: 'radio', 
              name: key, 
              checked: (form[key]||'') === option, 
              onChange: () => setF(key, option) 
            }),
            React.createElement('span', null, option === 'yes' ? (t.yes || 'Evet') : option === 'no' ? (t.no || 'Hayır') : option)
          )
        )
      )
    )
  }
}
