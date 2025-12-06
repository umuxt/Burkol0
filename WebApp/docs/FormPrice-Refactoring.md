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

### PROMPT-Pre-D2-1: Option Code Sistemi ve Lookup Tablosu

**Amaç**: Form field options için unique kod sistemi ve parametre bazlı lookup tablosu oluşturma

**Tarih**: 5 Aralık 2025  
**Durum**: ✅ **TAMAMLANDI**

**Commit**: `feat(crm):[FP-Pre-D2-1] Option Code System & Parameter Lookup Table`

---

#### PROBLEM ANALİZİ

**Mevcut Durum**:
```
form_field_options tablosu:
- optionValue: "demir"
- optionLabel: "Demir"
- priceValue: 100  ← TEK DEĞER - TÜM PARAMETRELER İÇİN AYNI

Sorun: Aynı "Demir" seçeneği için:
- Parametre A (Birim Fiyat): 100₺
- Parametre B (İşlem Süresi): 40 saat
- Parametre C (Ağırlık Katsayı): 1.5

Bu yapıda DESTEKLENEMİYOR!
```

**Yeni Durum**:
```
form_field_options tablosu:
- optionCode: "FFOC-0001"  ← UNIQUE KOD (tablo genelinde)
- optionLabel: "Demir"
- (optionValue KALDIRILDI)
- (priceValue KALDIRILDI)

price_parameter_lookups tablosu (YENİ):
- parameterId: 1 (BirimFiyat)
- optionCode: "FFOC-0001"
- value: 100

- parameterId: 2 (İşçilikSüresi)
- optionCode: "FFOC-0001"
- value: 40
```

---

#### DATABASE DEĞİŞİKLİKLERİ

**1. `form_field_options` Tablosu Güncellemesi**

```sql
-- Migration: 026_option_code_system.sql

-- 1.1: optionCode kolonu ekle
ALTER TABLE quotes.form_field_options 
ADD COLUMN IF NOT EXISTS "optionCode" VARCHAR(20);

-- 1.2: Mevcut kayıtlar için optionCode üret
UPDATE quotes.form_field_options 
SET "optionCode" = 'FFOC-' || LPAD(id::text, 4, '0')
WHERE "optionCode" IS NULL;

-- 1.3: optionCode'u NOT NULL ve UNIQUE yap
ALTER TABLE quotes.form_field_options 
ALTER COLUMN "optionCode" SET NOT NULL;

ALTER TABLE quotes.form_field_options 
ADD CONSTRAINT form_field_options_code_unique UNIQUE("optionCode");

-- 1.4: optionValue kolonunu kaldır (artık sadece code+label var)
ALTER TABLE quotes.form_field_options 
DROP COLUMN IF EXISTS "optionValue";

-- 1.5: priceValue kolonunu kaldır (artık price_parameter_lookups'ta)
ALTER TABLE quotes.form_field_options 
DROP COLUMN IF EXISTS "priceValue";

-- 1.6: Index ekle
CREATE INDEX IF NOT EXISTS idx_form_field_options_code 
ON quotes.form_field_options("optionCode");
```

**2. `price_parameter_lookups` Tablosu (YENİ)**

```sql
-- 2.1: Yeni tablo oluştur
CREATE TABLE quotes.price_parameter_lookups (
  "id" SERIAL PRIMARY KEY,
  "parameterId" INTEGER NOT NULL REFERENCES quotes.price_parameters(id) ON DELETE CASCADE,
  "optionCode" VARCHAR(20) NOT NULL,  -- FFOC-0001, FFOC-0002, vb.
  "value" NUMERIC(15,4) NOT NULL,     -- Bu parametre için lookup değeri
  "createdAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  
  CONSTRAINT price_parameter_lookups_unique UNIQUE("parameterId", "optionCode")
);

-- 2.2: Index'ler
CREATE INDEX idx_param_lookups_param_id ON quotes.price_parameter_lookups("parameterId");
CREATE INDEX idx_param_lookups_option_code ON quotes.price_parameter_lookups("optionCode");
```

---

#### YENİ TABLO YAPILARI

##### quotes.form_field_options (GÜNCELLENMİŞ)

| Sütun | Tip | Nullable | Açıklama |
|-------|-----|----------|----------|
| `id` | INT (PK) | NOT NULL | Auto-increment |
| `fieldId` | INT (FK) | NOT NULL | → form_fields.id |
| `optionCode` | VARCHAR(20) | NOT NULL | **YENİ**: FFOC-0001 (unique) |
| `optionLabel` | VARCHAR(255) | NOT NULL | Kullanıcıya gösterilen metin |
| `sortOrder` | INT | NOT NULL | Default: 0 |
| `isActive` | BOOLEAN | NULL | Default: true |
| `createdAt` | TIMESTAMPTZ | NOT NULL | |
| `updatedAt` | TIMESTAMPTZ | NOT NULL | |

> **KALDIRILAN KOLONLAR**: `optionValue`, `priceValue`

##### quotes.price_parameter_lookups (YENİ)

| Sütun | Tip | Nullable | Açıklama |
|-------|-----|----------|----------|
| `id` | INT (PK) | NOT NULL | Auto-increment |
| `parameterId` | INT (FK) | NOT NULL | → price_parameters.id |
| `optionCode` | VARCHAR(20) | NOT NULL | → form_field_options.optionCode |
| `value` | NUMERIC(15,4) | NOT NULL | Lookup değeri (10, 40, 1.5, vb.) |
| `createdAt` | TIMESTAMPTZ | NOT NULL | |
| `updatedAt` | TIMESTAMPTZ | NOT NULL | |

---

#### OPTION CODE ÜRETME MANTIĞI

```javascript
// formFields.js model'inde

static async generateOptionCode() {
  const result = await db('quotes.form_field_options')
    .max('id as maxId')
    .first();
  
  const nextId = (result?.maxId || 0) + 1;
  return `FFOC-${String(nextId).padStart(4, '0')}`;
}

static async addOption({ fieldId, optionLabel, sortOrder = 0, isActive = true }) {
  const optionCode = await this.generateOptionCode();
  
  const [option] = await db('quotes.form_field_options')
    .insert({
      fieldId,
      optionCode,      // FFOC-0001, FFOC-0002, vb.
      optionLabel,     // "Demir", "Çelik", vb.
      sortOrder,
      isActive,
      createdAt: db.fn.now(),
      updatedAt: db.fn.now()
    })
    .returning('*');
  
  return option;
}
```

---

#### VERİ AKIŞI ÖRNEĞİ

```
┌─────────────────────────────────────────────────────────────────────┐
│                    FORM BUILDER                                      │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │ Alan: "Malzeme Türü" (select)                                 │  │
│  │ Seçenekler:                                                   │  │
│  │   FFOC-0001: "Demir"                                          │  │
│  │   FFOC-0002: "Çelik"                                          │  │
│  │   FFOC-0003: "Bakır"                                          │  │
│  └───────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    PRICING MANAGER                                   │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │ Parametre A: "Birim Fiyat"                                    │  │
│  │ Form Alanı: "Malzeme Türü"                                    │  │
│  │ ┌───────────────────────────────────────────────────────────┐ │  │
│  │ │ Lookup Tablosu:                                           │ │  │
│  │ │   Demir (FFOC-0001)  → [  100  ] ₺                        │ │  │
│  │ │   Çelik (FFOC-0002)  → [  150  ] ₺                        │ │  │
│  │ │   Bakır (FFOC-0003)  → [  200  ] ₺                        │ │  │
│  │ └───────────────────────────────────────────────────────────┘ │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                      │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │ Parametre B: "İşçilik Süresi"                                 │  │
│  │ Form Alanı: "Malzeme Türü" (AYNI ALAN!)                       │  │
│  │ ┌───────────────────────────────────────────────────────────┐ │  │
│  │ │ Lookup Tablosu:                                           │ │  │
│  │ │   Demir (FFOC-0001)  → [   40  ] saat                     │ │  │
│  │ │   Çelik (FFOC-0002)  → [   50  ] saat                     │ │  │
│  │ │   Bakır (FFOC-0003)  → [   60  ] saat                     │ │  │
│  │ └───────────────────────────────────────────────────────────┘ │  │
│  └───────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    DATABASE                                          │
│                                                                      │
│  form_field_options:                                                 │
│  ┌──────┬─────────┬────────────┬─────────────┐                      │
│  │ id   │ fieldId │ optionCode │ optionLabel │                      │
│  ├──────┼─────────┼────────────┼─────────────┤                      │
│  │ 1    │ 10      │ FFOC-0001  │ Demir       │                      │
│  │ 2    │ 10      │ FFOC-0002  │ Çelik       │                      │
│  │ 3    │ 10      │ FFOC-0003  │ Bakır       │                      │
│  └──────┴─────────┴────────────┴─────────────┘                      │
│                                                                      │
│  price_parameter_lookups:                                            │
│  ┌─────────────┬────────────┬─────────┐                             │
│  │ parameterId │ optionCode │ value   │                             │
│  ├─────────────┼────────────┼─────────┤                             │
│  │ 1 (BirimFiy)│ FFOC-0001  │ 100.00  │  ← Demir → 100₺             │
│  │ 1 (BirimFiy)│ FFOC-0002  │ 150.00  │  ← Çelik → 150₺             │
│  │ 1 (BirimFiy)│ FFOC-0003  │ 200.00  │  ← Bakır → 200₺             │
│  │ 2 (İşçilik) │ FFOC-0001  │ 40.00   │  ← Demir → 40 saat          │
│  │ 2 (İşçilik) │ FFOC-0002  │ 50.00   │  ← Çelik → 50 saat          │
│  │ 2 (İşçilik) │ FFOC-0003  │ 60.00   │  ← Bakır → 60 saat          │
│  └─────────────┴────────────┴─────────┘                             │
└─────────────────────────────────────────────────────────────────────┘
```

