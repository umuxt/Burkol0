import React, { useState, useEffect } from 'react'
import { useOrders, useOrderActions, useOrderStats } from '../hooks/useOrders.js'
import { useSuppliers } from '../hooks/useSuppliers.js'
import { useMaterials } from '../hooks/useFirebaseMaterials.js'
import AddOrderModal from './AddOrderModal.jsx'

// Orders dashboard component with real data
function OrdersDashboard({ stats, loading }) {
  if (loading) {
    return (
      <section className="materials-dashboard">
        <div className="card">
          <h3>Yükleniyor...</h3>
          <p>...</p>
        </div>
      </section>
    )
  }

  return (
    <section className="materials-dashboard">
      <div className="card">
        <h3>Açık Siparişler</h3>
        <p>{stats.pendingOrders}</p>
      </div>
      <div className="card">
        <h3>Bu Ay Teslim</h3>
        <p>{stats.thisMonthOrders}</p>
      </div>
      <div className="card">
        <h3>Kısmi Teslimat</h3>
        <p className="warning">{stats.partialOrders}</p>
      </div>
    </section>
  )
}

// Orders filters component
function OrdersFilters({ 
  filters, 
  onFilterChange, 
  isExpanded, 
  onToggleExpanded, 
  resultsCount, 
  hasActiveFilters 
}) {
  const toggleExpanded = () => {
    onToggleExpanded(!isExpanded)
  }

  return (
    <section className="materials-filters">
      <div style={{ 
        display: 'flex', 
        alignItems: 'flex-start', 
        gap: '8px',
        width: '100%'
      }}>
        {/* Sol taraf - Genişletme butonu */}
        <div style={{
          paddingLeft: '4px',
          paddingTop: '20px',
          display: 'flex',
          alignItems: 'center',
          height: '100%',
          order: 1,
          flexDirection: 'column',
          gap: '4px'
        }}>
          <button
            onClick={toggleExpanded}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '16px',
              cursor: 'pointer',
              padding: '2px',
              borderRadius: '2px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '20px',
              height: '20px'
            }}
            title={isExpanded ? 'Filtreleri gizle' : 'Filtreleri göster'}
          >
            {isExpanded ? '−' : '+'}
          </button>
          
          <div style={{
            fontSize: '10px',
            color: '#6b7280',
            textAlign: 'center',
            lineHeight: '1.2',
            fontWeight: '500'
          }}>
            {resultsCount} sipariş
          </div>
        </div>

        {/* Orta kısım - Ana arama ve butonlar */}
        <div style={{
          flex: 1,
          order: 2
        }}>
          <div className="filters-container">
            <div className="search-section">
              <div className="search-input-container">
                <input 
                  placeholder="Sipariş numarası veya tedarikçiye göre ara..." 
                  className="search-input" 
                  type="text"
                  value={filters.search || ''}
                  onChange={(e) => onFilterChange('search', e.target.value)}
                />
                <span className="search-icon">🔍</span>
              </div>
            </div>

            {/* Genişletilmiş filtreler */}
            {isExpanded && (
              <div className="expanded-filters" style={{
                marginTop: '12px',
                padding: '16px',
                background: '#f8f9fa',
                borderRadius: '6px',
                border: '1px solid #e5e7eb'
              }}>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                  gap: '16px'
                }}>
                  {/* Durum Filtresi */}
                  <div>
                    <label style={{ 
                      display: 'block', 
                      marginBottom: '6px', 
                      fontSize: '12px', 
                      fontWeight: '600',
                      color: '#374151'
                    }}>
                      Sipariş Durumu
                    </label>
                    <select
                      value={filters.orderStatus || 'Tümü'}
                      onChange={(e) => onFilterChange('orderStatus', e.target.value === 'Tümü' ? '' : e.target.value)}
                      style={{
                        width: '100%',
                        padding: '6px 8px',
                        border: '1px solid #d1d5db',
                        borderRadius: '4px',
                        fontSize: '12px'
                      }}
                    >
                      <option value="Tümü">Tümü</option>
                      <option value="Taslak">Taslak</option>
                      <option value="Onay Bekliyor">Onay Bekliyor</option>
                      <option value="Onaylandı">Onaylandı</option>
                      <option value="Kısmi Teslimat">Kısmi Teslimat</option>
                      <option value="Tamamlandı">Tamamlandı</option>
                    </select>
                  </div>

                  {/* Tarih Filtresi */}
                  <div>
                    <label style={{ 
                      display: 'block', 
                      marginBottom: '6px', 
                      fontSize: '12px', 
                      fontWeight: '600',
                      color: '#374151'
                    }}>
                      Sipariş Tarihi
                    </label>
                    <select
                      value={filters.dateRange || 'Tümü'}
                      onChange={(e) => onFilterChange('dateRange', e.target.value === 'Tümü' ? '' : e.target.value)}
                      style={{
                        width: '100%',
                        padding: '6px 8px',
                        border: '1px solid #d1d5db',
                        borderRadius: '4px',
                        fontSize: '12px'
                      }}
                    >
                      <option value="Tümü">Tümü</option>
                      <option value="bugün">Bugün</option>
                      <option value="bu-hafta">Bu Hafta</option>
                      <option value="bu-ay">Bu Ay</option>
                      <option value="son-3-ay">Son 3 Ay</option>
                    </select>
                  </div>
                </div>

                {/* Aktif filtre temizleme */}
                {hasActiveFilters && (
                  <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid #e5e7eb' }}>
                    <button
                      onClick={() => {
                        onFilterChange('search', '');
                        onFilterChange('orderStatus', '');
                        onFilterChange('dateRange', '');
                      }}
                      style={{
                        padding: '4px 8px',
                        fontSize: '11px',
                        background: '#ef4444',
                        color: 'white',
                        border: 'none',
                        borderRadius: '3px',
                        cursor: 'pointer'
                      }}
                    >
                      Filtreleri Temizle
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}

// Orders table component
function OrdersTable({ 
  orders, 
  loading, 
  title,
  onOrderClick,
  onUpdateOrderStatus,
  emptyMessage = "Sipariş bulunamadı"
}) {
  if (loading) {
    return (
      <div className="orders-table-placeholder">
        <p>Siparişler yükleniyor...</p>
      </div>
    )
  }

  if (!orders || orders.length === 0) {
    return (
      <div className="orders-table-placeholder">
        <p>{emptyMessage}</p>
      </div>
    )
  }

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('tr-TR', {
      style: 'currency',
      currency: 'TRY'
    }).format(amount || 0);
  };

  const formatDate = (date) => {
    if (!date) return '-';
    const dateObj = date instanceof Date ? date : new Date(date);
    return dateObj.toLocaleDateString('tr-TR');
  };

  const getStatusColor = (status) => {
    const colors = {
      'Taslak': '#6b7280',
      'Onay Bekliyor': '#f59e0b',
      'Onaylandı': '#3b82f6',
      'Kısmi Teslimat': '#f97316',
      'Tamamlandı': '#10b981',
      'İptal Edildi': '#ef4444'
    };
    return colors[status] || '#6b7280';
  };

  return (
    <div className="materials-table-container">
      {title && (
        <div style={{ 
          marginBottom: '16px', 
          padding: '12px 16px',
          background: '#f8f9fa',
          borderRadius: '6px',
          borderLeft: '4px solid #3b82f6'
        }}>
          <h3 style={{ 
            margin: 0, 
            fontSize: '14px', 
            fontWeight: '600',
            color: '#1f2937'
          }}>
            {title}
          </h3>
        </div>
      )}
      
      <div className="table-wrapper">
        <table className="materials-table">
          <thead>
            <tr>
              <th style={{ minWidth: '120px' }}>Sipariş No</th>
              <th style={{ minWidth: '180px' }}>Tedarikçi</th>
              <th style={{ minWidth: '100px' }}>Sipariş Tarihi</th>
              <th style={{ minWidth: '100px' }}>Toplam Tutar</th>
              <th style={{ minWidth: '120px' }}>Durum</th>
              <th style={{ minWidth: '100px' }}>İşlemler</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => (
              <tr 
                key={order.id}
                onClick={() => onOrderClick && onOrderClick(order)}
                style={{ cursor: onOrderClick ? 'pointer' : 'default' }}
              >
                <td>
                  <span style={{ 
                    fontFamily: 'monospace',
                    fontSize: '12px',
                    fontWeight: '600'
                  }}>
                    {order.id.slice(0, 8)}...
                  </span>
                </td>
                <td>
                  <div>
                    <div style={{ fontWeight: '600', fontSize: '13px' }}>
                      {order.supplierName}
                    </div>
                    <div style={{ fontSize: '11px', color: '#6b7280' }}>
                      {order.supplierId}
                    </div>
                  </div>
                </td>
                <td>{formatDate(order.orderDate)}</td>
                <td style={{ textAlign: 'right', fontWeight: '600' }}>
                  {formatCurrency(order.totalAmount)}
                </td>
                <td>
                  <span style={{
                    display: 'inline-block',
                    padding: '4px 8px',
                    borderRadius: '12px',
                    fontSize: '11px',
                    fontWeight: '600',
                    color: 'white',
                    backgroundColor: getStatusColor(order.orderStatus)
                  }}>
                    {order.orderStatus}
                  </span>
                </td>
                <td>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onOrderClick && onOrderClick(order);
                      }}
                      style={{
                        padding: '4px 8px',
                        fontSize: '11px',
                        background: '#3b82f6',
                        color: 'white',
                        border: 'none',
                        borderRadius: '3px',
                        cursor: 'pointer'
                      }}
                    >
                      Detay
                    </button>
                    {onUpdateOrderStatus && order.orderStatus !== 'Tamamlandı' && order.orderStatus !== 'İptal Edildi' && (
                      <select
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => {
                          if (e.target.value && e.target.value !== order.orderStatus) {
                            onUpdateOrderStatus(order.id, e.target.value);
                          }
                          e.target.value = order.orderStatus; // Reset
                        }}
                        defaultValue=""
                        style={{
                          padding: '4px',
                          fontSize: '10px',
                          border: '1px solid #d1d5db',
                          borderRadius: '3px',
                          cursor: 'pointer'
                        }}
                      >
                        <option value="">Durum Değiştir</option>
                        <option value="Onay Bekliyor">Onay Bekliyor</option>
                        <option value="Onaylandı">Onaylandı</option>
                        <option value="İptal Edildi">İptal Et</option>
                      </select>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default function OrdersTabContent() {
  const [activeOrdersTab, setActiveOrdersTab] = useState('pending') // 'pending' or 'completed'
  const [isAddOrderModalOpen, setIsAddOrderModalOpen] = useState(false)
  const [selectedOrder, setSelectedOrder] = useState(null)
  const [isFiltersExpanded, setIsFiltersExpanded] = useState(false)
  
  // Debug modal state
  useEffect(() => {
    console.log('🔥🔥🔥 OrdersTabContent: Modal state değişti:', isAddOrderModalOpen);
  }, [isAddOrderModalOpen])
  
  // Filter state
  const [filters, setFilters] = useState({
    search: '',
    orderStatus: '',
    dateRange: ''
  })

  // Firebase hooks
  const { stats, loading: statsLoading } = useOrderStats()
  const { updateOrder, loading: actionLoading } = useOrderActions()
  
  // Get pending orders
  const { 
    orders: pendingOrders, 
    loading: pendingLoading, 
    refreshOrders: refreshPendingOrders 
  } = useOrders({
    orderStatus: ['Taslak', 'Onay Bekliyor', 'Onaylandı', 'Kısmi Teslimat']
  }, { autoLoad: true })
  
  // Get completed orders
  const { 
    orders: completedOrders, 
    loading: completedLoading,
    refreshOrders: refreshCompletedOrders 
  } = useOrders({
    orderStatus: 'Tamamlandı'
  }, { autoLoad: true })

  // Filter change handler
  const handleFilterChange = (key, value) => {
    console.log('🔍 Order Filter değişti:', key, '=', value);
    setFilters(prev => ({ ...prev, [key]: value }));
  }

  // Check if filters are active
  const hasActiveFilters = () => {
    return !!(filters.search || filters.orderStatus || filters.dateRange);
  }

  // Apply filters to orders
  const applyFilters = (orders) => {
    if (!orders) return [];

    return orders.filter(order => {
      // Search filter
      if (filters.search) {
        const searchLower = filters.search.toLowerCase();
        const matches = 
          order.id.toLowerCase().includes(searchLower) ||
          order.supplierName?.toLowerCase().includes(searchLower) ||
          order.supplierId?.toLowerCase().includes(searchLower);
        
        if (!matches) return false;
      }

      // Status filter
      if (filters.orderStatus && order.orderStatus !== filters.orderStatus) {
        return false;
      }

      // Date range filter
      if (filters.dateRange && order.orderDate) {
        const orderDate = order.orderDate instanceof Date ? order.orderDate : new Date(order.orderDate);
        const now = new Date();
        
        switch (filters.dateRange) {
          case 'bugün':
            if (orderDate.toDateString() !== now.toDateString()) return false;
            break;
          case 'bu-hafta':
            const weekStart = new Date(now.setDate(now.getDate() - now.getDay()));
            if (orderDate < weekStart) return false;
            break;
          case 'bu-ay':
            if (orderDate.getMonth() !== now.getMonth() || orderDate.getFullYear() !== now.getFullYear()) return false;
            break;
          case 'son-3-ay':
            const threeMonthsAgo = new Date();
            threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
            if (orderDate < threeMonthsAgo) return false;
            break;
        }
      }

      return true;
    });
  }

  // Get filtered orders
  const filteredPendingOrders = applyFilters(pendingOrders);
  const filteredCompletedOrders = applyFilters(completedOrders);

  // Current orders based on active tab
  const currentOrders = activeOrdersTab === 'pending' ? filteredPendingOrders : filteredCompletedOrders;
  const currentLoading = activeOrdersTab === 'pending' ? pendingLoading : completedLoading;

  // Handle order click
  const handleOrderClick = (order) => {
    setSelectedOrder(order);
    console.log('📋 Sipariş detayı açılıyor:', order);
    // TODO: Open order detail modal
  }

  // Handle order status update
  const handleUpdateOrderStatus = async (orderId, newStatus) => {
    try {
      await updateOrder(orderId, { orderStatus: newStatus });
      
      // Refresh both order lists
      refreshPendingOrders();
      refreshCompletedOrders();
      
      console.log(`✅ Order ${orderId} status updated to ${newStatus}`);
    } catch (error) {
      console.error('❌ Error updating order status:', error);
    }
  }

  return (
    <div className="stocks-tab-content">
      <div className="materials-header-section">
        {!isFiltersExpanded && (
          <>
            <div className="materials-dashboard-container">
              <OrdersDashboard stats={stats} loading={statsLoading} />
            </div>
            <div className="materials-actions-container">
              <div className="materials-actions">
                <button 
                  type="button" 
                  className="add-material-btn"
                  onClick={() => {
                    console.log('🔥🔥🔥 Yeni Sipariş butonu tıklandı!');
                    setIsAddOrderModalOpen(true);
                    console.log('🔥🔥🔥 Modal açılması için state güncellendi!');
                  }}
                  disabled={actionLoading}
                >
                  + Yeni Sipariş
                </button>
              </div>
            </div>
          </>
        )}
        <div className="materials-filters-container">
          <OrdersFilters 
            filters={filters}
            onFilterChange={handleFilterChange}
            isExpanded={isFiltersExpanded}
            onToggleExpanded={setIsFiltersExpanded}
            resultsCount={currentOrders.length}
            hasActiveFilters={hasActiveFilters()}
          />
        </div>
      </div>

      {/* Orders Tabs */}
      <div className="orders-tabs" style={{ 
        marginBottom: '16px',
        display: 'flex',
        borderBottom: '2px solid #e5e7eb'
      }}>
        <button
          onClick={() => setActiveOrdersTab('pending')}
          style={{
            padding: '12px 24px',
            border: 'none',
            background: 'none',
            fontSize: '14px',
            fontWeight: '600',
            cursor: 'pointer',
            borderBottom: activeOrdersTab === 'pending' ? '2px solid #3b82f6' : '2px solid transparent',
            color: activeOrdersTab === 'pending' ? '#3b82f6' : '#6b7280'
          }}
        >
          Bekleyen Siparişler ({filteredPendingOrders.length})
        </button>
        <button
          onClick={() => setActiveOrdersTab('completed')}
          style={{
            padding: '12px 24px',
            border: 'none',
            background: 'none',
            fontSize: '14px',
            fontWeight: '600',
            cursor: 'pointer',
            borderBottom: activeOrdersTab === 'completed' ? '2px solid #10b981' : '2px solid transparent',
            color: activeOrdersTab === 'completed' ? '#10b981' : '#6b7280'
          }}
        >
          Tamamlanan Siparişler ({filteredCompletedOrders.length})
        </button>
      </div>

      {/* Orders Table */}
      <OrdersTable 
        orders={currentOrders}
        loading={currentLoading}
        title={activeOrdersTab === 'pending' ? 'Bekleyen Siparişler' : 'Tamamlanan Siparişler'}
        onOrderClick={handleOrderClick}
        onUpdateOrderStatus={activeOrdersTab === 'pending' ? handleUpdateOrderStatus : null}
        emptyMessage={
          activeOrdersTab === 'pending' 
            ? "Bekleyen sipariş bulunamadı" 
            : "Tamamlanan sipariş bulunamadı"
        }
      />

      {/* Add Order Modal */}
      <AddOrderModal 
        isOpen={isAddOrderModalOpen}
        onClose={() => setIsAddOrderModalOpen(false)}
        onSave={(newOrder) => {
          console.log('✅ New order created:', newOrder);
          // Refresh both order lists
          refreshPendingOrders();
          refreshCompletedOrders();
        }}
      />

      {/* TODO: Order Detail Modal */}
      {selectedOrder && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{
            background: 'white',
            padding: '24px',
            borderRadius: '8px',
            maxWidth: '800px',
            width: '90%',
            maxHeight: '80vh',
            overflow: 'auto'
          }}>
            <h3>Sipariş Detayı</h3>
            <p><strong>Sipariş No:</strong> {selectedOrder.id}</p>
            <p><strong>Tedarikçi:</strong> {selectedOrder.supplierName}</p>
            <p><strong>Durum:</strong> {selectedOrder.orderStatus}</p>
            <p><strong>Toplam:</strong> {new Intl.NumberFormat('tr-TR', {
              style: 'currency',
              currency: 'TRY'
            }).format(selectedOrder.totalAmount || 0)}</p>
            <button onClick={() => setSelectedOrder(null)}>Kapat</button>
          </div>
        </div>
      )}
    </div>
  )
}