import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { getDefaultStoreId } from "@/lib/store";

export type Category = {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
};

export type CategoryFormValues = {
  name: string;
  description: string;
  is_active: boolean;
};

export function useCategoriesAdmin(search: string) {
  return useQuery({
    queryKey: ["categories", "admin", search.trim()],
    queryFn: async () => {
      let query = supabase
        .from("categories")
        .select("id, name, description, is_active")
        .order("name")
        .limit(300);

      const term = search.trim();
      if (term) query = query.ilike("name", `%${term}%`);

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as Category[];
    },
    staleTime: 15_000,
  });
}

export function useSaveCategory(categoryId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (values: CategoryFormValues) => {
      const payload = {
        name: values.name.trim(),
        description: values.description.trim() || null,
        is_active: values.is_active,
      };

      if (categoryId) {
        const { error } = await supabase.from("categories").update(payload).eq("id", categoryId);
        if (error) throw error;
        return;
      }

      const store_id = await getDefaultStoreId();
      const { error } = await supabase.from("categories").insert({ ...payload, store_id });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["categories"] }),
  });
}

export function useDeleteCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("categories").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["categories"] }),
  });
}
