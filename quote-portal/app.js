// Burkol Quote SPA (React 18) + backend API
// Hash routes: #/teklif and #/admin

;(function () {
  const { useState, useEffect, useMemo, useRef } = React

  // i18n (TR + EN baseline). UI strings, inputs accept all unicode.
  const dict = {
    tr: {
      nav_quote: 'Teklif Ver',
      nav_admin: 'Admin',
      title_quote: 'Özel Üretim Teklif Formu',
      sub_quote:
        'Metal işleme ihtiyaçlarınız için detayları paylaşın. Maksimum 2 dosya yükleyebilirsiniz (PDF, PNG, JPG/JPEG, DXF, DWG, STEP/IGES).',
      title_admin: 'Teklif Yönetimi ve Analitik',
      sub_admin:
        'Gelen talepleri görüntüleyin, durumlarını yönetin, içgörüler elde edin ve dışa aktarın.',
      submit: 'Teklifi Gönder',
      saved: 'Teklif alındı. Teşekkürler!',
      required: 'Zorunlu alan',
      files_limit: 'En fazla 2 dosya yükleyebilirsiniz.',
      file_too_big: 'Dosya çok büyük. Limit: 1.5MB',
      file_type_bad: 'Desteklenmeyen dosya türü',
      // Fields
      f_name: 'Ad Soyad',
      f_company: 'Firma (opsiyonel)',
      f_email: 'E‑posta',
      f_phone: 'Telefon',
      f_country: 'Ülke',
      f_city: 'Şehir',
      f_proj: 'Proje / Parça Adı',
      f_process: 'Süreçler (seçiniz)',
      f_material: 'Malzeme',
      f_grade: 'Kalite / Alaşım',
      f_thickness: 'Kalınlık (mm)',
      f_qty: 'Adet',
      f_dims: 'Boyutlar (L×W×H mm)',
      f_tolerance: 'Tolerans (örn. ±0.2mm)',
      f_finish: 'Yüzey İşlem',
      f_due: 'Hedef Teslim Tarihi',
      f_repeat: 'Tek Seferlik / Süreklilik',
      f_budget: 'Bütçe (opsiyonel)',
      f_address: 'Teslimat Adresi (opsiyonel)',
      f_desc: 'Teknik Açıklama / Notlar',
      f_drawing: 'Teknik çizim mevcut mu?',
      f_upload: 'Dosya Yükle (max 2)',
      yes: 'Evet',
      no: 'Hayır',
      // Admin
      a_filters: 'Filtreler',
      a_search: 'Ara…',
      a_status: 'Durum',
      a_all: 'Tümü',
      s_new: 'Yeni',
      s_review: 'İncelemede',
      s_feasible: 'Uygun',
      s_not: 'Uygun Değil',
      s_quoted: 'Teklif Verildi',
      a_update: 'Güncelle',
      a_delete: 'Sil',
      a_export_json: 'JSON Dışa Aktar',
      a_export_csv: 'CSV Dışa Aktar',
      a_stats: 'Analitik',
      a_list: 'Gelen Talepler',
      a_detail: 'Detay',
      a_close: 'Kapat',
      a_none: 'Kayıt bulunamadı',
      // Common UI
      select: 'Seçiniz',
      refresh: 'Yenile',
      download: 'İndir',
      info: 'Bilgi',
      confirm_delete: 'Silmek istediğinizden emin misiniz?'
        ,
      // Admin table headers
      th_date: 'Tarih',
      th_customer: 'Müşteri',
      th_project: 'Proje',
      th_material: 'Malzeme',
      th_process: 'Süreç',
      th_qty: 'Adet',
      th_thickness: 'Kalınlık (mm)',
      th_due: 'Termin',
      th_actions: 'İşlemler',
      // Extra field labels
      f_qty_tiers: 'Adet Kademeleri',
      f_tolerance_std: 'Tolerans Standardı',
      f_tolerance_crit: 'Kritik Toleranslar',
      f_surface_ra: 'Yüzey Pürüzlülüğü (Ra)',
      f_bend_count: 'Büküm Sayısı',
      f_weld_method: 'Kaynak Yöntemi',
      // Placeholders
      ph_name: 'Örn. Ahmet Yılmaz',
      ph_company: 'Şirket adı',
      ph_email: 'ornek@firma.com',
      ph_phone_local: '5xx xxx xx xx',
      ph_city: 'Şehir',
      ph_proj: 'Proje/Parça adı',
      ph_grade: 'Örn. S235 / 304 / 5754',
      ph_thickness: 'Örn. 3.0 (mm)',
      ph_qty: 'Adet',
      ph_qty_t1: 'Örn. 10',
      ph_qty_t2: 'Örn. 50',
      ph_qty_t3: 'Örn. 100',
      ph_tolcrit: 'Örn. H7 delikler, +/-0.05mm yüzey',
      ph_finish_ral: 'RAL Kodu (örn. RAL 9005)'
      ,
      ph_desc: 'Teknik detaylar, özel istekler, termin vb.'
      ,
      ph_bend_count: 'Örn. 2'
      ,
      ph_budget_amount: 'Tutar'
      ,
      ph_address_optional: 'Opsiyonel'
      ,
      // Dropdown option labels
      opt_process: {
        'Lazer Kesim': 'Lazer Kesim',
        'Abkant Büküm': 'Abkant Büküm',
        'Kaynak': 'Kaynak',
        'CNC İşleme': 'CNC İşleme',
        'Montaj': 'Montaj',
        'Toz Boya': 'Toz Boya',
        'Galvaniz': 'Galvaniz',
        'Anodize': 'Anodize',
      },
      opt_material: {
        'Mild Steel (S235/S355)': 'Yumuşak Çelik (S235/S355)',
        'Stainless Steel (304/316)': 'Paslanmaz Çelik (304/316)',
        'Aluminum (5052/6061/6082)': 'Alüminyum (5052/6061/6082)',
        'Galvanized Steel': 'Galvanizli Çelik',
        'Copper/Brass': 'Bakır/Pirinç',
        'Other': 'Diğer',
      },
      opt_finish: {
        'Ham': 'Ham',
        'Zımpara': 'Zımpara',
        'Toz Boya': 'Toz Boya',
        'Galvaniz': 'Galvaniz',
        'Anodize': 'Anodize',
        'Diğer': 'Diğer',
      },
      repeat_one: 'Tek Seferlik',
      repeat_recurrent: 'Süreklilik',
      anodize_clear: 'Şeffaf',
      anodize_black: 'Siyah',
      anodize_colored: 'Renkli',
    },
    en: {
      nav_quote: 'Request Quote',
      nav_admin: 'Admin',
      title_quote: 'Custom Manufacturing Quote Form',
      sub_quote:
        'Share details for your metal fabrication needs. Upload up to 2 files (PDF, PNG, JPG/JPEG, DXF, DWG, STEP/IGES).',
      title_admin: 'Quote Management & Analytics',
      sub_admin:
        'Review submissions, update statuses, gain insights, and export.',
      submit: 'Submit Quote',
      saved: 'Quote received. Thank you!',
      required: 'Required',
      files_limit: 'You can upload up to 2 files.',
      file_too_big: 'File too large. Limit: 1.5MB',
      file_type_bad: 'Unsupported file type',
      f_name: 'Full Name',
      f_company: 'Company (optional)',
      f_email: 'Email',
      f_phone: 'Phone',
      f_country: 'Country',
      f_city: 'City',
      f_proj: 'Project / Part Name',
      f_process: 'Processes (select)',
      f_material: 'Material',
      f_grade: 'Grade / Alloy',
      f_thickness: 'Thickness (mm)',
      f_qty: 'Quantity',
      f_dims: 'Dimensions (L×W×H mm)',
      f_tolerance: 'Tolerance (e.g., ±0.2mm)',
      f_finish: 'Surface Finish',
      f_due: 'Target Delivery Date',
      f_repeat: 'One-off / Recurrent',
      f_budget: 'Budget (optional)',
      f_address: 'Delivery Address (optional)',
      f_desc: 'Technical Description / Notes',
      f_drawing: 'Has technical drawing?',
      f_upload: 'Upload Files (max 2)',
      yes: 'Yes',
      no: 'No',
      a_filters: 'Filters',
      a_search: 'Search…',
      a_status: 'Status',
      a_all: 'All',
      s_new: 'New',
      s_review: 'In Review',
      s_feasible: 'Feasible',
      s_not: 'Not Feasible',
      s_quoted: 'Quoted',
      a_update: 'Update',
      a_delete: 'Delete',
      a_export_json: 'Export JSON',
      a_export_csv: 'Export CSV',
      a_stats: 'Analytics',
      a_list: 'Submissions',
      a_detail: 'Detail',
      a_close: 'Close',
      a_none: 'No records found',
      // Common UI
      select: 'Select',
      refresh: 'Refresh',
      download: 'Download',
      info: 'Info',
      confirm_delete: 'Are you sure you want to delete?'
        ,
      // Admin table headers
      th_date: 'Date',
      th_customer: 'Customer',
      th_project: 'Project',
      th_material: 'Material',
      th_process: 'Process',
      th_qty: 'Qty',
      th_thickness: 'Thickness (mm)',
      th_due: 'Due',
      th_actions: 'Actions',
      // Extra field labels
      f_qty_tiers: 'Quantity Tiers',
      f_tolerance_std: 'Tolerance Standard',
      f_tolerance_crit: 'Critical Tolerances',
      f_surface_ra: 'Surface Roughness (Ra)',
      f_bend_count: 'Bend Count',
      f_weld_method: 'Weld Method',
      // Placeholders
      ph_name: 'e.g., John Smith',
      ph_company: 'Company name',
      ph_email: 'example@company.com',
      ph_phone_local: 'e.g., 555 123 45 67',
      ph_city: 'City',
      ph_proj: 'Project/Part name',
      ph_grade: 'e.g., S235 / 304 / 5754',
      ph_thickness: 'e.g., 3.0 (mm)',
      ph_qty: 'Quantity',
      ph_qty_t1: 'e.g., 10',
      ph_qty_t2: 'e.g., 50',
      ph_qty_t3: 'e.g., 100',
      ph_tolcrit: 'e.g., H7 holes, +/-0.05mm surface',
      ph_finish_ral: 'RAL Code (e.g., RAL 9005)'
      ,
      ph_desc: 'Technical details, special requests, delivery, etc.'
      ,
      ph_bend_count: 'e.g., 2'
      ,
      ph_budget_amount: 'Amount'
      ,
      ph_address_optional: 'Optional'
      ,
      // Dropdown option labels
      opt_process: {
        'Lazer Kesim': 'Laser Cutting',
        'Abkant Büküm': 'Bending',
        'Kaynak': 'Welding',
        'CNC İşleme': 'CNC Machining',
        'Montaj': 'Assembly',
        'Toz Boya': 'Powder Coating',
        'Galvaniz': 'Galvanization',
        'Anodize': 'Anodizing',
      },
      opt_material: {
        'Mild Steel (S235/S355)': 'Mild Steel (S235/S355)',
        'Stainless Steel (304/316)': 'Stainless Steel (304/316)',
        'Aluminum (5052/6061/6082)': 'Aluminum (5052/6061/6082)',
        'Galvanized Steel': 'Galvanized Steel',
        'Copper/Brass': 'Copper/Brass',
        'Other': 'Other',
      },
      opt_finish: {
        'Ham': 'As-machined',
        'Zımpara': 'Sanded',
        'Toz Boya': 'Powder Coating',
        'Galvaniz': 'Galvanized',
        'Anodize': 'Anodized',
        'Diğer': 'Other',
      },
      repeat_one: 'One-off',
      repeat_recurrent: 'Recurrent',
      anodize_clear: 'Clear',
      anodize_black: 'Black',
      anodize_colored: 'Colored',
    },
  }

  function procLabel(p, t) { return (t.opt_process && t.opt_process[p]) || p }
  function materialLabel(m, t) { return (t.opt_material && t.opt_material[m]) || m }
  function finishLabel(f, t) { return (t.opt_finish && t.opt_finish[f]) || f }

  const initialLang = (localStorage.getItem('bk_lang') || 'tr')

  function useI18n() {
    const [lang, setLang] = useState(initialLang)
    useEffect(() => {
      localStorage.setItem('bk_lang', lang)
      try { document.documentElement.setAttribute('lang', lang) } catch {}
    }, [lang])
    const t = useMemo(() => dict[lang] || dict.tr, [lang])
    return { t, lang, setLang }
  }

  // LocalStorage fallback + Backend API helpers
  const LS_KEY = 'bk_quotes_v1'
  function lsLoad() {
    try { const raw = localStorage.getItem(LS_KEY); const arr = raw ? JSON.parse(raw) : []; return Array.isArray(arr) ? arr : [] } catch { return [] }
  }
  function lsSave(arr) { localStorage.setItem(LS_KEY, JSON.stringify(arr)) }
  function lsAdd(q) { const arr = lsLoad(); arr.unshift(q); lsSave(arr) }
  function lsUpdate(id, patch) { const arr = lsLoad().map(x => x.id === id ? { ...x, ...patch } : x); lsSave(arr) }
  function lsDelete(id) { const arr = lsLoad().filter(x => x.id !== id); lsSave(arr) }

  async function fetchWithTimeout(url, options={}, timeoutMs=4000) {
    return await Promise.race([
      fetch(url, options),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), timeoutMs))
    ])
  }
  
  // Backend API with graceful fallback to localStorage when unreachable
  const API_BASE = (window.BURKOL_API || 'http://localhost:3001')
  const API = {
    async listQuotes() {
      try {
        const res = await fetchWithTimeout(`${API_BASE}/api/quotes`)
        if (!res.ok) throw new Error('list failed')
        return await res.json()
      } catch (e) {
        return lsLoad()
      }
    },
    async createQuote(payload) {
      try {
        const res = await fetchWithTimeout(`${API_BASE}/api/quotes`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
        if (!res.ok) throw new Error('create failed')
        return await res.json()
      } catch (e) {
        lsAdd(payload)
        return { ok: true, id: payload.id, local: true }
      }
    },
    async updateStatus(id, status) {
      try {
        const res = await fetchWithTimeout(`${API_BASE}/api/quotes/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) })
        if (!res.ok) throw new Error('update failed')
        return await res.json()
      } catch (e) {
        lsUpdate(id, { status })
        return { ok: true, local: true }
      }
    },
    async remove(id) {
      try {
        const res = await fetchWithTimeout(`${API_BASE}/api/quotes/${id}`, { method: 'DELETE' })
        if (!res.ok) throw new Error('delete failed')
        return await res.json()
      } catch (e) {
        lsDelete(id)
        return { ok: true, local: true }
      }
    },
    downloadTxt(id, data) {
      // Try backend; if fails, generate client-side from provided data
      const url = `${API_BASE}/api/quotes/${id}/txt`
      fetchWithTimeout(url, {}, 2500).then((res) => {
        if (res && res.ok) {
          const a = document.createElement('a')
          a.href = url
          a.download = `burkol_quote_${id}.txt`
          document.body.appendChild(a); a.click(); a.remove()
        } else { throw new Error('backend txt not ok') }
      }).catch(() => {
        const q = data || lsLoad().find(x => x.id === id)
        if (!q) return
        const lines = []
        lines.push('Burkol Metal — Teklif Özeti')
        lines.push(`Tarih: ${new Date(q.createdAt || Date.now()).toLocaleString()}`)
        lines.push(`ID: ${q.id}`)
        lines.push('')
        lines.push('[Genel]')
        lines.push(`Durum: ${q.status || ''}`)
        lines.push(`Proje: ${q.proj || ''}`)
        lines.push(`Süreç: ${(q.process || []).join(', ')}`)
        lines.push(`Açıklama: ${q.desc || ''}`)
        lines.push('')
        lines.push('[Müşteri]')
        lines.push(`Ad Soyad: ${q.name || ''}`)
        lines.push(`Firma: ${q.company || ''}`)
        lines.push(`E‑posta: ${q.email || ''}`)
        lines.push(`Telefon: ${q.phone || ''}`)
        lines.push(`Ülke/Şehir: ${(q.country || '')} / ${(q.city || '')}`)
        lines.push('')
        lines.push('[Teknik]')
        lines.push(`Malzeme: ${q.material || ''}`)
        lines.push(`Kalite/Alaşım: ${q.grade || ''}`)
        lines.push(`Kalınlık: ${q.thickness || ''} mm`)
        lines.push(`Adet: ${q.qty || ''}`)
        lines.push(`Boyut: ${q.dims || ''}`)
        lines.push(`Tolerans: ${q.tolerance || ''}`)
        lines.push(`Yüzey: ${q.finish || ''}`)
        lines.push(`Termin: ${q.due || ''}`)
        lines.push(`Tekrarlılık: ${q.repeat || ''}`)
        lines.push(`Bütçe: ${q.budget || ''}`)
        lines.push('')
        const files = q.files || []
        lines.push('[Dosyalar]')
        if (!files.length) { lines.push('—') } else { files.forEach((f, i) => lines.push(`${i + 1}. ${f.name} (${Math.round((f.size || 0) / 1024)} KB)`)) }
        const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' })
        const a = document.createElement('a'); const dl = URL.createObjectURL(blob)
        a.href = dl; a.download = `burkol_quote_${id}.txt`; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(dl)
      })
    }
  }

  function uid() { return 'q_' + Math.random().toString(36).slice(2) + Date.now().toString(36) }

  // Allowed file types and size
  const ACCEPT_EXT = ['pdf', 'png', 'jpg', 'jpeg', 'dxf', 'dwg', 'step', 'stp', 'iges', 'igs']
  const MAX_FILES = 2
  const MAX_FILE_MB = 1.5

  function extOf(name) {
    const i = name.lastIndexOf('.')
    return i >= 0 ? name.slice(i + 1).toLowerCase() : ''
  }

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const fr = new FileReader()
      fr.onload = () => resolve(fr.result)
      fr.onerror = reject
      fr.readAsDataURL(file)
    })
  }

  // Simple Hash router
  function useHashRoute() {
    const [route, setRoute] = useState(() => location.hash || '#/teklif')
    useEffect(() => {
      const onHash = () => setRoute(location.hash || '#/teklif')
      window.addEventListener('hashchange', onHash)
      return () => window.removeEventListener('hashchange', onHash)
    }, [])
    return route
  }

  function Nav({ route, onLang, lang, t }) {
    const active = (r) => (route === r ? 'tab active' : 'tab')
    return (
      React.createElement('div', { className: 'nav' },
        React.createElement('div', { className: 'nav-inner container' },
          React.createElement('div', { className: 'brand' },
            React.createElement('div', { className: 'dot' }),
            React.createElement('a', { href: '#/teklif' }, 'BURKOL')
          ),
          React.createElement('div', { className: 'row wrap' },
            React.createElement('div', { className: 'tabs' },
              React.createElement('a', { href: '#/teklif', className: active('#/teklif') }, t.nav_quote),
              React.createElement('a', { href: '#/admin', className: active('#/admin') }, t.nav_admin)
            ),
            React.createElement('div', { style: { width: 12 } }),
            React.createElement('select', {
              value: lang,
              onChange: (e) => onLang(e.target.value),
              style: { padding: '8px 10px', borderRadius: 8 },
            },
              React.createElement('option', { value: 'tr' }, 'Türkçe'),
              React.createElement('option', { value: 'en' }, 'English'),
            )
          )
        )
      )
    )
  }

  function Field({ label, children, help, className, style }) {
    const cls = ['card', className].filter(Boolean).join(' ')
    return React.createElement('div', { className: cls, style },
      React.createElement('label', null, label),
      children,
      help ? React.createElement('div', { className: 'help', style: { marginTop: 6 } }, help) : null
    )
  }

  function QuoteForm({ t }) {
    const [submitting, setSubmitting] = useState(false)
    const [message, setMessage] = useState('')
    const [popup, setPopup] = useState(null)
    const [errors, setErrors] = useState({})
    const [files, setFiles] = useState([]) // {name, type, size, dataUrl}

    const [form, setForm] = useState({
      name: '', company: '', email: '', phone: '', phoneCode: '+90', phoneLocal: '', country: 'TR', city: '',
      proj: '', process: [], material: '', grade: '', thickness: '', qty: '',
      dims: '', dimsL: '', dimsW: '', dimsH: '', tolerance: '', toleranceStd: 'ISO 2768-m', toleranceCrit: '', finish: '', finishRal: '', anodizeType: '', due: '', repeat: 'one', budget: '', budgetCurrency: 'TRY', budgetAmount: '', address: '',
      drawing: 'no', desc: '', bendCount: '', weldMethod: '', surfaceRa: '', qtyT1: '', qtyT2: '', qtyT3: ''
    })

    function setF(k, v) { setForm((s) => ({ ...s, [k]: v })) }

    function validate() {
      const e = {}
      if (!form.name.trim()) e.name = t.required
      if (!form.email.trim()) e.email = t.required
      if (!form.phoneLocal.trim()) e.phone = t.required
      if (!form.proj.trim()) e.proj = t.required
      if (!form.material.trim()) e.material = t.required
      if (!form.qty && !form.qtyT1 && !form.qtyT2 && !form.qtyT3) e.qty = t.required
      if (!form.thickness) e.thickness = t.required
      return e
    }

    async function onFilesChanged(fileList) {
      const arr = Array.from(fileList)
      // append to existing
      const combined = files.concat(arr)
      if (combined.length > MAX_FILES) {
        setMessage(t.files_limit)
        return
      }
      const parsed = []
      for (const f of arr) {
        const sizeMb = f.size / (1024 * 1024)
        if (sizeMb > MAX_FILE_MB) { setMessage(t.file_too_big); continue }
        const ext = extOf(f.name)
        if (!ACCEPT_EXT.includes(ext)) { setMessage(t.file_type_bad); continue }
        const dataUrl = await readFileAsDataUrl(f)
        parsed.push({ name: f.name, type: f.type || ext, size: f.size, dataUrl })
      }
      setFiles((prev) => prev.concat(parsed).slice(0, MAX_FILES))
    }

    function removeFile(ix) {
      setFiles((prev) => prev.filter((_, i) => i !== ix))
    }

    async function onSubmit(e) {
      e.preventDefault()
      const eMap = validate()
      setErrors(eMap)
      if (Object.keys(eMap).length) return
      setSubmitting(true)
      try {
        const phone = `${form.phoneCode} ${form.phoneLocal}`.trim()
        const dims = [form.dimsL, form.dimsW, form.dimsH].filter(Boolean).join(' x ')
        const budgetStr = form.budgetAmount ? `${form.budgetAmount} ${form.budgetCurrency}` : ''
        const qtyTiers = [form.qtyT1, form.qtyT2, form.qtyT3].map(x => Number(x||0)).filter(Boolean)
        const primaryQty = Number(form.qty || qtyTiers[0] || 0)
        const payload = {
          id: uid(),
          createdAt: new Date().toISOString(),
          status: 'new',
          ...form,
          qty: primaryQty,
          thickness: Number(form.thickness || 0),
          phone,
          dims,
          budget: budgetStr,
          qtyTiers,
          files,
        }
        await API.createQuote(payload)
        setPopup({ title: 'Başarılı', text: t.saved })
        // reset
        setForm({
          name: '', company: '', email: '', phone: '', phoneCode: '+90', phoneLocal: '', country: 'TR', city: '',
          proj: '', process: [], material: '', grade: '', thickness: '', qty: '',
          dims: '', dimsL: '', dimsW: '', dimsH: '', tolerance: '', toleranceStd: 'ISO 2768-m', toleranceCrit: '', finish: '', finishRal: '', anodizeType: '', due: '', repeat: 'one', budget: '', budgetCurrency: 'TRY', budgetAmount: '', address: '',
          drawing: 'no', desc: '', bendCount: '', weldMethod: '', surfaceRa: '', qtyT1: '', qtyT2: '', qtyT3: ''
        })
        setFiles([])
        setErrors({})
      } catch (err) {
        console.error(err)
        setMessage('Kaydedilemedi. Sunucuya erişilemiyor olabilir.')
      } finally {
        setSubmitting(false)
      }
    }

    const procOptions = [
      'Lazer Kesim', 'Abkant Büküm', 'Kaynak', 'CNC İşleme', 'Montaj', 'Toz Boya', 'Galvaniz', 'Anodize'
    ]
    const COUNTRY_OPTIONS = [
      { code: 'TR', name: 'Türkiye', dial: '+90' },
      { code: 'US', name: 'United States', dial: '+1' },
      { code: 'DE', name: 'Deutschland', dial: '+49' },
      { code: 'GB', name: 'United Kingdom', dial: '+44' },
      { code: 'FR', name: 'France', dial: '+33' },
      { code: 'NL', name: 'Nederland', dial: '+31' },
      { code: 'IT', name: 'Italia', dial: '+39' },
      { code: 'ES', name: 'España', dial: '+34' },
      { code: 'AE', name: 'United Arab Emirates', dial: '+971' },
      { code: 'SA', name: 'Saudi Arabia', dial: '+966' },
      { code: 'AZ', name: 'Azərbaycan', dial: '+994' },
      { code: 'BG', name: 'Bulgaria', dial: '+359' },
      { code: 'RO', name: 'România', dial: '+40' },
      { code: 'GR', name: 'Ελλάδα', dial: '+30' },
      { code: 'RU', name: 'Россия', dial: '+7' },
      { code: 'IR', name: 'ایران', dial: '+98' },
      { code: 'IQ', name: 'العراق', dial: '+964' },
      { code: 'OTHER', name: 'Other', dial: '' },
    ]
    const TR_CITIES = ['Adana','Adıyaman','Afyonkarahisar','Ağrı','Aksaray','Amasya','Ankara','Antalya','Ardahan','Artvin','Aydın','Balıkesir','Bartın','Batman','Bayburt','Bilecik','Bingöl','Bitlis','Bolu','Burdur','Bursa','Çanakkale','Çankırı','Çorum','Denizli','Diyarbakır','Düzce','Edirne','Elazığ','Erzincan','Erzurum','Eskişehir','Gaziantep','Giresun','Gümüşhane','Hakkari','Hatay','Iğdır','Isparta','İstanbul','İzmir','Kahramanmaraş','Karabük','Karaman','Kars','Kastamonu','Kayseri','Kırıkkale','Kırklareli','Kırşehir','Kilis','Kocaeli','Konya','Kütahya','Malatya','Manisa','Mardin','Mersin','Muğla','Muş','Nevşehir','Niğde','Ordu','Osmaniye','Rize','Sakarya','Samsun','Şanlıurfa','Siirt','Sinop','Sivas','Şırnak','Tekirdağ','Tokat','Trabzon','Tunceli','Uşak','Van','Yalova','Yozgat','Zonguldak']
    const CURRENCIES = ['TRY', 'USD', 'EUR', 'GBP']
    // Competitor-like material presets and thickness tiles
    const materialOptions = ['Mild Steel (S235/S355)', 'Stainless Steel (304/316)', 'Aluminum (5052/6061/6082)', 'Galvanized Steel', 'Copper/Brass', 'Other']
    const thicknessMap = {
      'Mild Steel (S235/S355)': [1,1.5,2,3,4,5,6,8,10,12],
      'Stainless Steel (304/316)': [1,1.5,2,3,4,5,6,8],
      'Aluminum (5052/6061/6082)': [1,1.5,2,3,4,5,6,8,10],
      'Galvanized Steel': [1,1.5,2,3,4],
      'Copper/Brass': [1,1.5,2,3,4],
      'Other': []
    }
    const finishOptions = ['Ham', 'Zımpara', 'Toz Boya', 'Galvaniz', 'Anodize', 'Diğer']

    return React.createElement('div', { className: 'container' },
      React.createElement('h1', { className: 'page-title' }, t.title_quote),
      React.createElement('p', { className: 'page-sub' }, t.sub_quote),

      message ? React.createElement('div', { className: 'notice', style: { marginBottom: 12 } }, message) : null,

      React.createElement('form', { onSubmit },
        React.createElement('div', { className: 'grid three' },
          React.createElement(Field, { label: t.f_name },
            React.createElement('input', {
              value: form.name, onChange: (e) => setF('name', e.target.value), placeholder: t.ph_name,
            }), errors.name ? React.createElement('div', { className: 'help' }, errors.name) : null
          ),
          React.createElement(Field, { label: t.f_company },
            React.createElement('input', { value: form.company, onChange: (e) => setF('company', e.target.value), placeholder: t.ph_company })
          ),

          React.createElement(Field, { label: t.f_email },
            React.createElement('input', { type: 'email', value: form.email, onChange: (e) => setF('email', e.target.value), placeholder: t.ph_email }),
            errors.email ? React.createElement('div', { className: 'help' }, errors.email) : null
          ),
          React.createElement(Field, { label: t.f_phone },
            React.createElement('div', { className: 'row' },
              React.createElement('select', {
                value: form.phoneCode,
                onChange: (e) => setForm((s) => ({ ...s, phoneCode: e.target.value }))
              },
                COUNTRY_OPTIONS.map(c => React.createElement('option', { key: c.code, value: c.dial || '' }, `${c.name} ${c.dial}`))
              ),
              React.createElement('input', { value: form.phoneLocal, onChange: (e) => setF('phoneLocal', e.target.value), placeholder: t.ph_phone_local })
            ),
            errors.phone ? React.createElement('div', { className: 'help' }, errors.phone) : null
          ),

          React.createElement(Field, { label: t.f_country },
            React.createElement('select', { value: form.country, onChange: (e) => {
              const newCountry = e.target.value
              const found = COUNTRY_OPTIONS.find(c => c.code === newCountry)
              setForm((s) => ({ ...s, country: newCountry, phoneCode: found && found.dial ? found.dial : s.phoneCode, city: '' }))
            } },
              COUNTRY_OPTIONS.map(c => React.createElement('option', { key: c.code, value: c.code }, c.name))
            )
          ),
          React.createElement(Field, { label: t.f_city },
            form.country === 'TR' ? (
              React.createElement('select', { value: form.city, onChange: (e) => setF('city', e.target.value) },
              React.createElement('option', { value: '' }, t.select),
              TR_CITIES.map(c => React.createElement('option', { key: c, value: c }, c))
              )
            ) : (
              React.createElement('input', { value: form.city, onChange: (e) => setF('city', e.target.value), placeholder: t.ph_city })
            )
          ),

          React.createElement(Field, { label: t.f_proj },
            React.createElement('input', { value: form.proj, onChange: (e) => setF('proj', e.target.value), placeholder: t.ph_proj }),
            errors.proj ? React.createElement('div', { className: 'help' }, errors.proj) : null
          ),
          React.createElement(Field, { label: t.f_process, className: 'span-3' },
            React.createElement('div', { className: 'proc-grid' },
              procOptions.map((p) => (
                React.createElement('label', { key: p, className: 'proc-item' },
                  React.createElement('input', {
                    type: 'checkbox', checked: form.process.includes(p),
                    onChange: (e) => {
                      const checked = e.target.checked
                      setForm((s) => ({ ...s, process: checked ? [...s.process, p] : s.process.filter((x) => x !== p) }))
                    }
                  }),
                  React.createElement('span', null, procLabel(p, t))
                )
              ))
            )
          ),

          React.createElement(Field, { label: t.f_material },
            React.createElement('select', { value: form.material, onChange: (e) => { const v=e.target.value; setForm(s=>({ ...s, material: v, thickness: '' })) } },
              React.createElement('option', { value: '' }, t.select),
              materialOptions.map((m) => React.createElement('option', { key: m, value: m }, materialLabel(m, t)))
            ),
            errors.material ? React.createElement('div', { className: 'help' }, errors.material) : null
          ),
          React.createElement(Field, { label: t.f_grade },
            React.createElement('input', { value: form.grade, onChange: (e) => setF('grade', e.target.value), placeholder: t.ph_grade })
          ),

          React.createElement(Field, { label: t.f_thickness },
            React.createElement('div', { className: 'tile-grid' },
              (thicknessMap[form.material] || []).map((mm) => (
                React.createElement('div', { key: mm, className: 'tile ' + (Number(form.thickness) === mm ? 'active' : ''), onClick: () => setF('thickness', mm) }, `${mm} mm`)
              )),
              React.createElement('div', { className: 'tile ' + (!(thicknessMap[form.material]||[]).length ? 'active' : ''), onClick: () => {} }, 'Diğer')
            ),
            React.createElement('div', { className: 'row', style: { marginTop: 8 } },
              React.createElement('input', { type: 'number', min: 0, step: '0.1', value: form.thickness, onChange: (e) => setF('thickness', e.target.value), placeholder: t.ph_thickness })
            ),
            errors.thickness ? React.createElement('div', { className: 'help' }, errors.thickness) : null
          ),
          React.createElement(Field, { label: t.f_qty },
            React.createElement('input', { type: 'number', min: 1, step: '1', value: form.qty, onChange: (e) => setF('qty', e.target.value), placeholder: t.ph_qty }),
            errors.qty ? React.createElement('div', { className: 'help' }, errors.qty) : null
          ),
          React.createElement(Field, { label: t.f_qty_tiers },
            React.createElement('div', { className: 'row' },
              React.createElement('input', { type: 'number', min: 1, step: '1', value: form.qtyT1, onChange: (e) => setF('qtyT1', e.target.value), placeholder: t.ph_qty_t1 }),
              React.createElement('input', { type: 'number', min: 1, step: '1', value: form.qtyT2, onChange: (e) => setF('qtyT2', e.target.value), placeholder: t.ph_qty_t2 }),
              React.createElement('input', { type: 'number', min: 1, step: '1', value: form.qtyT3, onChange: (e) => setF('qtyT3', e.target.value), placeholder: t.ph_qty_t3 })
            )
          ),

          React.createElement(Field, { label: t.f_dims },
            React.createElement('div', { className: 'dims-row' },
              React.createElement('input', { type: 'number', min: 0, step: '0.1', value: form.dimsL, onChange: (e) => setF('dimsL', e.target.value), placeholder: 'L' }),
              React.createElement('span', { className: 'x' }, 'x'),
              React.createElement('input', { type: 'number', min: 0, step: '0.1', value: form.dimsW, onChange: (e) => setF('dimsW', e.target.value), placeholder: 'W' }),
              React.createElement('span', { className: 'x' }, 'x'),
              React.createElement('input', { type: 'number', min: 0, step: '0.1', value: form.dimsH, onChange: (e) => setF('dimsH', e.target.value), placeholder: 'H' })
            )
          ),
          React.createElement(Field, { label: t.f_tolerance_std },
            React.createElement('select', { value: form.toleranceStd, onChange: (e) => setF('toleranceStd', e.target.value) },
              ['ISO 2768-f', 'ISO 2768-m', 'ISO 2768-c'].map((opt) => React.createElement('option', { key: opt, value: opt }, opt))
            )
          ),
          React.createElement(Field, { label: t.f_tolerance_crit },
            React.createElement('input', { value: form.toleranceCrit, onChange: (e) => setF('toleranceCrit', e.target.value), placeholder: t.ph_tolcrit })
          ),

          React.createElement(Field, { label: t.f_finish },
            React.createElement('select', { value: form.finish, onChange: (e) => setF('finish', e.target.value) },
              React.createElement('option', { value: '' }, t.select),
              finishOptions.map((m) => React.createElement('option', { key: m, value: m }, finishLabel(m, t)))
            ),
            form.finish === 'Toz Boya' ? React.createElement('div', { className: 'row', style: { marginTop: 6 } },
              React.createElement('input', { value: form.finishRal, onChange: (e) => setF('finishRal', e.target.value), placeholder: t.ph_finish_ral })
            ) : null,
            form.finish === 'Anodize' ? React.createElement('div', { className: 'row', style: { marginTop: 6 } },
              React.createElement('select', { value: form.anodizeType, onChange: (e) => setF('anodizeType', e.target.value) },
                ['Clear', 'Black', 'Colored'].map((x) => React.createElement('option', { key: x, value: x }, x === 'Clear' ? t.anodize_clear : x === 'Black' ? t.anodize_black : t.anodize_colored))
              )
            ) : null
          ),
          React.createElement(Field, { label: t.f_due },
            React.createElement('input', { type: 'date', value: form.due, onChange: (e) => setF('due', e.target.value) })
          ),

          // Process-specific minimal fields
          form.process.includes('Abkant Büküm') ? React.createElement(Field, { label: t.f_bend_count },
            React.createElement('input', { type: 'number', min: 0, step: '1', value: form.bendCount, onChange: (e) => setF('bendCount', e.target.value), placeholder: t.ph_bend_count })
          ) : null,
          form.process.includes('Kaynak') ? React.createElement(Field, { label: t.f_weld_method },
            React.createElement('select', { value: form.weldMethod, onChange: (e) => setF('weldMethod', e.target.value) },
              ['MIG', 'TIG'].map(x => React.createElement('option', { key: x, value: x }, x))
            )
          ) : null,
          form.process.includes('CNC İşleme') ? React.createElement(Field, { label: t.f_surface_ra },
            React.createElement('select', { value: form.surfaceRa, onChange: (e) => setF('surfaceRa', e.target.value) },
              ['Ra 3.2', 'Ra 1.6', 'Ra 0.8'].map(x => React.createElement('option', { key: x, value: x }, x))
            )
          ) : null,

          React.createElement(Field, { label: t.f_repeat },
            React.createElement('select', { value: form.repeat, onChange: (e) => setF('repeat', e.target.value) },
              React.createElement('option', { value: 'one' }, t.repeat_one),
              React.createElement('option', { value: 'recurrent' }, t.repeat_recurrent)
            )
          ),
          React.createElement(Field, { label: t.f_budget },
            React.createElement('div', { className: 'row' },
              React.createElement('select', { value: form.budgetCurrency, onChange: (e) => setF('budgetCurrency', e.target.value) },
                CURRENCIES.map((c) => React.createElement('option', { key: c, value: c }, c))
              ),
              React.createElement('input', { type: 'number', min: 0, step: '0.01', value: form.budgetAmount, onChange: (e) => setF('budgetAmount', e.target.value), placeholder: t.ph_budget_amount })
            )
          ),

          React.createElement(Field, { label: t.f_address, className: 'span-3' },
            React.createElement('textarea', { value: form.address, onChange: (e) => setF('address', e.target.value), placeholder: t.ph_address_optional })
          ),
          React.createElement(Field, { label: t.f_drawing, className: 'span-3' },
            React.createElement('div', { className: 'grid', style: { gap: 10 } },
              React.createElement('div', { className: 'row' },
                React.createElement('label', { className: 'chip' },
                  React.createElement('input', { type: 'radio', name: 'drawing', checked: form.drawing === 'yes', onChange: () => setF('drawing', 'yes') }),
                  React.createElement('span', null, t.yes)
                ),
                React.createElement('label', { className: 'chip' },
                  React.createElement('input', { type: 'radio', name: 'drawing', checked: form.drawing === 'no', onChange: () => setF('drawing', 'no') }),
                  React.createElement('span', null, t.no)
                )
              ),
              form.drawing === 'yes' ? React.createElement('div', null,
                React.createElement('input', {
                  type: 'file', multiple: true,
                  accept: '.pdf,.png,.jpg,.jpeg,.dxf,.dwg,.step,.stp,.iges,.igs,application/pdf,image/png,image/jpeg,image/jpg',
                  onChange: (e) => onFilesChanged(e.target.files)
                }),
                React.createElement('div', { className: 'help', style: { marginTop: 6 } }, `Limit: ${MAX_FILES} dosya, her biri ≤ ${MAX_FILE_MB}MB`),
                files.length ? React.createElement('div', { style: { marginTop: 10 } },
                  files.map((f, i) => (
                    React.createElement('div', { key: i, className: 'row', style: { justifyContent: 'space-between' } },
                      React.createElement('div', null, `${f.name} (${(f.size/1024).toFixed(0)} KB)`),
                      React.createElement('button', { type: 'button', className: 'btn danger', onClick: () => removeFile(i) }, 'Kaldır')
                    )
                  ))
                ) : null
              ) : null
            )
          ),

          React.createElement(Field, { label: t.f_desc, className: 'span-3' },
            React.createElement('textarea', { value: form.desc, onChange: (e) => setF('desc', e.target.value), placeholder: t.ph_desc })
          ),

          
        ),

        React.createElement('div', { style: { height: 10 } }),
        React.createElement('button', { className: 'btn accent', disabled: submitting }, t.submit)
      ),
      popup ? React.createElement(Modal, { title: popup.title, onClose: () => setPopup(null) }, popup.text) : null
    )
  }

  function Admin({ t }) {
    const [list, setList] = useState([])
    const [q, setQ] = useState('')
    const [status, setStatus] = useState('all')
    const [detail, setDetail] = useState(null)

    useEffect(() => { refresh() }, [])
    async function refresh() {
      try { setList(await API.listQuotes()) } catch (e) { console.error(e) }
    }

    const filtered = useMemo(() => {
      return list.filter((it) => {
        const matchStatus = status === 'all' || it.status === status
        const text = (
          (it.name || '') + ' ' + (it.company || '') + ' ' + (it.proj || '') + ' ' + (it.material || '') + ' ' + (it.process || []).join(' ')
        ).toLowerCase()
        const matchQ = !q || text.includes(q.toLowerCase())
        return matchStatus && matchQ
      })
    }, [list, q, status])

    async function setItemStatus(id, st) { await API.updateStatus(id, st); refresh() }
    async function remove(id) { await API.remove(id); refresh() }

    function exportCSV() {
      const headers = ['id','createdAt','status','name','company','email','phone','country','city','proj','process','material','grade','thickness','qty','dims','tolerance','finish','due','repeat','budget','address','drawing','desc','files']
      const rows = list.map((it) => [ it.id, it.createdAt, it.status, it.name, it.company, it.email, it.phone, it.country, it.city, it.proj, (it.process||[]).join('|'), it.material, it.grade, it.thickness, it.qty, it.dims, it.tolerance, it.finish, it.due, it.repeat, it.budget, (it.address||'').replace(/\n/g, ' '), it.drawing, (it.desc||'').replace(/\n/g, ' '), (it.files||[]).map(f=>f.name).join('|') ])
      const csvBody = [headers.join(','), ...rows.map(r => r.map(v => '"' + String(v ?? '').replace(/"/g,'""') + '"').join(','))].join('\n')
      const csvWithBOM = '\ufeff' + csvBody
      const blob = new Blob([csvWithBOM], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = 'burkol_quotes.csv'; a.click()
      URL.revokeObjectURL(url)
    }

    // Stats
    const stats = useMemo(() => {
      const byStatus = {}
      const byProcess = {}
      const byMaterial = {}
      const byDay = {}
      for (const it of list) {
        byStatus[it.status] = (byStatus[it.status] || 0) + 1
        for (const p of it.process || []) byProcess[p] = (byProcess[p] || 0) + 1
        const m = it.material || 'Diğer'
        byMaterial[m] = (byMaterial[m] || 0) + 1
        const day = (it.createdAt || '').slice(0, 10)
        byDay[day] = (byDay[day] || 0) + 1
      }
      return { byStatus, byProcess, byMaterial, byDay }
    }, [list])

    return React.createElement('div', { className: 'container' },
      React.createElement('h1', { className: 'page-title' }, t.title_admin),
      React.createElement('p', { className: 'page-sub' }, t.sub_admin),

      React.createElement('div', { className: 'card' },
        React.createElement('label', null, t.a_filters),
        React.createElement('div', { className: 'row wrap', style: { gap: 10, marginTop: 6 } },
          React.createElement('input', { placeholder: t.a_search, value: q, onChange: (e) => setQ(e.target.value), style: { flex: 1 } }),
          React.createElement('select', { value: status, onChange: (e) => setStatus(e.target.value) },
            React.createElement('option', { value: 'all' }, t.a_all),
            React.createElement('option', { value: 'new' }, t.s_new),
            React.createElement('option', { value: 'review' }, t.s_review),
            React.createElement('option', { value: 'feasible' }, t.s_feasible),
            React.createElement('option', { value: 'not' }, t.s_not),
            React.createElement('option', { value: 'quoted' }, t.s_quoted),
          ),
          React.createElement('button', { className: 'btn', onClick: () => refresh() }, t.refresh),
          React.createElement('button', { className: 'btn', onClick: exportCSV }, t.a_export_csv)
        )
      ),

      React.createElement('div', { className: 'card', style: { marginTop: 16 } },
        React.createElement('label', null, t.a_list),
        filtered.length === 0 ? React.createElement('div', { className: 'notice' }, t.a_none) : (
          React.createElement('div', { style: { overflowX: 'auto' } },
            React.createElement('table', { className: 'table' },
              React.createElement('thead', null,
                React.createElement('tr', null,
                  React.createElement('th', null, t.th_date),
                  React.createElement('th', null, t.th_customer),
                  React.createElement('th', null, t.th_project),
                  React.createElement('th', null, t.th_material),
                  React.createElement('th', null, t.th_process),
                  React.createElement('th', null, t.th_qty),
                  React.createElement('th', null, t.th_thickness),
                  React.createElement('th', null, t.th_due),
                  React.createElement('th', null, t.a_status),
                  React.createElement('th', null, t.th_actions),
                )
              ),
              React.createElement('tbody', null,
                filtered.map((it) => (
                  React.createElement('tr', { key: it.id },
                    React.createElement('td', null, (it.createdAt||'').replace('T',' ').slice(0,16)),
                    React.createElement('td', null, (it.name || '') + (it.company ? ' — ' + it.company : '')),
                    React.createElement('td', null, it.proj || ''),
                    React.createElement('td', null, it.material || ''),
                    React.createElement('td', null, (it.process||[]).join(', ')),
                    React.createElement('td', null, String(it.qty ?? '')),
                    React.createElement('td', null, String(it.thickness ?? '')),
                    React.createElement('td', null, it.due || ''),
                    React.createElement('td', null, React.createElement('span', { className: 'status ' + (it.status === 'new' ? 'new' : it.status === 'review' ? 'review' : it.status === 'feasible' ? 'feasible' : it.status === 'quoted' ? 'quoted' : 'not') }, it.status)),
                    React.createElement('td', null,
                      React.createElement('div', { className: 'row wrap' },
                        React.createElement('button', { type: 'button', className: 'btn', onClick: (e) => { e.stopPropagation(); setDetail(it) } }, t.a_detail),
                        React.createElement('button', { type: 'button', className: 'btn', onClick: (e) => { e.stopPropagation(); setItemStatus(it.id, 'review') } }, t.s_review),
                        React.createElement('button', { type: 'button', className: 'btn', onClick: (e) => { e.stopPropagation(); setItemStatus(it.id, 'feasible') } }, t.s_feasible),
                        React.createElement('button', { type: 'button', className: 'btn', onClick: (e) => { e.stopPropagation(); setItemStatus(it.id, 'not') } }, t.s_not),
                        React.createElement('button', { type: 'button', className: 'btn', onClick: (e) => { e.stopPropagation(); setItemStatus(it.id, 'quoted') } }, t.s_quoted),
                        React.createElement('button', { type: 'button', className: 'btn', onClick: (e) => { e.stopPropagation(); API.downloadTxt(it.id, it) } }, 'TXT'),
                        React.createElement('button', { type: 'button', className: 'btn danger', onClick: (e) => { e.stopPropagation(); if (confirm(t.confirm_delete)) remove(it.id) } }, t.a_delete),
                      )
                    )
                  )
                ))
              )
            )
          )
        )
      ),

      detail ? React.createElement(DetailModal, { item: detail, onClose: () => setDetail(null), setItemStatus, t }) : null
    )
  }

  function DetailModal({ item, onClose, setItemStatus, t }) {
    const [currStatus, setCurrStatus] = React.useState(item.status)
    React.useEffect(() => { setCurrStatus(item.status) }, [item.id, item.status])
    return React.createElement('div', { style: {
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50
    }, onClick: onClose },
      React.createElement('div', { className: 'card', style: { width: 'min(680px, 96vw)', maxHeight: '85vh', overflowY: 'auto', position: 'relative', padding: 12, fontSize: 13 }, onClick: (e) => e.stopPropagation() },
        React.createElement('button', { className: 'btn', onClick: onClose, style: { position: 'absolute', top: 8, right: 8, padding: '6px 8px', fontSize: 12 } }, '×'),
        React.createElement('div', { className: 'row', style: { justifyContent: 'flex-start', marginBottom: 6 } },
          React.createElement('h3', { style: { margin: 0, fontSize: 16 } }, t.a_detail)
        ),
        React.createElement('div', { className: 'grid two', style: { gap: 8 } },
          info('ID', item.id), info(t.th_date, (item.createdAt||'').replace('T',' ').slice(0,16)), info(t.a_status, currStatus), info(t.f_name, item.name),
          info(t.f_company, item.company), info(t.f_email, item.email), info(t.f_phone, item.phone), info(t.f_country + '/' + t.f_city, `${item.country} / ${item.city}`),
          info(t.f_proj, item.proj), info(t.f_process, (item.process||[]).join(', ')), info(t.f_material, item.material), info(t.f_grade, item.grade),
          info(t.f_thickness, item.thickness + ' mm'), info(t.f_qty, item.qty), info(t.f_dims, item.dims), info(t.f_tolerance, item.tolerance),
          info(t.f_finish, item.finish), info(t.f_due, item.due), info(t.f_repeat, item.repeat === 'recurrent' ? t.repeat_recurrent : t.repeat_one), info(t.f_budget, item.budget),
          info(t.f_drawing, item.drawing), info(t.f_address, item.address), info(t.f_desc, item.desc)
        ),
        React.createElement('div', { style: { height: 10 } }),
        React.createElement('div', { className: 'row wrap' },
          React.createElement('button', { className: (currStatus === 'review' ? 'btn accent' : 'btn'), onClick: () => { setCurrStatus('review'); setItemStatus(item.id, 'review') }, style: { padding: '6px 10px', fontSize: 12 } }, t.s_review),
          React.createElement('button', { className: (currStatus === 'feasible' ? 'btn accent' : 'btn'), onClick: () => { setCurrStatus('feasible'); setItemStatus(item.id, 'feasible') }, style: { padding: '6px 10px', fontSize: 12 } }, t.s_feasible),
          React.createElement('button', { className: (currStatus === 'not' ? 'btn accent' : 'btn'), onClick: () => { setCurrStatus('not'); setItemStatus(item.id, 'not') }, style: { padding: '6px 10px', fontSize: 12 } }, t.s_not),
          React.createElement('button', { className: (currStatus === 'quoted' ? 'btn accent' : 'btn'), onClick: () => { setCurrStatus('quoted'); setItemStatus(item.id, 'quoted') }, style: { padding: '6px 10px', fontSize: 12 } }, t.s_quoted)
        ),
        React.createElement('div', { style: { height: 10 } }),
        (item.files||[]).length ? React.createElement('div', { className: 'grid two', style: { gap: 8 } },
          item.files.map((f, i) => React.createElement('div', { key: i, className: 'card', style: { padding: 10 } },
            React.createElement('div', null, `${f.name} (${(f.size/1024).toFixed(0)} KB)`),
            f.type.startsWith('image/') || ['png','jpg','jpeg'].includes((f.type||'').toLowerCase()) ? (
              React.createElement('img', { className: 'preview-img', src: f.dataUrl, alt: f.name })
            ) : React.createElement('a', { className: 'btn', href: f.dataUrl, download: f.name }, t.download)
          ))
        ) : null,
        React.createElement('div', { style: { height: 10 } }),
        React.createElement('div', { className: 'grid two', style: { gap: 8 } },
          info(t.f_tolerance_std, item.toleranceStd), info(t.f_tolerance_crit, item.toleranceCrit),
          info(t.f_bend_count, item.bendCount), info(t.f_weld_method, item.weldMethod),
          info('Ra', item.surfaceRa), info('RAL', item.finishRal),
          info('Anodize', item.anodizeType), info(t.f_qty_tiers, (item.qtyTiers||[]).join(' | '))
        )
      )
    )

    function info(k, v) {
      return React.createElement('div', { className: 'card', style: { padding: 10, fontSize: 13 } },
        React.createElement('div', { className: 'help', style: { fontSize: 11 } }, k),
        React.createElement('div', null, String(v || '—'))
      )
    }
  }

  // Simple modal
  function Modal({ title, children, onClose }) {
    const { t } = useI18n()
    return React.createElement('div', { style: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60 } },
      React.createElement('div', { className: 'card', style: { width: 'min(420px, 96vw)' } },
        React.createElement('div', { className: 'row', style: { justifyContent: 'space-between' } },
          React.createElement('h3', null, title || t.info),
          React.createElement('button', { className: 'btn', onClick: onClose }, t.a_close)
        ),
        React.createElement('div', null, children)
      )
    )
  }

  function App() {
    const route = useHashRoute()
    const { t, lang, setLang } = useI18n()
    useEffect(() => { if (!location.hash) location.hash = '#/teklif' }, [])
    return (
      React.createElement(React.Fragment, null,
        React.createElement(Nav, { route, onLang: setLang, lang, t }),
        route === '#/admin' ? React.createElement(Admin, { t }) : React.createElement(QuoteForm, { t })
      )
    )
  }

  ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(App))
})()
