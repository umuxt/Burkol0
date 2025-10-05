// Advanced pricing rules editor covering conditional logic, discounts, and material overrides
import React from 'react';
import API from '../../lib/api.js'

const { useState, useEffect } = React;

export default function AdvancedPriceRules({ t, showNotification }) {
  // Core state
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  
  // Advanced price rules state
  const [priceRules, setPriceRules] = useState({
    quantityDiscounts: [],
    materialMultipliers: [],
    conditionalRules: [],
    priceHistory: {
      enabled: true,
      retentionDays: 90
    }
  })
  
  // Form fields for dynamic conditions
  const [formFields, setFormFields] = useState([])
  
  // UI state
  const [activeSection, setActiveSection] = useState('quantity')
  const [showAddModal, setShowAddModal] = useState(false)
  const [modalType, setModalType] = useState('')
  
  useEffect(() => {
    loadAdvancedRules()
    loadFormFields()
  }, [])

  async function loadAdvancedRules() {
    try {
      setLoading(true)
      const settings = await API.getSettings()
      if (settings.advancedPriceRules) {
        setPriceRules(settings.advancedPriceRules)
      }
    } catch (error) {
      console.error('Advanced price rules load error:', error)
      showNotification('Gelişmiş fiyat kuralları yüklenemedi!', 'error')
    } finally {
      setLoading(false)
    }
  }

  async function loadFormFields() {
    try {
      const response = await API.getFormFields()
      setFormFields(response.fields || [])
    } catch (error) {
      console.error('Form fields load error:', error)
    }
  }

  async function saveAdvancedRules() {
    try {
      setSaving(true)
      const settings = await API.getSettings()
      await API.saveSettings({
        ...settings,
        advancedPriceRules: priceRules
      })
      showNotification('Gelişmiş fiyat kuralları kaydedildi!', 'success')
    } catch (error) {
      console.error('Advanced price rules save error:', error)
      showNotification('Gelişmiş fiyat kuralları kaydedilemedi!', 'error')
    } finally {
      setSaving(false)
    }
  }

  // Quantity Discount Functions
  function addQuantityDiscount() {
    const newDiscount = {
      id: Date.now().toString(),
      name: 'Yeni Miktar İndirimi',
      minQuantity: 1,
      maxQuantity: null,
      discountType: 'percentage', // percentage, fixed, multiplier
      discountValue: 0,
      enabled: true
    }
    setPriceRules(prev => ({
      ...prev,
      quantityDiscounts: [...prev.quantityDiscounts, newDiscount]
    }))
  }

  function updateQuantityDiscount(id, updates) {
    setPriceRules(prev => ({
      ...prev,
      quantityDiscounts: prev.quantityDiscounts.map(discount =>
        discount.id === id ? { ...discount, ...updates } : discount
      )
    }))
  }

  function removeQuantityDiscount(id) {
    setPriceRules(prev => ({
      ...prev,
      quantityDiscounts: prev.quantityDiscounts.filter(discount => discount.id !== id)
    }))
  }

  // Material Multiplier Functions
  function addMaterialMultiplier() {
    const newMultiplier = {
      id: Date.now().toString(),
      name: 'Yeni Malzeme Çarpanı',
      fieldId: '',
      fieldValue: '',
      multiplier: 1.0,
      description: '',
      enabled: true
    }
    setPriceRules(prev => ({
      ...prev,
      materialMultipliers: [...prev.materialMultipliers, newMultiplier]
    }))
  }

  function updateMaterialMultiplier(id, updates) {
    setPriceRules(prev => ({
      ...prev,
      materialMultipliers: prev.materialMultipliers.map(multiplier =>
        multiplier.id === id ? { ...multiplier, ...updates } : multiplier
      )
    }))
  }

  function removeMaterialMultiplier(id) {
    setPriceRules(prev => ({
      ...prev,
      materialMultipliers: prev.materialMultipliers.filter(multiplier => multiplier.id !== id)
    }))
  }

  // Conditional Rule Functions
  function addConditionalRule() {
    const newRule = {
      id: Date.now().toString(),
      name: 'Yeni Koşullu Kural',
      conditions: [],
      action: {
        type: 'multiply', // multiply, add, subtract, setFixed
        value: 1.0
      },
      priority: 1,
      enabled: true
    }
    setPriceRules(prev => ({
      ...prev,
      conditionalRules: [...prev.conditionalRules, newRule]
    }))
  }

  function updateConditionalRule(id, updates) {
    setPriceRules(prev => ({
      ...prev,
      conditionalRules: prev.conditionalRules.map(rule =>
        rule.id === id ? { ...rule, ...updates } : rule
      )
    }))
  }

  function removeConditionalRule(id) {
    setPriceRules(prev => ({
      ...prev,
      conditionalRules: prev.conditionalRules.filter(rule => rule.id !== id)
    }))
  }

  if (loading) {
    return React.createElement('div', { className: 'advanced-price-rules loading' },
      React.createElement('div', { style: { textAlign: 'center', padding: '40px' } },
        React.createElement('div', { className: 'spinner' }),
        React.createElement('p', null, 'Gelişmiş fiyat kuralları yükleniyor...')
      )
    )
  }

  return React.createElement('div', { className: 'advanced-price-rules' },
    React.createElement('div', { className: 'page-header' },
      React.createElement('h2', null, '🎯 Gelişmiş Fiyat Kuralları'),
      React.createElement('p', null, 'Koşullu fiyatlandırma, miktar indirimleri ve malzeme çarpanları')
    ),

    // Section Tabs
    React.createElement('div', { className: 'section-tabs' },
      React.createElement('button', {
        className: `tab ${activeSection === 'quantity' ? 'active' : ''}`,
        onClick: () => setActiveSection('quantity')
      }, '📊 Miktar İndirimleri'),
      React.createElement('button', {
        className: `tab ${activeSection === 'material' ? 'active' : ''}`,
        onClick: () => setActiveSection('material')
      }, '🔧 Malzeme Çarpanları'),
      React.createElement('button', {
        className: `tab ${activeSection === 'conditional' ? 'active' : ''}`,
        onClick: () => setActiveSection('conditional')
      }, '⚡ Koşullu Kurallar'),
      React.createElement('button', {
        className: `tab ${activeSection === 'history' ? 'active' : ''}`,
        onClick: () => setActiveSection('history')
      }, '📈 Fiyat Geçmişi')
    ),

    // Quantity Discounts Section
    activeSection === 'quantity' && React.createElement('div', { className: 'section-content' },
      React.createElement('div', { className: 'section-header' },
        React.createElement('h3', null, '📊 Miktar Bazlı İndirimler'),
        React.createElement('button', {
          className: 'btn accent',
          onClick: addQuantityDiscount
        }, '+ Yeni İndirim')
      ),
      React.createElement('div', { className: 'rules-list' },
        priceRules.quantityDiscounts.map(discount =>
          React.createElement(QuantityDiscountCard, {
            key: discount.id,
            discount,
            onUpdate: (updates) => updateQuantityDiscount(discount.id, updates),
            onRemove: () => removeQuantityDiscount(discount.id)
          })
        ),
        priceRules.quantityDiscounts.length === 0 && React.createElement('div', { className: 'empty-state' },
          'Henüz miktar indirimi tanımlanmamış'
        )
      )
    ),

    // Material Multipliers Section  
    activeSection === 'material' && React.createElement('div', { className: 'section-content' },
      React.createElement('div', { className: 'section-header' },
        React.createElement('h3', null, '🔧 Malzeme Çarpanları'),
        React.createElement('button', {
          className: 'btn accent',
          onClick: addMaterialMultiplier
        }, '+ Yeni Çarpan')
      ),
      React.createElement('div', { className: 'rules-list' },
        priceRules.materialMultipliers.map(multiplier =>
          React.createElement(MaterialMultiplierCard, {
            key: multiplier.id,
            multiplier,
            formFields,
            onUpdate: (updates) => updateMaterialMultiplier(multiplier.id, updates),
            onRemove: () => removeMaterialMultiplier(multiplier.id)
          })
        ),
        priceRules.materialMultipliers.length === 0 && React.createElement('div', { className: 'empty-state' },
          'Henüz malzeme çarpanı tanımlanmamış'
        )
      )
    ),

    // Conditional Rules Section
    activeSection === 'conditional' && React.createElement('div', { className: 'section-content' },
      React.createElement('div', { className: 'section-header' },
        React.createElement('h3', null, '⚡ Koşullu Fiyatlandırma Kuralları'),
        React.createElement('button', {
          className: 'btn accent',
          onClick: addConditionalRule
        }, '+ Yeni Kural')
      ),
      React.createElement('div', { className: 'rules-list' },
        priceRules.conditionalRules.map(rule =>
          React.createElement(ConditionalRuleCard, {
            key: rule.id,
            rule,
            formFields,
            onUpdate: (updates) => updateConditionalRule(rule.id, updates),
            onRemove: () => removeConditionalRule(rule.id)
          })
        ),
        priceRules.conditionalRules.length === 0 && React.createElement('div', { className: 'empty-state' },
          'Henüz koşullu kural tanımlanmamış'
        )
      )
    ),

    // Price History Section
    activeSection === 'history' && React.createElement('div', { className: 'section-content' },
      React.createElement('div', { className: 'section-header' },
        React.createElement('h3', null, '📈 Fiyat Geçmişi Ayarları')
      ),
      React.createElement('div', { className: 'history-settings' },
        React.createElement('div', { className: 'field' },
          React.createElement('label', null,
            React.createElement('input', {
              type: 'checkbox',
              checked: priceRules.priceHistory.enabled,
              onChange: (e) => setPriceRules(prev => ({
                ...prev,
                priceHistory: { ...prev.priceHistory, enabled: e.target.checked }
              }))
            }),
            ' Fiyat geçmişi takibini etkinleştir'
          )
        ),
        priceRules.priceHistory.enabled && React.createElement('div', { className: 'field' },
          React.createElement('label', null, 'Geçmiş Saklama Süresi (Gün)'),
          React.createElement('input', {
            type: 'number',
            value: priceRules.priceHistory.retentionDays,
            min: 1,
            max: 365,
            onChange: (e) => setPriceRules(prev => ({
              ...prev,
              priceHistory: { ...prev.priceHistory, retentionDays: parseInt(e.target.value) || 90 }
            }))
          })
        )
      )
    ),

    // Save Button
    React.createElement('div', { className: 'form-actions' },
      React.createElement('button', {
        className: 'btn accent',
        onClick: saveAdvancedRules,
        disabled: saving
      }, saving ? 'Kaydediliyor...' : 'Değişiklikleri Kaydet')
    )
  )
}

