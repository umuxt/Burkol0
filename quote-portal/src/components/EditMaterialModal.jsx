import React, { useState, useEffect } from 'react'

export default function EditMaterialModal({ isOpen, onClose, onSave, categories, types, material }) {
  const [formData, setFormData] = useState({
    code: '',
    name: '',
    type: '',
    category: '',
    unit: '',
    stock: '',
    reorderPoint: '',
    status: 'Aktif'
  });
  
  const [showNewCategory, setShowNewCategory] = useState(false);
  const [newCategory, setNewCategory] = useState('');
  const [isEditing, setIsEditing] = useState(false); // Düzenleme modu kontrolü

  // Material değiştiğinde form'u doldur
  useEffect(() => {
    if (material) {
      setFormData({
        code: material.code,
        name: material.name,
        type: material.type,
        category: material.category,
        unit: material.unit,
        stock: material.stock.toString(),
        reorderPoint: material.reorderPoint.toString(),
        status: material.status
      });
      setShowNewCategory(false);
      setNewCategory('');
      setIsEditing(false); // Modal açıldığında kilitli mod
    }
  }, [material]);

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
          <button className="modal-close" onClick={handleClose}>×</button>
        </div>
        
        <form onSubmit={handleSubmit} className="modal-form">
          <div className="form-row">
            <div className="form-group">
              <label>Malzeme Kodu</label>
              <input
                type="text"
                name="code"
                value={formData.code}
                readOnly
                className="readonly-input"
              />
              <small className="form-help">Malzeme kodu değiştirilemez</small>
            </div>

            <div className="form-group">
              <label>Malzeme Adı *</label>
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleInputChange}
                placeholder="Malzeme adını girin"
                disabled={!isEditing}
                className={!isEditing ? 'readonly-input' : ''}
                required
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Tip *</label>
              <select
                name="type"
                value={formData.type}
                onChange={handleInputChange}
                disabled={!isEditing}
                className={!isEditing ? 'readonly-input' : ''}
                required
              >
                <option value="">Tip seçin</option>
                {types.map(type => (
                  <option key={type.id} value={type.id}>{type.label}</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label>Kategori *</label>
              <select
                value={showNewCategory ? 'new-category' : formData.category}
                onChange={handleCategoryChange}
                disabled={!isEditing}
                className={!isEditing ? 'readonly-input' : ''}
                required
              >
                <option value="">Kategori seçin</option>
                {categories.map(cat => (
                  <option key={cat.id} value={cat.id}>{cat.label}</option>
                ))}
                <option value="new-category">+ Yeni Kategori Ekle</option>
              </select>
              
              {showNewCategory && (
                <input
                  type="text"
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  placeholder="Yeni kategori adı"
                  className="new-category-input"
                  disabled={!isEditing}
                  required
                />
              )}
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Birim</label>
              <input
                type="text"
                name="unit"
                value={formData.unit}
                readOnly
                className="readonly-input"
              />
              <small className="form-help">Birim değiştirilemez</small>
            </div>

            <div className="form-group">
              <label>Mevcut Stok *</label>
              <input
                type="number"
                name="stock"
                value={formData.stock}
                onChange={handleInputChange}
                placeholder="Stok miktarı"
                min="0"
                disabled={!isEditing}
                className={!isEditing ? 'readonly-input' : ''}
                required
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Reorder Point *</label>
              <input
                type="number"
                name="reorderPoint"
                value={formData.reorderPoint}
                onChange={handleInputChange}
                placeholder="Minimum stok seviyesi"
                min="0"
                disabled={!isEditing}
                className={!isEditing ? 'readonly-input' : ''}
                required
              />
            </div>

            <div className="form-group">
              <label>Durum</label>
              <select
                name="status"
                value={formData.status}
                onChange={handleInputChange}
                disabled={!isEditing}
                className={!isEditing ? 'readonly-input' : ''}
              >
                <option value="Aktif">Aktif</option>
                <option value="Pasif">Pasif</option>
              </select>
            </div>
          </div>

          <div className="modal-actions">
            <button type="button" onClick={handleClose} className="btn-cancel">
              İptal
            </button>
            {!isEditing ? (
              <button type="button" onClick={(e) => { e.preventDefault(); handleUnlock(); }} className="btn-edit">
                🔒 Düzenle
              </button>
            ) : (
              <button type="submit" className="btn-save">
                🔓 Değişiklikleri Kaydet
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  )
}