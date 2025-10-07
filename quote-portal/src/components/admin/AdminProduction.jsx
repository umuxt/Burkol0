import React from 'react';

function AdminProduction({ t, onLogout, showNotification, onNavigate }) {
  const handleBack = () => {
    if (onNavigate) {
      onNavigate('dashboard');
    }
  };

  // Mock production data
  const productionStats = {
    activeJobs: 12,
    completedToday: 8,
    pendingApproval: 3,
    totalCapacity: 95
  };

  const recentJobs = [
    {
      id: 'PRD-001',
      customer: 'Mehmet Demir',
      project: 'Levha Kesim İşi',
      status: 'İşlemde',
      progress: 75,
      deadline: '2025-10-08'
    },
    {
      id: 'PRD-002',
      customer: 'Ahmet Yılmaz',
      project: 'Köşebent Projesi',
      status: 'Beklemede',
      progress: 30,
      deadline: '2025-10-10'
    },
    {
      id: 'PRD-003',
      customer: 'Umut Co',
      project: 'Umut büküm',
      status: 'Tamamlandı',
      progress: 100,
      deadline: '2025-10-05'
    }
  ];

  const getStatusColor = (status) => {
    switch (status) {
      case 'İşlemde': return '#17a2b8';
      case 'Beklemede': return '#ffc107';
      case 'Tamamlandı': return '#28a745';
      default: return '#6c757d';
    }
  };

  return (
    <div className="admin-production">
      
      <div className="content-container">
        {/* Production Statistics */}
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-icon">🏭</div>
            <div className="stat-content">
              <h3>{productionStats.activeJobs}</h3>
              <p>Aktif İşler</p>
            </div>
          </div>
          
          <div className="stat-card">
            <div className="stat-icon">✅</div>
            <div className="stat-content">
              <h3>{productionStats.completedToday}</h3>
              <p>Bugün Tamamlanan</p>
            </div>
          </div>
          
          <div className="stat-card">
            <div className="stat-icon">⏳</div>
            <div className="stat-content">
              <h3>{productionStats.pendingApproval}</h3>
              <p>Onay Bekleyen</p>
            </div>
          </div>
          
          <div className="stat-card">
            <div className="stat-icon">⚡</div>
            <div className="stat-content">
              <h3>%{productionStats.totalCapacity}</h3>
              <p>Kapasite Kullanımı</p>
            </div>
          </div>
        </div>

        {/* Recent Production Jobs */}
        <div className="production-card">
          <div className="card-header">
            <h2>Son Üretim İşleri</h2>
            <button className="refresh-btn">🔄 Yenile</button>
          </div>
          
          <div className="jobs-table">
            <div className="table-header">
              <div className="header-cell">İş No</div>
              <div className="header-cell">Müşteri</div>
              <div className="header-cell">Proje</div>
              <div className="header-cell">Durum</div>
              <div className="header-cell">İlerleme</div>
              <div className="header-cell">Termin</div>
              <div className="header-cell">İşlemler</div>
            </div>
            
            {recentJobs.map((job) => (
              <div key={job.id} className="table-row">
                <div className="table-cell">
                  <strong>{job.id}</strong>
                </div>
                <div className="table-cell">{job.customer}</div>
                <div className="table-cell">{job.project}</div>
                <div className="table-cell">
                  <span 
                    className="status-badge"
                    style={{ backgroundColor: getStatusColor(job.status) }}
                  >
                    {job.status}
                  </span>
                </div>
                <div className="table-cell">
                  <div className="progress-container">
                    <div 
                      className="progress-bar"
                      style={{ width: `${job.progress}%` }}
                    ></div>
                    <span className="progress-text">{job.progress}%</span>
                  </div>
                </div>
                <div className="table-cell">{job.deadline}</div>
                <div className="table-cell">
                  <div className="action-buttons">
                    <button className="action-btn">👁️</button>
                    <button className="action-btn">✏️</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="main-actions">
          <button className="main-action-btn primary">
            <span className="btn-icon">➕</span>
            Yeni İş Ekle
          </button>
          <button className="main-action-btn secondary">
            <span className="btn-icon">📊</span>
            Üretim Raporu
          </button>
          <button className="main-action-btn secondary">
            <span className="btn-icon">⚙️</span>
            Makine Durumu
          </button>
        </div>
      </div>

      <style jsx>{`
        .admin-production {
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

        .content-container {
          max-width: 1400px;
          margin: 0 auto;
        }

        .stats-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
          gap: 1.5rem;
          margin-bottom: 2rem;
        }

        .stat-card {
          background: rgba(255, 255, 255, 0.9);
          backdrop-filter: blur(10px);
          border: 1px solid rgba(255, 255, 255, 0.2);
          border-radius: 15px;
          padding: 2rem;
          display: flex;
          align-items: center;
          gap: 1rem;
          box-shadow: 0 8px 25px rgba(0, 0, 0, 0.1);
          transition: all 0.3s ease;
        }

        .stat-card:hover {
          transform: translateY(-5px);
          box-shadow: 0 15px 35px rgba(0, 0, 0, 0.15);
        }

        .stat-icon {
          font-size: 2.5rem;
          opacity: 0.8;
        }

        .stat-content h3 {
          font-size: 2rem;
          color: #333;
          margin: 0 0 0.25rem 0;
          font-weight: 700;
        }

        .stat-content p {
          font-size: 0.9rem;
          color: #666;
          margin: 0;
          font-weight: 500;
        }

        .production-card {
          background: rgba(255, 255, 255, 0.95);
          backdrop-filter: blur(10px);
          border: 1px solid rgba(255, 255, 255, 0.2);
          border-radius: 20px;
          padding: 2rem;
          box-shadow: 0 20px 40px rgba(0, 0, 0, 0.1);
          margin-bottom: 2rem;
        }

        .card-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 2rem;
          padding-bottom: 1rem;
          border-bottom: 2px solid rgba(0, 0, 0, 0.1);
        }

        .card-header h2 {
          font-size: 1.5rem;
          color: #333;
          margin: 0;
          font-weight: 600;
        }

        .refresh-btn {
          padding: 0.5rem 1rem;
          background: linear-gradient(135deg, #17a2b8 0%, #138496 100%);
          color: white;
          border: none;
          border-radius: 8px;
          cursor: pointer;
          font-size: 0.9rem;
          transition: all 0.3s ease;
        }

        .refresh-btn:hover {
          transform: translateY(-2px);
        }

        .jobs-table {
          width: 100%;
        }

        .table-header {
          display: grid;
          grid-template-columns: 100px 1fr 1fr 120px 150px 100px 100px;
          gap: 1rem;
          padding: 1rem;
          background: rgba(0, 0, 0, 0.05);
          border-radius: 10px;
          margin-bottom: 0.5rem;
        }

        .header-cell {
          font-weight: 600;
          color: #333;
          font-size: 0.9rem;
        }

        .table-row {
          display: grid;
          grid-template-columns: 100px 1fr 1fr 120px 150px 100px 100px;
          gap: 1rem;
          padding: 1rem;
          border-bottom: 1px solid rgba(0, 0, 0, 0.1);
          transition: all 0.3s ease;
        }

        .table-row:hover {
          background: rgba(0, 0, 0, 0.02);
        }

        .table-cell {
          display: flex;
          align-items: center;
          font-size: 0.9rem;
          color: #333;
        }

        .status-badge {
          padding: 0.25rem 0.75rem;
          border-radius: 12px;
          color: white;
          font-size: 0.75rem;
          font-weight: 600;
          text-transform: uppercase;
        }

        .progress-container {
          position: relative;
          width: 100%;
          height: 20px;
          background: rgba(0, 0, 0, 0.1);
          border-radius: 10px;
          overflow: hidden;
        }

        .progress-bar {
          height: 100%;
          background: linear-gradient(135deg, #28a745 0%, #20c997 100%);
          transition: width 0.3s ease;
        }

        .progress-text {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          font-size: 0.75rem;
          font-weight: 600;
          color: #333;
        }

        .action-buttons {
          display: flex;
          gap: 0.5rem;
        }

        .action-btn {
          padding: 0.5rem;
          background: rgba(0, 0, 0, 0.1);
          border: none;
          border-radius: 6px;
          cursor: pointer;
          font-size: 0.9rem;
          transition: all 0.3s ease;
        }

        .action-btn:hover {
          background: rgba(0, 0, 0, 0.2);
          transform: scale(1.1);
        }

        .main-actions {
          display: flex;
          justify-content: center;
          gap: 1rem;
          flex-wrap: wrap;
        }

        .main-action-btn {
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

        .main-action-btn.primary {
          background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%);
          color: white;
        }

        .main-action-btn.secondary {
          background: rgba(255, 255, 255, 0.9);
          color: #333;
          border: 1px solid rgba(0, 0, 0, 0.1);
        }

        .main-action-btn:hover {
          transform: translateY(-3px);
          box-shadow: 0 12px 25px rgba(0, 0, 0, 0.15);
        }

        .btn-icon {
          font-size: 1.1rem;
        }

        @media (max-width: 768px) {
          .admin-production {
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
          
          .stats-grid {
            grid-template-columns: 1fr;
            gap: 1rem;
          }

          .production-card {
            padding: 1rem;
          }

          .table-header,
          .table-row {
            grid-template-columns: 1fr;
            gap: 0.5rem;
          }

          .header-cell,
          .table-cell {
            padding: 0.5rem;
            border-bottom: 1px solid rgba(0, 0, 0, 0.1);
          }

          .main-actions {
            flex-direction: column;
            align-items: center;
          }

          .main-action-btn {
            width: 100%;
            max-width: 300px;
            justify-content: center;
          }
        }
      `}</style>
    </div>
  );
}

export default AdminProduction;