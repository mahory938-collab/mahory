import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { getDefaultStoreId } from "@/lib/store";

export type PaymentMethod = Database["public"]["Enums"]["payment_method"];

export const EXPENSE_CATEGORIES = [
  { value: "arriendo", label: "Arriendo" },
  { value: "servicios", label: "Servicios (luz, agua, internet)" },
  { value: "nomina", label: "Nómina y pagos al equipo" },
  { value: "transporte", label: "Transporte y domicilios" },
  { value: "publicidad", label: "Publicidad" },
  { value: "mantenimiento", label: "Mantenimiento y aseo" },
  { value: "impuestos", label: "Impuestos y trámites" },
  { value: "otros", label: "Otros" },
] as const;

export const EXPENSE_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: "efectivo", label: "Efectivo" },
  { value: "nequi", label: "Nequi" },
  { value: "daviplata", label: "Daviplata" },
  { value: "transferencia", label: "Transferencia" },
  { value: "tarjeta", label: "Tarjeta" },
  { value: "otro", label: "Otro" },
];

export function categoryLabel(value: string) {
  return EXPENSE_CATEGORIES.find((c) => c.value === value)?.label ?? value;
}

export function methodLabel(value: string | null) {
  return EXPENSE_METHODS.find((m) => m.value === value)?.label ?? "—";
}

export type Expense = {
  id: string;
  concept: string;
  amount: number;
  category: string;
  expense_date: string;
  payment_method: PaymentMethod | null;
  notes: string | null;
};

export type ExpenseFormValues = {
  concept: string;
  amount: number;
  category: string;
  expense_date: string;
  payment_method: PaymentMethod;
  notes: string;
};

const pad = (n: number) => String(n).padStart(2, "0");

/** Fecha local (no UTC) en formato YYYY-MM-DD. */
export function toDateKey(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Primer día del mes y primer día del mes siguiente, para filtrar un mes completo. */
export function monthRange(year: number, month: number) {
  return {
    from: toDateKey(new Date(year, month, 1)),
    to: toDateKey(new Date(year, month + 1, 1)),
  };
}

export function useExpenses(year: number, month: number) {
  const { from, to } = monthRange(year, month);
  return useQuery({
    queryKey: ["expenses", from],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("expenses")
        .select("id, concept, amount, category, expense_date, payment_method, notes")
        .gte("expense_date", from)
        .lt("expense_date", to)
        .order("expense_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(1000);
      if (error) throw error;
      return (data ?? []).map((e) => ({ ...e, amount: Number(e.amount) })) as Expense[];
    },
    staleTime: 15_000,
  });
}

export function useSaveExpense(expenseId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (values: ExpenseFormValues) => {
      const payload = {
        concept: values.concept.trim(),
        amount: values.amount,
        category: values.category,
        expense_date: values.expense_date,
        payment_method: values.payment_method,
        notes: values.notes.trim() || null,
      };

      if (expenseId) {
        const { error } = await supabase.from("expenses").update(payload).eq("id", expenseId);
        if (error) throw error;
        return;
      }

      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("Su sesión venció. Inicie sesión de nuevo.");
      const store_id = await getDefaultStoreId();
      const { error } = await supabase
        .from("expenses")
        .insert({ ...payload, store_id, created_by: auth.user.id });
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["expenses"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

export function useDeleteExpense() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("expenses").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["expenses"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}
