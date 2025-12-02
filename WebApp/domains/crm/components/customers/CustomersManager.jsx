// CustomersManager - Main customers management component
import React from 'react';
import customersService from '../../services/customers-service.js';
import CustomerDetailsPanel from './CustomerDetailsPanel.jsx';
import AddCustomerModal from './AddCustomerModal.jsx';
import { showToast } from '../../../../shared/components/MESToast.js';
import { getCustomersTableColumns, getCustomerFieldValue, formatCustomerFieldValue } from '../../utils/customers-table-utils.js';

const { useState, useEffect } = React;

function CustomersManager({ t }) {
  // State
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [sortConfig, setSortConfig] = useState({ columnId: 'name', direction: 'asc' });

  // Table columns
  const tableColumns = getCustomersTableColumns();

  // Load customers
  useEffect(() => {
    loadCustomers();
    
    // Yeni müşteri oluşturulduğunda listeyi yenile (AddQuoteModal'dan tetiklenir)
    function handleCustomerCreated() {
      loadCustomers();
    }
    
    window.addEventListener('customerCreated', handleCustomerCreated);
    
    return () => {
      window.removeEventListener('customerCreated', handleCustomerCreated);
    };
  }, []);

  async function loadCustomers() {
    try {
      setLoading(true);
      const data = await customersService.getCustomers();
      setCustomers(data);
    } catch (error) {
      console.error('Failed to load customers:', error);
      showToast('Müşteriler yüklenemedi', 'error');
    } finally {
      setLoading(false);
    }
  }

  // Search filter
  const filteredCustomers = customers.filter(customer => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      customer.name?.toLowerCase().includes(term) ||
      customer.email?.toLowerCase().includes(term) ||
      customer.phone?.toLowerCase().includes(term) ||
      customer.company?.toLowerCase().includes(term)
    );
  });

  // Handlers
  async function handleDeleteCustomer(id) {
    if (!confirm('Bu müşteriyi silmek istediğinizden emin misiniz?')) return;
    
    try {
      await customersService.deleteCustomer(id);
      showToast('Müşteri silindi', 'success');
      await loadCustomers();
      if (selectedCustomer?.id === id) {
        setSelectedCustomer(null);
      }
    } catch (error) {
      console.error('Failed to delete customer:', error);
      showToast('Müşteri silinemedi', 'error');
    }
  }

  function handleRowClick(customer) {
    setSelectedCustomer(customer);
  }

  function handleSort(columnId) {
    setSortConfig(prev => ({
      columnId,
      direction: prev.columnId === columnId && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  }

  // Calculate stats
  const totalCustomers = customers.length;
  const activeCustomers = customers.filter(c => c.isActive).length;

  // Render
  return React.createElement('div', { className: 'customers-container' },
    // MES Filter Bar
    React.createElement('div', { 
      className: 'mes-filter-bar', 
      style: { marginBottom: '24px' } 
    },
      // Stats Dashboard
      React.createElement('div', { className: 'quotes-dashboard-container' },
        React.createElement('section', { 
          className: 'quotes-dashboard is-inline' 
        },
          React.createElement('div', { className: 'stat' },
            React.createElement('span', { className: 'stat-label' }, 'Toplam Müşteri'),
            React.createElement('span', { className: 'stat-value' }, totalCustomers)
          ),
          React.createElement('div', { className: 'divider' }),
          React.createElement('div', { className: 'stat' },
            React.createElement('span', { className: 'stat-label' }, 'Aktif'),
            React.createElement('span', { className: 'stat-value' }, activeCustomers)
          )
        )
      ),
      
      // Primary Action - Add Customer
      React.createElement('button', {
        className: 'mes-primary-action is-compact',
        onClick: () => setShowAddModal(true)
      },
        React.createElement('span', null, '✚'),
        React.createElement('span', null, 'Yeni Müşteri')
      ),
      
      // Export Button
      React.createElement('button', {
        className: 'mes-filter-button is-compact',
        title: `${filteredCustomers.length} kaydı dışa aktar`,
        onClick: () => showToast('CSV export çok yakında!', 'info')
      },
        React.createElement('span', null, '📊'),
        React.createElement('span', null, 'CSV')
      ),
      
      // Active Filter
      React.createElement('button', {
        className: 'mes-filter-button is-compact',
        title: 'Sadece aktif müşterileri göster',
        onClick: () => showToast('Filtreleme özelliği çok yakında!', 'info')
      },
        React.createElement('span', null, '✓')
      ),
      
      // Search Input
      React.createElement('input', {
        type: 'text',
        placeholder: 'Tüm veriler içinde arama...',
        className: 'mes-search-input',
        value: searchTerm,
        onChange: (e) => setSearchTerm(e.target.value)
      }),
      
      // Filter Controls
      React.createElement('div', { className: 'mes-filter-controls' },
        React.createElement('button', {
          className: 'mes-filter-button is-compact',
          onClick: () => showToast('Gelişmiş filtreler çok yakında!', 'info')
        },
          React.createElement('span', null, '🔍'),
          React.createElement('span', null, 'Filtreler')
        )
      )
    ),

    // Customers container - table on left, detail panel on right (like quotes)
    React.createElement('div', { className: 'customers-container-layout' },
      // Left side - Table
      React.createElement('div', { className: 'customers-table-panel' },
        React.createElement('div', { className: 'customers-table-container' },
          loading ? (
            React.createElement('div', { className: 'customers-loading' },
              'Yükleniyor...'
            )
          ) : filteredCustomers.length === 0 ? (
            React.createElement('div', { className: 'customers-empty' },
              React.createElement('div', { className: 'customers-empty-icon' }, '👥'),
              React.createElement('h3', null, searchTerm ? 'Müşteri bulunamadı' : 'Henüz müşteri yok'),
              React.createElement('p', null, 
                searchTerm 
                  ? 'Arama kriterlerinize uygun müşteri bulunamadı.' 
                  : 'Yeni müşteri eklemek için yukarıdaki butonu kullanın.'
              ),
              !searchTerm && React.createElement('button', {
                className: 'btn-add-customer',
                onClick: () => setShowAddModal(true)
              }, '+ İlk Müşteriyi Ekle')
            )
          ) : (
            React.createElement('table', { className: 'customers-table' },
              React.createElement('thead', null,
                React.createElement('tr', null,
                  // Checkbox column
                  React.createElement('th', { 
                    style: { width: '40px', textAlign: 'center' } 
                  },
                    React.createElement('input', { 
                      type: 'checkbox', 
                      title: 'Tümünü seç'
                    })
                  ),
                  // Dynamic columns from tableColumns
                  ...tableColumns.map(col => {
                    const isActive = sortConfig?.columnId === col.id;
                    const indicator = isActive ? (sortConfig.direction === 'asc' ? '↑' : '↓') : '↕';
                    return React.createElement('th', { 
                      key: col.id,
                      style: { minWidth: '120px', whiteSpace: 'nowrap' }
                    },
                      React.createElement('button', {
                        type: 'button',
                        onClick: () => handleSort(col.id),
                        className: isActive ? 'mes-sort-button active' : 'mes-sort-button'
                      },
                        col.label,
                        React.createElement('span', { className: 'mes-sort-icon' }, indicator)
                      )
                    );
                  })
                )
              ),
              React.createElement('tbody', null,
                filteredCustomers.map(customer => 
                  React.createElement('tr', {
                    key: customer.id,
                    className: selectedCustomer?.id === customer.id ? 'selected' : '',
                    onClick: () => handleRowClick(customer),
                    style: { cursor: 'pointer' }
                  },
                    // Checkbox
                    React.createElement('td', { 
                      onClick: (e) => e.stopPropagation()
                    },
                      React.createElement('input', { 
                        type: 'checkbox'
                      })
                    ),
                    // Dynamic columns
                    ...tableColumns.map(col => 
                      React.createElement('td', { key: col.id },
                        formatCustomerFieldValue(
                          getCustomerFieldValue(customer, col.id),
                          col,
                          customer
                        )
                      )
                    )
                  )
                )
              )
            )
          )
        )
      ),
      
      // Right side - Detail Panel
      selectedCustomer && React.createElement(CustomerDetailsPanel, {
        customer: selectedCustomer,
        onClose: () => setSelectedCustomer(null),
        onSave: async (customerId, customerData) => {
          await customersService.updateCustomer(customerId, customerData);
          await loadCustomers();
          showToast('Müşteri güncellendi', 'success');
        },
        onDelete: async (customerId) => {
          await handleDeleteCustomer(customerId);
        }
      })
    ),

    // Add Customer Modal
    showAddModal && React.createElement(AddCustomerModal, {
      onClose: () => setShowAddModal(false),
      onSaved: async () => {
        await loadCustomers();
        showToast('Müşteri eklendi', 'success');
      }
    })
  ); // End of customers-container
}

export default CustomersManager;
