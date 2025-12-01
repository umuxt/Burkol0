import React from 'react';
import { ArrowLeft } from '../../../../shared/components/Icons.jsx';

// Delivery status color helper
function getDeliveryStatusColor(status) {
  switch (status) {
    case 'bugün-teslim': return { bg: '#fef3c7', text: '#92400e' };
    case 'bu-hafta-teslim': return { bg: '#dbeafe', text: '#1e40af' };
    case 'gecikmiş': return { bg: '#fee2e2', text: '#991b1b' };
    case 'zamanında': return { bg: '#dcfce7', text: '#166534' };
    case 'erken': return { bg: '#f0fdf4', text: '#15803d' };
    case 'teslim-edildi': return { bg: '#e0e7ff', text: '#3730a3' };
    default: return { bg: '#f3f4f6', text: '#6b7280' };
  }
}

// Delivery status text helper
function getDeliveryStatusText(status, daysRemaining = 0) {
  switch (status) {
    case 'bugün-teslim': return 'Bugün Teslim';
    case 'bu-hafta-teslim': return `${daysRemaining} gün kaldı`;
    case 'gecikmiş': return `${Math.abs(daysRemaining)} gün gecikti`;
    case 'zamanında': return 'Zamanında';
    case 'erken': return 'Erken teslim';
    case 'teslim-edildi': return 'Teslim edildi';
    default: return 'Teslimat tarihi belirsiz';
  }
}

// Order status options (Teslim Edildi excluded for lot tracking)
const ORDER_STATUS_OPTIONS = ['Onay Bekliyor', 'Onaylandı', 'Yolda', 'İptal Edildi'];
// Item status options (Teslim Edildi triggers lot tracking modal)
const ITEM_STATUS_OPTIONS = ['Onay Bekliyor', 'Onaylandı', 'Yolda', 'Teslim Edildi', 'İptal Edildi'];

/**
 * OrderDetailsPanel - Sipariş detay paneli componenti
 * 
 * @param {Object} order - Seçili sipariş
 * @param {boolean} loading - Yükleme durumu
 * @param {string|null} error - Hata mesajı
 * @param {boolean} actionLoading - İşlem yükleme durumu
 * @param {Array} updatingItemIds - Güncellenen item id'leri
 * @param {Object} itemStatusUpdates - Optimistic item status updates
 * @param {Function} onClose - Panel kapatma callback
 * @param {Function} onUpdateOrderStatus - Sipariş durumu güncelleme callback
 * @param {Function} onItemStatusChange - Satır durumu değişiklik callback
 */
