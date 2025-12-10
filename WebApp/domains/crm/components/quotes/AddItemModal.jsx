import React, { useState, useEffect, useMemo } from 'react'
import { X, Package, Wrench, Plus, Loader2 } from 'lucide-react'
import { API_BASE } from '../../../../shared/lib/api.js'
import { showToast } from '../../../../shared/components/MESToast.js'

/**
 * P4.9: AddItemModal
 * Modal for adding invoice line items (materials or services)
 */
export default function AddItemModal({ isOpen, onClose, quoteId, onItemAdded }) {
    // Item type: 'material' or 'service'
    const [itemType, setItemType] = useState('service')

    // Form fields
    const [description, setDescription] = useState('')
    const [itemCode, setItemCode] = useState('')
    const [quantity, setQuantity] = useState(1)
    const [unit, setUnit] = useState('Adet')
    const [unitPrice, setUnitPrice] = useState('')
    const [taxRate, setTaxRate] = useState(20)
    const [discountPercent, setDiscountPercent] = useState('')
    const [discountAmount, setDiscountAmount] = useState('')
    const [discountType, setDiscountType] = useState('percent') // 'percent' or 'amount'

    // Data
    const [materials, setMaterials] = useState([])
    const [serviceCards, setServiceCards] = useState([])
    const [selectedMaterial, setSelectedMaterial] = useState(null)
    const [selectedService, setSelectedService] = useState(null)

    // Loading states
    const [loading, setLoading] = useState(false)
    const [saving, setSaving] = useState(false)

    // Load materials and service cards on mount
    useEffect(() => {
        if (isOpen) {
            loadMaterials()
            loadServiceCards()
            resetForm()
        }
    }, [isOpen])

    const resetForm = () => {
        setItemType('service')
        setDescription('')
        setItemCode('')
        setQuantity(1)
        setUnit('Adet')
        setUnitPrice('')
        setTaxRate(20)
        setDiscountPercent('')
        setDiscountAmount('')
        setDiscountType('percent')
        setSelectedMaterial(null)
        setSelectedService(null)
    }

    const loadMaterials = async () => {
        try {
            const response = await fetch(`${API_BASE}/api/materials`, {
                headers: { 'Authorization': `Bearer ${localStorage.getItem('auth_token') || 'dev-token'}` }
            })
            if (response.ok) {
                const data = await response.json()
                setMaterials(Array.isArray(data) ? data : [])
            }
        } catch (err) {
            console.error('Error loading materials:', err)
        }
    }

    const loadServiceCards = async () => {
        try {
            const response = await fetch(`${API_BASE}/api/service-cards`, {
                headers: { 'Authorization': `Bearer ${localStorage.getItem('auth_token') || 'dev-token'}` }
            })
            if (response.ok) {
                const data = await response.json()
                setServiceCards(Array.isArray(data) ? data : [])
            }
        } catch (err) {
            console.error('Error loading service cards:', err)
        }
    }

    // Auto-fill when material selected
    const handleMaterialSelect = (e) => {
        const materialId = e.target.value
        if (!materialId) {
            setSelectedMaterial(null)
            setDescription('')
            setItemCode('')
            setUnitPrice('')
            return
        }
        const material = materials.find(m => String(m.id) === materialId)
        if (material) {
            console.log('📦 Material selected:', material.name, 'unit:', material.unit)
            setSelectedMaterial(material)
            setDescription(material.name || material.description || '')
            setItemCode(material.stockCode || material.code || '')
            setUnitPrice(material.defaultPrice || material.price || '')
            // Capitalize first letter to match select options (adet -> Adet)
            const unitValue = material.unit ? material.unit.charAt(0).toUpperCase() + material.unit.slice(1).toLowerCase() : 'Adet'
            setUnit(unitValue)
            setTaxRate(material.vatRate || 20)
        }
    }

    // Auto-fill when service selected
    const handleServiceSelect = (e) => {
        const serviceId = e.target.value
        if (!serviceId) {
            setSelectedService(null)
            setDescription('')
            setItemCode('')
            setUnitPrice('')
            return
        }
        const service = serviceCards.find(s => String(s.id) === serviceId)
        if (service) {
            console.log('📦 Service selected:', service.name, 'unit:', service.unit)
            setSelectedService(service)
            setDescription(service.name || '')
            setItemCode(service.code || '')
            setUnitPrice(service.defaultPrice || '')
            setUnit(service.unit || 'Adet')
            setTaxRate(service.vatRate || 20)
        }
    }

    // Calculate line totals (realtime)
    const calculations = useMemo(() => {
        const qty = parseFloat(quantity) || 0
        const price = parseFloat(unitPrice) || 0
        const subtotal = qty * price

        let discount = 0
        if (discountType === 'percent' && discountPercent) {
            discount = subtotal * (parseFloat(discountPercent) / 100)
        } else if (discountType === 'amount' && discountAmount) {
            discount = parseFloat(discountAmount) || 0
        }

        const netAmount = subtotal - discount
        const taxAmount = netAmount * (parseFloat(taxRate) / 100)
        const totalAmount = netAmount + taxAmount

        return {
            subtotal,
            discount,
            netAmount,
            taxAmount,
            totalAmount
        }
    }, [quantity, unitPrice, discountPercent, discountAmount, discountType, taxRate])

    const handleSubmit = async (e) => {
        e.preventDefault()

        if (!description.trim()) {
            showToast('Ürün/Hizmet adı zorunludur', 'error')
            return
        }

        if (!unitPrice || parseFloat(unitPrice) <= 0) {
            showToast('Birim fiyat girilmelidir', 'error')
            return
        }

        try {
            setSaving(true)

            const itemData = {
                productName: description.trim(),
                description: description.trim(),
                stockCode: itemCode.trim() || null,
                quantity: parseFloat(quantity) || 1,
                unit,
                unitPrice: parseFloat(unitPrice),
                taxRate: parseInt(taxRate),
                discountPercent: discountType === 'percent' ? (parseFloat(discountPercent) || 0) : 0,
                discountAmount: calculations.discount,
                subtotal: calculations.subtotal,
                taxAmount: calculations.taxAmount,
                totalAmount: calculations.totalAmount
            }

            const response = await fetch(`${API_BASE}/api/quotes/${quoteId}/items`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('auth_token') || 'dev-token'}`
                },
                body: JSON.stringify(itemData)
            })

            if (!response.ok) {
                const err = await response.json()
                throw new Error(err.error || 'Kalem eklenemedi')
            }

            showToast('Kalem eklendi', 'success')
            onItemAdded?.()
            onClose()
        } catch (err) {
            console.error('Error adding item:', err)
            showToast(err.message || 'Kalem eklenemedi', 'error')
        } finally {
            setSaving(false)
        }
    }

    if (!isOpen) return null

    const formatPrice = (value) => {
        return new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2 }).format(value || 0)
    }

    return (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
            <div className="quote-modal-container invoice-modal-wide" style={{ maxWidth: '550px', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
                <div className="quote-modal-header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Plus size={18} className="text-primary" />
                        <h3 className="quote-modal-title">Kalem Ekle</h3>
                    </div>
                    <button className="quote-close-btn" onClick={onClose}>
                        <X size={18} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
                    <div className="quote-modal-content" style={{ padding: '16px', overflowY: 'auto', flex: 1 }}>
                        {/* Item Type Selection */}
                        <div style={{ marginBottom: '16px' }}>
                            <label className="label" style={{ marginBottom: '8px', display: 'block' }}>Kalem Tipi</label>
                            <div style={{ display: 'flex', gap: '16px' }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                                    <input
                                        type="radio"
                                        name="itemType"
                                        value="service"
                                        checked={itemType === 'service'}
                                        onChange={() => { setItemType('service'); setSelectedMaterial(null); }}
                                    />
                                    <Wrench size={14} />
                                    <span>Hizmet</span>
                                </label>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                                    <input
                                        type="radio"
                                        name="itemType"
                                        value="material"
                                        checked={itemType === 'material'}
                                        onChange={() => { setItemType('material'); setSelectedService(null); }}
                                    />
                                    <Package size={14} />
                                    <span>Malzeme</span>
                                </label>
                            </div>
                        </div>

                        {/* Service/Material Selector */}
                        {itemType === 'service' ? (
                            <div className="form-group" style={{ marginBottom: '12px' }}>
                                <label className="label">Hizmet Seç (opsiyonel)</label>
                                <select
                                    className="mes-filter-input"
                                    value={selectedService?.id || ''}
                                    onChange={handleServiceSelect}
                                >
                                    <option value="">-- Serbest giriş --</option>
                                    {serviceCards.map(s => (
                                        <option key={s.id} value={s.id}>{s.code} - {s.name}</option>
                                    ))}
                                </select>
                            </div>
                        ) : (
                            <div className="form-group" style={{ marginBottom: '12px' }}>
                                <label className="label">Malzeme Seç</label>
                                <select
                                    className="mes-filter-input"
                                    value={selectedMaterial?.id || ''}
                                    onChange={handleMaterialSelect}
                                >
                                    <option value="">-- Malzeme seçin --</option>
                                    {materials.map(m => (
                                        <option key={m.id} value={m.id}>{m.stockCode || m.code} - {m.name}</option>
                                    ))}
                                </select>
                            </div>
                        )}

                        {/* Description */}
                        <div className="form-group" style={{ marginBottom: '12px' }}>
                            <label className="label">Ürün/Hizmet Adı *</label>
                            <input
                                type="text"
                                className="mes-filter-input"
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                placeholder="Açıklama"
                                required
                            />
                        </div>

                        {/* Code & Unit - Grid */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                            <div className="form-group">
                                <label className="label">Stok/Hizmet Kodu</label>
                                <input
                                    type="text"
                                    className="mes-filter-input"
                                    value={itemCode}
                                    onChange={(e) => setItemCode(e.target.value)}
                                    placeholder="Opsiyonel"
                                />
                            </div>
                            <div className="form-group">
                                <label className="label">Birim</label>
                                <select
                                    className="mes-filter-input"
                                    value={unit}
                                    onChange={(e) => setUnit(e.target.value)}
                                >
                                    <option value="Adet">Adet</option>
                                    <option value="Kg">Kg</option>
                                    <option value="m">Metre</option>
                                    <option value="m²">m²</option>
                                    <option value="m³">m³</option>
                                    <option value="Lt">Litre</option>
                                    <option value="Set">Set</option>
                                    <option value="Saat">Saat</option>
                                    <option value="Gün">Gün</option>
                                    <option value="Sefer">Sefer</option>
                                    <option value="Palet">Palet</option>
                                    <option value="İşlem">İşlem</option>
                                </select>
                            </div>
                        </div>

                        {/* Quantity & Unit Price */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                            <div className="form-group">
                                <label className="label">Miktar</label>
                                <input
                                    type="number"
                                    step="0.01"
                                    min="0.01"
                                    className="mes-filter-input"
                                    value={quantity}
                                    onChange={(e) => setQuantity(e.target.value)}
                                />
                            </div>
                            <div className="form-group">
                                <label className="label">Birim Fiyat (₺) *</label>
                                <input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    className="mes-filter-input"
                                    value={unitPrice}
                                    onChange={(e) => setUnitPrice(e.target.value)}
                                    placeholder="0.00"
                                    required
                                />
                            </div>
                        </div>

                        {/* Tax Rate & Discount */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
                            <div className="form-group">
                                <label className="label">KDV Oranı</label>
                                <select
                                    className="mes-filter-input"
                                    value={taxRate}
                                    onChange={(e) => setTaxRate(e.target.value)}
                                >
                                    <option value={20}>%20</option>
                                    <option value={18}>%18</option>
                                    <option value={10}>%10</option>
                                    <option value={8}>%8</option>
                                    <option value={1}>%1</option>
                                    <option value={0}>%0 (İstisna)</option>
                                </select>
                            </div>
                            <div className="form-group">
                                <label className="label">Satır İskontosu</label>
                                <div style={{ display: 'flex', gap: '4px' }}>
                                    <select
                                        style={{ width: '60px', padding: '6px' }}
                                        className="mes-filter-input"
                                        value={discountType}
                                        onChange={(e) => {
                                            setDiscountType(e.target.value)
                                            setDiscountPercent('')
                                            setDiscountAmount('')
                                        }}
                                    >
                                        <option value="percent">%</option>
                                        <option value="amount">₺</option>
                                    </select>
                                    <input
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        className="mes-filter-input"
                                        style={{ flex: 1 }}
                                        value={discountType === 'percent' ? discountPercent : discountAmount}
                                        onChange={(e) => {
                                            if (discountType === 'percent') {
                                                setDiscountPercent(e.target.value)
                                            } else {
                                                setDiscountAmount(e.target.value)
                                            }
                                        }}
                                        placeholder={discountType === 'percent' ? '0' : '0.00'}
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Preview Calculations */}
                        <div style={{
                            padding: '12px',
                            background: '#f9fafb',
                            borderRadius: '6px',
                            border: '1px solid #e5e7eb'
                        }}>
                            <div style={{ fontSize: '12px', fontWeight: '600', marginBottom: '8px', color: '#374151' }}>
                                Önizleme
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '4px' }}>
                                <span style={{ color: '#6b7280' }}>Ara Toplam:</span>
                                <span>{formatPrice(calculations.subtotal)} ₺</span>
                            </div>
                            {calculations.discount > 0 && (
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '4px', color: '#dc2626' }}>
                                    <span>İskonto:</span>
                                    <span>-{formatPrice(calculations.discount)} ₺</span>
                                </div>
                            )}
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '4px' }}>
                                <span style={{ color: '#6b7280' }}>KDV (%{taxRate}):</span>
                                <span>{formatPrice(calculations.taxAmount)} ₺</span>
                            </div>
                            <div style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                fontSize: '13px',
                                fontWeight: '600',
                                paddingTop: '8px',
                                borderTop: '1px solid #e5e7eb',
                                marginTop: '8px'
                            }}>
                                <span>Satır Toplam:</span>
                                <span style={{ color: '#059669' }}>{formatPrice(calculations.totalAmount)} ₺</span>
                            </div>
                        </div>
                    </div>

                    <div className="quote-modal-footer">
                        <button type="button" className="btn-secondary" onClick={onClose}>
                            İptal
                        </button>
                        <button type="submit" className="btn-primary" disabled={saving}>
                            {saving ? (
                                <>
                                    <Loader2 size={14} className="spinner" />
                                    Ekleniyor...
                                </>
                            ) : (
                                <>
                                    <Plus size={14} />
                                    Ekle
                                </>
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    )
}
