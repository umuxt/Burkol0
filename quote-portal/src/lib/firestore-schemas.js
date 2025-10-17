// Firebase Firestore Schema Definitions for Burkol Materials System
// Bu dosya tüm koleksiyonların veri yapılarını tanımlar

export const COLLECTIONS = {
  MATERIALS: 'materials',
  CATEGORIES: 'materials-categories', 
  SUPPLIER_CATEGORIES: 'suppliers-categories',
  MATERIAL_TYPES: 'material_types',
  SUPPLIERS: 'suppliers',
  AUDIT_LOGS: 'audit_logs'
};

// ================================
// MATERIALS COLLECTION SCHEMA
// ================================
export const MaterialSchema = {
  // Temel Bilgiler
  code: {
    type: 'string',
    required: true,
    unique: true,
    pattern: /^M-\d{3,}$/,
    description: 'Otomatik oluşturulan malzeme kodu (M-001 formatında)'
  },
  
  name: {
    type: 'string', 
    required: true,
    maxLength: 200,
    description: 'Malzeme adı'
  },
  
  description: {
    type: 'string',
    required: false,
    maxLength: 1000,
    description: 'Detaylı malzeme açıklaması'
  },
  
  // Kategorizasyon
  type: {
    type: 'string',
    required: true,
    enum: ['raw_material', 'wip', 'final_product'],
    description: 'Malzeme tipi'
  },
  
  category: {
    type: 'string', 
    required: true,
    description: 'Kategori referansı (categories koleksiyonundan)'
  },
  
  subcategory: {
    type: 'string',
    required: false,
    description: 'Alt kategori (opsiyonel)'
  },
  
  // Stok Bilgileri
  stock: {
    type: 'number',
    required: true,
    minimum: 0,
    description: 'Mevcut stok miktarı'
  },
  
  reserved: {
    type: 'number',
    required: true,
    default: 0,
    minimum: 0,
    description: 'Rezerve edilmiş miktar (sipariş için ayrılan)'
  },
  
  available: {
    type: 'number',
    computed: true, // stock - reserved
    description: 'Kullanılabilir stok (hesaplanmış alan)'
  },
  
  reorderPoint: {
    type: 'number',
    required: true,
    minimum: 0,
    description: 'Minimum stok seviyesi - bu seviyenin altında uyarı'
  },
  
  maxStock: {
    type: 'number',
    required: false,
    minimum: 0,
    description: 'Maksimum stok kapasitesi (opsiyonel)'
  },
  
  // Birim ve Ölçümler
  unit: {
    type: 'string',
    required: true,
    enum: ['kg', 'adet', 'm', 'm²', 'm³', 'litre', 'ton'],
    description: 'Stok birimi'
  },
  
  // Fiyat Bilgileri
  costPrice: {
    type: 'number',
    required: false,
    minimum: 0,
    description: 'Maliyet fiyatı (alış fiyatı)'
  },
  
  averageCost: {
    type: 'number',
    required: false,
    minimum: 0,
    description: 'Ortalama maliyet (FIFO/LIFO hesaplaması)'
  },
  
  currency: {
    type: 'string',
    default: 'TRY',
    enum: ['TRY', 'USD', 'EUR'],
    description: 'Para birimi'
  },
  
  // Tedarikçi Bilgileri
  primarySupplier: {
    type: 'string',
    required: false,
    description: 'Ana tedarikçi referansı'
  },
  
  suppliers: {
    type: 'array',
    items: {
      supplierId: { type: 'string' },
      supplierCode: { type: 'string' },
      cost: { type: 'number' },
      leadTime: { type: 'number' }, // Gün cinsinden
      isPreferred: { type: 'boolean' }
    },
    description: 'Tedarikçi listesi ve fiyatları'
  },
  
  // Teknik Özellikler
  specifications: {
    type: 'object',
    properties: {
      dimensions: {
        length: { type: 'number' },
        width: { type: 'number' },
        height: { type: 'number' },
        unit: { type: 'string', enum: ['mm', 'cm', 'm'] }
      },
      weight: {
        value: { type: 'number' },
        unit: { type: 'string', enum: ['gr', 'kg', 'ton'] }
      },
      material: {
        grade: { type: 'string' },
        composition: { type: 'string' }
      },
      certifications: {
        type: 'array',
        items: { type: 'string' }
      }
    },
    description: 'Teknik özellikler ve ölçümler'
  },
  
  // Lokasyon ve Depolama
  storage: {
    type: 'object',
    properties: {
      warehouse: { type: 'string', description: 'Depo adı' },
      location: { type: 'string', description: 'Raf/Konum' },
      zone: { type: 'string', description: 'Bölge' }
    },
    description: 'Depolama bilgileri'
  },
  
  // QR/Barkod
  barcode: {
    type: 'string',
    required: false,
    description: 'Barkod numarası'
  },
  
  qrCode: {
    type: 'string',
    required: false,
    description: 'QR kod verisi'
  },
  
  // Durum ve Meta Bilgiler
  status: {
    type: 'string',
    required: true,
    enum: ['Aktif', 'Kaldırıldı'],
    default: 'Aktif',
    description: 'Malzeme durumu - Aktif: Normal kullanım, Kaldırıldı: Soft delete'
  },
  
  isActive: {
    type: 'boolean',
    default: true,
    description: 'Aktif/pasif durumu'
  },
  
  tags: {
    type: 'array',
    items: { type: 'string' },
    description: 'Arama ve filtreleme için etiketler'
  },
  
  // Tarih Bilgileri
  createdAt: {
    type: 'timestamp',
    required: true,
    description: 'Oluşturulma tarihi'
  },
  
  updatedAt: {
    type: 'timestamp',
    required: true,
    description: 'Son güncelleme tarihi'
  },
  
  createdBy: {
    type: 'string',
    required: true,
    description: 'Oluşturan kullanıcı ID'
  },
  
  updatedBy: {
    type: 'string',
    required: true,
    description: 'Son güncelleyen kullanıcı ID'
  },
  
  // Son Hareket Bilgileri
  lastMovement: {
    type: 'object',
    properties: {
      type: { type: 'string', enum: ['in', 'out', 'adjustment'] },
      quantity: { type: 'number' },
      date: { type: 'timestamp' },
      reference: { type: 'string' },
      userId: { type: 'string' }
    },
    description: 'Son stok hareketi'
  },
  
  // Uyarı Ayarları
  alerts: {
    type: 'object',
    properties: {
      lowStockEnabled: { type: 'boolean', default: true },
      expiryAlert: { type: 'boolean', default: false },
      customThresholds: {
        type: 'array',
        items: {
          level: { type: 'number' },
          message: { type: 'string' }
        }
      }
    }
  }
};

