import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AdjustmentType, InventoryProduct } from "@/features/inventory/use-inventory";
import { useAdjustStock } from "@/features/inventory/use-inventory";
import { formatNumber } from "@/lib/format";

const TYPE_OPTIONS: { value: AdjustmentType; label: string }[] = [
  { value: "entrada", label: "Entrada" },
  { value: "salida", label: "Salida" },
  { value: "ajuste", label: "Ajuste" },
];

export function AdjustStockDialog({
  product,
  onOpenChange,
}: {
  product: InventoryProduct | null;
  onOpenChange: (open: boolean) => void;
}) {
  const [type, setType] = useState<AdjustmentType>("entrada");
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState("");
  const adjust = useAdjustStock();

  useEffect(() => {
    if (!product) return;
    setType("entrada");
    setQuantity("");
    setReason("");
  }, [product]);

  const quantityValue = Number(quantity.replace(/[^\d]/g, "")) || 0;
  const preview =
    !product || quantity === ""
      ? null
      : type === "entrada"
        ? product.stock + quantityValue
        : type === "salida"
          ? Math.max(0, product.stock - quantityValue)
          : Math.max(0, quantityValue);

  const submit = () => {
    if (!product) return;
    if (quantityValue <= 0 && type !== "ajuste") {
      toast.error("Ingrese una cantidad válida");
      return;
    }
    adjust.mutate(
      { productId: product.id, type, quantity: quantityValue, reason },
      {
        onSuccess: () => {
          toast.success("Inventario actualizado");
          onOpenChange(false);
        },
        onError: (error: Error) => toast.error(error.message || "No se pudo ajustar el stock"),
      },
    );
  };

  return (
    <Dialog open={Boolean(product)} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Ajustar inventario</DialogTitle>
        </DialogHeader>

        {product && (
          <div className="space-y-4">
            <div className="rounded-xl bg-surface p-3">
              <p className="text-sm font-medium">{product.name}</p>
              <p className="text-xs text-muted-foreground">
                Stock actual: {formatNumber(product.stock)} {product.unit}
              </p>
            </div>

            <div className="grid grid-cols-3 gap-2">
              {TYPE_OPTIONS.map((option) => (
                <Button
                  key={option.value}
                  type="button"
                  variant={type === option.value ? "default" : "outline"}
                  className="h-10 rounded-xl"
                  onClick={() => setType(option.value)}
                >
                  {option.label}
                </Button>
              ))}
            </div>

            <div className="space-y-2">
              <Label>{type === "ajuste" ? "Nuevo stock" : "Cantidad"}</Label>
              <Input
                value={quantity}
                onChange={(event) => setQuantity(event.target.value)}
                inputMode="numeric"
                placeholder="0"
                className="h-11 rounded-xl text-right"
              />
            </div>

            {preview !== null && (
              <p className="text-sm text-muted-foreground">
                Stock resultante: <span className="font-semibold text-foreground">{formatNumber(preview)}</span>{" "}
                {product.unit}
              </p>
            )}

            <div className="space-y-2">
              <Label>Motivo (opcional)</Label>
              <Input
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Ej. Conteo físico, producto dañado…"
                className="h-11 rounded-xl"
              />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            className="rounded-xl"
            onClick={() => onOpenChange(false)}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            className="rounded-xl"
            disabled={adjust.isPending}
            onClick={submit}
          >
            {adjust.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
            Guardar ajuste
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
