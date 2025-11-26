import React, { useState, useEffect } from 'react'
import { useSuppliers } from '../hooks/useSuppliers.js'

export default function AddMaterialModal({ 
  isOpen, 
  onClose, 
  onSave, 
  categories, 
  types, 
  materials = [],
  loading = false,
  error = null,
  isInline = false
}) {
  const { suppliers } = useSuppliers(isOpen)
  
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
  const [allMaterials, setAllMaterials] = useState([]);
  const [nextCode, setNextCode] = useState(() => {
    if (materials && materials.length > 0) {
      const existingNumbers = materials
        .map(material => {
          const code = material.code || '';
          const match = code.match(/^M-(\d+)$/);
          return match ? parseInt(match[1]) : null;
        })
        .filter(num => num !== null)
        .sort((a, b) => a - b);
      
      let nextNumber = 1;
      for (const num of existingNumbers) {
        if (num === nextNumber) {
          nextNumber++;
        } else if (num > nextNumber) {
          break;
        }
      }
      
      return `M-${String(nextNumber).padStart(3, '0')}`;
    }
    return 'M-001';
  });
  
  useEffect(() => {
    const loadAllMaterials = async () => {
      try {
        const { materialsService } = await import('../services/materials-service.js');
        const allMaterialsList = await materialsService.getAllMaterials();
        setAllMaterials(allMaterialsList);
      } catch (error) {
        setAllMaterials(materials);
      }
    };
    
    if (isOpen && allMaterials.length === 0) {
      loadAllMaterials();
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
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
    }
  }, [isOpen]);

  useEffect(() => {
    const materialsForCodeGen = allMaterials.length > 0 ? allMaterials : materials;
    
    if (materialsForCodeGen.length === 0) {
      setNextCode('M-001');
      return;
    }
    
    const existingNumbers = materialsForCodeGen
      .map(material => {
        const code = material.code || '';
        const match = code.match(/^M-(\d+)$/);
        return match ? parseInt(match[1]) : null;
      })
      .filter(num => num !== null)
      .sort((a, b) => a - b);
    
    let nextNumber = 1;
    for (const num of existingNumbers) {
      if (num === nextNumber) {
        nextNumber++;
      } else if (num > nextNumber) {
        break;
      }
    }
    
    const newCode = `M-${String(nextNumber).padStart(3, '0')}`;
    setNextCode(newCode);
  }, [allMaterials, materials]);

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
    const finalCode = formData.code.trim() || nextCode;
    
    // Category is optional for finished_product, semi_finished, and scrap
    const requiresCategory = !['finished_product', 'semi_finished', 'scrap'].includes(formData.type);
    
    if (!finalCode || !formData.name || !formData.type || (requiresCategory && !finalCategory) || !formData.unit || !formData.stock || !formData.reorderPoint) {
      alert('Lütfen tüm zorunlu alanları doldurun!');
      return;
    }

    const materialData = {
      code: finalCode,
      name: formData.name,
      type: formData.type,
      category: finalCategory,
      unit: formData.unit,
      stock: parseInt(formData.stock) || 0,
      reorder_point: parseInt(formData.reorderPoint) || 0,
      costPrice: parseFloat(formData.costPrice) || 0,
      sellPrice: parseFloat(formData.sellPrice) || 0,
      supplier: formData.supplier || '',
      description: formData.description || '',
      status: formData.status || 'Aktif'
    };

    onSave(materialData, showNewCategory ? newCategory : null);
    
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
    onClose();
  };

  if (!isOpen) return null;

  const formContent = (
    <form id="add-material-form" onSubmit={handleSubmit} className="modal-form">
      <div className="form-row">
        <div className="form-group">
          <label>Malzeme Kodu <span className="optional">(opsiyonel)</span></label>
          <input
            type="text"
            name="code"
            value={formData.code || nextCode}
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
          <label>
            Kategori {['finished_product', 'semi_finished', 'scrap'].includes(formData.type) 
              ? <span className="optional">(opsiyonel)</span> 
              : '*'}
          </label>
          <select
            value={showNewCategory ? 'new-category' : formData.category}
            onChange={handleCategoryChange}
            required={!['finished_product', 'semi_finished', 'scrap'].includes(formData.type)}
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
          <select
            name="supplier"
            value={formData.supplier}
            onChange={handleInputChange}
          >
            <option value="">Tedarikçi seçin</option>
            {suppliers.map(supplier => (
              <option key={supplier.id} value={supplier.id}>
                {supplier.code} - {supplier.name || supplier.companyName}
              </option>
            ))}
          </select>
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
          </select>
        </div>
      </div>
    </form>
  );

  if (isInline) {
    return (
      <div style={{
        position: 'absolute',
        top: '100%',
        right: 0,
        marginTop: '8px',
        background: 'white',
        border: '1px solid #d1d5db',
        borderRadius: '8px',
        boxShadow: '0 10px 25px rgba(0,0,0,0.1)',
        minWidth: '600px',
        maxWidth: '700px',
        maxHeight: 'calc(100vh - 200px)',
        overflowY: 'auto',
        zIndex: 9999
      }}>
        <div className="modal-header">
          <h2>Yeni Malzeme Ekle</h2>
          <div className="header-actions">
            <button type="submit" form="add-material-form" className="btn-save" title="Kaydet">
              💾 Kaydet
            </button>
            <button className="modal-close" onClick={handleClose}>×</button>
          </div>
        </div>
        {formContent}
      </div>
    );
  }

  return (
    <div className="modal-overlay" onClick={handleClose} style={{ zIndex: 2100 }}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '700px', zIndex: 2102 }}>
        <div className="modal-header">
          <h2>Yeni Malzeme Ekle</h2>
          <div className="header-actions">
            <button type="submit" form="add-material-form" className="btn-save" title="Kaydet">
              💾 Kaydet
            </button>
            <button className="modal-close" onClick={handleClose}>×</button>
          </div>
        </div>
        {formContent}
      </div>
    </div>
  );
}
