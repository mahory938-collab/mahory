import { Loader2, Search } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useCategories } from "@/features/products/use-products-admin";
import { usePurchaseProductSearch } from "@/features/purchases/use-purchases";
import type { Promotion, PromotionScope } from "@/features/promotions/use-promotions";
import { useSavePromotion } from "@/features/promotions/use-promotions";

const SCOPE_OPTIONS: { value: PromotionScope; label: string }[] = [
  { value: "all", label: "Todos los productos" },
  { value: "category", label: "Una categoría" },
  { value: "product", label: "Un producto específico" },
];

export function PromotionFormDialog({
  open,
  onOpenChange,
  promotion,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  promotion: Promotion | null;
}) {
  const [name, setName] = useState("");
  const [scope, setScope] = useState<PromotionScope>("all");
  const [targetId, setTargetId] = useState<string | null>(null);
  const [targetName, setTargetName] = useState<string | null>(null);
  const [percent, setPercent] = useState("10");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [active, setActive] = useState(true);
  const [productSearch, setProductSearch] = useState("");

  const { data: categories } = useCategories();
  const { data: productResults } = usePurchaseProductSearch(productSearch);
  const savePromotion = useSavePromotion(promotion?.id ?? null);

  useEffect(() => {
    if (!open) return;
    setName(promotion?.name ?? "");
    setScope(promotion?.scope ?? "all");
    setTargetId(promotion?.targetId ?? null);
    setTargetName(promotion?.targetName ?? null);
    setPercent(promotion ? String(promotion.percent) : "10");
    setStartsAt(promotion?.startsAt?.slice(0, 10) ?? "");
    setEndsAt(promotion?.endsAt?.slice(0, 10) ?? "");
    setActive(promotion?.active ?? true);
    setProductSearch("");
  }, [open, promotion]);

  const handleOpenChange = (next: boolean) => onOpenChange(next);

  const submit = () => {
    savePromotion.mutate(
      {
        name: name.trim(),
        scope,
        targetId: scope === "all" ? null : targetId,
        targetName: scope === "all" ? null : targetName,
        percent: Number(percent) || 0,
        startsAt: startsAt ? new Date(startsAt).toISOString() : null,
        endsAt: endsAt ? new Date(endsAt).toISOString() : null,
        active,
      },
      {
        onSuccess: () => {
          toast.success(promotion ? "Promoción actualizada" : "Promoción creada");
          handleOpenChange(false);
        },
        onError: (error: Error) => toast.error(error.message || "No se pudo guardar"),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-md overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{promotion ? "Editar promoción" : "Nueva promoción"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Nombre</Label>
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Ej. Liquidación de temporada"
              className="h-10 rounded-xl"
            />
          </div>

          <div className="space-y-2">
            <Label>Aplica a</Label>
            <Select
              value={scope}
              onValueChange={(value) => {
                setScope(value as PromotionScope);
                setTargetId(null);
                setTargetName(null);
              }}
            >
              <SelectTrigger className="h-10 rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SCOPE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {scope === "category" && (
            <div className="space-y-2">
              <Label>Categoría</Label>
              <Select
                value={targetId ?? ""}
                onValueChange={(value) => {
                  setTargetId(value);
                  setTargetName(categories?.find((c) => c.id === value)?.name ?? null);
                }}
              >
                <SelectTrigger className="h-10 rounded-xl">
                  <SelectValue placeholder="Seleccione una categoría" />
                </SelectTrigger>
                <SelectContent>
                  {categories?.map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      {category.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {scope === "product" && (
            <div className="space-y-2">
              <Label>Producto</Label>
              {targetId ? (
                <div className="flex items-center justify-between rounded-xl border p-2.5 text-sm">
                  <span className="truncate font-medium">{targetName}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 rounded-lg text-xs"
                    onClick={() => {
                      setTargetId(null);
                      setTargetName(null);
                    }}
                  >
                    Cambiar
                  </Button>
                </div>
              ) : (
                <>
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
                      {productResults?.length === 0 && (
                        <p className="px-2 py-2 text-sm text-muted-foreground">Sin resultados</p>
                      )}
                      {productResults?.map((product) => (
                        <button
                          key={product.id}
                          type="button"
                          onClick={() => {
                            setTargetId(product.id);
                            setTargetName(product.name);
                          }}
                          className="block w-full truncate rounded-lg px-2 py-2 text-left text-sm hover:bg-accent"
                        >
                          {product.name}
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label>Descuento (%)</Label>
            <Input
              value={percent}
              onChange={(event) => setPercent(event.target.value.replace(/[^\d]/g, ""))}
              inputMode="numeric"
              className="h-10 rounded-xl text-right"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Vigencia desde (opcional)</Label>
              <Input
                type="date"
                value={startsAt}
                onChange={(event) => setStartsAt(event.target.value)}
                className="h-10 rounded-xl"
              />
            </div>
            <div className="space-y-2">
              <Label>Vigencia hasta (opcional)</Label>
              <Input
                type="date"
                value={endsAt}
                onChange={(event) => setEndsAt(event.target.value)}
                className="h-10 rounded-xl"
              />
            </div>
          </div>

          <div className="flex items-center justify-between">
            <Label className="text-sm font-normal">Promoción activa</Label>
            <Switch checked={active} onCheckedChange={setActive} />
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
            disabled={savePromotion.isPending}
            onClick={submit}
          >
            {savePromotion.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
