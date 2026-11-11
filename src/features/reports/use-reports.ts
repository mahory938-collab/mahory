import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { daysAgo, startOfMonth, startOfYear } from "@/lib/format";

export type ReportRange = "today" | "week" | "month" | "all";

function rangeStart(range: ReportRange): string | null {
  if (range === "today") return daysAgo(0);
  if (range === "week") return daysAgo(7);
  if (range === "month") return startOfMonth();
  return null;
}

export type SalesReport = {
  total: number;
  count: number;
  discountTotal: number;
  taxTotal: number;
  profit: number;
  ticketAverage: number;
  byDay: { label: string; total: number }[];
  byMethod: { method: string; amount: number }[];
  topProducts: { name: string; quantity: number; total: number }[];
  topCustomers: { name: string; count: number; total: number }[];
};

export function useSalesReport(range: ReportRange) {
  return useQuery({
    queryKey: ["reports", "sales", range],
    queryFn: async (): Promise<SalesReport> => {
      let query = supabase
        .from("sales")
        .select("id, total, discount_total, tax_total, cost_total, customer_name, created_at")
        .neq("status", "anulada")
        .eq("is_held", false)
        .order("created_at");

      const start = rangeStart(range);
      if (start) query = query.gte("created_at", start);

      const { data: sales, error } = await query;
      if (error) throw error;

      const saleIds = sales.map((s) => s.id);
      const [itemsRes, paymentsRes] = await Promise.all([
        saleIds.length
          ? supabase.from("sale_items").select("sale_id, product_name, quantity, total").in("sale_id", saleIds)
          : Promise.resolve({ data: [], error: null }),
        saleIds.length
          ? supabase.from("sale_payments").select("sale_id, method, amount").in("sale_id", saleIds)
          : Promise.resolve({ data: [], error: null }),
      ]);
      if (itemsRes.error) throw itemsRes.error;
      if (paymentsRes.error) throw paymentsRes.error;

      const total = sales.reduce((sum, s) => sum + Number(s.total), 0);
      const discountTotal = sales.reduce((sum, s) => sum + Number(s.discount_total), 0);
      const taxTotal = sales.reduce((sum, s) => sum + Number(s.tax_total), 0);
      const costTotal = sales.reduce((sum, s) => sum + Number(s.cost_total), 0);

      const byDayMap = new Map<string, number>();
      for (const sale of sales) {
        const key = new Date(sale.created_at).toISOString().slice(0, 10);
        byDayMap.set(key, (byDayMap.get(key) ?? 0) + Number(sale.total));
      }
      const byDay = [...byDayMap.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, dayTotal]) => ({
          label: new Date(`${key}T12:00:00`).toLocaleDateString("es-CO", {
            day: "2-digit",
            month: "short",
          }),
          total: dayTotal,
        }));

      const byMethodMap = new Map<string, number>();
      for (const payment of paymentsRes.data ?? []) {
        byMethodMap.set(payment.method, (byMethodMap.get(payment.method) ?? 0) + Number(payment.amount));
      }
      const byMethod = [...byMethodMap.entries()]
        .map(([method, amount]) => ({ method, amount }))
        .sort((a, b) => b.amount - a.amount);

      const productMap = new Map<string, { quantity: number; total: number }>();
      for (const item of itemsRes.data ?? []) {
        const current = productMap.get(item.product_name) ?? { quantity: 0, total: 0 };
        current.quantity += Number(item.quantity);
        current.total += Number(item.total);
        productMap.set(item.product_name, current);
      }
      const topProducts = [...productMap.entries()]
        .map(([name, v]) => ({ name, ...v }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 10);

      const customerMap = new Map<string, { count: number; total: number }>();
      for (const sale of sales) {
        const key = sale.customer_name?.trim() || "Consumidor final";
        const current = customerMap.get(key) ?? { count: 0, total: 0 };
        current.count += 1;
        current.total += Number(sale.total);
        customerMap.set(key, current);
      }
      const topCustomers = [...customerMap.entries()]
        .map(([name, v]) => ({ name, ...v }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 10);

      return {
        total,
        count: sales.length,
        discountTotal,
        taxTotal,
        profit: total - costTotal,
        ticketAverage: sales.length ? total / sales.length : 0,
        byDay,
        byMethod,
        topProducts,
        topCustomers,
      };
    },
    staleTime: 30_000,
  });
}

export type PurchasesReport = { total: number; count: number };

export function usePurchasesReport(range: ReportRange) {
  return useQuery({
    queryKey: ["reports", "purchases", range],
    queryFn: async (): Promise<PurchasesReport> => {
      let query = supabase.from("purchases").select("total").eq("status", "recibida");
      const start = rangeStart(range);
      if (start) query = query.gte("received_at", start);

      const { data, error } = await query;
      if (error) throw error;
      return {
        total: (data ?? []).reduce((sum, p) => sum + Number(p.total), 0),
        count: data?.length ?? 0,
      };
    },
    staleTime: 30_000,
  });
}

export type InvestmentBucket = { purchases: number; initialStock: number; total: number };
export type InvestmentReport = {
  today: InvestmentBucket;
  month: InvestmentBucket;
  year: InvestmentBucket;
  allTime: InvestmentBucket;
};

/**
 * What the store has put into inventory: purchases received from suppliers,
 * plus the initial stock loaded when creating a product (an investment too,
 * just outside the formal purchase flow).
 */
