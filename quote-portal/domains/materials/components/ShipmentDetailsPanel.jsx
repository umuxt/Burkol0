import React, { useState, useEffect, useMemo } from 'react'
import { ArrowLeft, Truck, Info, Calendar } from '../../../shared/components/Icons.jsx'
import { shipmentsService, SHIPMENT_STATUS_LABELS, SHIPMENT_STATUS_COLORS } from '../services/shipments-service.js'

export default function ShipmentDetailsPanel({
  shipment,
  onClose,
  onUpdateStatus,
  onCancel,
  loading = false
}) {
  const [currentShipment, setCurrentShipment] = useState(shipment);
  const [isUpdating, setIsUpdating] = useState(false);
  const [statusNote, setStatusNote] = useState('');

  useEffect(() => {
    setCurrentShipment(shipment);
  }, [shipment]);

  if (!currentShipment) return null;

  const formatDate = (dateString) => {
    if (!dateString) return '-';
    try {
      return new Date(dateString).toLocaleString('tr-TR');
    } catch (e) {
      return dateString;
    }
  };

  const handleStatusChange = async (newStatus) => {
    if (!onUpdateStatus) return;
    
    if (newStatus === 'cancelled' && !confirm('Bu sevkiyatı iptal etmek istediğinize emin misiniz? Bu işlem geri alınamaz.')) {
      return;
    }

    setIsUpdating(true);
    try {
      await onUpdateStatus(currentShipment.id, newStatus); // statusNote is not used in updateShipmentStatus currently
      // Update local state optimistically or wait for parent refresh
    } catch (error) {
      console.error('Status update failed:', error);
      alert('Durum güncellenirken bir hata oluştu.');
    } finally {
      setIsUpdating(false);
      setStatusNote('');
    }
  };

  const handleCancelShipment = async () => {
    if (!onCancel) return;
    
    if (!confirm('Bu sevkiyatı iptal etmek istediğinize emin misiniz? Bu işlem geri alınamaz.')) {
      return;
    }

    setIsUpdating(true);
    try {
      await onCancel(currentShipment.id, statusNote); // Pass statusNote as reason
    } catch (error) {
      console.error('Cancel shipment failed:', error);
      alert('İptal işlemi sırasında bir hata oluştu.');
    } finally {
      setIsUpdating(false);
      setStatusNote('');
    }
  };


  // Status flow logic
  const renderStatusActions = () => {
    const { status } = currentShipment;
    
    if (status === 'cancelled' || status === 'delivered') {
      return null; // No actions for terminal states
    }

    return (
      <div style={{ 
        marginBottom: '16px', 
        padding: '12px', 
        background: 'white', 
        borderRadius: '6px',
        border: '1px solid rgb(229, 231, 235)'
      }}>
        <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: '600', color: 'rgb(17, 24, 39)', borderBottom: '1px solid rgb(229, 231, 235)', paddingBottom: '6px' }}>
          Durum Güncelle
        </h3>
        
        <div style={{ marginBottom: '12px' }}>
          <input
            type="text"
            placeholder="Durum notu (opsiyonel)"
            value={statusNote}
            onChange={(e) => setStatusNote(e.target.value)}
            style={{
              width: '100%',
              padding: '8px',
              borderRadius: '4px',
              border: '1px solid #d1d5db',
              fontSize: '13px'
            }}
          />
        </div>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {status === 'pending' && (
            <button
              onClick={() => handleStatusChange('shipped')}
              disabled={isUpdating}
              style={{
                padding: '8px 12px',
                borderRadius: '4px',
                border: 'none',
                background: '#3b82f6',
                color: 'white',
                fontSize: '12px',
                fontWeight: '500',
                cursor: isUpdating ? 'not-allowed' : 'pointer',
                opacity: isUpdating ? 0.7 : 1
              }}
            >
              {isUpdating ? 'Güncelleniyor...' : 'Yola Çıkar'}
            </button>
          )}
          
          {status === 'shipped' && (
            <button
              onClick={() => handleStatusChange('delivered')}
              disabled={isUpdating}
              style={{
                padding: '8px 12px',
                borderRadius: '4px',
                border: 'none',
                background: '#22c55e',
                color: 'white',
                fontSize: '12px',
                fontWeight: '500',
                cursor: isUpdating ? 'not-allowed' : 'pointer',
                opacity: isUpdating ? 0.7 : 1
              }}
            >
              {isUpdating ? 'Güncelleniyor...' : 'Teslim Edildi'}
            </button>
          )}
          
          <button
            onClick={handleCancelShipment}
            disabled={isUpdating}
            style={{
              padding: '8px 12px',
              borderRadius: '4px',
              border: '1px solid #ef4444',
              background: 'white',
              color: '#ef4444',
              fontSize: '12px',
              fontWeight: '500',
              cursor: isUpdating ? 'not-allowed' : 'pointer',
              opacity: isUpdating ? 0.7 : 1,
              marginLeft: 'auto'
            }}
          >
            İptal Et
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="material-detail-panel">
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
              onClick={onClose}
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
              Sevkiyat Detayı
            </h3>
          </div>
          

        </div>

        {/* Content - Scrollable */}
        <div style={{ flex: 1, overflow: 'auto', padding: '20px' }}>
          
          {/* Sevkiyat Bilgileri */}
          <div style={{ 
            marginBottom: '16px', 
            padding: '12px', 
            background: 'white', 
            borderRadius: '6px',
            border: '1px solid rgb(229, 231, 235)'
          }}>
            <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: '600', color: 'rgb(17, 24, 39)', borderBottom: '1px solid rgb(229, 231, 235)', paddingBottom: '6px' }}>
              Sevkiyat Bilgileri
            </h3>
            
            <div className="detail-item" style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                <span className="detail-label" style={{ fontWeight: '600', fontSize: '12px', color: 'rgb(55, 65, 81)', minWidth: '120px', marginRight: '8px' }}>
                  Malzeme Kodu:
                </span>
                <span style={{ fontSize: '12px', color: 'rgb(17, 24, 39)' }}>{currentShipment.productCode}</span>
            </div>
            
            <div className="detail-item" style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                <span className="detail-label" style={{ fontWeight: '600', fontSize: '12px', color: 'rgb(55, 65, 81)', minWidth: '120px', marginRight: '8px' }}>
                  Miktar:
                </span>
                <span style={{ fontSize: '12px', color: 'rgb(17, 24, 39)' }}>{currentShipment.shipmentQuantity}</span>
            </div>

            <div className="detail-item" style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                <span className="detail-label" style={{ fontWeight: '600', fontSize: '12px', color: 'rgb(55, 65, 81)', minWidth: '120px', marginRight: '8px' }}>
                  Oluşturma Tarihi:
                </span>
                <span style={{ fontSize: '12px', color: 'rgb(17, 24, 39)' }}>{formatDate(currentShipment.createdAt)}</span>
            </div>

            <div className="detail-item" style={{ display: 'flex', alignItems: 'center', marginBottom: '0px' }}>
                <span className="detail-label" style={{ fontWeight: '600', fontSize: '12px', color: 'rgb(55, 65, 81)', minWidth: '120px', marginRight: '8px' }}>
                  Son Güncelleme:
                </span>
                <span style={{ fontSize: '12px', color: 'rgb(17, 24, 39)' }}>{formatDate(currentShipment.updatedAt)}</span>
            </div>
          </div>

          {/* Kaynak & Referans */}
          <div style={{ 
            marginBottom: '16px', 
            padding: '12px', 
            background: 'white', 
            borderRadius: '6px',
            border: '1px solid rgb(229, 231, 235)'
          }}>
            <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: '600', color: 'rgb(17, 24, 39)', borderBottom: '1px solid rgb(229, 231, 235)', paddingBottom: '6px' }}>
              Kaynak & Referans
            </h3>
            
            {currentShipment.workOrderCode ? (
              <div className="detail-item" style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                <span className="detail-label" style={{ fontWeight: '600', fontSize: '12px', color: 'rgb(55, 65, 81)', minWidth: '120px', marginRight: '8px' }}>
                  İş Emri Kodu:
                </span>
                <span style={{ fontSize: '12px', color: 'rgb(17, 24, 39)' }}>{currentShipment.workOrderCode}</span>
              </div>
            ) : currentShipment.quoteId ? (
              <div className="detail-item" style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                <span className="detail-label" style={{ fontWeight: '600', fontSize: '12px', color: 'rgb(55, 65, 81)', minWidth: '120px', marginRight: '8px' }}>
                  Teklif ID:
                </span>
                <span style={{ fontSize: '12px', color: 'rgb(17, 24, 39)' }}>#{currentShipment.quoteId}</span>
              </div>
            ) : (
              <div style={{ fontSize: '12px', color: '#6b7280', fontStyle: 'italic', padding: '4px' }}>
                Herhangi bir iş emri veya teklif ile ilişkilendirilmemiş.
              </div>
            )}
          </div>

          {/* Açıklama / Not */}
          <div style={{ 
            marginBottom: '16px', 
            padding: '12px', 
            background: 'white', 
            borderRadius: '6px',
            border: '1px solid rgb(229, 231, 235)'
          }}>
            <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: '600', color: 'rgb(17, 24, 39)', borderBottom: '1px solid rgb(229, 231, 235)', paddingBottom: '6px' }}>
              Açıklama / Not
            </h3>
            <div style={{ 
              padding: '4px', 
              fontSize: '12px',
              color: 'rgb(17, 24, 39)',
              minHeight: '40px'
            }}>
              {currentShipment.description || <span style={{ color: '#9ca3af', fontStyle: 'italic' }}>Not bulunmuyor.</span>}
            </div>
          </div>

          {/* Actions */}
          {renderStatusActions()}

        </div>
      </div>
    </div>
  );
}
