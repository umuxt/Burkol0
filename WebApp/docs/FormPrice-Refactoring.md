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

**Amaç**: Fiyat ayarları panelinde form manager ile tutarlı taslak/aktif etme akışı

**Ön Araştırma**:
1. `read_file` ile `PricingManager.jsx` oku
2. `grep_search` ile save pattern'lerini bul: `savePriceSettings|onSave|activateSetting`
3. Mevcut buton yapısını analiz et

**Yapılacaklar**:

1. **Aynı buton yapısı**:
   - "+Yeni Taslak"
   - "Taslağı Kaydet" (sarı)
   - "Aktif Et" (yeşil)

2. **Aynı kaydetme/aktif etme mantığı** (PROMPT-A1 ile tutarlı)

**Değişecek Dosyalar**:
- `domains/crm/components/pricing/PricingManager.jsx`

**Test Kriterleri**:
- [ ] Butonlar FormManager ile tutarlı görünüyor
- [ ] Taslak/aktif akışı aynı şekilde çalışıyor

---

### PROMPT-B1: Database Schema Güncellemesi

**Amaç**: Quote'larda form/price referans alanlarının eklenmesi

**Ön Araştırma**:
1. `read_file` ile mevcut migration dosyalarını incele
2. `read_file` ile `quotes.js` model'ini incele
3. Mevcut FK constraint'leri kontrol et

**Yapılacaklar**:

1. **Migration dosyası oluştur** (`025_quote_versioning.sql`):
   ```sql
   -- Quote'a template/setting code referansları ekle
   ALTER TABLE quotes.quotes 
   ADD COLUMN IF NOT EXISTS "formTemplateCode" VARCHAR(100),
   ADD COLUMN IF NOT EXISTS "priceSettingCode" VARCHAR(100);
   
   -- Mevcut veriler için backfill
   UPDATE quotes.quotes q
   SET "formTemplateCode" = (
     SELECT code FROM quotes.form_templates ft 
     WHERE ft.id = q."formTemplateId"
   );
   
   UPDATE quotes.quotes q
   SET "priceSettingCode" = (
     SELECT ps.code FROM quotes.price_settings ps
     JOIN quotes.price_formulas pf ON pf."settingId" = ps.id
     WHERE pf.id = q."priceFormulaId"
   );
   
   -- Index'ler
   CREATE INDEX IF NOT EXISTS idx_quotes_form_template_code 
   ON quotes.quotes("formTemplateCode");
   
   CREATE INDEX IF NOT EXISTS idx_quotes_price_setting_code 
   ON quotes.quotes("priceSettingCode");
   ```

2. **quotes.js model güncelle**:
   - `create()` metodunda `formTemplateCode` ve `priceSettingCode` kaydet
   - `getById()` metodunda bu alanları döndür

**Değişecek Dosyalar**:
- `db/migrations/025_quote_versioning.sql` (yeni)
- `db/models/quotes.js`

**Test Kriterleri**:
- [ ] Migration hatasız çalışıyor
- [ ] Yeni quote oluşturulurken code'lar kaydediliyor
- [ ] Mevcut quote'lar backfill ile güncellendi

---

### PROMPT-B2: Quote Create/Update'de Code Kaydetme

**Amaç**: Quote oluşturulurken/güncellenirken form template ve price setting code'larının saklanması

**Ön Araştırma**:
1. `read_file` ile `quotes.js` model'ini incele
2. `grep_search` ile quote create pattern'lerini bul
3. Frontend'de quote oluşturma akışını incele

**Yapılacaklar**:

1. **quotes.js - create() güncelle**:
   ```javascript
   // Aktif template'in code'unu al
   const activeTemplate = await db('quotes.form_templates')
     .where('isActive', true)
     .first();
   
   // Aktif setting'in code'unu al
   const activeSetting = await db('quotes.price_settings')
     .where('isActive', true)
     .first();
   
   // Quote'a ekle
   formTemplateCode: activeTemplate?.code,
   priceSettingCode: activeSetting?.code
   ```

