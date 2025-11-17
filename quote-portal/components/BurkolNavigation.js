/**
 * Burkol Navigation Component
 * Tüm admin sayfalarında kullanılacak standart navigation komponenti
 */

class BurkolNavigation {
  constructor() {
    this.currentPage = this.getCurrentPage();
  }

  getCurrentPage() {
    const path = window.location.pathname;
    if (path.includes('admin-dashboard.html')) return 'admin';
    if (path.includes('quote-dashboard.html')) return 'quote';
    if (path.includes('production.html')) return 'production';
    if (path.includes('materials.html')) return 'materials';
    if (path.includes('settings.html')) return 'settings';
    return 'admin';
  }

  // Login durumunu kontrol et
  isLoggedIn() {
    // TEMPORARY BYPASS - Firebase credentials expired
    return true; // Always return true to show navbar
    
    // Original code (commented out):
    // const token = localStorage.getItem('bk_admin_token');
    // return token && token.length > 0;
  }

  getNavItems() {
    const currentLang = BurkolNavigation.getCurrentLanguage();
    const isEnglish = currentLang === 'en';
    
    return [
      {
        id: 'admin',
        label: isEnglish ? 'Admin Panel' : 'Yönetim Paneli',
        href: './admin-dashboard.html',
        icon: '<i class="fa-solid fa-home"></i>'
      },
      {
        id: 'quote',
        label: isEnglish ? 'Quote Management' : 'Teklif Yönetimi',
        href: './quote-dashboard.html',
        icon: '<i class="fa-solid fa-clipboard-list"></i>'
      },
      {
        id: 'production',
        label: isEnglish ? 'Production Management' : 'Üretim Yönetimi',
        href: './production.html',
        icon: '<i class="fa-solid fa-industry"></i>'
      },
      {
        id: 'materials',
        label: isEnglish ? 'Material Management' : 'Malzeme Yönetimi',
        href: './materials.html',
        icon: '<i class="fa-solid fa-boxes-stacked"></i>'
      },
      {
        id: 'settings',
        label: isEnglish ? 'Settings' : 'Ayarlar',
        href: './settings.html',
        icon: '<i class="fa-solid fa-gear"></i>'
      }
    ];
  }

