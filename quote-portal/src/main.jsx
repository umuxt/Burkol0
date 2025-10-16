import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { useI18n } from './i18n.js';
import API from './lib/api.js';
import DynamicFormRenderer from './components/DynamicFormRenderer.js';
import Admin from './components/admin/Admin.js';
import { ToastNotification, useNotifications } from './hooks/useNotifications.js';
import MaterialsTabs from './components/MaterialsTabs.jsx';
import StocksTabContent from './components/StocksTabContent.jsx';
import SuppliersTabContent from './components/SuppliersTabContent.jsx';
import OrdersTabContent from './components/OrdersTabContent.jsx';
import MaterialsDashboard from './components/MaterialsDashboard.jsx';
import MaterialsFilters from './components/MaterialsFilters.jsx';
import MaterialsTable from './components/MaterialsTable.jsx';
import MaterialsActions from './components/MaterialsActions.jsx';
import AddMaterialModal from './components/AddMaterialModal.jsx';
import EditMaterialModal from './components/EditMaterialModal.jsx';
import CategoryManagementModal from './components/CategoryManagementModal.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';

// Firebase hooks
import { useMaterials, useMaterialActions } from './hooks/useFirebaseMaterials.js';
import { useCategories, useCategoryActions } from './hooks/useFirebaseCategories.js';
import { useSuppliers } from './hooks/useSuppliers.js';

const PAGE = window.location.pathname.includes('quote-dashboard.html') ? 'admin' 
  : window.location.pathname.includes('materials.html') ? 'materials'
  : 'quote';

// Material types - Bu sabit kalabilir
const materialTypes = [
  { id: 'raw_material', label: 'Ham Madde' },
  { id: 'wip', label: 'Yarı Mamül' },
  { id: 'final_product', label: 'Bitmiş Ürün' }
];

