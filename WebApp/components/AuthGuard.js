/**
 * Authentication Guard for Admin Pages
 * Tüm admin sayfalarında kullanılacak authentication kontrolü
 */

class AuthGuard {
  constructor() {
    // Sadece admin sayfalarında çalış
    if (this.isAdminPage()) {
      this.checkAuth();
    }
  }

  isAdminPage() {
    const path = window.location.pathname;
    const adminPages = [
      'admin-dashboard.html',
      'quote-dashboard.html', 
      'production.html',
      'materials.html',
      'settings.html'
    ];
    
    return adminPages.some(page => path.includes(page));
  }

  isLoggedIn() {
    const token = localStorage.getItem('bp_admin_token');
    return token && token.length > 0;
  }

  redirectToLogin() {
    // Login sayfasına yönlendir
    window.location.href = './login.html';
  }

  checkAuth() {
    if (!this.isLoggedIn()) {
      // Login değilse login sayfasına yönlendir
      this.redirectToLogin();
    }
  }

  // Static method for easy initialization
  static init() {
    // Sayfa yüklendikten sonra auth kontrolü yap
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        new AuthGuard();
      });
    } else {
      new AuthGuard();
    }
  }
}

// Global olarak erişilebilir yap
window.AuthGuard = AuthGuard;

// Otomatik başlat
AuthGuard.init();