2. **quotes.js - update() güncelle** (form güncelleme durumunda):
   - Form güncelleme modal'ından geliniyorsa yeni code'ları kaydet

**Değişecek Dosyalar**:
- `db/models/quotes.js`

**Test Kriterleri**:
- [ ] Yeni quote'ta formTemplateCode doğru kaydediliyor
- [ ] Yeni quote'ta priceSettingCode doğru kaydediliyor

---

### PROMPT-C1: QuoteDetailsPanel - canEdit Optimizasyonu

**Amaç**: Edit lock kontrolünün optimize edilmesi ve gereksiz sorguların engellenmesi

**Ön Araştırma**:
1. `read_file` ile `QuoteDetailsPanel.jsx` oku
2. Mevcut `canEdit` API çağrısını incele
3. Sıralama optimizasyonu için mevcut akışı analiz et

**Yapılacaklar**:

1. **Akış optimizasyonu**:
   ```javascript
   // 1. Önce canEdit kontrolü
   const editStatus = await quotesService.getEditStatus(quote.id);
   
   // 2. Eğer canEdit=false ise
   if (!editStatus.canEdit) {
     // Form/price sorgularını YAPMA
     // Sadece readonly göster
     // Uyarı banner'ları gösterme
     return;
   }
   
   // 3. Eğer canEdit=true ise
   // Form/price karşılaştırma sorgularını yap
   const [activeTemplate, activeSetting] = await Promise.all([
     formsApi.getActiveTemplate(),
     priceApi.getActiveSetting()
   ]);
   
   // 4. Karşılaştırma yap
   const formChanged = quote.formTemplateCode !== activeTemplate.code;
   const priceChanged = quote.priceSettingCode !== activeSetting.code;
   ```

2. **State yönetimi**:
   ```javascript
   const [formChangeDetected, setFormChangeDetected] = useState(false);
   const [priceChangeDetected, setPriceChangeDetected] = useState(false);
   const [activeFormTemplate, setActiveFormTemplate] = useState(null);
   const [activePriceSetting, setActivePriceSetting] = useState(null);
   ```

**Değişecek Dosyalar**:
- `domains/crm/components/quotes/QuoteDetailsPanel.jsx`

**Test Kriterleri**:
- [ ] Edit lock durumunda backend sorgularını yapmıyor
- [ ] Edit lock durumunda uyarı banner'ları gösterilmiyor
- [ ] Düzenlenebilir quote'larda form/price sorguları yapılıyor

---

### PROMPT-C2: Form Değişiklik Uyarı Butonu

**Amaç**: Quote detaylarında form template değişikliği için uyarı butonu ve modal

**Ön Araştırma**:
1. `read_file` ile `QuoteDetailsPanel.jsx` oku
2. Mevcut price warning mekanizmasını incele
3. Modal tasarımını planla

**Yapılacaklar**:

1. **Uyarı butonu** (eğer formChanged=true ve priceChanged=false):
   ```jsx
   {formChangeDetected && !priceChangeDetected && (
     <button 
       className="warning-button form-update"
       onClick={() => setShowFormUpdateModal(true)}
     >
       ⚠️ Form Güncellendi
     </button>
   )}
   ```

2. **Form Güncelleme Modal'ı**:
   ```jsx
   <FormUpdateModal
     isOpen={showFormUpdateModal}
     oldFormData={quote.formData}
     oldFields={quote.savedFormFields || []}
     newFields={activeFormTemplate.fields}
     onSave={handleFormUpdate}
     onCancel={() => setShowFormUpdateModal(false)}
   />
   ```

3. **Modal içeriği**:
   - Sol panel: Eski form değerleri (readonly)
   - Sağ panel: Yeni form alanları (input)
   - "Eşleşenleri Kopyala" butonu
   - Alt kısımda dinamik fiyat hesaplaması

