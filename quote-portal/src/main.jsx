import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { useI18n } from '../shared/i18n.js';
import API from '../shared/lib/api.js';
import DynamicFormRenderer from '../shared/components/DynamicFormRenderer.js';
import QuotesManager from '../domains/quotes/components/QuotesManager.js';
import { showToast } from '../shared/components/MESToast.js';
import MaterialsTabs from '../domains/materials/components/MaterialsTabs.jsx';
import StocksTabContent from '../domains/materials/components/StocksTabContent.jsx';
import SuppliersTabContent from '../domains/materials/components/SuppliersTabContent.jsx';
import MaterialsDashboard from '../domains/materials/components/MaterialsDashboard.jsx';
import MaterialsFilters from '../domains/materials/components/MaterialsFilters.jsx';
import MaterialsTable from '../domains/materials/components/MaterialsTable.jsx';
import MaterialsActions from '../domains/materials/components/MaterialsActions.jsx';
import AddMaterialModal from '../domains/materials/components/AddMaterialModal.jsx';
import CategoryManagementModal from '../domains/materials/components/CategoryManagementModal.jsx';
import MaterialDeletionWarningModal from '../domains/materials/components/MaterialDeletionWarningModal.jsx';
import ErrorBoundary from '../shared/components/ErrorBoundary.jsx';
import MaterialsHelp from '../domains/materials/components/MaterialsHelp.jsx';
import ShipmentPanel from '../domains/materials/components/ShipmentPanel.jsx'; // New import

// Backend API hooks
import { useMaterials, useMaterialActions } from '../domains/materials/hooks/useMaterials.js';
import { useMaterialCategories } from '../domains/materials/hooks/useMaterialCategories.js';
import { useSuppliers } from '../domains/materials/hooks/useSuppliers.js';

// Lazy loading imports
const LazyOrdersTabContent = React.lazy(() => import('../domains/materials/components/OrdersTabContent.jsx'));
import { useCategorySync } from '../domains/materials/hooks/useCategorySync.js'; // YENİ

const PAGE = window.location.pathname.includes('quote-dashboard.html') ? 'admin' 
  : window.location.pathname.includes('materials.html') ? 'materials'
  : 'quote';

// Material types - New type system
const materialTypes = [
  { id: 'raw_material', label: 'Ham Madde' },
  { id: 'semi_finished', label: 'Yarı Mamül' },
  { id: 'finished_product', label: 'Bitmiş Ürün' },
  { id: 'scrap', label: 'Hurda' }
];

