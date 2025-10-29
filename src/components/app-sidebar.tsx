import {
  LayoutDashboard,
  Network,
  Users,
  FileText,
  Settings as SettingsIcon,
  UserCog,
  Calendar,
  Factory,
  Tag,
  Rocket,
  ChevronRight,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
} from "./ui/sidebar";
import { Badge } from "./ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "./ui/collapsible";

interface AppSidebarProps {
  currentView: string;
  onNavigate: (view: string) => void;
}

const navigationGroups = [
  {
    id: "setup",
    label: "Setup & Configuration",
    icon: Rocket,
    description: "Initial system setup",
    items: [
      {
        id: "settings",
        title: "Master Data",
        icon: Tag,
        dataGuide: "nav-settings",
        badge: "Start here",
        description: "Skills & Operation Types",
      },
      {
        id: "stations",
        title: "Stations",
        icon: Factory,
        dataGuide: "nav-stations",
        description: "Work centers & machines",
      },
      {
        id: "operations",
        title: "Operations",
        icon: SettingsIcon,
        dataGuide: "nav-operations",
        description: "Operation definitions",
      },
      {
        id: "workers",
        title: "Workers",
        icon: UserCog,
        dataGuide: "nav-workers",
        description: "Worker profiles & skills",
      },
      {
        id: "schedule",
        title: "Schedule",
        icon: Calendar,
        dataGuide: "nav-schedule",
        description: "Working hours & shifts",
      },
    ],
  },
  {
    id: "production",
    label: "Production Planning",
    icon: Network,
    description: "Design & manage production",
    items: [
      {
        id: "plan-designer",
        title: "Plan Designer",
        icon: Network,
        dataGuide: "nav-plan-designer",
        description: "Visual workflow designer",
      },
      {
        id: "templates",
        title: "Templates",
        icon: FileText,
        dataGuide: "nav-templates",
        description: "Reusable workflows",
      },
    ],
  },
  {
    id: "monitoring",
    label: "Execution & Monitoring",
    icon: LayoutDashboard,
    description: "Track & execute production",
    items: [
      {
        id: "dashboard",
        title: "Dashboard",
        icon: LayoutDashboard,
        dataGuide: "nav-dashboard",
        description: "KPIs & work orders",
      },
      {
        id: "worker",
        title: "Worker Panel",
        icon: Users,
        dataGuide: "nav-worker",
        description: "Operator interface",
      },
    ],
  },
];

export function AppSidebar({ currentView, onNavigate }: AppSidebarProps) {
  return (
    <Sidebar data-guide="sidebar">
      <SidebarHeader className="p-4 border-b border-sidebar-border">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
            <Factory className="h-5 w-5" />
          </div>
          <div>
            <h2>MES System</h2>
            <p className="text-sidebar-foreground/70 text-xs">Manufacturing Execution</p>
          </div>
        </div>
      </SidebarHeader>
      
      <SidebarContent>
        {navigationGroups.map((group) => (
          <Collapsible key={group.id} defaultOpen className="group/collapsible">
            <SidebarGroup>
              <SidebarGroupLabel asChild>
                <CollapsibleTrigger className="flex w-full items-center justify-between hover:bg-sidebar-accent rounded-md px-2 py-1.5 transition-colors">
                  <div className="flex items-center gap-2">
                    <group.icon className="h-4 w-4" />
                    <span>{group.label}</span>
                  </div>
                  <ChevronRight className="h-4 w-4 transition-transform group-data-[state=open]/collapsible:rotate-90" />
                </CollapsibleTrigger>
              </SidebarGroupLabel>
              <CollapsibleContent>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {group.items.map((item) => (
                      <SidebarMenuItem key={item.id}>
                        <SidebarMenuButton
                          onClick={() => onNavigate(item.id)}
                          isActive={currentView === item.id}
                          data-guide={item.dataGuide}
                          className="group/button"
                        >
                          <item.icon className="h-4 w-4" />
                          <div className="flex-1 flex items-center justify-between">
                            <div className="flex flex-col items-start">
                              <span>{item.title}</span>
                              {item.description && (
                                <span className="text-xs text-sidebar-foreground/60 group-hover/button:text-sidebar-foreground/80">
                                  {item.description}
                                </span>
                              )}
                            </div>
                            {item.badge && (
                              <Badge 
                                variant="default" 
                                className="ml-2 text-xs px-2 py-0 h-5 bg-green-600"
                              >
                                {item.badge}
                              </Badge>
                            )}
                          </div>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    ))}
                  </SidebarMenu>
                </SidebarGroupContent>
              </CollapsibleContent>
            </SidebarGroup>
          </Collapsible>
        ))}
      </SidebarContent>

      <SidebarFooter className="p-4 border-t border-sidebar-border">
        <div className="text-xs text-sidebar-foreground/60">
          <div className="flex items-center gap-2 mb-1">
            <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
            <span>System Online</span>
          </div>
          <p>Version 1.0.0</p>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
