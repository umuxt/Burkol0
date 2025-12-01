import React from 'react'
import useSupplierProcurementHistory from '../../hooks/useSupplierProcurementHistory.js'
import { 
  getEffectiveMaterialStatus, 
  createStatusBadgeProps,
  SUPPLIER_STATUSES 
} from '../../utils/material-status-utils.js'
import { Phone, Mail, ShoppingCart, Edit, Trash2, Info, RotateCw, Save, X, ArrowLeft } from '../../../../shared/components/Icons.jsx'

// Input style helper
const getInputStyle = (isEditing) => ({
  padding: '8px 12px',
  border: isEditing ? '1px solid #3b82f6' : '1px solid transparent',
  borderRadius: '4px',
  background: isEditing ? 'white' : 'transparent',
  width: '100%',
  fontSize: '14px'
})

export default function SupplierDetailsPanel({
  // Supplier data
  supplier,
  
  // Edit state
  isEditing,
  formData,
  
  // All materials for lookup
  allMaterials,
  
  // Material management
  materialMode,
  newMaterial,
  materialCategories,
  materialTypes,
  showNewCategory,
  newCategory,
  nextMaterialCode,
  showAllMaterials,
  activeMaterials,
  materialsLoading,
  
  // Handlers - Basic
  onClose,
  onEdit,
  onCancel,
  onSave,
  onDelete,
  onInputChange,
  
  // Handlers - Order
  onOpenOrderModal,
  
  // Handlers - Material management
  onOpenMaterialPopup,
  onSetMaterialMode,
  onNewMaterialChange,
  onCategoryChange,
  onSetNewCategory,
  onAddNewMaterial,
  onSetShowAllMaterials,
  onMaterialStatusChange,
  onShowMaterialDetail,
  
  // Helpers
  getCategoryName,
  loadMaterials,
  extractMaterialCategories
}) {
  if (!supplier) return null

  return (
    <div className="supplier-detail-panel">
      <div className="supplier-panel-wrapper">
        {/* Header */}
        <div className="supplier-panel-header">
          <div className="flex-center-gap-12">
            <button
              className="btn-back-sm"
              onClick={onClose}
              title="Detayları Kapat"
            >
              <ArrowLeft size={14} />
            </button>
            <h3 className="supplier-section-title-lg">
              Tedarikçi Detayları
            </h3>
          </div>
          <div className="flex-gap-8-center">
            <button
              className="btn-icon-sm"
              onClick={(e) => {
                e.stopPropagation();
                if (supplier.phone1) {
                  window.open(`tel:${supplier.phone1}`, '_self');
                }
              }}
              title={`Ara: ${supplier.phone1 || 'Telefon bulunamadı'}`}
            >
              <Phone size={14} />
            </button>
            <button
              className="btn-icon-sm"
              onClick={(e) => {
                e.stopPropagation();
                if (supplier.email1) {
                  window.open(`mailto:${supplier.email1}`, '_blank');
                }
              }}
              title={`Mail At: ${supplier.email1 || 'Email bulunamadı'}`}
            >
              <Mail size={14} />
            </button>
            <button
              className="btn-icon-sm-mr"
              title="Sipariş Ver"
              onClick={(e) => {
                e.stopPropagation();
                if (supplier?.id) {
                  onOpenOrderModal(supplier.id);
                }
              }}
            >
              <ShoppingCart size={14} />
            </button>
            {!isEditing ? (
              <button
                className="btn-secondary-sm"
                onClick={onEdit}
              >
                <Edit size={14} className="mr-4" /> Düzenle
              </button>
            ) : (
              <>
                <button
                  type="submit"
                  form="supplier-detail-form"
                  className="btn-primary-sm"
                >
                  <Save size={14} className="mr-4" /> Kaydet
                </button>
                <button
                  className="btn-secondary-sm"
                  onClick={onCancel}
                >
                  <X size={14} className="mr-4" /> İptal
                </button>
              </>
            )}
            <button
              className="btn-danger-outline-sm"
              onClick={onDelete}
            >
              <Trash2 size={14} className="mr-4" /> Sil
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="panel-content">
          <form onSubmit={onSave} id="supplier-detail-form" className="supplier-details-layout">
            {/* Temel Firma Bilgileri */}
            <div className="section-card-mb">
              <h3 className="supplier-section-header">
                Temel Firma Bilgileri
              </h3>
              
              <div className="supplier-grid-2">
                <div className="supplier-detail-row">
                  <span className="supplier-detail-label-120">
                    Tedarikçi Kodu:
                  </span>
                  {isEditing ? (
                    <input
                      type="text"
                      name="code"
                      value={formData.code || ''}
                      onChange={onInputChange}
                      style={getInputStyle(isEditing)}
                    />
                  ) : (
                    <span className="supplier-detail-value">
                      {supplier.code || '-'}
                    </span>
                  )}
                </div>
                
                <div className="supplier-detail-row">
                  <span className="supplier-detail-label-120">
                    Durum:
                  </span>
                  {isEditing ? (
                    <select
                      name="status"
                      value={formData.status || ''}
                      onChange={onInputChange}
                      style={getInputStyle(isEditing)}
                    >
                      <option value="Aktif">Aktif</option>
                      <option value="Pasif">Pasif</option>
                      <option value="Onay Bekliyor">Onay Bekliyor</option>
                      <option value="Askıda">Askıda</option>
                    </select>
                  ) : (
                    <span className="supplier-detail-value">
                      {supplier.status || '-'}
                    </span>
                  )}
                </div>
              </div>
              
              <div className="supplier-detail-row">
                <span className="supplier-detail-label-120">
                  Firma Adı:
                </span>
                {isEditing ? (
                  <input
                    type="text"
                    name="name"
                    value={formData.name || ''}
                    onChange={onInputChange}
                    style={{ ...getInputStyle(isEditing), flex: 1 }}
                  />
                ) : (
                  <span className="supplier-detail-value">
                    {supplier.name || supplier.companyName || '-'}
                  </span>
                )}
              </div>
              
              <div className="supplier-grid-2">
                <div className="supplier-detail-row">
                  <span className="supplier-detail-label-120">
                    Tedarikçi Tipi:
                  </span>
                  {isEditing ? (
                    <select
                      name="supplierType"
                      value={formData.supplierType || ''}
                      onChange={onInputChange}
                      style={getInputStyle(isEditing)}
                    >
                      <option value="">Seçin</option>
                      <option value="manufacturer">Üretici</option>
                      <option value="distributor">Distribütör</option>
                      <option value="wholesaler">Toptancı</option>
                      <option value="service_provider">Hizmet Sağlayıcı</option>
                      <option value="contractor">Yüklenici</option>
                      <option value="consultant">Danışman</option>
                    </select>
                  ) : (
                    <span className="supplier-detail-value">
                      {supplier.supplierType || '-'}
                    </span>
                  )}
                </div>
                
                <div className="supplier-detail-row">
                  <span className="supplier-detail-label-120">
                    İş Kayıt No:
                  </span>
                  {isEditing ? (
                    <input
                      type="text"
                      name="businessRegistrationNumber"
                      value={formData.businessRegistrationNumber || ''}
                      onChange={onInputChange}
                      style={getInputStyle(isEditing)}
                    />
                  ) : (
                    <span className="supplier-detail-value">
                      {supplier.businessRegistrationNumber || '-'}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* İletişim Bilgileri */}
            <div className="section-card-mb">
              <h3 className="supplier-section-header">
                İletişim Bilgileri
              </h3>
              
              <div className="supplier-grid-2-mb">
                <div className="supplier-detail-row">
                  <span className="supplier-detail-label-120">
                    Yetkili Kişi:
                  </span>
                  {isEditing ? (
                    <input
                      type="text"
                      name="contactPerson"
                      value={formData.contactPerson || ''}
                      onChange={onInputChange}
                      style={getInputStyle(isEditing)}
                    />
                  ) : (
                    <span className="supplier-detail-value">
                      {supplier.contactPerson || '-'}
                    </span>
                  )}
                </div>
                
                <div className="supplier-detail-row">
                  <span className="supplier-detail-label-120">
                    Acil Durum:
                  </span>
                  {isEditing ? (
                    <input
                      type="text"
                      name="emergencyContact"
                      value={formData.emergencyContact || ''}
                      onChange={onInputChange}
                      style={getInputStyle(isEditing)}
                    />
                  ) : (
                    <span className="supplier-detail-value">
                      {supplier.emergencyContact || '-'}
                    </span>
                  )}
                </div>
              </div>
              
              <div className="supplier-grid-3-mb">
                <div className="supplier-detail-row">
                  <span className="supplier-detail-label-80">
                    Telefon 1:
                  </span>
                  {isEditing ? (
                    <input
                      type="tel"
                      name="phone1"
                      value={formData.phone1 || ''}
                      onChange={onInputChange}
                      style={getInputStyle(isEditing)}
                    />
                  ) : (
                    <span className="supplier-detail-value">
                      {supplier.phone1 || '-'}
                    </span>
                  )}
                </div>
                
                <div className="supplier-detail-row">
                  <span className="supplier-detail-label-80">
                    Telefon 2:
                  </span>
                  {isEditing ? (
                    <input
                      type="tel"
                      name="phone2"
                      value={formData.phone2 || ''}
                      onChange={onInputChange}
                      style={getInputStyle(isEditing)}
                    />
                  ) : (
                    <span className="supplier-detail-value">
                      {supplier.phone2 || '-'}
                    </span>
                  )}
                </div>
                
                <div className="supplier-detail-row">
                  <span className="supplier-detail-label-80">
                    Acil Tel:
                  </span>
                  {isEditing ? (
                    <input
                      type="tel"
                      name="emergencyPhone"
                      value={formData.emergencyPhone || ''}
                      onChange={onInputChange}
                      style={getInputStyle(isEditing)}
                    />
                  ) : (
                    <span className="supplier-detail-value">
                      {supplier.emergencyPhone || '-'}
                    </span>
                  )}
                </div>
              </div>
              
              <div className="supplier-grid-3-mb">
                <div className="supplier-detail-row">
                  <span className="supplier-detail-label-80">
                    E-posta 1:
                  </span>
                  {isEditing ? (
                    <input
                      type="email"
                      name="email1"
                      value={formData.email1 || ''}
                      onChange={onInputChange}
                      style={getInputStyle(isEditing)}
                    />
                  ) : (
                    <span className="supplier-detail-value">
                      {supplier.email1 || '-'}
                    </span>
                  )}
                </div>
                
                <div className="supplier-detail-row">
                  <span className="supplier-detail-label-80">
                    E-posta 2:
                  </span>
                  {isEditing ? (
                    <input
                      type="email"
                      name="email2"
                      value={formData.email2 || ''}
                      onChange={onInputChange}
                      style={getInputStyle(isEditing)}
                    />
                  ) : (
                    <span className="supplier-detail-value">
                      {supplier.email2 || '-'}
                    </span>
                  )}
                </div>
                
                <div className="supplier-detail-row">
                  <span className="supplier-detail-label-80">
                    Faks:
                  </span>
                  {isEditing ? (
                    <input
                      type="tel"
                      name="fax"
                      value={formData.fax || ''}
                      onChange={onInputChange}
                      style={getInputStyle(isEditing)}
                    />
                  ) : (
                    <span className="supplier-detail-value">
                      {supplier.fax || '-'}
                    </span>
                  )}
                </div>
              </div>
              
              <div className="supplier-grid-2">
                <div className="supplier-detail-row">
                  <span className="supplier-detail-label-120">
                    Web Sitesi:
                  </span>
                  {isEditing ? (
                    <input
                      type="url"
                      name="website"
                      value={formData.website || ''}
                      onChange={onInputChange}
                      style={getInputStyle(isEditing)}
                    />
                  ) : (
                    <span className="supplier-detail-value">
                      {supplier.website || '-'}
                    </span>
                  )}
                </div>
                
                <div className="supplier-detail-row">
                  <span className="supplier-detail-label-120">
                    Tercih İletişim:
                  </span>
                  {isEditing ? (
                    <select
                      name="preferredCommunication"
                      value={formData.preferredCommunication || ''}
                      onChange={onInputChange}
                      style={getInputStyle(isEditing)}
                    >
                      <option value="email">E-posta</option>
                      <option value="phone">Telefon</option>
                      <option value="fax">Faks</option>
                      <option value="whatsapp">WhatsApp</option>
                    </select>
                  ) : (
                    <span className="supplier-detail-value">
                      {supplier.preferredCommunication || '-'}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Adres ve Mali Bilgiler - Üst Bölüm */}
            <div className="supplier-grid-2-mb">
              {/* Adres Bilgileri */}
              <div className="section-card-mb">
                <h3 className="supplier-section-header">
                  Adres Bilgileri
                </h3>
                
                <div className="supplier-detail-row-start">
                  <span className="supplier-detail-label-80-mt">
                    Adres:
                  </span>
                  {isEditing ? (
                    <textarea
                      name="address"
                      value={formData.address || ''}
                      onChange={onInputChange}
                      rows="2"
                      style={{ ...getInputStyle(isEditing), flex: 1, resize: 'vertical' }}
                    />
                  ) : (
                    <span className="text-xs-flex-1">
                      {supplier.address || 'Adres girilmemiş'}
                    </span>
                  )}
                </div>
                
                <div className="supplier-detail-row">
                  <span className="supplier-detail-label-80">
                    Şehir:
                  </span>
                  {isEditing ? (
                    <input
                      type="text"
                      name="city"
                      value={formData.city || ''}
                      onChange={onInputChange}
                      style={getInputStyle(isEditing)}
                    />
                  ) : (
                    <span className="supplier-detail-value">
                      {supplier.city || '-'}
                    </span>
                  )}
                </div>
                
                <div className="supplier-detail-row">
                  <span className="supplier-detail-label-80">
                    İlçe:
                  </span>
                  {isEditing ? (
                    <input
                      type="text"
                      name="state"
                      value={formData.state || ''}
                      onChange={onInputChange}
                      style={getInputStyle(isEditing)}
                    />
                  ) : (
                    <span className="supplier-detail-value">
                      {supplier.state || '-'}
                    </span>
                  )}
                </div>
                
                <div className="supplier-detail-row">
                  <span className="supplier-detail-label-80">
                    Posta Kodu:
                  </span>
                  {isEditing ? (
                    <input
                      type="text"
                      name="postalCode"
                      value={formData.postalCode || ''}
                      onChange={onInputChange}
                      style={getInputStyle(isEditing)}
                    />
                  ) : (
                    <span className="supplier-detail-value">
                      {supplier.postalCode || '-'}
                    </span>
                  )}
                </div>
                
                <div className="supplier-detail-row">
                  <span className="supplier-detail-label-80">
                    Ülke:
                  </span>
                  {isEditing ? (
                    <select
                      name="country"
                      value={formData.country || ''}
                      onChange={onInputChange}
                      style={getInputStyle(isEditing)}
                    >
                      <option value="Türkiye">Türkiye</option>
                      <option value="Almanya">Almanya</option>
                      <option value="Fransa">Fransa</option>
                      <option value="İtalya">İtalya</option>
                      <option value="İngiltere">İngiltere</option>
                      <option value="ABD">ABD</option>
                      <option value="Çin">Çin</option>
                      <option value="Japonya">Japonya</option>
                      <option value="Other">Diğer</option>
                    </select>
                  ) : (
                    <span className="supplier-detail-value">
                      {supplier.country || '-'}
                    </span>
                  )}
                </div>
              </div>

              {/* Mali Bilgiler */}
              <div className="section-card-mb">
                <h3 className="supplier-section-header">
                  Mali Bilgiler
                </h3>
                
                <div className="supplier-detail-row">
                  <span className="supplier-detail-label-80">
                    Vergi No:
                  </span>
                  {isEditing ? (
                    <input
                      type="text"
                      name="taxNumber"
                      value={formData.taxNumber || ''}
                      onChange={onInputChange}
                      style={getInputStyle(isEditing)}
                    />
                  ) : (
                    <span className="supplier-detail-value">
                      {supplier.taxNumber || '-'}
                    </span>
                  )}
                </div>
                
                <div className="supplier-detail-row">
                  <span className="supplier-detail-label-80">
                    Vergi Dairesi:
                  </span>
                  {isEditing ? (
                    <input
                      type="text"
                      name="taxOffice"
                      value={formData.taxOffice || ''}
                      onChange={onInputChange}
                      style={getInputStyle(isEditing)}
                    />
                  ) : (
                    <span className="supplier-detail-value">
                      {supplier.taxOffice || '-'}
                    </span>
                  )}
                </div>
                
                <div className="supplier-detail-row">
                  <span className="supplier-detail-label-80">
                    Para Birimi:
                  </span>
                  {isEditing ? (
                    <select
                      name="currency"
                      value={formData.currency || ''}
                      onChange={onInputChange}
                      style={getInputStyle(isEditing)}
                    >
                      <option value="TRY">TRY</option>
                      <option value="USD">USD</option>
                      <option value="EUR">EUR</option>
                      <option value="GBP">GBP</option>
                    </select>
                  ) : (
                    <span className="supplier-detail-value">
                      {supplier.currency || '-'}
                    </span>
                  )}
                </div>
                
                <div className="supplier-detail-row">
                  <span className="supplier-detail-label-80">
                    Kredi Limiti:
                  </span>
                  {isEditing ? (
                    <input
                      type="text" inputMode="decimal" pattern="[0-9]*\.?[0-9]*"
                      name="creditLimit"
                      value={formData.creditLimit || ''}
                      onChange={onInputChange}
                      style={getInputStyle(isEditing)}
                    />
                  ) : (
                    <span className="supplier-detail-value">
                      {supplier.creditLimit || '-'}
                    </span>
                  )}
                </div>
                
                <div className="supplier-detail-row">
                  <span className="supplier-detail-label-80">
                    Kredi Notu:
                  </span>
                  {isEditing ? (
                    <select
                      name="creditRating"
                      value={formData.creditRating || ''}
                      onChange={onInputChange}
                      style={getInputStyle(isEditing)}
                    >
                      <option value="">Seçin</option>
                      <option value="A">A - Mükemmel</option>
                      <option value="B">B - İyi</option>
                      <option value="C">C - Orta</option>
                      <option value="D">D - Zayıf</option>
                      <option value="F">F - Riskli</option>
                    </select>
                  ) : (
                    <span className="supplier-detail-value">
                      {supplier.creditRating || '-'}
                    </span>
                  )}
                </div>
                
                <div className="supplier-detail-row">
                  <span className="supplier-detail-label-80">
                    Yıllık Ciro:
                  </span>
                  {isEditing ? (
                    <input
                      type="text" inputMode="decimal" pattern="[0-9]*\.?[0-9]*"
                      name="annualRevenue"
                      value={formData.annualRevenue || ''}
                      onChange={onInputChange}
                      style={getInputStyle(isEditing)}
                    />
                  ) : (
                    <span className="supplier-detail-value">
                      {supplier.annualRevenue || '-'}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Ödeme ve Operasyonel Bilgiler - Orta Bölüm */}
            <div className="supplier-grid-2-mb">
              {/* Ödeme Bilgileri */}
              <div className="section-card-mb">
                <h3 className="supplier-section-header">
                  Ödeme Bilgileri
                </h3>
                
                <div className="supplier-detail-row">
                  <span className="supplier-detail-label-80">
                    Ödeme Koşul:
                  </span>
                  {isEditing ? (
                    <select
                      name="paymentTerms"
                      value={formData.paymentTerms || ''}
                      onChange={onInputChange}
                      style={getInputStyle(isEditing)}
                    >
                      <option value="">Seçin</option>
                      <option value="Peşin">Peşin</option>
                      <option value="15 gün vade">15 gün</option>
                      <option value="30 gün vade">30 gün</option>
                      <option value="45 gün vade">45 gün</option>
                      <option value="60 gün vade">60 gün</option>
                      <option value="90 gün vade">90 gün</option>
                      <option value="120 gün vade">120 gün</option>
                    </select>
                  ) : (
                    <span className="supplier-detail-value">
                      {supplier.paymentTerms || '-'}
                    </span>
                  )}
                </div>
                
                <div className="supplier-detail-row">
                  <span className="supplier-detail-label-80">
                    Ödeme Yöntem:
                  </span>
                  {isEditing ? (
                    <select
                      name="paymentMethod"
                      value={formData.paymentMethod || ''}
                      onChange={onInputChange}
                      style={getInputStyle(isEditing)}
                    >
                      <option value="">Seçin</option>
                      <option value="bank_transfer">Havale/EFT</option>
                      <option value="check">Çek</option>
                      <option value="cash">Nakit</option>
                      <option value="credit_card">Kredi Kartı</option>
                      <option value="letter_of_credit">Akreditif</option>
                      <option value="promissory_note">Senet</option>
                    </select>
                  ) : (
                    <span className="supplier-detail-value">
                      {supplier.paymentMethod || '-'}
                    </span>
                  )}
                </div>
                
                <div className="supplier-detail-row">
                  <span className="supplier-detail-label-80">
                    Banka:
                  </span>
                  {isEditing ? (
                    <input
                      type="text"
                      name="bankName"
                      value={formData.bankName || ''}
                      onChange={onInputChange}
                      style={getInputStyle(isEditing)}
                    />
                  ) : (
                    <span className="supplier-detail-value">
                      {supplier.bankName || '-'}
                    </span>
                  )}
                </div>
                
                <div className="supplier-detail-row">
                  <span className="supplier-detail-label-80">
                    Hesap No:
                  </span>
                  {isEditing ? (
                    <input
                      type="text"
                      name="bankAccount"
                      value={formData.bankAccount || ''}
                      onChange={onInputChange}
                      style={getInputStyle(isEditing)}
                    />
                  ) : (
                    <span className="supplier-detail-value">
                      {supplier.bankAccount || '-'}
                    </span>
                  )}
                </div>
                
                <div className="supplier-detail-row">
                  <span className="supplier-detail-label-80">
                    IBAN:
                  </span>
                  {isEditing ? (
                    <input
                      type="text"
                      name="iban"
                      value={formData.iban || ''}
                      onChange={onInputChange}
                      style={{ ...getInputStyle(isEditing), flex: 1 }}
                    />
                  ) : (
                    <span className="supplier-detail-value">
                      {supplier.iban || '-'}
                    </span>
                  )}
                </div>
              </div>

              {/* Operasyonel Bilgiler */}
              <div className="section-card-mb">
                <h3 className="supplier-section-header">
                  Operasyonel Bilgiler
                </h3>
                
                <div className="supplier-detail-row">
                  <span className="supplier-detail-label-80">
                    Teslimat:
                  </span>
                  {isEditing ? (
                    <input
                      type="text"
                      name="deliveryCapability"
                      value={formData.deliveryCapability || ''}
                      onChange={onInputChange}
                      style={getInputStyle(isEditing)}
                    />
                  ) : (
                    <span className="supplier-detail-value">
                      {supplier.deliveryCapability || '-'}
                    </span>
                  )}
                </div>
                
                <div className="supplier-detail-row">
                  <span className="supplier-detail-label-80">
                    Tedarik Süresi:
                  </span>
                  {isEditing ? (
                    <input
                      type="text" inputMode="decimal" pattern="[0-9]*\.?[0-9]*"
                      name="leadTime"
                      value={formData.leadTime || ''}
                      onChange={onInputChange}
                      style={getInputStyle(isEditing)}
                    />
                  ) : (
                    <span className="supplier-detail-value">
                      {supplier.leadTime ? `${supplier.leadTime} gün` : '-'}
                    </span>
                  )}
                </div>
                
                <div className="supplier-detail-row">
                  <span className="supplier-detail-label-80">
                    Min. Sipariş:
                  </span>
                  {isEditing ? (
                    <input
                      type="text"
                      name="minimumOrderQuantity"
                      value={formData.minimumOrderQuantity || ''}
                      onChange={onInputChange}
                      style={getInputStyle(isEditing)}
                    />
                  ) : (
                    <span className="supplier-detail-value">
                      {supplier.minimumOrderQuantity || '-'}
                    </span>
                  )}
                </div>
                
                <div className="supplier-detail-row">
                  <span className="supplier-detail-label-80">
                    Sertifika:
                  </span>
                  {isEditing ? (
                    <select
                      name="qualityCertification"
                      value={formData.qualityCertification || ''}
                      onChange={onInputChange}
                      style={getInputStyle(isEditing)}
                    >
                      <option value="">Seçin</option>
                      <option value="ISO_9001">ISO 9001</option>
                      <option value="ISO_14001">ISO 14001</option>
                      <option value="TS_EN_ISO">TS EN ISO</option>
                      <option value="CE">CE İşareti</option>
                      <option value="TSE">TSE</option>
                      <option value="OHSAS_18001">OHSAS 18001</option>
                      <option value="other">Diğer</option>
                    </select>
                  ) : (
                    <span className="supplier-detail-value">
                      {supplier.qualityCertification || '-'}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Şirket Bilgileri - Alt Bölüm */}
            <div className="section-card-mb">
              <h3 className="supplier-section-header">
                Şirket Bilgileri
              </h3>
              
              <div className="grid-4">
                <div className="supplier-detail-row">
                  <span className="supplier-detail-label-100">
                    Kuruluş Yılı:
                  </span>
                  {isEditing ? (
                    <input
                      type="text" inputMode="decimal" pattern="[0-9]*\.?[0-9]*"
                      name="yearEstablished"
                      value={formData.yearEstablished || ''}
                      onChange={onInputChange}
                      style={getInputStyle(isEditing)}
                    />
                  ) : (
                    <span className="supplier-detail-value">
                      {supplier.yearEstablished || '-'}
                    </span>
                  )}
                </div>
                
                <div className="supplier-detail-row">
                  <span className="supplier-detail-label-100">
                    Çalışan Sayısı:
                  </span>
                  {isEditing ? (
                    <select
                      name="employeeCount"
                      value={formData.employeeCount || ''}
                      onChange={onInputChange}
                      style={getInputStyle(isEditing)}
                    >
                      <option value="">Seçin</option>
                      <option value="1-10">1-10 kişi</option>
                      <option value="11-50">11-50 kişi</option>
                      <option value="51-100">51-100 kişi</option>
                      <option value="101-500">101-500 kişi</option>
                      <option value="501-1000">501-1000 kişi</option>
                      <option value="1000+">1000+ kişi</option>
                    </select>
                  ) : (
                    <span className="supplier-detail-value">
                      {supplier.employeeCount || '-'}
                    </span>
                  )}
                </div>
                
                <div className="supplier-detail-row">
                  <span className="supplier-detail-label-100">
                    Risk Seviyesi:
                  </span>
                  {isEditing ? (
                    <select
                      name="riskLevel"
                      value={formData.riskLevel || ''}
                      onChange={onInputChange}
                      style={getInputStyle(isEditing)}
                    >
                      <option value="low">Düşük Risk</option>
                      <option value="medium">Orta Risk</option>
                      <option value="high">Yüksek Risk</option>
                    </select>
                  ) : (
                    <span className="supplier-detail-value">
                      {supplier.riskLevel || '-'}
                    </span>
                  )}
                </div>
                
                <div className="supplier-detail-row">
                  <span className="supplier-detail-label-100">
                    Uyumluluk:
                  </span>
                  {isEditing ? (
                    <select
                      name="complianceStatus"
                      value={formData.complianceStatus || ''}
                      onChange={onInputChange}
                      style={getInputStyle(isEditing)}
                    >
                      <option value="pending">Beklemede</option>
                      <option value="approved">Onaylandı</option>
                      <option value="rejected">Reddedildi</option>
                      <option value="under_review">İnceleniyor</option>
                    </select>
                  ) : (
                    <span className="supplier-detail-value">
                      {supplier.complianceStatus || '-'}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Tedarik Edilen Malzemeler */}
            <div className="section-card-mb">
              <h3 className="supplier-section-header">
                Tedarik Edilen Malzemeler
              </h3>

                                {/* Material Mode Toggle */}
                                <div className="mb-12">
                                  <div className="flex-gap-8-mb-8">
                                    <button
                                      type="button"
                                      onClick={onOpenMaterialPopup}
                                      className="section-button"
                                    >
                                      Mevcut Malzemelerden Ekle
                                    </button>
                                    <button
                                      type="button"
                                      onClick={async () => {
                                        onSetMaterialMode('new')
                                        if ((!activeMaterials || activeMaterials.length === 0) && !materialsLoading) {
                                          await loadMaterials()
                                          await extractMaterialCategories()
                                        } else {
                                          await extractMaterialCategories()
                                        }
                                      }}
                                      className="section-button"
                                    >
                                      Yeni Malzeme Ekle
                                    </button>
                                  </div>
                                </div>
              {/* Current Supplied Materials */}
              {supplier?.suppliedMaterials && supplier.suppliedMaterials.length > 0 && (() => {
                // Normalize supplied materials to have consistent field names
                const normalizedMaterials = supplier.suppliedMaterials.map(material => ({
                  ...material,
                  id: material.id || material.materialId,
                  code: material.code || material.materialCode,
                  name: material.name || material.materialName
                }))

                // Calculate materials count based on toggle state
                const filteredMaterials = normalizedMaterials.filter(material => {
                  const fullMaterial = allMaterials.find(m => m.id === material.id)
                  const materialName = fullMaterial?.name || material.name

                  // If material doesn't exist in DB anymore, do not show
                  if (!fullMaterial) return false

                  // Filter empty names first
                  if (!materialName || materialName.trim() === '') return false

                  // Then filter by active/all based on toggle
                  if (showAllMaterials) {
                    // Show both active and removed ones that still exist
                    return true
                  } else {
                    // Only show if not removed
                    return fullMaterial.status !== 'Kaldırıldı'
                  }
                })
                
                const validMaterialsCount = filteredMaterials.length
                
                return (
                  <div className="mb-12">
                    <div className="material-list-header">
                      <h4 className="material-list-title">
                        Tedarik Edilen Malzemeler ({validMaterialsCount})
                      </h4>
                      <button
                        type="button"
                        className={`btn-toggle-sm ${showAllMaterials ? 'active' : ''}`}
                        onClick={() => onSetShowAllMaterials(!showAllMaterials)}
                      >
                        {showAllMaterials ? 'Mevcut Malzemeler' : 'Hepsini Göster'}
                      </button>
                    </div>
                  <div className="material-list-container">
                    {filteredMaterials.length > 0 ? (
                      filteredMaterials.map((material, index) => {
                      // Find full material details from allMaterials array
                      const fullMaterial = allMaterials.find(m => m.id === material.id)
                      const isRemoved = fullMaterial?.status === 'Kaldırıldı'
                      const materialName = fullMaterial?.name || material.name || 'İsimsiz Malzeme'
                      
                      return (
                        <div
                          key={material.id || index}
                          style={{
                            padding: '6px 12px',
                            borderBottom: index < filteredMaterials.length - 1 ? '1px solid #f3f4f6' : 'none',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            fontSize: '12px',
                            opacity: isRemoved ? 0.6 : 1 // 50% opacity for removed materials
                          }}
                        >
                          <div>
                            <div style={{ 
                              display: 'flex', 
                              alignItems: 'center', 
                              gap: '8px',
                              marginBottom: '2px'
                            }}>
                              <span style={{ 
                                fontWeight: '600', 
                                color: isRemoved ? '#dc2626' : (material.status === 'pasif' ? '#dc2626' : material.status === 'değerlendirmede' ? '#eab308' : '#111827'),
                                textDecoration: isRemoved ? 'line-through' : 'none',
                                opacity: (!isRemoved && material.status === 'pasif') ? 0.6 : 1
                              }}>
                                {materialName}
                              </span>
                              {isRemoved && (
                                <span style={{
                                  fontSize: '10px',
                                  padding: '1px 4px',
                                  borderRadius: '2px',
                                  background: '#dc2626',
                                  color: 'white'
                                }}>
                                  KALDIRILDI
                                </span>
                              )}
                            </div>
                            <div style={{ fontSize: '11px', color: isRemoved ? '#dc2626' : '#6b7280' }}>
                              {(() => {
                                const catName = getCategoryName(fullMaterial?.category || material.category)
                                return catName ? `${catName} • ` : ''
                              })()}
                              {fullMaterial?.unit || material.unit}
                            </div>
                          </div>
                          <div className="flex-center-gap-6">
                            <button
                              onClick={() => onShowMaterialDetail(material.id)}
                              style={{
                                background: 'none',
                                border: 'none',
                                cursor: 'pointer',
                                padding: '2px',
                                borderRadius: '3px',
                                color: isRemoved ? '#dc2626' : '#6b7280',
                                display: 'flex',
                                alignItems: 'center'
                              }}
                              title="Malzeme Detayları"
                            >
                              <Info size={12} />
                            </button>
                            {!isRemoved && (() => {
                              // Calculate effective status based on supplier status and material status
                              const effectiveStatus = getEffectiveMaterialStatus(
                                fullMaterial, 
                                supplier, 
                                material
                              )
                              
                              // If supplier is not active, show status badge (non-editable)
                              if (supplier.status !== SUPPLIER_STATUSES.ACTIVE) {
                                const badgeProps = createStatusBadgeProps(effectiveStatus, { 
                                  size: 'small', 
                                  showTooltip: true 
                                })
                                return (
                                  <span {...badgeProps} />
                                )
                              }
                              
                              // If supplier is active, show editable select for material status
                              return (
                                <select
                                  value={material.status || 'aktif'}
                                  onChange={(e) => onMaterialStatusChange(material.id, e.target.value)}
                                  style={{
                                    padding: '1px 4px',
                                    fontSize: '10px',
                                    border: '1px solid #d1d5db',
                                    borderRadius: '3px',
                                    background: 'white',
                                    color: '#374151',
                                    cursor: 'pointer',
                                    minWidth: '60px',
                                    maxWidth: '80px',
                                    textAlign: 'right'
                                  }}
                                  title="Malzeme statüsü (tedarikçi aktif olduğu için düzenlenebilir)"
                                >
                                  <option value="aktif">Aktif</option>
                                  <option value="pasif">Pasif</option>
                                  <option value="değerlendirmede">Değerlendirmede</option>
                                </select>
                              )
                            })()}
                          </div>
                        </div>
                      )
                      })
                    ) : (
                    <div className="empty-message-italic">
                        {showAllMaterials 
                          ? 'Bu tedarikçiye ait malzeme bulunamadı.' 
                          : 'Bu tedarikçiye ait aktif malzeme bulunamadı. "Hepsini Göster" ile kaldırılmış malzemeleri görebilirsiniz.'
                        }
                      </div>
                    )}
                  </div>
                </div>
                )
              })()}

              {/* New Material Mode */}
              {materialMode === 'new' && (
                <div>
                  <div className="supplier-detail-row">
                    <span className="supplier-detail-label-100">
                      Malzeme Adı:
                    </span>
                    <input
                      type="text"
                      name="name"
                      value={newMaterial.name}
                      onChange={onNewMaterialChange}
                      placeholder="Malzeme adını girin"
                      style={{
                        flex: 1,
                        padding: '6px 8px',
                        border: '1px solid #d1d5db',
                        borderRadius: '4px',
                        fontSize: '12px',
                        background: 'white'
                      }}
                    />
                  </div>

                  <div className="supplier-detail-row">
                    <span className="supplier-detail-label-100">
                      Tip:
                    </span>
                    <select
                      name="type"
                      value={newMaterial.type}
                      onChange={onNewMaterialChange}
                      style={{
                        flex: 1,
                        padding: '6px 8px',
                        border: '1px solid #d1d5db',
                        borderRadius: '4px',
                        fontSize: '12px',
                        background: 'white'
                      }}
                    >
                      <option value="">Tip seçin</option>
                      {materialTypes.map(type => (
                        <option key={type.id} value={type.id}>{type.label}</option>
                      ))}
                    </select>
                  </div>

                  <div className="supplier-detail-row">
                    <span className="supplier-detail-label-100">
                      Kategori:
                    </span>
                    <select
                      name="category"
                      value={showNewCategory ? 'new-category' : newMaterial.category}
                      onChange={onCategoryChange}
                      style={{
                        flex: 1,
                        padding: '6px 8px',
                        border: '1px solid #d1d5db',
                        borderRadius: '4px',
                        fontSize: '12px',
                        background: 'white'
                      }}
                    >
                      <option value="">Kategori seçin</option>
                      {materialCategories.map(category => (
                        <option key={category.id} value={category.id}>
                          {category.name || category.label || category.id}
                        </option>
                      ))}
                      <option value="new-category">+ Yeni Kategori Ekle</option>
                    </select>
                  </div>

                  {showNewCategory && (
                    <div className="supplier-detail-row">
                      <span className="supplier-detail-label-100">
                        Yeni Kategori:
                      </span>
                      <input
                        type="text"
                        value={newCategory}
                        onChange={(e) => onSetNewCategory(e.target.value)}
                        placeholder="Yeni kategori adını girin"
                        style={{
                          flex: 1,
                          padding: '6px 8px',
                          border: '1px solid #d1d5db',
                          borderRadius: '4px',
                          fontSize: '12px',
                          background: 'white'
                        }}
                      />
                    </div>
                  )}

                  <div className="supplier-detail-row">
                    <span className="supplier-detail-label-100">
                      Birim:
                    </span>
                    <select
                      name="unit"
                      value={newMaterial.unit}
                      onChange={onNewMaterialChange}
                      style={{
                        flex: 1,
                        padding: '6px 8px',
                        border: '1px solid #d1d5db',
                        borderRadius: '4px',
                        fontSize: '12px',
                        background: 'white'
                      }}
                    >
                      <option value="">Birim seçin</option>
                      <option value="kg">Kilogram (kg)</option>
                      <option value="g">Gram (g)</option>
                      <option value="lt">Litre (lt)</option>
                      <option value="ml">Mililitre (ml)</option>
                      <option value="m">Metre (m)</option>
                      <option value="cm">Santimetre (cm)</option>
                      <option value="m²">Metrekare (m²)</option>
                      <option value="adet">Adet</option>
                      <option value="paket">Paket</option>
                      <option value="kutu">Kutu</option>
                    </select>
                  </div>

                  <div className="supplier-detail-row">
                    <span className="supplier-detail-label-100">
                      Kod:
                    </span>
                    <input
                      type="text"
                      name="code"
                      value={newMaterial.code || nextMaterialCode}
                      onChange={onNewMaterialChange}
                      placeholder={`Otomatik kod: ${nextMaterialCode}`}
                      style={{
                        flex: 1,
                        padding: '6px 8px',
                        border: '1px solid #d1d5db',
                        borderRadius: '4px',
                        fontSize: '12px',
                        background: 'white'
                      }}
                    />
                  </div>

                  <div className="supplier-detail-row-start">
                    <span className="supplier-detail-label-100-mt">
                      Açıklama:
                    </span>
                    <textarea
                      name="description"
                      value={newMaterial.description}
                      onChange={onNewMaterialChange}
                      placeholder="Malzeme açıklaması (opsiyonel)"
                      rows="2"
                      style={{
                        flex: 1,
                        padding: '6px 8px',
                        border: '1px solid #d1d5db',
                        borderRadius: '4px',
                        fontSize: '12px',
                        background: 'white',
                        resize: 'vertical'
                      }}
                    />
                  </div>

                  <div className="supplier-detail-row">
                    <span className="supplier-detail-label-100">
                      Minimum Stok:
                    </span>
                    <input
                      type="text" inputMode="decimal" pattern="[0-9]*\.?[0-9]*"
                      name="reorderPoint"
                      value={newMaterial.reorderPoint}
                      onChange={onNewMaterialChange}
                      placeholder="Minimum stok seviyesi"
                      style={{
                        flex: 1,
                        padding: '6px 8px',
                        border: '1px solid #d1d5db',
                        borderRadius: '4px',
                        fontSize: '12px',
                        background: 'white'
                      }}
                    />
                  </div>

                  <div className="supplier-detail-row">
                    <span className="supplier-detail-label-100">
                      Mevcut Stok:
                    </span>
                    <input
                      type="text" inputMode="decimal" pattern="[0-9]*\.?[0-9]*"
                      name="stockLevel"
                      value={newMaterial.stockLevel}
                      onChange={onNewMaterialChange}
                      placeholder="Şu anki stok miktarı"
                      style={{
                        flex: 1,
                        padding: '6px 8px',
                        border: '1px solid #d1d5db',
                        borderRadius: '4px',
                        fontSize: '12px',
                        background: 'white'
                      }}
                    />
                  </div>

                  <div className="supplier-detail-row">
                    <span className="supplier-detail-label-100">
                      Maliyet Fiyatı:
                    </span>
                    <input
                      type="text" inputMode="decimal" pattern="[0-9]*\.?[0-9]*"
                      step="0.01"
                      name="costPrice"
                      value={newMaterial.costPrice}
                      onChange={onNewMaterialChange}
                      placeholder="Maliyet fiyatı (TRY)"
                      style={{
                        flex: 1,
                        padding: '6px 8px',
                        border: '1px solid #d1d5db',
                        borderRadius: '4px',
                        fontSize: '12px',
                        background: 'white'
                      }}
                    />
                  </div>

                  <div className="supplier-detail-row">
                    <span className="supplier-detail-label-100">
                      Satış Fiyatı:
                    </span>
                    <input
                      type="text" inputMode="decimal" pattern="[0-9]*\.?[0-9]*"
                      step="0.01"
                      name="sellPrice"
                      value={newMaterial.sellPrice}
                      onChange={onNewMaterialChange}
                      placeholder="Satış fiyatı (TRY)"
                      style={{
                        flex: 1,
                        padding: '6px 8px',
                        border: '1px solid #d1d5db',
                        borderRadius: '4px',
                        fontSize: '12px',
                        background: 'white'
                      }}
                    />
                  </div>

                  <div className="supplier-detail-row">
                    <span className="supplier-detail-label-100">
                      Durum:
                    </span>
                    <select
                      name="status"
                      value={newMaterial.status}
                      onChange={onNewMaterialChange}
                      style={{
                        flex: 1,
                        padding: '6px 8px',
                        border: '1px solid #d1d5db',
                        borderRadius: '4px',
                        fontSize: '12px',
                        background: 'white'
                      }}
                    >
                      <option value="Aktif">Aktif</option>
                      <option value="Pasif">Pasif</option>
                    </select>
                  </div>

                  <div style={{ textAlign: 'right', marginTop: '8px', display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                    <button
                      type="button"
                      onClick={() => onSetMaterialMode('existing')}
                      style={{
                        padding: '6px 12px',
                        background: '#6b7280',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        fontSize: '12px',
                        cursor: 'pointer'
                      }}
                    >
                      İptal
                    </button>
                    <button
                      type="button"
                      onClick={onAddNewMaterial}
                      style={{
                        padding: '6px 12px',
                        background: '#10b981',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        fontSize: '12px',
                        cursor: 'pointer'
                      }}
                    >
                      Malzeme Ekle
                    </button>
                  </div>
                </div>
              )}

              {/* Show message when no materials */}
              {(!supplier?.suppliedMaterials || supplier.suppliedMaterials.length === 0) && materialMode !== 'new' && (
                <div className="empty-message-italic">
                  Henüz malzeme eklenmemiş. Yukarıdaki butonları kullanarak malzeme ekleyebilirsiniz.
                </div>
              )}
            </div>

            {/* Supply History - Tedarik Geçmişi */}
            <div className="section-card-mb">
              <SupplierHistorySection supplier={supplier} />
            </div>

            {/* Ek Bilgiler */}
            <div className="section-card-mb">
              <h3 className="supplier-section-header">
                Ek Bilgiler
              </h3>
              
              <div className="supplier-detail-row-start">
                <span className="detail-label" style={{ fontWeight: '600', fontSize: '12px', color: '#374151', minWidth: '120px', marginRight: '8px', marginTop: '2px' }}>
                  Notlar ve Açıklamalar:
                </span>
                {isEditing ? (
                  <textarea
                    name="notes"
                    value={formData.notes || ''}
                    onChange={onInputChange}
                    rows="3"
                    style={{ ...getInputStyle(isEditing), flex: 1, resize: 'vertical' }}
                  />
                ) : (
                  <span className="text-xs-flex-1">
                    {supplier.notes || 'Ek bilgi girilmemiş'}
                  </span>
                )}
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}

// Embedded supplier history table with local loading state
function SupplierHistorySection({ supplier }) {
  const { items, loading, error, loadHistory, isLoadedForSupplier } = useSupplierProcurementHistory(supplier)

  return (
    <div className="supply-history-section">
      <div className="supplier-header-flex">
        <h3 style={{ margin: 0, fontSize: '14px', fontWeight: '600', color: '#111827' }}>Tedarik Geçmişi</h3>
        <button 
          type="button"
          onClick={() => {
            if (supplier?.id && loadHistory) {
              console.log('🔄 Tedarik geçmişi yeniden yükleniyor...', supplier.id);
              loadHistory();
            }
          }}
          className="section-button"
          disabled={!supplier?.id || loading}
        >
          <RotateCw size={14} style={{ marginRight: '6px' }} className={loading ? 'rotating' : ''} />
          {loading ? 'Yükleniyor...' : 'Tedarik Geçmişini Yükle'}
        </button>
      </div>
      <div className="supply-history-table" style={{ overflowX: 'auto', width: '100%' }}>
        <table style={{ minWidth: '100%', tableLayout: 'auto' }}>
          <thead>
            <tr style={{ background: '#f9fafb' }}>
              <th className="text-nowrap-muted">Tarih</th>
              <th style={{ minWidth: '150px', color: '#374151' }}>Malzeme</th>
              <th className="text-nowrap-muted">Miktar</th>
              <th className="text-nowrap-muted">Birim Fiyat</th>
              <th className="text-nowrap-muted">Toplam</th>
              <th className="text-nowrap-muted">Durum</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan="6" className="no-data">Tedarik geçmişi yükleniyor...</td>
              </tr>
            ) : error ? (
              <tr>
                <td colSpan="6" className="no-data">{error}</td>
              </tr>
            ) : (items && items.length > 0) ? (
              items.map((row, idx) => {
                const dateObj = row._sortDate || row.actualDeliveryDate || row.expectedDeliveryDate || row.orderDate || null
                const dateStr = dateObj ? new Date(dateObj).toLocaleDateString('tr-TR') : '-'
                const qty = Number(row.quantity || 0)
                const unitPrice = Number(row.unitPrice || 0)
                const total = !isNaN(qty) && !isNaN(unitPrice) ? (qty * unitPrice) : 0
                return (
                  <tr key={`${row.orderId}-${row.itemSequence}-${idx}`}>
                    <td className="text-nowrap">{dateStr}</td>
                    <td style={{ maxWidth: '150px', wordBreak: 'break-word' }} title={row.materialName || row.materialCode}>{row.materialName || row.materialCode || '-'}</td>
                    <td className="text-nowrap">{!isNaN(qty) ? `${qty} ${row.unit || ''}`.trim() : '-'}</td>
                    <td className="text-nowrap">{!isNaN(unitPrice) ? `${unitPrice.toLocaleString('tr-TR')} ${row.currency || 'TRY'}` : '-'}</td>
                    <td className="text-nowrap">{!isNaN(total) ? `${total.toLocaleString('tr-TR')} ${row.currency || 'TRY'}` : '-'}</td>
                    <td className="text-nowrap">{row.itemStatus || '-'}</td>
                  </tr>
                )
              })
            ) : (
              <tr>
                <td colSpan="6" className="no-data">
                  {isLoadedForSupplier ? 'Henüz tedarik geçmişi bulunmuyor' : 'Tedarik geçmişini yüklemek için yukarıdaki butona tıklayın'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="flex-end-mt-8">
        <button
          type="button"
          onClick={() => {
            try {
              try { localStorage.setItem('bk_active_tab', 'orders') } catch {}
              window.open('materials.html#orders-tab', '_blank')
            } catch (e) {
              console.error('Order panelini açma hatası:', e)
            }
          }}
          className="section-button"
        >
          Tüm tedarik geçmişini gör
        </button>
      </div>
    </div>
  )
}
