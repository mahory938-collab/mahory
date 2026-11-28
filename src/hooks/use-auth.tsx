import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Session, User } from "@supabase/supabase-js";
import { createContext, useContext, useEffect, useMemo, type ReactNode } from "react";

import { supabase } from "@/integrations/supabase/client";
import type { AppRole, Permission } from "@/lib/permissions";
import { roleHasPermission } from "@/lib/permissions";

export type AuthProfile = {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  avatar_url: string | null;
  store_id: string | null;
  is_active: boolean;
};

type AuthState = {
  isLoading: boolean;
  user: User | null;
  session: Session | null;
  profile: AuthProfile | null;
  role: AppRole | null;
  /** Motivo técnico si no se pudo cargar el perfil o el rol. */
  accountError: string | null;
  can: (permission: Permission) => boolean;
  isAdmin: boolean;
};

const AuthContext = createContext<AuthState | null>(null);

/** Ninguna carga de la cuenta puede quedarse colgada: si tarda demasiado, falla y se reintenta. */
function withTimeout<T>(promise: PromiseLike<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("La conexión tardó demasiado")), ms);
    Promise.resolve(promise).then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
}

async function fetchSession() {
  const { data } = await withTimeout(supabase.auth.getSession(), 10_000);
  return data.session ?? null;
}

export const accountQueryKey = (userId: string | null) => ["auth", "account", userId] as const;

export async function fetchAccount(userId: string) {
  return withTimeout(loadAccount(userId), 12_000);
}

async function loadAccount(userId: string) {
  const [profileRes, rolesRes, roleRpcRes] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, full_name, email, phone, avatar_url, store_id, is_active")
      .eq("id", userId)
      .maybeSingle(),
    supabase.from("user_roles").select("role").eq("user_id", userId),
    supabase.rpc("current_role_name"),
  ]);

  if (profileRes.error) {
    throw new Error(`Error cargando perfil: ${profileRes.error.message}`);
  }

  if (rolesRes.error && roleRpcRes.error) {
    throw new Error(`Error cargando rol: ${rolesRes.error.message}`);
  }

  const roles = (rolesRes.data ?? []).map((r) => r.role as AppRole);
  const roleFromRpc = (roleRpcRes.data as AppRole | null) ?? null;
  const roleFromTable: AppRole | null = roles.includes("super_admin")
    ? "super_admin"
    : roles.includes("admin")
      ? "admin"
      : roles.includes("vendedor")
        ? "vendedor"
        : null;

  const role = roleFromRpc ?? roleFromTable;

  return { profile: (profileRes.data as AuthProfile | null) ?? null, role };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();

  const sessionQuery = useQuery({
    queryKey: ["auth", "session"],
    queryFn: fetchSession,
    staleTime: 30_000,
  });

  const userId = sessionQuery.data?.user?.id ?? null;

  const accountQuery = useQuery({
    queryKey: accountQueryKey(userId),
    queryFn: () => fetchAccount(userId as string),
    enabled: Boolean(userId),
    staleTime: 60_000,
    retry: 4,
    retryDelay: (attempt) => Math.min(800 * 2 ** attempt, 6000),
  });

  useEffect(() => {
    // Supabase avisa cada cambio de sesión. La sesión nueva viene en el aviso: se guarda tal cual,
    // sin volver a pedirla (pedirla dentro del aviso puede dejar la app esperando para siempre).
    // Lo demás se recarga en el siguiente turno, fuera del aviso.
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      const previous = queryClient.getQueryData<Session | null>(["auth", "session"]);
      queryClient.setQueryData(["auth", "session"], session ?? null);

      const previousId = previous?.user?.id ?? null;
      const nextId = session?.user?.id ?? null;
      setTimeout(() => {
        if (event === "SIGNED_OUT") {
          queryClient.removeQueries({ queryKey: ["auth", "account"] });
          return;
        }
        if (previousId !== nextId) {
          // Entró otra persona: todo lo que hay en pantalla es de la anterior.
          void queryClient.invalidateQueries();
        } else if (event === "USER_UPDATED") {
          void queryClient.invalidateQueries({ queryKey: ["auth", "account"] });
        }
      }, 0);
    });
    return () => data.subscription.unsubscribe();
  }, [queryClient]);

  const value = useMemo<AuthState>(() => {
    const role = accountQuery.data?.role ?? null;
    return {
      isLoading:
        sessionQuery.isLoading ||
        (Boolean(userId) &&
          (accountQuery.isPending || (!accountQuery.data && accountQuery.isFetching))),
      session: sessionQuery.data ?? null,
      user: sessionQuery.data?.user ?? null,
      profile: accountQuery.data?.profile ?? null,
      role,
      accountError: accountQuery.error ? accountQuery.error.message : null,
      can: (permission: Permission) => roleHasPermission(role, permission),
      isAdmin: role === "admin" || role === "super_admin",
    };
  }, [
    sessionQuery.data,
    sessionQuery.isLoading,
    accountQuery.data,
    accountQuery.isPending,
    accountQuery.isFetching,
    accountQuery.error,
    userId,
  ]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    return {
      isLoading: true,
      user: null,
      session: null,
      profile: null,
      role: null,
      accountError: null,
      can: () => false,
      isAdmin: false,
    };
  }
  return ctx;
}

/** Sign out with full cache teardown. */
export function useSignOut(onDone?: () => void) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      await queryClient.cancelQueries();
      queryClient.clear();
      await supabase.auth.signOut();
    },
    onSuccess: () => onDone?.(),
  });
}
