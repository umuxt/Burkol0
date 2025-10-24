/**
 * ÖNERİLEN: StockMovements koleksiyonunu kaldırıp mevcut sistemi optimize edelim
 * 
 * MEVCUT SİSTEM: ✅ Zaten hibrit yaklaşım kullanıyor
 * - Material.stock doğrudan güncelleniyor (performans)
 * - AuditLogs'da geçmiş tutuluyor (audit trail)
 * - Material.lastStockUpdate'de son hareket özeti
 * 
 * SORUN: StockMovements gereksiz complexity yaratıyor
 */

// MEVCUT SİSTEM (Optimize edilecek)
const currentSystem = {
  materials: {
    stock: 150,                    // ✅ Real-time stock
    available: 100,                // ✅ Calculated (stock - reserved)
    lastStockUpdate: {             // ✅ Son hareket özeti
      orderId: "ORD-001",
      quantity: 50,
      previousStock: 100,
      newStock: 150,
      timestamp: Date.now()
    }
  },
  
  auditLogs: [                     // ✅ Genel audit trail
    {
      type: 'STOCK_UPDATE',
      materialCode: 'M-001',
      quantity: 50,
      newStock: 150
    }
  ],
  
  stockMovements: [                // ❌ GEREKSIZ - Kaldırılacak
    {
      materialId: 'M-001',
      type: 'in',
      quantity: 50
    }
  ]
}

// ÖNERİLEN SİSTEM
const recommendedSystem = {
  materials: {
    stock: 150,                    // ✅ Real-time stock
    available: 100,                // ✅ Calculated
    reserved: 50,                  // ✅ Reserved stock
    
    // Stok geçmişi için simplified array (son 10 hareket)
    stockHistory: [
      {
        date: Date.now(),
        type: 'delivery',           // delivery, sale, adjustment
        quantity: 50,
        reference: 'ORD-001',
        newStock: 150
      }
    ],
    
    // Kritik seviye uyarıları
    alerts: {
      lowStock: false,
      reorderPoint: 25,
      lastAlert: null
    }
  },
  
  // Sadece kritik işlemler için audit
  auditLogs: [
    {
      type: 'STOCK_CRITICAL',       // Sadece kritik olaylar
      action: 'LOW_STOCK_ALERT',
      materialCode: 'M-001'
    }
  ]
}

/**
 * AVANTAJLAR:
 * 1. ✅ StockMovements koleksiyonu kaldırılır (basitlik)
 * 2. ✅ Material document'ında son 10 hareket (geçmiş)
 * 3. ✅ Performans: Tek document update
 * 4. ✅ Audit trail: Material.stockHistory
 * 5. ✅ Kritik uyarılar: Material.alerts
 * 
 * KARAR VERİRKEN DÜŞÜNELECEKLER:
 * - Stok geçmişi ne kadar detaylı olmalı?
 * - Denetim gereksinimleri var mı?
 * - Raporlama ihtiyaçları neler?
 */