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
    const token = localStorage.getItem('bk_admin_token');
    return token && token.length > 0;
  }

  getNavItems() {
    return [
      {
        id: 'admin',
        label: 'Yönetim Paneli',
        href: './admin-dashboard.html',
        icon: '🏠'
      },
      {
        id: 'quote',
        label: 'Teklif Yönetimi',
        href: './quote-dashboard.html',
        icon: '📋'
      },
      {
        id: 'production',
        label: 'Üretim Paneli',
        href: './production.html',
        icon: '🏭'
      },
      {
        id: 'materials',
        label: 'Malzeme Yönetimi',
        href: './materials.html',
        icon: '📦'
      },
      {
        id: 'settings',
        label: 'Ayarlar',
        href: './settings.html',
        icon: '⚙️'
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
              <span class="burkol-brand-text">BURKOL</span>
            </div>
            
            <div class="burkol-nav-center">
              <!-- Navigation gizli -->
            </div>
            
            <div class="burkol-nav-right">
              <select class="burkol-lang-select">
                <option value="tr">Türkçe</option>
                <option value="en">English</option>
              </select>
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
            <span class="burkol-brand-text">BURKOL</span>
          </div>
          
          <div class="burkol-nav-center">
            ${navButtons}
          </div>
          
          <div class="burkol-nav-right">
            <select class="burkol-lang-select">
              <option value="tr">Türkçe</option>
              <option value="en">English</option>
            </select>
            <button class="burkol-logout-btn" onclick="BurkolNavigation.logout()">
              <span class="logout-icon">🚪</span>
              <span>Çıkış Yap</span>
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
        padding: 12px 24px;
        max-width: 1400px;
        margin: 0 auto;
        gap: 1rem;
        min-height: 68px;
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
        height: 44px;
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
        height: 44px;
        margin: 0 1rem;
      }

      .nav-btn {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 8px 14px;
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
        height: 44px;
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
        filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.3));
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
        height: 44px;
        flex-shrink: 0;
      }

      .burkol-lang-select {
        background: rgba(255, 255, 255, 0.1);
        color: #ffffff;
        border: 1px solid rgba(255, 255, 255, 0.2);
        border-radius: 6px;
        padding: 8px 10px;
        font-size: 0.8rem;
        cursor: pointer;
        transition: all 0.3s ease;
        height: 44px;
        display: flex;
        align-items: center;
        min-width: 80px;
      }

      .burkol-lang-select:hover {
        background: rgba(255, 255, 255, 0.15);
        border-color: rgba(255, 255, 255, 0.3);
      }

      .burkol-lang-select option {
        background: #1a1a1a;
        color: #ffffff;
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
        height: 44px;
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
          padding: 6px 12px;
          font-size: 0.8rem;
          height: 40px;
        }
        
        .burkol-logout-btn {
          padding: 6px 10px;
          font-size: 0.75rem;
          height: 40px;
        }
        
        .burkol-lang-select {
          height: 40px;
          padding: 6px 8px;
          font-size: 0.75rem;
          min-width: 70px;
        }
        
        .burkol-nav-right {
          min-width: 140px;
          gap: 6px;
        }
      }

      @media (max-width: 768px) {
        .burkol-nav-inner {
          padding: 6px 12px;
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
          padding: 8px 6px;
          min-width: 40px;
          justify-content: center;
          height: 44px;
        }
        
        .burkol-brand {
          font-size: 1rem;
          height: 44px;
          min-width: 80px;
        }
        
        .burkol-logout-btn {
          padding: 8px 6px;
          font-size: 0.75rem;
          min-width: 40px;
          height: 44px;
        }
        
        .burkol-lang-select {
          height: 44px;
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

  // Static method for logout
  static logout() {
    if (confirm('Çıkış yapmak istediğinizden emin misiniz?')) {
      localStorage.removeItem('bk_admin_token');
      localStorage.removeItem('burkol_user_data');
      window.location.href = './admin-dashboard.html';
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