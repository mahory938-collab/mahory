import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider } from "@/hooks/use-auth";
import { resetLocalSession } from "@/lib/session-reset";
import { scheduleStartupCleanup } from "@/lib/startup-cleanup";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();

  // Primer fallo en esta pestaña: se recarga sola una vez (casi siempre basta). Si vuelve a
  // fallar, se muestran las opciones.
  const autoReloaded = (() => {
    try {
      return sessionStorage.getItem("mahory-error-reload") === "1";
    } catch {
      return true;
    }
  })();
  useEffect(() => {
    if (autoReloaded) return;
    const timer = setTimeout(() => {
      try {
        sessionStorage.setItem("mahory-error-reload", "1");
      } catch {
        // almacenamiento no disponible
      }
      window.location.reload();
    }, 800);
    return () => clearTimeout(timer);
  }, [autoReloaded]);

  // Si la página volvió a cargar bien, la próxima vez se vuelve a permitir el reintento automático.
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        sessionStorage.removeItem("mahory-error-reload");
      } catch {
        // almacenamiento no disponible
      }
    }, 20000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          {autoReloaded ? "Esta pantalla no cargó" : "Un momento…"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {autoReloaded
            ? "Algo falló de nuestro lado. Intente de nuevo; si sigue igual, cierre sesión y vuelva a entrar."
            : "Estamos volviendo a cargar la pantalla."}
        </p>
        {autoReloaded && (
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <button
              onClick={() => {
                router.invalidate();
                reset();
              }}
              className="inline-flex items-center justify-center rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Reintentar
            </button>
            <button
              onClick={() => void resetLocalSession()}
              className="inline-flex items-center justify-center rounded-xl border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
            >
              Cerrar sesión y entrar de nuevo
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Mahory" },
      {
        name: "description",
        content:
          "Mahory — Viste con amor, brilla con estilo. Sistema de punto de venta para tu tienda.",
      },
      { property: "og:title", content: "Mahory" },
      {
        property: "og:description",
        content:
          "Mahory — Viste con amor, brilla con estilo. Sistema de punto de venta para tu tienda.",
      },
      { property: "og:type", content: "website" },
      { property: "og:image", content: "https://mahory.vercel.app/logo-mahory.jpg" },
      { name: "twitter:image", content: "https://mahory.vercel.app/logo-mahory.jpg" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Mahory" },
      {
        name: "twitter:description",
        content:
          "Mahory — Viste con amor, brilla con estilo. Sistema de punto de venta para tu tienda.",
      },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Sora:wght@400;500;600;700&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap",
      },
      { rel: "icon", href: "/favicon.ico", type: "image/x-icon" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  // A stale tab requesting a route chunk from a build that's since been
  // redeployed 404s with "Failed to fetch dynamically imported module".
  // Reload once to pick up the current build instead of showing the error
  // screen; the session flag stops a genuinely broken deploy from looping.
  // Al abrir la app: limpieza silenciosa de caché y restos viejos (sin cerrar la sesión).
  useEffect(() => {
    scheduleStartupCleanup();
  }, []);

  useEffect(() => {
    const RELOAD_KEY = "bp-pos-chunk-reload";
    const handlePreloadError = (event: Event) => {
      event.preventDefault();
      if (sessionStorage.getItem(RELOAD_KEY)) return;
      sessionStorage.setItem(RELOAD_KEY, "1");
      window.location.reload();
    };
    window.addEventListener("vite:preloadError", handlePreloadError);
    return () => window.removeEventListener("vite:preloadError", handlePreloadError);
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
        <Outlet />
        <Toaster richColors position="top-right" />
      </AuthProvider>
    </QueryClientProvider>
  );
}
