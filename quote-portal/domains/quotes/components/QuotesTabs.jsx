import React, { useState } from 'react'
import { FileText, DollarSign, Layers } from 'lucide-react'

export default function QuotesTabs({ children, activeTab, onTabChange }) {
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
      
      <h1 className="quotes-page-title">
        {tabTitles[currentActiveTab]}
      </h1>
      
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
