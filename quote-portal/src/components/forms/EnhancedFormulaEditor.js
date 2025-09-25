// Enhanced Formula Editor Component - Advanced formula editing with real-time validation
import React from 'react';
import PricingUtils from '../../lib/pricing-utils.js'

const { useState, useEffect, useRef } = React;

function EnhancedFormulaEditor({ 
  value = '', 
  onChange, 
  parameters = [], 
  placeholder = 'Örn: A * B + SQRT(C)',
  disabled = false 
}) {
  const [cursorPosition, setCursorPosition] = useState(0)
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [suggestions, setSuggestions] = useState([])
  const textareaRef = useRef(null)

  // Kullanılabilir fonksiyonlar ve operatörler
  const availableFunctions = [
    { name: 'SQRT', description: 'Karekök', example: 'SQRT(A)' },
    { name: 'ROUND', description: 'Yuvarlama', example: 'ROUND(A, 2)' },
    { name: 'MAX', description: 'Maksimum', example: 'MAX(A, B)' },
    { name: 'MIN', description: 'Minimum', example: 'MIN(A, B)' },
    { name: 'ABS', description: 'Mutlak değer', example: 'ABS(A)' },
    { name: 'POWER', description: 'Üs alma', example: 'POWER(A, 2)' },
    { name: 'CEIL', description: 'Yukarı yuvarlama', example: 'CEIL(A)' },
    { name: 'FLOOR', description: 'Aşağı yuvarlama', example: 'FLOOR(A)' },
    { name: 'IF', description: 'Koşul', example: 'IF(A > 10, B, C)' },
    { name: 'AND', description: 'Ve', example: 'AND(A > 5, B < 10)' },
    { name: 'OR', description: 'Veya', example: 'OR(A > 5, B < 10)' },
    { name: 'PI', description: 'Pi sayısı', example: 'PI' },
    { name: 'E', description: 'Euler sayısı', example: 'E' }
  ]

  const operators = [
    { symbol: '+', description: 'Toplama' },
    { symbol: '-', description: 'Çıkarma' },
    { symbol: '*', description: 'Çarpma' },
    { symbol: '/', description: 'Bölme' },
    { symbol: '(', description: 'Parantez açma' },
    { symbol: ')', description: 'Parantez kapatma' },
    { symbol: '>', description: 'Büyüktür' },
    { symbol: '<', description: 'Küçüktür' },
    { symbol: '>=', description: 'Büyük eşit' },
    { symbol: '<=', description: 'Küçük eşit' },
    { symbol: '==', description: 'Eşittir' },
    { symbol: '!=', description: 'Eşit değil' }
  ]

  // ID mapping için parametreleri hazırla
  const idMapping = PricingUtils.createUserFriendlyIdMapping(parameters)
  const availableParameters = Object.values(idMapping.backendToUser)

  // Otomatik tamamlama önerileri
  function generateSuggestions(currentText, cursorPos) {
    const textBeforeCursor = currentText.substring(0, cursorPos)
    const lastWord = textBeforeCursor.split(/[^A-Za-z0-9_]/).pop()
    
    if (!lastWord) return []
    
    const suggestions = []
    
    // Parametre önerileri
    availableParameters.forEach(param => {
      if (param.toLowerCase().startsWith(lastWord.toLowerCase())) {
        suggestions.push({
          type: 'parameter',
          text: param,
          description: `Parametre ${param}`,
          insertText: param
        })
      }
    })
    
    // Fonksiyon önerileri
    availableFunctions.forEach(func => {
      if (func.name.toLowerCase().startsWith(lastWord.toLowerCase())) {
        suggestions.push({
          type: 'function',
          text: func.name,
          description: func.description,
          insertText: func.name + '(',
          example: func.example
        })
      }
    })
    
    return suggestions.slice(0, 8) // En fazla 8 öneri
  }

  // Metin değişikliği
  function handleTextChange(e) {
    const newValue = e.target.value
    const newCursorPos = e.target.selectionStart
    
    onChange(newValue)
    setCursorPosition(newCursorPos)
    
    // Otomatik tamamlama önerilerini güncelle
    const newSuggestions = generateSuggestions(newValue, newCursorPos)
    setSuggestions(newSuggestions)
    setShowSuggestions(newSuggestions.length > 0)
  }

  // Öneri seçimi
  function selectSuggestion(suggestion) {
    const textarea = textareaRef.current
    if (!textarea) return
    
    const beforeCursor = value.substring(0, cursorPosition)
    const afterCursor = value.substring(cursorPosition)
    const lastWordStart = beforeCursor.lastIndexOf(beforeCursor.split(/[^A-Za-z0-9_]/).pop())
    
    const newValue = 
      value.substring(0, lastWordStart) + 
      suggestion.insertText + 
      afterCursor
    
    onChange(newValue)
    setShowSuggestions(false)
    
    // Cursor pozisyonunu ayarla
    setTimeout(() => {
      const newCursorPos = lastWordStart + suggestion.insertText.length
      textarea.setSelectionRange(newCursorPos, newCursorPos)
      textarea.focus()
    }, 0)
  }

  // Klavye olayları
  function handleKeyDown(e) {
    if (e.key === 'Escape') {
      setShowSuggestions(false)
    }
    
    if (showSuggestions && suggestions.length > 0) {
      if (e.key === 'Tab') {
        e.preventDefault()
        selectSuggestion(suggestions[0])
      }
    }
  }

  // Hızlı ekleme fonksiyonları
  function insertQuickFunction(funcName) {
    const textarea = textareaRef.current
    if (!textarea) return
    
    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const newValue = value.substring(0, start) + funcName + value.substring(end)
    
    onChange(newValue)
    
    setTimeout(() => {
      const newPos = start + funcName.length
      textarea.setSelectionRange(newPos, newPos)
      textarea.focus()
    }, 0)
  }

  // Syntax highlighting için sınıf belirleme
  function getHighlightedFormula() {
    if (!value) return ''
    
    let highlighted = value
    
    // Parametreleri vurgula
    availableParameters.forEach(param => {
      const regex = new RegExp(`\\b${param}\\b`, 'g')
      highlighted = highlighted.replace(regex, `<span class="formula-parameter">${param}</span>`)
    })
    
    // Fonksiyonları vurgula
    availableFunctions.forEach(func => {
      const regex = new RegExp(`\\b${func.name}\\b`, 'g')
      highlighted = highlighted.replace(regex, `<span class="formula-function">${func.name}</span>`)
    })
    
    return highlighted
  }

  return React.createElement('div', { className: 'enhanced-formula-editor' },
    // Ana formül editörü
    React.createElement('div', { className: 'formula-editor-container' },
      React.createElement('textarea', {
        ref: textareaRef,
        value: value,
        onChange: handleTextChange,
        onKeyDown: handleKeyDown,
        className: 'form-control formula-textarea',
        placeholder: placeholder,
        rows: 3,
        disabled: disabled,
        style: {
          fontFamily: 'Monaco, Consolas, monospace',
          fontSize: '14px',
          position: 'relative',
          zIndex: 2
        }
      }),
      
      // Otomatik tamamlama önerileri
      showSuggestions && suggestions.length > 0 && React.createElement('div', {
        className: 'formula-suggestions',
        style: {
          position: 'absolute',
          top: '100%',
          left: 0,
          right: 0,
          backgroundColor: 'white',
          border: '1px solid #ddd',
          borderRadius: '4px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
          zIndex: 1000,
          maxHeight: '200px',
          overflowY: 'auto'
        }
      },
        ...suggestions.map((suggestion, index) =>
          React.createElement('div', {
            key: index,
            className: 'suggestion-item',
            style: {
              padding: '8px 12px',
              cursor: 'pointer',
              borderBottom: index < suggestions.length - 1 ? '1px solid #eee' : 'none'
            },
            onClick: () => selectSuggestion(suggestion),
            onMouseEnter: (e) => e.target.style.backgroundColor = '#f8f9fa',
            onMouseLeave: (e) => e.target.style.backgroundColor = 'white'
          },
            React.createElement('div', { style: { fontWeight: 'bold', color: suggestion.type === 'parameter' ? '#007bff' : '#28a745' } },
              suggestion.text
            ),
            React.createElement('div', { style: { fontSize: '0.8em', color: '#666' } },
              suggestion.description
            ),
            suggestion.example && React.createElement('div', { style: { fontSize: '0.75em', color: '#999', fontFamily: 'monospace' } },
              suggestion.example
            )
          )
        )
      )
    ),
    
    // Hızlı ekleme butonları
    React.createElement('div', { 
      className: 'formula-quick-actions',
      style: { marginTop: '10px', display: 'flex', flexWrap: 'wrap', gap: '5px' }
    },
      React.createElement('div', { style: { fontSize: '0.9em', fontWeight: 'bold', width: '100%', marginBottom: '5px' } },
        '⚡ Hızlı Ekleme:'
      ),
      
      // Parametreler
      availableParameters.length > 0 && React.createElement('div', { style: { display: 'flex', gap: '3px', flexWrap: 'wrap' } },
        ...availableParameters.map(param =>
          React.createElement('button', {
            key: param,
            type: 'button',
            onClick: () => insertQuickFunction(param),
            className: 'btn btn-sm btn-outline-primary',
            style: { fontSize: '0.75em' }
          }, param)
        )
      ),
      
      // Operatörler
      React.createElement('div', { style: { display: 'flex', gap: '3px', flexWrap: 'wrap', marginTop: '5px' } },
        ...operators.slice(0, 6).map(op =>
          React.createElement('button', {
            key: op.symbol,
            type: 'button',
            onClick: () => insertQuickFunction(op.symbol),
            className: 'btn btn-sm btn-outline-secondary',
            style: { fontSize: '0.75em' },
            title: op.description
          }, op.symbol)
        )
      ),
      
      // Yaygın fonksiyonlar
      React.createElement('div', { style: { display: 'flex', gap: '3px', flexWrap: 'wrap', marginTop: '5px' } },
        ...['SQRT(', 'ROUND(', 'IF(', 'MAX(', 'MIN('].map(func =>
          React.createElement('button', {
            key: func,
            type: 'button',
            onClick: () => insertQuickFunction(func),
            className: 'btn btn-sm btn-outline-success',
            style: { fontSize: '0.75em' }
          }, func)
        )
      )
    ),
    
    // Stil tanımları
    React.createElement('style', null, `
      .enhanced-formula-editor {
        position: relative;
      }
      
      .formula-editor-container {
        position: relative;
      }
      
      .formula-textarea {
        resize: vertical;
        min-height: 80px;
      }
      
      .formula-parameter {
        color: #007bff;
        font-weight: bold;
      }
      
      .formula-function {
        color: #28a745;
        font-weight: bold;
      }
      
      .formula-suggestions {
        margin-top: 2px;
      }
      
      .suggestion-item:hover {
        background-color: #f8f9fa !important;
      }
    `)
  )
}

export default EnhancedFormulaEditor