import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import {
  createUserAccount,
  deleteUserAccount,
  updateUserAccount,
  updateUserRoleAccount,
} from "@/features/users/user-server-actions";
import type { AppRole } from "@/lib/permissions";

export type AppUser = {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  is_active: boolean;
  created_at: string;
  role: AppRole | null;
};

export function useUsersList() {
  return useQuery({
    queryKey: ["users", "list"],
    queryFn: async () => {
      const [profilesRes, rolesRes] = await Promise.all([
        supabase
          .from("profiles")
          .select("id, full_name, email, phone, is_active, created_at")
          .order("created_at"),
        supabase.from("user_roles").select("user_id, role"),
      ]);
      if (profilesRes.error) throw profilesRes.error;
      if (rolesRes.error) throw rolesRes.error;

      const roleMap = new Map((rolesRes.data ?? []).map((r) => [r.user_id, r.role as AppRole]));
      return (profilesRes.data ?? []).map((p) => ({
        ...p,
        role: roleMap.get(p.id) ?? null,
      })) as AppUser[];
    },
    staleTime: 15_000,
  });
}

async function getAccessToken(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Sesión expirada. Inicie sesión nuevamente.");
  return token;
}

export function useCreateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { email: string; password: string; fullName: string; role: AppRole }) => {
      const accessToken = await getAccessToken();
      return createUserAccount({ data: { accessToken, ...input } });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["users"] }),
  });
}

export function useUpdateUserRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { userId: string; role: AppRole }) => {
      const accessToken = await getAccessToken();
      return updateUserRoleAccount({ data: { accessToken, ...input } });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["users"] }),
  });
}

export function useDeleteUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (userId: string) => {
      const accessToken = await getAccessToken();
      return deleteUserAccount({ data: { accessToken, userId } });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["users"] }),
  });
}

export function useToggleUserActive() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { userId: string; isActive: boolean }) => {
      const { error } = await supabase
        .from("profiles")
        .update({ is_active: input.isActive })
        .eq("id", input.userId);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["users"] }),
  });
}

export function useUpdateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      userId: string;
      fullName: string;
      email: string;
      phone: string;
    }) => {
      const accessToken = await getAccessToken();
      return updateUserAccount({ data: { accessToken, ...input } });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["users"] }),
  });
}
