import React from 'react'

function BulkProgressModal({ progress, onAction }) {
  if (!progress || !progress.active) return null;

  const clamp = (value) => {
    if (!Number.isFinite(value)) return 0
    return Math.max(0, Math.min(100, value))
  }

  const percent = progress.total > 0 ? clamp((progress.completed / progress.total) * 100) : 0

  const statusText = progress.finished
    ? (progress.cancelled ? 'İşlem iptal edildi' : 'Toplu güncelleme tamamlandı')
    : (progress.cancelling ? 'İşlem iptal ediliyor...' : progress.message || 'İşlem devam ediyor...')

  const subtitle = !progress.finished && progress.currentName
    ? `Şu an: ${progress.currentName}`
    : ''

  const showCancelButton = !progress.finished && !progress.cancelling
  const showCloseButton = progress.finished

  const errorList = Array.isArray(progress.errors) ? progress.errors : []
  const errorPreview = errorList.slice(0, 3)

  return (
    <div className="bulk-progress-modal">
      <div className="bulk-progress-content">
        <button
          onClick={() => {
            if (progress.finished) {
              onAction('close')
            } else if (!progress.cancelling) {
              onAction('cancel')
            }
          }}
          className="bulk-progress-close"
          disabled={progress.cancelling && !progress.finished}
        >
          ×
        </button>

        <h3 className="bulk-progress-title">
          {progress.title || 'Toplu İşlem'}
        </h3>

        <p className="bulk-progress-status">
          {statusText}
        </p>

        {subtitle && (
          <p className="bulk-progress-subtitle">
            {subtitle}
          </p>
        )}

        <div className="bulk-progress-bar">
          <div 
            className={`bulk-progress-fill ${!progress.finished ? 'active' : ''}`}
            style={{ width: `${percent}%` }}
          />
        </div>

        <p className="bulk-progress-stats">
          Tamamlanan: {progress.completed}/{progress.total}
          {progress.skipped > 0 && ` (${progress.skipped} atlandı)`}
        </p>

        {errorPreview.length > 0 && (
          <div className="bulk-progress-errors">
            <strong className="bulk-progress-errors-title">
              Hatalar
            </strong>
            <ul className="bulk-progress-errors-list">
              {errorPreview.map((err, index) => (
                <li key={`${err.id || index}-err`}>
                  {typeof err === 'string' ? err : `${err.id ? `${err.id}: ` : ''}${err.error || 'Hata'}`}
                </li>
              ))}
            </ul>
            {errorList.length > errorPreview.length && (
              <div className="bulk-progress-errors-more">
                +{errorList.length - errorPreview.length} diğer hata
              </div>
            )}
          </div>
        )}

        <div className="bulk-progress-actions">
          {showCancelButton && (
            <button
              onClick={() => onAction('cancel')}
              className="bulk-progress-btn cancel"
            >
              İptal
            </button>
          )}
          {showCloseButton && (
            <button
              onClick={() => onAction('close')}
              className="bulk-progress-btn close"
            >
              Kapat
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default BulkProgressModal