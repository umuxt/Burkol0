import React, { useState } from 'react'

// Inline SVG icons to avoid lucide-react dependency
const FileTextIcon = (props) => (
  <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
    <polyline points="14 2 14 8 20 8"/>
    <line x1="16" y1="13" x2="8" y2="13"/>
    <line x1="16" y1="17" x2="8" y2="17"/>
    <polyline points="10 9 9 9 8 9"/>
  </svg>
)

const DollarSignIcon = (props) => (
  <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="1" x2="12" y2="23"/>
    <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
  </svg>
)

const LayersIcon = (props) => (
  <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="12 2 2 7 12 12 22 7 12 2"/>
    <polyline points="2 17 12 22 22 17"/>
    <polyline points="2 12 12 17 22 12"/>
  </svg>
)

const UsersIcon = (props) => (
  <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
    <circle cx="9" cy="7" r="4"/>
    <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
    <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
  </svg>
)

export default function QuotesTabs({ children, activeTab, onTabChange, headerActions, headerContent }) {
  // Eğer prop'lar verilmemişse internal state kullan (backward compatibility)
  const [internalActiveTab, setInternalActiveTab] = useState('quotes')
  
  const currentActiveTab = activeTab !== undefined ? activeTab : internalActiveTab
  const handleTabChange = onTabChange || setInternalActiveTab

  console.log('🔍 QUOTES TAB DEBUG: Current active tab:', currentActiveTab);

  const tabs = [
    { id: 'quotes', label: 'Teklifler', icon: FileTextIcon },
    { id: 'customers', label: 'Müşteriler', icon: UsersIcon },
    { id: 'pricing', label: 'Fiyatlandırma', icon: DollarSignIcon },
    { id: 'form', label: 'Form Yapısı', icon: LayersIcon }
  ]

  const tabTitles = {
    quotes: 'Teklif Yönetimi',
    customers: 'Müşteri Yönetimi',
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
              <IconComponent className="tab-icon" width={16} height={16} />
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
          const tabIds = ['quotes', 'customers', 'pricing', 'form']
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
