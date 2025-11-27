import React, { useState, useEffect } from 'react';
import { shipmentsService, SHIPMENT_STATUS_LABELS, SHIPMENT_STATUS_COLORS } from '../services/shipments-service.js';
import ShipmentDetailsPanel from './ShipmentDetailsPanel.jsx';

export default function ShipmentPanel() {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState('all');
  const [shipments, setShipments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedShipment, setSelectedShipment] = useState(null);

  useEffect(() => {
    loadShipments();
  }, []);

  const loadShipments = async () => {
    setLoading(true);
    try {
      const data = await shipmentsService.getShipments();
      // Sort by date desc (newest first)
      const sortedData = Array.isArray(data) ? data.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)) : [];
      setShipments(sortedData);
      setError(null);
    } catch (err) {
      console.error('Shipments load error:', err);
      setError('Sevkiyat verileri yüklenirken bir hata oluştu.');
      setShipments([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSearchChange = (e) => {
    setSearchTerm(e.target.value);
  };

  const handleUpdateStatus = async (id, newStatus) => {
    try {
      await shipmentsService.updateShipmentStatus(id, newStatus);
      await loadShipments();
      // Update selected shipment to reflect changes
      const updatedShipment = shipments.find(s => s.id === id);
      if (updatedShipment) {
        setSelectedShipment({ ...updatedShipment, status: newStatus });
      } else {
        // Reload finding if needed, but optimistically:
        setSelectedShipment(prev => prev ? { ...prev, status: newStatus } : null);
      }
    } catch (error) {
      console.error('Update status failed:', error);
      alert('Durum güncellenirken bir hata oluştu.');
    }
  };

  const handleCancel = async (id, reason) => {
    try {
      await shipmentsService.cancelShipment(id, reason);
      await loadShipments();
      setSelectedShipment(prev => prev ? { ...prev, status: 'cancelled' } : null);
    } catch (error) {
      console.error('Cancel shipment failed:', error);
      alert('İptal işlemi sırasında bir hata oluştu.');
    }
  };

  // Tabs configuration
  const tabs = [
    { id: 'all', label: 'Tümü' },
    { id: 'pending', label: 'Beklemede' },
    { id: 'shipped', label: 'Yola Çıktı' },
    { id: 'delivered', label: 'Teslim Edildi' },
    { id: 'cancelled', label: 'İptal Edildi' }
  ];

  // Filter logic
  const filteredShipments = shipments.filter(shipment => {
    // Status filter
    if (activeTab !== 'all' && shipment.status !== activeTab) {
      return false;
    }

    // Search filter
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      const code = (shipment.productCode || '').toLowerCase();
      const workOrder = (shipment.workOrderCode || '').toLowerCase();
      const note = (shipment.description || '').toLowerCase();
      const id = (shipment.id || '').toString();
      
      return code.includes(term) || workOrder.includes(term) || note.includes(term) || id.includes(term);
    }

    return true;
  });

  const formatDate = (dateString) => {
    if (!dateString) return '-';
    try {
      return new Date(dateString).toLocaleString('tr-TR');
    } catch (e) {
      return dateString;
    }
  };

  return (
    <div className="shipment-panel-content">
      {/* Filter Bar */}
      <div className="mes-filter-bar" style={{ position: 'relative', marginBottom: '1rem' }}>
         <div className="mes-filter-controls">
            <input 
              type="text" 
              placeholder="Sevkiyat Ara (Kod, İş Emri, Not)..." 
              value={searchTerm}
              onChange={handleSearchChange}
              className="mes-filter-input is-compact"
            />
            <button 
              className="mes-filter-button is-compact"
              onClick={loadShipments}
              title="Yenile"
            >
              <span>Yenile</span>
            </button>
         </div>
      </div>

      {/* Main Content Area */}
      <div className="materials-container">
        <div className="materials-table-container">
          <section className="materials-table">
            {/* Tabs */}
            <div className="materials-tabs">
              {tabs.map(tab => (
                <button
                  key={tab.id}
                  className={`tab-button ${activeTab === tab.id ? 'active' : ''}`}
                  onClick={() => setActiveTab(tab.id)}
                >
                  {tab.label}
                  <span className="tab-count">
                    {activeTab === tab.id 
                      ? filteredShipments.length 
                      : shipments.filter(s => tab.id === 'all' || s.status === tab.id).length}
                  </span>
                </button>
              ))}
            </div>
            
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th style={{ width: '60px', textAlign: 'left' }}>ID</th>
                    <th style={{ minWidth: '140px', textAlign: 'left' }}>Malzeme Kodu</th>
                    <th style={{ width: '100px', textAlign: 'left' }}>Miktar</th>
                    <th style={{ width: '120px', textAlign: 'left' }}>Durum</th>
                    <th style={{ minWidth: '140px', textAlign: 'left' }}>Kaynak</th>
                    <th style={{ minWidth: '140px', textAlign: 'left' }}>Tarih</th>
                    <th style={{ minWidth: '150px', textAlign: 'left' }}>Not</th>
                  </tr>
                </thead>
                <tbody>
                   {loading && (
                     <tr>
                       <td colSpan="7" style={{ padding: '40px 20px', textAlign: 'center' }}>
                         <div className="loading-spinner" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
                           <div className="spinner"></div>
                           <span style={{ color: '#6b7280' }}>Yükleniyor...</span>
                         </div>
                       </td>
                     </tr>
                   )}

                   {!loading && !error && filteredShipments.length === 0 && (
                     <tr>
                       <td colSpan="7" style={{ padding: '40px 20px', textAlign: 'center', color: '#6b7280' }}>
                          {shipments.length === 0 ? 'Henüz hiç sevkiyat kaydı yok.' : 'Aranan kriterlere uygun sevkiyat bulunamadı.'}
                       </td>
                     </tr>
                   )}

                   {!loading && error && (
                     <tr>
                       <td colSpan="7" style={{ padding: '40px 20px', textAlign: 'center', color: '#dc2626' }}>
                          {error}
                       </td>
                     </tr>
                   )}

                   {!loading && filteredShipments.map(shipment => (
                     <tr 
                       key={shipment.id} 
                       className={`mes-table-row ${selectedShipment?.id === shipment.id ? 'selected' : ''}`}
                       onClick={() => setSelectedShipment(shipment)}
                       style={{ cursor: 'pointer' }}
                     >
                        <td>
                           <span style={{ color: '#6b7280', fontSize: '12px' }}>#{shipment.id}</span>
                        </td>
                        <td>
                           <span className="mes-code-text">{shipment.productCode}</span>
                        </td>
                        <td>
                           <span style={{ fontWeight: '500' }}>{shipment.shipmentQuantity}</span>
                        </td>
                        <td>
                           <span className="mes-tag" style={{ 
                             backgroundColor: `${SHIPMENT_STATUS_COLORS[shipment.status]}20`,
                             color: SHIPMENT_STATUS_COLORS[shipment.status],
                             border: `1px solid ${SHIPMENT_STATUS_COLORS[shipment.status]}40`
                           }}>
                             {SHIPMENT_STATUS_LABELS[shipment.status] || shipment.status}
                           </span>
                        </td>
                        <td>
                           {shipment.workOrderCode ? (
                             <div style={{ display: 'flex', flexDirection: 'column' }}>
                               <span style={{ fontSize: '11px', color: '#6b7280' }}>İş Emri</span>
                               <span>{shipment.workOrderCode}</span>
                             </div>
                           ) : shipment.quoteId ? (
                             <div style={{ display: 'flex', flexDirection: 'column' }}>
                               <span style={{ fontSize: '11px', color: '#6b7280' }}>Teklif</span>
                               <span>#{shipment.quoteId}</span>
                             </div>
                           ) : (
                             <span style={{ color: '#9ca3af' }}>-</span>
                           )}
                        </td>
                        <td style={{ fontSize: '13px', color: '#4b5563' }}>
                           {formatDate(shipment.createdAt)}
                        </td>
                        <td style={{ fontSize: '13px', color: '#4b5563', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={shipment.description}>
                           {shipment.description || '-'}
                        </td>
                     </tr>
                   ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        {/* Details Panel */}
        {selectedShipment && (
          <ShipmentDetailsPanel
            shipment={selectedShipment}
            onClose={() => setSelectedShipment(null)}
            onUpdateStatus={handleUpdateStatus}
            onCancel={handleCancel}
            loading={loading}
          />
        )}
      </div>
    </div>
  );
}
