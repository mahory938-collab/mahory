import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";

export type PosProduct = {
  id: string;
  name: string;
  barcode: string | null;
  sku: string | null;
  price: number;
  cost: number;
  tax_rate: number;
  stock: number;
  image_url: string | null;
  category_id: string | null;
};

export function usePosCategories() {
  return useQuery({
    queryKey: ["pos", "categories"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("categories")
        .select("id, name")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data;
    },
    staleTime: 5 * 60_000,
  });
}

export function usePosProducts(search: string, categoryId: string | null) {
  return useQuery({
    queryKey: ["pos", "products", search.trim(), categoryId],
    queryFn: async () => {
      let query = supabase
        .from("products")
        .select("id, name, barcode, sku, price, cost, tax_rate, stock, image_url, category_id")
        .eq("status", "active")
        .order("name")
        .limit(2000);

      const term = search.trim();
      if (term) {
        query = query.or(
          `name.ilike.%${term}%,barcode.ilike.%${term}%,sku.ilike.%${term}%`,
        );
      }
      if (categoryId) query = query.eq("category_id", categoryId);

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []).map((p) => ({
        ...p,
        price: Number(p.price),
        cost: Number(p.cost),
        tax_rate: Number(p.tax_rate),
        stock: Number(p.stock),
      })) as PosProduct[];
    },
    staleTime: 15_000,
  });
}

/** Exact lookup used by the barcode scanner path. */
export async function findProductByCode(code: string): Promise<PosProduct | null> {
  const { data, error } = await supabase
    .from("products")
    .select("id, name, barcode, sku, price, cost, tax_rate, stock, image_url, category_id")
    .eq("status", "active")
    .or(`barcode.eq.${code},sku.eq.${code}`)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    ...data,
    price: Number(data.price),
    cost: Number(data.cost),
    tax_rate: Number(data.tax_rate),
    stock: Number(data.stock),
  } as PosProduct;
}
