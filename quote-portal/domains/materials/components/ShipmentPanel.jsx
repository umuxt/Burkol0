import React, { useState } from 'react';

export default function ShipmentPanel() {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState('all');

  const handleSearchChange = (e) => {
    setSearchTerm(e.target.value);
  };

  // No dummy data, materials will be empty for now
  const materials = []; // Empty array
  const filteredMaterials = []; // Empty array

  return (
    <div className="shipment-panel-content">
      {/* Filter Bar */}
      <div className="mes-filter-bar" style={{ position: 'relative', marginBottom: '1rem' }}>
         <div className="mes-filter-controls">
            <input 
              type="text" 
              placeholder="Malzeme Kodu ile Ara..." 
              value={searchTerm}
              onChange={handleSearchChange}
              className="mes-filter-input is-compact"
            />
         </div>
      </div>

      {/* Main Content Area */}
      <div className="materials-container">
        <div className="materials-table-container">
          <section className="materials-table">
            <div className="materials-tabs">
              <button
                className={`tab-button ${activeTab === 'all' ? 'active' : ''}`}
                onClick={() => setActiveTab('all')}
              >
                Tümünü Göster
                <span className="tab-count">{filteredMaterials.length}</span>
              </button>
            </div>
            
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th style={{ minWidth: '120px', textAlign: 'left' }}>Malzeme Kodu</th>
                  </tr>
                </thead>
                <tbody>
                   {/* Render nothing or an empty state as there's no data */}
                   {filteredMaterials.length === 0 && (
                     <tr>
                       <td style={{ padding: '40px 20px', textAlign: 'center', color: '#6b7280' }}>
                          Malzeme bulunamadı.
                       </td>
                     </tr>
                   )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
