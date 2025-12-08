import React, { useState, useEffect } from 'react';
import { shipmentsService } from '../../services/shipments-service.js';
import ShipmentDetailsPanel from './ShipmentDetailsPanel.jsx';
import ShipmentsTable from './ShipmentsTable.jsx';
import ShipmentsFilters from './ShipmentsFilters.jsx';
import AddShipmentModal from '../shared/modals/AddShipmentModal.jsx';
import { showToast } from '../../../../shared/components/MESToast.js';

export default function ShipmentsTabContent() {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState('all');
  const [dateFilter, setDateFilter] = useState('30d'); // Default: Son 30 gün
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

  // Date filter helper
  const getDateThreshold = (filterDays) => {
    if (!filterDays) return null; // 'all' - no date filter
    const threshold = new Date();
    threshold.setDate(threshold.getDate() - filterDays);
    return threshold;
  };

  // Date presets mapping
  const DATE_DAYS_MAP = {
    'all': null,
    '7d': 7,
    '30d': 30,
    '90d': 90
  };

  // Filter logic
  const filteredShipments = shipments.filter(shipment => {
    // Status filter
    if (activeTab !== 'all' && shipment.status !== activeTab) {
      return false;
    }

    // Date filter
    const days = DATE_DAYS_MAP[dateFilter];
    if (days) {
      const threshold = getDateThreshold(days);
      const shipmentDate = new Date(shipment.createdAt);
      if (shipmentDate < threshold) {
        return false;
      }
    }

    // Search filter
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      const shipmentCode = (shipment.shipmentCode || '').toLowerCase();
      const code = (shipment.productCode || '').toLowerCase();
      const workOrder = (shipment.workOrderCode || '').toLowerCase();
      const customer = (shipment.customerCompany || shipment.customerName || '').toLowerCase();
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

  // Loading state
  if (loading && shipments.length === 0) {
    return (
      <div className="stocks-tab-content">
        <div className="loading-container">
          <div className="loading-spinner">
            <div className="spinner"></div>
            <p>Sevkiyatlar yükleniyor...</p>
          </div>
        </div>
      </div>
    );
  }

  // Error state  
  if (error && shipments.length === 0) {
    return (
      <div className="stocks-tab-content">
        <div className="error-container">
          <h3>Veri Yükleme Hatası</h3>
          <p>{error}</p>
          <button onClick={loadShipments}>
            Tekrar Dene
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="stocks-tab-content">
      {/* Filter Bar & Tabs */}
      <div className="mes-filter-bar" style={{ position: 'relative' }}>
        <ShipmentsFilters
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          dateFilter={dateFilter}
          onDateFilterChange={setDateFilter}
          onRefresh={loadShipments}
          onCreateNew={() => setCreateModalOpen(true)}
          shipments={shipments}
          filteredCount={filteredShipments.length}
        />
      </div>

      {/* Main Content Area */}
      <div className="materials-container">
        <div className="materials-table-container">
          <section className="materials-table">
            {/* Table */}
            <ShipmentsTable
              shipments={filteredShipments}
              loading={loading}
              error={error}
              selectedShipment={selectedShipment}
              onSelectShipment={setSelectedShipment}
              emptyMessage={shipments.length === 0 ? 'Henüz hiç sevkiyat kaydı yok.' : 'Aranan kriterlere uygun sevkiyat bulunamadı.'}
            />
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
      <AddShipmentModal
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        onSuccess={handleShipmentCreated}
      />
    </div>
  );
}
