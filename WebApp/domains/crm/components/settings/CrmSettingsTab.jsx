import React, { useState, useEffect } from 'react'
import { Settings, Plus, Pencil, Trash2, Save, X, Loader2, Package, FileText, Building2 } from 'lucide-react'
import { fetchWithTimeout, withAuth, API_BASE } from '../../../../shared/lib/api.js'
import { showToast } from '../../../../shared/components/MESToast.js'

/**
 * CRM Settings Tab
 * Manage service cards and invoice settings
 */
export default function CrmSettingsTab() {
    // Service Cards State
    const [serviceCards, setServiceCards] = useState([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)

    // Edit Modal State
    const [editModalOpen, setEditModalOpen] = useState(false)
    const [editingCard, setEditingCard] = useState(null)
    const [saving, setSaving] = useState(false)

    // Invoice Settings State
    const [invoiceSettings, setInvoiceSettings] = useState({
        defaultVatRate: 20,
        proformaPrefix: 'PF',
        invoicePrefix: 'INV',
        autoNumbering: true
    })
    const [settingsLoading, setSettingsLoading] = useState(false)

    // Load service cards
    useEffect(() => {
        loadServiceCards()
        loadInvoiceSettings()
    }, [])

    const loadServiceCards = async () => {
        try {
            setLoading(true)
            setError(null)
            const response = await fetchWithTimeout(`${API_BASE}/api/service-cards?includeInactive=true`, {
                headers: withAuth()
            })

            if (!response.ok) throw new Error('Failed to load service cards')

            const data = await response.json()
            setServiceCards(data)
        } catch (err) {
            console.error('Error loading service cards:', err)
            setError('Hizmet kartları yüklenemedi')
        } finally {
            setLoading(false)
        }
    }

    const loadInvoiceSettings = async () => {
        try {
            const response = await fetchWithTimeout(`${API_BASE}/api/settings/crm_invoice_config`, {
                headers: withAuth()
            })

            if (response.ok) {
                const data = await response.json()
                if (data.value) {
                    setInvoiceSettings(data.value)
                }
            }
        } catch (err) {
            console.warn('Invoice settings not found, using defaults')
        }
    }

    const saveInvoiceSettings = async () => {
        try {
            setSettingsLoading(true)
            const response = await fetchWithTimeout(`${API_BASE}/api/settings/crm_invoice_config`, {
                method: 'PUT',
                headers: { ...withAuth(), 'Content-Type': 'application/json' },
                body: JSON.stringify(invoiceSettings)
            })

            if (!response.ok) throw new Error('Failed to save settings')

            showToast('Fatura ayarları kaydedildi', 'success')
        } catch (err) {
            console.error('Error saving settings:', err)
            showToast('Ayarlar kaydedilemedi', 'error')
        } finally {
            setSettingsLoading(false)
        }
    }

    // Service Card CRUD
    const openAddModal = () => {
        setEditingCard({
            code: '',
            name: '',
            category: 'Hizmet',
            unit: 'Adet',
            defaultPrice: '',
            vatRate: 20,
            notes: '',
            isActive: true
        })
        setEditModalOpen(true)
    }

    const openEditModal = (card) => {
        setEditingCard({ ...card })
        setEditModalOpen(true)
    }

    const closeModal = () => {
        setEditModalOpen(false)
        setEditingCard(null)
    }

    const handleSaveCard = async () => {
        if (!editingCard.name) {
            showToast('Hizmet adı zorunludur', 'error')
            return
        }

        try {
            setSaving(true)
            const isNew = !editingCard.id
            const url = isNew
                ? `${API_BASE}/api/service-cards`
                : `${API_BASE}/api/service-cards/${editingCard.id}`

            const response = await fetchWithTimeout(url, {
                method: isNew ? 'POST' : 'PATCH',
                headers: { ...withAuth(), 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: editingCard.name,
                    code: editingCard.code || undefined,
                    category: editingCard.category,
                    unit: editingCard.unit,
                    defaultPrice: editingCard.defaultPrice ? parseFloat(editingCard.defaultPrice) : null,
                    vatRate: parseInt(editingCard.vatRate) || 20,
                    notes: editingCard.notes,
                    isActive: editingCard.isActive
                })
            })

            if (!response.ok) {
                const err = await response.json()
                throw new Error(err.error || 'Kayıt başarısız')
            }

            showToast(isNew ? 'Hizmet kartı eklendi' : 'Hizmet kartı güncellendi', 'success')
            closeModal()
            loadServiceCards()
        } catch (err) {
            console.error('Error saving card:', err)
            showToast(err.message, 'error')
        } finally {
            setSaving(false)
        }
    }

    const handleDeleteCard = async (card) => {
        if (!confirm(`"${card.name}" hizmet kartını silmek istediğinize emin misiniz?`)) {
            return
        }

        try {
            const response = await fetchWithTimeout(`${API_BASE}/api/service-cards/${card.id}`, {
                method: 'DELETE',
                headers: withAuth()
            })

            if (!response.ok) {
                const err = await response.json()
                throw new Error(err.error || 'Silme başarısız')
            }

            showToast('Hizmet kartı silindi', 'success')
            loadServiceCards()
        } catch (err) {
            console.error('Error deleting card:', err)
            showToast(err.message, 'error')
        }
    }

    const formatPrice = (price) => {
        if (!price) return '—'
        return new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2 }).format(price)
    }

    return (
        <div className="crm-settings-container">
            {/* Header */}
            <div className="section-header mb-16">
                <div className="flex-center-gap-8">
                    <Settings size={20} className="text-primary" />
                    <h2 className="section-title">CRM Ayarları</h2>
                </div>
            </div>

            {/* Service Cards Section */}
            <div className="section-card-mb mb-24">
                <div className="section-header-with-action">
                    <div className="flex-center-gap-8">
                        <Package size={18} className="text-muted" />
                        <h3 className="text-md font-semibold">Hizmet Kartları</h3>
                        <span className="badge-count">{serviceCards.length}</span>
                    </div>
                    <button className="btn-primary btn-sm" onClick={openAddModal}>
                        <Plus size={14} /> Yeni Hizmet
                    </button>
                </div>

                {loading ? (
                    <div className="loading-state">
                        <Loader2 size={24} className="spinner" />
                        <span>Yükleniyor...</span>
                    </div>
                ) : error ? (
                    <div className="error-state">
                        <span className="text-danger">{error}</span>
                        <button className="btn-secondary btn-sm" onClick={loadServiceCards}>Tekrar Dene</button>
                    </div>
                ) : (
                    <div className="table-wrapper mt-12">
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>Kod</th>
                                    <th>Hizmet Adı</th>
                                    <th>Kategori</th>
                                    <th>Birim</th>
                                    <th className="text-right">Fiyat</th>
                                    <th className="text-center">KDV</th>
                                    <th className="text-center">Durum</th>
                                    <th className="text-center">İşlem</th>
                                </tr>
                            </thead>
                            <tbody>
                                {serviceCards.length === 0 ? (
                                    <tr>
                                        <td colSpan={8} className="text-center text-muted">
                                            Henüz hizmet kartı eklenmemiş
                                        </td>
                                    </tr>
                                ) : (
                                    serviceCards.map(card => (
                                        <tr key={card.id} className={!card.isActive ? 'row-inactive' : ''}>
                                            <td><code className="code-badge">{card.code}</code></td>
                                            <td>{card.name}</td>
                                            <td>{card.category || '—'}</td>
                                            <td>{card.unit}</td>
                                            <td className="text-right">{formatPrice(card.defaultPrice)} ₺</td>
                                            <td className="text-center">%{card.vatRate}</td>
                                            <td className="text-center">
                                                <span className={`status-badge ${card.isActive ? 'success' : 'inactive'}`}>
                                                    {card.isActive ? 'Aktif' : 'Pasif'}
                                                </span>
                                            </td>
                                            <td className="text-center">
                                                <div className="action-buttons">
                                                    <button
                                                        className="btn-icon"
                                                        onClick={() => openEditModal(card)}
                                                        title="Düzenle"
                                                    >
                                                        <Pencil size={14} />
                                                    </button>
                                                    <button
                                                        className="btn-icon danger"
                                                        onClick={() => handleDeleteCard(card)}
                                                        title="Sil"
                                                    >
                                                        <Trash2 size={14} />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Invoice Settings Section */}
            <div className="section-card-mb mb-24">
                <div className="section-header-with-action">
                    <div className="flex-center-gap-8">
                        <FileText size={18} className="text-muted" />
                        <h3 className="text-md font-semibold">Fatura Ayarları</h3>
                    </div>
                    <button
                        className="btn-primary btn-sm"
                        onClick={saveInvoiceSettings}
                        disabled={settingsLoading}
                    >
                        {settingsLoading ? <Loader2 size={14} className="spinner" /> : <Save size={14} />}
                        Kaydet
                    </button>
                </div>

                <div className="settings-grid mt-16">
                    <div className="form-group">
                        <label className="label">Varsayılan KDV Oranı</label>
                        <select
                            className="mes-filter-input"
                            value={invoiceSettings.defaultVatRate}
                            onChange={(e) => setInvoiceSettings(prev => ({ ...prev, defaultVatRate: parseInt(e.target.value) }))}
                        >
                            <option value={20}>%20</option>
                            <option value={18}>%18</option>
                            <option value={10}>%10</option>
                            <option value={8}>%8</option>
                            <option value={1}>%1</option>
                            <option value={0}>%0 (KDV İstisna)</option>
                        </select>
                    </div>

                    <div className="form-group">
                        <label className="label">Proforma Prefix</label>
                        <input
                            type="text"
                            className="mes-filter-input"
                            value={invoiceSettings.proformaPrefix}
                            onChange={(e) => setInvoiceSettings(prev => ({ ...prev, proformaPrefix: e.target.value.toUpperCase() }))}
                            placeholder="PF"
                            maxLength={10}
                        />
                    </div>

                    <div className="form-group">
                        <label className="label">Fatura Prefix</label>
                        <input
                            type="text"
                            className="mes-filter-input"
                            value={invoiceSettings.invoicePrefix}
                            onChange={(e) => setInvoiceSettings(prev => ({ ...prev, invoicePrefix: e.target.value.toUpperCase() }))}
                            placeholder="INV"
                            maxLength={10}
                        />
                    </div>

                    <div className="form-group">
                        <label className="label checkbox-label">
                            <input
                                type="checkbox"
                                checked={invoiceSettings.autoNumbering}
                                onChange={(e) => setInvoiceSettings(prev => ({ ...prev, autoNumbering: e.target.checked }))}
                            />
                            <span>Otomatik Numaralama</span>
                        </label>
                    </div>
                </div>
            </div>

            {/* Edit Modal */}
            {editModalOpen && (
                <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && closeModal()}>
                    <div className="quote-modal-container" style={{ maxWidth: '500px' }}>
                        <div className="quote-modal-header">
                            <div className="flex-center-gap-8">
                                <Package size={18} className="text-primary" />
                                <h3 className="quote-modal-title">
                                    {editingCard?.id ? 'Hizmet Kartı Düzenle' : 'Yeni Hizmet Kartı'}
                                </h3>
                            </div>
                            <button className="quote-close-btn" onClick={closeModal}>
                                <X size={18} />
                            </button>
                        </div>

                        <div className="quote-modal-content">
                            <div className="form-group">
                                <label className="label">Hizmet Adı *</label>
                                <input
                                    type="text"
                                    className="mes-filter-input"
                                    value={editingCard?.name || ''}
                                    onChange={(e) => setEditingCard(prev => ({ ...prev, name: e.target.value }))}
                                    placeholder="Hizmet adı"
                                    autoFocus
                                />
                            </div>

                            <div className="grid-2-gap-12 mt-12">
                                <div className="form-group">
                                    <label className="label">Kod</label>
                                    <input
                                        type="text"
                                        className="mes-filter-input"
                                        value={editingCard?.code || ''}
                                        onChange={(e) => setEditingCard(prev => ({ ...prev, code: e.target.value.toUpperCase() }))}
                                        placeholder="Otomatik oluşturulur"
                                    />
                                </div>

                                <div className="form-group">
                                    <label className="label">Kategori</label>
                                    <select
                                        className="mes-filter-input"
                                        value={editingCard?.category || 'Hizmet'}
                                        onChange={(e) => setEditingCard(prev => ({ ...prev, category: e.target.value }))}
                                    >
                                        <option value="Hizmet">Hizmet</option>
                                        <option value="Nakliye">Nakliye</option>
                                        <option value="Montaj">Montaj</option>
                                        <option value="İşçilik">İşçilik</option>
                                        <option value="Other">Diğer</option>
                                    </select>
                                </div>
                            </div>

                            <div className="grid-2-gap-12 mt-12">
                                <div className="form-group">
                                    <label className="label">Birim</label>
                                    <select
                                        className="mes-filter-input"
                                        value={editingCard?.unit || 'Adet'}
                                        onChange={(e) => setEditingCard(prev => ({ ...prev, unit: e.target.value }))}
                                    >
                                        <option value="Adet">Adet</option>
                                        <option value="Saat">Saat</option>
                                        <option value="Gün">Gün</option>
                                        <option value="Sefer">Sefer</option>
                                        <option value="m²">m²</option>
                                        <option value="Set">Set</option>
                                    </select>
                                </div>

                                <div className="form-group">
                                    <label className="label">Varsayılan Fiyat (₺)</label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        className="mes-filter-input"
                                        value={editingCard?.defaultPrice || ''}
                                        onChange={(e) => setEditingCard(prev => ({ ...prev, defaultPrice: e.target.value }))}
                                        placeholder="0.00"
                                    />
                                </div>
                            </div>

                            <div className="grid-2-gap-12 mt-12">
                                <div className="form-group">
                                    <label className="label">KDV Oranı</label>
                                    <select
                                        className="mes-filter-input"
                                        value={editingCard?.vatRate || 20}
                                        onChange={(e) => setEditingCard(prev => ({ ...prev, vatRate: parseInt(e.target.value) }))}
                                    >
                                        <option value={20}>%20</option>
                                        <option value={18}>%18</option>
                                        <option value={10}>%10</option>
                                        <option value={8}>%8</option>
                                        <option value={1}>%1</option>
                                        <option value={0}>%0</option>
                                    </select>
                                </div>

                                <div className="form-group">
                                    <label className="label checkbox-label mt-24">
                                        <input
                                            type="checkbox"
                                            checked={editingCard?.isActive !== false}
                                            onChange={(e) => setEditingCard(prev => ({ ...prev, isActive: e.target.checked }))}
                                        />
                                        <span>Aktif</span>
                                    </label>
                                </div>
                            </div>

                            <div className="form-group mt-12">
                                <label className="label">Notlar</label>
                                <textarea
                                    className="mes-filter-input"
                                    value={editingCard?.notes || ''}
                                    onChange={(e) => setEditingCard(prev => ({ ...prev, notes: e.target.value }))}
                                    placeholder="Açıklama veya notlar..."
                                    rows={3}
                                    style={{ minHeight: '80px', resize: 'vertical' }}
                                />
                            </div>
                        </div>

                        <div className="quote-modal-footer">
                            <button className="btn-secondary" onClick={closeModal}>
                                İptal
                            </button>
                            <button
                                className="btn-primary"
                                onClick={handleSaveCard}
                                disabled={saving}
                            >
                                {saving ? (
                                    <>
                                        <Loader2 size={14} className="spinner" />
                                        Kaydediliyor...
                                    </>
                                ) : (
                                    <>
                                        <Save size={14} />
                                        {editingCard?.id ? 'Güncelle' : 'Ekle'}
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
