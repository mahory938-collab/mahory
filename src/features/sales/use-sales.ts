import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { adjustCustomerBalance } from "@/features/customers/use-customers";
import { supabase } from "@/integrations/supabase/client";
import { daysAgo } from "@/lib/format";

export type SaleStatus = "completada" | "anulada" | "pendiente" | "credito";

export type SaleListItem = {
  id: string;
  number: number;
  status: SaleStatus;
  customer_name: string | null;
  cashier_name: string | null;
  delivery_type: "mostrador" | "domicilio";
  total: number;
  created_at: string;
};

/** cashier_id -> auth.users.id has no FK to profiles, so PostgREST can't embed it — batch-fetch instead. */
async function fetchCashierNames(cashierIds: (string | null)[]): Promise<Map<string, string>> {
  const ids = [...new Set(cashierIds.filter((id): id is string => Boolean(id)))];
  if (!ids.length) return new Map();

  const { data, error } = await supabase.from("profiles").select("id, full_name").in("id", ids);
  if (error) return new Map();
  return new Map(data.map((p) => [p.id, p.full_name]));
}

export type SalesRange = "today" | "week" | "month" | "all";

export type SalesFilters = {
  range: SalesRange;
  status: SaleStatus | "all";
  search: string;
};

function rangeStart(range: SalesRange): string | null {
  if (range === "today") return daysAgo(0);
  if (range === "week") return daysAgo(7);
  if (range === "month") return daysAgo(30);
  return null;
}

export function useSalesList(filters: SalesFilters) {
  return useQuery({
    queryKey: ["sales", "list", filters],
    queryFn: async () => {
      let query = supabase
        .from("sales")
        .select("id, number, status, customer_name, cashier_id, delivery_type, total, created_at")
        .eq("is_held", false)
        .order("created_at", { ascending: false })
        .limit(200);

      const start = rangeStart(filters.range);
      if (start) query = query.gte("created_at", start);
      if (filters.status !== "all") query = query.eq("status", filters.status);

      const term = filters.search.trim();
      if (term) {
        const asNumber = Number(term);
        query = Number.isFinite(asNumber) && term !== ""
          ? query.or(`number.eq.${asNumber},customer_name.ilike.%${term}%`)
          : query.ilike("customer_name", `%${term}%`);
      }

      const { data, error } = await query;
      if (error) throw error;

      const names = await fetchCashierNames((data ?? []).map((s) => s.cashier_id));
      return (data ?? []).map((s) => ({
        ...s,
        total: Number(s.total),
        cashier_name: s.cashier_id ? (names.get(s.cashier_id) ?? null) : null,
      })) as SaleListItem[];
    },
    staleTime: 15_000,
  });
}

export type SaleItemDetail = {
  id: string;
  product_id: string | null;
  product_name: string;
  quantity: number;
  unit_price: number;
  discount: number;
  tax_rate: number;
  total: number;
};

export type SalePaymentDetail = {
  id: string;
  method: string;
  amount: number;
  reference: string | null;
};

export type SaleDetail = {
  id: string;
  number: number;
  status: SaleStatus;
  customer_name: string | null;
  cashier_name: string | null;
  subtotal: number;
  tax_total: number;
  discount_total: number;
  total: number;
  paid_total: number;
  change_amount: number;
  delivery_type: "mostrador" | "domicilio";
  delivery_address: string | null;
  delivery_fee: number;
  created_at: string;
  items: SaleItemDetail[];
  payments: SalePaymentDetail[];
};

