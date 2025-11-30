import React, { useState, useEffect } from 'react';
import { shipmentsService, SHIPMENT_STATUS_LABELS, SHIPMENT_STATUS_COLORS } from '../services/shipments-service.js';
import ShipmentDetailsPanel from './ShipmentDetailsPanel.jsx';
import CreateShipmentModal from './CreateShipmentModal.jsx';
import { Plus, Package } from 'lucide-react';
import { showToast } from '../../../shared/components/MESToast.js';

export default function ShipmentPanel() {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState('all');
  const [shipments, setShipments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedShipment, setSelectedShipment] = useState(null);
  const [createModalOpen, setCreateModalOpen] = useState(false);

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
      showToast('Durum güncellenirken bir hata oluştu.', 'error');
    }
  };

  const handleCancel = async (id, reason) => {
    try {
      await shipmentsService.cancelShipment(id, reason);
      await loadShipments();
      setSelectedShipment(prev => prev ? { ...prev, status: 'cancelled' } : null);
    } catch (error) {
      console.error('Cancel shipment failed:', error);
      showToast('İptal işlemi sırasında bir hata oluştu.', 'error');
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
      const shipmentCode = (shipment.shipmentCode || '').toLowerCase();
      const code = (shipment.productCode || '').toLowerCase();
      const workOrder = (shipment.workOrderCode || '').toLowerCase();
      const customer = (shipment.customerName || shipment.customerCompany || '').toLowerCase();
      const note = (shipment.description || shipment.notes || '').toLowerCase();
      const id = (shipment.id || '').toString();
      
      return shipmentCode.includes(term) || code.includes(term) || workOrder.includes(term) || customer.includes(term) || note.includes(term) || id.includes(term);
    }

    return true;
  });

  // Handle new shipment created
  const handleShipmentCreated = (newShipment) => {
    console.log('✅ New shipment created:', newShipment);
    loadShipments();
    setCreateModalOpen(false);
  };

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
              placeholder="Sevkiyat Ara (Kod, İş Emri, Müşteri, Not)..." 
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
            <button 
              className="mes-filter-button is-compact is-primary"
              onClick={() => setCreateModalOpen(true)}
              title="Yeni Sevkiyat"
              style={{
                backgroundColor: 'var(--primary, #3b82f6)',
                color: 'white',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <Plus size={16} />
              <span>Yeni Sevkiyat</span>
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
                    <th style={{ minWidth: '120px', textAlign: 'left' }}>Sevkiyat Kodu</th>
                    <th style={{ width: '70px', textAlign: 'center' }}>Kalem Adedi</th>
                    <th style={{ minWidth: '280px', textAlign: 'left' }}>Sevkiyat Kalemleri</th>
                    <th className="col-min-140-left">Müşteri/İş Emri</th>
                    <th className="col-min-140-left">Tarih</th>
                    <th style={{ width: '120px', textAlign: 'left' }}>Durum</th>
                  </tr>
                </thead>
                <tbody>
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

                   {!loading && !error && filteredShipments.length === 0 && (
                     <tr>
                       <td colSpan="6" style={{ padding: '40px 20px', textAlign: 'center', color: '#6b7280' }}>
                          {shipments.length === 0 ? 'Henüz hiç sevkiyat kaydı yok.' : 'Aranan kriterlere uygun sevkiyat bulunamadı.'}
                       </td>
                     </tr>
                   )}

                   {!loading && error && (
                     <tr>
                       <td colSpan="6" style={{ padding: '40px 20px', textAlign: 'center', color: '#dc2626' }}>
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
                           <span className="mes-code-text" className="font-semibold-only">
                             {shipment.shipmentCode || `SHP-${shipment.id}`}
                           </span>
                        </td>
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
                        <td>
                           <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                             {(shipment.items || []).slice(0, 3).map((item, idx) => {
                               // Parse item sequence from itemCode (e.g., "SHP-001-01" -> "01")
                               const itemSeq = item.itemCode ? item.itemCode.split('-').pop() : String(idx + 1).padStart(2, '0');
                               return (
                                 <div 
                                   key={item.id || idx}
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
                                   <span style={{ fontSize: '11px', fontWeight: '600', color: '#1d4ed8' }}>
                                     {itemSeq}
                                   </span>
                                   <span className="text-border">|</span>
                                   <span style={{ fontWeight: '600', fontFamily: 'monospace', fontSize: '10px', color: '#6b7280' }}>
                                     {item.materialCode || item.productCode || '-'}
                                   </span>
                                   <span className="text-border">|</span>
                                   <span className="font-semibold-only">
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
                        <td style={{ fontSize: '13px', color: '#4b5563' }}>
                           {formatDate(shipment.createdAt)}
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
            onRefresh={loadShipments}
            loading={loading}
          />
        )}
      </div>

      {/* Create Shipment Modal */}
      <CreateShipmentModal
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        onSuccess={handleShipmentCreated}
      />
    </div>
  );
}