// Quantity Discount Card Component
function QuantityDiscountCard({ discount, onUpdate, onRemove }) {
  return React.createElement('div', { className: 'rule-card' },
    React.createElement('div', { className: 'rule-header' },
      React.createElement('input', {
        type: 'text',
        value: discount.name,
        onChange: (e) => onUpdate({ name: e.target.value }),
        className: 'rule-name'
      }),
      React.createElement('label', { className: 'toggle' },
        React.createElement('input', {
          type: 'checkbox',
          checked: discount.enabled,
          onChange: (e) => onUpdate({ enabled: e.target.checked })
        }),
        React.createElement('span', { className: 'slider' })
      )
    ),
    React.createElement('div', { className: 'rule-body' },
      React.createElement('div', { className: 'form-grid' },
        React.createElement('div', { className: 'field' },
          React.createElement('label', null, 'Min Miktar'),
          React.createElement('input', {
            type: 'number',
            value: discount.minQuantity,
            min: 1,
            onChange: (e) => onUpdate({ minQuantity: parseInt(e.target.value) || 1 })
          })
        ),
        React.createElement('div', { className: 'field' },
          React.createElement('label', null, 'Max Miktar'),
          React.createElement('input', {
            type: 'number',
            value: discount.maxQuantity || '',
            placeholder: 'Sınırsız',
            onChange: (e) => onUpdate({ maxQuantity: e.target.value ? parseInt(e.target.value) : null })
          })
        ),
        React.createElement('div', { className: 'field' },
          React.createElement('label', null, 'İndirim Türü'),
          React.createElement('select', {
            value: discount.discountType,
            onChange: (e) => onUpdate({ discountType: e.target.value })
          },
            React.createElement('option', { value: 'percentage' }, 'Yüzde (%)'),
            React.createElement('option', { value: 'fixed' }, 'Sabit Tutar'),
            React.createElement('option', { value: 'multiplier' }, 'Çarpan')
          )
        ),
        React.createElement('div', { className: 'field' },
          React.createElement('label', null, 'İndirim Değeri'),
          React.createElement('input', {
            type: 'number',
            value: discount.discountValue,
            step: discount.discountType === 'percentage' ? '1' : '0.01',
            onChange: (e) => onUpdate({ discountValue: parseFloat(e.target.value) || 0 })
          })
        )
      )
    ),
    React.createElement('div', { className: 'rule-actions' },
      React.createElement('button', {
        className: 'btn danger',
        onClick: onRemove
      }, 'Sil')
    )
  )
}