export function useSaleDetail(saleId: string | null) {
  return useQuery({
    queryKey: ["sales", "detail", saleId],
    queryFn: async (): Promise<SaleDetail> => {
      const [saleRes, itemsRes, paymentsRes] = await Promise.all([
        supabase
          .from("sales")
          .select(
            "id, number, status, customer_name, cashier_id, subtotal, tax_total, discount_total, total, paid_total, change_amount, delivery_type, delivery_address, delivery_fee, created_at",
          )
          .eq("id", saleId as string)
          .single(),
        supabase
          .from("sale_items")
          .select("id, product_id, product_name, quantity, unit_price, discount, tax_rate, total")
          .eq("sale_id", saleId as string)
          .order("created_at"),
        supabase
          .from("sale_payments")
          .select("id, method, amount, reference")
          .eq("sale_id", saleId as string),
      ]);
      if (saleRes.error) throw saleRes.error;
      if (itemsRes.error) throw itemsRes.error;
      if (paymentsRes.error) throw paymentsRes.error;

      const sale = saleRes.data;
      const names = await fetchCashierNames([sale.cashier_id]);
      return {
        ...sale,
        cashier_name: sale.cashier_id ? (names.get(sale.cashier_id) ?? null) : null,
        subtotal: Number(sale.subtotal),
        tax_total: Number(sale.tax_total),
        discount_total: Number(sale.discount_total),
        total: Number(sale.total),
        paid_total: Number(sale.paid_total),
        change_amount: Number(sale.change_amount),
        delivery_fee: Number(sale.delivery_fee),
        items: (itemsRes.data ?? []).map((item) => ({
          ...item,
          quantity: Number(item.quantity),
          unit_price: Number(item.unit_price),
          discount: Number(item.discount),
          tax_rate: Number(item.tax_rate),
          total: Number(item.total),
        })),
        payments: (paymentsRes.data ?? []).map((p) => ({ ...p, amount: Number(p.amount) })),
      };
    },
    enabled: Boolean(saleId),
  });
}

export function useVoidSale() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (saleId: string) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const [saleRes, itemsRes, paymentsRes, returnedRes] = await Promise.all([
        supabase.from("sales").select("customer_id").eq("id", saleId).single(),
        supabase.from("sale_items").select("product_id, quantity").eq("sale_id", saleId),
        supabase.from("sale_payments").select("method, amount").eq("sale_id", saleId),
        supabase
          .from("inventory_movements")
          .select("product_id, quantity")
          .eq("reference_type", "sale")
          .eq("reference_id", saleId)
          .eq("type", "devolucion"),
      ]);
      if (saleRes.error) throw saleRes.error;
      if (itemsRes.error) throw itemsRes.error;
      if (paymentsRes.error) throw paymentsRes.error;
      if (returnedRes.error) throw returnedRes.error;
      const items = itemsRes.data;

      // Items already returned individually (before this full void) shouldn't be restocked twice.
      const alreadyReturnedMap = new Map<string, number>();
      for (const movement of returnedRes.data ?? []) {
        if (!movement.product_id) continue;
        alreadyReturnedMap.set(
          movement.product_id,
          (alreadyReturnedMap.get(movement.product_id) ?? 0) + Number(movement.quantity),
        );
      }

      const creditoAmount = (paymentsRes.data ?? [])
        .filter((p) => p.method === "credito")
        .reduce((sum, p) => sum + Number(p.amount), 0);
      if (creditoAmount > 0 && saleRes.data.customer_id) {
        await adjustCustomerBalance(saleRes.data.customer_id, -creditoAmount);
      }

      await Promise.all(
        (items ?? [])
          .filter((item) => item.product_id)
          .map(async (item) => {
            const remainingQuantity =
              Number(item.quantity) - (alreadyReturnedMap.get(item.product_id as string) ?? 0);
            if (remainingQuantity <= 0) return;

            const { data: product, error: productError } = await supabase
              .from("products")
              .select("stock")
              .eq("id", item.product_id as string)
              .single();
            if (productError) throw productError;

            const stockBefore = Number(product.stock);
            const quantity = remainingQuantity;
            const stockAfter = stockBefore + quantity;

            const { error: updateError } = await supabase
              .from("products")
              .update({ stock: stockAfter })
              .eq("id", item.product_id as string);
            if (updateError) throw updateError;

            const { error: moveError } = await supabase.from("inventory_movements").insert({
              product_id: item.product_id,
              type: "devolucion",
              quantity,
              stock_before: stockBefore,
              stock_after: stockAfter,
              reason: "Anulación de venta",
              reference_type: "sale",
              reference_id: saleId,
              created_by: user?.id ?? null,
            });
            if (moveError) throw moveError;
          }),
      );

      const { error: voidError } = await supabase
        .from("sales")
        .update({ status: "anulada" })
        .eq("id", saleId);
      if (voidError) throw voidError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sales"] });
      queryClient.invalidateQueries({ queryKey: ["pos", "products"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["cash"] });
      queryClient.invalidateQueries({ queryKey: ["customers"] });
    },
  });
}

/**
 * Permanently removes a sale record. Only allowed once it's already
 * "anulada" — void already reversed the stock and credit effects, so at
 * that point the sale is just a historical row, safe to delete outright.
 * sale_items/sale_payments cascade-delete with it; cash_movements linked to
 * it just lose the reference (ON DELETE SET NULL), keeping the caja trail.
 */
