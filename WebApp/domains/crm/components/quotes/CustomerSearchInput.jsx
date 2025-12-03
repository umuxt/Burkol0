import React, { useState, useEffect, useRef } from 'react'
import API from '../../../../shared/lib/api.js'
import { customersService } from '../../services/customers-service.js'
import { X, Loader2 } from '../../../../shared/components/Icons.jsx'

/**
 * CustomerSearchInput - Hybrid Autocomplete/Dropdown component for customer search
 * 
 * Features:
 * - On focus: Shows all customers (up to 50) as dropdown
 * - On typing: Filters customers with search
 * - Keyboard navigation support
 * - Loading states
 * 
 * @param {Object} props
 * @param {Function} props.onSelect - Called when a customer is selected
 * @param {Object} props.selectedCustomer - Currently selected customer
 * @param {boolean} props.disabled - Whether the input is disabled
 * @param {string} props.placeholder - Placeholder text
 */
export default function CustomerSearchInput({
  onSelect,
  selectedCustomer,
  disabled = false,
  placeholder = 'Müşteri ara veya listeden seç...'
}) {
  const [searchTerm, setSearchTerm] = useState('')
  const [allCustomers, setAllCustomers] = useState([])
  const [filteredResults, setFilteredResults] = useState([])
  const [isOpen, setIsOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [initialLoading, setInitialLoading] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(-1)
  const [customersLoaded, setCustomersLoaded] = useState(false)
  
  const inputRef = useRef(null)
  const dropdownRef = useRef(null)
  const debounceRef = useRef(null)

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (
        dropdownRef.current && 
        !dropdownRef.current.contains(event.target) &&
        inputRef.current &&
        !inputRef.current.contains(event.target)
      ) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Load all customers on first focus
  async function loadAllCustomers() {
    if (customersLoaded || initialLoading) return
    
    setInitialLoading(true)
    try {
      const customers = await customersService.getCustomers({ limit: 50 })
      // Sort alphabetically by company then name
      const sorted = (customers || []).sort((a, b) => {
        const companyA = (a.company || a.name || '').toLowerCase()
        const companyB = (b.company || b.name || '').toLowerCase()
        return companyA.localeCompare(companyB, 'tr')
      })
      setAllCustomers(sorted)
      setFilteredResults(sorted)
      setCustomersLoaded(true)
    } catch (error) {
      console.error('Failed to load customers:', error)
      setAllCustomers([])
      setFilteredResults([])
    } finally {
      setInitialLoading(false)
    }
  }

  // Filter customers based on search term
  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
    }

    // If no search term, show all customers
    if (!searchTerm.trim()) {
      setFilteredResults(allCustomers)
      setHighlightedIndex(-1)
      return
    }

    debounceRef.current = setTimeout(() => {
      setLoading(true)
      const term = searchTerm.toLowerCase().trim()
      
      const filtered = allCustomers.filter(customer => {
        const name = (customer.name || '').toLowerCase()
        const company = (customer.company || '').toLowerCase()
        const email = (customer.email || '').toLowerCase()
        const phone = (customer.phone || '').toLowerCase()
        
        return name.includes(term) || 
               company.includes(term) || 
               email.includes(term) ||
               phone.includes(term)
      })
      
      setFilteredResults(filtered)
      setHighlightedIndex(-1)
      setLoading(false)
    }, 150) // Faster debounce for local filtering

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
      }
    }
  }, [searchTerm, allCustomers])

  // Handle input focus
  function handleFocus() {
    if (!customersLoaded) {
      loadAllCustomers()
    }
    setIsOpen(true)
  }

  // Handle keyboard navigation
  function handleKeyDown(e) {
    if (!isOpen || filteredResults.length === 0) return

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setHighlightedIndex(prev => 
          prev < filteredResults.length - 1 ? prev + 1 : 0
        )
        break
      case 'ArrowUp':
        e.preventDefault()
        setHighlightedIndex(prev => 
          prev > 0 ? prev - 1 : filteredResults.length - 1
        )
        break
      case 'Enter':
        e.preventDefault()
        if (highlightedIndex >= 0 && filteredResults[highlightedIndex]) {
          handleSelect(filteredResults[highlightedIndex])
        }
        break
      case 'Escape':
        setIsOpen(false)
        break
    }
  }

  function handleSelect(customer) {
    onSelect(customer)
    setSearchTerm('')
    setIsOpen(false)
  }

  function handleClear() {
    onSelect(null)
    setSearchTerm('')
    inputRef.current?.focus()
  }

  // If a customer is selected, show their info
  if (selectedCustomer) {
    return (
      <div className="customer-search-selected">
        <div className="customer-search-selected-info">
          <span className="customer-search-selected-name">{selectedCustomer.name}</span>
          {selectedCustomer.company && (
            <span className="customer-search-selected-company">{selectedCustomer.company}</span>
          )}
        </div>
        {!disabled && (
          <button 
            type="button"
            onClick={handleClear}
            className="customer-search-clear-btn"
            title="Seçimi kaldır"
          >
            <X size={14} />
          </button>
        )}
      </div>
    )
  }

  const showDropdown = isOpen && (filteredResults.length > 0 || initialLoading || loading)
  const showEmpty = isOpen && !initialLoading && !loading && filteredResults.length === 0 && customersLoaded

  return (
    <div className="customer-search-container">
      <div className="customer-search-input-wrapper">
        <input
          ref={inputRef}
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={handleFocus}
          placeholder={placeholder}
          disabled={disabled}
          className="customer-search-input"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck="false"
          data-form-type="other"
          data-lpignore="true"
          name={`customer-search-${Date.now()}`}
        />
        {(loading || initialLoading) && (
          <span className="customer-search-loading"><Loader2 size={14} className="spinner" /></span>
        )}
        {!loading && !initialLoading && (
          <span className="customer-search-icon" style={{ opacity: 0.5 }}>▼</span>
        )}
      </div>

      {showDropdown && (
        <div ref={dropdownRef} className="customer-search-dropdown">
          {initialLoading ? (
            <div className="customer-search-loading-state">
              Müşteriler yükleniyor...
            </div>
          ) : (
            <>
              <div className="customer-search-count">
                {filteredResults.length} müşteri {searchTerm ? 'bulundu' : 'mevcut'}
              </div>
              {filteredResults.map((customer, index) => (
                <div
                  key={customer.id}
                  className={`customer-search-item ${index === highlightedIndex ? 'highlighted' : ''}`}
                  onClick={() => handleSelect(customer)}
                  onMouseEnter={() => setHighlightedIndex(index)}
                >
                  <div className="customer-search-item-main">
                    {customer.company && (
                      <span className="customer-search-item-company">{customer.company}</span>
                    )}
                    <span className="customer-search-item-name">{customer.name}</span>
                  </div>
                  <div className="customer-search-item-secondary">
                    {customer.email && (
                      <span className="customer-search-item-email">{customer.email}</span>
                    )}
                    {customer.phone && (
                      <span className="customer-search-item-phone">{customer.phone}</span>
                    )}
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {showEmpty && (
        <div ref={dropdownRef} className="customer-search-dropdown">
          <div className="customer-search-empty">
            {searchTerm ? `"${searchTerm}" için müşteri bulunamadı` : 'Henüz müşteri eklenmemiş'}
          </div>
        </div>
      )}
    </div>
  )
}
