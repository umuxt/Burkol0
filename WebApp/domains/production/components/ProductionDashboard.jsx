import { useState, useEffect } from 'react';
import {
  ClipboardList,
  CheckCircle2,
  TrendingUp,
  Play,
  Pause,
  Clock,
  CheckCircle,
  Users,
} from '../../../shared/components/Icons.jsx';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Progress } from './ui/progress';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from './ui/table';
import { useMES } from '../contexts/MESContext.jsx';

export function ProductionDashboard() {
  const { workOrders, operations, workers, stations, loading, error } = useMES();
  const [selectedWorkOrderId, setSelectedWorkOrderId] = useState(null);

  useEffect(() => {
    if (workOrders.length > 0 && !selectedWorkOrderId) {
      setSelectedWorkOrderId(workOrders[0].id);
    }
  }, [workOrders, selectedWorkOrderId]);

  // Loading state
  if (loading) {
    return (
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">MES sistemi yükleniyor...</p>
          </div>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="text-red-600 mb-4">
              <ClipboardList className="h-12 w-12 mx-auto" />
            </div>
            <p className="text-red-600 font-medium">Sistem Hatası</p>
            <p className="text-gray-600 mt-2">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  // Check if initial setup is complete
  const isSetupComplete = 
    stations.length > 0 && 
    operations.length > 0 && 
    workers.length > 0;

  const selectedWorkOrder = workOrders.find(
    (wo) => wo.id === selectedWorkOrderId
  );

  // Calculate KPIs from real work orders
  const kpiData = {
    openOrders: workOrders.filter((wo) => wo.status !== 'completed').length,
    completedToday: workOrders.filter(
      (wo) =>
        wo.status === 'completed' &&
        wo.updatedAt &&
        new Date(wo.updatedAt).toDateString() === new Date().toDateString()
    ).length,
    totalOperations: workOrders.reduce(
      (sum, wo) => sum + (wo.operations?.length || 0),
      0
    ),
    completedOperations: workOrders.reduce(
      (sum, wo) =>
        sum + (wo.operations?.filter((op) => op.status === 'completed').length || 0),
      0
    ),
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'draft':
        return 'bg-gray-100 text-gray-700';
      case 'active':
        return 'bg-blue-100 text-blue-700';
      case 'on-hold':
        return 'bg-orange-100 text-orange-700';
      case 'completed':
        return 'bg-green-100 text-green-700';
      default:
        return 'bg-gray-100 text-gray-700';
    }
  };

  const getStatusLabel = (status) => {
    switch (status) {
      case 'draft':
        return 'Taslak';
      case 'active':
        return 'Aktif';
      case 'on-hold':
        return 'Beklemede';
      case 'completed':
        return 'Tamamlandı';
      default:
        return status;
    }
  };

  const getOperationStatusLabel = (status) => {
    switch (status) {
      case 'not-started':
        return 'Başlamadı';
      case 'in-progress':
        return 'Devam Ediyor';
      case 'completed':
        return 'Tamamlandı';
      case 'on-hold':
        return 'Beklemede';
      default:
        return status;
    }
  };

  // Setup incomplete message
  if (!isSetupComplete) {
    return (
      <div className="p-6 space-y-6">
        <div className="text-center py-12">
          <ClipboardList className="h-16 w-16 text-gray-400 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">
            MES Sistemi Kurulum Gerekiyor
          </h2>
          <p className="text-gray-600 mb-6">
            Sistem kullanımına başlamadan önce temel verilerin tanımlanması gerekiyor.
          </p>
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-left max-w-md mx-auto">
            <h3 className="font-medium text-blue-900 mb-2">Gerekli Kurulum Adımları:</h3>
            <ul className="text-sm text-blue-800 space-y-1">
              {stations.length === 0 && <li>• İstasyon tanımlamaları</li>}
              {operations.length === 0 && <li>• Operasyon tanımlamaları</li>}
              {workers.length === 0 && <li>• Çalışan tanımlamaları</li>}
            </ul>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Üretim Dashboard</h1>
        <p className="text-gray-600">
          Üretim takibi ve KPI izleme
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Açık Siparişler</CardTitle>
            <ClipboardList className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{kpiData.openOrders}</div>
            <p className="text-xs text-muted-foreground">Devam eden üretimler</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Günlük Tamamlanan</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{kpiData.completedToday}</div>
            <p className="text-xs text-muted-foreground">Bugün tamamlanan</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Toplam Operasyonlar</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{kpiData.totalOperations}</div>
            <p className="text-xs text-muted-foreground">Tüm iş emirlerinde</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Tamamlanan Operasyonlar</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{kpiData.completedOperations}</div>
            <p className="text-xs text-muted-foreground">
              {kpiData.totalOperations > 0 
                ? `${Math.round((kpiData.completedOperations / kpiData.totalOperations) * 100)}% tamamlandı`
                : 'Henüz operasyon yok'
              }
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Work Orders Table */}
      <Card>
        <CardHeader>
          <CardTitle>İş Emirleri</CardTitle>
        </CardHeader>
        <CardContent>
          {workOrders.length === 0 ? (
            <div className="text-center py-8">
              <ClipboardList className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600">Henüz iş emri bulunmuyor</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>İş Emri</TableHead>
                  <TableHead>Öncelik</TableHead>
                  <TableHead>Durum</TableHead>
                  <TableHead>İlerleme</TableHead>
                  <TableHead>Operasyonlar</TableHead>
                  <TableHead>Son Güncelleme</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {workOrders.map((workOrder) => (
                  <TableRow 
                    key={workOrder.id}
                    className={`cursor-pointer ${selectedWorkOrderId === workOrder.id ? 'bg-blue-50' : ''}`}
                    onClick={() => setSelectedWorkOrderId(workOrder.id)}
                  >
                    <TableCell className="font-medium">
                      <div>
                        <div className="font-semibold">{workOrder.title}</div>
                        <div className="text-sm text-gray-600">{workOrder.description}</div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        className={
                          workOrder.priority === 'high'
                            ? 'bg-red-100 text-red-700'
                            : workOrder.priority === 'medium'
                            ? 'bg-yellow-100 text-yellow-700'
                            : 'bg-green-100 text-green-700'
                        }
                      >
                        {workOrder.priority === 'high' ? 'Yüksek' :
                         workOrder.priority === 'medium' ? 'Orta' : 'Düşük'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge className={getStatusColor(workOrder.status)}>
                        {getStatusLabel(workOrder.status)}
                      </Badge>
                    </TableCell>
                    <TableCell className="w-32">
                      <div className="space-y-1">
                        <Progress value={workOrder.progress || 0} className="h-2" />
                        <div className="text-xs text-gray-600 text-center">
                          {workOrder.progress || 0}%
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        {workOrder.operations?.length || 0} operasyon
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm text-gray-600">
                        {workOrder.updatedAt 
                          ? new Date(workOrder.updatedAt).toLocaleDateString('tr-TR')
                          : 'Bilinmiyor'
                        }
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Selected Work Order Details */}
      {selectedWorkOrder && (
        <Card>
          <CardHeader>
            <CardTitle>İş Emri Detayları: {selectedWorkOrder.title}</CardTitle>
          </CardHeader>
          <CardContent>
            {selectedWorkOrder.operations?.length ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Operasyon</TableHead>
                    <TableHead>Atanan Çalışan</TableHead>
                    <TableHead>İstasyon</TableHead>
                    <TableHead>Durum</TableHead>
                    <TableHead>Süre (dk)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {selectedWorkOrder.operations.map((operation, index) => {
                    const operationDetail = operations.find(op => op.id === operation.operationId);
                    const worker = workers.find(w => w.id === operation.assignedWorkerId);
                    const station = stations.find(s => s.id === operation.assignedStationId);
                    
                    return (
                      <TableRow key={operation.id || index}>
                        <TableCell>
                          <div>
                            <div className="font-medium">
                              {operationDetail?.name || 'Bilinmeyen Operasyon'}
                            </div>
                            <div className="text-sm text-gray-600">
                              {operationDetail?.description}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          {worker ? (
                            <div className="flex items-center gap-2">
                              <Users className="h-4 w-4" />
                              <span>{worker.name}</span>
                            </div>
                          ) : (
                            <span className="text-gray-400">Atanmamış</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {station?.name || <span className="text-gray-400">Atanmamış</span>}
                        </TableCell>
                        <TableCell>
                          <Badge className={getStatusColor(operation.status)}>
                            {getOperationStatusLabel(operation.status)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">
                            {operation.actualTime ? (
                              <span className="font-medium">{operation.actualTime} dk</span>
                            ) : (
                              <span className="text-gray-600">{operation.estimatedTime} dk (tahmini)</span>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            ) : (
              <div className="text-center py-8">
                <Clock className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600">Bu iş emrinde henüz operasyon tanımlanmamış</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}