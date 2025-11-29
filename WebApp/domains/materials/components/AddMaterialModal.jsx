import React, { useState, useEffect } from 'react'
import { useSuppliers } from '../hooks/useSuppliers.js'
import { showToast } from '../../../shared/components/MESToast.js'

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

  const inputStyle = {
    flex: 1,
    padding: '6px 8px',
    border: '1px solid #d1d5db',
    borderRadius: '4px',
    fontSize: '12px',
    background: 'white'
  };

  const labelStyle = {
    fontWeight: '600',
    fontSize: '12px',
    color: '#374151',
    minWidth: '100px',
    marginRight: '8px'
  };

  const sectionStyle = {
    marginBottom: '16px',
    padding: '12px',
    background: 'white',
    borderRadius: '6px',
    border: '1px solid #e5e7eb'
  };

  const sectionTitleStyle = {
    margin: '0 0 12px 0',
    fontSize: '14px',
    fontWeight: '600',
    color: '#111827',
    borderBottom: '1px solid #e5e7eb',
    paddingBottom: '6px'
  };

  const formContent = (
    <form id="add-material-form" onSubmit={handleSubmit}>
      {/* Temel Malzeme Bilgileri */}
      <div style={sectionStyle}>
        <h3 style={sectionTitleStyle}>Temel Malzeme Bilgileri</h3>
        
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
          <span style={labelStyle}>Malzeme Kodu:</span>
          <div style={{ flex: 1 }}>
            <input
              type="text"
              name="code"
              value={formData.code || ''}
              onChange={handleInputChange}
              placeholder={nextCode}
              style={inputStyle}
            />
            <small style={{ fontSize: '10px', color: '#6b7280', display: 'block', marginTop: '2px' }}>
              Boş bırakılırsa otomatik olarak {nextCode} atanacak
            </small>
          </div>
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
          <span style={labelStyle}>Malzeme Adı *:</span>
          <input
            type="text"
            name="name"
            value={formData.name}
            onChange={handleInputChange}
            placeholder="Malzeme adını girin"
            required
            style={inputStyle}
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
          <span style={labelStyle}>Tip *:</span>
          <select
            name="type"
            value={formData.type}
            onChange={handleInputChange}
            required
            style={inputStyle}
          >
            <option value="">Tip seçin</option>
            {types.map(type => (
              <option key={type.id} value={type.id}>{type.label}</option>
            ))}
          </select>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
          <span style={labelStyle}>
            Kategori {['processed', 'scrap'].includes(formData.type) ? '' : '*'}:
          </span>
          <div style={{ flex: 1 }}>
            <select
              value={showNewCategory ? 'new-category' : formData.category}
              onChange={handleCategoryChange}
              required={!['processed', 'scrap'].includes(formData.type)}
              style={inputStyle}
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
                style={{ ...inputStyle, marginTop: '6px' }}
              />
            )}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
          <span style={labelStyle}>Birim *:</span>
          <select
            name="unit"
            value={formData.unit}
            onChange={handleInputChange}
            required
            style={inputStyle}
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
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
        {/* Stok Bilgileri */}
        <div style={sectionStyle}>
          <h3 style={sectionTitleStyle}>Stok Bilgileri</h3>
          
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ ...labelStyle, minWidth: '80px' }}>Stok Miktarı *:</span>
            <input
              type="text"
              name="stock"
              value={formData.stock}
              onChange={handleInputChange}
              placeholder="0"
              inputMode="decimal"
              pattern="[0-9]*\.?[0-9]*"
              required
              style={inputStyle}
            />
          </div>
          
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ ...labelStyle, minWidth: '80px' }}>Reorder Point *:</span>
            <input
              type="text"
              name="reorderPoint"
              value={formData.reorderPoint}
              onChange={handleInputChange}
              placeholder="Minimum stok seviyesi"
              inputMode="decimal"
              pattern="[0-9]*\.?[0-9]*"
              required
              style={inputStyle}
            />
          </div>
        </div>

        {/* Fiyat Bilgileri */}
        <div style={sectionStyle}>
          <h3 style={sectionTitleStyle}>Fiyat Bilgileri</h3>
          
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ ...labelStyle, minWidth: '80px' }}>Maliyet Fiyatı:</span>
            <input
              type="text"
              name="costPrice"
              value={formData.costPrice}
              onChange={handleInputChange}
              placeholder="0.00"
              inputMode="decimal"
              pattern="[0-9]*\.?[0-9]*"
              style={inputStyle}
            />
          </div>
          
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ ...labelStyle, minWidth: '80px' }}>Satış Fiyatı:</span>
            <input
              type="text"
              name="sellPrice"
              value={formData.sellPrice}
              onChange={handleInputChange}
              placeholder="0.00"
              inputMode="decimal"
              pattern="[0-9]*\.?[0-9]*"
              style={inputStyle}
            />
          </div>
        </div>
      </div>

      {/* Ek Bilgiler */}
      <div style={sectionStyle}>
        <h3 style={sectionTitleStyle}>Ek Bilgiler</h3>
        
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ ...labelStyle, minWidth: '80px' }}>Tedarikçi:</span>
            <select
              name="supplier"
              value={formData.supplier}
              onChange={handleInputChange}
              style={inputStyle}
            >
              <option value="">Tedarikçi seçin</option>
              {suppliers.map(supplier => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.code} - {supplier.name || supplier.companyName}
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ ...labelStyle, minWidth: '80px' }}>Durum:</span>
            <select
              name="status"
              value={formData.status}
              onChange={handleInputChange}
              style={inputStyle}
            >
              <option value="Aktif">Aktif</option>
              <option value="Pasif">Pasif</option>
            </select>
          </div>
        </div>
        
        <div style={{ display: 'flex', alignItems: 'flex-start', marginBottom: '8px' }}>
          <span style={{ ...labelStyle, marginTop: '6px' }}>Açıklama:</span>
          <textarea
            name="description"
            value={formData.description}
            onChange={handleInputChange}
            placeholder="Malzeme açıklaması"
            rows="2"
            style={{ ...inputStyle, resize: 'vertical' }}
          />
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
        background: '#f9fafb',
        border: '1px solid #d1d5db',
        borderRadius: '8px',
        boxShadow: '0 10px 25px rgba(0,0,0,0.1)',
        minWidth: '600px',
        maxWidth: '700px',
        maxHeight: 'calc(100vh - 200px)',
        overflowY: 'auto',
        zIndex: 9999
      }}>
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center', 
          padding: '16px 20px', 
          borderBottom: '1px solid #e5e7eb',
          background: 'white',
          borderRadius: '8px 8px 0 0'
        }}>
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '600', color: '#111827' }}>
            Yeni Malzeme Ekle
          </h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button 
              type="submit" 
              form="add-material-form" 
              style={{
                padding: '8px 16px',
                background: '#3b82f6',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                fontSize: '14px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
              }}
              title="Kaydet"
            >
              💾 Kaydet
            </button>
            <button 
              onClick={handleClose}
              style={{
                padding: '8px',
                background: 'transparent',
                border: 'none',
                fontSize: '18px',
                cursor: 'pointer',
                color: '#6b7280'
              }}
            >
              ×
            </button>
          </div>
        </div>
        <div style={{ padding: '16px 20px' }}>
          {formContent}
        </div>
      </div>
    );
  }

  return (
    <div className="modal-overlay" onClick={handleClose} style={{ zIndex: 2100 }}>
      <div 
        onClick={(e) => e.stopPropagation()} 
        style={{ 
          maxWidth: '700px',
          width: '90%',
          background: '#f9fafb',
          borderRadius: '8px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          zIndex: 2102
        }}
      >
        {/* Header */}
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center', 
          padding: '16px 20px', 
          borderBottom: '1px solid #e5e7eb',
          background: 'white',
          borderRadius: '8px 8px 0 0'
        }}>
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '600', color: '#111827' }}>
            Yeni Malzeme Ekle
          </h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button 
              type="submit" 
              form="add-material-form" 
              style={{
                padding: '8px 16px',
                background: '#3b82f6',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                fontSize: '14px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
              }}
              title="Kaydet"
            >
              💾 Kaydet
            </button>
            <button 
              onClick={handleClose}
              style={{
                padding: '8px',
                background: 'transparent',
                border: 'none',
                fontSize: '18px',
                cursor: 'pointer',
                color: '#6b7280'
              }}
            >
              ×
            </button>
          </div>
        </div>
        
        {/* Body */}
        <div style={{ 
          padding: '16px 20px',
          overflowY: 'auto',
          flex: 1
        }}>
          {formContent}
        </div>
      </div>
    </div>
  );
}
