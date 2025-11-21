// QuotesManager - Main quotes management component
import React from 'react';
import API from '../api/quotesApi.js'
import { priceApi } from '../api/index.js'
import { statusLabel, procLabel, materialLabel } from '../../../shared/i18n.js'
import { getTableColumns, getFieldValue, formatFieldValue } from '../lib/table-utils.js'
import { calculatePrice, getPriceChangeType } from '../lib/price-calculator.js'
import { createFilteredList, getFilterOptions, updateFilter, clearFilters, clearSpecificFilter, getActiveFilterCount } from '../lib/filter-utils.js'
import { DetailModal } from '../../../src/components/modals/DetailModal.js'
import SettingsModalCompact from '../../../src/components/modals/SettingsModal.js'
import { FilterPopup } from '../../../src/components/modals/FilterPopup.js'
import QuotesTabs from './QuotesTabs.jsx'
import PricingManager from './PricingManager.jsx'
import FormManager from './FormManager.jsx'
import { showToast } from '../utils/toast.js'

const { useState, useEffect, useMemo, useRef } = React;

const DRIFT_STATUSES = ['price-drift', 'content-drift', 'outdated', 'unknown', 'error']

// Uyarı türlerini belirle ve renkleri tanımla
function getQuoteWarningInfo(quote) {
  if (!quote || !quote.priceStatus) {
    return { type: 'none', color: null, priority: 0 }
  }

  const status = quote.priceStatus.status
  const diffSummary = quote.priceStatus.differenceSummary
  const priceDiff = Math.abs(diffSummary?.priceDiff || 0)
  
  // Eğer uyarı gizlenmişse warning yok
  if (quote.versionWarningHidden === true) {
    return { type: 'none', color: null, priority: 0 }
  }

  // Kırmızı uyarı: Fiyat farkı var
  if (priceDiff > 0 || status === 'price-drift') {
    return { 
      type: 'price', 
      color: '#dc3545', // Kırmızı
      bgColor: 'rgba(220, 53, 69, 0.1)',
      priority: 2 
    }
  }

  // Sarı uyarı: Sadece versiyon/parametre farkı var, fiyat aynı
  if (status === 'content-drift' || status === 'outdated') {
    const hasParameterChanges = diffSummary?.parameterChanges && 
      (diffSummary.parameterChanges.added?.length > 0 ||
       diffSummary.parameterChanges.removed?.length > 0 ||
       diffSummary.parameterChanges.modified?.length > 0)
    const hasFormulaChange = diffSummary?.formulaChanged === true
    
    if (hasParameterChanges || hasFormulaChange) {
      return { 
        type: 'version', 
        color: '#ffc107', // Sarı
        bgColor: 'rgba(255, 193, 7, 0.1)',
        priority: 1 
      }
    }
  }

  return { type: 'none', color: null, priority: 0 }
}

function isQuoteFlaggedForPricing(quote) {
  return getQuoteWarningInfo(quote).priority > 0
}

