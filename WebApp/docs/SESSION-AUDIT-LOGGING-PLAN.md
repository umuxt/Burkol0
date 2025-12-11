# 📋 Session & Audit Logging Sistemi - İmplementasyon Planı (v2.1)

> **Branch**: `logging-system`  
> **Tarih**: 11 Aralık 2025  
> **Versiyon**: 2.1  
> **Önceki Versiyon**: v2.0 (11 Aralık 2025), v1.0 (3 Aralık 2025 - planlanmıştı, uygulanmadı)  
> **Ortam**: Production (Vercel + Neon + Cloudflare R2) / Development (Local PostgreSQL)

---

## 🎯 PROJE HEDEFLERİ

| # | Hedef | Açıklama | Öncelik |
|---|-------|----------|---------|
| 1 | **Logout Time Takibi** | Kullanıcı çıkış yapınca zaman kaydedilsin | 🔴 Kritik |
| 2 | **Session Activity Log** | Her session'da yapılan işlemler kayıt altında olsun | 🔴 Kritik |
| 3 | **Kritik İşlem Logları** | Tüm domain'lerde (MES, Materials, CRM) önemli işlemler loglanıyor | 🔴 Kritik |
| 4 | **Log History UI** | UsersTab'da loglar düzgün görüntülensin | 🔴 Kritik |
| 5 | **Serverless Uyumluluk** | Neon/Vercel ortamında session persistence | 🟡 Orta |
| 6 | **Use-Case Bazlı Loglama** | Her domain için akıllı loglama stratejisi | 🔴 Kritik |

---

## 📋 İÇİNDEKİLER

