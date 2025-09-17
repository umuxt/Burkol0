// Burkol Quote/Admin (React 18) + backend API
// Separate pages: index.html (quote) and admin.html (admin)

// Check React availability
if (typeof window !== 'undefined' && !window.React) {
  console.error('React is not loaded! Check CDN scripts in HTML.')
  throw new Error('React is required but not found')
}
if (typeof window !== 'undefined' && !window.ReactDOM) {
  console.error('ReactDOM is not loaded! Check CDN scripts in HTML.')  
  throw new Error('ReactDOM is required but not found')
}

import { useI18n, statusLabel, procLabel, materialLabel, finishLabel } from './i18n/index.js'
import API, { API_BASE } from './lib/api.js'
import { uid, downloadDataUrl, ACCEPT_EXT, MAX_FILES, MAX_FILE_MB, MAX_PRODUCT_FILES, extOf, readFileAsDataUrl, isImageExt, formatPrice } from './lib/utils.js'
import Field from './components/Field.js'
import Modal from './components/Modal.js'
import DynamicFormRenderer from './components/DynamicFormRenderer.js'
import Admin from './components/admin/Admin.js'
import SettingsModal from './components/modals/SettingsModal.js'
import { DetailModal } from './components/modals/DetailModal.js'
import { FilterPopup } from './components/modals/FilterPopup.js'
import { FilesModal } from './components/modals/FilesModal.js'
import { ToastNotification, useNotifications } from './hooks/useNotifications.js'

