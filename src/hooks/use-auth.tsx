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
  can: (permission: Permission) => boolean;
  isAdmin: boolean;
};

const AuthContext = createContext<AuthState | null>(null);

async function fetchSession() {
  const { data } = await supabase.auth.getSession();
  return data.session ?? null;
}

async function fetchAccount(userId: string) {
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
    queryKey: ["auth", "account", userId],
    queryFn: () => fetchAccount(userId as string),
    enabled: Boolean(userId),
    staleTime: 60_000,
  });

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;
      queryClient.invalidateQueries({ queryKey: ["auth"] });
      if (event !== "SIGNED_OUT") queryClient.invalidateQueries();
    });
    return () => data.subscription.unsubscribe();
  }, [queryClient]);

  const value = useMemo<AuthState>(() => {
    const role = accountQuery.data?.role ?? null;
    return {
      isLoading: sessionQuery.isLoading || (Boolean(userId) && accountQuery.isLoading),
      session: sessionQuery.data ?? null,
      user: sessionQuery.data?.user ?? null,
      profile: accountQuery.data?.profile ?? null,
      role,
      can: (permission: Permission) => roleHasPermission(role, permission),
      isAdmin: role === "admin" || role === "super_admin",
    };
  }, [sessionQuery.data, sessionQuery.isLoading, accountQuery.data, accountQuery.isLoading, userId]);

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