function QuotesManager({ t, onLogout, showNotification }) {
  console.log('🔄 QuotesManager component loaded at:', new Date().toLocaleTimeString())
  const [list, setList] = useState([])
  const [detail, setDetail] = useState(null)
  const [creating, setCreating] = useState(false)
  const [selected, setSelected] = useState(new Set())
  const [settingsModal, setSettingsModal] = useState(false)
  const [priceReview, setPriceReview] = useState(null)
  const [filterPopup, setFilterPopup] = useState(false)
  const [globalSearch, setGlobalSearch] = useState('')
  const [formConfig, setFormConfig] = useState(null)
  const [priceSettings, setPriceSettings] = useState({})
  const [showAddModal, setShowAddModal] = useState(false)
  const [pagination, setPagination] = useState({
    currentPage: 1,
    itemsPerPage: 10,
    totalItems: 0
  })
  const [activeTab, setActiveTab] = useState('quotes')
  const [users, setUsers] = useState([])
  const [userModal, setUserModal] = useState(false)
  const [newUser, setNewUser] = useState({ email: '', password: '', role: 'admin' })
  const [filters, setFilters] = useState({
    status: [],
    dateRange: { from: '', to: '' },
    qtyRange: { min: '', max: '' },
    lockedOnly: false
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [bulkProgress, setBulkProgress] = useState(null)
  const [globalProcessing, setGlobalProcessing] = useState(false) // Global processing state
  const [processingMessage, setProcessingMessage] = useState('') // Processing message
  const bulkCancelRef = useRef(false)
  const [sortConfig, setSortConfig] = useState({ columnId: 'date', direction: 'desc' })
  const [activeQuotesTab, setActiveQuotesTab] = useState(() => {
    const storedTab = localStorage.getItem('bk_quotes_tab') || 'quotes';
    console.log('🔍 QUOTES INIT: localStorage tab:', storedTab);
    return storedTab;
  })
  const [pricingHeaderActions, setPricingHeaderActions] = useState(null)
  const [pricingVersionHistory, setPricingVersionHistory] = useState(null)
  const [formHeaderActions, setFormHeaderActions] = useState(null)

  const handleQuotesTabChange = (newTab) => {
    console.log('🔥 ADMIN QUOTES TAB CHANGE:', newTab, 'Old:', activeQuotesTab);
    setActiveQuotesTab(newTab);
    localStorage.setItem('bk_quotes_tab', newTab);
  }

  useEffect(() => {
    // Clear localStorage to ensure only PostgreSQL data is shown
    console.log('🔧 Admin: Clearing localStorage quotes to show only PostgreSQL data');
    API.clearLocalStorageQuotes();
    loadQuotes();
  }, []);

  async function loadQuotes() {
    setLoading(true);
    setError(null);
    
    try {
      console.log('🔧 Admin: Loading quotes from API...');
      const quotesData = await API.listQuotes();
      console.log('🔧 Admin: Loaded', quotesData.length, 'quotes');
      setList(quotesData);

      // Check if there are pending version updates
      await checkAndProcessVersionUpdates(quotesData);

      setLoading(false);
      setError(null);
    } catch (error) {
      console.error("API quotes loading error:", error);
      if (error.message.includes('401') || error.message.includes('unauthorized')) {
        setError("Oturum süreniz dolmuş. Lütfen tekrar giriş yapın.");
        onLogout();
      } else if (error.message.includes('Load failed') || error.message.includes('NetworkError')) {
        // API sunucusuna bağlanılamıyor
        setError("API sunucusuna bağlanılamıyor. Lütfen sunucunun çalıştığından emin olun.");
        setList([]); // Boş liste göster, çökmesin
      } else {
        setError(`Veri yükleme hatası: ${error.message}`);
        setList([]); // Boş liste göster
      }
      setLoading(false);
    }
  }

  async function checkAndProcessVersionUpdates(quotesData) {
    try {
      // If quotesData is not provided, fetch it from the current list
      let dataToCheck = quotesData;
      if (!dataToCheck || !Array.isArray(dataToCheck)) {
        dataToCheck = list || [];
        if (dataToCheck.length === 0) {
          console.log('🔧 No quotes data available for version update check');
          return;
        }
      }

      // Check if there are quotes that need version comparison
      const quotesNeedingUpdate = dataToCheck.filter(quote => 
        !quote.manualOverride?.active && // Skip manually locked quotes
        quote.priceStatus && // Only process quotes that have priceStatus
        (quote.priceStatus.status === 'outdated' || 
         quote.priceStatus.status === 'price-drift' ||
         quote.priceStatus.status === 'content-drift' ||
         quote.priceStatus.status === 'unknown' ||
         quote.priceStatus.status === 'error')
      );

      if (quotesNeedingUpdate.length > 0) {
        console.log(`🔧 Processing ${quotesNeedingUpdate.length} quotes silently in background`);

        // Process quotes in batches to avoid overwhelming the backend
        const batchSize = 5;
        for (let i = 0; i < quotesNeedingUpdate.length; i += batchSize) {
          const batch = quotesNeedingUpdate.slice(i, i + batchSize);
          
          // Process batch
          await Promise.all(batch.map(async (quote) => {
            try {
              // Önce lokal olarak diff summary kontrol et
              const diffSummary = quote.priceStatus?.differenceSummary
              if (diffSummary && Math.abs(diffSummary.priceDiff || 0) === 0) {
                const hasParameterChanges = diffSummary.parameterChanges && 
                  (diffSummary.parameterChanges.added?.length > 0 ||
                   diffSummary.parameterChanges.removed?.length > 0 ||
                   diffSummary.parameterChanges.modified?.length > 0)
                const hasFormulaChange = diffSummary.formulaChanged === true
                
                // Eğer gerçek bir değişiklik yoksa status'ü current yap
                if (!hasParameterChanges && !hasFormulaChange) {
                  console.log(`🔧 Quote ${quote.id}: No real changes detected, updating status to current`)
                  const updatedQuote = { 
                    ...quote, 
                    priceStatus: { 
                      ...quote.priceStatus, 
                      status: 'current',
                      statusReason: null
                    } 
                  }
                  setList(prev => prev.map(q => q.id === quote.id ? updatedQuote : q))
                  return
                }
              }
              
              const comparison = await API.compareQuotePriceVersions(quote.id);
              if (comparison.needsUpdate) {
                // Update the quote with new price status
                const updatedQuote = { ...quote, priceStatus: comparison.status };
                setList(prev => prev.map(q => q.id === quote.id ? updatedQuote : q));
              }
            } catch (error) {
              console.warn(`Failed to update quote ${quote.id}:`, error);
            }
          }));

          // Small delay between batches
          await new Promise(resolve => setTimeout(resolve, 200));
        }
      }
    } catch (error) {
      console.error('Version update check failed:', error);
      // Just log the error, don't show any UI feedback
    }
  }

  useEffect(() => {
    // These can still be loaded once, or also be converted to listeners if they change often
    loadPriceSettings();
    loadFormConfig();
    if (activeTab === 'users') {
      loadUsers();
    }
  }, [activeTab]);

  async function refresh() {
    console.log('🔧 DEBUG: refresh() called')
    try {
      // PostgreSQL migration: syncLocalQuotesToFirebase removed
      // All data now directly from PostgreSQL
      
      // Reload quotes using the same method as initial load
      await loadQuotes()
      
      await loadPriceSettings()
      await loadFormConfig()
      if (activeTab === 'users') {
        await loadUsers()
      }
      console.log('🔧 DEBUG: refresh() completed successfully')
    } catch (error) {
      console.error('🔧 DEBUG: refresh() error:', error)
      showNotification('Refresh failed: ' + error.message, 'error')
    }
  }

  // Update detail modal when list changes
  React.useEffect(() => {
    if (detail && detail.id && list && list.length > 0) {
      const updatedItem = list.find(item => item.id === detail.id)
      if (updatedItem && JSON.stringify(updatedItem) !== JSON.stringify(detail)) {
        console.log('🔧 Updating detail modal with refreshed data from list change')
        setDetail(updatedItem)
      }
    }
  }, [list, detail])

  async function handleAddRecord(recordData) {
    console.log('🔧 DEBUG: handleAddRecord called with:', recordData)
    try {
      console.log('🔧 DEBUG: Calling API.addQuote...')
      const result = await API.addQuote(recordData)
      console.log('🔧 DEBUG: API.addQuote result:', result)
      
      console.log('🔧 DEBUG: Refreshing list...')
      await refresh() // Reload the list
      
      console.log('🔧 DEBUG: Showing success notification...')
      showNotification('Kayıt başarıyla eklendi', 'success')
      console.log('🔧 DEBUG: Add record completed successfully')
    } catch (error) {
      console.error('🔧 DEBUG: Error adding record:', error)
      showNotification('Kayıt eklenirken hata oluştu: ' + error.message, 'error')
    }
  }

  async function setItemStatus(itemId, newStatus) {
    try {
      await API.updateStatus(itemId, newStatus)
      
      // Update the detail item if it's currently being viewed
      if (detail && detail.id === itemId) {
        setDetail(prev => ({ ...prev, status: newStatus }))
      }
      
      await refresh() // Reload the list
      showNotification('Durum başarıyla güncellendi', 'success')

      // If approved, notify MES Approved Quotes to refresh
      if (String(newStatus).toLowerCase() === 'approved' || String(newStatus).toLowerCase() === 'onaylandı' || String(newStatus).toLowerCase() === 'onaylandi') {
        try { const ch = new BroadcastChannel('mes-approved-quotes'); ch.postMessage({ type: 'approvedCreated', quoteId: itemId }); ch.close?.() } catch {}
        try { if (typeof window !== 'undefined' && typeof window.refreshApprovedQuotes === 'function') window.refreshApprovedQuotes() } catch {}
      }
    } catch (error) {
      console.error('Error updating status:', error)
      const msg = error && error.message ? error.message : 'Durum güncellenirken hata oluştu'
      showNotification(msg, 'error')
    }
  }

  function showNotification(message, type = 'info') {
    showToast(message, type)
  }

  function exportToCSV() {
    try {
      // Seçili kayıtlar varsa onları kullan, yoksa filtrelenmiş tüm kayıtları kullan
      const dataToExport = selected.size > 0 
        ? filtered.filter(item => selected.has(item.id))
        : filtered

      if (!dataToExport || dataToExport.length === 0) {
        showNotification('Export edilecek veri bulunamadı', 'warning')
        return
      }

      // t objesinin güvenli versiyonu (fallback değerlerle)
      const safeT = t || {
        s_new: 'Yeni',
        s_review: 'İnceleme',
        s_feasible: 'Uygun',
        s_not: 'Uygun Değil',
        s_quoted: 'Teklif Verildi',
        s_approved: 'Onaylandı'
      }

      // CSV başlık satırı
      const headers = [
        'ID',
        'Durum',
        'Müşteri Adı',
        'Şirket',
        'Proje',
        'Telefon',
        'E-posta',
        'Fiyat',
        'Oluşturma Tarihi',
        'Güncellenme Tarihi',
        'Manuel Fiyat',
        'Manuel Not'
      ]

      // Dinamik alanları da başlıklara ekle
      if (formConfig && formConfig.formStructure && formConfig.formStructure.fields) {
        formConfig.formStructure.fields.forEach(field => {
          headers.push(field.label || field.id)
        })
      }

      // CSV verisini oluştur
      const csvData = dataToExport.map(item => {
        const baseFields = [
          item.id || '',
          statusLabel(item.status, safeT) || '',
          item.name || '',
          item.company || '',
          item.proj || '',
          item.phone || '',
          item.email || '',
          item.price || '',
          item.createdAt || '',
          item.updatedAt || '',
          item.manualOverride?.active ? item.manualOverride.price : '',
          item.manualOverride?.note || ''
        ]

        // Dinamik alanları da ekle
        const dynamicFields = []
        if (formConfig && formConfig.formStructure && formConfig.formStructure.fields) {
          formConfig.formStructure.fields.forEach(field => {
            const value = item.customFields?.[field.id] || ''
            dynamicFields.push(Array.isArray(value) ? value.join(', ') : value)
          })
        }

        return [...baseFields, ...dynamicFields].map(field => {
          // CSV için özel karakterleri escape et
          const str = String(field || '').replace(/"/g, '""')
          return `"${str}"`
        }).join(',')
      })

      // CSV içeriği
      const csvContent = [
        headers.map(h => `"${h}"`).join(','),
        ...csvData
      ].join('\n')

      // Dosya adı (tarih ile)
      const now = new Date()
      const timestamp = now.toISOString().split('T')[0] // YYYY-MM-DD format
      const filenameSuffix = selected.size > 0 ? '-selected' : ''
      const filename = `burkol-quotes-${timestamp}${filenameSuffix}.csv`

      // Dosyayı indir
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
      const link = document.createElement('a')
      
      if (link.download !== undefined) {
        const url = URL.createObjectURL(blob)
        link.setAttribute('href', url)
        link.setAttribute('download', filename)
        link.style.visibility = 'hidden'
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        
        const exportMessage = selected.size > 0 
          ? `${selected.size} seçili kayıt CSV olarak export edildi`
          : `${dataToExport.length} kayıt CSV olarak export edildi`
        showNotification(exportMessage, 'success')
      } else {
        showNotification('Tarayıcınız dosya indirmeyi desteklemiyor', 'error')
      }
    } catch (error) {
      console.error('CSV export error:', error)
      showNotification('CSV export edilirken hata oluştu', 'error')
    }
  }

  async function loadUsers() {
    try {
      const userList = await API.listUsers()
      setUsers(userList)
    } catch (e) {
      console.error('Users load error:', e)
      showNotification('Kullanıcılar yüklenemedi', 'error')
    }
  }

  async function handleAddUser() {
    try {
      if (!newUser.email || !newUser.password) {
        showNotification('Email ve şifre gerekli', 'error')
        return
      }
      
      await API.addUser(newUser.email, newUser.password, newUser.role)
      setNewUser({ email: '', password: '', role: 'admin' })
      setUserModal(false)
      await loadUsers()
      showNotification('Kullanıcı eklendi', 'success')
    } catch (e) {
      console.error('Add user error:', e)
      showNotification('Kullanıcı eklenemedi', 'error')
    }
  }

  async function handleDeleteUser(email) {
    if (!confirm(`${email} kullanıcısını silmek istediğinizden emin misiniz?`)) {
      return
    }
    
    try {
      await API.deleteUser(email)
      await loadUsers()
      showNotification('Kullanıcı silindi', 'success')
    } catch (e) {
      console.error('Delete user error:', e)
      showNotification('Kullanıcı silinemedi', 'error')
    }
  }

  async function loadPriceSettings() {
    try {
      console.log('📊 Loading active price settings from new API...')
      const setting = await priceApi.getActiveSetting()
      
      if (!setting || !setting.id) {
        console.warn('⚠️ No active price setting found, using empty defaults')
        setPriceSettings({
          parameters: [],
          formula: ''
        })
        return
      }

      // Convert to format expected by price calculator
      const convertedParams = (setting.parameters || []).map(p => ({
        id: p.code,
        name: p.name,
        type: p.type === 'form_lookup' ? 'form' : p.type,
        value: p.fixed_value,
        formField: p.form_field_code,
        lookupTable: p.lookup_table || []
      }))

      const priceSettings = {
        parameters: convertedParams,
        formula: setting.formula?.formula_expression || ''
      }

      console.log('✅ Price settings loaded:', {
        settingId: setting.id,
        version: setting.version,
        parametersCount: convertedParams.length,
        hasFormula: !!priceSettings.formula
      })

      setPriceSettings(priceSettings)
    } catch (e) {
      console.error('❌ Price settings load error:', e)
      // Set empty defaults on error
      setPriceSettings({
        parameters: [],
        formula: ''
      })
    }
  }

  async function loadFormConfig() {
    try {
      const config = await API.getFormConfig()
      setFormConfig(config.formConfig)
    } catch (e) {
      console.error('Form config load error:', e)
    }
  }

  async function handleLogout() {
    try {
      await API.logout()
      onLogout()
    } catch (e) {
      console.error('Logout error:', e)
      // Even if logout fails on server, clear local session
      onLogout()
    }
  }

  const collator = useMemo(() => new Intl.Collator('tr', { sensitivity: 'base', numeric: true }), [])

  // Use filtered list from utils
  const filtered = createFilteredList(list, filters, globalSearch, formConfig)
  const tableColumns = useMemo(() => getTableColumns(formConfig), [formConfig])

  const sortedFiltered = useMemo(() => {
    if (!Array.isArray(filtered) || filtered.length === 0) return filtered

    const { columnId, direction } = sortConfig || {}
    if (!columnId) return filtered

    const column = tableColumns.find(col => col.id === columnId)

    const getComparableValue = (item) => {
      const rawValue = getFieldValue(item, columnId)
      if (rawValue === null || rawValue === undefined) return null

      if (column?.type === 'date') {
        const timestamp = Date.parse(rawValue) || Date.parse(item?.createdAt) || 0
        return Number.isNaN(timestamp) ? 0 : timestamp
      }

      if (column?.type === 'currency' || column?.type === 'number') {
        if (typeof rawValue === 'number') return rawValue
        const numericString = String(rawValue).replace(/[^0-9,.-]/g, '')
        const normalized = numericString.includes(',')
          ? numericString.replace(/\./g, '').replace(',', '.')
          : numericString
        const numeric = parseFloat(normalized)
        return Number.isNaN(numeric) ? 0 : numeric
      }

      if (typeof rawValue === 'number') return rawValue

      if (typeof rawValue === 'string') {
        return rawValue.toLowerCase()
      }

      return String(rawValue)
    }

    const sorted = [...filtered].sort((a, b) => {
      const valueA = getComparableValue(a)
      const valueB = getComparableValue(b)

      if (valueA === valueB) return 0
      if (valueA === null || valueA === undefined) return direction === 'asc' ? 1 : -1
      if (valueB === null || valueB === undefined) return direction === 'asc' ? -1 : 1

      if (typeof valueA === 'number' && typeof valueB === 'number') {
        return direction === 'asc' ? valueA - valueB : valueB - valueA
      }

      const comparison = collator.compare(String(valueA), String(valueB))
      return direction === 'asc' ? comparison : -comparison
    })

    return sorted
  }, [filtered, sortConfig, tableColumns, collator])

  const filterOptions = getFilterOptions(list, formConfig)

  // Pagination logic
  const totalItems = sortedFiltered.length
  const totalPages = Math.ceil(totalItems / pagination.itemsPerPage)
  const startIndex = (pagination.currentPage - 1) * pagination.itemsPerPage
  const endIndex = startIndex + pagination.itemsPerPage
  const currentPageItems = sortedFiltered.slice(startIndex, endIndex)

  // Update total items when filtered list changes
  React.useEffect(() => {
    setPagination(prev => ({ ...prev, totalItems: totalItems }))
  }, [totalItems])

  async function setItemStatus(id, st) { 
    await API.updateStatus(id, st)
    // Update the specific quote in the list instead of full refresh
    setList(prevList => prevList.map(quote => quote.id === id ? { ...quote, status: st } : quote))
    showNotification('Kayıt durumu güncellendi!', 'success')
    // If approved, notify MES Approved Quotes to refresh
    if (String(st).toLowerCase() === 'approved' || String(st).toLowerCase() === 'onaylandı' || String(st).toLowerCase() === 'onaylandi') {
      try { const ch = new BroadcastChannel('mes-approved-quotes'); ch.postMessage({ type: 'approvedCreated', quoteId: id }); ch.close?.() } catch {}
      try { if (typeof window !== 'undefined' && typeof window.refreshApprovedQuotes === 'function') window.refreshApprovedQuotes() } catch {}
    }
  }

  async function remove(id) { 
    await API.remove(id) 
    // Remove the specific quote from the list instead of full refresh
    setList(prevList => prevList.filter(quote => quote.id !== id))
    // If this was the detail view, close it
    if (detail && detail.id === id) {
      setDetail(null)
    }
    showNotification('Kayıt silindi!', 'success')
  }

  function toggleOne(id, checked) {
    setSelected((prev) => {
      const newSet = new Set(prev)
      if (checked) {
        newSet.add(id)
      } else {
        newSet.delete(id)
      }
      return newSet
    })
  }

  function toggleAll(checked) {
    if (checked) {
      setSelected(new Set(filtered.map(item => item.id)))
    } else {
      setSelected(new Set())
    }
  }

  function handleSort(columnId) {
    setSortConfig(prev => {
      if (prev?.columnId === columnId) {
        const nextDirection = prev.direction === 'asc' ? 'desc' : 'asc'
        return { columnId, direction: nextDirection }
      }
      return { columnId, direction: columnId === 'date' ? 'desc' : 'asc' }
    })
    setPagination(prev => ({ ...prev, currentPage: 1 }))
  }

  function handleBulkProgressAction(action) {
    if (action === 'cancel') {
      setBulkProgress(prev => {
        if (!prev || prev.finished || prev.cancelling) return prev
        bulkCancelRef.current = true
        return { ...prev, cancelling: true }
      })
    } else if (action === 'close') {
      bulkCancelRef.current = false
      setBulkProgress(null)
    }
  }

  async function performBulkUpdate(targetIds, mode = 'selected') {
    if (!Array.isArray(targetIds) || targetIds.length === 0) {
      return
    }

    // Prevent overlapping bulk operations
    if (bulkProgress && !bulkProgress.finished && !bulkProgress.cancelled) {
      return
    }

    const idToQuote = new Map(list.map(q => [q.id, q]))
    
    // Filter out locked quotes (manual override active)
    const unlockedIds = targetIds.filter(id => {
      const quote = idToQuote.get(id)
      return !quote?.manualOverride?.active
    })
    
    const lockedIds = targetIds.filter(id => {
      const quote = idToQuote.get(id)
      return quote?.manualOverride?.active
    })
    
    // Filter out quotes that don't need updates (current price = calculated price)
    const needsUpdateIds = []
    const alreadyCurrentIds = []
    
    unlockedIds.forEach(id => {
      const quote = idToQuote.get(id)
      if (!quote) return
      
      const currentPrice = parseFloat(quote.price) || 0
      const calculatedPrice = parseFloat(quote.priceStatus?.calculatedPrice) || 0
      
      // Check if prices are exactly the same and status is current
      const isAlreadyCurrent = (currentPrice === calculatedPrice) && (quote.priceStatus?.status === 'current')
      
      if (isAlreadyCurrent) {
        console.log(`💡 Quote ${id}: Already current - current: ${currentPrice}, calculated: ${calculatedPrice}`)
        alreadyCurrentIds.push(id)
      } else {
        needsUpdateIds.push(id)
      }
    })
    
    if (lockedIds.length > 0) {
      console.log(`🔒 Skipping ${lockedIds.length} locked quotes:`, lockedIds)
    }
    
    if (alreadyCurrentIds.length > 0) {
      console.log(`✅ Skipping ${alreadyCurrentIds.length} already current quotes:`, alreadyCurrentIds)
    }

    const total = needsUpdateIds.length
    const skipped = lockedIds.length + alreadyCurrentIds.length
    bulkCancelRef.current = false

    // If no quotes need updating, show message and return
    if (total === 0) {
      const message = skipped > 0 
        ? `Tüm kayıtlar zaten güncel veya kilitli (${skipped} kayıt atlandı)`
        : 'Güncellenecek kayıt bulunamadı'
      showNotification(message, 'info')
      return
    }

    setBulkProgress({
      active: true,
      total,
      completed: 0,
      currentIndex: 0,
      currentId: null,
      currentName: '',
      cancelling: false,
      finished: false,
      cancelled: false,
      errors: [],
      skipped,
      mode
    })

    let processedCount = 0
    let successCount = 0
    const errors = []

    for (let i = 0; i < total; i++) {
      if (bulkCancelRef.current) {
        break
      }

      const id = needsUpdateIds[i]
      const quoteRef = idToQuote.get(id)
      setBulkProgress(prev => prev ? {
        ...prev,
        currentIndex: i,
        currentId: id,
        currentName: quoteRef?.name || id,
        completed: processedCount
      } : prev)

      try {
        const response = await API.applyCurrentPriceToQuote(id)
        successCount += 1
        if (response?.quote) {
          const updatedQuote = response.quote
          setList(prevList => prevList.map(q => q.id === id ? { ...q, ...updatedQuote } : q))
          if (detail && detail.id === id) {
            setDetail(prev => prev ? { ...prev, ...updatedQuote } : prev)
          }
        }
      } catch (error) {
        console.error('Bulk update quote error:', id, error)
        errors.push({ id, error: error?.message || 'Hata' })
      }

      processedCount += 1
      setBulkProgress(prev => prev ? { ...prev, completed: processedCount } : prev)
    }

    const cancelled = bulkCancelRef.current
    bulkCancelRef.current = false

    setBulkProgress(prev => prev ? {
      ...prev,
      completed: processedCount,
      currentId: null,
      currentName: '',
      finished: true,
      active: false,
      cancelling: false,
      cancelled,
      errors
    } : prev)

    if (mode === 'selected') {
      setSelected(new Set())
    }

    if (!cancelled) {
      let message = `${successCount} fiyat güncellendi`
      if (skipped > 0) {
        const lockedSkipped = lockedIds.length
        const currentSkipped = alreadyCurrentIds.length
        const skipDetails = []
        if (lockedSkipped > 0) skipDetails.push(`${lockedSkipped} kilitli`)
        if (currentSkipped > 0) skipDetails.push(`${currentSkipped} zaten güncel`)
        message += `, ${skipped} kayıt atlandı (${skipDetails.join(', ')})`
      }
      if (errors.length > 0) {
        message += `, ${errors.length} hata oluştu`
        showNotification(message, 'warning')
      } else {
        showNotification(message, 'success')
      }
    } else {
      showNotification(`Toplu güncelleme iptal edildi (${processedCount}/${total})`, errors.length ? 'warning' : 'info')
    }

    try {
      await refresh()
      // Check for version updates after bulk price update
      if (!cancelled && successCount > 0) {
        // Wait for state to update after refresh, then use current list
        setTimeout(() => {
          checkAndProcessVersionUpdates()
        }, 100)
      }
    } catch (refreshError) {
      console.error('Bulk refresh error:', refreshError)
    }
  }

  async function openPriceReview(item, snapshot = {}) {
    if (!item) return

    const fallbackOriginal = snapshot.originalPrice ?? (parseFloat(item.price) || 0)
    const fallbackNew = snapshot.newPrice ?? (parseFloat(item.priceStatus?.calculatedPrice) || fallbackOriginal)
    const initialDiff = snapshot.differenceSummary ?? item.priceStatus?.differenceSummary ?? null
    const fallbackVersions = snapshot.versions || {
      original: {
        // Orijinal versiyon: Quote oluşturulduğu zamanki versiyon (statik)
        version: item.originalPriceVersion?.versionNumber || item.createdAtVersion?.versionNumber || 'N/A',
        versionId: item.originalPriceVersion?.versionId || item.createdAtVersion?.versionId || '—',
        timestamp: item.originalPriceVersion?.capturedAt || item.createdAt || null
      },
      applied: {
        // Mevcut versiyon: Şu an aktif olan fiyat hesaplama versiyonu
        version: item.priceVersionApplied?.versionNumber || item.priceVersion?.versionNumber || item.priceStatus?.settingsVersion || priceSettings?.version || null,
        versionId: item.priceVersionApplied?.versionId || item.priceVersion?.versionId || item.priceStatus?.settingsVersionId || priceSettings?.versionId || null,
        timestamp: item.priceVersionApplied?.capturedAt || item.priceVersion?.capturedAt || item.priceStatus?.lastApplied || null
      },
      latest: {
        // Güncel versiyon: Sistemdeki en yeni fiyat hesaplama versiyonu
        version: priceSettings?.version || null,
        versionId: priceSettings?.versionId || null,
        timestamp: priceSettings?.updatedAt || null
      }
    }
    const fallbackSummary = initialDiff
      ? {
          ...initialDiff,
          priceDiff: initialDiff.priceDiff ?? (fallbackNew - fallbackOriginal),
          oldPrice: initialDiff.oldPrice ?? fallbackOriginal,
          newPrice: initialDiff.newPrice ?? fallbackNew
        }
      : null

    setPriceReview({
      item,
      originalPrice: fallbackOriginal,
      newPrice: fallbackNew,
      differenceSummary: fallbackSummary,
      versions: fallbackVersions,
      loading: true
    })

    try {
      const comparison = await API.getQuotePriceComparison(item.id)
      const summary = comparison.differenceSummary || {}
      const baselinePrice = summary.oldPrice ?? comparison.quote.appliedPrice ?? fallbackOriginal
      const latestPrice = summary.newPrice ?? comparison.quote.latestPrice ?? fallbackNew

      const comparisonDiff = {
        priceDiff: summary.priceDiff ?? Number((latestPrice - baselinePrice).toFixed(2)),
        oldPrice: baselinePrice,
        newPrice: latestPrice,
        reasons: summary.reasons || [],
        comparisonBaseline: summary.comparisonBaseline || comparison.comparisonBaseline || 'applied',
        parameterChanges: summary.parameterChanges || { added: [], removed: [], modified: [] },
        formulaChanged: summary.formulaChanged || false,
        evaluatedAt: summary.evaluatedAt || new Date().toISOString()
      }
      setPriceReview({
        item: { ...item, comparison },
        originalPrice: baselinePrice,
        newPrice: latestPrice,
        differenceSummary: comparisonDiff,
        versions: comparison.versions || fallbackVersions,
        loading: false
      })
    } catch (error) {
      console.error('Price comparison load error:', error)
      showNotification('Fiyat karşılaştırması yüklenemedi', 'error')
      setPriceReview(prev => prev ? { ...prev, loading: false, error: error.message } : null)
    }
  }

  async function handlePriceReviewApply() {
    if (!priceReview) return
    
    try {
      // Check if update is actually needed before API call
      const currentPrice = parseFloat(priceReview.originalPrice) || 0
      const newPrice = parseFloat(priceReview.newPrice) || 0
      
      if (currentPrice === newPrice) {
        console.log('💡 Price review: No actual price change needed', { currentPrice, newPrice })
        showNotification('Fiyat zaten güncel, güncelleme gerekmedi', 'info')
        setPriceReview(null)
        return
      }
      
      console.log('🔧 Applying price update for quote:', priceReview.item.id)
      setPriceReview(prev => prev ? { ...prev, updating: true } : prev)
      
      const response = await API.applyNewPrice(priceReview.item.id)
      if (!response || response.success === false) {
        throw new Error(response?.error || 'apply price failed')
      }

      // Always use the response.quote if available, only fallback if needed
      const updatedQuote = response.quote || {
        ...priceReview.item,
        price: response.updatedPrice || priceReview.newPrice,
        priceStatus: {
          ...(priceReview.item.priceStatus || {}),
          status: 'current',
          differenceSummary: null
        },
        // Make sure originalPriceVersion is preserved
        originalPriceVersion: priceReview.item.originalPriceVersion
      }

      setList(prevList => prevList.map(quote => quote.id === priceReview.item.id ? { ...quote, ...updatedQuote } : quote))

      if (detail && detail.id === priceReview.item.id) {
        setDetail(prev => ({ ...prev, ...updatedQuote }))
      }

      showNotification('Fiyat güncellendi!', 'success')
      setPriceReview(null)

      // No need to refresh - quote is already updated in list via setList() above
    } catch (error) {
      console.error('Price review apply error:', error)
      showNotification('Fiyat güncellenirken hata oluştu', 'error')
      setPriceReview(prev => prev ? { ...prev, updating: false } : prev)
    }
  }

  async function handleVersionUpdate() {
    if (!priceReview) return
    
    try {
      console.log('🔧 Updating version for quote:', priceReview.item.id)
      setPriceReview(prev => prev ? { ...prev, updating: true } : prev)
      
      const response = await API.updateQuoteVersion(priceReview.item.id)
      if (!response || response.success === false) {
        throw new Error(response?.error || 'version update failed')
      }

      const updatedQuote = response.quote || {
        ...priceReview.item,
        priceStatus: {
          ...(priceReview.item.priceStatus || {}),
          status: 'current',
          differenceSummary: null
        },
        priceVersionApplied: priceReview.versions?.latest || null,
        // Make sure originalPriceVersion is preserved
        originalPriceVersion: priceReview.item.originalPriceVersion
      }

      setList(prevList => prevList.map(quote => quote.id === priceReview.item.id ? { ...quote, ...updatedQuote } : quote))

      if (detail && detail.id === priceReview.item.id) {
        setDetail(prev => ({ ...prev, ...updatedQuote }))
      }

      showNotification('Versiyon güncellendi!', 'success')
      setPriceReview(null)

    } catch (error) {
      console.error('Version update error:', error)
      showNotification('Versiyon güncellenirken hata oluştu', 'error')
      setPriceReview(prev => prev ? { ...prev, updating: false } : prev)
    }
  }

  async function handleHideWarning() {
    if (!priceReview) return
    
    try {
      console.log('🔧 Hiding warning for quote:', priceReview.item.id)
      setPriceReview(prev => prev ? { ...prev, updating: true } : prev)
      
      const response = await API.hideVersionWarning(priceReview.item.id)
      if (!response || response.success === false) {
        throw new Error(response?.error || 'hide warning failed')
      }

      const updatedQuote = response.quote || {
        ...priceReview.item,
        versionWarningHidden: true,
        priceStatus: {
          ...(priceReview.item.priceStatus || {}),
          status: 'current'
        },
        // Make sure originalPriceVersion is preserved
        originalPriceVersion: priceReview.item.originalPriceVersion
      }

      setList(prevList => prevList.map(quote => quote.id === priceReview.item.id ? { ...quote, ...updatedQuote } : quote))

      if (detail && detail.id === priceReview.item.id) {
        setDetail(prev => ({ ...prev, ...updatedQuote }))
      }

      showNotification('Uyarı gizlendi', 'success')
      setPriceReview(null)

    } catch (error) {
      console.error('Hide warning error:', error)
      showNotification('Uyarı gizlenirken hata oluştu', 'error')
      setPriceReview(prev => prev ? { ...prev, updating: false } : prev)
    }
  }

  return React.createElement('div', { className: 'quotes-page' },
    // Global Processing Overlay
    globalProcessing && React.createElement('div', {
      style: {
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(255, 255, 255, 0.85)',
        backdropFilter: 'blur(2px)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 20000,
        fontSize: '16px',
        fontWeight: '500',
        color: '#333'
      }
    },
      React.createElement('div', {
        style: {
          width: '40px',
          height: '40px',
          border: '3px solid #f3f3f3',
          borderTop: '3px solid #2196f3',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite',
          marginBottom: '16px'
        }
      }),
      React.createElement('div', null, t.a_processing || 'Değişiklikler uygulanıyor...')
    ),

    // Quotes Tabs
    React.createElement(QuotesTabs, {
      activeTab: activeQuotesTab,
      onTabChange: handleQuotesTabChange,
      headerActions: {
        pricing: pricingHeaderActions,
        form: formHeaderActions
      },
      headerContent: {
        pricing: pricingVersionHistory
      }
    },
      // Tab 1: Teklifler  
      React.createElement('div', { className: 'quotes-list-content' },
        // MES Style Filter Bar
        React.createElement('div', { className: 'mes-filter-bar', style: { marginBottom: '24px' } },
          // Dashboard Indicators
          React.createElement('div', { className: 'quotes-dashboard-container' },
            React.createElement('section', { className: 'quotes-dashboard is-inline' },
              React.createElement('div', { className: 'stat' },
                React.createElement('span', { className: 'stat-label' }, 'Toplam Teklif'),
                React.createElement('span', { className: 'stat-value' }, list.length)
              ),
              React.createElement('div', { className: 'divider' }),
              React.createElement('div', { className: 'stat' },
                React.createElement('span', { className: 'stat-label' }, 'Seçili'),
                React.createElement('span', { className: 'stat-value' }, selected.size)
              ),
              (function() {
                const flaggedCount = list.filter(isQuoteFlaggedForPricing).length
                if (flaggedCount === 0) return null
                return [
                  React.createElement('div', { className: 'divider', key: 'divider' }),
                  React.createElement('div', { className: 'stat', key: 'stat' },
                    React.createElement('span', { className: 'stat-label' }, 'Güncelleme Gerekli'),
                    React.createElement('span', { className: 'stat-value warning' }, flaggedCount)
                  )
                ]
              })()
            )
          ),

          // Action Buttons
          React.createElement('button', {
            onClick: () => {
              console.log('🔧 DEBUG: Kayıt Ekle button clicked')
              setShowAddModal(true)
            },
            className: 'mes-primary-action is-compact',
            disabled: loading
          }, 
            React.createElement('span', null, '✚'),
            React.createElement('span', null, 'Yeni Teklif')
          ),
          
          React.createElement('button', {
            onClick: () => exportToCSV(),
            className: 'mes-filter-button is-compact',
            title: selected.size > 0 ? `${selected.size} seçili kaydı dışa aktar` : `${filtered.length} kaydı dışa aktar`,
            disabled: loading
          }, 
            React.createElement('span', null, '📊'),
            React.createElement('span', null, selected.size > 0 ? `CSV (${selected.size})` : 'CSV')
          ),
          
          selected.size > 0 && React.createElement('button', {
            onClick: (e) => {
              if (confirm(`${selected.size} kayıt silinecek. Emin misiniz?`)) {
                const selectedItems = Array.from(selected);
                selectedItems.forEach(id => remove(id));
                setSelected(new Set());
              }
            },
            className: 'mes-filter-clear is-compact',
            title: 'Seçili kayıtları sil',
            disabled: loading
          }, 
            React.createElement('span', null, '🗑️'),
            React.createElement('span', null, `Sil (${selected.size})`)
          ),
          
          // Locked quotes toggle
          React.createElement('button', {
            onClick: () => {
              setFilters(prev => ({ ...prev, lockedOnly: !prev.lockedOnly }))
            },
            title: filters.lockedOnly ? 'Kilitli filtresi aktif' : 'Sadece fiyatı kilitli kayıtları göster',
            className: filters.lockedOnly ? 'mes-filter-button is-compact active' : 'mes-filter-button is-compact'
          }, 
            React.createElement('span', null, '🔒')
          ),

          // Search Input
          React.createElement('input', {
            type: 'text',
            placeholder: 'Tüm veriler içinde arama...',
            value: globalSearch,
            onChange: (e) => setGlobalSearch(e.target.value),
            className: 'mes-search-input',
            disabled: loading
          }),
          
          // Filter Controls Container
          React.createElement('div', { className: 'mes-filter-controls' },
            // Filter Button
            React.createElement('button', {
              onClick: () => setFilterPopup(true),
              className: getActiveFilterCount(filters) > 0 ? 'mes-filter-button is-compact active' : 'mes-filter-button is-compact'
            }, 
              React.createElement('span', null, '🔍'),
              React.createElement('span', null, 'Filtreler'),
              getActiveFilterCount(filters) > 0 && React.createElement('span', { 
                className: 'filter-badge',
                style: {
                  position: 'absolute',
                  top: '-6px',
                  right: '-6px',
                  background: '#dc3545',
                  color: 'white',
                  borderRadius: '50%',
                  minWidth: '18px',
                  height: '18px',
                  fontSize: '10px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: '600'
                }
              }, getActiveFilterCount(filters))
            ),
            
            // Clear Filters
            (function() {
              const activeFilterCount = getActiveFilterCount(filters)
              const hasGlobalSearch = globalSearch && globalSearch.trim().length > 0
              const hasLockedFilter = filters.lockedOnly
              
              if (activeFilterCount === 0 && !hasGlobalSearch && !hasLockedFilter) {
                return null
              }
              
              return React.createElement('button', {
                onClick: () => clearFilters(setFilters, setGlobalSearch),
                className: 'mes-filter-clear is-compact',
                title: 'Tüm filtreleri temizle'
              }, 
                React.createElement('span', null, '✕'),
                React.createElement('span', null, 'Temizle')
              )
            })()
          )
        ),

    // Data table
    React.createElement('div', { className: 'quotes-table-container' },
      React.createElement('div', { className: 'quotes-table-wrapper' },
        // Loading overlay for table only
        loading && !bulkProgress && React.createElement('div', { className: 'quotes-loading' },
          React.createElement('div', { className: 'spinner' }),
          React.createElement('div', { className: 'loading-text' }, 'Veriler yükleniyor...')
        ),
        
        // Error overlay for table only
        error && !loading && !bulkProgress && React.createElement('div', { className: 'quotes-empty-state' },
          React.createElement('div', { className: 'empty-icon' }, '⚠️'),
          React.createElement('div', { className: 'empty-title' }, 'Veri yükleme hatası'),
          React.createElement('div', { className: 'empty-message' }, error)
        ),
        
        React.createElement('table', { className: 'quotes-table' },
          React.createElement('thead', null,
            React.createElement('tr', null,
              React.createElement('th', null,
                React.createElement('input', {
                  type: 'checkbox',
                  checked: selected.size === filtered.length && filtered.length > 0,
                  onChange: (e) => toggleAll(e.target.checked),
                  onClick: (e) => e.stopPropagation()
                })
              ),
              ...tableColumns.map(col => {
                const isActive = sortConfig?.columnId === col.id
                const indicator = isActive ? (sortConfig.direction === 'asc' ? '↑' : '↓') : '↕'
                return React.createElement('th', { key: col.id },
                  React.createElement('button', {
                    type: 'button',
                    onClick: () => handleSort(col.id),
                    className: isActive ? 'quotes-sort-button active' : 'quotes-sort-button'
                  },
                    col.label,
                    React.createElement('span', { className: 'quotes-sort-icon' }, indicator)
                  )
                )
              }),
              React.createElement('th', null, 'İşlemler')
            )
          ),
          React.createElement('tbody', null,
            currentPageItems.map(item => {
              const warningInfo = getQuoteWarningInfo(item)
              const hasWarning = warningInfo.priority > 0
              
              return React.createElement('tr', { 
                key: item.id,
                onClick: () => {
                  console.log('🔧 DEBUG: Row clicked for item:', item.id, item);
                  setDetail(item);
                },
                className: selected.has(item.id) ? 'selected' : '',
                style: { cursor: 'pointer' }
              },
                React.createElement('td', null,
                  React.createElement('input', {
                    type: 'checkbox',
                    checked: selected.has(item.id),
                    onChange: (e) => { e.stopPropagation(); toggleOne(item.id, e.target.checked) },
                    onClick: (e) => e.stopPropagation()
                  })
                ),
                ...tableColumns.map(col => 
                  React.createElement('td', { key: col.id },
                    formatFieldValue(
                      getFieldValue(item, col.id),
                      col,
                      item,
                      {
                        getPriceChangeType: (quote) => getPriceChangeType(quote, priceSettings),
                        setSettingsModal,
                        openPriceReview,
                        calculatePrice: (quote) => calculatePrice(quote, priceSettings),
                        statusLabel,
                        t
                      }
                    )
                  )
                ),
                React.createElement('td', null,
                  React.createElement('div', { className: 'row-actions' },
                    React.createElement('button', {
                      onClick: (e) => {
                        e.stopPropagation();
                        setDetail(item);
                      },
                      className: 'row-action-btn primary',
                      title: 'Detayları görüntüle'
                    }, 'Görüntüle'),
                    hasWarning && React.createElement('button', {
                      onClick: (e) => {
                        e.stopPropagation();
                        openPriceReview(item);
                      },
                      className: 'row-action-btn',
                      style: {
                        background: warningInfo.bgColor,
                        color: warningInfo.color,
                        borderColor: warningInfo.color
                      },
                      title: warningInfo.type === 'price' ? 'Fiyat güncellemesi gerekli' : 'Versiyon güncellemesi gerekli'
                    }, '⚠️ Güncelle'),
                    React.createElement('button', {
                      onClick: (e) => {
                        e.stopPropagation();
                        if (confirm('Bu kaydı silmek istediğinizden emin misiniz?')) {
                          remove(item.id);
                        }
                      },
                      className: 'row-action-btn danger',
                      title: 'Kaydı sil'
                    }, '🗑️')
                  )
                )
              )
            })
          )
        )
      )
    ),

    // Pagination
    totalPages > 1 && React.createElement('div', { 
      className: 'pagination-container',
      style: { 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        gap: '10px', 
        marginTop: '20px',
        padding: '20px 0'
      }
    },
      React.createElement('button', {
        onClick: () => setPagination(prev => ({ ...prev, currentPage: Math.max(1, prev.currentPage - 1) })),
        disabled: pagination.currentPage === 1,
        className: 'btn btn-sm',
        style: { padding: '5px 10px' }
      }, '← Önceki'),
      
      React.createElement('span', { 
        style: { 
          color: 'var(--text)', 
          fontSize: '14px',
          margin: '0 15px'
        }
      }, `Sayfa ${pagination.currentPage} / ${totalPages} (${totalItems} kayıt)`),
      
      React.createElement('button', {
        onClick: () => setPagination(prev => ({ ...prev, currentPage: Math.min(totalPages, prev.currentPage + 1) })),
        disabled: pagination.currentPage === totalPages,
        className: 'btn btn-sm',
        style: { padding: '5px 10px' }
      }, 'Sonraki →'),
      
      React.createElement('select', {
        value: pagination.itemsPerPage,
        onChange: (e) => setPagination(prev => ({ 
          ...prev, 
          itemsPerPage: parseInt(e.target.value),
          currentPage: 1 
        })),
        style: {
          marginLeft: '20px',
          padding: '5px',
          borderRadius: '4px',
          border: '1px solid rgba(255,255,255,0.2)',
          background: 'rgba(255,255,255,0.1)',
          color: 'var(--text)'
        }
      },
        React.createElement('option', { value: 5 }, '5 kayıt'),
        React.createElement('option', { value: 10 }, '10 kayıt'),
        React.createElement('option', { value: 25 }, '25 kayıt'),
        React.createElement('option', { value: 50 }, '50 kayıt')
      )
    )
    ), // End of Tab 1: Teklifler content
    
    // Tab 2: Fiyatlandırma
    React.createElement(PricingManager, {
      t: t,
      showNotification: showNotification,
      globalProcessing: globalProcessing,
      setGlobalProcessing: setGlobalProcessing,
      checkAndProcessVersionUpdates: () => {
        // Version updates için callback
        loadQuotes()
      },
      renderHeaderActions: (actions, versionHistory) => {
        setPricingHeaderActions(actions)
        setPricingVersionHistory(versionHistory)
      }
    }),
    
    // Tab 3: Form Yapısı
    React.createElement(FormManager, {
      t: t,
      showNotification: showNotification,
      renderHeaderActions: (actions) => {
        setFormHeaderActions(actions)
      }
    })
    ), // End of QuotesTabs

    bulkProgress && React.createElement(BulkProgressOverlay, {
      progress: bulkProgress,
      onAction: handleBulkProgressAction
    }),

    // Modals
    settingsModal && React.createElement(SettingsModalCompact, {
      onClose: () => setSettingsModal(false),
      onSettingsUpdated: refresh,
      t,
      showNotification,
      globalProcessing,
      setGlobalProcessing,
      checkAndProcessVersionUpdates
    }),

    detail && React.createElement(DetailModal, {
      item: detail,
      onClose: () => setDetail(null),
      setItemStatus: setItemStatus,
      onSaved: refresh,
      formConfig,
      t,
      showNotification,
      globalProcessing,
      setGlobalProcessing,
      checkAndProcessVersionUpdates,
      currentQuotes: list
    }),

    filterPopup && React.createElement(FilterPopup, {
      filters,
      filterOptions,
      formConfig,
      onFilterChange: (category, value, action) => updateFilter(filters, setFilters, category, value, action),
      onClose: () => setFilterPopup(false),
      t
    }),

    // Price review modal
    priceReview && priceReview.item && React.createElement('div', { 
      className: 'modal-overlay', 
      onClick: () => setPriceReview(null),
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
        className: 'card detail-modal', 
        onClick: (e) => e.stopPropagation(), 
        style: { 
          width: 'min(500px, 90vw)',
          maxHeight: '85vh',
          overflowY: 'auto',
          position: 'relative',
          padding: '20px',
          margin: '20px'
        } 
      },
        // Header
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
            onClick: () => setPriceReview(null),
            style: {
              background: 'none',
              border: 'none',
              color: '#888',
              fontSize: '24px',
              cursor: 'pointer',
              padding: '0',
              width: '30px',
              height: '30px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }
          }, '×')
        ),
        
        // Content
        priceReview.loading && React.createElement('p', { style: { marginBottom: '12px', color: '#999' } }, 'Karşılaştırma yükleniyor...'),
        priceReview.error && React.createElement('p', { style: { marginBottom: '12px', color: '#dc3545' } }, `Hata: ${priceReview.error}`),
        React.createElement('div', { style: { marginBottom: '20px' } },
          React.createElement('p', { style: { margin: '8px 0' } }, `Müşteri: ${priceReview.item.name || 'N/A'}`),
          React.createElement('p', { style: { margin: '8px 0' } }, `Proje: ${priceReview.item.proj || 'N/A'}`),
          React.createElement('p', { style: { margin: '8px 0' } }, `Mevcut Fiyat: ${Number.isFinite(Number(priceReview.originalPrice)) ? `₺${Number(priceReview.originalPrice).toFixed(2)}` : 'N/A'}`),
          React.createElement('p', { style: { margin: '8px 0' } }, `Yeni Fiyat: ${Number.isFinite(Number(priceReview.newPrice)) ? `₺${Number(priceReview.newPrice).toFixed(2)}` : 'N/A'}`),
          priceReview.differenceSummary?.priceDiff !== undefined && (() => {
            const priceDiff = Number(priceReview.differenceSummary.priceDiff)
            const warningInfo = getQuoteWarningInfo(priceReview.item)
            // Fiyat farkı varsa kırmızı, yoksa sarı (versiyon farkı)
            const color = Math.abs(priceDiff) > 0 ? '#dc3545' : '#ffc107'
            return React.createElement('p', { 
              style: { margin: '8px 0', color, fontWeight: '600' } 
            }, `Fiyat Farkı: ₺${priceDiff.toFixed(2)}`)
          })(),
          priceReview.versions && React.createElement('div', { style: { margin: '8px 0', fontSize: '13px', color: '#666' } },
            React.createElement('div', null, `Orijinal Versiyon: ${priceReview.versions.original?.version ?? 'N/A'} (${priceReview.versions.original?.versionId || '—'})`),
            React.createElement('div', null, `Mevcut Versiyon: ${priceReview.versions.applied?.version ?? 'N/A'} (${priceReview.versions.applied?.versionId || '—'})`),
            React.createElement('div', null, `Güncel Versiyon: ${priceReview.versions.latest?.version ?? 'N/A'} (${priceReview.versions.latest?.versionId || '—'})`),
            priceReview.differenceSummary?.comparisonBaseline && React.createElement('div', null, `Karşılaştırma Bazı: ${priceReview.differenceSummary.comparisonBaseline === 'applied' ? 'Mevcut → Güncel' : 'Orijinal → Güncel'}`)
          ),
          (() => {
            const changes = priceReview.differenceSummary?.parameterChanges
            if (!changes) return null

            const formatValue = (value) => {
              if (value === null || value === undefined || value === '') return '—'
              return typeof value === 'number' ? value : String(value)
            }

            const lines = []
            if (Array.isArray(changes.added)) {
              changes.added.forEach(change => {
                const label = change?.name || change?.id || 'Parametre'
                const val = formatValue(change?.newValue)
                lines.push(`Yeni parametre: ${label}${val !== '—' ? ` = ${val}` : ''}`)
              })
            }
            if (Array.isArray(changes.removed)) {
              changes.removed.forEach(change => {
                const label = change?.name || change?.id || 'Parametre'
                const val = formatValue(change?.oldValue)
                lines.push(`Parametre kaldırıldı: ${label}${val !== '—' ? ` (eski: ${val})` : ''}`)
              })
            }
            if (Array.isArray(changes.modified)) {
              changes.modified.forEach(change => {
                const label = change?.name || change?.id || 'Parametre'
                const oldVal = formatValue(change?.oldValue)
                const newVal = formatValue(change?.newValue)
                lines.push(`${label}: ${oldVal} → ${newVal}`)
              })
            }

            if (!lines.length) return null

            return React.createElement('div', { style: { margin: '12px 0' } },
              React.createElement('strong', { style: { display: 'block', marginBottom: '6px' } }, 'Parametre Değişiklikleri'),
              React.createElement('ul', { style: { paddingLeft: '18px', margin: 0 } },
                ...lines.map((text, idx) => React.createElement('li', { key: idx, style: { marginBottom: '4px', color: '#555' } }, text))
              )
            )
          })()
        ),
        
        // Footer buttons
        React.createElement('div', { 
          style: { 
            display: 'flex', 
            gap: '10px', 
            justifyContent: 'flex-end',
            borderTop: '1px solid rgba(255,255,255,0.1)',
            paddingTop: '15px'
          } 
        },
          (() => {
            const priceDiff = priceReview.differenceSummary?.priceDiff || 0
            const hasPriceDifference = Math.abs(priceDiff) > 0
            const hasVersionDifference = priceReview.versions?.applied?.version !== priceReview.versions?.latest?.version
            
            if (hasPriceDifference) {
              // Normal fiyat güncelleme durumu
              return [
                React.createElement('button', {
                  key: 'apply',
                  onClick: handlePriceReviewApply,
                  className: 'btn btn-primary',
                  disabled: priceReview.loading || priceReview.updating
                }, priceReview.updating ? 'Güncelleniyor...' : 'Fiyatı Güncelle')
              ]
            } else if (hasVersionDifference) {
              // Sadece versiyon farkı var, fiyat farkı yok
              return [
                React.createElement('button', {
                  key: 'version',
                  onClick: handleVersionUpdate,
                  className: 'btn btn-primary',
                  disabled: priceReview.loading || priceReview.updating
                }, priceReview.updating ? 'Güncelleniyor...' : 'Versiyonu Güncelle'),
                React.createElement('button', {
                  key: 'hide',
                  onClick: handleHideWarning,
                  className: 'btn btn-secondary',
                  disabled: priceReview.loading || priceReview.updating
                }, priceReview.updating ? 'İşleniyor...' : 'Uyarıyı Gizle')
              ]
            } else {
              // Ne fiyat farkı ne versiyon farkı yok
              return []
            }
          })()
        )
      )
    ),
    
    // Add Record Modal
    React.createElement(AddRecordModal, {
      isOpen: showAddModal,
      onClose: () => setShowAddModal(false),
      formConfig: formConfig,
      onSave: handleAddRecord
    })
  )
}

