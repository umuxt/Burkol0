// Dynamic Pricing System Utilities
// Kullanıcı dostu ID sistemi ve dinamik fiyatlandırma fonksiyonları

// Backend ID'leri kullanıcı dostu harflerle (A, B, C, D...) eşleştir
export function createUserFriendlyIdMapping(parameters) {
  const mapping = {
    backendToUser: {},
    userToBackend: {}
  }
  
  parameters.forEach((param, index) => {
    const userLetter = String.fromCharCode(65 + index) // A, B, C, D...
    mapping.backendToUser[param.id] = userLetter
    mapping.userToBackend[userLetter] = param.id
  })
  
  return mapping
}

// Formülü kullanıcı dostu formata çevir (backend ID'leri -> A, B, C...)
export function convertFormulaToUserFriendly(formula, mapping) {
  if (!formula || !mapping) return formula
  
  let userFormula = formula
  Object.entries(mapping.backendToUser).forEach(([backendId, userLetter]) => {
    // Kelime sınırlarında ID'leri değiştir (partial matches'i engelle)
    const regex = new RegExp(`\\b${backendId}\\b`, 'g')
    userFormula = userFormula.replace(regex, userLetter)
  })
  
  return userFormula
}

// Kullanıcı formülünü backend formatına çevir (A, B, C... -> backend ID'leri)
export function convertFormulaToBackend(userFormula, mapping) {
  if (!userFormula || !mapping) return userFormula
  
  let backendFormula = userFormula
  Object.entries(mapping.userToBackend).forEach(([userLetter, backendId]) => {
    // Kelime sınırlarında harfleri değiştir
    const regex = new RegExp(`\\b${userLetter}\\b`, 'g')
    backendFormula = backendFormula.replace(regex, backendId)
  })
  
  return backendFormula
}

// Parametre türü kontrol fonksiyonları
export function isFormDataParameter(parameter) {
  return parameter.type === 'form' && parameter.formField
}

export function isFixedValueParameter(parameter) {
  return parameter.type === 'fixed' && typeof parameter.value === 'number'
}

// Form alan bilgisini dinamik olarak alma
export function extractFieldInfoFromFormConfig(formFields) {
  if (!formFields || !Array.isArray(formFields)) return []
  
  return formFields.map(field => ({
    value: field.id,
    label: field.label,
    hasOptions: field.hasOptions,
    options: field.options || [],
    type: field.type
  }))
}

// Parametre validasyonu
export function validateParameter(parameter, availableFields = []) {
  const errors = []
  
  if (!parameter.name || parameter.name.trim().length < 2) {
    errors.push('Parametre adı en az 2 karakter olmalıdır')
  }
  
  if (!parameter.type || !['fixed', 'form'].includes(parameter.type)) {
    errors.push('Geçerli bir parametre türü seçilmelidir')
  }
  
  if (parameter.type === 'fixed') {
    if (typeof parameter.value !== 'number' || isNaN(parameter.value)) {
      errors.push('Sabit değer geçerli bir sayı olmalıdır')
    }
  }
  
  if (parameter.type === 'form') {
    if (!parameter.formField) {
      errors.push('Form alanı seçilmelidir')
    } else {
      const fieldExists = availableFields.some(f => f.value === parameter.formField)
      if (!fieldExists) {
        errors.push('Seçilen form alanı mevcut değil')
      }
    }
  }
  
  return errors
}

// Formül validasyonu için kullanıcı dostu ID'leri kontrol et
export function validateUserFriendlyFormula(formula, parameters) {
  if (!formula) return { isValid: true, errors: [] }
  
  const errors = []
  const mapping = createUserFriendlyIdMapping(parameters)
  const availableLetters = Object.values(mapping.backendToUser)
  
  // Formülde kullanılan harfleri bul
  const usedLetters = formula.match(/\b[A-Z]\b/g) || []
  
  // Tanımlanmamış harfleri kontrol et
  const undefinedLetters = usedLetters.filter(letter => !availableLetters.includes(letter))
  if (undefinedLetters.length > 0) {
    errors.push(`Tanımlanmamış parametreler: ${undefinedLetters.join(', ')}`)
  }
  
  return {
    isValid: errors.length === 0,
    errors,
    usedLetters: [...new Set(usedLetters)],
    availableLetters
  }
}

export default {
  createUserFriendlyIdMapping,
  convertFormulaToUserFriendly,
  convertFormulaToBackend,
  isFormDataParameter,
  isFixedValueParameter,
  extractFieldInfoFromFormConfig,
  validateParameter,
  validateUserFriendlyFormula
}