import React, { useState, useEffect, useMemo, useRef } from 'react'
import useSupplierProcurementHistory from '../../hooks/useSupplierProcurementHistory.js'
import { useMaterials, useMaterialActions } from '../../hooks/useMaterials.js'
import { useSuppliers } from '../../hooks/useSuppliers.js'
import { useCategories } from '../../hooks/useCategories.js'
import { categoriesService } from '../../services/categories-service.js'
import { materialsService } from '../../services/materials-service.js'
import ErrorBoundary from '../../../../shared/components/ErrorBoundary.jsx'
import AddOrderModal from '../shared/modals/AddOrderModal.jsx'
import SupplierDetailsPanel from './SupplierDetailsPanel.jsx'
import MaterialSelectModal from '../shared/modals/MaterialSelectModal.jsx'
import { 
  getEffectiveMaterialStatus, 
  createStatusBadgeProps,
  SUPPLIER_STATUSES,
  MATERIAL_STATUSES 
} from '../../utils/material-status-utils.js'
import { showToast } from '../../../../shared/components/MESToast.js'
import { Phone, Mail, ShoppingCart, Edit, Trash2, Info, RotateCw, Save, X, ArrowLeft } from '../../../../shared/components/Icons.jsx'

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
      <SupplierDetailsPanel
        supplier={selectedSupplier}
        isEditing={isEditing}
        formData={formData}
        allMaterials={allMaterials}
        materialMode={materialMode}
        newMaterial={newMaterial}
        materialCategories={materialCategories}
        materialTypes={materialTypes}
        showNewCategory={showNewCategory}
        newCategory={newCategory}
        nextMaterialCode={nextMaterialCode}
        showAllMaterials={showAllMaterials}
        activeMaterials={activeMaterials}
        materialsLoading={materialsLoading}
        onClose={() => setSelectedSupplier(null)}
        onEdit={handleEdit}
        onCancel={handleCancel}
        onSave={handleSaveSupplier}
        onDelete={handleDeleteSupplier}
        onInputChange={handleInputChange}
        onOpenOrderModal={() => {
          setOrderModalSupplierId(selectedSupplier.id)
          setIsAddOrderModalOpen(true)
        }}
        onOpenMaterialPopup={handleOpenMaterialPopup}
        onSetMaterialMode={setMaterialMode}
        onNewMaterialChange={handleNewMaterialChange}
        onCategoryChange={handleCategoryChange}
        onSetNewCategory={setNewCategory}
        onAddNewMaterial={handleAddNewMaterial}
        onSetShowAllMaterials={setShowAllMaterials}
        onMaterialStatusChange={handleMaterialStatusChange}
        onShowMaterialDetail={handleShowMaterialDetail}
        getCategoryName={getCategoryName}
        loadMaterials={loadMaterials}
        extractMaterialCategories={extractMaterialCategories}
      />
      {/* Material Selection Popup */}
      <MaterialSelectModal
        isOpen={showMaterialPopup}
        onClose={() => setShowMaterialPopup(false)}
        materialsLoading={materialsLoading}
        filteredMaterials={filteredMaterials}
        selectedMaterials={selectedMaterials}
        materialSearchTerm={materialSearchTerm}
        onSearchChange={setMaterialSearchTerm}
        onMaterialSelect={handleMaterialSelect}
        onAddExistingMaterials={handleAddExistingMaterials}
        getCategoryName={getCategoryName}
      />

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






