// Firebase Entegrasyonu için React Component Örnekleri
// Bu dosya mevcut componentlerin Firebase ile nasıl entegre edileceğini gösterir

import React, { useState, useEffect } from 'react';
import { 
  useMaterials, 
  useMaterialActions, 
  useCategories, 
  useStockAlerts,
  useMaterialSearch 
} from '../hooks/useFirebaseMaterials.js';

// ================================
// 1. MATERIALS TABLE COMPONENT (Firebase Entegreli)
// ================================

export function MaterialsTableFirebase() {
  const [filters, setFilters] = useState({
    status: 'Aktif',
    category: ''
  });
  
  const [searchTerm, setSearchTerm] = useState('');
  
  // Firebase hooks
  const { materials, loading, error, pagination, loadMore, refresh } = useMaterials(
    filters,
    { 
      limit: 20, 
      orderBy: 'updatedAt',
      realTime: true 
    }
  );
  
  const { categories } = useCategories();
  const { searchResults, search, loading: searchLoading } = useMaterialSearch();
  const { updateStock, loading: updateLoading } = useMaterialActions();
  
  // Search handler
  const handleSearch = (term) => {
    setSearchTerm(term);
    if (term.length >= 2) {
      search(term, filters);
    }
  };
  
  // Stock update handler
  const handleStockUpdate = async (materialId, quantity, type) => {
    try {
      await updateStock(materialId, quantity, type, {
        reference: `MANUAL-${Date.now()}`,
        notes: `Manuel ${type === 'in' ? 'giriş' : 'çıkış'}`,
        userId: 'current-user',
        userName: 'Current User'
      });
      refresh(); // Refresh list after update
    } catch (error) {
      console.error('Stock update failed:', error);
    }
  };
  
  // Filter change handler
  const handleFilterChange = (newFilters) => {
    setFilters(prev => ({ ...prev, ...newFilters }));
  };
  
  const displayMaterials = searchTerm.length >= 2 ? searchResults : materials;
  const isLoading = searchTerm.length >= 2 ? searchLoading : loading;
  
  if (error) {
    return (
      <div className="error-container">
        <h3>Hata Oluştu</h3>
        <p>{error}</p>
        <button onClick={refresh}>Tekrar Dene</button>
      </div>
    );
  }
  
  return (
    <div className="materials-table-container">
      {/* Header */}
      <div className="table-header">
        <h2>Malzeme Listesi ({displayMaterials.length})</h2>
        <button onClick={refresh} disabled={isLoading}>
          🔄 Yenile
        </button>
      </div>
      
      {/* Filters */}
      <div className="filters">
        <input
          type="text"
          placeholder="Malzeme ara..."
          value={searchTerm}
          onChange={(e) => handleSearch(e.target.value)}
        />
        
        <select 
          value={filters.category}
          onChange={(e) => handleFilterChange({ category: e.target.value })}
        >
          <option value="">Tüm Kategoriler</option>
          {categories.map(cat => (
            <option key={cat.id} value={cat.id}>{cat.name}</option>
          ))}
        </select>
        
        <select
          value={filters.status}
          onChange={(e) => handleFilterChange({ status: e.target.value })}
        >
          <option value="">Tüm Durumlar</option>
          <option value="Aktif">Aktif</option>
          <option value="Pasif">Pasif</option>
        </select>
      </div>
      
      {/* Loading State */}
      {isLoading && (
        <div className="loading">Yükleniyor...</div>
      )}
      
      {/* Materials Table */}
      <div className="table-container">
        <table className="materials-table">
          <thead>
            <tr>
              <th>Kod</th>
              <th>Malzeme Adı</th>
              <th>Kategori</th>
              <th>Stok</th>
              <th>Minimum</th>
              <th>Birim</th>
              <th>Durum</th>
              <th>İşlemler</th>
            </tr>
          </thead>
          <tbody>
            {displayMaterials.map(material => (
              <MaterialRow 
                key={material.id} 
                material={material}
                onStockUpdate={handleStockUpdate}
                updateLoading={updateLoading}
              />
            ))}
          </tbody>
        </table>
      </div>
      
      {/* Pagination */}
      {pagination.hasMore && !searchTerm && (
        <div className="pagination">
          <button onClick={loadMore} disabled={isLoading}>
            Daha Fazla Yükle
          </button>
        </div>
      )}
      
      {/* Empty State */}
      {!isLoading && displayMaterials.length === 0 && (
        <div className="empty-state">
          {searchTerm ? 'Arama sonucu bulunamadı' : 'Malzeme bulunamadı'}
        </div>
      )}
    </div>
  );
}

// ================================
// 2. MATERIAL ROW COMPONENT
// ================================

