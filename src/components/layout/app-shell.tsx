import { useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { LogOut, Moon, Search, Sun, User } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

import { AppSidebar } from "@/components/layout/app-sidebar";
import { GlobalSearch } from "@/components/layout/global-search";
import { ScanChoiceDialog } from "@/components/layout/scan-choice-dialog";
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
import { useBarcodeWedge } from "@/features/pos/use-barcode-wedge";
import { useAuth, useSignOut } from "@/hooks/use-auth";
import { useTheme } from "@/hooks/use-theme";
import { ROLE_LABELS } from "@/lib/permissions";
import { resetLocalSession } from "@/lib/session-reset";
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
  const { profile, role, user, isLoading, accountError } = useAuth();
  const queryClient = useQueryClient();
  const { theme, toggle } = useTheme();
  const navigate = useNavigate();
  const signOut = useSignOut(() => navigate({ to: "/auth", replace: true }));
  const pathname = useRouterState({ select: (r) => r.location.pathname });

  // Esta pantalla solo se abre con sesión iniciada (lo comprueba la ruta). Si aun así la app
  // todavía no tiene la sesión en memoria, se vuelve a leer en vez de mostrar un menú vacío.
  useEffect(() => {
    if (!isLoading && !user) void queryClient.invalidateQueries({ queryKey: ["auth", "session"] });
  }, [isLoading, user, queryClient]);

  useEffect(() => {
    if (role) {
      try {
        sessionStorage.removeItem(RECOVERY_KEY);
      } catch {
        // almacenamiento no disponible
      }
    }
  }, [role]);

  // Lector de código de barras de escritorio. En Vender y Consultar precio lo atiende la propia
  // pantalla; en Productos e Inventario pregunta qué hacer; en el resto, va directo a Vender.
  const [askCode, setAskCode] = useState<string | null>(null);
  useBarcodeWedge((code) => {
    if (pathname === "/pos" || pathname === "/precios") return;
    if (pathname === "/productos" || pathname === "/inventario") {
      setAskCode(code);
      return;
    }
    void navigate({ to: "/pos", search: { codigo: code } });
  });

  // Cuenta que entró pero no se pudo cargar (sin rol o con la conexión caída): se intenta
  // reparar sola, sin pedirle nada a quien está en el mostrador.
  if (!isLoading && user && !role) {
    return <AccountRecovery error={accountError} onSignOut={() => signOut.mutate()} />;
  }

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background">
        <AppSidebar />
        <SidebarInset className="flex min-w-0 flex-1 flex-col bg-background">
          <header className="glass sticky top-0 z-30 flex h-16 items-center gap-3 border-b px-4">
            <SidebarTrigger className="size-9 rounded-lg" />
            <Separator orientation="vertical" className="h-6" />
            <div className="min-w-0 flex-1">
              <h1 className="truncate font-display text-xl font-semibold leading-tight text-primary">
                {title}
              </h1>
              {description && (
                <p className="truncate text-xs text-muted-foreground">{description}</p>
              )}
            </div>

            <div className="flex items-center gap-2">
              {actions}
              <GlobalSearch
                trigger={
                  <Button
                    variant="outline"
                    size="icon"
                    className="hidden size-9 rounded-lg sm:inline-flex"
                  >
                    <Search className="size-4" />
                    <span className="sr-only">Buscar</span>
                  </Button>
                }
              />
              <Button
                variant="outline"
                size="icon"
                className="hidden size-9 rounded-lg sm:inline-flex"
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
                    <p className="truncate text-sm font-medium">
                      {profile?.full_name || "Usuario"}
                    </p>
                    <p className="truncate text-xs font-normal text-muted-foreground">
                      {role ? ROLE_LABELS[role] : "Sin rol"}
                    </p>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={toggle} className="sm:hidden">
                    {theme === "dark" ? "Modo claro" : "Modo oscuro"}
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link to="/manual">Manual de uso</Link>
                  </DropdownMenuItem>
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

          <main
            className={cn(
              "animate-fade-up min-h-0 min-w-0 flex-1",
              flush ? "overflow-hidden" : "p-4 md:p-6",
            )}
          >
            {children}
          </main>
        </SidebarInset>
      </div>
      <ScanChoiceDialog
        code={askCode}
        onClose={() => setAskCode(null)}
        onSale={(code) => {
          setAskCode(null);
          void navigate({ to: "/pos", search: { codigo: code } });
        }}
        onFind={(code) => {
          setAskCode(null);
          if (pathname === "/inventario")
            void navigate({ to: "/inventario", search: { buscar: code } });
          else void navigate({ to: "/productos", search: { buscar: code } });
        }}
      />
    </SidebarProvider>
  );
}

const RECOVERY_KEY = "mahory-account-recovery";

/**
 * 1) Reintenta cargar el perfil y el rol. 2) Si sigue igual, limpia la sesión guardada y vuelve
 * al inicio de sesión (una sola vez por pestaña, para no dar vueltas). 3) Si ya se hizo y
 * sigue fallando, muestra el motivo y los botones.
 */
function AccountRecovery({ error, onSignOut }: { error: string | null; onSignOut: () => void }) {
  const queryClient = useQueryClient();
  const alreadyReset = (() => {
    try {
      return sessionStorage.getItem(RECOVERY_KEY) === "1";
    } catch {
      return false;
    }
  })();

  useEffect(() => {
    if (alreadyReset) return;
    const retry = setTimeout(() => {
      void queryClient.invalidateQueries({ queryKey: ["auth"] });
    }, 1200);
    const reset = setTimeout(() => {
      try {
        sessionStorage.setItem(RECOVERY_KEY, "1");
      } catch {
        // almacenamiento no disponible
      }
      void resetLocalSession();
    }, 5000);
    return () => {
      clearTimeout(retry);
      clearTimeout(reset);
    };
  }, [alreadyReset, queryClient]);

  return (
    <div className="grid min-h-screen place-items-center p-6">
      <div className="w-full max-w-sm space-y-4 rounded-2xl border bg-card p-6 text-center shadow-soft">
        <img src="/logo-mahory.png" alt="Mahory Kids" className="mx-auto size-24 object-contain" />
        {alreadyReset ? (
          <>
            <h1 className="font-display text-lg font-semibold">No pudimos cargar su cuenta</h1>
            <p className="text-sm text-muted-foreground">
              Avise a quien administra el sistema para que revise su usuario.
            </p>
            {error && (
              <p className="break-words rounded-lg bg-muted p-2 text-left text-xs text-muted-foreground">
                {error}
              </p>
            )}
            <div className="grid gap-2">
              <Button
                className="rounded-xl"
                onClick={() => void queryClient.invalidateQueries({ queryKey: ["auth"] })}
              >
                Reintentar
              </Button>
              <Button variant="outline" className="rounded-xl" onClick={onSignOut}>
                Cerrar sesión
              </Button>
            </div>
          </>
        ) : (
          <>
            <h1 className="font-display text-lg font-semibold">Un momento…</h1>
            <p className="text-sm text-muted-foreground">Estamos preparando su cuenta.</p>
          </>
        )}
      </div>
    </div>
  );
}
