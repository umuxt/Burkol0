# Form & Price Settings Refactoring Plan

## Genel Bakış

> **Tarih**: 3 Aralık 2025  
> **Durum**: Planlama Aşamasında  
> **Öncelik**: Yüksek  
> **Amaç**: Form template ve price settings versiyonlama sisteminin yeniden tasarımı, quote detaylarında değişiklik uyarı mekanizmasının optimize edilmesi

---

## ÖN KOŞULLAR

Bu refactoring'e başlamadan önce aşağıdakiler tamamlanmış olmalı:

1. ✅ Mevcut form_templates ve price_settings tabloları çalışıyor
2. ✅ Quote oluşturma akışı aktif
3. ✅ FormBuilderCompact.js ve PricingManager.jsx mevcut
4. ⚠️ Aktif quote'lar varsa migration dikkatli yapılmalı

---

## RİSK ANALİZİ

| Risk | Etki | Olasılık | Önlem |
|------|------|----------|-------|
| Migration sırasında veri kaybı | Yüksek | Düşük | Backup al, transaction kullan |
| Mevcut quote'ların formTemplateCode'u null kalması | Orta | Orta | Backfill query'si ekle |
| UI değişiklikleri kullanıcı alışkanlıklarını bozar | Düşük | Orta | Tooltip'ler ekle |
| Performance regression | Orta | Düşük | Lazy loading uygula |

---

## MEVCUT DURUM ANALİZİ

### Database Yapısı

#### quotes.quotes
```sql
- id (VARCHAR) -- TKF-YYYYMMDD-NNNN
- formTemplateId (INT) -- FK → form_templates.id
- formTemplateVersion (INT) -- Snapshot
- priceFormulaId (INT) -- FK → price_formulas.id  
- priceFormulaVersion (INT) -- Snapshot
- priceStatus (VARCHAR) -- 'current', 'outdated', 'price-drift', 'manual'
- needsRecalculation (BOOLEAN)
- calculatedPrice, finalPrice, manualPrice
```

#### quotes.form_templates
```sql
- id (INT, PK)
- code (VARCHAR) -- QUOTE_FORM_1763719091566 (unique identifier)
- name (VARCHAR)
- version (INT)
- isActive (BOOLEAN) -- Sadece biri true olabilir
- supersedesId (INT) -- Önceki versiyon referansı
```

#### quotes.price_settings
```sql
- id (INT, PK)
- code (VARCHAR) -- PRICE_SETTING_1763719935341 (unique identifier)
- name (VARCHAR)
- version (INT)
- isActive (BOOLEAN) -- Sadece biri true olabilir
- supersedesId (INT) -- Önceki versiyon referansı
```

#### quotes.price_formulas
```sql
- id (INT, PK)
- settingId (INT) -- FK → price_settings.id
- formulaExpression (TEXT)
- version (INT)
- isActive (BOOLEAN)
```

### Mevcut Sorunlar

1. **Performans**: Sayfa yüklenirken tüm quote'lar için version kontrolü yapılıyor
2. **Form Versiyonlama**: Taslak/aktif mantığı net değil
3. **Quote Detay**: Form/price değişiklik uyarıları optimize değil
4. **Edit Modal**: Form field tipleri doğru render edilmiyor

### Mevcut Akış (Kaldırılacak)

**Liste yüklenirken (QuotesManager.js):**
```javascript
// HER quote için ayrı API çağrısı - PERFORMANS SORUNU
for (const quote of quotes) {
  await API.compareQuotePriceVersions(quote.id);
}
```

**Quote detay açılırken:**
```javascript
// Price warning inline hesaplanıyor - optimize değil
const getPriceWarningInfo = () => { ... }
```

---

## YENİ MİMARİ

### Karşılaştırma Stratejisi

**Neden Code Karşılaştırması?**
- `formTemplateId` değişebilir (her taslak yeni id alır)
- `code` değişmez (QUOTE_FORM_1763719091566 her zaman aynı "form ailesi"ni temsil eder)
- Bu sayede "aynı formun farklı versiyonu mu?" sorusuna cevap verebiliriz

**Form değişikliği tespiti:**
```javascript
// Quote'un kullandığı template'in code'u
const quoteTemplateCode = quote.formTemplateCode; // örn: "QUOTE_FORM_1763719091566"

// Aktif template'in code'u
const activeTemplate = await formsApi.getActiveTemplate();
const activeTemplateCode = activeTemplate.code; // örn: "QUOTE_FORM_1763719091566"

// Karşılaştırma 1: Aynı form ailesi mi?
const isSameFormFamily = quoteTemplateCode === activeTemplateCode;

// Karşılaştırma 2: Aynı versiyon mu?
const isSameVersion = quote.formTemplateId === activeTemplate.id;

// Sonuç: Form güncellendi mi?
const formChanged = isSameFormFamily && !isSameVersion;
// Yani: Aynı form ailesi ama farklı versiyon = GÜNCELLENMİŞ
```

**Price değişikliği tespiti:**
```javascript
// Quote'un kullandığı setting'in code'u
const quoteSettingCode = quote.priceSettingCode; // örn: "PRICE_SETTING_1763719935341"

// Aktif setting'in code'u  
const activeSetting = await priceApi.getActiveSetting();
const activeSettingCode = activeSetting.code; // örn: "PRICE_SETTING_1763719935341"

// Karşılaştırma
const isSamePriceFamily = quoteSettingCode === activeSettingCode;
const isSamePriceVersion = quote.priceFormulaId === activeSetting.formula.id;

// Sonuç
const priceChanged = isSamePriceFamily && !isSamePriceVersion;
```

### Quote'a Eklenecek Alanlar

```sql
ALTER TABLE quotes.quotes ADD COLUMN IF NOT EXISTS "formTemplateCode" VARCHAR(100);
ALTER TABLE quotes.quotes ADD COLUMN IF NOT EXISTS "priceSettingCode" VARCHAR(100);
```

---

## PROMPT PLANI

### PROMPT-A1: Form Manager UI Değişiklikleri

**Amaç**: Form yönetim panelinde taslak/aktif etme akışının yeniden düzenlenmesi

**Ön Araştırma**:
1. `read_file` ile `FormManager.jsx` oku
2. `read_file` ile `FormBuilderCompact.js` oku
3. `grep_search` ile form kaydetme pattern'lerini bul: `saveFormConfig|onSave|isActive`
4. Mevcut buton yapısını ve akışları analiz et

**Yapılacaklar**:

1. **Header Buton Sıralaması**:
   ```
   {Durum Badge} [Dinamik Butonlar...] [+Yeni Taslak] [Geçmiş] [Dışa Aktar] [İçe Aktar]
   ```

2. **Buton Görünürlük Matrisi**:

   | isActive | Değişiklik | Görünen Dinamik Butonlar |
   |----------|------------|--------------------------|
   | `true` | Hayır | ❌ Yok |
   | `true` | Evet | `[Değişiklikleri Geri Al]` `[Yeni Taslak Olarak Kaydet]` |
   | `false` | Hayır | `[Aktif Et]` |
   | `false` | Evet | `[Değişiklikleri Geri Al]` `[Taslağı Güncelle]` |

