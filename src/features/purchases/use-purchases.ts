import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { getDefaultStoreId } from "@/lib/store";

export type PurchaseStatus = "borrador" | "recibida" | "anulada";

export type PurchaseListItem = {
  id: string;
  number: number;
  status: PurchaseStatus;
  total: number;
  created_at: string;
  received_at: string | null;
  supplier_name: string | null;
};

export function usePurchasesList(filters: { status: PurchaseStatus | "all"; search: string }) {
  return useQuery({
    queryKey: ["purchases", "list", filters],
    queryFn: async () => {
      let query = supabase
        .from("purchases")
        .select("id, number, status, total, created_at, received_at, suppliers(name)")
        .order("created_at", { ascending: false })
        .limit(200);

      if (filters.status !== "all") query = query.eq("status", filters.status);

      const { data, error } = await query;
      if (error) throw error;

      const rows = (data ?? []) as unknown as Array<
        Omit<PurchaseListItem, "supplier_name" | "total"> & {
          total: number | string;
          suppliers: { name: string } | null;
        }
      >;
      let mapped = rows.map((p) => ({
        ...p,
        total: Number(p.total),
        supplier_name: p.suppliers?.name ?? null,
      })) satisfies PurchaseListItem[];

      const term = filters.search.trim().toLowerCase();
      if (term) {
        mapped = mapped.filter(
          (p) =>
            String(p.number).includes(term) || (p.supplier_name ?? "").toLowerCase().includes(term),
        );
      }

      return mapped;
    },
    staleTime: 15_000,
  });
}

export type PurchaseItemDetail = {
  id: string;
  product_id: string;
  quantity: number;
  unit_cost: number;
  total: number;
  product_name: string;
};

export type PurchaseDetail = {
  id: string;
  number: number;
  status: PurchaseStatus;
  subtotal: number;
  tax_total: number;
  total: number;
  notes: string | null;
  created_at: string;
  received_at: string | null;
  supplier_name: string | null;
  items: PurchaseItemDetail[];
};

export function usePurchaseDetail(purchaseId: string | null) {
  return useQuery({
    queryKey: ["purchases", "detail", purchaseId],
    queryFn: async (): Promise<PurchaseDetail> => {
      const [purchaseRes, itemsRes] = await Promise.all([
        supabase
          .from("purchases")
          .select(
            "id, number, status, subtotal, tax_total, total, notes, created_at, received_at, suppliers(name)",
          )
          .eq("id", purchaseId as string)
          .single(),
        supabase
          .from("purchase_items")
          .select("id, product_id, quantity, unit_cost, total, products(name)")
          .eq("purchase_id", purchaseId as string)
          .order("created_at"),
      ]);
      if (purchaseRes.error) throw purchaseRes.error;
      if (itemsRes.error) throw itemsRes.error;

      const purchase = purchaseRes.data as unknown as PurchaseDetail & {
        suppliers: { name: string } | null;
      };
      const items = (itemsRes.data ?? []) as unknown as Array<
        Omit<PurchaseItemDetail, "product_name"> & { products: { name: string } | null }
      >;

      return {
        ...purchase,
        subtotal: Number(purchase.subtotal),
        tax_total: Number(purchase.tax_total),
        total: Number(purchase.total),
        supplier_name: purchase.suppliers?.name ?? null,
        items: items.map((item) => ({
          ...item,
          quantity: Number(item.quantity),
          unit_cost: Number(item.unit_cost),
          total: Number(item.total),
          product_name: item.products?.name ?? "—",
        })),
      };
    },
    enabled: Boolean(purchaseId),
  });
}

export type PurchaseLineInput = {
  productId: string;
  quantity: number;
  unitCost: number;
};

