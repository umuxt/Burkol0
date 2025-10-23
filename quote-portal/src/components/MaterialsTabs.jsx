import React, { useState } from 'react'

export default function MaterialsTabs({ children, activeTab, onTabChange }) {
  // Eğer prop'lar verilmemişse internal state kullan (backward compatibility)
  const [internalActiveTab, setInternalActiveTab] = useState('stocks')
  
  const currentActiveTab = activeTab !== undefined ? activeTab : internalActiveTab
  const handleTabChange = onTabChange || setInternalActiveTab

  console.log('🔍 TAB DEBUG: Current active tab:', currentActiveTab);

  const tabs = [
    { id: 'stocks', label: 'Stoklar', icon: '📦' },
    { id: 'suppliers', label: 'Tedarikçi Listesi', icon: '📋' },
    { id: 'orders', label: 'Sipariş Paneli', icon: '🛒' }
  ]

  return (
    <div className="materials-tabs-container">
      <div className="materials-tabs-header">
        {tabs.map(tab => (
          <button
            key={tab.id}
            className={`materials-tab-btn ${currentActiveTab === tab.id ? 'active' : ''}`}
            onClick={() => {
              console.log('🔥 TAB CLICK:', tab.id, 'Current:', currentActiveTab);
              handleTabChange(tab.id);
            }}
          >
            <span className="tab-icon">{tab.icon}</span>
            <span className="tab-label">{tab.label}</span>
          </button>
        ))}
      </div>
      
      <div className="materials-tab-content">
        {React.Children.map(children, (child, index) => {
          const tabIds = ['stocks', 'suppliers', 'orders']
          const tabId = tabIds[index]
          
          return (
            <div 
              key={tabId}
              className={`tab-panel ${currentActiveTab === tabId ? 'active' : ''}`}
              style={{ display: currentActiveTab === tabId ? 'block' : 'none' }}
            >
              {child}
            </div>
          )
        })}
      </div>
    </div>
  )
}