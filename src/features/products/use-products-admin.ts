import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { getDefaultStoreId } from "@/lib/store";

export type AdminProduct = {
  id: string;
  name: string;
  barcode: string | null;
  sku: string | null;
  description: string | null;
  category_id: string | null;
  brand_id: string | null;
  supplier_id: string | null;
  cost: number;
  price: number;
  wholesale_price: number;
  tax_rate: number;
  stock: number;
  min_stock: number;
  unit: string;
  image_url: string | null;
  status: "active" | "inactive";
  category_name: string | null;
  brand_name: string | null;
  supplier_name: string | null;
};

export type ProductFormValues = {
  name: string;
  barcode: string;
  sku: string;
  description: string;
  category_id: string | null;
  brand_id: string | null;
  supplier_id: string | null;
  cost: number;
  price: number;
  wholesale_price: number;
  stock: number;
  min_stock: number;
  image_url: string | null;
  status: "active" | "inactive";
};

export function useAdminProducts(search: string) {
  return useQuery({
    queryKey: ["products", "admin", search.trim()],
    queryFn: async () => {
      let query = supabase
        .from("products")
        .select(
          "id, name, barcode, sku, description, category_id, brand_id, supplier_id, cost, price, wholesale_price, tax_rate, stock, min_stock, unit, image_url, status, categories(name), brands(name), suppliers(name)",
        )
        .order("name")
        .limit(200);

      const term = search.trim();
      if (term) {
        query = query.or(`name.ilike.%${term}%,barcode.ilike.%${term}%,sku.ilike.%${term}%`);
      }

      const { data, error } = await query;
      if (error) throw error;
      const rows = (data ?? []) as unknown as Array<
        Omit<AdminProduct, "category_name" | "brand_name" | "supplier_name"> & {
          categories: { name: string } | null;
          brands: { name: string } | null;
          suppliers: { name: string } | null;
        }
      >;
      return rows.map((p) => ({
        ...p,
        cost: Number(p.cost),
        price: Number(p.price),
        wholesale_price: Number(p.wholesale_price),
        tax_rate: Number(p.tax_rate),
        stock: Number(p.stock),
        min_stock: Number(p.min_stock),
        category_name: p.categories?.name ?? null,
        brand_name: p.brands?.name ?? null,
        supplier_name: p.suppliers?.name ?? null,
      })) satisfies AdminProduct[];
    },
    staleTime: 15_000,
  });
}

/** Checks if a scanned barcode is already registered on another product. */
export function useProductByBarcode(barcode: string) {
  const term = barcode.trim();
  return useQuery({
    queryKey: ["products", "by-barcode", term],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, stock")
        .eq("barcode", term)
        .maybeSingle();
      if (error) throw error;
      return data ? { ...data, stock: Number(data.stock) } : null;
    },
    enabled: term.length > 0,
    staleTime: 5_000,
  });
}

export type ProductNameSuggestion = {
  name: string;
  category_id: string | null;
  brand_id: string | null;
  supplier_id: string | null;
  cost: number;
  price: number;
  wholesale_price: number;
  min_stock: number;
  status: "active" | "inactive";
};

/** Every distinct product name already in the catalog, one row per name
 *  (first occurrence wins for the template fields). Fetched once so a
 *  combobox can filter it client-side instantly instead of round-tripping
 *  per keystroke. Picking one pre-fills price/cost/category/brand so only
 *  the barcode and stock need entering for a new variant. */
export function useProductNameCatalog() {
  return useQuery({
    queryKey: ["products", "name-catalog"],
    queryFn: async (): Promise<ProductNameSuggestion[]> => {
      const { data, error } = await supabase
        .from("products")
        .select(
          "name, category_id, brand_id, supplier_id, cost, price, wholesale_price, min_stock, status",
        )
        .order("name")
        .limit(1000);
      if (error) throw error;

      const byName = new Map<string, ProductNameSuggestion>();
      for (const row of data ?? []) {
        if (!byName.has(row.name)) {
          byName.set(row.name, {
            ...row,
            cost: Number(row.cost),
            price: Number(row.price),
            wholesale_price: Number(row.wholesale_price),
            min_stock: Number(row.min_stock),
          });
        }
      }
      return [...byName.values()];
    },
    staleTime: 30_000,
  });
}

