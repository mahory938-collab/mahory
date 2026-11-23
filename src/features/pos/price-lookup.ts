import { supabase } from "@/integrations/supabase/client";
import { barcodeVariants } from "@/lib/barcode";

export type StockStatus = "disponible" | "pocas" | "agotado";

export type PriceResult = {
  id: string;
  name: string;
  price: number;
  stock: number;
  status: StockStatus;
  inactive: boolean;
  imageUrl: string | null;
  categoryName: string | null;
};

const COLUMNS = "id, name, price, stock, min_stock, status, image_url, categories(name)";

/**
 * Consulta de precio por código de barras o SKU. Solo lectura y sin datos internos:
 * nunca se piden costos ni márgenes.
 */
export async function lookupPrice(code: string): Promise<PriceResult | null> {
  const byBarcode = await supabase
    .from("products")
    .select(COLUMNS)
    .in("barcode", barcodeVariants(code))
    .limit(1)
    .maybeSingle();
  if (byBarcode.error) throw byBarcode.error;
  let row = byBarcode.data;
  if (!row) {
    const bySku = await supabase
      .from("products")
      .select(COLUMNS)
      .eq("sku", code)
      .limit(1)
      .maybeSingle();
    if (bySku.error) throw bySku.error;
    row = bySku.data;
  }
  if (!row) return null;

  const stock = Number(row.stock);
  const minStock = Number(row.min_stock);
  return {
    id: row.id,
    name: row.name,
    price: Number(row.price),
    stock,
    status: stock <= 0 ? "agotado" : stock <= minStock ? "pocas" : "disponible",
    inactive: row.status !== "active",
    imageUrl: row.image_url,
    categoryName: row.categories?.name ?? null,
  };
}
