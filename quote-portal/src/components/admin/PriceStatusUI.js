// PriceStatus UI component that visualizes status state and exposes recovery actions
// Used throughout the admin surfaces to keep quotes in sync with pricing versions

import React from 'react'
import architectureAPI from '../../lib/architectureAPI.js'

const { useState } = React

// PriceStatus Badge Component
export function PriceStatusBadge({ quote, onUpdate, compact = false }) {
  const [loading, setLoading] = useState(false)
  const statusInfo = architectureAPI.getStatusDisplayInfo(quote)

  const handleAction = async () => {
    if (!statusInfo.action || loading) return

    setLoading(true)
    try {
      let result = null
      
      if (statusInfo.action === 'calculate') {
        console.log('🏗️ UI: Calculating price for quote:', quote.id)
        result = await architectureAPI.calculateQuotePrice(quote.id)
      } else if (statusInfo.action === 'apply') {
        console.log('🏗️ UI: Applying price for quote:', quote.id)
        result = await architectureAPI.applyQuotePrice(quote.id)
      }

      if (result && onUpdate) {
        const updatedQuote = result.quote || result
        onUpdate(quote.id, updatedQuote)
      }
    } catch (error) {
      console.error('🏗️ UI: Price action error:', error)
    } finally {
      setLoading(false)
    }
  }

  const badgeStyle = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    padding: compact ? '2px 6px' : '4px 8px',
    borderRadius: '12px',
    backgroundColor: statusInfo.color + '20',
    border: `1px solid ${statusInfo.color}`,
    fontSize: compact ? '11px' : '12px',
    fontWeight: '500',
    color: statusInfo.color,
    cursor: statusInfo.action ? 'pointer' : 'default',
    opacity: loading ? 0.6 : 1,
    transition: 'all 0.2s ease'
  }

  const actionButtonStyle = {
    marginLeft: '4px',
    padding: '2px 4px',
    border: 'none',
    borderRadius: '4px',
    backgroundColor: statusInfo.color,
    color: 'white',
    fontSize: '10px',
    cursor: 'pointer',
    disabled: loading
  }

  return React.createElement('div', {
    style: badgeStyle,
    onClick: handleAction,
    title: getStatusTooltip(statusInfo, quote)
  },
    React.createElement('span', null, statusInfo.icon),
    !compact && React.createElement('span', null, statusInfo.label),
    statusInfo.action && React.createElement('button', {
      style: actionButtonStyle,
      onClick: (e) => {
        e.stopPropagation()
        handleAction()
      },
      disabled: loading
    }, loading ? '...' : getActionLabel(statusInfo.action))
  )
}

// Price Status Indicator (for table cells)
export function PriceStatusIndicator({ quote, onUpdate }) {
  const statusInfo = architectureAPI.getStatusDisplayInfo(quote)
  
  const indicatorStyle = {
    display: 'inline-block',
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    backgroundColor: statusInfo.color,
    marginRight: '4px',
    title: statusInfo.label
  }

  return React.createElement('div', {
    style: { display: 'flex', alignItems: 'center' }
  },
    React.createElement('div', { style: indicatorStyle }),
    React.createElement('span', null, formatPrice(quote.price || 0)),
    statusInfo.hasUpdate && React.createElement(PriceActionButton, {
      statusInfo,
      quote,
      onUpdate
    })
  )
}

// Price Action Button Component
function PriceActionButton({ statusInfo, quote, onUpdate }) {
  const [loading, setLoading] = useState(false)

  const handleClick = async (e) => {
    e.stopPropagation()
    if (loading) return

    setLoading(true)
    try {
      let result = null
      
      if (statusInfo.action === 'calculate') {
        result = await architectureAPI.calculateQuotePrice(quote.id)
      } else if (statusInfo.action === 'apply') {
        result = await architectureAPI.applyQuotePrice(quote.id)
      }

      if (result && onUpdate) {
        const updatedQuote = result.quote || result
        onUpdate(quote.id, updatedQuote)
      }
    } catch (error) {
      console.error('🏗️ UI: Price action error:', error)
    } finally {
      setLoading(false)
    }
  }

  const buttonStyle = {
    marginLeft: '8px',
    padding: '2px 6px',
    border: 'none',
    borderRadius: '4px',
    backgroundColor: statusInfo.color,
    color: 'white',
    fontSize: '10px',
    cursor: loading ? 'not-allowed' : 'pointer',
    opacity: loading ? 0.6 : 1
  }

  return React.createElement('button', {
    style: buttonStyle,
    onClick: handleClick,
    disabled: loading,
    title: getActionTooltip(statusInfo.action)
  }, loading ? '...' : getActionLabel(statusInfo.action))
}

