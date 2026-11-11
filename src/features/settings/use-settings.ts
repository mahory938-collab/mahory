import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";

export type StoreSettings = {
  id: string;
  name: string;
  legal_name: string | null;
  tax_id: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  currency: string;
  default_tax_rate: number;
  receipt_footer: string | null;
};

export function useStoreSettings() {
  return useQuery({
    queryKey: ["settings", "store"],
    queryFn: async (): Promise<StoreSettings | null> => {
      const { data, error } = await supabase
        .from("stores")
        .select(
          "id, name, legal_name, tax_id, phone, email, address, city, currency, default_tax_rate, receipt_footer",
        )
        .order("created_at")
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data ? { ...data, default_tax_rate: Number(data.default_tax_rate) } : null;
    },
    staleTime: 60_000,
  });
}

export function useSaveStoreSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: Omit<StoreSettings, "id">) => {
      const { data: store, error: findError } = await supabase
        .from("stores")
        .select("id")
        .order("created_at")
        .limit(1)
        .maybeSingle();
      if (findError) throw findError;
      if (!store) throw new Error("No se encontró la tienda");

      const { error } = await supabase.from("stores").update(input).eq("id", store.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings", "store"] });
      queryClient.invalidateQueries({ queryKey: ["store"] });
    },
  });
}

export type PaymentMethodSettings = {
  efectivo: boolean;
  tarjeta: boolean;
  transferencia: boolean;
  credito: boolean;
};

const DEFAULT_PAYMENT_METHODS: PaymentMethodSettings = {
  efectivo: true,
  tarjeta: true,
  transferencia: true,
  credito: true,
};

export type ReceiptSettings = { widthMm: 58 | 80 };
const DEFAULT_RECEIPT_SETTINGS: ReceiptSettings = { widthMm: 80 };

async function getDefaultStoreId(): Promise<string | null> {
  const { data } = await supabase.from("stores").select("id").order("created_at").limit(1).maybeSingle();
  return data?.id ?? null;
}

function useAppSetting<T>(key: string, fallback: T) {
  return useQuery({
    queryKey: ["settings", "app", key],
    queryFn: async (): Promise<T> => {
      const { data, error } = await supabase
        .from("app_settings")
        .select("value")
        .eq("key", key)
        .maybeSingle();
      if (error) throw error;
      return data ? ({ ...fallback, ...(data.value as object) } as T) : fallback;
    },
    staleTime: 60_000,
  });
}

function useSaveAppSetting<T>(key: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (value: T) => {
      const store_id = await getDefaultStoreId();
      if (!store_id) throw new Error("No se encontró la tienda");
      const { error } = await supabase
        .from("app_settings")
        .upsert({ store_id, key, value: value as never }, { onConflict: "store_id,key" });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["settings", "app", key] }),
  });
}

export function usePaymentMethodSettings() {
  return useAppSetting<PaymentMethodSettings>("payment_methods", DEFAULT_PAYMENT_METHODS);
}
export function useSavePaymentMethodSettings() {
  return useSaveAppSetting<PaymentMethodSettings>("payment_methods");
}

export function useReceiptSettings() {
  return useAppSetting<ReceiptSettings>("receipt", DEFAULT_RECEIPT_SETTINGS);
}
export function useSaveReceiptSettings() {
  return useSaveAppSetting<ReceiptSettings>("receipt");
}
