import React, { useState, useEffect } from 'react'
import { ChevronDown, ChevronRight, Receipt } from 'lucide-react'

/**
 * TaxAccordion - Vergi Ayarları Akordeonu
 * 
 * Props:
 * - defaultVatRate: number (0, 1, 10, 20)
 * - withholdingRateId: number | null
 * - vatExemptionId: number | null
 * - withholdingRates: array (from API)
 * - vatExemptions: array (from API)
 * - onChange: (field, value) => void
 * - defaultOpen: boolean
 */

const VAT_RATES = [
  { value: 0, label: '%0' },
  { value: 1, label: '%1' },
  { value: 10, label: '%10' },
  { value: 20, label: '%20' }
]

export default function TaxAccordion({ 
  defaultVatRate = 20,
  withholdingRateId = null,
  vatExemptionId = null,
  withholdingRates = [],
  vatExemptions = [],
  onChange,
  defaultOpen = false 
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen)
  const [vatDropdownOpen, setVatDropdownOpen] = useState(false)
  const [withholdingDropdownOpen, setWithholdingDropdownOpen] = useState(false)
  const [exemptionDropdownOpen, setExemptionDropdownOpen] = useState(false)

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (!e.target.closest('.tax-dropdown')) {
        setVatDropdownOpen(false)
        setWithholdingDropdownOpen(false)
        setExemptionDropdownOpen(false)
      }
    }
    document.addEventListener('click', handleClickOutside)
    return () => document.removeEventListener('click', handleClickOutside)
  }, [])

  const selectedWithholding = withholdingRates.find(w => w.id === withholdingRateId)
  const selectedExemption = vatExemptions.find(e => e.id === vatExemptionId)
  const hasCustomTax = defaultVatRate !== 20 || withholdingRateId || vatExemptionId

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      {/* Header */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-12 bg-gray-50 hover:bg-gray-100 transition-colors"
      >
        <div className="flex items-center gap-8">
          <Receipt size={16} className="text-gray-500" />
          <span className="font-medium text-sm">Vergi Ayarları</span>
          {hasCustomTax && (
            <span className="text-xs bg-blue-100 text-blue-700 px-6 py-2 rounded">
              Özel Ayar
            </span>
          )}
        </div>
        {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
      </button>

      {/* Content */}
      {isOpen && (
        <div className="p-12 bg-white border-t border-gray-200 space-y-16">
          {/* Varsayılan KDV Oranı */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-6">
              Varsayılan KDV Oranı
            </label>
            <div className="tax-dropdown relative inline-block">
              <button
                type="button"
                onClick={() => {
                  setVatDropdownOpen(!vatDropdownOpen)
                  setWithholdingDropdownOpen(false)
                  setExemptionDropdownOpen(false)
                }}
                className="flex items-center justify-between gap-8 px-12 py-8 border border-gray-300 rounded-lg bg-white min-w-[120px] hover:border-gray-400"
              >
                <span>%{defaultVatRate}</span>
                <ChevronDown size={14} className="text-gray-400" />
              </button>
              
              {vatDropdownOpen && (
                <div className="absolute z-50 top-full left-0 mt-4 bg-white border border-gray-200 rounded-lg shadow-lg min-w-[120px]">
                  {VAT_RATES.map(rate => (
                    <button
                      key={rate.value}
                      type="button"
                      onClick={() => {
                        onChange('defaultVatRate', rate.value)
                        setVatDropdownOpen(false)
                      }}
                      className={`w-full text-left px-12 py-8 text-sm hover:bg-gray-50 first:rounded-t-lg last:rounded-b-lg
                        ${defaultVatRate === rate.value ? 'bg-blue-50 text-blue-700' : ''}`}
                    >
                      {rate.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <p className="text-xs text-gray-500 mt-4">
              Kalemlerde KDV belirtilmemişse bu oran kullanılır
            </p>
          </div>

          {/* Tevkifat Oranı */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-6">
              Tevkifat Oranı
            </label>
            <div className="tax-dropdown relative inline-block">
              <button
                type="button"
                onClick={() => {
                  setWithholdingDropdownOpen(!withholdingDropdownOpen)
                  setVatDropdownOpen(false)
                  setExemptionDropdownOpen(false)
                }}
                className="flex items-center justify-between gap-8 px-12 py-8 border border-gray-300 rounded-lg bg-white min-w-[200px] hover:border-gray-400"
              >
                <span className={!selectedWithholding ? 'text-gray-400' : ''}>
                  {selectedWithholding 
                    ? `${selectedWithholding.name} (${selectedWithholding.rate}%)`
                    : 'Tevkifat yok'}
                </span>
                <ChevronDown size={14} className="text-gray-400" />
              </button>
              
              {withholdingDropdownOpen && (
                <div className="absolute z-50 top-full left-0 mt-4 bg-white border border-gray-200 rounded-lg shadow-lg min-w-[200px] max-h-[200px] overflow-y-auto">
                  <button
                    type="button"
                    onClick={() => {
                      onChange('withholdingRateId', null)
                      setWithholdingDropdownOpen(false)
                    }}
                    className={`w-full text-left px-12 py-8 text-sm hover:bg-gray-50 
                      ${!withholdingRateId ? 'bg-blue-50 text-blue-700' : ''}`}
                  >
                    Tevkifat yok
                  </button>
                  {withholdingRates.map(rate => (
                    <button
                      key={rate.id}
                      type="button"
                      onClick={() => {
                        onChange('withholdingRateId', rate.id)
                        setWithholdingDropdownOpen(false)
                      }}
                      className={`w-full text-left px-12 py-8 text-sm hover:bg-gray-50
                        ${withholdingRateId === rate.id ? 'bg-blue-50 text-blue-700' : ''}`}
                    >
                      {rate.name} ({rate.rate}%)
                    </button>
                  ))}
                </div>
              )}
            </div>
            <p className="text-xs text-gray-500 mt-4">
              Fatura tevkifat kesintisi (hizmet faturaları için)
            </p>
          </div>

          {/* KDV İstisna */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-6">
              KDV İstisna Kodu
            </label>
            <div className="tax-dropdown relative inline-block">
              <button
                type="button"
                onClick={() => {
                  setExemptionDropdownOpen(!exemptionDropdownOpen)
                  setVatDropdownOpen(false)
                  setWithholdingDropdownOpen(false)
                }}
                className="flex items-center justify-between gap-8 px-12 py-8 border border-gray-300 rounded-lg bg-white min-w-[250px] hover:border-gray-400"
              >
                <span className={!selectedExemption ? 'text-gray-400' : ''}>
                  {selectedExemption 
                    ? `${selectedExemption.code} - ${selectedExemption.name}`
                    : 'İstisna yok'}
                </span>
                <ChevronDown size={14} className="text-gray-400" />
              </button>
              
              {exemptionDropdownOpen && (
                <div className="absolute z-50 top-full left-0 mt-4 bg-white border border-gray-200 rounded-lg shadow-lg min-w-[250px] max-h-[200px] overflow-y-auto">
                  <button
                    type="button"
                    onClick={() => {
                      onChange('vatExemptionId', null)
                      setExemptionDropdownOpen(false)
                    }}
                    className={`w-full text-left px-12 py-8 text-sm hover:bg-gray-50 
                      ${!vatExemptionId ? 'bg-blue-50 text-blue-700' : ''}`}
                  >
                    İstisna yok
                  </button>
                  {vatExemptions.map(exemption => (
                    <button
                      key={exemption.id}
                      type="button"
                      onClick={() => {
                        onChange('vatExemptionId', exemption.id)
                        setExemptionDropdownOpen(false)
                      }}
                      className={`w-full text-left px-12 py-8 text-sm hover:bg-gray-50
                        ${vatExemptionId === exemption.id ? 'bg-blue-50 text-blue-700' : ''}`}
                    >
                      {exemption.code} - {exemption.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <p className="text-xs text-gray-500 mt-4">
              İhracat, diplomatik muafiyet vb. için KDV istisna kodu
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
