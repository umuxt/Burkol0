// Centralized Icon Library
// Import only the icons we actually use to improve build performance
import React from 'react';

// Import specific icons from lucide-react
import {
  // Common actions
  Plus,
  Pencil,
  Trash2,
  Save,
  Download,
  Upload,
  X,
  ArrowLeft,
  Edit,
  RotateCw,
  Phone,
  Mail,
  
  // Navigation & UI
  FileText,
  DollarSign,
  Layers,
  Package,
  Users,
  ShoppingCart,
  Settings as SettingsIcon,
  Truck, // Added Truck
  Loader2, // Added Loader2
  ChevronDown, // Added ChevronDown
  Search, // Added Search
  
  // Production
  Play,
  Pause,
  CheckCircle,
  CheckCircle2,
  Clock,
  AlertCircle,
  Factory,
  Zap,
  Rocket,
  ClipboardList,
  TrendingUp,
  Timer,
  ListTodo,
  BarChart3,
  Calendar,
  Maximize2,
  Send,
  Grid3x3,
  GripVertical,
  
  // Status
  Check,
  XCircle,
  Info,
  Lock,
  Unlock,
  
} from 'lucide-react';

// Export all icons with consistent naming
export const Icons = {
  // Common actions
  Plus,
  Pencil,
  Trash2,
  Save,
  Download,
  Upload,
  X,
  Close: X,
  ArrowLeft,
  Edit,
  RotateCw,
  Phone,
  Mail,
  
  // Navigation & UI
  FileText,
  DollarSign,
  Layers,
  Package,
  Users,
  ShoppingCart,
  Settings: SettingsIcon,
  Truck, // Added Truck
  Loader2, // Added Loader2
  ChevronDown, // Added ChevronDown
  Search, // Added Search
  
  // Production
  Play,
  Pause,
  CheckCircle,
  CheckCircle2,
  Clock,
  AlertCircle,
  Factory,
  Zap,
  Rocket,
  ClipboardList,
  TrendingUp,
  Timer,
  ListTodo,
  BarChart3,
  Calendar,
  Maximize2,
  Send,
  Grid3x3,
  GripVertical,
  
  // Status
  Check,
  XCircle,
  Info,
  Lock,
  Unlock,
};

// Helper component for consistent icon rendering
export function Icon({ name, size = 16, className = '', ...props }) {
  const IconComponent = Icons[name];
  
  if (!IconComponent) {
    console.warn(`Icon "${name}" not found in Icons library`);
    return null;
  }
  
  return <IconComponent size={size} className={className} {...props} />;
}

// Named exports for backward compatibility
export {
  Plus,
  Pencil,
  Trash2,
  Save,
  Download,
  Upload,
  X,
  ArrowLeft,
  Edit,
  RotateCw,
  Phone,
  Mail,
  FileText,
  DollarSign,
  Layers,
  Package,
  Users,
  ShoppingCart,
  SettingsIcon,
  Truck, // Added Truck
  Loader2, // Added Loader2
  ChevronDown, // Added ChevronDown
  Search, // Added Search
  Play,
  Pause,
  CheckCircle,
  CheckCircle2,
  Clock,
  AlertCircle,
  Factory,
  Zap,
  Rocket,
  ClipboardList,
  TrendingUp,
  Timer,
  ListTodo,
  BarChart3,
  Calendar,
  Maximize2,
  Send,
  Grid3x3,
  GripVertical,
  Check,
  XCircle,
  Info,
  Lock,
  Unlock,
};

export default Icons;