  generateNavHTML() {
    const isLoggedIn = this.isLoggedIn();
    
    // Eğer login değilse sadece brand göster
    if (!isLoggedIn) {
      return `
        <div class="burkol-nav">
          <div class="burkol-nav-inner">
            <div class="burkol-brand">
              <div class="burkol-dot"></div>
              <span class="burkol-brand-text">Bee-Plan</span>
            </div>
            
            <div class="burkol-nav-center">
              <!-- Navigation gizli -->
            </div>
            
            <div class="burkol-nav-right">
              <div class="burkol-lang-dropdown">
                <button class="burkol-lang-button" onclick="BurkolNavigation.toggleLanguageMenu()">
                  <i class="fa-solid fa-globe"></i>
                  <span class="lang-text">${BurkolNavigation.getCurrentLanguage() === 'en' ? 'EN' : 'TR'}</span>
                  <i class="fa-solid fa-chevron-down lang-arrow"></i>
                </button>
                <div class="burkol-lang-menu" id="burkol-lang-menu">
                  <div class="lang-option ${BurkolNavigation.getCurrentLanguage() === 'tr' ? 'active' : ''}" onclick="BurkolNavigation.selectLanguage('tr')">
                    <i class="fa-solid fa-flag"></i>
                    <span>Türkçe</span>
                  </div>
                  <div class="lang-option ${BurkolNavigation.getCurrentLanguage() === 'en' ? 'active' : ''}" onclick="BurkolNavigation.selectLanguage('en')">
                    <i class="fa-solid fa-flag"></i>
                    <span>English</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      `;
    }

    // Login ise tam navigation göster
    const navItems = this.getNavItems();
    
    const navButtons = navItems.map(item => {
      const isActive = this.currentPage === item.id;
      const activeClass = isActive ? 'nav-btn-active' : '';
      
      return `
        <a href="${item.href}" class="nav-btn ${activeClass}" data-page="${item.id}">
          <span class="nav-btn-icon">${item.icon}</span>
          <span class="nav-btn-text">${item.label}</span>
        </a>
      `;
    }).join('');

    return `
      <div class="burkol-nav">
        <div class="burkol-nav-inner">
          <div class="burkol-brand">
            <div class="burkol-dot"></div>
            <span class="burkol-brand-text">Bee-Plan</span>
          </div>
          
          <div class="burkol-nav-center">
            ${navButtons}
          </div>
          
          <div class="burkol-nav-right">
            <div class="burkol-lang-dropdown">
              <button class="burkol-lang-button" onclick="BurkolNavigation.toggleLanguageMenu()">
                <i class="fa-solid fa-globe"></i>
                <span class="lang-text">${BurkolNavigation.getCurrentLanguage() === 'en' ? 'EN' : 'TR'}</span>
                <i class="fa-solid fa-chevron-down lang-arrow"></i>
              </button>
              <div class="burkol-lang-menu" id="burkol-lang-menu">
                <div class="lang-option ${BurkolNavigation.getCurrentLanguage() === 'tr' ? 'active' : ''}" onclick="BurkolNavigation.selectLanguage('tr')">
                  <i class="fa-solid fa-flag"></i>
                  <span>Türkçe</span>
                </div>
                <div class="lang-option ${BurkolNavigation.getCurrentLanguage() === 'en' ? 'active' : ''}" onclick="BurkolNavigation.selectLanguage('en')">
                  <i class="fa-solid fa-flag"></i>
                  <span>English</span>
                </div>
              </div>
            </div>
            <button class="burkol-logout-btn" onclick="BurkolNavigation.logout()">
              <span class="logout-icon"><i class="fa-solid fa-sign-out-alt"></i></span>
              <span>${BurkolNavigation.getCurrentLanguage() === 'en' ? 'Logout' : 'Çıkış Yap'}</span>
            </button>
          </div>
        </div>
      </div>
    `;
  }

