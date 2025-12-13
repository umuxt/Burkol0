import React, { useState, useEffect, useRef } from 'react'
import { ArrowLeft, Truck, Info, Calendar, Edit, Check, X, ChevronDown, Search, Loader2, FileText, Package, Trash2, Plus, Upload, Download, AlertCircle, FileCode, Paperclip } from '../../../../shared/components/Icons.jsx'
import { shipmentsService, SHIPMENT_STATUS_LABELS, SHIPMENT_STATUS_COLORS } from '../../services/shipments-service.js'
import { showToast } from '../../../../shared/components/MESToast.js'
import ImportModal from '../shared/modals/ImportModal.jsx'

export default function ShipmentDetailsPanel({
  shipment,
  onClose,
  onUpdateStatus,
  onCancel,
  onRefresh, // New prop to refresh parent list
  loading = false
}) {
  const [currentShipment, setCurrentShipment] = useState(shipment);
  const [isUpdating, setIsUpdating] = useState(false);
  const [statusNote, setStatusNote] = useState('');
  const [shipmentItems, setShipmentItems] = useState([]);
  const [itemsLoading, setItemsLoading] = useState(false);

  // Add item state
  const [showAddItem, setShowAddItem] = useState(false);
  const [newItem, setNewItem] = useState({ materialCode: '', quantity: '', notes: '' });
  const [materials, setMaterials] = useState([]);
  const [materialsLoading, setMaterialsLoading] = useState(false);
  const [addingItem, setAddingItem] = useState(false);
  const [removingItemId, setRemovingItemId] = useState(null);

  // Editing state
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState({});
  const [dataLoading, setDataLoading] = useState(false);
  const [workOrders, setWorkOrders] = useState([]);
  const [quotes, setQuotes] = useState([]);
  const [plans, setPlans] = useState([]);

  // Export/Import state
  const [showImportModal, setShowImportModal] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  useEffect(() => {
    setCurrentShipment(shipment);
    setEditData({
      workOrderCode: shipment.workOrderCode || '',
      quoteId: shipment.quoteId || '',
      planId: shipment.planId || '',
      customerName: shipment.customerName || '',
      customerCompany: shipment.customerCompany || '',
      deliveryAddress: shipment.deliveryAddress || '',
      description: shipment.description || shipment.notes || ''
    });

    // Load items
    loadShipmentItems(shipment.id);
  }, [shipment]);

  // Refresh shipment data from API
  const refreshShipmentData = async () => {
    try {
      const freshData = await shipmentsService.getShipmentById(currentShipment.id);
      if (freshData) {
        setCurrentShipment(freshData);
        if (freshData.items) {
          setShipmentItems(freshData.items);
        }
      }
    } catch (error) {
      console.error('Failed to refresh shipment data:', error);
    }
  };

  const loadShipmentItems = async (shipmentId, forceRefresh = false) => {
    if (!shipmentId) return;
    setItemsLoading(true);
    try {
      // If force refresh or no cached items, fetch from API
      if (forceRefresh || !shipment.items || !Array.isArray(shipment.items)) {
        const items = await shipmentsService.getShipmentItems(shipmentId);
        setShipmentItems(items || []);
      } else {
        setShipmentItems(shipment.items);
      }
    } catch (error) {
      console.error('Failed to load shipment items:', error);
      setShipmentItems([]);
    } finally {
      setItemsLoading(false);
    }
  };

  // Load materials for add item dropdown
  const loadMaterials = async () => {
    if (materials.length > 0) return;
    setMaterialsLoading(true);
    try {
      const token = localStorage.getItem('bp_admin_token');
      const response = await fetch('/api/materials', {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      });
      const data = await response.json();
      setMaterials(data.materials || data || []);
    } catch (error) {
      console.error('Failed to load materials:', error);
    } finally {
      setMaterialsLoading(false);
    }
  };

  // Handle add item
  const handleAddItem = async () => {
    if (!newItem.materialCode || !newItem.quantity) {
      showToast('Malzeme ve miktar zorunludur', 'warning');
      return;
    }

    setAddingItem(true);
    try {
      await shipmentsService.addItemToShipment(currentShipment.id, {
        materialCode: newItem.materialCode,
        quantity: parseFloat(newItem.quantity),
        notes: newItem.notes
      });

      // Refresh items from API (force refresh)
      await loadShipmentItems(currentShipment.id, true);
      // P1.6.3: Refresh header data (lastModifiedAt)
      await refreshShipmentData();

      setShowAddItem(false);
      setNewItem({ materialCode: '', quantity: '', notes: '' });

      // Refresh parent list if available
      if (onRefresh) onRefresh();
    } catch (error) {
      console.error('Failed to add item:', error);
      showToast(error.message || 'Kalem eklenemedi', 'error');
    } finally {
      setAddingItem(false);
    }
  };

  // Handle remove item (restore stock)
  const handleRemoveItem = async (itemId, materialCode, quantity) => {
    if (!confirm(`${materialCode} - ${quantity} adet kalemi silmek istediğinize emin misiniz?\nStok geri iade edilecektir.`)) {
      return;
    }

    setRemovingItemId(itemId);
    try {
      const result = await shipmentsService.removeItemFromShipment(itemId);

      // If shipment was deleted (last item removed), close panel and refresh
      if (result.shipmentDeleted) {
        showToast('Son kalem silindi, sevkiyat otomatik olarak kaldırıldı.', 'info');
        if (onRefresh) onRefresh();
        if (onClose) onClose();
        return;
      }

      // Refresh items from API
      await loadShipmentItems(currentShipment.id, true);
      // P1.6.3: Refresh header data (lastModifiedAt)
      await refreshShipmentData();

      // Refresh parent list if available
      if (onRefresh) onRefresh();
    } catch (error) {
      console.error('Failed to remove item:', error);
      showToast(error.message || 'Kalem silinemedi', 'error');
    } finally {
      setRemovingItemId(null);
    }
  };

  if (!currentShipment) return null;

  const formatDate = (dateString) => {
    if (!dateString) return '-';
    try {
      return new Date(dateString).toLocaleString('tr-TR');
    } catch (e) {
      return dateString;
    }
  };

  const handleEditToggle = async () => {
    if (!isEditing) {
      setIsEditing(true);
      if (workOrders.length === 0 && quotes.length === 0) {
        setDataLoading(true);
        try {
          const [woData, qData, pData] = await Promise.all([
            shipmentsService.getCompletedWorkOrders(),
            shipmentsService.getApprovedQuotes(),
            shipmentsService.getProductionPlans()
          ]);
          setWorkOrders(woData || []);
          setQuotes(qData || []);
          setPlans(pData || []);
        } catch (error) {
          console.error('Failed to load reference data:', error);
        } finally {
          setDataLoading(false);
        }
      }
    } else {
      setIsEditing(false);
      // Reset edit data to current shipment values
      setEditData({
        workOrderCode: currentShipment.workOrderCode || '',
        quoteId: currentShipment.quoteId || '',
        planId: currentShipment.planId || '',
        description: currentShipment.description || ''
      });
    }
  };

  const handleSave = async () => {
    setIsUpdating(true);
    try {
      // Prepare update payload
      const payload = {
        workOrderCode: editData.workOrderCode || null,
        quoteId: editData.quoteId || null,
        planId: editData.planId || null,
        description: editData.description || null
      };

      const updatedShipment = await shipmentsService.updateShipment(currentShipment.id, payload);
      setCurrentShipment(updatedShipment);
      setIsEditing(false);
      if (onRefresh) onRefresh();
    } catch (error) {
      console.error('Update failed:', error);
      showToast('Güncelleme başarısız oldu.', 'error');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleStatusChange = async (newStatus) => {
    if (!onUpdateStatus) return;

    if (newStatus === 'cancelled' && !confirm('Bu sevkiyatı iptal etmek istediğinize emin misiniz? Bu işlem geri alınamaz.')) {
      return;
    }

    setIsUpdating(true);
    try {
      await onUpdateStatus(currentShipment.id, newStatus);
    } catch (error) {
      console.error('Status update failed:', error);
      showToast('Durum güncellenirken bir hata oluştu.', 'error');
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
      await onCancel(currentShipment.id, statusNote);
    } catch (error) {
      console.error('Cancel shipment failed:', error);
      showToast('İptal işlemi sırasında bir hata oluştu.', 'error');
    } finally {
      setIsUpdating(false);
      setStatusNote('');
    }
  };

  // Helper for inputs
  const handleInputChange = (field, value) => {
    setEditData(prev => ({ ...prev, [field]: value }));
  };

  // Export handler
  const handleExport = async (format = 'csv') => {
    setIsExporting(true);
    try {
      const token = localStorage.getItem('bp_admin_token');
      const response = await fetch(`/api/materials/shipments/${currentShipment.id}/export/${format}`, {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Export başarısız');
      }

      // Download file
      const blob = await response.blob();
      const filename = response.headers.get('Content-Disposition')?.match(/filename="(.+)"/)?.[1]
        || `${currentShipment.shipmentCode}.${format}`;

      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      a.remove();

      showToast(`✅ ${format.toUpperCase()} dosyası indirildi`, 'success');

      // Update local state to show Import button immediately
      setCurrentShipment(prev => ({
        ...prev,
        status: prev.status === 'pending' ? 'exported' : prev.status,
        lastExportedAt: new Date().toISOString()
      }));

      // Refresh parent list
      if (onRefresh) onRefresh();
    } catch (error) {
      console.error('Export error:', error);
      showToast(error.message || 'Export sırasında hata oluştu', 'error');
    } finally {
      setIsExporting(false);
    }
  };

  // Import complete handler
  const handleImportComplete = async (result) => {
    // Immediately update with known data
    setCurrentShipment(prev => ({
      ...prev,
      status: 'completed',
      externalDocNumber: result.shipment?.externalDocNumber,
      importedAt: result.shipment?.importedAt,
      importedFileName: result.shipment?.importedFileName
    }));

    // Also refresh from server to ensure all data is current
    await refreshShipmentData();

    if (onRefresh) onRefresh();
  };

  // Status flow logic
  const renderStatusActions = () => {
    const { status } = currentShipment;

    if (status === 'cancelled' || status === 'delivered' || status === 'completed') {
      return null; // No actions for terminal states
    }

    return (
      <div className="section-card-mb">
        <h3 className="section-header">
          Durum Güncelle
        </h3>

        <div className="mb-12">
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

  // Export/Import Actions render
  const renderExportImportActions = () => {
    const { status } = currentShipment;

    // Completed or cancelled - no actions (unless we want to show history? kept as is for now)
    if (status === 'completed' || status === 'cancelled') {
      // If completed/cancelled, we still might want to show export info if it exists?
      // Current logic returned null. I'll stick to that but if user wants to see history it should be changed.
      // Waiting for user request on that. For now, preserving existing behavior but merging logic.
      if (!currentShipment.lastExportedAt && !currentShipment.importedAt) return null;
    }

    const modifiedAfterExport = currentShipment.lastExportedAt && currentShipment.lastModifiedAt &&
      new Date(currentShipment.lastModifiedAt) > new Date(currentShipment.lastExportedAt);

    return (
      <div className="section-card-mb">
        {/* Warning if modified after export */}
        {modifiedAfterExport && (
          <div style={{
            padding: '12px',
            backgroundColor: '#fef3c7',
            border: '1px solid #fbbf24',
            borderRadius: '6px',
            marginBottom: '12px',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '8px'
          }}>
            <AlertCircle size={16} style={{ color: '#f59e0b', marginTop: '2px', flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '13px', fontWeight: 500, color: '#92400e', marginBottom: '4px' }}>
                Export Sonrası Değişiklik Yapıldı
              </div>
              <div style={{ fontSize: '12px', color: '#78350f' }}>
                Son export: {new Date(currentShipment.lastExportedAt).toLocaleString('tr-TR')}<br />
                Son değişiklik: {new Date(currentShipment.lastModifiedAt).toLocaleString('tr-TR')}<br />
                <strong>Yeni export almanız önerilir.</strong>
              </div>
            </div>
          </div>
        )}

        <h3 className="section-header">
          Export / Import
        </h3>

        {/* Action Buttons */}
        {(status !== 'completed' && status !== 'cancelled') && (
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '12px' }}>
            {/* Export Buttons */}
            <button
              onClick={() => handleExport('csv')}
              disabled={isExporting}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 12px',
                borderRadius: '4px',
                border: '1px solid #3b82f6',
                background: 'white',
                color: '#3b82f6',
                fontSize: '12px',
                fontWeight: '500',
                cursor: isExporting ? 'not-allowed' : 'pointer',
                opacity: isExporting ? 0.7 : 1
              }}
            >
              <FileText size={14} />
              CSV
            </button>

            <button
              onClick={() => handleExport('xml')}
              disabled={isExporting}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 12px',
                borderRadius: '4px',
                border: '1px solid #8b5cf6',
                background: 'white',
                color: '#8b5cf6',
                fontSize: '12px',
                fontWeight: '500',
                cursor: isExporting ? 'not-allowed' : 'pointer',
                opacity: isExporting ? 0.7 : 1
              }}
            >
              <FileCode size={14} />
              XML
            </button>

            <button
              onClick={() => handleExport('pdf')}
              disabled={isExporting}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 12px',
                borderRadius: '4px',
                border: '1px solid #ef4444',
                background: 'white',
                color: '#ef4444',
                fontSize: '12px',
                fontWeight: '500',
                cursor: isExporting ? 'not-allowed' : 'pointer',
                opacity: isExporting ? 0.7 : 1
              }}
            >
              <FileText size={14} />
              PDF
            </button>

            {/* Import Button - only if exported */}
            {(status === 'exported' || currentShipment.lastExportedAt) && (
              <button
                onClick={() => setShowImportModal(true)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '8px 12px',
                  borderRadius: '4px',
                  border: 'none',
                  background: '#22c55e',
                  color: 'white',
                  fontSize: '12px',
                  fontWeight: '500',
                  cursor: 'pointer',
                  marginLeft: 'auto'
                }}
              >
                <Upload size={14} />
                Import
              </button>
            )}
          </div>
        )}

        {/* Info Grid */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {currentShipment.lastExportedAt && (
            <div className="detail-row">
              <span className="detail-label" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Upload size={14} /> Son Export:
              </span>
              <span className="detail-value">
                {new Date(currentShipment.lastExportedAt).toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' })}
              </span>
            </div>
          )}

          {currentShipment.importedAt && (
            <>
              <div className="detail-row">
                <span className="detail-label" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Download size={14} /> Import Tarihi:
                </span>
                <span className="detail-value" style={{ color: '#059669' }}>
                  {new Date(currentShipment.importedAt).toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' })}
                </span>
              </div>

              {currentShipment.externalDocNumber && (
                <div className="detail-row">
                  <span className="detail-label" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <FileText size={14} /> Resmi Belge No:
                  </span>
                  <span className="detail-value" style={{ fontWeight: 600 }}>
                    {currentShipment.externalDocNumber}
                  </span>
                </div>
              )}

              {currentShipment.importedFileName && (
                <div className="detail-row">
                  <span className="detail-label" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Paperclip size={14} /> Yüklenen Dosya:
                  </span>
                  <span className="detail-value" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {currentShipment.importedFileName}
                    <button
                      onClick={async () => {
                        try {
                          const token = localStorage.getItem('bp_admin_token');
                          const response = await fetch(`/api/materials/shipments/${currentShipment.id}/imported-file`, {
                            credentials: 'include',
                            headers: token ? { 'Authorization': `Bearer ${token}` } : {}
                          });
                          if (!response.ok) throw new Error('Dosya indirilemedi');
                          const blob = await response.blob();
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement('a');
                          a.href = url;
                          a.download = currentShipment.importedFileName;
                          document.body.appendChild(a);
                          a.click();
                          document.body.removeChild(a);
                          URL.revokeObjectURL(url);
                        } catch (error) {
                          console.error('Download error:', error);
                          alert('Dosya indirilemedi: ' + error.message);
                        }
                      }}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        padding: '4px 8px',
                        backgroundColor: '#3b82f6',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        fontSize: '11px',
                        cursor: 'pointer'
                      }}
                      title="Dosyayı indir"
                    >
                      <Download size={12} />
                      İndir
                    </button>
                  </span>
                </div>
              )}
            </>
          )}
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
        <div className="detail-panel-header">
          <div className="header-left">
            <button
              onClick={onClose}
              className="btn-secondary-sm"
              title="Detayları Kapat"
            >
              <ArrowLeft size={14} />
            </button>
            <h2>
              Sevkiyat Detayı
            </h2>
          </div>

          {/* Header Actions */}
          <div className="header-actions">
            {!isEditing && currentShipment.status !== 'delivered' && currentShipment.status !== 'completed' && currentShipment.status !== 'cancelled' ? (
              <button
                onClick={handleEditToggle}
                className="btn-icon-sm"
                title="Düzenle"
              >
                <Edit size={16} />
              </button>
            ) : isEditing ? (
              <>
                <button
                  onClick={handleSave}
                  disabled={isUpdating}
                  className="btn-icon-sm"
                  style={{ color: '#16a34a' }}
                  title="Kaydet"
                >
                  <Check size={18} />
                </button>
                <button
                  onClick={handleEditToggle}
                  className="btn-icon-sm"
                  style={{ color: '#ef4444' }}
                  title="İptal"
                >
                  <X size={18} />
                </button>
              </>
            ) : null}
          </div>
        </div>

        {/* Content - Scrollable */}
        <div className="panel-content">

          {/* Sevkiyat Bilgileri */}
          <div className="section-card-mb">
            <h3 className="section-header">
              Sevkiyat Bilgileri
            </h3>

            {/* Shipment Code */}
            <div className="detail-row">
              <span className="detail-label detail-label">
                Sevkiyat Kodu:
              </span>
              <span className="text-sm text-dark font-semibold">
                {currentShipment.shipmentCode || `SHP-${currentShipment.id}`}
              </span>
            </div>

            {/* Customer Name */}
            {(currentShipment.customerName || currentShipment.customerCompany) && (
              <div className="detail-row">
                <span className="detail-label detail-label">
                  Müşteri:
                </span>
                <span className="detail-value">
                  {currentShipment.customerName}{currentShipment.customerCompany && currentShipment.customerName ? ` - ${currentShipment.customerCompany}` : currentShipment.customerCompany}
                </span>
              </div>
            )}

            {/* Delivery Address */}
            {currentShipment.deliveryAddress && (
              <div className="detail-row">
                <span className="detail-label detail-label">
                  Teslimat Adresi:
                </span>
                <span className="detail-value">{currentShipment.deliveryAddress}</span>
              </div>
            )}

            <div className="detail-row">
              <span className="detail-label detail-label">
                Durum:
              </span>
              <span className="mes-tag" style={{
                backgroundColor: `${SHIPMENT_STATUS_COLORS[currentShipment.status]}20`,
                color: SHIPMENT_STATUS_COLORS[currentShipment.status],
                border: `1px solid ${SHIPMENT_STATUS_COLORS[currentShipment.status]}40`
              }}>
                {SHIPMENT_STATUS_LABELS[currentShipment.status] || currentShipment.status}
              </span>
            </div>

            <div className="detail-row">
              <span className="detail-label detail-label">
                Kalem Sayısı:
              </span>
              <span className="text-sm text-dark" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Package size={12} />
                {currentShipment.itemCount || shipmentItems.length || 1}
              </span>
            </div>

            <div className="detail-row">
              <span className="detail-label detail-label">
                Oluşturma Tarihi:
              </span>
              <span className="detail-value">{formatDate(currentShipment.createdAt)}</span>
            </div>

            <div className="detail-row">
              <span className="detail-label">
                Son Güncelleme:
              </span>
              <span className="detail-value">{formatDate(currentShipment.updatedAt)}</span>
            </div>
          </div>

          {/* Sevkiyat Kalemleri */}
          <div className="section-card-mb">
            <div className="section-header-with-action">
              <h3>
                Sevkiyat Kalemleri
                {itemsLoading && <Loader2 size={14} className="animate-spin" style={{ marginLeft: '8px' }} />}
              </h3>
              {currentShipment.status !== 'completed' && currentShipment.status !== 'delivered' && currentShipment.status !== 'cancelled' && (
                <button
                  onClick={() => { setShowAddItem(true); loadMaterials(); }}
                  className="section-button"
                >
                  <Plus size={14} />
                  Yeni Kalem Ekle
                </button>
              )}
            </div>

            {/* Add Item Form */}
            {showAddItem && (
              <div style={{
                marginBottom: '12px',
                padding: '12px',
                backgroundColor: '#f0f9ff',
                borderRadius: '6px',
                border: '1px solid #bfdbfe'
              }}>
                <div className="flex-gap-8-mb-8">
                  <select
                    value={newItem.materialCode}
                    onChange={(e) => setNewItem({ ...newItem, materialCode: e.target.value })}
                    style={{
                      flex: 2,
                      padding: '8px',
                      borderRadius: '4px',
                      border: '1px solid #d1d5db',
                      fontSize: '13px'
                    }}
                  >
                    <option value="">Malzeme Seçin...</option>
                    {materials.map(m => (
                      <option key={m.id || m.code} value={m.code}>
                        {m.code} - {m.name} (Stok: {m.stock || 0})
                      </option>
                    ))}
                  </select>
                  <input
                    type="text" inputMode="decimal"
                    placeholder="Miktar"
                    value={newItem.quantity}
                    onChange={(e) => {
                      let cleanValue = e.target.value.replace(/,/g, '.')
                      if (!/^[0-9.]*$/.test(cleanValue)) return
                      if ((cleanValue.match(/\./g) || []).length > 1) return
                      setNewItem({ ...newItem, quantity: cleanValue })
                    }}
                    pattern="[0-9]*\.?[0-9]*"
                    style={{
                      flex: 1,
                      padding: '8px',
                      borderRadius: '4px',
                      border: '1px solid #d1d5db',
                      fontSize: '13px'
                    }}
                  />
                </div>
                <div className="flex-gap-8">
                  <input
                    type="text"
                    placeholder="Not (opsiyonel)"
                    value={newItem.notes}
                    onChange={(e) => setNewItem({ ...newItem, notes: e.target.value })}
                    style={{
                      flex: 1,
                      padding: '8px',
                      borderRadius: '4px',
                      border: '1px solid #d1d5db',
                      fontSize: '13px'
                    }}
                  />
                  <button
                    onClick={handleAddItem}
                    disabled={addingItem}
                    style={{
                      padding: '8px 16px',
                      backgroundColor: '#10b981',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      fontSize: '12px',
                      fontWeight: '500',
                      cursor: addingItem ? 'not-allowed' : 'pointer',
                      opacity: addingItem ? 0.7 : 1
                    }}
                  >
                    {addingItem ? 'Ekleniyor...' : 'Ekle'}
                  </button>
                  <button
                    onClick={() => { setShowAddItem(false); setNewItem({ materialCode: '', quantity: '', notes: '' }); }}
                    style={{
                      padding: '8px 12px',
                      backgroundColor: '#f3f4f6',
                      color: '#374151',
                      border: '1px solid #d1d5db',
                      borderRadius: '4px',
                      fontSize: '12px',
                      cursor: 'pointer'
                    }}
                  >
                    İptal
                  </button>
                </div>
              </div>
            )}

            {itemsLoading ? (
              <div style={{ padding: '20px', textAlign: 'center', color: '#6b7280' }}>
                <Loader2 size={20} className="animate-spin" style={{ display: 'inline-block', animation: 'spin 1s linear infinite' }} />
                <p className="text-sm mt-8">Yükleniyor...</p>
              </div>
            ) : shipmentItems.length === 0 ? (
              // Legacy: Single item display for old data
              currentShipment.productCode ? (
                <div style={{ padding: '8px', backgroundColor: '#f9fafb', borderRadius: '4px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <span className="text-base text-dark font-medium">{currentShipment.productCode}</span>
                    </div>
                    <span className="text-base text-primary font-semibold">
                      {(() => { const qty = parseFloat(currentShipment.shipmentQuantity) || 0; return Number.isInteger(qty) ? qty : qty.toFixed(2).replace(/\.?0+$/, ''); })()} {currentShipment.unit || 'adet'}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="text-center p-20 text-light text-sm">
                  Kalem bulunamadı
                </div>
              )
            ) : (
              <div className="flex-col-gap-8">
                {shipmentItems.map((item, index) => (
                  <div
                    key={item.id || index}
                    style={{
                      padding: '10px 12px',
                      backgroundColor: '#f9fafb',
                      borderRadius: '6px',
                      border: '1px solid #e5e7eb'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div className="flex-1">
                        <div className="text-base text-dark font-medium mb-2">
                          {item.materialCode}
                        </div>
                        {item.materialName && (
                          <div className="text-muted-sm">
                            {item.materialName}
                          </div>
                        )}
                        {item.notes && (
                          <div className="text-xs text-light text-italic mt-4">
                            {item.notes}
                          </div>
                        )}
                      </div>
                      <div className="flex-center-gap-12">
                        <div style={{ textAlign: 'right' }}>
                          <span className="text-md text-primary font-semibold">
                            {item.quantity}
                          </span>
                          <span className="text-xs text-muted ml-4">
                            {item.unit || 'adet'}
                          </span>
                        </div>
                        {currentShipment.status !== 'completed' && currentShipment.status !== 'delivered' && currentShipment.status !== 'cancelled' && (
                          <button
                            onClick={() => handleRemoveItem(item.id, item.materialCode, item.quantity)}
                            disabled={removingItemId === item.id}
                            title="Kalemi sil (stok iade edilir)"
                            style={{
                              padding: '4px',
                              backgroundColor: removingItemId === item.id ? '#fecaca' : '#fee2e2',
                              color: '#dc2626',
                              border: 'none',
                              borderRadius: '4px',
                              cursor: removingItemId === item.id ? 'not-allowed' : 'pointer',
                              opacity: removingItemId === item.id ? 0.7 : 1,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center'
                            }}
                          >
                            {removingItemId === item.id ? (
                              <Loader2 size={14} className="animate-spin" />
                            ) : (
                              <Trash2 size={14} />
                            )}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}

                {/* Total */}
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '8px 12px',
                  backgroundColor: '#f0f9ff',
                  borderRadius: '4px',
                  marginTop: '4px'
                }}>
                  <span className="text-sm text-gray font-semibold">
                    Toplam: {shipmentItems.length} kalem
                  </span>
                  <span className="text-base text-primary font-semibold">
                    {shipmentItems.reduce((sum, item) => sum + parseFloat(item.quantity || 0), 0).toLocaleString('tr-TR')}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Kaynak & Referans */}
          <div className="section-card-mb">
            <div className="section-header-with-action">
              <h3>Kaynak & Referans</h3>
            </div>

            {/* Related Quote ID - 7 Day Rule */}
            <div className="detail-row">
              <span className="detail-label detail-label">
                Bağlı Teklif:
              </span>
              <span className="detail-value">
                {currentShipment.relatedQuoteId ? currentShipment.relatedQuoteId : <span className="text-muted-italic">-</span>}
              </span>
            </div>
          </div>

          {/* Export / Import Bilgileri */}


          {/* Açıklama / Not */}
          <div className="section-card-mb">
            <h3 className="section-header">
              Açıklama / Not
            </h3>
            <div className="text-sm text-dark" style={{ minHeight: '40px' }}>
              {isEditing ? (
                <textarea
                  value={editData.description}
                  onChange={(e) => handleInputChange('description', e.target.value)}
                  style={{
                    width: '100%',
                    minHeight: '60px',
                    padding: '8px',
                    borderRadius: '4px',
                    border: '1px solid #d1d5db',
                    fontSize: '12px',
                    resize: 'vertical',
                    fontFamily: 'inherit'
                  }}
                  placeholder="Açıklama giriniz..."
                />
              ) : (
                <div style={{ whiteSpace: 'pre-wrap' }}>
                  {currentShipment.description || <span className="text-light text-italic">Not bulunmuyor.</span>}
                </div>
              )}
            </div>
          </div>

          {/* Export/Import Actions */}
          {renderExportImportActions()}

          {/* Status Actions */}
          {renderStatusActions()}

        </div>
      </div>

      {/* Import Modal */}
      <ImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        shipment={currentShipment}
        onImportComplete={handleImportComplete}
      />
    </div>
  );
}