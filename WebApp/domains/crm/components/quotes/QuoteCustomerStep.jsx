import React, { useState, useEffect } from 'react'
import CustomerSearchInput from './CustomerSearchInput.jsx'
import TurkeyAddressDropdown from '../../../../shared/components/TurkeyAddressDropdown.jsx'
import { User, UserPlus, FileText } from '../../../../shared/components/Icons.jsx'

/**
 * QuoteCustomerStep - Step 1 of Quote Creation
 * 
 * Customer selection with 3 options:
 * 1. Existing - Select from autocomplete, fields readonly
 * 2. New - Enter details, will create customer on submit
 * 3. Without - Enter details, no customer record created
 * 
 * @param {Object} props
 * @param {Object} props.data - Current step data
 * @param {Function} props.onChange - Called when data changes
 * @param {Object} props.errors - Validation errors
 */
export default function QuoteCustomerStep({ data, onChange, errors = {} }) {
  // Customer type: 'existing', 'new', 'without'
  const customerType = data.customerType || 'existing'
  
  // Selected customer (for 'existing' type)
  const selectedCustomer = data.selectedCustomer || null
  
  // Customer form fields
  const customerData = data.customerData || {
    name: '',
    email: '',
    phone: '',
    company: '',
    address: '',
    taxOffice: '',
    taxNumber: '',
    website: '',
    fax: '',
    iban: '',
    bankName: '',
    contactPerson: '',
    contactTitle: '',
    country: 'Türkiye',
    city: '',
    district: '',
    neighbourhood: '',
    postalCode: '',
    notes: ''
  }
  
  // Delivery date
  const deliveryDate = data.deliveryDate || ''

  // Handle customer type change
  function handleTypeChange(type) {
    onChange({
      customerType: type,
      selectedCustomer: null,
      customerData: type === 'existing' ? null : {
        name: '',
        email: '',
        phone: '',
        company: '',
        address: '',
        taxOffice: '',
        taxNumber: '',
        website: '',
        fax: '',
        iban: '',
        bankName: '',
        contactPerson: '',
        contactTitle: '',
        country: 'Türkiye',
        city: '',
        district: '',
        neighbourhood: '',
        postalCode: '',
        notes: ''
      },
      deliveryDate
    })
  }

  // Handle customer selection from autocomplete
  function handleCustomerSelect(customer) {
    if (customer) {
      onChange({
        customerType: 'existing',
        selectedCustomer: customer,
        customerData: {
          name: customer.name || '',
          email: customer.email || '',
          phone: customer.phone || '',
          company: customer.company || '',
          address: customer.address || '',
          taxOffice: customer.taxOffice || '',
          taxNumber: customer.taxNumber || '',
          website: customer.website || '',
          fax: customer.fax || '',
          iban: customer.iban || '',
          bankName: customer.bankName || '',
          contactPerson: customer.contactPerson || '',
          contactTitle: customer.contactTitle || '',
          country: customer.country || 'Türkiye',
          city: customer.city || '',
          district: customer.district || '',
          neighbourhood: customer.neighbourhood || '',
          postalCode: customer.postalCode || '',
          notes: customer.notes || ''
        },
        deliveryDate
      })
    } else {
      onChange({
        customerType: 'existing',
        selectedCustomer: null,
        customerData: null,
        deliveryDate
      })
    }
  }

  // Handle field change
  function handleFieldChange(field, value) {
    onChange({
      ...data,
      customerData: {
        ...customerData,
        [field]: value
      }
    })
  }

  // Handle delivery date change
  function handleDeliveryDateChange(value) {
    onChange({
      ...data,
      deliveryDate: value
    })
  }

  // Is form readonly (existing customer selected)
  const isReadonly = customerType === 'existing' && selectedCustomer !== null

  return (
    <div className="quote-customer-step">
      {/* Customer Type Selector */}
      <div className="customer-type-selector">
        <label 
          className={`customer-type-option ${customerType === 'existing' ? 'selected' : ''}`}
          onClick={() => handleTypeChange('existing')}
        >
          <input
            type="radio"
            name="customerType"
            value="existing"
            checked={customerType === 'existing'}
            onChange={() => handleTypeChange('existing')}
          />
          <span className="customer-type-icon"><User size={20} /></span>
          <div className="customer-type-content">
            <span className="customer-type-title">Mevcut Müşteri</span>
            <span className="customer-type-desc">Kayıtlı müşterilerden seç</span>
          </div>
        </label>

        <label 
          className={`customer-type-option ${customerType === 'new' ? 'selected' : ''}`}
          onClick={() => handleTypeChange('new')}
        >
          <input
            type="radio"
            name="customerType"
            value="new"
            checked={customerType === 'new'}
            onChange={() => handleTypeChange('new')}
          />
          <span className="customer-type-icon"><UserPlus size={20} /></span>
          <div className="customer-type-content">
            <span className="customer-type-title">Yeni Müşteri</span>
            <span className="customer-type-desc">Bilgileri gir ve kaydet</span>
          </div>
        </label>

        <label 
          className={`customer-type-option ${customerType === 'without' ? 'selected' : ''}`}
          onClick={() => handleTypeChange('without')}
        >
          <input
            type="radio"
            name="customerType"
            value="without"
            checked={customerType === 'without'}
            onChange={() => handleTypeChange('without')}
          />
          <span className="customer-type-icon"><FileText size={20} /></span>
          <div className="customer-type-content">
            <span className="customer-type-title">Müşterisiz</span>
            <span className="customer-type-desc">Sadece teklif için bilgi gir</span>
          </div>
        </label>
      </div>

      {/* Customer Search (for existing customer) */}
      {customerType === 'existing' && (
        <div className="customer-search-section">
          <label className="form-label">Müşteri Ara</label>
          <CustomerSearchInput
            onSelect={handleCustomerSelect}
            selectedCustomer={selectedCustomer}
            placeholder="Müşteri adı, şirket veya e-posta ile ara..."
          />
          {errors.selectedCustomer && (
            <span className="field-error">{errors.selectedCustomer}</span>
          )}
        </div>
      )}

      {/* Customer Form Fields */}
      {(customerType !== 'existing' || selectedCustomer) && (
        <div className="customer-form-section">
          <h4 className="form-section-title">
            {customerType === 'existing' ? 'Müşteri Bilgileri (Seçili)' : 'Müşteri Bilgileri'}
          </h4>

          {/* Basic Info */}
          <div className="customer-form-grid">
            <div className="form-group">
              <label className="form-label">
                Müşteri Adı <span className="required">*</span>
              </label>
              <input
                type="text"
                value={customerData.name || ''}
                onChange={(e) => handleFieldChange('name', e.target.value)}
                disabled={isReadonly}
                className={`form-input ${isReadonly ? 'readonly' : ''} ${errors.name ? 'error' : ''}`}
                placeholder="Müşteri adı"
              />
              {errors.name && <span className="field-error">{errors.name}</span>}
            </div>

            <div className="form-group">
              <label className="form-label">Şirket</label>
              <input
                type="text"
                value={customerData.company || ''}
                onChange={(e) => handleFieldChange('company', e.target.value)}
                disabled={isReadonly}
                className={`form-input ${isReadonly ? 'readonly' : ''}`}
                placeholder="Şirket adı"
              />
            </div>

            <div className="form-group">
              <label className="form-label">E-posta</label>
              <input
                type="email"
                value={customerData.email || ''}
                onChange={(e) => handleFieldChange('email', e.target.value)}
                disabled={isReadonly}
                className={`form-input ${isReadonly ? 'readonly' : ''}`}
                placeholder="ornek@email.com"
              />
            </div>

            <div className="form-group">
              <label className="form-label">Telefon</label>
              <input
                type="tel"
                value={customerData.phone || ''}
                onChange={(e) => handleFieldChange('phone', e.target.value)}
                disabled={isReadonly}
                className={`form-input ${isReadonly ? 'readonly' : ''}`}
                placeholder="+90 5XX XXX XX XX"
              />
            </div>

            <div className="form-group full-width">
              <label className="form-label">Adres</label>
              <textarea
                value={customerData.address || ''}
                onChange={(e) => handleFieldChange('address', e.target.value)}
                disabled={isReadonly}
                className={`form-textarea ${isReadonly ? 'readonly' : ''}`}
                placeholder="Açık adres"
                rows={2}
              />
            </div>
          </div>

          {/* Tax & Financial Info (only for new customer) */}
          {customerType === 'new' && (
            <>
              <h4 className="form-section-title">Fatura Bilgileri</h4>
              <div className="customer-form-grid">
                <div className="form-group">
                  <label className="form-label">Vergi Dairesi</label>
                  <input
                    type="text"
                    value={customerData.taxOffice || ''}
                    onChange={(e) => handleFieldChange('taxOffice', e.target.value)}
                    className="form-input"
                    placeholder="Vergi dairesi adı"
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Vergi No</label>
                  <input
                    type="text"
                    value={customerData.taxNumber || ''}
                    onChange={(e) => handleFieldChange('taxNumber', e.target.value)}
                    className="form-input"
                    placeholder="Vergi numarası"
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">IBAN</label>
                  <input
                    type="text"
                    value={customerData.iban || ''}
                    onChange={(e) => handleFieldChange('iban', e.target.value)}
                    className="form-input"
                    placeholder="TR00 0000 0000 0000 0000 0000 00"
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Banka</label>
                  <input
                    type="text"
                    value={customerData.bankName || ''}
                    onChange={(e) => handleFieldChange('bankName', e.target.value)}
                    className="form-input"
                    placeholder="Banka adı"
                  />
                </div>
              </div>

              <h4 className="form-section-title">Adres Bilgileri</h4>
              <div className="form-group full-width">
                <label className="form-label">Adres</label>
                <textarea
                  value={customerData.address || ''}
                  onChange={(e) => handleFieldChange('address', e.target.value)}
                  className="form-textarea"
                  placeholder="Sokak, Cadde, Bina No, Daire No..."
                  rows={2}
                />
              </div>
              <TurkeyAddressDropdown
                country={customerData.country || 'Türkiye'}
                city={customerData.city || ''}
                district={customerData.district || ''}
                neighbourhood={customerData.neighbourhood || ''}
                postalCode={customerData.postalCode || ''}
                onChange={({ country, city, district, neighbourhood, postalCode }) => {
                  onChange({
                    ...data,
                    customerData: {
                      ...customerData,
                      country,
                      city,
                      district,
                      neighbourhood,
                      postalCode
                    }
                  })
                }}
              />

              <h4 className="form-section-title">Yetkili Kişi</h4>
              <div className="customer-form-grid">
                <div className="form-group">
                  <label className="form-label">Yetkili Kişi</label>
                  <input
                    type="text"
                    value={customerData.contactPerson || ''}
                    onChange={(e) => handleFieldChange('contactPerson', e.target.value)}
                    className="form-input"
                    placeholder="Yetkili kişi adı"
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Ünvan</label>
                  <input
                    type="text"
                    value={customerData.contactTitle || ''}
                    onChange={(e) => handleFieldChange('contactTitle', e.target.value)}
                    className="form-input"
                    placeholder="Ünvan (örn: Satın Alma Müdürü)"
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Web Sitesi</label>
                  <input
                    type="url"
                    value={customerData.website || ''}
                    onChange={(e) => handleFieldChange('website', e.target.value)}
                    className="form-input"
                    placeholder="www.sirket.com"
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Faks</label>
                  <input
                    type="text"
                    value={customerData.fax || ''}
                    onChange={(e) => handleFieldChange('fax', e.target.value)}
                    className="form-input"
                    placeholder="0212 555 55 55"
                  />
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* Delivery Date */}
      <div className="delivery-date-section">
        <h4 className="form-section-title">Teslimat Bilgileri</h4>
        <div className="form-group" style={{ maxWidth: '300px' }}>
          <label className="form-label">Teslim Tarihi</label>
          <input
            type="date"
            value={deliveryDate}
            onChange={(e) => handleDeliveryDateChange(e.target.value)}
            className="form-input"
            min={new Date().toISOString().split('T')[0]}
          />
        </div>
      </div>
    </div>
  )
}