4. **Kaydetme sonrası quote güncellemesi**:
   ```javascript
   // Quote güncelleme payload'ı
   {
     formTemplateId: activeFormTemplate.id,
     formTemplateVersion: activeFormTemplate.version,
     formTemplateCode: activeFormTemplate.code,
     formData: newFormData,
     calculatedPrice: newPrice,
     priceFormulaId: activePriceSetting.formula.id,
     priceFormulaVersion: activePriceSetting.formula.version,
     priceSettingCode: activePriceSetting.code,
     priceStatus: 'current'
   }
   ```

**Değişecek Dosyalar**:
- `domains/crm/components/quotes/QuoteDetailsPanel.jsx`
- `domains/crm/components/quotes/FormUpdateModal.jsx` (yeni)

**Test Kriterleri**:
- [ ] Form değişikliği varsa uyarı butonu görünüyor
- [ ] Modal'da eski form değerleri sol tarafta gösteriliyor
- [ ] Modal'da yeni form alanları sağ tarafta düzenlenebilir
- [ ] "Eşleşenleri Kopyala" fieldCode eşleşmesi ile çalışıyor
- [ ] Fiyat dinamik olarak hesaplanıyor

---

### PROMPT-C3: Price Değişiklik Uyarı Butonu

**Amaç**: Quote detaylarında price setting değişikliği için uyarı butonu

**Ön Araştırma**:
1. Mevcut `getPriceWarningInfo()` fonksiyonunu incele
2. Price comparison API'sini incele

**Yapılacaklar**:

1. **Uyarı butonu** (eğer priceChanged=true ve formChanged=false):
   ```jsx
   {priceChangeDetected && !formChangeDetected && (
     <button 
       className="warning-button price-update"
       onClick={handlePriceUpdate}
     >
       ⚠️ Fiyatlandırma Güncellendi - Yeniden Hesapla
     </button>
   )}
   ```

