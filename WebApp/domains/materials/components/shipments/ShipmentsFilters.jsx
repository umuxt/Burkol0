import React from 'react'
import { Plus } from 'lucide-react'

/**
 * ShipmentsFilters - Sevkiyat filtreleme ve tab bileşeni
 */

// Tabs configuration
const SHIPMENT_TABS = [
  { id: 'all', label: 'Tümü' },
  { id: 'pending', label: 'Beklemede' },
  { id: 'shipped', label: 'Yola Çıktı' },
  { id: 'delivered', label: 'Teslim Edildi' },
  { id: 'cancelled', label: 'İptal Edildi' }
]

export { SHIPMENT_TABS }

export default function ShipmentsFilters({
  searchTerm,
  onSearchChange,
  activeTab,
  onTabChange,
  onRefresh,
  onCreateNew,
  shipments = [],
  filteredCount = 0
}) {
  return (
    <>
      {/* Action Buttons */}
      <button 
        className="mes-primary-action is-compact"
        onClick={onCreateNew}
        title="Yeni Sevkiyat"
      >
        <Plus size={16} />
        <span>Yeni Sevkiyat</span>
      </button>
      
      <button 
        className="mes-filter-button is-compact"
        onClick={onRefresh}
        title="Yenile"
      >
        <span>Yenile</span>
      </button>

      {/* Search Input - Inside filter-controls */}
      <div className="mes-filter-controls">
        <input 
          type="text" 
          placeholder="Sevkiyat Ara (Kod, İş Emri, Müşteri, Not)..." 
          value={searchTerm}
          onChange={(e) => onSearchChange(e.target.value)}
          className="mes-filter-input is-compact"
        />
      </div>

      {/* Tabs */}
      <div className="materials-tabs">
        {SHIPMENT_TABS.map(tab => (
          <button
            key={tab.id}
            className={`tab-button ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => onTabChange(tab.id)}
          >
            {tab.label}
            <span className="tab-count">
              {activeTab === tab.id 
                ? filteredCount 
                : shipments.filter(s => tab.id === 'all' || s.status === tab.id).length}
            </span>
          </button>
        ))}
      </div>
    </>
  )
}
