import React, { useState, useEffect } from 'react';
import { categoriesService } from '../services/categories-service.js';

// Yeni Onay Modalı Bileşeni
function DeleteConfirmationModal({ category, onConfirm, onCancel, loading }) {
  if (!category) return null;

  return (
    <div className="modal-overlay simple-confirm-modal-overlay">
      <div className="modal-content simple-confirm-modal">
        <div className="modal-header">
          <h4>Kategoriyi Silme Onayı</h4>
        </div>
        <div className="modal-body">
          <p>
            <strong>{category.name}</strong> kategorisi, kaldırılmış olan bazı malzemeler tarafından kullanılıyor.
          </p>
          <p>
            Kategoriyi silerseniz, ilgili malzemelerin kategori bilgisi sıfırlanacaktır.
          </p>
          <p className="confirm-question">
            Silmek istediğinizden emin misiniz?
          </p>
        </div>
        <div className="modal-footer">
          <button onClick={onCancel} className="btn btn-secondary" disabled={loading}>
            Hayır
          </button>
          <button onClick={onConfirm} className="btn btn-danger" disabled={loading}>
            {loading ? 'Siliniyor...' : 'Evet, Sil'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function CategoryManagementModal({ 
  isOpen, 
  onClose, 
  categories, 
  onRefresh,
  createCategory,
  updateCategory,
  deleteCategory, // Bu fonksiyon artık ikinci bir parametre alacak
  onOpenMaterialByCode,
  loading = false
}) {
  const [newCategoryName, setNewCategoryName] = useState('');
  const [editingIndex, setEditingIndex] = useState(-1);
  const [editingName, setEditingName] = useState('');
  const [usageMap, setUsageMap] = useState({});
  const [categoryToDelete, setCategoryToDelete] = useState(null); // Onay modalı için state
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setNewCategoryName('');
      setEditingIndex(-1);
      setEditingName('');
      setUsageMap({});
      setCategoryToDelete(null);
      setIsDeleting(false);
    }
  }, [isOpen]);

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
        if (onRefresh) await onRefresh();
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
        const updatedData = { ...categoryToUpdate, name: editingName.trim() };
        await updateCategory(categoryToUpdate.id, updatedData);
        setEditingIndex(-1);
        setEditingName('');
        if (onRefresh) await onRefresh();
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
    const cat = categories[index];
    if (!cat) return;

    try {
      const usage = await categoriesService.getCategoryUsage(cat.id);
      setUsageMap(prev => ({ ...prev, [cat.id]: usage }));

      // 1. Aktif kullanım var mı?
      if (usage.active && usage.active.count > 0) {
        // Aktif kullanım varsa, uyarıyı göster ve silmeyi engelle (mevcut davranış)
        return;
      }

      // 2. Sadece kaldırılmış malzemelerde mi kullanılıyor?
      if (usage.removed && usage.removed.count > 0) {
        // Onay modalını aç
        setCategoryToDelete(cat);
        return;
      }

      // 3. Hiç kullanılmıyor mu? Direkt sor ve sil.
      if (confirm('Bu kategori hiçbir malzeme tarafından kullanılmıyor. Silmek istediğinizden emin misiniz?')) {
        setIsDeleting(true);
        await deleteCategory(cat.id, false); // updateRemoved = false
        if (onRefresh) await onRefresh();
        setIsDeleting(false);
      }
    } catch (error) {
      console.error('Kategori silme hatası:', error);
      alert('Kategori silinirken bir hata oluştu.');
      setIsDeleting(false);
    }
  };

  // Onay modalından gelen silme işlemini yönet
  const handleConfirmDeletion = async () => {
    if (!categoryToDelete) return;

    setIsDeleting(true);
    try {
      await deleteCategory(categoryToDelete.id, true); // updateRemoved = true
      setCategoryToDelete(null);
      if (onRefresh) await onRefresh();
    } catch (error) {
      console.error('Kategori ve ilişkili malzeme güncelleme hatası:', error);
      alert('Kategori silinirken bir hata oluştu.');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleKeyPress = (e, action) => {
    if (e.key === 'Enter') action();
  };

  if (!isOpen) return null;

  return (
    <>
      <DeleteConfirmationModal 
        category={categoryToDelete}
        onConfirm={handleConfirmDeletion}
        onCancel={() => setCategoryToDelete(null)}
        loading={isDeleting}
      />

      <div className="modal-overlay" onClick={onClose}>
        <div className="modal-content category-management-modal" onClick={e => e.stopPropagation()}>
          <div className="modal-header">
            <h3>Kategori Yönetimi</h3>
            <button className="close-btn" onClick={onClose}>&times;</button>
          </div>
          
          <div className="modal-body">
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
                          disabled={loading || isDeleting}
                        />
                        <div className="edit-actions">
                          <button onClick={handleSaveEdit} className="save-btn" disabled={loading || isDeleting}>✓</button>
                          <button onClick={handleCancelEdit} className="cancel-btn">✗</button>
                        </div>
                      </div>
                    ) : (
                      <div className="category-display">
                        <span className="category-name">{category.name || category.label}</span>
                        <div className="category-actions">
                          <button onClick={() => handleEditCategory(index)} className="edit-btn" disabled={loading || isDeleting}>✏️</button>
                          <button 
                            onClick={() => handleDeleteCategory(index)} 
                            className="delete-btn" 
                            disabled={loading || isDeleting || (usageMap[category.id]?.active?.count > 0)}
                            title={usageMap[category.id]?.active?.count > 0 ? 'Kullanımda olan kategoriler kaldırılamaz' : 'Sil'}
                          >
                            🗑️
                          </button>
                        </div>
                      </div>
                    )}
                    {usageMap[category.id]?.active?.count > 0 && (
                      <div className="category-usage-warning" style={{ marginTop: 6, background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 4, padding: 8 }}>
                        <div style={{ color: '#9a3412', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>
                          Kullanımda olan kategoriler kaldırılamaz.
                        </div>
                        <div style={{ color: '#7c2d12', fontSize: 12, marginBottom: 6 }}>
                          {usageMap[category.id].active.materials.slice(0, 2).map(m => `${m.code} ${m.name}`).join(' ve ')} malzemesi hala bu kategoriyi kullanıyor.
                        </div>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          {usageMap[category.id].active.materials.slice(0, 6).map(m => (
                            <button 
                              key={m.id}
                              type="button"
                              onClick={() => onOpenMaterialByCode && onOpenMaterialByCode(m.code)}
                              title={`${m.code} detayını aç`}
                              style={{ fontSize: 11, padding: '2px 6px', borderRadius: 4, border: '1px solid #d1d5db', background: 'white', color: '#374151', cursor: 'pointer' }}
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

            <div className="add-category-section">
              <h4>Yeni Kategori Ekle</h4>
              <div className="add-category-form">
                <input
                  type="text"
                  placeholder="Kategori adı..."
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  onKeyPress={(e) => handleKeyPress(e, handleAddCategory)}
                  disabled={loading || isDeleting}
                />
                <button onClick={handleAddCategory} className="add-btn" disabled={loading || isDeleting || !newCategoryName.trim()}>
                  {loading ? 'Ekleniyor...' : 'Ekle'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}