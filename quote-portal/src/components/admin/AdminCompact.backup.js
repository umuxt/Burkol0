import API from '../../lib/api.js'
import { statusLabel, procLabel, materialLabel } from '../../i18n/index.js'
import { getTableColumns, getFieldValue, formatFieldValue } from './AdminTableUtils.js'
import { calculatePrice, needsPriceUpdate, getPriceChangeType, getChanges, getChangeReason, applyNewPrice } from './AdminPriceCalculator.js'
import { createFilteredList, getFilterOptions, updateFilter, clearFilters, clearSpecificFilter, getActiveFilterCount } from './AdminFilterUtils.js'
import { calculateStatistics, BarChart } from './AdminStatistics.js'

const ReactGlobal = typeof React !== 'undefined' ? React : (typeof window !== 'undefined' ? window.React : undefined)
if (!ReactGlobal) {
  throw new Error('React global not found. Ensure React CDN script loads before admin module.')
}
const { useState, useEffect, useMemo } = ReactGlobal

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
  const [fieldSearch, setFieldSearch] = useState('')
  const [formConfig, setFormConfig] = useState(null)
  const [priceSettings, setPriceSettings] = useState({})
  const [filters, setFilters] = useState({
    status: [],
    material: [],
    process: [],
    dateRange: { from: '', to: '' },
    qtyRange: { min: '', max: '' },
    country: []
  })

  useEffect(() => {
    refresh()
  }, [])

  async function refresh() {
    setList(await API.list())
    await loadPriceSettings()
    await loadFormConfig()
  }

  async function loadPriceSettings() {
    try {
      const settings = await API.getPriceSettings()
      setPriceSettings(settings)
    } catch (e) {
      console.error('Price settings load error:', e)
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
  const filtered = createFilteredList(list, filters, globalSearch, fieldSearch)
  const filterOptions = getFilterOptions(list)

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
    // Header with logout button
    React.createElement('div', { className: 'header', style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' } },
      React.createElement('h1', null, t.a_title || 'Admin Panel'),
      React.createElement('div', { style: { display: 'flex', gap: '10px' } },
        React.createElement('button', { 
          onClick: () => setSettingsModal(true), 
          className: 'btn', 
          style: { 
            backgroundColor: '#007bff', 
            color: 'white', 
            border: 'none',
            padding: '8px 12px',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '16px',
            transition: 'all 0.2s ease'
          },
          onMouseOver: (e) => e.target.style.backgroundColor = '#0056b3',
          onMouseOut: (e) => e.target.style.backgroundColor = '#007bff',
          title: 'Ayarlar'
        }, '⚙️'),
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
      React.createElement('div', { className: 'row wrap', style: { gap: 12, marginTop: 6 } },
        React.createElement('div', { style: { flex: '1 1 300px', minWidth: 280 } },
          React.createElement(BarChart, { data: statsAll.byStatus, xLabel: t.dim_status, yLabel: metricLabel(), byKeyAlpha: false })
        ),
        React.createElement('div', { style: { flex: '1 1 300px', minWidth: 280 } },
          React.createElement(BarChart, { data: statsAll.byProcess, xLabel: t.dim_process, yLabel: metricLabel(), byKeyAlpha: false })
        ),
        React.createElement('div', { style: { flex: '1 1 300px', minWidth: 280 } },
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
            placeholder: 'Genel arama...',
            value: globalSearch,
            onChange: (e) => setGlobalSearch(e.target.value),
            style: { padding: '6px 12px', border: '1px solid #ddd', borderRadius: '4px', minWidth: '150px' }
          }),
          React.createElement('input', {
            type: 'text',
            placeholder: 'Alan araması...',
            value: fieldSearch,
            onChange: (e) => setFieldSearch(e.target.value),
            style: { padding: '6px 12px', border: '1px solid #ddd', borderRadius: '4px', minWidth: '150px' }
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
            onClick: () => clearFilters(setFilters, setGlobalSearch, setFieldSearch),
            className: 'btn',
            style: {
              backgroundColor: '#dc3545',
              color: 'white',
              border: 'none',
              padding: '6px 12px',
              borderRadius: '4px',
              cursor: 'pointer'
            }
          }, 'Temizle')
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
        ),

        // Material filters
        filters.material.length > 0 && React.createElement('span', { 
          style: { 
            backgroundColor: '#28a745', 
            color: 'white', 
            padding: '4px 8px', 
            borderRadius: '16px', 
            fontSize: '11px',
            position: 'relative',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            paddingRight: '20px'
          },
          onMouseOver: (e) => e.target.style.backgroundColor = '#1e7e34',
          onMouseOut: (e) => e.target.style.backgroundColor = '#28a745',
          title: 'Malzeme filtresini kaldır'
        }, 
          `Malzeme: ${filters.material.join(', ')}`,
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
            onClick: (e) => { e.stopPropagation(); clearSpecificFilter(setFilters, 'material') }
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
                onChange: (e) => toggleAll(e.target.checked)
              })
            ),
            ...tableColumns.map(col => 
              React.createElement('th', { key: col.id }, col.label)
            ),
            React.createElement('th', null, 'İşlemler')
          )
        ),
        React.createElement('tbody', null,
          filtered.map(item => 
            React.createElement('tr', { 
              key: item.id,
              onClick: () => setDetail(item),
              style: { cursor: 'pointer' }
            },
              React.createElement('td', null,
                React.createElement('input', {
                  type: 'checkbox',
                  checked: selected.has(item.id),
                  onChange: (e) => { e.stopPropagation(); toggleOne(item.id, e.target.checked) }
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
      onSave: refresh,
      t,
      showNotification
    }),

    filterPopup && React.createElement(FilterPopup, {
      filters,
      filterOptions,
      onFilterChange: (category, value, action) => updateFilter(filters, setFilters, category, value, action),
      onClose: () => setFilterPopup(false),
      t
    }),

    // Price review modal
    priceReview && React.createElement('div', { className: 'modal-overlay', onClick: () => setPriceReview(null) },
      React.createElement('div', { className: 'modal-content', onClick: (e) => e.stopPropagation(), style: { maxWidth: '500px' } },
        React.createElement('h3', null, 'Fiyat Güncelleme'),
        React.createElement('p', null, `Müşteri: ${priceReview.item.name}`),
        React.createElement('p', null, `Proje: ${priceReview.item.proj}`),
        React.createElement('p', null, `Mevcut Fiyat: ${Number.isFinite(Number(priceReview.originalPrice)) ? `₺${Number(priceReview.originalPrice).toFixed(2)}` : 'N/A'}`),
        React.createElement('p', null, `Yeni Fiyat: ${Number.isFinite(Number(priceReview.newPrice)) ? `₺${Number(priceReview.newPrice).toFixed(2)}` : 'N/A'}`),
        React.createElement('p', null, `Değişiklik Nedeni: ${getChangeReason(priceReview.item, priceSettings)}`),
        React.createElement('div', { style: { display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '20px' } },
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
    )
  )
}

export default Admin