2. **Fiyat güncelleme akışı**:
   - Tıklanınca fiyat yeniden hesaplanır (isActive price_settings'e göre)
   - Onay modal'ı açılır: "Fiyat X₺ → Y₺ olacak"
   - Onaylarsa kaydedilir

**Değişecek Dosyalar**:
- `domains/crm/components/quotes/QuoteDetailsPanel.jsx`

**Test Kriterleri**:
- [ ] Price değişikliği varsa uyarı butonu görünüyor
- [ ] Tıklanınca fiyat yeniden hesaplanıyor
- [ ] Onay modal'ı gösteriliyor
- [ ] Onaylanınca quote güncelleniyor

---

### PROMPT-C4: Birleşik Form+Price Uyarı Butonu

**Amaç**: Hem form hem price değiştiğinde tek buton ile güncelleme

**Ön Araştırma**:
1. PROMPT-C2 ve PROMPT-C3 tamamlandıktan sonra
2. Modal tasarımını birleştir

**Yapılacaklar**:

1. **Tek uyarı butonu** (eğer hem formChanged hem priceChanged):
   ```jsx
   {formChangeDetected && priceChangeDetected && (
     <button 
       className="warning-button combined-update"
       onClick={() => setShowCombinedUpdateModal(true)}
     >
       ⚠️ Form ve Fiyatlandırma Güncellendi
     </button>
   )}
   ```

2. **Birleşik Modal**:
   - Sol panel: Eski form değerleri (readonly)
   - Sağ panel: Yeni form alanları (input)
   - Alt kısımda: Dinamik fiyat hesaplaması
   - Kaydet: Hem formu hem fiyatı günceller

**Değişecek Dosyalar**:
- `domains/crm/components/quotes/QuoteDetailsPanel.jsx`
- `domains/crm/components/quotes/FormUpdateModal.jsx` (güncelle)

**Test Kriterleri**:
- [ ] Her iki değişiklik varsa tek buton görünüyor
- [ ] Modal her iki güncellemeyi birlikte yapıyor
- [ ] Fiyat dinamik hesaplanıyor

---

### PROMPT-D1: Quote Edit Modal - Fiyat Değişikliği Onay Akışı

**Amaç**: Quote düzenlenirken form alanları değiştiğinde fiyat değişikliği onayı

**Ön Araştırma**:
1. `read_file` ile QuoteDetailsPanel edit akışını incele
2. Mevcut `handleSubmit()` fonksiyonunu analiz et

**Yapılacaklar**:

1. **handleSubmit() güncelle**:
   ```javascript
   async function handleSubmit(e) {
     e.preventDefault();
     
     // Fiyat hesapla
     const newPrice = await calculatePrice(formData, activePriceSetting);
     const oldPrice = quote.finalPrice || quote.calculatedPrice;
     const priceDiff = newPrice - oldPrice;
     
     if (Math.abs(priceDiff) > 0.01) {
       // Fiyat değişikliği var - onay modal'ı göster
       setPendingChanges({ formData, newPrice, priceDiff });
       setShowPriceConfirmModal(true);
       return;
     }
     
     // Fiyat değişmedi - direkt kaydet
     await saveQuote(formData, newPrice);
   }
   ```

2. **Fiyat Onay Modal'ı**:
   ```jsx
   <PriceConfirmModal
     isOpen={showPriceConfirmModal}
     currentPrice={quote.finalPrice}
     newPrice={pendingChanges.newPrice}
     priceDiff={pendingChanges.priceDiff}
     changes={getFormChanges(quote.formData, pendingChanges.formData)}
     onConfirm={() => {
       saveQuote(pendingChanges.formData, pendingChanges.newPrice);
       setShowPriceConfirmModal(false);
     }}
     onCancel={() => {
       setShowPriceConfirmModal(false);
       // Edit mode açık kalır
     }}
   />
   ```

**Değişecek Dosyalar**:
- `domains/crm/components/quotes/QuoteDetailsPanel.jsx`
- `domains/crm/components/quotes/PriceConfirmModal.jsx` (yeni)

**Test Kriterleri**:
- [ ] Form değişikliği yapılıp kaydet denildiğinde fiyat hesaplanıyor
- [ ] Fiyat farkı varsa onay modal'ı çıkıyor
- [ ] Modal'da hangi alanların değiştiği gösteriliyor
- [ ] İptal edilince edit mode açık kalıyor
- [ ] Onaylanınca form + fiyat kaydediliyor

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

---

## UYGULAMA KONTROL LİSTESİ

Her PROMPT tamamlandığında işaretlenecek:

- [ ] **PROMPT-B1**: Database migration (formTemplateCode, priceSettingCode)
- [ ] **PROMPT-B2**: Quote create/update'de code kaydetme
- [ ] **PROMPT-F1**: Calculate-price API endpoint
- [x] **PROMPT-A1**: Form Manager UI değişiklikleri ✅ (3 Aralık 2025)
- [x] **PROMPT-A1.1**: Buton görünürlük revizyonu ✅ (4 Aralık 2025)
- [x] **PROMPT-A1.2**: Kozmetik güncellemeler (form adı, Lucide ikonlar) ✅ (4 Aralık 2025)
- [ ] **PROMPT-A2**: Pricing Manager UI değişiklikleri
- [ ] **PROMPT-C1**: canEdit optimizasyonu
- [ ] **PROMPT-F2**: Sayfa yüklenme optimizasyonu
- [ ] **PROMPT-C2**: Form değişiklik uyarı butonu
- [ ] **PROMPT-C3**: Price değişiklik uyarı butonu
- [ ] **PROMPT-C4**: Birleşik form+price uyarı butonu
- [ ] **PROMPT-E1**: FormUpdateModal componenti
- [ ] **PROMPT-E2**: PriceConfirmModal componenti
- [ ] **PROMPT-D1**: Fiyat değişikliği onay akışı
- [ ] **PROMPT-D2**: Field type render düzeltmesi