;(function () {
  const { useState, useEffect, useMemo, useRef } = React
  const { createRoot } = ReactDOM

  // i18n moved to i18n.js

  // label helpers moved to i18n.js

  // API and utils moved to modules (api.js, utils.js)

  // Determine page type from global (set in HTML)
  const PAGE = (typeof window !== 'undefined' && window.BURKOL_APP) ? window.BURKOL_APP : 'quote'

  function Nav({ onLang, lang, t }) {
    const isAdmin = PAGE === 'admin'
    const otherHref = isAdmin ? './index.html' : './admin.html'
    const otherLabel = isAdmin ? (t.nav_quote || 'Teklif Ver') : (t.nav_admin || 'Admin')
    return (
      React.createElement('div', { className: 'nav' },
        React.createElement('div', { className: 'nav-inner container' },
          React.createElement('div', { className: 'brand' },
            React.createElement('div', { className: 'dot' }),
            React.createElement('a', { href: isAdmin ? './panel-gizli.html' : './index.html' }, 'BURKOL')
          ),
          React.createElement('div', { className: 'row wrap' },
            React.createElement('div', { className: 'tabs' },
              // Link to other page removed for production
              // React.createElement('a', { href: otherHref, className: 'tab' }, otherLabel)
            ),
            React.createElement('div', { style: { width: 12 } }),
            React.createElement('select', {
              value: lang,
              onChange: (e) => onLang(e.target.value)
            },
              React.createElement('option', { value: 'tr' }, 'Türkçe'),
              React.createElement('option', { value: 'en' }, 'English'),
            )
          )
        )
      )
    )
  }

  // Field moved to components/Field.js
  // DynamicFormRenderer renders forms based on admin configuration
  // FilterPopup moved to components/modals/FilterPopup.js

  // Admin component moved to components/admin/Admin.js
  // FilesModal moved to components/modals/FilesModal.js

  // SettingsModal moved to components/modals/SettingsModal.js

  // DetailModal moved to components/modals/DetailModal.js

  // Modal moved to components/Modal.js

  // NumericFilter removed (unused)

  // Notification system moved to hooks/useNotifications.js

  function App() {
    const { t, lang, setLang } = useI18n()
    const [loggedIn, setLoggedIn] = useState(false)
    const { notifications, showNotification, removeNotification } = useNotifications()

    // Check for existing token on initial load
    useEffect(() => {
      async function checkLogin() {
        try {
          const token = localStorage.getItem('bk_admin_token')
          if (token) {
            await API.me() // This will throw if token is invalid
            setLoggedIn(true)
          }
        } catch (e) {
          // Token is invalid or expired, ensure logged out state
          localStorage.removeItem('bk_admin_token')
          setLoggedIn(false)
        }
      }
      if (PAGE === 'admin') {
        checkLogin()
      }
    }, [])

    function handleLogin() {
      setLoggedIn(true)
    }

    function handleLogout() {
      setLoggedIn(false)
    }

    // Dynamic form submission handler
    async function handleQuoteSubmit(quoteData) {
      try {
        await API.createQuote(quoteData)
        showNotification('Teklif başarıyla gönderildi!', 'success')
      } catch (error) {
        console.error('Quote submission error:', error)
        throw error // Let DynamicFormRenderer handle the error display
      }
    }

    return (
      React.createElement(React.Fragment, null,
        // Notifications at the top
        notifications.map(notification => 
          React.createElement(ToastNotification, {
            key: notification.id,
            message: notification.message,
            type: notification.type,
            onClose: () => removeNotification(notification.id)
          })
        ),
        React.createElement(Nav, { onLang: setLang, lang, t }),
        PAGE === 'admin'
          ? (loggedIn ? React.createElement(Admin, { t, onLogout: handleLogout, showNotification, SettingsModal, DetailModal, FilterPopup }) : React.createElement(AdminGate, { onLogin: handleLogin, t }))
          : React.createElement(DynamicFormRenderer, { 
              onSubmit: handleQuoteSubmit, 
              showNotification: showNotification, 
              t: t 
            })
      )
    )
  }

  function AdminGate({ onLogin, t }) {
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [remember, setRemember] = useState(true)
    const [error, setError] = useState('')
    const [loading, setLoading] = useState(false)

    async function onSubmit(e) {
      e.preventDefault()
      if (!email || !password) { setError('E-posta ve şifre gerekli'); return }
      setLoading(true)
      setError('')
      try {
        const res = await API.login(email, password, remember)
        if (res && res.ok) {
          onLogin()
        } else {
          // This branch may not be hit if API.login always throws on error, but as a fallback:
          setError((res && res.error) || 'Giriş başarısız. Lütfen tekrar deneyin.')
        }
      } catch (err) {
        console.error(err)
        // The custom error from API.login will be caught here.
        setError(err.message || 'Giriş başarısız. Sunucu hatası.')
      } finally {
        setLoading(false)
      }
    }

    return React.createElement('div', { className: 'gate' },
      React.createElement('form', { className: 'card', onSubmit: onSubmit, style: { maxWidth: 400, width: '100%', margin: '0 auto', padding: 16, borderRadius: 8, boxShadow: '0 4px 8px rgba(0,0,0,0.1)' } },
        React.createElement('h2', { className: 'title', style: { marginBottom: 16, fontSize: 18, textAlign: 'center' } }, 'Admin Girişi'),
        error ? React.createElement('div', { className: 'notice', style: { marginBottom: 12 } }, error) : null,
        React.createElement('div', { className: 'field', style: { marginBottom: 12 } },
          React.createElement('label', { style: { marginBottom: 4 } }, 'E-posta'),
          React.createElement('input', {
            type: 'email', name: 'email', required: true,
            value: email, onChange: (e) => setEmail(e.target.value)
          })
        ),
        React.createElement('div', { className: 'field', style: { marginBottom: 16 } },
          React.createElement('label', { style: { marginBottom: 4 } }, 'Şifre'),
          React.createElement('input', {
            type: 'password', name: 'password', required: true,
            value: password, onChange: (e) => setPassword(e.target.value)
          })
        ),
        React.createElement('div', { className: 'row', style: { justifyContent: 'space-between', alignItems: 'center', marginTop: 10,  } },
          React.createElement('label', { style: { display: 'flex', alignItems: 'center', gap: '8px', color: 'white', fontSize: '14px' } },
            React.createElement('input', { type: 'checkbox', checked: remember, onChange: (e) => setRemember(e.target.checked) }),
            React.createElement('span', { style: { color: 'white' } }, t.remember_me || 'Beni hatırla')
          ),
          React.createElement('button', { 
            type: 'submit', 
            className: 'btn accent',
            onMouseOver: (e) => e.target.style.backgroundColor = 'rgba(255,255,255,0.2)',
            onMouseOut: (e) => e.target.style.backgroundColor = '',
            style: { transition: 'all 0.2s ease' }
          }, t.login_btn || 'Giriş Yap')
        )
      )
    )
  }

  ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(App))
})()
