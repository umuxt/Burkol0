// Customers Table Utils - Table column management and data formatting for customers
import React from 'react';

export function getCustomersTableColumns() {
  return [
    { id: 'name', label: 'Müşteri Adı', type: 'text' },
    { id: 'company', label: 'Şirket', type: 'text' },
    { id: 'email', label: 'E-posta', type: 'email' },
    { id: 'phone', label: 'Telefon', type: 'phone' },
    { id: 'address', label: 'Adres', type: 'text' },
    { id: 'quoteCount', label: 'Teklif Sayısı', type: 'number' },
    { id: 'isActive', label: 'Durum', type: 'status' }
  ];
}

export function getCustomerFieldValue(customer, fieldId) {
  switch (fieldId) {
    case 'name':
      return customer.name || '';
    case 'company':
      return customer.company || '';
    case 'email':
      return customer.email || '';
    case 'phone':
      return customer.phone || '';
    case 'address':
      return customer.address || '';
    case 'quoteCount':
      return customer.quoteCount || 0;
    case 'isActive':
      return customer.isActive;
    default:
      return customer[fieldId] || '';
  }
}

export function formatCustomerFieldValue(value, column, customer) {
  if (value === null || value === undefined) {
    return React.createElement('span', { style: { color: '#9ca3af' } }, '-');
  }

  switch (column.type) {
    case 'text':
      if (column.id === 'address') {
        return React.createElement('div', {
          style: {
            maxWidth: '200px',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            fontSize: '13px',
            color: '#6b7280'
          },
          title: value
        }, value);
      }
      return value || '-';

    case 'email':
      return value 
        ? React.createElement('div', { className: 'customer-email' }, value)
        : React.createElement('span', { style: { color: '#9ca3af' } }, '-');

    case 'phone':
      return value
        ? React.createElement('div', { className: 'customer-phone' }, value)
        : React.createElement('span', { style: { color: '#9ca3af' } }, '-');

    case 'number':
      return React.createElement('span', {
        className: 'customer-quote-count',
        style: { cursor: 'pointer' },
        title: 'Teklifleri görüntüle'
      }, value);

    case 'status':
      return React.createElement('span', {
        className: value ? 'status-badge status-active' : 'status-badge status-inactive'
      }, value ? 'Aktif' : 'Pasif');

    default:
      return value || '-';
  }
}
