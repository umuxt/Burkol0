import React from 'react';
import { Package, Upload, Download, CheckCircle2 } from 'lucide-react';
import { SHIPMENT_STATUS_LABELS, SHIPMENT_STATUS_COLORS } from '../../services/shipments-service.js';

/**
 * ShipmentsTable - Sevkiyat tablosu componenti
 * 
 * 6.4 Tasarımına göre güncellendi:
 * Kolonlar: Kod | Müşteri | Tarih | Sevkiyat Kalemleri | Tutar | Durum
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
      return new Date(dateString).toLocaleDateString('tr-TR', {
        day: '2-digit',
        month: '2-digit',
        year: '2-digit',
        timeZone: 'Europe/Istanbul'
      });
    } catch (e) {
      return dateString;
    }
  };

  const formatCurrency = (amount, currency = 'TRY') => {
    if (!amount && amount !== 0) return '-';
    const num = parseFloat(amount);
    if (isNaN(num)) return '-';
    
    return new Intl.NumberFormat('tr-TR', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 2
    }).format(num);
  };

  // Status icon helper - shows export/import status
  const getStatusIcon = (shipment) => {
    const icons = [];
    
    if (shipment.lastExportedAt) {
      icons.push(
        <span key="exported" title={`Export: ${formatDate(shipment.lastExportedAt)}`} className="status-icon is-exported">
          <Upload size={12} />
        </span>
      );
    }
    
    if (shipment.importedAt) {
      icons.push(
        <span key="imported" title={`Import: ${formatDate(shipment.importedAt)}`} className="status-icon is-imported">
          <Download size={12} />
        </span>
      );
    }
    
    if (shipment.status === 'completed') {
      icons.push(
        <span key="completed" title="Tamamlandı" className="status-icon is-completed">
          <CheckCircle2 size={12} />
        </span>
      );
    }
    
    return icons.length > 0 ? icons : null;
  };

  return (
    <div className="table-container">
      <table>
        <thead>
          <tr>
            <th style={{ minWidth: '120px', textAlign: 'left' }}>Kod</th>
            <th style={{ minWidth: '160px', textAlign: 'left' }}>Müşteri</th>
            <th style={{ width: '90px', textAlign: 'left' }}>Tarih</th>
            <th style={{ minWidth: '280px', textAlign: 'left' }}>Sevkiyat Kalemleri</th>
            <th style={{ width: '110px', textAlign: 'right' }}>Tutar</th>
            <th style={{ width: '140px', textAlign: 'left' }}>Durum</th>
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
              {/* Kod */}
              <td>
                <span className="mes-code-text">
                  {shipment.shipmentCode || `SHP-${shipment.id}`}
                </span>
              </td>

              {/* Müşteri */}
              <td>
                {shipment.customerCompany || shipment.customerName ? (
                  <span className="font-medium">
                    {shipment.customerCompany || shipment.customerName}
                  </span>
                ) : (
                  <span style={{ color: '#9ca3af', fontSize: '12px' }}>-</span>
                )}
              </td>

              {/* Tarih */}
              <td style={{ fontSize: '13px', color: '#4b5563' }}>
                {formatDate(shipment.createdAt)}
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
                    <span style={{ color: '#9ca3af', fontSize: '11px' }}>
                      <Package size={12} style={{ display: 'inline', marginRight: '4px' }} />
                      {shipment.itemCount || 1} kalem
                    </span>
                  )}
                </div>
              </td>

              {/* Tutar */}
              <td style={{ textAlign: 'right', fontWeight: '500' }}>
                {shipment.grandTotal > 0 ? (
                  <span style={{ color: '#059669' }}>
                    {formatCurrency(shipment.grandTotal, shipment.currency || 'TRY')}
                  </span>
                ) : shipment.includePrice ? (
                  <span style={{ color: '#9ca3af', fontSize: '12px' }}>₺0</span>
                ) : (
                  <span style={{ color: '#9ca3af', fontSize: '11px' }}>-</span>
                )}
              </td>

              {/* Durum */}
              <td>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span className="mes-tag" style={{ 
                    backgroundColor: `${SHIPMENT_STATUS_COLORS[shipment.status]}20`,
                    color: SHIPMENT_STATUS_COLORS[shipment.status],
                    border: `1px solid ${SHIPMENT_STATUS_COLORS[shipment.status]}40`
                  }}>
                    {SHIPMENT_STATUS_LABELS[shipment.status] || shipment.status}
                  </span>
                  {/* Export/Import status icons */}
                  <div style={{ display: 'flex', gap: '4px' }}>
                    {getStatusIcon(shipment)}
                  </div>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
