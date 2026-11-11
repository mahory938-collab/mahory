import { supabase } from "@/integrations/supabase/client";

/** Single-store deployment for now — resolves the first store created. */
export async function getDefaultStoreId(): Promise<string | null> {
  const { data } = await supabase
    .from("stores")
    .select("id")
    .order("created_at")
    .limit(1)
    .maybeSingle();
  return data?.id ?? null;
}