---

#### YAPILACAKLAR

**Faz Pre-D2-1.1: Database Migration**
- [x] `026_option_code_system.sql` migration dosyası oluştur ✅
- [x] `optionCode` kolonu ekle ve mevcut verileri migrate et ✅
- [x] `optionValue` ve `priceValue` kolonları kaldırıldı (temiz başlangıç) ✅
- [x] `price_parameter_lookups` tablosunu oluştur ✅

**Faz Pre-D2-1.2: Backend Models**
- [x] `formFields.js` - `generateOptionCode()` fonksiyonu ✅
- [x] `formFields.js` - `addOption()` güncelle (optionCode kullan) ✅
- [x] `formFields.js` - `getOptions()` güncelle ✅
- [x] `formFields.js` - `getOptionByCode()` yeni metod ✅
- [x] `formFields.js` - `getOptionsByFieldCode()` yeni metod ✅
- [x] `priceParameterLookups.js` - Yeni model oluştur ✅

**Faz Pre-D2-1.3: Backend API**
- [x] `POST /api/price-parameters/:id/lookups` - Lookup ekle/güncelle ✅
- [x] `GET /api/price-parameters/:id/lookups` - Lookup listele ✅
- [x] `PATCH /api/price-parameters/:id/lookups/:optionCode` - Lookup güncelle ✅
- [x] `DELETE /api/price-parameters/:id/lookups/:optionCode` - Lookup sil ✅
- [x] `DELETE /api/price-parameters/:id/lookups` - Tüm lookupları sil ✅
- [x] `GET /api/price-parameters/:id/with-lookups` - Parametre + lookups ✅

**Faz Pre-D2-1.4: Price Calculator Güncelleme**
- [x] `priceCalculator.js` - `optionCode` ile lookup yapacak şekilde güncelle ✅
- [x] `priceCalculator.js` - Backward compatibility kaldırıldı (temiz başlangıç) ✅

---

#### DEĞİŞEN DOSYALAR

| Dosya | Değişiklik |
|-------|------------|
| `db/migrations/026_option_code_system.sql` | Yeni migration ✅ |
| `db/models/formFields.js` | optionCode sistemi ✅ |
| `db/models/priceParameterLookups.js` | Yeni model ✅ |
| `db/models/priceParameters.js` | Lookup metodları ✅ |
| `server/priceCalculator.js` | optionCode lookup ✅ |
| `domains/crm/api/controllers/priceController.js` | Lookup API ✅ |

---

#### EK DÜZELTMELER (Pre-D2-1 Kapsamında)

Uygulama sırasında tespit edilen ve düzeltilen sorunlar:

| Dosya | Sorun | Çözüm |
|-------|-------|-------|
| `db/models/formTemplates.js` | `optionValue` kolonu kaldırıldı ama query'de hala kullanılıyordu | `optionValue` → `optionCode` olarak güncellendi (JSON aggregation) |
| `db/models/formFields.js` | `getOptionsByFieldCode()` hala `optionValue`, `priceValue` döndürüyordu | Deprecated kolonlar select'ten kaldırıldı |
| `db/models/formFields.js` | `updateOption()` hala eski kolonları kullanıyordu | `optionValue`, `priceValue` kaldırıldı |
| `db/models/formFields.js` | `bulkCreateWithOptions()` eski kolonları insert ediyordu | Sadece `optionCode`, `optionLabel` kullanılacak şekilde güncellendi |
| `db/models/priceParameters.js` | `getPriceFromOptionValue()` deprecated ama hala vardı | Fonksiyon tamamen kaldırıldı |
| `db/models/priceParameters.js` | `getPriceFromFormOption()` backward compat içeriyordu | Fonksiyon kaldırıldı, `getLookupValue()` kullanılıyor |
| `domains/crm/utils/pricing-utils.js` | `hasOptions` fonksiyonu kendine referans veriyordu (`f.hasOptions`) | Field type kontrolü eklendi: `['select', 'dropdown', 'radio', 'multiselect']` |
| `domains/crm/components/forms/formBuilder/FieldEditor.js` | Options listesinde optionCode badge gösteriliyordu | Badge kaldırıldı (kullanıcıya gösterilmemeli) |

---

#### TEST KRİTERLERİ

- [x] Yeni option eklendiğinde otomatik FFOC-XXXX kodu üretiliyor ✅
- [x] optionCode tablo genelinde unique ✅
- [x] Aynı form alanı farklı parametrelere farklı değerlerle bağlanabiliyor ✅
- [x] Fiyat hesaplamada optionCode ile doğru lookup yapılıyor ✅
- [x] Mevcut veriler migrate edilmiş (optionCode üretilmiş) ✅

---

### PROMPT-Pre-D2-2: PricingManager Lookup UI

**Amaç**: PricingManager'da parametre eklerken/düzenlerken lookup değerleri girme UI'ı

**Tarih**: 5 Aralık 2025  
**Durum**: ✅ Tamamlandı (14 Ocak 2025)

---

#### ✅ TAMAMLANAN İŞLER

**Backend Güncellemeleri:**
- [x] `POST /api/price-settings` - lookups kaydetme eklendi
- [x] `PATCH /api/price-settings/:id` - lookups güncelleme eklendi
- [x] `priceSettingsService.getWithDetails()` - lookups döndürme eklendi
- [x] `formController.js` - `GET /api/form-fields/code/:fieldCode/options` endpoint eklendi

**Frontend Service Güncellemeleri:**
- [x] `pricing-service.js` - lookup API methods eklendi (getParameterLookups, saveParameterLookups, etc.)
- [x] `forms-service.js` - `getFieldOptionsByCode()` method eklendi

**PricingManager.jsx Güncellemeleri:**
- [x] `lookupTable` state formatı güncellendi: `{optionCode, optionLabel, value}`
- [x] `parameters` state'e `lookups` array ve `dbId` eklendi
- [x] `addParameter()` - lookups formatı güncellendi
- [x] `editParameter()` - API'den lookups yükleme eklendi (async)
- [x] `saveEditParameter()` - lookups formatı güncellendi
- [x] `loadPriceSettings()` - lookups yükleme eklendi
- [x] `switchToSetting()` - lookups yükleme eklendi
- [x] Parametre ekleme UI: Seçenek/Kod/Değer kolonları ile düzenlenebilir tablo
- [x] Inline edit UI: Seçenek/Kod/Değer kolonları ile düzenlenebilir tablo

---

#### UI TASARIMI

**Parametre Ekleme/Düzenleme Modal'ında:**

```
┌─────────────────────────────────────────────────────────────────┐
│ Parametre Ekle                                                   │
├─────────────────────────────────────────────────────────────────┤
│ Parametre Adı: [Malzeme Birim Fiyat          ]                  │
│                                                                  │
│ Parametre Türü: ○ Sabit Değer  ● Form Alanından                 │
│                                                                  │
│ Form Alanı: [Malzeme Türü ▼]                                    │
│                                                                  │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ 💡 Değer Eşleştirme Tablosu                                 │ │
│ │    Her seçenek için bu parametrede kullanılacak             │ │
│ │    sayısal değeri girin.                                    │ │
│ ├─────────────────────────────────────────────────────────────┤ │
│ │ Seçenek          │ Kod        │ Değer                       │ │
│ ├──────────────────┼────────────┼─────────────────────────────┤ │
│ │ Demir            │ FFOC-0001  │ [100        ] ₺             │ │
│ │ Çelik            │ FFOC-0002  │ [150        ] ₺             │ │
│ │ Bakır            │ FFOC-0003  │ [200        ] ₺             │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                  │
│                                    [İptal] [Parametre Kaydet]   │
└─────────────────────────────────────────────────────────────────┘
```

