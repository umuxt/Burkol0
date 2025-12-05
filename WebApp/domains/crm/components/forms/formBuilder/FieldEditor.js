import { showToast } from '../../../../../shared/components/MESToast.js';
// Field Editor - Individual field creation and editing
// Updated: Options are now stored as objects { label, optionCode? }
import React from 'react';
import { FormBuilderUtils } from './FormBuilderUtils.js'

const { useState, useEffect } = React;

/**
 * Normalize option to consistent format
 * Handles both string (legacy) and object formats
 */
function normalizeOption(opt) {
  if (typeof opt === 'string') {
    return { label: opt, optionCode: null };
  }
  return {
    label: opt.label || opt.optionLabel || opt.value || opt,
    optionCode: opt.optionCode || null
  };
}

export function FieldEditor({ field, allFields = [], onSave, onCancel, fieldTypes = [], showNotification, fieldEditorRef }) {
  const [fieldForm, setFieldForm] = useState({
    id: '',
    label: '',
    type: 'text',
    required: false,
    options: [], // Array of { label, optionCode }
    placeholder: '',
    validation: { min: null, max: null, pattern: null },
    display: {
      showInTable: false,
      showInFilter: false,
      tableOrder: 10,
      formOrder: 10
    }
  })

  const [newOption, setNewOption] = useState('')

  useEffect(() => {
    if (field) {
      // Normalize incoming options to new format
      const normalizedOptions = (field.options || []).map(normalizeOption);
      
      setFieldForm({
        ...field,
        options: normalizedOptions,
        validation: field.validation || { min: null, max: null, pattern: null },
        display: field.display || {
          showInTable: false,
          showInFilter: false,
          tableOrder: 10,
          formOrder: 10
        }
      })
    }
  }, [field])

  function updateFieldForm(key, value) {
    setFieldForm(prev => ({ ...prev, [key]: value }))
  }

  function updateNestedField(parentKey, childKey, value) {
    setFieldForm(prev => ({
      ...prev,
      [parentKey]: { 
        ...(prev[parentKey] || {}), 
        [childKey]: value 
      }
    }))
  }

  function addOption() {
    if (!newOption.trim()) {
      showToast('Seçenek değeri boş olamaz', 'error')
      return
    }

    // Check for duplicate labels
    const exists = fieldForm.options.some(opt => opt.label === newOption.trim());
    if (exists) {
      showToast('Bu seçenek zaten mevcut', 'error')
      return
    }

    setFieldForm(prev => ({
      ...prev,
      options: [...prev.options, { label: newOption.trim(), optionCode: null }]
    }))
    setNewOption('')
  }

  function removeOption(index) {
    setFieldForm(prev => ({
      ...prev,
      options: prev.options.filter((_, i) => i !== index)
    }))
  }

  function handleSave() {
    // 1. Alan Etiketi zorunlu
    if (!fieldForm.label || !fieldForm.label.trim()) {
      showToast('Alan etiketi zorunludur', 'error')
      return
    }

    // 2. Alan Türü zorunlu (default olarak 'text' gelir ama kontrol edelim)
    if (!fieldForm.type) {
      showToast('Alan türü seçilmelidir', 'error')
      return
    }

    // 3. Dropdown/Multiselect/Radio için seçenekler zorunlu
    if (['dropdown', 'multiselect', 'radio'].includes(fieldForm.type)) {
      if (!fieldForm.options || fieldForm.options.length === 0) {
        showToast('Seçenek listesi boş olamaz. En az bir seçenek eklemelisiniz.', 'error')
        return
      }
    }

    // 4. Tabloda göster aktifse tablo sırası olmalı
    if (fieldForm.display?.showInTable && !fieldForm.display?.tableOrder) {
      showToast('Tabloda göster aktif - Tablo sırası gereklidir', 'error')
      return
    }

    // 5. Form sırası her zaman olmalı - mevcut maxı kontrol et
    if (!fieldForm.display?.formOrder) {
      // allFields'tan max formOrder'ı bul
      const maxFormOrder = allFields && allFields.length > 0
        ? Math.max(...allFields.map(f => f.display?.formOrder || 0))
        : 0
      fieldForm.display = {
        ...fieldForm.display,
        formOrder: maxFormOrder + 1
      }
    }

    // 6. Otomatik ID oluştur (yoksa)
    if (!fieldForm.id) {
      fieldForm.id = `field_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    }

    onSave(fieldForm)
  }

  const needsOptions = ['dropdown', 'multiselect', 'radio'].includes(fieldForm.type)

  if (!field && !onSave) return null

  // PARAMETRE EKLE MODAL YAPISI - Dropdown style (butonun altında açılır)
  return React.createElement('div', {
    ref: fieldEditorRef,
    style: {
      position: 'absolute',
      top: '100%',
      right: 0,
      marginTop: '8px',
      background: 'white',
      border: '1px solid rgb(209, 213, 219)',
      borderRadius: '8px',
      boxShadow: '0 10px 25px rgba(0, 0, 0, 0.1)',
      padding: '20px',
      minWidth: '400px',
      maxWidth: '500px',
      maxHeight: 'calc(100vh - 200px)',
      overflowY: 'auto',
      zIndex: 1000
    }
  },
      // Modal Header
      React.createElement('div', {
        style: {
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '16px'
        }
      },
        React.createElement('h4', {
          style: {
            margin: 0,
            fontSize: '16px',
            fontWeight: 600,
            color: '#000'
          }
        }, field ? 'Alan Düzenle' : 'Yeni Alan Ekle'),
        
        React.createElement('button', {
          onClick: onCancel,
          style: {
            background: 'none',
            border: 'none',
            fontSize: '24px',
            cursor: 'pointer',
            color: '#666',
            padding: '0',
            lineHeight: '1'
          }
        }, '×')
      ),

      // Alan Etiketi
      React.createElement('div', {
        style: {
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          marginBottom: '4px'
        }
      },
        React.createElement('label', {
          style: {
            fontSize: '13px',
            fontWeight: 500,
            whiteSpace: 'nowrap',
            color: '#000',
            width: '110px',
            lineHeight: '30px'
          }
        }, 'Alan Etiketi *'),
        React.createElement('input', {
          type: 'text',
          value: fieldForm.label,
          onChange: (e) => updateFieldForm('label', e.target.value),
          className: 'mes-filter-input is-compact',
          placeholder: 'Örn: Müşteri Adı',
          autoFocus: true,
          style: { flex: 1 }
        })
      ),

      // Alan Türü
      React.createElement('div', {
        style: {
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          marginBottom: '4px'
        }
      },
        React.createElement('label', {
          style: {
            fontSize: '13px',
            fontWeight: 500,
            whiteSpace: 'nowrap',
            color: '#000',
            width: '110px',
            lineHeight: '30px'
          }
        }, 'Alan Türü'),
        React.createElement('select', {
          value: fieldForm.type,
          onChange: (e) => updateFieldForm('type', e.target.value),
          className: 'mes-filter-input is-compact',
          style: { flex: 1 }
        },
          ...Object.entries(FormBuilderUtils.fieldTypes).map(([typeKey, typeConfig]) =>
            React.createElement('option', { key: typeKey, value: typeKey }, typeConfig.label)
          )
        )
      ),

      // Placeholder
      React.createElement('div', {
        style: {
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          marginBottom: '4px'
        }
      },
        React.createElement('label', {
          style: {
            fontSize: '13px',
            fontWeight: 500,
            whiteSpace: 'nowrap',
            color: '#000',
            width: '110px',
            lineHeight: '30px'
          }
        }, 'Placeholder'),
        React.createElement('input', {
          type: 'text',
          value: fieldForm.placeholder,
          onChange: (e) => updateFieldForm('placeholder', e.target.value),
          className: 'mes-filter-input is-compact',
          placeholder: 'Alan için ipucu metni',
          style: { flex: 1 }
        })
      ),

      // Zorunlu alan checkbox
      React.createElement('div', {
        style: {
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          marginBottom: '12px',
          marginTop: '8px'
        }
      },
        React.createElement('label', {
          style: {
            fontSize: '13px',
            fontWeight: 400,
            color: '#000',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }
        },
          React.createElement('input', {
            type: 'checkbox',
            checked: fieldForm.required,
            onChange: (e) => updateFieldForm('required', e.target.checked),
            style: { cursor: 'pointer' }
          }),
          'Zorunlu alan'
        )
      ),

      // Doğrulama Kuralları Section
      (fieldForm.type === 'text' || fieldForm.type === 'textarea' || fieldForm.type === 'number') && 
      React.createElement('div', {
        style: {
          fontSize: '14px',
          fontWeight: 600,
          color: '#000',
          marginTop: '16px',
          marginBottom: '8px',
          paddingTop: '12px',
          borderTop: '1px solid rgb(229, 231, 235)'
        }
      }, 'Doğrulama Kuralları'),

      // Min Değer/Uzunluk
      (fieldForm.type === 'number' || fieldForm.type === 'text' || fieldForm.type === 'textarea') && 
      React.createElement('div', {
        style: {
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          marginBottom: '4px'
        }
      },
        React.createElement('label', {
          style: {
            fontSize: '13px',
            fontWeight: 500,
            whiteSpace: 'nowrap',
            color: '#000',
            width: '110px',
            lineHeight: '30px'
          }
        }, fieldForm.type === 'number' ? 'Min Değer' : 'Min Uzunluk'),
        React.createElement('input', {
          type: 'number',
          value: (fieldForm.validation && (fieldForm.validation.min ?? fieldForm.validation.minLength)) || '',
          onChange: (e) => {
            const key = fieldForm.type === 'number' ? 'min' : 'minLength'
            updateNestedField('validation', key, e.target.value ? parseInt(e.target.value) : null)
          },
          className: 'mes-filter-input is-compact',
          style: { flex: 1 }
        })
      ),

      // Max Değer/Uzunluk
      (fieldForm.type === 'number' || fieldForm.type === 'text' || fieldForm.type === 'textarea') && 
      React.createElement('div', {
        style: {
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          marginBottom: '4px'
        }
      },
        React.createElement('label', {
          style: {
            fontSize: '13px',
            fontWeight: 500,
            whiteSpace: 'nowrap',
            color: '#000',
            width: '110px',
            lineHeight: '30px'
          }
        }, fieldForm.type === 'number' ? 'Max Değer' : 'Max Uzunluk'),
        React.createElement('input', {
          type: 'number',
          value: (fieldForm.validation && (fieldForm.validation.max ?? fieldForm.validation.maxLength)) || '',
          onChange: (e) => {
            const key = fieldForm.type === 'number' ? 'max' : 'maxLength'
            updateNestedField('validation', key, e.target.value ? parseInt(e.target.value) : null)
          },
          className: 'mes-filter-input is-compact',
          style: { flex: 1 }
        })
      ),

      // Sadece tam sayı checkbox
      fieldForm.type === 'number' && React.createElement('div', {
        style: {
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          marginBottom: '8px'
        }
      },
        React.createElement('label', {
          style: {
            fontSize: '13px',
            fontWeight: 400,
            color: '#000',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }
        },
          React.createElement('input', {
            type: 'checkbox',
            checked: fieldForm.validation?.integer || false,
            onChange: (e) => updateNestedField('validation', 'integer', e.target.checked),
            style: { cursor: 'pointer' }
          }),
          'Sadece tam sayı'
        )
      ),

      // Sadece pozitif sayı checkbox
      fieldForm.type === 'number' && React.createElement('div', {
        style: {
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          marginBottom: '12px'
        }
      },
        React.createElement('label', {
          style: {
            fontSize: '13px',
            fontWeight: 400,
            color: '#000',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }
        },
          React.createElement('input', {
            type: 'checkbox',
            checked: fieldForm.validation?.positive || false,
            onChange: (e) => updateNestedField('validation', 'positive', e.target.checked),
            style: { cursor: 'pointer' }
          }),
          'Sadece pozitif sayı'
        )
      ),

      // Görünüm Ayarları Section
      React.createElement('div', {
        style: {
          fontSize: '14px',
          fontWeight: 600,
          color: '#000',
          marginTop: '16px',
          marginBottom: '8px',
          paddingTop: '12px',
          borderTop: '1px solid rgb(229, 231, 235)'
        }
      }, 'Görünüm Ayarları'),

      // Tabloda göster
      React.createElement('div', {
        style: {
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          marginBottom: '8px'
        }
      },
        React.createElement('label', {
          style: {
            fontSize: '13px',
            fontWeight: 400,
            color: '#000',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }
        },
          React.createElement('input', {
            type: 'checkbox',
            checked: fieldForm.display?.showInTable || false,
            onChange: (e) => updateNestedField('display', 'showInTable', e.target.checked),
            style: { cursor: 'pointer' }
          }),
          'Tabloda göster'
        )
      ),

      // Filtrede göster
      React.createElement('div', {
        style: {
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          marginBottom: '8px'
        }
      },
        React.createElement('label', {
          style: {
            fontSize: '13px',
            fontWeight: 400,
            color: '#000',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }
        },
          React.createElement('input', {
            type: 'checkbox',
            checked: fieldForm.display?.showInFilter || false,
            onChange: (e) => updateNestedField('display', 'showInFilter', e.target.checked),
            style: { cursor: 'pointer' }
          }),
          'Filtrede göster'
        )
      ),

      // Form Sırası
      React.createElement('div', {
        style: {
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          marginBottom: '4px'
        }
      },
        React.createElement('label', {
          style: {
            fontSize: '13px',
            fontWeight: 500,
            whiteSpace: 'nowrap',
            color: '#000',
            width: '110px',
            lineHeight: '30px'
          }
        }, 'Form Sırası'),
        React.createElement('input', {
          type: 'number',
          value: fieldForm.display?.formOrder || '',
          onChange: (e) => updateNestedField('display', 'formOrder', parseInt(e.target.value) || 10),
          className: 'mes-filter-input is-compact',
          placeholder: '10',
          style: { flex: 1 }
        })
      ),

      // Tablo Sırası (sadece tabloda göster aktifse)
      fieldForm.display?.showInTable && React.createElement('div', {
        style: {
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          marginBottom: '12px'
        }
      },
        React.createElement('label', {
          style: {
            fontSize: '13px',
            fontWeight: 500,
            whiteSpace: 'nowrap',
            color: '#000',
            width: '110px',
            lineHeight: '30px'
          }
        }, 'Tablo Sırası'),
        React.createElement('input', {
          type: 'number',
          value: fieldForm.display?.tableOrder || '',
          onChange: (e) => updateNestedField('display', 'tableOrder', parseInt(e.target.value) || 10),
          className: 'mes-filter-input is-compact',
          placeholder: '10',
          style: { flex: 1 }
        })
      ),

      // Options Section (dropdown/multiselect/radio için)
      needsOptions && React.createElement('div', {
        style: { marginBottom: '12px' }
      },
        React.createElement('div', {
          style: {
            fontSize: '14px',
            fontWeight: 600,
            color: '#000',
            marginBottom: '8px'
          }
        }, 'Seçenekler'),

        // Add option input
        React.createElement('div', {
          style: {
            display: 'flex',
            gap: '8px',
            marginBottom: '8px'
          }
        },
          React.createElement('input', {
            type: 'text',
            value: newOption,
            onChange: (e) => setNewOption(e.target.value),
            className: 'mes-filter-input is-compact',
            placeholder: 'Yeni seçenek ekle',
            style: { flex: 1 },
            onKeyPress: (e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                addOption()
              }
            }
          }),
          React.createElement('button', {
            onClick: addOption,
            className: 'mes-primary-action is-compact',
            style: {
              background: '#3b82f6',
              color: 'white',
              border: 'none',
              padding: '6px 12px',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: 500
            }
          }, 'Ekle')
        ),

        // Options list
        fieldForm.options.length > 0 && React.createElement('div', {
          style: {
            display: 'flex',
            flexDirection: 'column',
            gap: '4px'
          }
        },
          ...fieldForm.options.map((option, index) =>
            React.createElement('div', {
              key: option.optionCode || index,
              style: {
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '6px 12px',
                background: '#f9fafb',
                border: '1px solid rgb(229, 231, 235)',
                borderRadius: '6px',
                fontSize: '13px'
              }
            },
              React.createElement('span', null, option.label),
              React.createElement('button', {
                onClick: () => removeOption(index),
                style: {
                  background: 'none',
                  border: 'none',
                  color: '#ef4444',
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontWeight: 500,
                  padding: '4px 8px',
                  borderRadius: '4px'
                },
                onMouseEnter: (e) => e.target.style.background = 'rgba(239, 68, 68, 0.1)',
                onMouseLeave: (e) => e.target.style.background = 'none'
              }, 'Sil')
            )
          )
        )
      ),

      // Save and Cancel buttons (Parametre Ekle benzeri)
      React.createElement('div', {
        style: {
          display: 'flex',
          gap: '8px',
          marginTop: '16px',
          justifyContent: 'flex-end'
        }
      },
        React.createElement('button', {
          onClick: handleSave,
          className: 'mes-primary-action is-compact',
          style: {
            background: '#000',
            color: 'white',
            border: 'none',
            padding: '6px 16px',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '13px',
            fontWeight: 500,
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }
        },
          React.createElement('span', {
            dangerouslySetInnerHTML: {
              __html: '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>'
            }
          }),
          React.createElement('span', null, 'Kaydet')
        ),

        React.createElement('button', {
          onClick: onCancel,
          className: 'mes-filter-button is-compact',
          style: {
            background: '#f3f4f6',
            color: '#374151',
            border: 'none',
            padding: '6px 16px',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '13px',
            fontWeight: 500
          }
        }, 'İptal')
      )
  )
}
