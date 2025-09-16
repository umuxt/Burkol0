// Formula Validator Component - Excel-like formula validation
// Supports mathematical operations, IF/ELSE statements, and parameter references

import FormulaParser from 'hot-formula-parser'

export default function FormulaValidator({ formula, parameters, onValidation }) {
  const [validationResult, setValidationResult] = React.useState(null)
  const [isValidating, setIsValidating] = React.useState(false)

  React.useEffect(() => {
    if (formula) {
      validateFormula(formula)
    } else {
      setValidationResult(null)
      if (onValidation) onValidation(null)
    }
  }, [formula, parameters])

  async function validateFormula(formulaText) {
    setIsValidating(true)
    
    try {
      const result = await performValidation(formulaText)
      setValidationResult(result)
      if (onValidation) onValidation(result)
    } catch (error) {
      const errorResult = {
        isValid: false,
        error: error.message,
        type: 'VALIDATION_ERROR'
      }
      setValidationResult(errorResult)
      if (onValidation) onValidation(errorResult)
    } finally {
      setIsValidating(false)
    }
  }

  async function performValidation(formulaText) {
    const parser = new FormulaParser()
    
    // Set up custom functions for Excel compatibility
    setupCustomFunctions(parser)
    
    // Set up parameter variables
    setupParameterVariables(parser)
    
    // Clean and normalize formula
    const cleanFormula = cleanFormulaInput(formulaText)
    
    // Parse the formula
    const parseResult = parser.parse(cleanFormula)
    
    if (parseResult.error) {
      return {
        isValid: false,
        error: `Syntax Error: ${parseResult.error}`,
        type: 'SYNTAX_ERROR',
        details: parseResult
      }
    }
    
    // Validate mathematical logic
    const mathValidation = validateMathematicalLogic(cleanFormula)
    if (!mathValidation.isValid) {
      return mathValidation
    }
    
    // Validate parameter references
    const paramValidation = validateParameterReferences(cleanFormula)
    if (!paramValidation.isValid) {
      return paramValidation
    }
    
    // Test with sample values
    const testResult = testFormulaWithSamples(parser, cleanFormula)
    
    return {
      isValid: true,
      result: parseResult.result,
      testValues: testResult,
      type: 'SUCCESS',
      cleanFormula: cleanFormula
    }
  }

  function setupCustomFunctions(parser) {
    // Add Excel-like functions
    parser.setFunction('IF', (condition, trueValue, falseValue) => {
      return condition ? trueValue : falseValue
    })
    
    parser.setFunction('AND', (...args) => {
      return args.every(arg => Boolean(arg))
    })
    
    parser.setFunction('OR', (...args) => {
      return args.some(arg => Boolean(arg))
    })
    
    parser.setFunction('MAX', (...args) => {
      return Math.max(...args.filter(n => typeof n === 'number'))
    })
    
    parser.setFunction('MIN', (...args) => {
      return Math.min(...args.filter(n => typeof n === 'number'))
    })
    
    parser.setFunction('ROUND', (number, digits = 0) => {
      return Math.round(number * Math.pow(10, digits)) / Math.pow(10, digits)
    })
  }

  function setupParameterVariables(parser) {
    if (parameters && Array.isArray(parameters)) {
      parameters.forEach(param => {
        // Set parameter variable with sample value
        const sampleValue = getSampleValue(param)
        parser.setVariable(param.id, sampleValue)
      })
    }
    
    // Add common form field variables with sample values
    parser.setVariable('qty', 10)
    parser.setVariable('thickness', 3.0)
    parser.setVariable('material', 1)
    parser.setVariable('process', 1)
  }

  function getSampleValue(param) {
    if (param.type === 'fixed') {
      return parseFloat(param.value) || 0
    } else if (param.lookupTable && param.lookupTable.length > 0) {
      return parseFloat(param.lookupTable[0].value) || 1
    } else {
      return 1 // Default for form field parameters
    }
  }

  function cleanFormulaInput(formula) {
    let clean = formula.trim()
    
    // Remove outer = if present
    if (clean.startsWith('=')) {
      clean = clean.substring(1)
    }
    
    // Replace common Excel operators with JavaScript equivalents
    clean = clean.replace(/&/g, '+') // String concatenation
    
    return clean
  }

  function validateMathematicalLogic(formula) {
    // Check for common mathematical errors
    const errors = []
    
    // Check for division by zero patterns
    if (formula.includes('/0') || formula.includes('/ 0')) {
      errors.push('Division by zero detected')
    }
    
    // Check for unbalanced parentheses
    const openParens = (formula.match(/\(/g) || []).length
    const closeParens = (formula.match(/\)/g) || []).length
    if (openParens !== closeParens) {
      errors.push('Unbalanced parentheses')
    }
    
    // Check for invalid operator sequences
    if (/[+\-*/]{2,}/.test(formula)) {
      errors.push('Invalid operator sequence')
    }
    
    if (errors.length > 0) {
      return {
        isValid: false,
        error: `Mathematical Logic Error: ${errors.join(', ')}`,
        type: 'MATH_ERROR'
      }
    }
    
    return { isValid: true }
  }

  function validateParameterReferences(formula) {
    if (!parameters) return { isValid: true }
    
    // Extract parameter references from formula
    const paramRefs = formula.match(/[A-Z][A-Z0-9]*/g) || []
    const paramIds = parameters.map(p => p.id)
    
    // Check for undefined parameter references
    const undefinedParams = paramRefs.filter(ref => 
      !paramIds.includes(ref) && 
      !['IF', 'AND', 'OR', 'MAX', 'MIN', 'ROUND'].includes(ref) &&
      !['qty', 'thickness', 'material', 'process'].includes(ref)
    )
    
    if (undefinedParams.length > 0) {
      return {
        isValid: false,
        error: `Undefined parameters: ${undefinedParams.join(', ')}`,
        type: 'PARAMETER_ERROR'
      }
    }
    
    return { isValid: true }
  }

  function testFormulaWithSamples(parser, formula) {
    const testCases = [
      { qty: 1, thickness: 1.0, material: 1, process: 1 },
      { qty: 10, thickness: 3.0, material: 2, process: 1 },
      { qty: 100, thickness: 5.0, material: 1, process: 2 }
    ]
    
    const results = testCases.map(testCase => {
      // Set test variables
      Object.keys(testCase).forEach(key => {
        parser.setVariable(key, testCase[key])
      })
      
      try {
        const result = parser.parse(formula)
        return {
          input: testCase,
          output: result.result,
          success: !result.error
        }
      } catch (e) {
        return {
          input: testCase,
          error: e.message,
          success: false
        }
      }
    })
    
    return results
  }

  function getValidationIcon() {
    if (isValidating) return '⏳'
    if (!validationResult) return '❓'
    if (validationResult.isValid) return '✅'
    return '❌'
  }

  function getValidationColor() {
    if (isValidating) return '#ffc107'
    if (!validationResult) return '#6c757d'
    if (validationResult.isValid) return '#28a745'
    return '#dc3545'
  }

  const validationStyle = {
    padding: '8px 12px',
    borderRadius: '6px',
    border: `1px solid ${getValidationColor()}`,
    backgroundColor: validationResult?.isValid ? '#d4edda' : '#f8d7da',
    marginTop: '8px',
    fontSize: '13px'
  }

  if (!validationResult && !isValidating) {
    return null
  }

  return React.createElement('div', { style: validationStyle },
    React.createElement('div', { 
      style: { 
        display: 'flex', 
        alignItems: 'center', 
        gap: '8px',
        marginBottom: validationResult?.details ? '6px' : '0'
      } 
    },
      React.createElement('span', { style: { fontSize: '16px' } }, getValidationIcon()),
      React.createElement('span', { 
        style: { 
          fontWeight: '500',
          color: getValidationColor()
        } 
      }, 
        isValidating ? 'Validating formula...' :
        validationResult.isValid ? 'Formula is valid' : 'Formula has errors'
      )
    ),
    
    validationResult?.error && React.createElement('div', { 
      style: { 
        color: '#721c24',
        backgroundColor: '#f5c6cb',
        padding: '4px 8px',
        borderRadius: '4px',
        marginTop: '4px',
        fontSize: '12px'
      } 
    }, validationResult.error),
    
    validationResult?.isValid && validationResult.testValues && 
    React.createElement('div', { style: { marginTop: '8px' } },
      React.createElement('div', { 
        style: { fontSize: '11px', fontWeight: '500', marginBottom: '4px' } 
      }, 'Test Results:'),
      validationResult.testValues.map((test, idx) => 
        React.createElement('div', { 
          key: idx,
          style: { 
            fontSize: '10px',
            color: test.success ? '#155724' : '#721c24',
            marginBottom: '2px'
          } 
        }, 
          `${JSON.stringify(test.input)} → ${test.success ? test.output : test.error}`
        )
      )
    )
  )
}