import React, { useState } from 'react'
import SuppliersTable from './SuppliersTable'
import AddSupplierModal from './AddSupplierModal'

// Geçici suppliers dashboard component
function SuppliersDashboard() {
  return (
    <section className="materials-dashboard">
      <div className="card">
        <h3>Toplam Tedarikçi</h3>
        <p>8</p>
      </div>
      <div className="card">
        <h3>Aktif Tedarikçi</h3>
        <p>7</p>
      </div>
      <div className="card">
        <h3>Bu Ay Sipariş</h3>
        <p>12</p>
      </div>
    </section>
  )
}

// Geçici suppliers filters component
function SuppliersFilters() {
  return (
    <section className="materials-filters">
      <div className="filters-container">
        <div className="search-section">
          <div className="search-input-container">
            <input 
              placeholder="Tedarikçi adı veya kategoriye göre ara..." 
              className="search-input" 
              type="text" 
              readOnly
            />
            <span className="search-icon">🔍</span>
          </div>
        </div>
      </div>
    </section>
  )
}

// Geçici suppliers table component
function SuppliersTablePlaceholder() {
  return <SuppliersTable />
}

export default function SuppliersTabContent({ categories, handleAddMaterial }) {
  const [isAddSupplierModalOpen, setIsAddSupplierModalOpen] = useState(false)
  const [isTransitioningToMaterial, setIsTransitioningToMaterial] = useState(false)

  const handleAddSupplier = (supplierData, newCategory) => {
    console.log('📝 Yeni tedarikçi ekleniyor:', supplierData)
    if (newCategory) {
      console.log('📝 Yeni kategori ekleniyor:', newCategory)
    }
    
    // Firebase/backend işlemleri burada yapılacak
    // Şimdilik sadece console'a yazdırıyoruz
    
    setIsAddSupplierModalOpen(false)
  }

  // Tedarikçi modalından yeni malzeme ekleme
  const handleAddMaterialFromSupplier = (onMaterialCreated) => {
    console.log('🔄 Tedarikçi modalından malzeme ekleme modalına geçiş yapılıyor...')
    setIsTransitioningToMaterial(true)
    setIsAddSupplierModalOpen(false) // Önce tedarikçi modalını kapat
    
    // DOM güncellemesini bekle
    requestAnimationFrame(() => {
      setTimeout(() => {
        console.log('🔄 Malzeme ekleme modalı açılıyor...')
        setIsTransitioningToMaterial(false)
        // Yeni malzeme oluşturulduktan sonra callback'i de ilet
        handleAddMaterial(onMaterialCreated) // Sonra malzeme modalını aç
      }, 100)
    })
  }

  return (
    <div className="stocks-tab-content">
      <div className="materials-header-section">
        <div className="materials-dashboard-container">
          <SuppliersDashboard />
        </div>
        <div className="materials-actions-container">
          <div className="materials-actions">
            <button 
              type="button" 
              className="add-material-btn"
              onClick={() => setIsAddSupplierModalOpen(true)}
            >
              + Yeni Tedarikçi
            </button>
          </div>
        </div>
        <div className="materials-filters-container">
          <SuppliersFilters />
        </div>
      </div>
      <SuppliersTable 
        categories={categories} 
        onAddNewMaterial={handleAddMaterialFromSupplier}
      />
      
      <AddSupplierModal
        isOpen={isAddSupplierModalOpen}
        onClose={() => setIsAddSupplierModalOpen(false)}
        onSave={handleAddSupplier}
        onAddNewMaterial={handleAddMaterialFromSupplier}
      />
    </div>
  )
}