export function useDeleteSale() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (saleId: string) => {
      const { data: sale, error: fetchError } = await supabase
        .from("sales")
        .select("status")
        .eq("id", saleId)
        .single();
      if (fetchError) throw fetchError;
      if (sale.status !== "anulada") {
        throw new Error("Primero debe anular la venta antes de poder eliminarla");
      }

      const { error } = await supabase.from("sales").delete().eq("id", saleId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sales"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["reports"] });
    },
  });
}

export type ReturnableItem = {
  id: string;
  product_id: string | null;
  product_name: string;
  quantity: number;
  unitNetPrice: number;
  unitCost: number;
  alreadyReturned: number;
};

/** Sale items with how many units are still eligible to be returned, derived from
 *  the kardex (no schema change needed — a returned qty is just a 'devolucion'
 *  inventory_movement linked back to this sale). */
export function useReturnableItems(saleId: string | null) {
  return useQuery({
    queryKey: ["sales", "returnable", saleId],
    queryFn: async (): Promise<ReturnableItem[]> => {
      const [itemsRes, movementsRes] = await Promise.all([
        supabase
          .from("sale_items")
          .select("id, product_id, product_name, quantity, unit_price, unit_cost, discount")
          .eq("sale_id", saleId as string),
        supabase
          .from("inventory_movements")
          .select("product_id, quantity")
          .eq("reference_type", "sale")
          .eq("reference_id", saleId as string)
          .eq("type", "devolucion"),
      ]);
      if (itemsRes.error) throw itemsRes.error;
      if (movementsRes.error) throw movementsRes.error;

      const returnedMap = new Map<string, number>();
      for (const movement of movementsRes.data ?? []) {
        if (!movement.product_id) continue;
        returnedMap.set(
          movement.product_id,
          (returnedMap.get(movement.product_id) ?? 0) + Number(movement.quantity),
        );
      }

      return (itemsRes.data ?? []).map((item) => {
        const quantity = Number(item.quantity);
        const netTotal = Math.max(0, Number(item.unit_price) * quantity - Number(item.discount));
        return {
          id: item.id,
          product_id: item.product_id,
          product_name: item.product_name,
          quantity,
          unitNetPrice: quantity > 0 ? netTotal / quantity : 0,
          unitCost: Number(item.unit_cost),
          alreadyReturned: item.product_id ? (returnedMap.get(item.product_id) ?? 0) : 0,
        };
      });
    },
    enabled: Boolean(saleId),
  });
}

export type ReturnLineInput = {
  productId: string;
  quantity: number;
  unitCost: number;
  amount: number;
};

export function useReturnItems() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { saleId: string; lines: ReturnLineInput[] }) => {
      const activeLines = input.lines.filter((l) => l.quantity > 0);
      if (!activeLines.length) throw new Error("Seleccione al menos un producto a devolver");

      const {
        data: { user },
      } = await supabase.auth.getUser();

      const { data: sale, error: saleError } = await supabase
        .from("sales")
        .select("customer_id, status")
        .eq("id", input.saleId)
        .single();
      if (saleError) throw saleError;

      await Promise.all(
        activeLines.map(async (line) => {
          const { data: product, error: productError } = await supabase
            .from("products")
            .select("stock")
            .eq("id", line.productId)
            .single();
          if (productError) throw productError;

          const stockBefore = Number(product.stock);
          const stockAfter = stockBefore + line.quantity;

          const { error: updateError } = await supabase
            .from("products")
            .update({ stock: stockAfter })
            .eq("id", line.productId);
          if (updateError) throw updateError;

          const { error: moveError } = await supabase.from("inventory_movements").insert({
            product_id: line.productId,
            type: "devolucion",
            quantity: line.quantity,
            stock_before: stockBefore,
            stock_after: stockAfter,
            unit_cost: line.unitCost,
            reason: "Devolución parcial",
            reference_type: "sale",
            reference_id: input.saleId,
            created_by: user?.id ?? null,
          });
          if (moveError) throw moveError;
        }),
      );

      const returnAmount = Math.round(activeLines.reduce((sum, l) => sum + l.amount, 0));
      if (sale.status === "credito" && sale.customer_id && returnAmount > 0) {
        await adjustCustomerBalance(sale.customer_id, -returnAmount);
      }

      return { returnAmount };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sales"] });
      queryClient.invalidateQueries({ queryKey: ["pos", "products"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
    },
  });
}
