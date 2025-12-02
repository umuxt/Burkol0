import React, { useState, useEffect, useRef } from 'react'
import API from '../../../../shared/lib/api.js'

/**
 * CustomerSearchInput - Autocomplete component for customer search
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
  placeholder = 'Müşteri ara...'
}) {
  const [searchTerm, setSearchTerm] = useState('')
  const [results, setResults] = useState([])
  const [isOpen, setIsOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(-1)
  
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

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
    }

    if (searchTerm.length < 2) {
      setResults([])
      setIsOpen(false)
      return
    }

    debounceRef.current = setTimeout(async () => {
      setLoading(true)
      try {
        const response = await fetch(`/api/customers/search?q=${encodeURIComponent(searchTerm)}&limit=10`, {
          credentials: 'include'
        })
        
        if (response.ok) {
          const data = await response.json()
          setResults(data)
          setIsOpen(data.length > 0)
          setHighlightedIndex(-1)
        } else {
          setResults([])
        }
      } catch (error) {
        console.error('Customer search error:', error)
        setResults([])
      } finally {
        setLoading(false)
      }
    }, 300)

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
      }
    }
  }, [searchTerm])

  // Handle keyboard navigation
  function handleKeyDown(e) {
    if (!isOpen || results.length === 0) return

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setHighlightedIndex(prev => 
          prev < results.length - 1 ? prev + 1 : 0
        )
        break
      case 'ArrowUp':
        e.preventDefault()
        setHighlightedIndex(prev => 
          prev > 0 ? prev - 1 : results.length - 1
        )
        break
      case 'Enter':
        e.preventDefault()
        if (highlightedIndex >= 0 && results[highlightedIndex]) {
          handleSelect(results[highlightedIndex])
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
    setResults([])
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
            ✕
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="customer-search-container">
      <div className="customer-search-input-wrapper">
        <input
          ref={inputRef}
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            if (results.length > 0) setIsOpen(true)
          }}
          placeholder={placeholder}
          disabled={disabled}
          className="customer-search-input"
          autoComplete="off"
        />
        {loading && (
          <span className="customer-search-loading">⏳</span>
        )}
        {!loading && searchTerm.length >= 2 && (
          <span className="customer-search-icon">🔍</span>
        )}
      </div>

      {isOpen && results.length > 0 && (
        <div ref={dropdownRef} className="customer-search-dropdown">
          {results.map((customer, index) => (
            <div
              key={customer.id}
              className={`customer-search-item ${index === highlightedIndex ? 'highlighted' : ''}`}
              onClick={() => handleSelect(customer)}
              onMouseEnter={() => setHighlightedIndex(index)}
            >
              <div className="customer-search-item-main">
                <span className="customer-search-item-name">{customer.name}</span>
                {customer.company && (
                  <span className="customer-search-item-company">{customer.company}</span>
                )}
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
        </div>
      )}

      {isOpen && searchTerm.length >= 2 && results.length === 0 && !loading && (
        <div ref={dropdownRef} className="customer-search-dropdown">
          <div className="customer-search-empty">
            Müşteri bulunamadı
          </div>
        </div>
      )}
    </div>
  )
}