  generateCSS() {
    return `
      .burkol-nav {
        position: sticky;
        top: 0;
        z-index: 1000;
        background: rgba(10, 18, 28, 0.95);
        backdrop-filter: blur(12px);
        border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
      }

      .burkol-nav-inner {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 9px 24px;
        max-width: 1400px;
        margin: 0 auto;
        gap: 1rem;
        min-height: 51px;
      }

      .burkol-brand {
        display: flex;
        align-items: center;
        gap: 12px;
        font-weight: 700;
        font-size: 1.2rem;
        letter-spacing: 0.5px;
        color: #ffffff;
        min-width: 100px;
        height: 33px;
        flex-shrink: 0;
      }

      .burkol-dot {
        width: 12px;
        height: 12px;
        border-radius: 50%;
        background: linear-gradient(135deg, #d4af37 0%, #f4d03f 100%);
        box-shadow: 0 0 15px rgba(212, 175, 55, 0.6);
        animation: pulse 2s infinite;
      }

      @keyframes pulse {
        0%, 100% { transform: scale(1); }
        50% { transform: scale(1.1); }
      }

      .burkol-brand-text {
        background: linear-gradient(135deg, #ffffff 0%, #d4af37 100%);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        background-clip: text;
      }

      .burkol-nav-center {
        display: flex;
        align-items: center;
        gap: 6px;
        flex: 1;
        justify-content: center;
        flex-wrap: nowrap;
        height: 33px;
        margin: 0 1rem;
      }

      .nav-btn {
        display: inline-flex;
        align-items: center;
        gap: 2px;
        padding: 2px 14px;
        background: linear-gradient(135deg, rgba(255, 255, 255, 0.05) 0%, rgba(255, 255, 255, 0.02) 100%);
        color: rgba(255, 255, 255, 0.8);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 8px;
        cursor: pointer;
        font-size: 0.85rem;
        font-weight: 500;
        transition: all 0.3s ease;
        text-decoration: none;
        position: relative;
        overflow: hidden;
        height: 33px;
        box-sizing: border-box;
        white-space: nowrap;
      }

      .nav-btn:hover {
        background: linear-gradient(135deg, rgba(255, 255, 255, 0.1) 0%, rgba(255, 255, 255, 0.05) 100%);
        color: #ffffff;
        border-color: rgba(212, 175, 55, 0.3);
        transform: translateY(-1px);
        box-shadow: 0 6px 20px rgba(0, 0, 0, 0.2);
      }

      .nav-btn-active {
        background: linear-gradient(135deg, #d4af37 0%, #b8941f 100%);
        color: #ffffff;
        border-color: #d4af37;
        box-shadow: 0 4px 15px rgba(212, 175, 55, 0.4);
      }

      .nav-btn-active:hover {
        background: linear-gradient(135deg, #e6c547 0%, #d4af37 100%);
        transform: translateY(-1px);
        box-shadow: 0 6px 20px rgba(212, 175, 55, 0.5);
      }

      .nav-btn-icon {
        font-size: 1rem;
        margin-right: 16px;
        filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.3));
      }

      .nav-btn-icon i {
        font-size: 1rem;
        color: inherit;
      }

      .nav-btn-text {
        font-weight: 500;
        white-space: nowrap;
      }

      .burkol-nav-right {
        display: flex;
        align-items: center;
        gap: 8px;
        min-width: 160px;
        justify-content: flex-end;
        height: 33px;
        flex-shrink: 0;
      }

      .burkol-lang-dropdown {
        position: relative;
        display: inline-block;
      }

      .burkol-lang-button {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 6px 12px;
        background: linear-gradient(135deg, rgba(255, 255, 255, 0.1) 0%, rgba(255, 255, 255, 0.05) 100%);
        color: rgba(255, 255, 255, 0.9);
        border: 1px solid rgba(255, 255, 255, 0.2);
        border-radius: 8px;
        cursor: pointer;
        font-size: 0.8rem;
        font-weight: 500;
        transition: all 0.3s ease;
        height: 33px;
        min-width: 80px;
        box-sizing: border-box;
      }

      .burkol-lang-button:hover {
        background: linear-gradient(135deg, rgba(255, 255, 255, 0.15) 0%, rgba(255, 255, 255, 0.08) 100%);
        border-color: rgba(212, 175, 55, 0.3);
        color: #ffffff;
      }

      .lang-arrow {
        font-size: 0.7rem;
        transition: transform 0.3s ease;
      }

      .lang-text {
        font-weight: 600;
        font-size: 0.75rem;
      }

      .burkol-lang-menu {
        position: absolute;
        top: calc(100% + 8px);
        right: 0;
        background: rgba(10, 18, 28, 0.95);
        backdrop-filter: blur(12px);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 8px;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
        min-width: 120px;
        opacity: 0;
        visibility: hidden;
        transform: translateY(-10px);
        transition: all 0.3s ease;
        z-index: 1000;
      }

      .burkol-lang-menu.show {
        opacity: 1;
        visibility: visible;
        transform: translateY(0);
      }

      .lang-option {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 10px 12px;
        cursor: pointer;
        color: rgba(255, 255, 255, 0.8);
        font-size: 0.8rem;
        font-weight: 500;
        transition: all 0.2s ease;
        border-radius: 6px;
        margin: 4px;
      }

      .lang-option:hover {
        background: linear-gradient(135deg, rgba(255, 255, 255, 0.1) 0%, rgba(255, 255, 255, 0.05) 100%);
        color: #ffffff;
      }

      .lang-option.active {
        background: linear-gradient(135deg, #d4af37 0%, #b8941f 100%);
        color: #ffffff;
      }

      .lang-option.active:hover {
        background: linear-gradient(135deg, #e6c547 0%, #d4af37 100%);
      }

      .lang-option i {
        font-size: 0.8rem;
        width: 14px;
        text-align: center;
      }

      .burkol-logout-btn {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 8px 12px;
        background: linear-gradient(135deg, #dc3545 0%, #c82333 100%);
        color: white;
        border: none;
        border-radius: 8px;
        cursor: pointer;
        font-size: 0.8rem;
        font-weight: 500;
        transition: all 0.3s ease;
        box-shadow: 0 2px 8px rgba(220, 53, 69, 0.3);
        white-space: nowrap;
        height: 33px;
        box-sizing: border-box;
      }

      .burkol-logout-btn:hover {
        background: linear-gradient(135deg, #e9515f 0%, #dc3545 100%);
        transform: translateY(-1px);
        box-shadow: 0 4px 12px rgba(220, 53, 69, 0.4);
      }

      .logout-icon {
        font-size: 0.9rem;
        filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.3));
      }

      .logout-icon i {
        font-size: 0.9rem;
      }

      /* Responsive Design */
      @media (max-width: 1200px) {
        .burkol-nav-inner {
          gap: 0.5rem;
        }
        
        .burkol-nav-center {
          gap: 4px;
          margin: 0 0.5rem;
        }
        
        .nav-btn {
          padding: 2px 12px;
          font-size: 0.8rem;
          height: 30px;
        }

        .nav-btn-icon {
          margin-right: 12px;
        }
        
        .burkol-logout-btn {
          padding: 6px 10px;
          font-size: 0.75rem;
          height: 30px;
        }
        
        .burkol-lang-button {
          height: 30px;
          padding: 4px 8px;
          font-size: 0.75rem;
          min-width: 70px;
        }

        .lang-text {
          font-size: 0.7rem;
        }
        
        .burkol-nav-right {
          min-width: 140px;
          gap: 6px;
        }
      }

      @media (max-width: 768px) {
        .burkol-nav-inner {
          padding: 4px 12px;
          gap: 0.25rem;
        }
        
        .burkol-nav-center {
          gap: 2px;
          margin: 0 0.25rem;
        }
        
        .nav-btn-text {
          display: none;
        }
        
        .nav-btn {
          padding: 2px 6px;
          min-width: 40px;
          justify-content: center;
          height: 33px;
        }

        .nav-btn-icon {
          margin-right: 0;
        }
        
        .burkol-brand {
          font-size: 1rem;
          height: 33px;
          min-width: 80px;
        }
        
        .burkol-logout-btn {
          padding: 8px 6px;
          font-size: 0.75rem;
          min-width: 40px;
          height: 33px;
        }
        
        .burkol-lang-select {
          height: 33px;
          padding: 6px 4px;
          font-size: 0.7rem;
          min-width: 60px;
        }
        
        .burkol-nav-right {
          min-width: 100px;
          gap: 4px;
        }
        
        .burkol-logout-btn span:not(.logout-icon) {
          display: none;
        }
      }
    `;
  }

