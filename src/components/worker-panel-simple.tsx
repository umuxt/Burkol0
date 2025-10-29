import { useState } from "react";
import { Play, CheckCircle, Clock, Users, AlertCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { toast } from "sonner@2.0.3";
import { useMES } from "../contexts/MESContext";
import { Input } from "./ui/input";
import { Label } from "./ui/label";

export function WorkerPanel() {
  const { workers, workOrders, updateOperationStatus, completePackage } = useMES();
  const [selectedWorkerId, setSelectedWorkerId] = useState<string>("");
  const [actualTime, setActualTime] = useState<{ [key: string]: number }>({});

  // Get operations assigned to selected worker
  const assignedOperations = workOrders.flatMap((wo) =>
    wo.operations
      .filter((op) => op.assignedWorkerId === selectedWorkerId)
      .map((op) => ({
        ...op,
        workOrderId: wo.id,
        workOrderName: wo.name,
        productName: wo.productName,
        packageSize: wo.packageSize,
        completedPackages: wo.completedPackages,
        totalPackages: wo.totalPackages,
      }))
  );

  const getStatusColor = (status: string) => {
    switch (status) {
      case "pending":
        return "bg-muted text-muted-foreground";
      case "in-progress":
        return "bg-blue-500/10 text-blue-700 dark:text-blue-400";
      case "completed":
        return "bg-green-500/10 text-green-700 dark:text-green-400";
      default:
        return "bg-muted text-muted-foreground";
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "pending":
        return "Bekliyor";
      case "in-progress":
        return "Devam Ediyor";
      case "completed":
        return "Tamamlandı";
      default:
        return status;
    }
  };

  const handleStart = (workOrderId: string, operationId: string) => {
    updateOperationStatus(workOrderId, operationId, "in-progress");
    toast.success("Operasyon başlatıldı");
  };

  const handleComplete = (workOrderId: string, operationId: string, opKey: string) => {
    const time = actualTime[opKey] || 0;
    if (time <= 0) {
      toast.error("Lütfen gerçekleşen süreyi girin");
      return;
    }
    updateOperationStatus(workOrderId, operationId, "completed", time);
    toast.success("Operasyon tamamlandı");
    setActualTime((prev) => ({ ...prev, [opKey]: 0 }));
  };

  const handleCompletePackage = (workOrderId: string) => {
    completePackage(workOrderId);
    toast.success("Paket tamamlandı!");
  };

  return (
    <div className="p-6 space-y-6" data-guide="worker-header">
      <div>
        <h1>Worker Panel</h1>
        <p className="text-muted-foreground">
          Operatör arayüzü - Atanan görevlerinizi görüntüleyin ve tamamlayın
        </p>
      </div>

      {/* Worker Selection */}
      <Card data-guide="worker-operator-select">
        <CardHeader>
          <CardTitle className="text-sm">Select Operator</CardTitle>
        </CardHeader>
        <CardContent>
          <Select value={selectedWorkerId} onValueChange={setSelectedWorkerId}>
            <SelectTrigger>
              <SelectValue placeholder="Choose your name" />
            </SelectTrigger>
            <SelectContent>
              {workers.map((worker) => (
                <SelectItem key={worker.id} value={worker.id}>
                  {worker.name} - {worker.shift} Shift
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* Assigned Operations */}
      {selectedWorkerId && (
        <div className="space-y-4">
          <h2>My Assigned Operations ({assignedOperations.length})</h2>

          {assignedOperations.length === 0 && (
            <Card>
              <CardContent className="pt-6">
                <div className="text-center text-muted-foreground py-8">
                  <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Size henüz atanmış operasyon bulunmuyor.</p>
                </div>
              </CardContent>
            </Card>
          )}

          {assignedOperations.map((op) => {
            const opKey = `${op.workOrderId}-${op.id}`;
            const isInProgress = op.status === "in-progress";
            const isCompleted = op.status === "completed";
            const isPending = op.status === "pending";

            return (
              <Card key={opKey}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <CardTitle>{op.operationName}</CardTitle>
                      <div className="mt-1 flex flex-wrap gap-2 text-sm text-muted-foreground">
                        <span>{op.workOrderName}</span>
                        <span>•</span>
                        <span>{op.productName}</span>
                        {op.stationName && (
                          <>
                            <span>•</span>
                            <span>{op.stationName}</span>
                          </>
                        )}
                      </div>
                    </div>
                    <Badge className={getStatusColor(op.status)}>
                      {getStatusLabel(op.status)}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Package Progress */}
                  {op.totalPackages > 0 && (
                    <div className="rounded-lg border bg-card p-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium">Package Progress</span>
                        <span className="text-sm text-muted-foreground">
                          {op.completedPackages} / {op.totalPackages} paket
                        </span>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden mb-3">
                        <div
                          className="h-full bg-primary transition-all duration-300"
                          style={{
                            width: `${(op.completedPackages / op.totalPackages) * 100}%`,
                          }}
                        />
                      </div>
                      {op.completedPackages < op.totalPackages && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full"
                          onClick={() => handleCompletePackage(op.workOrderId)}
                          disabled={op.status !== "in-progress"}
                        >
                          <CheckCircle className="mr-2 h-4 w-4" />
                          Paket Tamamla ({op.packageSize} adet)
                        </Button>
                      )}
                    </div>
                  )}

                  {/* Operation Info */}
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="flex items-center gap-2 rounded-lg bg-muted p-3">
                      <Clock className="h-5 w-5 text-muted-foreground" />
                      <div className="flex-1">
                        <div className="text-xs text-muted-foreground">
                          Tahmini Süre
                        </div>
                        <div className="text-sm">{op.estimatedTime} dakika</div>
                      </div>
                    </div>
                    {op.actualTime && (
                      <div className="flex items-center gap-2 rounded-lg bg-muted p-3">
                        <CheckCircle className="h-5 w-5 text-green-600" />
                        <div className="flex-1">
                          <div className="text-xs text-muted-foreground">
                            Gerçekleşen Süre
                          </div>
                          <div className="text-sm">{op.actualTime} dakika</div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Action Buttons */}
                  {isPending && (
                    <Button
                      size="lg"
                      className="w-full"
                      onClick={() => handleStart(op.workOrderId, op.id)}
                    >
                      <Play className="mr-2 h-5 w-5" />
                      Start Work
                    </Button>
                  )}

                  {isInProgress && (
                    <div className="space-y-3">
                      <div className="space-y-2">
                        <Label htmlFor={`time-${opKey}`}>
                          Gerçekleşen Süre (dakika) *
                        </Label>
                        <Input
                          id={`time-${opKey}`}
                          type="number"
                          min="1"
                          value={actualTime[opKey] || ""}
                          onChange={(e) =>
                            setActualTime((prev) => ({
                              ...prev,
                              [opKey]: parseInt(e.target.value) || 0,
                            }))
                          }
                          placeholder="Örn: 45"
                        />
                      </div>
                      <Button
                        size="lg"
                        className="w-full"
                        onClick={() => handleComplete(op.workOrderId, op.id, opKey)}
                      >
                        <CheckCircle className="mr-2 h-5 w-5" />
                        Complete Operation
                      </Button>
                    </div>
                  )}

                  {isCompleted && (
                    <div className="rounded-lg bg-green-500/10 p-4 text-center">
                      <CheckCircle className="h-8 w-8 mx-auto mb-2 text-green-600" />
                      <p className="text-sm text-green-700 dark:text-green-400">
                        Bu operasyon tamamlandı
                      </p>
                      {op.completedAt && (
                        <p className="text-xs text-muted-foreground mt-1">
                          {new Date(op.completedAt).toLocaleString()}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Started/Completed Info */}
                  {op.startedAt && !isCompleted && (
                    <div className="text-xs text-muted-foreground flex items-center gap-2">
                      <Clock className="h-3 w-3" />
                      Başlangıç: {new Date(op.startedAt).toLocaleTimeString()}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
