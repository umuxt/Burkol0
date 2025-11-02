import { useState } from "react";
import {
  ClipboardList,
  CheckCircle2,
  TrendingUp,
  Play,
  Pause,
  Clock,
  CheckCircle,
  Users,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../../../shared/components/ui/card";
import { Badge } from "../../../shared/components/ui/badge";
import { Progress } from "../../../shared/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../../shared/components/ui/table";
import { useMES } from "../contexts/MESContext";

export function ProductionDashboard() {
  const { workOrders, operations, workers, stations, availableSkills } = useMES();
  const [selectedWorkOrderId, setSelectedWorkOrderId] = useState<string | null>(
    workOrders.length > 0 ? workOrders[0].id : null
  );

  // Check if initial setup is complete
  const isSetupComplete = 
    availableSkills.length > 0 && 
    stations.length > 0 && 
    operations.length > 0 && 
    workers.length > 0;

  const selectedWorkOrder = workOrders.find(
    (wo) => wo.id === selectedWorkOrderId
  );

  // Calculate KPIs from real work orders
  const kpiData = {
    openOrders: workOrders.filter((wo) => wo.status !== "completed").length,
    completedToday: workOrders.filter(
      (wo) =>
        wo.status === "completed" &&
        wo.completedAt &&
        new Date(wo.completedAt).toDateString() === new Date().toDateString()
    ).length,
    totalOperations: workOrders.reduce(
      (sum, wo) => sum + wo.operations.length,
      0
    ),
    completedOperations: workOrders.reduce(
      (sum, wo) =>
        sum + wo.operations.filter((op) => op.status === "completed").length,
      0
    ),
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "planned":
        return "bg-muted text-muted-foreground";
      case "in-progress":
        return "bg-blue-500/10 text-blue-700 dark:text-blue-400";
      case "on-hold":
        return "bg-orange-500/10 text-orange-700 dark:text-orange-400";
      case "completed":
        return "bg-green-500/10 text-green-700 dark:text-green-400";
      default:
        return "bg-muted text-muted-foreground";
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "planned":
        return "Planlandı";
      case "in-progress":
        return "Devam Ediyor";
      case "on-hold":
        return "Beklemede";
      case "completed":
        return "Tamamlandı";
      default:
        return status;
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div data-guide="dashboard-header">
        <h1>Production Dashboard</h1>
        <p className="text-muted-foreground">
          Üretim takibi ve KPI izleme
        </p>
      </div>

      {/* Setup Warning Banner */}
      {!isSetupComplete && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500 text-white flex-shrink-0 mt-1">
                <ClipboardList className="h-4 w-4" />
              </div>
              <div className="flex-1">
                <h3 className="font-medium text-amber-900 dark:text-amber-100 mb-1">
                  Initial Setup Required
                </h3>
                <p className="text-sm text-amber-800 dark:text-amber-200 mb-3">
                  Before you can create production plans, please complete the system configuration. 
                  The Setup Guide will walk you through defining skills, stations, operations, and workers.
                </p>
                <div className="flex flex-wrap gap-2 text-xs">
                  {availableSkills.length === 0 && (
                    <Badge variant="outline" className="bg-background">
                      ⚠️ No Skills Defined
                    </Badge>
                  )}
                  {stations.length === 0 && (
                    <Badge variant="outline" className="bg-background">
                      ⚠️ No Stations Defined
                    </Badge>
                  )}
                  {operations.length === 0 && (
                    <Badge variant="outline" className="bg-background">
                      ⚠️ No Operations Defined
                    </Badge>
                  )}
                  {workers.length === 0 && (
                    <Badge variant="outline" className="bg-background">
                      ⚠️ No Workers Defined
                    </Badge>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card data-guide="kpi-open">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm">Open Orders</CardTitle>
            <ClipboardList className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl">{kpiData.openOrders}</div>
            <p className="text-muted-foreground text-xs mt-1">
              Active work orders
            </p>
          </CardContent>
        </Card>

        <Card data-guide="kpi-completed">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm">Completed Today</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl">{kpiData.completedToday}</div>
            <p className="text-muted-foreground text-xs mt-1">
              Work orders finished
            </p>
          </CardContent>
        </Card>

        <Card data-guide="kpi-operations">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm">Total Operations</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl">{kpiData.totalOperations}</div>
            <p className="text-muted-foreground text-xs mt-1">
              Operations defined
            </p>
          </CardContent>
        </Card>

        <Card data-guide="kpi-efficiency">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm">Completed Operations</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl">{kpiData.completedOperations}</div>
            <p className="text-muted-foreground text-xs mt-1">
              Operations finished
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Work Orders Table */}
      <Card className="mb-6" data-guide="work-orders-table">
        <CardHeader>
          <CardTitle>Work Orders</CardTitle>
        </CardHeader>
        <CardContent>
          {workOrders.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <ClipboardList className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Henüz work order oluşturulmamış.</p>
              <p className="text-sm mt-2">
                Plan Designer'da bir plan oluşturup yayınlayın.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>WO ID</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead>Progress</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {workOrders.map((wo, index) => {
                  const completedOps = wo.operations.filter(
                    (op) => op.status === "completed"
                  ).length;
                  const progress =
                    wo.operations.length > 0
                      ? (completedOps / wo.operations.length) * 100
                      : 0;
                  return (
                    <TableRow
                      key={wo.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => setSelectedWorkOrderId(wo.id)}
                      data-guide={index === 0 ? "wo-row" : undefined}
                    >
                      <TableCell>{wo.name}</TableCell>
                      <TableCell>{wo.productName}</TableCell>
                      <TableCell
                        className="w-48"
                        data-guide={index === 0 ? "wo-progress" : undefined}
                      >
                        <div className="flex items-center gap-2">
                          <Progress value={progress} className="h-2" />
                          <span className="text-muted-foreground text-xs">
                            {Math.round(progress)}%
                          </span>
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">
                          {completedOps} / {wo.operations.length} ops
                        </div>
                        {wo.totalPackages > 0 && (
                          <div className="text-xs text-muted-foreground mt-1">
                            📦 {wo.completedPackages} / {wo.totalPackages} packages
                          </div>
                        )}
                      </TableCell>
                      <TableCell
                        data-guide={index === 0 ? "wo-status" : undefined}
                      >
                        <Badge className={getStatusColor(wo.status)}>
                          {getStatusLabel(wo.status)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {wo.createdAt
                          ? new Date(wo.createdAt).toLocaleDateString()
                          : "N/A"}
                      </TableCell>
                      <TableCell>
                        {wo.status === "in-progress" && (
                          <Play className="h-4 w-4 text-blue-500" />
                        )}
                        {wo.status === "on-hold" && (
                          <Pause className="h-4 w-4 text-orange-500" />
                        )}
                        {wo.status === "completed" && (
                          <CheckCircle className="h-4 w-4 text-green-500" />
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Operation Details */}
      {selectedWorkOrder && selectedWorkOrder.operations.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between">
              <div>
                <CardTitle>
                  Operation Details - {selectedWorkOrder.name}:{" "}
                  {selectedWorkOrder.productName}
                </CardTitle>
                {selectedWorkOrder.totalPackages > 0 && (
                  <p className="text-sm text-muted-foreground mt-2">
                    Package Progress: {selectedWorkOrder.completedPackages} / {selectedWorkOrder.totalPackages} completed
                    ({Math.round((selectedWorkOrder.completedPackages / selectedWorkOrder.totalPackages) * 100)}%)
                  </p>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {selectedWorkOrder.operations.map((op) => {
                return (
                  <div
                    key={op.id}
                    className="rounded-lg border border-border bg-muted/30 p-4"
                  >
                    <div className="mb-3 flex items-start justify-between">
                      <div>
                        <h4>{op.operationName}</h4>
                        <p className="text-muted-foreground text-sm flex items-center gap-2">
                          {op.stationName && <span>{op.stationName}</span>}
                          {op.assignedWorkerName && (
                            <>
                              <span>•</span>
                              <Users className="h-3 w-3 inline" />
                              <span>{op.assignedWorkerName}</span>
                            </>
                          )}
                        </p>
                      </div>
                      <Badge
                        variant={
                          op.status === "completed"
                            ? "default"
                            : op.status === "in-progress"
                            ? "secondary"
                            : "outline"
                        }
                      >
                        {op.status === "pending" && "Bekliyor"}
                        {op.status === "in-progress" && "Devam Ediyor"}
                        {op.status === "completed" && "Tamamlandı"}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground flex items-center gap-2">
                        <Clock className="h-3 w-3" />
                        Estimated: {op.estimatedTime}min
                        {op.actualTime && ` • Actual: ${op.actualTime}min`}
                      </span>
                      {op.status === "completed" && op.completedAt && (
                        <span className="text-green-600 text-xs">
                          Completed at{" "}
                          {new Date(op.completedAt).toLocaleTimeString()}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
