import { useI18n, statusLabel, procLabel, materialLabel, finishLabel } from '../../i18n/index.js'
import API from '../../lib/api.js'
import { uid, ACCEPT_EXT, MAX_FILES, MAX_FILE_MB, MAX_PRODUCT_FILES, extOf, readFileAsDataUrl, isImageExt } from '../../lib/utils.js'
import Field from '../Field.js'
import Modal from '../Modal.js'

const { useState, useEffect, useRef } = React

export default function QuoteForm({ t, showNotification }) {
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
    const s = String(val ?? '').replace(/\\D/g, '')
    return s
  }
  function sanitizeNumber(val) {
    let s = String(val ?? '').replace(/[^\\d\\.]/g, '')
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
      showNotification('Teklif başarıyla kaydedildi!', 'success')
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
        React.createElement('button', { 
          className: 'btn', 
          onClick: () => { setPopup(null); setMissingHighlight(computeMissing()); resumeProgress() },
          onMouseOver: (e) => e.target.style.backgroundColor = 'rgba(0,0,0,0.1)',
          onMouseOut: (e) => e.target.style.backgroundColor = '',
          style: { transition: 'all 0.2s ease' }
        }, t.btn_continue || 'Devam Et'),
        React.createElement('button', { 
          className: 'btn accent', 
          onClick: async () => { setPopup(null); await actualSubmit() },
          onMouseOver: (e) => e.target.style.backgroundColor = 'rgba(255,255,255,0.2)',
          onMouseOut: (e) => e.target.style.backgroundColor = '',
          style: { transition: 'all 0.2s ease' }
        }, t.btn_submit || t.submit)
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

    React.createElement('form', { onSubmit: (e) => { e.preventDefault(); preSubmit() }, onKeyDown: handleFormKeyDown, className: 'quote-form' },
      React.createElement('div', { className: 'grid three' },
        step === 0 ? React.createElement(Field, { label: t.f_name },
          React.createElement('input', {
            ref: stepRef(0), value: form.name, onChange: (e) => setF('name', e.target.value), placeholder: t.ph_name,
            style: { padding: '1.5px', border: '1px solid black', color: 'black', background: 'white' }
          }), errors.name ? React.createElement('div', { className: 'help' }, errors.name) : null
        ) : null,
        step === 1 ? React.createElement(Field, { label: t.f_company },
          React.createElement('input', { 
            ref: stepRef(1), value: form.company, onChange: (e) => setF('company', e.target.value), placeholder: t.ph_company,
            style: { padding: '1.5px', border: '1px solid black', color: 'black', background: 'white' }
          })
        ) : null,

        step === 2 ? React.createElement(Field, { label: t.f_email },
          React.createElement('input', { 
            ref: stepRef(2), type: 'email', value: form.email, onChange: (e) => setF('email', e.target.value), placeholder: t.ph_email,
            style: { padding: '1.5px', border: '1px solid black', color: 'black', background: 'white' }
          }),
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
              ['Clear', 'Black', 'Colored'].map((x) => React.createElement('option', { key: x, value: x }, 
                x === 'Clear' ? 'Şeffaf' : 
                x === 'Black' ? 'Siyah' : 
                'Renkli'))
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
                    React.createElement('button', { 
                      type: 'button', 
                      className: 'btn danger', 
                      onClick: () => removeFile(i),
                      onMouseOver: (e) => e.target.style.backgroundColor = 'rgba(255,255,255,0.2)',
                      onMouseOut: (e) => e.target.style.backgroundColor = '',
                      style: { transition: 'all 0.2s ease' }
                    }, 'Kaldır')
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
                    React.createElement('button', { 
                      type: 'button', 
                      className: 'btn danger', 
                      onClick: () => removeProdFile(i),
                      onMouseOver: (e) => e.target.style.backgroundColor = 'rgba(255,255,255,0.2)',
                      onMouseOut: (e) => e.target.style.backgroundColor = '',
                      style: { transition: 'all 0.2s ease' }
                    }, 'Kaldır')
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
          React.createElement('button', { 
            type: 'button', 
            className: 'btn', 
            onClick: goBack, 
            disabled: step === 0,
            onMouseOver: (e) => !e.target.disabled && (e.target.style.backgroundColor = 'rgba(0,0,0,0.1)'),
            onMouseOut: (e) => e.target.style.backgroundColor = '',
            style: { transition: 'all 0.2s ease' }
          }, t.back),
          (step < furthest ? React.createElement('button', { 
            type: 'button', 
            className: 'btn accent', 
            onClick: resumeProgress, 
            style: { marginLeft: 6, transition: 'all 0.2s ease' },
            onMouseOver: (e) => e.target.style.backgroundColor = 'rgba(255,255,255,0.2)',
            onMouseOut: (e) => e.target.style.backgroundColor = ''
          }, t.resume) : null)
        ),
        React.createElement('div', { className: 'row' },
          step < steps.length - 1 ? React.createElement('button', { 
            type: 'button', 
            className: 'btn accent', 
            onClick: goNext,
            onMouseOver: (e) => e.target.style.backgroundColor = 'rgba(255,255,255,0.2)',
            onMouseOut: (e) => e.target.style.backgroundColor = '',
            style: { transition: 'all 0.2s ease' }
          }, t.next) : null,
          React.createElement('button', { 
            type: 'button', 
            className: 'btn accent', 
            onClick: preSubmit, 
            disabled: submitting || Object.keys(validate()).length > 0,
            onMouseOver: (e) => !e.target.disabled && (e.target.style.backgroundColor = 'rgba(255,255,255,0.2)'),
            onMouseOut: (e) => e.target.style.backgroundColor = '',
            style: { transition: 'all 0.2s ease' }
          }, t.submit)
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
