import React, { useState, useEffect, useRef } from 'react'
import { ArrowLeft, Truck, Info, Calendar, Edit, Check, X, ChevronDown, Search, Loader2, FileText, Package, Trash2, Plus } from '../../../../shared/components/Icons.jsx'
import { shipmentsService, SHIPMENT_STATUS_LABELS, SHIPMENT_STATUS_COLORS } from '../../services/shipments-service.js'
import { showToast } from '../../../../shared/components/MESToast.js'

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
      const response = await fetch('/api/materials');
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
        <h3 className="supplier-section-header-rgb">
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
          <div className="flex-center-gap-12">
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
            <h3 className="supplier-section-title-lg">
              Sevkiyat Detayı
            </h3>
          </div>
          
          {/* Header Actions */}
          <div className="flex-gap-8">
            {!isEditing && currentShipment.status !== 'delivered' ? (
              <button 
                onClick={handleEditToggle}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: '#6b7280', padding: '4px'
                }}
                title="Düzenle"
              >
                <Edit size={16} />
              </button>
            ) : isEditing ? (
              <>
                <button 
                  onClick={handleSave}
                  disabled={isUpdating}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: '#16a34a', padding: '4px'
                  }}
                  title="Kaydet"
                >
                  <Check size={18} />
                </button>
                <button 
                  onClick={handleEditToggle}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: '#ef4444', padding: '4px'
                  }}
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
          <div style={{ 
            marginBottom: '16px', 
            padding: '12px', 
            background: 'white', 
            borderRadius: '6px',
            border: '1px solid rgb(229, 231, 235)'
          }}>
            <h3 className="supplier-section-header-rgb">
              Sevkiyat Bilgileri
            </h3>
            
            {/* Shipment Code */}
            <div className="detail-item supplier-detail-row">
                <span className="detail-label supplier-detail-label-rgb-120">
                  Sevkiyat Kodu:
                </span>
                <span style={{ fontSize: '12px', color: 'rgb(17, 24, 39)', fontWeight: '600' }}>
                  {currentShipment.shipmentCode || `SHP-${currentShipment.id}`}
                </span>
            </div>

            {/* Customer Name */}
            {(currentShipment.customerName || currentShipment.customerCompany) && (
              <div className="detail-item supplier-detail-row">
                  <span className="detail-label supplier-detail-label-rgb-120">
                    Müşteri:
                  </span>
                  <span className="text-sm-dark">
                    {currentShipment.customerName}{currentShipment.customerCompany && currentShipment.customerName ? ` - ${currentShipment.customerCompany}` : currentShipment.customerCompany}
                  </span>
              </div>
            )}

            {/* Delivery Address */}
            {currentShipment.deliveryAddress && (
              <div className="detail-item supplier-detail-row">
                  <span className="detail-label supplier-detail-label-rgb-120">
                    Teslimat Adresi:
                  </span>
                  <span className="text-sm-dark">{currentShipment.deliveryAddress}</span>
              </div>
            )}

            <div className="detail-item supplier-detail-row">
                <span className="detail-label supplier-detail-label-rgb-120">
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

            <div className="detail-item supplier-detail-row">
                <span className="detail-label supplier-detail-label-rgb-120">
                  Kalem Sayısı:
                </span>
                <span style={{ fontSize: '12px', color: 'rgb(17, 24, 39)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Package size={12} />
                  {currentShipment.itemCount || shipmentItems.length || 1}
                </span>
            </div>

            <div className="detail-item supplier-detail-row">
                <span className="detail-label supplier-detail-label-rgb-120">
                  Oluşturma Tarihi:
                </span>
                <span className="text-sm-dark">{formatDate(currentShipment.createdAt)}</span>
            </div>

            <div className="detail-item" style={{ display: 'flex', alignItems: 'center', marginBottom: '0px' }}>
                <span className="detail-label supplier-detail-label-rgb-120">
                  Son Güncelleme:
                </span>
                <span className="text-sm-dark">{formatDate(currentShipment.updatedAt)}</span>
            </div>
          </div>

          {/* Sevkiyat Kalemleri */}
          <div style={{ 
            marginBottom: '16px', 
            padding: '12px', 
            background: 'white', 
            borderRadius: '6px',
            border: '1px solid rgb(229, 231, 235)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgb(229, 231, 235)', paddingBottom: '6px', marginBottom: '12px' }}>
              <h3 style={{ margin: 0, fontSize: '14px', fontWeight: '600', color: 'rgb(17, 24, 39)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Package size={14} />
                Sevkiyat Kalemleri
                {itemsLoading && <Loader2 size={14} className="animate-spin" />}
              </h3>
              {currentShipment.status === 'pending' && (
                <button
                  onClick={() => { setShowAddItem(true); loadMaterials(); }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '4px 10px',
                    backgroundColor: '#3b82f6',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    fontSize: '12px',
                    fontWeight: '500',
                    cursor: 'pointer'
                  }}
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
                <p style={{ margin: '8px 0 0', fontSize: '12px' }}>Yükleniyor...</p>
              </div>
            ) : shipmentItems.length === 0 ? (
              // Legacy: Single item display for old data
              currentShipment.productCode ? (
                <div style={{ padding: '8px', backgroundColor: '#f9fafb', borderRadius: '4px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <span style={{ fontWeight: '500', fontSize: '13px', color: '#111827' }}>{currentShipment.productCode}</span>
                    </div>
                    <span style={{ fontWeight: '600', fontSize: '13px', color: '#3b82f6' }}>
                      {(() => { const qty = parseFloat(currentShipment.shipmentQuantity) || 0; return Number.isInteger(qty) ? qty : qty.toFixed(2).replace(/\.?0+$/, ''); })()} {currentShipment.unit || 'adet'}
                    </span>
                  </div>
                </div>
              ) : (
                <div style={{ padding: '20px', textAlign: 'center', color: '#9ca3af', fontSize: '12px' }}>
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
                        <div style={{ fontWeight: '500', fontSize: '13px', color: '#111827', marginBottom: '2px' }}>
                          {item.materialCode}
                        </div>
                        {item.materialName && (
                          <div className="text-muted-sm">
                            {item.materialName}
                          </div>
                        )}
                        {item.notes && (
                          <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '4px', fontStyle: 'italic' }}>
                            {item.notes}
                          </div>
                        )}
                      </div>
                      <div className="flex-center-gap-12">
                        <div style={{ textAlign: 'right' }}>
                          <span style={{ fontWeight: '600', fontSize: '14px', color: '#3b82f6' }}>
                            {item.quantity}
                          </span>
                          <span style={{ fontSize: '11px', color: '#6b7280', marginLeft: '4px' }}>
                            {item.unit || 'adet'}
                          </span>
                        </div>
                        {currentShipment.status === 'pending' && (
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
                  <span style={{ fontWeight: '600', fontSize: '12px', color: '#374151' }}>
                    Toplam: {shipmentItems.length} kalem
                  </span>
                  <span style={{ fontWeight: '600', fontSize: '13px', color: '#1d4ed8' }}>
                    {shipmentItems.reduce((sum, item) => sum + parseFloat(item.quantity || 0), 0).toLocaleString('tr-TR')}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Kaynak & Referans */}
          <div style={{ 
            marginBottom: '16px', 
            padding: '12px', 
            background: 'white', 
            borderRadius: '6px',
            border: '1px solid rgb(229, 231, 235)'
          }}>
            <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: '600', color: 'rgb(17, 24, 39)', borderBottom: '1px solid rgb(229, 231, 235)', paddingBottom: '6px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Kaynak & Referans</span>
              {dataLoading && <Loader2 size={14} className="animate-spin" />}
            </h3>
            
            {/* Work Order */}
            <div className="detail-item flex-center-mb-12">
                <span className="detail-label supplier-detail-label-rgb-120">
                  İş Emri Kodu:
                </span>
                {isEditing ? (
                  <select
                    value={editData.workOrderCode}
                    onChange={(e) => handleInputChange('workOrderCode', e.target.value)}
                    style={{
                      flex: 1,
                      padding: '6px',
                      borderRadius: '4px',
                      border: '1px solid #d1d5db',
                      fontSize: '12px'
                    }}
                  >
                    <option value="">Seçiniz...</option>
                    {workOrders.map(wo => (
                      <option key={wo.code} value={wo.code}>{wo.code} {wo.productName ? `- ${wo.productName}` : ''}</option>
                    ))}
                  </select>
                ) : (
                  <span className="text-sm-dark">
                    {currentShipment.workOrderCode || <span className="text-muted-italic">-</span>}
                  </span>
                )}
            </div>

            {/* Quote */}
            <div className="detail-item flex-center-mb-12">
                <span className="detail-label supplier-detail-label-rgb-120">
                  Teklif ID:
                </span>
                {isEditing ? (
                  <select
                    value={editData.quoteId}
                    onChange={(e) => handleInputChange('quoteId', e.target.value)}
                    style={{
                      flex: 1,
                      padding: '6px',
                      borderRadius: '4px',
                      border: '1px solid #d1d5db',
                      fontSize: '12px'
                    }}
                  >
                    <option value="">Seçiniz...</option>
                    {quotes.map(q => (
                      <option key={q.id} value={q.id}>#{q.id} - {q.customerName || 'Müşteri'}</option>
                    ))}
                  </select>
                ) : (
                  <span className="text-sm-dark">
                    {currentShipment.quoteId ? `#${currentShipment.quoteId}` : <span className="text-muted-italic">-</span>}
                  </span>
                )}
            </div>

            {/* Plan */}
            <div className="detail-item supplier-detail-row">
                <span className="detail-label supplier-detail-label-rgb-120">
                  Plan ID:
                </span>
                {isEditing ? (
                  <select
                    value={editData.planId}
                    onChange={(e) => handleInputChange('planId', e.target.value)}
                    style={{
                      flex: 1,
                      padding: '6px',
                      borderRadius: '4px',
                      border: '1px solid #d1d5db',
                      fontSize: '12px'
                    }}
                  >
                    <option value="">Seçiniz...</option>
                    {plans.map(p => (
                      <option key={p.id} value={p.id}>{p.id} - {p.planName || p.name || 'Plan'}</option>
                    ))}
                  </select>
                ) : (
                  <span className="text-sm-dark">
                    {currentShipment.planId || <span className="text-muted-italic">-</span>}
                  </span>
                )}
            </div>
          </div>

          {/* Açıklama / Not */}
          <div style={{ 
            marginBottom: '16px', 
            padding: '12px', 
            background: 'white', 
            borderRadius: '6px',
            border: '1px solid rgb(229, 231, 235)'
          }}>
            <h3 className="supplier-section-header-rgb">
              Açıklama / Not
            </h3>
            <div style={{ 
              fontSize: '12px',
              color: 'rgb(17, 24, 39)',
              minHeight: '40px'
            }}>
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
                  {currentShipment.description || <span style={{ color: '#9ca3af', fontStyle: 'italic' }}>Not bulunmuyor.</span>}
                </div>
              )}
            </div>
          </div>

          {/* Actions */}
          {renderStatusActions()}

        </div>
      </div>
    </div>
  );
}