function MaterialRow({ material, onStockUpdate, updateLoading }) {
  const [showActions, setShowActions] = useState(false);
  const [stockInput, setStockInput] = useState('');
  
  const isLowStock = material.stock <= material.reorderPoint;
  const isOutOfStock = material.stock === 0;
  
  const handleStockChange = (type) => {
    const quantity = parseInt(stockInput);
    if (quantity && quantity > 0) {
      const finalQuantity = type === 'out' ? -quantity : quantity;
      onStockUpdate(material.id, finalQuantity, type);
      setStockInput('');
      setShowActions(false);
    }
  };
  
  return (
    <tr className={`material-row ${isLowStock ? 'low-stock' : ''} ${isOutOfStock ? 'out-of-stock' : ''}`}>
      <td className="material-code">{material.code}</td>
      <td className="material-name">
        <div>
          <strong>{material.name}</strong>
          {material.description && (
            <small>{material.description}</small>
          )}
        </div>
      </td>
      <td className="material-category">{material.category}</td>
      <td className="material-stock">
        <span className={`stock-amount ${isLowStock ? 'low' : ''}`}>
          {material.stock}
        </span>
        {material.reserved > 0 && (
          <small>({material.reserved} rezerve)</small>
        )}
      </td>
      <td className="reorder-point">{material.reorderPoint}</td>
      <td className="material-unit">{material.unit}</td>
      <td className="material-status">
        <span className={`status ${material.status.toLowerCase()}`}>
          {material.status}
        </span>
      </td>
      <td className="material-actions">
        {!showActions ? (
          <button 
            onClick={() => setShowActions(true)}
            className="btn-small"
            disabled={updateLoading}
          >
            Stok Güncelle
          </button>
        ) : (
          <div className="stock-actions">
            <input
              type="number"
              value={stockInput}
              onChange={(e) => setStockInput(e.target.value)}
              placeholder="Miktar"
              min="1"
            />
            <button 
              onClick={() => handleStockChange('in')}
              className="btn-success btn-small"
              disabled={!stockInput || updateLoading}
            >
              Giriş
            </button>
            <button 
              onClick={() => handleStockChange('out')}
              className="btn-warning btn-small"
              disabled={!stockInput || updateLoading}
            >
              Çıkış
            </button>
            <button 
              onClick={() => setShowActions(false)}
              className="btn-cancel btn-small"
            >
              İptal
            </button>
          </div>
        )}
      </td>
    </tr>
  );
}

// ================================
// 3. ADD MATERIAL MODAL (Firebase Entegreli)
// ================================

