import { useState, useRef, useCallback, useEffect } from "react";
import {
  Save,
  Send,
  FileText,
  AlertCircle,
  Users,
  Clock,
  Trash2,
  Settings,
  Grid3x3,
  GripVertical,
  Package,
  CheckCircle2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../../../shared/components/ui/card";
import { Button } from "../../../shared/components/ui/button";
import { Input } from "../../../shared/components/ui/input";
import { Label } from "../../../shared/components/ui/label";
import { Badge } from "../../../shared/components/ui/badge";
import { Slider } from "../../../shared/components/ui/slider";
import { Switch } from "../../../shared/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../../shared/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "../../../shared/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../../shared/components/ui/table";
import { toast } from "sonner";
import { useMES, WorkOrderOperation } from "../../../src/contexts/MESContext";
import { useMaterials } from "../../../hooks/useFirebaseMaterials.js";

interface Material {
  id: string;
  name: string;
  required: number;
  available: number;
  unit: string;
}

interface OperationNode {
  id: string;
  name: string;
  operationId: string; // Link to master operation
  type: "operation";
  operationType: string;
  x: number;
  y: number;
  estimatedTime: number;
  requiredSkills: string[];
  assignedWorkerId?: string;
  assignedWorkerName?: string;
  stationId?: string;
  stationName?: string;
  connections: string[];
  sequence?: number;
}

interface Order {
  id: string;
  product: string;
  quantity: number;
  dueDate: string;
}

const mockOrders: Order[] = [
  { id: "WO-2401", product: "Engine Block", quantity: 500, dueDate: "2025-02-15" },
  { id: "WO-2402", product: "Gear Assembly", quantity: 800, dueDate: "2025-02-20" },
  { id: "WO-2403", product: "Control Panel", quantity: 300, dueDate: "2025-02-18" },
];

export function ProductionPlanDesigner() {
  const { operations, workers, stations, getAvailableWorkers, addWorkOrder } = useMES();
  
  // Load raw materials from Firebase with proper filtering
  const { materials: allMaterials, loading: materialsLoading } = useMaterials({
    status: 'Aktif',
    category: 'Ham madde'
  });
  
  const [selectedOrder, setSelectedOrder] = useState<string>("");
  const [nodes, setNodes] = useState<OperationNode[]>([]);
  const [planName, setPlanName] = useState<string>("");
  const [planDescription, setPlanDescription] = useState<string>("");
  const [packageSize, setPackageSize] = useState([25]);
  
  // Transform Firebase materials to component interface format
  const [materials, setMaterials] = useState<Material[]>([]);
  
  useEffect(() => {
    if (allMaterials && !materialsLoading) {
      const transformedMaterials = allMaterials.map(mat => ({
        id: mat.id || mat.code,
        name: mat.name,
        required: 0, // Will be set based on operation requirements
        available: mat.stock || 0,
        unit: mat.unit || 'kg'
      }));
      setMaterials(transformedMaterials);
    }
  }, [allMaterials, materialsLoading]);
  const [draggedNodeType, setDraggedNodeType] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<OperationNode | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [connectingFrom, setConnectingFrom] = useState<string | null>(null);
  const [materialWarningDialog, setMaterialWarningDialog] = useState(false);
  
  // Grid & Dragging states
  const [gridSize, setGridSize] = useState(40);
  const [snapToGrid, setSnapToGrid] = useState(true);
  const [showGrid, setShowGrid] = useState(true);
  const [draggingNode, setDraggingNode] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  
  const canvasRef = useRef<HTMLDivElement>(null);
  const nodeIdCounter = useRef(1);

  const selectedOrderData = mockOrders.find((o) => o.id === selectedOrder);
  const estimatedTotalTime = nodes.reduce((sum, n) => sum + n.estimatedTime, 0);

  const getNodeColor = (operationType: string) => {
    const colors: Record<string, string> = {
      "Machining": "bg-blue-500",
      "Assembly": "bg-purple-500",
      "Quality": "bg-green-500",
      "Packaging": "bg-orange-500",
      "Welding": "bg-red-500",
      "Painting": "bg-pink-500",
    };
    return colors[operationType] || "bg-gray-500";
  };

  const handleDragStart = (operationId: string) => {
    setDraggedNodeType(operationId);
  };

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      if (!draggedNodeType || !canvasRef.current) return;

      const operation = operations.find((op) => op.id === draggedNodeType);
      if (!operation) return;

      const rect = canvasRef.current.getBoundingClientRect();
      const rawX = e.clientX - rect.left - 80; // center the node
      const rawY = e.clientY - rect.top - 40;
      
      const snapPos = (pos: number) => {
        if (!snapToGrid) return pos;
        return Math.round(pos / gridSize) * gridSize;
      };
      
      const x = snapPos(Math.max(0, rawX));
      const y = snapPos(Math.max(0, rawY));

      // Find preferred station
      const preferredStation = stations.find((st) => st.name === operation.preferredStation);

      const newNode: OperationNode = {
        id: `node-${nodeIdCounter.current++}`,
        name: operation.name,
        operationId: operation.id,
        type: "operation",
        operationType: operation.operationType,
        x,
        y,
        estimatedTime: operation.estimatedTime,
        requiredSkills: operation.requiredSkills,
        connections: [],
        stationId: preferredStation?.id,
        stationName: preferredStation?.name,
      };

      setNodes((prev) => [...prev, newNode]);
      setDraggedNodeType(null);
      toast.success(`${operation.name} operasyonu eklendi`);
    },
    [draggedNodeType, snapToGrid, gridSize, operations, stations]
  );

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleNodeClick = (node: OperationNode) => {
    if (connectingFrom) {
      // Connect nodes
      if (connectingFrom !== node.id) {
        setNodes((prev) =>
          prev.map((n) =>
            n.id === connectingFrom
              ? { ...n, connections: [...new Set([...n.connections, node.id])] }
              : n
          )
        );
        toast.success("Operasyonlar bağlandı");
      }
      setConnectingFrom(null);
    }
  };

  const handleNodeDoubleClick = (node: OperationNode) => {
    setSelectedNode(node);
    setEditDialogOpen(true);
  };

  const handleDeleteNode = (nodeId: string) => {
    setNodes((prev) => {
      // Remove connections to this node
      return prev
        .filter((n) => n.id !== nodeId)
        .map((n) => ({
          ...n,
          connections: n.connections.filter((c) => c !== nodeId),
        }));
    });
    toast.success("Operasyon silindi");
  };

  const handleUpdateNode = () => {
    if (!selectedNode) return;
    setNodes((prev) =>
      prev.map((n) => (n.id === selectedNode.id ? selectedNode : n))
    );
    setEditDialogOpen(false);
    toast.success("Operasyon güncellendi");
  };

  const handleSavePlan = () => {
    if (nodes.length === 0) {
      toast.error("Plan boş olamaz. En az bir operasyon ekleyin.");
      return;
    }
    if (!planName) {
      toast.error("Lütfen plan adı girin.");
      return;
    }
    toast.success("Plan taslak olarak kaydedildi");
  };

  const handlePublishPlan = () => {
    if (nodes.length === 0) {
      toast.error("Plan boş olamaz. En az bir operasyon ekleyin.");
      return;
    }
    if (!selectedOrder) {
      toast.error("Lütfen bir sipariş seçin.");
      return;
    }
    if (!planName) {
      toast.error("Lütfen plan adı girin.");
      return;
    }

    // Check if all operations have assigned workers
    const unassignedOps = nodes.filter((n) => !n.assignedWorkerId);
    if (unassignedOps.length > 0) {
      toast.error(`${unassignedOps.length} operasyona işçi ataması yapılmamış. Lütfen tüm operasyonlara işçi atayın.`);
      return;
    }

    // Check material availability
    const insufficientMaterials = materials.filter((m) => m.available < m.required);
    if (insufficientMaterials.length > 0) {
      setMaterialWarningDialog(true);
      return;
    }

    const orderData = mockOrders.find((o) => o.id === selectedOrder);
    if (!orderData) return;

    // Create work order operations from nodes
    const workOrderOps: WorkOrderOperation[] = nodes.map((node, index) => ({
      id: `op-${Date.now()}-${index}`,
      operationId: node.operationId,
      operationName: node.name,
      operationType: node.operationType,
      assignedWorkerId: node.assignedWorkerId,
      assignedWorkerName: node.assignedWorkerName,
      stationId: node.stationId,
      stationName: node.stationName,
      estimatedTime: node.estimatedTime,
      status: "not-started" as const,
      sequence: index + 1,
      x: node.x,
      y: node.y,
    }));

    // Create work order
    const pkgSize = packageSize[0];
    const totalPkgs = Math.ceil(orderData.quantity / pkgSize);
    
    const workOrder = {
      id: `WO-${Date.now()}`,
      name: planName || `Plan-${Date.now()}`,
      description: planDescription || `Work order for ${orderData.product}`,
      workOrderCode: selectedOrder, // Add work order code for production state tracking
      productName: orderData.product,
      quantity: orderData.quantity,
      packageSize: pkgSize,
      completedPackages: 0,
      totalPackages: totalPkgs,
      priority: "medium" as const,
      status: "planned" as const,
      operations: workOrderOps,
      createdAt: new Date().toISOString(),
      estimatedDuration: estimatedTotalTime,
    };

    addWorkOrder(workOrder);
    
    // Clear the designer
    setNodes([]);
    setPlanName("");
    setPlanDescription("");
    setSelectedOrder("");
    
    toast.success("Plan yayınlandı ve work order oluşturuldu! Dashboard'da görüntüleyebilirsiniz.");
  };

  const handlePublishPlanForce = () => {
    // Skip material check and publish anyway
    setMaterialWarningDialog(false);
    
    const orderData = mockOrders.find((o) => o.id === selectedOrder);
    if (!orderData) return;

    // Create work order operations from nodes
    const workOrderOps: WorkOrderOperation[] = nodes.map((node, index) => ({
      id: `op-${Date.now()}-${index}`,
      operationId: node.operationId,
      operationName: node.name,
      operationType: node.operationType,
      assignedWorkerId: node.assignedWorkerId,
      assignedWorkerName: node.assignedWorkerName,
      stationId: node.stationId,
      stationName: node.stationName,
      estimatedTime: node.estimatedTime,
      status: "not-started" as const,
      sequence: index + 1,
      x: node.x,
      y: node.y,
    }));

    // Create work order
    const pkgSize = packageSize[0];
    const totalPkgs = Math.ceil(orderData.quantity / pkgSize);
    
    const workOrder = {
      id: `WO-${Date.now()}`,
      name: planName || `Plan-${Date.now()}`,
      description: planDescription || `Work order for ${orderData.product}`,
      workOrderCode: selectedOrder, // Add work order code for production state tracking
      productName: orderData.product,
      quantity: orderData.quantity,
      packageSize: pkgSize,
      completedPackages: 0,
      totalPackages: totalPkgs,
      priority: "medium" as const,
      status: "planned" as const,
      operations: workOrderOps,
      createdAt: new Date().toISOString(),
      estimatedDuration: estimatedTotalTime,
    };

    addWorkOrder(workOrder);
    
    // Clear the designer
    setNodes([]);
    setPlanName("");
    setPlanDescription("");
    setSelectedOrder("");
    
    toast.success("Plan yayınlandı ve work order oluşturuldu! Dashboard'da görüntüleyebilirsiniz.");
  };

  const handleSaveTemplate = () => {
    if (nodes.length === 0) {
      toast.error("Plan boş olamaz. En az bir operasyon ekleyin.");
      return;
    }
    toast.success("Şablon kütüphanesine kaydedildi");
  };

  const handleNodeMouseDown = (e: React.MouseEvent, nodeId: string, isDragHandle = false) => {
    if (!isDragHandle) return; // Only allow drag from handle
    if (connectingFrom) return; // Don't drag when connecting
    e.stopPropagation();
    
    const node = nodes.find((n) => n.id === nodeId);
    if (!node || !canvasRef.current) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const offsetX = e.clientX - rect.left - node.x;
    const offsetY = e.clientY - rect.top - node.y;

    setDraggingNode(nodeId);
    setDragOffset({ x: offsetX, y: offsetY });
  };

  const handleCanvasMouseMove = (e: React.MouseEvent) => {
    if (!draggingNode || !canvasRef.current) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const rawX = e.clientX - rect.left - dragOffset.x;
    const rawY = e.clientY - rect.top - dragOffset.y;

    const snapPos = (pos: number) => {
      if (!snapToGrid) return pos;
      return Math.round(pos / gridSize) * gridSize;
    };

    const x = snapPos(Math.max(0, rawX));
    const y = snapPos(Math.max(0, rawY));

    setNodes((prev) =>
      prev.map((n) => (n.id === draggingNode ? { ...n, x, y } : n))
    );
  };

  const handleCanvasMouseUp = () => {
    if (draggingNode) {
      setDraggingNode(null);
    }
  };

  return (
    <div className="flex h-full">
      {/* Left Panel */}
      <div className="w-80 border-r border-border bg-card overflow-auto" data-guide="plan-config-panel">
        <div className="border-b border-border p-4">
          <h2>Plan Configuration</h2>
        </div>

        <div className="p-4 space-y-6">
          {/* Plan Name */}
          <div className="space-y-2">
            <Label htmlFor="plan-name">Plan Name *</Label>
            <Input
              id="plan-name"
              value={planName}
              onChange={(e) => setPlanName(e.target.value)}
              placeholder="e.g., PPL-1125-001"
            />
          </div>

          {/* Plan Description */}
          <div className="space-y-2">
            <Label htmlFor="plan-desc">Description</Label>
            <Input
              id="plan-desc"
              value={planDescription}
              onChange={(e) => setPlanDescription(e.target.value)}
              placeholder="Optional description"
            />
          </div>

          {/* Order Selection */}
          <div className="space-y-2" data-guide="plan-order-select">
            <Label>Select Order</Label>
            <Select value={selectedOrder} onValueChange={setSelectedOrder}>
              <SelectTrigger>
                <SelectValue placeholder="Choose an order" />
              </SelectTrigger>
              <SelectContent>
                {mockOrders.map((order) => (
                  <SelectItem key={order.id} value={order.id}>
                    {order.id} - {order.product}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedOrderData && (
            <>
              {/* Product Info */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">Product Details</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Product:</span>
                    <span>{selectedOrderData.product}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Quantity:</span>
                    <span>{selectedOrderData.quantity} pcs</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Due Date:</span>
                    <span>{selectedOrderData.dueDate}</span>
                  </div>
                </CardContent>
              </Card>

              {/* Materials Reference - Read Only from Main System */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">Material Status (Reference)</CardTitle>
                  <p className="text-xs text-muted-foreground mt-1">
                    Managed in main system
                  </p>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">Material</TableHead>
                        <TableHead className="text-xs text-right">Required</TableHead>
                        <TableHead className="text-xs text-right">Stock</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {materials.map((mat) => (
                        <TableRow key={mat.id}>
                          <TableCell className="text-xs">{mat.name}</TableCell>
                          <TableCell className="text-xs text-right">
                            {mat.required} {mat.unit}
                          </TableCell>
                          <TableCell className="text-xs text-right">
                            <span
                              className={
                                mat.available >= mat.required
                                  ? "text-green-600"
                                  : "text-red-600"
                              }
                            >
                              {mat.available} {mat.unit}
                            </span>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>

              {/* Station & Worker Availability */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">Resource Status</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">CNC-01</span>
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">ASM-02</span>
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Workers Available</span>
                    <Badge variant="outline">12 / 15</Badge>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </div>

      {/* Center Panel - Graph Builder */}
      <div className="flex-1 flex flex-col">
        <div className="border-b border-border bg-card px-6 py-4" data-guide="plan-designer-header">
          <h1>Operation Flow Designer</h1>
          <p className="text-muted-foreground">
            Drag operations from the toolbox to the canvas and connect them
          </p>
        </div>

        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Toolbox */}
          <div className="border-b border-border bg-card p-4" data-guide="plan-toolbox">
            <div className="flex items-center gap-2">
              <Label className="text-sm">Operations Toolbox:</Label>
              <div className="flex gap-2 flex-wrap">
                {operations.map((operation) => {
                  return (
                    <div
                      key={operation.id}
                      draggable
                      onDragStart={() => handleDragStart(operation.id)}
                      className="flex items-center gap-1.5 rounded border border-border bg-card px-2 py-1 cursor-grab active:cursor-grabbing hover:border-primary transition-colors"
                      title={`${operation.description}\nTime: ${operation.estimatedTime}min\nSkills: ${operation.requiredSkills.join(', ')}`}
                    >
                      <div className={`h-2 w-2 rounded-full ${getNodeColor(operation.operationType)}`} />
                      <span className="text-xs">{operation.name}</span>
                      <Badge variant="secondary" className="text-[10px] h-4 px-1">
                        {operation.estimatedTime}m
                      </Badge>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between gap-4">
              <div className="flex gap-2">
                <Button
                  variant={connectingFrom ? "default" : "outline"}
                  size="sm"
                  onClick={() => {
                    if (connectingFrom) {
                      setConnectingFrom(null);
                      toast.info("Bağlantı modu iptal edildi");
                    } else {
                      toast.info("Bağlanacak ilk operasyona tıklayın");
                    }
                  }}
                >
                  {connectingFrom ? "Cancel Connection" : "Connect Nodes"}
                </Button>
                {connectingFrom && (
                  <Badge variant="secondary">Click on target node to connect</Badge>
                )}
              </div>
              
              {/* Grid Controls */}
              <div className="flex items-center gap-4 border-l border-border pl-4">
                <div className="flex items-center gap-2">
                  <Grid3x3 className="h-4 w-4 text-muted-foreground" />
                  <Label className="text-sm">Grid:</Label>
                  <Select
                    value={gridSize.toString()}
                    onValueChange={(value) => setGridSize(parseInt(value))}
                  >
                    <SelectTrigger className="w-20 h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="20">20px</SelectItem>
                      <SelectItem value="40">40px</SelectItem>
                      <SelectItem value="60">60px</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={snapToGrid}
                    onCheckedChange={setSnapToGrid}
                    id="snap-grid"
                  />
                  <Label htmlFor="snap-grid" className="text-sm cursor-pointer">
                    Snap to Grid
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={showGrid}
                    onCheckedChange={setShowGrid}
                    id="show-grid"
                  />
                  <Label htmlFor="show-grid" className="text-sm cursor-pointer">
                    Show Grid
                  </Label>
                </div>
              </div>
            </div>
          </div>

          {/* Canvas */}
          <div
            ref={canvasRef}
            className="flex-1 bg-muted/20 relative overflow-auto"
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onMouseMove={handleCanvasMouseMove}
            onMouseUp={handleCanvasMouseUp}
            onMouseLeave={handleCanvasMouseUp}
            data-guide="plan-canvas"
            style={{
              backgroundImage: showGrid
                ? `radial-gradient(circle, hsl(var(--muted-foreground) / 0.2) 1px, transparent 1px)`
                : undefined,
              backgroundSize: showGrid ? `${gridSize}px ${gridSize}px` : undefined,
            }}
          >
            {nodes.length === 0 && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center text-muted-foreground">
                  <Package className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>Drag operations from the toolbox above to start building your flow</p>
                </div>
              </div>
            )}

            <svg className="absolute inset-0 w-full h-full pointer-events-none">
              {/* Connection Lines */}
              {nodes.map((node) =>
                node.connections.map((targetId) => {
                  const target = nodes.find((n) => n.id === targetId);
                  if (!target) return null;
                  return (
                    <line
                      key={`${node.id}-${targetId}`}
                      x1={node.x + 80}
                      y1={node.y + 40}
                      x2={target.x + 80}
                      y2={target.y + 40}
                      stroke="currentColor"
                      strokeWidth="2"
                      className="text-muted-foreground"
                      markerEnd="url(#arrowhead)"
                    />
                  );
                })
              )}
              <defs>
                <marker
                  id="arrowhead"
                  markerWidth="10"
                  markerHeight="10"
                  refX="9"
                  refY="3"
                  orient="auto"
                >
                  <polygon
                    points="0 0, 10 3, 0 6"
                    fill="currentColor"
                    className="text-muted-foreground"
                  />
                </marker>
              </defs>
            </svg>

            {/* Operation Nodes */}
            {nodes.map((node) => {
              return (
                <div
                  key={node.id}
                  className={`absolute rounded-lg border-2 ${
                    connectingFrom === node.id ? "border-primary" : 
                    draggingNode === node.id ? "border-primary shadow-2xl" : 
                    !node.assignedWorkerId ? "border-destructive/50" : "border-border"
                  } bg-card p-3 shadow-lg hover:shadow-xl transition-all group cursor-pointer`}
                  style={{
                    left: `${node.x}px`,
                    top: `${node.y}px`,
                    width: "180px",
                    userSelect: "none",
                  }}
                  onClick={() => {
                    if (connectingFrom && connectingFrom !== node.id) {
                      handleNodeClick(node);
                    } else if (!connectingFrom && !draggingNode) {
                      setConnectingFrom(node.id);
                      toast.info("Bağlanacak hedef operasyona tıklayın");
                    }
                  }}
                  onDoubleClick={() => handleNodeDoubleClick(node)}
                >
                  <div className="flex items-start gap-2">
                    <div
                      className={`h-3 w-3 rounded-full ${getNodeColor(node.operationType)} flex-shrink-0 mt-1`}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm truncate">
                        {node.name}
                      </div>
                      <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {node.estimatedTime} min
                        </div>
                        {node.assignedWorkerName ? (
                          <div className="flex items-center gap-1">
                            <Users className="h-3 w-3" />
                            <span className="text-green-600">{node.assignedWorkerName}</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1 text-destructive">
                            <AlertCircle className="h-3 w-3" />
                            No worker assigned
                          </div>
                        )}
                        {node.stationName && (
                          <div className="text-xs">{node.stationName}</div>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="mt-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-full text-xs"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleNodeDoubleClick(node);
                      }}
                    >
                      <Settings className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-full text-xs text-destructive"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteNode(node.id);
                      }}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                  
                  {/* Drag Handle */}
                  <div
                    className="absolute bottom-0 right-0 w-6 h-6 cursor-grab active:cursor-grabbing opacity-30 hover:opacity-100 transition-opacity"
                    onMouseDown={(e) => handleNodeMouseDown(e, node.id, true)}
                    style={{
                      background: 'repeating-linear-gradient(45deg, currentColor 0, currentColor 1px, transparent 0, transparent 3px)',
                    }}
                  >
                    <GripVertical className="h-4 w-4 absolute bottom-0.5 right-0.5 text-muted-foreground" />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Bottom Panel */}
        <div className="border-t border-border bg-card p-4">
          <div className="flex items-end gap-6">
            {/* Package Size */}
            <div className="flex-1 space-y-2">
              <Label>Work Package Size</Label>
              <div className="flex items-center gap-4">
                <Slider
                  value={packageSize}
                  onValueChange={setPackageSize}
                  min={10}
                  max={100}
                  step={5}
                  className="flex-1"
                />
                <Input
                  type="number"
                  value={packageSize[0]}
                  onChange={(e) => setPackageSize([parseInt(e.target.value) || 10])}
                  className="w-20"
                />
                <span className="text-muted-foreground text-sm">pcs/package</span>
              </div>
            </div>

            {/* Estimated Time */}
            <Card className="w-64">
              <CardContent className="pt-4">
                <div className="text-muted-foreground text-sm">Estimated Total Time</div>
                <div className="text-2xl mt-1">
                  {Math.round(estimatedTotalTime / 60)} hours
                </div>
                <div className="text-muted-foreground text-xs mt-1">
                  {selectedOrderData
                    ? Math.ceil(selectedOrderData.quantity / packageSize[0])
                    : 0}{" "}
                  packages
                </div>
              </CardContent>
            </Card>

            {/* Action Buttons */}
            <div className="space-y-2">
              <Button 
                variant="outline" 
                className="w-full"
                onClick={() => {
                  if (typeof (window as any).showMaterialCheckModal === 'function') {
                    (window as any).showMaterialCheckModal();
                  }
                }}
              >
                <FileText className="mr-2 h-4 w-4" />
                Check Materials
              </Button>
              
              <div className="flex gap-2">
                <Button variant="outline" onClick={handleSavePlan}>
                  <Save className="mr-2 h-4 w-4" />
                  Save Plan
                </Button>
                <Button variant="outline" onClick={handleSaveTemplate}>
                  <FileText className="mr-2 h-4 w-4" />
                  Save Template
                </Button>
                <Button onClick={handlePublishPlan}>
                  <Send className="mr-2 h-4 w-4" />
                  Publish Plan
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Edit Node Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Operation</DialogTitle>
            <DialogDescription>
              Configure operation parameters and assign worker
            </DialogDescription>
          </DialogHeader>
          {selectedNode && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Operation Name</Label>
                <Input
                  value={selectedNode.name}
                  onChange={(e) =>
                    setSelectedNode({ ...selectedNode, name: e.target.value })
                  }
                  disabled
                />
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Estimated Time (minutes)</Label>
                  <Input
                    type="number"
                    value={selectedNode.estimatedTime}
                    onChange={(e) =>
                      setSelectedNode({
                        ...selectedNode,
                        estimatedTime: parseInt(e.target.value) || 0,
                      })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>Station</Label>
                  <Select
                    value={selectedNode.stationId || ""}
                    onValueChange={(value) => {
                      const station = stations.find((st) => st.id === value);
                      setSelectedNode({
                        ...selectedNode,
                        stationId: station?.id,
                        stationName: station?.name,
                      });
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select station" />
                    </SelectTrigger>
                    <SelectContent>
                      {stations
                        .filter((station) => station.status === "Operational")
                        .map((station) => (
                          <SelectItem key={station.id} value={station.id}>
                            {station.name} - {station.type}
                          </SelectItem>
                        ))}
                      {stations.filter((station) => station.status !== "Operational").length > 0 && (
                        <div className="px-2 py-1.5 text-xs text-muted-foreground border-t border-border">
                          {stations.filter((station) => station.status !== "Operational").length} station(s) unavailable
                        </div>
                      )}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Assign Worker *</Label>
                <Select
                  value={selectedNode.assignedWorkerId || ""}
                  onValueChange={(value) => {
                    const worker = workers.find((w) => w.id === value);
                    setSelectedNode({
                      ...selectedNode,
                      assignedWorkerId: worker?.id,
                      assignedWorkerName: worker?.name,
                    });
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select worker" />
                  </SelectTrigger>
                  <SelectContent>
                    {getAvailableWorkers(selectedNode.requiredSkills)
                      .filter((worker) => {
                        // Additional check: Worker must be assigned to this operation
                        const canDoOperation = worker.assignedOperationIds?.includes(selectedNode.operationId);
                        return canDoOperation;
                      })
                      .map((worker) => (
                        <SelectItem key={worker.id} value={worker.id}>
                          <div className="flex items-center gap-2">
                            <span>{worker.name}</span>
                            <Badge variant="secondary" className="text-xs">
                              {worker.shift}
                            </Badge>
                          </div>
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Showing workers with matching skills and assigned to this operation
                </p>
              </div>

              {selectedNode.assignedWorkerId && (
                <div className="rounded-lg border border-border p-3 bg-muted/50">
                  <div className="text-sm">
                    <strong>Selected Worker:</strong> {selectedNode.assignedWorkerName}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    Skills: {workers.find((w) => w.id === selectedNode.assignedWorkerId)?.skills.join(", ")}
                  </div>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleUpdateNode}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Material Warning Dialog */}
      <Dialog open={materialWarningDialog} onOpenChange={setMaterialWarningDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-orange-500" />
              Material Shortage Warning
            </DialogTitle>
            <DialogDescription>
              Some materials are insufficient for this production plan.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {materials
              .filter((m) => m.available < m.required)
              .map((material) => (
                <div key={material.id} className="rounded-lg border border-orange-200 bg-orange-50 p-3">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{material.name}</span>
                    <Badge variant="destructive">Shortage</Badge>
                  </div>
                  <div className="mt-1 text-sm text-muted-foreground">
                    Required: {material.required} {material.unit} | Available: {material.available} {material.unit}
                  </div>
                  <div className="mt-1 text-sm font-medium text-orange-700">
                    Short by: {material.required - material.available} {material.unit}
                  </div>
                </div>
              ))}
          </div>
          <DialogFooter className="flex gap-2">
            <Button variant="outline" onClick={() => setMaterialWarningDialog(false)}>
              Cancel
            </Button>
            <Button variant="default" onClick={handlePublishPlanForce}>
              Publish Anyway
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