// Detailed Price Status Panel with Change Reasons
export function PriceStatusPanel({ quote, onUpdate }) {
  const [loading, setLoading] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [statusInfo, setStatusInfo] = useState(null)
  const [changeDetails, setChangeDetails] = useState(null)

  // Load status info on mount and when quote changes
  React.useEffect(() => {
    loadStatusInfo()
  }, [quote.id])

  const loadStatusInfo = async () => {
    try {
      const info = await architectureAPI.getStatusDisplayInfo(quote)
      setStatusInfo(info)
      setChangeDetails(info.changeDetails)
    } catch (error) {
      console.error('🏗️ UI: Failed to load status info:', error)
      // Fallback to basic info
      setStatusInfo({
        label: 'Güncelleme Gerekli',
        color: '#ff6b35',
        icon: '⚠️',
        action: 'update',
        hasUpdate: true,
        calculatedPrice: quote.pendingCalculatedPrice || quote.price || 0,
        changeDetails: null
      })
    }
  }

  if (!statusInfo) {
    return React.createElement('div', { style: { padding: '12px', textAlign: 'center' } }, 'Yükleniyor...')
  }

  const handleAction = async (action) => {
    if (!action || loading) return

    console.log('🏗️ UI: Starting price action:', action, 'for quote:', quote.id)
    setLoading(true)
    try {
      let result = null
      
      if (action === 'calculate' || action === 'update') {
        console.log('🏗️ UI: Calculating price for quote:', quote.id)
        result = await architectureAPI.calculateQuotePrice(quote.id)
        console.log('🏗️ UI: Calculate result:', result)
      } else if (action === 'apply') {
        console.log('🏗️ UI: Applying price for quote:', quote.id)
        result = await architectureAPI.applyQuotePrice(quote.id)
        console.log('🏗️ UI: Apply result:', result)
      }

      if (result && onUpdate) {
        console.log('🏗️ UI: Calling onUpdate callback with result:', result)
        const updatedQuote = result.quote || result
        onUpdate(quote.id, updatedQuote)
      } else {
        console.log('🏗️ UI: No onUpdate callback or result is null')
      }
      
      // Reload status info after action
      console.log('🏗️ UI: Reloading status info...')
      await loadStatusInfo()
      console.log('🏗️ UI: Status info reloaded')
    } catch (error) {
      console.error('🏗️ UI: Price action error:', error)
    } finally {
      setLoading(false)
    }
  }

  const panelStyle = {
    border: `1px solid ${statusInfo.color}`,
    borderRadius: '8px',
    padding: '12px',
    backgroundColor: statusInfo.color + '10',
    marginBottom: '16px'
  }

  const headerStyle = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    cursor: 'pointer'
  }

  return React.createElement('div', { style: panelStyle },
    React.createElement('div', {
      style: headerStyle,
      onClick: () => setExpanded(!expanded)
    },
      React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
        React.createElement('span', { style: { fontSize: '16px' } }, statusInfo.icon),
        React.createElement('span', { style: { fontWeight: '500' } }, statusInfo.label),
        statusInfo.calculatedPrice !== undefined && 
          React.createElement('span', { style: { color: '#666' } }, 
            `(${formatPrice(statusInfo.calculatedPrice)})`
          )
      ),
      React.createElement('span', { style: { color: '#888' } }, expanded ? '▼' : '▶')
    ),
    
    expanded && React.createElement('div', { style: { marginTop: '12px', borderTop: '1px solid #ddd', paddingTop: '12px' } },
      React.createElement('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' } },
        React.createElement('div', null,
          React.createElement('strong', null, 'Mevcut Fiyat: '),
          formatPrice(changeDetails?.priceChange?.old || quote.price || 0)
        ),
        statusInfo.calculatedPrice !== undefined && React.createElement('div', null,
          React.createElement('strong', null, 'Hesaplanan Fiyat: '),
          formatPrice(statusInfo.calculatedPrice)
        ),
        statusInfo.lastCalculated && React.createElement('div', null,
          React.createElement('strong', null, 'Son Hesaplama: '),
          new Date(statusInfo.lastCalculated).toLocaleString('tr-TR')
        )
      ),
      
      // Change Details Section
      changeDetails && React.createElement('div', { style: { marginBottom: '12px' } },
        // Price change info
        changeDetails.priceChange && changeDetails.priceChange.difference !== 0 && React.createElement('div', { 
          style: { 
            marginBottom: '8px', 
            padding: '8px', 
            backgroundColor: '#f8f9fa', 
            borderRadius: '4px',
            fontSize: '14px'
          } 
        },
          React.createElement('strong', null, 'Fiyat Değişimi: '),
          `${formatPrice(changeDetails.priceChange.old)} → ${formatPrice(changeDetails.priceChange.new)} `,
          React.createElement('span', { 
            style: { 
              color: changeDetails.priceChange.difference > 0 ? '#dc3545' : '#28a745',
              fontWeight: 'bold'
            } 
          }, 
            `(${changeDetails.priceChange.difference > 0 ? '+' : ''}${formatPrice(changeDetails.priceChange.difference)})`
          )
        ),
        
        // Reasons
        changeDetails.reasons && changeDetails.reasons.length > 0 && React.createElement('div', { style: { marginBottom: '8px' } },
          React.createElement('strong', null, 'Değişiklik Nedenleri:'),
          React.createElement('ul', { style: { margin: '4px 0', paddingLeft: '20px' } },
            ...changeDetails.reasons.map((reason, index) => 
              React.createElement('li', { key: index, style: { fontSize: '14px', marginBottom: '2px' } }, reason)
            )
          )
        ),
        
        // Parameter changes
        changeDetails.parameterChanges && changeDetails.parameterChanges.length > 0 && React.createElement('div', { style: { marginBottom: '8px' } },
          React.createElement('strong', null, 'Parametre Değişiklikleri:'),
          React.createElement('ul', { style: { margin: '4px 0', paddingLeft: '20px' } },
            ...changeDetails.parameterChanges.map((change, index) => 
              React.createElement('li', { key: index, style: { fontSize: '13px', marginBottom: '2px', color: '#666' } }, change)
            )
          )
        )
      ),
      
      statusInfo.action && React.createElement('div', { style: { display: 'flex', gap: '8px' } },
        React.createElement('button', {
          onClick: () => handleAction(statusInfo.action),
          disabled: loading,
          style: {
            padding: '8px 16px',
            border: 'none',
            borderRadius: '4px',
            backgroundColor: statusInfo.color,
            color: 'white',
            cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading ? 0.6 : 1
          }
        }, loading ? 'İşleniyor...' : getActionLabel(statusInfo.action)),
        
        statusInfo.action === 'apply' && React.createElement('button', {
          onClick: () => handleAction('calculate'),
          disabled: loading,
          style: {
            padding: '8px 16px',
            border: `1px solid ${statusInfo.color}`,
            borderRadius: '4px',
            backgroundColor: 'transparent',
            color: statusInfo.color,
            cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading ? 0.6 : 1
          }
        }, 'Yeniden Hesapla')
      )
    )
  )
}

// Utility functions
function formatPrice(price) {
  const n = typeof price === 'number' ? price : (parseFloat(price) || 0)
  return `₺${n.toFixed(2)}`
}

function getActionLabel(action) {
  switch (action) {
    case 'calculate': return 'Hesapla'
    case 'apply': return 'Uygula'
    case 'update': return 'Hesapla'
    default: return 'İşlem'
  }
}

function getActionTooltip(action) {
  switch (action) {
    case 'calculate': return 'Fiyatı yeniden hesapla'
    case 'apply': return 'Hesaplanan fiyatı uygula'
    case 'update': return 'Fiyatı yeniden hesapla'
    default: return 'İşlem yap'
  }
}

function getStatusTooltip(statusInfo, quote) {
  let tooltip = `Durum: ${statusInfo.label}`
  if (statusInfo.calculatedPrice !== undefined) {
    tooltip += `\nHesaplanan: ${formatPrice(statusInfo.calculatedPrice)}`
  }
  if (statusInfo.lastCalculated) {
    tooltip += `\nSon hesaplama: ${new Date(statusInfo.lastCalculated).toLocaleString('tr-TR')}`
  }
  return tooltip
}
