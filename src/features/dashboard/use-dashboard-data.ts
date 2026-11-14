import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { daysAgo, startOfMonth, startOfToday } from "@/lib/format";
import { getDefaultStoreId } from "@/lib/store";

export type SaleRow = {
  id: string;
  number: number;
  total: number;
  cost_total: number;
  status: string;
  customer_name: string | null;
  created_at: string;
};

export type DashboardData = {
  todayTotal: number;
  todayCount: number;
  monthTotal: number;
  monthCount: number;
  monthProfit: number;
  ticketAverage: number;
  recentSales: SaleRow[];
  salesByDay: { label: string; total: number }[];
  lowStock: { id: string; name: string; stock: number; min_stock: number }[];
  outOfStock: number;
  activeProducts: number;
  topProducts: { name: string; quantity: number; total: number }[];
  cash: { status: string; opening: number; expected: number; openedAt: string | null } | null;
  cashMovementsToday: { ingresos: number; egresos: number; abonos: number };
};

async function fetchDashboard(): Promise<DashboardData> {
  const monthStart = startOfMonth();
  const todayStart = startOfToday();
  const rangeStart = daysAgo(13);
  const store_id = await getDefaultStoreId();

  const [
    salesRes,
    lowStockRes,
    outOfStockRes,
    availableRes,
    itemsRes,
    cashRes,
    cashMovRes,
    abonosRes,
  ] = await Promise.all([
    supabase
      .from("sales")
      .select("id, number, total, cost_total, status, customer_name, created_at")
      .neq("status", "anulada")
      .eq("is_held", false)
      .gte("created_at", rangeStart < monthStart ? rangeStart : monthStart)
      .order("created_at", { ascending: false }),
    supabase
      .from("products")
      .select("id, name, stock, min_stock")
      .eq("status", "active")
      .gt("stock", 0)
      .order("stock", { ascending: true })
      .limit(50),
    supabase
      .from("products")
      .select("id", { count: "exact", head: true })
      .eq("status", "active")
      .lte("stock", 0),
    supabase
      .from("products")
      .select("id", { count: "exact", head: true })
      .eq("status", "active")
      .gt("stock", 0),
    supabase
      .from("sale_items")
      .select("product_name, quantity, total, created_at")
      .gte("created_at", monthStart)
      .limit(2000),
    supabase
      .from("cash_sessions")
      .select("status, opening_amount, expected_amount, opened_at")
      .eq("store_id", store_id as string)
      .eq("status", "abierta")
      .order("opened_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("cash_movements")
      .select("type, amount")
      .in("type", ["ingreso", "egreso"])
      .gte("created_at", todayStart),
    supabase.from("customer_payments").select("amount").gte("created_at", todayStart),
  ]);

  const sales = (salesRes.data ?? []).map((s) => ({
    ...s,
    total: Number(s.total),
    cost_total: Number(s.cost_total),
  })) as SaleRow[];

  const todaySales = sales.filter((s) => s.created_at >= todayStart);
  const monthSales = sales.filter((s) => s.created_at >= monthStart);

  const monthTotal = monthSales.reduce((sum, s) => sum + s.total, 0);
  const monthCost = monthSales.reduce((sum, s) => sum + s.cost_total, 0);

  // 14-day series
  const byDay = new Map<string, number>();
  for (let i = 13; i >= 0; i -= 1) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    byDay.set(d.toISOString().slice(0, 10), 0);
  }
  for (const sale of sales) {
    const key = new Date(sale.created_at).toISOString().slice(0, 10);
    if (byDay.has(key)) byDay.set(key, (byDay.get(key) ?? 0) + sale.total);
  }
  const salesByDay = [...byDay.entries()].map(([key, total]) => ({
    label: new Date(`${key}T12:00:00`).toLocaleDateString("es-CO", {
      day: "2-digit",
      month: "short",
    }),
    total,
  }));

  // top products of the month
  const productMap = new Map<string, { quantity: number; total: number }>();
  for (const item of itemsRes.data ?? []) {
    const current = productMap.get(item.product_name) ?? { quantity: 0, total: 0 };
    current.quantity += Number(item.quantity);
    current.total += Number(item.total);
    productMap.set(item.product_name, current);
  }
  const topProducts = [...productMap.entries()]
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, 6);

  const lowStock = (lowStockRes.data ?? [])
    .map((p) => ({ ...p, stock: Number(p.stock), min_stock: Number(p.min_stock) }))
    .filter((p) => p.stock <= p.min_stock)
    .slice(0, 6);

  const cashMovementsToday = {
    ingresos: (cashMovRes.data ?? [])
      .filter((m) => m.type === "ingreso")
      .reduce((sum, m) => sum + Number(m.amount), 0),
    egresos: (cashMovRes.data ?? [])
      .filter((m) => m.type === "egreso")
      .reduce((sum, m) => sum + Number(m.amount), 0),
    abonos: (abonosRes.data ?? []).reduce((sum, a) => sum + Number(a.amount), 0),
  };

  return {
    todayTotal: todaySales.reduce((sum, s) => sum + s.total, 0),
    todayCount: todaySales.length,
    monthTotal,
    monthCount: monthSales.length,
    monthProfit: monthTotal - monthCost,
    ticketAverage: monthSales.length ? monthTotal / monthSales.length : 0,
    recentSales: sales.slice(0, 6),
    salesByDay,
    lowStock,
    outOfStock: outOfStockRes.count ?? 0,
    activeProducts: availableRes.count ?? 0,
    topProducts,
    cashMovementsToday,
    cash: cashRes.data
      ? {
          status: cashRes.data.status,
          opening: Number(cashRes.data.opening_amount),
          expected: Number(cashRes.data.expected_amount),
          openedAt: cashRes.data.opened_at,
        }
      : null,
  };
}

export function useDashboardData(userId: string | null) {
  return useQuery({
    queryKey: ["dashboard", userId],
    queryFn: fetchDashboard,
    enabled: Boolean(userId),
    staleTime: 30_000,
  });
}
