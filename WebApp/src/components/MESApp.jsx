import React from 'react';
import { MESProvider } from '../contexts/MESContext.jsx';
import { ProductionDashboard } from '../../domains/production/components/production-dashboard-clean';

// Copy UI components we need from original project
import { Button } from '../../shared/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../shared/components/ui/card';
import { Badge } from '../../shared/components/ui/badge';
import { Progress } from '../../shared/components/ui/progress';

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
            Manufacturing Execution System - BeePlan
          </p>
        </div>
      </div>

      {/* MES Content */}
      <div className="max-w-7xl mx-auto p-6">
        <MESProvider>
          <ProductionDashboard />
        </MESProvider>
      </div>
    </div>
  );
}

export default MESApp;