// AddRecordModal component - inline for simplicity
function AddRecordModal({ isOpen, onClose, formConfig, onSave }) {
  const [formData, setFormData] = useState({})
  const [saving, setSaving] = useState(false)

  // Debug log for modal state
  console.log('🔧 DEBUG: AddRecordModal render - isOpen:', isOpen, 'formConfig:', !!formConfig)

  // Initialize form data when modal opens
  useEffect(() => {
    if (isOpen && formConfig) {
      const initialData = {
        name: '',
        email: '',
        phone: '',
        company: '',
        proj: '',
        status: 'new',
        createdAt: new Date().toISOString(),
        customFields: {}
      }
      
      // Set default values for dynamic form fields
      if (formConfig.formStructure && formConfig.formStructure.fields) {
        formConfig.formStructure.fields.forEach(field => {
          if (field.type === 'multiselect' || field.type === 'checkbox') {
            initialData.customFields[field.id] = []
          } else if (field.type === 'number') {
            initialData.customFields[field.id] = ''
          } else {
            initialData.customFields[field.id] = ''
          }
        })
      }
      
      setFormData(initialData)
    }
  }, [isOpen, formConfig])

  // Handle field change
  function handleFieldChange(fieldId, value, fieldType) {
    // Check if this is a basic field or custom field
    const basicFields = ['name', 'email', 'phone', 'company', 'proj']
    
    if (basicFields.includes(fieldId)) {
      setFormData(prev => ({
        ...prev,
        [fieldId]: value
      }))
    } else {
      // Custom field
      setFormData(prev => ({
        ...prev,
        customFields: {
          ...prev.customFields,
          [fieldId]: fieldType === 'multiselect' && typeof value === 'string' 
            ? value.split(',').map(s => s.trim()).filter(Boolean)
            : value
        }
      }))
    }
  }

  // Handle save
  async function handleSave() {
    if (saving) return
    
    setSaving(true)
    try {
      // Don't generate ID here - let server create UUID
      const recordData = {
        ...formData,
        // Remove manual ID generation - server will create UUID
        createdAt: new Date().toISOString(),
        status: formData.status || 'new'
      }
      
      console.log('🔧 DEBUG: Submitting record data:', recordData)
      await onSave(recordData)
      console.log('🔧 DEBUG: Record saved successfully')
      onClose()
      setFormData({})
    } catch (error) {
      console.error('🔧 DEBUG: Error saving record:', error)
      alert('Kayıt kaydedilirken hata oluştu: ' + error.message)
    } finally {
      setSaving(false)
    }
  }

  // Render form field based on type
  function renderField(field) {
    const value = formData.customFields?.[field.id] || ''
    
    switch (field.type) {
      case 'textarea':
        return React.createElement('textarea', {
          value: value,
          onChange: (e) => handleFieldChange(field.id, e.target.value, field.type),
          style: {
            width: '100%',
            minHeight: '80px',
            padding: '8px',
            border: '1px solid #ddd',
            borderRadius: '4px',
            resize: 'vertical'
          },
          placeholder: field.label
        })
        
      case 'radio':
        return React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } },
          ...(field.options || []).map(option => 
            React.createElement('label', { 
              key: option,
              style: { display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }
            },
              React.createElement('input', {
                type: 'radio',
                name: field.id,
                value: option,
                checked: value === option,
                onChange: (e) => handleFieldChange(field.id, e.target.value, field.type)
              }),
              option
            )
          )
        )
        
      case 'multiselect':
        return React.createElement('input', {
          type: 'text',
          value: Array.isArray(value) ? value.join(', ') : value,
          onChange: (e) => handleFieldChange(field.id, e.target.value, field.type),
          style: {
            width: '100%',
            padding: '8px',
            border: '1px solid #ddd',
            borderRadius: '4px'
          },
          placeholder: `${field.label} (virgülle ayırın)`
        })
        
      case 'number':
        return React.createElement('input', {
          type: 'number',
          value: value,
          onChange: (e) => handleFieldChange(field.id, parseFloat(e.target.value) || 0, field.type),
          style: {
            width: '100%',
            padding: '8px',
            border: '1px solid #ddd',
            borderRadius: '4px'
          },
          placeholder: field.label
        })
        
      case 'date':
        return React.createElement('input', {
          type: 'date',
          value: value,
          onChange: (e) => handleFieldChange(field.id, e.target.value, field.type),
          style: {
            width: '100%',
            padding: '8px',
            border: '1px solid #ddd',
            borderRadius: '4px'
          }
        })
        
      case 'email':
        return React.createElement('input', {
          type: 'email',
          value: value,
          onChange: (e) => handleFieldChange(field.id, e.target.value, field.type),
          style: {
            width: '100%',
            padding: '8px',
            border: '1px solid #ddd',
            borderRadius: '4px'
          },
          placeholder: field.label
        })
        
      default: // text
        return React.createElement('input', {
          type: 'text',
          value: value,
          onChange: (e) => handleFieldChange(field.id, e.target.value, field.type),
          style: {
            width: '100%',
            padding: '8px',
            border: '1px solid #ddd',
            borderRadius: '4px'
          },
          placeholder: field.label
        })
    }
  }

  if (!isOpen) {
    console.log('🔧 DEBUG: AddRecordModal not rendering - isOpen is false')
    return null
  }

  console.log('🔧 DEBUG: AddRecordModal rendering modal content')

  return React.createElement('div', {
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
    },
    onClick: onClose
  },
    React.createElement('div', {
      className: 'card detail-modal',
      style: {
        width: 'min(600px, 90vw)',
        maxHeight: '85vh',
        overflowY: 'auto',
        position: 'relative',
        padding: '20px',
        margin: '20px'
      },
      onClick: (e) => e.stopPropagation()
    },
      // Header
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
        React.createElement('h3', { style: { margin: 0 } }, 'Yeni Kayıt Ekle'),
        React.createElement('button', {
          onClick: onClose,
          className: 'btn',
          style: {
            background: 'none',
            border: 'none',
            fontSize: '20px',
            cursor: 'pointer',
            color: '#999'
          }
        }, '×')
      ),
      
      // Form fields
      React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: '20px' } },
        // Basic fields
        React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px' } },
          React.createElement('label', { style: { fontWeight: 'bold', fontSize: '14px', color: '#333' } }, 'Müşteri Adı *'),
          React.createElement('input', {
            type: 'text',
            value: formData.name || '',
            onChange: (e) => handleFieldChange('name', e.target.value),
            style: { width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px' },
            placeholder: 'Müşteri adı'
          })
        ),
        React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px' } },
          React.createElement('label', { style: { fontWeight: 'bold', fontSize: '14px', color: '#333' } }, 'E-posta *'),
          React.createElement('input', {
            type: 'email',
            value: formData.email || '',
            onChange: (e) => handleFieldChange('email', e.target.value),
            style: { width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px' },
            placeholder: 'E-posta adresi'
          })
        ),
        React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px' } },
          React.createElement('label', { style: { fontWeight: 'bold', fontSize: '14px', color: '#333' } }, 'Telefon'),
          React.createElement('input', {
            type: 'tel',
            value: formData.phone || '',
            onChange: (e) => handleFieldChange('phone', e.target.value),
            style: { width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px' },
            placeholder: 'Telefon numarası'
          })
        ),
        React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px' } },
          React.createElement('label', { style: { fontWeight: 'bold', fontSize: '14px', color: '#333' } }, 'Şirket'),
          React.createElement('input', {
            type: 'text',
            value: formData.company || '',
            onChange: (e) => handleFieldChange('company', e.target.value),
            style: { width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px' },
            placeholder: 'Şirket adı'
          })
        ),
        React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px' } },
          React.createElement('label', { style: { fontWeight: 'bold', fontSize: '14px', color: '#333' } }, 'Proje'),
          React.createElement('input', {
            type: 'text',
            value: formData.proj || '',
            onChange: (e) => handleFieldChange('proj', e.target.value),
            style: { width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px' },
            placeholder: 'Proje adı'
          })
        ),
        
        // Dynamic form fields from admin configuration
        ...(formConfig && formConfig.formStructure && formConfig.formStructure.fields ? 
          formConfig.formStructure.fields.map(field =>
            React.createElement('div', { key: field.id, style: { display: 'flex', flexDirection: 'column', gap: '6px' } },
              React.createElement('label', {
                style: {
                  fontWeight: 'bold',
                  fontSize: '14px',
                  color: '#333'
                }
              }, field.label + (field.required ? ' *' : '')),
              renderField(field)
            )
          ) : [])
      ),
      
      // Footer buttons
      React.createElement('div', {
        style: {
          display: 'flex',
          justifyContent: 'flex-end',
          gap: '10px',
          marginTop: '20px',
          paddingTop: '20px',
          borderTop: '1px solid rgba(255,255,255,0.1)'
        }
      },
        React.createElement('button', {
          onClick: onClose,
          className: 'btn',
          style: {
            padding: '10px 20px',
            backgroundColor: '#6c757d',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer'
          }
        }, 'İptal'),
        React.createElement('button', {
          onClick: handleSave,
          disabled: saving,
          className: 'btn',
          style: {
            padding: '10px 20px',
            backgroundColor: saving ? '#999' : '#28a745',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: saving ? 'not-allowed' : 'pointer'
          }
        }, saving ? 'Kaydediliyor...' : 'Kaydet')
      )
    )
  )
}