export function useCategories() {
  return useQuery({
    queryKey: ["categories"],
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

export function useBrands() {
  return useQuery({
    queryKey: ["brands"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("brands")
        .select("id, name")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data;
    },
    staleTime: 5 * 60_000,
  });
}

export function useSuppliers() {
  return useQuery({
    queryKey: ["suppliers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("suppliers")
        .select("id, name")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data;
    },
    staleTime: 5 * 60_000,
  });
}

export function useSaveProduct(productId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (values: ProductFormValues) => {
      const payload = {
        name: values.name.trim(),
        barcode: values.barcode.trim() || null,
        sku: values.sku.trim() || null,
        description: values.description.trim() || null,
        category_id: values.category_id,
        brand_id: values.brand_id,
        supplier_id: values.supplier_id,
        cost: values.cost,
        price: values.price,
        wholesale_price: values.wholesale_price,
        stock: values.stock,
        min_stock: values.min_stock,
        image_url: values.image_url,
        status: values.status,
      };

      if (productId) {
        const { error } = await supabase.from("products").update(payload).eq("id", productId);
        if (error) throw error;
        return;
      }

      const store_id = await getDefaultStoreId();
      const { data: product, error } = await supabase
        .from("products")
        .insert({ ...payload, store_id })
        .select("id")
        .single();
      if (error) throw error;

      // Initial stock loaded at creation counts as an investment, same as a
      // received purchase — leave a dated, costed kardex trail for reports.
      if (values.stock > 0) {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        const { error: moveError } = await supabase.from("inventory_movements").insert({
          product_id: product.id,
          type: "entrada",
          quantity: values.stock,
          stock_before: 0,
          stock_after: values.stock,
          unit_cost: values.cost,
          reason: "Stock inicial al crear el producto",
          reference_type: "product_creation",
          created_by: user?.id ?? null,
        });
        if (moveError) throw moveError;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["pos", "products"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

export type ProductFamilyShared = {
  name: string;
  category_id: string | null;
  brand_id: string | null;
  supplier_id: string | null;
  description: string;
  image_url: string | null;
  status: "active" | "inactive";
};

export type ProductFamilyVariant = {
  id: string | null;
  barcode: string;
  sku: string;
  cost: number;
  price: number;
  wholesale_price: number;
  stock: number;
  min_stock: number;
};

/**
 * One product "name" can have many barcodes (sizes, colors). Saves the
 * fields shared across the whole family (name, category, brand, etc. — the
 * same for every barcode) plus each variant's own barcode/price/stock,
 * in one go: updates existing rows, inserts new barcodes, deletes removed
 * ones. New variants with stock get the same initial-investment kardex
 * entry as a brand-new product.
 */
export function useSaveProductFamily() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      shared: ProductFamilyShared;
      variants: ProductFamilyVariant[];
      deletedIds: string[];
    }) => {
      const sharedPayload = {
        name: input.shared.name.trim(),
        category_id: input.shared.category_id,
        brand_id: input.shared.brand_id,
        supplier_id: input.shared.supplier_id,
        description: input.shared.description.trim() || null,
        image_url: input.shared.image_url,
        status: input.shared.status,
      };

      const {
        data: { user },
      } = await supabase.auth.getUser();
      const store_id = await getDefaultStoreId();

      for (const variant of input.variants) {
        const payload = {
          ...sharedPayload,
          barcode: variant.barcode.trim() || null,
          sku: variant.sku.trim() || null,
          cost: variant.cost,
          price: variant.price,
          wholesale_price: variant.wholesale_price,
          stock: variant.stock,
          min_stock: variant.min_stock,
        };

        if (variant.id) {
          const { error } = await supabase.from("products").update(payload).eq("id", variant.id);
          if (error) throw error;
          continue;
        }

        const { data: created, error } = await supabase
          .from("products")
          .insert({ ...payload, store_id })
          .select("id")
          .single();
        if (error) throw error;

        if (variant.stock > 0) {
          const { error: moveError } = await supabase.from("inventory_movements").insert({
            product_id: created.id,
            type: "entrada",
            quantity: variant.stock,
            stock_before: 0,
            stock_after: variant.stock,
            unit_cost: variant.cost,
            reason: "Stock inicial al crear el producto",
            reference_type: "product_creation",
            created_by: user?.id ?? null,
          });
          if (moveError) throw moveError;
        }
      }

      if (input.deletedIds.length) {
        const { error } = await supabase.from("products").delete().in("id", input.deletedIds);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["pos", "products"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["reports"] });
    },
  });
}

export function useDeleteProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("products").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["pos", "products"] });
    },
  });
}
