import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { getDefaultStoreId } from "@/lib/store";

export type Supplier = {
  id: string;
  name: string;
  tax_id: string | null;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  is_active: boolean;
};

export type SupplierFormValues = {
  name: string;
  tax_id: string;
  contact_name: string;
  phone: string;
  email: string;
  address: string;
  notes: string;
  is_active: boolean;
};

export function useSuppliersAdmin(search: string) {
  return useQuery({
    queryKey: ["suppliers", "list", search.trim()],
    queryFn: async () => {
      let query = supabase
        .from("suppliers")
        .select("id, name, tax_id, contact_name, phone, email, address, notes, is_active")
        .order("name")
        .limit(300);

      const term = search.trim();
      if (term) {
        query = query.or(`name.ilike.%${term}%,tax_id.ilike.%${term}%,contact_name.ilike.%${term}%`);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as Supplier[];
    },
    staleTime: 15_000,
  });
}

export function useSaveSupplier(supplierId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (values: SupplierFormValues) => {
      const payload = {
        name: values.name.trim(),
        tax_id: values.tax_id.trim() || null,
        contact_name: values.contact_name.trim() || null,
        phone: values.phone.trim() || null,
        email: values.email.trim() || null,
        address: values.address.trim() || null,
        notes: values.notes.trim() || null,
        is_active: values.is_active,
      };

      if (supplierId) {
        const { error } = await supabase.from("suppliers").update(payload).eq("id", supplierId);
        if (error) throw error;
        return;
      }

      const store_id = await getDefaultStoreId();
      const { error } = await supabase.from("suppliers").insert({ ...payload, store_id });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["suppliers"] });
    },
  });
}

export function useDeleteSupplier() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("suppliers").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["suppliers"] }),
  });
}

export type SupplierPurchase = {
  id: string;
  number: number;
  status: string;
  total: number;
  created_at: string;
};

export function useSupplierPurchases(supplierId: string | null) {
  return useQuery({
    queryKey: ["suppliers", "purchases", supplierId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchases")
        .select("id, number, status, total, created_at")
        .eq("supplier_id", supplierId as string)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []).map((p) => ({ ...p, total: Number(p.total) })) as SupplierPurchase[];
    },
    enabled: Boolean(supplierId),
    staleTime: 15_000,
  });
}