function MaterialsApp() {
  // Firebase hooks ile veri yönetimi (manuel yükleme)
  const { 
    materials, 
    loading: materialsLoading, 
    error: materialsError, 
    initialized: materialsInitialized,
    loadMaterials,
    refreshMaterials 
  } = useMaterials(false); // autoLoad = false
  
  const { 
    categories, 
    loading: categoriesLoading, 
    error: categoriesError, 
    initialized: categoriesInitialized,
    loadCategories,
    refreshCategories 
  } = useCategories(false); // autoLoad = false
  
  const { 
    addMaterial, 
    updateMaterial, 
    deleteMaterial, 
    loading: actionLoading, 
    error: actionError 
  } = useMaterialActions();
  
  const { 
    addCategory, 
    updateCategory, 
    deleteCategory,
    loading: categoryActionLoading 
  } = useCategoryActions();

  const { 
    suppliers,
    addMaterialToSupplier
  } = useSuppliers();

  // UI state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  // AddSupplierModal için ayrı modal kaldırıldı
  const [editingMaterial, setEditingMaterial] = useState(null);
  const [materialCreatedCallback, setMaterialCreatedCallback] = useState(null);
  // Tedarikçi context state'leri kaldırıldı
  
  // Debug: Callback state'ini takip et
  useEffect(() => {
    console.log('🔍 main.jsx: Callback state değişti:', {
      hasCallback: !!materialCreatedCallback
    });
  }, [materialCreatedCallback]);
  const [activeTab, setActiveTab] = useState(() => {
    // F5 sonrası da aynı tab'da kalabilmek için localStorage kullan
    return localStorage.getItem('bk_active_tab') || 'stocks';
  });
  const [filters, setFilters] = useState({
    search: '',
    categories: [],
    types: [],
    status: '',
    lowStock: false
  });

  // İlk yükleme - sadece sayfa açıldığında
  useEffect(() => {
    if (!materialsInitialized) {
      loadMaterials();
    }
    if (!categoriesInitialized) {
      loadCategories();
    }
    
    // Hash kontrolü - suppliers tab ve supplier detayı açma
    const checkHashAndOpenSupplier = () => {
      const hash = window.location.hash;
      
      if (hash.includes('suppliers-tab') && hash.includes('supplier-')) {
        // Suppliers tab'ını aktif yap
        setActiveTab('suppliers');
        
        // Supplier ID'sini çıkar
        const supplierMatch = hash.match(/supplier-([^&]+)/);
        
        if (supplierMatch) {
          const supplierId = supplierMatch[1];
          
          // Suppliers yüklendiyse supplier detayını aç
          const checkAndDispatch = () => {
            // Suppliers state'ini kontrol et
            if (suppliers && suppliers.length > 0) {
              const supplierEvent = new CustomEvent('openSupplierDetail', {
                detail: { supplierId }
              });
              window.dispatchEvent(supplierEvent);
              
              // Event gönderildikten sonra hash'i temizle
              setTimeout(() => {
                window.history.replaceState(null, null, window.location.pathname);
              }, 1000);
            } else {
              // Suppliers henüz yüklenmemişse 200ms sonra tekrar dene
              setTimeout(checkAndDispatch, 200);
            }
          };
          
          // Hemen kontrol et
          checkAndDispatch();
        } else {
          // Hash'i temizle (supplier ID yoksa)
          window.history.replaceState(null, null, window.location.pathname);
        }
      }
    };
    
    checkHashAndOpenSupplier();
  }, [materialsInitialized, categoriesInitialized, loadMaterials, loadCategories]);

  const handleFilterChange = (newFilters) => {
    setFilters(newFilters);
  };

  // Filtrelenmiş malzemeler - Client-side filtering
  const filteredMaterials = materials.filter(material => {
    // Arama filtresi
    if (filters.search) {
      const searchTerm = filters.search.toLowerCase();
      if (!material.name.toLowerCase().includes(searchTerm) && 
          !material.code.toLowerCase().includes(searchTerm) &&
          !material.category.toLowerCase().includes(searchTerm)) {
        return false;
      }
    }

    // Kategori filtresi (multi-select)
    if (filters.categories && filters.categories.length > 0) {
      if (!filters.categories.includes(material.category)) {
        return false;
      }
    }

    // Tip filtresi (multi-select)
    if (filters.types && filters.types.length > 0) {
      if (!filters.types.includes(material.type)) {
        return false;
      }
    }

    // Durum filtresi
    if (filters.status && material.status !== filters.status) {
      return false;
    }

    // Düşük stok filtresi
    if (filters.lowStock && material.stock > material.reorderPoint) {
      return false;
    }

    return true;
  });

  // === YENİ BASIT FONKSİYONLAR ===
  
  // 1. Stock context'i için - basit malzeme ekleme
  const handleAddMaterialForStock = () => {
    console.log('📦 main.jsx: Stock için malzeme ekleme modalı açılıyor...');
    setMaterialCreatedCallback(null); // Callback yok
    setIsModalOpen(true);
  };
  
  // Tedarikçi detayı için malzeme ekleme kaldırıldı
  
  // Yeni tedarikçi için malzeme ekleme kaldırıldı

  // === ESKİ KARMAŞIK FONKSİYON (GEÇİCİ) ===
  const handleAddMaterial = (onMaterialCreated = null) => {
    console.log('⚠️ main.jsx: ESKİ handleAddMaterial kullanılıyor! Yeni fonksiyonlara geçin.');
    console.log('🔄 main.jsx: handleAddMaterial çağrıldı:', {
      newCallback: !!onMaterialCreated,
      currentCallback: !!materialCreatedCallback
    });
    
    // Eğer zaten bir callback varsa ve modal açıksa, uyarı ver
    if (materialCreatedCallback && onMaterialCreated) {
      console.warn('⚠️ main.jsx: Callback override edildi! Modal zaten açık mı?');
    }
    
    setMaterialCreatedCallback(onMaterialCreated);
    setIsModalOpen(true);
  };

  const handleEditMaterial = (material) => {
    setEditingMaterial(material);
    setIsEditModalOpen(true);
  };

  const handleMaterialSelect = (material) => {
    setEditingMaterial(material);
    setIsEditModalOpen(true);
  };

  const handleCategoryManage = () => {
    setIsCategoryModalOpen(true);
  };

  const handleCloseCategoryModal = () => {
    setIsCategoryModalOpen(false);
  };

  // Firebase ile kategori kaydetme
  const handleSaveCategories = async (updatedCategories) => {
    try {
      // Bu fonksiyon CategoryManagementModal'dan gelecek kategori güncellemelerini işler
      // Şimdilik kategorileri yeniden yükleyelim
      await reloadCategories();
    } catch (error) {
      console.error('Category save error:', error);
    }
  };

  // Firebase ile yeni malzeme kaydetme
  const handleSaveMaterial = async (materialData, newCategory) => {
    try {
      // Yeni kategori eklendiyse önce kategoriyi oluştur
      if (newCategory && !categories.some(cat => cat.name === newCategory)) {
        const newCat = {
          name: newCategory,
          code: newCategory.substring(0, 4).toUpperCase(),
          description: `${newCategory} kategorisi`,
          color: '#007bff',
          sortOrder: categories.length + 1
        };
        await addCategory(newCat);
        await refreshCategories(); // Kategorileri yenile
      }

      // Malzemeyi Firebase'e kaydet
      const newMaterial = await addMaterial(materialData);
      
      // newMaterial validation
      if (!newMaterial || !newMaterial.id) {
        console.error('❌ addMaterial başarısız - newMaterial:', newMaterial)
        throw new Error('Malzeme kaydedilemedi')
      }
      
      console.log('✅ Malzeme başarıyla kaydedildi:', newMaterial)
      
      // Eğer malzemede supplier ID'si varsa (dropdown'dan seçilmişse)
      if (materialData.supplier) {
        try {
          console.log('🔄 Dropdown\'dan seçilen tedarikçiye malzeme ekleniyor:', { 
            supplierId: materialData.supplier, 
            materialId: newMaterial.id 
          });
          
          await addMaterialToSupplier(materialData.supplier, {
            materialId: newMaterial.id,
            materialCode: newMaterial.code,
            materialName: newMaterial.name,
            price: materialData.costPrice || 0,
            deliveryTime: '',
            minQuantity: 1
          });
          
          console.log('✅ Dropdown\'dan seçilen tedarikçiye malzeme eklendi');
        } catch (supplierError) {
          console.error('❌ Dropdown tedarikçiye eklenirken hata:', supplierError);
        }
      }
      
      // Tedarikçiye ekleme kodları kaldırıldı
      
      // Materials listesini her zaman yenile - hem stok hem supplier context'inde
      console.log('🔄 main.jsx: Materials listesi yenileniyor...')
      await refreshMaterials();
      
      // Callback varsa çağır (malzeme bilgisiyle) - MODAL KAPATMADAN ÖNCE
      if (materialCreatedCallback) {
        console.log('🔄 main.jsx: Callback çağrılıyor...', newMaterial);
        materialCreatedCallback(newMaterial);
      }
      
      // MODAL KAPANMASI CALLBACK'TEN SONRA OLACAK
      // Eğer callback varsa modal kapatmayı callback'e bırak
      if (!materialCreatedCallback) {
        setIsModalOpen(false);
      }
      
      // Callback mechaism'ini temizle
      setMaterialCreatedCallback(null);
    } catch (error) {
      console.error('Material save error:', error);
    }
  };

  // Firebase ile malzeme güncelleme
  const handleSaveEditMaterial = async (materialData, newCategory) => {
    try {
      // Yeni kategori eklendiyse önce kategoriyi oluştur
      if (newCategory && !categories.some(cat => cat.name === newCategory)) {
        const newCat = {
          name: newCategory,
          code: newCategory.substring(0, 4).toUpperCase(),
          description: `${newCategory} kategorisi`,
          color: '#007bff',
          sortOrder: categories.length + 1
        };
        await addCategory(newCat);
        await refreshCategories();
      }

      // Malzemeyi Firebase'de güncelle
      if (editingMaterial && editingMaterial.id) {
        await updateMaterial(editingMaterial.id, materialData);
      }
      
      setIsEditModalOpen(false);
      setEditingMaterial(null);
      // Malzemeleri yenile
      await refreshMaterials();
    } catch (error) {
      console.error('Material update error:', error);
    }
  };

  // Material silme fonksiyonu
  const handleDeleteMaterial = async (materialId) => {
    if (confirm('Bu malzemeyi silmek istediğinizden emin misiniz?')) {
      try {
        await deleteMaterial(materialId);
        // Malzemeleri yenile
        await refreshMaterials();
      } catch (error) {
        console.error('Material delete error:', error);
      }
    }
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setMaterialCreatedCallback(null);
  };

  const handleCloseEditModal = () => {
    setIsEditModalOpen(false);
    setEditingMaterial(null);
  };

  // Loading state
  if (materialsLoading || categoriesLoading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner">
          <div className="spinner"></div>
          <p>Veriler yükleniyor...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (materialsError || categoriesError) {
    return (
      <div className="error-container">
        <h3>Hata Oluştu</h3>
        <p>{materialsError || categoriesError}</p>
        <button onClick={() => {
          refreshMaterials();
          reloadCategories();
        }}>
          Tekrar Dene
        </button>
      </div>
    );
  }

  // Tab değişikliği handler'ı - localStorage'a kaydet
  const handleTabChange = (newTab) => {
    setActiveTab(newTab);
    localStorage.setItem('bk_active_tab', newTab);
  }

  return (
    <div className="materials-page">
                  <MaterialsTabs
        activeTab={activeTab}
        onTabChange={handleTabChange}
        filteredMaterials={filteredMaterials}
        categories={categories}
        materialTypes={materialTypes}
        handleFilterChange={handleFilterChange}
        handleAddMaterial={handleAddMaterial}
        handleEditMaterial={handleEditMaterial}
        handleDeleteMaterial={handleDeleteMaterial}
        handleCategoryManage={handleCategoryManage}
        loading={materialsLoading || actionLoading}
        error={materialsError || actionError}
      >
        <StocksTabContent 
          materials={filteredMaterials}
          categories={categories}
          materialTypes={materialTypes}
          handleFilterChange={handleFilterChange}
          handleAddMaterial={handleAddMaterial}
          handleMaterialSelect={handleMaterialSelect}
          handleEditMaterial={handleEditMaterial}
          handleDeleteMaterial={handleDeleteMaterial}
          handleCategoryManage={handleCategoryManage}
          loading={materialsLoading}
          error={materialsError}
        />
        <SuppliersTabContent 
          categories={categories}
        />
        <OrdersTabContent />
      </MaterialsTabs>
      
      <AddMaterialModal 
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        onSave={handleSaveMaterial}
        categories={categories}
        types={materialTypes}
        materials={materials}
        loading={actionLoading}
        error={actionError}
      />

      <ErrorBoundary>
        <EditMaterialModal 
          isOpen={isEditModalOpen}
          onClose={handleCloseEditModal}
          onSave={handleSaveEditMaterial}
          onDelete={handleDeleteMaterial}
          categories={categories}
          types={materialTypes}
          material={editingMaterial}
          suppliers={suppliers}
          loading={actionLoading}
          error={actionError}
        />
      </ErrorBoundary>



      <CategoryManagementModal 
        isOpen={isCategoryModalOpen}
        onClose={handleCloseCategoryModal}
        onSave={handleSaveCategories}
        onRefresh={refreshCategories}
        categories={categories}
        loading={categoryActionLoading}
        createCategory={addCategory}
        updateCategory={updateCategory}
        deleteCategory={deleteCategory}
      />
    </div>
  );
}

function App() {
  const { t, lang } = useI18n();
  const [loggedIn, setLoggedIn] = useState(false);
  const { notifications, showNotification, removeNotification } = useNotifications();

  useEffect(() => {
    async function checkLogin() {
      try {
        const token = localStorage.getItem('bk_admin_token');
        if (token) {
          await API.me();
          setLoggedIn(true);
        }
      } catch (e) {
        localStorage.removeItem('bk_admin_token');
        setLoggedIn(false);
      }
    }
    if (PAGE === 'admin') {
      checkLogin();
    }
  }, []);

  function handleLogin() {
    setLoggedIn(true);
    // BurkolNavigation'ı refresh et ki navigation menüsü gözüksün
    if (window.BurkolNavigation) {
      // Biraz bekleyip refresh et ki state güncellensin
      setTimeout(() => {
        const nav = new window.BurkolNavigation();
        nav.refresh();
      }, 100);
    }
  }

  function handleLogout() {
    setLoggedIn(false);
    // Login sayfasına yönlendir
    window.location.href = './login.html';
  }

  async function handleQuoteSubmit(quoteData) {
    try {
      await API.createQuote(quoteData);
      showNotification('Teklif başarıyla gönderildi!', 'success');
    } catch (error) {
      console.error('Quote submission error:', error);
      throw error;
    }
  }

  return (
    <React.Fragment>
      {notifications.map(notification => (
        <ToastNotification
          key={notification.id}
          message={notification.message}
          type={notification.type}
          onClose={() => removeNotification(notification.id)}
        />
      ))}
      {PAGE === 'admin'
        ? (loggedIn ? (
            <Admin 
              t={t} 
              onLogout={handleLogout} 
              showNotification={showNotification}
            />
          ) : <AdminGate onLogin={handleLogin} t={t} />)
        : PAGE === 'materials'
        ? <MaterialsApp />
        : <DynamicFormRenderer onSubmit={handleQuoteSubmit} showNotification={showNotification} t={t} />
      }
    </React.Fragment>
  );
}

function AdminGate({ onLogin, t }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    if (!email || !password) { setError('E-posta ve şifre gerekli'); return; }
    setLoading(true);
    setError('');
    try {
      const res = await API.login(email, password, remember);
      if (res && res.token) {
        onLogin();
      } else {
        setError('Giriş başarısız. Lütfen tekrar deneyin.');
      }
    } catch (err) {
      console.error(err);
      setError(err.message || 'Giriş başarısız. Sunucu hatası.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'linear-gradient(135deg, #0f1419 0%, #1a2332 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000
    }}>
      <div style={{
        background: 'rgba(255, 255, 255, 0.1)',
        backdropFilter: 'blur(20px)',
        border: '1px solid rgba(255, 255, 255, 0.2)',
        borderRadius: '20px',
        padding: '3rem',
        width: '100%',
        maxWidth: '400px',
        boxShadow: '0 25px 50px rgba(0, 0, 0, 0.3)',
        textAlign: 'center'
      }}>
        <div style={{ marginBottom: '2rem' }}>
          <div style={{
            width: '20px',
            height: '20px',
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #d4af37 0%, #f4d03f 100%)',
            boxShadow: '0 0 20px rgba(212, 175, 55, 0.6)',
            margin: '0 auto 1rem',
            animation: 'pulse 2s infinite'
          }}></div>
          <h2 style={{
            color: '#ffffff',
            fontSize: '2rem',
            fontWeight: '700',
            margin: '0 0 0.5rem 0',
            background: 'linear-gradient(135deg, #ffffff 0%, #d4af37 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text'
          }}>Admin Girişi</h2>
          <p style={{
            color: 'rgba(255, 255, 255, 0.8)',
            margin: 0,
            fontSize: '1rem'
          }}>Burkol Yönetim Paneli</p>
        </div>

        <form onSubmit={onSubmit} style={{ textAlign: 'left' }}>
          {error && (
            <div style={{
              background: 'rgba(220, 53, 69, 0.2)',
              border: '1px solid rgba(220, 53, 69, 0.3)',
              borderRadius: '10px',
              padding: '1rem',
              marginBottom: '1rem',
              color: '#ff6b6b',
              fontSize: '0.9rem',
              textAlign: 'center'
            }}>
              {error}
            </div>
          )}

          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{
              display: 'block',
              color: '#ffffff',
              fontWeight: '500',
              marginBottom: '0.5rem',
              fontSize: '0.9rem'
            }}>E-posta</label>
            <input
              type='email'
              name='email'
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={{
                width: '100%',
                padding: '1rem',
                background: 'rgba(255, 255, 255, 0.1)',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                borderRadius: '10px',
                color: '#ffffff',
                fontSize: '1rem',
                transition: 'all 0.3s ease',
                boxSizing: 'border-box'
              }}
              onFocus={(e) => {
                e.target.style.borderColor = '#d4af37';
                e.target.style.background = 'rgba(255, 255, 255, 0.15)';
                e.target.style.boxShadow = '0 0 0 3px rgba(212, 175, 55, 0.2)';
              }}
              onBlur={(e) => {
                e.target.style.borderColor = 'rgba(255, 255, 255, 0.2)';
                e.target.style.background = 'rgba(255, 255, 255, 0.1)';
                e.target.style.boxShadow = 'none';
              }}
            />
          </div>

          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{
              display: 'block',
              color: '#ffffff',
              fontWeight: '500',
              marginBottom: '0.5rem',
              fontSize: '0.9rem'
            }}>Şifre</label>
            <input
              type='password'
              name='password'
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{
                width: '100%',
                padding: '1rem',
                background: 'rgba(255, 255, 255, 0.1)',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                borderRadius: '10px',
                color: '#ffffff',
                fontSize: '1rem',
                transition: 'all 0.3s ease',
                boxSizing: 'border-box'
              }}
              onFocus={(e) => {
                e.target.style.borderColor = '#d4af37';
                e.target.style.background = 'rgba(255, 255, 255, 0.15)';
                e.target.style.boxShadow = '0 0 0 3px rgba(212, 175, 55, 0.2)';
              }}
              onBlur={(e) => {
                e.target.style.borderColor = 'rgba(255, 255, 255, 0.2)';
                e.target.style.background = 'rgba(255, 255, 255, 0.1)';
                e.target.style.boxShadow = 'none';
              }}
            />
          </div>

          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '1.5rem',
            flexWrap: 'wrap',
            gap: '1rem'
          }}>
            <label style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              color: 'rgba(255, 255, 255, 0.8)',
              fontSize: '14px',
              cursor: 'pointer'
            }}>
              <input
                type='checkbox'
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
                style={{ marginRight: '4px' }}
              />
              {t.remember_me || 'Beni hatırla'}
            </label>
          </div>

          <button
            type='submit'
            disabled={loading}
            style={{
              width: '100%',
              padding: '1rem',
              background: loading ? 'rgba(212, 175, 55, 0.5)' : 'linear-gradient(135deg, #d4af37 0%, #b8941f 100%)',
              color: '#ffffff',
              border: 'none',
              borderRadius: '10px',
              fontSize: '1rem',
              fontWeight: '600',
              cursor: loading ? 'not-allowed' : 'pointer',
              transition: 'all 0.3s ease',
              boxShadow: '0 4px 15px rgba(212, 175, 55, 0.4)'
            }}
            onMouseOver={(e) => {
              if (!loading) {
                e.target.style.background = 'linear-gradient(135deg, #e6c547 0%, #d4af37 100%)';
                e.target.style.transform = 'translateY(-2px)';
                e.target.style.boxShadow = '0 6px 20px rgba(212, 175, 55, 0.5)';
              }
            }}
            onMouseOut={(e) => {
              if (!loading) {
                e.target.style.background = 'linear-gradient(135deg, #d4af37 0%, #b8941f 100%)';
                e.target.style.transform = 'translateY(0)';
                e.target.style.boxShadow = '0 4px 15px rgba(212, 175, 55, 0.4)';
              }
            }}
          >
            {loading ? 'Giriş yapılıyor...' : (t.login_btn || 'Giriş Yap')}
          </button>
        </form>
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')).render(<App />);
