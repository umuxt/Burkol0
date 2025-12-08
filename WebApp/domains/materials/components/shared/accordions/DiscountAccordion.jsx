import React, { useState } from 'react'
import { ChevronDown, ChevronRight, Percent } from 'lucide-react'

/**
 * DiscountAccordion - İskonto Ayarları Akordeonu
 * 
 * Props:
 * - enableLineDiscount: boolean (her kalemde iskonto alanı açılsın mı)
 * - enableGeneralDiscount: boolean (genel iskonto uygulansın mı)
 * - discountType: 'percent' | 'amount' | null
 * - discountValue: number
 * - onChange: (field, value) => void
 * - defaultOpen: boolean
 */
export default function DiscountAccordion({ 
  enableLineDiscount = false,
  enableGeneralDiscount = false,
  discountType = null,
  discountValue = 0,
  onChange,
  defaultOpen = false 
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen)

  const hasDiscount = enableLineDiscount || enableGeneralDiscount

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      {/* Header */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-12 bg-gray-50 hover:bg-gray-100 transition-colors"
      >
        <div className="flex items-center gap-8">
          <Percent size={16} className="text-gray-500" />
          <span className="font-medium text-sm">İskonto Ayarları</span>
          {hasDiscount && (
            <span className="text-xs bg-green-100 text-green-700 px-6 py-2 rounded">
              İskonto Aktif
            </span>
          )}
        </div>
        {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
      </button>

      {/* Content */}
      {isOpen && (
        <div className="p-12 bg-white border-t border-gray-200 space-y-12">
          {/* Satır İskontosu */}
          <div className="flex items-start gap-8">
            <input
              type="checkbox"
              id="enableLineDiscount"
              checked={enableLineDiscount}
              onChange={(e) => onChange('enableLineDiscount', e.target.checked)}
              className="mt-4"
            />
            <div>
              <label htmlFor="enableLineDiscount" className="text-sm font-medium cursor-pointer">
                Satır İskontosu Uygula
              </label>
              <p className="text-xs text-gray-500 mt-2">
                Her kalemde ayrı iskonto yüzdesi girilebilir
              </p>
            </div>
          </div>

          {/* Genel İskonto */}
          <div className="flex items-start gap-8">
            <input
              type="checkbox"
              id="enableGeneralDiscount"
              checked={enableGeneralDiscount}
              onChange={(e) => {
                onChange('enableGeneralDiscount', e.target.checked)
                if (!e.target.checked) {
                  onChange('discountType', null)
                  onChange('discountValue', 0)
                }
              }}
              className="mt-4"
            />
            <div className="flex-1">
              <label htmlFor="enableGeneralDiscount" className="text-sm font-medium cursor-pointer">
                Genel İskonto Uygula
              </label>
              <p className="text-xs text-gray-500 mt-2">
                Tüm kalemlere toplam iskonto uygulanır
              </p>

              {/* Genel iskonto detayları */}
              {enableGeneralDiscount && (
                <div className="mt-8 p-8 bg-gray-50 rounded-lg">
                  <div className="flex gap-8 mb-8">
                    <label className="flex items-center gap-4 cursor-pointer">
                      <input
                        type="radio"
                        name="discountType"
                        checked={discountType === 'percent'}
                        onChange={() => onChange('discountType', 'percent')}
                      />
                      <span className="text-sm">Yüzde (%)</span>
                    </label>
                    <label className="flex items-center gap-4 cursor-pointer">
                      <input
                        type="radio"
                        name="discountType"
                        checked={discountType === 'amount'}
                        onChange={() => onChange('discountType', 'amount')}
                      />
                      <span className="text-sm">Tutar (TL)</span>
                    </label>
                  </div>

                  <div className="flex items-center gap-8">
                    <input
                      type="number"
                      min="0"
                      step={discountType === 'percent' ? '0.01' : '1'}
                      max={discountType === 'percent' ? '100' : undefined}
                      className="mes-filter-input is-compact"
                      style={{ width: '120px' }}
                      value={discountValue}
                      onChange={(e) => onChange('discountValue', parseFloat(e.target.value) || 0)}
                      placeholder={discountType === 'percent' ? '0.00' : '0'}
                    />
                    <span className="text-sm text-gray-600">
                      {discountType === 'percent' ? '%' : 'TL'}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
