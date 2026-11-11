import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { getDefaultStoreId } from "@/lib/store";

export type CashSession = {
  id: string;
  user_id: string;
  openedByName: string | null;
  status: "abierta" | "cerrada";
  opening_amount: number;
  expected_amount: number;
  counted_amount: number | null;
  difference: number | null;
  opened_at: string;
  closed_at: string | null;
  notes: string | null;
};

function normalizeSession(row: Record<string, unknown>, openedByName: string | null): CashSession {
  return {
    id: row.id as string,
    user_id: row.user_id as string,
    openedByName,
    status: row.status as CashSession["status"],
    opening_amount: Number(row.opening_amount),
    expected_amount: Number(row.expected_amount),
    counted_amount: row.counted_amount === null ? null : Number(row.counted_amount),
    difference: row.difference === null ? null : Number(row.difference),
    opened_at: row.opened_at as string,
    closed_at: row.closed_at as string | null,
    notes: row.notes as string | null,
  };
}

/**
 * Single physical drawer shared by the whole store: any user on any
 * device sees the same open session, its movements and its sales.
 */
export function useActiveCashSession() {
  return useQuery({
    queryKey: ["cash", "active"],
    queryFn: async () => {
      const store_id = await getDefaultStoreId();
      const { data, error } = await supabase
        .from("cash_sessions")
        .select("*")
        .eq("store_id", store_id as string)
        .eq("status", "abierta")
        .order("opened_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;

      // cash_sessions.user_id references auth.users, not profiles — resolve separately.
      const { data: opener } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", data.user_id as string)
        .maybeSingle();

      return normalizeSession(data, opener?.full_name ?? null);
    },
    staleTime: 10_000,
    refetchInterval: 15_000,
  });
}

export function useOpenCash(userId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (openingAmount: number) => {
      if (!userId) throw new Error("Sesión expirada. Inicie sesión nuevamente.");
      if (!Number.isFinite(openingAmount) || openingAmount < 0) {
        throw new Error("Ingrese una base inicial válida");
      }

      const store_id = await getDefaultStoreId();

      // Defensive check — another device could have opened the shared drawer first.
      const { data: existing, error: existingError } = await supabase
        .from("cash_sessions")
        .select("id")
        .eq("store_id", store_id as string)
        .eq("status", "abierta")
        .limit(1)
        .maybeSingle();
      if (existingError) throw existingError;
      if (existing) throw new Error("La caja ya fue abierta desde otro equipo");

      const { data: session, error } = await supabase
        .from("cash_sessions")
        .insert({
          user_id: userId,
          store_id,
          opening_amount: openingAmount,
          expected_amount: openingAmount,
        })
        .select("id")
        .single();
      if (error) throw error;

      // Kardex trail: the opening itself is a cash movement.
      const { error: movementError } = await supabase.from("cash_movements").insert({
        cash_session_id: session.id,
        type: "apertura",
        amount: openingAmount,
        concept: "Apertura de caja",
        created_by: userId,
      });
      if (movementError) throw movementError;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["cash"] }),
  });
}

export function useCashMovements(sessionId: string | null) {
  return useQuery({
    queryKey: ["cash", "movements", sessionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cash_movements")
        .select("id, type, amount, concept, created_at")
        .eq("cash_session_id", sessionId as string)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((m) => ({ ...m, amount: Number(m.amount) }));
    },
    enabled: Boolean(sessionId),
    staleTime: 10_000,
  });
}

export function useAddCashMovement(sessionId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { type: "ingreso" | "egreso"; amount: number; concept: string }) => {
      if (!sessionId) throw new Error("No tiene una caja abierta");
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const { error } = await supabase.from("cash_movements").insert({
        cash_session_id: sessionId,
        type: input.type,
        amount: input.amount,
        concept: input.concept.trim() || null,
        created_by: user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["cash"] }),
  });
}

export type PaymentMethodBreakdown = {
  efectivo: number;
  tarjeta: number;
  transferencia: number;
  credito: number;
  otro: number;
};

const EMPTY_BREAKDOWN: PaymentMethodBreakdown = {
  efectivo: 0,
  tarjeta: 0,
  transferencia: 0,
  credito: 0,
  otro: 0,
};

export type CashSessionSummary = {
  salesCount: number;
  salesTotal: number;
  cashSales: number;
  byMethod: PaymentMethodBreakdown;
  abonosCash: number;
};

export function useCashSessionSummary(sessionId: string | null) {
  return useQuery({
    queryKey: ["cash", "summary", sessionId],
    queryFn: async (): Promise<CashSessionSummary> => {
      const [salesRes, abonosRes] = await Promise.all([
        supabase
          .from("sales")
          .select("id, total")
          .eq("cash_session_id", sessionId as string)
          .neq("status", "anulada"),
        supabase
          .from("customer_payments")
          .select("amount")
          .eq("cash_session_id", sessionId as string)
          .eq("method", "efectivo"),
      ]);
      if (salesRes.error) throw salesRes.error;
      if (abonosRes.error) throw abonosRes.error;
      const sales = salesRes.data;

      const saleIds = (sales ?? []).map((s) => s.id);
      const byMethod: PaymentMethodBreakdown = { ...EMPTY_BREAKDOWN };
      if (saleIds.length) {
        const { data: payments, error: payError } = await supabase
          .from("sale_payments")
          .select("amount, method")
          .in("sale_id", saleIds);
        if (payError) throw payError;
        for (const payment of payments ?? []) {
          const method = payment.method as keyof PaymentMethodBreakdown;
          byMethod[method] = (byMethod[method] ?? 0) + Number(payment.amount);
        }
      }

      return {
        salesCount: sales?.length ?? 0,
        salesTotal: (sales ?? []).reduce((sum, s) => sum + Number(s.total), 0),
        cashSales: byMethod.efectivo,
        byMethod,
        abonosCash: (abonosRes.data ?? []).reduce((sum, a) => sum + Number(a.amount), 0),
      };
    },
    enabled: Boolean(sessionId),
    staleTime: 10_000,
  });
}

export function useCloseCash(sessionId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { expected: number; counted: number; notes: string }) => {
      if (!sessionId) throw new Error("No tiene una caja abierta");
      const { error } = await supabase
        .from("cash_sessions")
        .update({
          status: "cerrada",
          expected_amount: input.expected,
          counted_amount: input.counted,
          difference: input.counted - input.expected,
          notes: input.notes.trim() || null,
          closed_at: new Date().toISOString(),
        })
        .eq("id", sessionId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cash"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}
