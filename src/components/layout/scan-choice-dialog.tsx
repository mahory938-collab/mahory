import { Loader2, Pencil, ShoppingCart } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { lookupPrice, type PriceResult } from "@/features/pos/price-lookup";
import { formatCurrency, formatNumber } from "@/lib/format";

/**
 * Se abre cuando el lector lee un código en Productos o Inventario: pregunta si el producto
 * se quiere vender o buscar para modificarlo.
 */
export function ScanChoiceDialog({
  code,
  onClose,
  onSale,
  onFind,
}: {
  code: string | null;
  onClose: () => void;
  onSale: (code: string) => void;
  onFind: (code: string) => void;
}) {
  const [state, setState] = useState<
    | { code: string; status: "loading" }
    | { code: string; status: "done"; product: PriceResult | null }
  >();

  useEffect(() => {
    if (!code) return;
    let cancelled = false;
    setState({ code, status: "loading" });
    lookupPrice(code)
      .then((product) => !cancelled && setState({ code, status: "done", product }))
      .catch(() => !cancelled && setState({ code, status: "done", product: null }));
    return () => {
      cancelled = true;
    };
  }, [code]);

  const current = state && state.code === code ? state : null;
  const product = current?.status === "done" ? current.product : null;

  return (
    <Dialog open={code !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Código leído</DialogTitle>
          <DialogDescription className="break-all font-mono">{code}</DialogDescription>
        </DialogHeader>

        {!current || current.status === "loading" ? (
          <div className="grid h-20 place-items-center">
            <Loader2 className="size-5 animate-spin text-primary" />
          </div>
        ) : product ? (
          <div className="rounded-xl bg-surface p-3">
            <p className="font-medium">{product.name}</p>
            <p className="text-sm text-muted-foreground">
              {product.price > 0 ? formatCurrency(product.price) : "Sin precio"} ·{" "}
              {formatNumber(product.stock)} {product.stock === 1 ? "unidad" : "unidades"}
            </p>
          </div>
        ) : (
          <p className="rounded-xl bg-surface p-3 text-sm text-muted-foreground">
            Este código no está registrado en el inventario.
          </p>
        )}

        <div className="grid gap-2 sm:grid-cols-2">
          <Button
            className="h-12 gap-2 rounded-xl"
            disabled={!product}
            onClick={() => code && onSale(code)}
          >
            <ShoppingCart className="size-4" />
            Registrar venta
          </Button>
          <Button
            variant="outline"
            className="h-12 gap-2 rounded-xl"
            onClick={() => code && onFind(code)}
          >
            <Pencil className="size-4" />
            Buscar para modificar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
