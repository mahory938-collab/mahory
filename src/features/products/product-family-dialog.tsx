import { useMutation } from "@tanstack/react-query";
import { ImagePlus, Loader2, Plus, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import { uploadProductImage } from "@/features/products/upload-product-image";
import type { AdminProduct, ProductFamilyVariant } from "@/features/products/use-products-admin";
import {
  useBrands,
  useCategories,
  useSaveProductFamily,
  useSuppliers,
} from "@/features/products/use-products-admin";
import { cn } from "@/lib/utils";

const NONE = "__none__";

function toVariant(product: AdminProduct): ProductFamilyVariant {
  return {
    id: product.id,
    barcode: product.barcode ?? "",
    sku: product.sku ?? "",
    cost: product.cost,
    price: product.price,
    wholesale_price: product.wholesale_price,
    stock: product.stock,
    min_stock: product.min_stock,
  };
}

let newRowSeq = 0;

export function ProductFamilyDialog({
  open,
  onOpenChange,
  products,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Every product row sharing this family's name — one card in Productos, many barcodes. */
  products: AdminProduct[];
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [localPreview, setLocalPreview] = useState<string | null>(null);

  const { data: categories } = useCategories();
  const { data: brands } = useBrands();
  const { data: suppliers } = useSuppliers();
  const save = useSaveProductFamily();

  const first = products[0];
  const [name, setName] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [brandId, setBrandId] = useState<string | null>(null);
  const [supplierId, setSupplierId] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<"active" | "inactive">("active");
  const [variants, setVariants] = useState<(ProductFamilyVariant & { key: string })[]>([]);
  const [deletedIds, setDeletedIds] = useState<string[]>([]);

  useEffect(() => {
    if (!open || !first) return;
    setLocalPreview(null);
    setName(first.name);
    setCategoryId(first.category_id);
    setBrandId(first.brand_id);
    setSupplierId(first.supplier_id);
    setDescription(first.description ?? "");
    setImageUrl(first.image_url);
    setStatus(first.status);
    setVariants(products.map((p) => ({ ...toVariant(p), key: p.id })));
    setDeletedIds([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, first?.id]);

  const upload = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      return uploadProductImage({ data: formData });
    },
    onSuccess: (result) => setImageUrl(result.url),
    onError: (error: Error) => {
      toast.error(error.message || "No se pudo subir la imagen");
      setLocalPreview(null);
    },
  });

  const handlePickImage = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setLocalPreview(URL.createObjectURL(file));
    upload.mutate(file);
  };

  const updateVariant = (key: string, patch: Partial<ProductFamilyVariant>) => {
    setVariants((current) => current.map((v) => (v.key === key ? { ...v, ...patch } : v)));
  };

  const addVariant = () => {
    const template = variants[0];
    newRowSeq += 1;
    setVariants((current) => [
      ...current,
      {
        key: `new-${newRowSeq}`,
        id: null,
        barcode: "",
        sku: "",
        cost: template?.cost ?? 0,
        price: template?.price ?? 0,
        wholesale_price: template?.wholesale_price ?? 0,
        stock: 0,
        min_stock: template?.min_stock ?? 0,
      },
    ]);
  };

  const removeVariant = (key: string) => {
    setVariants((current) => {
      const target = current.find((v) => v.key === key);
      if (target?.id) setDeletedIds((ids) => [...ids, target.id as string]);
      return current.filter((v) => v.key !== key);
    });
  };

  const preview = localPreview ?? imageUrl;

  const submit = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error("Ingrese un nombre");
      if (variants.length === 0) throw new Error("Debe quedar al menos un código de barras");
      return save.mutateAsync({
        shared: {
          name,
          category_id: categoryId,
          brand_id: brandId,
          supplier_id: supplierId,
          description,
          image_url: imageUrl,
          status,
        },
        variants,
        deletedIds,
      });
    },
    onSuccess: () => {
      toast.success("Producto actualizado");
      onOpenChange(false);
    },
    onError: (error: Error) => toast.error(error.message || "No se pudo guardar"),
  });

  if (!first) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar producto</DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          <div className="flex items-start gap-4">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="hidden"
              onChange={handlePickImage}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className={cn(
                "relative grid size-24 shrink-0 place-items-center overflow-hidden rounded-xl border border-dashed bg-surface text-muted-foreground transition-colors hover:border-primary/50",
                preview && "border-solid",
              )}
            >
              {preview ? (
                <img src={preview} alt="Producto" className="size-full object-cover" />
              ) : (
                <ImagePlus className="size-6" />
              )}
              {upload.isPending && (
                <div className="absolute inset-0 grid place-items-center bg-background/70">
                  <Loader2 className="size-5 animate-spin text-primary" />
                </div>
              )}
            </button>
            <div className="flex-1 space-y-1.5 pt-1">
              <p className="text-sm font-medium">Imagen del producto</p>
              <p className="text-xs text-muted-foreground">
                Se usa para todos los códigos de barras de este nombre.
              </p>
              {preview && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1.5 rounded-lg px-2 text-xs text-destructive"
                  onClick={() => {
                    setLocalPreview(null);
                    setImageUrl(null);
                  }}
                >
                  <Trash2 className="size-3.5" />
                  Quitar imagen
                </Button>
              )}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nombre" full>
              <Input
                className="h-10 rounded-xl"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </Field>

            <Field label="Categoría">
              <Select
                value={categoryId ?? NONE}
                onValueChange={(v) => setCategoryId(v === NONE ? null : v)}
              >
                <SelectTrigger className="h-10 rounded-xl">
                  <SelectValue placeholder="Seleccione" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Sin categoría</SelectItem>
                  {categories?.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field label="Marca">
              <Select value={brandId ?? NONE} onValueChange={(v) => setBrandId(v === NONE ? null : v)}>
                <SelectTrigger className="h-10 rounded-xl">
                  <SelectValue placeholder="Seleccione" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Sin marca</SelectItem>
                  {brands?.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field label="Proveedor">
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
            </Field>

            <Field label="Estado">
              <div className="flex h-10 items-center gap-2">
                <Switch
                  checked={status === "active"}
                  onCheckedChange={(checked) => setStatus(checked ? "active" : "inactive")}
                />
                <span className="text-sm text-muted-foreground">
                  {status === "active" ? "Activo" : "Inactivo"}
                </span>
              </div>
            </Field>

            <Field label="Descripción" full>
              <Textarea
                rows={2}
                className="rounded-xl"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </Field>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Códigos de barras ({variants.length})</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 gap-1.5 rounded-lg text-xs"
                onClick={addVariant}
              >
                <Plus className="size-3.5" />
                Agregar código
              </Button>
            </div>

            <div className="overflow-x-auto rounded-xl border">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b bg-surface text-xs text-muted-foreground">
                    <th className="p-2 text-left font-medium">Código de barras</th>
                    <th className="p-2 text-left font-medium">SKU</th>
                    <th className="p-2 text-right font-medium">Costo</th>
                    <th className="p-2 text-right font-medium">Precio</th>
                    <th className="p-2 text-right font-medium">Stock</th>
                    <th className="p-2 text-right font-medium">Mínimo</th>
                    <th className="w-10" />
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {variants.map((variant) => (
                    <tr key={variant.key}>
                      <td className="p-1.5">
                        <Input
                          value={variant.barcode}
                          onChange={(event) =>
                            updateVariant(variant.key, { barcode: event.target.value })
                          }
                          className="h-9 rounded-lg"
                        />
                      </td>
                      <td className="p-1.5">
                        <Input
                          value={variant.sku}
                          onChange={(event) =>
                            updateVariant(variant.key, { sku: event.target.value })
                          }
                          className="h-9 rounded-lg"
                        />
                      </td>
                      <td className="p-1.5">
                        <Input
                          type="number"
                          min={0}
                          step="0.01"
                          value={String(variant.cost)}
                          onChange={(event) =>
                            updateVariant(variant.key, { cost: Number(event.target.value) || 0 })
                          }
                          className="h-9 w-24 rounded-lg text-right"
                        />
                      </td>
                      <td className="p-1.5">
                        <Input
                          type="number"
                          min={0}
                          step="0.01"
                          value={String(variant.price)}
                          onChange={(event) =>
                            updateVariant(variant.key, { price: Number(event.target.value) || 0 })
                          }
                          className="h-9 w-24 rounded-lg text-right"
                        />
                      </td>
                      <td className="p-1.5">
                        <Input
                          type="number"
                          min={0}
                          step="0.01"
                          value={String(variant.stock)}
                          onChange={(event) =>
                            updateVariant(variant.key, { stock: Number(event.target.value) || 0 })
                          }
                          className="h-9 w-20 rounded-lg text-right"
                        />
                      </td>
                      <td className="p-1.5">
                        <Input
                          type="number"
                          min={0}
                          step="0.01"
                          value={String(variant.min_stock)}
                          onChange={(event) =>
                            updateVariant(variant.key, {
                              min_stock: Number(event.target.value) || 0,
                            })
                          }
                          className="h-9 w-20 rounded-lg text-right"
                        />
                      </td>
                      <td className="p-1.5">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-8 rounded-lg text-destructive"
                          onClick={() => removeVariant(variant.key)}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

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
            disabled={submit.isPending || upload.isPending}
            onClick={() => submit.mutate()}
          >
            {submit.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
            Guardar cambios
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  full,
  children,
}: {
  label: string;
  full?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("space-y-1.5", full && "sm:col-span-2")}>
      <Label>{label}</Label>
      {children}
    </div>
  );
}
