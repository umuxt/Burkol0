# 🛠️ BeePlan Codebase Refactoring & Modülerleştirme Planı (FileParsing)

Bu doküman, özellikle **WebApp/server/** ve **WebApp/shared/lib/** dizinlerindeki büyük ve karmaşık dosyaların daha yönetilebilir, modüler ve bakımı kolay bir yapıya kavuşturulması için hazırlanan yol haritasını içerir.

## 1. 🚨 Mevcut Durum Analizi ve Sorunlu Dosyalar

Yapılan analiz sonucunda aşağıdaki dosyaların acil olarak refactor edilmesi gerektiği belirlenmiştir:

| Dosya Yolu | Boyut | Sorun | Öncelik |
|---|---|---|---|
| **`WebApp/server/mesRoutes.js`** | **261K** | Aşırı büyük. Route, Controller ve Service mantığı iç içe geçmiş. Tek bir dosya tüm MES operasyonlarını yönetiyor. | 🔴 **Çok Yüksek** |
| `WebApp/server/utils/fifoScheduler.js` | 49K | Utility olamayacak kadar karmaşık iş mantığı içeriyor. Core business logic buraya sıkışmış. | 🟠 Yüksek |
| `WebApp/server/materialsRoutes.js` | 35K | Materials domaini için route ve logic ayrımı yapılmamış. | 🟡 Orta |
| `WebApp/shared/lib/api.js` | 34K | Frontend'in tüm API çağrıları tek dosyada. Domain bazlı ayrışma yok. | 🟡 Orta |
| `WebApp/server/utils/lotConsumption.js` | 27K | Stok düşüm mantığı karmaşıklaşıyor, servis katmanına taşınmalı. | 🟡 Orta |

---

## 2. 🏗️ Hedeflenen Mimari Yapı

Projeyi "Domain-Driven Design" (DDD) prensiplerine benzer, modüler bir yapıya dönüştüreceğiz.

### Genel Klasör Yapısı Prensibi

Her ana özellik (domain) kendi klasörüne sahip olacak ve içinde katmanlı bir yapı barındıracak:

```
WebApp/
└── server/
    ├── domains/              <-- YENİ: Tüm domain mantığı burada toplanacak
    │   ├── mes/              <-- MES Domaini
    │   │   ├── controllers/  <-- HTTP Request/Response yönetimi
    │   │   ├── services/     <-- İş mantığı (Business Logic)
    │   │   ├── repositories/ <-- Veritabanı sorguları (Knex/SQL)
    │   │   ├── routes.js     <-- Express Router tanımları
    │   │   └── index.js      <-- Dışarıya açılan kapı (Barrel file)
    │   ├── materials/
    │   ├── orders/
    │   └── ...
    ├── core/                 <-- YENİ: Ortak kullanılan çekirdek yapılar
    │   ├── database.js
    │   ├── middleware/
    │   └── utils/
    └── app.js                <-- Ana giriş noktası (sadeleşecek)
```

---

## 3. 📋 Adım Adım Uygulama Planı

### FAZ 1: `mesRoutes.js`'in Parçalanması (En Büyük Balık) 🦈

**Mevcut Durum:** `mesRoutes.js` içinde Production Plans, Worker Assignments, Queues, Shifts gibi birçok farklı mantık var.

**Eylem Planı:**
1.  `server/domains/mes/` klasörünü oluştur.
2.  `mesRoutes.js` içindeki kodları aşağıdaki alt domainlere göre ayır:
    *   **Production Plans:** `mes/controllers/planController.js`, `mes/services/planService.js`
    *   **Worker Assignments:** `mes/controllers/assignmentController.js`
    *   **Queue Management:** `mes/controllers/queueController.js`
    *   **Shift & Schedule:** `mes/controllers/scheduleController.js`
3.  Route tanımlarını `server/domains/mes/routes.js` içinde topla ve controller fonksiyonlarını buradan çağır.
4.  `server.js` içinde `mesRoutes.js` importunu yeni `server/domains/mes/routes.js` ile değiştir.

### FAZ 2: Yardımcı Dosyaların (Utils) Servislere Dönüştürülmesi

**Mevcut Durum:** `fifoScheduler.js`, `lotConsumption.js` gibi dosyalar `utils` klasöründe ama aslında birer "Service".

**Eylem Planı:**
1.  `fifoScheduler.js` -> `server/domains/mes/services/schedulerService.js` olarak taşınacak.
2.  `lotConsumption.js` -> `server/domains/inventory/services/consumptionService.js` (veya materials altına) taşınacak.
3.  Bu dosyaların içindeki fonksiyonlar, bağımlı oldukları diğer servisleri import edecek şekilde güncellenecek.

### FAZ 3: Frontend API (`api.js`) Refactoring

**Mevcut Durum:** Frontend tarafında tek bir devasa `api.js` var.

**Eylem Planı:**
1.  `WebApp/shared/api/` klasörü oluşturulacak.
2.  `api.js` parçalanacak:
    *   `mesApi.js`
    *   `materialsApi.js`
    *   `ordersApi.js`
    *   `authApi.js`
    *   `coreApi.js` (Temel fetch/axios mantığı)
3.  Eski `api.js`, geriye uyumluluk için bu yeni dosyalardan export yapacak şekilde (barrel file) düzenlenecek, böylece mevcut importlar kırılmayacak.

---

## 4. 🛡️ Dikkat Edilmesi Gerekenler ve Kurallar

1.  **Backward Compatibility (Geriye Uyumluluk):** Dosya yerleri değişse bile, dışarıya açılan API endpoint URL'leri (`/api/mes/...`) **KESİNLİKLE DEĞİŞMEMELİDİR**.
2.  **Import Paths:** Dosyaları taşırken `../../db/connection.js` gibi relative importlar bozulacaktır. Bunlar titizlikle güncellenmelidir.
3.  **Circular Dependencies:** Servisleri ayırırken birbirini çağıran servislerin (döngüsel bağımlılık) oluşmamasına dikkat edilmeli.
4.  **Atomik Değişiklikler:** Her seferinde sadece bir domain veya bir dosya grubu taşınmalı ve test edilmelidir. "Her şeyi aynı anda taşıma" yöntemi felakete yol açar.

## 5. 🚀 İlk Hedef: MES Domain

İlk olarak `WebApp/server/mesRoutes.js` dosyasını analiz edip `WebApp/server/domains/mes/` yapısını kuracağız.

Bu planı onaylıyorsanız, FAZ 1 ile başlayabiliriz.