export function useInvestmentReport() {
  return useQuery({
    queryKey: ["reports", "investment"],
    queryFn: async (): Promise<InvestmentReport> => {
      const [purchasesRes, movementsRes] = await Promise.all([
        supabase.from("purchases").select("total, received_at").eq("status", "recibida"),
        supabase
          .from("inventory_movements")
          .select("quantity, unit_cost, created_at")
          .eq("reference_type", "product_creation"),
      ]);
      if (purchasesRes.error) throw purchasesRes.error;
      if (movementsRes.error) throw movementsRes.error;

      const todayStart = daysAgo(0);
      const monthStart = startOfMonth();
      const yearStart = startOfYear();

      const emptyBucket = (): InvestmentBucket => ({ purchases: 0, initialStock: 0, total: 0 });
      const buckets = {
        today: emptyBucket(),
        month: emptyBucket(),
        year: emptyBucket(),
        allTime: emptyBucket(),
      };

      for (const p of purchasesRes.data ?? []) {
        const amount = Number(p.total);
        const at = p.received_at ?? "";
        buckets.allTime.purchases += amount;
        if (at >= yearStart) buckets.year.purchases += amount;
        if (at >= monthStart) buckets.month.purchases += amount;
        if (at >= todayStart) buckets.today.purchases += amount;
      }

      for (const m of movementsRes.data ?? []) {
        const amount = Number(m.quantity) * Number(m.unit_cost ?? 0);
        const at = m.created_at;
        buckets.allTime.initialStock += amount;
        if (at >= yearStart) buckets.year.initialStock += amount;
        if (at >= monthStart) buckets.month.initialStock += amount;
        if (at >= todayStart) buckets.today.initialStock += amount;
      }

      for (const key of ["today", "month", "year", "allTime"] as const) {
        buckets[key].total = buckets[key].purchases + buckets[key].initialStock;
      }

      return buckets;
    },
    staleTime: 30_000,
  });
}

export type InventorySnapshot = {
  totalValue: number;
  totalProducts: number;
  outOfStock: number;
  lowStock: number;
};

export function useInventorySnapshot() {
  return useQuery({
    queryKey: ["reports", "inventory-snapshot"],
    queryFn: async (): Promise<InventorySnapshot> => {
      const { data, error } = await supabase
        .from("products")
        .select("stock, cost, min_stock")
        .eq("status", "active");
      if (error) throw error;

      let totalValue = 0;
      let outOfStock = 0;
      let lowStock = 0;
      for (const p of data ?? []) {
        const stock = Number(p.stock);
        const minStock = Number(p.min_stock);
        totalValue += stock * Number(p.cost);
        if (stock <= 0) outOfStock += 1;
        else if (stock <= minStock) lowStock += 1;
      }

      return { totalValue, totalProducts: data?.length ?? 0, outOfStock, lowStock };
    },
    staleTime: 30_000,
  });
}

export type CashMovementsReport = { ingresos: number; egresos: number; abonos: number };

export function useCashMovementsReport(range: ReportRange) {
  return useQuery({
    queryKey: ["reports", "cash-movements", range],
    queryFn: async (): Promise<CashMovementsReport> => {
      const start = rangeStart(range);

      let movementsQuery = supabase.from("cash_movements").select("type, amount").in("type", ["ingreso", "egreso"]);
      if (start) movementsQuery = movementsQuery.gte("created_at", start);

      let abonosQuery = supabase.from("customer_payments").select("amount");
      if (start) abonosQuery = abonosQuery.gte("created_at", start);

      const [movementsRes, abonosRes] = await Promise.all([movementsQuery, abonosQuery]);
      if (movementsRes.error) throw movementsRes.error;
      if (abonosRes.error) throw abonosRes.error;

      return {
        ingresos: (movementsRes.data ?? [])
          .filter((m) => m.type === "ingreso")
          .reduce((sum, m) => sum + Number(m.amount), 0),
        egresos: (movementsRes.data ?? [])
          .filter((m) => m.type === "egreso")
          .reduce((sum, m) => sum + Number(m.amount), 0),
        abonos: (abonosRes.data ?? []).reduce((sum, a) => sum + Number(a.amount), 0),
      };
    },
    staleTime: 30_000,
  });
}

export type CashSessionReport = {
  id: string;
  opening_amount: number;
  expected_amount: number;
  counted_amount: number | null;
  difference: number | null;
  opened_at: string;
  closed_at: string | null;
};

export function useCashSessionsReport(range: ReportRange) {
  return useQuery({
    queryKey: ["reports", "cash-sessions", range],
    queryFn: async (): Promise<CashSessionReport[]> => {
      let query = supabase
        .from("cash_sessions")
        .select("id, opening_amount, expected_amount, counted_amount, difference, opened_at, closed_at")
        .eq("status", "cerrada")
        .order("closed_at", { ascending: false })
        .limit(50);

      const start = rangeStart(range);
      if (start) query = query.gte("closed_at", start);

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []).map((s) => ({
        ...s,
        opening_amount: Number(s.opening_amount),
        expected_amount: Number(s.expected_amount),
        counted_amount: s.counted_amount === null ? null : Number(s.counted_amount),
        difference: s.difference === null ? null : Number(s.difference),
      }));
    },
    staleTime: 30_000,
  });
}
