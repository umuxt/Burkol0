import { useState } from "react";
import { Factory, Plus, Pencil, Trash2, Save } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "./ui/card";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { toast } from "sonner@2.0.3";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "./ui/dialog";
import { Textarea } from "./ui/textarea";
import { Badge } from "./ui/badge";
import { useMES, Station } from "../contexts/MESContext";

export function StationsManagement() {
  const { stations, setStations } = useMES();
  
  const [stationDialog, setStationDialog] = useState(false);
  const [editingStation, setEditingStation] = useState<Station | null>(null);
  const [stationForm, setStationForm] = useState<Partial<Station>>({
    name: "",
    type: "",
    capacity: 1,
    status: "Operational",
  });

  const stationStatuses = ["Operational", "Maintenance", "Offline"];

  const handleAddStation = () => {
    setEditingStation(null);
    setStationForm({
      name: "",
      type: "",
      capacity: 1,
      status: "Operational",
    });
    setStationDialog(true);
  };

  const handleEditStation = (station: Station) => {
    setEditingStation(station);
    setStationForm(station);
    setStationDialog(true);
  };

  const handleSaveStation = () => {
    if (!stationForm.name || !stationForm.type) {
      toast.error("İstasyon adı ve tipi zorunludur");
      return;
    }

    if (editingStation) {
      const updatedStations = stations.map((st) =>
        st.id === editingStation.id ? { ...st, ...stationForm } as Station : st
      );
      setStations(updatedStations);
      toast.success("İstasyon güncellendi");
    } else {
      const newStation: Station = {
        id: `st-${Date.now()}`,
        ...stationForm as Station,
      };
      setStations([...stations, newStation]);
      toast.success("İstasyon eklendi");
    }
    setStationDialog(false);
  };

  const handleDeleteStation = (id: string) => {
    const filtered = stations.filter((st) => st.id !== id);
    setStations(filtered);
    toast.success("İstasyon silindi");
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "Operational":
        return "default";
      case "Maintenance":
        return "secondary";
      case "Offline":
        return "destructive";
      default:
        return "outline";
    }
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b border-border bg-card px-6 py-4">
        <div className="flex items-center gap-3">
          <Factory className="h-6 w-6" />
          <div>
            <h1>Stations Management</h1>
            <p className="text-muted-foreground">
              Manage production stations and work centers
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
                  <CardTitle>Production Stations</CardTitle>
                  <CardDescription>
                    Add and configure stations where operations are performed
                  </CardDescription>
                </div>
                <Button onClick={handleAddStation}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add Station
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Station Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Capacity</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stations.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground">
                        No stations yet. Click "Add Station" to get started.
                      </TableCell>
                    </TableRow>
                  ) : (
                    stations.map((station) => (
                      <TableRow key={station.id}>
                        <TableCell>{station.name}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {station.type}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{station.capacity} worker(s)</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={getStatusColor(station.status) as any}>
                            {station.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleEditStation(station)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeleteStation(station.id)}
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

      {/* Station Dialog */}
      <Dialog open={stationDialog} onOpenChange={setStationDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editingStation ? "Edit Station" : "Add New Station"}
            </DialogTitle>
            <DialogDescription>
              {editingStation
                ? "Update station information and configuration"
                : "Add a new station to the production floor"}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="station-name">Station Name *</Label>
                <Input
                  id="station-name"
                  value={stationForm.name || ""}
                  onChange={(e) =>
                    setStationForm({ ...stationForm, name: e.target.value })
                  }
                  placeholder="e.g., CNC Mill 01, Welding Station A"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="station-type">Station Type *</Label>
                <Input
                  id="station-type"
                  value={stationForm.type || ""}
                  onChange={(e) =>
                    setStationForm({ ...stationForm, type: e.target.value })
                  }
                  placeholder="e.g., CNC Milling Machine, Welding Station"
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="station-capacity">Worker Capacity *</Label>
                <Input
                  id="station-capacity"
                  type="number"
                  value={stationForm.capacity || 1}
                  onChange={(e) =>
                    setStationForm({
                      ...stationForm,
                      capacity: parseInt(e.target.value) || 1,
                    })
                  }
                  min="1"
                />
                <p className="text-xs text-muted-foreground">
                  Number of workers that can operate this station simultaneously
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="station-status">Status</Label>
                <Select
                  value={stationForm.status || "Operational"}
                  onValueChange={(value) =>
                    setStationForm({ ...stationForm, status: value })
                  }
                >
                  <SelectTrigger id="station-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {stationStatuses.map((status) => (
                      <SelectItem key={status} value={status}>
                        {status}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setStationDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveStation}>
              <Save className="mr-2 h-4 w-4" />
              {editingStation ? "Update" : "Add"} Station
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