function BulkProgressOverlay({ progress, onAction }) {
  const clamp = (value) => {
    if (!Number.isFinite(value)) return 0
    return Math.max(0, Math.min(100, value))
  }

  const percent = progress.total > 0 ? clamp((progress.completed / progress.total) * 100) : 0

  const statusText = progress.finished
    ? (progress.cancelled ? 'İşlem iptal edildi' : 'Toplu güncelleme tamamlandı')
    : (progress.cancelling ? 'İşlem iptal ediliyor...' : 'Fiyatlar güncelleniyor...')

  const subtitle = !progress.finished && progress.currentName
    ? `Şu an: ${progress.currentName}`
    : ''

  const showCancelButton = !progress.finished && !progress.cancelling
  const showCloseButton = progress.finished

  const errorList = Array.isArray(progress.errors) ? progress.errors : []
  const errorPreview = errorList.slice(0, 3)

  return React.createElement('div', {
    style: {
      position: 'fixed',
      inset: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.65)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 2000,
      pointerEvents: 'auto'
    }
  },
    React.createElement('div', {
      style: {
        width: 'min(420px, 90vw)',
        background: '#0f1e2c',
        color: '#fff',
        borderRadius: '12px',
        padding: '24px',
        position: 'relative',
        boxShadow: '0 12px 32px rgba(0,0,0,0.35)'
      }
    },
      React.createElement('button', {
        onClick: () => {
          if (progress.finished) {
            onAction('close')
          } else if (!progress.cancelling) {
            onAction('cancel')
          }
        },
        style: {
          position: 'absolute',
          top: '10px',
          right: '12px',
          background: 'transparent',
          border: 'none',
          color: '#aaa',
          fontSize: '20px',
          cursor: progress.cancelling && !progress.finished ? 'default' : 'pointer'
        },
        disabled: progress.cancelling && !progress.finished
      }, '×'),
      React.createElement('h3', {
        style: { margin: '0 0 12px 0', fontSize: '18px' }
      }, 'Toplu Fiyat Güncelleme'),
      React.createElement('p', {
        style: { margin: '4px 0', fontSize: '14px', color: '#f1f1f1' }
      }, statusText),
      subtitle && React.createElement('p', {
        style: { margin: '4px 0 12px 0', fontSize: '13px', color: '#b5b5b5' }
      }, subtitle),
      React.createElement('div', {
        style: {
          width: '100%',
          height: '12px',
          backgroundColor: 'rgba(255,255,255,0.1)',
          borderRadius: '6px',
          overflow: 'hidden'
        }
      },
        React.createElement('div', {
          style: {
            width: `${percent}%`,
            height: '100%',
            background: progress.finished ? '#28a745' : '#17a2b8',
            transition: 'width 0.2s ease'
          }
        })
      ),
      React.createElement('p', {
        style: { margin: '12px 0 0 0', fontSize: '13px', color: '#ddd' }
      }, `Tamamlanan: ${progress.completed}/${progress.total}${progress.skipped > 0 ? ` (${progress.skipped} kilitli atlandı)` : ''}`),
      errorPreview.length > 0 && React.createElement('div', {
        style: { marginTop: '12px', backgroundColor: 'rgba(220,53,69,0.1)', padding: '12px', borderRadius: '8px', color: '#f5c6cb' }
      },
        React.createElement('strong', { style: { display: 'block', marginBottom: '6px', color: '#f8d7da' } }, 'Hatalar'),
        React.createElement('ul', { style: { margin: 0, paddingLeft: '18px', fontSize: '12px' } },
          ...errorPreview.map((err, index) => React.createElement('li', { key: `${err.id || index}-err` }, typeof err === 'string' ? err : `${err.id ? `${err.id}: ` : ''}${err.error || 'Hata'}`))
        ),
        errorList.length > errorPreview.length && React.createElement('div', { style: { marginTop: '6px', fontSize: '12px' } }, `+${errorList.length - errorPreview.length} diğer hata`)
      ),
      React.createElement('div', {
        style: { display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '20px' }
      },
        showCancelButton && React.createElement('button', {
          onClick: () => onAction('cancel'),
          className: 'btn',
          style: {
            backgroundColor: '#ffc107',
            color: '#212529',
            border: 'none',
            padding: '6px 12px',
            borderRadius: '4px',
            cursor: progress.cancelling ? 'not-allowed' : 'pointer',
            opacity: progress.cancelling ? 0.6 : 1
          },
          disabled: progress.cancelling
        }, 'İptal Et'),
        showCloseButton && React.createElement('button', {
          onClick: () => onAction('close'),
          className: 'btn',
          style: {
            backgroundColor: '#28a745',
            color: 'white',
            border: 'none',
            padding: '6px 16px',
            borderRadius: '4px',
            cursor: 'pointer'
          }
        }, 'Kapat')
      )
    )
  )
}

export default QuotesManager
