// Burkol Quote/Admin (React 18) + backend API
// Separate pages: index.html (quote) and admin.html (admin)

import { useI18n, statusLabel, procLabel, materialLabel, finishLabel } from './i18n/index.js'
import API, { API_BASE } from './lib/api.js'
import { uid, downloadDataUrl, ACCEPT_EXT, MAX_FILES, MAX_FILE_MB, MAX_PRODUCT_FILES, extOf, readFileAsDataUrl, isImageExt } from './lib/utils.js'
import Field from './components/Field.js'
import Modal from './components/Modal.js'

;(function () {
  const { useState, useEffect, useMemo, useRef } = React

  // i18n moved to i18n.js

  // label helpers moved to i18n.js

  // API and utils moved to modules (api.js, utils.js)

  // Determine page type from global (set in HTML)
  const PAGE = (typeof window !== 'undefined' && window.BURKOL_APP) ? window.BURKOL_APP : 'quote'

  function Nav({ onLang, lang, t }) {
    const isAdmin = PAGE === 'admin'
    const otherHref = isAdmin ? './index.html' : './admin.html'
    const otherLabel = isAdmin ? (t.nav_quote || 'Teklif Ver') : (t.nav_admin || 'Admin')
    return (
      React.createElement('div', { className: 'nav' },
        React.createElement('div', { className: 'nav-inner container' },
          React.createElement('div', { className: 'brand' },
            React.createElement('div', { className: 'dot' }),
            React.createElement('a', { href: isAdmin ? './panel-gizli.html' : './index.html' }, 'BURKOL')
          ),
          React.createElement('div', { className: 'row wrap' },
            React.createElement('div', { className: 'tabs' },
              // Link to other page removed for production
              // React.createElement('a', { href: otherHref, className: 'tab' }, otherLabel)
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

  // Field moved to components/Field.js

  function QuoteForm({ t }) {
    const [submitting, setSubmitting] = useState(false)
    const [message, setMessage] = useState('')
    const [popup, setPopup] = useState(null)
    const [errors, setErrors] = useState({})
    const [files, setFiles] = useState([]) // {name, type, size, dataUrl}
    const [prodFiles, setProdFiles] = useState([]) // product images
    // Stepper state
    const [step, setStep] = useState(0)
    const [furthest, setFurthest] = useState(0)
    const [missingHighlight, setMissingHighlight] = useState(new Set())
    const stepRefs = useRef([])
    function stepRef(ix) { return (el) => { if (el) stepRefs.current[ix] = el } }
    useEffect(() => {
      const el = stepRefs.current[step]
      if (el && typeof el.focus === 'function') {
        // Small delay to ensure element is in DOM
        setTimeout(() => { try { el.focus() } catch {} }, 0)
      }
    }, [step])

    const [form, setForm] = useState({
      name: '', company: '', email: '', phone: '', phoneCode: '+90', phoneLocal: '', country: 'TR', city: '',
      proj: '', process: [], material: '', grade: '', thickness: '', qty: '',
      dims: '', dimsL: '', dimsW: '', dimsH: '', tolerance: '', toleranceStd: 'ISO 2768-m', toleranceCrit: '', finish: '', finishRal: '', anodizeType: '', due: '', repeat: 'one', budget: '', budgetCurrency: 'TRY', budgetAmount: '', address: '',
      drawing: 'no', productPics: 'no', desc: '', bendCount: '', weldMethod: '', surfaceRa: '', qtyT1: '', qtyT2: '', qtyT3: ''
    })

    function setF(k, v) { setForm((s) => ({ ...s, [k]: v })) }

    // Input helpers to constrain values
    function sanitizeInteger(val) {
      const s = String(val ?? '').replace(/\D/g, '')
      return s
    }
    function sanitizeNumber(val) {
      let s = String(val ?? '').replace(/[^\d\.]/g, '')
      const parts = s.split('.')
      if (parts.length > 2) s = parts[0] + '.' + parts.slice(1).join('')
      return s
    }
    function setInt(k, val) { setF(k, sanitizeInteger(val)) }
    function setNum(k, val) { setF(k, sanitizeNumber(val)) }
    function setPhoneLocal(val) {
      let digits = sanitizeInteger(val)
      const isTR = form.country === 'TR' || form.phoneCode === '+90'
      if (isTR) digits = digits.slice(0, 10)
      setF('phoneLocal', digits)
    }

    function validate() {
      const e = {}
      // Requireds
      if (!form.name.trim()) e.name = t.required
      if (!form.email.trim()) e.email = t.required
      if (!form.phoneLocal.trim()) e.phone = t.required
      if (!form.proj.trim()) e.proj = t.required
      if (!form.city.trim()) e.city = t.required
      if (!form.material.trim()) e.material = t.required
      if (!form.qty && !form.qtyT1 && !form.qtyT2 && !form.qtyT3) e.qty = t.required
      if (!form.thickness) e.thickness = t.required

      // Email format
      if (form.email && !/^\S+@\S+\.\S+$/.test(form.email)) e.email = t.invalid_email

      // Phone: digits only; TR must be 10 digits
      if (form.phoneLocal && /\D/.test(form.phoneLocal)) e.phone = t.invalid_phone
      const isTR = form.country === 'TR' || form.phoneCode === '+90'
      if (isTR && form.phoneLocal && form.phoneLocal.replace(/\D/g, '').length !== 10) e.phone = t.phone_tr_len

      // Numbers: thickness positive number
      if (form.thickness !== '' && Number(form.thickness) <= 0) e.thickness = t.must_be_positive
      // Qty and tiers: integers > 0 when provided
      const intFields = [
        ['qty', form.qty], ['qtyT1', form.qtyT1], ['qtyT2', form.qtyT2], ['qtyT3', form.qtyT3], ['bendCount', form.bendCount]
      ]
      for (const [k, v] of intFields) {
        if (v !== '' && v != null) {
          if (!/^\d+$/.test(String(v))) e[k] = t.integer_required
          else if (Number(v) <= 0) e[k] = t.must_be_positive
        }
      }
      // Dimensions: numeric >= 0 when provided
      const numFields = [ ['dimsL', form.dimsL], ['dimsW', form.dimsW], ['dimsH', form.dimsH] ]
      for (const [k, v] of numFields) {
        if (v !== '' && v != null) {
          if (!/^\d*(?:\.\d+)?$/.test(String(v))) e[k] = t.only_numbers
          else if (Number(v) < 0) e[k] = t.must_be_positive
        }
      }
      // Budget amount: number >= 0
      if (form.budgetAmount !== '' && form.budgetAmount != null) {
        if (!/^\d*(?:\.\d+)?$/.test(String(form.budgetAmount))) e.budgetAmount = t.only_numbers
      }
      // RAL code when powder coat
      if (form.finish === 'Toz Boya' && form.finishRal) {
        if (!/^RAL\s*\d{3,4}$/i.test(form.finishRal.trim())) e.finishRal = t.invalid_ral
      }
      // Due date basic validity
      if (form.due) {
        const d = new Date(form.due)
        if (isNaN(d.getTime())) e.due = t.invalid_date
      }
      return e
    }

    // Step definitions and required keys per step
    const steps = [
      { id: 'name', label: t.f_name, required: ['name'], fields: ['name'] },
      { id: 'company', label: t.f_company, required: [], fields: ['company'] },
      { id: 'email', label: t.f_email, required: ['email'], fields: ['email'] },
      // phone is validated via errors.phone; use phoneLocal for field presence
      { id: 'phone', label: t.f_phone, required: ['phone'], fields: ['phoneLocal'] },
      { id: 'countryCity', label: t.f_country + ' / ' + t.f_city, required: ['country','city'], fields: ['country','city'] },
      { id: 'proj', label: t.f_proj, required: ['proj'], fields: ['proj'] },
      { id: 'process', label: t.f_process, required: [], fields: ['process'] },
      { id: 'material', label: t.f_material, required: ['material'], fields: ['material'] },
      { id: 'grade', label: t.f_grade, required: [], fields: ['grade'] },
      { id: 'thickness', label: t.f_thickness, required: ['thickness'], fields: ['thickness'] },
      { id: 'qty', label: t.f_qty, required: ['qty'], fields: ['qty','qtyT1','qtyT2','qtyT3'] },
      { id: 'dims', label: t.f_dims, required: [], fields: ['dimsL','dimsW','dimsH'] },
      { id: 'tolStd', label: t.f_tolerance_std, required: [], fields: ['toleranceStd'] },
      { id: 'tolCrit', label: t.f_tolerance_crit, required: [], fields: ['toleranceCrit'] },
      { id: 'finish', label: t.f_finish, required: [], fields: ['finish','finishRal','anodizeType'] },
      { id: 'due', label: t.f_due, required: [], fields: ['due'] },
      { id: 'repeat', label: t.f_repeat, required: [], fields: ['repeat'] },
      { id: 'budget', label: t.f_budget, required: [], fields: ['budgetAmount','budgetCurrency'] },
      { id: 'address', label: t.f_address, required: [], fields: ['address'] },
      { id: 'drawing', label: t.f_drawing, required: [], fields: ['drawing','files'] },
      { id: 'prodImages', label: t.f_prodimg, required: [], fields: ['productPics','productImages'] },
      { id: 'desc', label: t.f_desc, required: [], fields: ['desc'] },
    ]

    function stepHasErrors(ix) {
      const all = validate()
      const req = steps[ix].required
      for (const k of req) { if (all[k]) return true }
      const fields = steps[ix].fields || []
      for (const k of fields) { if (all[k]) return true }
      return false
    }

    function goNext() {
      if (stepHasErrors(step)) { setMessage(t.fill_required); return }
      const ns = Math.min(step + 1, steps.length - 1)
      setStep(ns)
      setFurthest((f) => Math.max(f, ns))
      setMessage('')
      // Recompute highlights if active
      if (missingHighlight.size) setMissingHighlight(computeMissing())
    }

    function goBack() {
      setStep((s) => Math.max(0, s - 1))
      setMessage('')
    }

    function resumeProgress() {
      setStep(furthest)
      setMessage('')
    }

    function isEmptyField(k, v) {
      if (Array.isArray(v)) return v.length === 0
      return v == null || String(v).trim() === ''
    }
    function computeMissing() {
      const set = new Set()
      const errs = validate()
      for (let i = 0; i < steps.length; i++) {
        const req = steps[i].required || []
        const flds = steps[i].fields || []
        if (req.length) {
          // For required steps, only highlight if there is an error on required keys
          if (req.some((k) => errs[k])) set.add(i)
        } else {
          // For optional steps, highlight if fields are empty (user skipped)
          if (flds.some((k) => isEmptyField(k, k === 'files' ? files : (k === 'productImages' ? prodFiles : form[k])))) set.add(i)
        }
      }
      return set
    }
    useEffect(() => {
      if (missingHighlight.size) setMissingHighlight(computeMissing())
    }, [form, files])

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

    async function onProdFilesChanged(fileList) {
      const arr = Array.from(fileList)
      const combined = prodFiles.concat(arr)
      if (combined.length > MAX_PRODUCT_FILES) { setMessage(`Max ${MAX_PRODUCT_FILES} images`); return }
      const parsed = []
      for (const f of arr) {
        const sizeMb = f.size / (1024 * 1024)
        if (sizeMb > MAX_FILE_MB) { setMessage(t.file_too_big); continue }
        const ext = extOf(f.name)
        if (!isImageExt(ext) && !isImageExt(f.type)) { setMessage(t.file_type_bad); continue }
        const dataUrl = await readFileAsDataUrl(f)
        parsed.push({ name: f.name, type: f.type || ext, size: f.size, dataUrl })
      }
      setProdFiles((prev) => prev.concat(parsed).slice(0, MAX_PRODUCT_FILES))
    }

    function removeProdFile(ix) { setProdFiles((prev) => prev.filter((_, i) => i !== ix)) }

    async function actualSubmit() {
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
          productImages: prodFiles,
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
        setProdFiles([])
        setErrors({})
        setStep(0)
        setFurthest(0)
        setMissingHighlight(new Set())
      } catch (err) {
        console.error(err)
        setMessage('Kaydedilemedi. Sunucuya erişilemiyor olabilir.')
      } finally {
        setSubmitting(false)
      }
    }

    function preSubmit() {
      const eMap = validate()
      setErrors(eMap)
      if (Object.keys(eMap).length) { setMessage(t.fill_required); return }
      const content = React.createElement('div', null,
        React.createElement('p', null, t.confirm_optional_text || 'Tüm zorunlu alanları doldurdunuz. Ek detayları doldurmak istemediğinizden emin misiniz?'),
        React.createElement('div', { className: 'row', style: { justifyContent: 'flex-end', gap: 8 } },
          React.createElement('button', { className: 'btn', onClick: () => { setPopup(null); setMissingHighlight(computeMissing()); resumeProgress() } }, t.btn_continue || 'Devam Et'),
          React.createElement('button', { className: 'btn accent', onClick: async () => { setPopup(null); await actualSubmit() } }, t.btn_submit || t.submit)
        )
      )
      setPopup({ title: t.confirm_optional_title || t.info, text: content })
    }

    function handleFormKeyDown(e) {
      if (e.key === 'Enter') {
        const tag = (e.target && e.target.tagName || '').toLowerCase()
        if (tag === 'textarea') return
        e.preventDefault()
        if (step < steps.length - 1) {
          goNext()
        } else {
          preSubmit()
        }
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

      // Stepper sandwich: completed (top), current (middle), remaining (bottom)
      (furthest > 0 ? React.createElement('div', { className: 'card', style: { marginBottom: 12 } },
        steps.slice(0, step).map((st, ix) => (
          React.createElement('div', {
            key: st.id,
            onClick: () => setStep(ix),
            style: { cursor: 'pointer', padding: '4px 0', opacity: 0.5, paddingLeft: 8, background: missingHighlight.has(ix) ? 'rgba(255,193,7,0.25)' : 'transparent' }
          }, `${ix + 1}. ${st.label}`)
        ))
      ) : null),

      React.createElement('form', { onSubmit: (e) => { e.preventDefault(); preSubmit() }, onKeyDown: handleFormKeyDown },
        React.createElement('div', { className: 'grid three' },
          step === 0 ? React.createElement(Field, { label: t.f_name },
            React.createElement('input', {
              ref: stepRef(0), value: form.name, onChange: (e) => setF('name', e.target.value), placeholder: t.ph_name,
            }), errors.name ? React.createElement('div', { className: 'help' }, errors.name) : null
          ) : null,
          step === 1 ? React.createElement(Field, { label: t.f_company },
            React.createElement('input', { ref: stepRef(1), value: form.company, onChange: (e) => setF('company', e.target.value), placeholder: t.ph_company })
          ) : null,

          step === 2 ? React.createElement(Field, { label: t.f_email },
            React.createElement('input', { ref: stepRef(2), type: 'email', value: form.email, onChange: (e) => setF('email', e.target.value), placeholder: t.ph_email }),
            errors.email ? React.createElement('div', { className: 'help' }, errors.email) : null
          ) : null,
          step === 3 ? React.createElement(Field, { label: t.f_phone },
            React.createElement('div', { className: 'row' },
              React.createElement('select', {
                value: form.phoneCode,
                onChange: (e) => setForm((s) => ({ ...s, phoneCode: e.target.value }))
              },
                COUNTRY_OPTIONS.map(c => React.createElement('option', { key: c.code, value: c.dial || '' }, `${c.name} ${c.dial}`))
              ),
              React.createElement('input', { ref: stepRef(3), value: form.phoneLocal, onChange: (e) => setPhoneLocal(e.target.value), placeholder: t.ph_phone_local, inputMode: 'numeric' })
            ),
            errors.phone ? React.createElement('div', { className: 'help' }, errors.phone) : null
          ) : null,

          step === 4 ? React.createElement(Field, { label: t.f_country },
            React.createElement('select', { ref: stepRef(4), value: form.country, onChange: (e) => {
              const newCountry = e.target.value
              const found = COUNTRY_OPTIONS.find(c => c.code === newCountry)
              setForm((s) => ({ ...s, country: newCountry, phoneCode: found && found.dial ? found.dial : s.phoneCode, city: '' }))
            } },
              COUNTRY_OPTIONS.map(c => React.createElement('option', { key: c.code, value: c.code }, c.name))
            )
          ) : null,
          step === 4 ? React.createElement(Field, { label: t.f_city },
            form.country === 'TR' ? (
              React.createElement('select', { ref: stepRef(5), value: form.city, onChange: (e) => setF('city', e.target.value) },
                React.createElement('option', { value: '' }, t.select),
                TR_CITIES.map(c => React.createElement('option', { key: c, value: c }, c))
              )
            ) : (
              React.createElement('input', { ref: stepRef(5), value: form.city, onChange: (e) => setF('city', e.target.value), placeholder: t.ph_city })
            )
          ) : null,

          step === 5 ? React.createElement(Field, { label: t.f_proj },
            React.createElement('input', { ref: stepRef(6), value: form.proj, onChange: (e) => setF('proj', e.target.value), placeholder: t.ph_proj }),
            errors.proj ? React.createElement('div', { className: 'help' }, errors.proj) : null
          ) : null,
          step === 6 ? React.createElement(Field, { label: t.f_process, className: 'span-3' },
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
          ) : null,

          step === 7 ? React.createElement(Field, { label: t.f_material },
            React.createElement('select', { ref: stepRef(7), value: form.material, onChange: (e) => { const v=e.target.value; setForm(s=>({ ...s, material: v, thickness: '' })) } },
              React.createElement('option', { value: '' }, t.select),
              materialOptions.map((m) => React.createElement('option', { key: m, value: m }, materialLabel(m, t)))
            ),
            errors.material ? React.createElement('div', { className: 'help' }, errors.material) : null
          ) : null,
          step === 8 ? React.createElement(Field, { label: t.f_grade },
            React.createElement('input', { ref: stepRef(8), value: form.grade, onChange: (e) => setF('grade', e.target.value), placeholder: t.ph_grade })
          ) : null,

          step === 9 ? React.createElement(Field, { label: t.f_thickness },
            React.createElement('div', { className: 'tile-grid' },
              (thicknessMap[form.material] || []).map((mm) => (
                React.createElement('div', { key: mm, className: 'tile ' + (Number(form.thickness) === mm ? 'active' : ''), onClick: () => setF('thickness', mm) }, `${mm} mm`)
              )),
              React.createElement('div', { className: 'tile ' + (!(thicknessMap[form.material]||[]).length ? 'active' : ''), onClick: () => {} }, 'Diğer')
            ),
            React.createElement('div', { className: 'row', style: { marginTop: 8 } },
              React.createElement('input', { ref: stepRef(9), type: 'text', inputMode: 'decimal', value: form.thickness, onChange: (e) => setNum('thickness', e.target.value), placeholder: t.ph_thickness })
            ),
            errors.thickness ? React.createElement('div', { className: 'help' }, errors.thickness) : null
          ) : null,
          step === 10 ? React.createElement(Field, { label: t.f_qty },
            React.createElement('input', { ref: stepRef(10), type: 'text', inputMode: 'numeric', value: form.qty, onChange: (e) => setInt('qty', e.target.value), placeholder: t.ph_qty }),
            errors.qty ? React.createElement('div', { className: 'help' }, errors.qty) : null
          ) : null,
          step === 10 ? React.createElement(Field, { label: t.f_qty_tiers },
            React.createElement('div', { className: 'row' },
              React.createElement('input', { type: 'text', inputMode: 'numeric', value: form.qtyT1, onChange: (e) => setInt('qtyT1', e.target.value), placeholder: t.ph_qty_t1 }),
              React.createElement('input', { type: 'text', inputMode: 'numeric', value: form.qtyT2, onChange: (e) => setInt('qtyT2', e.target.value), placeholder: t.ph_qty_t2 }),
              React.createElement('input', { type: 'text', inputMode: 'numeric', value: form.qtyT3, onChange: (e) => setInt('qtyT3', e.target.value), placeholder: t.ph_qty_t3 })
            )
          ) : null,

          step === 11 ? React.createElement(Field, { label: t.f_dims },
            React.createElement('div', { className: 'dims-row' },
              React.createElement('input', { ref: stepRef(11), type: 'text', inputMode: 'decimal', value: form.dimsL, onChange: (e) => setNum('dimsL', e.target.value), placeholder: 'L' }),
              React.createElement('span', { className: 'x' }, 'x'),
              React.createElement('input', { type: 'text', inputMode: 'decimal', value: form.dimsW, onChange: (e) => setNum('dimsW', e.target.value), placeholder: 'W' }),
              React.createElement('span', { className: 'x' }, 'x'),
              React.createElement('input', { type: 'text', inputMode: 'decimal', value: form.dimsH, onChange: (e) => setNum('dimsH', e.target.value), placeholder: 'H' })
            ),
            (errors.dimsL || errors.dimsW || errors.dimsH) ? React.createElement('div', { className: 'help' }, errors.dimsL || errors.dimsW || errors.dimsH) : null
          ) : null,
          step === 12 ? React.createElement(Field, { label: t.f_tolerance_std },
            React.createElement('select', { ref: stepRef(12), value: form.toleranceStd, onChange: (e) => setF('toleranceStd', e.target.value) },
              ['ISO 2768-f', 'ISO 2768-m', 'ISO 2768-c'].map((opt) => React.createElement('option', { key: opt, value: opt }, opt))
            )
          ) : null,
          step === 13 ? React.createElement(Field, { label: t.f_tolerance_crit },
            React.createElement('input', { ref: stepRef(13), value: form.toleranceCrit, onChange: (e) => setF('toleranceCrit', e.target.value), placeholder: t.ph_tolcrit })
          ) : null,

          step === 14 ? React.createElement(Field, { label: t.f_finish },
            React.createElement('select', { ref: stepRef(14), value: form.finish, onChange: (e) => setF('finish', e.target.value) },
              React.createElement('option', { value: '' }, t.select),
              finishOptions.map((m) => React.createElement('option', { key: m, value: m }, finishLabel(m, t)))
            ),
            form.finish === 'Toz Boya' ? React.createElement('div', { className: 'row', style: { marginTop: 6 } },
              React.createElement('input', { value: form.finishRal, onChange: (e) => setF('finishRal', e.target.value), placeholder: t.ph_finish_ral }),
              errors.finishRal ? React.createElement('div', { className: 'help' }, errors.finishRal) : null
            ) : null,
            form.finish === 'Anodize' ? React.createElement('div', { className: 'row', style: { marginTop: 6 } },
              React.createElement('select', { value: form.anodizeType, onChange: (e) => setF('anodizeType', e.target.value) },
                ['Clear', 'Black', 'Colored'].map((x) => React.createElement('option', { key: x, value: x }, x === 'Clear' ? t.anodize_clear : x === 'Black' ? t.anodize_black : t.anodize_colored))
              )
            ) : null
          ) : null,
          step === 15 ? React.createElement(Field, { label: t.f_due },
            React.createElement('input', { ref: stepRef(15), type: 'date', value: form.due, onChange: (e) => setF('due', e.target.value) })
          ) : null,

          // Process-specific minimal fields
          step === 14 && form.process.includes('Abkant Büküm') ? React.createElement(Field, { label: t.f_bend_count },
            React.createElement('input', { type: 'text', inputMode: 'numeric', value: form.bendCount, onChange: (e) => setInt('bendCount', e.target.value), placeholder: t.ph_bend_count })
          ) : null,
          step === 14 && form.process.includes('Kaynak') ? React.createElement(Field, { label: t.f_weld_method },
            React.createElement('select', { value: form.weldMethod, onChange: (e) => setF('weldMethod', e.target.value) },
              ['MIG', 'TIG'].map(x => React.createElement('option', { key: x, value: x }, x))
            )
          ) : null,
          step === 14 && form.process.includes('CNC İşleme') ? React.createElement(Field, { label: t.f_surface_ra },
            React.createElement('select', { value: form.surfaceRa, onChange: (e) => setF('surfaceRa', e.target.value) },
              ['Ra 3.2', 'Ra 1.6', 'Ra 0.8'].map(x => React.createElement('option', { key: x, value: x }, x))
            )
          ) : null,

          step === 16 ? React.createElement(Field, { label: t.f_repeat },
            React.createElement('select', { ref: stepRef(16), value: form.repeat, onChange: (e) => setF('repeat', e.target.value) },
              React.createElement('option', { value: 'one' }, t.repeat_one),
              React.createElement('option', { value: 'recurrent' }, t.repeat_recurrent)
            )
          ) : null,
          step === 17 ? React.createElement(Field, { label: t.f_budget },
            React.createElement('div', { className: 'row' },
              React.createElement('select', { value: form.budgetCurrency, onChange: (e) => setF('budgetCurrency', e.target.value) },
                CURRENCIES.map((c) => React.createElement('option', { key: c, value: c }, c))
              ),
              React.createElement('input', { ref: stepRef(17), type: 'text', inputMode: 'decimal', value: form.budgetAmount, onChange: (e) => setNum('budgetAmount', e.target.value), placeholder: t.ph_budget_amount })
            ),
            errors.budgetAmount ? React.createElement('div', { className: 'help' }, errors.budgetAmount) : null
          ) : null,

          step === 18 ? React.createElement(Field, { label: t.f_address, className: 'span-3' },
            React.createElement('textarea', { ref: stepRef(18), value: form.address, onChange: (e) => setF('address', e.target.value), placeholder: t.ph_address_optional })
          ) : null,
          step === 19 ? React.createElement(Field, { label: t.f_drawing, className: 'span-3' },
            React.createElement('div', { className: 'grid', style: { gap: 10 } },
              React.createElement('div', { className: 'row' },
                React.createElement('label', { className: 'chip' },
                  React.createElement('input', { ref: stepRef(19), type: 'radio', name: 'drawing', checked: form.drawing === 'yes', onChange: () => setF('drawing', 'yes') }),
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
          ) : null,

          step === 20 ? React.createElement(Field, { label: t.f_prodimg, className: 'span-3' },
            React.createElement('div', { className: 'grid', style: { gap: 10 } },
              React.createElement('div', { className: 'row' },
                React.createElement('label', { className: 'chip' },
                  React.createElement('input', { type: 'radio', name: 'productPics', checked: form.productPics === 'yes', onChange: () => setF('productPics', 'yes') }),
                  React.createElement('span', null, t.yes)
                ),
                React.createElement('label', { className: 'chip' },
                  React.createElement('input', { type: 'radio', name: 'productPics', checked: form.productPics === 'no', onChange: () => setF('productPics', 'no') }),
                  React.createElement('span', null, t.no)
                )
              ),
              form.productPics === 'yes' ? React.createElement('div', null,
                React.createElement('input', {
                  type: 'file', multiple: true,
                  accept: '.png,.jpg,.jpeg,image/png,image/jpeg,image/jpg',
                  onChange: (e) => onProdFilesChanged(e.target.files)
                }),
                React.createElement('div', { className: 'help', style: { marginTop: 6 } }, `${t.f_prod_upload}. Limit: ${MAX_PRODUCT_FILES}, her biri ≤ ${MAX_FILE_MB}MB`),
                prodFiles.length ? React.createElement('div', { style: { marginTop: 10 } },
                  prodFiles.map((f, i) => (
                    React.createElement('div', { key: i, className: 'row', style: { justifyContent: 'space-between' } },
                      React.createElement('div', null, `${f.name} (${(f.size/1024).toFixed(0)} KB)`),
                      React.createElement('button', { type: 'button', className: 'btn danger', onClick: () => removeProdFile(i) }, 'Kaldır')
                    )
                  ))
                ) : null
              ) : null
            )
          ) : null,

          step === 21 ? React.createElement(Field, { label: t.f_desc, className: 'span-3' },
            React.createElement('textarea', { ref: stepRef(21), value: form.desc, onChange: (e) => setF('desc', e.target.value), placeholder: t.ph_desc })
          ) : null,

          
        ),

        React.createElement('div', { className: 'row', style: { justifyContent: 'space-between', marginTop: 10 } },
          React.createElement('div', { className: 'row' },
            React.createElement('button', { type: 'button', className: 'btn', onClick: goBack, disabled: step === 0 }, t.back),
            (step < furthest ? React.createElement('button', { type: 'button', className: 'btn accent', onClick: resumeProgress, style: { marginLeft: 6 } }, t.resume) : null)
          ),
          React.createElement('div', { className: 'row' },
            step < steps.length - 1 ? React.createElement('button', { type: 'button', className: 'btn accent', onClick: goNext }, t.next) : null,
            React.createElement('button', { type: 'button', className: 'btn accent', onClick: preSubmit, disabled: submitting || Object.keys(validate()).length > 0 }, t.submit)
          )
        )
      ),

      (steps.length > step + 1 ? React.createElement('div', { className: 'card', style: { marginTop: 12 } },
        steps.slice(step + 1).map((st, off) => {
          const ix = step + 1 + off
          return React.createElement('div', {
            key: st.id,
            onClick: () => setStep(ix),
            style: { cursor: 'pointer', padding: '4px 0', opacity: 0.5, paddingLeft: 8, background: missingHighlight.has(ix) ? 'rgba(255,193,7,0.25)' : 'transparent' }
          }, `${ix + 1}. ${st.label}`)
        })
      ) : null),
      popup ? React.createElement(Modal, { title: popup.title, onClose: () => setPopup(null) }, popup.text) : null
    )
  }

  function Admin({ t, onLogout }) {
    const [list, setList] = useState([])
    const [detail, setDetail] = useState(null)
    const [creating, setCreating] = useState(false)
    const [selected, setSelected] = useState(new Set())

    useEffect(() => { refresh() }, [])
    async function refresh() {
      try { setList(await API.listQuotes()) } catch (e) { console.error(e) }
    }

    async function handleLogout() {
      try {
        await API.logout()
        onLogout()
      } catch (e) {
        console.error('Logout error:', e)
        // Even if logout fails on server, clear local session
        onLogout()
      }
    }

    const filtered = useMemo(() => {
      // Sort by createdAt descending (newest first), then by id as fallback
      return [...list].sort((a, b) => {
        const dateA = new Date(a.createdAt || 0).getTime()
        const dateB = new Date(b.createdAt || 0).getTime()
        if (dateB !== dateA) return dateB - dateA
        return (b.id || '').localeCompare(a.id || '')
      })
    }, [list])

    async function setItemStatus(id, st) { await API.updateStatus(id, st); refresh() }
    async function remove(id) { await API.remove(id); refresh() }
    function toggleOne(id, checked) {
      setSelected((prev) => {
        const n = new Set(prev)
        if (checked) n.add(id); else n.delete(id)
        return n
      })
    }
    function toggleAll(e) {
      const checked = e.target.checked
      if (checked) {
        setSelected(new Set(filtered.map(it => it.id)))
      } else {
        setSelected(new Set())
      }
    }
    async function bulkDelete() {
      if (!selected.size) return
      if (!confirm(t.confirm_delete)) return
      for (const id of Array.from(selected)) {
        await API.remove(id)
      }
      setSelected(new Set())
      refresh()
    }

    function exportCSV() {
      const headers = ['id','createdAt','status','name','company','email','phone','country','city','proj','process','material','grade','thickness','qty','dims','tolerance','finish','due','daysToDue','estPrice','estLead','repeat','budget','address','drawing','productPics','desc','files','productImages']
      const rows = list.map((it) => {
        const daysToDue = (it.status === 'approved' && it.due) ? Math.ceil((new Date(it.due).getTime() - Date.now()) / (1000*60*60*24)) : ''
        const estPrice = '₺ 16'
        const estLead = '16'
        return [ it.id, it.createdAt, statusLabel(it.status, t), it.name, it.company, it.email, it.phone, it.country, it.city, it.proj, (it.process||[]).join('|'), it.material, it.grade, it.thickness, it.qty, it.dims, it.tolerance, it.finish, it.due, daysToDue, estPrice, estLead, it.repeat, it.budget, (it.address||'').replace(/\n/g, ' '), it.drawing, it.productPics, (it.desc||'').replace(/\n/g, ' '), (it.files||[]).map(f=>f.name).join('|'), (it.productImages||[]).map(f=>f.name).join('|') ]
      })
      const csvBody = [headers.join(','), ...rows.map(r => r.map(v => '"' + String(v ?? '').replace(/"/g,'""') + '"').join(','))].join('\n')
      const csvWithBOM = '\ufeff' + csvBody
      const blob = new Blob([csvWithBOM], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = 'burkol_quotes.csv'; a.click()
      URL.revokeObjectURL(url)
    }

    // Stats
    const statsAll = useMemo(() => {
      const src = list
      const byStatus = {}
      const byProcess = {}
      const byMaterial = {}
      const byDay = {}
      for (const it of src) {
        const status = statusLabel(it.status, t)
        byStatus[status] = (byStatus[status] || 0) + 1
        for (const p of it.process || []) {
          const proc = procLabel(p, t)
          byProcess[proc] = (byProcess[proc] || 0) + 1
        }
        const m = materialLabel(it.material || 'Other', t)
        byMaterial[m] = (byMaterial[m] || 0) + 1
        const day = (it.createdAt || '').slice(0, 10)
        byDay[day] = (byDay[day] || 0) + 1
      }
      return { byStatus, byProcess, byMaterial, byDay }
    }, [list, t])

    function metricLabel() { return t.metric_count }

    function sortEntriesGeneric(obj, byKeyAlpha) {
      const entries = Object.entries(obj || {})
      if (byKeyAlpha) return entries.sort((a,b) => a[0].localeCompare(b[0]))
      return entries.sort((a,b) => b[1]-a[1])
    }

    function BarChart({ data, xLabel, yLabel, byKeyAlpha }) {
      const entries = sortEntriesGeneric(data, byKeyAlpha)
      if (!entries.length) return React.createElement('div', { className: 'help' }, t.empty_data)
      const w = 420, h = 200, ml = 46, mr = 8, mt = 8, mb = 34
      const cw = w - ml - mr, ch = h - mt - mb
      const max = Math.max(1, ...entries.map(e => e[1]))
      const barW = cw / entries.length * 0.7
      const xStep = cw / entries.length
      return React.createElement('svg', { width: '100%', viewBox: `0 0 ${w} ${h}` },
        // axes
        React.createElement('line', { x1: ml, y1: h - mb, x2: w - mr, y2: h - mb, stroke: '#999' }),
        React.createElement('line', { x1: ml, y1: mt, x2: ml, y2: h - mb, stroke: '#999' }),
        // y ticks
        [0, 0.25, 0.5, 0.75, 1].map((tck, i) => {
          const y = h - mb - tck * ch
          const val = Math.round(tck * max)
          return React.createElement(React.Fragment, { key: i },
            React.createElement('line', { x1: ml, y1: y, x2: w - mr, y2: y, stroke: '#eee' }),
            React.createElement('text', { x: ml - 8, y: y + 4, fontSize: 10, textAnchor: 'end', fill: '#666' }, String(val))
          )
        }),
        // bars + x labels
        entries.map(([k, v], i) => {
          const x = ml + i * xStep + (xStep - barW) / 2
          const bh = (v / max) * ch
          const y = h - mb - bh
          return React.createElement(React.Fragment, { key: k },
            React.createElement('rect', { x, y, width: barW, height: bh, fill: '#0a84ff', rx: 3 }),
            React.createElement('text', { x: ml + i * xStep + xStep / 2, y: h - mb + 14, fontSize: 10, textAnchor: 'middle', fill: '#444' }, k)
          )
        }),
        // axis titles
        React.createElement('text', { x: ml + cw / 2, y: h - 6, fontSize: 12, textAnchor: 'middle', fill: '#fff' }, xLabel || ''),
        React.createElement('text', { x: 12, y: mt + ch / 2, fontSize: 12, textAnchor: 'middle', fill: '#fff', transform: `rotate(-90 12 ${mt + ch / 2})` }, yLabel || metricLabel())
      )
    }

    function LineChart({ data, xLabel, yLabel, byKeyAlpha }) {
      const entries = sortEntriesGeneric(data, byKeyAlpha)
      const w = 520, h = 240, ml = 50, mr = 10, mt = 10, mb = 40
      const cw = w - ml - mr, ch = h - mt - mb
      const max = Math.max(1, ...entries.map(e => e[1]))
      if (!entries.length) return React.createElement('div', { className: 'help' }, t.empty_data)
      const pts = entries.map((e, i) => {
        const x = ml + (i * cw) / Math.max(1, entries.length - 1)
        const y = h - mb - (e[1] / max) * ch
        return `${x},${y}`
      }).join(' ')
      return React.createElement('svg', { width: '100%', viewBox: `0 0 ${w} ${h}` },
        // axes
        React.createElement('line', { x1: ml, y1: h - mb, x2: w - mr, y2: h - mb, stroke: '#999' }),
        React.createElement('line', { x1: ml, y1: mt, x2: ml, y2: h - mb, stroke: '#999' }),
        // y ticks
        [0, 0.25, 0.5, 0.75, 1].map((tck, i) => {
          const y = h - mb - tck * ch
          const val = Math.round(tck * max)
          return React.createElement(React.Fragment, { key: i },
            React.createElement('line', { x1: ml, y1: y, x2: w - mr, y2: y, stroke: '#eee' }),
            React.createElement('text', { x: ml - 8, y: y + 4, fontSize: 10, textAnchor: 'end', fill: '#666' }, String(val))
          )
        }),
        // x labels
        entries.map((e, i) => React.createElement('text', { key: i, x: ml + (i * cw) / Math.max(1, entries.length - 1), y: h - mb + 14, fontSize: 10, textAnchor: 'middle', fill: '#444' }, e[0])),
        // line
        React.createElement('polyline', { fill: 'none', stroke: '#0a84ff', strokeWidth: 2, points: pts }),
        // axis titles
        React.createElement('text', { x: ml + cw / 2, y: h - 6, fontSize: 12, textAnchor: 'middle', fill: '#333' }, xLabel || ''),
        React.createElement('text', { x: 12, y: mt + ch / 2, fontSize: 12, textAnchor: 'middle', fill: '#333', transform: `rotate(-90 12 ${mt + ch / 2})` }, yLabel || metricLabel())
      )
    }

    return React.createElement('div', { className: 'container' },
      React.createElement('div', { className: 'row', style: { justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 } },
        React.createElement('div', null,
          React.createElement('h1', { className: 'page-title', style: { margin: 0 } }, t.title_admin),
          React.createElement('p', { className: 'page-sub', style: { margin: 0 } }, t.sub_admin)
        ),
        React.createElement('button', { 
          onClick: handleLogout, 
          className: 'btn', 
          style: { 
            backgroundColor: '#ff3b30', 
            color: 'white', 
            border: 'none',
            padding: '8px 16px',
            borderRadius: '6px',
            cursor: 'pointer'
          } 
        }, t.logout_btn || 'Çıkış Yap')
      ),
      // Default multi-charts (unfiltered)
      React.createElement('div', { className: 'card', style: { marginBottom: 12 } },
        React.createElement('label', null, t.a_charts),
        React.createElement('div', { className: 'row wrap', style: { gap: 12, marginTop: 6 } },
          React.createElement('div', { style: { flex: '1 1 300px', minWidth: 280 } },
            React.createElement(BarChart, { data: statsAll.byStatus, xLabel: t.dim_status, yLabel: metricLabel(), byKeyAlpha: false })
          ),
          React.createElement('div', { style: { flex: '1 1 300px', minWidth: 280 } },
            React.createElement(BarChart, { data: statsAll.byProcess, xLabel: t.dim_process, yLabel: metricLabel(), byKeyAlpha: false })
          ),
          React.createElement('div', { style: { flex: '1 1 300px', minWidth: 280 } },
            React.createElement(BarChart, { data: statsAll.byMaterial, xLabel: t.dim_material, yLabel: metricLabel(), byKeyAlpha: false })
          ),
        )
      ),
      // Filters removed

      React.createElement('div', { className: 'card', style: { marginTop: 16 } },
        React.createElement('div', { className: 'row', style: { justifyContent: 'space-between', alignItems: 'center' } },
          React.createElement('label', null, t.a_list),
          React.createElement('div', { className: 'row', style: { gap: 6 } },
            React.createElement('button', { className: 'btn', onClick: () => refresh(), title: t.tt_refresh, style: { padding: '6px 10px', fontSize: 12 } }, t.refresh),
            React.createElement('button', { className: 'btn', onClick: () => setCreating(true), title: t.a_add, style: { padding: '6px 10px', fontSize: 12 } }, t.a_add),
            React.createElement('button', { className: 'btn danger', onClick: bulkDelete, title: t.tt_delete, disabled: selected.size === 0, style: { padding: '6px 10px', fontSize: 12 } }, t.a_delete),
            React.createElement('button', { className: 'btn', onClick: exportCSV, title: t.tt_export_csv, style: { padding: '6px 10px', fontSize: 12 } }, t.a_export_csv)
          )
        ),
        filtered.length === 0 ? React.createElement('div', { className: 'notice' }, t.a_none) : (
          React.createElement('div', { style: { overflowX: 'auto' } },
            React.createElement('table', { className: 'table' },
              React.createElement('thead', null,
                React.createElement('tr', null,
                  React.createElement('th', null,
                    React.createElement('input', { type: 'checkbox', onChange: toggleAll, checked: filtered.length > 0 && selected.size === filtered.length })
                  ),
                  React.createElement('th', null, t.th_date),
                  React.createElement('th', null, t.th_customer),
                  React.createElement('th', null, t.th_project),
                  React.createElement('th', null, t.th_material),
                  React.createElement('th', null, t.th_process),
                  React.createElement('th', null, t.th_qty),
                  React.createElement('th', null, t.th_thickness),
                  React.createElement('th', null, t.th_due),
                  React.createElement('th', null, t.th_days_to_due),
                  React.createElement('th', null, t.th_est_price),
                  React.createElement('th', null, t.th_est_lead),
                  React.createElement('th', null, t.a_status),
                  React.createElement('th', null, t.th_actions),
                ),
                // Filter row removed
              ),
              React.createElement('tbody', null,
                filtered.map((it, index) => (
                  React.createElement('tr', { 
                    key: it.id,
                    style: {
                      backgroundColor: index % 2 === 1 ? '#596F80' : 'transparent',
                      color: index % 2 === 1 ? 'white' : 'inherit'
                    }
                  },
                    React.createElement('td', null,
                      React.createElement('input', { type: 'checkbox', checked: selected.has(it.id), onChange: (e) => toggleOne(it.id, e.target.checked) })
                    ),
                    React.createElement('td', null, (it.createdAt||'').replace('T',' ').slice(0,16)),
                    React.createElement('td', null, (it.name || '') + (it.company ? ' — ' + it.company : '')),
                    React.createElement('td', null, it.proj || ''),
                    React.createElement('td', null, it.material || ''),
                    React.createElement('td', null, (it.process||[]).join(', ')),
                    React.createElement('td', null, String(it.qty ?? '')),
                    React.createElement('td', null, String(it.thickness ?? '')),
                    React.createElement('td', null, it.due || ''),
                    React.createElement('td', null, (() => {
                      if (!(it.status === 'approved' && it.due)) return ''
                      const days = Math.ceil((new Date(it.due).getTime() - Date.now()) / (1000*60*60*24))
                      const style = days <= 3 ? { color: '#ff6b6b', fontWeight: 600 } : {}
                      return React.createElement('span', { style }, String(days))
                    })()),
                    React.createElement('td', null, '₺ 16'),
                    React.createElement('td', null, '16'),
                    React.createElement('td', null, React.createElement('span', { className: 'status ' + (it.status === 'new' ? 'new' : it.status === 'review' ? 'review' : it.status === 'feasible' ? 'feasible' : it.status === 'quoted' ? 'quoted' : it.status === 'approved' ? 'approved' : 'not') }, statusLabel(it.status, t))),
                    React.createElement('td', null,
                      React.createElement('div', { className: 'row actions-row', style: { gap: 8 } },
                        React.createElement('button', { type: 'button', className: 'btn', onClick: (e) => { e.stopPropagation(); setDetail(it) }, title: t.tt_detail }, t.a_detail),
                        React.createElement('div', { className: 'tt-wrap' },
                          React.createElement('select', {
                            value: it.status,
                            onChange: (e) => { e.stopPropagation(); setItemStatus(it.id, e.target.value) },
                            className: 'btn',
                            style: { padding: '10px 14px', borderRadius: 10 },
                            title: t.tt_change_status
                          },
                            React.createElement('option', { value: 'new' }, t.s_new),
                            React.createElement('option', { value: 'review' }, t.s_review),
                            React.createElement('option', { value: 'feasible' }, t.s_feasible),
                            React.createElement('option', { value: 'not' }, t.s_not),
                          React.createElement('option', { value: 'quoted' }, t.s_quoted),
                          React.createElement('option', { value: 'approved' }, t.s_approved),
                        ),
                          React.createElement('span', { className: 'tt' }, t.tt_change_status)
                        ),
                        React.createElement('button', { type: 'button', className: 'btn', onClick: (e) => { e.stopPropagation(); API.downloadTxt(it.id, it) }, title: t.tt_download_txt }, 'TXT'),
                        React.createElement('button', { type: 'button', className: 'btn danger', onClick: (e) => { e.stopPropagation(); if (confirm(t.confirm_delete)) remove(it.id) }, title: t.tt_delete }, t.a_delete),
                      )
                    )
                  )
                ))
              )
            )
          )
        )
      ),
      // Filter overlay removed

      detail ? React.createElement(DetailModal, { item: detail, onClose: () => setDetail(null), setItemStatus, onSaved: refresh, t }) : null,
      creating ? React.createElement(DetailModal, { item: {}, isNew: true, onClose: () => setCreating(false), onSaved: () => { setCreating(false); refresh() }, t }) : null
    )
  }

  function FilesModal({ item, onClose, t }) {
    function srcOf(f) {
      if (!f) return ''
      if (f.dataUrl) return f.dataUrl
      const u = f.url || ''
      if (!u) return ''
      return /^https?:/i.test(u) ? u : (API_BASE.replace(/\/$/, '') + u)
    }
    return React.createElement('div', { style: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60 } },
      React.createElement('div', { className: 'card', style: { width: 'min(900px, 96vw)', maxHeight: '85vh', overflowY: 'auto', position: 'relative', padding: 12 } },
        React.createElement('div', { className: 'row', style: { justifyContent: 'space-between' } },
          React.createElement('h3', null, t.a_files),
          React.createElement('button', { className: 'btn', onClick: onClose }, t.a_close)
        ),
        React.createElement('div', { className: 'grid two', style: { gap: 8 } },
          (item.files||[]).map((f, i) => React.createElement('div', { key: 'tf'+i, className: 'card', style: { padding: 10 } },
            React.createElement('div', null, `${f.name} (${(f.size/1024).toFixed(0)} KB)`),
            (f.type||'').toLowerCase().includes('image') || ['png','jpg','jpeg'].includes((f.type||'').toLowerCase()) ? (
              React.createElement('img', { className: 'preview-img', src: srcOf(f), alt: f.name })
            ) : React.createElement('a', { className: 'btn', href: srcOf(f), download: f.name, title: t.tt_download_txt }, t.download)
          )),
          (item.productImages||[]).map((f, i) => React.createElement('div', { key: 'pi'+i, className: 'card', style: { padding: 10 } },
            React.createElement('div', null, `${f.name} (${(f.size/1024).toFixed(0)} KB)`),
            (f.type||'').toLowerCase().includes('image') || ['png','jpg','jpeg'].includes((f.type||'').toLowerCase()) ? (
              React.createElement('img', { className: 'preview-img', src: srcOf(f), alt: f.name })
            ) : React.createElement('a', { className: 'btn', href: srcOf(f), download: f.name, title: t.tt_download_txt }, t.download)
          ))
        )
      )
    )
  }

  function DetailModal({ item, onClose, setItemStatus, onSaved, t, isNew }) {
    const [currStatus, setCurrStatus] = React.useState(item.status || 'new')
    const [editing, setEditing] = React.useState(!!isNew)
    const [form, setForm] = React.useState({})
    const [techFiles, setTechFiles] = React.useState(item.files || [])
    const [prodImgs, setProdImgs] = React.useState(item.productImages || [])
    React.useEffect(() => {
      setCurrStatus(item.status || 'new')
      setForm({
        name: item.name || '', company: item.company || '', email: item.email || '', phone: item.phone || '', country: item.country || '', city: item.city || '',
        proj: item.proj || '', process: (item.process || []).join(', '), material: item.material || '', grade: item.grade || '', thickness: item.thickness || '', qty: item.qty || '', dims: item.dims || '', tolerance: item.tolerance || '', finish: item.finish || '', due: item.due || '', repeat: item.repeat || '', budget: item.budget || '', address: item.address || '', drawing: item.drawing || 'no', productPics: item.productPics || 'no', desc: item.desc || '',
      })
      setTechFiles(item.files || [])
      setProdImgs(item.productImages || [])
    }, [item.id])
    function setF(k, v) { setForm((s) => ({ ...s, [k]: v })) }
    async function onAddTech(filesList) {
      const arr = Array.from(filesList)
      const parsed = []
      for (const f of arr) {
        const sizeMb = f.size / (1024*1024)
        if (sizeMb > MAX_FILE_MB) continue
        const ext = extOf(f.name)
        if (!ACCEPT_EXT.includes(ext)) continue
        const dataUrl = await readFileAsDataUrl(f)
        parsed.push({ name: f.name, type: f.type || ext, size: f.size, dataUrl })
      }
      setTechFiles((p) => p.concat(parsed).slice(0, MAX_FILES))
    }
    async function onAddProd(filesList) {
      const arr = Array.from(filesList)
      const parsed = []
      for (const f of arr) {
        const sizeMb = f.size / (1024*1024)
        if (sizeMb > MAX_FILE_MB) continue
        const ext = extOf(f.name)
        if (!isImageExt(ext) && !isImageExt(f.type)) continue
        const dataUrl = await readFileAsDataUrl(f)
        parsed.push({ name: f.name, type: f.type || ext, size: f.size, dataUrl })
      }
      setProdImgs((p) => p.concat(parsed).slice(0, MAX_PRODUCT_FILES))
    }
    async function onSave() {
      if (isNew) {
        const payload = {
          id: uid(),
          createdAt: new Date().toISOString(),
          status: currStatus,
          name: form.name, company: form.company, email: form.email, phone: form.phone, country: form.country, city: form.city,
          proj: form.proj, process: form.process.split(',').map(s=>s.trim()).filter(Boolean), material: form.material, grade: form.grade,
          thickness: form.thickness, qty: form.qty, dims: form.dims, tolerance: form.tolerance, finish: form.finish, due: form.due,
          repeat: form.repeat, budget: form.budget, address: form.address, drawing: form.drawing, productPics: form.productPics, desc: form.desc,
          files: techFiles, productImages: prodImgs,
        }
        await API.createQuote(payload)
      } else {
        const patch = {
          status: currStatus,
          name: form.name, company: form.company, email: form.email, phone: form.phone, country: form.country, city: form.city,
          proj: form.proj, process: form.process.split(',').map(s=>s.trim()).filter(Boolean), material: form.material, grade: form.grade,
          thickness: form.thickness, qty: form.qty, dims: form.dims, tolerance: form.tolerance, finish: form.finish, due: form.due,
          repeat: form.repeat, budget: form.budget, address: form.address, drawing: form.drawing, productPics: form.productPics, desc: form.desc,
          files: techFiles, productImages: prodImgs,
        }
        await API.updateQuote(item.id, patch)
      }
      setEditing(false)
      try { if (typeof onSaved === 'function') await onSaved() } catch {}
     
      onClose()
    }
    return React.createElement('div', { style: {
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50
    }, onClick: onClose },
      React.createElement('div', { className: 'card', style: { width: 'min(680px, 96vw)', maxHeight: '85vh', overflowY: 'auto', position: 'relative', padding: 12, fontSize: 13 }, onClick: (e) => e.stopPropagation() },
        React.createElement('div', { className: 'row', style: { justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, position: 'sticky', top: 0, zIndex: 5, background: 'linear-gradient(180deg, #0f1e2c, #0c1924)', padding: '8px 6px', borderBottom: '1px solid rgba(255,255,255,0.08)' } },
          React.createElement('h3', { style: { margin: 0, fontSize: 16 } }, t.a_detail),
        React.createElement('div', { className: 'row' },
            (!editing && !isNew) ? React.createElement('button', { className: 'btn', onClick: () => setEditing(true) }, t.edit) : React.createElement(React.Fragment, null,
              React.createElement('button', { className: 'btn accent', onClick: onSave }, t.save),
              React.createElement('button', { className: 'btn', onClick: () => setEditing(false) }, t.cancel)
            ),
            React.createElement('button', { className: 'btn', onClick: onClose, title: t.tt_close }, '×')
          )
        ),
        (!editing && !isNew) ? React.createElement('div', { className: 'grid two', style: { gap: 8 } },
          info('ID', item.id), info(t.th_date, (item.createdAt||'').replace('T',' ').slice(0,16)), info(t.a_status, statusLabel(currStatus, t)), info(t.f_name, item.name),
          info(t.f_company, item.company), info(t.f_email, item.email), info(t.f_phone, item.phone), info(t.f_country + '/' + t.f_city, `${item.country} / ${item.city}`),
          info(t.f_proj, item.proj), info(t.f_process, (item.process||[]).join(', ')), info(t.f_material, item.material), info(t.f_grade, item.grade),
          info(t.f_thickness, item.thickness + ' mm'), info(t.f_qty, item.qty), info(t.f_dims, item.dims), info(t.f_tolerance, item.tolerance),
          info(t.f_finish, item.finish), info(t.f_due, item.due), info(t.f_repeat, item.repeat === 'recurrent' ? t.repeat_recurrent : t.repeat_one), info(t.f_budget, item.budget),
          info(t.f_drawing, item.drawing), info(t.f_address, item.address), info(t.f_desc, item.desc)
        ) : React.createElement('div', { className: 'grid two', style: { gap: 8 } },
          editField(t.f_name, 'name'), editField(t.f_company, 'company'), editField(t.f_email, 'email'), editField(t.f_phone, 'phone'),
          editField(t.f_country, 'country'), editField(t.f_city, 'city'), editField(t.f_proj, 'proj'), editField(t.f_process, 'process'),
          editField(t.f_material, 'material'), editField(t.f_grade, 'grade'), editField(t.f_thickness, 'thickness'), editField(t.f_qty, 'qty'),
          editField(t.f_dims, 'dims'), editField(t.f_tolerance, 'tolerance'), editField(t.f_finish, 'finish'), editField(t.f_due, 'due'),
          editField(t.f_repeat, 'repeat'), editField(t.f_budget, 'budget'), editArea(t.f_address, 'address'), editRadio(t.f_drawing, 'drawing'), editRadio(t.f_prodimg, 'productPics'), editArea(t.f_desc, 'desc')
        ),
        React.createElement('div', { style: { height: 10 } }),
        React.createElement('div', { className: 'row wrap' },
          React.createElement('button', { className: (currStatus === 'review' ? 'btn accent' : 'btn'), onClick: () => { setCurrStatus('review'); setItemStatus(item.id, 'review') }, style: { padding: '6px 10px', fontSize: 12 }, title: t.tt_status_review }, t.s_review),
          React.createElement('button', { className: (currStatus === 'feasible' ? 'btn accent' : 'btn'), onClick: () => { setCurrStatus('feasible'); setItemStatus(item.id, 'feasible') }, style: { padding: '6px 10px', fontSize: 12 }, title: t.tt_status_feasible }, t.s_feasible),
          React.createElement('button', { className: (currStatus === 'not' ? 'btn accent' : 'btn'), onClick: () => { setCurrStatus('not'); setItemStatus(item.id, 'not') }, style: { padding: '6px 10px', fontSize: 12 }, title: t.tt_status_not }, t.s_not),
          React.createElement('button', { className: (currStatus === 'quoted' ? 'btn accent' : 'btn'), onClick: () => { setCurrStatus('quoted'); setItemStatus(item.id, 'quoted') }, style: { padding: '6px 10px', fontSize: 12 }, title: t.tt_status_quoted }, t.s_quoted),
          React.createElement('button', { className: (currStatus === 'approved' ? 'btn accent' : 'btn'), onClick: () => { setCurrStatus('approved'); setItemStatus(item.id, 'approved') }, style: { padding: '6px 10px', fontSize: 12 } }, t.s_approved)
        ),
        React.createElement('div', { style: { height: 10 } }),
        (editing ? React.createElement('div', { className: 'grid two', style: { gap: 8, marginBottom: 6 } },
          React.createElement('div', { className: 'card', style: { padding: 10 } },
            React.createElement('div', { className: 'help', style: { marginBottom: 6 } }, t.add_tech_file),
            React.createElement('input', { type: 'file', multiple: true, accept: '.pdf,.png,.jpg,.jpeg,.dxf,.dwg,.step,.stp,.iges,.igs,application/pdf,image/png,image/jpeg,image/jpg', onChange: (e) => onAddTech(e.target.files) })
          ),
          React.createElement('div', { className: 'card', style: { padding: 10 } },
            React.createElement('div', { className: 'help', style: { marginBottom: 6 } }, t.add_prod_image),
            React.createElement('input', { type: 'file', multiple: true, accept: '.png,.jpg,.jpeg,image/png,image/jpeg,image/jpg', onChange: (e) => onAddProd(e.target.files) })
          )
        ) : null),
        (techFiles||[]).length ? React.createElement('div', { className: 'grid two', style: { gap: 8 } },
          techFiles.map((f, i) => React.createElement('div', { key: i, className: 'card file-card', style: { padding: 10, position: 'relative' } },
            React.createElement('div', { style: { marginBottom: 6 } }, `${f.name} (${(f.size/1024).toFixed(0)} KB)`),
            ((f.type||'').toLowerCase().includes('image') || ['png','jpg','jpeg'].includes((f.type||'').toLowerCase()))
              ? React.createElement('img', { className: 'preview-img', src: (function(){const u=(f.dataUrl||'')||(f.url||''); return /^https?:/i.test(u)?u:(u?API_BASE.replace(/\/$/,'')+u:'')})(), alt: f.name })
              : React.createElement('div', { className: 'file-thumb' }, 'Preview not available'),
            editing
              ? React.createElement('div', { className: 'dl-group' },
                  React.createElement('button', { className: 'btn icon-btn', title: t.tt_download_txt, onClick: () => { if (f.dataUrl) downloadDataUrl(f.name, f.dataUrl); else window.open(f.url, '_blank') } }, '⬇'),
                  React.createElement('button', { className: 'btn icon-btn danger', title: t.a_delete, onClick: () => setTechFiles((p)=>p.filter((_,ix)=>ix!==i)) }, '🗑️')
                )
              : React.createElement('button', { className: 'btn icon-btn dl-center', title: t.tt_download_txt, onClick: () => { if (f.dataUrl) downloadDataUrl(f.name, f.dataUrl); else { const u=f.url||''; window.open(/^https?:/i.test(u)?u:(API_BASE.replace(/\/$/,'')+u), '_blank') } } }, '⬇')
          ))
        ) : null,
        (prodImgs||[]).length ? React.createElement('div', { className: 'grid two', style: { gap: 8, marginTop: 10 } },
          prodImgs.map((f, i) => React.createElement('div', { key: i, className: 'card file-card', style: { padding: 10, position: 'relative' } },
            React.createElement('div', { style: { marginBottom: 6 } }, `${f.name} (${(f.size/1024).toFixed(0)} KB)`),
            ((f.type||'').toLowerCase().includes('image') || ['png','jpg','jpeg'].includes((f.type||'').toLowerCase()))
              ? React.createElement('img', { className: 'preview-img', src: (function(){const u=(f.dataUrl||'')||(f.url||''); return /^https?:/i.test(u)?u:(u?API_BASE.replace(/\/$/,'')+u:'')})(), alt: f.name })
              : React.createElement('div', { className: 'file-thumb' }, 'Preview not available'),
            editing
              ? React.createElement('div', { className: 'dl-group' },
                  React.createElement('button', { className: 'btn icon-btn', title: t.tt_download_txt, onClick: () => { if (f.dataUrl) downloadDataUrl(f.name, f.dataUrl); else window.open(f.url, '_blank') } }, '⬇'),
                  React.createElement('button', { className: 'btn icon-btn danger', title: t.a_delete, onClick: () => setProdImgs((p)=>p.filter((_,ix)=>ix!==i)) }, '🗑️')
                )
              : React.createElement('button', { className: 'btn icon-btn dl-center', title: t.tt_download_txt, onClick: () => { if (f.dataUrl) downloadDataUrl(f.name, f.dataUrl); else { const u=f.url||''; window.open(/^https?:/i.test(u)?u:(API_BASE.replace(/\/$/,'')+u), '_blank') } } }, '⬇')
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
    function editField(label, key) {
      return React.createElement('div', { className: 'card', style: { padding: 10 } },
        React.createElement('div', { className: 'help', style: { fontSize: 11 } }, label),
        React.createElement('input', { value: form[key] ?? '', onChange: (e) => setF(key, e.target.value) })
      )
    }
    function editArea(label, key) {
      return React.createElement('div', { className: 'card', style: { padding: 10 } },
        React.createElement('div', { className: 'help', style: { fontSize: 11 } }, label),
        React.createElement('textarea', { value: form[key] ?? '', onChange: (e) => setF(key, e.target.value) })
      )
    }
    function editRadio(label, key) {
      return React.createElement('div', { className: 'card', style: { padding: 10 } },
        React.createElement('div', { className: 'help', style: { fontSize: 11, marginBottom: 6 } }, label),
        React.createElement('div', { className: 'row' },
          React.createElement('label', { className: 'chip' },
            React.createElement('input', { type: 'radio', name: key, checked: (form[key]||'') === 'yes', onChange: () => setF(key, 'yes') }),
            React.createElement('span', null, t.yes)
          ),
          React.createElement('label', { className: 'chip' },
            React.createElement('input', { type: 'radio', name: key, checked: (form[key]||'') === 'no', onChange: () => setF(key, 'no') }),
            React.createElement('span', null, t.no)
          )
        )
      )
    }
  }

  // Modal moved to components/Modal.js

  // NumericFilter removed (unused)

  function App() {
    const { t, lang, setLang } = useI18n()
    const [loggedIn, setLoggedIn] = useState(false)

    // Check for existing token on initial load
    useEffect(() => {
      async function checkLogin() {
        try {
          const token = localStorage.getItem('bk_admin_token')
          if (token) {
            await API.me() // This will throw if token is invalid
            setLoggedIn(true)
          }
        } catch (e) {
          // Token is invalid or expired, ensure logged out state
          localStorage.removeItem('bk_admin_token')
          setLoggedIn(false)
        }
      }
      if (PAGE === 'admin') {
        checkLogin()
      }
    }, [])

    function handleLogin() {
      setLoggedIn(true)
    }

    function handleLogout() {
      setLoggedIn(false)
    }

    return (
      React.createElement(React.Fragment, null,
        React.createElement(Nav, { onLang: setLang, lang, t }),
        PAGE === 'admin'
          ? (loggedIn ? React.createElement(Admin, { t, onLogout: handleLogout }) : React.createElement(AdminGate, { onLogin: handleLogin, t }))
          : React.createElement(QuoteForm, { t })
      )
    )
  }

  function AdminGate({ onLogin, t }) {
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [remember, setRemember] = useState(true)
    const [error, setError] = useState('')
    const [loading, setLoading] = useState(false)

    async function onSubmit(e) {
      e.preventDefault()
      if (!email || !password) { setError('E-posta ve şifre gerekli'); return }
      setLoading(true)
      setError('')
      try {
        const res = await API.login(email, password, remember)
        if (res && res.ok) {
          onLogin()
        } else {
          // This branch may not be hit if API.login always throws on error, but as a fallback:
          setError((res && res.error) || 'Giriş başarısız. Lütfen tekrar deneyin.')
        }
      } catch (err) {
        console.error(err)
        // The custom error from API.login will be caught here.
        setError(err.message || 'Giriş başarısız. Sunucu hatası.')
      } finally {
        setLoading(false)
      }
    }

    return React.createElement('div', { className: 'gate' },
      React.createElement('form', { className: 'card', onSubmit: onSubmit, style: { maxWidth: 400, width: '100%', margin: '0 auto', padding: 16, borderRadius: 8, boxShadow: '0 4px 8px rgba(0,0,0,0.1)' } },
        React.createElement('h2', { className: 'title', style: { marginBottom: 16, fontSize: 18, textAlign: 'center' } }, 'Admin Girişi'),
        error ? React.createElement('div', { className: 'notice', style: { marginBottom: 12 } }, error) : null,
        React.createElement('div', { className: 'field', style: { marginBottom: 12 } },
          React.createElement('label', { style: { marginBottom: 4 } }, 'E-posta'),
          React.createElement('input', {
            type: 'email', name: 'email', required: true,
            value: email, onChange: (e) => setEmail(e.target.value),
            style: { padding: 10, borderRadius: 4, border: '1px solid #ccc', fontSize: 14, width: '100%' }
          })
        ),
        React.createElement('div', { className: 'field', style: { marginBottom: 16 } },
          React.createElement('label', { style: { marginBottom: 4 } }, 'Şifre'),
          React.createElement('input', {
            type: 'password', name: 'password', required: true,
            value: password, onChange: (e) => setPassword(e.target.value),
            style: { padding: 10, borderRadius: 4, border: '1px solid #ccc', fontSize: 14, width: '100%' }
          })
        ),
        React.createElement('div', { className: 'row', style: { justifyContent: 'space-between', alignItems: 'center', marginTop: 10,  } },
          React.createElement('label', { style: { display: 'flex', alignItems: 'center', gap: '8px', color: 'white', fontSize: '14px' } },
            React.createElement('input', { type: 'checkbox', checked: remember, onChange: (e) => setRemember(e.target.checked) }),
            React.createElement('span', { style: { color: 'white' } }, t.remember_me || 'Beni hatırla')
          ),
          React.createElement('button', { type: 'submit', className: 'btn accent' }, t.login_btn || 'Giriş Yap')
        )
      )
    )
  }

  ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(App))
})()
