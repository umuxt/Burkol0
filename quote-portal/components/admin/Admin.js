import React from 'react'
import API from '../../lib/api.js'
import { statusLabel, procLabel, materialLabel } from '../../i18n/index.js'
import { getTableColumns, getFieldValue, formatFieldValue } from './AdminTableUtils.js'
import { calculatePrice, needsPriceUpdate, getPriceChangeType, getChanges, getChangeReason, applyNewPrice } from './AdminPriceCalculator.js'
import { createFilteredList, getFilterOptions, updateFilter, clearFilters, clearSpecificFilter, getActiveFilterCount } from './AdminFilterUtils.js'
import { calculateStatistics, BarChart } from './AdminStatistics.js'
const { useState, useEffect, useMemo } = React

// Helper function to format change reasons with colors and field label conversion
function formatChangeReasonWithColors(reason, formConfig) {
  if (!reason) return reason
  
  // Function to get field label from form config
  function getFieldLabel(fieldId) {
    if (formConfig && formConfig.formStructure && formConfig.formStructure.fields) {
      const field = formConfig.formStructure.fields.find(f => f.id === fieldId)
      if (field && field.label) {
        return field.label
      }
    }
    return fieldId
  }
  
  // Replace field IDs with labels in the reason text
  let processedReason = reason
  if (formConfig && formConfig.formStructure && formConfig.formStructure.fields) {
    formConfig.formStructure.fields.forEach(field => {
      const regex = new RegExp(field.id, 'g')
      processedReason = processedReason.replace(regex, field.label || field.id)
    })
  }
  
  // Add colors to old → new format
  processedReason = processedReason.replace(
    /([^→]+)→([^;,]+)/g, 
    '<span style="background-color: #ffebee; color: #c62828; padding: 2px 4px; border-radius: 3px;">$1</span>→<span style="background-color: #e8f5e8; color: #2e7d32; padding: 2px 4px; border-radius: 3px;">$2</span>'
  )
  
  return processedReason
}

function Admin({ t, onLogout, showNotification, SettingsModal, DetailModal, FilterPopup }) {
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
  })

  useEffect(() => {
    refresh()
  }, [])

  async function refresh() {
    console.log('🔧 DEBUG: refresh() called')
    try {
      console.log('🔧 DEBUG: Calling API.listQuotes()...')
      const quotes = await API.listQuotes()
      console.log('🔧 DEBUG: API.listQuotes() returned:', quotes.length, 'quotes')
      setList(quotes)
      console.log('🔧 DEBUG: setList() called with quotes')
      
      await loadPriceSettings()
      await loadFormConfig()
      if (activeTab === 'users') {
        await loadUsers()
      }
      console.log('🔧 DEBUG: refresh() completed successfully')
    } catch (error) {
      console.error('🔧 DEBUG: refresh() error:', error)
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

  async function handlePriceReviewApply() {
    if (!priceReview) return
    
    const result = await applyNewPrice(priceReview.item, API, showNotification)
    if (result) {
      refresh()
      setPriceReview(null)
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
            const flaggedCount = list.filter(x => x.needsPriceUpdate).length
            if (selectedCount === 0 && flaggedCount === 0) return null
            const label = selectedCount > 0 ? 'Seçilen kayıtların fiyatlarını güncelle' : 'Tümü güncelle'
            const onClick = async () => {
              try {
                if (selectedCount > 0) {
                  await API.applyPricesBulk(Array.from(selected))
                } else {
                  await API.applyPricesAll()
                }
                setSelected(new Set())
                await refresh()
                showNotification('Fiyatlar güncellendi', 'success')
              } catch (e) {
                console.error('Bulk update error', e)
                showNotification('Toplu fiyat güncelleme başarısız', 'error')
              }
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
              onClick: () => setDetail(item),
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
                      setPriceReview,
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
                    onClick: (e) => { e.stopPropagation(); setDetail(item) },
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

    // Modals
    settingsModal && React.createElement(SettingsModal, {
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
        React.createElement('div', { style: { marginBottom: '20px' } },
          React.createElement('p', { style: { margin: '8px 0' } }, `Müşteri: ${priceReview.item.name || 'N/A'}`),
          React.createElement('p', { style: { margin: '8px 0' } }, `Proje: ${priceReview.item.proj || 'N/A'}`),
          React.createElement('p', { style: { margin: '8px 0' } }, `Mevcut Fiyat: ${Number.isFinite(Number(priceReview.originalPrice)) ? `₺${Number(priceReview.originalPrice).toFixed(2)}` : 'N/A'}`),
          React.createElement('p', { style: { margin: '8px 0' } }, `Yeni Fiyat: ${Number.isFinite(Number(priceReview.newPrice)) ? `₺${Number(priceReview.newPrice).toFixed(2)}` : 'N/A'}`),
          React.createElement('div', { style: { margin: '8px 0' } }, [
            React.createElement('span', { key: 'label' }, 'Değişiklik Nedeni: '),
            React.createElement('span', { 
              key: 'reason',
              style: { fontFamily: 'monospace' },
              dangerouslySetInnerHTML: { 
                __html: formatChangeReasonWithColors(getChangeReason(priceReview.item, priceSettings, formConfig) || 'N/A', formConfig)
              }
            })
          ])
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
            className: 'btn btn-primary'
          }, 'Fiyatı Güncelle')
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

export default Admin
