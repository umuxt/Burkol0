import React, { useState } from 'react'
import { ChevronDown, ChevronRight, DollarSign } from 'lucide-react'

/**
 * CurrencyAccordion - Para Birimi & Döviz Kuru Akordeonu
 * 
 * Props:
 * - currency: string (TRY, USD, EUR, GBP)
 * - exchangeRate: number
 * - onChange: (field, value) => void
 * - defaultOpen: boolean
 */
export default function CurrencyAccordion({ 
  currency = 'TRY', 
  exchangeRate = 1.0, 
  onChange,
  defaultOpen = false 
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen)

  const currencies = [
    { code: 'TRY', label: 'TRY - Türk Lirası' },
    { code: 'USD', label: 'USD - Amerikan Doları' },
    { code: 'EUR', label: 'EUR - Euro' },
    { code: 'GBP', label: 'GBP - İngiliz Sterlini' }
  ]

  const handleCurrencyChange = (newCurrency) => {
    onChange('currency', newCurrency)
    // TRY seçilirse kuru 1'e resetle
    if (newCurrency === 'TRY') {
      onChange('exchangeRate', 1.0)
    }
  }

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      {/* Header */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-12 bg-gray-50 hover:bg-gray-100 transition-colors"
      >
        <div className="flex items-center gap-8">
          <DollarSign size={16} className="text-gray-500" />
          <span className="font-medium text-sm">Para Birimi & Kur</span>
          {currency !== 'TRY' && (
            <span className="text-xs bg-blue-100 text-blue-700 px-6 py-2 rounded">
              {currency} - Kur: {exchangeRate}
            </span>
          )}
        </div>
        {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
      </button>

      {/* Content */}
      {isOpen && (
        <div className="p-12 bg-white border-t border-gray-200">
          <div className="grid grid-cols-2 gap-12">
            {/* Para Birimi */}
            <div>
              <label className="text-xs text-gray-600 mb-4 block">Para Birimi</label>
              <select
                className="mes-filter-select w-full"
                value={currency}
                onChange={(e) => handleCurrencyChange(e.target.value)}
              >
                {currencies.map(c => (
                  <option key={c.code} value={c.code}>{c.label}</option>
                ))}
              </select>
            </div>

            {/* Döviz Kuru */}
            <div>
              <label className="text-xs text-gray-600 mb-4 block">
                Döviz Kuru {currency !== 'TRY' && <span className="text-red-500">*</span>}
              </label>
              <input
                type="number"
                step="0.0001"
                min="0"
                className="mes-filter-input is-compact w-full"
                value={exchangeRate}
                onChange={(e) => onChange('exchangeRate', parseFloat(e.target.value) || 1.0)}
                disabled={currency === 'TRY'}
                placeholder={currency === 'TRY' ? '1.0000' : 'Örn: 34.5000'}
              />
              {currency !== 'TRY' && (
                <p className="text-xs text-gray-500 mt-4">
                  1 {currency} = {exchangeRate} TRY
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
