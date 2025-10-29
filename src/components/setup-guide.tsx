import { useState } from "react";
import { 
  CheckCircle2, 
  Circle, 
  ChevronRight, 
  Tag, 
  Factory, 
  Settings, 
  Users, 
  Rocket,
  BookOpen,
  X,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "./ui/card";
import { Button } from "./ui/button";
import { Progress } from "./ui/progress";
import { Badge } from "./ui/badge";
import { useMES } from "../contexts/MESContext";

interface SetupStep {
  id: string;
  title: string;
  description: string;
  icon: React.ComponentType<any>;
  route: string;
  checkComplete: () => boolean;
  details: string[];
}

export function SetupGuide({ onNavigate, onClose }: { onNavigate: (route: string) => void, onClose: () => void }) {
  const { availableSkills, availableOperationTypes, operations, stations, workers } = useMES();
  
  const [expandedStep, setExpandedStep] = useState<string | null>(null);

  const setupSteps: SetupStep[] = [
    {
      id: "master-data",
      title: "1. Master Data Tanımlama",
      description: "Sistemdeki temel veri yapılarını oluşturun",
      icon: Tag,
      route: "settings",
      checkComplete: () => availableSkills.length > 0 && availableOperationTypes.length > 0,
      details: [
        "Master Data modülüne gidin",
        "Skills (Yetenekler) ekleyin: CNC Programming, Welding, Assembly, vb.",
        "Operation Types (Operasyon Tipleri) ekleyin: Machining, Welding, Quality, vb.",
        "Bu veriler tüm sistemde kullanılacak - önce bunları tanımlayın!",
      ],
    },
    {
      id: "stations",
      title: "2. İstasyonları Oluşturun",
      description: "Üretim istasyonlarını ve iş merkezlerini tanımlayın",
      icon: Factory,
      route: "stations",
      checkComplete: () => stations.length > 0,
      details: [
        "Stations Management'a gidin",
        "Fabrikadaki her istasyonu ekleyin (CNC Mill 01, Welding Station A, vb.)",
        "Her istasyon için: İsim, Tip, Kapasite, Durum belirleyin",
        "Örnek: 'CNC Mill 01' - Tip: 'CNC Milling Machine' - Kapasite: 1 worker",
      ],
    },
    {
      id: "operations",
      title: "3. Operasyonları Tanımlayın",
      description: "Üretim operasyonlarını yapılandırın",
      icon: Settings,
      route: "operations",
      checkComplete: () => operations.length > 0,
      details: [
        "Operations Management'a gidin",
        "Her üretim operasyonunu ekleyin (CNC Milling, Welding, Quality Control, vb.)",
        "Her operasyon için belirtin:",
        "  • Operation Type (önceki adımda tanımladığınız tiplerden)",
        "  • Required Skills (hangi yetenekler gerekli)",
        "  • Required Station (hangi istasyonda yapılacak)",
        "  • Estimated Time (tahmini süre)",
      ],
    },
    {
      id: "workers",
      title: "4. İşçileri Sisteme Ekleyin",
      description: "İşçileri ve yeteneklerini tanımlayın",
      icon: Users,
      route: "workers",
      checkComplete: () => workers.length > 0,
      details: [
        "Workers Management'a gidin",
        "Her işçiyi sisteme ekleyin",
        "Her işçi için belirtin:",
        "  • Name & Email (temel bilgiler)",
        "  • Skills (hangi yeteneklere sahip)",
        "  • Assigned Operations (hangi operasyonları yapabilir)",
        "  • Assigned Stations (hangi istasyonlarda çalışabilir)",
        "  • Shift (Day/Night) ve Availability (Available/Busy/On Leave)",
      ],
    },
  ];

  const completedSteps = setupSteps.filter(step => step.checkComplete()).length;
  const progress = (completedSteps / setupSteps.length) * 100;
  const isSetupComplete = completedSteps === setupSteps.length;

  return (
    <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
      <Card className="w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        <CardHeader className="border-b">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <BookOpen className="h-5 w-5" />
              </div>
              <div>
                <CardTitle>Initial Setup Guide</CardTitle>
                <CardDescription>
                  Complete these steps to configure your MES system
                </CardDescription>
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
          
          <div className="mt-4 space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span>{completedSteps} of {setupSteps.length} completed</span>
              <span>{Math.round(progress)}%</span>
            </div>
            <Progress value={progress} className="h-2" />
          </div>

          {isSetupComplete && (
            <div className="mt-4 p-4 rounded-lg bg-green-500/10 border border-green-500/20 flex items-start gap-3">
              <CheckCircle2 className="h-5 w-5 text-green-500 mt-0.5" />
              <div className="flex-1">
                <div className="font-medium text-green-700 dark:text-green-400">
                  Setup Complete! 🎉
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  Your system is configured. You can now create production plans in Plan Designer.
                </p>
              </div>
            </div>
          )}
        </CardHeader>

        <CardContent className="flex-1 overflow-y-auto p-6 space-y-3">
          {setupSteps.map((step, index) => {
            const isComplete = step.checkComplete();
            const isExpanded = expandedStep === step.id;
            
            return (
              <div
                key={step.id}
                className={`rounded-lg border transition-all ${
                  isComplete 
                    ? "border-green-500/30 bg-green-500/5" 
                    : "border-border bg-card"
                }`}
              >
                <button
                  onClick={() => setExpandedStep(isExpanded ? null : step.id)}
                  className="w-full p-4 flex items-center gap-4 text-left hover:bg-muted/50 transition-colors rounded-lg"
                >
                  <div className="flex-shrink-0">
                    {isComplete ? (
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-green-500 text-white">
                        <CheckCircle2 className="h-5 w-5" />
                      </div>
                    ) : (
                      <div className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-muted-foreground/30 text-muted-foreground">
                        <Circle className="h-5 w-5" />
                      </div>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <step.icon className="h-4 w-4 text-muted-foreground" />
                      <h3 className="font-medium">{step.title}</h3>
                      {isComplete && (
                        <Badge variant="outline" className="ml-auto text-green-600 border-green-600">
                          Complete
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      {step.description}
                    </p>
                  </div>

                  <ChevronRight
                    className={`h-5 w-5 text-muted-foreground transition-transform ${
                      isExpanded ? "rotate-90" : ""
                    }`}
                  />
                </button>

                {isExpanded && (
                  <div className="px-4 pb-4 pl-16 space-y-3">
                    <div className="space-y-2">
                      {step.details.map((detail, i) => (
                        <div key={i} className="flex items-start gap-2 text-sm">
                          <div className="mt-1.5 h-1.5 w-1.5 rounded-full bg-primary flex-shrink-0" />
                          <span className="text-muted-foreground">{detail}</span>
                        </div>
                      ))}
                    </div>
                    
                    <Button
                      onClick={() => {
                        onNavigate(step.route);
                        onClose();
                      }}
                      variant={isComplete ? "outline" : "default"}
                      className="mt-2"
                    >
                      {isComplete ? "Review" : "Go to"} {step.title.split(". ")[1]}
                      <ChevronRight className="ml-2 h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>
            );
          })}

          {isSetupComplete && (
            <Card className="border-primary/30 bg-primary/5 mt-6">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                    <Rocket className="h-5 w-5" />
                  </div>
                  <div className="flex-1">
                    <h4 className="font-medium mb-1">Next Steps - Production Planning</h4>
                    <p className="text-sm text-muted-foreground mb-3">
                      Now that your system is configured, you can start planning production:
                    </p>
                    <ol className="text-sm space-y-2 text-muted-foreground ml-4">
                      <li>1. Go to <strong>Plan Designer</strong> to create visual production workflows</li>
                      <li>2. Add operations from your library to the canvas</li>
                      <li>3. Connect operations to define sequence</li>
                      <li>4. Assign workers and stations (system will suggest suitable workers)</li>
                      <li>5. Deploy as Work Order or save as Template</li>
                      <li>6. View and track in <strong>Dashboard</strong></li>
                      <li>7. Workers complete tasks in <strong>Worker Panel</strong></li>
                    </ol>
                    <Button
                      onClick={() => {
                        onNavigate("plan-designer");
                        onClose();
                      }}
                      className="mt-4"
                    >
                      <Rocket className="mr-2 h-4 w-4" />
                      Start Planning Production
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </CardContent>

        <div className="border-t p-4 flex justify-between">
          <Button variant="outline" onClick={onClose}>
            Close Guide
          </Button>
          {!isSetupComplete && (
            <Button
              onClick={() => {
                const nextIncomplete = setupSteps.find(s => !s.checkComplete());
                if (nextIncomplete) {
                  onNavigate(nextIncomplete.route);
                  onClose();
                }
              }}
            >
              Continue Setup
              <ChevronRight className="ml-2 h-4 w-4" />
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}