function MaterialsApp() {
  // Toast notifications
  // Using showToast directly

  // Backend API ile veri yönetimi (manuel yükleme)
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
    refreshCategories 
  } = useMaterialCategories(false); // autoLoad = false
  
  const { 
    addMaterial, 
    updateMaterial, 
    deleteMaterial, 
    loading: actionLoading, 
    error: actionError 
  } = useMaterialActions();
  
  const { 
    addMaterialToSupplier 
  } = useSuppliers();

  // YENİ: Merkezi Kategori Yönetim Hook'u
  const { 
    createCategory, 
    updateCategory, 
    deleteCategory 
  } = useCategorySync({ refreshCategories, refreshMaterials });

  // UI state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [isDeletionWarningOpen, setIsDeletionWarningOpen] = useState(false);
  const [isDeletionInProgress, setIsDeletionInProgress] = useState(false);
  const [materialCreatedCallback, setMaterialCreatedCallback] = useState(null);
  const [materialsToDelete, setMaterialsToDelete] = useState([]);
  const [deletionCallback, setDeletionCallback] = useState(null);
  
  useEffect(() => {
    console.log('🔍 main.jsx: Callback state değişti:', {
      hasCallback: !!materialCreatedCallback
    });
  }, [materialCreatedCallback]);
  const [activeTab, setActiveTab] = useState(() => {
    try {
      const hash = (typeof window !== 'undefined' && window.location.hash) || ''
      if (hash.includes('orders-tab')) return 'orders'
    } catch {}
    const storedTab = localStorage.getItem('bk_active_tab') || 'stocks';
    console.log('🔍 MAIN INIT: localStorage tab:', storedTab);
    return storedTab;
  });
  const [filters, setFilters] = useState({
    search: '',
    categories: [],
    types: [],
    status: 'Aktif', // Default olarak aktif materyaller
    lowStock: false
  });

  // İlk yükleme - sadece sayfa açıldığında
  useEffect(() => {
    if (!materialsInitialized) {
      loadMaterials();
    }
    // Categories'ı manuel yükle (useMaterialCategories autoLoad=false)
    refreshCategories();
    
    const checkHashAndOpenSupplier = () => {
      const hash = window.location.hash;
      
      if (hash.includes('suppliers-tab') && hash.includes('supplier-')) {
        setActiveTab('suppliers');
        const supplierMatch = hash.match(/supplier-([^&]+)/);
        
        if (supplierMatch) {
          const supplierId = supplierMatch[1];
          
          const checkAndDispatch = () => {
            // Supplier detail event'ini direk dispatch ediyoruz
            const supplierEvent = new CustomEvent('openSupplierDetail', {
              detail: { supplierId }
            });
            window.dispatchEvent(supplierEvent);
            
            setTimeout(() => {
              window.history.replaceState(null, null, window.location.pathname);
            }, 1000);
          };
          
          checkAndDispatch();
        } else {
          window.history.replaceState(null, null, window.location.pathname);
        }
      }
    };
    
    checkHashAndOpenSupplier();
  }, [materialsInitialized, loadMaterials, refreshCategories]);

  // Global stock update event listener
  useEffect(() => {
    const handleStockUpdateForce = (event) => {
      console.log('🔄 main.jsx: Stock update event received:', event.detail);
      // Force refresh to bypass any caches and pull fresh values
      refreshMaterials(true);
    };

    // Listen to both legacy and unified events
    window.addEventListener('stockUpdated', handleStockUpdateForce);
    window.addEventListener('materialStockUpdated', handleStockUpdateForce);
    
    return () => {
      window.removeEventListener('stockUpdated', handleStockUpdateForce);
      window.removeEventListener('materialStockUpdated', handleStockUpdateForce);
    };
  }, [refreshMaterials]);

  const handleFilterChange = (newFilters) => {
    setFilters(newFilters);
  };

  const filteredMaterials = materials.filter(material => {
    if (filters.status === 'Aktif') {
      if (material.status === 'Kaldırıldı') {
        return false;
      }
    } else if (filters.status === 'Removed') {
      if (material.status !== 'Kaldırıldı') {
        return false;
      }
    }
    
    if (filters.search) {
      const searchTerm = filters.search.toLowerCase();
      if (!material.name.toLowerCase().includes(searchTerm) && 
          !material.code.toLowerCase().includes(searchTerm) &&
          !material.category.toLowerCase().includes(searchTerm)) {
        return false;
      }
    }

    if (filters.categories && filters.categories.length > 0) {
      if (!filters.categories.includes(material.category)) {
        return false;
      }
    }

    if (filters.types && filters.types.length > 0) {
      if (!filters.types.includes(material.type)) {
        return false;
      }
    }

    // Low stock filter: show only materials where stock < reorderPoint
    if (filters.lowStock) {
      const stockLevel = parseFloat(material.stock) || 0;
      const reorderLevel = parseFloat(material.reorder_point) || 0;
      
      // Gizle: stok >= reorder point olanları
      if (stockLevel >= reorderLevel) {
        return false;
      }
    }

    return true;
  });

  const handleAddMaterial = (onMaterialCreated = null) => {
    console.log('🔄 main.jsx: handleAddMaterial çağrıldı:', {
      newCallback: !!onMaterialCreated,
      currentCallback: !!materialCreatedCallback
    });
    
    if (materialCreatedCallback && onMaterialCreated) {
      console.warn('⚠️ main.jsx: Callback override edildi! Modal zaten açık mı?');
    }
    
    setMaterialCreatedCallback(() => onMaterialCreated); // Fonksiyonu doğrudan set et
    setIsModalOpen(true);
  };

  const handleEditMaterial = (material) => {
    console.log('🔍 handleEditMaterial called for material:', material?.name);
    // StocksTabContent handles edit via selectedMaterial state
    // Just log for debugging
  };

  const handleMaterialSelect = (material) => {
    // Material selection opens detail panel in StocksTabContent
    // This function is kept for compatibility but does nothing
    console.log('🔍 handleMaterialSelect called for material:', material?.name);
  };

  const handleCategoryManage = async () => {
    await refreshCategories();
    setIsCategoryModalOpen(true);
  };

  const handleCloseCategoryModal = () => {
    setIsCategoryModalOpen(false);
  };

  const handleSaveMaterial = async (materialData, newCategoryName) => {
    try {
      let categoryId = materialData.category || materialData.categoryId;

      // Yeni kategori eklendiyse önce kategoriyi oluştur
      if (newCategoryName && !categories.some(cat => cat.name === newCategoryName)) {
        console.log(`✨ Yeni kategori oluşturuluyor: ${newCategoryName}`);
        const newCategory = await createCategory(newCategoryName);
        if (newCategory && newCategory.id) {
            categoryId = newCategory.id;
            // Backend'de 'category' field'ı kullanılıyor, 'categoryId' değil
            materialData.category = newCategory.id;
            materialData.categoryId = newCategory.id; // Backward compatibility için
            console.log('✅ Yeni kategori ID malzeme datasına eklendi:', newCategory.id);
            // Kategoriler listesini yenile ki yeni kategori tabloda görünebilsin
            if (refreshCategories) {
              await refreshCategories();
              console.log('✅ Kategoriler listesi yenilendi');
            }
        } else {
            throw new Error('Yeni kategori oluşturuldu ancak ID alınamadı.');
        }
      }

      const newMaterial = await addMaterial(materialData);
      
      if (!newMaterial || !newMaterial.id) {
        console.error('❌ addMaterial başarısız - newMaterial:', newMaterial)
        throw new Error('Malzeme kaydedilemedi')
      }
      
      console.log('✅ Malzeme başarıyla kaydedildi:', newMaterial)
      
      if (materialData.supplier) {
        console.log('🔄 Dropdown\'dan seçilen tedarikçiye malzeme ekleniyor:', { 
          supplierId: materialData.supplier, 
          materialId: newMaterial.id 
        });
        
        try {
          // Tedarikçi-malzeme ilişkisini backend'e kaydet
          const supplierMaterialData = {
            materialId: newMaterial.id,
            materialCode: newMaterial.code,
            materialName: newMaterial.name,
            category: newMaterial.category,
            unit: newMaterial.unit,
            price: newMaterial.sellPrice || newMaterial.costPrice || 0,
            deliveryTime: '',
            minQuantity: 1
          };
          
          await addMaterialToSupplier(materialData.supplier, supplierMaterialData);
          console.log('✅ Malzeme tedarikçiye başarıyla eklendi');
        } catch (supplierError) {
          console.error('❌ Tedarikçi ilişkisi eklenirken hata:', supplierError);
          // Malzeme oluşturuldu ama tedarikçi ilişkisi eklenemedi - kullanıcıya uyar
          alert('Malzeme oluşturuldu ancak tedarikçi ilişkisi eklenirken hata oluştu. Lütfen manuel olarak ekleyin.');
        }
      }
      
      await refreshMaterials(true);
      
      if (materialCreatedCallback && typeof materialCreatedCallback === 'function') {
        console.log('🔄 main.jsx: Callback çağrılıyor...', newMaterial);
        try {
          materialCreatedCallback(newMaterial);
        } catch (callbackError) {
          console.error('❌ Callback error:', callbackError);
        }
      }
      
      console.log('🔄 main.jsx: Modal kapatılıyor...');
      setIsModalOpen(false);
      setMaterialCreatedCallback(null);
    } catch (error) {
      console.error('Material save error:', error);
      alert(`Malzeme kaydedilirken hata: ${error.message}`);
    }
  };

  const handleDeleteMaterial = async (materialIdOrList, skipConfirmation = false, isBulkDelete = false) => {
    console.log('🗑️ handleDeleteMaterial called:', { materialIdOrList, skipConfirmation, isBulkDelete });
    
    if (isBulkDelete && Array.isArray(materialIdOrList)) {
      console.log('📦 Bulk delete for materials:', materialIdOrList.length);
      setMaterialsToDelete(materialIdOrList);
      setDeletionCallback(() => async () => {
        return { isBulkDelete: true, materials: materialIdOrList };
      });
      setIsDeletionWarningOpen(true);
      return true;
    }
    
    const materialId = materialIdOrList;
    const material = materials.find(m => m.id === materialId);
    if (!material) {
      console.error('❌ Material not found:', materialId);
      return false;
    }

    console.log('📦 Material found:', material.name);

    if (skipConfirmation) {
      console.log('⚡ Skipping confirmation, direct delete');
      try {
        await deleteMaterial(materialId);
        return true;
      } catch (error) {
        console.error('Material delete error:', error);
        throw error;
      }
    } else {
      console.log('⚠️ Showing warning modal for:', material.name);
      setMaterialsToDelete([material]);
      setDeletionCallback(() => async () => {
        try {
          await deleteMaterial(materialId);
          await refreshMaterials();
        } catch (error) {
          console.error('Material delete error:', error);
          throw error;
        }
      });
      setIsDeletionWarningOpen(true);
      console.log('✅ Modal state set to true');
      return true;
    }
  };

  const handleConfirmDeletion = async () => {
    if (deletionCallback) {
      setIsDeletionInProgress(true);
      
      try {
        const result = await deletionCallback();
        
        if (result && result.isBulkDelete) {
          console.log('🔄 Starting bulk delete operation for', result.materials.length, 'materials');
          
          setDeletionCallback(null);
          setMaterialsToDelete([]);
          setIsDeletionWarningOpen(false);
          setIsDeletionInProgress(false);
          
          if (window.handleBulkDeleteFromModal) {
            window.handleBulkDeleteFromModal(result.materials);
          }
          return;
        }
        
        setDeletionCallback(null);
        setMaterialsToDelete([]);
      } finally {
        setIsDeletionInProgress(false);
      }
    }
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setMaterialCreatedCallback(null);
  };

  const handleTabChange = (newTab) => {
    console.log('🔥 MAIN TAB CHANGE:', newTab, 'Old:', activeTab);
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
          refreshMaterials={refreshMaterials}
          loading={materialsLoading}
          error={materialsError}
        />
        <SuppliersTabContent 
          categories={categories}
          handleDeleteMaterial={handleDeleteMaterial}
          isActive={activeTab === 'suppliers'}
        />
        {activeTab === 'orders' && (
          <React.Suspense fallback={<div style={{padding: '20px', textAlign: 'center'}}>📦 Orders yükleniyor...</div>}>
            <LazyOrdersTabContent />
          </React.Suspense>
        )}
        {activeTab === 'shipments' && ( // New conditional rendering for ShipmentPanel
          <ShipmentPanel />
        )}
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

      <CategoryManagementModal 
        isOpen={isCategoryModalOpen}
        onClose={handleCloseCategoryModal}
        categories={categories}
        createCategory={createCategory}
        updateCategory={updateCategory}
        deleteCategory={deleteCategory}
        onOpenMaterialByCode={(code) => {
          const material = materials.find(m => m.code === code)
          if (material) {
            handleEditMaterial(material)
          } else {
            alert(`${code} malzemesi bulunamadı veya kaldırılmış olabilir.`)
          }
        }}
      />

      {/* EditMaterialModal removed - material details now shown in StocksTabContent detail panel */}

      <MaterialDeletionWarningModal
        isOpen={isDeletionWarningOpen}
        onClose={() => {
          setIsDeletionWarningOpen(false);
          setMaterialsToDelete([]);
          setDeletionCallback(null);
          setIsDeletionInProgress(false);
        }}
        onConfirm={handleConfirmDeletion}
        materials={materialsToDelete}
        isBulk={materialsToDelete.length > 1}
        isDeleting={isDeletionInProgress}
      />

      {/* Floating Help Button + Popup */}
      <MaterialsHelp />

      {/* Global Error Banner - Fixed at bottom */}
      {(materialsError || categoriesError) && (
        <div className="global-error-banner" style={{
          position: 'fixed',
          bottom: '16px',
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'rgba(220, 53, 69, 0.95)',
          border: '1px solid rgba(220, 53, 69, 0.3)',
          borderRadius: '8px',
          padding: '12px 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          maxWidth: '90%',
          minWidth: '400px',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
          zIndex: 1000
        }}>
          <div style={{ flex: 1 }}>
            <strong style={{ color: 'white' }}>⚠️ Bağlantı Hatası:</strong>
            <span style={{ marginLeft: '8px', color: 'rgba(255, 255, 255, 0.9)' }}>
              {materialsError || categoriesError}
            </span>
          </div>
          <button 
            onClick={() => {
              refreshMaterials(true);
              refreshCategories();
            }}
            style={{
              padding: '6px 12px',
              background: 'white',
              color: '#dc3545',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '600',
              whiteSpace: 'nowrap'
            }}
          >
            Tekrar Dene
          </button>
        </div>
      )}
    </div>
  );
}

