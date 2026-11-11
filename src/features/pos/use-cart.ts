import { useCallback, useMemo, useState } from "react";

export type CartLine = {
  key: string;
  productId: string;
  name: string;
  barcode: string | null;
  unitPrice: number;
  unitCost: number;
  taxRate: number;
  quantity: number;
  discount: number;
  stock: number;
  promoPercent: number;
  promoLabel: string | null;
};

export type CartTotals = {
  gross: number;
  discountTotal: number;
  taxTotal: number;
  subtotal: number;
  total: number;
  itemCount: number;
};

export type CartProductInput = {
  id: string;
  name: string;
  barcode: string | null;
  price: number;
  cost: number;
  tax_rate: number;
  stock: number;
};

export type CartPromoInput = { percent: number; label: string };

const lineTotal = (line: CartLine) =>
  Math.max(0, line.unitPrice * line.quantity - line.discount);

const promoDiscount = (unitPrice: number, quantity: number, percent: number) =>
  Math.round((unitPrice * quantity * percent) / 100);

/**
 * POS cart state. Prices are tax-inclusive (Colombian retail convention),
 * so tax is extracted from the line total instead of added on top.
 */
export function useCart() {
  const [lines, setLines] = useState<CartLine[]>([]);
  const [deliveryFee, setDeliveryFee] = useState(0);

  const addProduct = useCallback(
    (product: CartProductInput, quantity = 1, promo?: CartPromoInput) => {
      setLines((current) => {
        const existing = current.find((line) => line.productId === product.id);
        if (existing) {
          return current.map((line) => {
            if (line.productId !== product.id) return line;
            const newQuantity = line.quantity + quantity;
            return {
              ...line,
              quantity: newQuantity,
              discount: line.promoPercent
                ? promoDiscount(line.unitPrice, newQuantity, line.promoPercent)
                : line.discount,
            };
          });
        }
        const unitPrice = Number(product.price);
        return [
          ...current,
          {
            key: `${product.id}-${Date.now()}`,
            productId: product.id,
            name: product.name,
            barcode: product.barcode,
            unitPrice,
            unitCost: Number(product.cost),
            taxRate: Number(product.tax_rate),
            quantity,
            discount: promo ? promoDiscount(unitPrice, quantity, promo.percent) : 0,
            stock: Number(product.stock),
            promoPercent: promo?.percent ?? 0,
            promoLabel: promo?.label ?? null,
          },
        ];
      });
    },
    [],
  );

  const updateLine = useCallback((key: string, patch: Partial<CartLine>) => {
    setLines((current) =>
      current.map((line) => (line.key === key ? { ...line, ...patch } : line)),
    );
  }, []);

  const setQuantity = useCallback((key: string, quantity: number) => {
    if (quantity <= 0) {
      setLines((current) => current.filter((line) => line.key !== key));
      return;
    }
    setLines((current) =>
      current.map((line) =>
        line.key === key
          ? {
              ...line,
              quantity,
              discount: line.promoPercent
                ? promoDiscount(line.unitPrice, quantity, line.promoPercent)
                : line.discount,
            }
          : line,
      ),
    );
  }, []);

  const removeLine = useCallback((key: string) => {
    setLines((current) => current.filter((line) => line.key !== key));
  }, []);

  const clear = useCallback(() => {
    setLines([]);
    setDeliveryFee(0);
  }, []);

  const restore = useCallback((restored: CartLine[], fee = 0) => {
    setLines(restored);
    setDeliveryFee(fee);
  }, []);

  const totals = useMemo<CartTotals>(() => {
    const gross = lines.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0);
    const discountTotal = lines.reduce((sum, line) => sum + line.discount, 0);
    const netLines = lines.reduce((sum, line) => sum + lineTotal(line), 0);
    const taxTotal = lines.reduce((sum, line) => {
      const rate = line.taxRate / 100;
      return sum + (lineTotal(line) * rate) / (1 + rate);
    }, 0);
    const total = netLines + deliveryFee;
    return {
      gross,
      discountTotal,
      taxTotal,
      subtotal: netLines - taxTotal,
      total,
      itemCount: lines.reduce((sum, line) => sum + line.quantity, 0),
    };
  }, [lines, deliveryFee]);

  return {
    lines,
    totals,
    deliveryFee,
    setDeliveryFee,
    addProduct,
    updateLine,
    setQuantity,
    removeLine,
    clear,
    restore,
    lineTotal,
  };
}
