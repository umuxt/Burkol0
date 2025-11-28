// MES System Main Entry Point
import React from 'react';
import ReactDOM from 'react-dom/client';
import { MESProvider } from './contexts/MESContext.jsx';
import { ProductionDashboard } from '../domains/production/components/ProductionDashboard.jsx';
import './styles/main.css';

// MES Application Component
function MESApp() {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* MES Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-2xl font-semibold text-gray-900">
            Üretim Takip Sistemi (MES)
          </h1>
          <p className="text-sm text-gray-600 mt-1">
            Manufacturing Execution System - Burkol Metal
          </p>
        </div>
      </div>

      {/* MES Content */}
      <div className="max-w-7xl mx-auto">
        <MESProvider>
          <ProductionDashboard />
        </MESProvider>
      </div>
    </div>
  );
}

// Initialize the app
const root = ReactDOM.createRoot(document.getElementById('mes-app-root'));
root.render(<MESApp />);

console.log('✅ MES Application initialized successfully');