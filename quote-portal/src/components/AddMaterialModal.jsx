import React, { useState } from 'react'

export default function AddMaterialModal({ 
  isOpen, 
  onClose, 
  onSave, 
  categories, 
  types, 
  materials = [],
  loading = false,
  error = null 
}) {
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
  
  const [showNewCategory, setShowNewCategory] = useState(false);
  const [newCategory, setNewCategory] = useState('');

  // Otomatik kod oluşturma
  const generateNextCode = () => {
    if (materials.length === 0) return 'M-001';
    
    // Son malzemenin kodunu al (M-005 formatında)
    const lastCode = materials[materials.length - 1]?.code || 'M-000';
    const lastNumber = parseInt(lastCode.split('-')[1]) || 0;
    const nextNumber = lastNumber + 1;
    
    return `M-${String(nextNumber).padStart(3, '0')}`;
  };

  const nextCode = generateNextCode();

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleCategoryChange = (e) => {
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
    
    const finalCategory = showNewCategory ? newCategory : formData.category;
    const finalCode = formData.code.trim() || nextCode; // Boşsa otomatik kod kullan
    
    if (!finalCode || !formData.name || !formData.type || !finalCategory || !formData.unit || !formData.stock || !formData.reorderPoint) {
      alert('Lütfen tüm zorunlu alanları doldurun!');
      return;
    }

    // Firebase için malzeme verisi hazırla
    const materialData = {
      code: finalCode,
      name: formData.name,
      type: formData.type,
      category: finalCategory,
      unit: formData.unit,
      stock: parseInt(formData.stock) || 0,
      reorderPoint: parseInt(formData.reorderPoint) || 0,
      costPrice: parseFloat(formData.costPrice) || 0,
      sellPrice: parseFloat(formData.sellPrice) || 0,
      supplier: formData.supplier || '',
      description: formData.description || '',
      status: formData.status || 'Aktif'
    };

    onSave(materialData, showNewCategory ? newCategory : null);
    
    // Form'u sıfırla
    setFormData({
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
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Yeni Malzeme Ekle</h2>
          <button className="modal-close" onClick={handleClose}>×</button>
        </div>
        
        <form onSubmit={handleSubmit} className="modal-form">
          <div className="form-row">
            <div className="form-group">
              <label>Malzeme Kodu <span className="optional">(opsiyonel)</span></label>
              <input
                type="text"
                name="code"
                value={formData.code}
                onChange={handleInputChange}
                placeholder={nextCode}
              />
              <small className="form-help">Boş bırakılırsa otomatik olarak {nextCode} atanacak</small>
            </div>
            
            <div className="form-group">
              <label>Malzeme Adı *</label>
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleInputChange}
                placeholder="Malzeme adını girin"
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
                required
              >
                <option value="">Kategori seçin</option>
                {categories.map(cat => (
                  <option key={cat.id} value={cat.id}>{cat.name || cat.label}</option>
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
                  required
                />
              )}
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Birim *</label>
              <select
                name="unit"
                value={formData.unit}
                onChange={handleInputChange}
                required
              >
                <option value="">Birim seçin</option>
                <option value="kg">kg</option>
                <option value="adet">adet</option>
                <option value="m">m</option>
                <option value="m²">m²</option>
                <option value="m³">m³</option>
                <option value="litre">litre</option>
              </select>
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Stok Miktarı *</label>
              <input
                type="number"
                name="stock"
                value={formData.stock}
                onChange={handleInputChange}
                placeholder="0"
                min="0"
                required
              />
            </div>
            
            <div className="form-group">
              <label>Reorder Point *</label>
              <input
                type="number"
                name="reorderPoint"
                value={formData.reorderPoint}
                onChange={handleInputChange}
                placeholder="Minimum stok seviyesi"
                min="0"
                required
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Maliyet Fiyatı</label>
              <input
                type="number"
                name="costPrice"
                value={formData.costPrice}
                onChange={handleInputChange}
                placeholder="0.00"
                min="0"
                step="0.01"
              />
            </div>
            
            <div className="form-group">
              <label>Satış Fiyatı</label>
              <input
                type="number"
                name="sellPrice"
                value={formData.sellPrice}
                onChange={handleInputChange}
                placeholder="0.00"
                min="0"
                step="0.01"
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Tedarikçi</label>
              <input
                type="text"
                name="supplier"
                value={formData.supplier}
                onChange={handleInputChange}
                placeholder="Tedarikçi adı"
              />
            </div>
            
            <div className="form-group">
              <label>Açıklama</label>
              <textarea
                name="description"
                value={formData.description}
                onChange={handleInputChange}
                placeholder="Malzeme açıklaması"
                rows="2"
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Durum</label>
              <select
                name="status"
                value={formData.status}
                onChange={handleInputChange}
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
            <button type="submit" className="btn-save">
              Kaydet
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}