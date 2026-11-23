import { supabase } from "@/integrations/supabase/client";

/**
 * Limpia la sesión guardada en este navegador (lo mismo que "borrar datos del sitio") y lleva
 * al inicio de sesión. Solo toca lo de la sesión; no borra, por ejemplo, el celular vinculado.
 */
export async function resetLocalSession() {
  try {
    await supabase.auth.signOut();
  } catch {
    // aunque falle el cierre en el servidor, se limpia igual lo local
  }
  try {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith("sb-")) localStorage.removeItem(key);
    }
  } catch {
    // almacenamiento no disponible
  }
  window.location.assign("/auth");
}
