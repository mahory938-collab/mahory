/**
 * Limpieza silenciosa al abrir la app: hace lo mismo que "borrar caché" pero sin cerrar la
 * sesión ni perder ajustes. Corre en segundo plano, una vez por carga de página, y si algo
 * falla simplemente se omite (nunca bloquea ni muestra errores).
 *
 * Se conserva:
 *  - la sesión de Supabase de ESTE proyecto (para no tener que volver a iniciar sesión),
 *  - el celular vinculado como lector y su modo,
 *  - el tema (claro/oscuro).
 * Se borra: restos de versiones anteriores en el almacenamiento, la caché del navegador
 * (Cache Storage) y cualquier service worker viejo.
 */
const KEEP_KEYS = new Set(["mahory-scanner-device", "mahory-scanner-mode", "pos-theme"]);

function currentSupabaseRef(): string | null {
  try {
    const url = import.meta.env["VITE_SUPABASE_URL"] as string | undefined;
    return url ? (new URL(url).hostname.split(".")[0] ?? null) : null;
  } catch {
    return null;
  }
}

function cleanLocalStorage() {
  const ref = currentSupabaseRef();
  const keepSession = ref ? `sb-${ref}-` : "sb-";
  for (const key of Object.keys(localStorage)) {
    if (KEEP_KEYS.has(key)) continue;
    if (key.startsWith(keepSession)) continue;
    localStorage.removeItem(key);
  }
}

async function cleanBrowserCaches() {
  if ("caches" in window) {
    const names = await caches.keys();
    await Promise.all(names.map((name) => caches.delete(name)));
  }
  if ("serviceWorker" in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((registration) => registration.unregister()));
  }
}

/** Limpieza inmediata (la usa el inicio de sesión). Nunca lanza errores. */
export async function cleanupNow() {
  try {
    cleanLocalStorage();
  } catch {
    // almacenamiento no disponible
  }
  try {
    await cleanBrowserCaches();
  } catch {
    // caché no disponible
  }
}

/** La misma limpieza, de inmediato (por ejemplo al iniciar sesión). */
export function runCleanupNow() {
  try {
    cleanLocalStorage();
  } catch {
    // almacenamiento no disponible
  }
  void cleanBrowserCaches().catch(() => undefined);
}

export function scheduleStartupCleanup() {
  const run = () => {
    try {
      cleanLocalStorage();
    } catch {
      // almacenamiento no disponible
    }
    void cleanBrowserCaches().catch(() => undefined);
  };
  // En segundo plano, cuando el navegador esté libre, para no demorar la carga.
  const idle = (window as Window & { requestIdleCallback?: (cb: () => void) => number })
    .requestIdleCallback;
  if (idle) idle(run);
  else setTimeout(run, 1500);
}
