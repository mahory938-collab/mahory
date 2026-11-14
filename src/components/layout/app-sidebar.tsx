import { Link, useRouterState } from "@tanstack/react-router";
import {
  ArrowLeftRight,
  BarChart3,
  BookOpen,
  Boxes,
  LayoutDashboard,
  Layers,
  Package,
  Settings,
  ShoppingCart,
  Store,
  Tag,
  Truck,
  Users,
  UsersRound,
  Wallet,
} from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { useAuth } from "@/hooks/use-auth";
import { ROLE_LABELS, type Permission } from "@/lib/permissions";
import { cn } from "@/lib/utils";

type NavItem = {
  title: string;
  url: string;
  icon: typeof LayoutDashboard;
  permission: Permission;
};

const OPERATION: NavItem[] = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard, permission: "dashboard.view" },
  { title: "Punto de venta", url: "/pos", icon: ShoppingCart, permission: "pos.use" },
  { title: "Ventas", url: "/ventas", icon: ArrowLeftRight, permission: "pos.use" },
  { title: "Caja", url: "/caja", icon: Wallet, permission: "cash.use" },
];

const CATALOG: NavItem[] = [
  { title: "Productos", url: "/productos", icon: Package, permission: "products.view" },
  { title: "Categorías", url: "/categorias", icon: Layers, permission: "categories.manage" },
  { title: "Promociones", url: "/promociones", icon: Tag, permission: "promotions.manage" },
  { title: "Inventario", url: "/inventario", icon: Boxes, permission: "inventory.view" },
  { title: "Compras", url: "/compras", icon: Truck, permission: "purchases.view" },
  { title: "Clientes", url: "/clientes", icon: Users, permission: "customers.view" },
  { title: "Proveedores", url: "/proveedores", icon: Store, permission: "suppliers.view" },
];

const ADMIN_NAV: NavItem[] = [
  { title: "Reportes", url: "/reportes", icon: BarChart3, permission: "reports.view" },
  { title: "Usuarios", url: "/usuarios", icon: UsersRound, permission: "users.manage" },
  { title: "Configuración", url: "/configuracion", icon: Settings, permission: "settings.manage" },
];

const HELP: NavItem[] = [
  { title: "Manual", url: "/manual", icon: BookOpen, permission: "pos.use" },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const { can, profile, role } = useAuth();

  const isActive = (url: string) => pathname === url || pathname.startsWith(`${url}/`);

  const groups: { label: string; items: NavItem[] }[] = [
    { label: "Operación", items: OPERATION.filter((i) => can(i.permission)) },
    { label: "Catálogo", items: CATALOG.filter((i) => can(i.permission)) },
    { label: "Administración", items: ADMIN_NAV.filter((i) => can(i.permission)) },
    { label: "Ayuda", items: HELP.filter((i) => can(i.permission)) },
  ].filter((g) => g.items.length > 0);

  return (
    <Sidebar collapsible="icon" className="border-r">
      <SidebarHeader className="p-3">
        <div className={cn("flex items-center gap-3", collapsed && "justify-center")}>
          <img
            src="/logo-mahory.png"
            alt="Mahory"
            className="size-10 shrink-0 rounded-full shadow-glow"
          />
          {!collapsed && (
            <div className="min-w-0">
              <p className="truncate font-serif text-base font-semibold uppercase tracking-[0.25em]">
                Mahory
              </p>
              <p className="truncate text-xs text-muted-foreground">Viste con amor</p>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent className="scrollbar-slim">
        {groups.map((group) => (
          <SidebarGroup key={group.label}>
            {!collapsed && <SidebarGroupLabel>{group.label}</SidebarGroupLabel>}
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => (
                  <SidebarMenuItem key={item.url}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive(item.url)}
                      tooltip={item.title}
                      className="h-11 rounded-xl transition-all"
                    >
                      <Link to={item.url} className="flex items-center gap-3">
                        <item.icon className="size-5 shrink-0" />
                        {!collapsed && <span className="text-sm font-medium">{item.title}</span>}
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter className="p-3">
        {!collapsed && (
          <div className="rounded-xl border bg-surface p-3">
            <p className="truncate text-sm font-medium text-foreground">
              {profile?.full_name || "Usuario"}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {role ? ROLE_LABELS[role] : "Sin rol"}
            </p>
          </div>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
