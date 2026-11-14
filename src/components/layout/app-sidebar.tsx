import { Link, useRouterState } from "@tanstack/react-router";
import { useState } from "react";
import {
  ArrowLeftRight,
  BarChart3,
  Boxes,
  ChevronDown,
  LayoutDashboard,
  Package,
  Receipt,
  Settings,
  ShoppingCart,
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

// Lo que se usa todos los días, siempre a la vista.
const MAIN: NavItem[] = [
  { title: "Inicio", url: "/dashboard", icon: LayoutDashboard, permission: "dashboard.view" },
  { title: "Vender", url: "/pos", icon: ShoppingCart, permission: "pos.use" },
  { title: "Ventas", url: "/ventas", icon: ArrowLeftRight, permission: "pos.use" },
  { title: "Productos", url: "/productos", icon: Package, permission: "products.view" },
  { title: "Inventario", url: "/inventario", icon: Boxes, permission: "inventory.view" },
  { title: "Caja", url: "/caja", icon: Wallet, permission: "cash.use" },
  { title: "Gastos", url: "/gastos", icon: Receipt, permission: "expenses.manage" },
];

// Lo demás queda guardado en "Más opciones" para no abrumar.
// Categorías (en Productos), Proveedores (en Compras) y el Manual (en el menú de la
// cuenta) ya no ocupan lugar aquí: se abren desde donde se usan.
const MORE: NavItem[] = [
  { title: "Clientes", url: "/clientes", icon: Users, permission: "customers.view" },
  { title: "Compras", url: "/compras", icon: Truck, permission: "purchases.view" },
  { title: "Promociones", url: "/promociones", icon: Tag, permission: "promotions.manage" },
  { title: "Reportes", url: "/reportes", icon: BarChart3, permission: "reports.view" },
  { title: "Usuarios", url: "/usuarios", icon: UsersRound, permission: "users.manage" },
  { title: "Configuración", url: "/configuracion", icon: Settings, permission: "settings.manage" },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const { can, profile, role } = useAuth();
  const [moreOpen, setMoreOpen] = useState(false);

  const isActive = (url: string) => pathname === url || pathname.startsWith(`${url}/`);

  const mainItems = MAIN.filter((i) => can(i.permission));
  const moreItems = MORE.filter((i) => can(i.permission));
  // Se abre sola si la página actual vive dentro de "Más opciones".
  const showMore = moreOpen || collapsed || moreItems.some((i) => isActive(i.url));

  const renderItem = (item: NavItem) => (
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
  );

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
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>{mainItems.map(renderItem)}</SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {moreItems.length > 0 && (
          <SidebarGroup>
            {!collapsed && (
              <button
                type="button"
                onClick={() => setMoreOpen((open) => !open)}
                aria-expanded={showMore}
                className="flex h-9 w-full items-center justify-between rounded-lg px-2 text-xs font-medium uppercase tracking-wide text-sidebar-foreground/60 transition-colors hover:text-sidebar-foreground"
              >
                Más opciones
                <ChevronDown
                  className={cn("size-4 transition-transform", showMore && "rotate-180")}
                />
              </button>
            )}
            {showMore && (
              <SidebarGroupContent>
                <SidebarMenu>{moreItems.map(renderItem)}</SidebarMenu>
              </SidebarGroupContent>
            )}
          </SidebarGroup>
        )}
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
