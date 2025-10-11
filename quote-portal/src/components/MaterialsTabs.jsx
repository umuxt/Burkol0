import React, { useState } from 'react'

export default function MaterialsTabs({ children }) {
  const [activeTab, setActiveTab] = useState('stocks')

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
            className={`materials-tab-btn ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
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
              className={`tab-panel ${activeTab === tabId ? 'active' : ''}`}
              style={{ display: activeTab === tabId ? 'block' : 'none' }}
            >
              {child}
            </div>
          )
        })}
      </div>
    </div>
  )
}