**Parametre Düzenleme (Inline):**

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ Parametreler                                                                 │
├───────┬──────────────────┬──────────┬─────────────────┬─────────────────────┤
│ ID    │ Ad               │ Tür      │ Değer/Alan      │ İşlem               │
├───────┼──────────────────┼──────────┼─────────────────┼─────────────────────┤
│ A     │ Birim Fiyat      │ Form     │ Malzeme Türü    │ [Düzenle] [Sil]     │
├───────┴──────────────────┴──────────┴─────────────────┴─────────────────────┤
│ ▼ Lookup Değerleri (Düzenleme Modu)                                          │
│ ┌───────────────────────────────────────────────────────────────────────────┐│
│ │ Seçenek          │ Kod        │ Değer           │                         ││
│ ├──────────────────┼────────────┼─────────────────┤                         ││
│ │ Demir            │ FFOC-0001  │ [100        ]   │                         ││
│ │ Çelik            │ FFOC-0002  │ [150        ]   │                         ││
│ │ Bakır            │ FFOC-0003  │ [200        ]   │                         ││
│ └───────────────────────────────────────────────────────────────────────────┘│
│                                           [İptal] [Lookup Değerlerini Kaydet]│
├───────┬──────────────────┬──────────┬─────────────────┬─────────────────────┤
│ B     │ İşçilik Süresi   │ Form     │ Malzeme Türü    │ [Düzenle] [Sil]     │
└───────┴──────────────────┴──────────┴─────────────────┴─────────────────────┘
```

---

#### YAPILACAKLAR (Tamamlandı)

**Faz Pre-D2-2.1: State Yönetimi** ✅
- [x] `lookupTable` state'i parametre bazlı tutulacak
- [x] Form alanı seçildiğinde otomatik option listesi yüklenecek
- [x] Lookup değerleri düzenlenebilir olacak

**Faz Pre-D2-2.2: Parametre Ekleme UI** ✅
- [x] Form alanı seçildiğinde options otomatik yüklenecek
- [x] Her option için değer giriş alanı gösterilecek
- [x] optionCode görünür (readonly) → **Kaldırıldı** (kullanıcıya gösterilmemeli)
- [x] Kaydet'te lookup değerleri de kaydedilecek

**Faz Pre-D2-2.3: Parametre Düzenleme UI** ✅
- [x] Düzenle butonuna tıklanınca lookup tablosu açılacak
- [x] Mevcut lookup değerleri yüklenecek
- [x] Değerler düzenlenebilir
- [x] Kaydet'te güncel değerler kaydedilecek

**Faz Pre-D2-2.4: API Entegrasyonu** ✅
- [x] `savePriceSettings()` lookup değerlerini de gönderecek
- [x] `loadPriceSettings()` lookup değerlerini de yükleyecek
- [x] `switchToSetting()` lookup değerlerini de yükleyecek

---

#### DEĞİŞEN DOSYALAR

| Dosya | Değişiklik |
|-------|------------|
| `domains/crm/components/pricing/PricingManager.jsx` | Lookup UI ✅ |
| `domains/crm/services/pricing-service.js` | Lookup API çağrıları ✅ |
| `domains/crm/api/controllers/priceController.js` | Lookup CRUD ✅ |
| `domains/crm/api/services/priceSettingsService.js` | Lookup dahil etme ✅ |

---

#### EK DÜZELTMELER (Pre-D2-2 Kapsamında)

Uygulama sırasında tespit edilen ve düzeltilen sorunlar:

| Sorun | Çözüm |
|-------|-------|
| DOM nesting warning: `<tr>` cannot appear as child of `<table>` | Lookup satırları `<tbody>` içine taşındı, `flatMap` kullanıldı |
| Lookup tablosu düzenlemede yüklenmiyor | `editParameter()` async yapıldı, API'den options + lookups yükleniyor |
| optionCode kullanıcıya gösteriliyor | Kod sütunu UI'dan kaldırıldı (sadece Seçenek + Değer gösteriliyor) |
| Lookup tablosu eski tasarımda | Modern CSS Grid tasarımına geçildi (PricingManager ile tutarlı) |
| Helper fonksiyonlar eksik | `mergeLookupTable()` ve `convertLookupsForApi()` eklendi |

#### UI İYİLEŞTİRMELERİ

**Yeni Lookup Tablosu Tasarımı:**
- CSS Grid layout (`1fr 140px` - Seçenek + Değer)
- PricingManager renk paleti (#007bff, #f9fafb, rgb(229, 231, 235))
- İkon başlık (table icon)
- Bilgi kutusu (mavi info box)
- Alternatif satır renkleri
- Temiz input styling
- Empty state (dashed border)

---

#### TEST KRİTERLERİ

- [x] Form alanı seçildiğinde options otomatik yükleniyor ✅
- [x] Her option için değer girişi yapılabiliyor ✅
- [x] optionCode UI'da gizli (backend'de kullanılıyor) ✅
- [x] Parametre kaydedildiğinde lookup değerleri de kaydediliyor ✅
- [x] Parametre düzenlendiğinde mevcut lookup değerleri yükleniyor ✅
- [x] Lookup değerleri fiyat hesaplamada kullanılıyor ✅

---

### PROMPT-D2: Form Field Type Render Düzeltmesi

**Amaç**: Edit modda form alanlarının doğru tipte render edilmesi

**Tarih**: 5 Aralık 2025  
**Durum**: ✅ **TAMAMLANDI**

**Commit**: `feat(crm): [FP-D2] Form Field Type Render & optionCode/optionLabel Support`

**Ön Koşullar**:
- ✅ PROMPT-Pre-D2-1: Option Code Sistemi tamamlanmış olmalı
- ✅ PROMPT-Pre-D2-2: PricingManager Lookup UI tamamlanmış olmalı

---

#### DESTEKLENECek FIELD TYPE'LAR

| Type | Input Türü | Açıklama |
|------|------------|----------|
| `text` | text input | Tek satır metin ✅ |
| `textarea` | textarea | Çok satır metin ✅ |
| `number` | number input | Sayısal değer ✅ |
| `email` | email input | E-posta ✅ |
| `phone` / `tel` | tel input | Telefon ✅ |
| `select` / `dropdown` | select | Açılır liste ✅ |
| `radio` | radio buttons | Tek seçim ✅ |
| `checkbox` | checkbox | Onay kutusu (true/false) ✅ |
| `multiselect` | multiple select | Çoklu seçim ✅ |
| `date` | date picker | Tarih seçici ✅ |
| `file` | file display | Dosya (readonly) ✅ |

---

#### YAPILAN DEĞİŞİKLİKLER

**1. QuoteDetailsPanel.jsx** - Form Bilgileri Düzenleme
- Tüm field type'lar için switch-case yapısı eklendi
- `optionCode`/`optionLabel` formatına geçildi
- Display modda select/radio için optionLabel gösteriliyor
- checkbox için "Evet/Hayır" gösterimi

**2. QuoteFormStep.jsx** - Yeni Quote Oluşturma (Step 2)
- select, radio, checkbox/multiselect için optionCode/optionLabel desteği
- dropdown alias'ı eklendi
- multiselect için optionCode array kullanımı

**3. AddQuoteModal.jsx** - Initial Values
- Radio field için ilk seçeneğin optionCode'u kullanılıyor

**4. QuoteReviewStep.jsx** - Önizleme (Step 3)
- getDisplayValue fonksiyonu eklendi
- select/radio/multiselect için optionLabel gösterimi

**5. FormUpdateModal.jsx** - Form Güncelleme
- Tüm field type'lar için tam destek
- radio, checkbox, email, phone, date eklendi
- optionCode/optionLabel formatına geçildi
- "Eşleşenleri Kopyala" için optionLabel eşleştirmesi eklendi
- "Mevcut Değerler" için optionLabel gösterimi eklendi

**6. Bug Fixes**
- Null option filtering eklendi (options array'de null olabilir)
- Checkbox display: boş değerler için "—" gösterimi
- handleFormUpdateSave: state güncelleme düzeltildi (functional updates)
- saveFormFields: formFieldsData senkronizasyonu düzeltildi
- Fiyat değişiklik modalında optionLabel gösterimi

---

#### DEĞİŞEN DOSYALAR

| Dosya | Değişiklik |
|-------|------------|
| `domains/crm/components/quotes/QuoteDetailsPanel.jsx` | Field type switch-case, optionCode/optionLabel |
| `domains/crm/components/quotes/QuoteFormStep.jsx` | optionCode/optionLabel, dropdown alias |
| `domains/crm/components/quotes/AddQuoteModal.jsx` | Radio initial value fix |
| `domains/crm/components/quotes/QuoteReviewStep.jsx` | getDisplayValue for labels |
| `domains/crm/components/quotes/FormUpdateModal.jsx` | Full field type support |

---

#### TEST KRİTERLERİ

- [x] `text` alanlar text input olarak render ediliyor ✅
- [x] `email` alanlar email input olarak render ediliyor ✅
- [x] `phone` alanlar tel input olarak render ediliyor ✅
- [x] `number` alanlar number input olarak render ediliyor ✅
- [x] `textarea` alanlar textarea olarak render ediliyor ✅
- [x] `select`/`dropdown` alanlar select olarak render ediliyor ✅
- [x] `radio` alanlar radio button olarak render ediliyor ✅
- [x] `checkbox` alanlar checkbox olarak render ediliyor ✅
- [x] `multiselect` alanlar çoklu seçim olarak render ediliyor ✅
- [x] `date` alanlar date picker olarak render ediliyor ✅
- [x] Options formatı `{ optionCode, optionLabel }` olarak geliyor ✅
- [x] Seçilen değer `optionCode` olarak kaydediliyor, `optionLabel` gösteriliyor ✅

---

---

### PROMPT-Post-D2: Cleanup - priceValue Kaldırma

**Amaç**: Eski `form_field_options.priceValue` kolonunun tamamen kaldırılması ve kod temizliği

**Tarih**: 5 Aralık 2025  
**Durum**: Planlandı

**Ön Koşullar**:
- ✅ PROMPT-Pre-D2-1: Option Code Sistemi tamamlanmış olmalı
- ✅ PROMPT-Pre-D2-2: PricingManager Lookup UI tamamlanmış olmalı
- ✅ PROMPT-D2: Field Type Render tamamlanmış olmalı

---

#### BİLİNEN SORUNLAR (Post-D2'de Çözülecek)

1. **FormUpdateModal "Mevcut Değerler"**: oldFields options içermiyor olabilir, optionCode görünüyor
2. **FormUpdateModal kayıt sonrası**: Yeni eklenen alanlar QuoteDetailsPanel'de hemen görünmüyor (F5 gerekiyor)

---

#### YAPILACAKLAR ✅ TAMAMLANDI (5 Aralık 2025)

**Faz Cleanup.1: Database** ✅
- [x] `form_field_options.priceValue` kolonu migration 026'da DROP edildi
- [x] `form_field_options.optionValue` kolonu migration 026'da DROP edildi
- [x] Veritabanı şeması temiz

**Faz Cleanup.2: Backend Kod Temizliği** ✅
- [x] `formFields.js` - priceValue referansları yok (sadece comment)
- [x] `priceParameters.js` - `getPriceFromFormOption()` zaten yok
- [x] `priceParameters.js` - `getFormBasedParameters()` zaten lookup tablosu kullanıyor

**Faz Cleanup.3: Frontend Kod Temizliği** ✅
- [x] FormBuilder'da priceValue alanı yok
- [x] Option ekleme/düzenleme formlarında priceValue yok

**Faz Cleanup.4: Form-Price Sync System** ✅ (PROMPT-Post-D2-Faz1)
- [x] `linkedFormTemplateId` kolonu eklendi (migration 027)
- [x] Sync warning banner UI eklendi
- [x] "Formu Güncelle" butonu eklendi
- [x] `getOptionsByFieldCode()` sadece aktif template'ten çekiyor

---

#### DEĞİŞECEK DOSYALAR

| Dosya | Değişiklik |
|-------|------------|
| `db/models/formFields.js` | priceValue referansları kaldır |
| `db/models/priceParameters.js` | Eski metodları kaldır/güncelle |
| `domains/crm/components/forms/formBuilder/*` | priceValue UI kaldır |

---

#### TEST KRİTERLERİ ✅ TAMAMLANDI

- [x] priceValue'a hiçbir yerden referans yok (sadece comment'ler)
- [x] Fiyat hesaplama yeni lookup tablosundan çalışıyor
- [x] Form oluşturma/düzenleme çalışıyor
- [x] Build başarılı
- [x] Dropdown/checkbox Step 2'de düzgün render ediliyor
- [x] Checkbox Step 3'te Evet/Hayır gösteriyor
- [x] Pricing lookup tablosunda duplicate yok
- [x] Form sync sistemi çalışıyor

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
- [x] Modal açılıp kapanabiliyor
- [x] Eski form değerleri sol panelde görünüyor
- [x] Yeni form alanları sağ panelde düzenlenebilir
- [x] "Eşleşenleri Kopyala" fieldCode eşleşmesi ile çalışıyor
- [x] Fiyat dinamik olarak güncelleniyor (debounce ile)
- [x] Eski fiyat ve yeni fiyat yan yana gösteriliyor
- [x] Fiyat farkı gösteriliyor (artış/azalış)
- [x] Yeni eklenen alanlar "Yeni" badge ile işaretleniyor
- [x] Kaldırılan alanlar "Kaldırıldı" badge ile işaretleniyor
- [x] Loading state'ler düzgün çalışıyor
- [x] Error handling düzgün çalışıyor

**Commit**: `feat(crm): [FP-E1] FormUpdateModal UI enhancements & cache optimization`
**Tarih**: 5 Aralık 2025

### Gerçekleştirilen Değişiklikler

#### 1. FormUpdateModal.jsx UI Geliştirmeleri

**Yeni useMemo hesaplamaları eklendi:**
```jsx
// PROMPT-E1: Find new-only fields (added in new template)
const newOnlyFields = useMemo(() => {
  return newFields.filter(newField => {
    const newCode = newField.fieldCode || newField.id
    return !oldFields.some(oldField => (oldField.fieldCode || oldField.id) === newCode)
  })
}, [oldFields, newFields])

// PROMPT-E1: Find removed fields (were in old template, not in new)
const removedFields = useMemo(() => {
  return oldFields.filter(oldField => {
    const oldCode = oldField.fieldCode || oldField.id
    return !newFields.some(newField => (newField.fieldCode || newField.id) === oldCode)
  })
}, [oldFields, newFields])
```

**Summary Banner eklendi:**
```jsx
{/* Info Banner with Stats */}
<div style={infoBannerStyle}>
  <AlertTriangle size={16} />
  <span>Form şablonu güncellendi. Lütfen yeni alanları doldurun.</span>
  <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
    <span style={{ background: '#dcfce7', color: '#166534' }}>
      {matchingFields.length} Eşleşen
    </span>
    {newOnlyFields.length > 0 && (
      <span style={{ background: '#dbeafe', color: '#1e40af' }}>
        {newOnlyFields.length} Yeni
      </span>
    )}
    {removedFields.length > 0 && (
      <span style={{ background: '#fee2e2', color: '#991b1b' }}>
        {removedFields.length} Kaldırılan
      </span>
    )}
  </div>
