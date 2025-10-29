import { useState } from "react";
import {
  Tag,
  Plus,
  X,
  Wrench,
  Info,
} from "lucide-react";
import { useMES } from "../contexts/MESContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "./ui/card";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Alert, AlertDescription } from "./ui/alert";
import { Badge } from "./ui/badge";
import { toast } from "sonner@2.0.3";

export function Settings() {
  const {
    availableSkills,
    availableOperationTypes,
    addSkill,
    removeSkill,
    addOperationType,
    removeOperationType,
  } = useMES();

  const [newSkill, setNewSkill] = useState("");
  const [newOperationType, setNewOperationType] = useState("");

  const handleAddSkill = () => {
    const trimmed = newSkill.trim();
    if (trimmed && !availableSkills.includes(trimmed)) {
      addSkill(trimmed);
      setNewSkill("");
      toast.success(`"${trimmed}" yeteneği eklendi`);
    } else if (availableSkills.includes(trimmed)) {
      toast.error("Bu yetenek zaten mevcut");
    } else {
      toast.error("Lütfen bir yetenek adı girin");
    }
  };

  const handleRemoveSkill = (skill: string) => {
    removeSkill(skill);
    toast.success(`"${skill}" yeteneği silindi`);
  };

  const handleAddOperationType = () => {
    const trimmed = newOperationType.trim();
    if (trimmed && !availableOperationTypes.includes(trimmed)) {
      addOperationType(trimmed);
      setNewOperationType("");
      toast.success(`"${trimmed}" operasyon tipi eklendi`);
    } else if (availableOperationTypes.includes(trimmed)) {
      toast.error("Bu operasyon tipi zaten mevcut");
    } else {
      toast.error("Lütfen bir operasyon tipi girin");
    }
  };

  const handleRemoveOperationType = (type: string) => {
    removeOperationType(type);
    toast.success(`"${type}" operasyon tipi silindi`);
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b border-border bg-card px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Tag className="h-5 w-5" />
          </div>
          <div>
            <h1>Master Data</h1>
            <p className="text-muted-foreground">
              Sistem genelinde kullanılacak temel veri tanımları
            </p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        <div className="mx-auto max-w-6xl space-y-6">
          
          {/* Info Alert */}
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              <strong>Önemli:</strong> Bu tanımlamalar tüm sistemde kullanılır. 
              Önce <strong>Skills</strong> ve <strong>Operation Types</strong> tanımlayın, 
              sonra Workers ve Operations modüllerinde bunları kullanabilirsiniz.
            </AlertDescription>
          </Alert>

          {/* Two Cards Side by Side */}
          <div className="grid gap-6 lg:grid-cols-2">
            
            {/* Skills Card */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Tag className="h-5 w-5 text-primary" />
                    <CardTitle>Skills (Yetenekler)</CardTitle>
                  </div>
                  <Badge variant="secondary">
                    {availableSkills.length} adet
                  </Badge>
                </div>
                <CardDescription>
                  İşçilerin sahip olabileceği ve operasyonların gerektirdiği yetenekleri tanımlayın
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                
                {/* Add New Skill */}
                <div className="flex gap-2">
                  <Input
                    placeholder="Örn: CNC Programming, Welding, Assembly..."
                    value={newSkill}
                    onChange={(e) => setNewSkill(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleAddSkill()}
                  />
                  <Button onClick={handleAddSkill} size="sm">
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>

                {/* Skills List */}
                <div className="min-h-[200px] rounded-lg border border-border bg-muted/30 p-4">
                  {availableSkills.length === 0 ? (
                    <div className="flex h-full items-center justify-center text-center">
                      <div className="space-y-2">
                        <Tag className="h-8 w-8 mx-auto text-muted-foreground" />
                        <p className="text-sm text-muted-foreground">
                          Henüz yetenek tanımlanmamış
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Yukarıdaki alandan yetenek ekleyin
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {availableSkills.map((skill) => (
                        <div
                          key={skill}
                          className="group flex items-center gap-2 px-3 py-1.5 bg-primary/10 border border-primary/20 rounded-md hover:bg-primary/20 transition-colors"
                        >
                          <span className="text-sm">{skill}</span>
                          <button
                            onClick={() => handleRemoveSkill(skill)}
                            className="text-muted-foreground hover:text-destructive transition-colors opacity-0 group-hover:opacity-100"
                            title="Sil"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <p className="text-xs text-muted-foreground">
                  💡 Bu yetenekler <strong>Workers Management</strong> ve <strong>Operations Management</strong> modüllerinde kullanılacak
                </p>
              </CardContent>
            </Card>

            {/* Operation Types Card */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Wrench className="h-5 w-5 text-primary" />
                    <CardTitle>Operation Types</CardTitle>
                  </div>
                  <Badge variant="secondary">
                    {availableOperationTypes.length} adet
                  </Badge>
                </div>
                <CardDescription>
                  Operasyon kategorilerini (Machining, Assembly, Quality vb.) tanımlayın
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                
                {/* Add New Operation Type */}
                <div className="flex gap-2">
                  <Input
                    placeholder="Örn: Machining, Welding, Quality Check..."
                    value={newOperationType}
                    onChange={(e) => setNewOperationType(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleAddOperationType()}
                  />
                  <Button onClick={handleAddOperationType} size="sm">
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>

                {/* Operation Types List */}
                <div className="min-h-[200px] rounded-lg border border-border bg-muted/30 p-4">
                  {availableOperationTypes.length === 0 ? (
                    <div className="flex h-full items-center justify-center text-center">
                      <div className="space-y-2">
                        <Wrench className="h-8 w-8 mx-auto text-muted-foreground" />
                        <p className="text-sm text-muted-foreground">
                          Henüz operasyon tipi tanımlanmamış
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Yukarıdaki alandan operasyon tipi ekleyin
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {availableOperationTypes.map((type) => (
                        <div
                          key={type}
                          className="group flex items-center gap-2 px-3 py-1.5 bg-secondary border border-border rounded-md hover:bg-secondary/80 transition-colors"
                        >
                          <span className="text-sm">{type}</span>
                          <button
                            onClick={() => handleRemoveOperationType(type)}
                            className="text-muted-foreground hover:text-destructive transition-colors opacity-0 group-hover:opacity-100"
                            title="Sil"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <p className="text-xs text-muted-foreground">
                  💡 Bu tipler <strong>Operations Management</strong> ve <strong>Plan Designer</strong> modüllerinde kullanılacak
                </p>
              </CardContent>
            </Card>

          </div>

          {/* Usage Guide */}
          <Card className="border-dashed">
            <CardHeader>
              <CardTitle className="text-base">📖 Kullanım Rehberi</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <div className="flex gap-3">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  1
                </div>
                <div>
                  <strong>Skills Tanımlayın:</strong> CNC Programming, Welding, Assembly, Quality Control gibi işçi yeteneklerini ekleyin
                </div>
              </div>
              <div className="flex gap-3">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  2
                </div>
                <div>
                  <strong>Operation Types Tanımlayın:</strong> Machining, Welding, Painting, Assembly, QC gibi operasyon kategorilerini ekleyin
                </div>
              </div>
              <div className="flex gap-3">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  3
                </div>
                <div>
                  <strong>Workers'a Atayın:</strong> Workers Management'ta işçilere bu skills'leri atayabilirsiniz
                </div>
              </div>
              <div className="flex gap-3">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  4
                </div>
                <div>
                  <strong>Operations'da Kullanın:</strong> Operations Management'ta operasyonlara bu tipleri ve gereken skills'leri atayabilirsiniz
                </div>
              </div>
            </CardContent>
          </Card>

        </div>
      </div>
    </div>
  );
}
