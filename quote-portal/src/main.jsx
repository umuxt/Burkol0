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

const PAGE = window.location.pathname.includes('quote-dashboard.html') ? 'admin' 
  : window.location.pathname.includes('materials.html') ? 'materials'
  : 'quote';

const dummyMaterials = [
  { code: 'M-001', name: 'Çelik Levha', type: 'raw_material', category: 'demir_celik', unit: 'kg', stock: 1200, reorderPoint: 200, status: 'Aktif' },
  { code: 'M-002', name: 'Alüminyum Profil', type: 'wip', category: 'aluminyum', unit: 'adet', stock: 300, reorderPoint: 50, status: 'Aktif' },
  { code: 'M-003', name: 'Somun M8', type: 'raw_material', category: 'baglanti_elemani', unit: 'adet', stock: 850, reorderPoint: 100, status: 'Pasif' },
  { code: 'M-004', name: 'Hazır Panel', type: 'final_product', category: 'panel_sistemleri', unit: 'adet', stock: 45, reorderPoint: 60, status: 'Aktif' },
  { code: 'M-005', name: 'Galvaniz Sac', type: 'raw_material', category: 'demir_celik', unit: 'kg', stock: 2500, reorderPoint: 300, status: 'Aktif' }
];

const materialTypes = [
  { id: 'raw_material', label: 'Ham Madde' },
  { id: 'wip', label: 'Yarı Mamül' },
  { id: 'final_product', label: 'Bitmiş Ürün' }
];

const materialCategories = [
  { id: 'demir_celik', label: 'Demir-Çelik' },
  { id: 'aluminyum', label: 'Alüminyum' },
  { id: 'plastik', label: 'Plastik' },
  { id: 'baglanti_elemani', label: 'Bağlantı Elemanı' },
  { id: 'panel_sistemleri', label: 'Panel Sistemleri' }
];

function MaterialsApp() {
  const [materials, setMaterials] = useState(dummyMaterials);
  const [categories, setCategories] = useState(materialCategories);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [editingMaterial, setEditingMaterial] = useState(null);
  const [filters, setFilters] = useState({
    search: '',
    categories: [],
    types: [],
    status: '',
    lowStock: false
  });

  const handleFilterChange = (newFilters) => {
    setFilters(newFilters);
  };

  // Filtrelenmiş malzemeler
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

  const handleAddMaterial = () => {
    setIsModalOpen(true);
  };

  const handleEditMaterial = (material) => {
    setEditingMaterial(material);
    setIsEditModalOpen(true);
  };

  const handleCategoryManage = () => {
    setIsCategoryModalOpen(true);
  };

  const handleCloseCategoryModal = () => {
    setIsCategoryModalOpen(false);
  };

  const handleSaveCategories = (updatedCategories) => {
    setCategories(updatedCategories);
  };

  const handleSaveMaterial = (materialData, newCategory) => {
    // Yeni kategori eklendiyse kategoriler listesine ekle
    if (newCategory && !categories.some(cat => cat.label === newCategory)) {
      const newCat = {
        id: newCategory.toLowerCase().replace(/\s+/g, '_'),
        label: newCategory
      };
      setCategories([...categories, newCat]);
    }

    // Malzemeyi listeye ekle
    setMaterials(prev => [...prev, materialData]);
    setIsModalOpen(false);
  };

  const handleSaveEditMaterial = (materialData, newCategory) => {
    // Yeni kategori eklendiyse kategoriler listesine ekle
    if (newCategory && !categories.some(cat => cat.label === newCategory)) {
      const newCat = {
        id: newCategory.toLowerCase().replace(/\s+/g, '_'),
        label: newCategory
      };
      setCategories([...categories, newCat]);
    }

    // Malzemeyi güncelle
    setMaterials(prev => 
      prev.map(material => 
        material.code === editingMaterial.code 
          ? { ...materialData }
          : material
      )
    );
    
    setIsEditModalOpen(false);
    setEditingMaterial(null);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
  };

  const handleCloseEditModal = () => {
    setIsEditModalOpen(false);
    setEditingMaterial(null);
  };

  return (
    <div className="materials-page">
      <MaterialsTabs>
        <StocksTabContent 
          filteredMaterials={filteredMaterials}
          categories={categories}
          materialTypes={materialTypes}
          handleFilterChange={handleFilterChange}
          handleAddMaterial={handleAddMaterial}
          handleEditMaterial={handleEditMaterial}
          handleCategoryManage={handleCategoryManage}
        />
        <SuppliersTabContent />
        <OrdersTabContent />
      </MaterialsTabs>
      
      <AddMaterialModal 
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        onSave={handleSaveMaterial}
        categories={categories}
        types={materialTypes}
        materials={materials}
      />

      <EditMaterialModal 
        isOpen={isEditModalOpen}
        onClose={handleCloseEditModal}
        onSave={handleSaveEditMaterial}
        categories={categories}
        types={materialTypes}
        material={editingMaterial}
      />

      <CategoryManagementModal 
        isOpen={isCategoryModalOpen}
        onClose={handleCloseCategoryModal}
        onSave={handleSaveCategories}
        categories={categories}
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