  render() {
    // CSS'i head'e ekle
    const styleId = 'burkol-nav-styles';
    if (!document.getElementById(styleId)) {
      const style = document.createElement('style');
      style.id = styleId;
      style.textContent = this.generateCSS();
      document.head.appendChild(style);
    }

    // Varolan navigation'ı kaldır
    const existingNav = document.querySelector('.burkol-nav');
    if (existingNav) {
      existingNav.remove();
    }

    // HTML'i body'nin başına ekle
    const navHTML = this.generateNavHTML();
    document.body.insertAdjacentHTML('afterbegin', navHTML);

    // Event listener'ları ekle
    this.addEventListeners();
  }

  // Navigation'ı refresh et (login durumu değiştiğinde)
  refresh() {
    this.render();
  }

  addEventListeners() {
    // Dil değişikliği
    const langSelect = document.querySelector('.burkol-lang-select');
    if (langSelect) {
      langSelect.addEventListener('change', (e) => {
        const selectedLang = e.target.value;
        localStorage.setItem('burkol_language', selectedLang);
      });

      // Mevcut dili ayarla
      const currentLang = localStorage.getItem('burkol_language') || 'tr';
      langSelect.value = currentLang;
    }
  }

  // Language management
  static getCurrentLanguage() {
    return localStorage.getItem('bee_plan_language') || 'tr';
  }