export default function OrderDetailsPanel({
  order,
  loading = false,
  error = null,
  actionLoading = false,
  updatingItemIds = [],
  itemStatusUpdates = {},
  onClose,
  onUpdateOrderStatus,
  onItemStatusChange
}) {
  if (!order) return null;

  // Calculate delivery status
  const calculateDeliveryStatus = () => {
    const today = new Date();
    const deliveryDate = order.expectedDeliveryDate ? new Date(order.expectedDeliveryDate) : null;
    let status = 'hesaplanıyor';
    let daysRemaining = 0;
    
    if (deliveryDate && !isNaN(deliveryDate.getTime())) {
      const timeDiff = deliveryDate.getTime() - today.getTime();
      daysRemaining = Math.ceil(timeDiff / (1000 * 3600 * 24));
      
      if (order.orderStatus === 'Teslim Edildi') status = 'teslim-edildi';
      else if (daysRemaining < 0) status = 'gecikmiş';
      else if (daysRemaining === 0) status = 'bugün-teslim';
      else if (daysRemaining <= 7) status = 'bu-hafta-teslim';
      else status = 'zamanında';
    }
    
    return { status, daysRemaining };
  };

  const { status: deliveryStatus, daysRemaining } = calculateDeliveryStatus();

  return (
    <div className="order-detail-panel">
      <div className="order-detail-card">
        {/* Header */}
        <div className="order-detail-header">
          <div className="flex-center-gap-12">
            <button
              onClick={onClose}
              className="btn-back-sm"
              title="Detayları Kapat"
            >
              <ArrowLeft size={14} />
            </button>
            <h3 className="supplier-section-title-lg">
              Sipariş Detayı
            </h3>
          </div>
        </div>

        {/* Content - Scrollable */}
        <div className="order-detail-content panel-content">
          
          {/* Sipariş Bilgileri */}
          <div className="order-info-section">
            <div className="order-info-grid-header">
              <div>
                <div className="form-label-muted">SİPARİŞ KODU</div>
                <div className="text-title-dark">
                  {order.orderCode || order.id}
                </div>
              </div>
              <div>
                <div className="form-label-muted">TEDARİKÇİ</div>
                <div className="text-title-dark">
                  {order.supplierName}
                </div>
              </div>
              <select
                value={order.orderStatus || 'Onay Bekliyor'}
                disabled={loading || actionLoading}
                onChange={(e) => onUpdateOrderStatus?.(order.id, e.target.value)}
                className="order-status-select-sm"
              >
                {ORDER_STATUS_OPTIONS.map(status => (
                  <option key={status} value={status}>{status}</option>
                ))}
              </select>
            </div>
            
            <div className="order-info-grid-3">
              <div>
                <div className="form-label-muted">Oluşturulma</div>
                <div className="text-dark-medium">
                  {order.orderDate ? (new Date(order.orderDate)).toLocaleDateString('tr-TR') : '-'}
                </div>
              </div>
              <div>
                <div className="form-label-muted">Tahmini Teslim</div>
                <div className="text-dark-medium">
                  {order.expectedDeliveryDate ? (new Date(order.expectedDeliveryDate)).toLocaleDateString('tr-TR') : '-'}
                </div>
              </div>
              <div>
                <div className="form-label-muted">Toplam Tutar</div>
                <div className="text-title-dark">
                  {new Intl.NumberFormat('tr-TR', { style: 'currency', currency: order.currency || 'TRY' }).format(order.totalAmount || 0)}
                </div>
              </div>
            </div>
          </div>

          {/* Teslimat & Not */}
          <div className="order-info-grid-2">
            <div className="order-info-section">
              <div className="form-label-uppercase">Teslimat Durumu</div>
              <span 
                className="delivery-status-badge"
                style={{
                  backgroundColor: getDeliveryStatusColor(deliveryStatus).bg,
                  color: getDeliveryStatusColor(deliveryStatus).text
                }}
              >
                {getDeliveryStatusText(deliveryStatus, daysRemaining)}
              </span>
            </div>
            
            <div className="order-info-section">
              <div className="form-label-uppercase">Not / Referans</div>
              <div className="text-note-content">
                {order.notes || '-'}
              </div>
            </div>
          </div>

          {/* Tedarikçi Bilgileri */}
          <div className="order-info-section">
            <div className="supplier-header-flex">
              <div className="section-label-uppercase">Tedarikçi Bilgileri</div>
              <button
                type="button"
                onClick={() => {
                  try { localStorage.setItem('bk_active_tab', 'suppliers'); } catch {}
                  const supplierId = order.supplierId || order.supplierCode || '';
                  const url = `materials.html#suppliers-tab&supplier-${encodeURIComponent(supplierId)}`;
                  window.open(url, '_blank');
                }}
                className="btn-detail-link"
              >
                Detaya Git ↗
              </button>
            </div>
            <div className="supplier-info-row">
              <div className="flex-center-gap-8">
                <span className="text-muted-medium">Tedarikçi Kodu:</span>
                <span className="text-dark-bold">
                  {order.supplierId ? `T-${String(order.supplierId).padStart(4, '0')}` : '-'}
                </span>
              </div>
              <div className="flex-center-gap-8">
                <span className="text-muted-medium">Tedarikçi Adı:</span>
                <span className="text-dark-bold">{order.supplierName || '-'}</span>
              </div>
            </div>
          </div>

          {/* Sipariş Satırları */}
          <div className="order-info-section">
            <div className="section-label-uppercase-mb">
              Sipariş Satırları ({order.items?.length || order.item_count || 0})
            </div>
            
            {loading ? (
              <p className="text-loading-gray">Satırlar yükleniyor...</p>
            ) : error ? (
              <p className="text-error-red">Satırlar yüklenemedi: {error}</p>
            ) : (order.items && order.items.length > 0) ? (
              <div className="table-container table-overflow-auto">
                <table className="table-full-collapse">
                  <thead>
                    <tr>
                      <th className="supplier-th-bg">Satır Kodu</th>
                      <th className="supplier-th-bg">Malzeme Kodu</th>
                      <th className="supplier-th-bg">Malzeme Adı</th>
                      <th className="supplier-th-bg">Miktar</th>
                      <th className="supplier-th-bg">Durum</th>
                      <th className="th-action-header">İşlemler</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...(order.items || [])]
                      .sort((a, b) => (a.itemSequence || 0) - (b.itemSequence || 0))
                      .map((item, index) => {
                        const itemId = item.id || item.itemCode || item.lineId || `item-${item.materialCode || 'unknown'}`;
                        const isItemUpdating = updatingItemIds.includes(itemId);
                        const itemKey = `${order.id}-${item.id || item.itemCode || item.lineId || `item-${item.materialCode || 'unknown'}`}`;
                        const currentStatus = itemStatusUpdates[itemKey] || item.itemStatus || 'Onay Bekliyor';
                        
                        return (
                          <tr key={itemId} className="order-table-row">
                            <td className="supplier-td-row">
                              {item.itemCode || item.lineId || `item-${String(index + 1).padStart(2, '0')}`}
                            </td>
                            <td className="supplier-td-row">
                              {item.materialCode || '—'}
                            </td>
                            <td className="supplier-td-row">
                              {item.materialName || '-'}
                            </td>
                            <td className="supplier-td-row">
                              {(() => {
                                const qty = parseFloat(item.quantity) || 0;
                                return Number.isInteger(qty) ? qty : qty.toFixed(2).replace(/\.?0+$/, '');
                              })()} {item.unit || 'adet'}
                            </td>
                            <td className="supplier-td-row">
                              <span className="item-status-badge">
                                {currentStatus}
                              </span>
                            </td>
                            <td className="td-action-cell">
                              <select
                                value={currentStatus}
                                disabled={isItemUpdating}
                                onChange={(e) => {
                                  onItemStatusChange?.(order.id, item, e.target.value);
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
                        );
                      })}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-muted-italic-only">Bu sipariş için kayıtlı kalem bulunamadı.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
