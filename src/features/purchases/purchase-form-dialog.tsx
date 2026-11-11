import { Loader2, Plus, Search, Trash2 } from "lucide-react";
import { useState } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useSuppliers } from "@/features/products/use-products-admin";
import { useCreatePurchase, usePurchaseProductSearch } from "@/features/purchases/use-purchases";
import { formatCurrency, formatNumber } from "@/lib/format";

const NONE = "__none__";

type PurchaseLine = {
  key: string;
  productId: string;
  name: string;
  quantity: number;
  unitCost: number;
};

export function PurchaseFormDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [supplierId, setSupplierId] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<PurchaseLine[]>([]);
  const [productSearch, setProductSearch] = useState("");

  const { data: suppliers } = useSuppliers();
  const { data: results } = usePurchaseProductSearch(productSearch);
  const createPurchase = useCreatePurchase();

  const reset = () => {
    setSupplierId(null);
    setNotes("");
    setLines([]);
    setProductSearch("");
  };

  const handleOpenChange = (next: boolean) => {
    onOpenChange(next);
    if (!next) reset();
  };

  const addLine = (product: { id: string; name: string; cost: number }) => {
    setLines((current) => {
      if (current.some((l) => l.productId === product.id)) return current;
      return [
        ...current,
        { key: product.id, productId: product.id, name: product.name, quantity: 1, unitCost: product.cost },
      ];
    });
    setProductSearch("");
  };

  const updateLine = (key: string, patch: Partial<PurchaseLine>) => {
    setLines((current) => current.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  };

  const removeLine = (key: string) => {
    setLines((current) => current.filter((l) => l.key !== key));
  };

  const total = lines.reduce((sum, l) => sum + l.quantity * l.unitCost, 0);

  const submit = () => {
    if (!lines.length) {
      toast.error("Agregue al menos un producto");
      return;
    }
    createPurchase.mutate(
      {
        supplierId,
        notes,
        lines: lines.map((l) => ({
          productId: l.productId,
          quantity: l.quantity,
          unitCost: l.unitCost,
        })),
      },
      {
        onSuccess: (purchase) => {
          toast.success(`Compra #${purchase.number} creada`);
          handleOpenChange(false);
        },
        onError: (error: Error) => toast.error(error.message || "No se pudo crear la compra"),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nueva compra</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Proveedor</Label>
            <Select
              value={supplierId ?? NONE}
              onValueChange={(v) => setSupplierId(v === NONE ? null : v)}
            >
              <SelectTrigger className="h-10 rounded-xl">
                <SelectValue placeholder="Seleccione" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Sin proveedor</SelectItem>
                {suppliers?.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Agregar producto</Label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={productSearch}
                onChange={(event) => setProductSearch(event.target.value)}
                placeholder="Buscar por nombre, código o SKU"
                className="h-10 rounded-xl pl-9"
              />
            </div>
            {productSearch.trim() && (
              <div className="max-h-40 space-y-1 overflow-y-auto rounded-xl border p-1.5">
                {results?.length === 0 && (
                  <p className="px-2 py-2 text-sm text-muted-foreground">Sin resultados</p>
                )}
                {results?.map((product) => (
                  <button
                    key={product.id}
                    type="button"
                    onClick={() => addLine(product)}
                    className="flex w-full items-center justify-between rounded-lg px-2 py-2 text-left text-sm hover:bg-accent"
                  >
                    <span>{product.name}</span>
                    <span className="flex items-center gap-1 text-muted-foreground">
                      <Plus className="size-3.5" />
                      {formatCurrency(product.cost)}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {lines.length > 0 && (
            <div className="space-y-2 rounded-xl border p-2">
              {lines.map((line) => (
                <div key={line.key} className="flex items-center gap-2 rounded-lg p-1.5">
                  <p className="min-w-0 flex-1 truncate text-sm font-medium">{line.name}</p>
                  <Input
                    value={String(line.quantity)}
                    onChange={(event) =>
                      updateLine(line.key, {
                        quantity: Number(event.target.value.replace(/[^\d]/g, "")) || 0,
                      })
                    }
                    className="h-9 w-16 rounded-lg text-right text-sm"
                  />
                  <Input
                    value={String(line.unitCost)}
                    onChange={(event) =>
                      updateLine(line.key, {
                        unitCost: Number(event.target.value.replace(/[^\d]/g, "")) || 0,
                      })
                    }
                    className="h-9 w-24 rounded-lg text-right text-sm"
                  />
                  <span className="w-24 shrink-0 text-right text-sm font-medium">
                    {formatCurrency(line.quantity * line.unitCost)}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8 shrink-0 rounded-lg text-destructive"
                    onClick={() => removeLine(line.key)}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              ))}
              <div className="flex items-center justify-between border-t px-1.5 pt-2 text-sm font-semibold">
                <span>Total ({formatNumber(lines.reduce((s, l) => s + l.quantity, 0))} und.)</span>
                <span>{formatCurrency(total)}</span>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label>Notas (opcional)</Label>
            <Textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={2}
              className="rounded-xl"
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            className="rounded-xl"
            onClick={() => handleOpenChange(false)}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            className="rounded-xl"
            disabled={createPurchase.isPending}
            onClick={submit}
          >
            {createPurchase.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
            Crear compra
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
