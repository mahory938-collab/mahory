import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

import { supabase } from "@/integrations/supabase/client";

/**
 * Pantallas con sesión iniciada. Solo en el navegador, porque la sesión de Supabase vive en
 * localStorage.
 *
 * Un corte de red NUNCA debe sacar a nadie al inicio de sesión: solo se cierra la sesión cuando
 * el servidor dice explícitamente que ya no es válida o que el usuario está desactivado.
 */
export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data: sessionData } = await supabase.auth.getSession();
    const session = sessionData.session;
    if (!session) throw redirect({ to: "/auth" });

    const { data, error } = await supabase.auth.getUser();
    if (error) {
      const status = (error as { status?: number }).status;
      if (status === 401 || status === 403) {
        await supabase.auth.signOut();
        throw redirect({ to: "/auth" });
      }
      // Sin conexión o servidor lento: se sigue con la sesión guardada.
      return { user: session.user };
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("is_active")
      .eq("id", data.user.id)
      .maybeSingle();
    if (!profileError && profile && !profile.is_active) {
      await supabase.auth.signOut();
      throw redirect({ to: "/auth" });
    }

    return { user: data.user };
  },
  component: () => <Outlet />,
});
