// Form Validation Utils - Validation logic for quote forms

export function sanitizeInteger(val) {
  const s = String(val ?? '').replace(/\D/g, '')
  return s
}

export function sanitizeNumber(val) {
  let s = String(val ?? '').replace(/[^\d\.]/g, '')
  const parts = s.split('.')
  if (parts.length > 2) s = parts[0] + '.' + parts.slice(1).join('')
  return s
}

export function validateQuoteForm(form, t) {
  const errors = {}

  // Name validation
  if (!form.name?.trim()) {
    errors.name = t.err_required || 'Bu alan zorunludur'
  } else if (form.name.trim().length < 2) {
    errors.name = t.err_name_short || 'İsim en az 2 karakter olmalıdır'
  }

  // Email validation
  if (!form.email?.trim()) {
    errors.email = t.err_required || 'Bu alan zorunludur'
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
    errors.email = t.err_email_invalid || 'Geçerli bir email adresi giriniz'
  }

  // Phone validation
  if (!form.phoneLocal?.trim()) {
    errors.phone = t.err_required || 'Bu alan zorunludur'
  } else if (form.phoneLocal.length < 10) {
    errors.phone = t.err_phone_short || 'Telefon numarası en az 10 haneli olmalıdır'
  }

  // Project validation
  if (!form.proj?.trim()) {
    errors.proj = t.err_required || 'Bu alan zorunludur'
  } else if (form.proj.trim().length < 3) {
    errors.proj = t.err_proj_short || 'Proje adı en az 3 karakter olmalıdır'
  }

  // Technical validation
  if (!form.process || (Array.isArray(form.process) && form.process.length === 0)) {
    errors.process = t.err_required || 'En az bir işlem türü seçiniz'
  }

  if (!form.material?.trim()) {
    errors.material = t.err_required || 'Malzeme seçimi zorunludur'
  }

  if (!form.qty?.toString().trim()) {
    errors.qty = t.err_required || 'Adet bilgisi zorunludur'
  } else if (isNaN(Number(form.qty)) || Number(form.qty) <= 0) {
    errors.qty = t.err_qty_invalid || 'Geçerli bir adet giriniz'
  }

  // Dimensions validation
  if (!form.dims?.trim() && (!form.dimsL || !form.dimsW)) {
    errors.dims = t.err_required || 'Boyut bilgisi zorunludur'
  }

  // Budget validation if provided
  if (form.budgetAmount && (isNaN(Number(form.budgetAmount)) || Number(form.budgetAmount) <= 0)) {
    errors.budgetAmount = t.err_budget_invalid || 'Geçerli bir bütçe miktarı giriniz'
  }

  return errors
}

export function getStepFields() {
  return [
    // Step 0: Contact Information
    ['name', 'company', 'email', 'phoneLocal', 'country', 'city'],
    
    // Step 1: Project Details
    ['proj', 'process', 'material', 'grade'],
    
    // Step 2: Technical Specifications
    ['thickness', 'qty', 'dims', 'dimsL', 'dimsW', 'dimsH', 'tolerance', 'toleranceStd'],
    
    // Step 3: Additional Details
    ['finish', 'finishRal', 'anodizeType', 'delivery_date', 'repeat', 'weldMethod', 'surfaceRa'],
    
    // Step 4: Budget and Files
    ['budget', 'budgetCurrency', 'budgetAmount', 'drawing', 'productPics', 'desc']
  ]
}

export function stepHasErrors(stepIndex, errors) {
  const stepFields = getStepFields()
  if (!stepFields[stepIndex]) return false
  
  return stepFields[stepIndex].some(field => errors[field])
}

export function isEmptyField(key, value) {
  if (key === 'process') {
    return !value || (Array.isArray(value) && value.length === 0)
  }
  return !value || (typeof value === 'string' && !value.trim())
}

export function computeMissingFields(form) {
  const missing = new Set()
  const requiredFields = [
    'name', 'email', 'phoneLocal', 'proj', 'process', 'material', 'qty'
  ]
  
  requiredFields.forEach(field => {
    if (isEmptyField(field, form[field])) {
      missing.add(field)
    }
  })
  
  // Dimensions check - either dims or dimsL+dimsW required
  if (isEmptyField('dims', form.dims) && 
      (isEmptyField('dimsL', form.dimsL) || isEmptyField('dimsW', form.dimsW))) {
    missing.add('dims')
  }
  
  return missing
}