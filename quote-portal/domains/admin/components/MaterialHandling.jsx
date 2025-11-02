import React from 'react';

function MaterialHandling({ t, onLogout, showNotification, onNavigate }) {
  const handleBack = () => {
    if (onNavigate) {
      onNavigate('dashboard');
    }
  };

  return (
    <div className="material-handling">
      
      <div className="content-container">
        <div className="placeholder-card">
          <div className="placeholder-icon">📦</div>
          <h2>Yakında Kullanıma Sunulacak</h2>
          <p>Malzeme yönetimi özellikleri burada yer alacak.</p>
          
          <div className="features-grid">
            <div className="feature-item">
              <div className="feature-icon">📦</div>
              <h4>Envanter Yönetimi</h4>
              <p>Malzeme stok takibi ve yönetimi</p>
            </div>
            
            <div className="feature-item">
              <div className="feature-icon">🚛</div>
              <h4>Tedarik Zinciri</h4>
              <p>Tedarikçi ilişkileri ve sipariş takibi</p>
            </div>
            
            <div className="feature-item">
              <div className="feature-icon">📊</div>
              <h4>Kaynak Tahsisi</h4>
              <p>Optimal kaynak dağılımı ve planlama</p>
            </div>

            <div className="feature-item">
              <div className="feature-icon">🔍</div>
              <h4>Kalite Kontrol</h4>
              <p>Malzeme kalite standartları ve test süreçleri</p>
            </div>

            <div className="feature-item">
              <div className="feature-icon">📈</div>
              <h4>Performans Raporları</h4>
              <p>Malzeme kullanım analizleri ve trend raporları</p>
            </div>

            <div className="feature-item">
              <div className="feature-icon">⚡</div>
              <h4>Otomatik Sipariş</h4>
              <p>Minimum stok seviyelerine göre otomatik sipariş</p>
            </div>
          </div>

          <div className="status-info">
            <div className="status-badge">
              <span className="status-dot"></span>
              Geliştirme Aşamasında
            </div>
            <p className="status-text">
              Bu modül aktif olarak geliştirilmektedir. Yakında tüm özellikler kullanıma sunulacaktır.
            </p>
          </div>
        </div>
      </div>

      <style jsx>{`
        .material-handling {
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

        .content-container {        .placeholder-card {
          background: rgba(255, 255, 255, 0.95);
          backdrop-filter: blur(10px);
          border: 1px solid rgba(255, 255, 255, 0.2);
          border-radius: 20px;
          padding: 3rem;
          text-align: center;
          box-shadow: 0 20px 40px rgba(0, 0, 0, 0.1);
        }

        .placeholder-icon {
          font-size: 4rem;
          margin-bottom: 1.5rem;
          opacity: 0.8;
        }

        .placeholder-card h2 {
          font-size: 2rem;
          color: #333;
          margin-bottom: 1rem;
          font-weight: 600;
        }

        .placeholder-card > p {
          font-size: 1.2rem;
          color: #666;
          margin-bottom: 3rem;
          line-height: 1.6;
        }

        .features-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
          gap: 2rem;
          margin-bottom: 3rem;
        }

        .feature-item {
          background: rgba(255, 255, 255, 0.6);
          border: 1px solid rgba(255, 255, 255, 0.3);
          border-radius: 15px;
          padding: 2rem;
          transition: all 0.3s ease;
          text-align: center;
        }

        .feature-item:hover {
          transform: translateY(-5px);
          box-shadow: 0 15px 30px rgba(0, 0, 0, 0.1);
          background: rgba(255, 255, 255, 0.8);
        }

        .feature-icon {
          font-size: 2.5rem;
          margin-bottom: 1rem;
          opacity: 0.8;
        }

        .feature-item h4 {
          font-size: 1.3rem;
          color: #333;
          margin-bottom: 0.75rem;
          font-weight: 600;
        }

        .feature-item p {
          font-size: 0.95rem;
          color: #666;
          line-height: 1.5;
          margin: 0;
        }

        .status-info {
          background: linear-gradient(135deg, #43e97b 0%, #38f9d7 100%);
          color: white;
          padding: 2rem;
          border-radius: 15px;
          margin-top: 2rem;
        }

        .status-badge {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          background: rgba(255, 255, 255, 0.2);
          padding: 0.5rem 1rem;
          border-radius: 25px;
          font-weight: 600;
          margin-bottom: 1rem;
        }

        .status-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #fff;
          animation: pulse 2s infinite;
        }

        @keyframes pulse {
          0% { opacity: 1; }
          50% { opacity: 0.5; }
          100% { opacity: 1; }
        }

        .status-text {
          font-size: 1rem;
          margin: 0;
          opacity: 0.9;
          line-height: 1.6;
        }

        @media (max-width: 768px) {
          .material-handling {
            padding: 1rem;
          }
          
          .placeholder-card {
            padding: 2rem 1rem;
          }

          .placeholder-card h2 {
            font-size: 1.5rem;
          }
          
          .features-grid {
            grid-template-columns: 1fr;
            gap: 1rem;
          }

          .feature-item {
            padding: 1.5rem;
          }
        }
      `}</style>
    </div>
  );
}

export default MaterialHandling;