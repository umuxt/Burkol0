import React from 'react';
import { Package } from 'lucide-react';
import { SHIPMENT_STATUS_LABELS, SHIPMENT_STATUS_COLORS } from '../../services/shipments-service.js';

/**
 * ShipmentsTable - Sevkiyat tablosu componenti
 * 
 * @param {Array} shipments - Gösterilecek sevkiyat listesi
 * @param {boolean} loading - Yükleme durumu
 * @param {string|null} error - Hata mesajı
 * @param {Object|null} selectedShipment - Seçili sevkiyat
 * @param {Function} onSelectShipment - Sevkiyat seçildiğinde çağrılacak callback
 * @param {string} emptyMessage - Boş liste mesajı
 */
export default function ShipmentsTable({
  shipments = [],
  loading = false,
  error = null,
  selectedShipment = null,
  onSelectShipment,
  emptyMessage = 'Henüz hiç sevkiyat kaydı yok.'
}) {
  
  const formatDate = (dateString) => {
    if (!dateString) return '-';
    try {
      return new Date(dateString).toLocaleString('tr-TR');
    } catch (e) {
      return dateString;
    }
  };

  return (
    <div className="table-container">
      <table>
        <thead>
          <tr>
            <th style={{ minWidth: '120px', textAlign: 'left' }}>Sevkiyat Kodu</th>
            <th style={{ width: '70px', textAlign: 'center' }}>Kalem Adedi</th>
            <th style={{ minWidth: '280px', textAlign: 'left' }}>Sevkiyat Kalemleri</th>
            <th className="col-min-140-left">Müşteri/İş Emri</th>
            <th className="col-min-140-left">Tarih</th>
            <th style={{ width: '120px', textAlign: 'left' }}>Durum</th>
          </tr>
        </thead>
        <tbody>
          {/* Loading State */}
          {loading && (
            <tr>
              <td colSpan="6" style={{ padding: '40px 20px', textAlign: 'center' }}>
                <div className="loading-spinner" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
                  <div className="spinner"></div>
                  <span className="text-muted">Yükleniyor...</span>
                </div>
              </td>
            </tr>
          )}

          {/* Empty State */}
          {!loading && !error && shipments.length === 0 && (
            <tr>
              <td colSpan="6" style={{ padding: '40px 20px', textAlign: 'center', color: '#6b7280' }}>
                {emptyMessage}
              </td>
            </tr>
          )}

          {/* Error State */}
          {!loading && error && (
            <tr>
              <td colSpan="6" style={{ padding: '40px 20px', textAlign: 'center', color: '#dc2626' }}>
                {error}
              </td>
            </tr>
          )}

          {/* Data Rows */}
          {!loading && shipments.map(shipment => (
            <tr 
              key={shipment.id} 
              className={`mes-table-row ${selectedShipment?.id === shipment.id ? 'selected' : ''}`}
              onClick={() => onSelectShipment?.(shipment)}
              style={{ cursor: 'pointer' }}
            >
              {/* Sevkiyat Kodu */}
              <td>
                <span className="mes-code-text">
                  {shipment.shipmentCode || `SHP-${shipment.id}`}
                </span>
              </td>

              {/* Kalem Adedi */}
              <td className="text-center">
                <span style={{ 
                  display: 'inline-flex', 
                  alignItems: 'center', 
                  gap: '4px',
                  padding: '2px 8px',
                  backgroundColor: 'var(--muted-bg, #f3f4f6)',
                  borderRadius: '4px',
                  fontSize: '12px',
                  fontWeight: '500'
                }}>
                  <Package size={12} />
                  {shipment.itemCount || shipment.items?.length || 1}
                </span>
              </td>

              {/* Sevkiyat Kalemleri */}
              <td>
                <div className="line-chips-container" style={{ flexWrap: 'wrap', gap: '4px' }}>
                  {(shipment.items || []).slice(0, 3).map((item, idx) => {
                    const itemSeq = item.itemCode ? item.itemCode.split('-').pop() : String(idx + 1).padStart(2, '0');
                    return (
                      <div 
                        key={item.id || idx}
                        className="line-chip"
                      >
                        <span className="line-chip-code">
                          {itemSeq}
                        </span>
                        <span className="text-border">|</span>
                        <span className="line-chip-material">
                          {item.materialCode || item.productCode || '-'}
                        </span>
                        <span className="text-border">|</span>
                        <span className="line-chip-qty">
                          {(() => {
                            const qty = parseFloat(item.quantity) || 0;
                            return Number.isInteger(qty) ? qty : qty.toFixed(2).replace(/\.?0+$/, '');
                          })()} {item.unit || 'adet'}
                        </span>
                      </div>
                    );
                  })}
                  {(shipment.items || []).length > 3 && (
                    <span style={{ 
                      fontSize: '10px', 
                      color: '#6b7280',
                      padding: '2px 6px',
                      background: '#f1f5f9',
                      borderRadius: '4px'
                    }}>
                      +{(shipment.items || []).length - 3} daha
                    </span>
                  )}
                  {(!shipment.items || shipment.items.length === 0) && (
                    <span style={{ color: '#9ca3af', fontSize: '11px' }}>-</span>
                  )}
                </div>
              </td>

              {/* Müşteri/İş Emri */}
              <td>
                {shipment.customerName || shipment.customerCompany ? (
                  <div className="flex-col">
                    <span className="font-medium">{shipment.customerName || shipment.customerCompany}</span>
                    {shipment.workOrderCode && (
                      <span className="text-muted-sm">
                        İş Emri: {shipment.workOrderCode}
                      </span>
                    )}
                  </div>
                ) : shipment.workOrderCode ? (
                  <div className="flex-col">
                    <span className="text-muted-sm">İş Emri</span>
                    <span>{shipment.workOrderCode}</span>
                  </div>
                ) : shipment.quoteId ? (
                  <div className="flex-col">
                    <span className="text-muted-sm">Teklif</span>
                    <span>#{shipment.quoteId}</span>
                  </div>
                ) : (
                  <span style={{ color: '#9ca3af' }}>-</span>
                )}
              </td>

              {/* Tarih */}
              <td style={{ fontSize: '13px', color: '#4b5563' }}>
                {formatDate(shipment.createdAt)}
              </td>

              {/* Durum */}
              <td>
                <span className="mes-tag" style={{ 
                  backgroundColor: `${SHIPMENT_STATUS_COLORS[shipment.status]}20`,
                  color: SHIPMENT_STATUS_COLORS[shipment.status],
                  border: `1px solid ${SHIPMENT_STATUS_COLORS[shipment.status]}40`
                }}>
                  {SHIPMENT_STATUS_LABELS[shipment.status] || shipment.status}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
