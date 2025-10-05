import React from 'react';

function AdminSettings({ t, onLogout, showNotification, onNavigate }) {
  const handleBack = () => {
    if (onNavigate) {
      onNavigate('dashboard');
    }
  };

  const handleLogout = () => {
    if (onLogout) {
      onLogout();
    }
  };

  return (
    <div className="admin-settings">
      <div className="page-header">
        <div className="header-left">
          <button 
            className="back-btn"
            onClick={handleBack}
            title="Yönetim Paneline Dön"
          >
            ← Yönetim Paneli
          </button>
          <div className="header-title">
            <h1>Sistem Ayarları</h1>
            <p>Uygulama ayarları ve parametreler</p>
          </div>
        </div>
        <div className="header-actions">
          <button 
            className="logout-btn"
            onClick={handleLogout}
            title="Çıkış Yap"
          >
            🚪 Çıkış
          </button>
        </div>
      </div>
      
      <div className="content-container">
        <div className="settings-card">
          <div className="settings-icon">⚙️</div>
          <h2>Ayarlar Modülü</h2>
          <p>Sistem ayarları ve konfigürasyon seçenekleri burada yer alacak.</p>
          
          <div className="settings-grid">
            <div className="setting-item">
              <div className="setting-icon">🎨</div>
              <h4>Tema Ayarları</h4>
              <p>Görünüm ve renk düzenlemeleri</p>
              <div className="setting-status">Aktif</div>
            </div>
            
            <div className="setting-item">
              <div className="setting-icon">💰</div>
              <h4>Fiyatlandırma</h4>
              <p>Maliyet hesaplama parametreleri</p>
              <div className="setting-status">Yapılandırıldı</div>
            </div>
            
            <div className="setting-item">
              <div className="setting-icon">📧</div>
              <h4>E-posta Ayarları</h4>
              <p>Bildirim ve otomatik e-posta ayarları</p>
              <div className="setting-status">Beklemede</div>
            </div>

            <div className="setting-item">
              <div className="setting-icon">🔒</div>
              <h4>Güvenlik</h4>
              <p>Kullanıcı yetkileri ve güvenlik ayarları</p>
              <div className="setting-status">Aktif</div>
            </div>

            <div className="setting-item">
              <div className="setting-icon">🔄</div>
              <h4>Yedekleme</h4>
              <p>Otomatik yedekleme ve geri yükleme</p>
              <div className="setting-status">Programlandı</div>
            </div>

            <div className="setting-item">
              <div className="setting-icon">📊</div>
              <h4>Raporlama</h4>
              <p>Rapor formatları ve otomatik raporlar</p>
              <div className="setting-status">Aktif</div>
            </div>
          </div>

          <div className="action-buttons">
            <button className="action-btn primary">
              <span className="btn-icon">✏️</span>
              Ayarları Düzenle
            </button>
            <button className="action-btn secondary">
              <span className="btn-icon">💾</span>
              Yedek Al
            </button>
            <button className="action-btn secondary">
              <span className="btn-icon">🔄</span>
              Varsayılana Dön
            </button>
          </div>
        </div>
      </div>

      <style jsx>{`
        .admin-settings {
          padding: 2rem;
          min-height: 100vh;
          background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
        }

        .page-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 2rem;
          background: rgba(255, 255, 255, 0.1);
          backdrop-filter: blur(10px);
          padding: 1.5rem 2rem;
          border-radius: 15px;
          border: 1px solid rgba(255, 255, 255, 0.2);
        }

        .header-left {
          display: flex;
          align-items: center;
          gap: 1rem;
        }

        .back-btn {
          padding: 0.75rem 1.5rem;
          background: linear-gradient(135deg, #6c757d 0%, #495057 100%);
          color: white;
          border: none;
          border-radius: 8px;
          cursor: pointer;
          font-size: 0.9rem;
          font-weight: 500;
          transition: all 0.3s ease;
          box-shadow: 0 4px 15px rgba(108, 117, 125, 0.3);
        }

        .back-btn:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 20px rgba(108, 117, 125, 0.4);
        }

        .header-title h1 {
          font-size: 2rem;
          color: #333;
          margin: 0 0 0.25rem 0;
          font-weight: 600;
        }

        .header-title p {
          font-size: 1rem;
          color: #666;
          margin: 0;
        }

        .logout-btn {
          padding: 0.75rem 1.5rem;
          background: linear-gradient(135deg, #ff6b6b 0%, #ee5a24 100%);
          color: white;
          border: none;
          border-radius: 8px;
          cursor: pointer;
          font-size: 1rem;
          font-weight: 500;
          transition: all 0.3s ease;
          box-shadow: 0 4px 15px rgba(238, 90, 36, 0.3);
        }

        .logout-btn:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 20px rgba(238, 90, 36, 0.4);
        }

        .content-container {
          max-width: 1200px;
          margin: 0 auto;
        }

        .settings-card {
          background: rgba(255, 255, 255, 0.95);
          backdrop-filter: blur(10px);
          border: 1px solid rgba(255, 255, 255, 0.2);
          border-radius: 20px;
          padding: 3rem;
          text-align: center;
          box-shadow: 0 20px 40px rgba(0, 0, 0, 0.1);
        }

        .settings-icon {
          font-size: 4rem;
          margin-bottom: 1.5rem;
          opacity: 0.8;
        }

        .settings-card h2 {
          font-size: 2rem;
          color: #333;
          margin-bottom: 1rem;
          font-weight: 600;
        }

        .settings-card > p {
          font-size: 1.2rem;
          color: #666;
          margin-bottom: 3rem;
          line-height: 1.6;
        }

        .settings-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
          gap: 2rem;
          margin-bottom: 3rem;
          text-align: left;
        }

        .setting-item {
          background: rgba(255, 255, 255, 0.6);
          border: 1px solid rgba(255, 255, 255, 0.3);
          border-radius: 15px;
          padding: 2rem;
          transition: all 0.3s ease;
          position: relative;
        }

        .setting-item:hover {
          transform: translateY(-5px);
          box-shadow: 0 15px 30px rgba(0, 0, 0, 0.1);
          background: rgba(255, 255, 255, 0.8);
        }

        .setting-icon {
          font-size: 2.5rem;
          margin-bottom: 1rem;
          opacity: 0.8;
        }

        .setting-item h4 {
          font-size: 1.3rem;
          color: #333;
          margin-bottom: 0.75rem;
          font-weight: 600;
        }

        .setting-item p {
          font-size: 0.95rem;
          color: #666;
          line-height: 1.5;
          margin-bottom: 1rem;
        }

        .setting-status {
          position: absolute;
          top: 1rem;
          right: 1rem;
          padding: 0.25rem 0.75rem;
          border-radius: 12px;
          font-size: 0.75rem;
          font-weight: 600;
          text-transform: uppercase;
          background: linear-gradient(135deg, #28a745 0%, #20c997 100%);
          color: white;
        }

        .action-buttons {
          display: flex;
          justify-content: center;
          gap: 1rem;
          flex-wrap: wrap;
        }

        .action-btn {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 1rem 2rem;
          border: none;
          border-radius: 10px;
          cursor: pointer;
          font-size: 1rem;
          font-weight: 500;
          transition: all 0.3s ease;
          box-shadow: 0 8px 20px rgba(0, 0, 0, 0.1);
        }

        .action-btn.primary {
          background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
          color: white;
        }

        .action-btn.secondary {
          background: rgba(255, 255, 255, 0.9);
          color: #333;
          border: 1px solid rgba(0, 0, 0, 0.1);
        }

        .action-btn:hover {
          transform: translateY(-3px);
          box-shadow: 0 12px 25px rgba(0, 0, 0, 0.15);
        }

        .btn-icon {
          font-size: 1.1rem;
        }

        @media (max-width: 768px) {
          .admin-settings {
            padding: 1rem;
          }
          
          .page-header {
            flex-direction: column;
            gap: 1rem;
            text-align: center;
            padding: 1rem;
          }

          .header-left {
            flex-direction: column;
            text-align: center;
          }
          
          .settings-card {
            padding: 2rem 1rem;
          }

          .settings-card h2 {
            font-size: 1.5rem;
          }
          
          .settings-grid {
            grid-template-columns: 1fr;
            gap: 1rem;
          }

          .setting-item {
            padding: 1.5rem;
          }

          .action-buttons {
            flex-direction: column;
            align-items: center;
          }

          .action-btn {
            width: 100%;
            max-width: 300px;
            justify-content: center;
          }
        }
      `}</style>
    </div>
  );
}

export default AdminSettings;