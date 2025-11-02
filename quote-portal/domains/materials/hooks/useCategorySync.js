
import { useCallback } from 'react';

/**
 * Kategori ve Malzeme verilerini senkronize eden merkezi bir hook.
 * Kategori işlemlerinden (ekleme, güncelleme, silme) sonra veri bütünlüğünü
 * sağlamak için hem kategori hem de malzeme listelerini güvenilir bir şekilde yeniler.
 *
 * @param {object} params
 * @param {() => Promise<void>} params.refreshCategories - Kategori listesini yeniden yükleyen fonksiyon.
 * @param {(force?: boolean) => Promise<void>} params.refreshMaterials - Malzeme listesini yeniden yükleyen fonksiyon.
 * @returns {{createCategory: (categoryName: string) => Promise<any>, updateCategory: (id: string, newName: string) => Promise<void>, deleteCategory: (id: string) => Promise<void>}}
 */
export const useCategorySync = ({ refreshCategories, refreshMaterials }) => {

  const API_BASE_URL = '/api/material-categories';

  // YENİ KATEGORİ OLUŞTURMA
  const createCategory = useCallback(async (categoryName) => {
    try {
      const response = await fetch(API_BASE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: categoryName }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Kategori oluşturulamadı.');
      }

      const newCategory = await response.json();
      
      // Veri yenileme
      await refreshCategories();
      // Yeni kategori malzemeleri etkilemez ama tutarlılık için refreshMaterials de çağrılabilir.
      // Şimdilik sadece kategori yenilemesi yeterli.
      
      return newCategory;

    } catch (error) {
      console.error("Kategori oluşturma hatası:", error);
      alert(`Hata: ${error.message}`);
      throw error;
    }
  }, [refreshCategories]);


  // KATEGORİ GÜNCELLEME
  const updateCategory = useCallback(async (id, newName) => {
    try {
      const response = await fetch(`${API_BASE_URL}/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Kategori güncellenemedi.');
      }

      // Veri yenileme
      await refreshCategories();
      await refreshMaterials(true); // Kategori adı değiştiğinde malzeme ekranında da güncel görünmeli

    } catch (error) {
      console.error(`Kategori ${id} güncelleme hatası:`, error);
      alert(`Hata: ${error.message}`);
    }
  }, [refreshCategories, refreshMaterials]);


  // KATEGORİ SİLME (YENİ AKIŞ ŞEMASINA GÖRE)
  const deleteCategory = useCallback(async (id) => {
    try {
      // Adım 1: Kullanım Kontrolü (Tek API Çağrısı)
      const usageResponse = await fetch(`${API_BASE_URL}/${id}/usage`);
      if (!usageResponse.ok) {
        throw new Error('Kategori kullanım durumu kontrol edilemedi.');
      }
      const usage = await usageResponse.json();

      // Durum A: Aktif kullanım var
      if (usage.active > 0) {
        throw new Error('ACTIVE_USAGE'); // CategoryManagementModal handle edecek
      }

      // Durum B: Sadece kaldırılmış kullanım var
      if (usage.removed > 0) {
        const confirmation = window.confirm(
          `Bu kategori, kaldırılmış olan ${usage.removed} adet malzeme tarafından kullanılıyor. Kategoriyi silerseniz, ilgili malzemelerin kategori bilgisi sıfırlanacaktır. Silmek istediğinizden emin misiniz?`
        );

        if (confirmation) {
          // "Evet, Sil" denildi
          const deleteResponse = await fetch(`${API_BASE_URL}/${id}?updateRemoved=true`, {
            method: 'DELETE',
          });
          if (!deleteResponse.ok) {
            const errorText = await deleteResponse.text();
            throw new Error(errorText || 'Kategori silinirken bir hata oluştu.');
          }
        } else {
          // "Hayır" denildi
          return;
        }
      } else {
        // Durum C: Hiç kullanım yok
        // Onay istemeden doğrudan sil
        const deleteResponse = await fetch(`${API_BASE_URL}/${id}`, {
            method: 'DELETE',
        });
        if (!deleteResponse.ok) {
            const errorText = await deleteResponse.text();
            throw new Error(errorText || 'Kategori silinirken bir hata oluştu.');
        }
      }
      
      // Silme işlemi başarılıysa verileri yenile
      await refreshCategories();
      await refreshMaterials(true);
      
      // localStorage cache'ini temizle (kategori silindikten sonra eski kategori bilgileri cache'de kalmamalı)
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem('bk_materials_cache');
        console.log('🗑️ Materials cache cleared after category deletion');
      }

    } catch (error) {
      // ACTIVE_USAGE durumu özel olarak CategoryManagementModal tarafından handle ediliyor
      // UI'da zaten uyarı gösteriliyor, burada tekrar popup göstermeye gerek yok
      if (error.message === 'ACTIVE_USAGE') {
        console.warn(`⚠️ Kategori ${id} aktif kullanımda, silinemez`);
        throw error; // CategoryManagementModal'ın handle edebilmesi için re-throw
      }
      // Diğer hatalar için console error ve alert göster
      console.error(`Kategori ${id} silme hatası:`, error);
      alert(`Hata: ${error.message}`);
      throw error; // Caller'a error'ı propagate et
    }
  }, [refreshCategories, refreshMaterials]);

  return { createCategory, updateCategory, deleteCategory };
};
