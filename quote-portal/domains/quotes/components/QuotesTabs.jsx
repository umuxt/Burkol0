import React, { useState } from 'react'
import { FileText, DollarSign, Layers } from 'lucide-react'

export default function QuotesTabs({ children, activeTab, onTabChange, headerActions, headerContent }) {
  // Eğer prop'lar verilmemişse internal state kullan (backward compatibility)
  const [internalActiveTab, setInternalActiveTab] = useState('quotes')
  
  const currentActiveTab = activeTab !== undefined ? activeTab : internalActiveTab
  const handleTabChange = onTabChange || setInternalActiveTab

  console.log('🔍 QUOTES TAB DEBUG: Current active tab:', currentActiveTab);

  const tabs = [
    { id: 'quotes', label: 'Teklifler', icon: FileText },
    { id: 'pricing', label: 'Fiyatlandırma', icon: DollarSign },
    { id: 'form', label: 'Form Yapısı', icon: Layers }
  ]

  const tabTitles = {
    quotes: 'Teklif Yönetimi',
    pricing: 'Fiyatlandırma Ayarları',
    form: 'Form Yapısı Yönetimi'
  }

  return (
    <div className="quotes-tabs-container">
      <div className="quotes-tabs-header">
        {tabs.map(tab => {
          const IconComponent = tab.icon
          return (
            <button
              key={tab.id}
              className={`quotes-tab-btn ${currentActiveTab === tab.id ? 'active' : ''}`}
              onClick={() => {
                console.log('🔥 QUOTES TAB CLICK:', tab.id, 'Current:', currentActiveTab);
                handleTabChange(tab.id);
              }}
            >
              <IconComponent className="tab-icon" size={16} strokeWidth={2} />
              <span className="tab-label">{tab.label}</span>
            </button>
          )
        })}
      </div>
      
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <h1 className="quotes-page-title" style={{ margin: 0 }}>
          {tabTitles[currentActiveTab]}
        </h1>
        
        {headerActions && headerActions[currentActiveTab] && (
          <div style={{ display: 'flex', gap: '12px' }}>
            {headerActions[currentActiveTab]}
          </div>
        )}
      </div>
      
      {headerContent && headerContent[currentActiveTab] && (
        <div style={{ marginBottom: '24px' }}>
          {headerContent[currentActiveTab]}
        </div>
      )}
      
      <div className="quotes-tab-content">
        {React.Children.map(children, (child, index) => {
          const tabIds = ['quotes', 'pricing', 'form']
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
