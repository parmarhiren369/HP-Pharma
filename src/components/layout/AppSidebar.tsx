import { NavLink, useLocation } from "react-router-dom";
import { 
  FlaskConical, 
  Package, 
  Receipt, 
  Stethoscope,
  Settings,
  User,
  LayoutDashboard,
  Boxes,
  Calculator,
  LogIn,
  Users,
  UserCheck,
  ClipboardList,
  ShoppingCart,
  ArrowLeftRight,
  CreditCard,
  FileText,
  FileMinus,
  FileCheck,
  FileSignature
} from "lucide-react";

const mainMenuItems = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "Items", url: "/items", icon: ClipboardList },
  { title: "Purchases", url: "/purchases", icon: ShoppingCart },
  { title: "Processing", url: "/processing", icon: FlaskConical },
  { title: "Raw Inventory", url: "/raw-inventory", icon: Package },
  { title: "Processed Inventory", url: "/processed-inventory", icon: Boxes },
  { title: "Accounting", url: "/accounting", icon: Receipt },
  { title: "Transactions", url: "/transactions", icon: ArrowLeftRight },
  { title: "Payments", url: "/payments", icon: CreditCard },
  { title: "Invoices", url: "/invoices", icon: FileText },
  { title: "Quotations", url: "/quotations", icon: FileSignature },
  { title: "Proforma Invoices", url: "/proforma-invoices", icon: FileCheck },
  { title: "Debit/Credit Notes", url: "/debit-credit-notes", icon: FileMinus },
  { title: "Medical", url: "/doctors", icon: Stethoscope },
  { title: "Loss Calculation", url: "/loss-calculation", icon: Calculator },
  { title: "Supplier List", url: "/suppliers", icon: Users },
  { title: "Customer List", url: "/customers", icon: UserCheck },
];

const systemMenuItems = [
  { title: "Settings", url: "/settings", icon: Settings },
  { title: "Profile", url: "/profile", icon: User },
  { title: "Doctor Login", url: "/doctor-login", icon: LogIn },
];

export function AppSidebar() {
  const location = useLocation();

  const isActive = (path: string) => {
    if (path === "/") return location.pathname === "/";
    return location.pathname.startsWith(path);
  };

  return (
    <aside className="w-64 min-h-screen bg-sidebar border-r border-sidebar-border flex flex-col">
      {/* Logo */}
      <div className="p-6 border-b border-sidebar-border">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl gradient-primary flex items-center justify-center">
            <FlaskConical className="w-5 h-5 text-white" />
          </div>
          <div>
            <span className="text-foreground font-bold text-lg">Haritany</span>
            <span className="text-primary font-bold text-lg ml-1">pharma</span>
          </div>
        </div>
      </div>

      {/* Main Menu */}
      <nav className="flex-1 p-4">
        <div className="mb-6">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3 px-4">
            Main Menu
          </p>
          <ul className="space-y-1">
            {mainMenuItems.map((item) => (
              <li key={item.title}>
                <NavLink
                  to={item.url}
                  className={`nav-item ${isActive(item.url) ? "nav-item-active" : ""}`}
                >
                  <item.icon className="w-5 h-5" />
                  <span className="font-medium">{item.title}</span>
                </NavLink>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3 px-4">
            System
          </p>
          <ul className="space-y-1">
            {systemMenuItems.map((item) => (
              <li key={item.title}>
                <NavLink
                  to={item.url}
                  className={`nav-item ${isActive(item.url) ? "nav-item-active" : ""}`}
                >
                  <item.icon className="w-5 h-5" />
                  <span className="font-medium">{item.title}</span>
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      </nav>

      {/* User Section */}
      <div className="p-4 border-t border-sidebar-border">
        <div className="flex items-center gap-3 px-4 py-3">
          <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
            <User className="w-5 h-5 text-primary" />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">Admin User</p>
            <p className="text-xs text-muted-foreground">Pharma Manager</p>
          </div>
        </div>
      </div>
    </aside>
  );
}
