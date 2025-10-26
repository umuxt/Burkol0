import React, { useState, useEffect } from 'react';
import { categoriesService } from '../services/categories-service.js';

export default function CategoryManagementModal({ 
  isOpen, 
  onClose, 
  categories, 
  onSave,
  onRefresh,
  createCategory,
  updateCategory,
  deleteCategory,
  onOpenMaterialByCode,
  loading = false
}) {
  const [newCategoryName, setNewCategoryName] = useState('');
  const [editingIndex, setEditingIndex] = useState(-1);
  const [editingName, setEditingName] = useState('');
  const [usageMap, setUsageMap] = useState({}); // { [categoryId]: { count, materials } }

  useEffect(() => {
    if (isOpen) {
      setNewCategoryName('');
      setEditingIndex(-1);
      setEditingName('');
      setUsageMap({});
    }
  }, [isOpen, categories]);

  const handleAddCategory = async () => {
    if (newCategoryName.trim() && createCategory) {
      try {
        const newCategory = {
          name: newCategoryName.trim(),
          code: newCategoryName.substring(0, 4).toUpperCase(),
          description: `${newCategoryName.trim()} kategorisi`,
          color: '#007bff',
          sortOrder: categories.length + 1
        };
        await createCategory(newCategory);
        setNewCategoryName('');
        // Kategori listesini yenile
        if (onRefresh) {
          await onRefresh();
        }
      } catch (error) {
        console.error('Kategori ekleme hatası:', error);
        alert('Kategori eklenirken bir hata oluştu.');
      }
    }
  };

  const handleEditCategory = (index) => {
    setEditingIndex(index);
    setEditingName(categories[index].name || categories[index].label);
  };

  const handleSaveEdit = async () => {
    if (editingName.trim() && updateCategory && categories[editingIndex]) {
      try {
        const categoryToUpdate = categories[editingIndex];
        const updatedData = {
          ...categoryToUpdate,
          name: editingName.trim()
        };
        await updateCategory(categoryToUpdate.id, updatedData);
        setEditingIndex(-1);
        setEditingName('');
        // Kategori listesini yenile
        if (onRefresh) {
          await onRefresh();
        }
      } catch (error) {
        console.error('Kategori güncelleme hatası:', error);
        alert('Kategori güncellenirken bir hata oluştu.');
      }
    }
  };

  const handleCancelEdit = () => {
    setEditingIndex(-1);
    setEditingName('');
  };

  const handleDeleteCategory = async (index) => {
    const cat = categories[index]
    if (!cat) return
    try {
      // Backend API ile kategori kullanımını kontrol et
      const usage = await categoriesService.getCategoryUsage(cat.id)
      setUsageMap(prev => ({ ...prev, [cat.id]: usage }))

      if (usage?.count > 0) {
        // Kullanımda: Silmeye izin verme ve uyarı göster
        return
      }

      if (confirm('Bu kategoriyi silmek istediğinizden emin misiniz?')) {
        await deleteCategory(cat.id)
        if (onRefresh) await onRefresh()
      }
    } catch (error) {
      console.error('Kategori silme hatası:', error)
      alert('Kategori silinirken bir hata oluştu.')
    }
  };

  const handleKeyPress = (e, action) => {
    if (e.key === 'Enter') {
      action();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content category-management-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Kategori Yönetimi</h3>
          <div className="header-actions">
            <button className="close-btn" onClick={onClose}>&times;</button>
          </div>
        </div>
        
        <div className="modal-body">
          {/* Mevcut Kategoriler */}
          <div className="categories-section">
            <h4>Mevcut Kategoriler</h4>
            <div className="categories-list">
              {categories.map((category, index) => (
                <div key={category.id} className="category-item">
                  {editingIndex === index ? (
                    <div className="category-edit">
                      <input
                        type="text"
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        onKeyPress={(e) => handleKeyPress(e, handleSaveEdit)}
                        autoFocus
                        disabled={loading}
                      />
                      <div className="edit-actions">
                        <button onClick={handleSaveEdit} className="save-btn" disabled={loading}>✓</button>
                        <button onClick={handleCancelEdit} className="cancel-btn">✗</button>
                      </div>
                    </div>
                  ) : (
                    <div className="category-display">
                      <span className="category-name">{category.name || category.label}</span>
                      <div className="category-actions">
                        <button onClick={() => handleEditCategory(index)} className="edit-btn" disabled={loading}>✏️</button>
                        <button 
                          onClick={async () => { await handleDeleteCategory(index) }} 
                          className="delete-btn" 
                          disabled={loading || (usageMap[category.id]?.count > 0)}
                          title={usageMap[category.id]?.count > 0 ? 'Kullanımda olan kategoriler kaldırılamaz' : 'Sil'}
                        >
                          🗑️
                        </button>
                      </div>
                    </div>
                  )}
                  {usageMap[category.id]?.count > 0 && (
                    <div className="category-usage-warning" style={{ marginTop: 6, background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 4, padding: 8 }}>
                      <div style={{ color: '#9a3412', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>
                        Kullanımda olan kategoriler kaldırılamaz.
                      </div>
                      <div style={{ color: '#7c2d12', fontSize: 12, marginBottom: 6 }}>
                        {usageMap[category.id].materials.slice(0, 2).map(m => `${m.code} ${m.name}`).join(' ve ')} malzemesi hala bu kategoriyi kullanıyor. Lütfen silmek için önce malzeme kategorilerini güncelleyin.
                      </div>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {usageMap[category.id].materials.slice(0, 6).map(m => (
                          <button 
                            key={m.id}
                            type="button"
                            onClick={() => onOpenMaterialByCode && onOpenMaterialByCode(m.code)}
                            title={`${m.code} detayını aç`}
                            style={{
                              fontSize: 11, padding: '2px 6px', borderRadius: 4,
                              border: '1px solid #d1d5db', background: 'white', color: '#374151', cursor: 'pointer'
                            }}
                          >
                            {m.code} ℹ️
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Yeni Kategori Ekleme */}
          <div className="add-category-section">
            <h4>Yeni Kategori Ekle</h4>
            <div className="add-category-form">
              <input
                type="text"
                placeholder="Kategori adı..."
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                onKeyPress={(e) => handleKeyPress(e, handleAddCategory)}
                disabled={loading}
              />
              <button onClick={handleAddCategory} className="add-btn" disabled={loading || !newCategoryName.trim()}>
                {loading ? 'Ekleniyor...' : 'Ekle'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
