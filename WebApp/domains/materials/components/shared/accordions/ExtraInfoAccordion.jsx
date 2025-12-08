import React, { useState } from 'react'
import { ChevronDown, ChevronRight, FileText, Building2, Tag } from 'lucide-react'

/**
 * ExtraInfoAccordion - Ek Bilgiler Akordeonu
 * 
 * Props:
 * - specialCode: string (özel kod - ihracat kodu vb.)
 * - costCenter: string (masraf merkezi)
 * - documentNotes: string (belge notları)
 * - projectCode: string (proje kodu - isteğe bağlı)
 * - onChange: (field, value) => void
 * - defaultOpen: boolean
 */
export default function ExtraInfoAccordion({ 
  specialCode = '',
  costCenter = '',
  documentNotes = '',
  projectCode = '',
  onChange,
  defaultOpen = false 
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen)

  const hasData = specialCode || costCenter || documentNotes || projectCode

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      {/* Header */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-12 bg-gray-50 hover:bg-gray-100 transition-colors"
      >
        <div className="flex items-center gap-8">
          <FileText size={16} className="text-gray-500" />
          <span className="font-medium text-sm">Ek Bilgiler</span>
          {hasData && (
            <span className="text-xs bg-gray-200 text-gray-600 px-6 py-2 rounded">
              Dolduruldu
            </span>
          )}
        </div>
        {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
      </button>

      {/* Content */}
      {isOpen && (
        <div className="p-12 bg-white border-t border-gray-200 space-y-16">
          {/* Özel Kod */}
          <div>
            <label className="flex items-center gap-6 text-sm font-medium text-gray-700 mb-6">
              <Tag size={14} className="text-gray-400" />
              Özel Kod
            </label>
            <input
              type="text"
              className="mes-filter-input w-full"
              placeholder="Örn: IHR-2024-001, OZEL-123"
              value={specialCode}
              onChange={(e) => onChange('specialCode', e.target.value)}
              maxLength={50}
            />
            <p className="text-xs text-gray-500 mt-4">
              İhracat kodu, referans numarası veya özel tanımlama kodu
            </p>
          </div>

          {/* Masraf Merkezi */}
          <div>
            <label className="flex items-center gap-6 text-sm font-medium text-gray-700 mb-6">
              <Building2 size={14} className="text-gray-400" />
              Masraf Merkezi
            </label>
            <input
              type="text"
              className="mes-filter-input w-full"
              placeholder="Örn: DEPO-01, URETIM-HATTI-A"
              value={costCenter}
              onChange={(e) => onChange('costCenter', e.target.value)}
              maxLength={100}
            />
            <p className="text-xs text-gray-500 mt-4">
              Muhasebe entegrasyonu için masraf merkezi tanımı
            </p>
          </div>

          {/* Proje Kodu (isteğe bağlı) */}
          <div>
            <label className="flex items-center gap-6 text-sm font-medium text-gray-700 mb-6">
              <FileText size={14} className="text-gray-400" />
              Proje Kodu
            </label>
            <input
              type="text"
              className="mes-filter-input w-full"
              placeholder="Örn: PRJ-2024-001"
              value={projectCode}
              onChange={(e) => onChange('projectCode', e.target.value)}
              maxLength={50}
            />
            <p className="text-xs text-gray-500 mt-4">
              Projeye bağlı takip için proje kodu
            </p>
          </div>

          {/* Belge Notları */}
          <div>
            <label className="flex items-center gap-6 text-sm font-medium text-gray-700 mb-6">
              <FileText size={14} className="text-gray-400" />
              Belge Notları
            </label>
            <textarea
              className="mes-filter-input w-full"
              rows={3}
              placeholder="İrsaliye veya faturaya yazılacak notlar..."
              value={documentNotes}
              onChange={(e) => onChange('documentNotes', e.target.value)}
              maxLength={500}
            />
            <div className="flex justify-between mt-4">
              <p className="text-xs text-gray-500">
                Bu not belgenin alt kısmında görünür
              </p>
              <span className="text-xs text-gray-400">
                {documentNotes.length}/500
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
