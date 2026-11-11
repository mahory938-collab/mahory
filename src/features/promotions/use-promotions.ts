import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { getDefaultStoreId } from "@/lib/store";

export type PromotionScope = "all" | "category" | "product";

export type Promotion = {
  id: string;
  name: string;
  scope: PromotionScope;
  targetId: string | null;
  targetName: string | null;
  percent: number;
  startsAt: string | null;
  endsAt: string | null;
  active: boolean;
};

export type PromotionInput = Omit<Promotion, "id">;

const SETTINGS_KEY = "promotions";

async function fetchPromotions(): Promise<Promotion[]> {
  const { data, error } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", SETTINGS_KEY)
    .maybeSingle();
  if (error) throw error;
  return ((data?.value as Promotion[]) ?? []).filter(Boolean);
}

async function savePromotions(list: Promotion[]): Promise<void> {
  const store_id = await getDefaultStoreId();
  if (!store_id) throw new Error("No se encontró la tienda");
  const { error } = await supabase
    .from("app_settings")
    .upsert({ store_id, key: SETTINGS_KEY, value: list as never }, { onConflict: "store_id,key" });
  if (error) throw error;
}

export function usePromotions() {
  return useQuery({
    queryKey: ["promotions"],
    queryFn: fetchPromotions,
    staleTime: 15_000,
  });
}

export function useSavePromotion(promotionId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: PromotionInput) => {
      if (!input.name.trim()) throw new Error("Ingrese un nombre para la promoción");
      if (input.percent <= 0 || input.percent > 100) {
        throw new Error("El descuento debe estar entre 1 y 100%");
      }
      if (input.scope !== "all" && !input.targetId) {
        throw new Error("Seleccione la categoría o el producto");
      }

      const current = await fetchPromotions();
      const next = promotionId
        ? current.map((p) => (p.id === promotionId ? { ...input, id: promotionId } : p))
        : [...current, { ...input, id: crypto.randomUUID() }];

      await savePromotions(next);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["promotions"] }),
  });
}

export function useDeletePromotion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (promotionId: string) => {
      const current = await fetchPromotions();
      await savePromotions(current.filter((p) => p.id !== promotionId));
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["promotions"] }),
  });
}

export function isPromotionCurrentlyActive(promo: Promotion, now = Date.now()): boolean {
  if (!promo.active) return false;
  if (promo.startsAt && new Date(promo.startsAt).getTime() > now) return false;
  if (promo.endsAt && new Date(promo.endsAt).getTime() < now) return false;
  return true;
}

/** Picks the highest-discount promotion applicable to a product, if any. */
export function findBestPromotion(
  promotions: Promotion[],
  product: { id: string; category_id: string | null },
): Promotion | null {
  const now = Date.now();
  const applicable = promotions.filter((p) => {
    if (!isPromotionCurrentlyActive(p, now)) return false;
    if (p.scope === "all") return true;
    if (p.scope === "category") return p.targetId === product.category_id;
    if (p.scope === "product") return p.targetId === product.id;
    return false;
  });
  if (!applicable.length) return null;
  return applicable.reduce((best, p) => (p.percent > best.percent ? p : best));
}
