import React, { useState, useEffect, useRef } from 'react'
import { X, FileText, ChevronRight, ChevronLeft, Check, Download, Upload, AlertTriangle, Loader2, File, Building2, CreditCard, Package, Lock, Unlock, Pencil } from 'lucide-react'
import { API_BASE, withAuth, fetchWithTimeout } from '../../../../shared/lib/api.js'
import { showToast } from '../../../../shared/components/MESToast.js'
// CSS is imported globally via quotes.css

/**
 * AddInvoiceModal - 4 Adımlı Wizard (Fatura İşlemleri)
 * Step 1: Proforma + Temel Ayarlar
 * Step 2: Ödeme Koşulları + Ek Bilgiler
 * Step 3: Export (Logo/Zirve)
 * Step 4: Import (GİB Faturası)
 */
export default function AddInvoiceModal({
    isOpen,
    quote,
    onClose,
    onSuccess
}) {
    const [currentStep, setCurrentStep] = useState(1)
    const TOTAL_STEPS = 4

    const [loading, setLoading] = useState(false)
    const [error, setError] = useState(null)

    // Proforma state (Step 1)
    const [proformaData, setProformaData] = useState({
        documentNumber: null,
        createdAt: null,
        isNew: false
    })

    // Invoice settings state (Step 1 & 2)
    const [invoiceSettings, setInvoiceSettings] = useState({
        // Temel Ayarlar (Step 1)
        invoiceScenario: 'TEMEL',    // TEMEL | TICARI | IHRACAT
        invoiceType: 'SATIS',         // SATIS | IADE | ISTISNA | OZELMATRAH
        currency: 'TRY',
        exchangeRate: 1.0,

        // Ödeme Koşulları (Step 2)
        paymentMethod: 'HAVALE',      // NAKIT | CEK | HAVALE | KREDI_KARTI | VADELI
        paymentDueDays: 0,            // Vade günü
        paymentDueDate: '',           // Hesaplanan vade tarihi

        // Banka Bilgileri (Step 2 - HAVALE seçiliyse)
        bankName: '',
        iban: '',

        // İskonto (Step 2)
        discountType: 'NONE',         // NONE | PERCENT | AMOUNT
        discountValue: 0,
        discountReason: '',

        // Ek Bilgiler (Step 2)
        invoiceNote: '',
        deliveryNote: '',
        orderReference: '',           // Sipariş No (opsiyonel)
        dispatchReference: '',        // İrsaliye No (opsiyonel)
    })

    // Export state (Step 3)
    const [exportSettings, setExportSettings] = useState({
        target: 'LOGO',
        formats: { xml: true, csv: false, pdf: false }
    })
    const [exportStatus, setExportStatus] = useState({
        loading: false,
        success: false,
        fileName: null,
        error: null
    })

    // Import state (Step 4)
    const [importData, setImportData] = useState({
        invoiceNumber: '',
        ettn: '',
        file: null,
        fileName: null
    })
    const [importStatus, setImportStatus] = useState({
        loading: false,
        success: false,
        error: null
    })

    // Customer info edit state (for overriding or adding missing data)
    const [customerEditMode, setCustomerEditMode] = useState(false)
    const [customerInfo, setCustomerInfo] = useState({
        company: '',
        taxNumber: '',
        taxOffice: '',
        address: '',
        neighbourhood: '',
        district: '',
        city: '',
        postalCode: '',
        country: 'Türkiye'
    })

    const modalRef = useRef(null)
    const fileInputRef = useRef(null)

    // Vade tarihi hesaplama
    const calculateDueDate = (days) => {
        const date = new Date()
        date.setDate(date.getDate() + parseInt(days || 0))
        return date.toISOString().split('T')[0]
    }

    // Initialize when modal opens
    useEffect(() => {
        if (!isOpen) return

        setCurrentStep(1)
        setError(null)
        setLoading(false)

        if (quote?.proformaNumber) {
            setProformaData({
                documentNumber: quote.proformaNumber,
                createdAt: quote.proformaCreatedAt,
                isNew: false
            })
        } else {
            setProformaData({
                documentNumber: null,
                createdAt: null,
                isNew: false
            })
        }

        // Initialize settings from quote
        setInvoiceSettings({
            invoiceScenario: quote?.invoiceScenario || 'TEMEL',
            invoiceType: quote?.invoiceType || 'SATIS',
            currency: quote?.currency || 'TRY',
            exchangeRate: quote?.exchangeRate || 1.0,
            paymentMethod: 'HAVALE',
            paymentDueDays: 0,
            paymentDueDate: calculateDueDate(0),
            bankName: '',
            iban: '',
            discountType: 'NONE',
            discountValue: 0,
            discountReason: '',
            invoiceNote: '',
            deliveryNote: '',
            orderReference: '',
            dispatchReference: '',
        })

        // Reset export/import states
        setExportSettings({ target: 'LOGO', formats: { xml: true, csv: false, pdf: false } })
        setExportStatus({ loading: false, success: false, fileName: null, error: null })
        setImportData({ invoiceNumber: '', ettn: '', file: null, fileName: null })
        setImportStatus({ loading: false, success: false, error: null })

        // Initialize customer info from quote.customer
        setCustomerEditMode(false)
        setCustomerInfo({
            company: quote?.customer?.company || quote?.customerCompany || '',
            taxNumber: quote?.customer?.taxNumber || '',
            taxOffice: quote?.customer?.taxOffice || '',
            address: quote?.customer?.address || quote?.customerAddress || '',
            neighbourhood: quote?.customer?.neighbourhood || '',
            district: quote?.customer?.district || '',
            city: quote?.customer?.city || '',
            postalCode: quote?.customer?.postalCode || '',
            country: quote?.customer?.country || 'Türkiye'
        })
    }, [isOpen, quote])

    // Close on escape key
    useEffect(() => {
        const handleEscape = (e) => {
            if (e.key === 'Escape' && isOpen) {
                onClose()
            }
        }
        document.addEventListener('keydown', handleEscape)
        return () => document.removeEventListener('keydown', handleEscape)
    }, [isOpen, onClose])

    // Handle outside click
    const handleBackdropClick = (e) => {
        if (modalRef.current && !modalRef.current.contains(e.target)) {
            onClose()
        }
    }

    if (!isOpen) return null

    // ==================== STEP 1: PROFORMA ====================
    const handleGenerateProforma = async () => {
        setLoading(true)
        setError(null)

        try {
            const res = await fetchWithTimeout(`${API_BASE}/api/quotes/${quote.id}/documents/proforma`, {
                method: 'POST',
                headers: withAuth({ 'Content-Type': 'application/json' }),
                body: JSON.stringify({
                    invoiceScenario: invoiceSettings.invoiceScenario,
                    invoiceType: invoiceSettings.invoiceType,
                    currency: invoiceSettings.currency,
                    exchangeRate: invoiceSettings.exchangeRate
                })
            })

            if (!res.ok) {
                const errData = await res.json().catch(() => ({}))
                throw new Error(errData.error || 'Proforma oluşturulamadı')
            }

            const response = await res.json()

            if (response.success) {
                const { document } = response.data
                setProformaData({
                    documentNumber: document.documentNumber,
                    createdAt: document.createdAt,
                    isNew: response.data.isNew
                })
                showToast(response.data.message || 'Proforma oluşturuldu', 'success')
            } else {
                throw new Error(response.error || 'Proforma oluşturulamadı')
            }
        } catch (err) {
            console.error('Proforma error:', err)
            setError(err.message || 'Proforma oluşturulurken hata oluştu')
            showToast(err.message || 'Proforma oluşturulamadı', 'error')
        } finally {
            setLoading(false)
        }
    }

    const handleDownloadProformaPdf = async () => {
        showToast('Proforma PDF indirme yakında eklenecek', 'info')
    }

    // ==================== SETTINGS HANDLERS ====================
    const handleSettingsChange = (field, value) => {
        setInvoiceSettings(prev => {
            const updated = { ...prev, [field]: value }

            // Vade günü değiştiğinde tarihi hesapla
            if (field === 'paymentDueDays') {
                updated.paymentDueDate = calculateDueDate(value)
            }

            return updated
        })
    }

    // ==================== STEP 3: EXPORT ====================
    const handleExportFormatChange = (format) => {
        setExportSettings(prev => ({
            ...prev,
            formats: {
                ...prev.formats,
                [format]: !prev.formats[format]
            }
        }))
    }

    const handleExport = async () => {
        const selectedFormats = Object.entries(exportSettings.formats)
            .filter(([_, selected]) => selected)
            .map(([format]) => format)

        if (selectedFormats.length === 0) {
            setError('En az bir format seçmelisiniz')
            return
        }

        setExportStatus({ loading: true, success: false, fileName: null, error: null })
        setError(null)

        try {
            const res = await fetchWithTimeout(`${API_BASE}/api/quotes/${quote.id}/documents/export`, {
                method: 'POST',
                headers: withAuth({ 'Content-Type': 'application/json' }),
                body: JSON.stringify({
                    invoiceScenario: invoiceSettings.invoiceScenario,
                    invoiceType: invoiceSettings.invoiceType,
                    currency: invoiceSettings.currency,
                    exchangeRate: invoiceSettings.exchangeRate,
                    paymentMethod: invoiceSettings.paymentMethod,
                    paymentDueDays: invoiceSettings.paymentDueDays,
                    discountType: invoiceSettings.discountType,
                    discountValue: invoiceSettings.discountValue,
                    invoiceNote: invoiceSettings.invoiceNote,
                    format: selectedFormats[0],
                    target: exportSettings.target
                })
            })

            if (!res.ok) {
                const errData = await res.json().catch(() => ({}))
                throw new Error(errData.error || 'Export başarısız')
            }

            const contentType = res.headers.get('content-type')
            if (contentType && (contentType.includes('xml') || contentType.includes('csv') || contentType.includes('octet-stream'))) {
                const blob = await res.blob()
                const disposition = res.headers.get('content-disposition')
                let fileName = `fatura_${quote.id}.${selectedFormats[0]}`
                if (disposition) {
                    const match = disposition.match(/filename="?([^"]+)"?/)
                    if (match) fileName = match[1]
                }

                const url = URL.createObjectURL(blob)
                const a = document.createElement('a')
                a.href = url
                a.download = fileName
                document.body.appendChild(a)
                a.click()
                document.body.removeChild(a)
                URL.revokeObjectURL(url)

                setExportStatus({ loading: false, success: true, fileName, error: null })
                showToast(`${fileName} indirildi`, 'success')
            } else {
                const response = await res.json()
                if (response.success) {
                    setExportStatus({ loading: false, success: true, fileName: response.fileName, error: null })
                    showToast(response.message || 'Export başarılı', 'success')
                } else {
                    throw new Error(response.error || 'Export başarısız')
                }
            }
        } catch (err) {
            console.error('Export error:', err)
            setExportStatus({ loading: false, success: false, fileName: null, error: err.message })
            setError(err.message || 'Export sırasında hata oluştu')
            showToast(err.message || 'Export başarısız', 'error')
        }
    }

    // ==================== STEP 4: IMPORT ====================
    const handleImportDataChange = (field, value) => {
        setImportData(prev => ({
            ...prev,
            [field]: value
        }))
    }

    const handleFileSelect = (e) => {
        const file = e.target.files?.[0]
        if (file) {
            const validTypes = ['.xml', '.zip']
            const ext = file.name.toLowerCase().substring(file.name.lastIndexOf('.'))
            if (!validTypes.includes(ext)) {
                setError('Sadece .xml veya .zip dosyaları yükleyebilirsiniz')
                return
            }
            setImportData(prev => ({
                ...prev,
                file,
                fileName: file.name
            }))
            setError(null)
        }
    }

    const validateEttn = (ettn) => {
        const uuidRegex = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/
        return uuidRegex.test(ettn)
    }

    const handleImport = async () => {
        if (!importData.invoiceNumber.trim()) {
            setError('Fatura numarası gereklidir')
            return
        }
        if (!importData.ettn.trim()) {
            setError('ETTN gereklidir')
            return
        }
        if (!validateEttn(importData.ettn)) {
            setError('ETTN formatı geçersiz. UUID formatında olmalıdır (xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)')
            return
        }
        if (!importData.file) {
            setError('Lütfen fatura dosyasını yükleyin')
            return
        }

        setImportStatus({ loading: true, success: false, error: null })
        setError(null)

        try {
            const formData = new FormData()
            formData.append('invoiceNumber', importData.invoiceNumber)
            formData.append('ettn', importData.ettn)
            formData.append('file', importData.file)

            const res = await fetchWithTimeout(`${API_BASE}/api/quotes/${quote.id}/documents/import`, {
                method: 'POST',
                headers: withAuth(),
                body: formData
            })

            if (!res.ok) {
                const errData = await res.json().catch(() => ({}))
                throw new Error(errData.error || 'Import başarısız')
            }

            const response = await res.json()
            if (response.success) {
                setImportStatus({ loading: false, success: true, error: null })
                showToast(response.message || 'Fatura import edildi', 'success')
                setTimeout(() => {
                    onSuccess && onSuccess()
                    onClose()
                }, 1500)
            } else {
                throw new Error(response.error || 'Import başarısız')
            }
        } catch (err) {
            console.error('Import error:', err)
            setImportStatus({ loading: false, success: false, error: err.message })
            setError(err.message || 'Import sırasında hata oluştu')
            showToast(err.message || 'Import başarısız', 'error')
        }
    }

    // ==================== NAVIGATION ====================
    const canProceedToNext = () => {
        switch (currentStep) {
            case 1:
                return !!proformaData.documentNumber
            case 2:
                return invoiceSettings.paymentMethod !== ''
            case 3:
                return true
            case 4:
                return true
            default:
                return false
        }
    }

    const handleNext = () => {
        if (currentStep < TOTAL_STEPS && canProceedToNext()) {
            setCurrentStep(prev => prev + 1)
            setError(null)
        }
    }

    const handlePrev = () => {
        if (currentStep > 1) {
            setCurrentStep(prev => prev - 1)
            setError(null)
        }
    }

    const getStepLabel = (step) => {
        switch (step) {
            case 1: return 'Proforma'
            case 2: return 'Ödeme'
            case 3: return 'Export'
            case 4: return 'Import'
            default: return ''
        }
    }

    const getStepClass = (step) => {
        if (currentStep === step) return 'quote-step-item active'
        if (currentStep > step) return 'quote-step-item completed'
        return 'quote-step-item'
    }

    const getConnectorClass = (step) => {
        if (currentStep > step) return 'quote-step-connector completed'
        if (currentStep === step) return 'quote-step-connector active'
        return 'quote-step-connector'
    }

    // Format price
    const formatPrice = (price) => {
        return new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(price || 0)
    }

    // ==================== RENDER ====================
    return (
        <div className="modal-overlay" onClick={handleBackdropClick}>
            <div ref={modalRef} className="quote-modal-container invoice-modal-wide">
                {/* Header */}
                <div className="quote-modal-header">
                    <div className="flex-center-gap-10">
                        <div className="quote-header-icon">
                            <FileText size={18} className="text-primary" />
                        </div>
                        <h2 className="quote-modal-title">Fatura İşlemleri</h2>
                        <span className="status-badge new">{quote?.id}</span>
                    </div>
                    <button className="quote-close-btn" onClick={onClose}>
                        <X size={20} />
                    </button>
                </div>

                {/* Step Indicator */}
                <div className="quote-step-indicator">
                    {[1, 2, 3, 4].map((step, index) => (
                        <React.Fragment key={step}>
                            <div className={getStepClass(step)}>
                                <div className="quote-step-number">
                                    {currentStep > step ? <Check size={14} /> : step}
                                </div>
                                <span className="quote-step-label">{getStepLabel(step)}</span>
                            </div>
                            {index < 3 && (
                                <div className={getConnectorClass(step)} />
                            )}
                        </React.Fragment>
                    ))}
                </div>

                {/* Content */}
                <div className="quote-modal-content">
                    {/* Error Display */}
                    {error && (
                        <div className="invoice-error-box mb-16">
                            <AlertTriangle size={16} />
                            <span className="text-sm">{error}</span>
                        </div>
                    )}

                    {/* Step 1: Proforma + Temel Ayarlar */}
                    {currentStep === 1 && (
                        <div className="quote-customer-step">
                            {/* Müşteri Bilgileri - Editable */}
                            <div className="invoice-customer-summary mb-16">
                                <div className="invoice-customer-header">
                                    <div className="flex-center-gap-8">
                                        <Building2 size={16} className="text-muted" />
                                        <span className="text-sm font-semibold">Müşteri Bilgileri</span>
                                    </div>
                                    <button
                                        type="button"
                                        className="invoice-edit-toggle"
                                        onClick={() => setCustomerEditMode(!customerEditMode)}
                                        title={customerEditMode ? 'Düzenlemeyi kilitle' : 'Düzenlemek için tıklayın'}
                                    >
                                        {customerEditMode ? <Unlock size={14} /> : <Lock size={14} />}
                                        <span className="text-xs">{customerEditMode ? 'Kilitle' : 'Düzenle'}</span>
                                    </button>
                                </div>

                                {customerEditMode ? (
                                    /* Edit Mode */
                                    <div className="invoice-customer-form mt-12">
                                        <div className="grid-2-gap-12">
                                            <div className="form-group">
                                                <label className="label">Firma Ünvanı *</label>
                                                <input
                                                    type="text"
                                                    className="mes-filter-input"
                                                    value={customerInfo.company}
                                                    onChange={(e) => setCustomerInfo(prev => ({ ...prev, company: e.target.value }))}
                                                    placeholder="Firma Ünvanı"
                                                />
                                            </div>
                                            <div className="form-group">
                                                <label className="label">VKN/TCKN *</label>
                                                <input
                                                    type="text"
                                                    className="mes-filter-input"
                                                    value={customerInfo.taxNumber}
                                                    onChange={(e) => setCustomerInfo(prev => ({ ...prev, taxNumber: e.target.value }))}
                                                    placeholder="Vergi/TC Kimlik No"
                                                    maxLength={11}
                                                />
                                            </div>
                                            <div className="form-group">
                                                <label className="label">Vergi Dairesi *</label>
                                                <input
                                                    type="text"
                                                    className="mes-filter-input"
                                                    value={customerInfo.taxOffice}
                                                    onChange={(e) => setCustomerInfo(prev => ({ ...prev, taxOffice: e.target.value }))}
                                                    placeholder="Vergi Dairesi"
                                                />
                                            </div>
                                            <div className="form-group">
                                                <label className="label">Ülke</label>
                                                <input
                                                    type="text"
                                                    className="mes-filter-input"
                                                    value={customerInfo.country}
                                                    onChange={(e) => setCustomerInfo(prev => ({ ...prev, country: e.target.value }))}
                                                    placeholder="Ülke"
                                                />
                                            </div>
                                        </div>
                                        <div className="form-group mt-12">
                                            <label className="label">Adres (Cadde/Sokak/Kapı No)</label>
                                            <input
                                                type="text"
                                                className="mes-filter-input"
                                                value={customerInfo.address}
                                                onChange={(e) => setCustomerInfo(prev => ({ ...prev, address: e.target.value }))}
                                                placeholder="Cadde/Sokak ve Kapı No"
                                            />
                                        </div>
                                        <div className="grid-2-gap-12 mt-12">
                                            <div className="form-group">
                                                <label className="label">Mahalle</label>
                                                <input
                                                    type="text"
                                                    className="mes-filter-input"
                                                    value={customerInfo.neighbourhood}
                                                    onChange={(e) => setCustomerInfo(prev => ({ ...prev, neighbourhood: e.target.value }))}
                                                    placeholder="Mahalle"
                                                />
                                            </div>
                                            <div className="form-group">
                                                <label className="label">İlçe</label>
                                                <input
                                                    type="text"
                                                    className="mes-filter-input"
                                                    value={customerInfo.district}
                                                    onChange={(e) => setCustomerInfo(prev => ({ ...prev, district: e.target.value }))}
                                                    placeholder="İlçe"
                                                />
                                            </div>
                                            <div className="form-group">
                                                <label className="label">İl</label>
                                                <input
                                                    type="text"
                                                    className="mes-filter-input"
                                                    value={customerInfo.city}
                                                    onChange={(e) => setCustomerInfo(prev => ({ ...prev, city: e.target.value }))}
                                                    placeholder="İl"
                                                />
                                            </div>
                                            <div className="form-group">
                                                <label className="label">Posta Kodu</label>
                                                <input
                                                    type="text"
                                                    className="mes-filter-input"
                                                    value={customerInfo.postalCode}
                                                    onChange={(e) => setCustomerInfo(prev => ({ ...prev, postalCode: e.target.value }))}
                                                    placeholder="Posta Kodu"
                                                    maxLength={5}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    /* View Mode */
                                    <div className="invoice-customer-view mt-12">
                                        <div className="grid-2-gap-12">
                                            <div>
                                                <span className="label-sm">Firma</span>
                                                <span className="detail-value">{customerInfo.company || '—'}</span>
                                            </div>
                                            <div>
                                                <span className="label-sm">VKN/TCKN</span>
                                                <span className="detail-value">{customerInfo.taxNumber || '—'}</span>
                                            </div>
                                            <div>
                                                <span className="label-sm">Vergi Dairesi</span>
                                                <span className="detail-value">{customerInfo.taxOffice || '—'}</span>
                                            </div>
                                            <div>
                                                <span className="label-sm">Ülke</span>
                                                <span className="detail-value">{customerInfo.country || '—'}</span>
                                            </div>
                                        </div>
                                        <div className="mt-8">
                                            <span className="label-sm">Tam Adres</span>
                                            <span className="detail-value">
                                                {[
                                                    customerInfo.address,
                                                    customerInfo.neighbourhood,
                                                    customerInfo.district,
                                                    customerInfo.city,
                                                    customerInfo.postalCode
                                                ].filter(Boolean).join(', ') || '—'}
                                            </span>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Proforma Section */}
                            <h3 className="quote-modal-title mb-16">Proforma Fatura</h3>

                            {proformaData.documentNumber ? (
                                <div className="invoice-success-box mb-16">
                                    <div className="flex-center-gap-8 mb-12">
                                        <Check size={18} className="text-success" />
                                        <span className="text-md font-semibold text-success">Proforma Oluşturuldu</span>
                                    </div>

                                    <div className="grid-2-gap-12 mb-16">
                                        <div>
                                            <span className="label-sm">Proforma No</span>
                                            <span className="detail-value">{proformaData.documentNumber}</span>
                                        </div>
                                        <div>
                                            <span className="label-sm">Oluşturma Tarihi</span>
                                            <span className="detail-value">
                                                {proformaData.createdAt
                                                    ? new Date(proformaData.createdAt).toLocaleDateString('tr-TR')
                                                    : '—'}
                                            </span>
                                        </div>
                                    </div>

                                    <div className="flex-center-gap-8">
                                        <button className="btn-secondary" onClick={handleDownloadProformaPdf}>
                                            <Download size={14} /> PDF İndir
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <>
                                    {/* Fatura Ayarları - Proforma oluşturulmadan önce */}
                                    <div className="invoice-settings-grid mb-16">
                                        <div className="form-group">
                                            <label className="label">Fatura Senaryosu *</label>
                                            <select
                                                className="mes-filter-input"
                                                value={invoiceSettings.invoiceScenario}
                                                onChange={(e) => handleSettingsChange('invoiceScenario', e.target.value)}
                                            >
                                                <option value="TEMEL">TEMEL FATURA</option>
                                                <option value="TICARI">TİCARİ FATURA</option>
                                                <option value="IHRACAT">İHRACAT FATURASI</option>
                                            </select>
                                        </div>

                                        <div className="form-group">
                                            <label className="label">Fatura Tipi *</label>
                                            <select
                                                className="mes-filter-input"
                                                value={invoiceSettings.invoiceType}
                                                onChange={(e) => handleSettingsChange('invoiceType', e.target.value)}
                                            >
                                                <option value="SATIS">SATIŞ</option>
                                                <option value="IADE">İADE</option>
                                                <option value="ISTISNA">İSTİSNA</option>
                                                <option value="OZELMATRAH">ÖZEL MATRAH</option>
                                            </select>
                                        </div>

                                        <div className="form-group">
                                            <label className="label">Para Birimi</label>
                                            <select
                                                className="mes-filter-input"
                                                value={invoiceSettings.currency}
                                                onChange={(e) => handleSettingsChange('currency', e.target.value)}
                                            >
                                                <option value="TRY">TRY - Türk Lirası</option>
                                                <option value="USD">USD - Amerikan Doları</option>
                                                <option value="EUR">EUR - Euro</option>
                                                <option value="GBP">GBP - İngiliz Sterlini</option>
                                            </select>
                                        </div>

                                        <div className="form-group">
                                            <label className="label">Döviz Kuru</label>
                                            <input
                                                type="number"
                                                step="0.0001"
                                                className="mes-filter-input"
                                                value={invoiceSettings.exchangeRate}
                                                onChange={(e) => handleSettingsChange('exchangeRate', parseFloat(e.target.value) || 1)}
                                                disabled={invoiceSettings.currency === 'TRY'}
                                            />
                                        </div>
                                    </div>

                                    {/* Kalemler & Toplam Özeti */}
                                    <div className="invoice-items-section mb-16">
                                        {/* Items Summary Header */}
                                        <div className="invoice-items-header">
                                            <div className="flex-center-gap-8">
                                                <Package size={16} className="text-muted" />
                                                <span className="text-sm font-semibold">
                                                    Fatura Kalemleri ({quote?.items?.length || 0} kalem)
                                                </span>
                                            </div>
                                        </div>

                                        {/* Items List (if any) */}
                                        {quote?.items && quote.items.length > 0 ? (
                                            <div className="invoice-items-list mt-8">
                                                <table className="invoice-items-table">
                                                    <thead>
                                                        <tr>
                                                            <th>Ürün/Hizmet</th>
                                                            <th className="text-right">Miktar</th>
                                                            <th className="text-right">Birim Fiyat</th>
                                                            <th className="text-right">KDV</th>
                                                            <th className="text-right">Toplam</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {quote.items.map((item, idx) => (
                                                            <tr key={item.id || idx}>
                                                                <td>
                                                                    <span className="text-sm">{item.productName}</span>
                                                                    {item.stockCode && (
                                                                        <span className="text-xs text-muted ml-4">[{item.stockCode}]</span>
                                                                    )}
                                                                </td>
                                                                <td className="text-right text-sm">{item.quantity} {item.unit}</td>
                                                                <td className="text-right text-sm">{formatPrice(item.unitPrice)}</td>
                                                                <td className="text-right text-sm">%{item.taxRate}</td>
                                                                <td className="text-right text-sm font-semibold">{formatPrice(item.totalAmount)}</td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        ) : (
                                            <div className="invoice-no-items mt-8">
                                                <span className="text-sm text-muted">Henüz kalem eklenmemiş. Quote detayından kalem ekleyebilirsiniz.</span>
                                            </div>
                                        )}

                                        {/* Totals */}
                                        <div className="invoice-totals mt-12">
                                            <div className="invoice-total-row">
                                                <span className="text-sm">Ara Toplam:</span>
                                                <span className="text-sm">{formatPrice(quote?.itemsSubtotal || 0)} {invoiceSettings.currency}</span>
                                            </div>
                                            <div className="invoice-total-row">
                                                <span className="text-sm">KDV Toplam:</span>
                                                <span className="text-sm">{formatPrice(quote?.itemsTaxTotal || 0)} {invoiceSettings.currency}</span>
                                            </div>
                                            <div className="invoice-total-row total-final">
                                                <span className="text-md font-semibold">Genel Toplam:</span>
                                                <span className="text-md font-bold text-primary">
                                                    {formatPrice(quote?.itemsTotal || quote?.finalPrice || quote?.calculatedPrice || 0)} {invoiceSettings.currency}
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    <button
                                        className="btn-primary"
                                        onClick={handleGenerateProforma}
                                        disabled={loading}
                                    >
                                        {loading ? (
                                            <>
                                                <Loader2 size={16} className="spinner" />
                                                Oluşturuluyor...
                                            </>
                                        ) : (
                                            <>
                                                <FileText size={16} /> Proforma Oluştur
                                            </>
                                        )}
                                    </button>
                                </>
                            )}
                        </div>
                    )}

                    {/* Step 2: Ödeme Koşulları + Ek Bilgiler */}
                    {currentStep === 2 && (
                        <div className="quote-customer-step">
                            <h3 className="quote-modal-title mb-16">
                                <CreditCard size={18} className="text-muted" /> Ödeme Koşulları
                            </h3>

                            {/* Ödeme Yöntemi */}
                            <div className="form-group mb-16">
                                <label className="label">Ödeme Yöntemi *</label>
                                <select
                                    className="mes-filter-input"
                                    value={invoiceSettings.paymentMethod}
                                    onChange={(e) => handleSettingsChange('paymentMethod', e.target.value)}
                                >
                                    <option value="NAKIT">Nakit</option>
                                    <option value="HAVALE">Havale/EFT</option>
                                    <option value="CEK">Çek</option>
                                    <option value="KREDI_KARTI">Kredi Kartı</option>
                                    <option value="VADELI">Vadeli</option>
                                </select>
                            </div>

                            {/* Vade */}
                            <div className="grid-2-gap-12 mb-16">
                                <div className="form-group">
                                    <label className="label">Vade (Gün)</label>
                                    <input
                                        type="number"
                                        min="0"
                                        max="365"
                                        className="mes-filter-input"
                                        value={invoiceSettings.paymentDueDays}
                                        onChange={(e) => handleSettingsChange('paymentDueDays', parseInt(e.target.value) || 0)}
                                    />
                                </div>
                                <div className="form-group">
                                    <label className="label">Vade Tarihi</label>
                                    <input
                                        type="date"
                                        className="mes-filter-input readonly"
                                        value={invoiceSettings.paymentDueDate}
                                        readOnly
                                    />
                                </div>
                            </div>

                            {/* Banka Bilgileri - HAVALE seçiliyse */}
                            {invoiceSettings.paymentMethod === 'HAVALE' && (
                                <div className="invoice-bank-section mb-16">
                                    <span className="label-sm mb-8">Banka Bilgileri</span>
                                    <div className="grid-2-gap-12">
                                        <div className="form-group">
                                            <label className="label">Banka Adı</label>
                                            <input
                                                type="text"
                                                className="mes-filter-input"
                                                placeholder="Örn: Garanti Bankası"
                                                value={invoiceSettings.bankName}
                                                onChange={(e) => handleSettingsChange('bankName', e.target.value)}
                                            />
                                        </div>
                                        <div className="form-group">
                                            <label className="label">IBAN</label>
                                            <input
                                                type="text"
                                                className="mes-filter-input"
                                                placeholder="TR00 0000 0000 0000 0000 0000 00"
                                                value={invoiceSettings.iban}
                                                onChange={(e) => handleSettingsChange('iban', e.target.value)}
                                                maxLength={32}
                                            />
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* İskonto */}
                            <div className="form-group mb-16">
                                <label className="label">İskonto</label>
                                <div className="grid-2-gap-12">
                                    <select
                                        className="mes-filter-input"
                                        value={invoiceSettings.discountType}
                                        onChange={(e) => handleSettingsChange('discountType', e.target.value)}
                                    >
                                        <option value="NONE">İskonto Yok</option>
                                        <option value="PERCENT">Yüzde (%)</option>
                                        <option value="AMOUNT">Tutar</option>
                                    </select>
                                    {invoiceSettings.discountType !== 'NONE' && (
                                        <input
                                            type="number"
                                            min="0"
                                            step="0.01"
                                            className="mes-filter-input"
                                            placeholder={invoiceSettings.discountType === 'PERCENT' ? 'Yüzde' : 'Tutar'}
                                            value={invoiceSettings.discountValue}
                                            onChange={(e) => handleSettingsChange('discountValue', parseFloat(e.target.value) || 0)}
                                        />
                                    )}
                                </div>
                            </div>

                            {/* Fatura Notu */}
                            <div className="form-group mb-16">
                                <label className="label">Fatura Notu</label>
                                <textarea
                                    className="mes-filter-input invoice-textarea"
                                    rows={3}
                                    placeholder="Fatura üzerinde görünecek not..."
                                    value={invoiceSettings.invoiceNote}
                                    onChange={(e) => handleSettingsChange('invoiceNote', e.target.value)}
                                />
                            </div>

                            {/* Referanslar */}
                            <div className="grid-2-gap-12">
                                <div className="form-group">
                                    <label className="label">Sipariş No (Opsiyonel)</label>
                                    <input
                                        type="text"
                                        className="mes-filter-input"
                                        placeholder="Müşteri sipariş numarası"
                                        value={invoiceSettings.orderReference}
                                        onChange={(e) => handleSettingsChange('orderReference', e.target.value)}
                                    />
                                </div>
                                <div className="form-group">
                                    <label className="label">İrsaliye No (Opsiyonel)</label>
                                    <input
                                        type="text"
                                        className="mes-filter-input"
                                        placeholder="İlişkili irsaliye numarası"
                                        value={invoiceSettings.dispatchReference}
                                        onChange={(e) => handleSettingsChange('dispatchReference', e.target.value)}
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Step 3: Export */}
                    {currentStep === 3 && (
                        <div className="quote-customer-step">
                            <h3 className="quote-modal-title mb-16">Fatura Export</h3>

                            <div className="form-group mb-16">
                                <label className="label">Hedef Program *</label>
                                <select
                                    className="mes-filter-input"
                                    value={exportSettings.target}
                                    onChange={(e) => setExportSettings(prev => ({ ...prev, target: e.target.value }))}
                                >
                                    <option value="LOGO">Logo Tiger</option>
                                    <option value="ZIRVE">Zirve</option>
                                    <option value="OTHER">Diğer</option>
                                </select>
                            </div>

                            <div className="form-group mb-16">
                                <label className="label">Format *</label>
                                <div className="invoice-checkbox-group">
                                    <label className="invoice-checkbox-item">
                                        <input
                                            type="checkbox"
                                            checked={exportSettings.formats.xml}
                                            onChange={() => handleExportFormatChange('xml')}
                                        />
                                        <span className="invoice-checkbox-label">XML</span>
                                    </label>
                                    <label className="invoice-checkbox-item">
                                        <input
                                            type="checkbox"
                                            checked={exportSettings.formats.csv}
                                            onChange={() => handleExportFormatChange('csv')}
                                        />
                                        <span className="invoice-checkbox-label">CSV</span>
                                    </label>
                                    <label className="invoice-checkbox-item">
                                        <input
                                            type="checkbox"
                                            checked={exportSettings.formats.pdf}
                                            onChange={() => handleExportFormatChange('pdf')}
                                        />
                                        <span className="invoice-checkbox-label">PDF</span>
                                    </label>
                                </div>
                            </div>

                            {/* Export Özeti */}
                            <div className="invoice-export-summary mb-16">
                                <span className="label-sm mb-8">Export Özeti</span>
                                <div className="grid-2-gap-12">
                                    <div>
                                        <span className="text-xs text-muted">Senaryo</span>
                                        <span className="text-sm">{invoiceSettings.invoiceScenario}</span>
                                    </div>
                                    <div>
                                        <span className="text-xs text-muted">Tip</span>
                                        <span className="text-sm">{invoiceSettings.invoiceType}</span>
                                    </div>
                                    <div>
                                        <span className="text-xs text-muted">Ödeme</span>
                                        <span className="text-sm">{invoiceSettings.paymentMethod} - {invoiceSettings.paymentDueDays} gün</span>
                                    </div>
                                    <div>
                                        <span className="text-xs text-muted">Tutar</span>
                                        <span className="text-sm font-semibold">
                                            {formatPrice(quote?.finalPrice || quote?.calculatedPrice)} {invoiceSettings.currency}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            <div className="mt-16">
                                <button
                                    className="btn-primary"
                                    onClick={handleExport}
                                    disabled={exportStatus.loading}
                                >
                                    {exportStatus.loading ? (
                                        <>
                                            <Loader2 size={16} className="spinner" />
                                            Export ediliyor...
                                        </>
                                    ) : (
                                        <>
                                            <Upload size={16} /> Export Et
                                        </>
                                    )}
                                </button>
                            </div>

                            {exportStatus.success && (
                                <div className="invoice-success-box mt-16">
                                    <div className="flex-center-gap-8">
                                        <Check size={18} className="text-success" />
                                        <span className="text-md font-semibold text-success">Export Başarılı</span>
                                    </div>
                                    {exportStatus.fileName && (
                                        <p className="text-sm text-muted mt-8">{exportStatus.fileName} indirildi</p>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Step 4: Import */}
                    {currentStep === 4 && (
                        <div className="quote-customer-step">
                            <h3 className="quote-modal-title mb-16">GİB Fatura Import</h3>

                            <div className="form-group mb-16">
                                <label className="label">Fatura No *</label>
                                <input
                                    type="text"
                                    className="mes-filter-input"
                                    placeholder="ABC2024000000001"
                                    value={importData.invoiceNumber}
                                    onChange={(e) => handleImportDataChange('invoiceNumber', e.target.value)}
                                />
                            </div>

                            <div className="form-group mb-16">
                                <label className="label">ETTN * (UUID Format)</label>
                                <input
                                    type="text"
                                    className="mes-filter-input"
                                    placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                                    value={importData.ettn}
                                    onChange={(e) => handleImportDataChange('ettn', e.target.value)}
                                    maxLength={36}
                                />
                                <span className="text-xs text-muted mt-4">{importData.ettn.length}/36 karakter</span>
                            </div>

                            <div className="form-group mb-16">
                                <label className="label">Fatura Dosyası * (.xml, .zip)</label>
                                <div className="invoice-file-upload">
                                    <input
                                        ref={fileInputRef}
                                        type="file"
                                        accept=".xml,.zip"
                                        onChange={handleFileSelect}
                                        className="invoice-file-input"
                                    />
                                    {importData.fileName ? (
                                        <div className="invoice-file-selected">
                                            <File size={16} className="text-primary" />
                                            <span className="text-sm">{importData.fileName}</span>
                                            <button
                                                type="button"
                                                className="invoice-file-remove"
                                                onClick={() => {
                                                    setImportData(prev => ({ ...prev, file: null, fileName: null }))
                                                    if (fileInputRef.current) fileInputRef.current.value = ''
                                                }}
                                            >
                                                <X size={14} />
                                            </button>
                                        </div>
                                    ) : (
                                        <div className="invoice-file-placeholder">
                                            <Upload size={20} className="text-muted" />
                                            <span className="text-sm text-muted">Dosya seçmek için tıklayın</span>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="mt-16">
                                <button
                                    className="btn-primary"
                                    onClick={handleImport}
                                    disabled={importStatus.loading}
                                >
                                    {importStatus.loading ? (
                                        <>
                                            <Loader2 size={16} className="spinner" />
                                            Import ediliyor...
                                        </>
                                    ) : (
                                        <>
                                            <Download size={16} /> Import Et
                                        </>
                                    )}
                                </button>
                            </div>

                            {importStatus.success && (
                                <div className="invoice-success-box mt-16">
                                    <div className="flex-center-gap-8">
                                        <Check size={18} className="text-success" />
                                        <span className="text-md font-semibold text-success">Import Başarılı</span>
                                    </div>
                                    <p className="text-sm text-muted mt-8">Fatura bilgileri kaydedildi. Modal kapanıyor...</p>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="quote-modal-footer">
                    <button className="btn-back" onClick={currentStep === 1 ? onClose : handlePrev}>
                        {currentStep === 1 ? 'İptal' : <><ChevronLeft size={16} /> Geri</>}
                    </button>

                    <div className="footer-right">
                        {currentStep < TOTAL_STEPS ? (
                            <button
                                className="btn-primary"
                                onClick={handleNext}
                                disabled={!canProceedToNext()}
                            >
                                Sonraki <ChevronRight size={16} />
                            </button>
                        ) : (
                            <button
                                className="btn-success"
                                onClick={() => {
                                    if (!importStatus.success) {
                                        onSuccess && onSuccess()
                                        onClose()
                                    }
                                }}
                                disabled={importStatus.loading}
                            >
                                <Check size={16} /> Tamamla
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}