</div>
```

**"Yeni" badge (sağ panel):**
```jsx
{isNewField && (
  <span style={{ background: '#dbeafe', color: '#1e40af' }}>Yeni</span>
)}
```

**"Kaldırıldı" badge (sol panel):**
```jsx
{isRemoved && (
  <span style={{ background: '#fee2e2', color: '#991b1b' }}>Kaldırıldı</span>
)}
```

#### 2. QuoteDetailsPanel.jsx Cache Optimizasyonu

**handleFormUpdateClick basitleştirildi:**
```jsx
// ÖNCE: Her tıklamada 2 API çağrısı (gereksiz)
const handleFormUpdateClick = async () => {
  const [oldTemplateResult, freshActiveTemplate] = await Promise.all([
    formsApi.getTemplateWithFields(quote.formTemplateId),
    formsApi.getActiveTemplate()
  ])
  // ...
}

// SONRA: Cache'den okuma (0 API çağrısı)
const handleFormUpdateClick = () => {
  // Use already cached data - no need to fetch again
  // activeFormTemplate is fetched when quote details open (line ~98)
  // quoteFormTemplate is fetched when quote details open (line ~136)
  
  const oldFields = quoteFormTemplate?.fields || formConfig?.fields || []
  const newFields = activeFormTemplate?.fields || []
  
  setOldFormFields(oldFields)
  setNewFormFields(newFields)
  setShowFormUpdateModal(true)
}
```

**handleFormUpdateSave basitleştirildi:**
```jsx
// ÖNCE: API'den tekrar template çekiyordu
if (updatePayload.formTemplateId) {
  const newTemplate = await formsApi.getTemplateWithFields(newTemplateId)
  setQuoteFormTemplate(newTemplate)
}

// SONRA: Cache'deki activeFormTemplate kullanılıyor
if (activeFormTemplate) {
  setQuoteFormTemplate(activeFormTemplate)
}
```

#### 3. Veri Akışı (Optimize Edilmiş)

| Adım | API Çağrısı | Açıklama |
|------|-------------|----------|
| Quote detayları açılır | 1x | `activeFormTemplate` ve `quoteFormTemplate` paralel fetch |
| Banner kontrolü | 0 | Cache'den karşılaştırma |
| "Formu Güncelle" butonu | 0 | Cache'den veri alınır |
| Modal kaydet | 0 (template için) | `quoteFormTemplate = activeFormTemplate` |

**Sonuç:** 3-4 gereksiz API çağrısı kaldırıldı.

#### 4. Bilinen Sorunlar

| Sorun | Durum | Not |
|-------|-------|-----|
| Sol panel optionCode gösteriyor (label yerine) | ⚠️ Açık | `oldFields.options` eksik olabilir |
| Checkbox "true" yerine "Evet" göstermeli | ✅ Çözüldü | `getDisplayValue()` checkbox desteği |

#### 5. Değiştirilen Dosyalar

| Dosya | Değişiklik |
|-------|------------|
| `domains/crm/components/quotes/FormUpdateModal.jsx` | `newOnlyFields`, `removedFields` useMemo, summary banner, badges |
| `domains/crm/components/quotes/QuoteDetailsPanel.jsx` | `handleFormUpdateClick` ve `handleFormUpdateSave` cache optimizasyonu |

---

### PROMPT-E2: PriceConfirmModal Componenti → Ayrı Dosyaya Refactor

**Amaç**: Fiyat onay modal'ının inline koddan ayrı component dosyasına taşınması (FormUpdateModal ile tutarlılık için)

**Mevcut Durum**: QuoteDetailsPanel.jsx içinde inline olarak implemente edilmiş (satır 2432-2580)

**Neden Ayrı Dosya?**
1. QuoteDetailsPanel 2600+ satır - çok büyük
2. FormUpdateModal ayrı dosyada - tutarlılık gerekli
3. Gelecekte başka yerlerde kullanılabilir (örn: fatura modülü)
4. İzole test edilebilirlik

---

#### MEVCUT YAPIYI ANALİZ

**State Değişkenleri (Taşınacak):**
```jsx
const [showPriceConfirmModal, setShowPriceConfirmModal] = useState(false)  // satır 73
const [pendingChanges, setPendingChanges] = useState(null)                  // satır 74
```

**pendingChanges Yapısı:**
```jsx
{
  formData: { fieldCode: value, ... },     // Yeni form verileri
  quoteData: { formData, calculatedPrice }, // API payload
  newPrice: number,                         // Yeni hesaplanan fiyat
  priceDiff: number,                        // Fiyat farkı (+ veya -)
  changedFields: [                          // Değişen alanlar listesi
    { fieldName: string, oldValue: any, newValue: any }
  ]
}
```

**Modal'ı Tetikleyen Fonksiyon (satır 320-355):**
```jsx
// handleFormFieldsSave içinde:
if (Math.abs(priceDiff) > 0.01) {
  setPendingChanges({ formData, quoteData, newPrice, priceDiff, changedFields })
  setShowPriceConfirmModal(true)
  return
}
```

**Handler Fonksiyonları:**
```jsx
// handlePriceConfirm (satır 463-476)
const handlePriceConfirm = async () => {
  if (!pendingChanges) return
  const { formData, newPrice } = pendingChanges
  await saveFormFields(formData, newPrice)
  setShowPriceConfirmModal(false)
  setPendingChanges(null)
}

