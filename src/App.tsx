import { useState } from "react";
import { Toaster } from "./components/ui/sonner";
import { ProductionPlanDesigner } from "./components/production-plan-designer";
import { ProductionDashboard } from "./components/production-dashboard-clean";
import { WorkerPanel } from "./components/worker-panel-simple";
import { TemplatesLibrary } from "./components/templates-library";
import { WorkersManagement } from "./components/workers-management";
import { OperationsManagement } from "./components/operations-management";
import { StationsManagement } from "./components/stations-management";
import { Settings } from "./components/settings";
import { SetupGuide } from "./components/setup-guide";
import { MESProvider } from "./contexts/MESContext";
import {
  LayoutDashboard,
  Network,
  Users,
  FileText,
  Settings as SettingsIcon,
  UserCog,
  Factory,
  Tag,
  Rocket,
  ChevronDown,
} from "lucide-react";



interface NavGroup {
  id: string;
  label: string;
  icon: React.ComponentType<any>;
  items: NavItem[];
}

interface NavItem {
  id: string;
  label: string;
  icon: React.ComponentType<any>;
  badge?: string;
}

export default function App() {
  const [currentView, setCurrentView] = useState<string>("dashboard");
  const [showSetupGuide, setShowSetupGuide] = useState(true);
  
  // Determine initial active group based on current view
  const getGroupForView = (viewId: string) => {
    const setupViews = ["settings", "stations", "operations", "workers"];
    const productionViews = ["plan-designer", "templates"];
    const monitoringViews = ["dashboard", "worker"];
    
    if (setupViews.includes(viewId)) return "setup";
    if (productionViews.includes(viewId)) return "production";
    return "monitoring";
  };
  
  const [activeGroup, setActiveGroup] = useState<string>(getGroupForView("dashboard"));

  const navigationGroups: NavGroup[] = [
    {
      id: "setup",
      label: "Setup & Configuration",
      icon: Rocket,
      items: [
        {
          id: "settings",
          label: "Master Data",
          icon: Tag,
          badge: "Start here",
        },
        {
          id: "stations",
          label: "Stations",
          icon: Factory,
        },
        {
          id: "operations",
          label: "Operations",
          icon: SettingsIcon,
        },
        {
          id: "workers",
          label: "Workers",
          icon: UserCog,
        },
      ],
    },
    {
      id: "production",
      label: "Production Planning",
      icon: Network,
      items: [
        {
          id: "plan-designer",
          label: "Plan Designer",
          icon: Network,
        },
        {
          id: "templates",
          label: "Templates",
          icon: FileText,
        },
      ],
    },
    {
      id: "monitoring",
      label: "Execution & Monitoring",
      icon: LayoutDashboard,
      items: [
        {
          id: "dashboard",
          label: "Dashboard",
          icon: LayoutDashboard,
        },
        {
          id: "worker",
          label: "Worker Panel",
          icon: Users,
        },
      ],
    },
  ];

  // Find which group contains the current view
  const getCurrentGroup = () => {
    for (const group of navigationGroups) {
      if (group.items.some(item => item.id === currentView)) {
        return group.id;
      }
    }
    return "monitoring"; // default
  };

  // Update active group when view changes
  const handleNavigate = (viewId: string) => {
    setCurrentView(viewId);
    const group = navigationGroups.find(g => g.items.some(item => item.id === viewId));
    if (group) {
      setActiveGroup(group.id);
    }
  };

  const renderView = () => {
    switch (currentView) {
      case "plan-designer":
        return <ProductionPlanDesigner />;
      case "dashboard":
        return <ProductionDashboard />;
      case "worker":
        return <WorkerPanel />;
      case "templates":
        return <TemplatesLibrary />;
      case "workers":
        return <WorkersManagement />;
      case "operations":
        return <OperationsManagement />;
      case "stations":
        return <StationsManagement />;
      case "settings":
        return <Settings />;
      default:
        return <ProductionDashboard />;
    }
  };

  return (
    <MESProvider>
      <div className="mes-container">
        {/* MES Navigation - Two Level */}
        <div className="mes-nav-container" data-guide="mes-nav">
          {/* Level 1: Main Groups */}
          <div className="mes-nav-groups">
            {navigationGroups.map((group) => (
              <button
                key={group.id}
                onClick={() => setActiveGroup(group.id)}
                className={`nav-group-button ${
                  activeGroup === group.id ? "active" : ""
                }`}
              >
                <group.icon className="h-4 w-4" />
                <span>{group.label}</span>
              </button>
            ))}
          </div>

          {/* Level 2: Sub Items of Active Group */}
          <div className="mes-nav-subitems">
            {navigationGroups
              .find((g) => g.id === activeGroup)
              ?.items.map((item) => (
                <button
                  key={item.id}
                  onClick={() => handleNavigate(item.id)}
                  className={`mes-nav-tab ${
                    currentView === item.id ? "active" : ""
                  }`}
                  data-guide={`nav-${item.id}`}
                >
                  <item.icon className="mes-nav-tab-icon h-4 w-4" />
                  <span>{item.label}</span>
                  {item.badge && (
                    <span className="nav-badge">{item.badge}</span>
                  )}
                </button>
              ))}
          </div>
        </div>

        {/* Main Content */}
        <div className="mes-content">
          {renderView()}
        </div>

        <Toaster />
        {showSetupGuide && (
          <SetupGuide 
            onNavigate={(route) => setCurrentView(route)}
            onClose={() => setShowSetupGuide(false)}
          />
        )}
      </div>
    </MESProvider>
  );
}
