import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";

export type StockFilter = "all" | "low" | "out";

export type InventoryProduct = {
  id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  unit: string;
  stock: number;
  min_stock: number;
  category_name: string | null;
};

export function useInventoryProducts(filter: StockFilter, search: string) {
  return useQuery({
    queryKey: ["inventory", "products", filter, search.trim()],
    queryFn: async () => {
      let query = supabase
        .from("products")
        .select("id, name, sku, barcode, unit, stock, min_stock, categories(name)")
        .eq("status", "active")
        .order("stock", { ascending: true })
        .limit(300);

      const term = search.trim();
      if (term) {
        query = query.or(`name.ilike.%${term}%,barcode.ilike.%${term}%,sku.ilike.%${term}%`);
      }
      if (filter === "out") query = query.lte("stock", 0);

      const { data, error } = await query;
      if (error) throw error;

      const rows = (data ?? []) as unknown as Array<
        Omit<InventoryProduct, "category_name"> & { categories: { name: string } | null }
      >;
      const mapped = rows.map((p) => ({
        ...p,
        stock: Number(p.stock),
        min_stock: Number(p.min_stock),
        category_name: p.categories?.name ?? null,
      })) satisfies InventoryProduct[];

      if (filter === "low") return mapped.filter((p) => p.stock > 0 && p.stock <= p.min_stock);
      return mapped;
    },
    staleTime: 15_000,
  });
}

export type InventoryMovement = {
  id: string;
  type: string;
  quantity: number;
  stock_before: number;
  stock_after: number;
  reason: string | null;
  reference_type: string | null;
  created_at: string;
  product_name: string;
};

export function useInventoryMovements(productId: string | null) {
  return useQuery({
    queryKey: ["inventory", "movements", productId],
    queryFn: async () => {
      let query = supabase
        .from("inventory_movements")
        .select(
          "id, type, quantity, stock_before, stock_after, reason, reference_type, created_at, products(name)",
        )
        .order("created_at", { ascending: false })
        .limit(100);
      if (productId) query = query.eq("product_id", productId);

      const { data, error } = await query;
      if (error) throw error;

      const rows = (data ?? []) as unknown as Array<
        Omit<InventoryMovement, "product_name"> & { products: { name: string } | null }
      >;
      return rows.map((m) => ({
        ...m,
        quantity: Number(m.quantity),
        stock_before: Number(m.stock_before),
        stock_after: Number(m.stock_after),
        product_name: m.products?.name ?? "—",
      })) satisfies InventoryMovement[];
    },
    staleTime: 15_000,
  });
}

export type AdjustmentType = "entrada" | "salida" | "ajuste";

export function useAdjustStock() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      productId: string;
      type: AdjustmentType;
      quantity: number;
      reason: string;
    }) => {
      if (input.quantity < 0 || !Number.isFinite(input.quantity)) {
        throw new Error("Ingrese una cantidad válida");
      }

      const { data: product, error: productError } = await supabase
        .from("products")
        .select("stock")
        .eq("id", input.productId)
        .single();
      if (productError) throw productError;

      const stockBefore = Number(product.stock);
      const stockAfter =
        input.type === "entrada"
          ? stockBefore + input.quantity
          : input.type === "salida"
            ? Math.max(0, stockBefore - input.quantity)
            : Math.max(0, input.quantity);

      const {
        data: { user },
      } = await supabase.auth.getUser();

      const { error: updateError } = await supabase
        .from("products")
        .update({ stock: stockAfter })
        .eq("id", input.productId);
      if (updateError) throw updateError;

      const { error: moveError } = await supabase.from("inventory_movements").insert({
        product_id: input.productId,
        type: input.type,
        quantity: Math.abs(stockAfter - stockBefore),
        stock_before: stockBefore,
        stock_after: stockAfter,
        reason: input.reason.trim() || null,
        reference_type: "manual",
        created_by: user?.id ?? null,
      });
      if (moveError) throw moveError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["pos", "products"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}