// handlePriceConfirmCancel (satır 479-483)
const handlePriceConfirmCancel = () => {
  setShowPriceConfirmModal(false)
  setPendingChanges(null)
  // formEditing stays true
}
```

**Inline Modal Render (satır 2432-2580):**
- ~150 satır inline JSX + styles
- AlertTriangle icon kullanıyor
- Değişen alanlar listesi
- Fiyat karşılaştırması (eski/yeni/fark)
- "Düzenlemeye Dön" ve "Onayla ve Kaydet" butonları

---

#### REFACTORING PLANI

**Adım 1: PriceConfirmModal.jsx Oluştur**
```jsx
// domains/crm/components/quotes/PriceConfirmModal.jsx
import React from 'react'
import { AlertTriangle } from '../../../../shared/components/Icons.jsx'

export default function PriceConfirmModal({
  isOpen,
  currentPrice,        // quote?.finalPrice || quote?.calculatedPrice
  newPrice,            // pendingChanges.newPrice
  priceDiff,           // pendingChanges.priceDiff
  changedFields,       // pendingChanges.changedFields
  onConfirm,           // handlePriceConfirm
  onCancel,            // handlePriceConfirmCancel
  confirmLoading       // optional loading state
}) {
  if (!isOpen) return null
  
  // ... modal içeriği (mevcut inline koddan taşınacak)
}
```

**Adım 2: QuoteDetailsPanel.jsx Değişiklikleri**

Import ekle:
```jsx
import PriceConfirmModal from './PriceConfirmModal.jsx'
```

Inline modal kaldır (satır 2432-2580) ve yerine:
```jsx
<PriceConfirmModal
  isOpen={showPriceConfirmModal && pendingChanges !== null}
  currentPrice={parseFloat(quote?.finalPrice || quote?.calculatedPrice || 0)}
  newPrice={pendingChanges?.newPrice || 0}
  priceDiff={pendingChanges?.priceDiff || 0}
  changedFields={pendingChanges?.changedFields || []}
  onConfirm={handlePriceConfirm}
  onCancel={handlePriceConfirmCancel}
/>
```

---

#### KONTROL LİSTESİ (Refactoring Sonrası Test)

**State & Props Geçişi:**
- [ ] `isOpen` prop doğru çalışıyor (`showPriceConfirmModal && pendingChanges`)
- [ ] `currentPrice` doğru geçiyor (quote.finalPrice veya calculatedPrice)
- [ ] `newPrice` doğru geçiyor (pendingChanges.newPrice)
- [ ] `priceDiff` doğru geçiyor (pendingChanges.priceDiff)
- [ ] `changedFields` array doğru geçiyor
- [ ] `onConfirm` callback çağrılıyor
- [ ] `onCancel` callback çağrılıyor

**UI Doğrulaması:**
- [ ] Modal overlay (arka plan karartma) çalışıyor
- [ ] Modal merkezi konumda açılıyor
- [ ] Header (ikon + başlık + açıklama) görünüyor
- [ ] Değişen alanlar listesi render ediliyor
- [ ] Her alan için `fieldName: oldValue → newValue` formatı
- [ ] Fiyat karşılaştırma kutusu görünüyor (mevcut/yeni/fark)
- [ ] Artış/azalış renk kodlaması doğru (turuncu/yeşil)
- [ ] "Düzenlemeye Dön" butonu çalışıyor
- [ ] "Onayla ve Kaydet" butonu çalışıyor

**Fonksiyonel Test:**
- [ ] Form düzenleme → fiyat değişince modal açılıyor
- [ ] İptal → modal kapanıyor, form düzenleme modunda kalıyor
- [ ] Onayla → saveFormFields çağrılıyor, modal kapanıyor
- [ ] Kayıt sonrası toast mesajı görünüyor
- [ ] onRefreshQuote çağrılıyor (liste güncelleniyor)

**Edge Cases:**
- [ ] changedFields boş array ise bölüm gizleniyor
- [ ] priceDiff = 0 ise modal açılmamalı (handleFormFieldsSave'de kontrol)
- [ ] pendingChanges null ise modal render edilmemeli

---

**Değişecek Dosyalar**:
- `domains/crm/components/quotes/PriceConfirmModal.jsx` (YENİ)
- `domains/crm/components/quotes/QuoteDetailsPanel.jsx` (inline modal kaldır, import ekle)

**Test Kriterleri** (Mevcut - Inline):
- [x] Modal açılıp kapanabiliyor
- [x] Fiyat karşılaştırması görünüyor
- [x] Fark artış/azalış olarak gösteriliyor
- [x] Değişiklik listesi görünüyor
- [x] Onaylama kaydı tetikliyor

**Durum**: ✅ **TAMAMLANDI** (D1 içinde inline olarak implemente edildi)
**Tarih**: 4 Aralık 2025

### Gerçekleştirilen Değişiklikler

Modal QuoteDetailsPanel.jsx içinde inline olarak implemente edildi (satır ~2432-2580):

**Özellikler:**
- Fiyat değişikliği onay modal'ı (`showPriceConfirmModal` state)
- Değişen alanların listesi (`pendingChanges.changedFields`)
- Fiyat karşılaştırması (mevcut vs yeni)
- Renk kodlu fark gösterimi (artış: turuncu, azalış: yeşil)
- "Düzenlemeye Dön" ve "Onayla ve Kaydet" butonları
- optionCode → optionLabel dönüşümü (select/radio fields için)

**Tetiklenme Senaryosu:**
1. Quote detayında form alanları düzenlenirken
2. Kaydet'e tıklanınca fiyat hesaplanır
3. Fiyat farkı varsa modal açılır
4. Kullanıcı onaylarsa kayıt yapılır

---

### PROMPT-F1: Backend - Fiyat Hesaplama API Konsolidasyonu

**Amaç**: Dağınık fiyat hesaplama mantığını tek bir authoritative kaynakta birleştirmek

---

#### 📊 ARAŞTİRMA BULGULARI (6 Aralık 2025)

##### 1. Mevcut Endpoint'ler ve Kullanım Durumları

| Dosya | Endpoint | Durum | Notlar |
|-------|----------|-------|--------|
| `priceController.js:939` | `POST /api/price-settings/calculate` | ✅ AKTİF | Ana endpoint - pricingService.js kullanıyor |
| `priceController.js:757` | `POST /api/price-formulas/:id/calculate` | ⚠️ LEGACY | B0'da formulas tablosu kaldırıldı |
| `architectureAPI.js:50,94` | `POST /api/quotes/:id/recalculate-price` | ❌ YOK | Endpoint hiç implement edilmemiş |
| `architectureAPI.js:68` | `POST /api/quotes/:id/apply-price` | ❌ YOK | Endpoint hiç implement edilmemiş |
| `api.js:364` | `POST /api/quotes/apply-price-bulk` | ❌ YOK | Endpoint hiç implement edilmemiş |
| `api.js:373` | `POST /api/quotes/apply-price-all` | ❌ YOK | Endpoint hiç implement edilmemiş |

##### 2. Fiyat Hesaplama Fonksiyonları

| Dosya | Fonksiyon | Lookup Sistemi | Durum |
|-------|----------|----------------|-------|
| `server/priceCalculator.js` | `calculatePriceServer(quote, settings)` | ✅ optionCode + parameterLookupMap | **DOĞRU** |
| `priceSettingsService.js:222` | `PriceSettings.calculatePrice(settingId, formData)` | ❌ lookups kullanmıyor | YANLIŞ |
| `priceController.js:939-1076` | inline evaluation | ❌ lookups kullanmıyor | YANLIŞ |
| `shared/lib/api.js:842` | `calculatePriceLocal(quote, priceSettings)` | ⚠️ lookupTable (eski format) | ESKİ |
| `domains/crm/utils/price-calculator.js:4` | `calculatePrice(quote, priceSettings)` | → API.calculatePriceLocal | ESKİ |

##### 3. Veri Akışı Analizi

```
┌──────────────────────────────────────────────────────────────────────────┐
│                        FRONTEND                                          │
├──────────────────────────────────────────────────────────────────────────┤
│ QuotesManager.js                                                         │
│   └─> calculatePrice(quote, priceSettings)                              │
│       └─> price-calculator.js                                            │
│           └─> API.calculatePriceLocal() [lookupTable formatı - ESKİ]    │
│                                                                          │
│ QuoteDetailsPanel.jsx (Form Edit sonrası)                               │
│   └─> pricingService.calculatePrice(settingId, formData)                │
│       └─> POST /api/price-settings/calculate                            │
├──────────────────────────────────────────────────────────────────────────┤
│                        BACKEND                                           │
├──────────────────────────────────────────────────────────────────────────┤
│ POST /api/price-settings/calculate (priceController.js:939)             │
│   └─> Inline formula evaluation                                         │
│   └─> parameterLookups KULLANILMIYOR! ❌                                │
│                                                                          │
│ db/models/quotes.js (create, update, recalculate)                       │
│   └─> PriceSettings.calculatePrice(priceSettingId, formData)            │
│       └─> parameterLookups KULLANILMIYOR! ❌                            │
│                                                                          │
│ server/priceCalculator.js                                               │
│   └─> calculatePriceServer(quote, settings)                             │
│   └─> parameterLookupMap KULLANILIYOR ✅                                │
│   └─> Tam math context (MARKUP, VAT, DISCOUNT, vb.) ✅                  │
│   └─> Security validations ✅                                           │
└──────────────────────────────────────────────────────────────────────────┘
```

##### 4. Kritik Sorunlar

> ⚠️ **KRİTİK BUG TESPİT EDİLDİ (6 Aralık 2025)**
> 
> Select/dropdown alanlarından gelen `optionCode` (örn: `FFOC-001`) lookup tablosundaki 
> sayısal değere çevrilmiyor! Bu yüzden fiyat hesaplamaları **YANLIŞ** sonuç veriyor.
> 
> **Örnek**:
> - Kullanıcı "Malzeme" alanında "Alüminyum" seçiyor → `FFOC-001`
> - Lookup tablosunda `FFOC-001` = `50` (birim fiyat)
> - Beklenen: Formülde `50` kullanılmalı
> - Gerçek: Formülde `"FFOC-001"` (string) kullanılıyor → `parseFloat("FFOC-001")` = `NaN` → `0`

🔴 **Problem 1: Lookup Tablosu Kullanılmıyor**

**YANLIŞ - priceSettingsService.js:251-259**:
```javascript
} else if (param.type === 'form_lookup') {
  const fieldCode = param.formFieldCode || param.code;
  if (formData[fieldCode] !== undefined) {
    value = parseFloat(formData[fieldCode]) || 0;  // ❌ YANLIŞ! 
    // optionCode string'ini parseFloat yapıyor, lookup tablosuna bakmıyor
    source = 'form';
  }
}
```

**DOĞRU - server/priceCalculator.js:140-154**:
```javascript
// Pre-D2-1: Use optionCode for lookup values
const paramLookups = parameterLookupMap[param.id]

