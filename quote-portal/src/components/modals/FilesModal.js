import { API_BASE } from '../../lib/api.js'

export function FilesModal({ item, onClose, t }) {
  function srcOf(f) {
    if (!f) return ''
    if (f.dataUrl) return f.dataUrl
    const u = f.url || ''
    if (!u) return ''
    return /^https?:/i.test(u) ? u : (API_BASE.replace(/\/$/, '') + u)
  }
  
  return React.createElement('div', { style: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60 } },
    React.createElement('div', { className: 'card', style: { width: 'min(900px, 96vw)', maxHeight: '85vh', overflowY: 'auto', position: 'relative', padding: 12 } },
      React.createElement('div', { className: 'row', style: { justifyContent: 'space-between' } },
        React.createElement('h3', null, t.a_files),
        React.createElement('button', { 
          className: 'btn', 
          onClick: onClose,
          onMouseOver: (e) => e.target.style.backgroundColor = 'rgba(0,0,0,0.1)',
          onMouseOut: (e) => e.target.style.backgroundColor = '',
          style: { transition: 'all 0.2s ease' }
        }, t.a_close)
      ),
      React.createElement('div', { className: 'grid two', style: { gap: 8 } },
        (item.files||[]).map((f, i) => React.createElement('div', { key: 'tf'+i, className: 'card', style: { padding: 10 } },
          React.createElement('div', null, `${f.name} (${(f.size/1024).toFixed(0)} KB)`),
          (f.type||'').toLowerCase().includes('image') || ['png','jpg','jpeg'].includes((f.type||'').toLowerCase()) ? (
            React.createElement('img', { className: 'preview-img', src: srcOf(f), alt: f.name })
          ) : React.createElement('a', { className: 'btn', href: srcOf(f), download: f.name, title: t.tt_download_txt }, t.download)
        )),
        (item.productImages||[]).map((f, i) => React.createElement('div', { key: 'pi'+i, className: 'card', style: { padding: 10 } },
          React.createElement('div', null, `${f.name} (${(f.size/1024).toFixed(0)} KB)`),
          (f.type||'').toLowerCase().includes('image') || ['png','jpg','jpeg'].includes((f.type||'').toLowerCase()) ? (
            React.createElement('img', { className: 'preview-img', src: srcOf(f), alt: f.name })
          ) : React.createElement('a', { className: 'btn', href: srcOf(f), download: f.name, title: t.tt_download_txt }, t.download)
        ))
      )
    )
  )
}