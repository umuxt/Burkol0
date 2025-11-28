import React, { useState, useEffect } from 'react'
import { Plus, Download, Zap, ArrowLeft } from '../../../shared/components/Icons.jsx'
import AddOrderModal from './AddOrderModal.jsx'
import OrdersFilters from './OrdersFilters.jsx'
import { fetchWithTimeout, withAuth } from '../../../shared/lib/api.js'
import { materialsService } from '../../materials/services/materials-service.js'
import { API } from '../../../shared/lib/api.js'

// Shared helpers for delivery status across list and modal
function getDeliveryStatusColor(status) {
  const statusColors = {
    'bugün-teslim': { bg: '#fef3c7', text: '#d97706' },    // Sarı
    'bu-hafta-teslim': { bg: '#dbeafe', text: '#2563eb' }, // Mavi
    'gecikmiş': { bg: '#fee2e2', text: '#dc2626' },        // Kırmızı
    'gecikti': { bg: '#fee2e2', text: '#dc2626' },         // Kırmızı (alternatif anahtar)
    'zamanında': { bg: '#dcfce7', text: '#16a34a' },       // Yeşil
    'erken': { bg: '#f3e8ff', text: '#9333ea' },           // Mor
    'teslim-edildi': { bg: '#dcfce7', text: '#16a34a' },   // Yeşil
    'hesaplanıyor': { bg: '#f1f5f9', text: '#64748b' }     // Gri
  }
  return statusColors[status] || statusColors['hesaplanıyor']
}

function getDeliveryStatusText(status, daysRemaining = 0) {
  switch (status) {
    case 'bugün-teslim':
      return 'Bugün Teslim'
    case 'bu-hafta-teslim':
      return `${daysRemaining} gün kaldı`
    case 'gecikmiş':
    case 'gecikti':
      return `${Math.abs(daysRemaining)} gün gecikti`
    case 'zamanında':
      return 'Zamanında'
    case 'erken':
      return 'Erken teslim'
    case 'teslim-edildi':
      return 'Teslim edildi'
    case 'hesaplanıyor':
      return 'Teslimat tarihi belirsiz'
    default:
      return 'Hesaplanıyor'
  }
}

// Helper to get local date string (fixes timezone issues)
function getLocalDateString(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Helper to get tomorrow's local date string
function getTomorrowDateString() {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return getLocalDateString(tomorrow);
}

// Auth helper
async function fetchJsonWith401Retry(url, options = {}, timeoutMs = 10000) {
  const res = await fetchWithTimeout(url, options, timeoutMs)
  if (res.status !== 401) return res
  try {
    const host = typeof window !== 'undefined' ? window.location.hostname : ''
    const isLocal = host === 'localhost' || host === '127.0.0.1'
    if (!isLocal) return res
    localStorage.removeItem('bp_admin_token')
    const retry = await fetchWithTimeout(url, { ...(options || {}), headers: withAuth(options?.headers || {}) }, timeoutMs)
    return retry
  } catch {
    return res
  }
}

// Orders dashboard component with real data - inline in main component
// Removed - dashboard now inline

// OrdersFilters component - now separate file in OrdersFilters.jsx

// OrdersTable component
function OrdersTable({
  orders,
  loading,
  error,
  title,
  variant = 'pending',
  tabCounts,
  onChangeTab,
  onOrderClick,
  onUpdateOrderStatus,
  actionLoading = false,
  emptyMessage = 'Sipariş bulunamadı',
  deliveryStatuses = {},
  deliveryLoading = false,
  selectedOrderIds = new Set(),
  onToggleSelectOrder,
  onToggleSelectAll,
  materialNameMap = {}
}) {
  const [sortField, setSortField] = React.useState('orderDate')
  const [sortDirection, setSortDirection] = React.useState('desc')

  const handleSort = (field) => {
    setSortField(prev => {
      if (prev === field) {
        setSortDirection(d => (d === 'asc' ? 'desc' : 'asc'))
        return prev
      }
      setSortDirection('asc')
      return field
    })
  }

  const getSortIndicator = (field) => {
    if (sortField !== field) return '↕'
    return sortDirection === 'asc' ? '↑' : '↓'
  }

  const getSortValue = (order, field) => {
    switch (field) {
      case 'orderCode': return order.orderCode || order.id || ''
      case 'supplier': return (order.supplierName || order.supplier?.name || order.supplierCode || '').toString()
      case 'status': return order.orderStatus || ''
      case 'total': return Number(order.totalAmount || order.totalPrice || 0)
      case 'items': return Number(order.items?.length || order.item_count || 0)
      case 'orderDate':
      default:
        const d = order.orderDate instanceof Date ? order.orderDate : (order.orderDate ? new Date(order.orderDate) : new Date(0))
        return d.getTime()
    }
  }

  const visibleOrders = React.useMemo(() => {
    const base = Array.isArray(orders) ? orders.filter(o => {
      const isCompleted = o.orderStatus === 'Teslim Edildi'
      return variant === 'completed' ? isCompleted : variant === 'pending' ? !isCompleted : true
    }) : []

    const sorted = [...base].sort((a, b) => {
      const av = getSortValue(a, sortField)
      const bv = getSortValue(b, sortField)
      if (av < bv) return sortDirection === 'asc' ? -1 : 1
      if (av > bv) return sortDirection === 'asc' ? 1 : -1
      return 0
    })
    return sorted
  }, [orders, variant, sortField, sortDirection])

  // Empty state component for different tabs
  const EmptyState = ({ variant, hasNoOrdersAtAll = false }) => {
    const emptyStateConfig = {
      pending: {
        icon: '⏳',
        title: 'Bekleyen sipariş bulunmuyor',
        message: hasNoOrdersAtAll 
          ? 'İlk siparişinizi oluşturmak için "Yeni Sipariş" butonunu kullanın'
          : 'Tüm siparişleriniz tamamlanmış durumda. Yeni sipariş oluşturabilirsiniz.'
      },
      completed: {
        icon: '✅',
        title: 'Tamamlanmış sipariş yok',
        message: hasNoOrdersAtAll
          ? 'Henüz tamamlanmış sipariş bulunmuyor'
          : 'Henüz tamamlanmış sipariş bulunmuyor. Bekleyen siparişlerinizi tamamlayabilirsiniz.'
      }
    }

    const config = emptyStateConfig[variant] || emptyStateConfig.pending

    return (
      <div style={{
        textAlign: 'center',
        padding: '40px 20px',
        color: '#6b7280'
      }}>
        <div style={{
          fontSize: '48px',
          marginBottom: '16px',
          opacity: 0.5
        }}>{config.icon}</div>
        <h3 style={{
          margin: '0 0 8px 0',
          fontSize: '18px',
          fontWeight: '600',
          color: '#374151'
        }}>
          {config.title}
        </h3>
        <p style={{
          margin: '0',
          fontSize: '14px',
          color: '#6b7280'
        }}>
          {config.message}
        </p>
      </div>
    )
  }

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('tr-TR', {
      style: 'currency',
      currency: 'TRY'
    }).format(amount || 0)
  }

  const formatDate = (date) => {
    if (!date) return '-'
    const dateObj = date instanceof Date ? date : new Date(date)
    return dateObj.toLocaleDateString('tr-TR')
  }

  const getStatusColor = (status) => {
    const colors = {
      Taslak: '#6b7280',
      'Onay Bekliyor': '#f59e0b',
      'Onaylandı': '#3b82f6',
      'Kısmi Teslimat': '#f97316',
      Yolda: '#6366f1',
      'Teslim Edildi': '#10b981',
      Tamamlandı: '#10b981',
      'İptal Edildi': '#ef4444'
    }
    return colors[status] || '#6b7280'
  }


  const renderLineChips = (items = []) => (
    <div style={{
      display: 'inline-flex',
      flexWrap: 'nowrap',
      gap: '8px',
      alignItems: 'flex-start',
      whiteSpace: 'nowrap',
      overflowX: 'auto',
      maxWidth: '100%',
      WebkitOverflowScrolling: 'touch'
    }}>
      {items.map((item, index) => {
        // Format quantity - show decimal only if needed
        const qty = parseFloat(item.quantity || 0);
        const formattedQty = qty % 1 === 0 ? qty.toFixed(0) : qty.toString();
        
        return (
          <div
            key={item.id || item.lineId || index}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              border: '1px solid #e2e8f0',
              borderRadius: '8px',
              background: '#fff',
              padding: '2px 4px',
              fontSize: '11px',
              color: '#475569',
              boxShadow: '0 1px 2px rgba(15, 23, 42, 0.05)'
            }}
          >
            <span style={{ fontSize: '11px', fontWeight: 600, color: '#1d4ed8' }}>
              {item.item_code || item.lineId || `item-${String(index + 1).padStart(2, '0')}`}
            </span>
            <span style={{ color: '#d1d5db' }}>|</span>
            <span style={{ fontWeight: 600, fontFamily: 'monospace', fontSize: '10px', color: '#6b7280' }}>
              {item.materialCode || '—'}
            </span>
            <span style={{ color: '#d1d5db' }}>|</span>
            <span style={{ fontWeight: 600 }}>
              {formattedQty} {item.unit || 'adet'}
            </span>
            <span style={{ color: '#d1d5db' }}>|</span>
            <span
              style={{
                fontSize: '9px',
                fontWeight: 600,
                color: '#0f172a',
                background: '#e2e8f0',
                padding: '1px 6px',
                borderRadius: '999px',
                whiteSpace: 'nowrap'
              }}
            >
              {item.itemStatus || 'Onay Bekliyor'}
            </span>
          </div>
        );
      })}
    </div>
  )

  // Always render the table structure with tabs
  return (
    <section className="materials-table">
      {/* Tab Navigation - Always visible */}
      <div className="materials-tabs">
        <button
          type="button"
          className={`tab-button${variant === 'all' ? ' active' : ''}`}
          onClick={() => onChangeTab && onChangeTab('all')}
          disabled={loading}
        >
          Tümünü Göster
          <span className="tab-count">{tabCounts?.all ?? 0}</span>
        </button>
        <button
          type="button"
          className={`tab-button${variant === 'pending' ? ' active' : ''}`}
          onClick={() => onChangeTab && onChangeTab('pending')}
          disabled={loading}
        >
          Bekleyen Siparişler
          <span className="tab-count">{tabCounts?.pending ?? 0}</span>
        </button>
        <button
          type="button"
          className={`tab-button${variant === 'completed' ? ' active' : ''}`}
          onClick={() => onChangeTab && onChangeTab('completed')}
          disabled={loading}
        >
          Tamamlanan Siparişler
          <span className="tab-count">{tabCounts?.completed ?? 0}</span>
        </button>
      </div>

      {/* Table Container - Always visible */}
      <div className="table-container" style={{ width: '100%' }}>
        <table style={{ tableLayout: 'fixed', width: '100%' }}>
          <colgroup>{[
            <col key="sel" style={{ width: '40px' }} />,
            <col key="code" style={{ width: '120px' }} />,
            <col key="supplier" style={{ width: '220px' }} />,
              ...(variant !== 'completed' ? [<col key="delivery" style={{ width: '180px' }} />] : []),
              <col key="items" style={{ width: 'auto' }} />,
              <col key="total" style={{ width: '120px' }} />,
              ...(variant !== 'completed' ? [<col key="status" style={{ width: '80px' }} />] : [])
            ]}</colgroup>
            <thead>
              <tr>
                <th style={{ width: '40px', textAlign: 'center' }}>
                  <input
                    type="checkbox"
                    onChange={(e) => {
                      if (typeof onToggleSelectAll === 'function') {
                        onToggleSelectAll(orders, e.target.checked)
                      }
                    }}
                    checked={Array.isArray(orders) && orders.length > 0 && orders.every(o => selectedOrderIds?.has?.(o.id))}
                  />
                </th>
                <th style={{ width: '120px', minWidth: '120px', whiteSpace: 'nowrap' }}>
                  <button type="button" onClick={() => handleSort('orderCode')} className="mes-sort-button">
                    Sipariş Kodu
                    <span className="mes-sort-icon">{getSortIndicator('orderCode')}</span>
                  </button>
                </th>
                <th style={{ width: '220px', minWidth: '220px', whiteSpace: 'nowrap' }}>
                  <button type="button" onClick={() => handleSort('supplier')} className="mes-sort-button">
                    Tedarikçi
                    <span className="mes-sort-icon">{getSortIndicator('supplier')}</span>
                  </button>
                </th>
                {variant !== 'completed' && (
                  <th style={{ minWidth: '140px', maxWidth: '180px', whiteSpace: 'nowrap' }}>
                    <button type="button" onClick={() => handleSort('status')} className="mes-sort-button">
                      Teslimat Durumu
                      <span className="mes-sort-icon">{getSortIndicator('status')}</span>
                    </button>
                  </th>
                )}
                <th style={{ minWidth: '220px', whiteSpace: 'nowrap' }}>
                  <button type="button" onClick={() => handleSort('items')} className="mes-sort-button">
                    Sipariş Satırları
                    <span className="mes-sort-icon">{getSortIndicator('items')}</span>
                  </button>
                </th>
                <th style={{ width: '120px', minWidth: '90px', maxWidth: '120px', textAlign: 'left', whiteSpace: 'nowrap' }}>
                  <button type="button" onClick={() => handleSort('total')} className="mes-sort-button">
                    Tutar
                    <span className="mes-sort-icon">{getSortIndicator('total')}</span>
                  </button>
                </th>
                {variant !== 'completed' && (
                  <th style={{ minWidth: '80px', maxWidth: '80px', whiteSpace: 'nowrap' }}>
                    <button type="button" onClick={() => handleSort('status')} className="mes-sort-button">
                      Durum
                      <span className="mes-sort-icon">{getSortIndicator('status')}</span>
                    </button>
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {/* Loading state */}
              {loading && orders.length === 0 && (
                <tr>
                  <td colSpan={variant !== 'completed' ? 7 : 5} style={{ 
                    textAlign: 'center', 
                    padding: '40px 20px',
                    color: '#6b7280'
                  }}>
                    <div style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '12px'
                    }}>
                      <div className="spinner"></div>
                      <p style={{ margin: 0, fontSize: '14px' }}>Siparişler yükleniyor...</p>
                    </div>
                  </td>
                </tr>
              )}
              
              {/* Error state */}
              {!loading && error && orders.length === 0 && (
                <tr>
                  <td colSpan={variant !== 'completed' ? 7 : 5} style={{ 
                    textAlign: 'center', 
                    padding: '40px 20px'
                  }}>
                    <div style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '12px',
                      color: '#dc2626'
                    }}>
                      <div style={{ fontSize: '48px', opacity: 0.5 }}>⚠️</div>
                      <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '600' }}>
                        Bağlantı Problemi
                      </h3>
                      <p style={{ margin: 0, fontSize: '14px', color: '#6b7280' }}>
                        {error.includes('timeout') ? 
                          'Sunucuya bağlanılamadı. İnternet bağlantınızı kontrol edin.' : 
                          `Siparişler yüklenirken hata oluştu: ${error}`
                        }
                      </p>
                      <button 
                        onClick={() => window.location.reload()} 
                        style={{
                          marginTop: '8px',
                          padding: '8px 16px',
                          fontSize: '14px',
                          backgroundColor: '#3b82f6',
                          color: 'white',
                          border: 'none',
                          borderRadius: '6px',
                          cursor: 'pointer'
                        }}
                      >
                        Sayfayı Yenile
                      </button>
                    </div>
                  </td>
                </tr>
              )}
              
              {/* Data rows */}
              {!loading && !error && visibleOrders && visibleOrders.length > 0 ? visibleOrders.map((order) => {
                // Order status'a göre filtreleme yap - items'a değil
                const isPendingOrder = order.orderStatus !== 'Teslim Edildi'
                const isCompletedOrder = order.orderStatus === 'Teslim Edildi'
                
                // Items varsa kullan, yoksa boş array
                const items = order.items || []
                const relevantTotal = order.totalPrice || 0
                
                // TEMP DEBUG: Items kontrolü
                if (items.length === 0) {
                  console.log('❌ No items for order:', order.id, 'Order data:', {
                    hasItems: 'items' in order,
                    itemsValue: order.items,
                    itemsType: typeof order.items,
                    itemsLength: order.items?.length,
                    orderKeys: Object.keys(order)
                  })
                }
                
                return (
                  <tr
                    key={order.id}
                    className="mes-table-row"
                    onClick={() => onOrderClick && onOrderClick(order)}
                  >
                    <td style={{ textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selectedOrderIds?.has?.(order.id) || false}
                        onChange={(e) => onToggleSelectOrder && onToggleSelectOrder(order.id, e.target.checked)}
                        onClick={(e) => e.stopPropagation()}
                      />
                    </td>
                    <td style={{ width: '120px', minWidth: '120px', whiteSpace: 'nowrap' }}>
                      <span className="mes-code-text">{order.orderCode || order.id}</span>
                    </td>
                    <td style={{ width: '220px', minWidth: '220px', whiteSpace: 'nowrap' }}>
                      <span className="mes-code-text">{order.supplierCode || order.supplierId || ''}</span>
                      {(order.supplierCode || order.supplierId) && (order.supplierName) ? ' / ' : ''}
                      {order.supplierName || ''}
                    </td>
                    {variant !== 'completed' && (
                      <td style={{ width: '180px', maxWidth: '180px', whiteSpace: 'nowrap' }}>
                        <div style={{ fontSize: '12px', fontWeight: 600 }}>
                          {(() => {
                            // Debug: Order fields'ları kontrol et
                            console.log('🚚 Delivery debug for order:', order.id, {
                              expectedDeliveryDate: order.expectedDeliveryDate,
                              orderStatus: order.orderStatus,
                              deliveryDate: order.deliveryDate,
                              allOrderFields: Object.keys(order)
                            })
                            
                            // Basit teslimat durumu hesaplama - API'ye bağımlı değil
                            const today = new Date()
                            const deliveryDate = order.expectedDeliveryDate ? new Date(order.expectedDeliveryDate) : null
                            
                            let status = 'hesaplanıyor'
                            let daysRemaining = 0
                            
                            if (deliveryDate && !isNaN(deliveryDate.getTime())) {
                              const timeDiff = deliveryDate.getTime() - today.getTime()
                              daysRemaining = Math.ceil(timeDiff / (1000 * 3600 * 24))
                              
                              if (order.orderStatus === 'Teslim Edildi') {
                                status = 'teslim-edildi'
                              } else if (daysRemaining < 0) {
                                status = 'gecikti'
                              } else if (daysRemaining === 0) {
                                status = 'bugün-teslim'
                              } else if (daysRemaining <= 7) {
                                status = 'bu-hafta-teslim'
                              } else {
                                status = 'zamanında'
                              }
                            } else {
                              console.log('🚚 No valid delivery date found for order:', order.id)
                            }

                            console.log('🚚 Final delivery status:', status, 'days:', daysRemaining)

                            return (
                              <span style={{
                                padding: '4px 8px',
                                borderRadius: '12px',
                                fontSize: '11px',
                                fontWeight: 600,
                                backgroundColor: getDeliveryStatusColor(status).bg,
                                color: getDeliveryStatusColor(status).text
                              }}>
                                {getDeliveryStatusText(status, daysRemaining)}
                              </span>
                            )
                          })()}
                        </div>
                      </td>
                    )}
                    <td className="no-ellipsis" style={{ paddingTop: '4px', paddingBottom: '4px' }}>
                      {items.length > 0 ? renderLineChips(items) : (
                        <span style={{ fontSize: '12px', color: '#6b7280', fontStyle: 'italic' }}>Sipariş satırı yok</span>
                      )}
                    </td>
                    <td style={{ width: '120px', textAlign: 'left', fontWeight: 600, paddingTop: '4px', paddingBottom: '4px' }}>
                      {formatCurrency(relevantTotal || order.totalAmount)}
                    </td>
                    {variant !== 'completed' && (
                      <td style={{ width: '80px', maxWidth: '80px', paddingTop: '4px', paddingBottom: '4px', whiteSpace: 'nowrap' }}>
                        {onUpdateOrderStatus ? (
                          <select
                            value={order.orderStatus}
                            disabled={actionLoading}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => {
                              console.log('🎯 ORDER STATUS DROPDOWN CHANGE:')
                              console.log('  - Order ID:', order.id)
                              console.log('  - Current Status:', order.orderStatus)
                              console.log('  - New Value:', e.target.value)
                              console.log('  - Event target:', e.target)
                              console.log('  - Value check:', e.target.value && e.target.value !== order.orderStatus)
                              console.log('  - onUpdateOrderStatus type:', typeof onUpdateOrderStatus)
                              
                              if (e.target.value && e.target.value !== order.orderStatus) {
                                console.log('✅ Calling onUpdateOrderStatus with args:', order.id, e.target.value)
                                onUpdateOrderStatus(order.id, e.target.value)
                              } else {
                                console.log('❌ Conditions not met - not calling update')
                                console.log('    - e.target.value truthy:', !!e.target.value)
                                console.log('    - values different:', e.target.value !== order.orderStatus)
                              }
                            }}
                            style={{
                              padding: '6px 10px',
                              fontSize: '11px',
                              fontWeight: 600,
                              border: '1px solid rgba(148, 163, 184, 0.6)',
                              borderRadius: '10px',
                              background: getStatusColor(order.orderStatus),
                              color: '#fff',
                              cursor: 'pointer'
                            }}
                          >
                            {/* Note: "Teslim Edildi" removed from order-level dropdown - use item-level delivery for lot tracking */}
                            {['Onay Bekliyor', 'Onaylandı', 'Yolda', 'İptal Edildi'].map(status => (
                              <option key={status} value={status}>{status}</option>
                            ))}
                          </select>
                        ) : (
                          <span
                            style={{
                              display: 'inline-block',
                              padding: '4px 8px',
                              borderRadius: '12px',
                              fontSize: '11px',
                              fontWeight: 600,
                              color: 'white',
                              backgroundColor: getStatusColor(order.orderStatus)
                            }}
                          >
                            {order.orderStatus}
                          </span>
                        )}
                      </td>
                    )}
                  </tr>
                )
              }) : null}
              
              {/* Empty state */}
              {!loading && !error && visibleOrders && visibleOrders.length === 0 && (
                <tr>
                  <td colSpan={variant !== 'completed' ? 7 : 5} style={{ padding: 0, border: 'none' }}>
                    <EmptyState 
                      variant={variant} 
                      hasNoOrdersAtAll={false}
                    />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
      </div>
    </section>
  )
}