// Material Multiplier Card Component
function MaterialMultiplierCard({ multiplier, formFields, onUpdate, onRemove }) {
  return React.createElement('div', { className: 'rule-card' },
    React.createElement('div', { className: 'rule-header' },
      React.createElement('input', {
        type: 'text',
        value: multiplier.name,
        onChange: (e) => onUpdate({ name: e.target.value }),
        className: 'rule-name'
      }),
      React.createElement('label', { className: 'toggle' },
        React.createElement('input', {
          type: 'checkbox',
          checked: multiplier.enabled,
          onChange: (e) => onUpdate({ enabled: e.target.checked })
        }),
        React.createElement('span', { className: 'slider' })
      )
    ),
    React.createElement('div', { className: 'rule-body' },
      React.createElement('div', { className: 'form-grid' },
        React.createElement('div', { className: 'field' },
          React.createElement('label', null, 'Form Alanı'),
          React.createElement('select', {
            value: multiplier.fieldId,
            onChange: (e) => onUpdate({ fieldId: e.target.value })
          },
            React.createElement('option', { value: '' }, 'Alan Seçin'),
            formFields.map(field =>
              React.createElement('option', { key: field.id, value: field.id }, field.label)
            )
          )
        ),
        React.createElement('div', { className: 'field' },
          React.createElement('label', null, 'Alan Değeri'),
          React.createElement('input', {
            type: 'text',
            value: multiplier.fieldValue,
            onChange: (e) => onUpdate({ fieldValue: e.target.value }),
            placeholder: 'Hedef değer'
          })
        ),
        React.createElement('div', { className: 'field' },
          React.createElement('label', null, 'Çarpan'),
          React.createElement('input', {
            type: 'number',
            value: multiplier.multiplier,
            step: '0.01',
            onChange: (e) => onUpdate({ multiplier: parseFloat(e.target.value) || 1.0 })
          })
        ),
        React.createElement('div', { className: 'field' },
          React.createElement('label', null, 'Açıklama'),
          React.createElement('input', {
            type: 'text',
            value: multiplier.description,
            onChange: (e) => onUpdate({ description: e.target.value }),
            placeholder: 'Opsiyonel açıklama'
          })
        )
      )
    ),
    React.createElement('div', { className: 'rule-actions' },
      React.createElement('button', {
        className: 'btn danger',
        onClick: onRemove
      }, 'Sil')
    )
  )
}

