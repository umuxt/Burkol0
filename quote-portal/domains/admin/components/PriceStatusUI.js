import React from 'react'
import { architectureAPI } from '../../../shared/lib/architectureAPI.js'

/**
 * Price Status Badge Component
 * Displays quote price status with appropriate styling and actions
 */
export function PriceStatusBadge({ quote, compact = false, onUpdate, showActions = true }) {
  const [isUpdating, setIsUpdating] = React.useState(false)
  
  if (!quote || !quote.priceStatus) {
    return null
  }

  // Check if quote has manual override
  const isManualOverride = quote.manualOverride?.active
  const statusInfo = isManualOverride 
    ? { label: 'Manuel', icon: '🔒', variant: 'manual', action: null }
    : architectureAPI.getStatusDisplayInfo(quote.priceStatus)

  if (!statusInfo) {
    return null
  }

  const handleAction = async () => {
    if (!statusInfo.action || isManualOverride || isUpdating) return
    
    setIsUpdating(true)
    try {
      await statusInfo.action(quote.id)
      if (onUpdate) {
        await onUpdate()
      }
    } catch (error) {
      console.error('Price status action failed:', error)
    } finally {
      setIsUpdating(false)
    }
  }

  const badgeStyle = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    padding: compact ? '2px 6px' : '4px 8px',
    borderRadius: '4px',
    fontSize: compact ? '10px' : '12px',
    fontWeight: '500',
    border: '1px solid',
    cursor: statusInfo.action && !isManualOverride ? 'pointer' : 'default',
    opacity: isUpdating ? 0.6 : 1,
    transition: 'all 0.2s ease',
    ...getVariantStyles(statusInfo.variant)
  }

  const content = [
    statusInfo.icon && React.createElement('span', { key: 'icon' }, statusInfo.icon),
    React.createElement('span', { key: 'label' }, statusInfo.label)
  ].filter(Boolean)

  if (statusInfo.action && showActions && !isManualOverride) {
    return React.createElement('button', {
      style: {
        ...badgeStyle,
        background: 'none',
        cursor: isUpdating ? 'not-allowed' : 'pointer'
      },
      onClick: handleAction,
      disabled: isUpdating,
      title: isUpdating ? 'Güncelleniyor...' : `${statusInfo.label} - Tıklayın`
    }, ...content)
  }

  return React.createElement('span', {
    style: badgeStyle,
    title: isManualOverride ? 'Manuel fiyat ayarlanmış' : statusInfo.label
  }, ...content)
}

/**
 * Get styling for different price status variants
 */
function getVariantStyles(variant) {
  const variants = {
    'current': {
      backgroundColor: 'rgba(34, 197, 94, 0.1)',
      borderColor: 'rgba(34, 197, 94, 0.3)',
      color: '#22c55e'
    },
    'outdated': {
      backgroundColor: 'rgba(251, 191, 36, 0.1)',
      borderColor: 'rgba(251, 191, 36, 0.3)',
      color: '#fbbf24'
    },
    'drift': {
      backgroundColor: 'rgba(239, 68, 68, 0.1)',
      borderColor: 'rgba(239, 68, 68, 0.3)',
      color: '#ef4444'
    },
    'pending': {
      backgroundColor: 'rgba(99, 102, 241, 0.1)',
      borderColor: 'rgba(99, 102, 241, 0.3)',
      color: '#6366f1'
    },
    'manual': {
      backgroundColor: 'rgba(255, 193, 7, 0.1)',
      borderColor: 'rgba(255, 193, 7, 0.3)',
      color: '#ffc107'
    },
    'error': {
      backgroundColor: 'rgba(239, 68, 68, 0.1)',
      borderColor: 'rgba(239, 68, 68, 0.3)',
      color: '#ef4444'
    }
  }

  return variants[variant] || variants['current']
}

/**
 * Price Status List Component
 * Shows a list of quotes with their price statuses
 */
export function PriceStatusList({ quotes, onQuoteUpdate }) {
  if (!quotes || quotes.length === 0) {
    return React.createElement('div', {
      style: {
        padding: '20px',
        textAlign: 'center',
        color: '#6b7280'
      }
    }, 'Henüz teklif bulunmuyor')
  }

  return React.createElement('div', {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: '8px'
    }
  }, quotes.map(quote => 
    React.createElement('div', {
      key: quote.id,
      style: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '8px 12px',
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
        borderRadius: '6px',
        border: '1px solid rgba(255, 255, 255, 0.1)'
      }
    },
      React.createElement('div', {
        style: {
          display: 'flex',
          flexDirection: 'column',
          gap: '2px'
        }
      },
        React.createElement('span', {
          style: {
            fontWeight: '500',
            fontSize: '14px'
          }
        }, quote.name || quote.id),
        React.createElement('span', {
          style: {
            fontSize: '12px',
            color: '#9ca3af'
          }
        }, `₺${(quote.price || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}`)
      ),
      React.createElement(PriceStatusBadge, {
        quote,
        onUpdate: () => onQuoteUpdate && onQuoteUpdate(quote.id)
      })
    )
  ))
}

/**
 * Price Status Summary Component
 * Shows aggregate statistics for price statuses
 */
export function PriceStatusSummary({ quotes }) {
  if (!quotes || quotes.length === 0) {
    return null
  }

  const summary = quotes.reduce((acc, quote) => {
    if (quote.manualOverride?.active) {
      acc.manual = (acc.manual || 0) + 1
    } else if (quote.priceStatus) {
      const status = quote.priceStatus.status || 'unknown'
      acc[status] = (acc[status] || 0) + 1
    } else {
      acc.unknown = (acc.unknown || 0) + 1
    }
    return acc
  }, {})

  return React.createElement('div', {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
      gap: '12px',
      padding: '16px',
      backgroundColor: 'rgba(255, 255, 255, 0.05)',
      borderRadius: '8px',
      border: '1px solid rgba(255, 255, 255, 0.1)'
    }
  }, Object.entries(summary).map(([status, count]) => {
    const statusInfo = status === 'manual' 
      ? { label: 'Manuel', icon: '🔒', variant: 'manual' }
      : architectureAPI.getStatusDisplayInfo({ status })

    return React.createElement('div', {
      key: status,
      style: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '4px'
      }
    },
      React.createElement('span', {
        style: {
          fontSize: '24px',
          fontWeight: 'bold',
          color: getVariantStyles(statusInfo?.variant || 'current').color
        }
      }, count),
      React.createElement('span', {
        style: {
          fontSize: '12px',
          color: '#9ca3af'
        }
      }, statusInfo?.label || status)
    )
  }))
}