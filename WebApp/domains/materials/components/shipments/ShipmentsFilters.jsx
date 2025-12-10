import React, { useState, useRef, useEffect } from 'react'
import { Plus, RefreshCw, ChevronDown, Calendar, Filter } from 'lucide-react'

/**
 * ShipmentsFilters - Sevkiyat filtreleme ve tab bileşeni
 * 
 * 6.4 Tasarımına göre güncellendi:
 * - Status dropdown filtresi
 * - Tarih aralığı filtresi
 * - Arama inputu
 */

// Status options for dropdown
const STATUS_OPTIONS = [
  { id: 'all', label: 'Tüm Durumlar' },
  { id: 'pending', label: 'Beklemede' },
  { id: 'exported', label: 'Export Edildi' },
  { id: 'completed', label: 'Tamamlandı' },
  { id: 'cancelled', label: 'İptal Edildi' }
]

// Date range presets
const DATE_PRESETS = [
  { id: 'all', label: 'Tüm Zamanlar', days: null },
  { id: '7d', label: 'Son 7 Gün', days: 7 },
  { id: '30d', label: 'Son 30 Gün', days: 30 },
  { id: '90d', label: 'Son 90 Gün', days: 90 }
]

// Tabs configuration (for backward compatibility)
const SHIPMENT_TABS = STATUS_OPTIONS

export { SHIPMENT_TABS }

export default function ShipmentsFilters({
  searchTerm,
  onSearchChange,
  activeTab,
  onTabChange,
  dateFilter = 'all',
  onDateFilterChange,
  onRefresh,
  onCreateNew,
  shipments = [],
  filteredCount = 0
}) {
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false)
  const [dateDropdownOpen, setDateDropdownOpen] = useState(false)
  const statusDropdownRef = useRef(null)
  const dateDropdownRef = useRef(null)

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (statusDropdownRef.current && !statusDropdownRef.current.contains(e.target)) {
        setStatusDropdownOpen(false)
      }
      if (dateDropdownRef.current && !dateDropdownRef.current.contains(e.target)) {
        setDateDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const selectedStatus = STATUS_OPTIONS.find(s => s.id === activeTab) || STATUS_OPTIONS[0]
  const selectedDate = DATE_PRESETS.find(d => d.id === dateFilter) || DATE_PRESETS[0]

  // Count by status
  const getStatusCount = (statusId) => {
    if (statusId === 'all') return shipments.length
    return shipments.filter(s => s.status === statusId).length
  }

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
        <RefreshCw size={14} />
        <span>Yenile</span>
      </button>

      {/* Filters Container */}
      <div className="mes-filter-controls">
        {/* Status Dropdown */}
        <div className="mes-dropdown" ref={statusDropdownRef}>
          <button
            type="button"
            className="mes-filter-button is-compact"
            onClick={() => {
              setStatusDropdownOpen(!statusDropdownOpen)
              setDateDropdownOpen(false)
            }}
          >
            <Filter size={14} />
            <span>{selectedStatus.label}</span>
            {activeTab !== 'all' && (
              <span className="filter-badge">{getStatusCount(activeTab)}</span>
            )}
            <ChevronDown size={14} className={statusDropdownOpen ? 'rotated' : ''} />
          </button>
          
          {statusDropdownOpen && (
            <div className="mes-dropdown-menu">
              {STATUS_OPTIONS.map(status => (
                <button
                  key={status.id}
                  type="button"
                  className={`mes-dropdown-item ${activeTab === status.id ? 'active' : ''}`}
                  onClick={() => {
                    onTabChange(status.id)
                    setStatusDropdownOpen(false)
                  }}
                >
                  <span>{status.label}</span>
                  <span className="item-count">{getStatusCount(status.id)}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Date Range Dropdown */}
        <div className="mes-dropdown" ref={dateDropdownRef}>
          <button
            type="button"
            className="mes-filter-button is-compact"
            onClick={() => {
              setDateDropdownOpen(!dateDropdownOpen)
              setStatusDropdownOpen(false)
            }}
          >
            <Calendar size={14} />
            <span>{selectedDate.label}</span>
            <ChevronDown size={14} className={dateDropdownOpen ? 'rotated' : ''} />
          </button>
          
          {dateDropdownOpen && (
            <div className="mes-dropdown-menu">
              {DATE_PRESETS.map(preset => (
                <button
                  key={preset.id}
                  type="button"
                  className={`mes-dropdown-item ${dateFilter === preset.id ? 'active' : ''}`}
                  onClick={() => {
                    onDateFilterChange?.(preset.id)
                    setDateDropdownOpen(false)
                  }}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Search Input */}
        <input 
          type="text" 
          placeholder="Sevkiyat Ara (Kod, Müşteri, Not)..." 
          value={searchTerm}
          onChange={(e) => onSearchChange(e.target.value)}
          className="mes-filter-input is-compact"
          style={{ minWidth: '220px' }}
        />

        {/* Result Count */}
        <span className="filter-result-count">
          {filteredCount} sevkiyat
        </span>
      </div>
    </>
  )
}
