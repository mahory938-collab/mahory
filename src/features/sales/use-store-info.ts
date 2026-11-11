import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";

export type StoreInfo = {
  name: string;
  address: string | null;
  phone: string | null;
  receipt_footer: string | null;
};

export function useStoreInfo() {
  return useQuery({
    queryKey: ["store", "info"],
    queryFn: async (): Promise<StoreInfo | null> => {
      const { data, error } = await supabase
        .from("stores")
        .select("name, address, phone, receipt_footer")
        .order("created_at")
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    staleTime: 5 * 60_000,
  });
}
