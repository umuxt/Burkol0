import React, { useState, useEffect } from 'react'
import { useSuppliers } from '../../../hooks/useSuppliers.js'
import { showToast } from '../../../../../shared/components/MESToast.js'

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
        const { materialsService } = await import('../../../services/materials-service.js');
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
    
    if (['stock', 'reorderPoint', 'costPrice', 'sellPrice'].includes(name)) {
      let cleanValue = value.replace(/,/g, '.');
      if (!/^[0-9.]*$/.test(cleanValue)) return;
      if ((cleanValue.match(/\./g) || []).length > 1) return;
      setFormData(prev => ({ ...prev, [name]: cleanValue }));
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
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
    const requiresCategory = !['processed', 'scrap'].includes(formData.type);
    
    if (!finalCode || !formData.name || !formData.type || (requiresCategory && !finalCategory) || !formData.unit || !formData.stock || !formData.reorderPoint) {
      showToast('Lütfen tüm zorunlu alanları doldurun!', 'warning');
      return;
    }

    const parseLocalizedNumber = (val) => {
      if (!val) return 0;
      const normalized = val.toString().replace(',', '.');
      return parseFloat(normalized) || 0;
    };

    const materialData = {
      code: finalCode,
      name: formData.name,
      type: formData.type,
      category: finalCategory,
      unit: formData.unit,
      stock: parseLocalizedNumber(formData.stock),
      reorder_point: parseLocalizedNumber(formData.reorderPoint),
      costPrice: parseLocalizedNumber(formData.costPrice),
      sellPrice: parseLocalizedNumber(formData.sellPrice),
      supplier: formData.supplier || '',
      description: formData.description || '',
      status: formData.status || 'Aktif'
    };

    onSave(materialData, showNewCategory ? newCategory : null);
    
    setFormData({
      code: '', name: '', type: '', category: '', unit: '', stock: '',
      reorderPoint: '', costPrice: '', sellPrice: '', supplier: '', description: '', status: 'Aktif'
    });
    setShowNewCategory(false);
    setNewCategory('');
  };

  const handleClose = () => {
    setFormData({
      code: '', name: '', type: '', category: '', unit: '', stock: '',
      reorderPoint: '', costPrice: '', sellPrice: '', supplier: '', description: '', status: 'Aktif'
    });
    setShowNewCategory(false);
    setNewCategory('');
    onClose();
  };

  if (!isOpen) return null;

  const formContent = (
    <form id="add-material-form" onSubmit={handleSubmit}>
      {/* Temel Malzeme Bilgileri */}
      <div className="section-card-mb">
        <h3 className="section-header">Temel Malzeme Bilgileri</h3>
        
        <div className="detail-row">
          <span className="modal-label">Malzeme Kodu:</span>
          <div className="flex-1">
            <input
              type="text"
              name="code"
              value={formData.code || ''}
              onChange={handleInputChange}
              placeholder={nextCode}
              className="modal-input"
            />
            <small className="text-hint-xs-block">
              Boş bırakılırsa otomatik olarak {nextCode} atanacak
            </small>
          </div>
        </div>
        
        <div className="detail-row">
          <span className="modal-label">Malzeme Adı *:</span>
          <input
            type="text"
            name="name"
            value={formData.name}
            onChange={handleInputChange}
            placeholder="Malzeme adını girin"
            required
            className="modal-input"
          />
        </div>

        <div className="detail-row">
          <span className="modal-label">Tip *:</span>
          <select
            name="type"
            value={formData.type}
            onChange={handleInputChange}
            required
            className="modal-input"
          >
            <option value="">Tip seçin</option>
            {types.map(type => (
              <option key={type.id} value={type.id}>{type.label}</option>
            ))}
          </select>
        </div>

        <div className="detail-row">
          <span className="modal-label">
            Kategori {['processed', 'scrap'].includes(formData.type) ? '' : '*'}:
          </span>
          <div className="flex-1">
            <select
              value={showNewCategory ? 'new-category' : formData.category}
              onChange={handleCategoryChange}
              required={!['processed', 'scrap'].includes(formData.type)}
              className="modal-input"
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
                required
                className="modal-input-mt"
              />
            )}
          </div>
        </div>

        <div className="detail-row">
          <span className="modal-label">Birim *:</span>
          <select
            name="unit"
            value={formData.unit}
            onChange={handleInputChange}
            required
            className="modal-input"
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

      {/* Stok ve Fiyat Bilgileri */}
      <div className="supplier-grid-2-mb">
        {/* Stok Bilgileri */}
        <div className="section-card-mb">
          <h3 className="section-header">Stok Bilgileri</h3>
          
          <div className="detail-row">
            <span className="modal-label-80">Stok Miktarı *:</span>
            <input
              type="text"
              name="stock"
              value={formData.stock}
              onChange={handleInputChange}
              placeholder="0"
              inputMode="decimal"
              pattern="[0-9]*\.?[0-9]*"
              required
              className="modal-input"
            />
          </div>
          
          <div className="detail-row">
            <span className="modal-label-80">Reorder Point *:</span>
            <input
              type="text"
              name="reorderPoint"
              value={formData.reorderPoint}
              onChange={handleInputChange}
              placeholder="Minimum stok seviyesi"
              inputMode="decimal"
              pattern="[0-9]*\.?[0-9]*"
              required
              className="modal-input"
            />
          </div>
        </div>

        {/* Fiyat Bilgileri */}
        <div className="section-card-mb">
          <h3 className="section-header">Fiyat Bilgileri</h3>
          
          <div className="detail-row">
            <span className="modal-label-80">Maliyet Fiyatı:</span>
            <input
              type="text"
              name="costPrice"
              value={formData.costPrice}
              onChange={handleInputChange}
              placeholder="0.00"
              inputMode="decimal"
              pattern="[0-9]*\.?[0-9]*"
              className="modal-input"
            />
          </div>
          
          <div className="detail-row">
            <span className="modal-label-80">Satış Fiyatı:</span>
            <input
              type="text"
              name="sellPrice"
              value={formData.sellPrice}
              onChange={handleInputChange}
              placeholder="0.00"
              inputMode="decimal"
              pattern="[0-9]*\.?[0-9]*"
              className="modal-input"
            />
          </div>
        </div>
      </div>

      {/* Ek Bilgiler */}
      <div className="section-card-mb">
        <h3 className="section-header">Ek Bilgiler</h3>
        
        <div className="supplier-grid-2">
          <div className="detail-row">
            <span className="modal-label-80">Tedarikçi:</span>
            <select
              name="supplier"
              value={formData.supplier}
              onChange={handleInputChange}
              className="modal-input"
            >
              <option value="">Tedarikçi seçin</option>
              {suppliers.map(supplier => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.code} - {supplier.name || supplier.companyName}
                </option>
              ))}
            </select>
          </div>

          <div className="detail-row">
            <span className="modal-label-80">Durum:</span>
            <select
              name="status"
              value={formData.status}
              onChange={handleInputChange}
              className="modal-input"
            >
              <option value="Aktif">Aktif</option>
              <option value="Pasif">Pasif</option>
            </select>
          </div>
        </div>
        
        <div className="detail-row-start">
          <span className="modal-label-mt">Açıklama:</span>
          <textarea
            name="description"
            value={formData.description}
            onChange={handleInputChange}
            placeholder="Malzeme açıklaması"
            rows="2"
            className="modal-input-textarea"
          />
        </div>
      </div>
    </form>
  );

  if (isInline) {
    return (
      <div className="modal-inline-container">
        <div className="modal-header">
          <h2 className="modal-title">
            Yeni Malzeme Ekle
          </h2>
          <div className="flex-center-gap-8">
            <button 
              type="submit" 
              form="add-material-form" 
              className="btn-save-primary"
              title="Kaydet"
            >
              💾 Kaydet
            </button>
            <button 
              onClick={handleClose}
              className="btn-close-modal"
            >
              ×
            </button>
          </div>
        </div>
        <div className="modal-body-inline">
          {formContent}
        </div>
      </div>
    );
  }

  return (
    <div className="modal-overlay" onClick={handleClose} style={{ zIndex: 2100 }}>
      <div 
        onClick={(e) => e.stopPropagation()} 
        className="modal-container"
      >
        {/* Header */}
        <div className="modal-header">
          <h2 className="modal-title">
            Yeni Malzeme Ekle
          </h2>
          <div className="flex-center-gap-8">
            <button 
              type="submit" 
              form="add-material-form" 
              className="btn-save-primary"
              title="Kaydet"
            >
              💾 Kaydet
            </button>
            <button 
              onClick={handleClose}
              className="btn-close-modal"
            >
              ×
            </button>
          </div>
        </div>
        
        {/* Body */}
        <div className="modal-body">
          {formContent}
        </div>
      </div>
    </div>
  );
}
