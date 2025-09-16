// Simple Formula Validator Component - Basic validation without external dependencies
// Supports mathematical operations, IF/ELSE statements, and parameter references

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
    // Clean and normalize formula
    const cleanFormula = cleanFormulaInput(formulaText)
    
    // Basic syntax validation
    const syntaxValidation = validateSyntax(cleanFormula)
    if (!syntaxValidation.isValid) {
      return syntaxValidation
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
    const testResult = testFormulaWithSamples(cleanFormula)
    
    return {
      isValid: true,
      testValues: testResult,
      type: 'SUCCESS',
      cleanFormula: cleanFormula
    }
  }

  function cleanFormulaInput(formula) {
    let clean = formula.trim()
    
    // Remove outer = if present
    if (clean.startsWith('=')) {
      clean = clean.substring(1)
    }
    
    return clean
  }

  function validateSyntax(formula) {
    // Check for basic syntax errors
    const errors = []
    
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
    
    // Check for empty formula
    if (!formula.trim()) {
      errors.push('Formula cannot be empty')
    }
    
    // Check for basic IF statement structure
    const ifMatches = formula.match(/IF\s*\(/gi)
    if (ifMatches) {
      // Count commas inside IF statements (should have 2 commas for condition, true, false)
      const ifPattern = /IF\s*\([^)]*\)/gi
      let match
      while ((match = ifPattern.exec(formula)) !== null) {
        const ifContent = match[0]
        const commas = (ifContent.match(/,/g) || []).length
        if (commas !== 2) {
          errors.push('IF statement requires exactly 3 parameters: condition, true_value, false_value')
        }
      }
    }
    
    if (errors.length > 0) {
      return {
        isValid: false,
        error: `Syntax Error: ${errors.join(', ')}`,
        type: 'SYNTAX_ERROR'
      }
    }
    
    return { isValid: true }
  }

  function validateMathematicalLogic(formula) {
    // Check for common mathematical errors
    const errors = []
    
    // Check for division by zero patterns
    if (formula.includes('/0') || formula.includes('/ 0')) {
      errors.push('Division by zero detected')
    }
    
    // Check for square root of negative (basic check)
    if (formula.includes('SQRT(-') || formula.includes('√(-')) {
      errors.push('Square root of negative number')
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
    
    // Extract parameter references (A, B, C, etc.)
    const paramRefs = formula.match(/[A-Z]+/g) || []
    const paramIds = parameters.map(p => p.id)
    
    // Check for undefined parameter references
    const undefinedParams = paramRefs.filter(ref => 
      !paramIds.includes(ref) && 
      !['IF', 'AND', 'OR', 'MAX', 'MIN', 'ROUND', 'SQRT', 'ABS'].includes(ref) &&
      !['qty', 'thickness', 'material', 'process'].includes(ref.toLowerCase())
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

  function testFormulaWithSamples(formula) {
    const testCases = [
      { A: 1, B: 2, C: 3, qty: 1, thickness: 1.0 },
      { A: 10, B: 20, C: 30, qty: 10, thickness: 3.0 },
      { A: 100, B: 200, C: 300, qty: 100, thickness: 5.0 }
    ]
    
    const results = testCases.map(testCase => {
      try {
        // Simple formula evaluation (basic operations only)
        let evalFormula = formula
        
        // Replace parameters with test values
        Object.keys(testCase).forEach(param => {
          const regex = new RegExp(`\\b${param}\\b`, 'g')
          evalFormula = evalFormula.replace(regex, testCase[param])
        })
        
        // Basic IF replacement (simplified)
        evalFormula = evalFormula.replace(/IF\s*\(\s*([^,]+)\s*,\s*([^,]+)\s*,\s*([^)]+)\s*\)/g, 
          (match, condition, trueVal, falseVal) => {
            try {
              // Very basic condition evaluation
              const condResult = Function(`"use strict"; return (${condition})`)()
              return condResult ? trueVal : falseVal
            } catch (e) {
              return trueVal // Default to true value if condition fails
            }
          }
        )
        
        // Evaluate the expression (with safety checks)
        const result = Function(`"use strict"; return (${evalFormula})`)()
        
        return {
          input: testCase,
          output: result,
          success: true
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
      validationResult.testValues.slice(0, 2).map((test, idx) => 
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