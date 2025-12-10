import React, { useState } from 'react'
import { ChevronDown, ChevronRight, Truck, User, Calendar, ClipboardList } from 'lucide-react'

/**
 * TransportAccordion - Taşıma Bilgileri Akordeonu
 * UBL-TR standartlarına uygun taşıma bilgileri
 * 
 * Props:
 * - driverName: string (şoför adı - zorunlu)
 * - driverTc: string (şoför TC - zorunlu, 11 haneli)
 * - plateNumber: string (plaka - zorunlu, TR format)
 * - deliveryPerson: string (teslim eden kişi - opsiyonel)
 * - receiverPerson: string (teslim alan kişi - opsiyonel)
 * - deliveryNote: string (teslimat notu - opsiyonel)
 * - waybillDate: string (günlük tarihi - varsayılan: bugün)
 * - onChange: (field, value) => void
 * - defaultOpen: boolean
 */
export default function TransportAccordion({
    driverName = '',
    driverTc = '',
    plateNumber = '',
    deliveryPerson = '',
    receiverPerson = '',
    deliveryNote = '',
    waybillDate = new Date().toISOString().split('T')[0],
    onChange,
    defaultOpen = false
}) {
    const [isOpen, setIsOpen] = useState(defaultOpen)
    const [errors, setErrors] = useState({})

    // TC Validasyonu
    const validateTc = (tc) => {
        if (!tc) return true // Boş ise validasyon yok
        if (tc.length !== 11) return false
        if (!/^\d{11}$/.test(tc)) return false
        return true
    }

    // Plaka Validasyonu (TR format: 01ABC123)
    const validatePlate = (plate) => {
        if (!plate) return true // Boş ise validasyon yok
        const cleanPlate = plate.replace(/\s/g, '').toUpperCase()
        // Format: 01-81 + 1-3 harf + 2-4 rakam
        return /^(0[1-9]|[1-7][0-9]|8[01])[A-Z]{1,3}\d{2,4}$/.test(cleanPlate)
    }

    // Handle change with validation
    const handleChange = (field, value) => {
        const newErrors = { ...errors }

        if (field === 'driverTc') {
            if (value && !validateTc(value)) {
                newErrors.driverTc = 'TC Kimlik No 11 haneli olmalıdır'
            } else {
                delete newErrors.driverTc
            }
        }

        if (field === 'plateNumber') {
            const cleanValue = value.toUpperCase()
            if (value && !validatePlate(cleanValue)) {
                newErrors.plateNumber = 'Geçerli bir plaka giriniz (örn: 34ABC123)'
            } else {
                delete newErrors.plateNumber
            }
            value = cleanValue
        }

        setErrors(newErrors)
        onChange(field, value)
    }

    const hasRequiredData = driverName && driverTc && plateNumber
    const hasAnyData = driverName || driverTc || plateNumber || deliveryPerson || receiverPerson || deliveryNote

    return (
        <div className="shipment-accordion">
            {/* Header */}
            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className="shipment-accordion-header"
            >
                <div className="shipment-accordion-header-left">
                    <Truck size={14} />
                    <span className="shipment-accordion-title">Taşıma Bilgileri</span>
                    {hasRequiredData && (
                        <span className="text-xs bg-green-100 text-green-700 px-6 py-2 rounded ml-8">
                            ✓ Dolu
                        </span>
                    )}
                    {!hasRequiredData && hasAnyData && (
                        <span className="text-xs bg-yellow-100 text-yellow-700 px-6 py-2 rounded ml-8">
                            Eksik
                        </span>
                    )}
                </div>
                {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>

            {/* Content */}
            {isOpen && (
                <div className="shipment-accordion-content">
                    {/* Taşıma Bilgileri Grubu */}
                    <div className="space-y-12">
                        <h4 className="text-sm font-semibold text-gray-700 border-b border-gray-200 pb-6">
                            Taşıyıcı Bilgileri
                        </h4>

                        {/* Şoför Adı */}
                        <div>
                            <label className="flex items-center gap-6 text-sm font-medium text-gray-700 mb-6">
                                <User size={14} className="text-gray-400" />
                                Şoför Adı <span className="text-red-500">*</span>
                            </label>
                            <input
                                type="text"
                                className="mes-filter-input w-full"
                                placeholder="Ad Soyad"
                                value={driverName}
                                onChange={(e) => handleChange('driverName', e.target.value)}
                                maxLength={100}
                                required
                            />
                        </div>

                        {/* Şoför TC */}
                        <div>
                            <label className="flex items-center gap-6 text-sm font-medium text-gray-700 mb-6">
                                <User size={14} className="text-gray-400" />
                                Şoför TC Kimlik No <span className="text-red-500">*</span>
                            </label>
                            <input
                                type="text"
                                className={`mes-filter-input w-full ${errors.driverTc ? 'border-red-500' : ''}`}
                                placeholder="12345678901"
                                value={driverTc}
                                onChange={(e) => handleChange('driverTc', e.target.value)}
                                maxLength={11}
                                pattern="\d{11}"
                                required
                            />
                            {errors.driverTc && (
                                <p className="text-xs text-red-500 mt-4">{errors.driverTc}</p>
                            )}
                            <p className="text-xs text-gray-500 mt-4">
                                11 haneli TC kimlik numarası
                            </p>
                        </div>

                        {/* Plaka */}
                        <div>
                            <label className="flex items-center gap-6 text-sm font-medium text-gray-700 mb-6">
                                <Truck size={14} className="text-gray-400" />
                                Araç Plakası <span className="text-red-500">*</span>
                            </label>
                            <input
                                type="text"
                                className={`mes-filter-input w-full ${errors.plateNumber ? 'border-red-500' : ''}`}
                                placeholder="34ABC123"
                                value={plateNumber}
                                onChange={(e) => handleChange('plateNumber', e.target.value)}
                                maxLength={10}
                                required
                            />
                            {errors.plateNumber && (
                                <p className="text-xs text-red-500 mt-4">{errors.plateNumber}</p>
                            )}
                            <p className="text-xs text-gray-500 mt-4">
                                Örnek format: 34ABC123 veya 06DEF4567
                            </p>
                        </div>
                    </div>

                    {/* Teslimat Bilgileri Grubu */}
                    <div className="space-y-12 pt-16 border-t border-gray-200">
                        <h4 className="text-sm font-semibold text-gray-700 border-b border-gray-200 pb-6">
                            Teslimat Bilgileri (Opsiyonel)
                        </h4>

                        {/* Teslim Eden Kişi */}
                        <div>
                            <label className="flex items-center gap-6 text-sm font-medium text-gray-700 mb-6">
                                <User size={14} className="text-gray-400" />
                                Teslim Eden Kişi
                            </label>
                            <input
                                type="text"
                                className="mes-filter-input w-full"
                                placeholder="Teslim eden personel adı"
                                value={deliveryPerson}
                                onChange={(e) => handleChange('deliveryPerson', e.target.value)}
                                maxLength={100}
                            />
                        </div>

                        {/* Teslim Alan Kişi */}
                        <div>
                            <label className="flex items-center gap-6 text-sm font-medium text-gray-700 mb-6">
                                <User size={14} className="text-gray-400" />
                                Teslim Alan Kişi
                            </label>
                            <input
                                type="text"
                                className="mes-filter-input w-full"
                                placeholder="Teslim alan kişi adı"
                                value={receiverPerson}
                                onChange={(e) => handleChange('receiverPerson', e.target.value)}
                                maxLength={100}
                            />
                        </div>

                        {/* Teslimat Notu */}
                        <div>
                            <label className="flex items-center gap-6 text-sm font-medium text-gray-700 mb-6">
                                <ClipboardList size={14} className="text-gray-400" />
                                Teslimat Notu
                            </label>
                            <textarea
                                className="mes-filter-input w-full"
                                rows={3}
                                placeholder="Teslimat ile ilgili özel notlar..."
                                value={deliveryNote}
                                onChange={(e) => handleChange('deliveryNote', e.target.value)}
                                maxLength={500}
                            />
                            <div className="flex justify-between mt-4">
                                <p className="text-xs text-gray-500">
                                    Teslimat sırasında önemli notlar
                                </p>
                                <span className="text-xs text-gray-400">
                                    {deliveryNote.length}/500
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Günlük Tarihi */}
                    <div className="pt-16 border-t border-gray-200">
                        <label className="flex items-center gap-6 text-sm font-medium text-gray-700 mb-6">
                            <Calendar size={14} className="text-gray-400" />
                            Günlük Tarihi
                        </label>
                        <input
                            type="date"
                            className="mes-filter-input w-full"
                            value={waybillDate}
                            onChange={(e) => handleChange('waybillDate', e.target.value)}
                            max={new Date().toISOString().split('T')[0]}
                        />
                        <p className="text-xs text-gray-500 mt-4">
                            İrsaliye için günlük kayıt tarihi (varsayılan: bugün)
                        </p>
                    </div>
                </div>
            )}
        </div>
    )
}