3. **Buton Tanımları**:

   | Buton | Renk | Görünürlük Koşulu | Fonksiyon |
   |-------|------|-------------------|-----------|
   | `+Yeni Taslak` | Beyaz/outline | `!hasChanges` | Modal açar, yeni boş taslak oluşturur |
   | `Değişiklikleri Geri Al` | Kırmızı/outline (#ef4444) | `hasChanges` | Formu orijinal haline döndürür |
   | `Yeni Taslak Olarak Kaydet` | Sarı (#f59e0b) | `isActive && hasChanges` | Değişikliklerle yeni taslak oluşturur |
   | `Taslağı Güncelle` | Sarı (#f59e0b) | `!isActive && hasChanges` | Mevcut taslağı günceller |
   | `Aktif Et` | Yeşil (#10b981) | `!isActive && !hasChanges` | Taslağı aktif yapar |

4. **State Yönetimi**:
   ```javascript
   const [isCurrentDraft, setIsCurrentDraft] = useState(false) // isActive=false ise true
   const [hasChanges, setHasChanges] = useState(false) // Form değişikliği var mı
   const [originalFields, setOriginalFields] = useState([]) // Geri almak için orijinal
   ```

5. **Değişiklik Algılama**:
   ```javascript
   // fields değiştiğinde hasChanges güncelle
   useEffect(() => {
     const changed = JSON.stringify(fields) !== JSON.stringify(originalFields)
     setHasChanges(changed)
   }, [fields, originalFields])
   ```

6. **Buton Fonksiyonları**:
   ```javascript
   // Değişiklikleri Geri Al
   function handleRevertChanges() {
     setFields([...originalFields])
     setHasChanges(false)
   }
   
   // Yeni Taslak Olarak Kaydet (isActive=true iken değişiklik var)
   async function handleSaveAsNewDraft() {
     // Yeni template oluştur (isActive=false)
     // originalFields'ı güncelle
     // hasChanges=false yap
   }
   
   // Taslağı Güncelle (isActive=false iken değişiklik var)
   async function handleUpdateDraft() {
     // Mevcut taslağı güncelle
     // originalFields'ı güncelle
     // hasChanges=false yap
     // Sonra "Aktif Et" butonu görünür olacak
   }
   
   // Aktif Et (isActive=false ve değişiklik yok)
   async function handleActivate() {
     // Template'i aktif yap
     // isCurrentDraft=false yap
     // Artık isActive=true olduğu için butonlar gizlenecek
   }
   ```

7. **Akış Senaryoları**:

   **Senaryo A: Aktif formu görüntüleme (değişiklik yok)**
   - Durum: `isActive=true`, `hasChanges=false`
   - Görünen: `[+Yeni Taslak] [Geçmiş] [Dışa Aktar] [İçe Aktar]`
   
   **Senaryo B: Aktif formda değişiklik yapma**
   - Durum: `isActive=true`, `hasChanges=true`
   - Görünen: `[Değişiklikleri Geri Al] [Yeni Taslak Olarak Kaydet] [Geçmiş] [Dışa Aktar] [İçe Aktar]`
   - "Yeni Taslak Olarak Kaydet" → Yeni taslak oluşur, ekran taslağa geçer
   
   **Senaryo C: Taslağı görüntüleme (değişiklik yok)**
   - Durum: `isActive=false`, `hasChanges=false`
   - Görünen: `[Aktif Et] [+Yeni Taslak] [Geçmiş] [Dışa Aktar] [İçe Aktar]`
   - "Aktif Et" → Taslak aktif olur, artık Senaryo A
   
   **Senaryo D: Taslakta değişiklik yapma**
   - Durum: `isActive=false`, `hasChanges=true`
   - Görünen: `[Değişiklikleri Geri Al] [Taslağı Güncelle] [Geçmiş] [Dışa Aktar] [İçe Aktar]`
   - "Taslağı Güncelle" → Kaydedilir, `hasChanges=false`, artık Senaryo C

**Değişecek Dosyalar**:
- `domains/crm/components/forms/FormManager.jsx`
- `domains/crm/components/forms/formBuilder/FormBuilderCompact.js`

**Gerçekleştirilen Değişiklikler** (3 Aralık 2025):

1. **FormManager.jsx**:
   - `isCurrentDraft` state eklendi (satır 21)
   - `saveDraft()` fonksiyonu eklendi (satır 141-243) - Taslak kaydetme mantığı
   - `activateTemplate()` fonksiyonu eklendi (satır 252-365) - Aktif etme mantığı
   - Template yüklenirken `isCurrentDraft` state güncelleniyor
   - API response parsing düzeltildi (`response.template || response`)
   - Template ismi `formConfig.settings.title`'a eklendi
   - ✅ `hasChanges` ve `originalFields` state'leri eklendi (PROMPT-A1.1)
   - ✅ `handleFieldsChange()` callback'i eklendi (PROMPT-A1.1)
   - ✅ `handleRevertChanges()` fonksiyonu eklendi (PROMPT-A1.1)

2. **FormBuilderCompact.js**:
   - `onActivate` prop eklendi (satır 14)
   - `isCurrentDraft` prop eklendi (satır 15)
   - "+Yeni Taslak" butonu (satır 118-141)
   - "Taslağı Kaydet" butonu - SARI #f59e0b (satır 143-166)
   - "Aktif Et" butonu - YEŞİL #10b981 (satır 168-188)
   - `handleSaveDraft()` fonksiyonu (satır 277-287)
   - `handleActivate()` fonksiyonu (satır 289-304)
   - `is_active` → `isActive` property düzeltmesi (satır 961, 978)
   - ✅ `onRevertChanges`, `onFieldsChange`, `hasChanges`, `originalFields` prop'ları eklendi (PROMPT-A1.1)
   - ✅ Buton görünürlük mantığı matrise göre güncellendi (PROMPT-A1.1)
   - ✅ "Değişiklikleri Geri Al" butonu eklendi - KIRMIZI outline (PROMPT-A1.1)
   - ✅ "Yeni Taslak Olarak Kaydet" / "Taslağı Güncelle" dinamik isimlendirme (PROMPT-A1.1)
   - ✅ Durum badge'i form adı gösteriyor: `Taslak **Form Adı**` veya `Aktif **Form Adı**` (PROMPT-A1.2)
   - ✅ Lucide ikonlar: Pencil (taslak), Check (aktif) - SVG inline (PROMPT-A1.2)

3. **forms-service.js**:
   - `getTemplateWithFields` endpoint düzeltildi: `/api/form-templates/${id}/with-fields`
   - `getFields` fonksiyonuna debug log eklendi

4. **formController.js** (Backend):
   - `GET /api/form-templates/:id/fields` endpoint eklendi (satır 144-158)
   - Bu endpoint frontend'in field silme işlemi için gerekli

**PROMPT-A1.1 Tamamlandı** ✅ (4 Aralık 2025):

> Buton görünürlük revizyonu başarıyla uygulandı.

1. ✅ `hasChanges` state eklendi
2. ✅ `originalFields` state eklendi (geri alma için)
3. ✅ Buton görünürlük mantığı matrise göre güncellendi
4. ✅ "Değişiklikleri Geri Al" butonu eklendi (kırmızı/outline)
5. ✅ Dinamik buton isimlendirmesi: "Yeni Taslak Olarak Kaydet" vs "Taslağı Güncelle"

**PROMPT-A1.2 Tamamlandı** ✅ (4 Aralık 2025):

> Kozmetik güncellemeler başarıyla uygulandı.

1. ✅ Durum badge'inde form adı gösteriliyor
2. ✅ Taslak ikonu → Lucide Pencil (SVG)
3. ✅ Aktif ikonu → Lucide Check (SVG)

**Test Kriterleri** (Mevcut - 3 Aralık):
- [x] "+Yeni Taslak" butonu çalışıyor ✅ (Modal açılıyor, yeni taslak oluşturuluyor)
- [x] "Taslağı Kaydet" sarı renkte (#f59e0b) görünüyor ✅
- [x] "Aktif Et" yeşil renkte (#10b981) görünüyor ✅
- [x] Taslak (isActive=false) açıkken "Taslağı Kaydet" mevcut kaydı güncelliyor ✅
- [x] Aktif form açıkken "Taslağı Kaydet" yeni taslak oluşturuyor ✅
- [x] "Aktif Et" doğru versiyonu aktif yapıyor ✅ (API: PATCH /api/form-templates/:id/activate)

**Test Kriterleri** (Buton Görünürlük Revizyonu - PROMPT-A1.1) ✅ 4 Aralık 2025:
- [x] isActive=true, hasChanges=false → Sadece `+Yeni Taslak` görünür ✅
- [x] isActive=true, hasChanges=true → `Değişiklikleri Geri Al` + `Yeni Taslak Olarak Kaydet` görünür ✅
- [x] isActive=false, hasChanges=false → `Aktif Et` + `+Yeni Taslak` görünür ✅
- [x] isActive=false, hasChanges=true → `Değişiklikleri Geri Al` + `Taslağı Güncelle` görünür ✅
- [x] "Değişiklikleri Geri Al" formu orijinal haline döndürüyor ✅
- [x] "Yeni Taslak Olarak Kaydet" yeni taslak oluşturup ekranı taslağa geçiriyor ✅
- [x] "Taslağı Güncelle" sonrası "Aktif Et" butonu görünür oluyor ✅

**Test Kriterleri** (Kozmetik - PROMPT-A1.2) ✅ 4 Aralık 2025:
- [x] Durum badge'inde form adı gösteriliyor: `Taslak **Form Adı**` veya `Aktif **Form Adı**` ✅
- [x] Taslak ikonu Lucide Pencil ikonu olarak güncellendi ✅
- [x] Aktif ikonu Lucide Check ikonu olarak güncellendi ✅

**API Endpoint Testleri** (3 Aralık 2025):
```bash
# GET /api/form-templates - 200 OK ✅
# GET /api/form-templates/:id/fields - 200 OK ✅
# PATCH /api/form-templates/:id/activate - 200 OK ✅
```

---

### PROMPT-A2: Price Settings UI Değişiklikleri

**Amaç**: Fiyat ayarları panelinde form manager ile tutarlı taslak/aktif etme akışı (PROMPT-A1.1 ile aynı buton görünürlük matrisi)

**Ön Araştırma**:
1. `read_file` ile `PricingManager.jsx` oku ✅
2. `grep_search` ile orphan pattern'lerini bul: `orphan|systemIntegrity` ✅
3. Mevcut buton yapısını analiz et ✅

**Mevcut Durum Analizi**:
- `hasUnsavedChanges` state mevcut (satır 46)
- `originalData = { parameters, formula }` state mevcut (satır 47)
- `systemIntegrity` state mevcut - orphan kontrolleri için (satır 51-59)
- `isViewingInactive = currentSettingId && currentSettingId !== activeSettingId`
- Header butonları `renderHeaderActions` ile render ediliyor (satır 591-750)

**Yapılacaklar**:

1. **Buton Görünürlük Matrisi** (PROMPT-A1.1 ile tutarlı):

   | isActive | hasChanges | Orphan | Görünen Dinamik Butonlar |
   |----------|------------|--------|--------------------------|
   | `true` | Hayır | Hayır | `[+Yeni Taslak]` |
   | `true` | Evet | Hayır | `[Değişiklikleri Geri Al]` `[Yeni Taslak Olarak Kaydet]` |
   | `false` | Hayır | Hayır | `[Aktif Et]` `[+Yeni Taslak]` |
   | `false` | Evet | Hayır | `[Değişiklikleri Geri Al]` `[Taslağı Güncelle]` |
   | Any | Evet | **Evet→Hayır** | Orphan temizlendikten sonra → `[Değişiklikleri Geri Al]` `[Yeni Taslak Olarak Kaydet]` |

   > **Orphan Senaryosu**: Orphan parametre temizlenince `hasChanges=true` olur. Bu durumda "Yeni Taslak Olarak Kaydet" görünür. "Değişiklikleri Geri Al" tıklanırsa orphanlı (bozuk) orijinal haline döner.

2. **Buton Tanımları**:

   | Buton | Renk | Görünürlük Koşulu | Fonksiyon |
   |-------|------|-------------------|-----------|
   | `+Yeni Taslak` | Beyaz/outline | `!hasChanges` | Sıfırdan yeni taslak açar |
   | `Değişiklikleri Geri Al` | Kırmızı/outline (#ef4444) | `hasChanges` | `originalData`'ya geri döner |
   | `Yeni Taslak Olarak Kaydet` | Sarı (#f59e0b) | `isActive && hasChanges` | Değişikliklerle yeni taslak oluşturur |
   | `Taslağı Güncelle` | Sarı (#f59e0b) | `!isActive && hasChanges` | Mevcut taslağı günceller |
   | `Aktif Et` | Yeşil (#10b981) | `!isActive && !hasChanges` | Taslağı aktif yapar |

3. **State Güncellemeleri**:
   ```javascript
   // Mevcut state'ler yeterli, sadece kullanımı değişecek:
   const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false) // ✅ Mevcut
   const [originalData, setOriginalData] = useState({ parameters: [], formula: '' }) // ✅ Mevcut
   
   // isActive kontrolü için:
   const isActive = currentSettingId === activeSettingId
   const isCurrentDraft = currentSettingId && currentSettingId !== activeSettingId
   ```

4. **Yeni Fonksiyonlar**:
   ```javascript
   // Değişiklikleri Geri Al
   function handleRevertChanges() {
     setParameters([...originalData.parameters])
     setUserFormula(originalData.formula)
     userFormulaRef.current = originalData.formula
     
     // Backend formülünü güncelle
     const mapping = PricingUtils.createUserFriendlyIdMapping(originalData.parameters)
     setIdMapping(mapping)
     const backendFormula = PricingUtils.convertFormulaToBackend(originalData.formula, mapping)
     setFormula(backendFormula)
     formulaRef.current = backendFormula
     
     setHasUnsavedChanges(false)
     showToast('Değişiklikler geri alındı', 'info')
   }
   ```

5. **Header Butonları Yeniden Düzenleme** (satır 591-750):
   
   **Mevcut Sıralama**:
   ```
   [Aktif Hale Getir / Yeni Taslak Oluştur] [Geçmiş Taslaklar] [Kaydet] [Dışa Aktar] [İçe Aktar]
   ```
   
   **Yeni Sıralama** (PROMPT-A1.1 ile tutarlı):
   ```
   {Durum Badge} [Dinamik Butonlar...] [+Yeni Taslak] [Geçmiş] [Dışa Aktar] [İçe Aktar]
   ```

6. **Durum Badge** (PROMPT-A1.2 ile tutarlı):
   ```javascript
   // Status Badge - always visible with setting name
   const settingName = allSettings.find(s => s.id === currentSettingId)?.name || 'Fiyat Ayarları'
   
   React.createElement('span', {
     key: 'status-badge',
     style: {
       padding: '6px 12px',
       background: isCurrentDraft ? '#fef3c7' : '#d1fae5',
       color: isCurrentDraft ? '#92400e' : '#065f46',
       borderRadius: '6px',
       fontSize: '12px',
       fontWeight: 600,
       display: 'flex',
       alignItems: 'center',
       gap: '5px'
     }
   },
     // Lucide icon: Pencil for draft, Check for active
     React.createElement('span', { dangerouslySetInnerHTML: { __html: isCurrentDraft ? PENCIL_SVG : CHECK_SVG } }),
     React.createElement('span', null, isCurrentDraft ? 'Taslak' : 'Aktif'),
     React.createElement('span', { style: { opacity: 0.6 } }, '•'),
     React.createElement('strong', null, settingName)
   )
   ```

7. **Akış Senaryoları**:

   **Senaryo A: Aktif fiyatlandırmayı görüntüleme (değişiklik yok)**
   - Durum: `isActive=true`, `hasChanges=false`
   - Görünen: `{Aktif • Fiyat Ayarları v1} [+Yeni Taslak] [Geçmiş] [Dışa Aktar] [İçe Aktar]`
   
   **Senaryo B: Aktif fiyatlandırmada değişiklik yapma**
   - Durum: `isActive=true`, `hasChanges=true`
   - Görünen: `{Aktif • Fiyat Ayarları v1} [Değişiklikleri Geri Al] [Yeni Taslak Olarak Kaydet] [Geçmiş] [Dışa Aktar] [İçe Aktar]`
   
   **Senaryo C: Taslağı görüntüleme (değişiklik yok)**
   - Durum: `isActive=false`, `hasChanges=false`
   - Görünen: `{Taslak • Fiyat Ayarları v2} [Aktif Et] [+Yeni Taslak] [Geçmiş] [Dışa Aktar] [İçe Aktar]`
   
   **Senaryo D: Taslakta değişiklik yapma**
   - Durum: `isActive=false`, `hasChanges=true`
   - Görünen: `{Taslak • Fiyat Ayarları v2} [Değişiklikleri Geri Al] [Taslağı Güncelle] [Geçmiş] [Dışa Aktar] [İçe Aktar]`
   
   **Senaryo E: Orphan temizleme**
   - Durum: Orphan parametre var → "🧹 Orphan Temizle" butonuna tıklanır
   - Sonuç: Parametre silinir, `hasChanges=true` olur
   - Görünen: `[Değişiklikleri Geri Al] [Yeni Taslak Olarak Kaydet]`
   - "Değişiklikleri Geri Al" tıklanırsa → Orphanlı (bozuk) orijinal hale döner

**Değişecek Dosyalar**:
- `domains/crm/components/pricing/PricingManager.jsx`
- `domains/crm/services/pricing-service.js`

**Test Kriterleri**:
- [x] isActive=true, hasChanges=false → Sadece `+Yeni Taslak` görünür ✅
- [x] isActive=true, hasChanges=true → `Değişiklikleri Geri Al` + `Yeni Taslak Olarak Kaydet` görünür ✅
- [x] isActive=false, hasChanges=false → `Aktif Et` + `+Yeni Taslak` görünür ✅
- [x] isActive=false, hasChanges=true → `Değişiklikleri Geri Al` + `Taslağı Güncelle` görünür ✅
- [x] "Değişiklikleri Geri Al" formu `originalData`'ya geri döndürüyor ✅
- [x] Orphan temizlendikten sonra "Yeni Taslak Olarak Kaydet" görünür ve enabled ✅
- [x] Orphan temizlendikten sonra "Değişiklikleri Geri Al" → orphanlı hale döner ✅
- [x] Durum badge'i gösteriliyor: `Taslak • Fiyat Ayarları` veya `Aktif • Fiyat Ayarları` ✅
- [x] Taslak ikonu Lucide Pencil, Aktif ikonu Lucide Check ✅
- [x] Yeni taslak oluşturulduğunda badge "Taslak • Yeni Taslak" gösteriyor ✅
- [x] "Yeni Taslak Olarak Kaydet" yeni setting oluşturuyor, mevcut aktif ayarı değiştirmiyor ✅
- [x] "Aktif Et" endpoint çalışıyor (PATCH /api/price-settings/:id/activate) ✅

**Gerçekleştirilen Değişiklikler** (4 Aralık 2025):

1. **PricingManager.jsx**:
   - `handleRevertChanges()` fonksiyonu eklendi - originalData'ya geri dönüş
   - `saveAsNewDraft()` fonksiyonu eklendi - aktif ayar üzerinde yeni taslak oluşturma
   - Lucide SVG ikonları eklendi (PENCIL, CHECK, UNDO, SAVE, PLUS, CLOCK, etc.)
   - Header butonları useEffect güncellendi - PROMPT-A1.1 ile tutarlı görünürlük matrisi
   - `isNewDraft = currentSettingId === null` kontrolü eklendi
   - Status badge: "Taslak • Yeni Taslak" veya "Taslak • [Ayar Adı]" veya "Aktif • [Ayar Adı]"
   - Sistem bütünlüğü kontrolü (useEffect) güncellendi - parameters.length === 0 durumu eklendi
   - Orphan temizlendikten sonra systemIntegrity otomatik güncelleniyor
   - "Yeni Taslak Olarak Kaydet" butonu saveAsNewDraft() çağırıyor (savePriceSettings değil)

2. **pricing-service.js**:
   - `activateSetting()` method düzeltildi: POST → PATCH

---

### PROMPT-B0: Database Yapısı Optimizasyonu ve Analizi

**Amaç**: quotes schema'daki form-price-quote ilişkilerinin analizi, gereksiz alanların tespiti ve yapısal iyileştirmeler

**Tarih**: 4 Aralık 2025  
**Durum**: ✅ **TAMAMLANDI**

**Commit**: `feat(crm):[FP-B0] Database Optimization & Bug Fixes`

**Gerçekleştirilen Değişiklikler**:

1. **Database**:
   - `price_formulas` tablosu bağımlılığı kaldırıldı (deprecated)
   - `quotes` modeli `price_settings.parameters` (jsonb) kullanacak şekilde güncellendi
   - `sessions` modeli upsert pattern'e geçirildi (ON CONFLICT DO UPDATE)
   - `audit_logs` insert doğru kolonlara map edildi (entityType, entityId, changes, etc.)

2. **API Optimizasyonları**:
   - `priceController`: checkPriceStatus bulk çağrıları kaldırıldı, artık on-demand
   - `quoteController`: price_formulas yerine price_settings kullanıyor
   - `pricingService`: Konsolide price_settings ile çalışacak şekilde sadeleştirildi
   - `priceSettingsService`: Formula referansları kaldırıldı, parameters jsonb kullanıyor

3. **Frontend Optimizasyonları**:
   - `QuotesTabs`: Sadece aktif tab render ediliyor (eskiden tümü display:none ile gizleniyordu)
   - `QuotesManager`: Tab değişiminde detail panel kapanıyor (stale state önleme)
   - `QuotesManager`: Version check artık on-demand, sayfa yüklemesinde değil

4. **Bug Fixes**:
   - Session duplicate key hatası düzeltildi (upsert pattern)
   - audit_logs 'details' kolon hatası düzeltildi (doğru kolonlara map)
   - Sayfa yüklemesinde duplicate API çağrıları azaltıldı (4x → 1x form-templates)

**Değişen Dosyalar**:
- `db/models/sessions.js` (upsert)
- `db/models/quotes.js` (price_settings referansı)
- `db/models/priceFormulas.js` → **SİLİNDİ**
- `server/auditTrail.js` (kolon mapping fix)
- `domains/crm/components/quotes/QuotesTabs.jsx` (conditional rendering)
- `domains/crm/components/quotes/QuotesManager.js` (tab change cleanup)
- `domains/crm/api/*` (price_formulas kaldırma)

**FİNAL KARARLAR**:
- ✅ `price_formulas` tablosu → **HARD DELETE** (formulaExpression price_settings'e taşınacak)
- ✅ `quote_form_data` tablosu → **KORU** (JSONB'ye taşıma YOK)
- ✅ `formTemplateCode` / `priceSettingCode` → **OTOMATİK ÜRETME** (slug formatında)
- ✅ Backward compatibility → **YOK** (veriler silinebilir)

---

#### 📊 MEVCUT TABLO YAPISI ANALİZİ

##### quotes.price_settings
| Sütun | Tip | Nullable | Açıklama |
|-------|-----|----------|----------|
| `id` | INT (PK) | NOT NULL | Auto-increment |
| `code` | VARCHAR | NOT NULL | `PRICE_SETTING_1763719935341` |
| `name` | VARCHAR | NOT NULL | İnsan okunur isim |
| `description` | TEXT | NULL | |
| `isActive` | BOOLEAN | NOT NULL | Sadece bir tanesi true |
| `version` | INT | NOT NULL | Default: 1 |
| `createdBy` | VARCHAR | NULL | |
| `createdAt` | TIMESTAMPTZ | NULL | |
| `updatedAt` | TIMESTAMPTZ | NULL | |
| `supersedesId` | INT (FK→self) | NULL | Önceki versiyon |

##### quotes.price_parameters
| Sütun | Tip | Nullable | Açıklama |
|-------|-----|----------|----------|
| `id` | INT (PK) | NOT NULL | Auto-increment |
| `code` | VARCHAR | NOT NULL | Parametre kodu |
| `name` | VARCHAR | NOT NULL | İnsan okunur isim |
| `type` | VARCHAR | NOT NULL | `fixed` veya `form_lookup` |
| `fixedValue` | NUMERIC | NULL | type=fixed ise |
| `unit` | VARCHAR | NULL | |
| `description` | TEXT | NULL | |
| `isActive` | BOOLEAN | NULL | Default: true |
| `createdAt` | TIMESTAMPTZ | NOT NULL | |
| `updatedAt` | TIMESTAMPTZ | NOT NULL | |
| `formFieldCode` | VARCHAR | NULL | type=form_lookup ise |
| `settingId` | INT (FK) | NULL | → price_settings.id |

##### quotes.price_formulas
| Sütun | Tip | Nullable | Açıklama | ⚠️ Sorun |
|-------|-----|----------|----------|----------|
| `id` | INT (PK) | NOT NULL | Auto-increment | |
| `code` | VARCHAR | NOT NULL | Her zaman `MAIN_FORMULA` | **Gereksiz** |
| `name` | VARCHAR | NOT NULL | Her zaman `Main Pricing Formula` | **Gereksiz** |
| `formulaExpression` | TEXT | NOT NULL | `= birim_maliyet * adet` | ✅ |
| `description` | TEXT | NULL | | |
| `isActive` | BOOLEAN | NULL | Default: true | |
| `version` | INT | NOT NULL | Default: 1 | **Gereksiz** (tek formül) |
| `createdBy` | VARCHAR | NULL | | |
| `createdAt` | TIMESTAMPTZ | NOT NULL | | |
| `updatedAt` | TIMESTAMPTZ | NOT NULL | | |
| `supersedesId` | INT (FK→self) | NULL | | **Kullanılmıyor** |
| `settingId` | INT (FK) | NULL | → price_settings.id | ✅ |

##### quotes.form_templates
| Sütun | Tip | Nullable | Açıklama |
|-------|-----|----------|----------|
| `id` | INT (PK) | NOT NULL | Auto-increment |
| `code` | VARCHAR | NOT NULL | `QUOTE_FORM_1763719091566` |
| `name` | VARCHAR | NOT NULL | Form adı |
| `description` | TEXT | NULL | |
| `isActive` | BOOLEAN | NULL | Default: true |
| `version` | INT | NOT NULL | Default: 1 |
| `createdBy` | VARCHAR | NULL | |
| `createdAt` | TIMESTAMPTZ | NOT NULL | |
| `updatedAt` | TIMESTAMPTZ | NOT NULL | |
| `supersedesId` | INT (FK→self) | NULL | Önceki versiyon |

##### quotes.form_fields
| Sütun | Tip | Nullable | Açıklama |
|-------|-----|----------|----------|
| `id` | INT (PK) | NOT NULL | Auto-increment |
| `templateId` | INT (FK) | NOT NULL | → form_templates.id |
| `fieldCode` | VARCHAR | NOT NULL | `field_1763719047532_xyz` |
| `fieldName` | VARCHAR | NOT NULL | "Adet" |
| `fieldType` | VARCHAR | NOT NULL | `number`, `text`, `select` |
| `sortOrder` | INT | NOT NULL | Default: 0 |
| `isRequired` | BOOLEAN | NULL | Default: false |
| `placeholder` | TEXT | NULL | |
| `helpText` | TEXT | NULL | |
| `validationRule` | TEXT | NULL | JSON |
| `defaultValue` | VARCHAR | NULL | |
| `createdAt` | TIMESTAMPTZ | NOT NULL | |
| `updatedAt` | TIMESTAMPTZ | NOT NULL | |

##### quotes.form_field_options
| Sütun | Tip | Nullable | Açıklama |
|-------|-----|----------|----------|
| `id` | INT (PK) | NOT NULL | Auto-increment |
| `fieldId` | INT (FK) | NOT NULL | → form_fields.id |
| `optionValue` | VARCHAR | NOT NULL | |
| `optionLabel` | VARCHAR | NOT NULL | |
| `sortOrder` | INT | NOT NULL | Default: 0 |
| `isActive` | BOOLEAN | NULL | Default: true |
| `createdAt` | TIMESTAMPTZ | NOT NULL | |
| `updatedAt` | TIMESTAMPTZ | NOT NULL | |
| `priceValue` | NUMERIC | NULL | Seçeneğin fiyat etkisi |

##### quotes.quotes
| Sütun | Tip | Nullable | Açıklama | ⚠️ Sorun |
|-------|-----|----------|----------|----------|
| `id` | VARCHAR (PK) | NOT NULL | `TKF-20251124-0001` | |
| `customerName` | VARCHAR | NULL | | Denormalize (customerId var) |
| `customerEmail` | VARCHAR | NULL | | Denormalize |
| `customerPhone` | VARCHAR | NULL | | Denormalize |
| `customerCompany` | VARCHAR | NULL | | Denormalize |
| `customerAddress` | TEXT | NULL | | Denormalize |
| `formTemplateId` | INT (FK) | NULL | → form_templates.id | ✅ |
| `status` | VARCHAR | NOT NULL | `new`, `approved` | |
| `notes` | TEXT | NULL | | |
| `priceFormulaId` | INT (FK) | NULL | → price_formulas.id | **Dolaylı** (settingId olmalı) |
| `calculatedPrice` | NUMERIC | NULL | | |
| `manualPrice` | NUMERIC | NULL | | |
| `manualPriceReason` | TEXT | NULL | | |
| `finalPrice` | NUMERIC | NULL | | |
| `currency` | VARCHAR | NULL | Default: 'TRY' | |
| `priceStatus` | VARCHAR | NULL | `current`, `outdated` | |
| `priceDifferenceSummary` | TEXT | NULL | | |
| `priceCalculatedAt` | TIMESTAMPTZ | NULL | | **Duplicate** |
| `workOrderCode` | VARCHAR | NULL | | |
| `approvedAt` | TIMESTAMPTZ | NULL | | |
| `approvedBy` | VARCHAR | NULL | | |
| `createdBy` | VARCHAR | NULL | | |
| `updatedBy` | VARCHAR | NULL | | |
| `createdAt` | TIMESTAMPTZ | NOT NULL | | |
| `updatedAt` | TIMESTAMPTZ | NOT NULL | | |
| `formTemplateVersion` | INT | NULL | Snapshot | |
| `priceFormulaVersion` | INT | NULL | Snapshot | |
| `needsRecalculation` | BOOLEAN | NULL | Default: false | |
| `lastCalculatedAt` | TIMESTAMPTZ | NULL | | **Duplicate** (priceCalculatedAt ile) |
| `deliveryDate` | TIMESTAMPTZ | NULL | | |
| `isCustomer` | BOOLEAN | NULL | Default: false | |
| `customerId` | INT (FK) | NULL | → customers.id | ✅ |

##### quotes.quote_form_data
| Sütun | Tip | Nullable | Açıklama |
|-------|-----|----------|----------|
| `id` | INT (PK) | NOT NULL | Auto-increment |
| `quoteId` | VARCHAR (FK) | NOT NULL | → quotes.id |
| `fieldId` | INT (FK) | NOT NULL | → form_fields.id |
| `fieldCode` | VARCHAR | NOT NULL | Denormalize (hız için OK) |
| `fieldValue` | TEXT | NULL | |
| `createdAt` | TIMESTAMPTZ | NOT NULL | |
| `updatedAt` | TIMESTAMPTZ | NOT NULL | |

---

#### 🔗 MEVCUT FOREIGN KEY İLİŞKİLERİ

```
form_field_options.fieldId ──────────────> form_fields.id
form_fields.templateId ──────────────────> form_templates.id
form_templates.supersedesId ─────────────> form_templates.id (self-ref)

price_formulas.settingId ────────────────> price_settings.id
price_formulas.supersedesId ─────────────> price_formulas.id (self-ref)
price_parameters.settingId ──────────────> price_settings.id
price_settings.supersedesId ─────────────> price_settings.id (self-ref)

quote_files.quoteId ─────────────────────> quotes.id
quote_form_data.fieldId ─────────────────> form_fields.id
quote_form_data.quoteId ─────────────────> quotes.id

quotes.customerId ───────────────────────> customers.id
quotes.formTemplateId ───────────────────> form_templates.id
quotes.priceFormulaId ───────────────────> price_formulas.id  ⚠️ Dolaylı!
```

---

#### ❌ TESPİT EDİLEN SORUNLAR

| # | Sorun | Tablo | Açıklama |
|---|-------|-------|----------|
| 1 | **Eksik FK** | quotes | `priceSettingId` yok, `priceFormulaId` üzerinden dolaylı gidiliyor |
| 2 | **Eksik alanlar** | quotes | `formTemplateCode` ve `priceSettingCode` yok |
| 3 | **Gereksiz tablo** | price_formulas | Her setting'in tek formülü var, ayrı tablo gereksiz |
| 4 | **Gereksiz alanlar** | price_formulas | `code`, `name`, `version`, `supersedesId` her zaman aynı değer |
| 5 | **Duplicate alanlar** | quotes | `priceCalculatedAt` vs `lastCalculatedAt` |
| 6 | **Denormalize alanlar** | quotes | customer* alanları (ama historik kayıt için OK) |

---

#### ✅ YAPILACAK DEĞİŞİKLİKLER

> ⚠️ **NOT**: Backward compatibility yok. Mevcut veriler silinebilir.  
> 📁 **Yedek**: `db/backups/quotes_schema_backup_20251204.sql`

---

##### AŞAMA B0.1: `price_formulas` Tablosunu Kaldır, `price_settings`'e Merge Et

**Karar**: `price_formulas` tablosu **TAMAMEN KALDIRILACAK**, `formulaExpression` alanı `price_settings`'e taşınacak.

**Gerekçe**:
- Her setting'in tek bir formülü var
- `price_formulas.code` her zaman `MAIN_FORMULA` - gereksiz
- `price_formulas.name` her zaman `Main Pricing Formula` - gereksiz
- `price_formulas.version` kullanılmıyor - gereksiz
- `price_formulas.supersedesId` kullanılmıyor - gereksiz

**YENİ `price_settings` Yapısı**:
```sql
DROP TABLE IF EXISTS quotes.price_settings CASCADE;

CREATE TABLE quotes.price_settings (
  "id" SERIAL PRIMARY KEY,
  -- Kimlik
  "code" VARCHAR(100) NOT NULL,           -- PRICE_SETTING_xxxxx
  "name" VARCHAR(255) NOT NULL,           -- İnsan okunur isim
  "description" TEXT,
  -- Versiyon kontrolü
  "version" INTEGER NOT NULL DEFAULT 1,
  "isActive" BOOLEAN NOT NULL DEFAULT false,
  "supersedesId" INTEGER REFERENCES quotes.price_settings(id),
  -- Formül (ESKİ: price_formulas tablosundan taşındı)
  "formulaExpression" TEXT,               -- = birim_maliyet * adet
  -- Meta
  "createdBy" VARCHAR(100),
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE UNIQUE INDEX price_settings_code_version_unique ON quotes.price_settings(code, version);
CREATE INDEX price_settings_is_active_idx ON quotes.price_settings("isActive");
```

---

##### AŞAMA B0.2: `quotes` Tablosunu Sadeleştir

**Yapılacaklar**:
1. `priceFormulaId` → `priceSettingId` olarak değiştirilecek
2. `priceCalculatedAt` kaldırılacak (duplicate)
3. `priceFormulaVersion` → `priceSettingVersion` olarak değiştirilecek
4. `formTemplateCode` ve `priceSettingCode` eklenecek
5. Sütun sırası mantıklı hale getirilecek

**YENİ `quotes` Yapısı**:
```sql
DROP TABLE IF EXISTS quotes.quotes CASCADE;

CREATE TABLE quotes.quotes (
  -- Kimlik
  "id" VARCHAR(50) PRIMARY KEY,           -- TKF-YYYYMMDD-NNNN
  "status" VARCHAR(50) NOT NULL DEFAULT 'new',
  
  -- Müşteri bilgileri (denormalize - historik kayıt için tutuluyor)
  "customerId" INTEGER REFERENCES quotes.customers(id),
  "customerName" VARCHAR(255),
  "customerEmail" VARCHAR(255),
  "customerPhone" VARCHAR(50),
  "customerCompany" VARCHAR(255),
  "customerAddress" TEXT,
  "isCustomer" BOOLEAN DEFAULT false,
  
  -- Form referansı
  "formTemplateId" INTEGER REFERENCES quotes.form_templates(id),
  "formTemplateCode" VARCHAR(100),        -- YENİ: QUOTE_FORM_xxxxx
  "formTemplateVersion" INTEGER,
  
  -- Fiyatlandırma referansı
  "priceSettingId" INTEGER REFERENCES quotes.price_settings(id),  -- YENİ (eski: priceFormulaId)
  "priceSettingCode" VARCHAR(100),        -- YENİ: PRICE_SETTING_xxxxx
  "priceSettingVersion" INTEGER,          -- YENİ (eski: priceFormulaVersion)
  
  -- Fiyat bilgileri
  "calculatedPrice" NUMERIC,
  "manualPrice" NUMERIC,
  "manualPriceReason" TEXT,
  "finalPrice" NUMERIC,
  "currency" VARCHAR(10) DEFAULT 'TRY',
  "priceStatus" VARCHAR(50) DEFAULT 'current',
  "priceDifferenceSummary" TEXT,
  "needsRecalculation" BOOLEAN DEFAULT false,
  "lastCalculatedAt" TIMESTAMPTZ,         -- ESKİ: priceCalculatedAt ile birleştirildi
  
  -- İş emri ve onay
  "workOrderCode" VARCHAR(50),
  "approvedAt" TIMESTAMPTZ,
  "approvedBy" VARCHAR(100),
  
  -- Diğer
  "notes" TEXT,
  "deliveryDate" TIMESTAMPTZ,
  
  -- Meta
  "createdBy" VARCHAR(100),
  "updatedBy" VARCHAR(100),
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX quotes_status_idx ON quotes.quotes(status);
CREATE INDEX quotes_status_created_at_idx ON quotes.quotes(status, "createdAt");
CREATE INDEX quotes_created_at_idx ON quotes.quotes("createdAt");
CREATE INDEX quotes_form_template_id_idx ON quotes.quotes("formTemplateId");
CREATE INDEX quotes_price_setting_id_idx ON quotes.quotes("priceSettingId");
CREATE INDEX quotes_form_template_code_idx ON quotes.quotes("formTemplateCode");
CREATE INDEX quotes_price_setting_code_idx ON quotes.quotes("priceSettingCode");
CREATE INDEX quotes_work_order_code_idx ON quotes.quotes("workOrderCode");
CREATE INDEX quotes_delivery_date_idx ON quotes.quotes("deliveryDate");
CREATE INDEX quotes_customer_id_idx ON quotes.quotes("customerId");
```

---

##### AŞAMA B0.3: `price_parameters` Sütun Sırasını Düzenle

**YENİ `price_parameters` Yapısı**:
```sql
DROP TABLE IF EXISTS quotes.price_parameters CASCADE;

CREATE TABLE quotes.price_parameters (
  "id" SERIAL PRIMARY KEY,
  "settingId" INTEGER NOT NULL REFERENCES quotes.price_settings(id) ON DELETE CASCADE,
  -- Kimlik
  "code" VARCHAR(100) NOT NULL,
  "name" VARCHAR(255) NOT NULL,
  -- Tip ve değer
  "type" VARCHAR(50) NOT NULL,            -- 'fixed' veya 'form_lookup'
  "fixedValue" NUMERIC,                   -- type=fixed ise
  "formFieldCode" VARCHAR(100),           -- type=form_lookup ise
  "unit" VARCHAR(50),
  "description" TEXT,
  "isActive" BOOLEAN DEFAULT true,
  -- Meta
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  UNIQUE("settingId", "code")
);

-- Indexes
CREATE INDEX price_parameters_setting_id_idx ON quotes.price_parameters("settingId");
CREATE INDEX price_parameters_type_idx ON quotes.price_parameters(type);
CREATE INDEX price_parameters_is_active_idx ON quotes.price_parameters("isActive");
```

---

##### AŞAMA B0.4: `quote_form_data` FK Güncelle

`quote_form_data.fieldId` referansı kalacak ama ON DELETE davranışı güncellenecek.

```sql
-- quote_form_data'daki FK'yı güncelle
ALTER TABLE quotes.quote_form_data 
DROP CONSTRAINT IF EXISTS quote_form_data_field_id_foreign;

ALTER TABLE quotes.quote_form_data 
ADD CONSTRAINT quote_form_data_field_id_fk 
FOREIGN KEY ("fieldId") REFERENCES quotes.form_fields(id) ON DELETE SET NULL;
```

---

#### 📁 DEĞİŞECEK DOSYALAR

| Dosya | Değişiklik |
|-------|------------|
| `db/migrations/025_db_optimization.sql` | Yeni migration - tablo DROP/CREATE |
| `db/models/priceFormulas.js` | **SİLİNECEK** |
| `db/models/quotes.js` | `priceSettingId`, `priceSettingCode`, `formTemplateCode` |
| `domains/crm/api/services/priceSettingsService.js` | `formulaExpression` ekleme |
| `domains/crm/components/pricing/PricingManager.jsx` | API değişiklikleri |

---

#### 🧪 TEST KRİTERLERİ

- [x] API çağrıları optimize edildi (4x → 1x) ✅
- [x] `price_formulas` bağımlılığı koddan kaldırıldı ✅
- [x] `priceFormulas.js` model dosyası silindi ✅
- [x] Session duplicate key hatası düzeltildi ✅
- [x] audit_logs kolon hatası düzeltildi ✅
- [x] QuotesTabs conditional rendering ✅
- [x] Tab değişiminde detail panel kapanıyor ✅
- [x] Quote oluşturma çalışıyor ✅
- [x] Build başarılı ✅

---

#### 📋 KARARLAR (Güncellenme: 4 Aralık 2025)

| # | Konu | Karar | Açıklama |
|---|------|-------|----------|
| 1 | `quotes.customer*` alanları | **TUT** | Historik kayıt için gerekli |
| 2 | `price_formulas` tablosu | **HARD DELETE** | formulaExpression → price_settings'e taşı |
| 3 | `priceCalculatedAt` vs `lastCalculatedAt` | **BİRLEŞTİR** | lastCalculatedAt tut, priceCalculatedAt sil |
| 4 | Backward compatibility | **YOK** | Temiz yapı, mevcut veriler silinebilir |
| 5 | `quote_form_data` tablosu | **KORU** | JSONB'ye taşıma YOK, mevcut yapı kalacak |
| 6 | `formTemplateCode` / `priceSettingCode` | **OTOMATİK** | Sistem slug üretecek (template/setting kaydederken) |
| 7 | Silme stratejisi | **HARD DELETE** | Deprecation yok, direkt DROP |

---

#### 🔄 CODE OTOMATİK ÜRETME MANTIĞI

**`formTemplateCode` formatı**: `FORM_${timestamp}_${random}`
```javascript
// Örnek: FORM_1733312400000_a1b2c3
const formTemplateCode = `FORM_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
```

**`priceSettingCode` formatı**: `PRICE_${timestamp}_${random}`
```javascript
// Örnek: PRICE_1733312400000_x9y8z7
const priceSettingCode = `PRICE_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
```

> **NOT**: Bu code'lar tablolarda zaten `code` alanı olarak mevcut. Quote oluşturulurken bu code değerleri `quotes.formTemplateCode` ve `quotes.priceSettingCode` alanlarına kopyalanacak.

---

### PROMPT-B1: Database Schema Güncellemesi

**Amaç**: Quote'larda form/price referans alanlarının eklenmesi

**Tarih**: 4 Aralık 2025  
**Durum**: ✅ **TAMAMLANDI** (B0.2 kapsamında)

> **NOT**: Bu adım B0.2'de zaten tamamlandı. `formTemplateCode` ve `priceSettingCode` alanları quotes tablosuna eklendi ve index'lendi.

**Mevcut Durum**:
- ✅ `formTemplateCode` VARCHAR(100) - quotes tablosunda mevcut
- ✅ `priceSettingCode` VARCHAR(100) - quotes tablosunda mevcut  
- ✅ `idx_quotes_form_template_code` index mevcut
- ✅ `idx_quotes_price_setting_code` index mevcut

**Test Kriterleri**:
- [x] Migration hatasız çalışıyor ✅
- [x] Yeni quote oluşturulurken code'lar kaydediliyor ✅
- [x] Index'ler mevcut ✅

---

### PROMPT-B2: Quote Create/Update'de Code Kaydetme

**Amaç**: Quote oluşturulurken/güncellenirken form template ve price setting code'larının saklanması

**Tarih**: 4 Aralık 2025  
**Durum**: ✅ **TAMAMLANDI** (B0.2 kapsamında)

> **NOT**: Bu adım B0.2'de zaten tamamlandı. `quotes.js` model'inde `create()` metodu güncellendi.

**Gerçekleştirilen Değişiklikler** (`db/models/quotes.js`):

```javascript
// create() metodunda (satır 62-81):
// Get form template code for version tracking
let formTemplateCode = null;
if (formTemplateId) {
  const template = await trx('quotes.form_templates')
    .where('id', formTemplateId)
    .first();
  formTemplateCode = template?.code || null;
}

// Get price setting code for version tracking
let priceSettingCode = null;
if (priceSettingId) {
  const setting = await trx('quotes.price_settings')
    .where('id', priceSettingId)
    .first();
  priceSettingCode = setting?.code || null;
}
```

**Test Kriterleri**:
- [x] Yeni quote'ta formTemplateCode doğru kaydediliyor ✅
- [x] Yeni quote'ta priceSettingCode doğru kaydediliyor ✅

---

### PROMPT-C1: QuoteDetailsPanel - canEdit Optimizasyonu

**Amaç**: Edit lock kontrolünün optimize edilmesi ve gereksiz sorguların engellenmesi

**Tarih**: 4 Aralık 2025  
**Durum**: ✅ **TAMAMLANDI**

**Gerçekleştirilen Değişiklikler** (`QuoteDetailsPanel.jsx`):

1. **Import'lar eklendi**:
   - `formsApi` from forms-service.js
   - `priceApi` from pricing-service.js

2. **State'ler eklendi**:
   ```javascript
   const [formChangeDetected, setFormChangeDetected] = useState(false)
   const [priceChangeDetected, setPriceChangeDetected] = useState(false)
   const [activeFormTemplate, setActiveFormTemplate] = useState(null)
   const [activePriceSetting, setActivePriceSetting] = useState(null)
   ```

3. **Optimized useEffect**:
   - İlk olarak `editStatus` fetch ediliyor
   - Eğer `canEdit=true` ise form/price değişiklikleri kontrol ediliyor
   - Eğer `canEdit=false` ise gereksiz API çağrıları yapılmıyor
   - `formTemplateCode` ve `priceSettingCode` karşılaştırması yapılıyor

4. **Version Change Banners**:
   - Form değişikliği: Mavi banner + "Formu Güncelle" butonu
   - Fiyat değişikliği: Yeşil banner + "Fiyatı Yeniden Hesapla" butonu
   - Her ikisi: Sarı banner + "Formu ve Fiyatı Güncelle" butonu
   - Sadece `canEdit=true` durumunda gösteriliyor

5. **Handler fonksiyonları**:
   - `handleFormUpdateClick()` - TODO: C2'de modal açılacak
   - `handlePriceRecalcClick()` - TODO: C3'te fiyat hesaplanacak

**Test Kriterleri**:
- [x] Edit lock durumunda form/price sorgularını yapmıyor ✅
- [x] Edit lock durumunda uyarı banner'ları gösterilmiyor ✅
- [x] Düzenlenebilir quote'larda form/price sorguları yapılıyor ✅
- [x] Form değişikliği varsa mavi banner görünüyor ✅
- [x] Fiyat değişikliği varsa yeşil banner görünüyor ✅
- [x] Her ikisi varsa sarı banner görünüyor ✅
- [x] Build başarılı ✅

---

### PROMPT-C2: Form Değişiklik Uyarı Butonu ✅ TAMAMLANDI

**Amaç**: Quote detaylarında form template değişikliği için uyarı butonu ve modal

**Durum**: ✅ TAMAMLANDI (2025-12-04)

**Yapılan Değişiklikler**:

1. **FormUpdateModal.jsx oluşturuldu**:
   - Sol panel: Eski form değerleri (readonly)
   - Sağ panel: Yeni form alanları (editable)
   - "Eşleşenleri Kopyala" butonu - fieldCode eşleşmesi
   - Dinamik fiyat hesaplaması (debounced 500ms)
   - Fiyat değişim göstergesi (artış/azalış)

2. **QuoteDetailsPanel.jsx güncellendi**:
   - FormUpdateModal import edildi
   - showFormUpdateModal, oldFormFields, newFormFields state'leri eklendi
   - handleFormUpdateClick async fonksiyonu eklendi
   - handleFormUpdateSave fonksiyonu eklendi
   - FormUpdateModal component'i render'a eklendi

3. **quotes-service.js güncellendi**:
   - updateQuoteForm() fonksiyonu eklendi
   - PUT /api/quotes/:id/form endpoint'ine istek atar

4. **quoteController.js güncellendi**:
   - PUT /api/quotes/:id/form endpoint'i eklendi
   - Edit status kontrolü (getQuoteEditStatus kullanılıyor)
   - formTemplateCode, priceSettingCode güncelleme
   - Audit logging

5. **priceSettingsService.js güncellendi**:
   - create() fonksiyonuna formulaExpression eklendi

6. **pricing-service.js (frontend) güncellendi**:
   - calculatePrice() fonksiyonu eklendi

7. **priceController.js güncellendi**:
   - POST /api/price-settings/calculate endpoint'i eklendi
   - Excel-style formula parsing (= işareti kaldırma)
   - ^ operatörü Math.pow() dönüşümü

8. **quotes.js (model) güncellendi**:
   - update() fonksiyonuna formTemplateId, formTemplateCode, priceSettingId, priceSettingCode, calculatedPrice, finalPrice, lastCalculatedAt alanları eklendi
   - calculatedPrice gönderilmişse otomatik hesaplama atlanıyor

9. **Icons.jsx güncellendi**:
   - Copy, ChevronRight ikonları eklendi

**Değişen Dosyalar**:
- `domains/crm/components/quotes/FormUpdateModal.jsx` (yeni)
- `domains/crm/components/quotes/QuoteDetailsPanel.jsx`
- `domains/crm/services/quotes-service.js`
- `domains/crm/services/pricing-service.js`
- `domains/crm/api/controllers/quoteController.js`
- `domains/crm/api/controllers/priceController.js`
- `domains/crm/api/services/priceSettingsService.js`
- `db/models/quotes.js`
- `shared/components/Icons.jsx`

**Test Kriterleri**:
- [x] Form değişikliği varsa uyarı butonu görünüyor (C1'de yapıldı)
- [x] Modal'da eski form değerleri sol tarafta gösteriliyor
- [x] Modal'da yeni form alanları sağ tarafta düzenlenebilir
- [x] "Eşleşenleri Kopyala" fieldCode eşleşmesi ile çalışıyor
- [x] Fiyat dinamik olarak hesaplanıyor
- [x] Kaydet butonuyla quote başarıyla güncelleniyor
- [x] calculatedPrice ve finalPrice veritabanında güncelleniyor

---

### PROMPT-C3: Price Değişiklik Uyarı Butonu ✅ TAMAMLANDI

**Amaç**: Quote detaylarında price setting değişikliği için uyarı butonu

**Durum**: ✅ TAMAMLANDI (2025-12-04)

**Yapılan Değişiklikler**:

1. **QuoteDetailsPanel.jsx güncellendi**:
   - `showPriceRecalcModal`, `newCalculatedPrice`, `priceRecalcLoading`, `priceChanges` state'leri eklendi
   - `handlePriceRecalcClick()` - Fiyat hesaplar, aynıysa otomatik günceller, farklıysa modal açar
   - `handlePriceRecalcConfirm()` - Yeni fiyatı kaydeder
   - Price Recalc Modal JSX eklendi (değişiklik sebepleriyle)
   - `!isLocked` kontrolü - Fiyat kilitliyse banner gösterilmez

2. **pricing-service.js güncellendi**:
   - `comparePriceSettings()` fonksiyonu eklendi

3. **priceController.js güncellendi**:
   - `POST /api/price-settings/compare` endpoint'i eklendi
   - Excel-style formül fonksiyonları düzeltildi (SQRT, ABS, vb. → Math.sqrt, Math.abs)
   - `mathMethods` listesi ile Math fonksiyonları korunuyor

4. **db/models/quotes.js güncellendi**:
   - `getById()` ve `getAll()` fonksiyonlarına `manualOverride` objesi eklendi
   - `manualPrice` varsa `{ active: true, price, note, timestamp }` döndürülüyor

5. **quoteController.js güncellendi**:
   - `/api/quotes/:id/form` endpoint'inde finalPrice mantığı düzeltildi
   - Fiyat kilitliyse (manualPrice) finalPrice değiştirilmiyor

6. **FormUpdateModal.jsx güncellendi**:
   - `calculatedPrice === null` kontrolü eklendi (kaydet butonu disabled)
   - Buton metni "Fiyat Hesaplanıyor..." gösteriyor

7. **Icons.jsx güncellendi**:
   - Calculator, Sliders iconları eklendi

**Değişen Dosyalar**:
- `domains/crm/components/quotes/QuoteDetailsPanel.jsx`
- `domains/crm/services/pricing-service.js`
- `domains/crm/api/controllers/priceController.js`
- `domains/crm/api/controllers/quoteController.js`
- `domains/crm/components/quotes/FormUpdateModal.jsx`
- `db/models/quotes.js`
- `shared/components/Icons.jsx`

**Test Kriterleri**:
- [x] Price değişikliği varsa uyarı butonu görünüyor
- [x] Tıklanınca fiyat yeniden hesaplanıyor
- [x] Onay modal'ı gösteriliyor
- [x] Onaylanınca quote güncelleniyor

**Notlar (2025-12-04)**:
- `handlePriceRecalcClick()` aktif price setting ile fiyat hesaplar
- `handleConfirmPriceRecalc()` yeni fiyatı kaydeder
- Inline modal ile eski/yeni fiyat karşılaştırması gösterilir
- Değişiklik sebepleri gösteriliyor (formül değişikliği, parametre değişiklikleri)
- Calculator ve Sliders Lucide iconları eklendi
- Fiyat aynıysa modal açılmadan otomatik güncelleme yapılır
- Fiyat kilitli (manualOverride) ise banner gösterilmez
- `POST /api/price-settings/compare` endpoint'i eklendi
- Excel-style formül fonksiyonları (SQRT, ABS, vb.) düzeltildi

---

### PROMPT-C4: Birleşik Form+Price Uyarı Butonu ✅ TAMAMLANDI

**Amaç**: Hem form hem price değiştiğinde tek buton ile güncelleme

**Ön Araştırma**:
1. PROMPT-C2 ve PROMPT-C3 tamamlandıktan sonra
2. Modal tasarımını birleştir

**✅ UYGULAMA NOTLARI**:

C2 ve C3 implementasyonları zaten birleşik çalışacak şekilde tasarlanmıştı:

1. **Banner Logic (QuoteDetailsPanel.jsx line 739)**:
   - `formChangeDetected && priceChangeDetected` → Sarı banner (#fef3c7)
   - "Formu ve Fiyatı Güncelle" butonu gösterilir
   
2. **FormUpdateModal zaten her iki kodu da gönderiyor (line 103-110)**:
   ```javascript
   const updatePayload = {
     formTemplateId: activeFormTemplate.id,
     formTemplateVersion: activeFormTemplate.version,
     formTemplateCode: activeFormTemplate.code,     // Form code
     formData: newFormData,
     calculatedPrice: calculatedPrice,
     priceSettingId: activePriceSetting?.id,
     priceSettingCode: activePriceSetting?.code     // Price code
   }
   ```

3. **handleFormUpdateSave güncellendi** - Her iki flag'i de reset eder:
   ```javascript
   setFormChangeDetected(false)
   setPriceChangeDetected(false) // C4: Combined update
   ```

**Değişen Dosyalar**:
- `domains/crm/components/quotes/QuoteDetailsPanel.jsx` - handleFormUpdateSave güncellendi
- `domains/crm/components/quotes/FormUpdateModal.jsx` - Comment güncellendi (C2/C4)

**Test Kriterleri**:
- [x] Her iki değişiklik varsa tek buton görünüyor (sarı "Formu ve Fiyatı Güncelle")
- [x] Modal her iki güncellemeyi birlikte yapıyor (formTemplateCode + priceSettingCode)
- [x] Fiyat dinamik hesaplanıyor (activePriceSetting ile)
- [x] Save sonrası her iki flag da reset ediliyor

---

### PROMPT-D1: Quote Edit Modal - Fiyat Değişikliği Onay Akışı ✅ TAMAMLANDI

**Amaç**: Quote düzenlenirken form alanları değiştiğinde fiyat değişikliği onayı

**Uygulanan Çözüm**:

Form alanları için ayrı bir edit yapısı oluşturuldu:
- **Form Bilgileri Container**: Kendi Düzenle/İptal/Kaydet butonlarıyla ayrı container
- **formEditing State**: Sadece form alanları için ayrı edit state
- **formFieldsData State**: Form alanları için ayrı data state (source of truth)
- **D1 Price Confirm Modal**: Fiyat değiştiğinde onay modalı
- **quoteFormTemplate State**: Quote'un kendi şablonu (aktif şablon değil)
- **templateRefreshKey**: Template yeniden fetch trigger'ı

**Kritik Düzeltmeler**:
1. **Quote'un Kendi Şablonu**: `quoteFormTemplate` state'i eklendi - quote detaylarında aktif şablon değil, quote'un kayıtlı `formTemplateId`'sine ait şablon kullanılıyor
2. **Quote'un Kendi Fiyat Ayarı**: `handleFormFieldsSave` içinde `quote.priceSettingId` kullanılıyor (aktif setting değil)
3. **Anında UI Güncelleme**: `formFieldsData` her zaman source of truth olarak kullanılıyor
4. **Formül Güzelleştirme**: Backend'de `beautifyFormula()` fonksiyonu parametre kodlarını isimlere çeviriyor

**Eklenen State'ler**:
```javascript
const [formEditing, setFormEditing] = useState(false)
const [formFieldsData, setFormFieldsData] = useState({})
const [originalFormFieldsData, setOriginalFormFieldsData] = useState({})
const [showPriceConfirmModal, setShowPriceConfirmModal] = useState(false)
const [pendingChanges, setPendingChanges] = useState(null)
const [quoteFormTemplate, setQuoteFormTemplate] = useState(null)
const [templateRefreshKey, setTemplateRefreshKey] = useState(0)
```

**Eklenen Fonksiyonlar**:
- `handleFormFieldChange()` - Form alanı değişikliği
- `handleFormEditCancel()` - İptal
- `handleFormFieldsSave()` - Kaydet + fiyat kontrolü (quote.priceSettingId kullanır)
- `saveFormFields()` - Kaydetme helper
- `handlePriceConfirm()` - Modal onay
- `handlePriceConfirmCancel()` - Modal iptal
- `beautifyFormula()` (Backend) - Formül parametrelerini isimlere çevirir

**UI Değişiklikleri**:
- Temel Bilgiler: Sadece ID, Tarih, Durum
- Form Bilgileri: Ayrı container, kendi edit butonları, quote'un şablonunu kullanır
- D1 Modal: Değişen alanlar + fiyat farkı gösterimi
- Formül Karşılaştırma: İnsan-okunur parametre isimleri

**Test Kriterleri**:
- [x] Form alanları ayrı container'da gösteriliyor
- [x] Quote'un kendi şablonundaki alanlar gösteriliyor (aktif şablon değil)
- [x] Form Düzenle butonu ayrı çalışıyor
- [x] Kaydet'te quote'un fiyat ayarıyla hesaplama yapılıyor
- [x] Fiyat farkı varsa onay modalı çıkıyor
- [x] Modal'da değişen alanlar gösteriliyor
- [x] İptal'de form edit açık kalıyor
- [x] Onayda form + fiyat kaydediliyor
- [x] Kayıt sonrası UI anında güncelleniyor (F5 gerekmez)

---

### PROMPT-D2: Form Field Type Render Düzeltmesi

**Amaç**: Edit modda form alanlarının doğru tipte render edilmesi

**Ön Araştırma**:
1. `read_file` ile QuoteDetailsPanel form render kısmını incele
2. `formConfig.fields` yapısını incele
3. Mevcut field type handling'i kontrol et

**Yapılacaklar**:

1. **Field type'a göre render**:
   ```jsx
   function renderEditField(field, value, onChange) {
     switch (field.type || field.fieldType) {
       case 'select':
         return (
           <select value={value} onChange={onChange}>
             {field.options?.map(opt => (
               <option key={opt.value} value={opt.value}>
                 {opt.label}
               </option>
             ))}
           </select>
         );
       
       case 'radio':
         return (
           <div className="radio-group">
             {field.options?.map(opt => (
               <label key={opt.value}>
                 <input 
                   type="radio" 
                   value={opt.value}
                   checked={value === opt.value}
                   onChange={onChange}
                 />
                 {opt.label}
               </label>
             ))}
           </div>
         );
       
       case 'number':
         return (
           <input 
             type="number" 
             value={value} 
             onChange={onChange}
             step={field.step || 1}
             min={field.min}
             max={field.max}
           />
         );
       
       case 'textarea':
         return (
           <textarea value={value} onChange={onChange} />
         );
       
       default:
         return (
           <input type="text" value={value} onChange={onChange} />
         );
     }
   }
   ```

2. **formConfig yapısını normalize et**:
   - Backend'den gelen `fieldType` → `type` mapping
   - Options format standardizasyonu

**Değişecek Dosyalar**:
- `domains/crm/components/quotes/QuoteDetailsPanel.jsx`

**Test Kriterleri**:
- [ ] Select alanlar dropdown olarak render ediliyor
- [ ] Radio alanlar radio button olarak render ediliyor
- [ ] Number alanlar number input olarak render ediliyor
- [ ] Textarea alanlar büyük metin kutusu olarak render ediliyor

---

### PROMPT-E1: FormUpdateModal Componenti

**Amaç**: Form güncelleme modal'ının ayrı component olarak oluşturulması

**Ön Araştırma**:
1. Modal tasarım gereksinimlerini incele
2. Side-by-side form comparison UI tasarla

**Yapılacaklar**:

1. **FormUpdateModal.jsx oluştur**:
   ```jsx
   export default function FormUpdateModal({
     isOpen,
     oldFormData,
     oldFields,
     newFields,
     oldPrice, // ESKİ FİYAT
     onSave,
     onCancel
   }) {
     const [newFormData, setNewFormData] = useState({});
     const [calculatedPrice, setCalculatedPrice] = useState(null);
     const [isCalculating, setIsCalculating] = useState(false);
     const [error, setError] = useState(null);
     const [isSaving, setIsSaving] = useState(false);
     
     // Eşleşen field'ları bul
     const matchingFields = useMemo(() => {
       return newFields.filter(newField => 
         oldFields.some(oldField => 
           oldField.fieldCode === newField.fieldCode
         )
       );
     }, [oldFields, newFields]);
     
     // Eşleşmeyen (yeni eklenen) field'lar
     const newOnlyFields = useMemo(() => {
       return newFields.filter(newField => 
         !oldFields.some(oldField => 
           oldField.fieldCode === newField.fieldCode
         )
       );
     }, [oldFields, newFields]);
     
     // Kaldırılan field'lar
     const removedFields = useMemo(() => {
       return oldFields.filter(oldField => 
         !newFields.some(newField => 
           newField.fieldCode === oldField.fieldCode
         )
       );
     }, [oldFields, newFields]);
     
     // Eşleşenleri kopyala
     function handleCopyMatching() {
       const copied = {};
       matchingFields.forEach(field => {
         const oldValue = oldFormData[field.fieldCode];
         if (oldValue !== undefined) {
           copied[field.fieldCode] = oldValue;
         }
       });
       setNewFormData(prev => ({ ...prev, ...copied }));
     }
     
     // Dinamik fiyat hesaplama (DEBOUNCED)
     const debouncedCalculate = useMemo(
       () => debounce(async (formData) => {
         if (Object.keys(formData).length === 0) return;
         
         setIsCalculating(true);
         setError(null);
         try {
           const result = await quotesService.calculatePrice(formData);
           setCalculatedPrice(result.price);
         } catch (err) {
           setError('Fiyat hesaplanamadı');
           console.error(err);
         } finally {
           setIsCalculating(false);
         }
       }, 500), // 500ms debounce
       []
     );
     
     useEffect(() => {
       debouncedCalculate(newFormData);
       return () => debouncedCalculate.cancel();
     }, [newFormData, debouncedCalculate]);
     
     // Kaydetme
     async function handleSave() {
       setIsSaving(true);
       setError(null);
       try {
         await onSave(newFormData, calculatedPrice);
       } catch (err) {
         setError('Kayıt başarısız: ' + err.message);
       } finally {
         setIsSaving(false);
       }
     }
     
     if (!isOpen) return null;
     
     const priceDiff = calculatedPrice !== null ? calculatedPrice - oldPrice : null;
     
     return (
       <div className="modal-overlay">
         <div className="form-update-modal">
           <div className="modal-header">
             <h2>Form Güncelleme</h2>
             <button onClick={onCancel} disabled={isSaving}>×</button>
           </div>
           
           {/* Değişiklik Özeti */}
           <div className="change-summary">
             {matchingFields.length > 0 && (
               <span className="badge matching">✓ {matchingFields.length} eşleşen alan</span>
             )}
             {newOnlyFields.length > 0 && (
               <span className="badge new">+ {newOnlyFields.length} yeni alan</span>
             )}
             {removedFields.length > 0 && (
               <span className="badge removed">- {removedFields.length} kaldırılan alan</span>
             )}
           </div>
           
           <div className="modal-content">
             {/* Left Panel - Old Form */}
             <div className="old-form-panel">
               <h3>Mevcut Form Değerleri</h3>
               {oldFields.map(field => {
                 const isRemoved = removedFields.includes(field);
                 return (
                   <div 
                     key={field.fieldCode} 
                     className={`form-field readonly ${isRemoved ? 'removed' : ''}`}
                   >
                     <label>
                       {field.label}
                       {isRemoved && <span className="removed-badge">Kaldırıldı</span>}
                     </label>
                     <span>{oldFormData[field.fieldCode] || '—'}</span>
                   </div>
                 );
               })}
             </div>
             
             {/* Right Panel - New Form */}
             <div className="new-form-panel">
               <div className="panel-header">
                 <h3>Yeni Form Alanları</h3>
                 <button 
                   onClick={handleCopyMatching}
                   disabled={matchingFields.length === 0}
                   className="btn-copy"
                 >
                   📋 Eşleşenleri Kopyala ({matchingFields.length})
                 </button>
               </div>
               {newFields.map(field => {
                 const isNew = newOnlyFields.includes(field);
                 const isMatching = matchingFields.some(m => m.fieldCode === field.fieldCode);
                 return (
                   <div 
                     key={field.fieldCode} 
                     className={`form-field editable ${isNew ? 'new-field' : ''}`}
                   >
                     <label>
                       {field.label}
                       {isMatching && <span className="match-badge">✓</span>}
                       {isNew && <span className="new-badge">Yeni</span>}
                     </label>
                     {renderEditField(field, newFormData[field.fieldCode], (e) => {
                       setNewFormData(prev => ({
                         ...prev,
                         [field.fieldCode]: e.target.value
                       }));
                     })}
                   </div>
                 );
               })}
             </div>
           </div>
           
           {/* Error Display */}
           {error && (
             <div className="error-banner">
               ⚠️ {error}
             </div>
           )}
           
           {/* Price Preview */}
           <div className="price-preview">
             <div className="price-comparison">
               <div className="old-price">
                 <span className="label">Mevcut Fiyat</span>
                 <span className="value">{oldPrice?.toLocaleString('tr-TR') || '—'} ₺</span>
               </div>
               <div className="arrow">→</div>
               <div className="new-price">
                 <span className="label">Yeni Fiyat</span>
                 {isCalculating ? (
                   <span className="value loading">Hesaplanıyor...</span>
                 ) : (
                   <span className="value">
                     {calculatedPrice?.toLocaleString('tr-TR') || '—'} ₺
                   </span>
                 )}
               </div>
             </div>
             {priceDiff !== null && Math.abs(priceDiff) > 0.01 && (
               <div className={`price-diff ${priceDiff > 0 ? 'increase' : 'decrease'}`}>
                 {priceDiff > 0 ? '↑' : '↓'} {Math.abs(priceDiff).toLocaleString('tr-TR')} ₺
               </div>
             )}
           </div>
           
           <div className="modal-footer">
             <button 
               className="btn-cancel" 
               onClick={onCancel}
               disabled={isSaving}
             >
               İptal
             </button>
             <button 
               className="btn-save" 
               onClick={handleSave}
               disabled={isSaving || isCalculating || calculatedPrice === null}
             >
               {isSaving ? 'Kaydediliyor...' : 'Kaydet ve Güncelle'}
             </button>
           </div>
         </div>
       </div>
     );
   }
   ```

**Değişecek Dosyalar**:
- `domains/crm/components/quotes/FormUpdateModal.jsx` (yeni)
- `domains/crm/styles/quotes.css` (modal stilleri)

**Test Kriterleri**:
- [ ] Modal açılıp kapanabiliyor
- [ ] Eski form değerleri sol panelde görünüyor
- [ ] Yeni form alanları sağ panelde düzenlenebilir
- [ ] "Eşleşenleri Kopyala" fieldCode eşleşmesi ile çalışıyor
- [ ] Fiyat dinamik olarak güncelleniyor (debounce ile)
- [ ] Eski fiyat ve yeni fiyat yan yana gösteriliyor
- [ ] Fiyat farkı gösteriliyor (artış/azalış)
- [ ] Yeni eklenen alanlar "Yeni" badge ile işaretleniyor
- [ ] Kaldırılan alanlar "Kaldırıldı" badge ile işaretleniyor
- [ ] Loading state'ler düzgün çalışıyor
- [ ] Error handling düzgün çalışıyor

---

### PROMPT-E2: PriceConfirmModal Componenti

**Amaç**: Fiyat onay modal'ının ayrı component olarak oluşturulması

**Yapılacaklar**:

1. **PriceConfirmModal.jsx oluştur**:
   ```jsx
   export default function PriceConfirmModal({
     isOpen,
     currentPrice,
     newPrice,
     priceDiff,
     changes,
     onConfirm,
     onCancel
   }) {
     if (!isOpen) return null;
     
     const isIncrease = priceDiff > 0;
     
     return (
       <div className="modal-overlay">
         <div className="price-confirm-modal">
           <div className="modal-header">
             <h2>Fiyat Değişikliği Onayı</h2>
             <button onClick={onCancel}>×</button>
           </div>
           
           <div className="modal-content">
             <div className="price-comparison">
               <div className="price-item">
                 <span className="label">Mevcut Fiyat</span>
                 <span className="value">{currentPrice.toLocaleString('tr-TR')} ₺</span>
               </div>
               <div className="price-arrow">→</div>
               <div className="price-item">
                 <span className="label">Yeni Fiyat</span>
                 <span className="value">{newPrice.toLocaleString('tr-TR')} ₺</span>
               </div>
             </div>
             
             <div className={`price-diff ${isIncrease ? 'increase' : 'decrease'}`}>
               {isIncrease ? '↑' : '↓'} {Math.abs(priceDiff).toLocaleString('tr-TR')} ₺
               ({isIncrease ? 'Artış' : 'Azalış'})
             </div>
             
             {changes && changes.length > 0 && (
               <div className="changes-list">
                 <h4>Değişiklikler</h4>
                 <ul>
                   {changes.map((change, idx) => (
                     <li key={idx}>
                       <strong>{change.fieldLabel}:</strong> {change.oldValue} → {change.newValue}
                     </li>
                   ))}
                 </ul>
               </div>
             )}
           </div>
           
           <div className="modal-footer">
             <button className="btn-cancel" onClick={onCancel}>İptal</button>
             <button className="btn-confirm" onClick={onConfirm}>
               Onayla ve Kaydet
             </button>
           </div>
         </div>
       </div>
     );
   }
   ```

**Değişecek Dosyalar**:
- `domains/crm/components/quotes/PriceConfirmModal.jsx` (yeni)
- `domains/crm/styles/quotes.css` (modal stilleri)

**Test Kriterleri**:
- [ ] Modal açılıp kapanabiliyor
- [ ] Fiyat karşılaştırması görünüyor
- [ ] Fark artış/azalış olarak gösteriliyor
- [ ] Değişiklik listesi görünüyor
- [ ] Onaylama kaydı tetikliyor

---

### PROMPT-F1: Backend - Fiyat Hesaplama API Optimizasyonu

**Amaç**: Dinamik fiyat hesaplama için optimize edilmiş endpoint

**Ön Araştırma**:
1. `read_file` ile `priceFormulas.js` calculatePrice metodunu incele
2. Mevcut hesaplama mantığını analiz et

**Yapılacaklar**:

1. **Yeni endpoint ekle** (`quoteController.js`):
   ```javascript
   // POST /api/quotes/calculate-price
   app.post('/api/quotes/calculate-price', requireAuth, async (req, res) => {
     try {
       const { formData } = req.body;
       
       // Aktif price setting'i al
       const activeSetting = await PriceSettings.getActiveWithDetails();
       if (!activeSetting || !activeSetting.formula) {
         return res.status(400).json({ 
           error: 'No active price setting' 
         });
       }
       
       // Fiyat hesapla
       const calculation = await PriceFormulas.calculatePrice(
         activeSetting.formula.id, 
         formData
       );
       
       res.json({
         success: true,
         price: calculation.totalPrice,
         details: calculation.calculationDetails,
         settingCode: activeSetting.code,
         settingVersion: activeSetting.version
       });
     } catch (error) {
       res.status(500).json({ error: error.message });
     }
   });
   ```

2. **Frontend service güncelle** (`quotes-service.js`):
   ```javascript
   async calculatePrice(formData) {
     const response = await fetch(`${API_BASE}/api/quotes/calculate-price`, {
       method: 'POST',
       headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify({ formData })
     });
     return response.json();
   }
   ```

**Değişecek Dosyalar**:
- `domains/crm/api/controllers/quoteController.js`
- `domains/crm/services/quotes-service.js`

**Test Kriterleri**:
- [ ] Endpoint çalışıyor
- [ ] Aktif setting ile hesaplama yapılıyor
- [ ] Detaylı breakdown döndürülüyor

---

### PROMPT-F2: QuotesManager - Sayfa Yüklenme Optimizasyonu

**Amaç**: Liste yüklenirken gereksiz version check sorgularının kaldırılması

**Ön Araştırma**:
1. `read_file` ile `QuotesManager.js` oku
2. `checkAndProcessVersionUpdates()` fonksiyonunu incele
3. Performans sorunlarını tespit et

**Yapılacaklar**:

1. **checkAndProcessVersionUpdates kaldır** veya optimize et:
   ```javascript
   // ESKİ - her quote için API çağrısı yapıyordu
   // for (const quote of quotes) {
   //   await API.compareQuotePriceVersions(quote.id);
   // }
   
   // YENİ - hiçbir şey yapma, detay panelinde yapılacak
   async function checkAndProcessVersionUpdates(quotesData) {
     // NOOP - Version kontrolü detay panelinde yapılacak
     console.log('Version checks moved to detail panel');
   }
   ```

2. **Liste yüklemesini basitleştir**:
   ```javascript
   async function loadQuotes() {
     setLoading(true);
     try {
       const quotesData = await API.listQuotes();
       setList(quotesData);
       // KALDIRILDI: await checkAndProcessVersionUpdates(quotesData);
     } finally {
       setLoading(false);
     }
   }
   ```

**Değişecek Dosyalar**:
- `domains/crm/components/quotes/QuotesManager.js`

**Test Kriterleri**:
- [ ] Sayfa yüklenme süresi düştü
- [ ] Backend'e gereksiz sorgular yapılmıyor
- [ ] Liste düzgün yükleniyor

---

## UYGULAMA SIRASI

### Faz 1: Database ve Backend (PROMPT-B1, B2, F1)
1. Migration dosyası oluştur ve çalıştır
2. quotes.js model güncelle
3. Fiyat hesaplama API'si ekle

### Faz 2: Form Manager UI (PROMPT-A1)
1. Buton text ve renk değişiklikleri
2. Taslak/aktif etme mantığı

### Faz 3: Pricing Manager UI (PROMPT-A2)
1. Form Manager ile tutarlı değişiklikler

### Faz 4: Quote Details - Optimizasyon (PROMPT-C1, F2)
1. canEdit kontrolü optimize et
2. Sayfa yüklenme sorgularını azalt

### Faz 5: Quote Details - Uyarı Butonları (PROMPT-C2, C3, C4)
1. Form değişiklik uyarısı
2. Price değişiklik uyarısı
3. Birleşik uyarı

### Faz 6: Modal Componentleri (PROMPT-E1, E2)
1. FormUpdateModal oluştur
2. PriceConfirmModal oluştur

### Faz 7: Edit Modal Düzeltmeleri (PROMPT-D1, D2)
1. Fiyat değişikliği onay akışı
2. Field type render düzeltmesi

---

## COMMIT STRATEJİSİ

```
feat(db): [FP-B1] Add formTemplateCode and priceSettingCode to quotes
feat(backend): [FP-B2] Save template/setting codes on quote create
feat(backend): [FP-F1] Add calculate-price endpoint
feat(forms): [FP-A1] Refactor form manager draft/active flow
feat(pricing): [FP-A2] Refactor pricing manager draft/active flow
perf(quotes): [FP-C1] Optimize canEdit check flow
perf(quotes): [FP-F2] Remove unnecessary version checks on page load
feat(quotes): [FP-C2] Add form change warning button
feat(quotes): [FP-C3] Add price change warning button
feat(quotes): [FP-C4] Add combined form+price warning button
feat(quotes): [FP-E1] Create FormUpdateModal component
feat(quotes): [FP-E2] Create PriceConfirmModal component
feat(quotes): [FP-D1] Add price change confirmation flow
fix(quotes): [FP-D2] Fix field type rendering in edit mode
```

---

## TEST SENARYOLARI

### Senaryo 1: Form Taslak Oluşturma
1. Form Yönetimi'ne git
2. Aktif formu aç
3. Bir alan ekle/değiştir
4. "Taslağı Kaydet" tıkla
5. **Beklenen**: Yeni taslak oluşur, aktif form değişmez

### Senaryo 2: Taslağı Aktif Etme
1. Geçmiş Taslaklar'dan bir taslak seç
2. "Aktif Et" tıkla
3. **Beklenen**: Seçilen taslak aktif olur, eski aktif pasif olur

### Senaryo 3: Quote Form Güncelleme
1. Bir quote'un detaylarını aç
2. Form değişmiş uyarı butonunu gör
3. Butona tıkla
4. Sol panelde eski değerleri gör
5. "Eşleşenleri Kopyala" tıkla
6. Yeni alanları doldur
7. Dinamik fiyatı gör
8. Kaydet
9. **Beklenen**: Quote yeni form ve fiyat ile güncellenir

### Senaryo 4: Quote Edit - Fiyat Onayı
1. Bir quote'un detaylarını aç
2. Düzenle moduna geç
3. Bir sayısal alanı değiştir (örn: adet)
4. Kaydet tıkla
5. Fiyat değişikliği modal'ını gör
6. Onayla
7. **Beklenen**: Yeni fiyat kaydedilir

### Senaryo 5: Edit Lock Durumu
1. Üretimde olan bir quote'un detaylarını aç
2. **Beklenen**: 
   - Düzenle butonu disabled
   - Form/price uyarı butonları yok
   - Backend'e gereksiz sorgu yok

---

## NOTLAR

### Önemli Dosya Yolları
```
/WebApp/db/models/quotes.js
/WebApp/domains/crm/components/quotes/QuoteDetailsPanel.jsx
/WebApp/domains/crm/components/quotes/QuotesManager.js
/WebApp/domains/crm/components/forms/FormManager.jsx
/WebApp/domains/crm/components/forms/formBuilder/FormBuilderCompact.js
/WebApp/domains/crm/components/pricing/PricingManager.jsx
/WebApp/domains/crm/services/quotes-service.js
/WebApp/domains/crm/services/pricing-service.js
/WebApp/domains/crm/services/forms-service.js
/WebApp/domains/crm/api/controllers/quoteController.js
/WebApp/db/migrations/025_quote_versioning.sql (yeni oluşturulacak)
```

### CSS Dosyaları
```
/WebApp/domains/crm/styles/quotes.css - Modal stilleri buraya eklenecek
/WebApp/domains/crm/styles/forms.css - Form Manager buton stilleri
```

### Eklenecek CSS Stilleri

```css
/* Form Manager Buton Stilleri */
.btn-save-draft {
  background-color: #f59e0b; /* Sarı - Taslağı Kaydet */
  color: white;
}

.btn-activate {
  background-color: #10b981; /* Yeşil - Aktif Et */
  color: white;
}

/* FormUpdateModal Stilleri */
.form-update-modal {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 24px;
  max-width: 900px;
}

.old-form-panel {
  background: #f9fafb;
  border-radius: 8px;
  padding: 16px;
}

.new-form-panel {
  background: #ffffff;
  border: 2px solid #3b82f6;
  border-radius: 8px;
  padding: 16px;
}

.form-field.readonly {
  opacity: 0.7;
}

.form-field.new-field {
  border-left: 3px solid #10b981;
  padding-left: 8px;
}

.form-field.removed {
  background: #fef2f2;
  text-decoration: line-through;
}

.badge.matching { background: #dbeafe; color: #1e40af; }
.badge.new { background: #d1fae5; color: #065f46; }
.badge.removed { background: #fee2e2; color: #991b1b; }

.price-preview {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 16px;
  padding: 16px;
  background: #f0f9ff;
  border-radius: 8px;
}

.price-diff.increase { color: #dc2626; }
.price-diff.decrease { color: #16a34a; }

.error-banner {
  background: #fef2f2;
  color: #991b1b;
  padding: 12px;
  border-radius: 4px;
  margin: 8px 0;
}
```

### Bağımlılıklar
- PROMPT-B1 → PROMPT-B2 (migration önce)
- PROMPT-A1 tamamlanmadan PROMPT-A2 yapılmamalı
- PROMPT-C1 tamamlanmadan PROMPT-C2/C3/C4 yapılmamalı
- PROMPT-E1 → PROMPT-C2 için gerekli
- PROMPT-E2 → PROMPT-D1 için gerekli

---

## KULLANICI GEREKSİNİMLERİ REFERANS TABLOSU

> Bu tablo, kullanıcının chat'te belirttiği tüm gereksinimlerin hangi PROMPT'ta ele alındığını gösterir.

| # | Kullanıcı Gereksinimi | İlgili PROMPT |
|---|----------------------|---------------|
| 1 | "Taslağı Kaydet" butonu isActive=false olarak kaydetmeli | PROMPT-A1 |
| 2 | "Aktif Et" butonu yeni versiyon oluşturup isActive=true yapmalı | PROMPT-A1 |
| 3 | "Yeni Taslak Oluştur" → "+Yeni Taslak" kısaltılmalı | PROMPT-A1 |
| 4 | "Taslağı Kaydet" sarı renk olmalı | PROMPT-A1 |
| 5 | "Aktif Et" yeşil renk olmalı | PROMPT-A1 |
| 6 | Price warning liste seviyesinden quote detaya taşınmalı | PROMPT-C2, C3, C4 |
| 7 | Form + Price birleşik güncelleme modal'ı olmalı | PROMPT-C4, E1 |
| 8 | Modal sol panel: eski form değerleri (readonly) | PROMPT-E1 |
| 9 | Modal sağ panel: yeni form alanları (editable) | PROMPT-E1 |
| 10 | "Eşleşenleri Kopyala" butonu fieldCode eşleşmesi ile çalışmalı | PROMPT-E1 |
| 11 | Form dolduruldukça dinamik fiyat hesaplanmalı | PROMPT-E1, F1 |
| 12 | Edit lock durumunda backend sorguları atlanmalı | PROMPT-C1 |
| 13 | Template code karşılaştırması (QUOTE_FORM_*, PRICE_SETTING_*) | PROMPT-B1, B2, C1 |
| 14 | Form field type'lar doğru render edilmeli (select, radio, number, textarea) | PROMPT-D2 |
| 15 | Quote edit'te fiyat değişirse onay modal'ı çıkmalı | PROMPT-D1 |
| 16 | Sayfa yüklenme performansı optimize edilmeli (gereksiz sorgular kaldırılmalı) | PROMPT-F2 |
| 17 | Price Settings UI, Form Manager ile tutarlı olmalı | PROMPT-A2 |
| 18 | Quote güncellenirken formTemplateCode, priceSettingCode kaydedilmeli | PROMPT-B2, C2 |
| 19 | Modal'da eski fiyat ve yeni fiyat yan yana gösterilmeli | PROMPT-E1 |
| 20 | Modal'da fiyat farkı (artış/azalış) gösterilmeli | PROMPT-E1 |
| 21 | Yeni eklenen alanlar "Yeni" badge ile işaretlenmeli | PROMPT-E1 |
| 22 | Kaldırılan alanlar "Kaldırıldı" badge ile işaretlenmeli | PROMPT-E1 |
| 23 | Dinamik fiyat hesaplamada debounce olmalı | PROMPT-E1 |
| 24 | Modal'larda loading state gösterilmeli | PROMPT-E1, E2 |
| 25 | Modal'larda error handling olmalı | PROMPT-E1, E2 |
| 26 | isActive=true ve değişiklik yoksa kaydetme butonları gizli olmalı | PROMPT-A1 |
| 27 | isActive=true ve değişiklik varsa "Yeni Taslak Olarak Kaydet" görünmeli | PROMPT-A1 |
| 28 | isActive=false ve değişiklik yoksa "Aktif Et" görünmeli | PROMPT-A1 |
| 29 | isActive=false ve değişiklik varsa "Taslağı Güncelle" görünmeli | PROMPT-A1 |
| 30 | "Değişiklikleri Geri Al" butonu formu orijinal haline döndürmeli | PROMPT-A1 |
| 31 | Değişiklik varsa "+Yeni Taslak" yerine "Değişiklikleri Geri Al" görünmeli | PROMPT-A1 |
| 32 | Durum badge'inde form adı gösterilmeli: `Taslak **Form Adı**` | PROMPT-A1.2 |
| 33 | Taslak ikonu Lucide Pencil olmalı | PROMPT-A1.2 |
| 34 | Aktif ikonu Lucide Check olmalı | PROMPT-A1.2 |
| 35 | Price Settings: Orphan temizlendikten sonra "Yeni Taslak Olarak Kaydet" görünmeli ✅ | PROMPT-A2 |
| 36 | Price Settings: "Değişiklikleri Geri Al" orphanlı orijinal hale döndürmeli ✅ | PROMPT-A2 |
| 37 | Price Settings: Durum badge'i gösterilmeli: `Taslak • Fiyat Ayarları` ✅ | PROMPT-A2 |
| 38 | Price Settings: Buton görünürlük matrisi PROMPT-A1.1 ile tutarlı olmalı ✅ | PROMPT-A2 |

---

## UYGULAMA KONTROL LİSTESİ

Her PROMPT tamamlandığında işaretlenecek:

- [x] **PROMPT-A1**: Form Manager UI değişiklikleri ✅ (3 Aralık 2025)
- [x] **PROMPT-A1.1**: Buton görünürlük revizyonu ✅ (4 Aralık 2025)
- [x] **PROMPT-A1.2**: Kozmetik güncellemeler (form adı, Lucide ikonlar) ✅ (4 Aralık 2025)
- [x] **PROMPT-A2**: Pricing Manager UI değişiklikleri ✅ (4 Aralık 2025)
- [x] **PROMPT-B0**: Database yapısı optimizasyonu (price_formulas merge, duplicate alanlar) ✅
- [x] **PROMPT-B1**: Database migration (formTemplateCode, priceSettingCode) ✅
- [x] **PROMPT-B2**: Quote create/update'de code kaydetme ✅
- [x] **PROMPT-C1**: canEdit optimizasyonu ✅
- [x] **PROMPT-C2**: Form değişiklik uyarı butonu ✅
- [x] **PROMPT-C3**: Price değişiklik uyarı butonu ✅
- [x] **PROMPT-C4**: Birleşik form+price uyarı butonu ✅
- [x] **PROMPT-D1**: Fiyat değişikliği onay akışı ✅
- [ ] **PROMPT-D2**: Field type render düzeltmesi
- [x] **PROMPT-E1**: FormUpdateModal componenti ✅
- [x] **PROMPT-E2**: PriceConfirmModal componenti ✅ (D1 içinde inline olarak implemente edildi)
- [x] **PROMPT-F1**: Calculate-price API endpoint ✅
- [ ] **PROMPT-F2**: Sayfa yüklenme optimizasyonu