1. [Kapsamlı Sistem Analizi](#0-kapsamli-sistem-analizi)
2. [Use-Case Bazlı Loglama Stratejisi](#00-use-case-bazli-loglama-stratejisi)
3. [Mevcut Durum Analizi](#1-mevcut-durum-analizi)
4. [Problem Tanımları](#2-problem-tanımları)
5. [Veritabanı Mimarisi](#3-veritabanı-mimarisi)
6. [Backend Değişiklikleri](#4-backend-değişiklikleri)
7. [Frontend Değişiklikleri](#5-frontend-değişiklikleri)
8. [Serverless Uyumluluk](#6-serverless-uyumluluk)
9. [Test Planı](#7-test-planı)
10. [Implementation Phases](#8-implementation-phases)
11. [APPENDIX A: Uygulama Promptları](#appendix-a-uygulama-promptları)

---

## 0. KAPSAMLI SİSTEM ANALİZİ

### 0.1. Domain Mimarisi

BeePlan sistemi 5 ana domain'den oluşmaktadır:

```
WebApp/domains/
├── production/          # MES (Manufacturing Execution System)
│   └── api/
│       ├── routes.js
│       ├── controllers/  (20 controller)
│       └── services/     (21 service)
│
├── materials/           # Materials Management
│   └── api/
│       ├── routes.js
│       ├── controllers/  (7 controller)
│       └── services/     (9 service)
│
├── crm/                 # Customer Relationship Management
│   └── api/
│       ├── routes.js
│       └── controllers/  (6 controller)
│
├── admin/               # Admin Panel
│   └── components/
│
└── workerPortal/        # İşçi Portalı
    └── components/
```

### 0.2. MES (Production) Domain Analizi

#### Controllers (20 adet):
| Controller | İşlev | Kritik Aksiyonlar |
|------------|-------|-------------------|
| `productionPlanController.js` | Üretim planları | create, launch, pause, resume, delete |
| `workOrderController.js` | İş emirleri | create, update, delete |
| `assignmentController.js` | İşçi atamaları | start, complete, pause, resume |
| `workPackageController.js` | İş paketleri | - |
| `nodeController.js` | Plan düğümleri | create, update, delete |
| `substationController.js` | Alt istasyonlar | create, update, delete |
| `workerController.js` | İşçi yönetimi | create, update, delete |
| `scrapController.js` | Fire kayıtları | recordScrap, removeScrap |
| `holidayController.js` | Tatil günleri | create, update, delete |
| `alertController.js` | Uyarılar | create, resolve |
| `stationController.js` | İstasyonlar | - |
| `operationController.js` | Operasyonlar | save |
| `skillController.js` | Yetenekler | - |
| `templateController.js` | Şablonlar | - |
| `analyticsController.js` | Analitik | - |
| `approvedQuoteController.js` | Onaylı teklifler | - |
| `entityRelationController.js` | İlişkiler | create |
| `masterDataController.js` | Master data | - |
| `materialController.js` | Malzemeler | - |
| `streamController.js` | SSE streams | - |

### 0.3. Materials Domain Analizi

#### Controllers (7 adet):
| Controller | İşlev | Kritik Aksiyonlar |
|------------|-------|-------------------|
| `shipmentController.js` | Sevkiyatlar | create, update, cancel, delete, export, import |
| `orderController.js` | Satın alma siparişleri | create, update, deliverItem |
| `stockController.js` | Stok yönetimi | updateStock, reserveStock, releaseReservation |
| `materialController.js` | Malzeme tanımları | create, update, delete |
| `supplierController.js` | Tedarikçiler | create, update, delete |
| `categoryController.js` | Kategoriler | create, update, delete |
| `lookupController.js` | Lookup verileri | updateSetting, createSetting |

### 0.4. CRM Domain Analizi

#### Controllers (6 adet):
| Controller | İşlev | Kritik Aksiyonlar |
|------------|-------|-------------------|
| `quoteController.js` | Teklifler | create, update, approve, setManualPrice, delete |
| `customerController.js` | Müşteriler | create, update, delete |
| `priceController.js` | Fiyatlandırma | create, update, delete |
| `formController.js` | Form şablonları | create, update, delete |
| `quoteInvoiceController.js` | Fatura işlemleri | createProforma, exportInvoice, importInvoice |
| `serviceCardsController.js` | Hizmet kartları | create, update, delete |

### 0.5. Auth Domain Analizi

| Dosya | İşlev | Kritik Aksiyonlar |
|-------|-------|-------------------|
| `authRoutes.js` | Oturum yönetimi | login, logout, user create/update/delete |
| `auth.js` | Session yönetimi | createSession, deleteSession |

---

## 00. USE-CASE BAZLI LOGLAMA STRATEJİSİ

### Loglama Prensipleri

> **ÖNEMLİ:** Her işlemi loglamak yetersiz ve maliyetlidir. Sadece **iş etkisi yüksek** aksiyonlar loglanmalıdır.

#### Loglama Kriterleri:
1. **Mali Etki** - Para/fiyat ile ilgili değişiklikler
2. **Stok Etkisi** - Fiziksel envanter değişiklikleri
3. **Durum Değişikliği** - Status transitions (önemli olanlar)
4. **Güvenlik** - Yetki/erişim değişiklikleri
5. **Yasal Zorunluluk** - VUK, e-Belge, GDPR gereksinimleri
6. **Kullanıcı Aktivite Takibi** - Kim ne zaman ne yaptı

---

### 00.1. AUTH Domain - Loglama Matrisi

| Aksiyon | Logla? | Öncelik | Gerekçe |
|---------|--------|---------|---------|
| `login` | ✅ EVET | 🔴 Kritik | Güvenlik, tam iz takibi |
| `logout` | ✅ EVET | 🔴 Kritik | Session süresi hesaplama |
| `token_expired` | ✅ EVET | 🟡 Orta | Otomatik oturumlar |
| `user.create` | ✅ EVET | 🔴 Kritik | Yetki değişikliği |
| `user.update` | ✅ EVET | 🔴 Kritik | Rol/şifre değişikliği |
| `user.deactivate` | ✅ EVET | 🔴 Kritik | Erişim kaldırma |
| `user.delete` | ✅ EVET | 🔴 Kritik | Kalıcı silme |
| `verify-admin` | ❌ HAYIR | - | Her seferinde admin doğrulama gereksiz |
| `me` (profil görüntüleme) | ❌ HAYIR | - | Okuma işlemi, çok sık |

---

### 00.2. CRM Domain - Loglama Matrisi (GÜNCELLENDİ)

| Aksiyon | Logla? | Öncelik | Gerekçe |
|---------|--------|---------|---------|
| **QUOTE** | | | |
| `quote.create` | ✅ EVET | 🔴 Kritik | Yeni iş fırsatı |
| `quote.update` | ✅ EVET | 🟡 Orta | Tek log, tüm değişiklikler |
| `quote.approve` | ✅ EVET | 🔴 Kritik | İş onayı, WO tetikleyici |
| `quote.reject` | ✅ EVET | 🔴 Kritik | Red nedeni önemli |
| `quote.delete` | ✅ EVET | 🔴 Kritik | Veri kaybı |
| `quote.setManualPrice` | ✅ EVET | 🔴 Kritik | Fiyat manipülasyonu |
| `quote.clearManualPrice` | ✅ EVET | 🟡 Orta | Fiyat değişikliği |
| `quote.updateForm` (C2) | ✅ EVET | 🟡 Orta | **YENİ** - Form değişiklikleri takibi |
| `quote.getById` | ❌ HAYIR | - | Okuma işlemi |
| **CUSTOMER** | | | |
| `customer.create` | ✅ EVET | 🟡 Orta | Yeni müşteri |
| `customer.update` | ✅ EVET | � Orta | **GÜNCELLENDİ** - Tek log, tüm alanlar |
| `customer.delete` | ✅ EVET | 🔴 Kritik | Veri kaybı |
| **INVOICE** | | | |
| `invoice.createProforma` | ✅ EVET | 🔴 Kritik | Mali belge |
| `invoice.export` | ✅ EVET | 🔴 Kritik | e-Fatura gönderimi |
| `invoice.import` | ✅ EVET | 🔴 Kritik | ETTN kaydı |
| **SETTINGS (YENİ)** | | | |
| `priceSettings.save` | ✅ EVET | 🟡 Orta | **YENİ** - Fiyat ayarı kaydetme |
| `priceSettings.setActive` | ✅ EVET | 🔴 Kritik | **YENİ** - Aktif fiyat değişikliği |
| `formTemplate.save` | ✅ EVET | 🟡 Orta | **YENİ** - Form şablonu kaydetme |
| `formTemplate.setActive` | ✅ EVET | 🔴 Kritik | **YENİ** - Aktif form değişikliği |
| `serviceCard.create` | ✅ EVET | 🟢 Düşük | **YENİ** - Hizmet kartı |
| `serviceCard.update` | ✅ EVET | 🟢 Düşük | **YENİ** - Hizmet kartı güncelleme |
| `serviceCard.delete` | ✅ EVET | 🟢 Düşük | **YENİ** - Hizmet kartı silme |

---

### 00.3. Materials Domain - Loglama Matrisi (GÜNCELLENDİ)

| Aksiyon | Logla? | Öncelik | Gerekçe |
|---------|--------|---------|---------|
| **SHIPMENT** | | | |
| `shipment.create` | ✅ EVET | 🔴 Kritik | Sevkiyat oluşturma |
| `shipment.update` | ✅ EVET | 🟡 Orta | Sevkiyat güncelleme |
| `shipment.cancel` | ✅ EVET | 🔴 Kritik | Stok geri ekleme |
| `shipment.delete` | ✅ EVET | 🔴 Kritik | Veri kaybı |
| `shipment.export` | ✅ EVET | 🔴 Kritik | e-İrsaliye, stok düşme |
| `shipment.import` | ✅ EVET | 🔴 Kritik | Harici belge onayı |
| `shipment.addItem` | ✅ EVET | 🟡 Orta | **YENİ** - Kalem ekleme |
| `shipment.removeItem` | ✅ EVET | 🟡 Orta | **YENİ** - Kalem silme |
| **ORDER (Satın Alma)** | | | |
| `order.create` | ✅ EVET | 🔴 Kritik | Satın alma emri |
| `order.update` | ✅ EVET | 🟡 Orta | Sipariş güncelleme |
| `order.deliverItem` | ✅ EVET | 🔴 Kritik | Stok girişi |
| **STOCK** | | | |
| `stock.update` | ✅ EVET | 🔴 Kritik | Manuel stok düzeltme |
| `stock.reserve` | ❌ HAYIR | - | materials.stock_movements tablosu takip ediyor |
| `stock.release` | ❌ HAYIR | - | materials.stock_movements tablosu takip ediyor |
| **MATERIAL** | | | |
| `material.create` | ✅ EVET | 🟡 Orta | Yeni malzeme tanımı |
| `material.update` | ✅ EVET | � Orta | **GÜNCELLENDİ** - Tüm güncellemeler |
| `material.delete` | ✅ EVET | 🔴 Kritik | Veri kaybı |
| **SUPPLIER** | | | |
| `supplier.create` | ✅ EVET | � Orta | Yeni tedarikçi |
| `supplier.update` | ✅ EVET | 🟡 Orta | **YENİ** - Tüm güncellemeler (VKN dahil) |
| `supplier.delete` | ✅ EVET | � Kritik | Veri kaybı |
| **CATEGORY (YENİ)** | | | |
| `category.create` | ✅ EVET | 🟢 Düşük | **YENİ** - Master data |
| `category.update` | ✅ EVET | 🟢 Düşük | **YENİ** - Master data |
| `category.delete` | ✅ EVET | 🟢 Düşük | **YENİ** - Master data |

---

### 00.4. MES (Production) Domain - Loglama Matrisi (GÜNCELLENDİ)

> **NOT:** Plan pause/resume loglanacak (kullanıcı aktivite takibi için). Node işlemleri loglanmayacak (plan.save/edit kapsar).

| Aksiyon | Logla? | Öncelik | Gerekçe |
|---------|--------|---------|---------|
| **PRODUCTION PLAN** | | | |
| `plan.create` | ✅ EVET | 🔴 Kritik | Yeni üretim planı |
| `plan.save` (draft) | ✅ EVET | 🟡 Orta | **YENİ** - Her draft kaydetme |
| `plan.launch` | ✅ EVET | 🔴 Kritik | Üretime başlama |
| `plan.pause` | ✅ EVET | 🔴 Kritik | Üretim duraklatma |
| `plan.resume` | ✅ EVET | 🔴 Kritik | Üretim devam |
| `plan.edit` | ✅ EVET | � Orta | **YENİ** - Tek log, düzenleme |
| `plan.delete` | ✅ EVET | 🔴 Kritik | Plan silme |
| **WORK ORDER** | | | |
| `workOrder.create` | ✅ EVET | 🔴 Kritik | Yeni iş emri |
| `workOrder.update` | ✅ EVET | 🟡 Orta | **GÜNCELLENDİ** - Güncellemeler |
| `workOrder.delete` | ✅ EVET | 🔴 Kritik | İş emri silme |
| **ASSIGNMENT (İşçi Görevleri)** | | | |
| `assignment.start` | ✅ EVET | 🟡 Orta | İş başlatma |
| `assignment.complete` | ✅ EVET | 🔴 Kritik | İş tamamlama + üretim miktarı |
| `assignment.pause` | ❌ HAYIR | - | worker_assignments tablosu takip ediyor |
| `assignment.resume` | ❌ HAYIR | - | worker_assignments tablosu takip ediyor |
| **SCRAP (Fire)** | | | |
| `scrap.record` | ✅ EVET | 🔴 Kritik | Malzeme kaybı |
| `scrap.remove` | ✅ EVET | 🟡 Orta | Fire düzeltmesi |
| **WORKER** | | | |
| `worker.create` | ✅ EVET | 🟡 Orta | Yeni işçi |
| `worker.update` | ✅ EVET | 🟡 Orta | **YENİ** - İşçi güncelleme |
| `worker.delete` | ✅ EVET | 🟡 Orta | İşçi silme |
| **MASTER DATA (YENİ)** | | | |
| `station.create` | ✅ EVET | 🟢 Düşük | **YENİ** - İstasyon tanımı |
| `station.update` | ✅ EVET | 🟢 Düşük | **YENİ** - İstasyon güncelleme |
| `station.delete` | ✅ EVET | 🟢 Düşük | **YENİ** - İstasyon silme |
| `substation.create` | ✅ EVET | 🟢 Düşük | Alt istasyon tanımı |
| `substation.update` | ✅ EVET | 🟢 Düşük | **YENİ** - Alt istasyon güncelleme |
| `substation.delete` | ✅ EVET | � Düşük | Alt istasyon silme |
| `operation.save` | ✅ EVET | 🟢 Düşük | **YENİ** - Operasyon tanımı |
| **NODE** | | | |
| `node.create` | ❌ HAYIR | - | plan.save kapsar |
| `node.update` | ❌ HAYIR | - | plan.edit kapsar |
| `node.delete` | ❌ HAYIR | - | plan.edit kapsar |
| **ALERT** | | | |
| `alert.create` | ❌ HAYIR | - | mes.alerts tablosu takip ediyor |
| `alert.resolve` | ✅ EVET | 🟡 Orta | Sorun çözümü |
| **HOLIDAY** | | | |
| `holiday.create` | ✅ EVET | 🟢 Düşük | Takvim etkisi |
| `holiday.update` | ✅ EVET | 🟢 Düşük | **YENİ** - Tatil güncelleme |
| `holiday.delete` | ✅ EVET | 🟢 Düşük | Tatil silme |

---

### 00.5. Loglama Özeti (GÜNCELLENDİ)

| Domain | Toplam Aksiyon | Loglanan | Loglanmayan | Değişim |
|--------|----------------|----------|-------------|---------|
| Auth | 9 | 7 | 2 | - |
| CRM | 22 | 20 | 2 | +10 |
| Materials | 21 | 18 | 3 | +6 |
| MES | 28 | 22 | 6 | +7 |
| **TOPLAM** | 80 | **67** | 13 | **+23** |

> **Sonuç:** Tüm aksiyonların yaklaşık **%84'ü loglanacak**. Eklenen loglar nadir değişen master data ve ayarlar olduğu için sistem performansı etkilenmeyecek.

---

### 00.6. Loglama Detayları

#### customer.update - Tek Log
```javascript
// Kaydedildiğinde tek log oluştur
logAuditEvent({
  entityType: 'customer',
  entityId: customer.id,
  action: 'update',
  changes: {
    // Tüm değişen alanlar
    name: { before: oldCustomer.name, after: customer.name },
    email: { before: oldCustomer.email, after: customer.email },
    // ... diğer alanlar
  }
});
```

#### plan.save (Draft) - Her Kaydetmede
```javascript
// Draft her kaydedildiğinde
logAuditEvent({
  entityType: 'plan',
  entityId: plan.id,
  action: 'save',
  changes: {
    status: plan.status, // 'draft'
    nodesCount: plan.nodes?.length || 0,
    savedAt: new Date().toISOString()
  }
});
```

#### shipment.addItem - Tüm Durumlar
```javascript
// Shipment'a kalem eklendiğinde (her durumda)
logAuditEvent({
  entityType: 'shipment',
  entityId: shipmentId,
  action: 'addItem',
  changes: {
    shipmentStatus: shipment.status,
    materialCode: item.materialCode,
    quantity: item.quantity
  }
});
```

---

---

## 1. MEVCUT DURUM ANALİZİ

### 1.1. Dosya Yapısı

```
WebApp/
├── server/
│   ├── auth.js                    # Session yönetimi + memory cache
│   ├── authRoutes.js              # Login/logout endpoints
│   └── auditTrail.js              # Audit logging helper
├── db/
│   ├── connection.js              # Knex database bağlantısı
│   ├── models/
│   │   └── sessions.js            # PostgreSQL session CRUD
│   └── neon_schema.sql            # Full DB schema
├── src/components/settings/
│   └── UsersTab.jsx               # Log History UI
└── shared/
    └── lib/api.js                 # Frontend API çağrıları
```

### 1.2. Mevcut Tablolar

#### `public.sessions` (Mevcut)
```sql
CREATE TABLE public.sessions (
    "sessionId" character varying(100) NOT NULL,
    token character varying(255) NOT NULL,
    email character varying(255) NOT NULL,
    "userName" character varying(255),
    "workerId" character varying(100),
    "loginTime" timestamp with time zone NOT NULL,
    "loginDate" date NOT NULL,
    expires timestamp with time zone NOT NULL,
    "lastActivityAt" timestamp with time zone,
    "logoutTime" timestamp with time zone,          -- ✅ Mevcut ama düzgün dolmuyor
    "isActive" boolean DEFAULT true,
    "activityLog" jsonb                              -- ✅ Mevcut ama düzgün dolmuyor
);
```

#### `settings.audit_logs` (Mevcut)
```sql
CREATE TABLE settings.audit_logs (
    id integer NOT NULL,
    "entityType" character varying(100) NOT NULL,   -- session, quote, shipment, etc.
    "entityId" character varying(100) NOT NULL,
    action character varying(50) NOT NULL,          -- login, logout, create, update, delete
    changes jsonb,
    "userId" character varying(255),
    "userEmail" character varying(255),
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "ipAddress" character varying(50)
);
```

### 1.3. Mevcut Kod Akışı

#### Login Akışı (✅ Çalışıyor)
```
1. POST /api/auth/login
2. verifyUser() → credentials check
3. createSession() → token oluştur
4. Session PostgreSQL'e kaydedilir
5. auditSessionActivity() → audit_logs'a login kaydı
6. Response: { token, user, session }
```

#### Logout Akışı (❌ SORUNLU)
```
1. POST /api/auth/logout
2. getSession(token) → mevcut session al
3. logoutActivity objesi oluştur
4. updateSession() → logoutTime + activityLog güncelle  ← SORUN BURADA
5. deleteSession(token) → Memory'den sil               ← SORUN: DB update öncesi mi sonra mı?
6. auditSessionActivity() → audit_logs'a logout kaydı
7. Response: { success: true }
```

---

## 2. PROBLEM TANIMLARI

### 2.1. Problem #1: Logout Time Düzgün Kaydedilmiyor

**Kod Analizi (`authRoutes.js` satır 64-114):**

```javascript
app.post('/api/auth/logout', async (req, res) => {
  const token = authHeader?.slice(7)
  
  if (token) {
    const session = await getSession(token)
    if (session) {
      // ... logoutActivity oluştur ...
      
      const updatedSession = {
        ...session,
        logoutTime: new Date().toISOString(),  // ✅ Doğru
        isActive: false,
        activityLog: [...(session.activityLog || []), logoutActivity]
      }
      
      await updateSession(updatedSession)       // ⚠️ async ama await eksik olabilir
      
      // Audit log
      await auditSessionActivity(req, logoutActivity)
    }
    
    deleteSession(token)                        // ❌ SORUN: Bu memory'den siliyor
  }
  
  res.json({ success: true })
})
```

**Sorunun Kökü:**
1. `updateSession()` PostgreSQL'e yazıyor AMA
2. `deleteSession()` memory'den siliyor + PostgreSQL'de soft delete yapıyor
3. Race condition: PostgreSQL update tamamlanmadan delete çağrılabilir

### 2.2. Problem #2: Activity Log Boş Geliyor

**Kod Analizi (`db/models/sessions.js` satır 103-138):**

```javascript
export async function updateSession(sessionId, updates) {
  const updateData = {
    lastActivityAt: updates.lastActivityAt,
    isActive: updates.isActive,
    logoutTime: updates.logoutTime,
  };
  
  // Activity log append
  if (updates.activityLog) {
    const existing = await getSessionById(sessionId);      // ❌ sessionId ile alıyor
    const existingLog = existing?.activityLog || [];
    updateData.activityLog = JSON.stringify([...existingLog, ...newLog]);
  }
  
  const [session] = await db('sessions')
    .where({ sessionId: sessionId })                        // ❌ sessionId string olarak geliyor mu?
    .update(updateData)
    .returning('*');
}
```

**Sorunun Kökü:**
1. `updateSession()` sessionId parametresi bekliyor
2. `authRoutes.js`'de `updateSession(updatedSession)` çağrılıyor - tüm obje gönderiliyor
3. `sessions.js` modeli bunu düzgün parse edemiyor

### 2.3. Problem #3: Kritik İşlemler Loglanmıyor

**Mevcut Durum:**
| İşlem | Log Durumu |
|-------|------------|
| Login | ✅ Loglanıyor |
| Logout | ⚠️ Kısmen loglanıyor |
| User Create/Update/Delete | ✅ Loglanıyor |
| Quote Create/Update/Approve | ❌ Loglanmıyor |
| Shipment Create/Update | ❌ Loglanmıyor |
| Material Create/Update | ❌ Loglanmıyor |

### 2.4. Problem #4: Log History UI Görüntüleme Sorunu

**UsersTab.jsx Analizi:**

```javascript
const sessionActivities = selectedSession && Array.isArray(selectedSession.activityLog)
  ? [...selectedSession.activityLog].sort((a, b) => { ... })
  : null;
```

**Sorun:** `activityLog` çoğunlukla boş geliyor çünkü:
1. PostgreSQL'e düzgün yazılmıyor
2. Memory session'larda kalıyor, DB'ye persist edilmiyor

---

## 3. VERİTABANI MİMARİSİ

### 3.1. Şema Güncelleme Stratejisi

**Mevcut tablolar YETERİNCE iyi tasarlanmış.** Yeni tablo oluşturmaya gerek yok.

#### Gerekli Değişiklikler:

```sql
-- 1. sessions tablosuna index ekle (performans)
CREATE INDEX IF NOT EXISTS idx_sessions_logout_time 
ON public.sessions("logoutTime" DESC) 
WHERE "logoutTime" IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sessions_is_active 
ON public.sessions("isActive") 
WHERE "isActive" = true;

-- 2. audit_logs tablosuna ek indexler
CREATE INDEX IF NOT EXISTS idx_audit_logs_session_id 
ON settings.audit_logs("entityId") 
WHERE "entityType" = 'session';

CREATE INDEX IF NOT EXISTS idx_audit_logs_user_email 
ON settings.audit_logs("userEmail");
```

### 3.2. Action Type Standartları

```
AUTH İŞLEMLERİ:
  - login           # Kullanıcı giriş yaptı
  - logout          # Kullanıcı çıkış yaptı
  - token_expired   # Token süresi doldu (otomatik)
  - session_forced  # Admin tarafından session sonlandırıldı

USER İŞLEMLERİ:
  - user.create     # Yeni kullanıcı oluşturuldu
  - user.update     # Kullanıcı güncellendi
  - user.deactivate # Kullanıcı devre dışı bırakıldı
  - user.activate   # Kullanıcı aktifleştirildi
  - user.delete     # Kullanıcı kalıcı silindi

QUOTE İŞLEMLERİ:
  - quote.create    # Yeni teklif oluşturuldu
  - quote.update    # Teklif güncellendi
  - quote.approve   # Teklif onaylandı
  - quote.reject    # Teklif reddedildi
  - quote.delete    # Teklif silindi

SHIPMENT İŞLEMLERİ:
  - shipment.create   # Yeni sevkiyat oluşturuldu
  - shipment.update   # Sevkiyat güncellendi
  - shipment.export   # Sevkiyat export edildi
  - shipment.complete # Sevkiyat tamamlandı
  - shipment.cancel   # Sevkiyat iptal edildi

MATERIAL İŞLEMLERİ:
  - material.create # Yeni malzeme oluşturuldu
  - material.update # Malzeme güncellendi
  - material.delete # Malzeme silindi
  - stock.adjust    # Stok düzeltmesi yapıldı
```

---

## 4. BACKEND DEĞİŞİKLİKLERİ

### 4.1. auth.js Düzeltmeleri

**Mevcut Sorun:** `deleteSession()` memory'den siliyor ama PostgreSQL'e düzgün yazmıyor.

**Çözüm:**

```javascript
// auth.js - deleteSession fonksiyonu düzeltmesi
export async function deleteSession(token) {
  if (!token) return;
  
  const session = memory.sessions.get(token);
  
  if (session) {
    // 1. Önce PostgreSQL'de soft delete yap
    try {
      await Sessions.deleteSessionById(session.sessionId);  // Bu zaten logoutTime set ediyor
    } catch (err) {
      console.warn('[auth] Failed to soft delete session in PostgreSQL:', err?.message);
    }
    
    // 2. Sonra memory'den sil
    memory.sessionsById.delete(session.sessionId);
    memory.sessions.delete(token);
  }
}
```

### 4.2. authRoutes.js Logout Düzeltmesi

**Mevcut Sorun:** `updateSession()` çağrısı hatalı parametre alıyor.

**Çözüm:**

```javascript
// authRoutes.js - logout endpoint düzeltmesi
app.post('/api/auth/logout', async (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  
  if (token) {
    const session = await getSession(token);
    if (session) {
      const logoutTime = new Date().toISOString();
      
      // Session'a logout bilgisi ekle
      const logoutActivity = {
        id: `act-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        timestamp: logoutTime,
        type: 'session',
        action: 'logout',
        scope: 'auth',
        title: 'Admin panel çıkış yapıldı',
        description: `${session.email} oturumu sonlandırıldı`,
        metadata: {
          email: session.email,
          sessionDuration: new Date() - new Date(session.loginTime)
        },
        performedBy: {
          email: session.email,
          userName: session.userName,
          sessionId: session.sessionId
        }
      };

      // ✅ DÜZELTME: Doğru parametre formatı
      try {
        await updateSession(session.sessionId, {
          logoutTime: logoutTime,
          isActive: false,
          lastActivityAt: logoutTime,
          activityLog: [logoutActivity]  // Tek eleman array
        });
      } catch (err) {
        console.warn('[authRoutes] Session update failed:', err?.message);
      }
      
      // Audit log
      try {
        req.user = session;
        await auditSessionActivity(req, logoutActivity);
      } catch (err) {
        console.warn('[authRoutes] Audit log failed:', err?.message);
      }
    }
    
    // Memory'den sil (PostgreSQL zaten updateSession'da güncellendi)
    deleteSession(token);
  }
  
  res.json({ success: true });
});
```

### 4.3. sessions.js Model Düzeltmeleri

**Mevcut Sorun:** `updateSession()` parametreleri düzgün işlenmiyor.

**Çözüm:**

```javascript
// db/models/sessions.js - updateSession düzeltmesi
export async function updateSession(sessionId, updates) {
  try {
    // Gelen veriyi valide et
    if (!sessionId || typeof sessionId !== 'string') {
      console.error('[sessions] Invalid sessionId:', sessionId);
      throw new Error('Invalid sessionId');
    }
    
    const updateData = {};
    
    // Sadece gelen alanları ekle
    if (updates.lastActivityAt !== undefined) {
      updateData.lastActivityAt = updates.lastActivityAt;
    }
    if (updates.isActive !== undefined) {
      updateData.isActive = updates.isActive;
    }
    if (updates.logoutTime !== undefined) {
      updateData.logoutTime = updates.logoutTime;
    }
    
    // Activity log append - ÖNEMLİ FIX
    if (updates.activityLog && Array.isArray(updates.activityLog)) {
      const existing = await getSessionById(sessionId);
      const existingLog = Array.isArray(existing?.activityLog) ? existing.activityLog : [];
      const newLog = updates.activityLog;
      updateData.activityLog = JSON.stringify([...existingLog, ...newLog]);
    }
    
    // Boş update yapmayı önle
    if (Object.keys(updateData).length === 0) {
      console.warn('[sessions] No valid update fields provided');
      return await getSessionById(sessionId);
    }
    
    const [session] = await db('sessions')
      .where({ sessionId: sessionId })
      .update(updateData)
      .returning('*');
    
    if (!session) {
      throw new Error('Session not found');
    }
    
    console.log('✅ Session updated:', session.sessionId, 'Fields:', Object.keys(updateData));
    return normalizeSession(session);
  } catch (error) {
    console.error('❌ Error updating session:', error);
    throw error;
  }
}
```

### 4.4. Audit Trail Genişletme

**Yeni Helper Fonksiyonları:**

```javascript
// server/auditTrail.js - Genişletilmiş versiyon

import { updateSession } from './auth.js';
import db from '../db/connection.js';

/**
 * Generic audit log helper
 * @param {Object} options
 * @param {string} options.entityType - quote, shipment, material, user, session
 * @param {string} options.entityId - Kayıt ID'si
 * @param {string} options.action - create, update, delete, approve, etc.
 * @param {Object} options.changes - Değişiklik detayları
 * @param {Object} options.performer - { email, userName, sessionId }
 * @param {string} options.ipAddress - IP adresi
 */
export async function logAuditEvent(options) {
  const {
    entityType,
    entityId,
    action,
    changes = {},
    performer = {},
    ipAddress = null
  } = options;
  
  try {
    await db('settings.audit_logs').insert({
      entityType,
      entityId: String(entityId),
      action,
      changes: JSON.stringify(changes),
      userId: performer.userName || performer.email,
      userEmail: performer.email,
      createdAt: new Date(),
      ipAddress
    });
    
    console.log(`📝 Audit: ${entityType}.${action} [${entityId}]`);
  } catch (err) {
    console.warn('[auditTrail] Failed to log event:', err?.message);
  }
}

// Session activity için özel helper (mevcut - düzeltilmiş)
export async function auditSessionActivity(req, activity = {}) {
  try {
    if (!activity || typeof activity !== 'object') return;
    
    const sessionId = req?.user?.sessionId;
    if (!sessionId) {
      console.warn('[auditTrail] No sessionId available');
      return;
    }

    const performer = {
      email: req.user?.email || null,
      userName: req.user?.userName || req.user?.name || null,
      sessionId
    };

    const userAgent = req?.get ? req.get('user-agent') : (req?.headers?.['user-agent'] || null);

    // Session activity log'a ekle
    const memoryEntry = {
      id: activity.id || `act-${Date.now().toString(36)}`,
      performedBy: performer,
      timestamp: activity.timestamp || new Date().toISOString(),
      action: activity.action || null,
      type: activity.type || null,
      title: activity.title || null,
      description: activity.description || null,
      metadata: activity.metadata || null,
      ipAddress: req?.ip || null,
      userAgent
    };

    // Session'a activity ekle (async, error ignore)
    updateSession(sessionId, {
      activityLog: [memoryEntry]
    }).catch(err => {
      console.warn('[auditTrail] Session activity update failed:', err?.message);
    });

    // PostgreSQL audit_logs'a da yaz
    await logAuditEvent({
      entityType: activity.type || activity.scope || 'session',
      entityId: sessionId,
      action: activity.action || 'activity',
      changes: {
        title: activity.title,
        description: activity.description,
        details: activity.details,
        metadata: activity.metadata,
        userAgent
      },
      performer,
      ipAddress: req?.ip
    });
    
  } catch (error) {
    console.error('[auditTrail] Error:', error?.message);
  }
}

export default auditSessionActivity;
```

---

## 5. FRONTEND DEĞİŞİKLİKLERİ

### 5.1. UsersTab.jsx İyileştirmeleri

**Sorun:** Boş activityLog gösteriliyor.

**Çözüm Noktaları:**

1. **PostgreSQL'den güncel veri çek:**
```javascript
// loadSessions fonksiyonunda filter ekle
const sortedSessions = Array.from(uniqueSessionsMap.values())
  .filter(s => s.activityLog && s.activityLog.length > 0 || s.loginTime) // Boş olmayan
  .sort((a, b) => { ... });
```

2. **Fallback göster:**
```javascript
// Session details modal'da
sessionActivities && sessionActivities.length > 0
  ? // Mevcut liste render
  : React.createElement('div', { 
      style: { color: '#666', fontSize: '14px', textAlign: 'center', padding: '20px' }
    },
    React.createElement('p', null, 'Bu oturum için henüz aktivite kaydı yok.'),
    React.createElement('p', { style: { fontSize: '12px', color: '#999' } }, 
      `Giriş: ${formatDateTime(selectedSession.loginTime)}`
    )
  )
```

### 5.2. Session Cleanup Hook Düzeltmesi

**Mevcut:** `useSessionCleanup.js` - Tab kapanınca logout deniyor

**Sorun:** `sendBeacon` ile gönderilen logout bazen kayboluyor.

**Çözüm (İsteğe bağlı - Serverless'ta sorunlu olabilir):**

```javascript
// Daha güvenilir beforeunload handling
useEffect(() => {
  const handleBeforeUnload = (event) => {
    // Sync XHR ile logout (sendBeacon yerine)
    const token = localStorage.getItem('bp_admin_token');
    if (token) {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/auth/logout', false); // sync
      xhr.setRequestHeader('Content-Type', 'application/json');
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      try {
        xhr.send(JSON.stringify({}));
      } catch (e) {
        // Ignore errors on page close
      }
    }
  };
  
  window.addEventListener('beforeunload', handleBeforeUnload);
  return () => window.removeEventListener('beforeunload', handleBeforeUnload);
}, []);
```

---

## 6. SERVERLESS UYUMLULUK

### 6.1. Vercel + Neon Ortamı

**Challenge:** Her Vercel function invocation ayrı bir instance, memory paylaşılmıyor.

**Mevcut Çözüm (auth.js):**
```javascript
// Memory cache - her instance için ayrı
const memory = {
  sessions: new Map(),
  sessionsById: new Map(),
  users: new Map()
};

// DB'den çek yoksa
if (!session) {
  session = await Sessions.getSessionByToken(token);
  if (session) {
    memory.sessions.set(token, session);  // Cache
  }
}
```

**Bu çözüm YETERLİ.** Her request PostgreSQL'den okuyabiliyor.

### 6.2. Session Persistence Stratejisi

| Aksiyon | Memory | PostgreSQL |
|---------|--------|------------|
| Login | ✅ Yazılır | ✅ Yazılır |
| Her Request | ✅ Okunur (varsa) | ✅ Okunur (yoksa) |
| Activity | ✅ Güncellenir | ✅ Güncellenir |
| Logout | ✅ Silinir | ✅ Soft delete |

---

## 7. TEST PLANI

### 7.1. Unit Test Senaryoları

```
TC-001: Login sonrası session PostgreSQL'de mevcut
TC-002: Logout sonrası logoutTime dolu
TC-003: Logout sonrası isActive = false
TC-004: Activity log logout kaydı içeriyor
TC-005: audit_logs tablosunda login kaydı var
TC-006: audit_logs tablosunda logout kaydı var
```

### 7.2. E2E Test Senaryoları

```
E2E-001: Login → Birkaç işlem → Logout → Session detay aç → Aktiviteler görünüyor
E2E-002: Login → Tab kapat → Session listede "Süresi Dolmuş" veya logoutTime dolu
E2E-003: Quote oluştur → audit_logs'da quote.create kaydı var
```

### 7.3. Manuel Test Checklist

- [ ] Login yapılabiliyor
- [ ] Sessions listesinde yeni session görünüyor
- [ ] Logout yapılabiliyor
- [ ] Logout sonrası "Çıkış" kolonu dolu
- [ ] Session detaylarında "Sistem Aktiviteleri" dolu
- [ ] Birden fazla işlem yapıldığında hepsi logda görünüyor

---

## 8. IMPLEMENTATION PHASES

### Phase 0: Kritik Bug Düzeltmeleri (30 dk) 🔴

| Adım | Dosya | Değişiklik |
|------|-------|------------|
| 0.1 | `authRoutes.js` | Logout endpoint düzeltmesi |
| 0.2 | `db/models/sessions.js` | updateSession parametre fix |
| 0.3 | Test | Login → Logout → DB kontrol |

### Phase 1: Audit Trail Genişletme (2 saat) 🔴

| Adım | Dosya | Değişiklik |
|------|-------|------------|
| 1.1 | `auditTrail.js` | `logAuditEvent()` helper ekle |
| 1.2 | `quoteRoutes.js` | CRUD işlemlerinde audit log |
| 1.3 | `shipmentRoutes.js` | CRUD işlemlerinde audit log |
| 1.4 | Test | Quote oluştur → DB kontrol |

### Phase 2: Frontend Düzeltmeleri (1 saat) 🟡

| Adım | Dosya | Değişiklik |
|------|-------|------------|
| 2.1 | `UsersTab.jsx` | Boş activity fallback |
| 2.2 | `UsersTab.jsx` | Activity detay gösterimi iyileştirme |
| 2.3 | Test | UI'da loglar görünüyor |

### Phase 3: Index ve Performans (30 dk) 🟢

| Adım | Dosya | Değişiklik |
|------|-------|------------|
| 3.1 | Migration | Index'leri ekle |
| 3.2 | Test | Query performansı kontrol |

---

## APPENDIX A: UYGULAMA PROMPTLARI

### P0.1: authRoutes.js Logout Düzeltmesi

**Bağımlılık:** Yok

**Amaç:** Logout endpoint'ini düzelt, logoutTime kaydedilsin.

**Prompt:**
```
authRoutes.js dosyasındaki /api/auth/logout endpoint'ini düzelt.

## MEVCUT SORUN
updateSession() çağrısı yanlış parametre alıyor:
- Mevcut: `await updateSession(updatedSession)` - tüm obje gönderiliyor
- Olması gereken: `await updateSession(session.sessionId, { ...updates })`

## GEREKLİ DEĞİŞİKLİKLER

1. updateSession çağrısını düzelt:
```javascript
await updateSession(session.sessionId, {
  logoutTime: logoutTime,
  isActive: false,
  lastActivityAt: logoutTime,
  activityLog: [logoutActivity]
});
```

2. Error handling ekle (try-catch)

3. deleteSession çağrısının updateSession'dan SONRA olduğundan emin ol

## TEST
- Login yap
- Logout yap
- PostgreSQL'de sessions tablosunu kontrol et:
  SELECT "sessionId", "logoutTime", "isActive" FROM sessions ORDER BY "loginTime" DESC LIMIT 5;
- logoutTime dolu ve isActive = false olmalı
```

**Düzenlenecek Dosyalar:**
- `/WebApp/server/authRoutes.js` ✅
- `/WebApp/shared/components/BeePlanNavigation.js` ✅ (Frontend logout API çağrısı eklendi)

**Başarı Kriterleri:**
- [x] Logout sonrası `logoutTime` PostgreSQL'de dolu ✅ (2025-12-11 test edildi)
- [x] `isActive` = false ✅
- [x] `activityLog` logout kaydı içeriyor ✅

**Uygulama Notu (2025-12-11):**
Frontend'deki `BeePlanNavigation.logout()` fonksiyonu backend API'yi çağırmıyordu. Bu da düzeltildi.

---

### P0.2: sessions.js updateSession Düzeltmesi

**Bağımlılık:** Yok (P0.1 ile paralel yapılabilir)

**Amaç:** Model'deki updateSession fonksiyonunu düzelt.

**Prompt:**
```
db/models/sessions.js dosyasındaki updateSession fonksiyonunu düzelt.

## MEVCUT SORUN
Fonksiyon (sessionId, updates) parametresi bekliyor ama bazen tüm session objesi geliyor.

## GEREKLİ DEĞİŞİKLİKLER

1. Parametre validasyonu ekle:
```javascript
if (!sessionId || typeof sessionId !== 'string') {
  console.error('[sessions] Invalid sessionId:', sessionId);
  throw new Error('Invalid sessionId');
}
```

2. Sadece geçerli alanları al:
```javascript
const updateData = {};
if (updates.lastActivityAt !== undefined) updateData.lastActivityAt = updates.lastActivityAt;
if (updates.isActive !== undefined) updateData.isActive = updates.isActive;
if (updates.logoutTime !== undefined) updateData.logoutTime = updates.logoutTime;
```

3. Activity log append mantığını düzelt:
```javascript
if (updates.activityLog && Array.isArray(updates.activityLog)) {
  const existing = await getSessionById(sessionId);
  const existingLog = Array.isArray(existing?.activityLog) ? existing.activityLog : [];
  updateData.activityLog = JSON.stringify([...existingLog, ...updates.activityLog]);
}
```

4. Debug log ekle:
```javascript
console.log('✅ Session updated:', session.sessionId, 'Fields:', Object.keys(updateData));
```

## TEST
P0.1 ile birlikte test edilecek
```

**Düzenlenecek Dosyalar:**
- `/WebApp/db/models/sessions.js` ✅
- `/WebApp/server/utils/logger.js` ✅ (YENİ - Tablo formatı console logger)
- `/WebApp/server/authRoutes.js` ✅ (Logger entegrasyonu)
- `/WebApp/db/models/users.js` ✅ (Gereksiz loglar temizlendi)

**Başarı Kriterleri:**
- [x] sessionId string olarak validate ediliyor ✅
- [x] activityLog array olarak append ediliyor ✅
- [x] Console log güncellenen alanları gösteriyor ✅
- [x] Tablo formatında login/logout logları ✅ (BONUS)

**Uygulama Notu (2025-12-11):**
Tablo formatında console logger eklendi (`server/utils/logger.js`). Login/logout logları artık düzenli tablo formatında görünüyor. Gereksiz debug logları tüm session/user dosyalarından temizlendi.

---

### P1.1: logAuditEvent Helper Fonksiyonu

**Bağımlılık:** P0.1, P0.2 tamamlanmış olmalı

**Amaç:** Generic audit log helper ekle.

**Prompt:**
```
auditTrail.js dosyasını genişlet, generic logAuditEvent helper ekle.

## YENİ FONKSİYON

```javascript
/**
 * Generic audit log helper
 */
export async function logAuditEvent(options) {
  const {
    entityType,    // quote, shipment, material, user, session
    entityId,      // Kayıt ID'si
    action,        // create, update, delete, approve, etc.
    changes = {},  // Değişiklik detayları
    performer = {},// { email, userName, sessionId }
    ipAddress = null
  } = options;
  
  try {
    await db('settings.audit_logs').insert({
      entityType,
      entityId: String(entityId),
      action,
      changes: JSON.stringify(changes),
      userId: performer.userName || performer.email,
      userEmail: performer.email,
      createdAt: new Date(),
      ipAddress
    });
    
    console.log(`📝 Audit: ${entityType}.${action} [${entityId}]`);
  } catch (err) {
    console.warn('[auditTrail] Failed to log event:', err?.message);
  }
}
```

## EXPORT
Hem named export hem default export olsun:
- `export { logAuditEvent, auditSessionActivity }`
- `export default auditSessionActivity`

## TEST
```javascript
await logAuditEvent({
  entityType: 'test',
  entityId: 'test-123',
  action: 'test-action',
  changes: { test: true },
  performer: { email: 'test@test.com' }
});
// SELECT * FROM settings.audit_logs WHERE "entityType" = 'test';
```
```

**Düzenlenecek Dosya:**
- `/WebApp/server/auditTrail.js` ✅

**Başarı Kriterleri:**
- [x] logAuditEvent export ediliyor ✅
- [x] Audit loglar audit_logs'da görünüyor ✅ (session login/logout çalışıyor)

**Uygulama Notu (2025-12-11):**
Generic `logAuditEvent` helper eklendi. Tüm domain'lerde (CRM, MES, Materials) kullanılmaya hazır. Logger entegrasyonu ile tablo formatında console output sağlanıyor.

---

### P1.1b: Birleşik Console Logger Formatı (YENİ)

**Bağımlılık:** P1.1 tamamlanmış olmalı

**Amaç:** Success log ve Audit log'u tek bir tablo formatında birleştir. CORS loglarını sessiz yap.

**Prompt:**
```
server/utils/logger.js dosyasını genişlet, birleşik log formatı ekle.

## YENİ FORMAT

Mevcut durum (iki ayrı log):
  ✅ Quote created successfully
    • quoteId: TKF-20251211-0001
    • customerId: 19
  │ 📋 AUDIT │ create │ quote │ TKF-202512 │ 15:56:30 │

Yeni format (tek birleşik tablo):
  ┌────────────────────────────────────────────────────────┐
  │ ✅ QUOTE CREATE                                        │
  │    quoteId:   TKF-20251211-0001                        │
  │    customer:  19                                       │
  │    price:     0                                        │
  ├────────────────────────────────────────────────────────┤
  │ 📋 quote.create │ umutyalcin8@... │ 15:56:30           │
  └────────────────────────────────────────────────────────┘

## YENİ FONKSİYON

```javascript
/**
 * Birleşik işlem ve audit logu
 * @param {object} options
 * @param {'success'|'warning'|'error'} options.type - Log tipi
 * @param {string} options.action - Aksiyon adı: 'QUOTE CREATE', 'SHIPMENT UPDATE' vb.
 * @param {object} options.details - Detaylar: { quoteId: '...', customer: '...' }
 * @param {object} options.audit - Audit bilgisi (opsiyonel)
 */
export function logOperation(options) {
  const { type = 'success', action, details = {}, audit } = options;
  
  const time = new Date().toLocaleTimeString('tr-TR', { 
    hour: '2-digit', minute: '2-digit', second: '2-digit' 
  });
  
  const icon = type === 'success' ? '✅' : type === 'warning' ? '⚠️' : '❌';
  const width = 56;
  
  // Üst kısım
  console.log('┌' + '─'.repeat(width) + '┐');
  console.log(`│ ${icon} ${action.padEnd(width - 4)} │`);
  
  // Detaylar (alt alta)
  Object.entries(details).forEach(([key, value]) => {
    const line = `   ${key.padEnd(12)} ${String(value ?? '').slice(0, width - 18)}`;
    console.log(`│${line.padEnd(width)} │`);
  });
  
  // Audit kısmı (varsa)
  if (audit) {
    console.log('├' + '─'.repeat(width) + '┤');
    const auditLine = `📋 ${audit.action.padEnd(15)} │ ${(audit.userEmail || 'system').slice(0, 20).padEnd(20)} │ ${time}`;
    console.log(`│ ${auditLine.padEnd(width - 2)} │`);
    
    // DB'ye yaz (fire-and-forget)
    logAuditEvent(audit).catch(() => {});
  }
  
  console.log('└' + '─'.repeat(width) + '┘');
}
```

## CORS LOGLARI SESSİZ YAP

server.js veya ilgili middleware'de CORS success loglarını kaldır veya DEBUG moduna taşı.

## KULLANIM ÖRNEĞİ

Quote controller'da:
```javascript
// ESKİ (iki ayrı log)
logger.success('Quote created successfully', { quoteId: quote.id, ... });
logAuditEvent({ entityType: 'quote', action: 'create', ... }).catch(() => {});

// YENİ (tek birleşik log)
logOperation({
  type: 'success',
  action: 'QUOTE CREATE',
  details: {
    quoteId: quote.id,
    customer: resolvedCustomerId,
    price: quote.calculatedPrice
  },
  audit: {
    entityType: 'quote',
    entityId: quote.id,
    action: 'create',
    changes: { ... },
    performer: { email: req.user?.email },
    ipAddress: req.ip
  }
});
```

## TEST
- Quote oluştur
- Console'da tek birleşik tablo görünmeli
- CORS logları görünmemeli
```

**Düzenlenecek Dosyalar:**
- `/WebApp/server/utils/logger.js` ✅
- `/WebApp/server.js` (CORS log kaldırma) ✅
- `/WebApp/domains/crm/api/controllers/quoteController.js` ✅ (logOperation entegrasyonu)
- `/WebApp/server/auditTrail.js` ✅ (duplicate log kaldırma)

**Başarı Kriterleri:**
- [x] logOperation fonksiyonu çalışıyor ✅
- [x] Birleşik tablo formatı console'da görünüyor ✅
- [x] CORS success logları görünmüyor ✅
- [x] Audit loglar hala DB'ye yazılıyor ✅
- [x] Eski logger'dan veri kaybı yok (customerType eklendi) ✅

**Uygulama Notu (2025-12-11):**
`logOperation` fonksiyonu eklendi. Quote create endpoint'i birleşik format kullanıyor. CORS logları development'ta varsayılan sessiz. Duplicate audit log sorunu çözüldü.

---

### P1.1c: Diğer Logları Temizleme ve Şema Düzeltmesi (SONRA)

**Bağımlılık:** P1.1b tamamlanmış olmalı

**Amaç:** 
1. PostgreSQL bağlantı loglarını azalt
2. Price calculation debug loglarını DEBUG moduna taşı
3. `quote_files.filePath` kolonunu TEXT olarak değiştir (varchar(500) → text)

**Prompt:**
```
Gereksiz logları temizle ve filePath şema sorunu düzelt.

## 1. PostgreSQL Bağlantı Logları
db/connection.js dosyasında:
- İlk bağlantıda bir kez göster
- Sonraki bağlantılarda sessiz kal (veya DEBUG modunda göster)

## 2. Price Calculation Debug Logları
domains/crm/api/services/priceSettingsService.js dosyasında:
- 🔍 SERVER PRICE CALCULATION DEBUG loglarını DEBUG=true kontrolü altına al

## 3. FilePath Şema Düzeltmesi
Migration ekle veya direkt güncelle:
ALTER TABLE quotes.quote_files ALTER COLUMN "filePath" TYPE TEXT;

## 4. CRM Domain Logger Temizliği
domains/crm/utils/logger.js:
- Audit içeren endpoint'lerde logger.success kaldır (logOperation kullanılıyor)
```

**Düzenlenecek Dosyalar:**
- `/WebApp/db/connection.js` ✅
- `/WebApp/server/priceCalculator.js` ✅
- `/WebApp/db/neon_schema.sql` ✅

**Başarı Kriterleri:**
- [x] PostgreSQL logları azaltıldı ✅ (sadece ilk bağlantıda)
- [x] Price debug logları DEBUG modunda ✅
- [x] filePath TEXT olarak çalışıyor ✅

**Uygulama Notu (2025-12-11):**
PostgreSQL bağlantı logu artık sadece ilk bağlantıda görünüyor. Price calculation debug logları `DEBUG=true` ile gösterilecek. `quote_files.filePath` kolonu TEXT olarak güncellendi (local DB ve schema).

---

### P1.2: Quote CRUD Audit Logging

**Bağımlılık:** P1.1 tamamlanmış olmalı (P1.1b ile entegrasyon sonra yapılacak)

**Amaç:** Quote oluşturma/güncelleme/silme işlemlerini logla.

**Prompt:**
```
Quote API route'larına audit logging ekle.

## HEDEF DOSYA
Önce quote route'ların nerede olduğunu bul:
- /WebApp/domains/crm/api/controllers/quoteController.js

## EKLENECEK AUDIT LOGLAR

### POST /api/quotes (Create)
```javascript
import { logAuditEvent } from '../../../../server/auditTrail.js';

// ... mevcut create logic ...

// Başarılı kayıt sonrası:
logAuditEvent({
  entityType: 'quote',
  entityId: quote.id,
  action: 'create',
  changes: {
    customerName: resolvedCustomerName,
    customerId: resolvedCustomerId,
    calculatedPrice: quote.calculatedPrice,
    status: quote.status
  },
  performer: { email: req.user?.email, userName: req.user?.userName, sessionId: req.user?.sessionId },
  ipAddress: req.ip
}).catch(() => {});
```

### PATCH /api/quotes/:id (Update)
### PATCH /api/quotes/:id/status (Approve/Reject)
### PUT /api/quotes/:id/form (UpdateForm - C2 Modal)
### POST/DELETE /api/quotes/:id/manual-price (SetManualPrice/ClearManualPrice)
### DELETE /api/quotes/:id (Delete)

## NOT
- P1.1b tamamlandıktan sonra logOperation() ile birleşik format kullanılacak
- Şu an logAuditEvent() + logger.success() ayrı çağrılıyor

## TEST
- Yeni quote oluştur
- SELECT * FROM settings.audit_logs WHERE "entityType" = 'quote' ORDER BY "createdAt" DESC LIMIT 5;
```

**Düzenlenecek Dosyalar:**
- `/WebApp/domains/crm/api/controllers/quoteController.js` ✅

**Başarı Kriterleri:**
- [x] Quote create audit_logs'da görünüyor ✅
- [x] Quote update audit_logs'da görünüyor ✅
- [x] Quote updateForm audit_logs'da görünüyor ✅
- [x] Quote setManualPrice/clearManualPrice audit_logs'da görünüyor ✅
- [x] Quote delete audit_logs'da görünüyor ✅
- [x] logOperation() entegrasyonu ✅

**Uygulama Notu (2025-12-11):**
Quote controller'a audit logging eklendi. 8 farklı aksiyon loglanıyor: create, update, approve, reject, statusChange, updateForm, setManualPrice, clearManualPrice, delete. Tüm endpoint'ler birleşik `logOperation()` formatını kullanıyor.

---

### P2.1: UsersTab Activity Görünümü Düzeltmesi

**Bağımlılık:** P0.1, P0.2 tamamlanmış olmalı

**Amaç:** UsersTab'da boş activity durumunu düzelt.

**Prompt:**
```
UsersTab.jsx dosyasındaki session detay modal'ında activity görünümünü iyileştir.

## SORUN
sessionActivities boş geldiğinde "Bu oturum için sistem aktiviteleri yakında eklenecek." mesajı gösteriliyor.

## DEĞİŞİKLİKLER

1. Fallback mesajını daha bilgilendirici yap:
```javascript
: React.createElement('div', { 
    style: { 
      color: '#666', 
      fontSize: '14px', 
      textAlign: 'center', 
      padding: '20px',
      backgroundColor: '#f9f9f9',
      borderRadius: '6px'
    }
  },
  React.createElement('p', { style: { marginBottom: '8px' } }, 
    '📋 Bu oturum için henüz aktivite kaydı yok.'
  ),
  React.createElement('p', { style: { fontSize: '12px', color: '#888', margin: 0 } }, 
    `Giriş: ${formatDateTime(selectedSession.loginTime)}`,
    selectedSession.logoutTime && ` | Çıkış: ${formatDateTime(selectedSession.logoutTime)}`
  )
)
```

2. Login/logout bilgisini her zaman göster (aktivite olmasa bile):
```javascript
// Session info grid'ine ekle
React.createElement('div', null,
  React.createElement('div', { 
    style: { fontSize: '12px', color: '#888', textTransform: 'uppercase' } 
  }, 'Çıkış'),
  React.createElement('div', null, 
    selectedSession.logoutTime 
      ? formatDateTime(selectedSession.logoutTime) 
      : React.createElement('span', { style: { color: '#28a745' } }, '🟢 Aktif')
  )
)
```

## TEST
- Login yap
- Settings → Log History aç
- Kendi session'ına tıkla
- "Çıkış: 🟢 Aktif" görünmeli
- Logout yap, tekrar aç
- "Çıkış: [tarih]" görünmeli
```

**Düzenlenecek Dosya:**
- `/WebApp/src/components/settings/UsersTab.jsx` ✅

**Başarı Kriterleri:**
- [x] Boş aktivite durumunda anlamlı mesaj ✅
- [x] Login/logout zamanları her zaman görünüyor ✅
- [x] Aktif session yeşil gösterge ✅

**Uygulama Notu (2025-12-11):**
Session detay modal'ına "Çıkış" alanı eklendi. Aktif oturumlar "🟢 Aktif" gösteriyor. Boş aktivite durumunda bilgilendirici mesaj ve giriş/çıkış zamanları gösteriliyor.

---

### P1.3: MES (Production) Audit Logging

**Bağımlılık:** P1.1 tamamlanmış olmalı

**Amaç:** MES sistemindeki kritik aksiyonları logla.

**Prompt:**
```
MES (Production) domain'ine audit logging ekle.

## HEDEF DOSYA
/WebApp/domains/production/api/controllers/productionPlanController.js

## EKLENECEK AUDIT LOGLAR

### 1. İmport ekle (dosya başına)
```javascript
import { logAuditEvent } from '../../../../server/auditTrail.js';
```

### 2. createProductionPlan
Başarılı create sonrası:
```javascript
logAuditEvent({
  entityType: 'plan',
  entityId: plan.id,
  action: 'create',
  changes: {
    orderCode: plan.orderCode,
    status: plan.status,
    nodesCount: plan.nodes?.length || 0
  },
  performer: { email: req.user?.email, sessionId: req.user?.sessionId },
  ipAddress: req.ip
}).catch(() => {});
```

### 3. launchProductionPlan
```javascript
logAuditEvent({
  entityType: 'plan',
  entityId: req.params.id,
  action: 'launch',
  changes: { launchedAt: new Date().toISOString(), assignmentsCreated: result.assignmentsCreated },
  performer: { email: req.user?.email, sessionId: req.user?.sessionId },
  ipAddress: req.ip
}).catch(() => {});
```

### 4. pauseProductionPlan
```javascript
logAuditEvent({
  entityType: 'plan',
  entityId: req.params.id,
  action: 'pause',
  changes: { pausedAt: new Date().toISOString() },
  performer: { email: req.user?.email, sessionId: req.user?.sessionId },
  ipAddress: req.ip
}).catch(() => {});
```

### 5. resumeProductionPlan
```javascript
logAuditEvent({
  entityType: 'plan',
  entityId: req.params.id,
  action: 'resume',
  changes: { resumedAt: new Date().toISOString() },
  performer: { email: req.user?.email, sessionId: req.user?.sessionId },
  ipAddress: req.ip
}).catch(() => {});
```

### 6. deleteProductionPlan
```javascript
logAuditEvent({
  entityType: 'plan',
  entityId: req.params.id,
  action: 'delete',
  changes: { deletedAt: new Date().toISOString() },
  performer: { email: req.user?.email, sessionId: req.user?.sessionId },
  ipAddress: req.ip
}).catch(() => {});
```

## TEST
- Yeni plan oluştur → audit_logs'da plan.create görünmeli
- Plan'ı launch et → audit_logs'da plan.launch görünmeli
```

**Düzenlenecek Dosya:**
- `/WebApp/domains/production/api/controllers/productionPlanController.js` ✅

**Başarı Kriterleri:**
- [x] plan.create loglanıyor ✅
- [x] plan.launch loglanıyor ✅
- [x] plan.pause/resume loglanıyor ✅
- [x] plan.delete loglanıyor ✅

**Uygulama Notu (2025-12-11):**
MES Production Plan controller'a audit logging eklendi. Create, update, delete, pause, resume ve launch işlemleri `logOperation` ile birleşik formatta loglanıyor.


---

### P1.3a: MES Production Plan UI Durum Düzeltmesi

**Bağımlılık:** P1.3 tamamlanmış olmalı

**Amaç:** Production Plan tablosunda plan durumlarını doğru göster ve pause/resume aksiyonlarını çalışır hale getir.

**Sorun:**
Plan launch edildikten sonra bile UI'da "Plan Hazırlanıyor" (preparing) durumunda gösteriliyor. Bu yüzden pause/resume butonları görünmüyor. Ayrıca MES sisteminde detay panelleri (window'lar) sayfa yüklendiğinde açık geliyor.

**Prompt:**
```
MES Production Plan tablosundaki durum gösterimini, aksiyon butonlarını ve detay panellerini düzelt.

## SORUNLAR
1. Launch edilen planlar hala "Plan Hazırlanıyor" gösteriyor
2. Pause/Resume butonları launch edilmiş planlar için görünmüyor
3. Plan durumları (preparing/active/paused) backend'den doğru gelmiyor veya UI'da yanlış yorumlanıyor
4. **YENİ:** Detay panelleri (assignment details, plan details vb.) sayfa yüklendiğinde açık/görünür durumda geliyor

## DOSYALAR
- `/WebApp/domains/production/js/productionPlans.js` - Plan tablosu render
- `/WebApp/domains/production/js/approvedQuotes.js` - Approved quotes tablosu
- `/WebApp/domains/production/api/services/productionPlanService.js` - Plan durumu yönetimi

## KONTROLLER
1. Backend'de plan launch edildiğinde `status` doğru update ediliyor mu?
   - `preparing` -> `active` olmalı launch sonrası
   
2. Frontend'de state mapping doğru mu?
   ```javascript
   // preparing -> "Plan Hazırlanıyor"
   // active -> "Aktif" (pause/resume butonları görünür)
   // paused -> "Duraklatıldı" (resume butonu görünür)
   // completed -> "Tamamlandı"
   ```

3. Aksiyon butonları:
   - Launch butonu: `status === 'draft'` veya `status === 'preparing'`
   - Pause butonu: `status === 'active'`
   - Resume butonu: `status === 'paused'`

## DÜZELTİLECEKLER

### 1. productionPlanService.js - Launch sonrası status update
```javascript
// launchProductionPlan içinde
await trx('mes.production_plans')
  .where('id', planId)
  .update({
    status: 'active',  // ← preparing'den active'e geçmeli
    launchedAt: new Date(),
    updatedAt: new Date()
  });
```

### 2. productionPlans.js - State gösterimi
```javascript
function renderStateCell(plan) {
  const stateMap = {
    draft: { text: 'Taslak', class: 'state-draft' },
    preparing: { text: 'Plan Hazırlanıyor', class: 'state-preparing' },
    active: { text: 'Aktif', class: 'state-active' },
    paused: { text: 'Duraklatıldı', class: 'state-paused' },
    completed: { text: 'Tamamlandı', class: 'state-completed' }
  };
  
  const state = stateMap[plan.status] || { text: plan.status, class: '' };
  return `<div class="state-text ${state.class}">${state.text}</div>`;
}
```

### 3. productionPlans.js - Aksiyon butonları
```javascript
function renderActionButtons(plan) {
  const canLaunch = plan.status === 'draft' || plan.status === 'preparing';
  const canPause = plan.status === 'active';
  const canResume = plan.status === 'paused';
  
  let html = '';
  
  if (canLaunch) {
    html += `<button onclick="launchPlan('${plan.id}')" class="btn-launch">🚀 Başlat</button>`;
  }
  
  if (canPause) {
    html += `<button onclick="pausePlan('${plan.id}')" class="btn-pause">⏸ Duraklat</button>`;
  }
  
  if (canResume) {
    html += `<button onclick="resumePlan('${plan.id}')" class="btn-resume">▶ Devam</button>`;
  }
  
  return html || '<span class="action-status-completed">Tamamlandı</span>';
}
```

### 4. Detay Panellerini Başlangıçta Kapalı Tut

MES modülündeki tüm detay window/panel'leri sayfa yüklendiğinde kapalı olmalı:

```javascript
// productionPlans.js, assignmentDetails.js, vb. - init fonksiyonlarında
function initializePanels() {
  // Tüm detay panellerini gizle
  const detailPanels = document.querySelectorAll('.detail-panel, .detail-window, .assignment-detail-panel');
  detailPanels.forEach(panel => {
    panel.style.display = 'none';
    panel.classList.remove('active', 'visible');
  });
}

// Sayfa yüklendiğinde çağır
document.addEventListener('DOMContentLoaded', () => {
  initializePanels();
  // ... diğer init fonksiyonları
});
```

**Kontrol Edilecek Dosyalar:**
- `/WebApp/domains/production/js/productionPlans.js`
- `/WebApp/domains/production/js/approvedQuotes.js`
- `/WebApp/domains/production/js/assignmentDetails.js` (varsa)
- `/WebApp/domains/production/html/production.html` - CSS class kontrolleri

## TEST
1. Sayfayı yenile - Hiçbir detay paneli açık olmamalı
2. Plan oluştur
2. Launch et
3. UI'da "Aktif" görmeli, "Duraklat" butonu olmalı
4. Duraklat
5. "Duraklatıldı" görmeli, "Devam" butonu olmalı
6. Devam ettir
7. Tekrar "Aktif" görmeli
```

**Düzenlenecek Dosyalar:**
- `/WebApp/domains/production/api/services/productionPlanService.js`
- `/WebApp/domains/production/js/productionPlans.js`
- `/WebApp/domains/production/js/approvedQuotes.js` (approved quotes tablosunda da aynı sorun varsa)

**Başarı Kriterleri:**
- [x] Launch edilen plan "Aktif" durumunda görünüyor ✅
- [x] Launch edilen planda "Duraklat" butonu var ✅
- [x] Pause edilen plan "Duraklatıldı" durumunda ✅
- [x] Pause edilen planda "Devam" butonu var ✅
- [x] Resume edilen plan tekrar "Aktif" durumunda ✅
- [x] Sayfa yüklendiğinde detay panelleri kapalı ✅

**Uygulama Notu (2025-12-12):**

P1.3a başarıyla tamamlandı. Ek olarak aşağıdaki geliştirmeler yapıldı:

#### 1. Pause/Resume İyileştirmeleri

**Backend (`productionPlanService.js`):**
- `pauseProductionPlan` artık paused assignment detaylarını dönüyor (ID, worker, station)
- `resumeProductionPlan` artık resumed count dönüyor

**Controller (`productionPlanController.js`):**
- Pause/resume response'larına `pausedAssignments` ve `resumedCount` eklendi

**Frontend (`approvedQuotes.js`):**
- Pause success message artık detaylı assignment listesi gösteriyor:
  ```
  Üretim planı duraklatıldı!
  
  Duraklatılan iş paketleri:
  
  • 157
    İşçi: Ahmet Yılmaz
    İstasyon: CNC Tezgahı 1
  
  • 158
    İşçi: Mehmet Demir
    İstasyon: Kaynak Tezgahı A
  
  ... ve 3 iş paketi daha
  ```
- Resume message artık doğru count gösteriyor (artık "undefined" yok)

#### 2. Route Designer Table Styling Fix

**Sorun:** Route Designer, Stations, Workers, Operations ve diğer tüm MES tablolarında başlık stilleri eksikti (bold değil, background yok)

**Çözüm:**
- `/WebApp/domains/production/styles/production.css` dosyasına `.mes-table` base class eklendi
- Tüm MES tabloları artık düzgün başlık stilleriyle görüntüleniyor (bold, gri arka plan)

**Düzeltilen Dosyalar:**
- `production.css` (`.mes-table` class eklendi)

#### 3. Production Page CDN Timeout Fix

**Sorun:** `production.html` Tailwind CDN yüklenirken sayfa donuyordu

**Çözüm:** 
- Tailwind CDN comment out edildi (kullanılmıyordu zaten)
- Lucide icons ve Font Awesome CDN'leri korundu

**Düzeltilen Dosyalar:**
- `pages/production.html` (Tailwind CDN comment out)


---

### P1.4: MES Assignment Audit Logging


**Bağımlılık:** P1.1 tamamlanmış olmalı

**Amaç:** İşçi görev başlatma ve tamamlama işlemlerini logla.

**Prompt:**
```
MES Assignment controller'ına audit logging ekle.

## HEDEF DOSYA
/WebApp/domains/production/api/controllers/assignmentController.js

## EKLENECEK AUDIT LOGLAR

### 1. İmport ekle
```javascript
import { logAuditEvent } from '../../../../server/auditTrail.js';
```

### 2. startAssignment
```javascript
// result.success true ise:
logAuditEvent({
  entityType: 'assignment',
  entityId: assignmentId,
  action: 'start',
  changes: {
    workerId,
    startedAt: new Date().toISOString()
  },
  performer: { email: workerId }, // İşçi portalından geldiği için
  ipAddress: req.ip
}).catch(() => {});
```

### 3. completeAssignment (ÖNEMLİ - üretim miktarı kaydı)
```javascript
logAuditEvent({
  entityType: 'assignment',
  entityId: assignmentId,
  action: 'complete',
  changes: {
    workerId,
    quantityProduced,
    defectQuantity: defectQuantity || 0,
    completedAt: new Date().toISOString()
  },
  performer: { email: workerId },
  ipAddress: req.ip
}).catch(() => {});
```

## NOT
- pause/resume loglanmayacak (çok sık)
- getNextTask, getTaskStats gibi okuma işlemleri loglanmayacak

## TEST
- İşçi portalından görev başlat → assignment.start logu
- Görev tamamla → assignment.complete logu (miktar dahil)
```

**Düzenlenecek Dosya:**
- `/WebApp/domains/production/api/controllers/assignmentController.js`

**Başarı Kriterleri:**
- [ ] assignment.start loglanıyor
- [ ] assignment.complete üretim miktarı ile loglanıyor

---

### P1.5: MES Scrap (Fire) Audit Logging

**Bağımlılık:** P1.1 tamamlanmış olmalı

**Amaç:** Fire kayıtlarını logla (malzeme kaybı takibi).

**Prompt:**
```
Scrap controller'ına audit logging ekle.

## HEDEF DOSYA
/WebApp/domains/production/api/controllers/scrapController.js

## EKLENECEK AUDIT LOGLAR

### 1. recordScrap
```javascript
// Başarılı kayıt sonrası:
logAuditEvent({
  entityType: 'scrap',
  entityId: id, // work package id
  action: 'record',
  changes: {
    scrapType: req.body.scrapType,
    materialCode: req.body.materialCode,
    quantity: req.body.quantity,
    reason: req.body.reason || null
  },
  performer: { email: req.user?.email || req.body.workerId },
  ipAddress: req.ip
}).catch(() => {});
```

### 2. removeScrap
```javascript
logAuditEvent({
  entityType: 'scrap',
  entityId: id,
  action: 'remove',
  changes: {
    scrapType,
    materialCode,
    quantity
  },
  performer: { email: req.user?.email },
  ipAddress: req.ip
}).catch(() => {});
```

## TEST
- Fire kaydet → scrap.record logu
- Fire sil → scrap.remove logu
```

**Düzenlenecek Dosya:**
- `/WebApp/domains/production/api/controllers/scrapController.js`

**Başarı Kriterleri:**
- [ ] scrap.record loglanıyor
- [ ] scrap.remove loglanıyor

---

### P1.6: Materials Shipment Audit Logging

**Bağımlılık:** P1.1 tamamlanmış olmalı

**Amaç:** Sevkiyat işlemlerini logla.

**Prompt:**
```
Shipment controller'ına audit logging ekle.

## HEDEF DOSYA
/WebApp/domains/materials/api/controllers/shipmentController.js

## EKLENECEK AUDIT LOGLAR

### 1. createShipment
```javascript
logAuditEvent({
  entityType: 'shipment',
  entityId: result.shipment.id,
  action: 'create',
  changes: {
    shipmentCode: result.shipment.shipmentCode,
    customerId: result.shipment.customerId,
    itemsCount: result.shipment.items?.length || 0
  },
  performer: { email: req.user?.email, sessionId: req.user?.sessionId },
  ipAddress: req.ip
}).catch(() => {});
```

### 2. cancelShipment
```javascript
logAuditEvent({
  entityType: 'shipment',
  entityId: req.params.id,
  action: 'cancel',
  changes: { cancelledAt: new Date().toISOString(), stockRestored: true },
  performer: { email: req.user?.email, sessionId: req.user?.sessionId },
  ipAddress: req.ip
}).catch(() => {});
```

### 3. exportShipment (e-İrsaliye)
```javascript
logAuditEvent({
  entityType: 'shipment',
  entityId: req.params.id,
  action: 'export',
  changes: { format: req.params.format, exportedAt: new Date().toISOString() },
  performer: { email: req.user?.email, sessionId: req.user?.sessionId },
  ipAddress: req.ip
}).catch(() => {});
```

### 4. importShipmentConfirmation
```javascript
logAuditEvent({
  entityType: 'shipment',
  entityId: req.params.id,
  action: 'import',
  changes: { 
    externalDocNumber: externalDocNumber,
    stockDecreased: true,
    importedAt: new Date().toISOString()
  },
  performer: { email: req.user?.email, sessionId: req.user?.sessionId },
  ipAddress: req.ip
}).catch(() => {});
```

## TEST
- Sevkiyat oluştur → shipment.create logu
- Sevkiyat iptal et → shipment.cancel logu
- Export yap → shipment.export logu
```

**Düzenlenecek Dosya:**
- `/WebApp/domains/materials/api/controllers/shipmentController.js`

**Başarı Kriterleri:**
- [ ] shipment.create loglanıyor
- [ ] shipment.cancel loglanıyor
- [ ] shipment.export loglanıyor
- [ ] shipment.import loglanıyor

---

### P1.7: Materials Order & Stock Audit Logging

**Bağımlılık:** P1.1 tamamlanmış olmalı

**Amaç:** Satın alma ve stok işlemlerini logla.

**Prompt:**
```
Order ve Stock controller'larına audit logging ekle.

## HEDEF DOSYALAR
1. /WebApp/domains/materials/api/controllers/orderController.js
2. /WebApp/domains/materials/api/controllers/stockController.js

## ORDER AUDIT LOGLARI

### createOrder
```javascript
logAuditEvent({
  entityType: 'order',
  entityId: order.id,
  action: 'create',
  changes: {
    orderCode: order.orderCode,
    supplierId: order.supplierId,
    totalAmount: order.totalAmount,
    itemsCount: order.items?.length || 0
  },
  performer: { email: req.user?.email, sessionId: req.user?.sessionId },
  ipAddress: req.ip
}).catch(() => {});
```

### deliverItem (stok girişi)
```javascript
logAuditEvent({
  entityType: 'order',
  entityId: orderId,
  action: 'deliver',
  changes: {
    itemId,
    quantityDelivered: deliveryData.quantity,
    lotNumber: result.lotNumber,
    stockUpdated: true
  },
  performer: { email: req.user?.email, sessionId: req.user?.sessionId },
  ipAddress: req.ip
}).catch(() => {});
```

## STOCK AUDIT LOGLARI

### updateStock (manuel düzeltme)
```javascript
logAuditEvent({
  entityType: 'stock',
  entityId: code, // material code
  action: 'update',
  changes: {
    adjustment: req.body.adjustment,
    reason: req.body.reason,
    newStock: result.newStock
  },
  performer: { email: req.user?.email, sessionId: req.user?.sessionId },
  ipAddress: req.ip
}).catch(() => {});
```

## NOT
- reserveStock ve releaseReservation loglanmayacak (otomatik sistem)

## TEST
- Sipariş oluştur → order.create logu
- Teslimat yap → order.deliver logu
- Stok düzelt → stock.update logu
```

**Düzenlenecek Dosyalar:**
- `/WebApp/domains/materials/api/controllers/orderController.js`
- `/WebApp/domains/materials/api/controllers/stockController.js`

**Başarı Kriterleri:**
- [ ] order.create loglanıyor
- [ ] order.deliver loglanıyor (stok girişi)
- [ ] stock.update loglanıyor (manuel düzeltme)

---

## 📊 FİNAL ÖZET (GÜNCELLENDİ v2.2)

| FAZ | Konu | Prompt Sayısı | Tahmini Süre |
|-----|------|---------------|--------------|
| 0 | Kritik Bug Fix | 2 (P0.1-P0.2) | 30 dk |
| 1 | Audit Core + CRM | 4 (P1.1-P1.4) | 2.5 saat |
| 2 | Audit MES | 4 (P2.1-P2.4) | 2 saat |
| 3 | Audit Materials | 3 (P3.1-P3.3) | 1.5 saat |
| 4 | Frontend + Test | 2 (P4.1-P4.2) | 1.5 saat |
| **TOPLAM** | | **15 PROMPT** | **~8 saat** |

---

### FAZ DETAYLARI

#### FAZ 0: Kritik Bug Fix
| Prompt | Kapsam | Dosya |
|--------|--------|-------|
| P0.1 | authRoutes.js logout düzeltmesi | `server/authRoutes.js` |
| P0.2 | sessions.js updateSession düzeltmesi | `db/models/sessions.js` |

#### FAZ 1: Audit Core + CRM
| Prompt | Kapsam | Dosya |
|--------|--------|-------|
| P1.1 | logAuditEvent helper | `server/auditTrail.js` |
| P1.2 | Quote CRUD + updateForm | `domains/crm/api/controllers/quoteController.js` |
| P1.3 | Customer update | `domains/crm/api/controllers/customerController.js` |
| P1.4 | PriceSettings + FormTemplate + ServiceCard | `domains/crm/api/controllers/priceController.js`, `formController.js`, `serviceCardsController.js` |

#### FAZ 2: Audit MES
| Prompt | Kapsam | Dosya |
|--------|--------|-------|
| P2.1 | Plan create/save/edit/launch/pause/resume/delete | `domains/production/api/controllers/productionPlanController.js` |
| P2.2 | Assignment start/complete | `domains/production/api/controllers/assignmentController.js` |
| P2.3 | Scrap record/remove | `domains/production/api/controllers/scrapController.js` |
| P2.4 | Worker + Station + Substation + Operation + Holiday | `workerController.js`, `stationController.js`, `substationController.js`, `operationController.js`, `holidayController.js` |

#### FAZ 3: Audit Materials
| Prompt | Kapsam | Dosya |
|--------|--------|-------|
| P3.1 | Shipment CRUD + addItem/removeItem + Export/Import | `domains/materials/api/controllers/shipmentController.js` |
| P3.2 | Order create/update/deliver + Stock update | `orderController.js`, `stockController.js` |
| P3.3 | Material + Supplier + Category | `materialController.js`, `supplierController.js`, `categoryController.js` |

#### FAZ 4: Frontend + Test
| Prompt | Kapsam | Dosya |
|--------|--------|-------|
| P4.1 | UsersTab Activity görünümü düzeltmesi | `src/components/settings/UsersTab.jsx` |
| P4.2 | Final E2E test + doğrulama | Tüm sistem |

---

## 🌐 ORTAM FARKLARI: SERVERLESS vs LOCAL

### Production (Vercel + Neon)
```
┌─────────────────────────────────────────────────────────┐
│                    VERCEL SERVERLESS                     │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐      │
│  │  Function 1 │  │  Function 2 │  │  Function N │      │
│  │  (Request)  │  │  (Request)  │  │  (Request)  │      │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘      │
│         │                │                │              │
│         └────────────────┼────────────────┘              │
│                          ▼                               │
│              ┌───────────────────────┐                   │
│              │   NEON PostgreSQL     │                   │
│              │   (Persistent DB)     │                   │
│              │   - sessions table    │                   │
│              │   - audit_logs table  │                   │
│              └───────────────────────┘                   │
│                                                          │
│  ⚠️ Memory paylaşılmıyor - Her function ayrı instance   │
│  ✅ Session persist: PostgreSQL'den oku                 │
│  ✅ Audit logs: Direkt PostgreSQL'e yaz                 │
└─────────────────────────────────────────────────────────┘
```

### Development (Local PostgreSQL)
```
┌─────────────────────────────────────────────────────────┐
│                    LOCAL NODE.JS                         │
│  ┌─────────────────────────────────────────────────┐    │
│  │              Single Process                      │    │
│  │  ┌─────────────────────────────────────────┐   │    │
│  │  │       Memory Cache (Map)                 │   │    │
│  │  │  - sessions (by token)                   │   │    │
│  │  │  - sessionsById                          │   │    │
│  │  └─────────────────────────────────────────┘   │    │
│  │                     │                           │    │
│  │                     ▼                           │    │
│  │  ┌─────────────────────────────────────────┐   │    │
│  │  │       Local PostgreSQL                   │   │    │
│  │  │   - sessions table (backup)              │   │    │
│  │  │   - audit_logs table                     │   │    │
│  │  └─────────────────────────────────────────┘   │    │
│  └─────────────────────────────────────────────────┘    │
│                                                          │
│  ✅ Memory cache: Hızlı erişim                          │
│  ✅ PostgreSQL: Kalıcı depolama                         │
│  ⚠️ Server restart: Memory temizlenir, DB'den yüklenir  │
└─────────────────────────────────────────────────────────┘
```

### Ortam Bağımsız Çalışma Prensibi

```javascript
// auditTrail.js - Her iki ortamda da çalışır
export async function logAuditEvent(options) {
  // 1. Her zaman PostgreSQL'e yaz (kalıcı)
  await db('settings.audit_logs').insert({
    entityType: options.entityType,
    entityId: String(options.entityId),
    action: options.action,
    changes: JSON.stringify(options.changes),
    userId: options.performer?.userName || options.performer?.email,
    userEmail: options.performer?.email,
    createdAt: new Date(),
    ipAddress: options.ipAddress
  });
  
  // 2. Session activity log'a ekle (opsiyonel, memory'de)
  if (options.performer?.sessionId) {
    // Serverless'ta memory olmayabilir - sessiz başarısız ol
    try {
      await updateSessionActivity(options.performer.sessionId, options);
    } catch (e) {
      // Ignore - audit_logs'da zaten kayıt var
    }
  }
}
```

### Test Kontrol Listesi

#### Local Development
- [ ] `npm run dev` ile server başlat
- [ ] Login yap
- [ ] Logout yap
- [ ] `SELECT * FROM sessions WHERE email = 'your@email.com' ORDER BY "loginTime" DESC LIMIT 5;`
- [ ] `logoutTime` dolu olmalı
- [ ] `SELECT * FROM settings.audit_logs ORDER BY "createdAt" DESC LIMIT 10;`
- [ ] Logout logu görünmeli

#### Production (Vercel)
- [ ] Deploy yap
- [ ] Login yap (production URL)
- [ ] Birkaç işlem yap (quote oluştur, vs.)
- [ ] Logout yap
- [ ] Neon console'dan audit_logs kontrol et
- [ ] Tüm loglar görünmeli

---

## İLGİLİ DOSYALAR (GÜNCELLENDİ)

### Backend - Core
- `/WebApp/server/auth.js` - Session yönetimi
- `/WebApp/server/authRoutes.js` - Login/logout API
- `/WebApp/server/auditTrail.js` - Audit logging helper
- `/WebApp/db/models/sessions.js` - PostgreSQL session CRUD

### Backend - CRM
- `/WebApp/domains/crm/api/controllers/quoteController.js` - Teklif API
- `/WebApp/domains/crm/api/controllers/customerController.js` - Müşteri API
- `/WebApp/domains/crm/api/controllers/priceController.js` - Fiyat ayarları
- `/WebApp/domains/crm/api/controllers/formController.js` - Form şablonları
- `/WebApp/domains/crm/api/controllers/serviceCardsController.js` - Hizmet kartları

### Backend - MES
- `/WebApp/domains/production/api/controllers/productionPlanController.js` - Üretim planı
- `/WebApp/domains/production/api/controllers/assignmentController.js` - İşçi görevleri
- `/WebApp/domains/production/api/controllers/scrapController.js` - Fire kayıtları
- `/WebApp/domains/production/api/controllers/workOrderController.js` - İş emirleri
- `/WebApp/domains/production/api/controllers/workerController.js` - İşçi yönetimi
- `/WebApp/domains/production/api/controllers/stationController.js` - İstasyon tanımları
- `/WebApp/domains/production/api/controllers/substationController.js` - Alt istasyonlar
- `/WebApp/domains/production/api/controllers/operationController.js` - Operasyonlar
- `/WebApp/domains/production/api/controllers/holidayController.js` - Tatil günleri

### Backend - Materials
- `/WebApp/domains/materials/api/controllers/shipmentController.js` - Sevkiyat
- `/WebApp/domains/materials/api/controllers/orderController.js` - Satın alma
- `/WebApp/domains/materials/api/controllers/stockController.js` - Stok yönetimi
- `/WebApp/domains/materials/api/controllers/materialController.js` - Malzeme tanımları
- `/WebApp/domains/materials/api/controllers/supplierController.js` - Tedarikçiler
- `/WebApp/domains/materials/api/controllers/categoryController.js` - Kategoriler

### Frontend
- `/WebApp/src/components/settings/UsersTab.jsx` - Log History UI
- `/WebApp/src/hooks/useSessionCleanup.js` - Tab kapanma logout

### Database
- `public.sessions` - Session tablosu
- `settings.audit_logs` - Audit log tablosu

---

## 🔄 UYGULAMA SIRASI (GÜNCELLENDİ)

```
┌─────────────────────────────────────────────────────────────────────┐
│                         FAZ 0: BUGFIX (30 dk)                       │
├─────────────────────────────────────────────────────────────────────┤
│  P0.1 ──┬──► P0.2                                                   │
│         │    (paralel yapılabilir)                                  │
│         ▼                                                           │
│  ┌─────────────────────────────────────────┐                        │
│  │ TEST: npm run dev                        │                        │
│  │ 1. Login yap                            │                        │
│  │ 2. Logout yap                           │                        │
│  │ 3. DB kontrol: logoutTime dolu mu?      │                        │
│  └─────────────────────────────────────────┘                        │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    FAZ 1: AUDIT CORE + CRM (2.5 saat)               │
├─────────────────────────────────────────────────────────────────────┤
│  P1.1 (auditTrail helper)                                           │
│    ▼                                                                │
│  P1.2 (Quote CRUD + updateForm)                                     │
│    ▼                                                                │
│  P1.3 (Customer update)                                             │
│    ▼                                                                │
│  P1.4 (PriceSettings + FormTemplate + ServiceCard)                  │
│    ▼                                                                │
│  ┌─────────────────────────────────────────┐                        │
│  │ TEST: Quote oluştur → audit_logs kontrol │                        │
│  └─────────────────────────────────────────┘                        │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      FAZ 2: AUDIT MES (2 saat)                      │
├─────────────────────────────────────────────────────────────────────┤
│  P2.1 (Plan CRUD + save/edit/launch/pause/resume)                   │
│    ▼                                                                │
│  P2.2 ──┬──► P2.3 ──► P2.4                                          │
│         │    (paralel yapılabilir)                                  │
│    ▼                                                                │
│  ┌─────────────────────────────────────────┐                        │
│  │ TEST: Plan oluştur → launch → audit_logs │                        │
│  └─────────────────────────────────────────┘                        │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                   FAZ 3: AUDIT MATERIALS (1.5 saat)                 │
├─────────────────────────────────────────────────────────────────────┤
│  P3.1 (Shipment + items + export/import)                            │
│    ▼                                                                │
│  P3.2 ──┬──► P3.3                                                   │
│         │    (paralel yapılabilir)                                  │
│    ▼                                                                │
│  ┌─────────────────────────────────────────┐                        │
│  │ TEST: Sevkiyat oluştur → audit_logs      │                        │
│  └─────────────────────────────────────────┘                        │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                   FAZ 4: FRONTEND + TEST (1.5 saat)                 │
├─────────────────────────────────────────────────────────────────────┤
│  P4.1 (UsersTab Activity görünümü)                                  │
│    ▼                                                                │
│  P4.2 (Final E2E test)                                              │
│    ▼                                                                │
│  ┌─────────────────────────────────────────┐                        │
│  │ FINAL TEST:                              │                        │
│  │ 1. Local'de tüm akışları test et        │                        │
│  │ 2. Vercel'e deploy et                   │                        │
│  │ 3. Production'da test et                │                        │
│  │ 4. Log History UI'da loglar görünüyor   │                        │
│  └─────────────────────────────────────────┘                        │
└─────────────────────────────────────────────────────────────────────┘
```

---

## ✅ TAMAMLANMA KRİTERLERİ

### Her FAZ için:
- [ ] Kod değişiklikleri yapıldı
- [ ] Local'de test edildi
- [ ] Console.log çıktıları doğru
- [ ] PostgreSQL'de kayıtlar görünüyor
- [ ] Hata yok

### Final Onay:
- [ ] Tüm 67 log noktası çalışıyor
- [ ] Local development çalışıyor
- [ ] Vercel production çalışıyor
- [ ] Log History UI'da loglar görünüyor
- [ ] Logout time düzgün kaydediliyor
- [ ] Session activity log doluyor

---

*Bu plan BeePlan Session & Audit Logging sisteminin güçlendirilmesi içindir.*
*Oluşturulma: 11 Aralık 2025*
*Son Güncelleme: v2.2 - Kapsamlı sistem analizi, use-case bazlı loglama ve ortam farkları eklendi*

---

## APPENDIX: Future Development Tasks

Bu bölüm, audit logging implementasyonu sırasında belirlenen ancak şu an için ertelenen geliştirme görevlerini içerir.

### FD-1: Force Pause with Production Tracking

**Durum**: Ertelenmiş  
**Öncelik**: Orta  
**İlişkili**: P1.3a - MES Production Plan UI Fixes

**Problem Tanımı:**
Şu anda bir production plan sadece `pending` veya `queued` görevler varsa pause edilebilir. Eğer bazı görevler `in_progress` durumundaysa (işçiler aktif olarak çalışıyorsa), pause işlemi şu hata ile reddedilir: "Cannot pause - some tasks are in progress."

**İhtiyaç:**
Production şefi, acil durumda (makine arızası, malzeme eksikliği, vb.) aktif üretimi durdurmak isteyebilir. Bu durumda:
- Yarı tamamlanmış işlerin miktarlarının kaydedilmesi
- Fire/hurdaların sayılması (worker "fire" modalinden)
- Tüketilen malzemelerin hesaplanması
- Resume sırasında kalan işin ayarlanması
gerekir.

**Önerilen Çözüm:**

1. **Force Pause Flow:**
   ```
   Admin clicks "Durdur" 
   → System detects in_progress tasks
   → Shows modal: "Aktif görevler var - Force Pause yapmak ister misiniz?"
   → If confirmed, shows "Production Tracking Modal":
      - List all in_progress tasks
      - For each task:
        * Planned output: X units
        * Actual output completed: [INPUT] units
        * Scrap/Fire: [AUTO-FETCH from fire modal] units
        * Materials consumed: [AUTO-CALCULATE]
   → Confirm and pause
   ```

2. **Backend Changes:**
   - New endpoint: `POST /api/mes/production-plans/:id/force-pause`
   - Accept production tracking data
   - Update assignments with `actualOutput`, `scrapQty`
   - Adjust material reservations
   - Calculate remaining work

3. **Resume Behavior:**
   - When resuming, recalculate remaining work
   - Adjust downstream dependencies
   - Update material requirements

**Teknik Notlar:**
- `cancelProductionPlanWithProgress()` benzeri bir flow kullanılabilir
- Worker portal'daki fire tracking sistemi ile entegre olmalı
- Material accounting hassas olmalı

**Estimated Effort**: 3-4 gün

---

