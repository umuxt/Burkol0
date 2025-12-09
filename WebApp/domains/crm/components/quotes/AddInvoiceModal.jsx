import React, { useState, useEffect, useRef } from 'react'
import { X, FileText, ChevronRight, ChevronLeft, Check, Download, Upload, AlertTriangle, Loader2 } from 'lucide-react'
import { API_BASE, withAuth, fetchWithTimeout } from '../../../../shared/lib/api.js'
import { showToast } from '../../../../shared/components/MESToast.js'
// CSS is imported globally via quotes.css

/**
 * AddInvoiceModal - 4 Adımlı Wizard (Fatura İşlemleri)
 * Existing CSS classes from quotes.css: modal-overlay, quote-modal-container, 
 * quote-modal-header, quote-step-indicator, quote-modal-content, quote-modal-footer
 * btn-primary, btn-secondary, btn-back, btn-next, btn-success, etc.
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

    // Invoice settings state (Step 2)
    const [invoiceSettings, setInvoiceSettings] = useState({
        invoiceScenario: 'TEMEL',
        invoiceType: 'SATIS',
        currency: quote?.currency || 'TRY',
        exchangeRate: quote?.exchangeRate || 1.0
    })

    const modalRef = useRef(null)

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

        setInvoiceSettings({
            invoiceScenario: quote?.invoiceScenario || 'TEMEL',
            invoiceType: quote?.invoiceType || 'SATIS',
            currency: quote?.currency || 'TRY',
            exchangeRate: quote?.exchangeRate || 1.0
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
                body: JSON.stringify({})
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

    // ==================== STEP 2: SETTINGS ====================
    const handleSettingsChange = (field, value) => {
        setInvoiceSettings(prev => ({
            ...prev,
            [field]: value
        }))
    }

    // ==================== NAVIGATION ====================
    const canProceedToNext = () => {
        switch (currentStep) {
            case 1:
                return !!proformaData.documentNumber
            case 2:
                return invoiceSettings.invoiceScenario && invoiceSettings.invoiceType
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
        }
    }

    const handlePrev = () => {
        if (currentStep > 1) {
            setCurrentStep(prev => prev - 1)
        }
    }

    const getStepLabel = (step) => {
        switch (step) {
            case 1: return 'Proforma'
            case 2: return 'Ayarlar'
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

    // ==================== RENDER ====================
    return (
        <div className="modal-overlay" onClick={handleBackdropClick}>
            <div ref={modalRef} className="quote-modal-container invoice-modal-wide">
                {/* Header - reusing quote-modal-header */}
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

                {/* Step Indicator - reusing quote-step-indicator */}
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

                {/* Content - reusing quote-modal-content */}
                <div className="quote-modal-content">
                    {/* Error Display */}
                    {error && (
                        <div className="invoice-error-box mb-16">
                            <AlertTriangle size={16} />
                            <span className="text-sm">{error}</span>
                        </div>
                    )}

                    {/* Step 1: Proforma */}
                    {currentStep === 1 && (
                        <div className="quote-customer-step">
                            <h3 className="quote-modal-title">Proforma Fatura</h3>

                            {proformaData.documentNumber ? (
                                <div className="invoice-success-box">
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
                                <div className="invoice-warning-box">
                                    <div className="flex-center-gap-8 mb-12">
                                        <AlertTriangle size={18} className="text-warning" />
                                        <span className="text-md font-medium text-warning">Proforma henüz oluşturulmadı</span>
                                    </div>

                                    <p className="text-sm text-muted mb-16">
                                        e-Fatura işlemi için önce proforma fatura oluşturmanız gerekmektedir.
                                    </p>

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
                                </div>
                            )}
                        </div>
                    )}

                    {/* Step 2: Invoice Settings */}
                    {currentStep === 2 && (
                        <div className="quote-customer-step">
                            <h3 className="quote-modal-title mb-16">Fatura Ayarları</h3>

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

                            <div className="form-group mt-16">
                                <label className="label">Fatura Tipi *</label>
                                <select
                                    className="mes-filter-input"
                                    value={invoiceSettings.invoiceType}
                                    onChange={(e) => handleSettingsChange('invoiceType', e.target.value)}
                                >
                                    <option value="SATIS">SATIŞ</option>
                                    <option value="IADE">İADE</option>
                                </select>
                            </div>

                            <div className="grid-2-gap-12 mt-16">
                                <div className="form-group">
                                    <label className="label">Para Birimi</label>
                                    <input
                                        type="text"
                                        className="mes-filter-input readonly"
                                        value={invoiceSettings.currency}
                                        readOnly
                                    />
                                </div>
                                <div className="form-group">
                                    <label className="label">Döviz Kuru</label>
                                    <input
                                        type="text"
                                        className="mes-filter-input readonly"
                                        value={invoiceSettings.exchangeRate}
                                        readOnly
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Step 3: Export - Placeholder for P4.6 */}
                    {currentStep === 3 && (
                        <div className="invoice-placeholder">
                            <Upload size={48} className="text-light" />
                            <h3 className="quote-modal-title mt-16">Export İşlemleri</h3>
                            <p className="text-sm text-muted">Bu adım P4.6'da implement edilecektir.</p>
                        </div>
                    )}

                    {/* Step 4: Import - Placeholder for P4.6 */}
                    {currentStep === 4 && (
                        <div className="invoice-placeholder">
                            <Download size={48} className="text-light" />
                            <h3 className="quote-modal-title mt-16">Import İşlemleri</h3>
                            <p className="text-sm text-muted">Bu adım P4.6'da implement edilecektir.</p>
                        </div>
                    )}
                </div>

                {/* Footer - reusing quote-modal-footer */}
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
                                    onSuccess && onSuccess()
                                    onClose()
                                }}
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
