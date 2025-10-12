import React, { useState, useEffect } from 'react';

export default function CategoryManagementModal({ 
  isOpen, 
  onClose, 
  categories, 
  onSave,
  onRefresh,
  createCategory,
  updateCategory,
  deleteCategory,
  loading = false
}) {
  const [newCategoryName, setNewCategoryName] = useState('');
  const [editingIndex, setEditingIndex] = useState(-1);
  const [editingName, setEditingName] = useState('');

  useEffect(() => {
    if (isOpen) {
      setNewCategoryName('');
      setEditingIndex(-1);
      setEditingName('');
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
    if (confirm('Bu kategoriyi silmek istediğinizden emin misiniz?') && deleteCategory && categories[index]) {
      try {
        await deleteCategory(categories[index].id);
        // Kategori listesini yenile
        if (onRefresh) {
          await onRefresh();
        }
      } catch (error) {
        console.error('Kategori silme hatası:', error);
        alert('Kategori silinirken bir hata oluştu.');
      }
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
                        <button onClick={() => handleDeleteCategory(index)} className="delete-btn" disabled={loading}>🗑️</button>
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