// Simple modal (ES module)
import { useI18n } from '../i18n/index.js'

export default function Modal({ title, children, onClose }) {
  const { t } = useI18n()
  return React.createElement('div', { style: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60 } },
    React.createElement('div', { className: 'card', style: { width: 'min(420px, 96vw)' } },
      React.createElement('div', { className: 'row', style: { justifyContent: 'space-between' } },
        React.createElement('h3', null, title || t.info),
        React.createElement('button', { className: 'btn', onClick: onClose }, t.a_close)
      ),
      React.createElement('div', null, children)
    )
  )
}

