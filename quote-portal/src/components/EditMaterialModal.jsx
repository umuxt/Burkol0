import React, { useState, useEffect } from 'react'

// Geçici mock data - Firebase bağlandığında kaldırılacak
const mockSuppliers = [
  {
    name: 'Kocaeli Metal San. A.Ş.',
    contactPerson: 'Mehmet Yılmaz',
    phone: '+90 262 555 0101',
    email: 'mehmet@kocaelimetal.com',
    status: 'Aktif',
    lastPrice: 45.50,
    lastSupplyDate: '2024-10-08'
  },
  {
    name: 'Ankara Plastik Ltd.',
    contactPerson: 'Ayşe Kaya',
    phone: '+90 312 555 0202',
    email: 'ayse@ankaraplastik.com',
    status: 'Aktif',
    lastPrice: 32.75,
    lastSupplyDate: '2024-10-05'
  },
  {
    name: 'İzmir Alüminyum A.Ş.',
    contactPerson: 'Ali Demir',
    phone: '+90 232 555 0303',
    email: 'ali@izmiraluminyum.com',
    status: 'Pasif',
    lastPrice: 28.90,
    lastSupplyDate: '2024-09-20'
  }
];

export default function EditMaterialModal({ isOpen, onClose, onSave, onDelete, categories, types, material }) {
  const [formData, setFormData] = useState({
    code: '',
    name: '',
    type: '',
    category: '',
    unit: '',
    stock: '',
    reorderPoint: '',
    costPrice: '',
    sellPrice: '',
    supplier: '',
    description: '',
    status: 'Aktif'
  });
  
  const [originalData, setOriginalData] = useState(null); // Orijinal veriyi sakla
  const [showNewCategory, setShowNewCategory] = useState(false);
  const [newCategory, setNewCategory] = useState('');
  const [isEditing, setIsEditing] = useState(false); // Düzenleme modu kontrolü

  // Material değiştiğinde form'u doldur
  useEffect(() => {
    if (material) {
      console.log('🔍 EditMaterialModal - Material data:', material);
      console.log('🔍 EditMaterialModal - Categories:', categories);
      console.log('🔍 EditMaterialModal - Material category:', material.category);
      
      const materialFormData = {
        code: material.code,
        name: material.name,
        type: material.type,
        category: material.category,
        unit: material.unit,
        stock: material.stock.toString(),
        reorderPoint: material.reorderPoint.toString(),
        costPrice: material.costPrice ? material.costPrice.toString() : '',
        sellPrice: material.sellPrice ? material.sellPrice.toString() : '',
        supplier: material.supplier || '',
        description: material.description || '',
        status: material.status
      };
      
      setFormData(materialFormData);
      setOriginalData(materialFormData); // Orijinal veriyi sakla
      setShowNewCategory(false);
      setNewCategory('');
      setIsEditing(false); // Modal açıldığında kilitli mod
    }
  }, [material, categories]);

  const handleInputChange = (e) => {
    // Sadece editing mode'dayken input değişikliğine izin ver
    if (!isEditing) {
      return;
    }
    
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleUnlock = () => {
    setIsEditing(true);
  };

  const handleCategoryChange = (e) => {
    // Sadece editing mode'dayken kategori değişikliğine izin ver
    if (!isEditing) {
      return;
    }
    
    const value = e.target.value;
    if (value === 'new-category') {
      setShowNewCategory(true);
      setFormData(prev => ({ ...prev, category: '' }));
    } else {
      setShowNewCategory(false);
      setFormData(prev => ({ ...prev, category: value }));
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    
    // Sadece editing mode'dayken submit et
    if (!isEditing) {
      return;
    }
    
    const finalCategory = showNewCategory ? newCategory : formData.category;
    
    if (!formData.name || !formData.type || !finalCategory || !formData.stock || !formData.reorderPoint) {
      alert('Lütfen tüm zorunlu alanları doldurun!');
      return;
    }

    // Değişiklik kontrolü - orijinal veri ile karşılaştır
    if (originalData) {
      const currentData = {
        ...formData,
        category: finalCategory
      };
      
      const hasChanges = Object.keys(currentData).some(key => {
        return currentData[key] !== originalData[key];
      });
      
      // Yeni kategori eklenmişse değişiklik sayılır
      const hasNewCategory = showNewCategory && newCategory.trim() !== '';
      
      if (!hasChanges && !hasNewCategory) {
        alert('Herhangi bir değişiklik yapılmadı!');
        setIsEditing(false); // Editing mode'dan çık
        return;
      }
      
      console.log('📝 Değişiklik tespit edildi, kayıt işlemi başlatılıyor...');
    }

    const materialData = {
      ...formData,
      category: finalCategory,
      stock: parseInt(formData.stock),
      reorderPoint: parseInt(formData.reorderPoint)
    };

    onSave(materialData, showNewCategory ? newCategory : null);
    
    // Kaydet işleminden sonra kilitli moda dön
    setIsEditing(false);
    setShowNewCategory(false);
    setNewCategory('');
  };

  const handleClose = () => {
    // Form'u sıfırla
    setFormData({
      code: '',
      name: '',
      type: '',
      category: '',
      unit: '',
      stock: '',
      reorderPoint: '',
      status: 'Aktif'
    });
    setOriginalData(null); // Orijinal veriyi de temizle
    setShowNewCategory(false);
    setNewCategory('');
    setIsEditing(false); // Editing mode'u resetle
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Malzeme Detayları</h2>
          <div className="header-actions">
            {!isEditing ? (
              <button type="button" onClick={(e) => { e.preventDefault(); handleUnlock(); }} className="btn-edit" title="Düzenle">
                🔒 Düzenle
              </button>
            ) : (
              <button type="submit" form="edit-material-form" className="btn-save" title="Kaydet">
                🔓 Kaydet
              </button>
            )}
            {onDelete && (
              <button 
                type="button" 
                onClick={() => {
                  onDelete(material.id);
                  onClose();
                }} 
                className="btn-delete"
                title="Sil"
              >
                🗑️
              </button>
            )}
            <button className="modal-close" onClick={handleClose}>×</button>
          </div>
        </div>
        
        <form id="edit-material-form" onSubmit={handleSubmit} className="modal-form material-details-layout">
          {/* Üst kısım - 2 kolon */}
          <div className="details-top-section">
            {/* Sol kolon - Ana bilgiler */}
            <div className="details-left-section">
              <h3>Malzeme Bilgileri</h3>
              
              <div className="details-content">
                <div className="detail-item">
                  <span className="detail-label">Malzeme Kodu:</span>
                  <span className="detail-value">{formData.code}</span>
                </div>
                
                <div className="detail-item">
                  <span className="detail-label">Malzeme Adı:</span>
                  {!isEditing ? (
                    <span className="detail-value">{formData.name}</span>
                  ) : (
                    <input
                      type="text"
                      name="name"
                      value={formData.name}
                      onChange={handleInputChange}
                      className="detail-input"
                      required
                    />
                  )}
                </div>
                
                <div className="detail-item">
                  <span className="detail-label">Malzeme Tipi:</span>
                  {!isEditing ? (
                    <span className="detail-value">{types.find(type => type.id === formData.type)?.label || formData.type || 'Tip seçilmemiş'}</span>
                  ) : (
                    <select
                      name="type"
                      value={formData.type}
                      onChange={handleInputChange}
                      className="detail-input"
                      required
                    >
                      <option value="">Tip seçin</option>
                      {types.map(type => (
                        <option key={type.id} value={type.id}>{type.label}</option>
                      ))}
                    </select>
                  )}
                </div>
                
                <div className="detail-item">
                  <span className="detail-label">Kategori:</span>
                  {!isEditing ? (
                    <span className="detail-value">{categories.find(cat => cat.id === formData.category)?.name || formData.category || 'Kategori seçilmemiş'}</span>
                  ) : (
                    <>
                      {!showNewCategory ? (
                        <select
                          value={formData.category}
                          onChange={handleCategoryChange}
                          className="detail-input"
                          required
                        >
                          <option value="">Kategori seçin</option>
                          {categories.map(cat => (
                            <option key={cat.id} value={cat.id}>{cat.name || cat.label}</option>
                          ))}
                          <option value="new-category">+ Yeni Kategori Ekle</option>
                        </select>
                      ) : (
                        <input
                          type="text"
                          value={newCategory}
                          onChange={(e) => setNewCategory(e.target.value)}
                          placeholder="Yeni kategori adı"
                          className="detail-input"
                          required
                        />
                      )}
                    </>
                  )}
                </div>
                
                <div className="detail-item">
                  <span className="detail-label">Açıklama:</span>
                  {!isEditing ? (
                    <span className="detail-value description">{formData.description || 'Açıklama girilmemiş'}</span>
                  ) : (
                    <textarea
                      name="description"
                      value={formData.description}
                      onChange={handleInputChange}
                      placeholder="Malzeme açıklaması"
                      className="detail-input"
                      rows="2"
                    />
                  )}
                </div>
              </div>
            </div>
            
            {/* Sağ kolon - Tedarikçiler */}
            <div className="details-right-section">
              <div className="suppliers-section" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                <h3 style={{ 
                  fontSize: '14px', 
                  fontWeight: '600', 
                  marginBottom: '12px',
                  color: '#374151',
                  borderBottom: '1px solid #e5e7eb',
                  paddingBottom: '6px',
                  flexShrink: 0
                }}>
                  Tedarikçiler
                </h3>
                
                {/* Kaydırılabilir Tedarikçiler Listesi */}
                <div 
                  className="suppliers-list" 
                  style={{ 
                    flex: 1,
                    overflowY: 'auto',
                    paddingRight: '4px'
                  }}
                >
                  {/* Geçici veri - Firebase bağlandığında dinamik olacak */}
                  {mockSuppliers.map((supplier, index) => (
                    <div 
                      key={index}
                      className="supplier-card"
                      style={{
                        padding: '6px',
                        border: '1px solid #e5e7eb',
                        borderRadius: '6px',
                        marginBottom: '4px',
                        backgroundColor: '#ffffff',
                        transition: 'all 0.2s ease'
                      }}
                    >
                      {/* Tek Satır - Tüm İçerik */}
                      <div style={{ 
                        display: 'flex', 
                        justifyContent: 'space-between', 
                        alignItems: 'center',
                        gap: '8px'
                      }}>
                        {/* Sol Taraf - Tedarikçi Adı ve Durum */}
                        <div style={{ 
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          flex: 1,
                          minWidth: 0
                        }}>
                          <div style={{ 
                            fontWeight: '600', 
                            fontSize: '11px',
                            color: '#111827',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            flex: 1
                          }}>
                            {supplier.name}
                          </div>
                          <span 
                            style={{ 
                              backgroundColor: supplier.status === 'Aktif' ? '#dcfce7' : '#fee2e2',
                              color: supplier.status === 'Aktif' ? '#16a34a' : '#dc2626',
                              padding: '1px 3px',
                              borderRadius: '3px',
                              fontSize: '7px',
                              fontWeight: '500',
                              flexShrink: 0
                            }}
                          >
                            {supplier.status}
                          </span>
                        </div>
                        
                        {/* Sağ Taraf - Butonlar */}
                        <div style={{ 
                          display: 'flex', 
                          alignItems: 'center',
                          gap: '4px',
                          flexShrink: 0
                        }}>
                          {/* Info Butonu */}
                          <button
                            style={{
                              background: '#f3f4f6',
                              border: '1px solid #d1d5db',
                              borderRadius: '3px',
                              padding: '2px 4px',
                              cursor: 'pointer',
                              fontSize: '8px',
                              fontWeight: '500',
                              color: '#374151',
                              transition: 'all 0.2s ease'
                            }}
                            onClick={(e) => {
                              e.stopPropagation();
                              console.log('Tedarikçi detayı açılacak:', supplier.name);
                            }}
                            title={`${supplier.name} detaylarını görüntüle`}
                            onMouseOver={(e) => {
                              e.target.style.background = '#e5e7eb';
                              e.target.style.borderColor = '#9ca3af';
                            }}
                            onMouseOut={(e) => {
                              e.target.style.background = '#f3f4f6';
                              e.target.style.borderColor = '#d1d5db';
                            }}
                          >
                            ℹ️
                          </button>
                          
                          {/* İletişim Butonları */}
                          <button
                            style={{
                              background: 'none',
                              border: 'none',
                              cursor: 'pointer',
                              padding: '2px',
                              borderRadius: '3px',
                              fontSize: '10px',
                              lineHeight: 1
                            }}
                            onClick={(e) => {
                              e.stopPropagation();
                              window.open(`tel:${supplier.phone}`);
                            }}
                            title={`Telefon: ${supplier.phone}`}
                            onMouseOver={(e) => e.target.style.background = '#dbeafe'}
                            onMouseOut={(e) => e.target.style.background = 'none'}
                          >
                            📞
                          </button>
                          <button
                            style={{
                              background: 'none',
                              border: 'none',
                              cursor: 'pointer',
                              padding: '2px',
                              borderRadius: '3px',
                              fontSize: '10px',
                              lineHeight: 1
                            }}
                            onClick={(e) => {
                              e.stopPropagation();
                              window.open(`mailto:${supplier.email}`);
                            }}
                            title={`Email: ${supplier.email}`}
                            onMouseOver={(e) => e.target.style.background = '#fef3c7'}
                            onMouseOut={(e) => e.target.style.background = 'none'}
                          >
                            ✉️
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                  
                  {/* Boş Durum */}
                  {mockSuppliers.length === 0 && (
                    <div style={{ 
                      textAlign: 'center', 
                      padding: '16px 8px', 
                      color: '#6b7280', 
                      fontSize: '11px',
                      border: '1px dashed #e5e7eb',
                      borderRadius: '6px',
                      backgroundColor: '#f9fafb'
                    }}>
                      <div style={{ fontSize: '16px', marginBottom: '4px' }}>🏢</div>
                      <div style={{ fontWeight: '500', marginBottom: '2px' }}>Tedarikçi yok</div>
                      <div style={{ fontSize: '9px', color: '#9ca3af' }}>Bu malzemeyi tedarik eden firma bulunmuyor</div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
          
          {/* Alt kısım - Stok bilgileri (2x2 Grid) */}
          <div className="details-bottom-section">
            <h3>Stok Bilgileri</h3>
            
            <div className="details-content">
              <div className="stock-info-grid">
                <div className="detail-item">
                  <span className="detail-label">Birim:</span>
                  <span className="detail-value">{formData.unit}</span>
                </div>
                
                <div className="detail-item">
                  <span className="detail-label">Mevcut Stok:</span>
                  {!isEditing ? (
                    <span className="detail-value">{formData.stock}</span>
                  ) : (
                    <input
                      type="number"
                      name="stock"
                      value={formData.stock}
                      onChange={handleInputChange}
                      className="detail-input"
                      min="0"
                      required
                    />
                  )}
                </div>
                
                <div className="detail-item">
                  <span className="detail-label">Reorder Point:</span>
                  {!isEditing ? (
                    <span className="detail-value">{formData.reorderPoint}</span>
                  ) : (
                    <input
                      type="number"
                      name="reorderPoint"
                      value={formData.reorderPoint}
                      onChange={handleInputChange}
                      className="detail-input"
                      min="0"
                      required
                    />
                  )}
                </div>
                
                <div className="detail-item">
                  <span className="detail-label">Durum:</span>
                  {!isEditing ? (
                    <span className="detail-value">{formData.status}</span>
                  ) : (
                    <select
                      name="status"
                      value={formData.status}
                      onChange={handleInputChange}
                      className="detail-input"
                    >
                      <option value="Aktif">Aktif</option>
                      <option value="Pasif">Pasif</option>
                    </select>
                  )}
                </div>
              </div>
            </div>
          </div>
          
          {/* Tedarik geçmişi tablosu */}
          <div className="supply-history-section">
            <h3>Tedarik Geçmişi</h3>
            <div className="supply-history-table">
              <table>
                <thead>
                  <tr>
                    <th>Tarih</th>
                    <th>Tedarikçi</th>
                    <th>Miktar</th>
                    <th>Birim Fiyat</th>
                    <th>Toplam</th>
                    <th>Durum</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td colSpan="6" className="no-data">Henüz tedarik geçmişi bulunmuyor</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

        </form>
      </div>
    </div>
  )
}