// Conditional Rule Card Component
function ConditionalRuleCard({ rule, formFields, onUpdate, onRemove }) {
  return React.createElement('div', { className: 'rule-card' },
    React.createElement('div', { className: 'rule-header' },
      React.createElement('input', {
        type: 'text',
        value: rule.name,
        onChange: (e) => onUpdate({ name: e.target.value }),
        className: 'rule-name'
      }),
      React.createElement('label', { className: 'toggle' },
        React.createElement('input', {
          type: 'checkbox',
          checked: rule.enabled,
          onChange: (e) => onUpdate({ enabled: e.target.checked })
        }),
        React.createElement('span', { className: 'slider' })
      )
    ),
    React.createElement('div', { className: 'rule-body' },
      React.createElement('div', { className: 'form-grid' },
        React.createElement('div', { className: 'field' },
          React.createElement('label', null, 'Öncelik'),
          React.createElement('input', {
            type: 'number',
            value: rule.priority,
            min: 1,
            onChange: (e) => onUpdate({ priority: parseInt(e.target.value) || 1 })
          })
        ),
        React.createElement('div', { className: 'field' },
          React.createElement('label', null, 'Aksiyon Türü'),
          React.createElement('select', {
            value: rule.action.type,
            onChange: (e) => onUpdate({ 
              action: { ...rule.action, type: e.target.value }
            })
          },
            React.createElement('option', { value: 'multiply' }, 'Çarp'),
            React.createElement('option', { value: 'add' }, 'Ekle'),
            React.createElement('option', { value: 'subtract' }, 'Çıkar'),
            React.createElement('option', { value: 'setFixed' }, 'Sabit Fiyat')
          )
        ),
        React.createElement('div', { className: 'field' },
          React.createElement('label', null, 'Aksiyon Değeri'),
          React.createElement('input', {
            type: 'number',
            value: rule.action.value,
            step: '0.01',
            onChange: (e) => onUpdate({ 
              action: { ...rule.action, value: parseFloat(e.target.value) || 0 }
            })
          })
        )
      ),
      React.createElement('div', { className: 'conditions-section' },
        React.createElement('h4', null, 'Koşullar'),
        React.createElement('p', { className: 'help-text' }, 
          'Bu kuralın uygulanması için gereken koşulları tanımlayın'
        ),
        React.createElement('div', { className: 'empty-state' },
          'Koşul editörü yakında eklenecek...'
        )
      )
    ),
    React.createElement('div', { className: 'rule-actions' },
      React.createElement('button', {
        className: 'btn danger',
        onClick: onRemove
      }, 'Sil')
    )
  )
}
