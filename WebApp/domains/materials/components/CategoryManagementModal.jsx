import React, { useState, useEffect } from 'react';
import { categoriesService } from '../services/categories-service.js';
import { showToast } from '../../../shared/components/MESToast.js';

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
  const [usageMap, setUsageMap] = useState({}); // Category usage için
  const [isDeleting, setIsDeleting] = useState(false); // Deletion state

  useEffect(() => {
    if (isOpen) {
      setNewCategoryName('');
      setEditingIndex(-1);
      setEditingName('');
      setUsageMap({}); // Modal açıldığında usage map'i temizle
      // Usage bilgilerini sadece delete'e tıklandığında yükle
    }
  }, [isOpen]);

  // Categories listesi değiştiğinde usageMap'i temizle (kullanıcı modal açıkken malzeme güncellemiş olabilir)
  useEffect(() => {
    setUsageMap({});
  }, [categories.length, categories.map(c => c.id).join(',')]);

  // loadCategoryUsages kaldırıldı - sadece delete'e tıklandığında usage yüklenir

  const handleAddCategory = async () => {
    if (newCategoryName.trim() && createCategory) {
      try {
        // useCategorySync sadece category name (string) bekliyor
        await createCategory(newCategoryName.trim());
        setNewCategoryName('');
        if (onRefresh) await onRefresh();
      } catch (error) {
        console.error('Kategori ekleme hatası:', error);
        showToast('Kategori eklenirken bir hata oluştu.', 'error');
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
        showToast('Kategori güncellenirken bir hata oluştu.', 'error');
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

    setIsDeleting(true);
    try {
      // Her silme denemesinde usage bilgisini fresh olarak al (cache kullanma)
      // Kullanıcı modal açıkken malzemeleri update etmiş olabilir
      const usage = await categoriesService.getCategoryUsage(cat.id);
      setUsageMap(prev => ({ 
        ...prev, 
        [cat.id]: {
          active: {
            count: usage.active || 0,
            materials: usage.activeMaterials || []
          },
          removed: {
            count: usage.removed || 0,
            materials: usage.removedMaterials || []
          }
        }
      }));

      // useCategorySync'in kendi mantığını kullan (tüm senaryoları handle eder)
      await deleteCategory(cat.id);
      
      // Silme başarılıysa usage'ı temizle
      setUsageMap(prev => {
        const newMap = { ...prev };
        delete newMap[cat.id];
        return newMap;
      });
      
    } catch (error) {
      if (error.message === 'ACTIVE_USAGE') {
        // Aktif kullanım var - usageMap güncellendi, ℹ️ butonlu uyarı görünecek
        // Fresh data yüklendi, kullanıcı güncel bilgiyi görecek
        return;
      }
      console.error('Kategori silme hatası:', error);
      // Diğer hatalar için useCategorySync zaten alert gösteriyor
    } finally {
      setIsDeleting(false);
    }
  };

  // handleConfirmDeletion artık gerekli değil - useCategorySync tüm onay mantığını içeriyor

  const handleKeyPress = (e, action) => {
    if (e.key === 'Enter') action();
  };

  if (!isOpen) return null;

  return (
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
                      <div className="category-usage-warning">
                        <div className="category-usage-title">
                          Kullanımda olan kategoriler kaldırılamaz.
                        </div>
                        <div className="category-usage-text">
                          {usageMap[category.id].active.materials.slice(0, 2).map(m => `${m.code} ${m.name}`).join(' ve ')} malzemesi hala bu kategoriyi kullanıyor.
                        </div>
                        <div className="category-usage-buttons">
                          {usageMap[category.id].active.materials.slice(0, 6).map(m => (
                            <button 
                              key={m.id}
                              type="button"
                              onClick={() => onOpenMaterialByCode && onOpenMaterialByCode(m.code)}
                              title={`${m.code} detayını aç`}
                              className="category-material-btn"
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
  );
}