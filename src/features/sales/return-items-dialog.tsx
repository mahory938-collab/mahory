import { Loader2, Minus, Plus, Undo2 } from "lucide-react";
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
import { Skeleton } from "@/components/ui/skeleton";
import { useReturnableItems, useReturnItems } from "@/features/sales/use-sales";
import { formatCurrency, formatNumber } from "@/lib/format";

export function ReturnItemsDialog({
  saleId,
  saleNumber,
  onOpenChange,
}: {
  saleId: string | null;
  saleNumber: number | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { data: items, isLoading } = useReturnableItems(saleId);
  const returnItems = useReturnItems();
  const [quantities, setQuantities] = useState<Record<string, number>>({});

  useEffect(() => {
    if (saleId) setQuantities({});
  }, [saleId]);

  const returnable = (items ?? []).filter((item) => item.quantity - item.alreadyReturned > 0);

  const setQty = (itemId: string, value: number, max: number) => {
    setQuantities((current) => ({ ...current, [itemId]: Math.max(0, Math.min(max, value)) }));
  };

  const totalAmount = returnable.reduce((sum, item) => {
    const qty = quantities[item.id] ?? 0;
    return sum + qty * item.unitNetPrice;
  }, 0);
  const totalUnits = returnable.reduce((sum, item) => sum + (quantities[item.id] ?? 0), 0);

  const submit = () => {
    if (!saleId) return;
    if (totalUnits === 0) {
      toast.error("Seleccione al menos un producto a devolver");
      return;
    }
    const lines = returnable
      .filter((item) => (quantities[item.id] ?? 0) > 0)
      .map((item) => ({
        productId: item.product_id as string,
        quantity: quantities[item.id],
        unitCost: item.unitCost,
        amount: quantities[item.id] * item.unitNetPrice,
      }));

    returnItems.mutate(
      { saleId, lines },
      {
        onSuccess: ({ returnAmount }) => {
          toast.success(`Devolución registrada · ${formatCurrency(returnAmount)}`);
          onOpenChange(false);
        },
        onError: (error: Error) => toast.error(error.message || "No se pudo registrar la devolución"),
      },
    );
  };

  return (
    <Dialog open={Boolean(saleId)} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Devolver productos {saleNumber ? `· Venta #${saleNumber}` : ""}</DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <Skeleton className="h-40 rounded-xl" />
        ) : returnable.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No quedan productos disponibles para devolver en esta venta.
          </p>
        ) : (
          <div className="space-y-3">
            <div className="max-h-72 space-y-2 overflow-y-auto">
              {returnable.map((item) => {
                const remaining = item.quantity - item.alreadyReturned;
                const qty = quantities[item.id] ?? 0;
                return (
                  <div key={item.id} className="rounded-xl border p-3">
                    <div className="flex items-start justify-between gap-2">
                      <p className="line-clamp-2 text-sm font-medium">{item.product_name}</p>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        Disponible: {formatNumber(remaining)}
                      </span>
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1">
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="size-8 rounded-lg"
                          disabled={qty <= 0}
                          onClick={() => setQty(item.id, qty - 1, remaining)}
                        >
                          <Minus className="size-3.5" />
                        </Button>
                        <span className="w-8 text-center text-sm font-semibold">{qty}</span>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="size-8 rounded-lg"
                          disabled={qty >= remaining}
                          onClick={() => setQty(item.id, qty + 1, remaining)}
                        >
                          <Plus className="size-3.5" />
                        </Button>
                      </div>
                      <span className="text-sm font-medium">
                        {formatCurrency(qty * item.unitNetPrice)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex items-center justify-between rounded-xl bg-surface p-3 text-sm font-semibold">
              <span>Total a devolver</span>
              <span>{formatCurrency(totalAmount)}</span>
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
          {returnable.length > 0 && (
            <Button
              type="button"
              className="gap-2 rounded-xl"
              disabled={returnItems.isPending || totalUnits === 0}
              onClick={submit}
            >
              {returnItems.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Undo2 className="size-4" />
              )}
              Confirmar devolución
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
