import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { useI18n } from './i18n/index.js';
import API from './lib/api.js';
import DynamicFormRenderer from './components/DynamicFormRenderer.js';
import Admin from './components/admin/Admin.js';
import { ToastNotification, useNotifications } from './hooks/useNotifications.js';

const PAGE = window.location.pathname.includes('panel-gizli.html') ? 'admin' : 'quote';

function Nav({ onLang, lang, t }) {
  const isAdmin = PAGE === 'admin';
  return (
    <div className='nav'>
      <div className='nav-inner container'>
        <div className='brand'>
          <div className='dot'></div>
          <a href={isAdmin ? './panel-gizli.html' : './index.html'}>BURKOL</a>
        </div>
        <div className='row wrap'>
          <div className='tabs'></div>
          <div style={{ width: 12 }}></div>
          <select value={lang} onChange={(e) => onLang(e.target.value)}>
            <option value='tr'>Türkçe</option>
            <option value='en'>English</option>
          </select>
        </div>
      </div>
    </div>
  );
}

function App() {
  const { t, lang, setLang } = useI18n();
  const [loggedIn, setLoggedIn] = useState(false);
  const { notifications, showNotification, removeNotification } = useNotifications();

  useEffect(() => {
    async function checkLogin() {
      try {
        const token = localStorage.getItem('bk_admin_token');
        if (token) {
          await API.me();
          setLoggedIn(true);
        }
      } catch (e) {
        localStorage.removeItem('bk_admin_token');
        setLoggedIn(false);
      }
    }
    if (PAGE === 'admin') {
      checkLogin();
    }
  }, []);

  function handleLogin() {
    setLoggedIn(true);
  }

  function handleLogout() {
    setLoggedIn(false);
  }

  async function handleQuoteSubmit(quoteData) {
    try {
      await API.createQuote(quoteData);
      showNotification('Teklif başarıyla gönderildi!', 'success');
    } catch (error) {
      console.error('Quote submission error:', error);
      throw error;
    }
  }

  return (
    <React.Fragment>
      {notifications.map(notification => (
        <ToastNotification
          key={notification.id}
          message={notification.message}
          type={notification.type}
          onClose={() => removeNotification(notification.id)}
        />
      ))}
      <Nav onLang={setLang} lang={lang} t={t} />
      {PAGE === 'admin'
        ? (loggedIn ? <Admin t={t} onLogout={handleLogout} showNotification={showNotification} /> : <AdminGate onLogin={handleLogin} t={t} />)
        : <DynamicFormRenderer onSubmit={handleQuoteSubmit} showNotification={showNotification} t={t} />
      }
    </React.Fragment>
  );
}

function AdminGate({ onLogin, t }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    if (!email || !password) { setError('E-posta ve şifre gerekli'); return; }
    setLoading(true);
    setError('');
    try {
      const res = await API.login(email, password, remember);
      if (res && res.token) {
        onLogin();
      } else {
        setError('Giriş başarısız. Lütfen tekrar deneyin.');
      }
    } catch (err) {
      console.error(err);
      setError(err.message || 'Giriş başarısız. Sunucu hatası.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className='gate'>
      <form className='card' onSubmit={onSubmit} style={{ maxWidth: 400, width: '100%', margin: '0 auto', padding: 16, borderRadius: 8, boxShadow: '0 4px 8px rgba(0,0,0,0.1)' }}>
        <h2 className='title' style={{ marginBottom: 16, fontSize: 18, textAlign: 'center' }}>Admin Girişi</h2>
        {error && <div className='notice' style={{ marginBottom: 12 }}>{error}</div>}
        <div className='field' style={{ marginBottom: 12 }}>
          <label style={{ marginBottom: 4 }}>E-posta</label>
          <input type='email' name='email' required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className='field' style={{ marginBottom: 16 }}>
          <label style={{ marginBottom: 4 }}>Şifre</label>
          <input type='password' name='password' required value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <div className='row' style={{ justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'white', fontSize: '14px' }}>
            <input type='checkbox' checked={remember} onChange={(e) => setRemember(e.target.checked)} />
            <span style={{ color: 'white' }}>{t.remember_me || 'Beni hatırla'}</span>
          </label>
          <button type='submit' className='btn accent' onMouseOver={(e) => e.target.style.backgroundColor = 'rgba(255,255,255,0.2)'} onMouseOut={(e) => e.target.style.backgroundColor = ''} style={{ transition: 'all 0.2s ease' }}>
            {t.login_btn || 'Giriş Yap'}
          </button>
        </div>
      </form>
    </div>
  );
}

createRoot(document.getElementById('root')).render(<App />);
