import React, { useState, useEffect } from 'react';

export default function CategoryManagementModal({ isOpen, onClose, categories, onSave }) {
  const [localCategories, setLocalCategories] = useState([]);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [editingIndex, setEditingIndex] = useState(-1);
  const [editingName, setEditingName] = useState('');

  useEffect(() => {
    if (isOpen) {
      setLocalCategories([...categories]);
      setNewCategoryName('');
      setEditingIndex(-1);
      setEditingName('');
    }
  }, [isOpen, categories]);

  const handleAddCategory = () => {
    if (newCategoryName.trim()) {
      const newId = newCategoryName.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
      const newCategory = {
        id: newId,
        label: newCategoryName.trim()
      };
      const updatedCategories = [...localCategories, newCategory];
      setLocalCategories(updatedCategories);
      onSave(updatedCategories); // Otomatik kaydet
      setNewCategoryName('');
    }
  };

  const handleEditCategory = (index) => {
    setEditingIndex(index);
    setEditingName(localCategories[index].label);
  };

  const handleSaveEdit = () => {
    if (editingName.trim()) {
      const updatedCategories = [...localCategories];
      updatedCategories[editingIndex] = {
        ...updatedCategories[editingIndex],
        label: editingName.trim()
      };
      setLocalCategories(updatedCategories);
      onSave(updatedCategories); // Otomatik kaydet
      setEditingIndex(-1);
      setEditingName('');
    }
  };

  const handleCancelEdit = () => {
    setEditingIndex(-1);
    setEditingName('');
  };

  const handleDeleteCategory = (index) => {
    if (confirm('Bu kategoriyi silmek istediğinizden emin misiniz?')) {
      const updatedCategories = localCategories.filter((_, i) => i !== index);
      setLocalCategories(updatedCategories);
      onSave(updatedCategories); // Otomatik kaydet
    }
  };

  const handleSave = () => {
    onSave(localCategories);
    onClose();
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
            <button className="save-header-btn" onClick={handleSave}>Kaydet</button>
            <button className="close-btn" onClick={onClose}>&times;</button>
          </div>
        </div>
        
        <div className="modal-body">
          {/* Mevcut Kategoriler */}
          <div className="categories-section">
            <h4>Mevcut Kategoriler</h4>
            <div className="categories-list">
              {localCategories.map((category, index) => (
                <div key={category.id} className="category-item">
                  {editingIndex === index ? (
                    <div className="category-edit">
                      <input
                        type="text"
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        onKeyPress={(e) => handleKeyPress(e, handleSaveEdit)}
                        autoFocus
                      />
                      <div className="edit-actions">
                        <button onClick={handleSaveEdit} className="save-btn">✓</button>
                        <button onClick={handleCancelEdit} className="cancel-btn">✗</button>
                      </div>
                    </div>
                  ) : (
                    <div className="category-display">
                      <span className="category-name">{category.label}</span>
                      <div className="category-actions">
                        <button onClick={() => handleEditCategory(index)} className="edit-btn">✏️</button>
                        <button onClick={() => handleDeleteCategory(index)} className="delete-btn">🗑️</button>
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
              />
              <button onClick={handleAddCategory} className="add-btn">Ekle</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}