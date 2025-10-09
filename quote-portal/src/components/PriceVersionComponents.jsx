import React from 'react'

/**
 * PriceStatusBadge - Shows the price update status of a quote
 */
export function PriceStatusBadge({ quote, priceVersionManager }) {
  if (!quote.priceStatus) {
    return null
  }

  const { status, priceDifference, differenceSummary } = quote.priceStatus
  
  const getStatusConfig = () => {
    switch (status) {
      case 'current':
        return {
          className: 'badge-success',
          icon: '✓',
          text: 'Güncel',
          title: 'Fiyat güncel'
        }
      case 'outdated':
        return {
          className: 'badge-warning',
          icon: '⚠',
          text: differenceSummary || 'Güncelleme gerekli',
          title: `Fiyat farkı: ${differenceSummary}`
        }
      case 'error':
        return {
          className: 'badge-error',
          icon: '✗',
          text: 'Hata',
          title: 'Fiyat hesaplama hatası'
        }
      default:
        return {
          className: 'badge-info',
          icon: '?',
          text: 'Bilinmiyor',
          title: 'Durum bilinmiyor'
        }
    }
  }

  const config = getStatusConfig()
  const versionDiff = priceVersionManager?.getVersionDifference(quote)

  return (
    <span 
      className={`price-status-badge ${config.className}`}
      title={`${config.title}${versionDiff ? ` (${versionDiff} versiyon gerisi)` : ''}`}
    >
      <span className="badge-icon">{config.icon}</span>
      <span className="badge-text">{config.text}</span>
    </span>
  )
}

/**
 * BatchPriceUpdateButton - Button to update multiple quotes' prices
 */
export function BatchPriceUpdateButton({ 
  selectedQuotes = [], 
  priceVersionManager, 
  onUpdateStart, 
  onUpdateComplete,
  onUpdateError 
}) {
  const [isUpdating, setIsUpdating] = React.useState(false)

  const quotesNeedingUpdate = selectedQuotes.filter(quote => 
    priceVersionManager?.quoteNeedsUpdate(quote)
  )

  const handleBatchUpdate = async () => {
    if (quotesNeedingUpdate.length === 0) {
      return
    }

    setIsUpdating(true)
    onUpdateStart?.(quotesNeedingUpdate.length)

    try {
      const quoteIds = quotesNeedingUpdate.map(q => q.id)
      const result = await priceVersionManager.batchUpdateQuotePrices(quoteIds)
      
      onUpdateComplete?.(result)
    } catch (error) {
      console.error('❌ Batch update failed:', error)
      onUpdateError?.(error)
    } finally {
      setIsUpdating(false)
    }
  }

  if (quotesNeedingUpdate.length === 0) {
    return (
      <button className="btn btn-secondary" disabled>
        <span className="btn-icon">✓</span>
        Tüm fiyatlar güncel
      </button>
    )
  }

  return (
    <button 
      className="btn btn-primary"
      onClick={handleBatchUpdate}
      disabled={isUpdating}
    >
      {isUpdating ? (
        <>
          <span className="btn-icon spinner">⟳</span>
          Güncelleniyor...
        </>
      ) : (
        <>
          <span className="btn-icon">🔄</span>
          {quotesNeedingUpdate.length} Fiyat Güncelle
        </>
      )}
    </button>
  )
}

/**
 * PriceVersionIndicator - Shows current system price version
 */
export function PriceVersionIndicator({ priceVersionManager }) {
  const [versionInfo, setVersionInfo] = React.useState(null)

  React.useEffect(() => {
    const updateVersionInfo = () => {
      setVersionInfo(priceVersionManager?.currentVersion)
    }

    updateVersionInfo()
    
    // Listen for version changes
    const handleVersionUpdate = () => updateVersionInfo()
    priceVersionManager?.addEventListener('versionChanged', handleVersionUpdate)

    return () => {
      priceVersionManager?.removeEventListener('versionChanged', handleVersionUpdate)
    }
  }, [priceVersionManager])

  if (!versionInfo) {
    return (
      <div className="version-indicator loading">
        <span className="indicator-icon">⟳</span>
        <span className="indicator-text">Versiyon yükleniyor...</span>
      </div>
    )
  }

  return (
    <div className="version-indicator">
      <span className="indicator-icon">📋</span>
      <span className="indicator-text">
        Fiyat Sistemi: v{versionInfo.versionNumber}
      </span>
      <span className="indicator-id" title={`Version ID: ${versionInfo.versionId}`}>
        ({versionInfo.versionId})
      </span>
    </div>
  )
}

/**
 * LazyPriceCalculationStats - Shows performance statistics
 */
export function LazyPriceCalculationStats({ priceVersionManager }) {
  const [stats, setStats] = React.useState({
    totalQuotes: 0,
    upToDate: 0,
    needsUpdate: 0,
    lastCalculation: null
  })

  React.useEffect(() => {
    const handlePricesCalculated = (data) => {
      setStats(prev => ({
        ...prev,
        totalQuotes: data.total,
        upToDate: data.total - data.updated,
        needsUpdate: data.updated,
        lastCalculation: new Date().toLocaleTimeString()
      }))
    }

    priceVersionManager?.addEventListener('pricesCalculated', handlePricesCalculated)

    return () => {
      priceVersionManager?.removeEventListener('pricesCalculated', handlePricesCalculated)
    }
  }, [priceVersionManager])

  if (stats.totalQuotes === 0) {
    return null
  }

  const efficiency = stats.totalQuotes > 0 ? 
    ((stats.upToDate / stats.totalQuotes) * 100).toFixed(1) : 0

  return (
    <div className="lazy-calculation-stats">
      <div className="stats-item">
        <span className="stats-label">Toplam:</span>
        <span className="stats-value">{stats.totalQuotes}</span>
      </div>
      <div className="stats-item">
        <span className="stats-label">Güncel:</span>
        <span className="stats-value text-success">{stats.upToDate}</span>
      </div>
      <div className="stats-item">
        <span className="stats-label">Güncelleme gereken:</span>
        <span className="stats-value text-warning">{stats.needsUpdate}</span>
      </div>
      <div className="stats-item">
        <span className="stats-label">Verimlilik:</span>
        <span className="stats-value">{efficiency}%</span>
      </div>
      {stats.lastCalculation && (
        <div className="stats-item">
          <span className="stats-label">Son hesaplama:</span>
          <span className="stats-value">{stats.lastCalculation}</span>
        </div>
      )}
    </div>
  )
}