if (Array.isArray(fieldValue)) {
  // Multi-select: sum up values for all selected options
  if (paramLookups) {
    value = fieldValue.reduce((sum, optionCode) => {
      const lookupValue = paramLookups[optionCode] || 0  // ✅ DOĞRU!
      return sum + lookupValue
    }, 0)
  }
} else if (paramLookups) {
  // Single select: use optionCode to lookup value
  value = paramLookups[fieldValue] || 0  // ✅ DOĞRU!
}
```

🔴 **Problem 2: İkili Hesaplama Sistemi**
- `calculatePriceServer()` → **optionCode + parameterLookupMap** kullanıyor (DOĞRU)
- `PriceSettings.calculatePrice()` → **lookups KULLANMIYOR** (YANLIŞ)
- `POST /api/price-settings/calculate` → inline evaluation, **lookups yok** (YANLIŞ)

🔴 **Problem 3: Ölü Endpoint Referansları**
- `architectureAPI.js` dosyasında 4 endpoint referansı var ama hiç implement edilmemiş

🟡 **Problem 4: Legacy Endpoint**
- `POST /api/price-formulas/:id/calculate` - B0'da formulas tablosu kaldırıldı

🟡 **Problem 5: Frontend Lookup Format Uyumsuzluğu**
- Frontend: `lookupTable: [{option, value}]` formatı
- Backend: `optionCode: value` map formatı

---

#### 📋 YAPILACAKLAR

**ADIM 1: `/api/price-settings/calculate` Endpoint'ini Güncelle**

`priceController.js:939-1076` arasındaki inline evaluation'ı kaldır, `calculatePriceServer()` kullan:

```javascript
// priceController.js - POST /api/price-settings/calculate
import { calculatePriceServer } from '../../../../server/priceCalculator.js';

app.post('/api/price-settings/calculate', requireAuth, async (req, res) => {
  try {
    const { settingId, formData } = req.body;
    
    // Get setting with details (includes lookups)
    let setting;
    if (settingId) {
      setting = await PriceSettings.getWithDetails(parseInt(settingId));
    } else {
      setting = await PriceSettings.getActiveWithDetails();
    }
    
    if (!setting) {
      return res.status(400).json({ error: 'No price setting configured' });
    }
    
    // Build quote object for calculatePriceServer
    const quoteData = {
      customFields: formData || {},
      ...formData // spread form fields to top level too
    };
    
    // Use unified calculation function
    const totalPrice = calculatePriceServer(quoteData, setting);
    
    res.json({
      totalPrice: Math.round(totalPrice * 100) / 100,
      breakdown: {
        formula: setting.formulaExpression,
        settingId: setting.id,
        settingCode: setting.code,
        parametersUsed: setting.parameters?.length || 0
      }
    });
  } catch (error) {
    logger.error('Failed to calculate price', { error: error.message });
    res.status(500).json({ error: 'Failed to calculate price', message: error.message });
  }
});
```

**ADIM 2: `PriceSettings.calculatePrice()` Deprecate Et**

`priceSettingsService.js:222` fonksiyonunu `calculatePriceServer` kullanacak şekilde güncelle:

```javascript
// priceSettingsService.js
import { calculatePriceServer } from '../../../../server/priceCalculator.js';