function App() {
  const { t, lang } = useI18n();
  const [loggedIn, setLoggedIn] = useState(false);
  // Using showToast directly

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
    if (window.BurkolNavigation) {
      setTimeout(() => {
        const nav = new window.BurkolNavigation();
        nav.refresh();
      }, 100);
    }
  }

  function handleLogout() {
    setLoggedIn(false);
    window.location.href = './login.html';
  }

  async function handleQuoteSubmit(quoteData) {
    try {
      // Map form field IDs to backend expected field names
      const mappedData = {
        customerName: quoteData.name,
        customerEmail: quoteData.email,
        customerPhone: quoteData.phone || '',
        customerCompany: quoteData.company || '',
        customerAddress: quoteData.address || '',
        proj: quoteData.proj || '',
        deliveryDate: quoteData.deliveryDate || null,
        notes: quoteData.notes || '',
        formData: quoteData.customFields || {},
        formTemplateId: quoteData.formVersion,
        formConfigSnapshot: quoteData.formConfigSnapshot,
        status: quoteData.status || 'new',
        createdAt: quoteData.createdAt || new Date().toISOString()
      };
      
      await API.createQuote(mappedData);
      showToast('Teklif başarıyla gönderildi!', 'success');
    } catch (error) {
      console.error('Quote submission error:', error);
      throw error;
    }
  }

  return (
    <React.Fragment>
      {PAGE === 'admin'
        ? (loggedIn ? (
            <QuotesManager 
              t={t} 
              onLogout={handleLogout}
            />
          ) : <AdminGate onLogin={handleLogin} t={t} />)
        : PAGE === 'materials'
        ? <MaterialsApp />
        : <DynamicFormRenderer onSubmit={handleQuoteSubmit} t={t} />
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
