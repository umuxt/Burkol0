import React, { useState, useEffect } from 'react'
import { Plus, Download, Zap } from '../../../../shared/components/Icons.jsx'
import AddOrderModal from '../shared/modals/AddOrderModal.jsx'
import DeliveryModal from '../shared/modals/DeliveryModal.jsx'
import OrdersFilters from './OrdersFilters.jsx'
import OrdersTable from './OrdersTable.jsx'
import OrderDetailsPanel from './OrderDetailsPanel.jsx'
import { fetchWithTimeout, withAuth } from '../../../../shared/lib/api.js'
import { materialsService } from '../../services/materials-service.js'
import { API } from '../../../../shared/lib/api.js'
import { showToast } from '../../../../shared/components/MESToast.js'
import { exportOrdersToCSV } from '../../utils/orderExportUtils.js'

// Helper to get local date string (fixes timezone issues)
function getLocalDateString(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Helper to get tomorrow's date string (for expiry date minimum)
function getTomorrowDateString() {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return getLocalDateString(tomorrow);
}

// Auth helper
async function fetchJsonWith401Retry(url, options = {}, timeoutMs = 10000) {
  const res = await fetchWithTimeout(url, options, timeoutMs)
  if (res.status !== 401) return res
  try {
    const host = typeof window !== 'undefined' ? window.location.hostname : ''
    const isLocal = host === 'localhost' || host === '127.0.0.1'
    if (!isLocal) return res
    localStorage.removeItem('bp_admin_token')
    const retry = await fetchWithTimeout(url, { ...(options || {}), headers: withAuth(options?.headers || {}) }, timeoutMs)
    return retry
  } catch {
    return res
  }
}

export default function OrdersTabContent() {
  console.log('🎬 OrdersTabContent component rendered - FORCED LOG')
  
  const [activeOrdersTab, setActiveOrdersTab] = useState('pending') // 'pending' | 'completed' | 'all'

  // ✅ SMART TAB CHANGE: Tab değiştiğinde refresh tetikle
  const handleTabChange = async (newTab) => {
    console.log(`🔄 SMART REFRESH: Tab changed to ${newTab} - refreshing orders...`)
    setActiveOrdersTab(newTab)
    await refreshOrders() // Fresh data çek
  }
  const [isAddOrderModalOpen, setIsAddOrderModalOpen] = useState(false)
  const [isDeliveredRecordMode, setIsDeliveredRecordMode] = useState(false)
  const [selectedOrder, setSelectedOrder] = useState(null)
  const [isFiltersExpanded, setIsFiltersExpanded] = useState(false)
  const [selectedOrderLoading, setSelectedOrderLoading] = useState(false)
  const [selectedOrderError, setSelectedOrderError] = useState(null)
  
  // Debug modal state
  useEffect(() => {
    console.log('🔥🔥🔥 OrdersTabContent: Modal state değişti:', isAddOrderModalOpen);
  }, [isAddOrderModalOpen])
  
  // Filter state
  const [filters, setFilters] = useState({
    search: '',
    orderStatus: [], // Sipariş durumu filtresi - multi-select
    itemStatus: [], // Satır durumu filtresi - multi-select
    dateRange: [], // Tarih filtresi - multi-select
    customDateRange: { startDate: '', endDate: '' }, // Özel tarih aralığı
    deliveryStatus: [], // Teslimat durumu filtresi - multi-select
    customDeliveryDateRange: { startDate: '', endDate: '' }, // Özel teslimat aralığı
    materialType: [], // Malzeme tipi filtresi - multi-select
    supplierType: [], // Tedarikçi filtresi - multi-select
    materialCategory: '', // Malzeme kategorisi filtresi
    priceRange: {
      min: '',
      max: '',
      mode: 'order' // 'order' | 'item'
    }
  })

  // Stats hooks - Backend API kullanacağız
  const [stats, setStats] = useState({
    pendingOrders: 0,
    thisMonthOrders: 0,
    partialOrders: 0,
    totalOrders: 0,
    completedOrders: 0,
    totalAmount: 0
  })
  const [statsLoading, setStatsLoading] = useState(true)
  
  // Bulk selection state for CSV/bulk ops
  const [selectedOrderIds, setSelectedOrderIds] = useState(new Set())

  const handleToggleSelectOrder = (orderId, checked) => {
    setSelectedOrderIds(prev => {
      const next = new Set(prev)
      if (checked) next.add(orderId); else next.delete(orderId)
      return next
    })
  }
  
  // Delivery modal state for lot tracking
  const [deliveryModalOpen, setDeliveryModalOpen] = useState(false)
  const [deliveryModalItem, setDeliveryModalItem] = useState(null)
  const [deliveryFormData, setDeliveryFormData] = useState({
    actualDeliveryDate: getLocalDateString(),
    supplierLotCode: '',
    manufacturingDate: '',
    expiryDate: '',
    notes: ''
  })

  // Load system settings for Lot Tracking visibility
  const [systemSettings, setSystemSettings] = useState({ lotTracking: true });

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        console.log('⚙️ Fetching system settings...');
        const res = await fetchWithTimeout('/api/settings/system', { headers: withAuth() });
        if (res.ok) {
          const data = await res.json();
          console.log('⚙️ System Settings Loaded:', data);
          setSystemSettings(data || { lotTracking: true });
        } else {
          console.warn('⚙️ Failed to load settings, status:', res.status);
        }
      } catch (error) {
        console.error('Failed to load system settings:', error);
      }
    };
    fetchSettings();
  }, []);

  // Debug render state
  console.log('🎨 Render System Settings:', systemSettings);


  // CSV Export for current tab (or selected orders if any) - delegated to utility
  const handleExportCSV = () => {
    exportOrdersToCSV({
      orders: currentOrders,
      selectedOrderIds,
      activeOrdersTab,
      showToast
    })
  }

  const handleToggleSelectAll = (ordersInView = [], checked) => {
    setSelectedOrderIds(prev => {
      const next = new Set(prev)
      const idsInView = ordersInView.map(o => o.id)
      if (checked) {
        idsInView.forEach(id => next.add(id))
      } else {
        idsInView.forEach(id => next.delete(id))
      }
      return next
    })
  }

  // Stats API çağrısı
  useEffect(() => {
    const fetchStats = async () => {
      try {
        setStatsLoading(true)
        
        const response = await fetchJsonWith401Retry('/api/orders/stats', { headers: withAuth({ 'Content-Type': 'application/json' }) })
        
        console.log('📊 Stats API response:', response.status, response.statusText)
        
        if (!response.ok) {
          console.warn('Stats API not available, using default values')
          return
        }
        
        const data = await response.json()
        console.log('📊 Stats data:', data)
        setStats(data.stats || stats)
      } catch (error) {
        console.error('Stats fetch error:', error)
      } finally {
        setStatsLoading(false)
      }
    }
    
    fetchStats()
  }, [])
  
  const updateOrder = async (orderId, updates) => {
    console.log('💾 UPDATE ORDER FUNCTION CALLED:')
    console.log('  - Order ID:', orderId)
    console.log('  - Updates:', JSON.stringify(updates, null, 2))
    
    try {
      const url = `/api/orders/${orderId}`
      console.log('📡 Making PUT request to:', url)
      
      const requestBody = JSON.stringify(updates)
      console.log('📤 Request body:', requestBody)
      
      const headers = withAuth({
        'Content-Type': 'application/json'
      })
      console.log('📤 Request headers:', headers)
      
      const response = await fetchWithTimeout(url, {
        method: 'PUT',
        headers: headers,
        body: requestBody
      })
      
      console.log('📥 Response received:')
      console.log('  - Status:', response.status)
      console.log('  - Status Text:', response.statusText)
      console.log('  - OK:', response.ok)
      
      if (!response.ok) {
        const errorText = await response.text()
        console.log('❌ Response error text:', errorText)
        throw new Error(`API Error: ${response.status} - ${errorText}`)
      }
      
      const data = await response.json()
      console.log('📥 Response data:', data)
      return data.order || data
    } catch (error) {
      console.error('❌ Update order error:', error)
      throw error
    }
  }
  const actionLoading = false
  
  // Malzemeler için API state
  const [materials, setMaterials] = useState([])
  const [materialsLoading, setMaterialsLoading] = useState(true)
  const [materialsError, setMaterialsError] = useState(null)
  
  // Test: API endpoint'leri çalışıyor mu?
  useEffect(() => {
    const testEndpoints = async () => {
      console.log('🧪 Testing API endpoints...')
      
      try {
        // Test materials endpoint
        console.log('🧪 Testing /api/materials...')
        const materialsResponse = await fetchJsonWith401Retry('/api/materials', { headers: withAuth({ 'Content-Type': 'application/json' }) })
        console.log('📦 Materials response:', materialsResponse.status)
        if (materialsResponse.ok) {
          const materialsData = await materialsResponse.json()
          console.log('📦 Materials count:', materialsData.materials?.length || 0)
        }
        
        // Test orders endpoint  
        console.log('🧪 Testing /api/orders...')
        const ordersResponse = await fetchJsonWith401Retry('/api/orders', { headers: withAuth({ 'Content-Type': 'application/json' }) })
        console.log('📋 Orders response:', ordersResponse.status)
        if (ordersResponse.ok) {
          const ordersData = await ordersResponse.json()
          console.log('📋 Orders count:', ordersData.orders?.length || 0)
        }
        
        // Test stats endpoint
        console.log('🧪 Testing /api/orders/stats...')
        const statsResponse = await fetchJsonWith401Retry('/api/orders/stats', { headers: withAuth({ 'Content-Type': 'application/json' }) })
        console.log('📊 Stats response:', statsResponse.status)
        if (statsResponse.ok) {
          const statsData = await statsResponse.json()
          console.log('📊 Stats:', statsData.stats)
        }
        
      } catch (error) {
        console.error('🧪 API test error:', error)
      }
    }
    
    testEndpoints()
  }, [])

  // Malzemeleri API'den çek
  useEffect(() => {
    const fetchMaterials = async () => {
      try {
        setMaterialsLoading(true)
        
        // Tüm malzemeleri çek
        const response = await fetchWithTimeout('/api/materials', {
          headers: withAuth()
        })
        
        console.log('📡 Materials API response:', response.status, response.statusText)
        
        if (!response.ok) {
          if (response.status === 401) {
            setMaterials([])
            return
          }
          throw new Error(`API Error: ${response.status} - ${response.statusText}`)
        }
        
        const data = await response.json()
        console.log('📦 Materials data:', data)
        
        // Response'dan materials array'ini al (tümü, kategori filtreleme için)
        const allMaterials = Array.isArray(data) ? data : (data.materials || [])
        
        // Frontend format'ına çevir (TÜM malzemeler)
        const materialsWithCorrectFields = allMaterials.map(material => ({
          ...material,
          materialCode: material.code || material.materialCode,
          materialName: material.name || material.materialName
        }))
        
        setMaterials(materialsWithCorrectFields)
      } catch (error) {
        setMaterialsError(error.message)
        console.error('Materials fetch error:', error)
      } finally {
        setMaterialsLoading(false)
      }
    }
    
    fetchMaterials()
  }, [])

  // Tedarikçileri API'den çek
  const [suppliers, setSuppliers] = useState([])
  const [suppliersLoading, setSuppliersLoading] = useState(false)
  const [suppliersError, setSuppliersError] = useState(null)

  // Malzeme kategorilerini API'den çek
  const [materialCategories, setMaterialCategories] = useState([])
  const [categoriesLoading, setCategoriesLoading] = useState(false)
  const [categoriesError, setCategoriesError] = useState(null)

  useEffect(() => {
    const fetchSuppliers = async () => {
      try {
        setSuppliersLoading(true)
        
        const response = await fetchWithTimeout('/api/suppliers', {
          headers: withAuth()
        })
        
        console.log('📡 Suppliers API response:', response.status, response.statusText)
        
        if (!response.ok) {
          if (response.status === 401) {
            setSuppliers([])
            return
          }
          throw new Error(`API Error: ${response.status} - ${response.statusText}`)
        }
        
        const data = await response.json()
        console.log('🏢 Suppliers data:', data)
        
        // Response'dan suppliers array'ini al
        const allSuppliers = Array.isArray(data) ? data : (data.suppliers || [])
        
        // Frontend format'ına çevir
        const suppliersWithCorrectFields = allSuppliers.map(supplier => ({
          ...supplier,
          supplierCode: supplier.code || supplier.supplierCode,
          supplierName: supplier.name || supplier.companyName || supplier.supplierName
        }))
        
        setSuppliers(suppliersWithCorrectFields)
      } catch (error) {
        setSuppliersError(error.message)
        console.error('Suppliers fetch error:', error)
      } finally {
        setSuppliersLoading(false)
      }
    }
    
    fetchSuppliers()
  }, [])

  // Malzeme kategorilerini API'den çek
  useEffect(() => {
    const fetchCategories = async () => {
      try {
        setCategoriesLoading(true)
        
        const response = await fetchWithTimeout('/api/categories', {
          headers: withAuth()
        })
        
        console.log('📡 Categories API response:', response.status, response.statusText)
        
        if (!response.ok) {
          throw new Error(`API Error: ${response.status} - ${response.statusText}`)
        }
        
        const data = await response.json()
        console.log('🏷️ Categories data:', data)
        
        // Response'dan categories array'ini al
        const allCategories = Array.isArray(data) ? data : (data.categories || [])
        
        // Frontend format'ına çevir
        const categoriesWithCorrectFields = allCategories.map(category => ({
          ...category,
          categoryId: category.id || category.categoryId,
          categoryName: category.name || category.categoryName
        }))
        
        setMaterialCategories(categoriesWithCorrectFields)
      } catch (error) {
        setCategoriesError(error.message)
        console.error('Categories fetch error:', error)
      } finally {
        setCategoriesLoading(false)
      }
    }
    
    fetchCategories()
  }, [])
  
  // Orders hooks - Backend API kullanacağız
  const [orders, setOrders] = useState([])
  const [ordersLoading, setOrdersLoading] = useState(true)
  const [ordersError, setOrdersError] = useState(null)
  const [deliveryStatuses, setDeliveryStatuses] = useState({})
  const [deliveryLoading, setDeliveryLoading] = useState(false)
  const [materialNameMap, setMaterialNameMap] = useState({})
  
  // Orders API çağrısı - Basit test
  useEffect(() => {
    console.log('⚡️ Orders useEffect triggered!')
    
    const fetchOrders = async () => {
      try {
        console.log('🚀 Starting orders fetch... (REAL-TIME MODE)')
        setOrdersLoading(true)
        setOrdersError(null)
        
        // ✅ CACHE BUSTING: İlk load'da bile timestamp ekle
        const cacheBuster = Date.now()
        const url = `/api/orders?t=${cacheBuster}`
        console.log('🔥 INITIAL LOAD CACHE BUSTING URL:', url)
        
        const response = await fetchJsonWith401Retry(url, { 
          headers: withAuth({ 
            'Content-Type': 'application/json',
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0'
          }) 
        })
        console.log('� Response status:', response.status)
        console.log('📡 Response ok:', response.ok)
        console.log('📡 Response headers:', Object.fromEntries(response.headers.entries()))
        
        if (!response.ok) {
          const errorText = await response.text()
          console.error('❌ Error response:', errorText)
          throw new Error(`Orders API Error: ${response.status} - ${errorText}`)
        }
        
        const data = await response.json()
        console.log('� Full response data:', data)
        console.log('� Orders array:', data.orders)
        console.log('� Orders count:', data.orders?.length || 0)
        
        setOrders(data.orders || [])
        console.log('✅ Orders state updated')
        
      } catch (error) {
        console.error('❌ Orders fetch error:', error)
        setOrdersError(error.message)
      } finally {
        setOrdersLoading(false)
        console.log('🏁 Orders fetch completed')
      }
    }
    
    fetchOrders()
  }, [])

  // Load material name map to ensure latest names reflect in order items
  useEffect(() => {
    let cancelled = false
    const buildMap = async () => {
      try {
        const list = await materialsService.getMaterials()
        if (cancelled) return
        const map = Object.create(null)
        for (const m of list) {
          if (m.code) map[m.code] = m.name || m.materialName || m.code
          if (m.id) map[m.id] = m.name || m.materialName || m.id
        }
        setMaterialNameMap(map)
      } catch (e) {
        // no-op
      }
    }
    buildMap()
    const onMaterialUpdated = () => buildMap()
    if (typeof window !== 'undefined') {
      window.addEventListener('materialUpdated', onMaterialUpdated)
    }
    return () => {
      cancelled = true
      if (typeof window !== 'undefined') {
        window.removeEventListener('materialUpdated', onMaterialUpdated)
      }
    }
  }, [])

  // ✅ SMART FOCUS REFRESH: Tab/pencere focus olduğunda refresh 
  useEffect(() => {
    const handleFocus = async () => {
      console.log('🔄 SMART REFRESH: Window focused - refreshing orders...')
      await refreshOrders()
    }
    
    const handleVisibilityChange = async () => {
      if (!document.hidden) {
        console.log('🔄 SMART REFRESH: Tab became visible - refreshing orders...')
        await refreshOrders()
      }
    }
    
    if (typeof window !== 'undefined') {
      window.addEventListener('focus', handleFocus)
      document.addEventListener('visibilitychange', handleVisibilityChange)
    }
    
    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('focus', handleFocus)
        document.removeEventListener('visibilitychange', handleVisibilityChange)
      }
    }
  }, [])
  
  // Test: orders state'i değiştiğinde log
  useEffect(() => {
    console.log('🔥 ORDERS STATE CHANGED:', {
      ordersLength: orders.length,
      ordersLoading,
      ordersError,
      firstOrder: orders[0]
    })
  }, [orders, ordersLoading, ordersError])
  const refreshOrders = async () => {
    console.log('🔄 Refreshing orders... (REAL-TIME MODE)')
    try {
      setOrdersLoading(true)
      setOrdersError(null)
      
      // ✅ CACHE BUSTING: Timestamp ekleyerek browser cache'i bypass et
      const cacheBuster = Date.now()
      const url = `/api/orders?t=${cacheBuster}`
      console.log('🔥 CACHE BUSTING URL:', url)
      
      const response = await fetchJsonWith401Retry(url, { 
        headers: withAuth({ 
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        }) 
      })
      
      if (!response.ok) {
        throw new Error(`API Error: ${response.status}`)
      }
      
      const data = await response.json()
      setOrders(data.orders || [])
      console.log('✅ Orders refreshed')
    } catch (error) {
      console.error('❌ Orders refresh error:', error)
      setOrdersError(error.message)
    } finally {
      setOrdersLoading(false)
    }
  }
  
  const loadDeliveryStatuses = async () => {
    console.log('🚚 Loading delivery statuses...')
    // Load delivery statuses from API
  }

  // Materials Debug
  console.log('🔍 Materials API Debug:', {
    totalMaterials: materials.length,
    materialsLoading,
    materialsError,
    sampleMaterial: materials[0],
    allStatuses: [...new Set(materials.map(m => m.status))]
  });

  // Debug: State'leri logla
  useEffect(() => {
    console.log('🔍 Delivery state update:', {
      deliveryStatuses,
      deliveryLoading,
      statusCount: Object.keys(deliveryStatuses).length
    })
  }, [deliveryStatuses, deliveryLoading])

  // Debug: Orders state'ini logla
  useEffect(() => {
    console.log('📋 Orders state update:', {
      orders: orders.length,
      ordersLoading,
      ordersError,
      firstOrder: orders[0]?.id
    })
  }, [orders, ordersLoading, ordersError])

  // Aktif malzemeler - malzeme tipi filtresi için sadece aktif olanlar
  const activeMaterials = materials.filter(material => material.status === 'Aktif')
  
  console.log('🔍 Active Materials debug:', {
    totalActiveMaterials: activeMaterials.length,
    totalAllMaterials: materials.length,
    materialsLoading,
    sampleMaterial: activeMaterials[0],
    allCodes: activeMaterials.map(m => m.code).slice(0, 5) // İlk 5 code'u göster
  })

  // Teslimat durumlarını yükle - sadece bir kere
  useEffect(() => {
    if (orders.length > 0) {
      loadDeliveryStatuses()
    }
  }, [orders.length]) // loadDeliveryStatuses'u kaldırdık

  // Dropdown close handler like in MaterialsFilters
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (!event.target.closest('.multi-select-container')) {
        document.querySelectorAll('.multi-select-dropdown').forEach(dropdown => {
          dropdown.style.display = 'none';
        });
      }
    };

    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  // ORDER-LEVEL: "Teslim Edildi" removed - use item-level delivery for lot tracking
  const ORDER_STATUS_OPTIONS = ['Onay Bekliyor', 'Onaylandı', 'Yolda', 'İptal Edildi']
  // ITEM-LEVEL: "Teslim Edildi" allowed - triggers lot tracking modal
  const ITEM_STATUS_OPTIONS = ['Onay Bekliyor', 'Onaylandı', 'Yolda', 'Teslim Edildi', 'İptal Edildi']
  const [updatingItemIds, setUpdatingItemIds] = useState([])
  const [itemStatusUpdates, setItemStatusUpdates] = useState({}) // Optimistic updates for item statuses

  // ✅ SMART FILTER CHANGE: Critical filtreler değiştiğinde refresh tetikle
  const handleFilterChange = async (key, value) => {
    console.log('🔍 Order Filter değişti:', key, '=', value);
    setFilters(prev => ({ ...prev, [key]: value }));
    
    // Critical filter değişikliklerinde fresh data çek
    const criticalFilters = ['orderStatus', 'itemStatus', 'dateRange']
    if (criticalFilters.includes(key)) {
      console.log(`🔄 SMART REFRESH: Critical filter '${key}' changed - refreshing orders...`)
      await refreshOrders()
    }
  }

  // Check if filters are active
  const hasActiveFilters = () => {
    const hasPriceRange = !!(filters.priceRange.min || filters.priceRange.max);
    const hasCustomDateRange = !!(filters.customDateRange?.startDate || filters.customDateRange?.endDate);
    const hasCustomDeliveryRange = !!(filters.customDeliveryDateRange?.startDate || filters.customDeliveryDateRange?.endDate);
    return !!(
      filters.search || 
      filters.orderStatus?.length > 0 || 
      filters.itemStatus?.length > 0 || 
      filters.dateRange?.length > 0 || 
      hasCustomDateRange ||
      filters.deliveryStatus?.length > 0 || 
      hasCustomDeliveryRange ||
      filters.materialType?.length > 0 || 
      filters.supplierType?.length > 0 || 
      filters.materialCategory || 
      hasPriceRange
    );
  }

  // Apply filters to orders
  const applyFilters = (orders, materials) => {
    if (!orders) return [];

    return orders.filter(order => {
      // Search filter
      if (filters.search) {
        const searchLower = filters.search.toLowerCase();
        const matches = 
          (order.orderCode || order.id).toLowerCase().includes(searchLower) ||
          order.supplierName?.toLowerCase().includes(searchLower) ||
          order.supplierId?.toLowerCase().includes(searchLower);
        
        if (!matches) return false;
      }

      // Status filter
      if (filters.orderStatus?.length > 0) {
        if (!filters.orderStatus.includes(order.orderStatus)) {
          return false;
        }
      }

      // Item status filter
      if (filters.itemStatus?.length > 0) {
        const orderItems = Array.isArray(order.items) ? order.items : [];
        const hasMatchingItem = orderItems.some(item => filters.itemStatus.includes(item.itemStatus));
        if (!hasMatchingItem) return false;
      }

      // Date range filter
      if (filters.dateRange?.length > 0 && order.orderDate) {
        const orderDate = order.orderDate instanceof Date ? order.orderDate : new Date(order.orderDate);
        const now = new Date();
        
        const matchesAnyRange = filters.dateRange.some(range => {
          switch (range) {
            case 'bugün':
              return orderDate.toDateString() === now.toDateString();
            case 'bu-hafta':
              const weekStart = new Date(now);
              weekStart.setDate(weekStart.getDate() - weekStart.getDay());
              return orderDate >= weekStart;
            case 'bu-ay':
              return orderDate.getMonth() === now.getMonth() && orderDate.getFullYear() === now.getFullYear();
            case 'son-3-ay':
              const threeMonthsAgo = new Date();
              threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
              return orderDate >= threeMonthsAgo;
            default:
              return false;
          }
        });
        
        if (!matchesAnyRange) return false;
      }

      // Custom date range filter
      if (filters.customDateRange?.startDate || filters.customDateRange?.endDate) {
        if (!order.orderDate) return false;
        
        const orderDate = order.orderDate instanceof Date ? order.orderDate : new Date(order.orderDate);
        
        if (filters.customDateRange.startDate) {
          const startDate = new Date(filters.customDateRange.startDate);
          if (orderDate < startDate) return false;
        }
        
        if (filters.customDateRange.endDate) {
          const endDate = new Date(filters.customDateRange.endDate);
          endDate.setHours(23, 59, 59, 999); // End of day
          if (orderDate > endDate) return false;
        }
      }

      // Price range filter
      if (filters.priceRange.min || filters.priceRange.max) {
        const min = parseFloat(filters.priceRange.min) || 0;
        const max = parseFloat(filters.priceRange.max) || Infinity;
        
        if (filters.priceRange.mode === 'order') {
          // Order total'a göre filtrele
          const orderTotal = Array.isArray(order.items) ? 
            order.items.reduce((sum, item) => sum + (item.quantity || 0) * (item.unitPrice || 0), 0) : 0;
          
          if (orderTotal < min || orderTotal > max) return false;
          
        } else if (filters.priceRange.mode === 'item') {
          // En az bir item'ın fiyatı aralıkta olmalı
          const orderItems = Array.isArray(order.items) ? order.items : [];
          const hasMatchingItem = orderItems.some(item => {
            const itemTotal = (item.quantity || 0) * (item.unitPrice || 0);
            return itemTotal >= min && itemTotal <= max;
          });
          
          if (!hasMatchingItem) return false;
        }
      }

      // Delivery status filter
      if (filters.deliveryStatus?.length > 0) {
        const deliveryStatus = deliveryStatuses[order.id];
        if (!deliveryStatus || !filters.deliveryStatus.includes(deliveryStatus.status)) {
          return false;
        }
      }

      // Custom delivery date range filter
      if (filters.customDeliveryDateRange?.startDate || filters.customDeliveryDateRange?.endDate) {
        const deliveryStatus = deliveryStatuses[order.id];
        if (!deliveryStatus || !deliveryStatus.expectedDate) return false;
        
        const deliveryDate = deliveryStatus.expectedDate instanceof Date 
          ? deliveryStatus.expectedDate 
          : new Date(deliveryStatus.expectedDate);
        
        if (filters.customDeliveryDateRange.startDate) {
          const startDate = new Date(filters.customDeliveryDateRange.startDate);
          if (deliveryDate < startDate) return false;
        }
        
        if (filters.customDeliveryDateRange.endDate) {
          const endDate = new Date(filters.customDeliveryDateRange.endDate);
          endDate.setHours(23, 59, 59, 999); // End of day
          if (deliveryDate > endDate) return false;
        }
      }

      // Material type filter
      if (filters.materialType?.length > 0) {
        const orderItems = Array.isArray(order.items) ? order.items : [];
        const hasMatchingMaterial = orderItems.some(item => 
          filters.materialType.includes(item.materialCode) || 
          filters.materialType.includes(item.materialName)
        );
        if (!hasMatchingMaterial) return false;
      }

      // Supplier type filter
      if (filters.supplierType?.length > 0) {
        const hasMatchingSupplier = 
          filters.supplierType.includes(order.supplierCode) ||
          filters.supplierType.includes(order.supplierId);
        if (!hasMatchingSupplier) return false;
      }

      // Material category filter
      if (filters.materialCategory) {
        const orderItems = Array.isArray(order.items) ? order.items : [];
        const hasMatchingCategory = orderItems.some(item => {
          // Önce materialCode ile materials array'inde ilgili malzemeyi bul
          const material = materials.find(m => 
            (m.code === item.materialCode) || 
            (m.materialCode === item.materialCode) ||
            (m.code === item.materialName) ||
            (m.name === item.materialCode)
          );
          
          return material && material.category === filters.materialCategory;
        });
        if (!hasMatchingCategory) return false;
      }

      return true;
    });
  }

  const filteredOrders = applyFilters(orders, materials);

  // Basit order status based filtering - items'a bakmadan
  const pendingOrdersView = filteredOrders.filter(order => order.orderStatus !== 'Teslim Edildi');
  const completedOrdersView = filteredOrders.filter(order => order.orderStatus === 'Teslim Edildi');
  const allOrdersView = filteredOrders;

  const currentOrders = activeOrdersTab === 'pending' 
    ? pendingOrdersView 
    : activeOrdersTab === 'completed' 
      ? completedOrdersView 
      : allOrdersView;
  const currentLoading = ordersLoading;

  console.log('📊 Orders debug (simplified):', {
    totalOrders: orders.length,
    pendingOrders: orders.filter(o => o.orderStatus !== 'Teslim Edildi').length,
    completedOrders: orders.filter(o => o.orderStatus === 'Teslim Edildi').length,
    activeTab: activeOrdersTab,
    ordersLoading,
    sampleOrder: orders[0] ? {
      id: orders[0].id,
      orderStatus: orders[0].order_status,
      hasItems: Array.isArray(orders[0].items),
      itemsCount: orders[0].items?.length || 0
    } : 'No orders'
  });

  console.log('🎯 TABLE DEBUG - Passing to OrdersTable:', {
    ordersCount: orders.length,
    loading: currentLoading,
    variant: activeOrdersTab
  });

  const serializeItemsForOrder = (list = []) => (
    list.map(item => {
      const fallbackLineId = item.lineId || `${item.materialCode || item.itemCode || item.id}-${String(item.itemSequence || 1).padStart(2, '0')}`
      return {
        id: item.id,
        lineId: fallbackLineId,
        itemCode: item.itemCode,
        itemSequence: item.itemSequence,
        materialCode: item.materialCode,
        materialName: item.materialName,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        itemStatus: item.itemStatus,
        expectedDeliveryDate: item.expectedDeliveryDate instanceof Date
          ? item.expectedDeliveryDate
          : (item.expectedDeliveryDate || null),
        actualDeliveryDate: item.actualDeliveryDate instanceof Date
          ? item.actualDeliveryDate
          : (item.actualDeliveryDate || null)
      }
    })
  )

  // Handle order click - Test için basitleştirildi
  const handleOrderClick = async (order) => {
    console.log('�🔥🔥 Sipariş tıklandı!!! Order:', order);
    console.log('🔥🔥🔥 Setting selectedOrder...');
    
    // Önce test için basit modal açalım
    setSelectedOrder(order)
    setSelectedOrderError(null)
    setSelectedOrderLoading(false)
    setUpdatingItemIds([])
    
    console.log('🔥🔥🔥 selectedOrder set edildi!');
  }

  const handleCloseOrderDetail = () => {
    setSelectedOrder(null)
    setSelectedOrderError(null)
    setSelectedOrderLoading(false)
    setUpdatingItemIds([])
  }

  // Handle order status update
  const handleUpdateOrderStatus = async (orderId, newStatus) => {
    console.log('🔄 HANDLE UPDATE ORDER STATUS CALLED:')
    console.log('  - Order ID:', orderId)
    console.log('  - New Status:', newStatus)
    console.log('  - Type of orderId:', typeof orderId)
    console.log('  - Type of newStatus:', typeof newStatus)
    
    if (!newStatus) {
      console.log('❌ No newStatus provided - returning early')
      return;
    }
    
    if (!orderId) {
      console.log('❌ No orderId provided - returning early')
      return;
    }
    
    // PREVENT bulk "Teslim Edildi" - must use item-level delivery for lot tracking
    if (newStatus === 'Teslim Edildi') {
      console.log('❌ BLOCKED: Order-level "Teslim Edildi" not allowed. Use item-level delivery for lot tracking.')
      showToast('⚠️ Sipariş seviyesinden toplu teslim edilemez! Lot takibi için her ürünü ayrı ayrı teslim edin.', 'warning')
      return;
    }
    
    console.log('🔄 Proceeding with order status update...')
    
    try {
      // Reuse existing item-level status change logic for each item
      console.log('🔄 Bulk item status propagation via handleItemStatusChange for order:', orderId, '→', newStatus)

      // Determine items source
      let itemsSource = []
      if (selectedOrder && selectedOrder.id === orderId && Array.isArray(selectedOrder.items)) {
        itemsSource = selectedOrder.items
      } else {
        const orderInList = (orders || []).find(o => o.id === orderId)
        if (orderInList && Array.isArray(orderInList.items)) {
          itemsSource = orderInList.items
        } else {
          try {
            const resp = await fetchWithTimeout(`/api/orders/${orderId}`, { headers: withAuth() })
            if (resp.ok) {
              const data = await resp.json()
              const ord = data.order || data
              itemsSource = Array.isArray(ord.items) ? ord.items : []
            }
          } catch (e) {
            console.warn('⚠️ Failed to fetch order details for bulk item status change:', e?.message)
          }
        }
      }

      // Apply item-level status change for each item
      for (const it of (itemsSource || [])) {
        // Skip if already at desired status
        if ((it.itemStatus || 'Onay Bekliyor') === newStatus) continue
        try {
          await handleItemStatusChange(orderId, it, newStatus)
        } catch (e) {
          console.warn('⚠️ Item status change failed for', it.itemCode || it.id || it.lineId, e?.message)
        }
      }

      // Finalize order status to keep consistency (backend may already align it)
      console.log('📡 Finalizing order status to', newStatus, 'after item updates')
      const updatedOrder = await updateOrder(orderId, { orderStatus: newStatus })
      console.log('✅ updateOrder API call completed, result:', updatedOrder)

      // Update local state
      // 1) Optimistically update orders list to keep UI in sync immediately
      setOrders(prev => prev.map(o => {
        if (o.id !== orderId) return o;
        const baseItems = Array.isArray(o.items) ? o.items : [];
        const propagatedItems = baseItems.length > 0
          ? baseItems.map(it => ({
              ...it,
              itemStatus: newStatus,
              actualDeliveryDate: newStatus === 'Teslim Edildi' ? (it.actualDeliveryDate || new Date()) : null
            }))
          : baseItems;
        return { ...o, orderStatus: newStatus, items: propagatedItems };
      }))

      if (selectedOrder && selectedOrder.id === orderId) {
        setSelectedOrder(prev => {
          if (!prev) return prev;
          const baseItems = Array.isArray((updatedOrder && updatedOrder.items) || prev.items) 
            ? (updatedOrder.items || prev.items) 
            : [];
          const propagatedItems = baseItems.length > 0
            ? baseItems.map(it => ({
                ...it,
                itemStatus: newStatus,
                actualDeliveryDate: newStatus === 'Teslim Edildi' ? (it.actualDeliveryDate || new Date()) : null
              }))
            : baseItems;
          return { ...prev, orderStatus: newStatus, items: propagatedItems };
        })
      }
      
      await refreshOrders();

      if (selectedOrder && selectedOrder.id === orderId) {
        setSelectedOrderLoading(true);
        try {
          const response = await fetchWithTimeout(`/api/orders/${orderId}`, {
            headers: withAuth()
          })
          
          if (response.ok) {
            const data = await response.json()
            const refreshed = data.order || data
            setSelectedOrder(refreshed);
          }
        } catch (detailError) {
          console.error('❌ Detay güncellenirken hata:', detailError);
        } finally {
          setSelectedOrderLoading(false);
        }
      }

      console.log(`✅ Order ${orderId} status updated to ${newStatus}`);
    } catch (error) {
      console.error('❌ Error updating order status:', error);
      console.error('❌ Error details:', {
        orderId,
        newStatus,
        message: error.message,
        stack: error.stack
      });
      // Rollback optimistic update if needed
      setOrders(prev => prev.map(o => {
        if (o.id === orderId && selectedOrder && selectedOrder.id === orderId) {
          return { ...o, orderStatus: selectedOrder.orderStatus };
        }
        return o;
      }));
      
      showToast(`Sipariş durumu güncellenemedi: ${error.message}`, 'error');
    }
  }

  const handleItemStatusChange = async (orderId, item, newStatus) => {
    console.log('🚀🚀🚀 HANDLE ITEM STATUS CHANGE FUNCTION CALLED!');
    console.log('🔍 Parameters received:', {
      orderId: orderId,
      item: item,
      newStatus: newStatus,
      itemCurrentStatus: item?.itemStatus
    });
    
    if (!newStatus || newStatus === item.itemStatus) {
      console.log('❌ Early return: no status change needed');
      return
    }
    
    // 🎯 LOT TRACKING: Open delivery modal for "Teslim Edildi" status
    if (newStatus === 'Teslim Edildi') {
      console.log('📦 Opening delivery modal for lot tracking');
      setDeliveryModalItem({ orderId, item });
      setDeliveryFormData({
        actualDeliveryDate: getLocalDateString(),
        supplierLotCode: '',
        manufacturingDate: '',
        expiryDate: '',
        notes: ''
      });
      setDeliveryModalOpen(true);
      return;
    }

    // Item identifier - id, itemCode, lineId veya index-based
    const itemId = item.id || item.itemCode || item.lineId || `item-${item.materialCode || 'unknown'}`
    const itemKey = `${orderId}-${itemId}` // For optimistic updates
    
    // ✅ OPTIMISTIC UPDATE: Hemen UI'da değişikliği göster
    setItemStatusUpdates(prev => ({
      ...prev,
      [itemKey]: newStatus
    }))
    console.log('🎨 Optimistic update applied:', itemKey, '->', newStatus);
    
    console.log('🔍 Item status değişiyor:', {
      orderId,
      itemId: itemId,
      oldStatus: item.itemStatus,
      newStatus: newStatus,
      materialCode: item.materialCode,
      quantity: item.quantity,
      fullItem: item
    });

    console.log('🔍 DEBUG: API çağrısı detayları:', {
      url: `/api/orders/${orderId}/items/${itemId}`,
      method: 'PUT',
      body: { itemStatus: newStatus },
      fullUrl: window.location.origin + `/api/orders/${orderId}/items/${itemId}`,
      itemDetails: {
        itemId: itemId,
        itemCode: item.itemCode,
        lineId: item.lineId,
        id: item.id,
        materialCode: item.materialCode
      }
    });

    setUpdatingItemIds(prev => [...new Set([...prev, itemId])])

    try {
      // Backend API ile item status güncelle
      console.log('🚀 DEBUG: Making API call...')
      const response = await fetchWithTimeout(`/api/orders/${orderId}/items/${itemId}`, {
        method: 'PUT',
        headers: {
          ...withAuth(),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ itemStatus: newStatus })
      })
      
      console.log('📡 DEBUG: API response:', response.status, response.statusText)
      
      if (!response.ok) {
        const errorText = await response.text()
        console.error('❌ DEBUG: API error response:', errorText)
        console.error('❌ DEBUG: Full response details:', {
          status: response.status,
          statusText: response.statusText,
          headers: Object.fromEntries(response.headers.entries()),
          url: response.url
        })
        throw new Error(`API Error: ${response.status} - ${errorText}`)
      }
      
      const result = await response.json()
      console.log('✅ DEBUG: API success:', result)
      console.log('✅ DEBUG: Full API response analysis:', {
        item: result.item,
        orderStatus: result.orderStatus,
        orderStatusChanged: result.orderStatusChanged,
        message: result.message
      })

      // ✅ Backend'den dönen order status güncellemesi
      const updatedItem = result.item
      const backendOrderStatus = result.orderStatus
      const orderStatusChanged = result.orderStatusChanged
      
      console.log('🔍 DEBUG: Backend response analysis:', {
        orderStatusChanged,
        backendOrderStatus,
        currentOrderStatus: selectedOrder?.order_status,
        apiSuccess: true
      })

      // ✅ KRITIK: Stok artışını sadece "Teslim Edildi" status değişikliğinde yap
      // Backend'den gelen updatedItem.itemStatus ile kontrol et (artık camelCase)
      const isBecomingDelivered = updatedItem.itemStatus === 'Teslim Edildi' && newStatus === 'Teslim Edildi';
      
      console.log('🔍 DEBUG: Stock update check:', {
        updatedItemStatus: updatedItem.itemStatus,
        requestedStatus: newStatus,
        isBecomingDelivered,
        materialCode: updatedItem.materialCode,
        quantity: updatedItem.quantity
      });

      // If item is delivered, update material stock via backend API
      if (isBecomingDelivered) {
        console.log('🚀 DEBUG: Starting stock update for delivered item:', {
          materialCode: updatedItem.materialCode,
          quantity: updatedItem.quantity,
          orderId: orderId,
          itemId: updatedItem.id
        });
        
        try {
          console.log('📦 DEBUG: Making API call to:', `/api/materials/${updatedItem.materialCode}/stock`);
          
          const response = await fetch(`/api/materials/${updatedItem.materialCode}/stock`, {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${localStorage.getItem('bp_admin_token') || ''}`
            },
            body: JSON.stringify({
              quantity: updatedItem.quantity,
              operation: 'add',
              orderId: orderId,
              orderCode: updatedItem.orderCode, // ✅ Order code eklendi
              itemId: updatedItem.id,
              movementType: 'order_delivery',
              notes: `Sipariş kalemi teslimi: ${updatedItem.materialName} (${updatedItem.quantity} ${updatedItem.unit || 'adet'})`,
              reason: `Order delivery: ${updatedItem.orderCode}`
            })
          });

          console.log('📡 DEBUG: API response status:', response.status);

          if (!response.ok) {
            const errorData = await response.json();
            console.error('❌ DEBUG: API error response:', errorData);
            throw new Error(errorData.error || 'Stok güncellenemedi');
          }

          const result = await response.json();
          console.log('✅ DEBUG: API success response:', result);
          console.log(`✅ Stock updated via API for ${updatedItem.materialCode}: ${result.previousStock} → ${result.newStock}`);
          
          // Dispatch unified global stock update events
          // Primary: materialStockUpdated (used by useMaterials for instant local + force refresh)
          window.dispatchEvent(new CustomEvent('materialStockUpdated', {
            detail: {
              materialCode: updatedItem.materialCode,
              newStock: result.newStock,
              quantity: updatedItem.quantity,
              operation: 'add',
              context: 'orders-tab-item-delivery'
            }
          }));

          // Backward compatibility: stockUpdated (kept for existing listeners)
          window.dispatchEvent(new CustomEvent('stockUpdated', {
            detail: {
              materialCode: updatedItem.materialCode,
              previousStock: result.previousStock,
              newStock: result.newStock
            }
          }));
          
        } catch (stockError) {
          console.error('❌ DEBUG: Stock update error:', stockError);
        }
      }

      console.log('🔄 DEBUG: Starting order refresh...')
      
      // ✅ Backend'den order status değişikliği varsa local state'i güncelle
      if (orderStatusChanged && backendOrderStatus) {
        console.log(`🔄 SMART UPDATE: Backend order status changed to ${backendOrderStatus}`)
        
        // Orders listesini güncelle
        setOrders(prev => prev.map(o => 
          o.id === orderId ? { ...o, orderStatus: backendOrderStatus } : o
        ))
        
        // Selected order'ı da güncelle
        if (selectedOrder && selectedOrder.id === orderId) {
          setSelectedOrder(prev => prev ? { ...prev, orderStatus: backendOrderStatus } : prev)
        }
        
        console.log(`✅ Local state updated: Order ${orderId} status → ${backendOrderStatus}`)
      }
      
      await refreshOrders()
      console.log('✅ DEBUG: refreshOrders completed')

      // ✅ Sadece selectedOrder varsa ve aynı ID ise refresh et
      if (selectedOrder && selectedOrder.id === orderId) {
        console.log('� DEBUG: Updating selected order details...')
        setSelectedOrderLoading(true)
        try {
          const orderResponse = await fetchWithTimeout(`/api/orders/${orderId}?t=${Date.now()}`, {
            headers: withAuth()
          })
          
          if (orderResponse.ok) {
            const orderData = await orderResponse.json()
            const refreshed = orderData.order || orderData
            console.log('🔄 DEBUG: Order refreshed with status:', refreshed.orderStatus)
            setSelectedOrder(refreshed)
            
            // ✅ Clear optimistic update ONLY after selectedOrder is successfully updated
            setItemStatusUpdates(prev => {
              const updated = { ...prev }
              delete updated[itemKey]
              return updated
            })
          }
        } catch (detailError) {
          console.error('❌ Detay güncellenirken hata:', detailError)
        } finally {
          setSelectedOrderLoading(false)
        }
      } else {
        // ✅ If no selectedOrder to refresh, clear optimistic update immediately
        setItemStatusUpdates(prev => {
          const updated = { ...prev }
          delete updated[itemKey]
          return updated
        })
      }
    } catch (error) {
      console.error('❌ Error updating item status:', error)
      // ✅ ROLLBACK optimistic update on error
      setItemStatusUpdates(prev => {
        const updated = { ...prev }
        delete updated[itemKey]
        return updated
      })
      showToast(`Item status güncellenemedi: ${error.message}`, 'error')
    } finally {
      setUpdatingItemIds(prev => prev.filter(id => id !== itemId))
    }
  }
  
  // 🎯 LOT TRACKING: Handle delivery with lot data
  const handleDeliverItem = async () => {
    if (!deliveryModalItem) return;
    
    const { orderId, item } = deliveryModalItem;
    const itemId = item.id || item.itemCode || item.lineId || `item-${item.materialCode || 'unknown'}`;
    
    // Validate form data
    const today = getLocalDateString();
    
    if (deliveryFormData.manufacturingDate && deliveryFormData.manufacturingDate > today) {
      showToast('Üretim tarihi bugünden ileri olamaz', 'warning')
      return;
    }
    
    if (deliveryFormData.expiryDate && deliveryFormData.expiryDate <= today) {
      showToast('Son kullanma tarihi bugünden sonra olmalıdır', 'warning')
      return;
    }
    
    if (deliveryFormData.manufacturingDate && deliveryFormData.expiryDate && 
        deliveryFormData.expiryDate <= deliveryFormData.manufacturingDate) {
      showToast('Son kullanma tarihi üretim tarihinden sonra olmalıdır', 'warning')
      return;
    }
    
    setDeliveryLoading(true);
    
    try {
      console.log('📦 Delivering item with lot tracking:', {
        orderId,
        itemId,
        deliveryData: deliveryFormData
      });
      
      // Call the delivery endpoint with lot tracking data
      const result = await API.deliverOrderItem(orderId, itemId, {
        deliveryData: {
          actualDeliveryDate: deliveryFormData.actualDeliveryDate,
          supplierLotCode: deliveryFormData.supplierLotCode || null,
          manufacturingDate: deliveryFormData.manufacturingDate || null,
          expiryDate: deliveryFormData.expiryDate || null,
          notes: deliveryFormData.notes || null
        }
      });
      
      console.log('✅ Item delivered successfully:', result);
      
      // Show success message with lot number
      if (result.lotNumber) {
        showToast(`✅ Teslimat kaydedildi - Lot Numarası: ${result.lotNumber}`, 'success')
      } else {
        showToast('✅ Teslimat kaydedildi', 'success')
      }
      
      // Close modal
      setDeliveryModalOpen(false);
      setDeliveryModalItem(null);
      
      // Refresh orders
      await refreshOrders();
      
      // Refresh selected order if open
      if (selectedOrder && selectedOrder.id === orderId) {
        setSelectedOrderLoading(true);
        try {
          const orderResponse = await fetchWithTimeout(`/api/orders/${orderId}?t=${Date.now()}`, {
            headers: withAuth()
          });
          
          if (orderResponse.ok) {
            const orderData = await orderResponse.json();
            const refreshed = orderData.order || orderData;
            setSelectedOrder(refreshed);
          }
        } catch (detailError) {
          console.error('❌ Error refreshing order details:', detailError);
        } finally {
          setSelectedOrderLoading(false);
        }
      }
      
    } catch (error) {
      console.error('❌ Error delivering item:', error);
      showToast(`Teslimat kaydedilemedi: ${error.message}`, 'error')
    } finally {
      setDeliveryLoading(false);
    }
  }

  return (
    <div className="orders-tab-content">
      {/* MES Filter Bar: Dashboard + Actions + Filters */}
      <div className="mes-filter-bar">
        {/* Dashboard - Inline Single Line - hide when filters expanded */}
        {!isFiltersExpanded && (
          <div className="materials-dashboard-container">
            <section className="materials-dashboard is-inline">
              <div className="stat">
                <span className="stat-label">Açık Siparişler</span>
                <span className="stat-value">{statsLoading ? '...' : stats.pendingOrders}</span>
              </div>
              <div className="divider"></div>
              <div className="stat">
                <span className="stat-label">Bu Ay Teslim</span>
                <span className="stat-value">{statsLoading ? '...' : stats.thisMonthOrders}</span>
              </div>
              <div className="divider"></div>
              <div className="stat">
                <span className="stat-label">Kısmi Teslimat</span>
                <span className="stat-value warning">{statsLoading ? '...' : stats.partialOrders}</span>
              </div>
            </section>
          </div>
        )}

        {/* Action Buttons - hide when filters expanded */}
        {!isFiltersExpanded && (
          <>
            <button
              type="button"
              className="mes-primary-action is-compact"
              onClick={() => {
                console.log('🔥🔥🔥 Yeni Sipariş butonu tıklandı!');
                setIsDeliveredRecordMode(false);
                setIsAddOrderModalOpen(true);
                console.log('🔥🔥🔥 Modal açılması için state güncellendi!');
              }}
              disabled={actionLoading}
            >
              <Plus size={14} />
              <span>Yeni Sipariş</span>
            </button>
            <button
              type="button"
              className="mes-filter-button is-compact"
              title="Doğrudan sipariş kaydı oluştur"
              onClick={() => {
                console.log('⚡ Gerçekleşmiş Sipariş butonu tıklandı!');
            setIsDeliveredRecordMode(true);
            setIsAddOrderModalOpen(true);
          }}
          disabled={actionLoading}
        >
          <Zap size={14} />
          <span>Doğrudan Ekle</span>
        </button>
        <button
          type="button"
          className="mes-filter-button is-compact"
          title="Siparişleri dışa aktar"
          onClick={handleExportCSV}
        >
          <Download size={14} />
          <span>CSV</span>
        </button>
          </>
        )}

        {/* Filters Component */}
        <OrdersFilters 
          filters={filters}
          onFilterChange={handleFilterChange}
          hasActiveFilters={hasActiveFilters()}
          isExpanded={isFiltersExpanded}
          onToggleExpanded={setIsFiltersExpanded}
          activeMaterials={activeMaterials}
          activeSuppliers={suppliers}
          materialCategories={materialCategories}
        />
      </div>

      {/* Orders Container with Side Panel */}
      <div className="orders-container">
        {/* Left Panel - Orders Table */}
        <div className="orders-table-panel">
          <OrdersTable 
            orders={currentOrders}
            loading={currentLoading}
            error={ordersError}
            variant={activeOrdersTab}
            tabCounts={{ 
              pending: pendingOrdersView.length, 
              completed: completedOrdersView.length,
              all: allOrdersView.length
            }}
            onChangeTab={handleTabChange}
            onOrderClick={handleOrderClick}
            onUpdateOrderStatus={handleUpdateOrderStatus}
            actionLoading={actionLoading}
            deliveryStatuses={deliveryStatuses}
            deliveryLoading={deliveryLoading}
            selectedOrderIds={selectedOrderIds}
            onToggleSelectOrder={handleToggleSelectOrder}
            onToggleSelectAll={handleToggleSelectAll}
            materialNameMap={materialNameMap}
            emptyMessage={
              activeOrdersTab === 'pending' 
                ? 'Bekleyen sipariş bulunamadı' 
                : activeOrdersTab === 'completed'
                  ? 'Tamamlanan sipariş bulunamadı'
                  : 'Sipariş bulunamadı'
            }
          />
        </div>

        {/* Right Panel - Order Details */}
        {selectedOrder && (
          <OrderDetailsPanel
            order={selectedOrder}
            loading={selectedOrderLoading}
            error={selectedOrderError}
            actionLoading={actionLoading}
            updatingItemIds={updatingItemIds}
            itemStatusUpdates={itemStatusUpdates}
            onClose={handleCloseOrderDetail}
            onUpdateOrderStatus={handleUpdateOrderStatus}
            onItemStatusChange={handleItemStatusChange}
          />
        )}
      </div>
      
      {/* Add Order Modal */}
      <AddOrderModal 
        isOpen={isAddOrderModalOpen}
        onClose={() => setIsAddOrderModalOpen(false)}
        deliveredRecordMode={isDeliveredRecordMode}
        onSave={async (newOrder) => {
          console.log('✅ New order created:', newOrder);
          console.log('🔄 IMMEDIATE REFRESH: Triggering aggressive refresh...');
          
          // ✅ IMMEDIATE REFRESH - Multiple attempts for real-time update
          await refreshOrders();
          
          // ✅ BACKUP REFRESH: 500ms sonra bir daha refresh (network gecikmeleri için)
          setTimeout(async () => {
            console.log('🔄 BACKUP REFRESH: Second refresh...');
            await refreshOrders();
          }, 500);
          
          // ✅ FINAL REFRESH: 1.5s sonra final refresh
          setTimeout(async () => {
            console.log('🔄 FINAL REFRESH: Third refresh...');
            await refreshOrders();
          }, 1500);
        }}
      />
      
      
      
      {/* 📦 LOT TRACKING: Delivery Modal */}
      <DeliveryModal
        open={deliveryModalOpen}
        item={deliveryModalItem}
        formData={deliveryFormData}
        onFormChange={setDeliveryFormData}
        onClose={() => setDeliveryModalOpen(false)}
        onSubmit={handleDeliverItem}
        loading={deliveryLoading}
        lotTrackingEnabled={systemSettings.lotTracking}
        getLocalDateString={getLocalDateString}
        getTomorrowDateString={getTomorrowDateString}
      />
    </div>
  )
}
