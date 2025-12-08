import React, { useState } from 'react'
import { ChevronDown, ChevronRight, Package, Hash } from 'lucide-react'

/**
 * LotSerialAccordion - Lot/Seri Numarası Akordeonu
 * 
 * Props:
 * - items: array - kalemler listesi [{id, itemName, quantity, lotNumber, serialNumber}]
 * - onItemChange: (itemId, field, value) => void
 * - defaultOpen: boolean
 * - lotTrackingEnabled: boolean - sistemde lot takibi açık mı
 */
export default function LotSerialAccordion({ 
  items = [],
  onItemChange,
  defaultOpen = false,
  lotTrackingEnabled = true
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen)

  // Lot/seri girilen kalem sayısı
  const filledCount = items.filter(item => item.lotNumber || item.serialNumber).length

  if (!lotTrackingEnabled) {
    return null // Lot takibi kapalıysa gösterme
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
          <Package size={16} className="text-gray-500" />
          <span className="font-medium text-sm">Lot/Seri Numaraları</span>
          {filledCount > 0 && (
            <span className="text-xs bg-purple-100 text-purple-700 px-6 py-2 rounded">
              {filledCount}/{items.length} kalem
            </span>
          )}
        </div>
        {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
      </button>

      {/* Content */}
      {isOpen && (
        <div className="p-12 bg-white border-t border-gray-200">
          {items.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-16">
              Henüz kalem eklenmedi
            </p>
          ) : (
            <div className="space-y-12">
              <p className="text-xs text-gray-500 mb-8">
                İrsaliye/fatura için lot ve seri numaralarını girebilirsiniz.
                Lot takipli ürünlerde bu bilgiler zorunlu olabilir.
              </p>

              {/* Kalemler Tablosu */}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="text-left p-8 font-medium text-gray-600">Kalem</th>
                      <th className="text-left p-8 font-medium text-gray-600">Miktar</th>
                      <th className="text-left p-8 font-medium text-gray-600">
                        <div className="flex items-center gap-4">
                          <Package size={14} />
                          Lot No
                        </div>
                      </th>
                      <th className="text-left p-8 font-medium text-gray-600">
                        <div className="flex items-center gap-4">
                          <Hash size={14} />
                          Seri No
                        </div>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item, index) => (
                      <tr key={item.id || index} className="border-t border-gray-100">
                        <td className="p-8">
                          <span className="font-medium">{item.itemName || `Kalem ${index + 1}`}</span>
                          {item.productCode && (
                            <span className="text-xs text-gray-400 ml-4">({item.productCode})</span>
                          )}
                        </td>
                        <td className="p-8 text-gray-600">
                          {item.quantity} {item.unit || 'adet'}
                        </td>
                        <td className="p-8">
                          <input
                            type="text"
                            className="mes-filter-input is-compact"
                            style={{ width: '120px' }}
                            placeholder="Lot numarası"
                            value={item.lotNumber || ''}
                            onChange={(e) => onItemChange(item.id, 'lotNumber', e.target.value)}
                          />
                        </td>
                        <td className="p-8">
                          <input
                            type="text"
                            className="mes-filter-input is-compact"
                            style={{ width: '120px' }}
                            placeholder="Seri numarası"
                            value={item.serialNumber || ''}
                            onChange={(e) => onItemChange(item.id, 'serialNumber', e.target.value)}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Toplu İşlem */}
              {items.length > 1 && (
                <div className="flex items-center gap-8 pt-8 border-t border-gray-100">
                  <span className="text-xs text-gray-500">Toplu İşlem:</span>
                  <button
                    type="button"
                    onClick={() => {
                      const lotNo = prompt('Tüm kalemler için lot numarası girin:')
                      if (lotNo) {
                        items.forEach(item => onItemChange(item.id, 'lotNumber', lotNo))
                      }
                    }}
                    className="text-xs text-blue-600 hover:text-blue-800"
                  >
                    Tümüne aynı lot no
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      items.forEach(item => {
                        onItemChange(item.id, 'lotNumber', '')
                        onItemChange(item.id, 'serialNumber', '')
                      })
                    }}
                    className="text-xs text-gray-500 hover:text-gray-700"
                  >
                    Tümünü temizle
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