export function useCreatePurchase() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      supplierId: string | null;
      notes: string;
      lines: PurchaseLineInput[];
    }) => {
      if (!input.lines.length) throw new Error("Agregue al menos un producto");

      const {
        data: { user },
      } = await supabase.auth.getUser();
      const store_id = await getDefaultStoreId();

      const subtotal = input.lines.reduce((sum, l) => sum + l.quantity * l.unitCost, 0);

      const { data: purchase, error } = await supabase
        .from("purchases")
        .insert({
          store_id,
          supplier_id: input.supplierId,
          notes: input.notes.trim() || null,
          status: "borrador",
          subtotal: Math.round(subtotal),
          tax_total: 0,
          total: Math.round(subtotal),
          created_by: user?.id ?? null,
        })
        .select("id, number")
        .single();
      if (error) throw error;

      const { error: itemsError } = await supabase.from("purchase_items").insert(
        input.lines.map((line) => ({
          purchase_id: purchase.id,
          product_id: line.productId,
          quantity: line.quantity,
          unit_cost: line.unitCost,
          total: Math.round(line.quantity * line.unitCost),
        })),
      );
      if (itemsError) throw itemsError;

      return purchase;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["purchases"] }),
  });
}

export type PurchasePaymentMethod = "efectivo" | "transferencia" | "credito";

export function useReceivePurchase() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      purchaseId: string;
      total: number;
      number: number;
      paymentMethod: PurchasePaymentMethod;
      cashSessionId: string | null;
    }) => {
      const { purchaseId, total, number, paymentMethod, cashSessionId } = input;
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const { data: items, error: itemsError } = await supabase
        .from("purchase_items")
        .select("product_id, quantity, unit_cost")
        .eq("purchase_id", purchaseId);
      if (itemsError) throw itemsError;

      // Uno por uno (no en paralelo): si el mismo producto aparece dos veces, cada paso lee el
      // stock que dejó el anterior y no se pierde ninguna cantidad.
      for (const item of items ?? []) {
        const { data: product, error: productError } = await supabase
          .from("products")
          .select("stock")
          .eq("id", item.product_id)
          .single();
        if (productError) throw productError;

        const stockBefore = Number(product.stock);
        const quantity = Number(item.quantity);
        const stockAfter = stockBefore + quantity;

        const { error: updateError } = await supabase
          .from("products")
          .update({ stock: stockAfter, cost: item.unit_cost })
          .eq("id", item.product_id);
        if (updateError) throw updateError;

        const { error: moveError } = await supabase.from("inventory_movements").insert({
          product_id: item.product_id,
          type: "compra",
          quantity,
          stock_before: stockBefore,
          stock_after: stockAfter,
          unit_cost: item.unit_cost,
          reference_type: "purchase",
          reference_id: purchaseId,
          created_by: user?.id ?? null,
        });
        if (moveError) throw moveError;
      }

      const { error: receiveError } = await supabase
        .from("purchases")
        .update({ status: "recibida", received_at: new Date().toISOString() })
        .eq("id", purchaseId);
      if (receiveError) throw receiveError;

      // Cash-paid purchases are a real cash-drawer outflow — log it as an
      // egreso so "esperado en caja" reflects money actually paid out.
      if (paymentMethod === "efectivo" && cashSessionId) {
        const { error: movementError } = await supabase.from("cash_movements").insert({
          cash_session_id: cashSessionId,
          type: "egreso",
          amount: total,
          concept: `Compra #${number}`,
          created_by: user?.id ?? null,
        });
        if (movementError) throw movementError;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["purchases"] });
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["pos", "products"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["cash"] });
    },
  });
}

export function usePurchaseProductSearch(search: string) {
  return useQuery({
    queryKey: ["purchases", "product-search", search.trim()],
    queryFn: async () => {
      const term = search.trim();
      if (!term) return [];
      const { data, error } = await supabase
        .from("products")
        .select("id, name, sku, barcode, cost")
        .or(`name.ilike.%${term}%,barcode.ilike.%${term}%,sku.ilike.%${term}%`)
        .order("name")
        .limit(20);
      if (error) throw error;
      return (data ?? []).map((p) => ({ ...p, cost: Number(p.cost) }));
    },
    staleTime: 15_000,
  });
}
