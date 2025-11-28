import React from 'react';

const { useState } = React;

function AdminDashboard({ t, onLogout, showNotification, onNavigate }) {
  const [hoveredCard, setHoveredCard] = useState(null);

  const menuItems = [
    {
      id: 'quotes',
      title: 'Teklif Yönetimi',
      description: 'Müşteri teklifleri ve hesaplamaları',
      icon: '📋',
      route: 'quotes',
      gradient: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
    },
    {
      id: 'settings',
      title: 'Ayarlar',
      description: 'Sistem ayarları ve parametreler',
      icon: '⚙️',
      route: 'settings',
      gradient: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)'
    },
    {
      id: 'production',
      title: 'Üretim Paneli',
      description: 'Üretim süreçlerini izle ve yönet',
      icon: '🏭',
      route: 'production',
      gradient: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)'
    },
    {
      id: 'materials',
      title: 'Malzeme Yönetimi',
      description: 'Envanter ve malzeme kaynakları',
      icon: '📦',
      route: 'materials',
      gradient: 'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)'
    }
  ];

  const handleMenuClick = (route) => {
    if (onNavigate) {
      onNavigate(route);
    }
  };

  return (
    <div className="admin-dashboard">
      
      {/* Menu Grid */}
      <div className="menu-grid">
        {menuItems.map((item) => (
          <div
            key={item.id}
            className={`menu-card ${hoveredCard === item.id ? 'hovered' : ''}`}
            style={{ background: item.gradient }}
            onClick={() => handleMenuClick(item.route)}
            onMouseEnter={() => setHoveredCard(item.id)}
            onMouseLeave={() => setHoveredCard(null)}
          >
            <div className="menu-icon">{item.icon}</div>
            <h3>{item.title}</h3>
            <p>{item.description}</p>
            <div className="card-overlay"></div>
          </div>
        ))}
      </div>

      {/* Footer Info */}
      <div className="dashboard-footer">
        <p>© 2025 BeePlan - Yönetim Sistemi v2.0</p>
      </div>

      <style jsx>{`
        .admin-dashboard {
          padding: 2rem;
          min-height: 100vh;
          background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
        }

        .menu-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
          gap: 2rem;
          max-width: 1200px;
          margin: 0 auto;
        }

        .menu-card {
          padding: 2rem;
          border-radius: 15px;
          color: white;
          cursor: pointer;
          transition: all 0.3s ease;
          text-align: center;
          min-height: 200px;
          display: flex;
          flex-direction: column;
          justify-content: center;
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
          position: relative;
          overflow: hidden;
          border: 1px solid rgba(255, 255, 255, 0.1);
        }

        .card-overlay {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(255, 255, 255, 0.1);
          opacity: 0;
          transition: opacity 0.3s ease;
          pointer-events: none;
        }

        .menu-card.hovered .card-overlay {
          opacity: 1;
        }

        .menu-card:hover {
          transform: translateY(-8px) scale(1.02);
          box-shadow: 0 25px 50px rgba(0, 0, 0, 0.3);
        }

        .menu-icon {
          font-size: 3.5rem;
          margin-bottom: 1rem;
          position: relative;
          z-index: 1;
          transition: transform 0.3s ease;
        }

        .menu-card:hover .menu-icon {
          transform: scale(1.1);
        }

        .menu-card h3 {
          font-size: 1.6rem;
          margin-bottom: 0.8rem;
          font-weight: 600;
          position: relative;
          z-index: 1;
        }

        .menu-card p {
          font-size: 1rem;
          opacity: 0.9;
          line-height: 1.5;
          position: relative;
          z-index: 1;
        }

        .dashboard-footer {
          text-align: center;
          margin-top: 3rem;
          padding: 1rem;
          color: #666;
          font-size: 0.9rem;
        }

        @media (max-width: 768px) {
          .admin-dashboard {
            padding: 1rem;
          }
          
          .dashboard-header {
            flex-direction: column;
            gap: 1rem;
            text-align: center;
            padding: 1rem;
          }
          
          .header-content h1 {
            font-size: 2rem;
          }
          
          .menu-grid {
            grid-template-columns: 1fr;
            gap: 1rem;
          }
          
          .menu-card {
            min-height: 160px;
            padding: 1.5rem;
          }
          
          .menu-icon {
            font-size: 2.5rem;
          }
        }
      `}</style>
    </div>
  );
}

export default AdminDashboard;