async calculatePrice(settingId, formData) {
  const setting = await this.getWithDetails(settingId);
  if (!setting) {
    throw new Error(`Price setting ${settingId} not found`);
  }
  
  const quoteData = { customFields: formData, ...formData };
  const totalPrice = calculatePriceServer(quoteData, setting);
  
  return {
    totalPrice,
    formula: setting.formulaExpression,
    settingId: setting.id
  };
}
```

**ADIM 3: Legacy Endpoint Kaldır**

`priceController.js:757` - `POST /api/price-formulas/:id/calculate` endpoint'ini kaldır veya deprecation warning ekle.

**ADIM 4: Ölü Referansları Temizle**

- `architectureAPI.js` → Kullanılmayan endpoint referanslarını kaldır
- `api.js` → `apply-price-bulk`, `apply-price-all` fonksiyonlarını kaldır

**ADIM 5: Frontend Senkronizasyonu**

`calculatePriceLocal()` fonksiyonunu kaldır veya sadece fallback olarak bırak, tüm hesaplamaları backend'e yönlendir.

---

**Değişecek Dosyalar**:
- `domains/crm/api/controllers/priceController.js` (ADIM 1, 3)
- `domains/crm/api/services/priceSettingsService.js` (ADIM 2)
- `shared/lib/architectureAPI.js` (ADIM 4)
- `shared/lib/api.js` (ADIM 4, 5)
- `domains/crm/utils/price-calculator.js` (ADIM 5)

**Test Kriterleri**:
- [ ] `/api/price-settings/calculate` optionCode lookup'larını kullanıyor
- [ ] Form edit sonrası fiyat hesaplaması doğru çalışıyor
- [ ] Quote oluşturma/güncelleme sırasında fiyat doğru hesaplanıyor
- [ ] Legacy endpoint'ler temizlendi veya yönlendirildi
- [ ] Console'da ölü endpoint hataları yok

---

### PROMPT-F2: QuotesManager - Sayfa Yüklenme Optimizasyonu

**Commit**: `fix(quotes): [FP-F2] Fix loading state causing table layout shift`
**Tarih**: 6 Aralık 2025

**Amaç**: Liste yüklenirken tablo layout kaymasını önlemek

#### Problem Analizi (6 Aralık 2025)

**Tespit Edilen Bug:**
Quote listesi yüklenirken tablo "aşağı kayıyordu" - loading spinner görünürken tablo boş satırlarla render ediliyordu, veri gelince aniden doluyordu.

**Root Cause:**
```javascript
// ESKİ - Loading overlay tablo ile birlikte render ediliyordu
loading && React.createElement('div', { className: 'quotes-loading' }, ...),
React.createElement('table', { ... }) // Her zaman render ediliyordu!
```

Loading sırasında:
1. `list = []` (boş array)
2. Spinner görünüyor
3. Tablo header'ları render ediliyor (ama body boş)
4. API'den veri gelince tablo aniden dolup layout kayıyor

#### Çözüm

**Conditional Table Rendering:**
```javascript
// YENİ - Tablo sadece loading bittikten sonra render ediliyor
loading && !bulkProgress && React.createElement('div', { className: 'quotes-loading' }, ...),
error && !loading && React.createElement('div', { className: 'quotes-empty-state' }, ...),
!loading && !error && React.createElement('table', { ... }) // Conditional!
```

#### Mevcut Optimizasyonlar (B0'da Tamamlanmış)

| Optimizasyon | Durum | Açıklama |
|--------------|-------|----------|
| `checkAndProcessVersionUpdates` No-op | ✅ B0 | Her quote için API çağrısı kaldırıldı |
| Version check on-demand | ✅ B0 | Sadece detay panelinde yapılıyor |
| Price comparison lazy | ✅ C1 | Sadece canEdit=true ise |

#### Değişen Dosyalar

| Dosya | Değişiklik |
|-------|------------|
| `QuotesManager.js` | Tablo conditional render (loading ise gizle) |

#### Test Kriterleri
1. ✅ Loading sırasında sadece spinner görünüyor
2. ✅ Veri gelince tablo smooth şekilde render ediliyor
3. ✅ Layout kayması yok
4. ✅ Error durumunda error mesajı görünüyor

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
| 39 | Option Code Sistemi: form_field_options.optionCode (FFOC-XXXX) | PROMPT-Pre-D2-1 |
| 40 | Lookup Tablosu: price_parameter_lookups (parameterId, optionCode, value) | PROMPT-Pre-D2-1 |
| 41 | PricingManager Lookup UI: Parametre eklerken/düzenlerken lookup değerleri | PROMPT-Pre-D2-2 |
| 42 | Field Type Render: Tüm field type'lar desteklenmeli | PROMPT-D2 |
| 43 | Cleanup: form_field_options.priceValue kaldırılmalı | PROMPT-Post-D2 |
| 44 | Form-Price Sync: Pricing aktif form template ile senkronize olmalı | PROMPT-Post-D2-Faz1 |
| 45 | Sync UI: Form değişince uyarı banner ve "Formu Güncelle" butonu | PROMPT-Post-D2-Faz1 |


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
- [x] **PROMPT-Pre-D2-1**: Option Code Sistemi ve Lookup Tablosu ✅ (14 Ocak 2025)
- [x] **PROMPT-Pre-D2-2**: PricingManager Lookup UI ✅ (14 Ocak 2025)
- [x] **PROMPT-D2**: Field type render düzeltmesi ✅ (5 Aralık 2025)
- [x] **PROMPT-Post-D2**: Cleanup - priceValue kaldırma ✅ (5 Aralık 2025)
- [x] **PROMPT-Post-D2-Faz1**: Form-Price Sync System ✅ (5 Aralık 2025)
- [x] **PROMPT-E1**: FormUpdateModal componenti ✅
- [x] **PROMPT-E2**: PriceConfirmModal componenti ✅ (D1 içinde inline olarak implemente edildi)
- [x] **PROMPT-F1**: Backend Fiyat Hesaplama API Konsolidasyonu ✅ (6 Aralık 2025)
- [x] **PROMPT-F2**: Sayfa yüklenme optimizasyonu ✅ (6 Aralık 2025)

---

## PROMPT-Post-D2-Faz1: Form-Price Sync System

**Commit**: `feat(crm): [FP-Post-D2-Faz1] Form-Price Sync System & Cleanup`
**Tarih**: 5 Aralık 2025

### Amaç
Form versiyonları değiştiğinde pricing sisteminin uyumsuz kalmasını önlemek ve kullanıcıya görsel geri bildirim sağlamak.

### Yapılan Değişiklikler

#### 1. Legacy Kod Temizliği
| Dosya | Değişiklik |
|-------|------------|
| `server/formRoutes.js` | **SİLİNDİ** - Kullanılmayan legacy dosya |
| `formController.js` | `optionValue`/`priceValue` POST/PATCH endpoint'lerinden kaldırıldı |
| `formController.js` | `/api/form-templates/active` artık full option objects döndürüyor |

#### 2. Bug Fixes
| Bug | Çözüm | Dosya |
|-----|-------|-------|
| Dropdown options Step 2'de görünmüyor | Options array olarak değil object array döndürülüyor | `formController.js` |
| Single checkbox render edilmiyor | Checkbox case'i multiselect'ten ayrıldı | `QuoteFormStep.jsx` |
| Checkbox value Step 3'te görünmüyor | `getDisplayValue()` checkbox desteği eklendi (Evet/Hayır) | `QuoteReviewStep.jsx` |
| Pricing lookup'ta duplicate seçenekler | `getOptionsByFieldCode` sadece aktif template'ten çekiyor | `formFields.js` |

#### 3. Form-Price Sync System
**Yeni Migration (027):**
```sql
ALTER TABLE quotes.price_settings 
ADD COLUMN "linkedFormTemplateId" INTEGER REFERENCES quotes.form_templates(id);
```

**Yeni API Endpoints:**
| Endpoint | Açıklama |
|----------|----------|
| `GET /api/price-settings/active` | Artık `isFormSynced`, `activeFormTemplateId`, `linkedFormTemplateId` döndürüyor |
| `POST /api/price-settings/:id/sync-form` | Pricing'i aktif form template ile senkronize eder |

**Frontend UI (PricingManager.jsx):**
- Sarı uyarı banner: "Form Değişti! Fiyatlandırma ayarları ... ile senkronize değil"
- "Formu Güncelle" butonu: `syncWithForm()` çağırır, form field'ları yeniden yükler
- `formSyncInfo` state: `{ isFormSynced, linkedFormTemplateId, activeFormTemplateId, ... }`

#### 4. Güncellenen Dosyalar
| Dosya | Değişiklik |
|-------|------------|
| `db/models/formFields.js` | `getOptionsByFieldCode()` - Sadece aktif template, `getActiveFormTemplate()` eklendi |
| `domains/crm/api/controllers/formController.js` | Legacy kod temizliği, full option objects |
| `domains/crm/api/controllers/priceController.js` | Form sync info ve `/sync-form` endpoint |
| `domains/crm/components/pricing/PricingManager.jsx` | Sync banner UI, `formSyncInfo` state |
| `domains/crm/components/quotes/QuoteFormStep.jsx` | Checkbox fix |
| `domains/crm/components/quotes/QuoteReviewStep.jsx` | Checkbox display fix |
| `domains/crm/services/pricing-service.js` | `syncWithForm()` API method |
| `db/migrations/027_price_form_link.sql` | `linkedFormTemplateId` kolonu |

### Test Senaryoları
1. ✅ Pricing Tab açıldığında sync durumu kontrol ediliyor
2. ✅ Form template değişirse banner görünüyor
3. ✅ "Formu Güncelle" butonuna tıklanınca sync yapılıyor
4. ✅ Sync sonrası banner kayboluyor
5. ✅ Field options sadece aktif template'ten geliyor (duplicate yok)

### Cleanup Adım 2 Sonucu
| Kontrol | Sonuç |
|---------|-------|
| `optionValue` kod kullanımı | ✅ Yok (sadece comment) |
| `priceValue` kod kullanımı (form context) | ✅ Yok (sadece comment) |
| `server/formRoutes.js` | ✅ Silindi |

---

## PROMPT-F1: Backend Fiyat Hesaplama API Konsolidasyonu

**Commit**: `feat(backend): [FP-F1] Consolidate price calculation with calculatePriceServer`
**Tarih**: 6 Aralık 2025

### Amaç
Dağınık fiyat hesaplama mantığını tek bir authoritative kaynakta (`calculatePriceServer`) birleştirmek ve `optionCode` lookup desteğini tüm hesaplamalara eklemek.

### Problem Analizi

#### Tespit Edilen Kritik Bug (6 Aralık 2025)
Select/dropdown alanlarından gelen `optionCode` (örn: `FFOC-001`) lookup tablosundaki sayısal değere çevrilmiyordu. Bu yüzden fiyat hesaplamaları **YANLIŞ** sonuç veriyordu.

```
Kullanıcı "Malzeme" alanında "Alüminyum" seçiyor → optionCode: FFOC-001
Lookup tablosunda: FFOC-001 = 50 (birim fiyat)
Beklenen: Formülde 50 kullanılmalı
Gerçek: Formülde "FFOC-001" (string) → parseFloat("FFOC-001") = NaN → 0
```

#### İkili Hesaplama Sistemi Sorunu
| Fonksiyon | Lookup Kullanımı | Durum |
|-----------|------------------|-------|
| `calculatePriceServer()` | ✅ optionCode + parameterLookupMap | **DOĞRU** |
| `PriceSettings.calculatePrice()` | ❌ lookups kullanmıyor | YANLIŞ |
| `POST /api/price-settings/calculate` | ❌ inline evaluation, lookups yok | YANLIŞ |
| `calculatePriceLocal()` | ⚠️ lookupTable (eski format) | ESKİ |

### Yapılan Değişiklikler

#### 1. Ana Fiyat Hesaplama Endpoint'i Refaktör
**Dosya**: `domains/crm/api/controllers/priceController.js`

```javascript
// ESKİ: Inline formula evaluation (140+ satır)
// - Parameter değerlerini manuel eşleme
// - Excel fonksiyonlarını manuel dönüştürme
// - optionCode lookup desteği YOK

// YENİ: calculatePriceServer kullanımı
import { calculatePriceServer } from '../../../../server/priceCalculator.js';

// Convert parameters to calculatePriceServer format
const convertedParams = (setting.parameters || []).map(p => ({
  id: p.code || p.id,
  type: p.type,
  formField: p.formFieldCode || p.formField,
  value: p.fixedValue || p.value,
  lookups: p.lookups || []
}));

const totalPrice = calculatePriceServer(quoteData, priceSettings);
```

#### 2. Service Layer Refaktör
**Dosya**: `domains/crm/api/services/priceSettingsService.js`

```javascript
// ESKİ: 80+ satır inline formula evaluation
// - eval() kullanımı (güvenlik riski)
// - optionCode lookup desteği YOK

// YENİ: calculatePriceServer kullanımı
import { calculatePriceServer } from '../../../../server/priceCalculator.js';

async calculatePrice(settingId, formData) {
  // ... parameter conversion ...
  const totalPrice = calculatePriceServer(quoteData, priceSettings);
  return { totalPrice, formula, settingId };
}
```

#### 3. Legacy Endpoint Kaldırma
**Dosya**: `domains/crm/api/controllers/priceController.js`

```javascript
// KALDIRILDI:
// POST /api/price-formulas/:id/calculate (B0'da formulas tablosu zaten kaldırılmıştı)
// POST /api/price-formulas/:formulaId/parameters
// DELETE /api/price-formulas/:formulaId/parameters/:parameterId

// Yorum olarak işaretlendi:
// F1: Legacy endpoint removed - use POST /api/price-settings/calculate instead
```

#### 4. Dead Code Temizliği
**Dosya**: `shared/lib/api.js`

```javascript
// KALDIRILDI:
async applyPricesBulk(ids = []) { ... }  // Endpoint hiç implement edilmemişti
async applyPricesAll() { ... }            // Endpoint hiç implement edilmemişti

