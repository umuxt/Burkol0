import { useState } from "react";
import { Settings as SettingsIcon, Plus, Pencil, Trash2, Save, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../../../shared/components/ui/card";
import { Button } from "../../../shared/components/ui/button";
import { Input } from "../../../shared/components/ui/input";
import { Label } from "../../../shared/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../../shared/components/ui/select";
import { toast } from "sonner@2.0.3";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../../shared/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "../../../shared/components/ui/dialog";
import { Textarea } from "../../../shared/components/ui/textarea";
import { Badge } from "../../../shared/components/ui/badge";
import { useMES, Operation } from "../contexts/MESContext";

export function OperationsManagement() {
  const { 
    operations, 
    workers, 
    stations, 
    availableSkills,
    availableOperationTypes,
    setOperations,
    addSkill,
    addOperationType,
  } = useMES();
  
  const [operationDialog, setOperationDialog] = useState(false);
  const [editingOperation, setEditingOperation] = useState<Operation | null>(null);
  const [operationForm, setOperationForm] = useState<Partial<Operation>>({
    name: "",
    description: "",
    operationType: "",
    estimatedTime: 30,
    requiredSkills: [],
    requiredStationId: "",
  });

  // New skill/type inputs
  const [newSkillInput, setNewSkillInput] = useState("");
  const [newTypeInput, setNewTypeInput] = useState("");

  const handleAddOperation = () => {
    setEditingOperation(null);
    setOperationForm({
      name: "",
      description: "",
      operationType: availableOperationTypes[0] || "",
      estimatedTime: 30,
      requiredSkills: [],
      requiredStationId: "",
    });
    setNewSkillInput("");
    setNewTypeInput("");
    setOperationDialog(true);
  };

  const handleEditOperation = (operation: Operation) => {
    setEditingOperation(operation);
    setOperationForm(operation);
    setNewSkillInput("");
    setNewTypeInput("");
    setOperationDialog(true);
  };

  const handleSaveOperation = () => {
    if (!operationForm.name) {
      toast.error("Operasyon adı zorunludur");
      return;
    }

    if (editingOperation) {
      const updatedOperations = operations.map((op) =>
        op.id === editingOperation.id ? { ...op, ...operationForm } as Operation : op
      );
      setOperations(updatedOperations);
      toast.success("Operasyon güncellendi");
    } else {
      const newOperation: Operation = {
        id: `op-${Date.now()}`,
        ...operationForm as Operation,
      };
      setOperations([...operations, newOperation]);
      toast.success("Operasyon eklendi");
    }
    setOperationDialog(false);
  };

  const handleDeleteOperation = (id: string) => {
    const filtered = operations.filter((op) => op.id !== id);
    setOperations(filtered);
    toast.success("Operasyon silindi");
  };

  const toggleOperationSkill = (skill: string) => {
    const currentSkills = operationForm.requiredSkills || [];
    if (currentSkills.includes(skill)) {
      setOperationForm({
        ...operationForm,
        requiredSkills: currentSkills.filter((s) => s !== skill),
      });
    } else {
      setOperationForm({
        ...operationForm,
        requiredSkills: [...currentSkills, skill],
      });
    }
  };

  const handleAddNewSkill = () => {
    const trimmed = newSkillInput.trim();
    if (trimmed && !availableSkills.includes(trimmed)) {
      addSkill(trimmed);
      toggleOperationSkill(trimmed);
      setNewSkillInput("");
      toast.success(`Skill "${trimmed}" added`);
    }
  };

  const handleAddNewOperationType = () => {
    const trimmed = newTypeInput.trim();
    if (trimmed && !availableOperationTypes.includes(trimmed)) {
      addOperationType(trimmed);
      setOperationForm({ ...operationForm, operationType: trimmed });
      setNewTypeInput("");
      toast.success(`Operation type "${trimmed}" added`);
    }
  };

  // Get available workers for selected skills
  const getAvailableWorkersForOperation = (requiredSkills: string[]) => {
    if (!requiredSkills || requiredSkills.length === 0) {
      return workers;
    }
    return workers.filter((w) =>
      requiredSkills.every((skill) => w.skills.includes(skill))
    );
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b border-border bg-card px-6 py-4">
        <div className="flex items-center gap-3">
          <SettingsIcon className="h-6 w-6" />
          <div>
            <h1>Operations Management</h1>
            <p className="text-muted-foreground">
              Define and manage production operations
            </p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        <div className="mx-auto max-w-6xl">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Operations Library</CardTitle>
                  <CardDescription>
                    Create and configure operations with required skills
                  </CardDescription>
                </div>
                <Button onClick={handleAddOperation}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add Operation
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Time (min)</TableHead>
                    <TableHead>Required Skills</TableHead>
                    <TableHead>Available Workers</TableHead>
                    <TableHead>Station</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {operations.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground">
                        No operations yet. Click "Add Operation" to get started.
                      </TableCell>
                    </TableRow>
                  ) : (
                    operations.map((operation) => {
                      const availableWorkers = getAvailableWorkersForOperation(
                        operation.requiredSkills
                      );
                      return (
                        <TableRow key={operation.id}>
                          <TableCell>
                            <div>
                              <div>{operation.name}</div>
                              <div className="text-xs text-muted-foreground">
                                {operation.description}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{operation.operationType}</Badge>
                          </TableCell>
                          <TableCell>{operation.estimatedTime}</TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1">
                              {operation.requiredSkills.slice(0, 2).map((skill) => (
                                <Badge key={skill} variant="secondary" className="text-xs">
                                  {skill}
                                </Badge>
                              ))}
                              {operation.requiredSkills.length > 2 && (
                                <Badge variant="secondary" className="text-xs">
                                  +{operation.requiredSkills.length - 2}
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <Badge
                                variant={availableWorkers.length > 0 ? "default" : "destructive"}
                                className="text-xs"
                              >
                                {availableWorkers.length} worker{availableWorkers.length !== 1 ? 's' : ''}
                              </Badge>
                            </div>
                          </TableCell>
                          <TableCell className="text-xs">
                            {stations.find(s => s.id === operation.requiredStationId)?.name || "-"}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleEditOperation(operation)}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDeleteOperation(operation.id)}
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Operation Dialog */}
      <Dialog open={operationDialog} onOpenChange={setOperationDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editingOperation ? "Edit Operation" : "Add New Operation"}
            </DialogTitle>
            <DialogDescription>
              {editingOperation
                ? "Update operation details and required skills"
                : "Define a new operation for the production process"}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="operation-name">Operation Name *</Label>
              <Input
                id="operation-name"
                value={operationForm.name || ""}
                onChange={(e) =>
                  setOperationForm({ ...operationForm, name: e.target.value })
                }
                placeholder="e.g., CNC Milling, Welding, Quality Check"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="operation-description">Description</Label>
              <Textarea
                id="operation-description"
                value={operationForm.description || ""}
                onChange={(e) =>
                  setOperationForm({ ...operationForm, description: e.target.value })
                }
                placeholder="Brief description of the operation"
                rows={3}
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="operation-type">Operation Type *</Label>
                <div className="flex gap-2">
                  <Select
                    value={operationForm.operationType || ""}
                    onValueChange={(value) =>
                      setOperationForm({ ...operationForm, operationType: value })
                    }
                  >
                    <SelectTrigger id="operation-type" className="flex-1">
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableOperationTypes.map((type) => (
                        <SelectItem key={type} value={type}>
                          {type}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex gap-2 mt-2">
                  <Input
                    placeholder="Add new type..."
                    value={newTypeInput}
                    onChange={(e) => setNewTypeInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleAddNewOperationType()}
                  />
                  <Button 
                    type="button"
                    variant="secondary" 
                    size="sm"
                    onClick={handleAddNewOperationType}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="operation-time">Estimated Time (minutes) *</Label>
                <Input
                  id="operation-time"
                  type="number"
                  value={operationForm.estimatedTime || 30}
                  onChange={(e) =>
                    setOperationForm({
                      ...operationForm,
                      estimatedTime: parseInt(e.target.value) || 0,
                    })
                  }
                  min="1"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="operation-station">Required Station *</Label>
              <Select
                value={operationForm.requiredStationId || ""}
                onValueChange={(value) =>
                  setOperationForm({ ...operationForm, requiredStationId: value })
                }
              >
                <SelectTrigger id="operation-station">
                  <SelectValue placeholder="Select a station" />
                </SelectTrigger>
                <SelectContent>
                  {stations.map((station) => (
                    <SelectItem key={station.id} value={station.id}>
                      {station.name} ({station.type})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Required Skills</Label>
              <p className="text-xs text-muted-foreground mb-2">
                Select or add skills required to perform this operation
              </p>
              <div className="flex flex-wrap gap-2">
                {availableSkills.map((skill) => (
                  <Badge
                    key={skill}
                    variant={
                      operationForm.requiredSkills?.includes(skill) ? "default" : "outline"
                    }
                    className="cursor-pointer"
                    onClick={() => toggleOperationSkill(skill)}
                  >
                    {skill}
                  </Badge>
                ))}
              </div>
              <div className="flex gap-2 mt-2">
                <Input
                  placeholder="Add new skill..."
                  value={newSkillInput}
                  onChange={(e) => setNewSkillInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleAddNewSkill()}
                />
                <Button 
                  type="button"
                  variant="secondary" 
                  size="sm"
                  onClick={handleAddNewSkill}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {operationForm.requiredSkills && operationForm.requiredSkills.length > 0 && (
              <div className="rounded-lg border border-border bg-muted/50 p-4">
                <Label className="text-xs">Available Workers with Selected Skills</Label>
                <div className="mt-2 flex flex-wrap gap-2">
                  {getAvailableWorkersForOperation(operationForm.requiredSkills).length > 0 ? (
                    getAvailableWorkersForOperation(operationForm.requiredSkills).map(
                      (worker) => (
                        <Badge key={worker.id} variant="secondary">
                          {worker.name}
                        </Badge>
                      )
                    )
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      No workers available with these skills
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOperationDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveOperation}>
              <Save className="mr-2 h-4 w-4" />
              {editingOperation ? "Update" : "Add"} Operation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