export default function OrdersTabContent() {
  console.log('🎬 OrdersTabContent component rendered - FORCED LOG')
  
  const [activeOrdersTab, setActiveOrdersTab] = useState('pending') // 'pending' | 'completed' | 'all'

  // ✅ SMART TAB CHANGE: Tab değiştiğinde refresh tetikle
  const handleTabChange = async (newTab) => {
    console.log(`🔄 SMART REFRESH: Tab changed to ${newTab} - refreshing orders...`)
    setActiveOrdersTab(newTab)
    await refreshOrders() // Fresh data çek
  }
  const [isAddOrderModalOpen, setIsAddOrderModalOpen] = useState(false)
  const [isDeliveredRecordMode, setIsDeliveredRecordMode] = useState(false)
  const [selectedOrder, setSelectedOrder] = useState(null)
  const [isFiltersExpanded, setIsFiltersExpanded] = useState(false)
  const [selectedOrderLoading, setSelectedOrderLoading] = useState(false)
  const [selectedOrderError, setSelectedOrderError] = useState(null)
  
  // Debug modal state
  useEffect(() => {
    console.log('🔥🔥🔥 OrdersTabContent: Modal state değişti:', isAddOrderModalOpen);
  }, [isAddOrderModalOpen])
  
  // Filter state
  const [filters, setFilters] = useState({
    search: '',
    orderStatus: [], // Sipariş durumu filtresi - multi-select
    itemStatus: [], // Satır durumu filtresi - multi-select
    dateRange: [], // Tarih filtresi - multi-select
    customDateRange: { startDate: '', endDate: '' }, // Özel tarih aralığı
    deliveryStatus: [], // Teslimat durumu filtresi - multi-select
    customDeliveryDateRange: { startDate: '', endDate: '' }, // Özel teslimat aralığı
    materialType: [], // Malzeme tipi filtresi - multi-select
    supplierType: [], // Tedarikçi filtresi - multi-select
    materialCategory: '', // Malzeme kategorisi filtresi
    priceRange: {
      min: '',
      max: '',
      mode: 'order' // 'order' | 'item'
    }
  })

  // Stats hooks - Backend API kullanacağız
  const [stats, setStats] = useState({
    pendingOrders: 0,
    thisMonthOrders: 0,
    partialOrders: 0,
    totalOrders: 0,
    completedOrders: 0,
    totalAmount: 0
  })
  const [statsLoading, setStatsLoading] = useState(true)
  
  // Bulk selection state for CSV/bulk ops
  const [selectedOrderIds, setSelectedOrderIds] = useState(new Set())

  const handleToggleSelectOrder = (orderId, checked) => {
    setSelectedOrderIds(prev => {
      const next = new Set(prev)
      if (checked) next.add(orderId); else next.delete(orderId)
      return next
    })
  }
  
  // Delivery modal state for lot tracking
  const [deliveryModalOpen, setDeliveryModalOpen] = useState(false)
  const [deliveryModalItem, setDeliveryModalItem] = useState(null)
  const [deliveryFormData, setDeliveryFormData] = useState({
    actualDeliveryDate: getLocalDateString(),
    supplierLotCode: '',
    manufacturingDate: '',
    expiryDate: '',
    notes: ''
  })

  // Load system settings for Lot Tracking visibility
  const [systemSettings, setSystemSettings] = useState({ lotTracking: true });

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        console.log('⚙️ Fetching system settings...');
        const res = await fetchWithTimeout('/api/settings/system', { headers: withAuth() });
        if (res.ok) {
          const data = await res.json();
          console.log('⚙️ System Settings Loaded:', data);
          setSystemSettings(data || { lotTracking: true });
        } else {
          console.warn('⚙️ Failed to load settings, status:', res.status);
        }
      } catch (error) {
        console.error('Failed to load system settings:', error);
      }
    };
    fetchSettings();
  }, []);

  // Debug render state
  console.log('🎨 Render System Settings:', systemSettings);


  // CSV Export for current tab (or selected orders if any)
  const handleExportCSV = () => {
    try {
      const ordersSource = selectedOrderIds.size > 0
        ? currentOrders.filter(o => selectedOrderIds.has(o.id))
        : currentOrders

      // Columns depend on variant (completed hides Durum in table)
      const includeStatusCol = activeOrdersTab !== 'completed'

      // Delimiter: Excel/TR çoğunlukla ';' bekler
      const userLocale = (typeof navigator !== 'undefined' ? navigator.language : 'tr-TR') || 'tr-TR'
      const delimiter = /^tr(-|_)/i.test(userLocale) ? ';' : ','

      const escapeCSV = (val) => {
        const s = (val ?? '').toString()
        const needsQuote = new RegExp(`["\n${delimiter === ';' ? ';' : ','}]`)
        if (needsQuote.test(s)) {
          return '"' + s.replace(/"/g, '""') + '"'
        }
        return s
      }

      // Determine max item count across export set
      const maxItemCount = (ordersSource || []).reduce((max, o) => {
        const c = Array.isArray(o.items) ? o.items.length : 0
        return Math.max(max, c)
      }, 0)

      // Group header (row 1) – emulate merged cells by repeating group labels
      const headerRow1Parts = [
        'Sipariş Bilgileri', // Sipariş Kodu
        '',                   // Sipariş ID
        '',                   // Sipariş Tarihi
        'Tedarikçi',          // Tedarikçi Kodu/ID
        '',                   // Tedarikçi Adı
        'Teslimat',           // Beklenen
        '',                   // Gerçekleşen
        'Teslimat Durumu',    // Özet
        'Özet',               // Satır Sayısı
        '',                   // placeholder (align)
        'Sipariş Toplamı',    // Para Birimi
        ''                    // Toplam Tutar
      ]
      if (includeStatusCol) headerRow1Parts.push('')
      for (let i = 1; i <= maxItemCount; i++) {
        headerRow1Parts.push(`Satır ${i}`, '', '', '', '', '')
      }

      // Detail header (row 2)
      const headerRow2Parts = [
        'Sipariş Kodu',
        'Sipariş ID',
        'Sipariş Tarihi',
        'Tedarikçi Kodu/ID',
        'Tedarikçi Adı',
        'Beklenen Teslim Tarihi',
        'Gerçekleşen Teslim Tarihi',
        'Teslimat Durumu (Özet)',
        'Satır Sayısı',
        '',
        'Para Birimi',
        'Toplam Tutar'
      ]
      if (includeStatusCol) headerRow2Parts.push('Sipariş Durumu')
      for (let i = 1; i <= maxItemCount; i++) {
        headerRow2Parts.push(
          `Satır ${i} Malzeme ID`,
          `Satır ${i} Malzeme Adı`,
          `Satır ${i} Miktar`,
          `Satır ${i} Birim Fiyat`,
          `Satır ${i} Para Birimi`,
          `Satır ${i} Satır Tutar`
        )
      }

      // summarizeItems no longer used (dynamic columns below)

      const computeDeliverySummary = (order) => {
        // Reuse same quick logic from table
        const today = new Date()
        const deliveryDate = order.expectedDeliveryDate ? new Date(order.expectedDeliveryDate) : null
        let status = 'hesaplanıyor'
        let daysRemaining = 0
        if (deliveryDate && !isNaN(deliveryDate.getTime())) {
          const diff = deliveryDate.getTime() - today.getTime()
          daysRemaining = Math.ceil(diff / (1000 * 3600 * 24))
          if (order.orderStatus === 'Teslim Edildi') status = 'teslim-edildi'
          else if (daysRemaining < 0) status = 'gecikmiş'
          else if (daysRemaining === 0) status = 'bugün-teslim'
          else if (daysRemaining <= 7) status = 'bu-hafta-teslim'
          else status = 'zamanında'
        }
        switch (status) {
          case 'bugün-teslim': return 'Bugün Teslim'
          case 'bu-hafta-teslim': return `${daysRemaining} gün kaldı`
          case 'gecikmiş': return `${Math.abs(daysRemaining)} gün gecikti`
          case 'zamanında': return 'Zamanında'
          case 'erken': return 'Erken teslim'
          case 'teslim-edildi': return 'Teslim edildi'
          default: return 'Teslimat tarihi belirsiz'
        }
      }

      const rows = ordersSource.map(order => {
        const items = Array.isArray(order.items) ? order.items : []
        const orderDate = order.orderDate ? (order.orderDate instanceof Date ? order.orderDate : new Date(order.orderDate)) : null
        const expected = order.expectedDeliveryDate ? (order.expectedDeliveryDate instanceof Date ? order.expectedDeliveryDate : new Date(order.expectedDeliveryDate)) : null
        const actual = order.deliveryDate ? (order.deliveryDate instanceof Date ? order.deliveryDate : new Date(order.deliveryDate)) : null
        const currency = (order.currency || 'TRY')
        const total = Number(order.totalPrice || order.totalAmount || 0)

        const base = [
          order.orderCode || '',
          order.id || '',
          orderDate ? orderDate.toLocaleDateString(userLocale) : '',
          order.supplierId || order.supplierCode || '',
          order.supplierName || '',
          expected ? expected.toLocaleDateString(userLocale) : '',
          actual ? actual.toLocaleDateString(userLocale) : '',
          computeDeliverySummary(order),
          items.length,
          '',
          currency,
          total
        ]
        if (includeStatusCol) base.push(order.orderStatus || '')
        // Append per-line dynamic columns normalized to maxItemCount
        for (let i = 0; i < maxItemCount; i++) {
          const it = items[i]
          if (it) {
            const code = it.materialCode || it.itemCode || it.lineId || ''
            const name = it.materialName || ''
            const qty = it.quantity != null ? Number(it.quantity) : ''
            const unitPrice = it.unitPrice != null ? Number(it.unitPrice) : ''
            const lineCurrency = it.currency || currency || 'TRY'
            const lineTotal = (it.quantity != null && it.unitPrice != null)
              ? Number(it.quantity) * Number(it.unitPrice)
              : ''
            base.push(code, name, qty, unitPrice, lineCurrency, lineTotal)
          } else {
            base.push('', '', '', '', '', '')
          }
        }
        return base.map(escapeCSV).join(delimiter)
      })

      const headerRow1 = headerRow1Parts.map(escapeCSV).join(delimiter)
      const headerRow2 = headerRow2Parts.map(escapeCSV).join(delimiter)
      const csv = ['\uFEFF' + headerRow1, headerRow2, ...rows].join('\n') // UTF-8 BOM ile Excel uyumu
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      const suffix = selectedOrderIds.size > 0 ? '-selected' : ''
      const tabName = activeOrdersTab === 'pending' ? 'pending' : activeOrdersTab === 'completed' ? 'completed' : 'all'
      a.href = url
      a.download = `orders-${tabName}${suffix}.csv`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('CSV export error:', err)
      alert('CSV dışa aktarma sırasında hata oluştu: ' + (err?.message || err))
    }
  }

  const handleToggleSelectAll = (ordersInView = [], checked) => {
    setSelectedOrderIds(prev => {
      const next = new Set(prev)
      const idsInView = ordersInView.map(o => o.id)
      if (checked) {
        idsInView.forEach(id => next.add(id))
      } else {
        idsInView.forEach(id => next.delete(id))
      }
      return next
    })
  }

  // Stats API çağrısı
  useEffect(() => {
    const fetchStats = async () => {
      try {
        setStatsLoading(true)
        
        const response = await fetchJsonWith401Retry('/api/orders/stats', { headers: withAuth({ 'Content-Type': 'application/json' }) })
        
        console.log('📊 Stats API response:', response.status, response.statusText)
        
        if (!response.ok) {
          console.warn('Stats API not available, using default values')
          return
        }
        
        const data = await response.json()
        console.log('📊 Stats data:', data)
        setStats(data.stats || stats)
      } catch (error) {
        console.error('Stats fetch error:', error)
      } finally {
        setStatsLoading(false)
      }
    }
    
    fetchStats()
  }, [])
  
  const updateOrder = async (orderId, updates) => {
    console.log('💾 UPDATE ORDER FUNCTION CALLED:')
    console.log('  - Order ID:', orderId)
    console.log('  - Updates:', JSON.stringify(updates, null, 2))
    
    try {
      const url = `/api/orders/${orderId}`
      console.log('📡 Making PUT request to:', url)
      
      const requestBody = JSON.stringify(updates)
      console.log('📤 Request body:', requestBody)
      
      const headers = withAuth({
        'Content-Type': 'application/json'
      })
      console.log('📤 Request headers:', headers)
      
      const response = await fetchWithTimeout(url, {
        method: 'PUT',
        headers: headers,
        body: requestBody
      })
      
      console.log('📥 Response received:')
      console.log('  - Status:', response.status)
      console.log('  - Status Text:', response.statusText)
      console.log('  - OK:', response.ok)
      
      if (!response.ok) {
        const errorText = await response.text()
        console.log('❌ Response error text:', errorText)
        throw new Error(`API Error: ${response.status} - ${errorText}`)
      }
      
      const data = await response.json()
      console.log('📥 Response data:', data)
      return data.order || data
    } catch (error) {
      console.error('❌ Update order error:', error)
      throw error
    }
  }
  const actionLoading = false
  
  // Malzemeler için API state
  const [materials, setMaterials] = useState([])
  const [materialsLoading, setMaterialsLoading] = useState(true)
  const [materialsError, setMaterialsError] = useState(null)
  
  // Test: API endpoint'leri çalışıyor mu?
  useEffect(() => {
    const testEndpoints = async () => {
      console.log('🧪 Testing API endpoints...')
      
      try {
        // Test materials endpoint
        console.log('🧪 Testing /api/materials...')
        const materialsResponse = await fetchJsonWith401Retry('/api/materials', { headers: withAuth({ 'Content-Type': 'application/json' }) })
        console.log('📦 Materials response:', materialsResponse.status)
        if (materialsResponse.ok) {
          const materialsData = await materialsResponse.json()
          console.log('📦 Materials count:', materialsData.materials?.length || 0)
        }
        
        // Test orders endpoint  
        console.log('🧪 Testing /api/orders...')
        const ordersResponse = await fetchJsonWith401Retry('/api/orders', { headers: withAuth({ 'Content-Type': 'application/json' }) })
        console.log('📋 Orders response:', ordersResponse.status)
        if (ordersResponse.ok) {
          const ordersData = await ordersResponse.json()
          console.log('📋 Orders count:', ordersData.orders?.length || 0)
        }
        
        // Test stats endpoint
        console.log('🧪 Testing /api/orders/stats...')
        const statsResponse = await fetchJsonWith401Retry('/api/orders/stats', { headers: withAuth({ 'Content-Type': 'application/json' }) })
        console.log('📊 Stats response:', statsResponse.status)
        if (statsResponse.ok) {
          const statsData = await statsResponse.json()
          console.log('📊 Stats:', statsData.stats)
        }
        
      } catch (error) {
        console.error('🧪 API test error:', error)
      }
    }
    
    testEndpoints()
  }, [])

  // Malzemeleri API'den çek
  useEffect(() => {
    const fetchMaterials = async () => {
      try {
        setMaterialsLoading(true)
        
        // Tüm malzemeleri çek
        const response = await fetchWithTimeout('/api/materials', {
          headers: withAuth()
        })
        
        console.log('📡 Materials API response:', response.status, response.statusText)
        
        if (!response.ok) {
          if (response.status === 401) {
            setMaterials([])
            return
          }
          throw new Error(`API Error: ${response.status} - ${response.statusText}`)
        }
        
        const data = await response.json()
        console.log('📦 Materials data:', data)
        
        // Response'dan materials array'ini al (tümü, kategori filtreleme için)
        const allMaterials = Array.isArray(data) ? data : (data.materials || [])
        
        // Frontend format'ına çevir (TÜM malzemeler)
        const materialsWithCorrectFields = allMaterials.map(material => ({
          ...material,
          materialCode: material.code || material.materialCode,
          materialName: material.name || material.materialName
        }))
        
        setMaterials(materialsWithCorrectFields)
      } catch (error) {
        setMaterialsError(error.message)
        console.error('Materials fetch error:', error)
      } finally {
        setMaterialsLoading(false)
      }
    }
    
    fetchMaterials()
  }, [])

  // Tedarikçileri API'den çek
  const [suppliers, setSuppliers] = useState([])
  const [suppliersLoading, setSuppliersLoading] = useState(false)
  const [suppliersError, setSuppliersError] = useState(null)

  // Malzeme kategorilerini API'den çek
  const [materialCategories, setMaterialCategories] = useState([])
  const [categoriesLoading, setCategoriesLoading] = useState(false)
  const [categoriesError, setCategoriesError] = useState(null)

  useEffect(() => {
    const fetchSuppliers = async () => {
      try {
        setSuppliersLoading(true)
        
        const response = await fetchWithTimeout('/api/suppliers', {
          headers: withAuth()
        })
        
        console.log('📡 Suppliers API response:', response.status, response.statusText)
        
        if (!response.ok) {
          if (response.status === 401) {
            setSuppliers([])
            return
          }
          throw new Error(`API Error: ${response.status} - ${response.statusText}`)
        }
        
        const data = await response.json()
        console.log('🏢 Suppliers data:', data)
        
        // Response'dan suppliers array'ini al
        const allSuppliers = Array.isArray(data) ? data : (data.suppliers || [])
        
        // Frontend format'ına çevir
        const suppliersWithCorrectFields = allSuppliers.map(supplier => ({
          ...supplier,
          supplierCode: supplier.code || supplier.supplierCode,
          supplierName: supplier.name || supplier.companyName || supplier.supplierName
        }))
        
        setSuppliers(suppliersWithCorrectFields)
      } catch (error) {
        setSuppliersError(error.message)
        console.error('Suppliers fetch error:', error)
      } finally {
        setSuppliersLoading(false)
      }
    }
    
    fetchSuppliers()
  }, [])

  // Malzeme kategorilerini API'den çek
  useEffect(() => {
    const fetchCategories = async () => {
      try {
        setCategoriesLoading(true)
        
        const response = await fetchWithTimeout('/api/categories', {
          headers: withAuth()
        })
        
        console.log('📡 Categories API response:', response.status, response.statusText)
        
        if (!response.ok) {
          throw new Error(`API Error: ${response.status} - ${response.statusText}`)
        }
        
        const data = await response.json()
        console.log('🏷️ Categories data:', data)
        
        // Response'dan categories array'ini al
        const allCategories = Array.isArray(data) ? data : (data.categories || [])
        
        // Frontend format'ına çevir
        const categoriesWithCorrectFields = allCategories.map(category => ({
          ...category,
          categoryId: category.id || category.categoryId,
          categoryName: category.name || category.categoryName
        }))
        
        setMaterialCategories(categoriesWithCorrectFields)
      } catch (error) {
        setCategoriesError(error.message)
        console.error('Categories fetch error:', error)
      } finally {
        setCategoriesLoading(false)
      }
    }
    
    fetchCategories()
  }, [])
  
  // Orders hooks - Backend API kullanacağız
  const [orders, setOrders] = useState([])
  const [ordersLoading, setOrdersLoading] = useState(true)
  const [ordersError, setOrdersError] = useState(null)
  const [deliveryStatuses, setDeliveryStatuses] = useState({})
  const [deliveryLoading, setDeliveryLoading] = useState(false)
  const [materialNameMap, setMaterialNameMap] = useState({})
  
  // Orders API çağrısı - Basit test
  useEffect(() => {
    console.log('⚡️ Orders useEffect triggered!')
    
    const fetchOrders = async () => {
      try {
        console.log('🚀 Starting orders fetch... (REAL-TIME MODE)')
        setOrdersLoading(true)
        setOrdersError(null)
        
        // ✅ CACHE BUSTING: İlk load'da bile timestamp ekle
        const cacheBuster = Date.now()
        const url = `/api/orders?t=${cacheBuster}`
        console.log('🔥 INITIAL LOAD CACHE BUSTING URL:', url)
        
        const response = await fetchJsonWith401Retry(url, { 
          headers: withAuth({ 
            'Content-Type': 'application/json',
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0'
          }) 
        })
        console.log('� Response status:', response.status)
        console.log('📡 Response ok:', response.ok)
        console.log('📡 Response headers:', Object.fromEntries(response.headers.entries()))
        
        if (!response.ok) {
          const errorText = await response.text()
          console.error('❌ Error response:', errorText)
          throw new Error(`Orders API Error: ${response.status} - ${errorText}`)
        }
        
        const data = await response.json()
        console.log('� Full response data:', data)
        console.log('� Orders array:', data.orders)
        console.log('� Orders count:', data.orders?.length || 0)
        
        setOrders(data.orders || [])
        console.log('✅ Orders state updated')
        
      } catch (error) {
        console.error('❌ Orders fetch error:', error)
        setOrdersError(error.message)
      } finally {
        setOrdersLoading(false)
        console.log('🏁 Orders fetch completed')
      }
    }
    
    fetchOrders()
  }, [])

  // Load material name map to ensure latest names reflect in order items
  useEffect(() => {
    let cancelled = false
    const buildMap = async () => {
      try {
        const list = await materialsService.getMaterials()
        if (cancelled) return
        const map = Object.create(null)
        for (const m of list) {
          if (m.code) map[m.code] = m.name || m.materialName || m.code
          if (m.id) map[m.id] = m.name || m.materialName || m.id
        }
        setMaterialNameMap(map)
      } catch (e) {
        // no-op
      }
    }
    buildMap()
    const onMaterialUpdated = () => buildMap()
    if (typeof window !== 'undefined') {
      window.addEventListener('materialUpdated', onMaterialUpdated)
    }
    return () => {
      cancelled = true
      if (typeof window !== 'undefined') {
        window.removeEventListener('materialUpdated', onMaterialUpdated)
      }
    }
  }, [])

  // ✅ SMART FOCUS REFRESH: Tab/pencere focus olduğunda refresh 
  useEffect(() => {
    const handleFocus = async () => {
      console.log('🔄 SMART REFRESH: Window focused - refreshing orders...')
      await refreshOrders()
    }
    
    const handleVisibilityChange = async () => {
      if (!document.hidden) {
        console.log('🔄 SMART REFRESH: Tab became visible - refreshing orders...')
        await refreshOrders()
      }
    }
    
    if (typeof window !== 'undefined') {
      window.addEventListener('focus', handleFocus)
      document.addEventListener('visibilitychange', handleVisibilityChange)
    }
    
    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('focus', handleFocus)
        document.removeEventListener('visibilitychange', handleVisibilityChange)
      }
    }
  }, [])
  
  // Test: orders state'i değiştiğinde log
  useEffect(() => {
    console.log('🔥 ORDERS STATE CHANGED:', {
      ordersLength: orders.length,
      ordersLoading,
      ordersError,
      firstOrder: orders[0]
    })
  }, [orders, ordersLoading, ordersError])
  const refreshOrders = async () => {
    console.log('🔄 Refreshing orders... (REAL-TIME MODE)')
    try {
      setOrdersLoading(true)
      setOrdersError(null)
      
      // ✅ CACHE BUSTING: Timestamp ekleyerek browser cache'i bypass et
      const cacheBuster = Date.now()
      const url = `/api/orders?t=${cacheBuster}`
      console.log('🔥 CACHE BUSTING URL:', url)
      
      const response = await fetchJsonWith401Retry(url, { 
        headers: withAuth({ 
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        }) 
      })
      
      if (!response.ok) {
        throw new Error(`API Error: ${response.status}`)
      }
      
      const data = await response.json()
      setOrders(data.orders || [])
      console.log('✅ Orders refreshed')
    } catch (error) {
      console.error('❌ Orders refresh error:', error)
      setOrdersError(error.message)
    } finally {
      setOrdersLoading(false)
    }
  }
  
  const loadDeliveryStatuses = async () => {
    console.log('🚚 Loading delivery statuses...')
    // Load delivery statuses from API
  }

  // Materials Debug
  console.log('🔍 Materials API Debug:', {
    totalMaterials: materials.length,
    materialsLoading,
    materialsError,
    sampleMaterial: materials[0],
    allStatuses: [...new Set(materials.map(m => m.status))]
  });

  // Debug: State'leri logla
  useEffect(() => {
    console.log('🔍 Delivery state update:', {
      deliveryStatuses,
      deliveryLoading,
      statusCount: Object.keys(deliveryStatuses).length
    })
  }, [deliveryStatuses, deliveryLoading])

  // Debug: Orders state'ini logla
  useEffect(() => {
    console.log('📋 Orders state update:', {
      orders: orders.length,
      ordersLoading,
      ordersError,
      firstOrder: orders[0]?.id
    })
  }, [orders, ordersLoading, ordersError])

  // Aktif malzemeler - malzeme tipi filtresi için sadece aktif olanlar
  const activeMaterials = materials.filter(material => material.status === 'Aktif')
  
  console.log('🔍 Active Materials debug:', {
    totalActiveMaterials: activeMaterials.length,
    totalAllMaterials: materials.length,
    materialsLoading,
    sampleMaterial: activeMaterials[0],
    allCodes: activeMaterials.map(m => m.code).slice(0, 5) // İlk 5 code'u göster
  })

  // Teslimat durumlarını yükle - sadece bir kere
  useEffect(() => {
    if (orders.length > 0) {
      loadDeliveryStatuses()
    }
  }, [orders.length]) // loadDeliveryStatuses'u kaldırdık

  // Dropdown close handler like in MaterialsFilters
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (!event.target.closest('.multi-select-container')) {
        document.querySelectorAll('.multi-select-dropdown').forEach(dropdown => {
          dropdown.style.display = 'none';
        });
      }
    };

    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  // ORDER-LEVEL: "Teslim Edildi" removed - use item-level delivery for lot tracking
  const ORDER_STATUS_OPTIONS = ['Onay Bekliyor', 'Onaylandı', 'Yolda', 'İptal Edildi']
  // ITEM-LEVEL: "Teslim Edildi" allowed - triggers lot tracking modal
  const ITEM_STATUS_OPTIONS = ['Onay Bekliyor', 'Onaylandı', 'Yolda', 'Teslim Edildi', 'İptal Edildi']
  const [updatingItemIds, setUpdatingItemIds] = useState([])
  const [itemStatusUpdates, setItemStatusUpdates] = useState({}) // Optimistic updates for item statuses

  // ✅ SMART FILTER CHANGE: Critical filtreler değiştiğinde refresh tetikle
  const handleFilterChange = async (key, value) => {
    console.log('🔍 Order Filter değişti:', key, '=', value);
    setFilters(prev => ({ ...prev, [key]: value }));
    
    // Critical filter değişikliklerinde fresh data çek
    const criticalFilters = ['orderStatus', 'itemStatus', 'dateRange']
    if (criticalFilters.includes(key)) {
      console.log(`🔄 SMART REFRESH: Critical filter '${key}' changed - refreshing orders...`)
      await refreshOrders()
    }
  }

  // Check if filters are active
  const hasActiveFilters = () => {
    const hasPriceRange = !!(filters.priceRange.min || filters.priceRange.max);
    const hasCustomDateRange = !!(filters.customDateRange?.startDate || filters.customDateRange?.endDate);
    const hasCustomDeliveryRange = !!(filters.customDeliveryDateRange?.startDate || filters.customDeliveryDateRange?.endDate);
    return !!(
      filters.search || 
      filters.orderStatus?.length > 0 || 
      filters.itemStatus?.length > 0 || 
      filters.dateRange?.length > 0 || 
      hasCustomDateRange ||
      filters.deliveryStatus?.length > 0 || 
      hasCustomDeliveryRange ||
      filters.materialType?.length > 0 || 
      filters.supplierType?.length > 0 || 
      filters.materialCategory || 
      hasPriceRange
    );
  }

  // Apply filters to orders
  const applyFilters = (orders, materials) => {
    if (!orders) return [];

    return orders.filter(order => {
      // Search filter
      if (filters.search) {
        const searchLower = filters.search.toLowerCase();
        const matches = 
          (order.orderCode || order.id).toLowerCase().includes(searchLower) ||
          order.supplierName?.toLowerCase().includes(searchLower) ||
          order.supplierId?.toLowerCase().includes(searchLower);
        
        if (!matches) return false;
      }

      // Status filter
      if (filters.orderStatus?.length > 0) {
        if (!filters.orderStatus.includes(order.orderStatus)) {
          return false;
        }
      }

      // Item status filter
      if (filters.itemStatus?.length > 0) {
        const orderItems = Array.isArray(order.items) ? order.items : [];
        const hasMatchingItem = orderItems.some(item => filters.itemStatus.includes(item.itemStatus));
        if (!hasMatchingItem) return false;
      }

      // Date range filter
      if (filters.dateRange?.length > 0 && order.orderDate) {
        const orderDate = order.orderDate instanceof Date ? order.orderDate : new Date(order.orderDate);
        const now = new Date();
        
        const matchesAnyRange = filters.dateRange.some(range => {
          switch (range) {
            case 'bugün':
              return orderDate.toDateString() === now.toDateString();
            case 'bu-hafta':
              const weekStart = new Date(now);
              weekStart.setDate(weekStart.getDate() - weekStart.getDay());
              return orderDate >= weekStart;
            case 'bu-ay':
              return orderDate.getMonth() === now.getMonth() && orderDate.getFullYear() === now.getFullYear();
            case 'son-3-ay':
              const threeMonthsAgo = new Date();
              threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
              return orderDate >= threeMonthsAgo;
            default:
              return false;
          }
        });
        
        if (!matchesAnyRange) return false;
      }

      // Custom date range filter
      if (filters.customDateRange?.startDate || filters.customDateRange?.endDate) {
        if (!order.orderDate) return false;
        
        const orderDate = order.orderDate instanceof Date ? order.orderDate : new Date(order.orderDate);
        
        if (filters.customDateRange.startDate) {
          const startDate = new Date(filters.customDateRange.startDate);
          if (orderDate < startDate) return false;
        }
        
        if (filters.customDateRange.endDate) {
          const endDate = new Date(filters.customDateRange.endDate);
          endDate.setHours(23, 59, 59, 999); // End of day
          if (orderDate > endDate) return false;
        }
      }

      // Price range filter
      if (filters.priceRange.min || filters.priceRange.max) {
        const min = parseFloat(filters.priceRange.min) || 0;
        const max = parseFloat(filters.priceRange.max) || Infinity;
        
        if (filters.priceRange.mode === 'order') {
          // Order total'a göre filtrele
          const orderTotal = Array.isArray(order.items) ? 
            order.items.reduce((sum, item) => sum + (item.quantity || 0) * (item.unitPrice || 0), 0) : 0;
          
          if (orderTotal < min || orderTotal > max) return false;
          
        } else if (filters.priceRange.mode === 'item') {
          // En az bir item'ın fiyatı aralıkta olmalı
          const orderItems = Array.isArray(order.items) ? order.items : [];
          const hasMatchingItem = orderItems.some(item => {
            const itemTotal = (item.quantity || 0) * (item.unitPrice || 0);
            return itemTotal >= min && itemTotal <= max;
          });
          
          if (!hasMatchingItem) return false;
        }
      }

      // Delivery status filter
      if (filters.deliveryStatus?.length > 0) {
        const deliveryStatus = deliveryStatuses[order.id];
        if (!deliveryStatus || !filters.deliveryStatus.includes(deliveryStatus.status)) {
          return false;
        }
      }

      // Custom delivery date range filter
      if (filters.customDeliveryDateRange?.startDate || filters.customDeliveryDateRange?.endDate) {
        const deliveryStatus = deliveryStatuses[order.id];
        if (!deliveryStatus || !deliveryStatus.expectedDate) return false;
        
        const deliveryDate = deliveryStatus.expectedDate instanceof Date 
          ? deliveryStatus.expectedDate 
          : new Date(deliveryStatus.expectedDate);
        
        if (filters.customDeliveryDateRange.startDate) {
          const startDate = new Date(filters.customDeliveryDateRange.startDate);
          if (deliveryDate < startDate) return false;
        }
        
        if (filters.customDeliveryDateRange.endDate) {
          const endDate = new Date(filters.customDeliveryDateRange.endDate);
          endDate.setHours(23, 59, 59, 999); // End of day
          if (deliveryDate > endDate) return false;
        }
      }

      // Material type filter
      if (filters.materialType?.length > 0) {
        const orderItems = Array.isArray(order.items) ? order.items : [];
        const hasMatchingMaterial = orderItems.some(item => 
          filters.materialType.includes(item.materialCode) || 
          filters.materialType.includes(item.materialName)
        );
        if (!hasMatchingMaterial) return false;
      }

      // Supplier type filter
      if (filters.supplierType?.length > 0) {
        const hasMatchingSupplier = 
          filters.supplierType.includes(order.supplierCode) ||
          filters.supplierType.includes(order.supplierId);
        if (!hasMatchingSupplier) return false;
      }

      // Material category filter
      if (filters.materialCategory) {
        const orderItems = Array.isArray(order.items) ? order.items : [];
        const hasMatchingCategory = orderItems.some(item => {
          // Önce materialCode ile materials array'inde ilgili malzemeyi bul
          const material = materials.find(m => 
            (m.code === item.materialCode) || 
            (m.materialCode === item.materialCode) ||
            (m.code === item.materialName) ||
            (m.name === item.materialCode)
          );
          
          return material && material.category === filters.materialCategory;
        });
        if (!hasMatchingCategory) return false;
      }

      return true;
    });
  }

  const filteredOrders = applyFilters(orders, materials);

  // Basit order status based filtering - items'a bakmadan
  const pendingOrdersView = filteredOrders.filter(order => order.orderStatus !== 'Teslim Edildi');
  const completedOrdersView = filteredOrders.filter(order => order.orderStatus === 'Teslim Edildi');
  const allOrdersView = filteredOrders;

  const currentOrders = activeOrdersTab === 'pending' 
    ? pendingOrdersView 
    : activeOrdersTab === 'completed' 
      ? completedOrdersView 
      : allOrdersView;
  const currentLoading = ordersLoading;

  console.log('📊 Orders debug (simplified):', {
    totalOrders: orders.length,
    pendingOrders: orders.filter(o => o.orderStatus !== 'Teslim Edildi').length,
    completedOrders: orders.filter(o => o.orderStatus === 'Teslim Edildi').length,
    activeTab: activeOrdersTab,
    ordersLoading,
    sampleOrder: orders[0] ? {
      id: orders[0].id,
      orderStatus: orders[0].order_status,
      hasItems: Array.isArray(orders[0].items),
      itemsCount: orders[0].items?.length || 0
    } : 'No orders'
  });

  console.log('🎯 TABLE DEBUG - Passing to OrdersTable:', {
    ordersCount: orders.length,
    loading: currentLoading,
    variant: activeOrdersTab
  });

  const serializeItemsForOrder = (list = []) => (
    list.map(item => {
      const fallbackLineId = item.lineId || `${item.materialCode || item.itemCode || item.id}-${String(item.itemSequence || 1).padStart(2, '0')}`
      return {
        id: item.id,
        lineId: fallbackLineId,
        itemCode: item.itemCode,
        itemSequence: item.itemSequence,
        materialCode: item.materialCode,
        materialName: item.materialName,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        itemStatus: item.itemStatus,
        expectedDeliveryDate: item.expectedDeliveryDate instanceof Date
          ? item.expectedDeliveryDate
          : (item.expectedDeliveryDate || null),
        actualDeliveryDate: item.actualDeliveryDate instanceof Date
          ? item.actualDeliveryDate
          : (item.actualDeliveryDate || null)
      }
    })
  )

  // Handle order click - Test için basitleştirildi
  const handleOrderClick = async (order) => {
    console.log('�🔥🔥 Sipariş tıklandı!!! Order:', order);
    console.log('🔥🔥🔥 Setting selectedOrder...');
    
    // Önce test için basit modal açalım
    setSelectedOrder(order)
    setSelectedOrderError(null)
    setSelectedOrderLoading(false)
    setUpdatingItemIds([])
    
    console.log('🔥🔥🔥 selectedOrder set edildi!');
  }

  const handleCloseOrderDetail = () => {
    setSelectedOrder(null)
    setSelectedOrderError(null)
    setSelectedOrderLoading(false)
    setUpdatingItemIds([])
  }

  // Handle order status update
  const handleUpdateOrderStatus = async (orderId, newStatus) => {
    console.log('🔄 HANDLE UPDATE ORDER STATUS CALLED:')
    console.log('  - Order ID:', orderId)
    console.log('  - New Status:', newStatus)
    console.log('  - Type of orderId:', typeof orderId)
    console.log('  - Type of newStatus:', typeof newStatus)
    
    if (!newStatus) {
      console.log('❌ No newStatus provided - returning early')
      return;
    }
    
    if (!orderId) {
      console.log('❌ No orderId provided - returning early')
      return;
    }
    
    // PREVENT bulk "Teslim Edildi" - must use item-level delivery for lot tracking
    if (newStatus === 'Teslim Edildi') {
      console.log('❌ BLOCKED: Order-level "Teslim Edildi" not allowed. Use item-level delivery for lot tracking.')
      alert('⚠️ Sipariş seviyesinden toplu teslim edilemez!\n\nLot takibi için her ürünü ayrı ayrı teslim edin.');
      return;
    }
    
    console.log('🔄 Proceeding with order status update...')
    
    try {
      // Reuse existing item-level status change logic for each item
      console.log('🔄 Bulk item status propagation via handleItemStatusChange for order:', orderId, '→', newStatus)

      // Determine items source
      let itemsSource = []
      if (selectedOrder && selectedOrder.id === orderId && Array.isArray(selectedOrder.items)) {
        itemsSource = selectedOrder.items
      } else {
        const orderInList = (orders || []).find(o => o.id === orderId)
        if (orderInList && Array.isArray(orderInList.items)) {
          itemsSource = orderInList.items
        } else {
          try {
            const resp = await fetchWithTimeout(`/api/orders/${orderId}`, { headers: withAuth() })
            if (resp.ok) {
              const data = await resp.json()
              const ord = data.order || data
              itemsSource = Array.isArray(ord.items) ? ord.items : []
            }
          } catch (e) {
            console.warn('⚠️ Failed to fetch order details for bulk item status change:', e?.message)
          }
        }
      }

      // Apply item-level status change for each item
      for (const it of (itemsSource || [])) {
        // Skip if already at desired status
        if ((it.itemStatus || 'Onay Bekliyor') === newStatus) continue
        try {
          await handleItemStatusChange(orderId, it, newStatus)
        } catch (e) {
          console.warn('⚠️ Item status change failed for', it.itemCode || it.id || it.lineId, e?.message)
        }
      }

      // Finalize order status to keep consistency (backend may already align it)
      console.log('📡 Finalizing order status to', newStatus, 'after item updates')
      const updatedOrder = await updateOrder(orderId, { orderStatus: newStatus })
      console.log('✅ updateOrder API call completed, result:', updatedOrder)

      // Update local state
      // 1) Optimistically update orders list to keep UI in sync immediately
      setOrders(prev => prev.map(o => {
        if (o.id !== orderId) return o;
        const baseItems = Array.isArray(o.items) ? o.items : [];
        const propagatedItems = baseItems.length > 0
          ? baseItems.map(it => ({
              ...it,
              itemStatus: newStatus,
              actualDeliveryDate: newStatus === 'Teslim Edildi' ? (it.actualDeliveryDate || new Date()) : null
            }))
          : baseItems;
        return { ...o, orderStatus: newStatus, items: propagatedItems };
      }))

      if (selectedOrder && selectedOrder.id === orderId) {
        setSelectedOrder(prev => {
          if (!prev) return prev;
          const baseItems = Array.isArray((updatedOrder && updatedOrder.items) || prev.items) 
            ? (updatedOrder.items || prev.items) 
            : [];
          const propagatedItems = baseItems.length > 0
            ? baseItems.map(it => ({
                ...it,
                itemStatus: newStatus,
                actualDeliveryDate: newStatus === 'Teslim Edildi' ? (it.actualDeliveryDate || new Date()) : null
              }))
            : baseItems;
          return { ...prev, orderStatus: newStatus, items: propagatedItems };
        })
      }
      
      await refreshOrders();

      if (selectedOrder && selectedOrder.id === orderId) {
        setSelectedOrderLoading(true);
        try {
          const response = await fetchWithTimeout(`/api/orders/${orderId}`, {
            headers: withAuth()
          })
          
          if (response.ok) {
            const data = await response.json()
            const refreshed = data.order || data
            setSelectedOrder(refreshed);
          }
        } catch (detailError) {
          console.error('❌ Detay güncellenirken hata:', detailError);
        } finally {
          setSelectedOrderLoading(false);
        }
      }

      console.log(`✅ Order ${orderId} status updated to ${newStatus}`);
    } catch (error) {
      console.error('❌ Error updating order status:', error);
      console.error('❌ Error details:', {
        orderId,
        newStatus,
        message: error.message,
        stack: error.stack
      });
      // Rollback optimistic update if needed
      setOrders(prev => prev.map(o => {
        if (o.id === orderId && selectedOrder && selectedOrder.id === orderId) {
          return { ...o, orderStatus: selectedOrder.orderStatus };
        }
        return o;
      }));
      
      alert(`Sipariş durumu güncellenemedi: ${error.message}`);
    }
  }

  const handleItemStatusChange = async (orderId, item, newStatus) => {
    console.log('🚀🚀🚀 HANDLE ITEM STATUS CHANGE FUNCTION CALLED!');
    console.log('🔍 Parameters received:', {
      orderId: orderId,
      item: item,
      newStatus: newStatus,
      itemCurrentStatus: item?.itemStatus
    });
    
    if (!newStatus || newStatus === item.itemStatus) {
      console.log('❌ Early return: no status change needed');
      return
    }
    
    // 🎯 LOT TRACKING: Open delivery modal for "Teslim Edildi" status
    if (newStatus === 'Teslim Edildi') {
      console.log('📦 Opening delivery modal for lot tracking');
      setDeliveryModalItem({ orderId, item });
      setDeliveryFormData({
        actualDeliveryDate: getLocalDateString(),
        supplierLotCode: '',
        manufacturingDate: '',
        expiryDate: '',
        notes: ''
      });
      setDeliveryModalOpen(true);
      return;
    }

    // Item identifier - id, itemCode, lineId veya index-based
    const itemId = item.id || item.itemCode || item.lineId || `item-${item.materialCode || 'unknown'}`
    const itemKey = `${orderId}-${itemId}` // For optimistic updates
    
    // ✅ OPTIMISTIC UPDATE: Hemen UI'da değişikliği göster
    setItemStatusUpdates(prev => ({
      ...prev,
      [itemKey]: newStatus
    }))
    console.log('🎨 Optimistic update applied:', itemKey, '->', newStatus);
    
    console.log('🔍 Item status değişiyor:', {
      orderId,
      itemId: itemId,
      oldStatus: item.itemStatus,
      newStatus: newStatus,
      materialCode: item.materialCode,
      quantity: item.quantity,
      fullItem: item
    });

    console.log('🔍 DEBUG: API çağrısı detayları:', {
      url: `/api/orders/${orderId}/items/${itemId}`,
      method: 'PUT',
      body: { itemStatus: newStatus },
      fullUrl: window.location.origin + `/api/orders/${orderId}/items/${itemId}`,
      itemDetails: {
        itemId: itemId,
        itemCode: item.itemCode,
        lineId: item.lineId,
        id: item.id,
        materialCode: item.materialCode
      }
    });

    setUpdatingItemIds(prev => [...new Set([...prev, itemId])])

    try {
      // Backend API ile item status güncelle
      console.log('🚀 DEBUG: Making API call...')
      const response = await fetchWithTimeout(`/api/orders/${orderId}/items/${itemId}`, {
        method: 'PUT',
        headers: {
          ...withAuth(),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ itemStatus: newStatus })
      })
      
      console.log('📡 DEBUG: API response:', response.status, response.statusText)
      
      if (!response.ok) {
        const errorText = await response.text()
        console.error('❌ DEBUG: API error response:', errorText)
        console.error('❌ DEBUG: Full response details:', {
          status: response.status,
          statusText: response.statusText,
          headers: Object.fromEntries(response.headers.entries()),
          url: response.url
        })
        throw new Error(`API Error: ${response.status} - ${errorText}`)
      }
      
      const result = await response.json()
      console.log('✅ DEBUG: API success:', result)
      console.log('✅ DEBUG: Full API response analysis:', {
        item: result.item,
        orderStatus: result.orderStatus,
        orderStatusChanged: result.orderStatusChanged,
        message: result.message
      })

      // ✅ Backend'den dönen order status güncellemesi
      const updatedItem = result.item
      const backendOrderStatus = result.orderStatus
      const orderStatusChanged = result.orderStatusChanged
      
      console.log('🔍 DEBUG: Backend response analysis:', {
        orderStatusChanged,
        backendOrderStatus,
        currentOrderStatus: selectedOrder?.order_status,
        apiSuccess: true
      })

      // ✅ KRITIK: Stok artışını sadece "Teslim Edildi" status değişikliğinde yap
      // Backend'den gelen updatedItem.itemStatus ile kontrol et (artık camelCase)
      const isBecomingDelivered = updatedItem.itemStatus === 'Teslim Edildi' && newStatus === 'Teslim Edildi';
      
      console.log('🔍 DEBUG: Stock update check:', {
        updatedItemStatus: updatedItem.itemStatus,
        requestedStatus: newStatus,
        isBecomingDelivered,
        materialCode: updatedItem.materialCode,
        quantity: updatedItem.quantity
      });

      // If item is delivered, update material stock via backend API
      if (isBecomingDelivered) {
        console.log('🚀 DEBUG: Starting stock update for delivered item:', {
          materialCode: updatedItem.materialCode,
          quantity: updatedItem.quantity,
          orderId: orderId,
          itemId: updatedItem.id
        });
        
        try {
          console.log('📦 DEBUG: Making API call to:', `/api/materials/${updatedItem.materialCode}/stock`);
          
          const response = await fetch(`/api/materials/${updatedItem.materialCode}/stock`, {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${localStorage.getItem('bp_admin_token') || ''}`
            },
            body: JSON.stringify({
              quantity: updatedItem.quantity,
              operation: 'add',
              orderId: orderId,
              orderCode: updatedItem.orderCode, // ✅ Order code eklendi
              itemId: updatedItem.id,
              movementType: 'order_delivery',
              notes: `Sipariş kalemi teslimi: ${updatedItem.materialName} (${updatedItem.quantity} ${updatedItem.unit || 'adet'})`,
              reason: `Order delivery: ${updatedItem.orderCode}`
            })
          });

          console.log('📡 DEBUG: API response status:', response.status);

          if (!response.ok) {
            const errorData = await response.json();
            console.error('❌ DEBUG: API error response:', errorData);
            throw new Error(errorData.error || 'Stok güncellenemedi');
          }

          const result = await response.json();
          console.log('✅ DEBUG: API success response:', result);
          console.log(`✅ Stock updated via API for ${updatedItem.materialCode}: ${result.previousStock} → ${result.newStock}`);
          
          // Dispatch unified global stock update events
          // Primary: materialStockUpdated (used by useMaterials for instant local + force refresh)
          window.dispatchEvent(new CustomEvent('materialStockUpdated', {
            detail: {
              materialCode: updatedItem.materialCode,
              newStock: result.newStock,
              quantity: updatedItem.quantity,
              operation: 'add',
              context: 'orders-tab-item-delivery'
            }
          }));

          // Backward compatibility: stockUpdated (kept for existing listeners)
          window.dispatchEvent(new CustomEvent('stockUpdated', {
            detail: {
              materialCode: updatedItem.materialCode,
              previousStock: result.previousStock,
              newStock: result.newStock
            }
          }));
          
        } catch (stockError) {
          console.error('❌ DEBUG: Stock update error:', stockError);
        }
      }

      console.log('🔄 DEBUG: Starting order refresh...')
      
      // ✅ Backend'den order status değişikliği varsa local state'i güncelle
      if (orderStatusChanged && backendOrderStatus) {
        console.log(`🔄 SMART UPDATE: Backend order status changed to ${backendOrderStatus}`)
        
        // Orders listesini güncelle
        setOrders(prev => prev.map(o => 
          o.id === orderId ? { ...o, orderStatus: backendOrderStatus } : o
        ))
        
        // Selected order'ı da güncelle
        if (selectedOrder && selectedOrder.id === orderId) {
          setSelectedOrder(prev => prev ? { ...prev, orderStatus: backendOrderStatus } : prev)
        }
        
        console.log(`✅ Local state updated: Order ${orderId} status → ${backendOrderStatus}`)
      }
      
      await refreshOrders()
      console.log('✅ DEBUG: refreshOrders completed')

      // ✅ Sadece selectedOrder varsa ve aynı ID ise refresh et
      if (selectedOrder && selectedOrder.id === orderId) {
        console.log('� DEBUG: Updating selected order details...')
        setSelectedOrderLoading(true)
        try {
          const orderResponse = await fetchWithTimeout(`/api/orders/${orderId}?t=${Date.now()}`, {
            headers: withAuth()
          })
          
          if (orderResponse.ok) {
            const orderData = await orderResponse.json()
            const refreshed = orderData.order || orderData
            console.log('🔄 DEBUG: Order refreshed with status:', refreshed.orderStatus)
            setSelectedOrder(refreshed)
            
            // ✅ Clear optimistic update ONLY after selectedOrder is successfully updated
            setItemStatusUpdates(prev => {
              const updated = { ...prev }
              delete updated[itemKey]
              return updated
            })
          }
        } catch (detailError) {
          console.error('❌ Detay güncellenirken hata:', detailError)
        } finally {
          setSelectedOrderLoading(false)
        }
      } else {
        // ✅ If no selectedOrder to refresh, clear optimistic update immediately
        setItemStatusUpdates(prev => {
          const updated = { ...prev }
          delete updated[itemKey]
          return updated
        })
      }
    } catch (error) {
      console.error('❌ Error updating item status:', error)
      // ✅ ROLLBACK optimistic update on error
      setItemStatusUpdates(prev => {
        const updated = { ...prev }
        delete updated[itemKey]
        return updated
      })
      alert(`Item status güncellenemedi: ${error.message}`)
    } finally {
      setUpdatingItemIds(prev => prev.filter(id => id !== itemId))
    }
  }
  
  // 🎯 LOT TRACKING: Handle delivery with lot data
  const handleDeliverItem = async () => {
    if (!deliveryModalItem) return;
    
    const { orderId, item } = deliveryModalItem;
    const itemId = item.id || item.itemCode || item.lineId || `item-${item.materialCode || 'unknown'}`;
    
    // Validate form data
    const today = getLocalDateString();
    
    if (deliveryFormData.manufacturingDate && deliveryFormData.manufacturingDate > today) {
      alert('Üretim tarihi bugünden ileri olamaz');
      return;
    }
    
    if (deliveryFormData.expiryDate && deliveryFormData.expiryDate <= today) {
      alert('Son kullanma tarihi bugünden sonra olmalıdır');
      return;
    }
    
    if (deliveryFormData.manufacturingDate && deliveryFormData.expiryDate && 
        deliveryFormData.expiryDate <= deliveryFormData.manufacturingDate) {
      alert('Son kullanma tarihi üretim tarihinden sonra olmalıdır');
      return;
    }
    
    setDeliveryLoading(true);
    
    try {
      console.log('📦 Delivering item with lot tracking:', {
        orderId,
        itemId,
        deliveryData: deliveryFormData
      });
      
      // Call the delivery endpoint with lot tracking data
      const result = await API.deliverOrderItem(orderId, itemId, {
        deliveryData: {
          actualDeliveryDate: deliveryFormData.actualDeliveryDate,
          supplierLotCode: deliveryFormData.supplierLotCode || null,
          manufacturingDate: deliveryFormData.manufacturingDate || null,
          expiryDate: deliveryFormData.expiryDate || null,
          notes: deliveryFormData.notes || null
        }
      });
      
      console.log('✅ Item delivered successfully:', result);
      
      // Show success message with lot number
      if (result.lotNumber) {
        alert(`✅ Teslimat kaydedildi\nLot Numarası: ${result.lotNumber}`);
      } else {
        alert('✅ Teslimat kaydedildi');
      }
      
      // Close modal
      setDeliveryModalOpen(false);
      setDeliveryModalItem(null);
      
      // Refresh orders
      await refreshOrders();
      
      // Refresh selected order if open
      if (selectedOrder && selectedOrder.id === orderId) {
        setSelectedOrderLoading(true);
        try {
          const orderResponse = await fetchWithTimeout(`/api/orders/${orderId}?t=${Date.now()}`, {
            headers: withAuth()
          });
          
          if (orderResponse.ok) {
            const orderData = await orderResponse.json();
            const refreshed = orderData.order || orderData;
            setSelectedOrder(refreshed);
          }
        } catch (detailError) {
          console.error('❌ Error refreshing order details:', detailError);
        } finally {
          setSelectedOrderLoading(false);
        }
      }
      
    } catch (error) {
      console.error('❌ Error delivering item:', error);
      alert(`Teslimat kaydedilemedi: ${error.message}`);
    } finally {
      setDeliveryLoading(false);
    }
  }

  return (
    <div className="orders-tab-content">
      {/* MES Filter Bar: Dashboard + Actions + Filters */}
      <div className="mes-filter-bar">
        {/* Dashboard - Inline Single Line - hide when filters expanded */}
        {!isFiltersExpanded && (
          <div className="materials-dashboard-container">
            <section className="materials-dashboard is-inline">
              <div className="stat">
                <span className="stat-label">Açık Siparişler</span>
                <span className="stat-value">{statsLoading ? '...' : stats.pendingOrders}</span>
              </div>
              <div className="divider"></div>
              <div className="stat">
                <span className="stat-label">Bu Ay Teslim</span>
                <span className="stat-value">{statsLoading ? '...' : stats.thisMonthOrders}</span>
              </div>
              <div className="divider"></div>
              <div className="stat">
                <span className="stat-label">Kısmi Teslimat</span>
                <span className="stat-value warning">{statsLoading ? '...' : stats.partialOrders}</span>
              </div>
            </section>
          </div>
        )}

        {/* Action Buttons - hide when filters expanded */}
        {!isFiltersExpanded && (
          <>
            <button
              type="button"
              className="mes-primary-action is-compact"
              onClick={() => {
                console.log('🔥🔥🔥 Yeni Sipariş butonu tıklandı!');
                setIsDeliveredRecordMode(false);
                setIsAddOrderModalOpen(true);
                console.log('🔥🔥🔥 Modal açılması için state güncellendi!');
              }}
              disabled={actionLoading}
            >
              <Plus size={14} />
              <span>Yeni Sipariş</span>
            </button>
            <button
              type="button"
              className="mes-filter-button is-compact"
              title="Doğrudan sipariş kaydı oluştur"
              onClick={() => {
                console.log('⚡ Gerçekleşmiş Sipariş butonu tıklandı!');
            setIsDeliveredRecordMode(true);
            setIsAddOrderModalOpen(true);
          }}
          disabled={actionLoading}
        >
          <Zap size={14} />
          <span>Doğrudan Ekle</span>
        </button>
        <button
          type="button"
          className="mes-filter-button is-compact"
          title="Siparişleri dışa aktar"
          onClick={handleExportCSV}
        >
          <Download size={14} />
          <span>CSV</span>
        </button>
          </>
        )}

        {/* Filters Component */}
        <OrdersFilters 
          filters={filters}
          onFilterChange={handleFilterChange}
          hasActiveFilters={hasActiveFilters()}
          isExpanded={isFiltersExpanded}
          onToggleExpanded={setIsFiltersExpanded}
          activeMaterials={activeMaterials}
          activeSuppliers={suppliers}
          materialCategories={materialCategories}
        />
      </div>

      {/* Orders Container with Side Panel */}
      <div className="orders-container">
        {/* Left Panel - Orders Table */}
        <div className="orders-table-panel">
          <OrdersTable 
            orders={currentOrders}
            loading={currentLoading}
            error={ordersError}
            variant={activeOrdersTab}
            tabCounts={{ 
              pending: pendingOrdersView.length, 
              completed: completedOrdersView.length,
              all: allOrdersView.length
            }}
            onChangeTab={handleTabChange}
            onOrderClick={handleOrderClick}
            onUpdateOrderStatus={handleUpdateOrderStatus}
            actionLoading={actionLoading}
            deliveryStatuses={deliveryStatuses}
            deliveryLoading={deliveryLoading}
            selectedOrderIds={selectedOrderIds}
            onToggleSelectOrder={handleToggleSelectOrder}
            onToggleSelectAll={handleToggleSelectAll}
            materialNameMap={materialNameMap}
            emptyMessage={
              activeOrdersTab === 'pending' 
                ? 'Bekleyen sipariş bulunamadı' 
                : activeOrdersTab === 'completed'
                  ? 'Tamamlanan sipariş bulunamadı'
                  : 'Sipariş bulunamadı'
            }
          />
        </div>

        {/* Right Panel - Order Details */}
        {selectedOrder && (
          <div className="order-detail-panel">
            <div style={{
              background: 'white',
              borderRadius: '6px',
              border: '1px solid #e5e7eb',
              height: '100%',
              display: 'flex',
              flexDirection: 'column'
            }}>
              {/* Header */}
              <div style={{
                padding: '16px 20px',
                borderBottom: '1px solid #e5e7eb',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <button
                    onClick={handleCloseOrderDetail}
                    style={{
                      padding: '6px 12px',
                      border: '1px solid #d1d5db',
                      borderRadius: '4px',
                      background: 'white',
                      color: '#374151',
                      cursor: 'pointer',
                      fontSize: '12px'
                    }}
                    title="Detayları Kapat"
                  >
                    <ArrowLeft size={14} />
                  </button>
                  <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '600', color: '#111827' }}>
                    Sipariş Detayı
                  </h3>
                </div>
              </div>

              {/* Content - Scrollable */}
              <div className="order-detail-content" style={{ flex: 1, overflow: 'auto', padding: '20px' }}>
                
                {/* Sipariş Bilgileri */}
                <div style={{ 
                  marginBottom: '12px', 
                  padding: '12px', 
                  background: 'white', 
                  borderRadius: '6px',
                  border: '1px solid #e7e5e4',
                  boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)'
                }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: '16px', alignItems: 'center', marginBottom: '12px', paddingBottom: '12px', borderBottom: '1px solid #e7e5e4' }}>
                    <div>
                      <div style={{ fontSize: '11px', color: '#78716c', fontWeight: '500', marginBottom: '4px' }}>SİPARİŞ KODU</div>
                      <div style={{ fontSize: '14px', color: '#0c0a09', fontWeight: '600' }}>
                        {selectedOrder.orderCode || selectedOrder.id}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: '11px', color: '#78716c', fontWeight: '500', marginBottom: '4px' }}>TEDARİKÇİ</div>
                      <div style={{ fontSize: '14px', color: '#0c0a09', fontWeight: '600' }}>
                        {selectedOrder.supplierName}
                      </div>
                    </div>
                    <select
                      value={selectedOrder.orderStatus || 'Onay Bekliyor'}
                      disabled={selectedOrderLoading || actionLoading}
                      onChange={(e) => handleUpdateOrderStatus(selectedOrder.id, e.target.value)}
                      style={{
                        padding: '6px 12px',
                        fontSize: '12px',
                        fontWeight: '500',
                        border: '1px solid #e7e5e4',
                        borderRadius: '4px',
                        background: 'white',
                        color: '#0c0a09',
                        cursor: 'pointer'
                      }}
                    >
                      {ORDER_STATUS_OPTIONS.map(status => (
                        <option key={status} value={status}>{status}</option>
                      ))}
                    </select>
                  </div>
                  
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                    <div>
                      <div style={{ fontSize: '11px', color: '#78716c', fontWeight: '500', marginBottom: '4px' }}>Oluşturulma</div>
                      <div style={{ fontSize: '13px', color: '#0c0a09', fontWeight: '500' }}>
                        {selectedOrder.orderDate ? (new Date(selectedOrder.orderDate)).toLocaleDateString('tr-TR') : '-'}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: '11px', color: '#78716c', fontWeight: '500', marginBottom: '4px' }}>Tahmini Teslim</div>
                      <div style={{ fontSize: '13px', color: '#0c0a09', fontWeight: '500' }}>
                        {selectedOrder.expectedDeliveryDate ? (new Date(selectedOrder.expectedDeliveryDate)).toLocaleDateString('tr-TR') : '-'}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: '11px', color: '#78716c', fontWeight: '500', marginBottom: '4px' }}>Toplam Tutar</div>
                      <div style={{ fontSize: '14px', color: '#0c0a09', fontWeight: '600' }}>
                        {new Intl.NumberFormat('tr-TR', { style: 'currency', currency: selectedOrder.currency || 'TRY' }).format(selectedOrder.totalAmount || 0)}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Teslimat & Not */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                  <div style={{ 
                    padding: '12px', 
                    background: 'white', 
                    borderRadius: '6px',
                    border: '1px solid #e7e5e4',
                    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)'
                  }}>
                    <div style={{ fontSize: '11px', color: '#78716c', fontWeight: '600', marginBottom: '8px', textTransform: 'uppercase' }}>Teslimat Durumu</div>
                    {(() => {
                      const today = new Date()
                      const deliveryDate = selectedOrder.expectedDeliveryDate ? new Date(selectedOrder.expectedDeliveryDate) : null
                      let status = 'hesaplanıyor'
                      let daysRemaining = 0
                      if (deliveryDate && !isNaN(deliveryDate.getTime())) {
                        const timeDiff = deliveryDate.getTime() - today.getTime()
                        daysRemaining = Math.ceil(timeDiff / (1000 * 3600 * 24))
                        if (selectedOrder.orderStatus === 'Teslim Edildi') status = 'teslim-edildi'
                        else if (daysRemaining < 0) status = 'gecikmiş'
                        else if (daysRemaining === 0) status = 'bugün-teslim'
                        else if (daysRemaining <= 7) status = 'bu-hafta-teslim'
                        else status = 'zamanında'
                      }
                      return (
                        <span style={{
                          padding: '4px 12px',
                          borderRadius: '4px',
                          fontSize: '12px',
                          fontWeight: '600',
                          backgroundColor: getDeliveryStatusColor(status).bg,
                          color: getDeliveryStatusColor(status).text,
                          display: 'inline-block'
                        }}>
                          {getDeliveryStatusText(status, daysRemaining)}
                        </span>
                      )
                    })()}
                  </div>
                  
                  <div style={{ 
                    padding: '12px', 
                    background: 'white', 
                    borderRadius: '6px',
                    border: '1px solid #e7e5e4',
                    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)'
                  }}>
                    <div style={{ fontSize: '11px', color: '#78716c', fontWeight: '600', marginBottom: '8px', textTransform: 'uppercase' }}>Not / Referans</div>
                    <div style={{ fontSize: '12px', color: '#0c0a09', lineHeight: '1.5' }}>
                      {selectedOrder.notes || '-'}
                    </div>
                  </div>
                </div>

                {/* Tedarikçi Bilgileri */}
                <div style={{ 
                  marginBottom: '12px',
                  padding: '12px', 
                  background: 'white', 
                  borderRadius: '6px',
                  border: '1px solid #e7e5e4',
                  boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <div style={{ fontSize: '11px', color: '#78716c', fontWeight: '600', textTransform: 'uppercase' }}>Tedarikçi Bilgileri</div>
                    <button
                      type="button"
                      onClick={() => {
                        try { localStorage.setItem('bk_active_tab', 'suppliers'); } catch {}
                        const supplierId = selectedOrder.supplierId || selectedOrder.supplierCode || ''
                        const url = `materials.html#suppliers-tab&supplier-${encodeURIComponent(supplierId)}`
                        window.open(url, '_blank')
                      }}
                      style={{
                        padding: '4px 8px',
                        border: '1px solid #e7e5e4',
                        borderRadius: '4px',
                        background: 'white',
                        color: '#0c0a09',
                        fontSize: '11px',
                        fontWeight: '500',
                        cursor: 'pointer'
                      }}
                    >
                      Detaya Git ↗
                    </button>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px', fontSize: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ color: '#78716c', fontWeight: '500' }}>Tedarikçi Kodu:</span>
                      <span style={{ color: '#0c0a09', fontWeight: '600' }}>
                        {selectedOrder.supplierId ? `T-${String(selectedOrder.supplierId).padStart(4, '0')}` : '-'}
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ color: '#78716c', fontWeight: '500' }}>Tedarikçi Adı:</span>
                      <span style={{ color: '#0c0a09', fontWeight: '600' }}>{selectedOrder.supplierName || '-'}</span>
                    </div>
                  </div>
                </div>

                {/* Sipariş Satırları */}
                <div style={{ 
                  marginBottom: '16px', 
                  padding: '12px', 
                  background: 'white', 
                  borderRadius: '6px',
                  border: '1px solid #e7e5e4',
                  boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)'
                }}>
                  <div style={{ fontSize: '11px', color: '#78716c', fontWeight: '600', marginBottom: '12px', textTransform: 'uppercase' }}>
                    Sipariş Satırları ({selectedOrder.items?.length || selectedOrder.item_count || 0})
                  </div>
                {selectedOrderLoading ? (
                  <p style={{ padding: '12px 0', color: '#6b7280' }}>Satırlar yükleniyor...</p>
                ) : selectedOrderError ? (
                  <p style={{ color: '#dc2626', padding: '12px 0' }}>Satırlar yüklenemedi: {selectedOrderError}</p>
                ) : (selectedOrder.items && selectedOrder.items.length > 0) ? (
                  <div className="table-container" style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                      <thead>
                        <tr>
                          <th style={{ background: '#f9fafb', padding: '8px 12px', textAlign: 'left', fontWeight: '600', color: '#374151', borderBottom: '1px solid #e5e7eb', whiteSpace: 'nowrap' }}>
                            Satır Kodu
                          </th>
                          <th style={{ background: '#f9fafb', padding: '8px 12px', textAlign: 'left', fontWeight: '600', color: '#374151', borderBottom: '1px solid #e5e7eb', whiteSpace: 'nowrap' }}>
                            Malzeme Kodu
                          </th>
                          <th style={{ background: '#f9fafb', padding: '8px 12px', textAlign: 'left', fontWeight: '600', color: '#374151', borderBottom: '1px solid #e5e7eb', whiteSpace: 'nowrap' }}>
                            Malzeme Adı
                          </th>
                          <th style={{ background: '#f9fafb', padding: '8px 12px', textAlign: 'left', fontWeight: '600', color: '#374151', borderBottom: '1px solid #e5e7eb', whiteSpace: 'nowrap' }}>
                            Miktar
                          </th>
                          <th style={{ background: '#f9fafb', padding: '8px 12px', textAlign: 'left', fontWeight: '600', color: '#374151', borderBottom: '1px solid #e5e7eb', whiteSpace: 'nowrap' }}>
                            Durum
                          </th>
                          <th style={{ background: '#f9fafb', padding: '8px 12px', textAlign: 'center', fontWeight: '600', color: '#374151', borderBottom: '1px solid #e5e7eb', whiteSpace: 'nowrap' }}>
                            İşlemler
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {console.log('🔍 DEBUG: Rendering order items:', selectedOrder.items.length, 'items')}
                        {[...(selectedOrder.items || [])]
                          .sort((a, b) => (a.itemSequence || 0) - (b.itemSequence || 0))
                          .map((item, index) => {
                            const itemId = item.id || item.itemCode || item.lineId || `item-${item.materialCode || 'unknown'}`
                            const isItemUpdating = updatingItemIds.includes(itemId);
                            const itemKey = `${selectedOrder.id}-${item.id || item.itemCode || item.lineId || `item-${item.materialCode || 'unknown'}`}`
                            const currentStatus = itemStatusUpdates[itemKey] || item.itemStatus || 'Onay Bekliyor'
                            console.log('🔍 Rendering item:', {
                              itemId: itemId,
                              itemStatus: item.itemStatus,
                              materialCode: item.materialCode,
                              isUpdating: isItemUpdating
                            });
                            return (
                              <tr key={itemId} style={{ background: '#fff' }}>
                                <td style={{ padding: '8px 12px', color: '#111827', fontSize: '11px', borderBottom: '1px solid #f1f5f9' }}>
                                  {item.itemCode || item.lineId || `item-${String(index + 1).padStart(2, '0')}`}
                                </td>
                                <td style={{ padding: '8px 12px', color: '#111827', fontSize: '11px', borderBottom: '1px solid #f1f5f9' }}>
                                  {item.materialCode || '—'}
                                </td>
                                <td style={{ padding: '8px 12px', color: '#111827', fontSize: '11px', borderBottom: '1px solid #f1f5f9' }}>
                                  {item.materialName || '-'}
                                </td>
                                <td style={{ padding: '8px 12px', color: '#111827', fontSize: '11px', borderBottom: '1px solid #f1f5f9' }}>
                                  {item.quantity || 0} adet
                                </td>
                                <td style={{ padding: '8px 12px', color: '#111827', fontSize: '11px', borderBottom: '1px solid #f1f5f9' }}>
                                  <span style={{ fontSize: '10px', fontWeight: 600, color: '#0f172a', background: '#e2e8f0', padding: '2px 8px', borderRadius: '999px', whiteSpace: 'nowrap', display: 'inline-block' }}>
                                    {currentStatus}
                                  </span>
                                </td>
                                <td style={{ padding: '8px 12px', borderBottom: '1px solid #f1f5f9', textAlign: 'center' }}>
                                  <select
                                    value={currentStatus}
                                    disabled={isItemUpdating}
                                    onChange={(e) => {
                                      console.log('🔥🔥 DROPDOWN ITEM STATUS CHANGE TRIGGERED!');
                                      console.log('🔍 Item status değişiyor:', {
                                        itemId: item.id,
                                        itemLineId: item.lineId,
                                        itemCode: item.itemCode,
                                        oldStatus: item.itemStatus,
                                        newStatus: e.target.value,
                                        materialCode: item.materialCode,
                                        disabled: isItemUpdating,
                                        selectedOrderId: selectedOrder.id,
                                        fullItem: item
                                      });
                                      console.log('🔥🔥🔥 CALLING handleItemStatusChange...');
                                      handleItemStatusChange(selectedOrder.id, item, e.target.value);
                                    }}
                                    style={{
                                      padding: '4px 8px',
                                      fontSize: '11px',
                                      border: '1px solid #d1d5db',
                                      borderRadius: '4px',
                                      background: '#fff'
                                    }}
                                  >
                                    {ITEM_STATUS_OPTIONS.map(status => (
                                      <option key={status} value={status}>{status}</option>
                                    ))}
                                  </select>
                                </td>
                              </tr>
                            )
                          })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p style={{ color: '#6b7280', fontStyle: 'italic' }}>Bu sipariş için kayıtlı kalem bulunamadı.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
      
      {/* Add Order Modal */}
      <AddOrderModal 
        isOpen={isAddOrderModalOpen}
        onClose={() => setIsAddOrderModalOpen(false)}
        deliveredRecordMode={isDeliveredRecordMode}
        onSave={async (newOrder) => {
          console.log('✅ New order created:', newOrder);
          console.log('🔄 IMMEDIATE REFRESH: Triggering aggressive refresh...');
          
          // ✅ IMMEDIATE REFRESH - Multiple attempts for real-time update
          await refreshOrders();
          
          // ✅ BACKUP REFRESH: 500ms sonra bir daha refresh (network gecikmeleri için)
          setTimeout(async () => {
            console.log('🔄 BACKUP REFRESH: Second refresh...');
            await refreshOrders();
          }, 500);
          
          // ✅ FINAL REFRESH: 1.5s sonra final refresh
          setTimeout(async () => {
            console.log('🔄 FINAL REFRESH: Third refresh...');
            await refreshOrders();
          }, 1500);
        }}
      />
      
      
      
      {/* 📦 LOT TRACKING: Delivery Modal */}
      {deliveryModalOpen && deliveryModalItem && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999
          }}
          onClick={() => !deliveryLoading && setDeliveryModalOpen(false)}
        >
          <div
            style={{
              background: 'white',
              borderRadius: '8px',
              padding: '24px',
              maxWidth: '500px',
              width: '90%',
              maxHeight: '90vh',
              overflowY: 'auto',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div style={{ marginBottom: '20px', borderBottom: '1px solid #e5e7eb', paddingBottom: '16px' }}>
              <h2 style={{ margin: '0 0 8px 0', fontSize: '18px', fontWeight: '600', color: '#111827' }}>
                📦 Malzeme Teslim Al
              </h2>
              <div style={{ fontSize: '13px', color: '#6b7280' }}>
                <div><strong>Malzeme:</strong> {deliveryModalItem.item.materialName} ({deliveryModalItem.item.materialCode})</div>
                <div><strong>Miktar:</strong> {deliveryModalItem.item.quantity} adet</div>
              </div>
            </div>
            
            {/* Form Fields */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Delivery Date */}
              <div>
                <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: '500', color: '#374151' }}>
                  Teslim Tarihi <span style={{ color: '#dc2626' }}>*</span>
                </label>
                <input
                  type="date"
                  className="mes-filter-input"
                  value={deliveryFormData.actualDeliveryDate}
                  onChange={(e) => setDeliveryFormData(prev => ({ ...prev, actualDeliveryDate: e.target.value }))}
                  max={getLocalDateString()}
                  required
                  disabled={deliveryLoading}
                  style={{ width: '100%' }}
                />
              </div>
              
              {/* 📦 LOT TRACKING FIELDS - Only show when lot tracking is enabled */}
              {systemSettings.lotTracking && (
                <>
                  {/* Supplier Lot Code */}
                  <div>
                    <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: '500', color: '#374151' }}>
                      Tedarikçi Lot/Batch Kodu <span style={{ fontSize: '11px', color: '#6b7280', fontWeight: '400' }}>(opsiyonel)</span>
                    </label>
                    <input
                      type="text"
                      className="mes-filter-input"
                      placeholder="Örn: BATCH-2025-001"
                      value={deliveryFormData.supplierLotCode}
                      onChange={(e) => setDeliveryFormData(prev => ({ ...prev, supplierLotCode: e.target.value }))}
                      maxLength={100}
                      disabled={deliveryLoading}
                      style={{ width: '100%' }}
                    />
                  </div>
                  
                  {/* Manufacturing Date */}
                  <div>
                    <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: '500', color: '#374151' }}>
                      Üretim Tarihi <span style={{ fontSize: '11px', color: '#6b7280', fontWeight: '400' }}>(opsiyonel)</span>
                    </label>
                    <input
                      type="date"
                      className="mes-filter-input"
                      value={deliveryFormData.manufacturingDate}
                      onChange={(e) => setDeliveryFormData(prev => ({ ...prev, manufacturingDate: e.target.value }))}
                      max={getLocalDateString()}
                      disabled={deliveryLoading}
                      style={{ width: '100%' }}
                    />
                    <small style={{ fontSize: '11px', color: '#6b7280', marginTop: '4px', display: 'block' }}>
                      Üretim tarihi bugünden ileri olamaz
                    </small>
                  </div>
                  
                  {/* Expiry Date */}
                  <div>
                    <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: '500', color: '#374151' }}>
                      Son Kullanma Tarihi <span style={{ fontSize: '11px', color: '#6b7280', fontWeight: '400' }}>(opsiyonel)</span>
                    </label>
                    <input
                      type="date"
                      className="mes-filter-input"
                      value={deliveryFormData.expiryDate}
                      onChange={(e) => setDeliveryFormData(prev => ({ ...prev, expiryDate: e.target.value }))}
                      min={getTomorrowDateString()}
                      disabled={deliveryLoading}
                      style={{ width: '100%' }}
                    />
                    <small style={{ fontSize: '11px', color: '#6b7280', marginTop: '4px', display: 'block' }}>
                      Son kullanma tarihi bugünden sonra olmalıdır
                    </small>
                  </div>
                  
                  {/* Info Message */}
                  <div style={{
                    background: '#eff6ff',
                    border: '1px solid #bfdbfe',
                    borderRadius: '6px',
                    padding: '12px',
                    fontSize: '12px',
                    color: '#1e40af'
                  }}>
                    <strong>ℹ️ Bilgi:</strong> Lot numarası otomatik olarak oluşturulacaktır.<br />
                    Format: <code style={{ background: '#dbeafe', padding: '2px 4px', borderRadius: '3px' }}>LOT-{'{'}malzeme_kodu{'}'}-{'{'}YYYYMMDD{'}'}-{'{'}sıra{'}'}</code>
                  </div>
                </>
              )}
              
              {/* Notes - Always visible */}
              <div>
                <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: '500', color: '#374151' }}>
                  Notlar <span style={{ fontSize: '11px', color: '#6b7280', fontWeight: '400' }}>(opsiyonel)</span>
                </label>
                <textarea
                  className="mes-filter-input"
                  placeholder="Teslimata dair ek notlar..."
                  value={deliveryFormData.notes}
                  onChange={(e) => setDeliveryFormData(prev => ({ ...prev, notes: e.target.value }))}
                  rows={3}
                  disabled={deliveryLoading}
                  style={{ width: '100%', resize: 'vertical' }}
                />
              </div>
            </div>
            
            {/* Action Buttons */}
            <div style={{ marginTop: '24px', display: 'flex', gap: '12px', justifyContent: 'flex-end', borderTop: '1px solid #e5e7eb', paddingTop: '16px' }}>
              <button
                className="mes-filter-button"
                onClick={() => setDeliveryModalOpen(false)}
                disabled={deliveryLoading}
                style={{ padding: '8px 16px' }}
              >
                İptal
              </button>
              <button
                className="mes-primary-action"
                onClick={handleDeliverItem}
                disabled={deliveryLoading || !deliveryFormData.actualDeliveryDate}
                style={{ padding: '8px 16px' }}
              >
                {deliveryLoading ? '⏳ Kaydediliyor...' : '✅ Teslimi Kaydet'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
