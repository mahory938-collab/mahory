import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { getDefaultStoreId } from "@/lib/store";

export type Customer = {
  id: string;
  name: string;
  document_type: string | null;
  document_number: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  notes: string | null;
  credit_limit: number;
  balance: number;
  is_active: boolean;
};

export type CustomerFormValues = {
  name: string;
  document_type: string;
  document_number: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  notes: string;
  credit_limit: number;
  is_active: boolean;
};

export function useCustomers(search: string) {
  return useQuery({
    queryKey: ["customers", "list", search.trim()],
    queryFn: async () => {
      let query = supabase
        .from("customers")
        .select(
          "id, name, document_type, document_number, phone, email, address, city, notes, credit_limit, balance, is_active",
        )
        .order("name")
        .limit(300);

      const term = search.trim();
      if (term) {
        query = query.or(
          `name.ilike.%${term}%,document_number.ilike.%${term}%,phone.ilike.%${term}%`,
        );
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []).map((c) => ({
        ...c,
        credit_limit: Number(c.credit_limit),
        balance: Number(c.balance),
      })) as Customer[];
    },
    staleTime: 15_000,
  });
}

export function useSaveCustomer(customerId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (values: CustomerFormValues) => {
      const payload = {
        name: values.name.trim(),
        document_type: values.document_type.trim() || null,
        document_number: values.document_number.trim() || null,
        phone: values.phone.trim() || null,
        email: values.email.trim() || null,
        address: values.address.trim() || null,
        city: values.city.trim() || null,
        notes: values.notes.trim() || null,
        credit_limit: values.credit_limit,
        is_active: values.is_active,
      };

      if (customerId) {
        const { error } = await supabase.from("customers").update(payload).eq("id", customerId);
        if (error) throw error;
        return;
      }

      const store_id = await getDefaultStoreId();
      const { error } = await supabase.from("customers").insert({ ...payload, store_id });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["customers"] }),
  });
}

/** Adds (or subtracts, with a negative delta) an amount from a customer's outstanding balance. */
export async function adjustCustomerBalance(customerId: string, delta: number): Promise<void> {
  const { data: customer, error: fetchError } = await supabase
    .from("customers")
    .select("balance")
    .eq("id", customerId)
    .single();
  if (fetchError) throw fetchError;

  const { error: updateError } = await supabase
    .from("customers")
    .update({ balance: Number(customer.balance) + delta })
    .eq("id", customerId);
  if (updateError) throw updateError;
}

export type PaymentMethod = "efectivo" | "transferencia" | "tarjeta" | "otro";

/** Registers a customer paying down their balance ("abono"), any method.
 *  Logged in customer_payments (its own ledger, so it's visible in stats
 *  regardless of method or whether a cash session is open) — cash abonos
 *  also link to the open session so they count toward expected cash. */
export function useRegisterCustomerPayment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      customerId: string;
      amount: number;
      method: PaymentMethod;
      note: string;
      cashSessionId: string | null;
    }) => {
      if (input.amount <= 0) throw new Error("Ingrese un monto válido");

      await adjustCustomerBalance(input.customerId, -input.amount);

      const {
        data: { user },
      } = await supabase.auth.getUser();
      const { error } = await supabase.from("customer_payments").insert({
        customer_id: input.customerId,
        amount: input.amount,
        method: input.method,
        note: input.note.trim() || null,
        cash_session_id: input.method === "efectivo" ? input.cashSessionId : null,
        created_by: user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      queryClient.invalidateQueries({ queryKey: ["cash"] });
    },
  });
}

export function useDeleteCustomer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("customers").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["customers"] }),
  });
}
