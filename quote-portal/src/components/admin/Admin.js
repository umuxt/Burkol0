import React from 'react';
import API from '../../lib/api.js'
import { statusLabel, procLabel, materialLabel } from '../../i18n/index.js'
import { getTableColumns, getFieldValue, formatFieldValue } from './AdminTableUtils.js'
import { calculatePrice, getPriceChangeType } from './AdminPriceCalculator.js'
import { createFilteredList, getFilterOptions, updateFilter, clearFilters, clearSpecificFilter, getActiveFilterCount } from './AdminFilterUtils.js'
import { calculateStatistics, BarChart } from './AdminStatistics.js'
import { DetailModal } from '../modals/DetailModal.js'
import SettingsModalCompact from '../modals/SettingsModal.js'
import { FilterPopup } from '../modals/FilterPopup.js'

const { useState, useEffect, useMemo, useRef } = React;

const DRIFT_STATUSES = ['price-drift', 'content-drift', 'outdated', 'unknown', 'error']

function isQuoteFlaggedForPricing(quote) {
  if (!quote) return false
  if (DRIFT_STATUSES.includes(quote.priceStatus?.status)) return true
  if (quote.needsPriceUpdate === true) return true
  if (quote.formStructureChanged) return true
  return false
}

function Admin({ t, onLogout, showNotification }) {
  const [list, setList] = useState([])
  const [detail, setDetail] = useState(null)
  const [creating, setCreating] = useState(false)
  const [selected, setSelected] = useState(new Set())
  const [settingsModal, setSettingsModal] = useState(false)
  const [priceReview, setPriceReview] = useState(null)
  const [metric, setMetric] = useState('count')
  const [filterPopup, setFilterPopup] = useState(false)
  const [globalSearch, setGlobalSearch] = useState('')
  const [formConfig, setFormConfig] = useState(null)
  const [priceSettings, setPriceSettings] = useState({})
  const [showAddModal, setShowAddModal] = useState(false)
  const [notification, setNotification] = useState(null)
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
    qtyRange: { min: '', max: '' }
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [bulkProgress, setBulkProgress] = useState(null)
  const bulkCancelRef = useRef(false)

  useEffect(() => {
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

      setLoading(false);
      setError(null);
    } catch (error) {
      console.error("API quotes loading error:", error);
      if (error.message.includes('401') || error.message.includes('unauthorized')) {
        setError("Oturum süreniz dolmuş. Lütfen tekrar giriş yapın.");
        onLogout();
      } else {
        setError(`Veri yükleme hatası: ${error.message}`);
      }
      setLoading(false);
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
      // First sync any localStorage quotes to Firebase
      console.log('🔄 Syncing localStorage quotes to Firebase...')
      const syncResult = await API.syncLocalQuotesToFirebase()
      if (syncResult.synced > 0) {
        console.log('✅ Synced', syncResult.synced, 'localStorage quotes to Firebase')
        showNotification(`Synced ${syncResult.synced} local quotes to database`, 'success')
      }
      
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
      await API.updateQuoteStatus(itemId, newStatus)
      
      // Update the detail item if it's currently being viewed
      if (detail && detail.id === itemId) {
        setDetail(prev => ({ ...prev, status: newStatus }))
      }
      
      await refresh() // Reload the list
      showNotification('Durum başarıyla güncellendi', 'success')
    } catch (error) {
      console.error('Error updating status:', error)
      showNotification('Durum güncellenirken hata oluştu', 'error')
    }
  }

  function showNotification(message, type = 'info') {
    setNotification({ message, type })
    // Auto-hide after 3 seconds
    setTimeout(() => {
      setNotification(null)
    }, 3000)
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
      // Defensive check for API method availability
      if (typeof API.getPriceSettings !== 'function') {
        console.warn('API.getPriceSettings is not available, using defaults')
        setPriceSettings({
          currency: 'USD',
          margin: 20,
          discountThreshold: 1000,
          discountPercent: 5
        })
        return
      }
      
      const settings = await API.getPriceSettings()
      setPriceSettings(settings)
    } catch (e) {
      console.error('Price settings load error:', e)
      // Set default settings on error
      setPriceSettings({
        currency: 'USD',
        margin: 20,
        discountThreshold: 1000,
        discountPercent: 5
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

  // Use filtered list from utils
  const filtered = createFilteredList(list, filters, globalSearch, formConfig)
  const filterOptions = getFilterOptions(list, formConfig)

  // Pagination logic
  const totalItems = filtered.length
  const totalPages = Math.ceil(totalItems / pagination.itemsPerPage)
  const startIndex = (pagination.currentPage - 1) * pagination.itemsPerPage
  const endIndex = startIndex + pagination.itemsPerPage
  const currentPageItems = filtered.slice(startIndex, endIndex)

  // Update total items when filtered list changes
  React.useEffect(() => {
    setPagination(prev => ({ ...prev, totalItems: totalItems }))
  }, [totalItems])

  // Calculate statistics
  const statsAll = calculateStatistics(list, metric)
  const statsFiltered = calculateStatistics(filtered, metric)

  function metricLabel() {
    return metric === 'value' ? 'Toplam Değer (₺)' : 'Adet'
  }

  async function setItemStatus(id, st) { 
    await API.updateStatus(id, st)
    refresh()
    showNotification('Kayıt durumu güncellendi!', 'success')
  }

  async function remove(id) { 
    await API.remove(id) 
    refresh() 
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

    const total = targetIds.length
    bulkCancelRef.current = false

    const idToQuote = new Map(list.map(q => [q.id, q]))

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
      mode
    })

    let processedCount = 0
    let successCount = 0
    const errors = []

    for (let i = 0; i < total; i++) {
      if (bulkCancelRef.current) {
        break
      }

      const id = targetIds[i]
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
      if (errors.length > 0) {
        showNotification(`${successCount} kayıt güncellendi, ${errors.length} hata oluştu`, 'warning')
      } else {
        showNotification(`${successCount} fiyat güncellendi`, 'success')
      }
    } else {
      showNotification(`Toplu güncelleme iptal edildi (${processedCount}/${total})`, errors.length ? 'warning' : 'info')
    }

    try {
      await refresh()
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
        version: item.priceCalculation?.version,
        versionId: item.priceCalculation?.versionId || item.priceVersion?.versionId || null,
        timestamp: item.priceCalculation?.timestamp || item.createdAt || null
      },
      applied: {
        version: item.priceVersionApplied?.versionNumber || item.priceVersion?.versionNumber || item.priceStatus?.settingsVersion || priceSettings?.version || null,
        versionId: item.priceVersionApplied?.versionId || item.priceVersion?.versionId || item.priceStatus?.settingsVersionId || priceSettings?.versionId || null,
        timestamp: item.priceVersionApplied?.capturedAt || item.priceVersion?.capturedAt || item.priceStatus?.lastApplied || null
      },
      latest: {
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
      console.log('🔧 Applying price update for quote:', priceReview.item.id)
      setPriceReview(prev => prev ? { ...prev, updating: true } : prev)
      
      const response = await API.applyNewPrice(priceReview.item.id)
      if (!response || response.success === false) {
        throw new Error(response?.error || 'apply price failed')
      }

      const updatedQuote = response.quote || {
        ...priceReview.item,
        price: response.updatedPrice,
        calculatedPrice: response.calculatedPrice ?? response.updatedPrice,
        priceStatus: {
          ...(priceReview.item.priceStatus || {}),
          status: 'current',
          differenceSummary: null
        }
      }

      setList(prevList => prevList.map(quote => quote.id === priceReview.item.id ? { ...quote, ...updatedQuote } : quote))

      if (detail && detail.id === priceReview.item.id) {
        setDetail(prev => ({ ...prev, ...updatedQuote }))
      }

      showNotification('Fiyat güncellendi!', 'success')
      setPriceReview(null)

      setTimeout(() => {
        refresh()
      }, 100)
    } catch (error) {
      console.error('Price review apply error:', error)
      showNotification('Fiyat güncellenirken hata oluştu', 'error')
      setPriceReview(prev => prev ? { ...prev, updating: false } : prev)
    }
  }

  // Table columns from utils
  const tableColumns = getTableColumns(formConfig)

  return React.createElement('div', { className: 'admin-panel' },
    // Toast notification
    notification && React.createElement('div', {
      style: {
        position: 'fixed',
        top: '20px',
        left: '50%',
        transform: 'translateX(-50%)',
        backgroundColor: notification.type === 'success' ? '#4caf50' : notification.type === 'error' ? '#f44336' : '#2196f3',
        color: 'white',
        padding: '12px 24px',
        borderRadius: '8px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        zIndex: 10000,
        fontSize: '14px',
        fontWeight: '500',
        maxWidth: '400px',
        textAlign: 'center',
        animation: 'slideInDown 0.3s ease-out'
      }
    }, notification.message),

    // Header with logout button
    React.createElement('div', { className: 'header', style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' } },
      React.createElement('h1', null, t.a_title || 'Admin Panel'),
      React.createElement('div', { style: { display: 'flex', gap: '10px' } },
        React.createElement('a', { 
          href: './settings.html',
          className: 'btn', 
          style: { 
            backgroundColor: '#007bff', 
            color: 'white', 
            border: 'none',
            padding: '8px 12px',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '16px',
            transition: 'all 0.2s ease',
            textDecoration: 'none',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '5px'
          },
          onMouseOver: (e) => e.target.style.backgroundColor = '#0056b3',
          onMouseOut: (e) => e.target.style.backgroundColor = '#007bff',
          title: 'Sistem Ayarları'
        }, '⚙️ Ayarlar'),
        React.createElement('button', { 
          onClick: handleLogout, 
          className: 'btn', 
          style: { 
            backgroundColor: '#ff3b30', 
            color: 'white', 
            border: 'none',
            padding: '8px 16px',
            borderRadius: '6px',
            cursor: 'pointer'
          } 
        }, t.logout_btn || 'Çıkış Yap')
      )
    ),

    // Statistics charts
    React.createElement('div', { className: 'card', style: { marginBottom: 12 } },
      React.createElement('label', null, t.a_charts),
      React.createElement('div', { 
        className: 'row wrap', 
        style: { 
          gap: 12, 
          marginTop: 6, 
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'space-between'
        } 
      },
        React.createElement('div', { style: { flex: '1 1 calc(33.333% - 8px)', minWidth: 250, maxWidth: '100%' } },
          React.createElement(BarChart, { data: statsAll.byStatus, xLabel: t.dim_status, yLabel: metricLabel(), byKeyAlpha: false })
        ),
        React.createElement('div', { style: { flex: '1 1 calc(33.333% - 8px)', minWidth: 250, maxWidth: '100%' } },
          React.createElement(BarChart, { data: statsAll.byProcess, xLabel: t.dim_process, yLabel: metricLabel(), byKeyAlpha: false })
        ),
        React.createElement('div', { style: { flex: '1 1 calc(33.333% - 8px)', minWidth: 250, maxWidth: '100%' } },
          React.createElement(BarChart, { data: statsAll.byMaterial, xLabel: t.dim_material, yLabel: metricLabel(), byKeyAlpha: false })
        )
      )
    ),

    // Filters and search
    React.createElement('div', { className: 'card', style: { marginTop: 16 } },
      React.createElement('div', { className: 'row', style: { justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' } },
        React.createElement('label', { style: { fontSize: '16px', fontWeight: '600', margin: 0, minWidth: '120px' } }, t.a_list),
        
        // Search controls
        React.createElement('div', { style: { display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' } },
          React.createElement('input', {
            type: 'text',
            placeholder: 'Tüm veriler içinde arama...',
            value: globalSearch,
            onChange: (e) => setGlobalSearch(e.target.value),
            style: { padding: '6px 12px', border: '1px solid #ddd', borderRadius: '4px', minWidth: '200px' }
          }),
          React.createElement('button', {
            onClick: () => setFilterPopup(true),
            className: 'btn',
            style: {
              backgroundColor: getActiveFilterCount(filters) > 0 ? '#28a745' : '#6c757d',
              color: 'white',
              border: 'none',
              padding: '6px 12px',
              borderRadius: '4px',
              cursor: 'pointer',
              position: 'relative'
            }
          }, 
            '🔍 Filtreler',
            getActiveFilterCount(filters) > 0 && React.createElement('span', {
              style: {
                position: 'absolute',
                top: '-6px',
                right: '-6px',
                backgroundColor: '#dc3545',
                color: 'white',
                borderRadius: '50%',
                width: '20px',
                height: '20px',
                fontSize: '11px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }
            }, getActiveFilterCount(filters))
          ),
          React.createElement('button', {
            onClick: () => clearFilters(setFilters, setGlobalSearch),
            className: 'btn',
            style: {
              backgroundColor: '#dc3545',
              color: 'white',
              border: 'none',
              padding: '6px 12px',
              borderRadius: '4px',
              cursor: 'pointer'
            }
          }, 'Temizle'),
          
          // Add Record button
          React.createElement('button', {
            onClick: () => {
              console.log('🔧 DEBUG: Kayıt Ekle button clicked')
              setShowAddModal(true)
              console.log('🔧 DEBUG: showAddModal set to true')
            },
            className: 'btn',
            style: {
              backgroundColor: '#28a745',
              color: 'white',
              border: 'none',
              padding: '6px 12px',
              borderRadius: '4px',
              cursor: 'pointer'
            }
          }, 'Kayıt Ekle'),
          // Bulk price update button (dynamic label)
          (function () {
            const selectedCount = selected.size
            const flaggedCount = list.filter(isQuoteFlaggedForPricing).length
            if (selectedCount === 0 && flaggedCount === 0) return null
            const label = selectedCount > 0 ? 'Seçilen kayıtların fiyatlarını güncelle' : 'Tümü güncelle'
            const onClick = async () => {
              if (bulkProgress && !bulkProgress.finished && !bulkProgress.cancelled) {
                showNotification('Bir toplu işlem zaten yürütülüyor', 'info')
                return
              }

              const ids = selectedCount > 0
                ? Array.from(selected)
                : list.filter(isQuoteFlaggedForPricing).map(item => item.id)

              if (!ids.length) {
                showNotification('Güncellenecek kayıt bulunamadı', 'info')
                return
              }

              performBulkUpdate(ids, selectedCount > 0 ? 'selected' : 'all')
            }
            return React.createElement('button', {
              onClick,
              className: 'btn',
              style: {
                backgroundColor: '#17a2b8',
                color: 'white',
                border: 'none',
                padding: '6px 12px',
                borderRadius: '4px',
                cursor: 'pointer'
              }
            }, label)
          })()
        )
      ),

      // Active filters display
      React.createElement('div', { style: { marginTop: '12px', display: 'flex', flexWrap: 'wrap', gap: '8px' } },
        // Status filters
        filters.status.length > 0 && React.createElement('span', { 
          style: { 
            backgroundColor: '#007bff', 
            color: 'white', 
            padding: '4px 8px', 
            borderRadius: '16px', 
            fontSize: '11px',
            position: 'relative',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            paddingRight: '20px'
          },
          onMouseOver: (e) => e.target.style.backgroundColor = '#0056b3',
          onMouseOut: (e) => e.target.style.backgroundColor = '#007bff',
          title: 'Durum filtresini kaldır'
        }, 
          `Durum: ${filters.status.join(', ')}`,
          React.createElement('span', {
            style: {
              position: 'absolute',
              right: '4px',
              top: '50%',
              transform: 'translateY(-50%)',
              cursor: 'pointer',
              fontWeight: 'bold',
              fontSize: '12px'
            },
            onClick: (e) => { e.stopPropagation(); clearSpecificFilter(setFilters, 'status') }
          }, '×')
        )
      ),

      // Results summary
      React.createElement('div', { style: { marginTop: '12px', fontSize: '14px', color: '#666' } },
        `${filtered.length} kayıt gösteriliyor${filtered.length !== list.length ? ` (toplam ${list.length} kayıttan)` : ''}`
      )
    ),

    // Data table
    React.createElement('div', { className: 'table-container', style: { marginTop: '16px', overflowX: 'auto' } },
      React.createElement('table', { className: 'table' },
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
            ...tableColumns.map(col => 
              React.createElement('th', { key: col.id }, col.label)
            ),
            React.createElement('th', null, 'İşlemler')
          )
        ),
        React.createElement('tbody', null,
          currentPageItems.map(item => 
            React.createElement('tr', { 
              key: item.id,
              onClick: () => {
                console.log('🔧 DEBUG: Row clicked for item:', item.id, item);
                setDetail(item);
              },
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
                React.createElement('div', { style: { display: 'flex', gap: '4px' } },
                  React.createElement('button', {
                    onClick: (e) => { 
                      e.stopPropagation(); 
                      console.log('🔧 DEBUG: Detay button clicked for item:', item.id, item);
                      setDetail(item);
                    },
                    className: 'btn btn-sm',
                    style: { fontSize: '12px', padding: '2px 6px' }
                  }, 'Detay'),
                  React.createElement('button', {
                    onClick: (e) => { e.stopPropagation(); remove(item.id) },
                    className: 'btn btn-sm btn-danger',
                    style: { fontSize: '12px', padding: '2px 6px' }
                  }, 'Sil')
                )
              )
            )
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
    ),

    bulkProgress && React.createElement(BulkProgressOverlay, {
      progress: bulkProgress,
      onAction: handleBulkProgressAction
    }),

    // Modals
    settingsModal && React.createElement(SettingsModalCompact, {
      onClose: () => setSettingsModal(false),
      onSettingsUpdated: refresh,
      t,
      showNotification
    }),

    detail && React.createElement(DetailModal, {
      item: detail,
      onClose: () => setDetail(null),
      setItemStatus: setItemStatus,
      onSaved: refresh,
      formConfig,
      t,
      showNotification
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
          priceReview.differenceSummary?.priceDiff !== undefined && React.createElement('p', { style: { margin: '8px 0', color: '#dc3545', fontWeight: 'bold' } }, `Fiyat Farkı: ₺${Number(priceReview.differenceSummary.priceDiff).toFixed(2)}`),
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
          React.createElement('button', {
            onClick: () => setPriceReview(null),
            className: 'btn btn-secondary'
          }, 'İptal'),
          React.createElement('button', {
            onClick: handlePriceReviewApply,
            className: 'btn btn-primary',
            disabled: priceReview.loading || priceReview.updating
          }, priceReview.updating ? 'Güncelleniyor...' : 'Fiyatı Güncelle')
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
      }, `Tamamlanan: ${progress.completed}/${progress.total}`),
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

export default Admin
