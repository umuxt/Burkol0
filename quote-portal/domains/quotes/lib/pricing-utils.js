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

// Form alan bilgisini dinamik olarak alma (PostgreSQL format)
export function extractFieldInfoFromFormConfig(formFields) {
  if (!formFields || !Array.isArray(formFields)) return []
  
  return formFields.map(field => ({
    value: field.field_code || field.id,
    label: field.field_name || field.label,
    hasOptions: field.has_options || field.hasOptions,
    options: field.options || [],
    type: field.field_type || field.type
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

// Orphan parameter kontrolü - Form alanı silinen parametreleri tespit et
export function detectOrphanParameters(parameters, availableFormFields) {
  if (!parameters || !Array.isArray(parameters)) return []
  if (!availableFormFields || !Array.isArray(availableFormFields)) return []
  
  const availableFieldIds = availableFormFields.map(field => field.value)
  
  return parameters.filter(param => {
    // Sadece form tipindeki parametreleri kontrol et
    if (param.type !== 'form' || !param.formField) return false
    
    // Form alanı artık mevcut değilse orphan
    return !availableFieldIds.includes(param.formField)
  })
}

// Orphan parametrelerin formülde kullanılıp kullanılmadığını kontrol et
export function getOrphanParametersInFormula(orphanParameters, formula, allParameters) {
  if (!orphanParameters || orphanParameters.length === 0) return []
  if (!formula) return []
  
  const mapping = createUserFriendlyIdMapping(allParameters)
  const usedLetters = formula.match(/\b[A-Z]\b/g) || []
  
  return orphanParameters.filter(param => {
    const userLetter = mapping.backendToUser[param.id]
    return usedLetters.includes(userLetter)
  })
}

// Sistem durumu kontrolü - orphan parametreler varsa işlemleri bloke et
export function validateSystemIntegrity(parameters, availableFormFields, formula) {
  const orphanParams = detectOrphanParameters(parameters, availableFormFields)
  const orphansInFormula = getOrphanParametersInFormula(orphanParams, formula, parameters)
  
  const hasOrphans = orphanParams.length > 0
  const hasOrphansInFormula = orphansInFormula.length > 0
  
  const result = {
    isValid: !hasOrphans,
    canSave: !hasOrphans,
    canEdit: !hasOrphans,
    orphanParameters: orphanParams,
    orphansInFormula: orphansInFormula,
    warnings: [],
    errors: []
  }
  
  if (hasOrphans) {
    result.errors.push(`${orphanParams.length} parametre artık form alanında bulunmuyor`)
    
    orphanParams.forEach(param => {
      result.warnings.push(`"${param.name}" parametresi "${param.formField}" form alanına bağlı ancak bu alan artık mevcut değil`)
    })
    
    if (hasOrphansInFormula) {
      result.errors.push(`${orphansInFormula.length} orphan parametre hala formülde kullanılıyor`)
      
      orphansInFormula.forEach(param => {
        const mapping = createUserFriendlyIdMapping(parameters)
        const userLetter = mapping.backendToUser[param.id]
        result.errors.push(`Formülden "${userLetter}" (${param.name}) parametresini kaldırın`)
      })
    }
  }
  
  return result
}

// Orphan parametreleri bulma fonksiyonu (backward compatibility)
export function findOrphanParameters(parameters, userFormula) {
  const systemCheck = validateSystemIntegrity(parameters, userFormula)
  return systemCheck.orphanParameters || []
}

export default {
  createUserFriendlyIdMapping,
  convertFormulaToUserFriendly,
  convertFormulaToBackend,
  isFormDataParameter,
  isFixedValueParameter,
  extractFieldInfoFromFormConfig,
  validateParameter,
  validateUserFriendlyFormula,
  detectOrphanParameters,
  getOrphanParametersInFormula,
  validateSystemIntegrity,
  findOrphanParameters
}