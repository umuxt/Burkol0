# 📋 Lot Tracking Refactoring Plan (Optional Mode)

**Hedef:** Sistemin Lot Takibi (Lot Tracking) özelliğini opsiyonel hale getirmek. Sistem "Lotlu" ve "Lotsuz" olmak üzere iki modda çalışabilmeli ve bu ayar "System Settings" üzerinden yönetilmelidir.

**Durum:** ✅ Tamamlandı

---

## 1. Konfigürasyon ve Veritabanı (Configuration)

- [x] **Tablo Oluşturma:** `settings.settings` tablosunun oluşturulması (Key-Value yapısında genel sistem ayarları için).
  - ✅ Migration: `db/migrations/021_create_system_settings.js`
  - ✅ Model: `db/models/settings.js`
- [x] **Backend API:**
    - ✅ `GET /api/settings/system` endpoint'i.
    - ✅ `POST /api/settings/system` endpoint'i.
    - ✅ `isLotTrackingEnabled()` helper fonksiyonu.
    - ✅ Route: `server/settingsRoutes.js`
- [x] **Frontend UI:**
    - ✅ `settings.html` sayfasına "System" (Sistem) tabının eklenmesi.
    - ✅ Lot Takibi Açma/Kapama (Toggle switch) arayüzü: `src/components/settings/SystemTab.jsx`
    - ✅ Tab navigation: `domains/admin/settings-app.js`

## 2. Giriş Süreci (Entry: Purchasing -> Stock)

**Hedef:** Satın alma siparişi "Teslim Edildi" olduğunda lot üretimini şarta bağlamak.

- [x] **Refactor:** `OrderItems.deliverItem` (`db/models/orderItems.js`).
    - ✅ **Lot Açık:** Mevcut mantık (`generateLotNumber`) çalışır.
    - ✅ **Lot Kapalı:** `lotNumber` alanı `NULL` olarak kaydedilir. Stock hareketi lotsuz yapılır.

## 3. Tüketim Süreci (Process: MES Consumption)

**Hedef:** Üretim başlarken (`startTask`) stoktan düşüş mantığını şarta bağlamak.

- [x] **Refactor:** `lotConsumption.js` -> `reserveMaterialsWithLotTracking`.
    - ✅ **Lot Açık:** FIFO mantığıyla en eski lotları bulur, `assignment_material_reservations` tablosuna detaylı kayıt atar.
    - ✅ **Lot Kapalı:** Basit stok rezervasyonu yapar (Lot: NULL).
    - ✅ `createReservationRecordsWithoutLot()` fonksiyonu eklendi.

## 4. Çıktı Süreci (Exit: MES Output)

**Hedef:** İş bitiminde (`completeTask`) ürün çıktısını şarta bağlamak.

- [x] **Refactor:** `fifoScheduler.js` -> `completeTask`.
    - ✅ **Lot Açık:** `generateLotNumber` ile yeni lot üretir, stoğa lotlu giriş yapar.
    - ✅ **Lot Kapalı:** Stoğa lotsuz giriş yapar (lotNumber: null).

## 5. Stok Düzeltme ve İadeler (Adjustments)

- [x] **Refactor:** `releaseMaterialReservations` (İptal durumu).
    - ✅ Lotsuz rezervasyonların iadesinin düzgün yapılması (lotNumber: null olabilir).
- [x] **Refactor:** `completeTask` içindeki `adjustment` mantığı.
    - ✅ Lotsuz modda sadece miktar farkının stoğa yansıtılması.

## 6. Arayüz Uyarlamaları (UI Adaptations)

- [x] **Orders Delivery Modal:** `domains/orders/components/OrdersTabContent.jsx`
    - ✅ systemSettings yükleme eklendi
    - ✅ Lot tracking kapalıyken supplierLotCode, manufacturingDate, expiryDate alanları gizleniyor
    - ✅ Lot info message kapalıyken gizleniyor
- [x] **Worker Portal:** `domains/workerPortal/workerPortal.js`
    - ✅ `loadSystemSettings()` fonksiyonu eklendi
    - ✅ `loadLotPreviews()` - Lot tracking kapalıyken atlanıyor
    - ✅ `startTaskWithLotPreview()` - Lot tracking kapalıyken modal göstermeden işe başlıyor
    - ✅ `renderLotPreview()` - Lot tracking kapalıyken boş döndürüyor
- [x] **Material Details Panel:** `domains/materials/components/MaterialDetailsPanel.jsx`
    - ✅ systemSettings yükleme eklendi
    - ✅ "Lot Envanteri" bölümü lot tracking kapalıyken gizleniyor

---

## Veritabanı Şeması

**Tablo:** `settings.settings`

| Column | Type | Description |
| :--- | :--- | :--- |
| `key` | VARCHAR(50) | PK (örn: 'system_config') |
| `value` | JSONB | Ayar verisi (örn: `{ "lotTracking": false, "currency": "TRY" }`) |
| `updatedAt` | TIMESTAMP | |
| `updatedBy` | VARCHAR(100)| |

---

## Değiştirilen Dosyalar

### Backend
- `quote-portal/db/migrations/021_create_system_settings.js` - Migration
- `quote-portal/db/models/settings.js` - Settings model
- `quote-portal/db/models/orderItems.js` - Lot tracking conditional
- `quote-portal/server/settingsRoutes.js` - API routes
- `quote-portal/server/utils/fifoScheduler.js` - completeTask lot conditional
- `quote-portal/server/utils/lotConsumption.js` - Reservation with/without lot
- `quote-portal/server.js` - Added settingsRoutes

### Frontend
- `quote-portal/src/components/settings/SystemTab.jsx` - Toggle UI
- `quote-portal/domains/admin/settings-app.js` - Tab navigation
- `quote-portal/domains/orders/components/OrdersTabContent.jsx` - Delivery modal
- `quote-portal/domains/workerPortal/workerPortal.js` - Worker portal
- `quote-portal/domains/materials/components/MaterialDetailsPanel.jsx` - Material details lot inventory

---

## Notlar

*   ✅ Mevcut verilerin bütünlüğü korunmuştur.
*   ✅ "Lotsuz" mod seçilse bile, geçmişte oluşmuş lotlu kayıtlar silinmez, sadece yeni işlemlerde lot üretilmez.
*   ✅ Default değer `lotTracking: true` olarak backward compatibility sağlanmıştır.