  static setLanguage(lang) {
    localStorage.setItem('bee_plan_language', lang);
    // Sayfayı yenile veya dil değişikliğini uygula
    this.applyLanguage(lang);
  }

  static applyLanguage(lang) {
    // Basit dil uygulaması - gelecekte i18n kütüphanesi ile genişletilebilir
    const langTexts = {
      tr: {
        home: 'Yönetim Paneli',
        quotes: 'Teklif Yönetimi', 
        production: 'Üretim Yönetimi',
        materials: 'Malzeme Yönetimi',
        settings: 'Ayarlar',
        logout: 'Çıkış Yap'
      },
      en: {
        home: 'Admin Panel',
        quotes: 'Quote Management',
        production: 'Production Management', 
        materials: 'Material Management',
        settings: 'Settings',
        logout: 'Logout'
      }
    };

    // Dil değişikliği event'i gönder
    window.dispatchEvent(new CustomEvent('languageChanged', {
      detail: { language: lang, texts: langTexts[lang] }
    }));

    // Navigation'ı yeniden render et
    setTimeout(() => {
      const nav = new BurkolNavigation();
      nav.render();
    }, 100);
  }

  static toggleLanguageMenu() {
    const menu = document.getElementById('burkol-lang-menu');
    const button = document.querySelector('.burkol-lang-button');
    const arrow = document.querySelector('.lang-arrow');
    
    if (menu.classList.contains('show')) {
      menu.classList.remove('show');
      arrow.style.transform = 'rotate(0deg)';
    } else {
      menu.classList.add('show');
      arrow.style.transform = 'rotate(180deg)';
    }
  }

  static selectLanguage(lang) {
    BurkolNavigation.setLanguage(lang);
    // Menüyü kapat
    const menu = document.getElementById('burkol-lang-menu');
    const arrow = document.querySelector('.lang-arrow');
    menu.classList.remove('show');
    arrow.style.transform = 'rotate(0deg)';
  }

  static onLanguageChange(event) {
    const selectedLang = event.target.value;
    BurkolNavigation.setLanguage(selectedLang);
  }

  // Static method for logout
  static logout() {
    const currentLang = BurkolNavigation.getCurrentLanguage();
    const confirmText = currentLang === 'en' 
      ? 'Are you sure you want to logout?' 
      : 'Çıkış yapmak istediğinizden emin misiniz?';
      
    if (confirm(confirmText)) {
      localStorage.removeItem('bk_admin_token');
      localStorage.removeItem('burkol_user_data');
      
      // Login sayfasına yönlendir
      window.location.href = './login.html';
    }
  }

  // Static method for easy initialization
  static init() {
    // Hem DOMContentLoaded hem de window.onload ile dene
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        const nav = new BurkolNavigation();
        nav.render();
      });
    } else {
      // Sayfa zaten yüklenmişse hemen çalıştır
      const nav = new BurkolNavigation();
      nav.render();
    }
  }
}

// Global olarak erişilebilir yap
window.BurkolNavigation = BurkolNavigation;

// Otomatik başlat - hem script yüklendiğinde hem de DOM ready olduğunda
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    BurkolNavigation.init();
  });
} else {
  BurkolNavigation.init();
}