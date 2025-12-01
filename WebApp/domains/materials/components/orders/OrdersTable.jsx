import React, { useState, useMemo } from 'react'

// Shared helpers for delivery status
function getDeliveryStatusColor(status) {
  const statusColors = {
    'bugün-teslim': { bg: '#fef3c7', text: '#d97706' },
    'bu-hafta-teslim': { bg: '#dbeafe', text: '#2563eb' },
    'gecikmiş': { bg: '#fee2e2', text: '#dc2626' },
    'gecikti': { bg: '#fee2e2', text: '#dc2626' },
    'zamanında': { bg: '#dcfce7', text: '#16a34a' },
    'erken': { bg: '#f3e8ff', text: '#9333ea' },
    'teslim-edildi': { bg: '#dcfce7', text: '#16a34a' },
    'hesaplanıyor': { bg: '#f1f5f9', text: '#64748b' }
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

// Empty state component for different tabs
function EmptyState({ variant, hasNoOrdersAtAll = false }) {
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
    <div className="orders-empty-state-container">
      <div className="orders-empty-icon">{config.icon}</div>
      <h3 className="orders-empty-title">{config.title}</h3>
      <p className="orders-empty-message">{config.message}</p>
    </div>
  )
}

export default function OrdersTable({
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
  const [sortField, setSortField] = useState('orderDate')
  const [sortDirection, setSortDirection] = useState('desc')

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

  const visibleOrders = useMemo(() => {
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

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('tr-TR', {
      style: 'currency',
      currency: 'TRY'
    }).format(amount || 0)
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
    <div className="line-chips-container">
      {items.map((item, index) => {
        const qty = parseFloat(item.quantity || 0)
        const formattedQty = qty % 1 === 0 ? qty.toFixed(0) : qty.toString()
        
        return (
          <div key={item.id || item.lineId || index} className="line-chip">
            <span className="line-chip-code">
              {item.item_code || item.lineId || `item-${String(index + 1).padStart(2, '0')}`}
            </span>
            <span className="text-border">|</span>
            <span className="line-chip-material">{item.materialCode || '—'}</span>
            <span className="text-border">|</span>
            <span className="line-chip-qty">{formattedQty} {item.unit || 'adet'}</span>
            <span className="text-border">|</span>
            <span className="line-chip-status">{item.itemStatus || 'Onay Bekliyor'}</span>
          </div>
        )
      })}
    </div>
  )

  return (
    <section className="materials-table">
      {/* Tab Navigation */}
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

      {/* Table Container */}
      <div className="table-container w-full">
        <table className="table-fixed-layout">
          <colgroup>
            <col className="col-w-40" />
            <col className="col-w-120" />
            <col />
            {variant !== 'completed' && <col />}
            <col />
            <col className="col-w-120" />
            {variant !== 'completed' && <col />}
          </colgroup>
          <thead>
            <tr>
              <th className="col-w-40-center">
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
              <th className="col-w-120-nowrap-only">
                <button type="button" onClick={() => handleSort('orderCode')} className="mes-sort-button">
                  Sipariş Kodu
                  <span className="mes-sort-icon">{getSortIndicator('orderCode')}</span>
                </button>
              </th>
              <th className="col-min-160">
                <button type="button" onClick={() => handleSort('supplier')} className="mes-sort-button">
                  Tedarikçi
                  <span className="mes-sort-icon">{getSortIndicator('supplier')}</span>
                </button>
              </th>
              {variant !== 'completed' && (
                <th className="col-min-160">
                  <button type="button" onClick={() => handleSort('status')} className="mes-sort-button">
                    Teslimat Durumu
                    <span className="mes-sort-icon">{getSortIndicator('status')}</span>
                  </button>
                </th>
              )}
              <th className="col-min-160">
                <button type="button" onClick={() => handleSort('items')} className="mes-sort-button">
                  Sipariş Satırları
                  <span className="mes-sort-icon">{getSortIndicator('items')}</span>
                </button>
              </th>
              <th className="col-min-120-nowrap">
                <button type="button" onClick={() => handleSort('total')} className="mes-sort-button">
                  Tutar
                  <span className="mes-sort-icon">{getSortIndicator('total')}</span>
                </button>
              </th>
              {variant !== 'completed' && (
                <th className="col-w-80-center">
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
                <td colSpan={variant !== 'completed' ? 7 : 5} className="table-state-cell">
                  <div className="table-state-container">
                    <div className="spinner"></div>
                    <p className="text-subtitle">Siparişler yükleniyor...</p>
                  </div>
                </td>
              </tr>
            )}
            
            {/* Error state */}
            {!loading && error && orders.length === 0 && (
              <tr>
                <td colSpan={variant !== 'completed' ? 7 : 5} className="table-state-cell">
                  <div className="table-state-container error">
                    <div className="empty-state-icon">⚠️</div>
                    <h3 className="title-lg">Bağlantı Problemi</h3>
                    <p className="text-sm-muted">
                      {error.includes('timeout') ? 
                        'Sunucuya bağlanılamadı. İnternet bağlantınızı kontrol edin.' : 
                        `Siparişler yüklenirken hata oluştu: ${error}`
                      }
                    </p>
                    <button onClick={() => window.location.reload()} className="btn-reload">
                      Sayfayı Yenile
                    </button>
                  </div>
                </td>
              </tr>
            )}
            
            {/* Data rows */}
            {!loading && !error && visibleOrders && visibleOrders.length > 0 ? visibleOrders.map((order) => {
              const items = order.items || []
              const relevantTotal = order.totalPrice || 0
              
              return (
                <tr
                  key={order.id}
                  className="mes-table-row"
                  onClick={() => onOrderClick && onOrderClick(order)}
                >
                  <td className="text-center" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selectedOrderIds?.has?.(order.id) || false}
                      onChange={(e) => onToggleSelectOrder && onToggleSelectOrder(order.id, e.target.checked)}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </td>
                  <td className="col-w-120-nowrap-only">
                    <span className="mes-code-text">{order.orderCode || order.id}</span>
                  </td>
                  <td className="col-min-160">
                    <span className="mes-code-text">{order.supplierCode || order.supplierId || ''}</span>
                    {(order.supplierCode || order.supplierId) && (order.supplierName) ? ' / ' : ''}
                    {order.supplierName || ''}
                  </td>
                  {variant !== 'completed' && (
                    <td className="td-delivery">
                      <div className="delivery-info">
                        {(() => {
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
                          }

                          return (
                            <span 
                              className="delivery-status-badge-sm"
                              style={{
                                backgroundColor: getDeliveryStatusColor(status).bg,
                                color: getDeliveryStatusColor(status).text
                              }}
                            >
                              {getDeliveryStatusText(status, daysRemaining)}
                            </span>
                          )
                        })()}
                      </div>
                    </td>
                  )}
                  <td className="no-ellipsis td-py-4">
                    {items.length > 0 ? renderLineChips(items) : (
                      <span className="empty-state-text">Sipariş satırı yok</span>
                    )}
                  </td>
                  <td className="td-total">
                    {formatCurrency(relevantTotal || order.totalAmount)}
                  </td>
                  {variant !== 'completed' && (
                    <td className="td-status">
                      {onUpdateOrderStatus ? (
                        <select
                          value={order.orderStatus}
                          disabled={actionLoading}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => {
                            if (e.target.value && e.target.value !== order.orderStatus) {
                              onUpdateOrderStatus(order.id, e.target.value)
                            }
                          }}
                          className="order-status-dropdown"
                          style={{ background: getStatusColor(order.orderStatus) }}
                        >
                          {['Onay Bekliyor', 'Onaylandı', 'Yolda', 'İptal Edildi'].map(status => (
                            <option key={status} value={status}>{status}</option>
                          ))}
                        </select>
                      ) : (
                        <span
                          className="order-status-span"
                          style={{ backgroundColor: getStatusColor(order.orderStatus) }}
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
                <td colSpan={variant !== 'completed' ? 7 : 5} className="p-0 border-none">
                  <EmptyState variant={variant} hasNoOrdersAtAll={false} />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}