// DEPRECATE EDİLDİ:
calculatePriceLocal(quote, priceSettings) {
  console.warn('⚠️ F1: calculatePriceLocal() is deprecated.')
  return parseFloat(quote?.calculatedPrice || quote?.finalPrice || quote?.price) || 0
}
```

**Dosya**: `shared/lib/architectureAPI.js`

```javascript
// KALDIRILDI:
async batchUpdateQuotes(quoteIds, action) { ... }  // Endpoint yoktu

// Tüm status action fonksiyonları null yapıldı:
// F1: Action handled by QuoteDetailsPanel
action: null
```

**Dosya**: `domains/crm/utils/price-calculator.js`

```javascript
// DEPRECATE EDİLDİ:
export function calculatePrice(quote, priceSettings) {
  console.warn('⚠️ F1: calculatePrice() is deprecated.')
  return parseFloat(quote?.calculatedPrice || quote?.finalPrice || quote?.price) || 0
}
```

#### 5. Form Sync ile Lookup Migration
**Dosya**: `domains/crm/api/controllers/priceController.js`

Form template değiştiğinde lookup değerlerinin korunması için optionLabel eşleştirmesi:

```javascript
// POST /api/price-settings/:id/sync-form
// F1-C: Migrate lookup values to new optionCodes based on optionLabel matching

// 1. Eski form'un optionCode → optionLabel haritası
const oldCodeToLabel = { 'FFOC-10100': 'Alüminyum', ... }

// 2. Yeni form'un optionLabel → optionCode haritası  
const labelToNewCode = { 'Alüminyum': 'FFOC-10116', ... }

// 3. Her lookup için migration
for (const lookup of param.lookups) {
  const label = oldCodeToLabel[lookup.optionCode];  // FFOC-10100 → "Alüminyum"
  const newCode = labelToNewCode[label];            // "Alüminyum" → FFOC-10116
  await db('price_parameter_lookups').where('id', lookup.id)
    .update({ optionCode: newCode });
}
```

#### 6. Lookup ID Eklenmesi
**Dosya**: `domains/crm/api/services/priceSettingsService.js`

```javascript
// getWithDetails() artık lookup.id döndürüyor (migration için gerekli)
acc[lookup.parameterId].push({
  id: lookup.id,  // F1-C: Include ID for migration updates
  optionCode: lookup.optionCode,
  value: parseFloat(lookup.value) || 0
});
```

#### 7. linkedFormTemplateId Auto-Link
**Dosya**: `domains/crm/api/controllers/priceController.js`

```javascript
// POST /api/price-settings (create)
// Yeni price setting oluşturulurken aktif form template ile otomatik link

const [activeFormTemplate] = await db('quotes.form_templates')
  .where('isActive', true).select('id').limit(1);

const setting = await PriceSettings.create({
  ...data,
  linkedFormTemplateId: activeFormTemplate?.id || null
});
```

#### 8. optionLabel Display Fix
**Dosya**: `domains/crm/components/quotes/QuoteDetailsPanel.jsx`

```javascript
// ESKİ: Sadece field.id ile eşleşme
const field = fields.find(f => f.id === key)

// YENİ: fieldCode VEYA id ile eşleşme
const field = fields.find(f => f.fieldCode === key || f.id === key)
```

### Güncellenen Dosyalar

| Dosya | Değişiklik |
|-------|------------|
| `priceController.js` | F1 refactor: calculatePriceServer kullanımı, legacy endpoint kaldırma, sync-form migration |
| `priceSettingsService.js` | F1 refactor: calculatePriceServer, lookup.id eklenmesi, linkedFormTemplateId |
| `api.js` | Dead code temizliği, calculatePriceLocal deprecation |
| `architectureAPI.js` | Dead code temizliği, action fonksiyonları kaldırma |
| `price-calculator.js` | calculatePrice deprecation |
| `QuoteDetailsPanel.jsx` | optionLabel display fix |

### Test Senaryoları
1. ✅ Form edit sonrası fiyat hesaplaması doğru çalışıyor (optionCode → lookup value)
2. ✅ Quote oluşturma sırasında fiyat doğru hesaplanıyor
3. ✅ Legacy endpoint'ler temizlendi
4. ✅ "Formu Güncelle" butonuna basılınca lookup değerleri korunuyor
5. ✅ Yeni price setting oluşturulunca linkedFormTemplateId otomatik atanıyor
6. ✅ optionLabel display fix çalışıyor (optionCode yerine optionLabel gösteriliyor)
7. ✅ Console'da ölü endpoint hataları yok

### Migration Notu
Mevcut price_parameter_lookups verileri korundu. optionCode migration sadece "Formu Güncelle" butonu tıklandığında gerçekleşir.

---

## PROMPT-F3: Versioning Sisteminin Kaldırılması

> **Tarih**: 6 Aralık 2025  
> **Durum**: ✅ TAMAMLANDI  
> **Commit**: TBD

### Problem Analizi

Tester'ın raporunda belirtilen `form_templates_code_unique` constraint sorunu araştırıldığında:

1. **`createNewVersion()`** fonksiyonu aynı `code` ile yeni versiyon oluşturmaya çalışıyordu
2. `form_templates_code_unique` constraint bu işlemi engelliyordu
3. Analiz sonucu: **Versioning sistemi hiç kullanılmamış**
   - Tüm `supersedesId` değerleri NULL
   - Tüm formlar unique code'a sahip
   - Sadece 1 form `version > 1` (manuel test)

### Karar: Versioning Sistemini Tamamen Kaldır

Kullanılmayan ve constraint hatalarına yol açan versioning sistemi kaldırıldı.

### Database Migration

```sql
-- 1. Constraint'leri kaldır
ALTER TABLE quotes.price_settings DROP CONSTRAINT IF EXISTS price_settings_code_version_unique;
ALTER TABLE quotes.form_templates DROP CONSTRAINT IF EXISTS form_templates_code_unique;

-- 2. İndeksleri kaldır
DROP INDEX IF EXISTS quotes.form_templates_version_index;
DROP INDEX IF EXISTS quotes.price_settings_code_version_index;

-- 3. Kolonları kaldır
ALTER TABLE quotes.form_templates DROP COLUMN IF EXISTS version;
ALTER TABLE quotes.form_templates DROP COLUMN IF EXISTS "supersedesId";
ALTER TABLE quotes.price_settings DROP COLUMN IF EXISTS version;
ALTER TABLE quotes.price_settings DROP COLUMN IF EXISTS "supersedesId";
```

### Kod Değişiklikleri

#### 1. formTemplates.js (Model)
- ❌ `createNewVersion()` fonksiyonu kaldırıldı
- ❌ `getVersions()` fonksiyonu kaldırıldı
- ✏️ `create()` fonksiyonundan `version` parametresi kaldırıldı
- ✏️ `getActive()` fonksiyonundan `orderBy('version', 'desc')` kaldırıldı
- ✏️ `activateVersion()` → `activateTemplate()` olarak yeniden adlandırıldı

#### 2. priceSettingsService.js (Service)
- ❌ `createNewVersion()` fonksiyonu kaldırıldı
- ✏️ `create()` fonksiyonundan `version`, `supersedesId` parametreleri kaldırıldı

#### 3. formController.js (API)
- ❌ `GET /api/form-templates/:code/versions` endpoint kaldırıldı
- ❌ `POST /api/form-templates/:id/new-version` endpoint kaldırıldı
- ✏️ `activateVersion()` → `activateTemplate()` çağrısı güncellendi

#### 4. priceController.js (API)
- ❌ `GET /api/price-formulas/:code/versions` endpoint kaldırıldı
- ❌ `POST /api/price-formulas/:id/new-version` endpoint kaldırıldı
- ❌ `POST /api/price-settings/:id/new-version` endpoint kaldırıldı
- ✏️ `version` select'leri sorgulardan kaldırıldı
- ✏️ `activeFormTemplateVersion` response'lardan kaldırıldı

#### 5. formFields.js (Model)
- ✏️ `getActiveFormTemplate()` sorgusundan `version` select kaldırıldı

#### 6. PricingManager.jsx (UI)
- ❌ `isNewVersionModalOpen`, `newVersionName` state'leri kaldırıldı
- ❌ "Yeni Sürüm Oluştur" modal'ı kaldırıldı
- ✏️ `formSyncInfo` state'inden `activeFormTemplateVersion` kaldırıldı
- ✏️ Uyarı mesajından versiyon gösterimi kaldırıldı

#### 7. QuotesManager.js (UI)
- ✏️ `priceSettings?.version` → `priceSettings?.code` değiştirildi
- ✏️ `priceSettings?.versionId` → `priceSettings?.id` değiştirildi

### Korunan Fonksiyonlar

Aşağıdaki temel CRUD fonksiyonları korundu:

| Fonksiyon | Açıklama |
|-----------|----------|
| `create()` | Yeni form/setting oluşturma (farklı code ile) |
| `update()` | Mevcut form/setting güncelleme |
| `activate()` / `activateTemplate()` | Template/setting aktif etme |
| `delete()` | Template/setting silme |

### Test Sonuçları

- ✅ Build başarılı
- ✅ `GET /api/form-templates/active` çalışıyor
- ✅ `GET /api/price-settings/active` çalışıyor
- ✅ Form sync işlemi çalışıyor
- ✅ Quote oluşturma/düzenleme çalışıyor