export function AddMaterialModalFirebase({ isOpen, onClose, onSuccess }) {
  const [formData, setFormData] = useState({
    code: '',
    name: '',
    category: '',
    type: '',
    unit: 'Adet',
    stock: 0,
    reorderPoint: 0,
    costPrice: 0,
    sellPrice: 0,
    supplier: '',
    description: '',
    status: 'Aktif'
  });
  
  const { categories } = useCategories();
  const { createMaterial, loading, error } = useMaterialActions();
  
  const units = ['Adet', 'Metre', 'Kilogram', 'Litre', 'Paket', 'Çuval', 'Takım', 'm³', 'm²'];
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    try {
      const result = await createMaterial({
        ...formData,
        stock: Number(formData.stock),
        reorderPoint: Number(formData.reorderPoint),
        costPrice: Number(formData.costPrice),
        sellPrice: Number(formData.sellPrice)
      });
      
      onSuccess?.(result);
      onClose();
      
      // Reset form
      setFormData({
        code: '',
        name: '',
        category: '',
        type: '',
        unit: 'Adet',
        stock: 0,
        reorderPoint: 0,
        costPrice: 0,
        sellPrice: 0,
        supplier: '',
        description: '',
        status: 'Aktif'
      });
      
    } catch (error) {
      console.error('Material creation failed:', error);
    }
  };
  
  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };
  
  if (!isOpen) return null;
  
  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <div className="modal-header">
          <h2>Yeni Malzeme Ekle</h2>
          <button onClick={onClose} className="modal-close">×</button>
        </div>
        
        <form onSubmit={handleSubmit} className="material-form">
          <div className="form-grid">
            <div className="form-group">
              <label>Malzeme Kodu</label>
              <input
                type="text"
                value={formData.code}
                onChange={(e) => handleChange('code', e.target.value)}
                placeholder="ELK-001"
                required
              />
            </div>
            
            <div className="form-group">
              <label>Malzeme Adı</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => handleChange('name', e.target.value)}
                placeholder="Malzeme adı"
                required
              />
            </div>
            
            <div className="form-group">
              <label>Kategori</label>
              <select
                value={formData.category}
                onChange={(e) => handleChange('category', e.target.value)}
                required
              >
                <option value="">Kategori Seçin</option>
                {categories.map(cat => (
                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))}
              </select>
            </div>
            
            <div className="form-group">
              <label>Tip</label>
              <input
                type="text"
                value={formData.type}
                onChange={(e) => handleChange('type', e.target.value)}
                placeholder="Kablo, Boya, vs."
              />
            </div>
            
            <div className="form-group">
              <label>Birim</label>
              <select
                value={formData.unit}
                onChange={(e) => handleChange('unit', e.target.value)}
              >
                {units.map(unit => (
                  <option key={unit} value={unit}>{unit}</option>
                ))}
              </select>
            </div>
            
            <div className="form-group">
              <label>Başlangıç Stok</label>
              <input
                type="number"
                value={formData.stock}
                onChange={(e) => handleChange('stock', e.target.value)}
                min="0"
                step="1"
              />
            </div>
            
            <div className="form-group">
              <label>Minimum Stok</label>
              <input
                type="number"
                value={formData.reorderPoint}
                onChange={(e) => handleChange('reorderPoint', e.target.value)}
                min="0"
                step="1"
              />
            </div>
            
            <div className="form-group">
              <label>Alış Fiyatı</label>
              <input
                type="number"
                value={formData.costPrice}
                onChange={(e) => handleChange('costPrice', e.target.value)}
                min="0"
                step="0.01"
              />
            </div>
            
            <div className="form-group">
              <label>Satış Fiyatı</label>
              <input
                type="number"
                value={formData.sellPrice}
                onChange={(e) => handleChange('sellPrice', e.target.value)}
                min="0"
                step="0.01"
              />
            </div>
            
            <div className="form-group">
              <label>Tedarikçi</label>
              <input
                type="text"
                value={formData.supplier}
                onChange={(e) => handleChange('supplier', e.target.value)}
                placeholder="Tedarikçi adı"
              />
            </div>
            
            <div className="form-group full-width">
              <label>Açıklama</label>
              <textarea
                value={formData.description}
                onChange={(e) => handleChange('description', e.target.value)}
                placeholder="Malzeme açıklaması"
                rows="3"
              />
            </div>
          </div>
          
          {error && (
            <div className="error-message">
              {error}
            </div>
          )}
          
          <div className="modal-footer">
            <button type="button" onClick={onClose} className="btn-cancel">
              İptal
            </button>
            <button type="submit" disabled={loading} className="btn-primary">
              {loading ? 'Kaydediliyor...' : 'Kaydet'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ================================
// 4. STOCK ALERTS COMPONENT
// ================================

export function StockAlertsFirebase() {
  const { alerts, loading, error } = useStockAlerts({ 
    isActive: true 
  });
  
  if (loading) return <div>Uyarılar yükleniyor...</div>;
  if (error) return <div>Hata: {error}</div>;
  
  const criticalAlerts = alerts.filter(alert => alert.severity === 'critical');
  const warningAlerts = alerts.filter(alert => alert.severity === 'warning');
  
  return (
    <div className="stock-alerts">
      <h3>Stok Uyarıları ({alerts.length})</h3>
      
      {criticalAlerts.length > 0 && (
        <div className="alerts-section critical">
          <h4>🚨 Kritik Uyarılar ({criticalAlerts.length})</h4>
          {criticalAlerts.map(alert => (
            <AlertItem key={alert.id} alert={alert} />
          ))}
        </div>
      )}
      
      {warningAlerts.length > 0 && (
        <div className="alerts-section warning">
          <h4>⚠️ Uyarılar ({warningAlerts.length})</h4>
          {warningAlerts.map(alert => (
            <AlertItem key={alert.id} alert={alert} />
          ))}
        </div>
      )}
      
      {alerts.length === 0 && (
        <div className="no-alerts">
          ✅ Aktif uyarı bulunmuyor
        </div>
      )}
    </div>
  );
}

function AlertItem({ alert }) {
  return (
    <div className={`alert-item ${alert.severity}`}>
      <div className="alert-content">
        <strong>{alert.materialName} ({alert.materialCode})</strong>
        <p>{alert.message}</p>
        <small>
          Mevcut: {alert.currentStock} | Minimum: {alert.threshold}
        </small>
      </div>
      <div className="alert-actions">
        <button className="btn-small btn-primary">
          Stok Güncelle
        </button>
      </div>
    </div>
  );
}

// ================================
// 5. DASHBOARD STATS COMPONENT
// ================================

export function DashboardStatsFirebase() {
  const { stats, loading, error, reload } = useDashboardStats();
  
  if (loading) return <div>İstatistikler yükleniyor...</div>;
  if (error) return <div>Hata: {error}</div>;
  if (!stats) return null;
  
  return (
    <div className="dashboard-stats">
      <div className="stats-header">
        <h2>Stok Özeti</h2>
        <button onClick={reload} className="btn-small">🔄</button>
      </div>
      
      <div className="stats-grid">
        <div className="stat-card">
          <h3>Toplam Malzeme</h3>
          <span className="stat-number">{stats.totalMaterials}</span>
        </div>
        
        <div className="stat-card">
          <h3>Aktif Malzeme</h3>
          <span className="stat-number text-success">{stats.activeMaterials}</span>
        </div>
        
        <div className="stat-card">
          <h3>Düşük Stok</h3>
          <span className="stat-number text-warning">{stats.lowStockMaterials}</span>
        </div>
        
        <div className="stat-card">
          <h3>Stokta Yok</h3>
          <span className="stat-number text-danger">{stats.outOfStockMaterials}</span>
        </div>
        
        <div className="stat-card">
          <h3>Toplam Değer</h3>
          <span className="stat-number">₺{stats.totalStockValue.toLocaleString()}</span>
        </div>
      </div>
      
      <div className="categories-breakdown">
        <h3>Kategoriler</h3>
        <div className="category-list">
          {Object.entries(stats.categories).map(([category, count]) => (
            <div key={category} className="category-item">
              <span>{category}</span>
              <span className="count">{count}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ================================
// 6. KULLANIM ÖRNEĞİ - MAIN COMPONENT
// ================================

export function MaterialsManagementFirebase() {
  const [showAddModal, setShowAddModal] = useState(false);
  const [currentView, setCurrentView] = useState('list'); // list, alerts, stats
  
  return (
    <div className="materials-management">
      <header className="page-header">
        <h1>Malzeme Yönetimi</h1>
        <div className="header-actions">
          <button 
            onClick={() => setCurrentView('stats')}
            className={`btn-tab ${currentView === 'stats' ? 'active' : ''}`}
          >
            📊 İstatistikler
          </button>
          <button 
            onClick={() => setCurrentView('alerts')}
            className={`btn-tab ${currentView === 'alerts' ? 'active' : ''}`}
          >
            🚨 Uyarılar
          </button>
          <button 
            onClick={() => setCurrentView('list')}
            className={`btn-tab ${currentView === 'list' ? 'active' : ''}`}
          >
            📋 Liste
          </button>
          <button 
            onClick={() => setShowAddModal(true)}
            className="btn-primary"
          >
            + Yeni Malzeme
          </button>
        </div>
      </header>
      
      <main className="page-content">
        {currentView === 'stats' && <DashboardStatsFirebase />}
        {currentView === 'alerts' && <StockAlertsFirebase />}
        {currentView === 'list' && <MaterialsTableFirebase />}
      </main>
      
      <AddMaterialModalFirebase 
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSuccess={(material) => {
          console.log('Material created:', material);
          // Optionally show success message
        }}
      />
    </div>
  );
}

// ================================
// 7. CSS STYLES (örnek)
// ================================

const styles = `
.materials-management {
  padding: 20px;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  border-bottom: 1px solid #eee;
  padding-bottom: 15px;
}

.header-actions {
  display: flex;
  gap: 10px;
}

.btn-tab {
  padding: 8px 16px;
  border: 1px solid #ddd;
  background: white;
  cursor: pointer;
}

.btn-tab.active {
  background: #007bff;
  color: white;
}

.materials-table {
  width: 100%;
  border-collapse: collapse;
  margin: 20px 0;
}

.materials-table th,
.materials-table td {
  padding: 12px;
  text-align: left;
  border-bottom: 1px solid #ddd;
}

.material-row.low-stock {
  background-color: #fff3cd;
}

.material-row.out-of-stock {
  background-color: #f8d7da;
}

.stock-amount.low {
  color: #856404;
  font-weight: bold;
}

.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0,0,0,0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-content {
  background: white;
  padding: 20px;
  border-radius: 8px;
  max-width: 600px;
  width: 90%;
  max-height: 90vh;
  overflow-y: auto;
}

.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 15px;
}

.form-group.full-width {
  grid-column: span 2;
}

.dashboard-stats .stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 20px;
  margin: 20px 0;
}

.stat-card {
  padding: 20px;
  border: 1px solid #ddd;
  border-radius: 8px;
  text-align: center;
}

.stat-number {
  font-size: 2em;
  font-weight: bold;
  display: block;
  margin-top: 10px;
}

.text-success { color: #28a745; }
.text-warning { color: #ffc107; }
.text-danger { color: #dc3545; }

.stock-alerts .alert-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 15px;
  margin: 10px 0;
  border-radius: 5px;
}

.alert-item.critical {
  background-color: #f8d7da;
  border-left: 4px solid #dc3545;
}

.alert-item.warning {
  background-color: #fff3cd;
  border-left: 4px solid #ffc107;
}
`;

export default {
  MaterialsTableFirebase,
  AddMaterialModalFirebase,
  StockAlertsFirebase,
  DashboardStatsFirebase,
  MaterialsManagementFirebase,
  styles
};