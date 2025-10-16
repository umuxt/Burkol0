import React, { useState, useEffect, useMemo } from 'react'
import { useMaterials, useMaterialActions } from '../hooks/useFirebaseMaterials'
import { categoriesService } from '../services/categories-service'
import EditMaterialModal from './EditMaterialModal'
import ErrorBoundary from './ErrorBoundary'

export default function SuppliersTable({ 
  suppliers = [],
  loading = false,
  suppliersLoading = false,
  onUpdateSupplier,
  onDeleteSupplier,
  onRefreshSuppliers
}) {
  const [selectedSupplier, setSelectedSupplier] = useState(null)
  const [selectedSupplierId, setSelectedSupplierId] = useState(null)
  const [sortField, setSortField] = useState(null)
  const [sortDirection, setSortDirection] = useState('asc')
  const [isEditing, setIsEditing] = useState(false)
  const [formData, setFormData] = useState({})

  // Material management state
  const { materials, loading: materialsLoading, loadMaterials } = useMaterials(false)
  const { addMaterial } = useMaterialActions()
  const [materialMode, setMaterialMode] = useState('existing')
  const [selectedMaterials, setSelectedMaterials] = useState([])
  const [materialSearchTerm, setMaterialSearchTerm] = useState('')
  const [showMaterialPopup, setShowMaterialPopup] = useState(false)
  const [materialCategories, setMaterialCategories] = useState([])
  const [materialTypes] = useState([
    { id: 'raw_material', label: 'Ham Madde' },
    { id: 'wip', label: 'Yarı Mamül' },
    { id: 'final_product', label: 'Bitmiş Ürün' }
  ])
  const [showNewCategory, setShowNewCategory] = useState(false)
  const [newCategory, setNewCategory] = useState('')
  
  // Material detail modal state
  const [showMaterialDetailModal, setShowMaterialDetailModal] = useState(false)
  const [selectedMaterialForDetail, setSelectedMaterialForDetail] = useState(null)
  const [loadingMaterialDetail, setLoadingMaterialDetail] = useState(false)
  
  const [newMaterial, setNewMaterial] = useState({
    name: '',
    type: '',
    category: '',
    unit: '',
    description: '',
    code: '',
    reorderPoint: '',
    stockLevel: '', // stock olarak da kullanılabilir
    costPrice: '',
    sellPrice: '',
    price: '', // backward compatibility için
    supplier: '',
    status: 'Aktif'
  })

  const handleRowClick = (supplier) => {
    setSelectedSupplier(supplier)
    setSelectedSupplierId(supplier.id)
  }

  // Suppliers listesi değiştiğinde selectedSupplier'ı koru ve güncelle
  useEffect(() => {
    if (selectedSupplierId && suppliers && suppliers.length > 0) {
      const currentSupplier = suppliers.find(s => s.id === selectedSupplierId)
      if (currentSupplier) {
        console.log('🔄 SuppliersTable: selectedSupplier güncelleniyor', {
          id: currentSupplier.id
        })
        setSelectedSupplier(currentSupplier)
      }
    }
  }, [suppliers, selectedSupplierId])

  // URL hash kontrolü - sayfa yüklendiğinde hash'deki tedarikçiyi aç
  useEffect(() => {
    const checkHashAndOpenSupplier = () => {
      const hash = window.location.hash;
      
      if (hash.startsWith('#supplier-')) {
        const supplierId = hash.replace('#supplier-', '');
        
        // Suppliers listesi yüklendiyse tedarikçiyi bul ve aç
        if (suppliers && suppliers.length > 0) {
          const supplier = suppliers.find(s => s.id === supplierId);
          if (supplier) {
            setSelectedSupplier(supplier);
            setSelectedSupplierId(supplier.id);
            // Hash'i temizle
            window.history.replaceState(null, null, window.location.pathname);
          }
        } else {
          // 200ms sonra tekrar dene
          setTimeout(checkHashAndOpenSupplier, 200);
        }
      }
    };
    
    // Sayfa yüklendiğinde ve suppliers değiştiğinde kontrol et
    checkHashAndOpenSupplier();
    
    // Hash değişikliklerini dinle
    const handleHashChange = () => {
      checkHashAndOpenSupplier();
    };
    
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [suppliers]);

  // Load categories for material detail modal
  useEffect(() => {
    const loadCategories = async () => {
      try {
        const categories = await categoriesService.getCategories()
        setMaterialCategories(categories)
      } catch (error) {
        console.error('Kategoriler yüklenirken hata:', error)
      }
    }
    loadCategories()
  }, [])

  const handleEdit = () => {
    if (selectedSupplier) {
      setFormData(selectedSupplier)
      setIsEditing(true)
    }
  }

  const handleCancel = () => {
    setIsEditing(false)
    setFormData({})
  }

  const handleInputChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: value
    }))
  }

  const handleSaveSupplier = async (e) => {
    e.preventDefault()
    
    console.log('💾 Saving supplier:', { 
      supplierId: selectedSupplier?.id, 
      selectedSupplier: selectedSupplier,
      formData 
    })
    
    if (!selectedSupplier?.id) {
      console.error('❌ No supplier selected for update')
      alert('Lütfen güncellenecek tedarikçiyi seçin')
      return
    }
    
    if (!formData || Object.keys(formData).length === 0) {
      console.error('❌ No form data to update')
      alert('Güncellenecek veri bulunamadı')
      return
    }
    
    // Remove unnecessary fields from formData that shouldn't be updated
    const cleanFormData = { ...formData }
    delete cleanFormData.id // ID shouldn't be in update data
    delete cleanFormData.createdAt // Don't update creation timestamp
    
    console.log('🧹 Clean form data for update:', cleanFormData)
    
    try {
      if (onUpdateSupplier) {
        await onUpdateSupplier(selectedSupplier.id, cleanFormData)
        console.log('✅ Supplier saved successfully')
        setIsEditing(false)
        setFormData({})
      }
    } catch (error) {
      console.error('❌ Error saving supplier:', error)
      alert(`Tedarikçi kaydedilirken hata oluştu: ${error.message}`)
    }
  }

  const handleDeleteSupplier = async () => {
    if (selectedSupplier && confirm('Bu tedarikçiyi silmek istediğinizden emin misiniz?')) {
      if (onDeleteSupplier) {
        await onDeleteSupplier(selectedSupplier.id)
        setSelectedSupplier(null)
        setSelectedSupplierId(null)
      }
    }
  }

  // Material management functions
  const generateNextMaterialCode = () => {
    if (!materials || materials.length === 0) {
      return 'M-001';
    }
    
    const existingNumbers = materials
      .map(material => {
        const code = material.code || '';
        const match = code.match(/^M-(\d+)$/);
        return match ? parseInt(match[1]) : null;
      })
      .filter(num => num !== null)
      .sort((a, b) => a - b);
    
    let nextNumber = 1;
    for (const num of existingNumbers) {
      if (num === nextNumber) {
        nextNumber++;
      } else if (num > nextNumber) {
        break;
      }
    }
    
    return `M-${String(nextNumber).padStart(3, '0')}`;
  };

  const extractMaterialCategories = async () => {
    try {
      const categoriesFromService = await categoriesService.getCategories()
      const materialCategories = categoriesFromService.filter(cat => 
        cat.type === 'material' || !cat.type
      )
      setMaterialCategories(materialCategories)
    } catch (error) {
      console.error('Categories yüklenirken hata:', error)
      if (materials && materials.length > 0) {
        const categories = [...new Set(materials
          .map(material => material.category)
          .filter(category => category && category.trim() !== '')
        )].sort().map(name => ({ id: name, name }))
        setMaterialCategories(categories)
      }
    }
  }

  const getCategoryName = (categoryId) => {
    const category = materialCategories.find(cat => cat.id === categoryId)
    return category ? (category.name || category.label || categoryId) : categoryId
  }

  const handleOpenMaterialPopup = async () => {
    setShowMaterialPopup(true)
    if (!materials || materials.length === 0) {
      await loadMaterials()
    }
    await extractMaterialCategories()
  }

  const filteredMaterials = useMemo(() => {
    if (!materials || !Array.isArray(materials)) return []
    
    return materials.filter(material => 
      material.name?.toLowerCase().includes(materialSearchTerm.toLowerCase()) ||
      material.code?.toLowerCase().includes(materialSearchTerm.toLowerCase()) ||
      getCategoryName(material.category)?.toLowerCase().includes(materialSearchTerm.toLowerCase())
    )
  }, [materials, materialSearchTerm, materialCategories])

  const handleMaterialSelect = (material) => {
    const isAlreadySelected = selectedMaterials.find(m => m.id === material.id)
    
    if (isAlreadySelected) {
      setSelectedMaterials(prev => prev.filter(m => m.id !== material.id))
    } else {
      setSelectedMaterials(prev => [...prev, material])
    }
  }

  const handleMaterialRemove = (materialId) => {
    setSelectedMaterials(prev => prev.filter(m => m.id !== materialId))
  }

  const handleNewMaterialChange = (e) => {
    const { name, value } = e.target
    setNewMaterial(prev => ({
      ...prev,
      [name]: value
    }))
  }

  const handleCategoryChange = (e) => {
    const value = e.target.value
    if (value === 'new-category') {
      setShowNewCategory(true)
      setNewMaterial(prev => ({ ...prev, category: '' }))
    } else {
      setShowNewCategory(false)
      setNewMaterial(prev => ({ ...prev, category: value }))
    }
  }

  const handleAddNewMaterial = async () => {
    const finalCategory = showNewCategory ? newCategory : newMaterial.category
    
    if (!newMaterial.name || !newMaterial.type || !finalCategory || !newMaterial.unit) {
      alert('Lütfen malzeme adı, tip, kategori ve birim alanlarını doldurun!')
      return
    }

    try {
      if (showNewCategory && newCategory.trim()) {
        try {
          await categoriesService.addCategory({
            name: newCategory.trim(),
            createdAt: new Date(),
            type: 'material'
          })
          console.log('✅ New category added:', newCategory)
        } catch (categoryError) {
          console.error('❌ Category creation failed:', categoryError)
        }
      }

      const finalCode = newMaterial.code.trim() || generateNextMaterialCode()
      
      const materialData = {
        ...newMaterial,
        category: finalCategory,
        code: finalCode,
        createdAt: new Date(),
        suppliers: selectedSupplier ? [selectedSupplier.id] : [],
        reorderPoint: newMaterial.reorderPoint ? parseFloat(newMaterial.reorderPoint) : 0,
        stockLevel: newMaterial.stockLevel ? parseFloat(newMaterial.stockLevel) : 0,
        stock: newMaterial.stockLevel ? parseFloat(newMaterial.stockLevel) : 0, // stock alanı da ekle
        costPrice: newMaterial.costPrice ? parseFloat(newMaterial.costPrice) : 0,
        sellPrice: newMaterial.sellPrice ? parseFloat(newMaterial.sellPrice) : 0,
        price: newMaterial.sellPrice ? parseFloat(newMaterial.sellPrice) : 0 // backward compatibility
      }
      
      const addedMaterial = await addMaterial(materialData)
      
      // Add to selected materials and update supplier
      setSelectedMaterials(prev => [...prev, addedMaterial])
      
      // Update supplier's supplied materials
      if (selectedSupplier && onUpdateSupplier) {
        const updatedSuppliedMaterials = [
          ...(selectedSupplier.suppliedMaterials || []),
          {
            id: addedMaterial.id,
            name: addedMaterial.name,
            category: addedMaterial.category,
            unit: addedMaterial.unit,
            addedAt: new Date(),
            status: 'aktif' // Default status when adding new material
          }
        ]
        
        await onUpdateSupplier(selectedSupplier.id, {
          ...selectedSupplier,
          suppliedMaterials: updatedSuppliedMaterials
        })
      }
      
      // Reset form
      setNewMaterial({
        name: '',
        type: '',
        category: '',
        unit: '',
        description: '',
        code: '',
        reorderPoint: '',
        stockLevel: '',
        costPrice: '',
        sellPrice: '',
        price: '',
        supplier: '',
        status: 'Aktif'
      })
      
      setShowNewCategory(false)
      setNewCategory('')
      setMaterialMode('existing')
      
      alert('Malzeme başarıyla eklendi!')
    } catch (error) {
      console.error('Malzeme eklenirken hata:', error)
      alert('Malzeme eklenirken bir hata oluştu!')
    }
  }

  const handleAddExistingMaterials = async () => {
    if (selectedMaterials.length === 0 || !selectedSupplier) return

    try {
      const updatedSuppliedMaterials = [
        ...(selectedSupplier.suppliedMaterials || []),
        ...selectedMaterials.map(material => ({
          id: material.id,
          name: material.name,
          category: material.category,
          unit: material.unit,
          addedAt: new Date(),
          status: 'aktif' // Default status when adding materials
        }))
      ]

      // Remove duplicates
      const uniqueMaterials = updatedSuppliedMaterials.filter((material, index, self) =>
        index === self.findIndex(m => m.id === material.id)
      )

      if (onUpdateSupplier) {
        await onUpdateSupplier(selectedSupplier.id, {
          ...selectedSupplier,
          suppliedMaterials: uniqueMaterials
        })
      }

      setSelectedMaterials([])
      setShowMaterialPopup(false)
      alert('Malzemeler başarıyla eklendi!')
    } catch (error) {
      console.error('Malzemeler eklenirken hata:', error)
      alert('Malzemeler eklenirken bir hata oluştu!')
    }
  }

  // Material status management
  const handleMaterialStatusChange = async (materialId, newStatus) => {
    if (!selectedSupplier || !onUpdateSupplier) return

    try {
      const updatedSuppliedMaterials = selectedSupplier.suppliedMaterials.map(material =>
        material.id === materialId
          ? { ...material, status: newStatus, statusUpdatedAt: new Date() }
          : material
      )

      await onUpdateSupplier(selectedSupplier.id, {
        ...selectedSupplier,
        suppliedMaterials: updatedSuppliedMaterials
      })

      console.log(`Malzeme durumu güncellendi: ${materialId} -> ${newStatus}`)
    } catch (error) {
      console.error('Malzeme durumu güncellenirken hata:', error)
      alert('Malzeme durumu güncellenirken bir hata oluştu!')
    }
  }

  const getStatusColor = (status) => {
    switch (status) {
      case 'aktif':
        return '#059669' // green
      case 'pasif':
        return '#dc2626' // red
      case 'değerlendirmede':
        return '#d97706' // orange
      default:
        return '#6b7280' // gray
    }
  }

  const getStatusText = (status) => {
    switch (status) {
      case 'aktif':
        return 'Aktif'
      case 'pasif':
        return 'Pasif'
      case 'değerlendirmede':
        return 'Değerlendirmede'
      default:
        return 'Aktif'
    }
  }

  // Material detail modal functions
  const handleShowMaterialDetail = async (materialId) => {
    console.clear() // Console'u temizle
    console.warn('🔍 DEBUG: Modal açılıyor, material ID:', materialId)
    
    // Modal'ı hemen aç
    setShowMaterialDetailModal(true)
    setSelectedMaterialForDetail(null) // Önce null set et ki loading gösterilsin
    setLoadingMaterialDetail(true)
    console.warn('🔄 DEBUG: Loading state TRUE yapıldı')
    
    // Suppliers'ı da refresh et
    if (onRefreshSuppliers) {
      console.log('🔄 Material detail açılıyor, suppliers refresh ediliyor...')
      onRefreshSuppliers()
    }
    
    try {
      console.warn('🔍 DEBUG: Material aranıyor, ID:', materialId)
      console.warn('🔍 DEBUG: Mevcut materials sayısı:', materials.length)
      
      // Materials'ı prop'tan kullan, API call yapma
      let materialsList = materials || []
      
      // Eğer materials boşsa, loadMaterials'ı çağır VE AWAIT ET
      if (materialsList.length === 0 && typeof loadMaterials === 'function') {
        console.warn('🔄 DEBUG: Materials boş, API çağrılıyor...')
        console.warn('🔍 DEBUG: materialsLoading:', materialsLoading)
        try {
          // loadMaterials'dan direkt response al (state timing sorunu için)
          const freshMaterials = await loadMaterials() // AWAIT ET!
          console.warn('🔍 DEBUG: loadMaterials response aldı:', freshMaterials?.length || 0, 'materyal');
          
          // Fresh materials ile material ara
          materialsList = freshMaterials || [];
          console.warn('🔄 DEBUG: Fresh materials kullanılıyor, sayı:', materialsList.length);
          console.warn('🔍 DEBUG: Fresh materials detay:', materialsList.map(m => ({id: m.id, name: m.name, code: m.code})));
        } catch (loadError) {
          console.error('❌ DEBUG: LoadMaterials error:', loadError)
          materialsList = []
        }
      }
      
      // Find material in the loaded materials
      const material = materialsList.find(m => m.id === materialId)
      
      if (material) {
        console.warn('✅ DEBUG: Material bulundu:', material.name)
        setSelectedMaterialForDetail(material)
      } else {
        console.warn('❌ DEBUG: Material bulunamadı, ID:', materialId)
        console.warn('🔍 DEBUG: Mevcut material ID\'leri:', materialsList.map(m => m.id))
        
        // ID ile bulamazsak code ile dene
        const materialByCode = materialsList.find(m => m.code === materialId)
        if (materialByCode) {
          console.warn('✅ DEBUG: Material code ile bulundu:', materialByCode.name)
          setSelectedMaterialForDetail(materialByCode)
        } else {
          console.warn('❌ DEBUG: Material code ile de bulunamadı')
          setSelectedMaterialForDetail(null)
        }
      }
    } catch (error) {
      console.error('❌ Malzeme detayları yüklenirken hata:', error)
      console.error('❌ Error stack:', error.stack)
      console.error('❌ Error details:', {
        name: error.name,
        message: error.message,
        materialId: materialId
      })
      // Hata durumunda modal'ı KAPATMA - açık tut
      // EditMaterialModal kendi error state'ini gösterecek
      setSelectedMaterialForDetail(null) // Sadece material'ı null yap
      // Modal açık kalacak böylece error state gösterilecek
    } finally {
      // Loading state'ini her durumda kapat
      console.warn('🔄 DEBUG: Finally - Loading state FALSE yapılıyor')
      setLoadingMaterialDetail(false)
    }
  }

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDirection('asc')
    }
  }

  const sortedSuppliers = React.useMemo(() => {
    if (!sortField) return suppliers

    return [...suppliers].sort((a, b) => {
      let aVal = a[sortField] || ''
      let bVal = b[sortField] || ''

      if (typeof aVal === 'string') aVal = aVal.toLowerCase()
      if (typeof bVal === 'string') bVal = bVal.toLowerCase()

      if (sortDirection === 'asc') {
        return aVal > bVal ? 1 : -1
      } else {
        return aVal < bVal ? 1 : -1
      }
    })
  }, [suppliers, sortField, sortDirection])

  const getInputStyle = (isEditing) => ({
    padding: '8px 12px',
    border: isEditing ? '1px solid #3b82f6' : '1px solid transparent',
    borderRadius: '4px',
    background: isEditing ? 'white' : 'transparent',
    width: '100%',
    fontSize: '14px'
  })

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex justify-center items-center h-48">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <span className="ml-2 text-gray-600">Tedarikçiler yükleniyor...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="suppliers-container" style={{ 
      display: 'flex', 
      gap: '20px', 
      height: 'calc(100vh - 200px)',
      flexDirection: window.innerWidth <= 768 ? 'column' : 'row'
    }}>
      {/* Sol Panel - Tablo */}
      <div className="suppliers-table-panel" style={{ 
        flex: window.innerWidth <= 768 ? 'none' : '1', 
        minWidth: window.innerWidth <= 768 ? 'auto' : '300px', 
        display: 'flex', 
        flexDirection: 'column',
        height: window.innerWidth <= 768 ? '50vh' : 'auto'
      }}>
        <div className="suppliers-table">
          <div className="table-container" style={{ 
            overflowY: 'auto',
            border: '1px solid #e5e7eb',
            borderRadius: '6px',
            background: 'white'
          }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead style={{ 
                background: 'rgb(248, 249, 250)', 
                position: 'sticky', 
                top: 0, 
                zIndex: 1 
              }}>
                <tr>
                  <th 
                    onClick={() => handleSort('code')}
                    style={{ 
                      padding: '12px 8px', 
                      textAlign: 'left', 
                      cursor: 'pointer',
                      fontSize: '12px',
                      fontWeight: '600',
                      color: 'rgb(55, 65, 81)',
                      borderBottomWidth: '1px',
                      borderBottomStyle: 'solid',
                      borderBottomColor: 'rgb(229, 231, 235)'
                    }}
                  >
                    Kod <span style={{ fontSize: '12px', opacity: '0.6' }}>
                      {sortField === 'code' ? (sortDirection === 'asc' ? '↑' : '↓') : '↕'}
                    </span>
                  </th>
                  <th 
                    onClick={() => handleSort('name')}
                    style={{ 
                      padding: '12px 8px', 
                      textAlign: 'left', 
                      cursor: 'pointer',
                      fontSize: '12px',
                      fontWeight: '600',
                      color: 'rgb(55, 65, 81)',
                      borderBottomWidth: '1px',
                      borderBottomStyle: 'solid',
                      borderBottomColor: 'rgb(229, 231, 235)'
                    }}
                  >
                    Firma Adı <span style={{ fontSize: '12px', opacity: '0.6' }}>
                      {sortField === 'name' ? (sortDirection === 'asc' ? '↑' : '↓') : '↕'}
                    </span>
                  </th>
                  <th 
                    onClick={() => handleSort('categories')}
                    style={{ 
                      padding: '12px 8px', 
                      textAlign: 'left', 
                      cursor: 'pointer',
                      fontSize: '12px',
                      fontWeight: '600',
                      color: 'rgb(55, 65, 81)',
                      borderBottomWidth: '1px',
                      borderBottomStyle: 'solid',
                      borderBottomColor: 'rgb(229, 231, 235)'
                    }}
                  >
                    Kategoriler <span style={{ fontSize: '12px', opacity: '0.6' }}>
                      {sortField === 'categories' ? (sortDirection === 'asc' ? '↑' : '↓') : '↕'}
                    </span>
                  </th>
                  {!selectedSupplier && (
                    <th 
                      style={{ 
                        padding: '12px 8px', 
                        textAlign: 'center', 
                        fontSize: '12px',
                        fontWeight: '600',
                        color: 'rgb(55, 65, 81)',
                        borderBottomWidth: '1px',
                        borderBottomStyle: 'solid',
                        borderBottomColor: 'rgb(229, 231, 235)',
                        width: '180px'
                      }}
                    >
                      Aksiyonlar
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {sortedSuppliers.map(supplier => (
                  <tr
                    key={supplier.id}
                    onClick={() => handleRowClick(supplier)}
                    style={{
                      cursor: 'pointer',
                      backgroundColor: selectedSupplier?.id === supplier.id ? 'rgb(239, 246, 255)' : 'white',
                      borderBottomWidth: '1px',
                      borderBottomStyle: 'solid',
                      borderBottomColor: 'rgb(243, 244, 246)'
                    }}
                    onMouseEnter={(e) => {
                      if (selectedSupplier?.id !== supplier.id) {
                        e.currentTarget.style.backgroundColor = '#f9fafb'
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (selectedSupplier?.id !== supplier.id) {
                        e.currentTarget.style.backgroundColor = 'white'
                      }
                    }}
                  >
                    <td style={{ padding: '12px 8px', fontSize: '13px', fontWeight: '500', color: '#000' }}>
                      {supplier.code}
                    </td>
                    <td style={{ padding: '12px 8px', fontSize: '13px', color: '#000' }}>
                      {supplier.name || supplier.companyName}
                    </td>
                    <td style={{ padding: '12px 8px', fontSize: '13px' }}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                        {supplier.suppliedMaterials && supplier.suppliedMaterials.length > 0 
                          ? [...new Set(supplier.suppliedMaterials.map(material => {
                              const category = materialCategories.find(cat => cat.id === material.category);
                              return category ? category.name : material.category;
                            }).filter(Boolean))].map((categoryName, index) => (
                              <span 
                                key={index}
                                style={{ 
                                  backgroundColor: '#f3f4f6', 
                                  color: 'rgb(107, 114, 128)', 
                                  padding: '2px 6px',
                                  borderRadius: '4px',
                                  fontSize: '11px',
                                  fontWeight: '500'
                                }}
                              >
                                {categoryName}
                              </span>
                            ))
                          : <span style={{ color: 'rgb(107, 114, 128)', fontStyle: 'italic', fontSize: '11px' }}>Kategoriler</span>
                        }
                      </div>
                    </td>
                    {!selectedSupplier && (
                      <td style={{ padding: '12px 8px', fontSize: '13px', textAlign: 'center' }}>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (supplier.phone1) {
                              window.open(`tel:${supplier.phone1}`, '_self');
                            }
                          }}
                          style={{
                            padding: '2px',
                            border: 'none',
                            borderRadius: '3px',
                            background: 'transparent',
                            color: '#374151',
                            fontSize: '10px',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: '16px',
                            height: '16px',
                            lineHeight: 1,
                            transition: 'all 0.2s ease',
                            marginRight: '4px'
                          }}
                          onMouseEnter={(e) => {
                            e.target.style.transform = 'scale(1.1)';
                          }}
                          onMouseLeave={(e) => {
                            e.target.style.transform = 'scale(1)';
                          }}
                          title={`Ara: ${supplier.phone1 || 'Telefon bulunamadı'}`}
                        >
                          📞
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (supplier.email1) {
                              window.open(`mailto:${supplier.email1}`, '_blank');
                            }
                          }}
                          style={{
                            padding: '2px',
                            border: 'none',
                            borderRadius: '3px',
                            background: 'transparent',
                            color: '#374151',
                            fontSize: '10px',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: '16px',
                            height: '16px',
                            lineHeight: 1,
                            transition: 'all 0.2s ease',
                            marginRight: '4px'
                          }}
                          onMouseEnter={(e) => {
                            e.target.style.transform = 'scale(1.1)';
                          }}
                          onMouseLeave={(e) => {
                            e.target.style.transform = 'scale(1)';
                          }}
                          title={`Mail At: ${supplier.email1 || 'Email bulunamadı'}`}
                        >
                          📧
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            // Sipariş ver fonksiyonu henüz atanmayacak
                          }}
                          style={{
                            padding: '2px',
                            border: 'none',
                            borderRadius: '3px',
                            background: 'transparent',
                            color: '#374151',
                            fontSize: '10px',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: '16px',
                            height: '16px',
                            lineHeight: 1,
                            transition: 'all 0.2s ease'
                          }}
                          onMouseEnter={(e) => {
                            e.target.style.transform = 'scale(1.1)';
                          }}
                          onMouseLeave={(e) => {
                            e.target.style.transform = 'scale(1)';
                          }}
                          title="Sipariş Ver"
                        >
                          🛒
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Sağ Panel - Detaylar */}
      {selectedSupplier && (
        <div className="supplier-detail-panel" style={{ 
          flex: window.innerWidth <= 768 ? 'none' : '1',
          minWidth: window.innerWidth <= 768 ? 'auto' : '400px',
          height: window.innerWidth <= 768 ? '50vh' : 'auto'
        }}>
          <div style={{ 
            background: 'white', 
            borderRadius: '6px', 
            border: '1px solid #e5e7eb',
            height: '100%',
            display: 'flex',
            flexDirection: 'column'
          }}>
            {/* Header */}
            <div style={{ 
              padding: '16px 20px', 
              borderBottom: '1px solid #e5e7eb',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <button
                  onClick={() => setSelectedSupplier(null)}
                  style={{
                    padding: '6px 12px',
                    border: '1px solid #d1d5db',
                    borderRadius: '4px',
                    background: 'white',
                    color: '#374151',
                    cursor: 'pointer',
                    fontSize: '12px'
                  }}
                  title="Detayları Kapat"
                >
                  ←
                </button>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '600', color: '#111827' }}>
                  Tedarikçi Detayları
                </h3>
              </div>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (selectedSupplier.phone1) {
                      window.open(`tel:${selectedSupplier.phone1}`, '_self');
                    }
                  }}
                  style={{
                    padding: '6px',
                    border: 'none',
                    borderRadius: '4px',
                    background: 'transparent',
                    color: '#374151',
                    fontSize: '12px',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '24px',
                    height: '24px',
                    lineHeight: 1,
                    transition: 'all 0.2s ease'
                  }}
                  onMouseEnter={(e) => {
                    e.target.style.transform = 'scale(1.1)';
                  }}
                  onMouseLeave={(e) => {
                    e.target.style.transform = 'scale(1)';
                  }}
                  title={`Ara: ${selectedSupplier.phone1 || 'Telefon bulunamadı'}`}
                >
                  📞
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (selectedSupplier.email1) {
                      window.open(`mailto:${selectedSupplier.email1}`, '_blank');
                    }
                  }}
                  style={{
                    padding: '6px',
                    border: 'none',
                    borderRadius: '4px',
                    background: 'transparent',
                    color: '#374151',
                    fontSize: '12px',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '24px',
                    height: '24px',
                    lineHeight: 1,
                    transition: 'all 0.2s ease'
                  }}
                  onMouseEnter={(e) => {
                    e.target.style.transform = 'scale(1.1)';
                  }}
                  onMouseLeave={(e) => {
                    e.target.style.transform = 'scale(1)';
                  }}
                  title={`Mail At: ${selectedSupplier.email1 || 'Email bulunamadı'}`}
                >
                  📧
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    // Sipariş ver fonksiyonu henüz atanmayacak
                  }}
                  style={{
                    padding: '6px',
                    border: 'none',
                    borderRadius: '4px',
                    background: 'transparent',
                    color: '#374151',
                    fontSize: '12px',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '24px',
                    height: '24px',
                    lineHeight: 1,
                    transition: 'all 0.2s ease',
                    marginRight: '8px'
                  }}
                  onMouseEnter={(e) => {
                    e.target.style.transform = 'scale(1.1)';
                  }}
                  onMouseLeave={(e) => {
                    e.target.style.transform = 'scale(1)';
                  }}
                  title="Sipariş Ver"
                >
                  🛒
                </button>
                {!isEditing ? (
                  <button
                    onClick={handleEdit}
                    style={{
                      padding: '6px 12px',
                      border: '1px solid #d1d5db',
                      borderRadius: '4px',
                      background: 'white',
                      color: '#374151',
                      cursor: 'pointer',
                      fontSize: '12px'
                    }}
                  >
                    ✏️ Düzenle
                  </button>
                ) : (
                  <>
                    <button
                      type="submit"
                      form="supplier-detail-form"
                      style={{
                        padding: '6px 12px',
                        border: 'none',
                        borderRadius: '4px',
                        background: '#3b82f6',
                        color: 'white',
                        cursor: 'pointer',
                        fontSize: '12px'
                      }}
                    >
                      💾 Kaydet
                    </button>
                    <button
                      onClick={handleCancel}
                      style={{
                        padding: '6px 12px',
                        border: '1px solid #d1d5db',
                        borderRadius: '4px',
                        background: 'white',
                        color: '#374151',
                        cursor: 'pointer',
                        fontSize: '12px'
                      }}
                    >
                      ❌ İptal
                    </button>
                  </>
                )}
                <button
                  onClick={handleDeleteSupplier}
                  style={{
                    padding: '6px 12px',
                    border: '1px solid #dc2626',
                    borderRadius: '4px',
                    background: 'white',
                    color: '#dc2626',
                    cursor: 'pointer',
                    fontSize: '12px'
                  }}
                >
                  🗑️ Sil
                </button>
              </div>
            </div>

            {/* Content */}
            <div style={{ flex: 1, overflow: 'auto', padding: '20px' }}>
              <form onSubmit={handleSaveSupplier} id="supplier-detail-form" className="supplier-details-layout">
                {/* Temel Firma Bilgileri */}
                <div style={{ 
                  marginBottom: '16px', 
                  padding: '12px', 
                  background: 'white', 
                  borderRadius: '6px',
                  border: '1px solid #e5e7eb'
                }}>
                  <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: '600', color: '#111827', borderBottom: '1px solid #e5e7eb', paddingBottom: '6px' }}>
                    Temel Firma Bilgileri
                  </h3>
                  
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                    <div className="detail-item" style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                      <span className="detail-label" style={{ fontWeight: '600', fontSize: '12px', color: '#374151', minWidth: '120px', marginRight: '8px' }}>
                        Tedarikçi Kodu:
                      </span>
                      {isEditing ? (
                        <input
                          type="text"
                          name="code"
                          value={formData.code || ''}
                          onChange={handleInputChange}
                          style={getInputStyle(isEditing)}
                        />
                      ) : (
                        <span className="detail-value" style={{ fontSize: '12px', color: '#111827' }}>
                          {selectedSupplier.code || '-'}
                        </span>
                      )}
                    </div>
                    
                    <div className="detail-item" style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                      <span className="detail-label" style={{ fontWeight: '600', fontSize: '12px', color: '#374151', minWidth: '120px', marginRight: '8px' }}>
                        Durum:
                      </span>
                      {isEditing ? (
                        <select
                          name="status"
                          value={formData.status || ''}
                          onChange={handleInputChange}
                          style={getInputStyle(isEditing)}
                        >
                          <option value="Aktif">Aktif</option>
                          <option value="Pasif">Pasif</option>
                          <option value="Onay Bekliyor">Onay Bekliyor</option>
                          <option value="Askıda">Askıda</option>
                        </select>
                      ) : (
                        <span className="detail-value" style={{ fontSize: '12px', color: '#111827' }}>
                          {selectedSupplier.status || '-'}
                        </span>
                      )}
                    </div>
                  </div>
                  
                  <div className="detail-item" style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                    <span className="detail-label" style={{ fontWeight: '600', fontSize: '12px', color: '#374151', minWidth: '120px', marginRight: '8px' }}>
                      Firma Adı:
                    </span>
                    {isEditing ? (
                      <input
                        type="text"
                        name="name"
                        value={formData.name || ''}
                        onChange={handleInputChange}
                        style={{ ...getInputStyle(isEditing), flex: 1 }}
                      />
                    ) : (
                      <span className="detail-value" style={{ fontSize: '12px', color: '#111827' }}>
                        {selectedSupplier.name || selectedSupplier.companyName || '-'}
                      </span>
                    )}
                  </div>
                  
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                    <div className="detail-item" style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                      <span className="detail-label" style={{ fontWeight: '600', fontSize: '12px', color: '#374151', minWidth: '120px', marginRight: '8px' }}>
                        Tedarikçi Tipi:
                      </span>
                      {isEditing ? (
                        <select
                          name="supplierType"
                          value={formData.supplierType || ''}
                          onChange={handleInputChange}
                          style={getInputStyle(isEditing)}
                        >
                          <option value="">Seçin</option>
                          <option value="manufacturer">Üretici</option>
                          <option value="distributor">Distribütör</option>
                          <option value="wholesaler">Toptancı</option>
                          <option value="service_provider">Hizmet Sağlayıcı</option>
                          <option value="contractor">Yüklenici</option>
                          <option value="consultant">Danışman</option>
                        </select>
                      ) : (
                        <span className="detail-value" style={{ fontSize: '12px', color: '#111827' }}>
                          {selectedSupplier.supplierType || '-'}
                        </span>
                      )}
                    </div>
                    
                    <div className="detail-item" style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                      <span className="detail-label" style={{ fontWeight: '600', fontSize: '12px', color: '#374151', minWidth: '120px', marginRight: '8px' }}>
                        İş Kayıt No:
                      </span>
                      {isEditing ? (
                        <input
                          type="text"
                          name="businessRegistrationNumber"
                          value={formData.businessRegistrationNumber || ''}
                          onChange={handleInputChange}
                          style={getInputStyle(isEditing)}
                        />
                      ) : (
                        <span className="detail-value" style={{ fontSize: '12px', color: '#111827' }}>
                          {selectedSupplier.businessRegistrationNumber || '-'}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* İletişim Bilgileri */}
                <div style={{ 
                  marginBottom: '16px', 
                  padding: '12px', 
                  background: 'white', 
                  borderRadius: '6px',
                  border: '1px solid #e5e7eb'
                }}>
                  <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: '600', color: '#111827', borderBottom: '1px solid #e5e7eb', paddingBottom: '6px' }}>
                    İletişim Bilgileri
                  </h3>
                  
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '8px' }}>
                    <div className="detail-item" style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                      <span className="detail-label" style={{ fontWeight: '600', fontSize: '12px', color: '#374151', minWidth: '120px', marginRight: '8px' }}>
                        Yetkili Kişi:
                      </span>
                      {isEditing ? (
                        <input
                          type="text"
                          name="contactPerson"
                          value={formData.contactPerson || ''}
                          onChange={handleInputChange}
                          style={getInputStyle(isEditing)}
                        />
                      ) : (
                        <span className="detail-value" style={{ fontSize: '12px', color: '#111827' }}>
                          {selectedSupplier.contactPerson || '-'}
                        </span>
                      )}
                    </div>
                    
                    <div className="detail-item" style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                      <span className="detail-label" style={{ fontWeight: '600', fontSize: '12px', color: '#374151', minWidth: '120px', marginRight: '8px' }}>
                        Acil Durum:
                      </span>
                      {isEditing ? (
                        <input
                          type="text"
                          name="emergencyContact"
                          value={formData.emergencyContact || ''}
                          onChange={handleInputChange}
                          style={getInputStyle(isEditing)}
                        />
                      ) : (
                        <span className="detail-value" style={{ fontSize: '12px', color: '#111827' }}>
                          {selectedSupplier.emergencyContact || '-'}
                        </span>
                      )}
                    </div>
                  </div>
                  
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px', marginBottom: '8px' }}>
                    <div className="detail-item" style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                      <span className="detail-label" style={{ fontWeight: '600', fontSize: '12px', color: '#374151', minWidth: '80px', marginRight: '8px' }}>
                        Telefon 1:
                      </span>
                      {isEditing ? (
                        <input
                          type="tel"
                          name="phone1"
                          value={formData.phone1 || ''}
                          onChange={handleInputChange}
                          style={getInputStyle(isEditing)}
                        />
                      ) : (
                        <span className="detail-value" style={{ fontSize: '12px', color: '#111827' }}>
                          {selectedSupplier.phone1 || '-'}
                        </span>
                      )}
                    </div>
                    
                    <div className="detail-item" style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                      <span className="detail-label" style={{ fontWeight: '600', fontSize: '12px', color: '#374151', minWidth: '80px', marginRight: '8px' }}>
                        Telefon 2:
                      </span>
                      {isEditing ? (
                        <input
                          type="tel"
                          name="phone2"
                          value={formData.phone2 || ''}
                          onChange={handleInputChange}
                          style={getInputStyle(isEditing)}
                        />
                      ) : (
                        <span className="detail-value" style={{ fontSize: '12px', color: '#111827' }}>
                          {selectedSupplier.phone2 || '-'}
                        </span>
                      )}
                    </div>
                    
                    <div className="detail-item" style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                      <span className="detail-label" style={{ fontWeight: '600', fontSize: '12px', color: '#374151', minWidth: '80px', marginRight: '8px' }}>
                        Acil Tel:
                      </span>
                      {isEditing ? (
                        <input
                          type="tel"
                          name="emergencyPhone"
                          value={formData.emergencyPhone || ''}
                          onChange={handleInputChange}
                          style={getInputStyle(isEditing)}
                        />
                      ) : (
                        <span className="detail-value" style={{ fontSize: '12px', color: '#111827' }}>
                          {selectedSupplier.emergencyPhone || '-'}
                        </span>
                      )}
                    </div>
                  </div>
                  
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px', marginBottom: '8px' }}>
                    <div className="detail-item" style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                      <span className="detail-label" style={{ fontWeight: '600', fontSize: '12px', color: '#374151', minWidth: '80px', marginRight: '8px' }}>
                        E-posta 1:
                      </span>
                      {isEditing ? (
                        <input
                          type="email"
                          name="email1"
                          value={formData.email1 || ''}
                          onChange={handleInputChange}
                          style={getInputStyle(isEditing)}
                        />
                      ) : (
                        <span className="detail-value" style={{ fontSize: '12px', color: '#111827' }}>
                          {selectedSupplier.email1 || '-'}
                        </span>
                      )}
                    </div>
                    
                    <div className="detail-item" style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                      <span className="detail-label" style={{ fontWeight: '600', fontSize: '12px', color: '#374151', minWidth: '80px', marginRight: '8px' }}>
                        E-posta 2:
                      </span>
                      {isEditing ? (
                        <input
                          type="email"
                          name="email2"
                          value={formData.email2 || ''}
                          onChange={handleInputChange}
                          style={getInputStyle(isEditing)}
                        />
                      ) : (
                        <span className="detail-value" style={{ fontSize: '12px', color: '#111827' }}>
                          {selectedSupplier.email2 || '-'}
                        </span>
                      )}
                    </div>
                    
                    <div className="detail-item" style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                      <span className="detail-label" style={{ fontWeight: '600', fontSize: '12px', color: '#374151', minWidth: '80px', marginRight: '8px' }}>
                        Faks:
                      </span>
                      {isEditing ? (
                        <input
                          type="tel"
                          name="fax"
                          value={formData.fax || ''}
                          onChange={handleInputChange}
                          style={getInputStyle(isEditing)}
                        />
                      ) : (
                        <span className="detail-value" style={{ fontSize: '12px', color: '#111827' }}>
                          {selectedSupplier.fax || '-'}
                        </span>
                      )}
                    </div>
                  </div>
                  
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                    <div className="detail-item" style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                      <span className="detail-label" style={{ fontWeight: '600', fontSize: '12px', color: '#374151', minWidth: '120px', marginRight: '8px' }}>
                        Web Sitesi:
                      </span>
                      {isEditing ? (
                        <input
                          type="url"
                          name="website"
                          value={formData.website || ''}
                          onChange={handleInputChange}
                          style={getInputStyle(isEditing)}
                        />
                      ) : (
                        <span className="detail-value" style={{ fontSize: '12px', color: '#111827' }}>
                          {selectedSupplier.website || '-'}
                        </span>
                      )}
                    </div>
                    
                    <div className="detail-item" style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                      <span className="detail-label" style={{ fontWeight: '600', fontSize: '12px', color: '#374151', minWidth: '120px', marginRight: '8px' }}>
                        Tercih İletişim:
                      </span>
                      {isEditing ? (
                        <select
                          name="preferredCommunication"
                          value={formData.preferredCommunication || ''}
                          onChange={handleInputChange}
                          style={getInputStyle(isEditing)}
                        >
                          <option value="email">E-posta</option>
                          <option value="phone">Telefon</option>
                          <option value="fax">Faks</option>
                          <option value="whatsapp">WhatsApp</option>
                        </select>
                      ) : (
                        <span className="detail-value" style={{ fontSize: '12px', color: '#111827' }}>
                          {selectedSupplier.preferredCommunication || '-'}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Adres ve Mali Bilgiler - Üst Bölüm */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                  {/* Adres Bilgileri */}
                  <div style={{ 
                    padding: '12px', 
                    background: 'white', 
                    borderRadius: '6px',
                    border: '1px solid #e5e7eb'
                  }}>
                    <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: '600', color: '#111827', borderBottom: '1px solid #e5e7eb', paddingBottom: '6px' }}>
                      Adres Bilgileri
                    </h3>
                    
                    <div className="detail-item" style={{ display: 'flex', alignItems: 'flex-start', marginBottom: '8px' }}>
                      <span className="detail-label" style={{ fontWeight: '600', fontSize: '12px', color: '#374151', minWidth: '80px', marginRight: '8px', marginTop: '2px' }}>
                        Adres:
                      </span>
                      {isEditing ? (
                        <textarea
                          name="address"
                          value={formData.address || ''}
                          onChange={handleInputChange}
                          rows="2"
                          style={{ ...getInputStyle(isEditing), flex: 1, resize: 'vertical' }}
                        />
                      ) : (
                        <span className="detail-value description" style={{ fontSize: '12px', color: '#111827', flex: 1 }}>
                          {selectedSupplier.address || 'Adres girilmemiş'}
                        </span>
                      )}
                    </div>
                    
                    <div className="detail-item" style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                      <span className="detail-label" style={{ fontWeight: '600', fontSize: '12px', color: '#374151', minWidth: '80px', marginRight: '8px' }}>
                        Şehir:
                      </span>
                      {isEditing ? (
                        <input
                          type="text"
                          name="city"
                          value={formData.city || ''}
                          onChange={handleInputChange}
                          style={getInputStyle(isEditing)}
                        />
                      ) : (
                        <span className="detail-value" style={{ fontSize: '12px', color: '#111827' }}>
                          {selectedSupplier.city || '-'}
                        </span>
                      )}
                    </div>
                    
                    <div className="detail-item" style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                      <span className="detail-label" style={{ fontWeight: '600', fontSize: '12px', color: '#374151', minWidth: '80px', marginRight: '8px' }}>
                        İlçe:
                      </span>
                      {isEditing ? (
                        <input
                          type="text"
                          name="state"
                          value={formData.state || ''}
                          onChange={handleInputChange}
                          style={getInputStyle(isEditing)}
                        />
                      ) : (
                        <span className="detail-value" style={{ fontSize: '12px', color: '#111827' }}>
                          {selectedSupplier.state || '-'}
                        </span>
                      )}
                    </div>
                    
                    <div className="detail-item" style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                      <span className="detail-label" style={{ fontWeight: '600', fontSize: '12px', color: '#374151', minWidth: '80px', marginRight: '8px' }}>
                        Posta Kodu:
                      </span>
                      {isEditing ? (
                        <input
                          type="text"
                          name="postalCode"
                          value={formData.postalCode || ''}
                          onChange={handleInputChange}
                          style={getInputStyle(isEditing)}
                        />
                      ) : (
                        <span className="detail-value" style={{ fontSize: '12px', color: '#111827' }}>
                          {selectedSupplier.postalCode || '-'}
                        </span>
                      )}
                    </div>
                    
                    <div className="detail-item" style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                      <span className="detail-label" style={{ fontWeight: '600', fontSize: '12px', color: '#374151', minWidth: '80px', marginRight: '8px' }}>
                        Ülke:
                      </span>
                      {isEditing ? (
                        <select
                          name="country"
                          value={formData.country || ''}
                          onChange={handleInputChange}
                          style={getInputStyle(isEditing)}
                        >
                          <option value="Türkiye">Türkiye</option>
                          <option value="Almanya">Almanya</option>
                          <option value="Fransa">Fransa</option>
                          <option value="İtalya">İtalya</option>
                          <option value="İngiltere">İngiltere</option>
                          <option value="ABD">ABD</option>
                          <option value="Çin">Çin</option>
                          <option value="Japonya">Japonya</option>
                          <option value="Other">Diğer</option>
                        </select>
                      ) : (
                        <span className="detail-value" style={{ fontSize: '12px', color: '#111827' }}>
                          {selectedSupplier.country || '-'}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Mali Bilgiler */}
                  <div style={{ 
                    padding: '12px', 
                    background: 'white', 
                    borderRadius: '6px',
                    border: '1px solid #e5e7eb'
                  }}>
                    <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: '600', color: '#111827', borderBottom: '1px solid #e5e7eb', paddingBottom: '6px' }}>
                      Mali Bilgiler
                    </h3>
                    
                    <div className="detail-item" style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                      <span className="detail-label" style={{ fontWeight: '600', fontSize: '12px', color: '#374151', minWidth: '80px', marginRight: '8px' }}>
                        Vergi No:
                      </span>
                      {isEditing ? (
                        <input
                          type="text"
                          name="taxNumber"
                          value={formData.taxNumber || ''}
                          onChange={handleInputChange}
                          style={getInputStyle(isEditing)}
                        />
                      ) : (
                        <span className="detail-value" style={{ fontSize: '12px', color: '#111827' }}>
                          {selectedSupplier.taxNumber || '-'}
                        </span>
                      )}
                    </div>
                    
                    <div className="detail-item" style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                      <span className="detail-label" style={{ fontWeight: '600', fontSize: '12px', color: '#374151', minWidth: '80px', marginRight: '8px' }}>
                        Vergi Dairesi:
                      </span>
                      {isEditing ? (
                        <input
                          type="text"
                          name="taxOffice"
                          value={formData.taxOffice || ''}
                          onChange={handleInputChange}
                          style={getInputStyle(isEditing)}
                        />
                      ) : (
                        <span className="detail-value" style={{ fontSize: '12px', color: '#111827' }}>
                          {selectedSupplier.taxOffice || '-'}
                        </span>
                      )}
                    </div>
                    
                    <div className="detail-item" style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                      <span className="detail-label" style={{ fontWeight: '600', fontSize: '12px', color: '#374151', minWidth: '80px', marginRight: '8px' }}>
                        Para Birimi:
                      </span>
                      {isEditing ? (
                        <select
                          name="currency"
                          value={formData.currency || ''}
                          onChange={handleInputChange}
                          style={getInputStyle(isEditing)}
                        >
                          <option value="TRY">TRY</option>
                          <option value="USD">USD</option>
                          <option value="EUR">EUR</option>
                          <option value="GBP">GBP</option>
                        </select>
                      ) : (
                        <span className="detail-value" style={{ fontSize: '12px', color: '#111827' }}>
                          {selectedSupplier.currency || '-'}
                        </span>
                      )}
                    </div>
                    
                    <div className="detail-item" style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                      <span className="detail-label" style={{ fontWeight: '600', fontSize: '12px', color: '#374151', minWidth: '80px', marginRight: '8px' }}>
                        Kredi Limiti:
                      </span>
                      {isEditing ? (
                        <input
                          type="number"
                          name="creditLimit"
                          value={formData.creditLimit || ''}
                          onChange={handleInputChange}
                          style={getInputStyle(isEditing)}
                        />
                      ) : (
                        <span className="detail-value" style={{ fontSize: '12px', color: '#111827' }}>
                          {selectedSupplier.creditLimit || '-'}
                        </span>
                      )}
                    </div>
                    
                    <div className="detail-item" style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                      <span className="detail-label" style={{ fontWeight: '600', fontSize: '12px', color: '#374151', minWidth: '80px', marginRight: '8px' }}>
                        Kredi Notu:
                      </span>
                      {isEditing ? (
                        <select
                          name="creditRating"
                          value={formData.creditRating || ''}
                          onChange={handleInputChange}
                          style={getInputStyle(isEditing)}
                        >
                          <option value="">Seçin</option>
                          <option value="A">A - Mükemmel</option>
                          <option value="B">B - İyi</option>
                          <option value="C">C - Orta</option>
                          <option value="D">D - Zayıf</option>
                          <option value="F">F - Riskli</option>
                        </select>
                      ) : (
                        <span className="detail-value" style={{ fontSize: '12px', color: '#111827' }}>
                          {selectedSupplier.creditRating || '-'}
                        </span>
                      )}
                    </div>
                    
                    <div className="detail-item" style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                      <span className="detail-label" style={{ fontWeight: '600', fontSize: '12px', color: '#374151', minWidth: '80px', marginRight: '8px' }}>
                        Yıllık Ciro:
                      </span>
                      {isEditing ? (
                        <input
                          type="number"
                          name="annualRevenue"
                          value={formData.annualRevenue || ''}
                          onChange={handleInputChange}
                          style={getInputStyle(isEditing)}
                        />
                      ) : (
                        <span className="detail-value" style={{ fontSize: '12px', color: '#111827' }}>
                          {selectedSupplier.annualRevenue || '-'}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Ödeme ve Operasyonel Bilgiler - Orta Bölüm */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                  {/* Ödeme Bilgileri */}
                  <div style={{ 
                    padding: '12px', 
                    background: 'white', 
                    borderRadius: '6px',
                    border: '1px solid #e5e7eb'
                  }}>
                    <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: '600', color: '#111827', borderBottom: '1px solid #e5e7eb', paddingBottom: '6px' }}>
                      Ödeme Bilgileri
                    </h3>
                    
                    <div className="detail-item" style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                      <span className="detail-label" style={{ fontWeight: '600', fontSize: '12px', color: '#374151', minWidth: '80px', marginRight: '8px' }}>
                        Ödeme Koşul:
                      </span>
                      {isEditing ? (
                        <select
                          name="paymentTerms"
                          value={formData.paymentTerms || ''}
                          onChange={handleInputChange}
                          style={getInputStyle(isEditing)}
                        >
                          <option value="">Seçin</option>
                          <option value="Peşin">Peşin</option>
                          <option value="15 gün vade">15 gün</option>
                          <option value="30 gün vade">30 gün</option>
                          <option value="45 gün vade">45 gün</option>
                          <option value="60 gün vade">60 gün</option>
                          <option value="90 gün vade">90 gün</option>
                          <option value="120 gün vade">120 gün</option>
                        </select>
                      ) : (
                        <span className="detail-value" style={{ fontSize: '12px', color: '#111827' }}>
                          {selectedSupplier.paymentTerms || '-'}
                        </span>
                      )}
                    </div>
                    
                    <div className="detail-item" style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                      <span className="detail-label" style={{ fontWeight: '600', fontSize: '12px', color: '#374151', minWidth: '80px', marginRight: '8px' }}>
                        Ödeme Yöntem:
                      </span>
                      {isEditing ? (
                        <select
                          name="paymentMethod"
                          value={formData.paymentMethod || ''}
                          onChange={handleInputChange}
                          style={getInputStyle(isEditing)}
                        >
                          <option value="">Seçin</option>
                          <option value="bank_transfer">Havale/EFT</option>
                          <option value="check">Çek</option>
                          <option value="cash">Nakit</option>
                          <option value="credit_card">Kredi Kartı</option>
                          <option value="letter_of_credit">Akreditif</option>
                          <option value="promissory_note">Senet</option>
                        </select>
                      ) : (
                        <span className="detail-value" style={{ fontSize: '12px', color: '#111827' }}>
                          {selectedSupplier.paymentMethod || '-'}
                        </span>
                      )}
                    </div>
                    
                    <div className="detail-item" style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                      <span className="detail-label" style={{ fontWeight: '600', fontSize: '12px', color: '#374151', minWidth: '80px', marginRight: '8px' }}>
                        Banka:
                      </span>
                      {isEditing ? (
                        <input
                          type="text"
                          name="bankName"
                          value={formData.bankName || ''}
                          onChange={handleInputChange}
                          style={getInputStyle(isEditing)}
                        />
                      ) : (
                        <span className="detail-value" style={{ fontSize: '12px', color: '#111827' }}>
                          {selectedSupplier.bankName || '-'}
                        </span>
                      )}
                    </div>
                    
                    <div className="detail-item" style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                      <span className="detail-label" style={{ fontWeight: '600', fontSize: '12px', color: '#374151', minWidth: '80px', marginRight: '8px' }}>
                        Hesap No:
                      </span>
                      {isEditing ? (
                        <input
                          type="text"
                          name="bankAccount"
                          value={formData.bankAccount || ''}
                          onChange={handleInputChange}
                          style={getInputStyle(isEditing)}
                        />
                      ) : (
                        <span className="detail-value" style={{ fontSize: '12px', color: '#111827' }}>
                          {selectedSupplier.bankAccount || '-'}
                        </span>
                      )}
                    </div>
                    
                    <div className="detail-item" style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                      <span className="detail-label" style={{ fontWeight: '600', fontSize: '12px', color: '#374151', minWidth: '80px', marginRight: '8px' }}>
                        IBAN:
                      </span>
                      {isEditing ? (
                        <input
                          type="text"
                          name="iban"
                          value={formData.iban || ''}
                          onChange={handleInputChange}
                          style={{ ...getInputStyle(isEditing), flex: 1 }}
                        />
                      ) : (
                        <span className="detail-value" style={{ fontSize: '12px', color: '#111827' }}>
                          {selectedSupplier.iban || '-'}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Operasyonel Bilgiler */}
                  <div style={{ 
                    padding: '12px', 
                    background: 'white', 
                    borderRadius: '6px',
                    border: '1px solid #e5e7eb'
                  }}>
                    <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: '600', color: '#111827', borderBottom: '1px solid #e5e7eb', paddingBottom: '6px' }}>
                      Operasyonel Bilgiler
                    </h3>
                    
                    <div className="detail-item" style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                      <span className="detail-label" style={{ fontWeight: '600', fontSize: '12px', color: '#374151', minWidth: '80px', marginRight: '8px' }}>
                        Teslimat:
                      </span>
                      {isEditing ? (
                        <input
                          type="text"
                          name="deliveryCapability"
                          value={formData.deliveryCapability || ''}
                          onChange={handleInputChange}
                          style={getInputStyle(isEditing)}
                        />
                      ) : (
                        <span className="detail-value" style={{ fontSize: '12px', color: '#111827' }}>
                          {selectedSupplier.deliveryCapability || '-'}
                        </span>
                      )}
                    </div>
                    
                    <div className="detail-item" style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                      <span className="detail-label" style={{ fontWeight: '600', fontSize: '12px', color: '#374151', minWidth: '80px', marginRight: '8px' }}>
                        Tedarik Süresi:
                      </span>
                      {isEditing ? (
                        <input
                          type="number"
                          name="leadTime"
                          value={formData.leadTime || ''}
                          onChange={handleInputChange}
                          style={getInputStyle(isEditing)}
                        />
                      ) : (
                        <span className="detail-value" style={{ fontSize: '12px', color: '#111827' }}>
                          {selectedSupplier.leadTime ? `${selectedSupplier.leadTime} gün` : '-'}
                        </span>
                      )}
                    </div>
                    
                    <div className="detail-item" style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                      <span className="detail-label" style={{ fontWeight: '600', fontSize: '12px', color: '#374151', minWidth: '80px', marginRight: '8px' }}>
                        Min. Sipariş:
                      </span>
                      {isEditing ? (
                        <input
                          type="text"
                          name="minimumOrderQuantity"
                          value={formData.minimumOrderQuantity || ''}
                          onChange={handleInputChange}
                          style={getInputStyle(isEditing)}
                        />
                      ) : (
                        <span className="detail-value" style={{ fontSize: '12px', color: '#111827' }}>
                          {selectedSupplier.minimumOrderQuantity || '-'}
                        </span>
                      )}
                    </div>
                    
                    <div className="detail-item" style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                      <span className="detail-label" style={{ fontWeight: '600', fontSize: '12px', color: '#374151', minWidth: '80px', marginRight: '8px' }}>
                        Sertifika:
                      </span>
                      {isEditing ? (
                        <select
                          name="qualityCertification"
                          value={formData.qualityCertification || ''}
                          onChange={handleInputChange}
                          style={getInputStyle(isEditing)}
                        >
                          <option value="">Seçin</option>
                          <option value="ISO_9001">ISO 9001</option>
                          <option value="ISO_14001">ISO 14001</option>
                          <option value="TS_EN_ISO">TS EN ISO</option>
                          <option value="CE">CE İşareti</option>
                          <option value="TSE">TSE</option>
                          <option value="OHSAS_18001">OHSAS 18001</option>
                          <option value="other">Diğer</option>
                        </select>
                      ) : (
                        <span className="detail-value" style={{ fontSize: '12px', color: '#111827' }}>
                          {selectedSupplier.qualityCertification || '-'}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Şirket Bilgileri - Alt Bölüm */}
                <div style={{ 
                  marginBottom: '16px', 
                  padding: '12px', 
                  background: 'white', 
                  borderRadius: '6px',
                  border: '1px solid #e5e7eb'
                }}>
                  <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: '600', color: '#111827', borderBottom: '1px solid #e5e7eb', paddingBottom: '6px' }}>
                    Şirket Bilgileri
                  </h3>
                  
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '16px' }}>
                    <div className="detail-item" style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                      <span className="detail-label" style={{ fontWeight: '600', fontSize: '12px', color: '#374151', minWidth: '100px', marginRight: '8px' }}>
                        Kuruluş Yılı:
                      </span>
                      {isEditing ? (
                        <input
                          type="number"
                          name="yearEstablished"
                          value={formData.yearEstablished || ''}
                          onChange={handleInputChange}
                          style={getInputStyle(isEditing)}
                        />
                      ) : (
                        <span className="detail-value" style={{ fontSize: '12px', color: '#111827' }}>
                          {selectedSupplier.yearEstablished || '-'}
                        </span>
                      )}
                    </div>
                    
                    <div className="detail-item" style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                      <span className="detail-label" style={{ fontWeight: '600', fontSize: '12px', color: '#374151', minWidth: '100px', marginRight: '8px' }}>
                        Çalışan Sayısı:
                      </span>
                      {isEditing ? (
                        <select
                          name="employeeCount"
                          value={formData.employeeCount || ''}
                          onChange={handleInputChange}
                          style={getInputStyle(isEditing)}
                        >
                          <option value="">Seçin</option>
                          <option value="1-10">1-10 kişi</option>
                          <option value="11-50">11-50 kişi</option>
                          <option value="51-100">51-100 kişi</option>
                          <option value="101-500">101-500 kişi</option>
                          <option value="501-1000">501-1000 kişi</option>
                          <option value="1000+">1000+ kişi</option>
                        </select>
                      ) : (
                        <span className="detail-value" style={{ fontSize: '12px', color: '#111827' }}>
                          {selectedSupplier.employeeCount || '-'}
                        </span>
                      )}
                    </div>
                    
                    <div className="detail-item" style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                      <span className="detail-label" style={{ fontWeight: '600', fontSize: '12px', color: '#374151', minWidth: '100px', marginRight: '8px' }}>
                        Risk Seviyesi:
                      </span>
                      {isEditing ? (
                        <select
                          name="riskLevel"
                          value={formData.riskLevel || ''}
                          onChange={handleInputChange}
                          style={getInputStyle(isEditing)}
                        >
                          <option value="low">Düşük Risk</option>
                          <option value="medium">Orta Risk</option>
                          <option value="high">Yüksek Risk</option>
                        </select>
                      ) : (
                        <span className="detail-value" style={{ fontSize: '12px', color: '#111827' }}>
                          {selectedSupplier.riskLevel || '-'}
                        </span>
                      )}
                    </div>
                    
                    <div className="detail-item" style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                      <span className="detail-label" style={{ fontWeight: '600', fontSize: '12px', color: '#374151', minWidth: '100px', marginRight: '8px' }}>
                        Uyumluluk:
                      </span>
                      {isEditing ? (
                        <select
                          name="complianceStatus"
                          value={formData.complianceStatus || ''}
                          onChange={handleInputChange}
                          style={getInputStyle(isEditing)}
                        >
                          <option value="pending">Beklemede</option>
                          <option value="approved">Onaylandı</option>
                          <option value="rejected">Reddedildi</option>
                          <option value="under_review">İnceleniyor</option>
                        </select>
                      ) : (
                        <span className="detail-value" style={{ fontSize: '12px', color: '#111827' }}>
                          {selectedSupplier.complianceStatus || '-'}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Tedarik Edilen Malzemeler */}
                <div style={{ 
                  marginBottom: '16px', 
                  padding: '12px', 
                  background: 'white', 
                  borderRadius: '6px',
                  border: '1px solid #e5e7eb'
                }}>
                  <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: '600', color: '#111827', borderBottom: '1px solid #e5e7eb', paddingBottom: '6px' }}>
                    Tedarik Edilen Malzemeler
                  </h3>

                  {/* Material Mode Toggle */}
                  <div style={{ marginBottom: '12px' }}>
                    <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                      <button
                        type="button"
                        onClick={handleOpenMaterialPopup}
                        style={{
                          padding: '6px 12px',
                          border: '1px solid #d1d5db',
                          borderRadius: '4px',
                          fontSize: '12px',
                          background: 'white',
                          color: '#374151',
                          cursor: 'pointer'
                        }}
                      >
                        Mevcut Malzemelerden Ekle
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          setMaterialMode('new')
                          if ((!materials || materials.length === 0) && !materialsLoading) {
                            await loadMaterials()
                            await extractMaterialCategories()
                          } else {
                            await extractMaterialCategories()
                          }
                        }}
                        style={{
                          padding: '6px 12px',
                          border: '1px solid #d1d5db',
                          borderRadius: '4px',
                          fontSize: '12px',
                          background: materialMode === 'new' ? '#3b82f6' : 'white',
                          color: materialMode === 'new' ? 'white' : '#374151',
                          cursor: 'pointer'
                        }}
                      >
                        Yeni Malzeme Ekle
                      </button>
                    </div>
                  </div>

                  {/* Current Supplied Materials */}
                  {selectedSupplier?.suppliedMaterials && selectedSupplier.suppliedMaterials.length > 0 && (
                    <div style={{ marginBottom: '12px' }}>
                      <h4 style={{ margin: '0 0 8px 0', fontSize: '12px', fontWeight: '600', color: '#111827' }}>
                        Mevcut Malzemeler ({selectedSupplier.suppliedMaterials.length})
                      </h4>
                      <div style={{ 
                        border: '1px solid #e5e7eb', 
                        borderRadius: '4px'
                      }}>
                        {selectedSupplier.suppliedMaterials.map((material, index) => (
                          <div
                            key={material.id || index}
                            style={{
                              padding: '6px 12px',
                              borderBottom: index < selectedSupplier.suppliedMaterials.length - 1 ? '1px solid #f3f4f6' : 'none',
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              fontSize: '12px'
                            }}
                          >
                            <div>
                              <div style={{ 
                                display: 'flex', 
                                alignItems: 'center', 
                                gap: '8px',
                                marginBottom: '2px'
                              }}>
                                <span style={{ 
                                  fontWeight: '600', 
                                  color: material.status === 'pasif' ? '#dc2626' : material.status === 'değerlendirmede' ? '#eab308' : '#111827',
                                  opacity: material.status === 'pasif' ? 0.6 : 1
                                }}>
                                  {material.name}
                                </span>
                              </div>
                              <div style={{ fontSize: '11px', color: '#6b7280' }}>
                                {material.category && `${getCategoryName(material.category)} • `}
                                {material.unit}
                              </div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <button
                                onClick={() => handleShowMaterialDetail(material.id)}
                                style={{
                                  padding: '2px 4px',
                                  fontSize: '10px',
                                  border: '1px solid #d1d5db',
                                  borderRadius: '3px',
                                  background: '#f9fafb',
                                  color: '#374151',
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  minWidth: '24px',
                                  height: '20px'
                                }}
                                title="Malzeme Detayları"
                              >
                                ℹ️
                              </button>
                              <select
                                value={material.status || 'aktif'}
                                onChange={(e) => handleMaterialStatusChange(material.id, e.target.value)}
                                style={{
                                  padding: '1px 4px',
                                  fontSize: '10px',
                                  border: '1px solid #d1d5db',
                                  borderRadius: '3px',
                                  background: 'white',
                                  color: '#374151',
                                  cursor: 'pointer',
                                  minWidth: '60px',
                                  maxWidth: '80px',
                                  textAlign: 'right'
                                }}
                              >
                                <option value="aktif">Aktif</option>
                                <option value="pasif">Pasif</option>
                                <option value="değerlendirmede">Değerlendirmede</option>
                              </select>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* New Material Mode */}
                  {materialMode === 'new' && (
                    <div>
                      <div className="detail-item" style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                        <span className="detail-label" style={{ fontWeight: '600', fontSize: '12px', color: '#374151', minWidth: '100px', marginRight: '8px' }}>
                          Malzeme Adı:
                        </span>
                        <input
                          type="text"
                          name="name"
                          value={newMaterial.name}
                          onChange={handleNewMaterialChange}
                          placeholder="Malzeme adını girin"
                          style={{
                            flex: 1,
                            padding: '6px 8px',
                            border: '1px solid #d1d5db',
                            borderRadius: '4px',
                            fontSize: '12px',
                            background: 'white'
                          }}
                        />
                      </div>

                      <div className="detail-item" style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                        <span className="detail-label" style={{ fontWeight: '600', fontSize: '12px', color: '#374151', minWidth: '100px', marginRight: '8px' }}>
                          Tip:
                        </span>
                        <select
                          name="type"
                          value={newMaterial.type}
                          onChange={handleNewMaterialChange}
                          style={{
                            flex: 1,
                            padding: '6px 8px',
                            border: '1px solid #d1d5db',
                            borderRadius: '4px',
                            fontSize: '12px',
                            background: 'white'
                          }}
                        >
                          <option value="">Tip seçin</option>
                          {materialTypes.map(type => (
                            <option key={type.id} value={type.id}>{type.label}</option>
                          ))}
                        </select>
                      </div>

                      <div className="detail-item" style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                        <span className="detail-label" style={{ fontWeight: '600', fontSize: '12px', color: '#374151', minWidth: '100px', marginRight: '8px' }}>
                          Kategori:
                        </span>
                        <select
                          name="category"
                          value={showNewCategory ? 'new-category' : newMaterial.category}
                          onChange={handleCategoryChange}
                          style={{
                            flex: 1,
                            padding: '6px 8px',
                            border: '1px solid #d1d5db',
                            borderRadius: '4px',
                            fontSize: '12px',
                            background: 'white'
                          }}
                        >
                          <option value="">Kategori seçin</option>
                          {materialCategories.map(category => (
                            <option key={category.id} value={category.id}>
                              {category.name || category.label || category.id}
                            </option>
                          ))}
                          <option value="new-category">+ Yeni Kategori Ekle</option>
                        </select>
                      </div>

                      {showNewCategory && (
                        <div className="detail-item" style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                          <span className="detail-label" style={{ fontWeight: '600', fontSize: '12px', color: '#374151', minWidth: '100px', marginRight: '8px' }}>
                            Yeni Kategori:
                          </span>
                          <input
                            type="text"
                            value={newCategory}
                            onChange={(e) => setNewCategory(e.target.value)}
                            placeholder="Yeni kategori adını girin"
                            style={{
                              flex: 1,
                              padding: '6px 8px',
                              border: '1px solid #d1d5db',
                              borderRadius: '4px',
                              fontSize: '12px',
                              background: 'white'
                            }}
                          />
                        </div>
                      )}

                      <div className="detail-item" style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                        <span className="detail-label" style={{ fontWeight: '600', fontSize: '12px', color: '#374151', minWidth: '100px', marginRight: '8px' }}>
                          Birim:
                        </span>
                        <select
                          name="unit"
                          value={newMaterial.unit}
                          onChange={handleNewMaterialChange}
                          style={{
                            flex: 1,
                            padding: '6px 8px',
                            border: '1px solid #d1d5db',
                            borderRadius: '4px',
                            fontSize: '12px',
                            background: 'white'
                          }}
                        >
                          <option value="">Birim seçin</option>
                          <option value="kg">Kilogram (kg)</option>
                          <option value="g">Gram (g)</option>
                          <option value="lt">Litre (lt)</option>
                          <option value="ml">Mililitre (ml)</option>
                          <option value="m">Metre (m)</option>
                          <option value="cm">Santimetre (cm)</option>
                          <option value="m²">Metrekare (m²)</option>
                          <option value="adet">Adet</option>
                          <option value="paket">Paket</option>
                          <option value="kutu">Kutu</option>
                        </select>
                      </div>

                      <div className="detail-item" style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                        <span className="detail-label" style={{ fontWeight: '600', fontSize: '12px', color: '#374151', minWidth: '100px', marginRight: '8px' }}>
                          Kod:
                        </span>
                        <input
                          type="text"
                          name="code"
                          value={newMaterial.code || generateNextMaterialCode()}
                          onChange={handleNewMaterialChange}
                          placeholder={`Otomatik kod: ${generateNextMaterialCode()}`}
                          style={{
                            flex: 1,
                            padding: '6px 8px',
                            border: '1px solid #d1d5db',
                            borderRadius: '4px',
                            fontSize: '12px',
                            background: 'white'
                          }}
                        />
                      </div>

                      <div className="detail-item" style={{ display: 'flex', alignItems: 'flex-start', marginBottom: '8px' }}>
                        <span className="detail-label" style={{ fontWeight: '600', fontSize: '12px', color: '#374151', minWidth: '100px', marginRight: '8px', marginTop: '6px' }}>
                          Açıklama:
                        </span>
                        <textarea
                          name="description"
                          value={newMaterial.description}
                          onChange={handleNewMaterialChange}
                          placeholder="Malzeme açıklaması (opsiyonel)"
                          rows="2"
                          style={{
                            flex: 1,
                            padding: '6px 8px',
                            border: '1px solid #d1d5db',
                            borderRadius: '4px',
                            fontSize: '12px',
                            background: 'white',
                            resize: 'vertical'
                          }}
                        />
                      </div>

                      <div className="detail-item" style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                        <span className="detail-label" style={{ fontWeight: '600', fontSize: '12px', color: '#374151', minWidth: '100px', marginRight: '8px' }}>
                          Minimum Stok:
                        </span>
                        <input
                          type="number"
                          name="reorderPoint"
                          value={newMaterial.reorderPoint}
                          onChange={handleNewMaterialChange}
                          placeholder="Minimum stok seviyesi"
                          style={{
                            flex: 1,
                            padding: '6px 8px',
                            border: '1px solid #d1d5db',
                            borderRadius: '4px',
                            fontSize: '12px',
                            background: 'white'
                          }}
                        />
                      </div>

                      <div className="detail-item" style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                        <span className="detail-label" style={{ fontWeight: '600', fontSize: '12px', color: '#374151', minWidth: '100px', marginRight: '8px' }}>
                          Mevcut Stok:
                        </span>
                        <input
                          type="number"
                          name="stockLevel"
                          value={newMaterial.stockLevel}
                          onChange={handleNewMaterialChange}
                          placeholder="Şu anki stok miktarı"
                          style={{
                            flex: 1,
                            padding: '6px 8px',
                            border: '1px solid #d1d5db',
                            borderRadius: '4px',
                            fontSize: '12px',
                            background: 'white'
                          }}
                        />
                      </div>

                      <div className="detail-item" style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                        <span className="detail-label" style={{ fontWeight: '600', fontSize: '12px', color: '#374151', minWidth: '100px', marginRight: '8px' }}>
                          Maliyet Fiyatı:
                        </span>
                        <input
                          type="number"
                          step="0.01"
                          name="costPrice"
                          value={newMaterial.costPrice}
                          onChange={handleNewMaterialChange}
                          placeholder="Maliyet fiyatı (TRY)"
                          style={{
                            flex: 1,
                            padding: '6px 8px',
                            border: '1px solid #d1d5db',
                            borderRadius: '4px',
                            fontSize: '12px',
                            background: 'white'
                          }}
                        />
                      </div>

                      <div className="detail-item" style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                        <span className="detail-label" style={{ fontWeight: '600', fontSize: '12px', color: '#374151', minWidth: '100px', marginRight: '8px' }}>
                          Satış Fiyatı:
                        </span>
                        <input
                          type="number"
                          step="0.01"
                          name="sellPrice"
                          value={newMaterial.sellPrice}
                          onChange={handleNewMaterialChange}
                          placeholder="Satış fiyatı (TRY)"
                          style={{
                            flex: 1,
                            padding: '6px 8px',
                            border: '1px solid #d1d5db',
                            borderRadius: '4px',
                            fontSize: '12px',
                            background: 'white'
                          }}
                        />
                      </div>

                      <div className="detail-item" style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                        <span className="detail-label" style={{ fontWeight: '600', fontSize: '12px', color: '#374151', minWidth: '100px', marginRight: '8px' }}>
                          Durum:
                        </span>
                        <select
                          name="status"
                          value={newMaterial.status}
                          onChange={handleNewMaterialChange}
                          style={{
                            flex: 1,
                            padding: '6px 8px',
                            border: '1px solid #d1d5db',
                            borderRadius: '4px',
                            fontSize: '12px',
                            background: 'white'
                          }}
                        >
                          <option value="Aktif">Aktif</option>
                          <option value="Pasif">Pasif</option>
                        </select>
                      </div>

                      <div style={{ textAlign: 'right', marginTop: '8px', display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                        <button
                          type="button"
                          onClick={() => setMaterialMode('existing')}
                          style={{
                            padding: '6px 12px',
                            background: '#6b7280',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            fontSize: '12px',
                            cursor: 'pointer'
                          }}
                        >
                          İptal
                        </button>
                        <button
                          type="button"
                          onClick={handleAddNewMaterial}
                          style={{
                            padding: '6px 12px',
                            background: '#10b981',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            fontSize: '12px',
                            cursor: 'pointer'
                          }}
                        >
                          Malzeme Ekle
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Show message when no materials */}
                  {(!selectedSupplier?.suppliedMaterials || selectedSupplier.suppliedMaterials.length === 0) && materialMode !== 'new' && (
                    <div style={{ 
                      padding: '20px', 
                      textAlign: 'center', 
                      color: '#6b7280', 
                      fontSize: '12px',
                      fontStyle: 'italic'
                    }}>
                      Henüz malzeme eklenmemiş. Yukarıdaki butonları kullanarak malzeme ekleyebilirsiniz.
                    </div>
                  )}
                </div>

                {/* Supply History - Tedarik Geçmişi */}
                <div style={{ 
                  marginBottom: '16px', 
                  padding: '12px', 
                  background: 'white', 
                  borderRadius: '6px',
                  border: '1px solid #e5e7eb'
                }}>
                  <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: '600', color: '#111827', borderBottom: '1px solid #e5e7eb', paddingBottom: '6px' }}>
                    Tedarik Geçmişi
                  </h3>
                  
                  {/* Placeholder content - will be developed later */}
                  <div style={{ 
                    padding: '20px', 
                    textAlign: 'center', 
                    color: '#6b7280', 
                    fontSize: '12px',
                    fontStyle: 'italic'
                  }}>
                    Bu bölüm geliştirilme aşamasındadır.
                  </div>
                </div>

                {/* Ek Bilgiler */}
                <div style={{ 
                  marginBottom: '16px', 
                  padding: '12px', 
                  background: 'white', 
                  borderRadius: '6px',
                  border: '1px solid #e5e7eb'
                }}>
                  <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: '600', color: '#111827', borderBottom: '1px solid #e5e7eb', paddingBottom: '6px' }}>
                    Ek Bilgiler
                  </h3>
                  
                  <div className="detail-item" style={{ display: 'flex', alignItems: 'flex-start', marginBottom: '8px' }}>
                    <span className="detail-label" style={{ fontWeight: '600', fontSize: '12px', color: '#374151', minWidth: '120px', marginRight: '8px', marginTop: '2px' }}>
                      Notlar ve Açıklamalar:
                    </span>
                    {isEditing ? (
                      <textarea
                        name="notes"
                        value={formData.notes || ''}
                        onChange={handleInputChange}
                        rows="3"
                        style={{ ...getInputStyle(isEditing), flex: 1, resize: 'vertical' }}
                      />
                    ) : (
                      <span className="detail-value description" style={{ fontSize: '12px', color: '#111827', flex: 1 }}>
                        {selectedSupplier.notes || 'Ek bilgi girilmemiş'}
                      </span>
                    )}
                  </div>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Material Selection Popup */}
      {showMaterialPopup && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1001
        }}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '8px',
            padding: '20px',
            maxWidth: '600px',
            maxHeight: '80vh',
            width: '90%',
            overflowY: 'auto',
            position: 'relative'
          }}>
            {/* Popup Header */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '16px',
              borderBottom: '1px solid #e5e7eb',
              paddingBottom: '12px'
            }}>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '600', color: '#111827' }}>
                Mevcut Malzemelerden Seç
              </h3>
              <button
                type="button"
                onClick={() => setShowMaterialPopup(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '20px',
                  cursor: 'pointer',
                  color: '#6b7280',
                  padding: '4px'
                }}
              >
                ×
              </button>
            </div>

            {/* Search Input */}
            <div style={{ marginBottom: '12px' }}>
              <input
                type="text"
                value={materialSearchTerm}
                onChange={(e) => setMaterialSearchTerm(e.target.value)}
                placeholder="Malzeme adı, kodu veya kategorisi ile ara..."
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  border: '1px solid #d1d5db',
                  borderRadius: '4px',
                  fontSize: '14px',
                  background: 'white'
                }}
              />
            </div>

            {/* Materials List */}
            {materialsLoading ? (
              <div style={{ padding: '40px', textAlign: 'center', fontSize: '14px', color: '#6b7280' }}>
                Malzemeler yükleniyor...
              </div>
            ) : (
              <div style={{ 
                maxHeight: '400px', 
                overflowY: 'auto', 
                border: '1px solid #e5e7eb', 
                borderRadius: '4px',
                marginBottom: '16px'
              }}>
                {filteredMaterials.length === 0 ? (
                  <div style={{ padding: '40px', textAlign: 'center', fontSize: '14px', color: '#6b7280' }}>
                    {materialSearchTerm ? 'Arama kriterine uygun malzeme bulunamadı' : 'Henüz malzeme bulunmuyor'}
                  </div>
                ) : (
                  filteredMaterials.map(material => (
                    <div
                      key={material.id}
                      onClick={() => handleMaterialSelect(material)}
                      style={{
                        padding: '12px 16px',
                        borderBottom: '1px solid #f3f4f6',
                        cursor: 'pointer',
                        background: selectedMaterials.find(m => m.id === material.id) ? '#f0f9ff' : 'white',
                        fontSize: '14px',
                        transition: 'background-color 0.2s'
                      }}
                      onMouseEnter={(e) => {
                        if (!selectedMaterials.find(m => m.id === material.id)) {
                          e.target.style.backgroundColor = '#f9fafb'
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!selectedMaterials.find(m => m.id === material.id)) {
                          e.target.style.backgroundColor = 'white'
                        }
                      }}
                    >
                      <div style={{ fontWeight: '600', color: '#111827', marginBottom: '4px' }}>
                        {material.name}
                        {selectedMaterials.find(m => m.id === material.id) && (
                          <span style={{ color: '#10b981', marginLeft: '8px' }}>✓ Seçildi</span>
                        )}
                      </div>
                      <div style={{ fontSize: '12px', color: '#6b7280' }}>
                        {material.code && `Kod: ${material.code} • `}
                        {material.category && `Kategori: ${getCategoryName(material.category)} • `}
                        {material.unit && `Birim: ${material.unit}`}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* Selected Materials Summary */}
            {selectedMaterials.length > 0 && (
              <div style={{
                background: '#f0f9ff',
                border: '1px solid #bfdbfe',
                borderRadius: '4px',
                padding: '12px',
                marginBottom: '16px'
              }}>
                <div style={{ fontSize: '14px', fontWeight: '600', color: '#1e40af', marginBottom: '8px' }}>
                  Seçilen Malzemeler ({selectedMaterials.length})
                </div>
                <div style={{ fontSize: '12px', color: '#1e40af' }}>
                  {selectedMaterials.map(m => m.name).join(', ')}
                </div>
              </div>
            )}

            {/* Popup Footer */}
            <div style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '8px',
              borderTop: '1px solid #e5e7eb',
              paddingTop: '12px'
            }}>
              <button
                type="button"
                onClick={() => setShowMaterialPopup(false)}
                style={{
                  padding: '8px 16px',
                  border: '1px solid #d1d5db',
                  borderRadius: '4px',
                  fontSize: '14px',
                  background: 'white',
                  color: '#374151',
                  cursor: 'pointer'
                }}
              >
                İptal
              </button>
              <button
                type="button"
                onClick={handleAddExistingMaterials}
                style={{
                  padding: '8px 16px',
                  border: 'none',
                  borderRadius: '4px',
                  fontSize: '14px',
                  background: '#3b82f6',
                  color: 'white',
                  cursor: 'pointer'
                }}
              >
                Seçimi Tamamla ({selectedMaterials.length})
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Material Detail Modal */}
      <ErrorBoundary>
        <EditMaterialModal
          isOpen={showMaterialDetailModal}
          onClose={() => {
            console.log('🚪 Modal onClose called - cleaning up states')
            setShowMaterialDetailModal(false)
            setSelectedMaterialForDetail(null)
            setLoadingMaterialDetail(false)
            console.log('🚪 Modal states cleaned up')
          }}
          onSave={() => {
            // Material saved, you might want to refresh data
            setShowMaterialDetailModal(false)
            setSelectedMaterialForDetail(null)
            setLoadingMaterialDetail(false)
          }}
          onDelete={() => {
            // Material deleted, you might want to refresh data
            setShowMaterialDetailModal(false)
            setSelectedMaterialForDetail(null)
            setLoadingMaterialDetail(false)
          }}
          categories={materialCategories}
          types={[
            { id: 'raw_material', label: 'Ham Madde' },
            { id: 'wip', label: 'Yarı Mamül' },
            { id: 'final_product', label: 'Bitmiş Ürün' }
          ]}
          material={selectedMaterialForDetail}
          suppliers={suppliers}
          loading={loadingMaterialDetail}
          suppliersLoading={suppliersLoading}
          onRefreshSuppliers={onRefreshSuppliers}
          error={null}
        />
      </ErrorBoundary>
    </div>
  )
}