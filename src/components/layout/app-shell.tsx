import { Link, useNavigate } from "@tanstack/react-router";
import { LogOut, Moon, Search, Sun, User } from "lucide-react";
import type { ReactNode } from "react";

import { AppSidebar } from "@/components/layout/app-sidebar";
import { GlobalSearch } from "@/components/layout/global-search";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { useAuth, useSignOut } from "@/hooks/use-auth";
import { useTheme } from "@/hooks/use-theme";
import { ROLE_LABELS } from "@/lib/permissions";
import { cn } from "@/lib/utils";

type AppShellProps = {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  /** POS uses a full-bleed body with no page padding. */
  flush?: boolean;
};

export function AppShell({ title, description, actions, children, flush }: AppShellProps) {
  const { profile, role } = useAuth();
  const { theme, toggle } = useTheme();
  const navigate = useNavigate();
  const signOut = useSignOut(() => navigate({ to: "/auth", replace: true }));

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background">
        <AppSidebar />
        <SidebarInset className="flex min-w-0 flex-1 flex-col bg-background">
          <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b bg-card/80 px-4 backdrop-blur-xl">
            <SidebarTrigger className="size-9 rounded-lg" />
            <Separator orientation="vertical" className="h-6" />
            <div className="min-w-0 flex-1">
              <h1 className="truncate font-display text-lg font-semibold leading-tight">{title}</h1>
              {description && (
                <p className="truncate text-xs text-muted-foreground">{description}</p>
              )}
            </div>

            <div className="flex items-center gap-2">
              {actions}
              <GlobalSearch
                trigger={
                  <Button variant="outline" size="icon" className="size-9 rounded-lg">
                    <Search className="size-4" />
                    <span className="sr-only">Buscar</span>
                  </Button>
                }
              />
              <Button
                variant="outline"
                size="icon"
                className="size-9 rounded-lg"
                onClick={toggle}
                aria-label="Cambiar tema"
              >
                {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
              </Button>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="h-9 gap-2 rounded-lg px-2.5">
                    <span className="grid size-6 place-items-center rounded-md bg-primary-soft">
                      <User className="size-3.5 text-primary" />
                    </span>
                    <span className="hidden max-w-32 truncate text-sm sm:inline">
                      {profile?.full_name || "Cuenta"}
                    </span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel>
                    <p className="truncate text-sm font-medium">{profile?.full_name || "Usuario"}</p>
                    <p className="truncate text-xs font-normal text-muted-foreground">
                      {role ? ROLE_LABELS[role] : "Sin rol"}
                    </p>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link to="/configuracion">Configuración</Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => signOut.mutate()}
                    className="text-destructive focus:text-destructive"
                  >
                    <LogOut className="mr-2 size-4" />
                    Cerrar sesión
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </header>

          <main className={cn("min-h-0 min-w-0 flex-1", flush ? "overflow-hidden" : "p-4 md:p-6")}>
            {children}
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
