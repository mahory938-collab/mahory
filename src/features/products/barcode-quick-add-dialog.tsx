import { AlertTriangle, CheckCircle2, Loader2, PackagePlus, Scan } from "lucide-react";
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
import { useAdjustStock } from "@/features/inventory/use-inventory";
import { useProductByBarcode, useProductNameCatalog, useSaveProduct } from "@/features/products/use-products-admin";

const SUGGESTION_LIMIT = 30;

/**
 * Scan-first product intake — saves directly, no second form.
 * - If the scanned code already exists, offer to just add stock to it
 *   (receiving more of the same item) instead of creating a duplicate.
 * - Otherwise, type the product name — every existing name shows up on
 *   focus and filters as you type. Pick one to inherit its price, cost and
 *   category (since it's just another barcode/variant of the same item —
 *   sizes, colors) and only stock is left to enter; typing a new name asks
 *   for a price too. Either way, "Guardar" creates the product right away
 *   and the dialog resets for the next scan.
 */
export function BarcodeQuickAddDialog({
  open,
  onOpenChange,
  initialBarcode,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Código ya leído (p. ej. escaneado con el celular y no encontrado). */
  initialBarcode?: string | undefined;
}) {
  const [barcode, setBarcode] = useState("");
  const [name, setName] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [newStock, setNewStock] = useState("");
  const [price, setPrice] = useState("");
  const [stock, setStock] = useState("");

  const { data: existing, isFetching: checkingBarcode } = useProductByBarcode(barcode);
  const { data: nameCatalog } = useProductNameCatalog();
  const adjustStock = useAdjustStock();
  const saveProduct = useSaveProduct(null);

  const resetForm = () => {
    setBarcode("");
    setName("");
    setShowSuggestions(false);
    setNewStock("");
    setPrice("");
    setStock("");
  };

  useEffect(() => {
    if (!open) return;
    resetForm();
    if (initialBarcode) {
      setBarcode(initialBarcode);
      setTimeout(() => document.getElementById("quick-add-name")?.focus(), 150);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialBarcode]);

  useEffect(() => {
    if (existing) setNewStock(String(existing.stock));
  }, [existing]);

  const barcodeTaken = Boolean(barcode.trim()) && Boolean(existing);
  const template =
    nameCatalog?.find((n) => n.name.toLowerCase() === name.trim().toLowerCase()) ?? null;
  const canSave =
    Boolean(barcode.trim()) &&
    Boolean(name.trim()) &&
    !barcodeTaken &&
    (Boolean(template) || Number(price) > 0);

  const suggestions = (
    name.trim().length > 0
      ? (nameCatalog ?? []).filter((n) => n.name.toLowerCase().includes(name.trim().toLowerCase()))
      : (nameCatalog ?? [])
  ).slice(0, SUGGESTION_LIMIT);

  const handleSave = () => {
    if (!canSave) return;
    saveProduct.mutate(
      {
        name: name.trim(),
        barcode: barcode.trim(),
        sku: "",
        description: "",
        category_id: template?.category_id ?? null,
        brand_id: template?.brand_id ?? null,
        supplier_id: template?.supplier_id ?? null,
        cost: template?.cost ?? 0,
        price: template?.price ?? (Number(price) || 0),
        wholesale_price: template?.wholesale_price ?? 0,
        stock: Number(stock) || 0,
        min_stock: template?.min_stock ?? 5,
        image_url: null,
        status: template?.status ?? "active",
      },
      {
        onSuccess: () => {
          toast.success(`"${name.trim()}" guardado`);
          resetForm();
          document.getElementById("quick-add-barcode")?.focus();
        },
        onError: (error: Error) => toast.error(error.message || "No se pudo guardar el producto"),
      },
    );
  };

  const handleUpdateStock = () => {
    if (!existing) return;
    const qty = Number(newStock);
    if (!Number.isFinite(qty) || qty < 0) return;
    adjustStock.mutate(
      {
        productId: existing.id,
        type: "ajuste",
        quantity: qty,
        reason: "Ajuste de stock por código de barras",
      },
      {
        onSuccess: () => {
          toast.success(`Stock de "${existing.name}" actualizado a ${qty}`);
          setBarcode("");
          setNewStock("");
          document.getElementById("quick-add-barcode")?.focus();
        },
        onError: (error: Error) => toast.error(error.message || "No se pudo actualizar el stock"),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Scan className="size-5 text-primary" />
            Registrar por código de barras
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Código de barras</Label>
            <Input
              id="quick-add-barcode"
              autoFocus
              value={barcode}
              onChange={(event) => setBarcode(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  document.getElementById("quick-add-name")?.focus();
                }
              }}
              placeholder="Escanee o escriba el código"
              className="h-11 rounded-xl"
            />
            {checkingBarcode && barcode.trim() && (
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Loader2 className="size-3 animate-spin" />
                Verificando...
              </p>
            )}
            {!checkingBarcode && barcode.trim() && !barcodeTaken && (
              <p className="flex items-center gap-1.5 text-xs text-success">
                <CheckCircle2 className="size-3" />
                Código disponible
              </p>
            )}
          </div>

          {!checkingBarcode && barcodeTaken && existing && (
            <div className="space-y-2 rounded-xl border border-warning/40 bg-warning/10 p-3">
              <p className="flex items-center gap-1.5 text-xs text-warning">
                <AlertTriangle className="size-3" />
                Ese código ya existe: "{existing.name}" — hay {existing.stock} unidades
              </p>
              <Label className="text-xs">Nuevo stock</Label>
              <div className="flex items-center gap-2">
                <Input
                  value={newStock}
                  onChange={(event) => setNewStock(event.target.value.replace(/[^\d]/g, ""))}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      handleUpdateStock();
                    }
                  }}
                  inputMode="numeric"
                  placeholder="Cantidad"
                  className="h-10 flex-1 rounded-lg"
                />
                <Button
                  type="button"
                  className="h-10 gap-1.5 rounded-lg"
                  disabled={
                    newStock === "" ||
                    Number(newStock) === existing.stock ||
                    adjustStock.isPending
                  }
                  onClick={handleUpdateStock}
                >
                  {adjustStock.isPending ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <PackagePlus className="size-3.5" />
                  )}
                  Guardar
                </Button>
              </div>
            </div>
          )}

          {!barcodeTaken && (
            <>
              <div className="space-y-1.5">
                <Label>Nombre del producto</Label>
                <div className="relative">
                  <Input
                    id="quick-add-name"
                    value={name}
                    onChange={(event) => {
                      setName(event.target.value);
                      setShowSuggestions(true);
                    }}
                    onFocus={() => setShowSuggestions(true)}
                    onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        setShowSuggestions(false);
                        document.getElementById("quick-add-stock")?.focus();
                      }
                    }}
                    placeholder="Escriba o busque el nombre"
                    className="h-11 rounded-xl"
                    autoComplete="off"
                  />
                  {showSuggestions && suggestions.length > 0 && (
                    <div className="absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-xl border bg-popover p-1.5 shadow-md">
                      {suggestions.map((suggestion) => (
                        <button
                          key={suggestion.name}
                          type="button"
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => {
                            setName(suggestion.name);
                            setShowSuggestions(false);
                          }}
                          className="block w-full truncate rounded-lg px-2.5 py-2 text-left text-sm hover:bg-accent"
                        >
                          {suggestion.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {template && (
                  <div className="flex items-center rounded-xl border border-primary/30 bg-primary-soft/30 p-2.5 text-xs">
                    Hereda precio ({template.price ? `$${template.price.toLocaleString("es-CO")}` : "—"}), costo y
                    categoría de este producto.
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                {!template && (
                  <div className="space-y-1.5">
                    <Label>Precio de venta</Label>
                    <Input
                      value={price}
                      onChange={(event) => setPrice(event.target.value.replace(/[^\d]/g, ""))}
                      inputMode="numeric"
                      placeholder="0"
                      className="h-11 rounded-xl"
                    />
                  </div>
                )}
                <div className="space-y-1.5">
                  <Label>Stock inicial</Label>
                  <Input
                    id="quick-add-stock"
                    value={stock}
                    onChange={(event) => setStock(event.target.value.replace(/[^\d]/g, ""))}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        handleSave();
                      }
                    }}
                    inputMode="numeric"
                    placeholder="0"
                    className="h-11 rounded-xl"
                  />
                </div>
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            className="rounded-xl"
            onClick={() => onOpenChange(false)}
          >
            Cerrar
          </Button>
          {!barcodeTaken && (
            <Button
              type="button"
              className="rounded-xl"
              disabled={!canSave || saveProduct.isPending}
              onClick={handleSave}
            >
              {saveProduct.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
              Guardar producto
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