// ================================
// CATEGORIES COLLECTION SCHEMA
// ================================
export const CategorySchema = {
  id: {
    type: 'string',
    required: true,
    unique: true,
    description: 'Kategori ID (slug formatında)'
  },
  
  name: {
    type: 'string',
    required: true,
    description: 'Kategori adı'
  },
  
  description: {
    type: 'string',
    required: false,
    description: 'Kategori açıklaması'
  },
  
  parentCategory: {
    type: 'string',
    required: false,
    description: 'Üst kategori referansı (hiyerarşik yapı için)'
  },
  
  icon: {
    type: 'string',
    required: false,
    description: 'Kategori ikonu'
  },
  
  color: {
    type: 'string',
    required: false,
    pattern: /^#[0-9A-F]{6}$/i,
    description: 'Kategori rengi (hex format)'
  },
  
  sortOrder: {
    type: 'number',
    default: 0,
    description: 'Sıralama düzeni'
  },
  
  isActive: {
    type: 'boolean',
    default: true,
    description: 'Aktif/pasif durumu'
  },
  
  materialCount: {
    type: 'number',
    default: 0,
    description: 'Bu kategorideki malzeme sayısı (hesaplanmış)'
  },
  
  createdAt: {
    type: 'timestamp',
    required: true
  },
  
  updatedAt: {
    type: 'timestamp',
    required: true
  }
};

// ================================
// FIRESTORE INDEXES - Performans İçin
// ================================
export const REQUIRED_INDEXES = [
  // Materials Collection
  { collection: 'materials', fields: ['code'], unique: true },
  { collection: 'materials', fields: ['category', 'status'] },
  { collection: 'materials', fields: ['type', 'status'] },
  { collection: 'materials', fields: ['status', 'createdAt'] },
  { collection: 'materials', fields: ['category', 'type', 'status'] },
    { collection: 'materials', fields: ['stock', 'reorderPoint'] }, // Düşük stok sorguları için
  
  // Categories Collection
  { collection: 'categories', fields: ['name'], unique: true },
  { collection: 'categories', fields: ['parentCategory', 'sortOrder'] },
  { collection: 'categories', fields: ['isActive', 'sortOrder'] }
];
  
// ================================
// VALIDATION FUNCTIONS
// ================================
export const validateMaterial = (data) => {
  const errors = [];
  
  // Required fields
  if (!data.code) errors.push('Malzeme kodu gerekli');
  if (!data.name) errors.push('Malzeme adı gerekli');
  if (!data.type) errors.push('Malzeme tipi gerekli');
  if (!data.category) errors.push('Kategori gerekli');
  if (!data.unit) errors.push('Birim gerekli');
  if (data.stock === undefined || data.stock === null) errors.push('Stok miktarı gerekli');
  if (data.reorderPoint === undefined || data.reorderPoint === null) errors.push('Reorder point gerekli');
  
  // Numeric validations
  if (data.stock < 0) errors.push('Stok miktarı negatif olamaz');
  if (data.reorderPoint < 0) errors.push('Reorder point negatif olamaz');
  if (data.reserved && data.reserved < 0) errors.push('Rezerve miktar negatif olamaz');
  
  // Format validations
  if (data.code && !/^M-\d{3,}$/.test(data.code)) {
    errors.push('Malzeme kodu M-XXX formatında olmalı');
  }
  
  return errors;
};