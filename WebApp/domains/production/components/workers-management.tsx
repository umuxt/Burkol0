import { useState } from "react";
import { Users, Plus, Pencil, Trash2, Save } from "../../../shared/components/Icons.jsx";
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
import { toast } from "sonner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../../shared/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "../../../shared/components/ui/dialog";
import { Badge } from "../../../shared/components/ui/badge";
// import { useMES, Worker } from "../contexts/MESContext";

// Define types locally for now
type Worker = {
  id: string;
  name: string;
  email: string;
  skills: string[];
  assignedOperations: string[];
  assignedStations: string[];
  assignedOperationIds?: string[];
  assignedStationIds?: string[];
  shift: string;
  availability?: string;
};

type Station = {
  id: string;
  name: string;
  type?: string;
  capacity?: number;
};

export function WorkersManagement() {
  // Mock data for now - replace with actual MES context when available
  const workers: Worker[] = [];
  const operations: any[] = [];
  const stations: Station[] = [];
  const availableSkills: string[] = [];
  const setWorkers = (workers: Worker[]) => {};
  const addSkill = (skill: string) => {};
  
  const [workerDialog, setWorkerDialog] = useState(false);
  const [editingWorker, setEditingWorker] = useState<Worker | null>(null);
  const [workerForm, setWorkerForm] = useState<Partial<Worker>>({
    name: "",
    email: "",
    skills: [],
    shift: "Day",
    availability: "Available",
    assignedOperationIds: [],
    assignedStationIds: [],
  });

  // New skill input
  const [newSkillInput, setNewSkillInput] = useState("");

  const handleAddWorker = () => {
    setEditingWorker(null);
    setWorkerForm({
      name: "",
      email: "",
      skills: [],
      shift: "Day",
      availability: "Available",
      assignedOperationIds: [],
      assignedStationIds: [],
    });
    setNewSkillInput("");
    setWorkerDialog(true);
  };

  const handleEditWorker = (worker: Worker) => {
    setEditingWorker(worker);
    setWorkerForm(worker);
    setNewSkillInput("");
    setWorkerDialog(true);
  };

  const handleSaveWorker = () => {
    if (!workerForm.name || !workerForm.email) {
      toast.error("İsim ve email zorunludur");
      return;
    }

    if (editingWorker) {
      const updatedWorkers = workers.map((w) =>
        w.id === editingWorker.id ? { ...w, ...workerForm } as Worker : w
      );
      setWorkers(updatedWorkers);
      toast.success("İşçi bilgileri güncellendi");
    } else {
      const newWorker: Worker = {
        id: `w-${Date.now()}`,
        ...workerForm as Worker,
      };
      setWorkers([...workers, newWorker]);
      toast.success("İşçi eklendi");
    }
    setWorkerDialog(false);
  };

  const handleDeleteWorker = (id: string) => {
    const filtered = workers.filter((w) => w.id !== id);
    setWorkers(filtered);
    toast.success("İşçi silindi");
  };

  const toggleWorkerSkill = (skill: string) => {
    const currentSkills = workerForm.skills || [];
    if (currentSkills.includes(skill)) {
      setWorkerForm({
        ...workerForm,
        skills: currentSkills.filter((s) => s !== skill),
      });
    } else {
      setWorkerForm({
        ...workerForm,
        skills: [...currentSkills, skill],
      });
    }
  };

  const handleAddNewSkill = () => {
    const trimmed = newSkillInput.trim();
    if (trimmed && !availableSkills.includes(trimmed)) {
      addSkill(trimmed);
      toggleWorkerSkill(trimmed);
      setNewSkillInput("");
      toast.success(`Skill "${trimmed}" added`);
    }
  };

  const toggleWorkerOperation = (operationId: string) => {
    const currentOps = workerForm.assignedOperationIds || [];
    if (currentOps.includes(operationId)) {
      setWorkerForm({
        ...workerForm,
        assignedOperationIds: currentOps.filter((id) => id !== operationId),
      });
    } else {
      setWorkerForm({
        ...workerForm,
        assignedOperationIds: [...currentOps, operationId],
      });
    }
  };

  const toggleWorkerStation = (stationId: string) => {
    const currentStations = workerForm.assignedStationIds || [];
    if (currentStations.includes(stationId)) {
      setWorkerForm({
        ...workerForm,
        assignedStationIds: currentStations.filter((id) => id !== stationId),
      });
    } else {
      setWorkerForm({
        ...workerForm,
        assignedStationIds: [...currentStations, stationId],
      });
    }
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b border-border bg-card px-6 py-4">
        <div className="flex items-center gap-3">
          <Users className="h-6 w-6" />
          <div>
            <h1>Production Personnel Management</h1>
            <p className="text-muted-foreground">
              Manage production personnel, their skills, and assignments
            </p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        <div className="mx-auto max-w-7xl">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Production Personnel & Capabilities</CardTitle>
                  <CardDescription>
                    Define production personnel with their skills, operations, and work station assignments
                  </CardDescription>
                </div>
                <Button onClick={handleAddWorker}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add Production Personnel
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Skills</TableHead>
                    <TableHead>Operations</TableHead>
                    <TableHead>Stations</TableHead>
                    <TableHead>Shift</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {workers.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center text-muted-foreground">
                        No production personnel yet. Click "Add Production Personnel" to get started.
                      </TableCell>
                    </TableRow>
                  ) : (
                    workers.map((worker) => (
                      <TableRow key={worker.id}>
                        <TableCell>{worker.name}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {worker.email}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {worker.skills.slice(0, 2).map((skill) => (
                              <Badge key={skill} variant="secondary" className="text-xs">
                                {skill}
                              </Badge>
                            ))}
                            {worker.skills.length > 2 && (
                              <Badge variant="secondary" className="text-xs">
                                +{worker.skills.length - 2}
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {(worker.assignedOperationIds || []).slice(0, 2).map((opId) => {
                              const op = operations.find(o => o.id === opId);
                              return op ? (
                                <Badge key={opId} variant="outline" className="text-xs">
                                  {op.name}
                                </Badge>
                              ) : null;
                            })}
                            {(worker.assignedOperationIds || []).length > 2 && (
                              <Badge variant="outline" className="text-xs">
                                +{(worker.assignedOperationIds || []).length - 2}
                              </Badge>
                            )}
                            {(worker.assignedOperationIds || []).length === 0 && (
                              <span className="text-xs text-muted-foreground">-</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {(worker.assignedStationIds || []).slice(0, 2).map((stId) => {
                              const st = stations.find(s => s.id === stId);
                              return st ? (
                                <Badge key={stId} variant="outline" className="text-xs">
                                  {st.name}
                                </Badge>
                              ) : null;
                            })}
                            {(worker.assignedStationIds || []).length > 2 && (
                              <Badge variant="outline" className="text-xs">
                                +{(worker.assignedStationIds || []).length - 2}
                              </Badge>
                            )}
                            {(worker.assignedStationIds || []).length === 0 && (
                              <span className="text-xs text-muted-foreground">-</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{worker.shift}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              worker.availability === "Available"
                                ? "default"
                                : "secondary"
                            }
                          >
                            {worker.availability}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleEditWorker(worker)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeleteWorker(worker.id)}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Worker Dialog */}
      <Dialog open={workerDialog} onOpenChange={setWorkerDialog}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingWorker ? "Edit Worker" : "Add New Worker"}
            </DialogTitle>
            <DialogDescription>
              {editingWorker
                ? "Update worker information, skills, and assignments"
                : "Add a new worker with skills and operation/station assignments"}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="worker-name">Name *</Label>
                <Input
                  id="worker-name"
                  value={workerForm.name || ""}
                  onChange={(e) =>
                    setWorkerForm({ ...workerForm, name: e.target.value })
                  }
                  placeholder="Worker name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="worker-email">Email *</Label>
                <Input
                  id="worker-email"
                  type="email"
                  value={workerForm.email || ""}
                  onChange={(e) =>
                    setWorkerForm({ ...workerForm, email: e.target.value })
                  }
                  placeholder="worker@company.com"
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="worker-shift">Shift</Label>
                <Select
                  value={workerForm.shift || "Day"}
                  onValueChange={(value) =>
                    setWorkerForm({ ...workerForm, shift: value })
                  }
                >
                  <SelectTrigger id="worker-shift">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Day">Day Shift</SelectItem>
                    <SelectItem value="Night">Night Shift</SelectItem>
                    <SelectItem value="Rotating">Rotating Shift</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="worker-availability">Availability</Label>
                <Select
                  value={workerForm.availability || "Available"}
                  onValueChange={(value) =>
                    setWorkerForm({ ...workerForm, availability: value })
                  }
                >
                  <SelectTrigger id="worker-availability">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Available">Available</SelectItem>
                    <SelectItem value="Busy">Busy</SelectItem>
                    <SelectItem value="On Leave">On Leave</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Skills</Label>
              <p className="text-xs text-muted-foreground mb-2">
                Select or add skills this worker possesses
              </p>
              <div className="flex flex-wrap gap-2">
                {availableSkills.map((skill) => (
                  <Badge
                    key={skill}
                    variant={
                      workerForm.skills?.includes(skill) ? "default" : "outline"
                    }
                    className="cursor-pointer"
                    onClick={() => toggleWorkerSkill(skill)}
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

            <div className="space-y-2">
              <Label>Assigned Operations</Label>
              <p className="text-xs text-muted-foreground mb-2">
                Select which operations this worker can perform
              </p>
              <div className="max-h-48 overflow-y-auto rounded-md border border-border p-3 space-y-2">
                {operations.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    No operations defined yet. Create operations first.
                  </p>
                ) : (
                  operations.map((operation) => (
                    <div
                      key={operation.id}
                      className="flex items-center justify-between p-2 rounded hover:bg-muted/50 cursor-pointer"
                      onClick={() => toggleWorkerOperation(operation.id)}
                    >
                      <div className="flex-1">
                        <div className="text-sm">{operation.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {operation.operationType} • {operation.estimatedTime} min
                        </div>
                      </div>
                      <input
                        type="checkbox"
                        checked={(workerForm.assignedOperationIds || []).includes(operation.id)}
                        onChange={() => {}}
                        className="h-4 w-4"
                      />
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Assigned Stations</Label>
              <p className="text-xs text-muted-foreground mb-2">
                Select which stations this worker can work at
              </p>
              <div className="max-h-48 overflow-y-auto rounded-md border border-border p-3 space-y-2">
                {stations.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    No stations defined yet. Create stations first.
                  </p>
                ) : (
                  stations.map((station) => (
                    <div
                      key={station.id}
                      className="flex items-center justify-between p-2 rounded hover:bg-muted/50 cursor-pointer"
                      onClick={() => toggleWorkerStation(station.id)}
                    >
                      <div className="flex-1">
                        <div className="text-sm">{station.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {station.type} • Capacity: {station.capacity}
                        </div>
                      </div>
                      <input
                        type="checkbox"
                        checked={(workerForm.assignedStationIds || []).includes(station.id)}
                        onChange={() => {}}
                        className="h-4 w-4"
                      />
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setWorkerDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveWorker}>
              <Save className="mr-2 h-4 w-4" />
              {editingWorker ? "Update" : "Add"} Worker
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
