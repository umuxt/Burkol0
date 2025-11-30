import React, { useState, useEffect, useMemo, useRef } from 'react'
import useSupplierProcurementHistory from '../hooks/useSupplierProcurementHistory.js'
import { useMaterials, useMaterialActions } from '../hooks/useMaterials'
import { useSuppliers } from '../hooks/useSuppliers'
import { useCategories } from '../hooks/useCategories'
import { categoriesService } from '../services/categories-service'
import { materialsService } from '../services/materials-service'
import ErrorBoundary from '../../../shared/components/ErrorBoundary'
import AddOrderModal from './AddOrderModal.jsx'
import { 
  getEffectiveMaterialStatus, 
  createStatusBadgeProps,
  SUPPLIER_STATUSES,
  MATERIAL_STATUSES 
} from '../utils/material-status-utils'
import { showToast } from '../../../shared/components/MESToast.js'
import { Phone, Mail, ShoppingCart, Edit, Trash2, Info, RotateCw, Save, X, ArrowLeft } from '../../../shared/components/Icons'

export default function SuppliersTable({ 
  suppliers = [],
  loading = false,
  suppliersLoading = false,
  onUpdateSupplier,
  onDeleteSupplier,
  onRefreshSuppliers,
  handleDeleteMaterial,
  activeCategory = 'all',
  onCategoryChange,
  categories: categoriesProp
}) {
  const [selectedSupplier, setSelectedSupplier] = useState(null)
  const [selectedSupplierId, setSelectedSupplierId] = useState(null)
  const [sortField, setSortField] = useState(null)
  const [sortDirection, setSortDirection] = useState('asc')
  const [isEditing, setIsEditing] = useState(false)
  const [formData, setFormData] = useState({})

  // useSuppliers hook'unu kullan
  const { addMaterialToSupplier, fetchSuppliers } = useSuppliers()

  // Toast notifications
  // Using showToast directly

  // Material management state
  const { materials: activeMaterials, loading: materialsLoading, loadMaterials } = useMaterials(false)
  const { addMaterial } = useMaterialActions()
  const [allMaterials, setAllMaterials] = useState([]) // Local state for all materials including removed
  const [nextMaterialCode, setNextMaterialCode] = useState(() => {
    // Component mount'ta hesapla
    return 'M-001'; // Will be updated by useEffect
  }) // Dynamic next code
  const [materialMode, setMaterialMode] = useState('existing')
  const [selectedMaterials, setSelectedMaterials] = useState([])
  const [materialSearchTerm, setMaterialSearchTerm] = useState('')
  const [showMaterialPopup, setShowMaterialPopup] = useState(false)
  const [materialCategories, setMaterialCategories] = useState([])
  // Categories revalidation control
  const categoriesLoadedRef = useRef(false)
  const lastCategoriesFetchTsRef = useRef(0)
  const categoriesRefreshTimerRef = useRef(null)
  const [materialTypes] = useState([
    { id: 'raw_material', label: 'Ham Madde' },
    { id: 'processed', label: 'İşlenmiş Ürün' },
    { id: 'scrap', label: 'Hurda' }
  ])
  const [showNewCategory, setShowNewCategory] = useState(false)
  const [newCategory, setNewCategory] = useState('')
  
  // Toggle switch for showing all materials vs active only
  const [showAllMaterials, setShowAllMaterials] = useState(false)
  
  // Bulk selection state
  const [selectedSupplierIds, setSelectedSupplierIds] = useState(new Set())
  
  // Order modal state
  const [isAddOrderModalOpen, setIsAddOrderModalOpen] = useState(false)
  const [orderModalSupplierId, setOrderModalSupplierId] = useState(null)

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
    
    // Ensure all materials (including removed) are loaded when supplier is selected
    if (allMaterials.length === 0) {
      loadAllMaterials()
    }
  }

  // Suppliers listesi değiştiğinde selectedSupplier'ı koru ve güncelle
  useEffect(() => {
    if (selectedSupplierId && suppliers && suppliers.length > 0) {
      const currentSupplier = suppliers.find(s => s.id === selectedSupplierId)
      if (currentSupplier) {
        console.log('🔄 SuppliersTable: selectedSupplier güncelleniyor', {
          id: currentSupplier.id,
          suppliedMaterialsCount: currentSupplier.suppliedMaterials?.length || 0
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
        const categories = await categoriesService.getCategories(true)
        setMaterialCategories(categories)
        categoriesLoadedRef.current = true
        lastCategoriesFetchTsRef.current = Date.now()
      } catch (error) {
        console.error('Kategoriler yüklenirken hata:', error)
      }
    }
    loadCategories()
  }, [])

  // Load materials on component mount
  useEffect(() => {
    if (allMaterials.length === 0 && !materialsLoading) {
      console.log('🔄 SuppliersTable: Loading all materials (including removed)...')
      loadAllMaterials()
    }
    // Also load active materials for the popup
    if (activeMaterials.length === 0 && !materialsLoading) {
      console.log('🔄 SuppliersTable: Loading active materials for popup...')
      loadMaterials()
    }
  }, [])

  // Load all materials including removed ones
  const loadAllMaterials = async (forceRefresh = false) => {
    try {
      const materials = await materialsService.getAllMaterialsIncludingRemoved(forceRefresh)
      setAllMaterials(materials)
      console.log('🔍 SuppliersTable: Loaded all materials including removed:', materials.length)
    } catch (error) {
      console.error('❌ SuppliersTable: Error loading all materials:', error)
    }
  }

  // When suppliers list changes, refresh materials to avoid stale cache
  useEffect(() => {
    // Force refresh materials to reflect latest DB state
    loadAllMaterials(true)
  }, [suppliers])

  // Listen global materialsUpdated event to refresh local allMaterials
  useEffect(() => {
    const handler = () => loadAllMaterials(true)
    window.addEventListener('materialsUpdated', handler)
    return () => window.removeEventListener('materialsUpdated', handler)
  }, [])

  // Debug materials loading
  useEffect(() => {
    console.log('🔍 SuppliersTable: Materials state:', {
      allMaterialsCount: allMaterials.length,
      activeMaterialsCount: activeMaterials.length,
      materialsLoading,
      selectedSupplier: selectedSupplier?.id,
      suppliedMaterialsCount: selectedSupplier?.suppliedMaterials?.length || 0
    })
  }, [allMaterials, activeMaterials, materialsLoading, selectedSupplier])

  // Revalidate categories when suppliers or materials change, but avoid duplicate fetch on first load
  useEffect(() => {
    if (!categoriesLoadedRef.current) return // avoid double-call on initial mount

    const MIN_INTERVAL_MS = 10000 // throttle
    const now = Date.now()
    if (now - lastCategoriesFetchTsRef.current < MIN_INTERVAL_MS) return

    if (categoriesRefreshTimerRef.current) clearTimeout(categoriesRefreshTimerRef.current)
    categoriesRefreshTimerRef.current = setTimeout(async () => {
      try {
        const categories = await categoriesService.getCategories(true)
        setMaterialCategories(categories)
        lastCategoriesFetchTsRef.current = Date.now()
        console.log('🔁 Categories revalidated:', categories.length)
      } catch (e) {
        console.warn('Kategori revalidation başarısız:', e?.message || e)
      }
    }, 200)

    return () => {
      if (categoriesRefreshTimerRef.current) {
        clearTimeout(categoriesRefreshTimerRef.current)
        categoriesRefreshTimerRef.current = null
      }
    }
  }, [suppliers, allMaterials])

  // Also revalidate categories when window gains focus or becomes visible
  useEffect(() => {
    const maybeRefreshCategories = async () => {
      const now = Date.now()
      const MIN_INTERVAL_MS = 5000
      if (!categoriesLoadedRef.current) return
      if (now - lastCategoriesFetchTsRef.current < MIN_INTERVAL_MS) return
      try {
        const categories = await categoriesService.getCategories(true)
        setMaterialCategories(categories)
        lastCategoriesFetchTsRef.current = Date.now()
        console.log('🔁 Categories revalidated on focus/visibility:', categories.length)
      } catch (e) {
        // non-blocking
      }
    }
    const onFocus = () => maybeRefreshCategories()
    const onVisibility = () => { if (document.visibilityState === 'visible') maybeRefreshCategories() }
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])

  // Update next material code when allMaterials changes
  useEffect(() => {
    const materialsForCodeGen = allMaterials.length > 0 ? allMaterials : activeMaterials;
    
    if (!materialsForCodeGen || materialsForCodeGen.length === 0) {
      setNextMaterialCode('M-001');
      return;
    }
    
    const existingNumbers = materialsForCodeGen
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
    
    const newCode = `M-${String(nextNumber).padStart(3, '0')}`;
    console.log('🔢 SuppliersTable nextMaterialCode güncellendi:', newCode);
    setNextMaterialCode(newCode);
  }, [allMaterials, activeMaterials]);

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

  // Bulk select helpers
  const handleSelectAll = (checked, list) => {
    const next = new Set(selectedSupplierIds)
    if (checked) {
      list.forEach(s => s?.id && next.add(s.id))
    } else {
      list.forEach(s => s?.id && next.delete(s.id))
    }
    setSelectedSupplierIds(next)
  }

  const handleSelectSupplier = (supplierId, checked) => {
    const next = new Set(selectedSupplierIds)
    if (checked) next.add(supplierId); else next.delete(supplierId)
    setSelectedSupplierIds(next)
  }

  const handleInputChange = (e) => {
    const { name, value } = e.target
    
    // Sayısal alanlar için özel validasyon
    const numericFields = ['creditLimit', 'unitPrice', 'minOrderQuantity', 'leadTime', 'paymentTerms', 'minOrderAmount', 'deliveryFee', 'price', 'quantity', 'minOrder', 'leadTimeDays']
    if (numericFields.includes(name)) {
      let cleanValue = value.replace(/,/g, '.')
      if (!/^[0-9.]*$/.test(cleanValue)) return
      if ((cleanValue.match(/\./g) || []).length > 1) return
      setFormData(prev => ({
        ...prev,
        [name]: cleanValue
      }))
    } else {
      setFormData(prev => ({
        ...prev,
        [name]: value
      }))
    }
  }

  const handleSaveSupplier = async (e) => {
    e.preventDefault()
    
    console.log('💾 Saving supplier:', { 
      supplierId: selectedSupplier?.id, 
      selectedSupplier: selectedSupplier,
      formData,
      isEditing
    })
    
    if (!selectedSupplier?.id) {
      console.error('❌ No supplier selected for update')
      showToast('Lütfen güncellenecek tedarikçiyi seçin', 'warning')
      return
    }

    if (!isEditing) {
      console.log('📝 Not in editing mode, skipping save')
      return
    }
    
    if (!formData || Object.keys(formData).length === 0) {
      console.error('❌ No form data to update')
      showToast('Güncellenecek veri bulunamadı', 'warning')
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
      showToast(`Tedarikçi kaydedilirken hata oluştu: ${error.message}`, 'error')
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

  const extractMaterialCategories = async () => {
    try {
      const categoriesFromService = await categoriesService.getCategories()
      const materialCategories = categoriesFromService.filter(cat => 
        cat.type === 'material' || !cat.type
      )
      setMaterialCategories(materialCategories)
    } catch (error) {
      console.error('Categories yüklenirken hata:', error)
      if (allMaterials && allMaterials.length > 0) {
        const categories = [...new Set(allMaterials
          .map(material => material.category)
          .filter(category => category && category.trim() !== '')
        )].sort().map(name => ({ id: name, name }))
        setMaterialCategories(categories)
      }
    }
  }

  const getCategoryName = (categoryId) => {
    // Kategori boşsa veya null ise
    if (!categoryId) return '';
    
    // Kategoriler listesinde ara
    const category = materialCategories.find(cat => cat.id === categoryId)
    
    // Kategori varsa ismini döndür
    if (category) return category.name || category.label || categoryId;
    
    // Kategori bulunamazsa - büyük ihtimalle silinmiş
    console.warn('🗑️ Kategori bulunamadı, büyük ihtimalle silinmiş:', categoryId);
    return ''; // Boş string döndür, kategori gösterilmesin
  }

  const handleOpenMaterialPopup = async () => {
    setShowMaterialPopup(true)
    if (!activeMaterials || activeMaterials.length === 0) {
      await loadMaterials()
    }
    await extractMaterialCategories()
  }

  const filteredMaterials = useMemo(() => {
    if (!activeMaterials || !Array.isArray(activeMaterials)) return []
    
    return activeMaterials.filter(material => 
      material.name?.toLowerCase().includes(materialSearchTerm.toLowerCase()) ||
      material.code?.toLowerCase().includes(materialSearchTerm.toLowerCase()) ||
      getCategoryName(material.category)?.toLowerCase().includes(materialSearchTerm.toLowerCase())
    )
  }, [activeMaterials, materialSearchTerm, materialCategories])

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
      showToast('Lütfen malzeme adı, tip, kategori ve birim alanlarını doldurun!', 'warning')
      return
    }

    try {
      let finalCategoryId = finalCategory
      if (showNewCategory && newCategory.trim()) {
        try {
          const createdCategory = await categoriesService.addCategory({
            name: newCategory.trim(),
            createdAt: new Date(),
            type: 'material'
          })
          // Use created category id if returned
          finalCategoryId = createdCategory?.id || newCategory.trim()
          console.log('✅ New category added:', createdCategory)
          // Refresh categories list to reflect immediately in UIs
          try {
            const categories = await categoriesService.getCategories(true)
            setMaterialCategories(categories)
            // update fetch markers so revalidation throttle knows about it
            if (typeof lastCategoriesFetchTsRef !== 'undefined') {
              lastCategoriesFetchTsRef.current = Date.now()
              categoriesLoadedRef.current = true
            }
          } catch (refreshErr) {
            console.warn('Kategori listesi yenilenemedi:', refreshErr?.message || refreshErr)
            // As a fallback, append the created category locally if not present
            setMaterialCategories(prev => {
              const exists = prev?.some(c => c.id === finalCategoryId)
              return exists ? prev : [...(prev || []), { id: finalCategoryId, name: newCategory.trim(), type: 'material' }]
            })
          }
        } catch (categoryError) {
          console.error('❌ Category creation failed:', categoryError)
        }
      }

      const finalCode = newMaterial.code.trim() || nextMaterialCode
      
      const materialData = {
        ...newMaterial,
        category: finalCategoryId,
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
      console.log('✅ New material added to database:', addedMaterial)
      
      // Add to selected materials for UI immediate feedback
      setSelectedMaterials(prev => [...prev, addedMaterial])
      
      // Update local materials state immediately
      setAllMaterials(prev => [...prev, addedMaterial])
      
      // Also refresh active materials list
      if (loadMaterials) {
        console.log('🔄 Refreshing active materials list...')
        await loadMaterials()
      }

      // Use backend API to add material to supplier instead of direct update
      if (selectedSupplier && addMaterialToSupplier) {
        try {
          const materialData = {
            materialId: addedMaterial.id,
            materialCode: addedMaterial.code,
            materialName: addedMaterial.name,
            category: addedMaterial.category,
            unit: addedMaterial.unit,
            price: addedMaterial.sellPrice || addedMaterial.price || 0,
            deliveryTime: '',
            minQuantity: 1
          }

          console.log('🔄 Adding new material to supplier via backend API:', {
            supplierId: selectedSupplier.id,
            materialData
          })

          await addMaterialToSupplier(selectedSupplier.id, materialData)
          console.log('✅ Material added to supplier successfully')
          
          // Only refresh the parent suppliers list (not forcing multiple refreshes)
          if (onRefreshSuppliers) {
            console.log('🔄 Refreshing suppliers list after adding new material')
            await onRefreshSuppliers()
          }
          
          // Don't force refresh materials here to avoid loops
          // The global event system will handle the update
        } catch (supplierError) {
          console.error('❌ Error adding material to supplier:', supplierError)
          // Still continue even if supplier update fails
        }
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
      
      showToast('Malzeme başarıyla eklendi!', 'success')
    } catch (error) {
      console.error('Malzeme eklenirken hata:', error)
      showToast('Malzeme eklenirken bir hata oluştu!', 'error')
    }
  }

  const handleAddExistingMaterials = async () => {
    if (selectedMaterials.length === 0 || !selectedSupplier) return

    try {
      console.log('🔄 Adding materials to supplier via backend API:', {
        supplierId: selectedSupplier.id,
        materialsCount: selectedMaterials.length,
        materials: selectedMaterials.map(m => ({ id: m.id, name: m.name, code: m.code }))
      })

      // Her malzeme için backend API'sine ayrı ayrı istek gönder
      for (const material of selectedMaterials) {
        try {
          const materialData = {
            materialId: material.id,
            materialCode: material.code,
            materialName: material.name,
            category: material.category,
            unit: material.unit,
            price: 0, // Default değer
            deliveryTime: '', // Default değer
            minQuantity: 1 // Default değer
          }

          console.log('🔄 Adding material to supplier:', {
            supplierId: selectedSupplier.id,
            materialData
          })

          await addMaterialToSupplier(selectedSupplier.id, materialData)
          
          console.log('✅ Material added successfully:', material.name)
        } catch (materialError) {
          console.error('❌ Error adding material:', material.name, materialError)
          // Hata olsa bile diğer malzemelerle devam et
        }
      }

      // Başarılı ekleme sonrası tedarikçiler listesini yenile
      if (onRefreshSuppliers) {
        console.log('🔄 Refreshing suppliers list after adding materials')
        await onRefreshSuppliers()
      }
      
      // Also force refresh suppliers from hook to bypass cache
      if (fetchSuppliers) {
        console.log('🔄 Force refreshing suppliers from hook after adding existing materials')
        await fetchSuppliers(true) // true = forceRefresh
      }

      // Also refresh materials lists to ensure they are up to date
      if (loadMaterials) {
        console.log('🔄 Refreshing materials list after adding to supplier')
        await loadMaterials()
      }
      
      // Refresh all materials list as well
      await loadAllMaterials()

      setSelectedMaterials([])
      setShowMaterialPopup(false)
      showToast('Malzemeler başarıyla eklendi!', 'success')
    } catch (error) {
      console.error('❌ Error in handleAddExistingMaterials:', error)
      showToast('Malzemeler eklenirken bir hata oluştu!', 'error')
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
      showToast('Malzeme durumu güncellenirken bir hata oluştu!', 'error')
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
    console.log('🔍 Material detail requested for ID:', materialId);
    
    // Yeni pencerede materials.html stocks tab'ını aç ve material'i seç
    try {
      localStorage.setItem('bk_active_tab', 'stocks');
      localStorage.setItem('bk_selected_material_id', materialId);
      window.open('materials.html#stocks-tab&material-' + materialId, '_blank');
    } catch (e) {
      console.error('Material detail panelini açma hatası:', e);
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

  // Filter suppliers by category
  const filteredSuppliers = React.useMemo(() => {
    if (activeCategory === 'all') return suppliers
    
    return suppliers.filter(supplier => {
      if (!supplier.suppliedMaterials || supplier.suppliedMaterials.length === 0) return false
      
      return supplier.suppliedMaterials.some(material => {
        const fullMaterial = allMaterials.find(m => 
          m.id === (material.id || material.materialId) || 
          m.code === material.materialCode || 
          m.code === material.code
        )
        return fullMaterial && fullMaterial.category === activeCategory
      })
    })
  }, [suppliers, activeCategory, allMaterials])

  const sortedSuppliers = React.useMemo(() => {
    if (!sortField) return filteredSuppliers

    return [...filteredSuppliers].sort((a, b) => {
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
  }, [filteredSuppliers, sortField, sortDirection])

  const getInputStyle = (isEditing) => ({
    padding: '8px 12px',
    border: isEditing ? '1px solid #3b82f6' : '1px solid transparent',
    borderRadius: '4px',
    background: isEditing ? 'white' : 'transparent',
    width: '100%',
    fontSize: '14px'
  })

  // Get category tabs
  const categoryList = React.useMemo(() => {
    return (categoriesProp || []).filter(c => c.type === 'material' || !c.type)
  }, [categoriesProp])

  const categoryTabs = React.useMemo(() => {
    const tabs = [
      {
        id: 'all',
        label: 'Tümü',
        count: suppliers.length
      }
    ]

    categoryList.forEach(cat => {
      const count = suppliers.filter(supplier => {
        if (!supplier.suppliedMaterials || supplier.suppliedMaterials.length === 0) return false
        
        return supplier.suppliedMaterials.some(material => {
          const fullMaterial = allMaterials.find(m => 
            m.id === (material.id || material.materialId) || 
            m.code === material.materialCode || 
            m.code === material.code
          )
          return fullMaterial && fullMaterial.category === cat.id
        })
      }).length

      tabs.push({
        id: cat.id,
        label: cat.name,
        count: count
      })
    })

    return tabs
  }, [suppliers, categoryList, allMaterials])

  return (
    <div className="suppliers-container">
      {/* Sol Panel - Tablo */}
      <div className="suppliers-table-panel">
        <section className="materials-table">
          {/* Category Tabs */}
          <div className="materials-tabs">
            {categoryTabs.map(tab => (
              <button
                key={tab.id}
                className={`tab-button ${activeCategory === tab.id ? 'active' : ''}`}
                onClick={() => onCategoryChange(tab.id)}
              >
                {tab.label}
                <span className="tab-count">{tab.count}</span>
              </button>
            ))}
          </div>
      
      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th className="col-w-40-center">
                <input
                  type="checkbox"
                  title="Tümünü seç"
                  checked={sortedSuppliers.length > 0 && sortedSuppliers.every(s => selectedSupplierIds.has(s.id))}
                  onChange={(e) => handleSelectAll(e.target.checked, sortedSuppliers)}
                />
              </th>
              <th className="col-min-120-nowrap">
                <button 
                  type="button"
                  onClick={() => handleSort('code')}
                  className="mes-sort-button"
                >
                  Tedarikçi Kodu<span className="mes-sort-icon">
                    {sortField === 'code' ? (sortDirection === 'asc' ? '↑' : '↓') : '↕'}
                  </span>
                </button>
              </th>
              <th className="col-min-160">
                <button 
                  type="button"
                  onClick={() => handleSort('name')}
                  className="mes-sort-button"
                >
                  Firma Adı<span className="mes-sort-icon">
                    {sortField === 'name' ? (sortDirection === 'asc' ? '↑' : '↓') : '↕'}
                  </span>
                </button>
              </th>
              <th className="col-min-160">
                <button 
                  type="button"
                  onClick={() => handleSort('categories')}
                  className="mes-sort-button"
                >
                  Kategoriler<span className="mes-sort-icon">
                    {sortField === 'categories' ? (sortDirection === 'asc' ? '↑' : '↓') : '↕'}
                  </span>
                </button>
              </th>
              {!selectedSupplier && (
                <th className="th-actions-center">
                  Aksiyonlar
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {/* Loading state */}
            {loading && suppliers.length === 0 && (
              <tr>
                <td colSpan="5" className="loading-cell-center">
                  <div className="loading-content-flex">
                    <div className="spinner"></div>
                    <p className="text-subtitle">Tedarikçiler yükleniyor...</p>
                  </div>
                </td>
              </tr>
            )}
            
            {/* Data rows */}
            {!loading && sortedSuppliers.map(supplier => (
                  <tr
                    key={supplier.id}
                    className={`mes-table-row ${selectedSupplier?.id === supplier.id ? 'selected' : ''}`}
                    onClick={() => handleRowClick(supplier)}
                  >
                    <td className="col-w-40-center" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selectedSupplierIds.has(supplier.id)}
                        onChange={(e) => handleSelectSupplier(supplier.id, e.target.checked)}
                        title="Seç"
                      />
                    </td>
                    <td>
                      <span className="mes-code-text">{supplier.code}</span>
                    </td>
                    <td>
                      {supplier.name || supplier.companyName}
                    </td>
                    <td>
                      <div className="mes-tag-group">
                        {supplier.suppliedMaterials && supplier.suppliedMaterials.length > 0 
                          ? [...new Set(
                              supplier.suppliedMaterials
                                .filter(material => {
                                  // Find full material details from allMaterials array
                                  const fullMaterial = allMaterials.find(m => 
                                    m.id === (material.id || material.materialId) || 
                                    m.code === material.materialCode || 
                                    m.code === material.code
                                  )
                                  // Exclude if material no longer exists in DB
                                  if (!fullMaterial) return false
                                  // Exclude removed materials
                                  return (fullMaterial.status || material.status) !== 'Kaldırıldı'
                                })
                                .map(material => {
                                  const fullMaterial = allMaterials.find(m => 
                                    m.id === (material.id || material.materialId) || 
                                    m.code === material.materialCode || 
                                    m.code === material.code
                                  )
                                  const resolvedCategoryId = fullMaterial?.category ?? material.category
                                  if (!resolvedCategoryId) return null
                                  // If the category was deleted from DB, do not show a fallback name
                                  const category = materialCategories.find(cat => cat.id === resolvedCategoryId)
                                  if (!category) return null
                                  const name = category.name || category.label || resolvedCategoryId
                                  return String(name).trim()
                                })
                                .filter(Boolean)
                                .map(n => n.toString())
                            )].map((categoryName, index) => (
                              <span 
                                key={index}
                                className="mes-tag"
                              >
                                {categoryName}
                              </span>
                            ))
                          : <span className="text-muted-italic-xs">Kategoriler</span>
                        }
                      </div>
                    </td>
                    {!selectedSupplier && (
                      <td className="td-actions-compact">
                        <button
                          className="btn-icon-mini"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (supplier.phone1) {
                              window.open(`tel:${supplier.phone1}`, '_self');
                            }
                          }}
                          title={`Ara: ${supplier.phone1 || 'Telefon bulunamadı'}`}
                        >
                          <Phone size={10} />
                        </button>
                        <button
                          className="btn-icon-mini"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (supplier.email1) {
                              window.open(`mailto:${supplier.email1}`, '_blank');
                            }
                          }}
                          title={`Mail At: ${supplier.email1 || 'Email bulunamadı'}`}
                        >
                          <Mail size={10} />
                        </button>
                        <button
                          className="btn-icon-mini"
                          title="Sipariş Ver"
                          onClick={(e) => {
                            e.stopPropagation();
                            setOrderModalSupplierId(supplier.id);
                            setIsAddOrderModalOpen(true);
                          }}
                        >
                          <ShoppingCart size={10} />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
                
            {/* Empty state */}
            {!loading && sortedSuppliers.length === 0 && (
              <tr>
                <td colSpan="5" className="empty-state-cell">
                  <div className="empty-state-flex">
                    <div className="empty-state-icon">🏭</div>
                    <h3 className="title-lg-gray">
                      {activeCategory === 'all' 
                        ? 'Henüz tedarikçi bulunmuyor' 
                        : 'Bu kategoride tedarikçi bulunmuyor'
                      }
                    </h3>
                    <p className="text-subtitle">
                      {activeCategory === 'all' 
                        ? 'İlk tedarikçinizi eklemek için "Tedarikçi Ekle" butonunu kullanın.' 
                        : 'Bu kategoriye ait henüz tedarikçi yok.'
                      }
                    </p>
                  </div>
                </td>
              </tr>
            )}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {/* Sağ Panel - Detaylar */}
      {selectedSupplier && (
        <div className="supplier-detail-panel">
          <div className="supplier-panel-wrapper">
            {/* Header */}
            <div className="supplier-panel-header">
              <div className="flex-center-gap-12">
                <button
                  className="btn-back-sm"
                  onClick={() => setSelectedSupplier(null)}
                  title="Detayları Kapat"
                >
                  <ArrowLeft size={14} />
                </button>
                <h3 className="supplier-section-title-lg">
                  Tedarikçi Detayları
                </h3>
              </div>
              <div className="flex-gap-8-center">
                <button
                  className="btn-icon-sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (selectedSupplier.phone1) {
                      window.open(`tel:${selectedSupplier.phone1}`, '_self');
                    }
                  }}
                  title={`Ara: ${selectedSupplier.phone1 || 'Telefon bulunamadı'}`}
                >
                  <Phone size={14} />
                </button>
                <button
                  className="btn-icon-sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (selectedSupplier.email1) {
                      window.open(`mailto:${selectedSupplier.email1}`, '_blank');
                    }
                  }}
                  title={`Mail At: ${selectedSupplier.email1 || 'Email bulunamadı'}`}
                >
                  <Mail size={14} />
                </button>
                <button
                  className="btn-icon-sm-mr"
                  title="Sipariş Ver"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (selectedSupplier?.id) {
                      setOrderModalSupplierId(selectedSupplier.id);
                      setIsAddOrderModalOpen(true);
                    }
                  }}
                >
                  <ShoppingCart size={14} />
                </button>
                {!isEditing ? (
                  <button
                    className="btn-secondary-sm"
                    onClick={handleEdit}
                  >
                    <Edit size={14} className="mr-4" /> Düzenle
                  </button>
                ) : (
                  <>
                    <button
                      type="submit"
                      form="supplier-detail-form"
                      className="btn-primary-sm"
                    >
                      <Save size={14} className="mr-4" /> Kaydet
                    </button>
                    <button
                      className="btn-secondary-sm"
                      onClick={handleCancel}
                    >
                      <X size={14} className="mr-4" /> İptal
                    </button>
                  </>
                )}
                <button
                  className="btn-danger-outline-sm"
                  onClick={handleDeleteSupplier}
                >
                  <Trash2 size={14} className="mr-4" /> Sil
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="panel-content">
              <form onSubmit={handleSaveSupplier} id="supplier-detail-form" className="supplier-details-layout">
                {/* Temel Firma Bilgileri */}
                <div className="section-card-mb">
                  <h3 className="supplier-section-header">
                    Temel Firma Bilgileri
                  </h3>
                  
                  <div className="supplier-grid-2">
                    <div className="supplier-detail-row">
                      <span className="supplier-detail-label-120">
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
                        <span className="supplier-detail-value">
                          {selectedSupplier.code || '-'}
                        </span>
                      )}
                    </div>
                    
                    <div className="supplier-detail-row">
                      <span className="supplier-detail-label-120">
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
                        <span className="supplier-detail-value">
                          {selectedSupplier.status || '-'}
                        </span>
                      )}
                    </div>
                  </div>
                  
                  <div className="supplier-detail-row">
                    <span className="supplier-detail-label-120">
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
                      <span className="supplier-detail-value">
                        {selectedSupplier.name || selectedSupplier.companyName || '-'}
                      </span>
                    )}
                  </div>
                  
                  <div className="supplier-grid-2">
                    <div className="supplier-detail-row">
                      <span className="supplier-detail-label-120">
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
                        <span className="supplier-detail-value">
                          {selectedSupplier.supplierType || '-'}
                        </span>
                      )}
                    </div>
                    
                    <div className="supplier-detail-row">
                      <span className="supplier-detail-label-120">
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
                        <span className="supplier-detail-value">
                          {selectedSupplier.businessRegistrationNumber || '-'}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* İletişim Bilgileri */}
                <div className="section-card-mb">
                  <h3 className="supplier-section-header">
                    İletişim Bilgileri
                  </h3>
                  
                  <div className="supplier-grid-2-mb">
                    <div className="supplier-detail-row">
                      <span className="supplier-detail-label-120">
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
                        <span className="supplier-detail-value">
                          {selectedSupplier.contactPerson || '-'}
                        </span>
                      )}
                    </div>
                    
                    <div className="supplier-detail-row">
                      <span className="supplier-detail-label-120">
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
                        <span className="supplier-detail-value">
                          {selectedSupplier.emergencyContact || '-'}
                        </span>
                      )}
                    </div>
                  </div>
                  
                  <div className="supplier-grid-3-mb">
                    <div className="supplier-detail-row">
                      <span className="supplier-detail-label-80">
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
                        <span className="supplier-detail-value">
                          {selectedSupplier.phone1 || '-'}
                        </span>
                      )}
                    </div>
                    
                    <div className="supplier-detail-row">
                      <span className="supplier-detail-label-80">
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
                        <span className="supplier-detail-value">
                          {selectedSupplier.phone2 || '-'}
                        </span>
                      )}
                    </div>
                    
                    <div className="supplier-detail-row">
                      <span className="supplier-detail-label-80">
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
                        <span className="supplier-detail-value">
                          {selectedSupplier.emergencyPhone || '-'}
                        </span>
                      )}
                    </div>
                  </div>
                  
                  <div className="supplier-grid-3-mb">
                    <div className="supplier-detail-row">
                      <span className="supplier-detail-label-80">
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
                        <span className="supplier-detail-value">
                          {selectedSupplier.email1 || '-'}
                        </span>
                      )}
                    </div>
                    
                    <div className="supplier-detail-row">
                      <span className="supplier-detail-label-80">
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
                        <span className="supplier-detail-value">
                          {selectedSupplier.email2 || '-'}
                        </span>
                      )}
                    </div>
                    
                    <div className="supplier-detail-row">
                      <span className="supplier-detail-label-80">
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
                        <span className="supplier-detail-value">
                          {selectedSupplier.fax || '-'}
                        </span>
                      )}
                    </div>
                  </div>
                  
                  <div className="supplier-grid-2">
                    <div className="supplier-detail-row">
                      <span className="supplier-detail-label-120">
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
                        <span className="supplier-detail-value">
                          {selectedSupplier.website || '-'}
                        </span>
                      )}
                    </div>
                    
                    <div className="supplier-detail-row">
                      <span className="supplier-detail-label-120">
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
                        <span className="supplier-detail-value">
                          {selectedSupplier.preferredCommunication || '-'}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Adres ve Mali Bilgiler - Üst Bölüm */}
                <div className="supplier-grid-2-mb">
                  {/* Adres Bilgileri */}
                  <div className="section-card">
                    <h3 className="supplier-section-header">
                      Adres Bilgileri
                    </h3>
                    
                    <div className="supplier-detail-row-start">
                      <span className="supplier-detail-label-80-mt">
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
                        <span className="text-xs-flex-1">
                          {selectedSupplier.address || 'Adres girilmemiş'}
                        </span>
                      )}
                    </div>
                    
                    <div className="supplier-detail-row">
                      <span className="supplier-detail-label-80">
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
                        <span className="supplier-detail-value">
                          {selectedSupplier.city || '-'}
                        </span>
                      )}
                    </div>
                    
                    <div className="supplier-detail-row">
                      <span className="supplier-detail-label-80">
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
                        <span className="supplier-detail-value">
                          {selectedSupplier.state || '-'}
                        </span>
                      )}
                    </div>
                    
                    <div className="supplier-detail-row">
                      <span className="supplier-detail-label-80">
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
                        <span className="supplier-detail-value">
                          {selectedSupplier.postalCode || '-'}
                        </span>
                      )}
                    </div>
                    
                    <div className="supplier-detail-row">
                      <span className="supplier-detail-label-80">
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
                        <span className="supplier-detail-value">
                          {selectedSupplier.country || '-'}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Mali Bilgiler */}
                  <div className="section-card">
                    <h3 className="supplier-section-header">
                      Mali Bilgiler
                    </h3>
                    
                    <div className="supplier-detail-row">
                      <span className="supplier-detail-label-80">
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
                        <span className="supplier-detail-value">
                          {selectedSupplier.taxNumber || '-'}
                        </span>
                      )}
                    </div>
                    
                    <div className="supplier-detail-row">
                      <span className="supplier-detail-label-80">
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
                        <span className="supplier-detail-value">
                          {selectedSupplier.taxOffice || '-'}
                        </span>
                      )}
                    </div>
                    
                    <div className="supplier-detail-row">
                      <span className="supplier-detail-label-80">
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
                        <span className="supplier-detail-value">
                          {selectedSupplier.currency || '-'}
                        </span>
                      )}
                    </div>
                    
                    <div className="supplier-detail-row">
                      <span className="supplier-detail-label-80">
                        Kredi Limiti:
                      </span>
                      {isEditing ? (
                        <input
                          type="text" inputMode="decimal" pattern="[0-9]*\.?[0-9]*"
                          name="creditLimit"
                          value={formData.creditLimit || ''}
                          onChange={handleInputChange}
                          style={getInputStyle(isEditing)}
                        />
                      ) : (
                        <span className="supplier-detail-value">
                          {selectedSupplier.creditLimit || '-'}
                        </span>
                      )}
                    </div>
                    
                    <div className="supplier-detail-row">
                      <span className="supplier-detail-label-80">
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
                        <span className="supplier-detail-value">
                          {selectedSupplier.creditRating || '-'}
                        </span>
                      )}
                    </div>
                    
                    <div className="supplier-detail-row">
                      <span className="supplier-detail-label-80">
                        Yıllık Ciro:
                      </span>
                      {isEditing ? (
                        <input
                          type="text" inputMode="decimal" pattern="[0-9]*\.?[0-9]*"
                          name="annualRevenue"
                          value={formData.annualRevenue || ''}
                          onChange={handleInputChange}
                          style={getInputStyle(isEditing)}
                        />
                      ) : (
                        <span className="supplier-detail-value">
                          {selectedSupplier.annualRevenue || '-'}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Ödeme ve Operasyonel Bilgiler - Orta Bölüm */}
                <div className="supplier-grid-2-mb">
                  {/* Ödeme Bilgileri */}
                  <div className="section-card">
                    <h3 className="supplier-section-header">
                      Ödeme Bilgileri
                    </h3>
                    
                    <div className="supplier-detail-row">
                      <span className="supplier-detail-label-80">
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
                        <span className="supplier-detail-value">
                          {selectedSupplier.paymentTerms || '-'}
                        </span>
                      )}
                    </div>
                    
                    <div className="supplier-detail-row">
                      <span className="supplier-detail-label-80">
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
                        <span className="supplier-detail-value">
                          {selectedSupplier.paymentMethod || '-'}
                        </span>
                      )}
                    </div>
                    
                    <div className="supplier-detail-row">
                      <span className="supplier-detail-label-80">
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
                        <span className="supplier-detail-value">
                          {selectedSupplier.bankName || '-'}
                        </span>
                      )}
                    </div>
                    
                    <div className="supplier-detail-row">
                      <span className="supplier-detail-label-80">
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
                        <span className="supplier-detail-value">
                          {selectedSupplier.bankAccount || '-'}
                        </span>
                      )}
                    </div>
                    
                    <div className="supplier-detail-row">
                      <span className="supplier-detail-label-80">
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
                        <span className="supplier-detail-value">
                          {selectedSupplier.iban || '-'}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Operasyonel Bilgiler */}
                  <div className="section-card">
                    <h3 className="supplier-section-header">
                      Operasyonel Bilgiler
                    </h3>
                    
                    <div className="supplier-detail-row">
                      <span className="supplier-detail-label-80">
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
                        <span className="supplier-detail-value">
                          {selectedSupplier.deliveryCapability || '-'}
                        </span>
                      )}
                    </div>
                    
                    <div className="supplier-detail-row">
                      <span className="supplier-detail-label-80">
                        Tedarik Süresi:
                      </span>
                      {isEditing ? (
                        <input
                          type="text" inputMode="decimal" pattern="[0-9]*\.?[0-9]*"
                          name="leadTime"
                          value={formData.leadTime || ''}
                          onChange={handleInputChange}
                          style={getInputStyle(isEditing)}
                        />
                      ) : (
                        <span className="supplier-detail-value">
                          {selectedSupplier.leadTime ? `${selectedSupplier.leadTime} gün` : '-'}
                        </span>
                      )}
                    </div>
                    
                    <div className="supplier-detail-row">
                      <span className="supplier-detail-label-80">
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
                        <span className="supplier-detail-value">
                          {selectedSupplier.minimumOrderQuantity || '-'}
                        </span>
                      )}
                    </div>
                    
                    <div className="supplier-detail-row">
                      <span className="supplier-detail-label-80">
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
                        <span className="supplier-detail-value">
                          {selectedSupplier.qualityCertification || '-'}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Şirket Bilgileri - Alt Bölüm */}
                <div className="section-card-mb">
                  <h3 className="supplier-section-header">
                    Şirket Bilgileri
                  </h3>
                  
                  <div className="grid-4">
                    <div className="supplier-detail-row">
                      <span className="supplier-detail-label-100">
                        Kuruluş Yılı:
                      </span>
                      {isEditing ? (
                        <input
                          type="text" inputMode="decimal" pattern="[0-9]*\.?[0-9]*"
                          name="yearEstablished"
                          value={formData.yearEstablished || ''}
                          onChange={handleInputChange}
                          style={getInputStyle(isEditing)}
                        />
                      ) : (
                        <span className="supplier-detail-value">
                          {selectedSupplier.yearEstablished || '-'}
                        </span>
                      )}
                    </div>
                    
                    <div className="supplier-detail-row">
                      <span className="supplier-detail-label-100">
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
                        <span className="supplier-detail-value">
                          {selectedSupplier.employeeCount || '-'}
                        </span>
                      )}
                    </div>
                    
                    <div className="supplier-detail-row">
                      <span className="supplier-detail-label-100">
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
                        <span className="supplier-detail-value">
                          {selectedSupplier.riskLevel || '-'}
                        </span>
                      )}
                    </div>
                    
                    <div className="supplier-detail-row">
                      <span className="supplier-detail-label-100">
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
                        <span className="supplier-detail-value">
                          {selectedSupplier.complianceStatus || '-'}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Tedarik Edilen Malzemeler */}
                <div className="section-card-mb">
                  <h3 className="supplier-section-header">
                    Tedarik Edilen Malzemeler
                  </h3>

                  {/* Material Mode Toggle */}
                  <div className="mb-12">
                    <div className="flex-gap-8-mb-8">
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
                          if ((!activeMaterials || activeMaterials.length === 0) && !materialsLoading) {
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
                  {selectedSupplier?.suppliedMaterials && selectedSupplier.suppliedMaterials.length > 0 && (() => {
                    // Normalize supplied materials to have consistent field names
                    const normalizedMaterials = selectedSupplier.suppliedMaterials.map(material => ({
                      ...material,
                      id: material.id || material.materialId,
                      code: material.code || material.materialCode,
                      name: material.name || material.materialName
                    }))

                    // Calculate materials count based on toggle state
                    const filteredMaterials = normalizedMaterials.filter(material => {
                      const fullMaterial = allMaterials.find(m => m.id === material.id)
                      const materialName = fullMaterial?.name || material.name

                      // If material doesn't exist in DB anymore, do not show
                      if (!fullMaterial) return false

                      // Filter empty names first
                      if (!materialName || materialName.trim() === '') return false

                      // Then filter by active/all based on toggle
                      if (showAllMaterials) {
                        // Show both active and removed ones that still exist
                        return true
                      } else {
                        // Only show if not removed
                        return fullMaterial.status !== 'Kaldırıldı'
                      }
                    })
                    
                    const validMaterialsCount = filteredMaterials.length
                    
                    return (
                      <div className="mb-12">
                        <div className="material-list-header">
                          <h4 className="material-list-title">
                            Tedarik Edilen Malzemeler ({validMaterialsCount})
                          </h4>
                          <button
                            type="button"
                            className={`btn-toggle-sm ${showAllMaterials ? 'active' : ''}`}
                            onClick={() => setShowAllMaterials(!showAllMaterials)}
                          >
                            {showAllMaterials ? 'Mevcut Malzemeler' : 'Hepsini Göster'}
                          </button>
                        </div>
                      <div className="material-list-container">
                        {filteredMaterials.length > 0 ? (
                          filteredMaterials.map((material, index) => {
                          // Find full material details from allMaterials array
                          const fullMaterial = allMaterials.find(m => m.id === material.id)
                          const isRemoved = fullMaterial?.status === 'Kaldırıldı'
                          const materialName = fullMaterial?.name || material.name || 'İsimsiz Malzeme'
                          
                          return (
                            <div
                              key={material.id || index}
                              style={{
                                padding: '6px 12px',
                                borderBottom: index < filteredMaterials.length - 1 ? '1px solid #f3f4f6' : 'none',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                fontSize: '12px',
                                opacity: isRemoved ? 0.6 : 1 // 50% opacity for removed materials
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
                                    color: isRemoved ? '#dc2626' : (material.status === 'pasif' ? '#dc2626' : material.status === 'değerlendirmede' ? '#eab308' : '#111827'),
                                    textDecoration: isRemoved ? 'line-through' : 'none',
                                    opacity: (!isRemoved && material.status === 'pasif') ? 0.6 : 1
                                  }}>
                                    {materialName}
                                  </span>
                                  {isRemoved && (
                                    <span style={{
                                      fontSize: '10px',
                                      padding: '1px 4px',
                                      borderRadius: '2px',
                                      background: '#dc2626',
                                      color: 'white'
                                    }}>
                                      KALDIRILDI
                                    </span>
                                  )}
                                </div>
                                <div style={{ fontSize: '11px', color: isRemoved ? '#dc2626' : '#6b7280' }}>
                                  {(() => {
                                    const catName = getCategoryName(fullMaterial?.category || material.category)
                                    return catName ? `${catName} • ` : ''
                                  })()}
                                  {fullMaterial?.unit || material.unit}
                                </div>
                              </div>
                              <div className="flex-center-gap-6">
                                <button
                                  onClick={() => handleShowMaterialDetail(material.id)}
                                  style={{
                                    background: 'none',
                                    border: 'none',
                                    cursor: 'pointer',
                                    padding: '2px',
                                    borderRadius: '3px',
                                    color: isRemoved ? '#dc2626' : '#6b7280',
                                    display: 'flex',
                                    alignItems: 'center'
                                  }}
                                  title="Malzeme Detayları"
                                >
                                  <Info size={12} />
                                </button>
                                {!isRemoved && (() => {
                                  // Calculate effective status based on supplier status and material status
                                  const effectiveStatus = getEffectiveMaterialStatus(
                                    fullMaterial, 
                                    selectedSupplier, 
                                    material
                                  )
                                  
                                  // If supplier is not active, show status badge (non-editable)
                                  if (selectedSupplier.status !== SUPPLIER_STATUSES.ACTIVE) {
                                    const badgeProps = createStatusBadgeProps(effectiveStatus, { 
                                      size: 'small', 
                                      showTooltip: true 
                                    })
                                    return (
                                      <span {...badgeProps} />
                                    )
                                  }
                                  
                                  // If supplier is active, show editable select for material status
                                  return (
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
                                      title="Malzeme statüsü (tedarikçi aktif olduğu için düzenlenebilir)"
                                    >
                                      <option value="aktif">Aktif</option>
                                      <option value="pasif">Pasif</option>
                                      <option value="değerlendirmede">Değerlendirmede</option>
                                    </select>
                                  )
                                })()}
                              </div>
                            </div>
                          )
                          })
                        ) : (
                        <div className="empty-message-italic">
                            {showAllMaterials 
                              ? 'Bu tedarikçiye ait malzeme bulunamadı.' 
                              : 'Bu tedarikçiye ait aktif malzeme bulunamadı. "Hepsini Göster" ile kaldırılmış malzemeleri görebilirsiniz.'
                            }
                          </div>
                        )}
                      </div>
                    </div>
                    )
                  })()}

                  {/* New Material Mode */}
                  {materialMode === 'new' && (
                    <div>
                      <div className="supplier-detail-row">
                        <span className="supplier-detail-label-100">
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

                      <div className="supplier-detail-row">
                        <span className="supplier-detail-label-100">
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

                      <div className="supplier-detail-row">
                        <span className="supplier-detail-label-100">
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
                        <div className="supplier-detail-row">
                          <span className="supplier-detail-label-100">
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

                      <div className="supplier-detail-row">
                        <span className="supplier-detail-label-100">
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

                      <div className="supplier-detail-row">
                        <span className="supplier-detail-label-100">
                          Kod:
                        </span>
                        <input
                          type="text"
                          name="code"
                          value={newMaterial.code || nextMaterialCode}
                          onChange={handleNewMaterialChange}
                          placeholder={`Otomatik kod: ${nextMaterialCode}`}
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

                      <div className="supplier-detail-row-start">
                        <span className="supplier-detail-label-100-mt">
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

                      <div className="supplier-detail-row">
                        <span className="supplier-detail-label-100">
                          Minimum Stok:
                        </span>
                        <input
                          type="text" inputMode="decimal" pattern="[0-9]*\.?[0-9]*"
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

                      <div className="supplier-detail-row">
                        <span className="supplier-detail-label-100">
                          Mevcut Stok:
                        </span>
                        <input
                          type="text" inputMode="decimal" pattern="[0-9]*\.?[0-9]*"
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

                      <div className="supplier-detail-row">
                        <span className="supplier-detail-label-100">
                          Maliyet Fiyatı:
                        </span>
                        <input
                          type="text" inputMode="decimal" pattern="[0-9]*\.?[0-9]*"
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

                      <div className="supplier-detail-row">
                        <span className="supplier-detail-label-100">
                          Satış Fiyatı:
                        </span>
                        <input
                          type="text" inputMode="decimal" pattern="[0-9]*\.?[0-9]*"
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

                      <div className="supplier-detail-row">
                        <span className="supplier-detail-label-100">
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
                    <div className="empty-message-italic">
                      Henüz malzeme eklenmemiş. Yukarıdaki butonları kullanarak malzeme ekleyebilirsiniz.
                    </div>
                  )}
                </div>

                {/* Supply History - Tedarik Geçmişi */}
                <div className="section-card-mb">
                  <SupplierHistorySection supplier={selectedSupplier} />
                </div>

                {/* Ek Bilgiler */}
                <div className="section-card-mb">
                  <h3 className="supplier-section-header">
                    Ek Bilgiler
                  </h3>
                  
                  <div className="supplier-detail-row-start">
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
                      <span className="text-xs-flex-1">
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
        <div className="modal-overlay">
          <div className="modal-content-lg">
            {/* Popup Header */}
            <div className="modal-header-between">
              <h3 className="supplier-section-title-lg">
                Mevcut Malzemelerden Seç
              </h3>
              <button
                type="button"
                onClick={() => setShowMaterialPopup(false)}
                className="btn-close-x"
              >
                ×
              </button>
            </div>

            {/* Search Input */}
            <div className="mb-12">
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
              <div className="empty-state-content">
                Malzemeler yükleniyor...
              </div>
            ) : (
              <div className="modal-list-scroll">
                {filteredMaterials.length === 0 ? (
                  <div className="empty-state-content">
                    {materialSearchTerm ? 'Arama kriterine uygun malzeme bulunamadı' : 'Henüz malzeme bulunmuyor'}
                  </div>
                ) : (
                    // Ensure only active materials are shown in this selection popup
                    filteredMaterials
                      .filter(material => material.status !== 'Kaldırıldı')
                      .map(material => (
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
                      <div className="label-bold-mb">
                        {material.name}
                        {selectedMaterials.find(m => m.id === material.id) && (
                          <span className="text-success-ml">✓ Seçildi</span>
                        )}
                      </div>
                      <div className="text-muted-xs">
                        {material.code && `Kod: ${material.code} • `}
                        {(() => { const cn = getCategoryName(material.category); return cn ? `Kategori: ${cn} • ` : '' })()}
                        {material.unit && `Birim: ${material.unit}`}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* Selected Materials Summary */}
            {selectedMaterials.length > 0 && (
              <div className="selection-info-box">
                <div className="text-blue-title">
                  Seçilen Malzemeler ({selectedMaterials.length})
                </div>
                <div className="text-link-blue">
                  {selectedMaterials.map(m => m.name).join(', ')}
                </div>
              </div>
            )}

            {/* Popup Footer */}
            <div className="modal-footer-end">
              <button
                type="button"
                onClick={() => setShowMaterialPopup(false)}
                className="btn-secondary-md"
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

      {/* Material Detail Modal - Removed, now opens in materials.html stocks tab */}

      {/* Add Order Modal */}
      <AddOrderModal 
        isOpen={isAddOrderModalOpen}
        onClose={() => {
          setIsAddOrderModalOpen(false)
          setOrderModalSupplierId(null)
        }}
        initialSupplierId={orderModalSupplierId}
        onSave={async (newOrder) => {
          console.log('✅ New order created from supplier details:', newOrder);
          // Suppliers'ı refresh et
          if (onRefreshSuppliers) {
            onRefreshSuppliers();
          }
        }}
      />
    </div>
  )
}

// Embedded supplier history table with local loading state
function SupplierHistorySection({ supplier }) {
  const { items, loading, error, loadHistory, isLoadedForSupplier } = useSupplierProcurementHistory(supplier)

  // useEffect kaldırıldı - tedarik geçmişi sadece butona tıklandığında yüklenecek

  return (
    <div className="supply-history-section">
      <div className="supplier-header-flex">
        <h3 style={{ margin: 0, fontSize: '14px', fontWeight: '600', color: '#111827' }}>Tedarik Geçmişi</h3>
        <button 
          type="button"
          onClick={() => {
            if (supplier?.id && loadHistory) {
              console.log('🔄 Tedarik geçmişi yeniden yükleniyor...', supplier.id);
              loadHistory();
            }
          }}
          style={{
            padding: '6px 12px',
            borderRadius: '6px',
            border: '1px solid #d1d5db',
            background: loading ? '#e5e7eb' : '#f9fafb',
            cursor: loading ? 'not-allowed' : 'pointer',
            fontSize: '12px',
            fontWeight: '600',
            color: loading ? '#9ca3af' : '#374151'
          }}
          disabled={!supplier?.id || loading}
        >
          <RotateCw size={14} style={{ marginRight: '6px' }} className={loading ? 'rotating' : ''} />
          {loading ? 'Yükleniyor...' : 'Tedarik Geçmişini Yükle'}
        </button>
      </div>
      <div className="supply-history-table" style={{ overflowX: 'auto', width: '100%' }}>
        <table style={{ minWidth: '100%', tableLayout: 'auto' }}>
          <thead>
            <tr style={{ background: '#f9fafb' }}>
              <th className="text-nowrap-muted">Tarih</th>
              <th style={{ minWidth: '150px', color: '#374151' }}>Malzeme</th>
              <th className="text-nowrap-muted">Miktar</th>
              <th className="text-nowrap-muted">Birim Fiyat</th>
              <th className="text-nowrap-muted">Toplam</th>
              <th className="text-nowrap-muted">Durum</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan="6" className="no-data">Tedarik geçmişi yükleniyor...</td>
              </tr>
            ) : error ? (
              <tr>
                <td colSpan="6" className="no-data">{error}</td>
              </tr>
            ) : (items && items.length > 0) ? (
              items.map((row, idx) => {
                const dateObj = row._sortDate || row.actualDeliveryDate || row.expectedDeliveryDate || row.orderDate || null
                const dateStr = dateObj ? new Date(dateObj).toLocaleDateString('tr-TR') : '-'
                const qty = Number(row.quantity || 0)
                const unitPrice = Number(row.unitPrice || 0)
                const total = !isNaN(qty) && !isNaN(unitPrice) ? (qty * unitPrice) : 0
                return (
                  <tr key={`${row.orderId}-${row.itemSequence}-${idx}`}>
                    <td className="text-nowrap">{dateStr}</td>
                    <td style={{ maxWidth: '150px', wordBreak: 'break-word' }} title={row.materialName || row.materialCode}>{row.materialName || row.materialCode || '-'}</td>
                    <td className="text-nowrap">{!isNaN(qty) ? `${qty} ${row.unit || ''}`.trim() : '-'}</td>
                    <td className="text-nowrap">{!isNaN(unitPrice) ? `${unitPrice.toLocaleString('tr-TR')} ${row.currency || 'TRY'}` : '-'}</td>
                    <td className="text-nowrap">{!isNaN(total) ? `${total.toLocaleString('tr-TR')} ${row.currency || 'TRY'}` : '-'}</td>
                    <td className="text-nowrap">{row.itemStatus || '-'}</td>
                  </tr>
                )
              })
            ) : (
              <tr>
                <td colSpan="6" className="no-data">
                  {isLoadedForSupplier ? 'Henüz tedarik geçmişi bulunmuyor' : 'Tedarik geçmişini yüklemek için yukarıdaki butona tıklayın'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="flex-end-mt-8">
        <button
          type="button"
          onClick={() => {
            try {
              try { localStorage.setItem('bk_active_tab', 'orders') } catch {}
              window.open('materials.html#orders-tab', '_blank')
            } catch (e) {
              console.error('Order panelini açma hatası:', e)
            }
          }}
          style={{
            padding: '8px 12px',
            borderRadius: '8px',
            border: '1px solid #e5e7eb',
            background: '#f9fafb',
            cursor: 'pointer',
            fontSize: '12px',
            fontWeight: 600
          }}
        >
          Tüm tedarik geçmişini gör
        </button>
      </div>
    </div>
  )
}




