import React, { useState } from 'react'
import { Package, Users, ShoppingCart } from '../../../shared/components/Icons.jsx'

export default function MaterialsTabs({ children, activeTab, onTabChange }) {
  // Eğer prop'lar verilmemişse internal state kullan (backward compatibility)
  const [internalActiveTab, setInternalActiveTab] = useState('stocks')
  
  const currentActiveTab = activeTab !== undefined ? activeTab : internalActiveTab
  const handleTabChange = onTabChange || setInternalActiveTab

  console.log('🔍 TAB DEBUG: Current active tab:', currentActiveTab);

  const tabs = [
    { id: 'stocks', label: 'Stoklar', icon: Package },
    { id: 'suppliers', label: 'Tedarikçi Listesi', icon: Users },
    { id: 'orders', 'label': 'Sipariş Paneli', icon: ShoppingCart },
    { id: 'shipments', label: 'Sevkiyat Paneli', icon: ShoppingCart } // New tab added
  ]

  const tabTitles = {
    stocks: 'Stok Yönetimi',
    suppliers: 'Tedarikçi Yönetimi',
    orders: 'Sipariş Yönetimi',
    shipments: 'Sevkiyat Yönetimi' // New tab title added
  }

  return (
    <div className="materials-tabs-container">
      <div className="materials-tabs-header">
        {tabs.map(tab => {
          const IconComponent = tab.icon
          return (
            <button
              key={tab.id}
              className={`materials-tab-btn ${currentActiveTab === tab.id ? 'active' : ''}`}
              onClick={() => {
                console.log('🔥 TAB CLICK:', tab.id, 'Current:', currentActiveTab);
                handleTabChange(tab.id);
              }}
            >
              <IconComponent className="tab-icon" size={16} strokeWidth={2} />
              <span className="tab-label">{tab.label}</span>
            </button>
          )
        })}
      </div>
      
      <h1 className="materials-page-title">
        {tabTitles[currentActiveTab]}
      </h1>
      
      <div className="materials-tab-content">
        {React.Children.map(children, (child, index) => {
          const tabIds = ['stocks', 'suppliers', 'orders', 'shipments']
          const tabId = tabIds[index]
          
          return (
            <div 
              key={tabId}
              className={`tab-panel ${currentActiveTab === tabId ? 'active' : ''}`}
            >
              {child}
            </div>
          )
        })}
      </div>
    </div>
  )
}